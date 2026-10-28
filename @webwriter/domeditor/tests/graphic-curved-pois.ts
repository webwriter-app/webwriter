import type {DOMEditor} from "../src/domeditor"
import {graphicShapeType} from "../src/graphic"
import {graphicPresetHandles, graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const numbers = (value: string) => value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)

export async function checkGraphicCurvedPOIs() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  const types = ["document","wave","double-wave","cloud","parentheses","braces","seal-1","curved-ribbon-up","oval-callout","cloud-callout"] as const
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Curved POI fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic = doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 800 500")
    Object.assign(graphic.style,{width:"800px",height:"500px"})
    const probe = doc.createElementNS("http://www.w3.org/2000/svg","svg")
    probe.style.cssText="position:fixed;width:1px;height:1px;opacity:0;pointer-events:none"
    const initialPath=doc.createElementNS(probe.namespaceURI,"path") as SVGPathElement
    initialPath.setAttribute("fill","none")
    initialPath.setAttribute("stroke","black")
    initialPath.setAttribute("stroke-width",".15")
    probe.append(initialPath);editor.appendix.append(probe)
    const bounds = {x:200,y:140,width:320,height:190}
    for(const type of types) for(const rotation of [0,35]) {
      graphic.replaceChildren(doc.createComment("preserve authored siblings"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
      const shape = editor.features.graphic.selectedShape!
      const initial = readGraphicPreset(shape)!
      writeGraphicPreset(shape,initial,bounds)
      editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:String(rotation)})
      await layout()
      const handles = [...editor.appendix.querySelectorAll<HTMLButtonElement>(".◆graphic-specific-handles button")]
      const visible = graphicPresetHandles(readGraphicPreset(shape)!)
      assert(handles.length === visible.length,`${type}: incorrect visible POI count`)
      for(let handleIndex = 0; handleIndex < handles.length; handleIndex++) {
        const currentHandles = [...editor.appendix.querySelectorAll<HTMLButtonElement>(".◆graphic-specific-handles button")]
        const state = readGraphicPreset(shape)!
        const original = shape.getAttribute("d")!
        const next = [...state.values]
        const index = visible[handleIndex].index
        const adjustment = state.definition.adjustments[index]
        const delta = handleIndex % 2 ? -8 : 8
        const limits = (i: number) => state.definition.adjustmentLimits?.(state.values,i) ?? [state.definition.adjustments[i].min,state.definition.adjustments[i].max]
        const [min,max] = limits(index)
        next[index] = Math.max(min,Math.min(max,next[index]+delta))
        if(adjustment.pairedWith) {
          const paired = state.definition.adjustments.findIndex(candidate => candidate.name === adjustment.pairedWith)
          if(paired >= 0) {
            const [pairedMin,pairedMax] = limits(paired)
            next[paired] = Math.max(pairedMin,Math.min(pairedMax,next[paired] + (delta > 0 ? -2 : 3)))
          }
        }
        const point = adjustment.point(next)
        const target = {x:state.bounds.x+point.x/100*state.bounds.width,y:state.bounds.y+point.y/100*state.bounds.height}
        const expected = numbers(graphicPresetPath(type,state.bounds,next))
        const button = currentHandles[handleIndex], box = button.getBoundingClientRect()
        const pointer = {bubbles:true,composed:true,button:0,pointerId:96}
        const natural = graphicPresetHandles(state)[handleIndex].point
        const screen = new view.DOMPoint(natural.x,natural.y).matrixTransform(shape.getScreenCTM()!)
        const offset = {x:parseFloat(button.style.left)-screen.x,y:parseFloat(button.style.top)-screen.y}
        // CSS serializes positions with less precision than native SVG matrices.
        if(Math.abs(offset.x)<.01) offset.x=0
        if(Math.abs(offset.y)<.01) offset.y=0
        const destination = new view.DOMPoint(target.x,target.y).matrixTransform(shape.getScreenCTM()!)
        destination.x += offset.x; destination.y += offset.y
        initialPath.setAttribute("d",original)
        assert(initialPath.isPointInStroke(new view.DOMPoint(natural.x,natural.y)),`${type}/${rotation}/${handleIndex}: geometric POI is off the authored contour`)
        assert(Math.abs(offset.x)<.1 && offset.y<.1,`${type}/${rotation}/${handleIndex}: visible POI did not dodge upward`)
        editor.doc.stopCapturing()
        button.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:box.x+box.width/2,clientY:box.y+box.height/2}))
        doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:destination.x,clientY:destination.y}))
        await layout()
        assert(shape.getAttribute("d") === original,`${type}/${rotation}/${handleIndex}: preview changed authored geometry`)
        const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
        assert(preview,`${type}: missing preview`)
        const actual = numbers(preview.getAttribute("d")!)
        assert(actual.length === expected.length && actual.every((value,i) => Math.abs(value-expected[i]) < .001),`${type}/${rotation}/${handleIndex}: preview geometry differs from expected; offset ${JSON.stringify(offset)}, target ${JSON.stringify(target)}, diff ${Math.max(...actual.map((value,i)=>Math.abs(value-expected[i])))}, values ${JSON.stringify(readGraphicPreset(preview)?.values)}`)

        doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:destination.x,clientY:destination.y}))
        await layout()
        const edited = shape.getAttribute("d")!
        assert(edited === preview.getAttribute("d"),`${type}: commit differs from preview`)
        assert(graphicShapeType(shape) === type,`${type}: committed type changed`)
        editor.doc.stopCapturing()
        editor.doc.undo()
        await layout()
        assert(graphic.querySelector("path")!.getAttribute("d") === original,`${type}/${rotation}/${handleIndex}: undo failed`)
      }
    }
  }
  finally { view.editor?.destroy(); frame.remove() }
}
