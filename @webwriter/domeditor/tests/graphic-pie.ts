import type {DOMEditor} from "../src/domeditor"
import {graphicPresetHandles, readGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicPie() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Pie fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    graphic.setAttribute("preserveAspectRatio", "none")
    Object.assign(graphic.style, {width: "640px", height: "360px"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "pie"})
    const path = graphic.querySelector("path")!
    const pointAt = (angle: number, radius = 1) => {
      const {bounds} = readGraphicPreset(path)!, theta = angle * Math.PI / 180
      return new view.DOMPoint(bounds.x + bounds.width / 2 - Math.sin(theta) * bounds.width / 2 * radius,
        bounds.y + bounds.height / 2 - Math.cos(theta) * bounds.height / 2 * radius)
    }
    for(const sweep of [0, .5, 45, 90, 180, 270, 359.5, 360]) {
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-sweep", value: String(sweep)})
      assert(Math.abs(readGraphicPreset(path)!.values[0] - sweep) < .001, `${sweep}: sweep did not round-trip`)
      for(let angle = 22.5; angle < 360; angle += 45) {
        assert(path.isPointInFill(pointAt(angle, .7)) === (angle < sweep), `${sweep}: wrong sector fill at ${angle}`)
      }
      const poi = graphicPresetHandles(readGraphicPreset(path)!)[0].point
      assert(path.isPointInStroke(new view.DOMPoint(poi.x, poi.y)), `${sweep}: POI left the perimeter`)
      if(sweep === 360) assert(path.isPointInStroke(pointAt(0, .5)), "full Pie lost its vertical radius")
    }
    for(const rotation of [0, 35]) for(const target of [0, 360, 90]) {
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-sweep", value: "270"})
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: String(rotation)})
      await layout()
      editor.doc.stopCapturing()
      const original = path.getAttribute("d")!
      const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-sweep"]')!
      const box = handle.getBoundingClientRect(), pointer = {bubbles: true, composed: true, button: 0, pointerId: 93}
      handle.dispatchEvent(new view.PointerEvent("pointerdown", {...pointer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2}))
      const sequence = target === 360 ? [300, 359, 360] : target === 0 ? [180, 90, 10, 0] : [180, 90]
      for(const sweep of sequence) {
        const point = DOMMatrix.fromMatrix(path.getScreenCTM()!).transformPoint(pointAt(sweep))
        doc.dispatchEvent(new view.PointerEvent("pointermove", {...pointer, buttons: 1, clientX: point.x, clientY: point.y}))
        await layout()
        const preview = readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!
        assert(Math.abs(preview.values[0] - sweep) < .001, `${rotation}/${target}: preview jumped at ${sweep}`)
        assert(path.getAttribute("d") === original, "Pie preview mutated the source")
      }
      if(target === 90) {
        const point = DOMMatrix.fromMatrix(path.getScreenCTM()!).transformPoint(pointAt(0, 0))
        doc.dispatchEvent(new view.PointerEvent("pointermove", {...pointer, buttons: 1, clientX: point.x, clientY: point.y}))
        await layout()
        assert(Math.abs(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0] - 90) < .001, `${rotation}: Pie lost its last angle at the center`)
      }
      doc.dispatchEvent(new view.PointerEvent("pointerup", pointer))
      await layout()
      assert(Math.abs(readGraphicPreset(path)!.values[0] - target) < .001, `${rotation}: did not commit ${target}`)
      const edited = path.getAttribute("d")!
      editor.doc.undo()
      assert(path.getAttribute("d") === original, "Pie drag did not undo in one step")
      editor.doc.redo()
      assert(path.getAttribute("d") === edited, "Pie drag did not redo")
      assert(!editor.appendix.querySelector(".◆graphic-preview"), "Pie preview leaked")
    }
    assert(!editor.toHTML(true).includes("◆"), "Pie serialized editing artifacts")
  }
  finally { view.editor?.destroy(); frame.remove() }
}
