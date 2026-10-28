import type {DOMEditor} from "../src/domeditor"
import {graphicPresetHandles, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

/** Endpoint POIs stay separately hittable when they coincide with resize handles. */
export async function checkGraphicPOIDodge() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  const inspect = new URLSearchParams(location.search).has("inspect-poi")
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "POI dodge fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector<SVGSVGElement>("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    graphic.setAttribute("preserveAspectRatio", "none")
    const bounds = {x: 200, y: 100, width: 200, height: 200}
    const selected = (type: "donut" | "rounded-rectangle") => {
      graphic.replaceChildren(doc.createComment("keep authored sibling"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
      return editor.features.graphic.selectedShape!
    }
    const boxCenter = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {x: box.left + box.width / 2, y: box.top + box.height / 2}
    }
    const assertSeparated = (shape: SVGGraphicsElement, context: string) => {
      const state = readGraphicPreset(shape)!
      const buttons = [...editor.appendix.querySelectorAll<HTMLButtonElement>(".◆graphic-specific-handles button")]
      const handles = graphicPresetHandles(state)
      assert(buttons.length === handles.length, `${context}: expected all POI buttons to remain visible`)
      const fixed = [...editor.appendix.querySelectorAll<HTMLElement>('[data-graphic-handle^="resize-"], [data-graphic-handle="rotate"]')]
        .filter(handle => !handle.hidden)
      assert(fixed.length === 9, `${context}: resize and rotate handles were not all visible`)
      const points = [...buttons, ...fixed].map(boxCenter)
      for(let i = 0; i < points.length; i++) for(let j = i + 1; j < points.length; j++) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
        assert(distance >= 15.99, `${context}: handle centers overlap at ${distance.toFixed(2)} CSS px`)
      }
      assert(buttons.every(button => editor.appendix.contains(button)), `${context}: a POI escaped the appendix`)
      assert(!doc.querySelector("[data-graphic-handle]"), `${context}: a handle entered authored DOM`)
      assert(!editor.toHTML(true).includes("◆"), `${context}: editor markers were serialized`)
      assert(graphic.firstChild?.nodeType === Node.COMMENT_NODE, `${context}: authored sibling changed`)
    }

    for(const scale of [.5, 1]) for(const rotation of [0, 35]) {
      Object.assign(graphic.style, {width: `${800 * scale}px`, height: `${500 * scale}px`})
      for(const type of ["donut", "rounded-rectangle"] as const) for(const value of [0, 50]) {
        const shape = selected(type)
        const initial = readGraphicPreset(shape)!
        const values = type === "donut" ? [value] : [value, value, value, value]
        writeGraphicPreset(shape, initial, bounds, values)
        editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: String(rotation)})
        await layout()
        assertSeparated(shape, `${type}/${value}/${scale}/${rotation}`)
      }
    }

    Object.assign(graphic.style, {width: "800px", height: "500px"})
    const shape = selected("donut")
    writeGraphicPreset(shape, readGraphicPreset(shape)!, bounds, [50])
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "35"})
    await layout()
    assertSeparated(shape, "donut/drag/50/1/35")
    const source = shape.getAttribute("d")!
    const state = readGraphicPreset(shape)!, adjustment = state.definition.adjustments[0]
    const handle = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="adjust-hole"]')!
    const visible = boxCenter(handle)
    const startPoint = adjustment.point(state.values)
    const actualStart = new view.DOMPoint(state.bounds.x + startPoint.x / 100 * state.bounds.width,
      state.bounds.y + startPoint.y / 100 * state.bounds.height).matrixTransform(shape.getScreenCTM()!)
    const displayOffset = {x: visible.x - actualStart.x, y: visible.y - actualStart.y}
    const targetPoint = adjustment.point([0])
    const target = new view.DOMPoint(state.bounds.x + targetPoint.x / 100 * state.bounds.width,
      state.bounds.y + targetPoint.y / 100 * state.bounds.height).matrixTransform(shape.getScreenCTM()!)
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 93}
    editor.doc.stopCapturing()
    handle.dispatchEvent(new view.PointerEvent("pointerdown", {...pointer, clientX: visible.x, clientY: visible.y}))
    doc.dispatchEvent(new view.PointerEvent("pointermove", {
      ...pointer, buttons: 1, clientX: target.x + displayOffset.x, clientY: target.y + displayOffset.y,
    }))
    await layout()
    assert(shape.getAttribute("d") === source, "preview mutated the authored donut")
    const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
    assert(preview && Math.abs(readGraphicPreset(preview)!.values[0]) < .01,
      `visible-offset drag did not reach donut radius zero (preview ${preview ? readGraphicPreset(preview)?.values[0] : "missing"}; visible=${visible.x.toFixed(1)},${visible.y.toFixed(1)} target=${target.x.toFixed(1)},${target.y.toFixed(1)} offset=${displayOffset.x.toFixed(1)},${displayOffset.y.toFixed(1)})`)
    doc.dispatchEvent(new view.PointerEvent("pointerup", {...pointer, clientX: target.x + displayOffset.x, clientY: target.y + displayOffset.y}))
    await layout()
    const committed = shape.getAttribute("d")!
    assert(committed !== source && Math.abs(readGraphicPreset(shape)!.values[0]) < .01, "donut endpoint drag did not commit")
    editor.doc.undo(); await layout()
    assert(shape.getAttribute("d") === source, "donut endpoint drag did not undo")
    editor.doc.redo(); await layout()
    assert(shape.getAttribute("d") === committed, "donut endpoint drag did not redo")
    assert(!editor.appendix.querySelector(".◆graphic-preview"), "POI preview leaked after commit")
    assert(!editor.toHTML(true).includes("◆"), "appendix artifacts leaked into serialized HTML")
    if(inspect) {
      writeGraphicPreset(shape, readGraphicPreset(shape)!, bounds, [50])
      editor.features.graphic.refresh()
      await layout()
    }
  }
  finally {
    if(!inspect) { view.editor?.destroy(); frame.remove() }
  }
}
