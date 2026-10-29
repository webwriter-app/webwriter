import type {DOMEditor} from "../src/domeditor"
import {graphicShapeOptions} from "../src/graphic"
import {graphicPresetHandles, isGraphicPresetType, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const near = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < .03, `${message}: ${actual} instead of ${expected}`)

/** The native SVG contour, including curve extrema, must own the editing box. */
export async function checkGraphicBounds() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
  try {
    for(let attempt = 0; !view.editor && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "bounds fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 1600 900")
    Object.assign(graphic.style, {width: "800px", height: "450px"})
    for(const option of graphicShapeOptions) {
      if(!isGraphicPresetType(option.type)) continue
      const standalone = editor.features.graphic.createGraphic(option.type)
      doc.body.append(standalone)
      const path = standalone.querySelector("path")!, box = path.getBBox()
      const viewport = standalone.viewBox.baseVal, padding = Number(path.getAttribute("stroke-width")) / 2
      near(viewport.x, box.x - padding, `${option.type} standalone x`)
      near(viewport.y, box.y - padding, `${option.type} standalone y`)
      near(viewport.width, Math.max(1, box.width) + padding * 2, `${option.type} standalone width`)
      near(viewport.height, Math.max(1, box.height) + padding * 2, `${option.type} standalone height`)
      standalone.remove()
      assert(!editor.appendix.querySelector(".◆graphic-measurement"), `${option.type}: measurement leaked`)

      graphic.replaceChildren()
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
      const shape = editor.features.graphic.selectedShape!
      // Content-sized text fields fit their labels; the dedicated text-box
      // check covers that contract. Here exercise the preset contour itself.
      if(readGraphicPreset(shape.localName === "g" ? shape.firstElementChild : shape)?.definition.contentSize) {
        editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: ""})
      }
      const geometry = (shape.localName === "g" ? shape.firstElementChild : shape) as SVGGraphicsElement
      const check = (phase: string) => {
        const bounds = geometry.getBBox(), parameters = editor.features.graphic.getState()!.parameters!
        for(const key of ["x", "y", "width", "height"] as const) near(Number(parameters[key]), bounds[key], `${option.type} ${phase} ${key}`)
        const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
        const matrix = DOMMatrix.fromMatrix(geometry.getScreenCTM()!)
        const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
          [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height]]
        corners.forEach(([x, y], index) => {
          const expected = matrix.transformPoint(new DOMPoint(x, y)), point = outline.points.getItem(index)
          near(point.x, expected.x, `${option.type} ${phase} outline ${index} x`)
          near(point.y, expected.y, `${option.type} ${phase} outline ${index} y`)
        })
      }
      const original = geometry.getAttribute("d")
      check("inserted")
      assert(geometry.getAttribute("d") === original, `${option.type}: measuring rewrote the authored path`)
      const preset = readGraphicPreset(geometry)!
      for(const adjustment of preset.definition.adjustments) {
        for(const value of [adjustment.min, adjustment.max, adjustment.default]) {
          editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: `adjust-${adjustment.name}`, value: String(value)})
          check(`${adjustment.name}=${value}`)
        }
      }
      for(const [name, value] of [["width", "180"], ["height", "120"], ["x", "300"], ["y", "200"]]) {
        editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name, value})
        check(name)
        near(Number(editor.features.graphic.getState()!.parameters![name]), Number(value), `${option.type} requested ${name}`)
      }
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "35"})
      check("rotated")
      if(option.type === "lightning-bolt") {
        const initial = readGraphicPreset(geometry)!
        for(const modifiers of [{}, {shiftKey: true}, {ctrlKey: true}, {metaKey: true}, {shiftKey: true, ctrlKey: true}]) {
          for(const index of [0, 1]) {
            writeGraphicPreset(geometry, initial)
            editor.features.graphic.refresh()
            const handles = graphicPresetHandles(initial)
            assert(handles.length === 2, "Lightning bolt: missing corner POI")
            const handle = editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${handles[index].name}"]`)!
            const rect = handle.getBoundingClientRect(), matrix = DOMMatrix.fromMatrix(geometry.getScreenCTM()!)
            const point = handles[index].point
            const geometricStart = matrix.transformPoint(new DOMPoint(point.x, point.y))
            const start = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
            const offset = {x: start.x - geometricStart.x, y: start.y - geometricStart.y}
            for(const axis of ["x", "y"] as const) if(Math.abs(offset[axis]) < .03) offset[axis] = 0
            assert(editor.appendix.elementFromPoint(start.x, start.y) === handle, `Lightning bolt POI ${index} is not reachable`)
            const target = matrix.transformPoint(new DOMPoint(point.x + (index === 0 ? 1 : -1) * initial.bounds.width * .05, point.y))
            target.x += offset.x; target.y += offset.y
            const pointer = {bubbles: true, composed: true, button: 0, pointerId: 91, ...modifiers}
            handle.dispatchEvent(new view.PointerEvent("pointerdown", {...pointer, clientX: start.x, clientY: start.y}))
            doc.dispatchEvent(new view.PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y}))
            await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
            const mirrored = Object.values(modifiers).some(Boolean)
            const expected = initial.values.map((value, i) => value + (i === index || mirrored ? 5 : 0))
            const preview = readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!
            preview.values.forEach((value, i) => near(value, expected[i], `Lightning bolt POI ${index} preview ${i}`))
            doc.dispatchEvent(new view.PointerEvent("pointerup", {...pointer, clientX: target.x, clientY: target.y}))
            readGraphicPreset(geometry)!.values.forEach((value, i) => near(value, expected[i], `Lightning bolt POI ${index} committed ${i}`))
            assert(!editor.appendix.querySelector(".◆graphic-preview"), "Lightning bolt: POI preview leaked")
            check("corner drag")
          }
        }
      }
    }
    assert(!editor.toHTML(true).includes("◆"), "bounds measurement serialized editing artifacts")
  }
  finally { view.editor?.destroy(); frame.remove() }
}

