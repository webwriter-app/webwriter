import type {DOMEditor} from "../src/domeditor"
import {arrowPoints, graphicShapeSections, graphicShapeType} from "../src/graphic"
import {graphicPresetHandles, graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const numbers = (value: string) => value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)

export async function checkGraphicArrowPOIs() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Arrow fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    Object.assign(graphic.style, {width:"800px",height:"500px"})
    const frameBounds = {x:200,y:140,width:320,height:190}
    const options = graphicShapeSections.find(section => section.label === "Arrows")!.rows.flat()
    for(const option of options) for(const rotation of [0,35]) for(const index of [0,1,2]) {
      graphic.replaceChildren(doc.createComment("preserve authored siblings"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:option.type})
      const shape = editor.features.graphic.selectedShape!
      const preset = readGraphicPreset(shape)
      if(preset) writeGraphicPreset(shape,preset,frameBounds)
      else shape.setAttribute("points",arrowPoints(frameBounds).map(point => `${point.x},${point.y}`).join(" "))
      editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:String(rotation)})
      await layout()
      const handles = [...editor.appendix.querySelectorAll<HTMLButtonElement>(".◆graphic-specific-handles button")]
      assert(handles.length === 3,`${option.label}: expected exactly three POIs`)
      const original = shape.getAttribute(preset ? "d" : "points")!
      const before = readGraphicPreset(shape)
      let target: {x:number,y:number}, expected: number[]
      if(before) {
        const next = [...before.values], adjustment = before.definition.adjustments[index]
        const [min,max] = before.definition.adjustmentLimits!(before.values,index)
        next[index] = Math.max(min,Math.min(max,next[index]+(index === 0 ? -2 : 3)))
        const point = adjustment.point(next)
        target = {x:before.bounds.x+point.x/100*before.bounds.width,y:before.bounds.y+point.y/100*before.bounds.height}
        expected = numbers(graphicPresetPath(before.type,before.bounds,next))
      }
      else {
        const points = arrowPoints(frameBounds), cy = frameBounds.y+frameBounds.height/2
        if(index === 0) {
          const half = (points[6].y-points[0].y)/2+8
          points[0].y = points[1].y = cy-half; points[5].y = points[6].y = cy+half
          target = points[0]
        }
        else if(index === 1) {
          const x = points[1].x-20
          for(const i of [1,2,4,5]) points[i].x = x
          target = {x,y:cy}
        }
        else {
          points[2].y -= 15; points[4].y += 15
          target = points[2]
        }
        expected = points.flatMap(point => [point.x,point.y])
      }
      const button = handles[index], box = button.getBoundingClientRect()
      const pointer = {bubbles:true,composed:true,button:0,pointerId:95}
      const natural = before ? graphicPresetHandles(before)[index].point : arrowPoints(frameBounds)[index]
      const screen = new view.DOMPoint(natural.x,natural.y).matrixTransform(shape.getScreenCTM()!)
      const destination = new view.DOMPoint(target.x,target.y).matrixTransform(shape.getScreenCTM()!)
      destination.x += Number(button.style.left.replace("px", "")) - screen.x
      destination.y += Number(button.style.top.replace("px", "")) - screen.y
      editor.doc.stopCapturing()
      button.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:box.x+box.width/2,clientY:box.y+box.height/2}))
      doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:destination.x,clientY:destination.y}))
      await layout()
      assert(shape.getAttribute(preset ? "d" : "points") === original,`${option.label}: preview changed authored geometry`)
      const preview = editor.appendix.querySelector<SVGGraphicsElement>(`.◆graphic-preview ${preset ? "path" : "polygon"}`)!
      assert(preview,`${option.label}: no preview`)
      const edited = preview.getAttribute(preset ? "d" : "points")!
      const actual = numbers(edited)
      assert(actual.length === expected.length && actual.every((value,i) => Math.abs(value-expected[i]) < .005),`${option.label}/${rotation}/${index}: POI changed the wrong dimensions`)
      if(before) {
        const state = readGraphicPreset(preview)!
        assert(state?.type === option.type,`${option.label}: edited shape lost recognition`)
        assert(graphicPresetHandles(state).length === 3,`${option.label}: edited shape lost its controls`)
      }
      doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:destination.x,clientY:destination.y}))
      await layout()
      assert(shape.getAttribute(preset ? "d" : "points") === edited,`${option.label}: commit differs from preview`)
      assert(!editor.appendix.querySelector(".◆graphic-preview"),`${option.label}: preview leaked after commit`)
      assert(graphicShapeType(shape) === option.type,`${option.label}: committed type changed`)
      assert(editor.appendix.querySelectorAll(".◆graphic-specific-handles button").length === 3,`${option.label}: committed POIs disappeared`)
      editor.doc.undo()
      await layout()
      const restored = graphic.querySelector(preset ? "path" : "polygon")!
      assert(restored.getAttribute(preset ? "d" : "points") === original,`${option.label}: undo failed`)
      editor.doc.redo()
      await layout()
      assert(graphic.querySelector(preset ? "path" : "polygon")!.getAttribute(preset ? "d" : "points") === edited,`${option.label}: redo failed`)
      assert(graphic.firstChild?.nodeType === Node.COMMENT_NODE,`${option.label}: authored sibling removed`)
      assert(!editor.toHTML(true).includes("◆"),`${option.label}: editing artifacts serialized`)
    }
  }
  finally { view.editor?.destroy(); frame.remove() }
}