/** Filling the empty surface must not move its viewport or following content. */
export async function checkEmptyGraphicLayout() {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let i=0;!view.editor&&!view.editorError&&i<250;i++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError??"Empty graphic fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))}
    for(const mode of ["default","fixed size","authored border"]) {
      doc.body.replaceChildren(doc.createElement("p"))
      doc.getSelection()!.setPosition(doc.body.firstChild,0)
      editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
      const graphic=doc.querySelector("svg")!
      if(mode!=="default") Object.assign(graphic.style,{width:"360px",height:"203px"})
      if(mode==="authored border") graphic.style.border="3px solid red"
      const after=doc.createElement("p");after.textContent="Content after the graphic";graphic.after(after)
      await layout()
      const measure=()=>{
        const box=graphic.getBoundingClientRect(),following=after.getBoundingClientRect(),matrix=graphic.getScreenCTM()!
        return [box.x,box.y,box.width,box.height,following.x,following.y,matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]
      }
      const initial=measure()
      assert(view.getComputedStyle(graphic).outlineWidth==="1px",`${mode}: empty graphic lacks its outline`)
      const check=(phase:string)=>{
        measure().forEach((value,index)=>near(value,initial[index],`${mode}/${phase}: layout coordinate ${index}`))
        assert(view.getComputedStyle(graphic).borderTopWidth===(mode==="authored border"?"3px":"0px"),`${mode}/${phase}: placeholder changed the authored border`)
      }
      editor.doc.stopCapturing()
      editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:"ellipse"})
      await layout();check("insertion")
      editor.doc.undo();await layout();check("undo")
      assert(!graphic.children.length,`${mode}: undo did not restore an empty graphic`)
      editor.doc.redo();await layout();check("redo")
      graphic.replaceChildren(doc.createElementNS("http://www.w3.org/2000/svg","rect"))
      await layout();check("direct DOM edit")
      assert(!editor.toHTML(true).includes("◆"),`${mode}: serialized editing artifacts`)
    }
  }
  finally {view.editor?.destroy();frame.remove()}
}
