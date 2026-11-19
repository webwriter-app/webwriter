import type {DOMEditor} from "../src/domeditor"
import {readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

function assert(condition: unknown, message: string): asserts condition {
  if(!condition) throw new Error(message)
}

/** Native SVG bounds, previews and commit must share the same constrained scale. */
export async function checkGraphicResizeAspect() {
  const inspect = new URLSearchParams(location.search).has("inspect-resize-aspect")
  const fixture = document.createElement("section")
  fixture.setAttribute("aria-label", "Aspect-locked graphic resize fixture")
  fixture.style.cssText = "position:fixed;inset:12px;z-index:2147483646;padding:8px;background:#eef2f7;box-sizing:border-box"
  const frame = document.createElement("iframe")
  frame.style.cssText = "display:block;width:900px;height:650px;border:1px solid #94a3b8;background:white;max-width:none"
  frame.srcdoc = '<!doctype html><style>html,body{margin:0}</style><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  fixture.append(frame)
  document.body.append(fixture)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  let keepFixture = false
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Aspect-locked resize fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector<SVGSVGElement>("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    graphic.setAttribute("preserveAspectRatio", "none")
    Object.assign(graphic.style, {width: "800px", height: "500px"})
    for(const rotation of [0, 35]) for(const fromCenter of [false, true]) {
      graphic.replaceChildren(doc.createComment("preserve authored siblings"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rounded-rectangle"})
      const shape = editor.features.graphic.selectedShape as SVGPathElement
      writeGraphicPreset(shape, readGraphicPreset(shape)!, {x: 100, y: 100, width: 200, height: 100})
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: String(rotation)})
      const sibling = doc.createElementNS("http://www.w3.org/2000/svg", "rect")
      for(const [key, value] of Object.entries({x: 344, y: 220, width: 80, height: 60, fill: "#dbeafe"})) sibling.setAttribute(key, String(value))
      graphic.append(sibling)
      await layout()
      const sourceBounds = shape.getBBox(), matrix = shape.getScreenCTM()!
      const anchor = new view.DOMPoint(fromCenter ? 200 : 100, fromCenter ? 150 : 100).matrixTransform(matrix)
      const before = shape.getAttribute("d")
      editor.doc.stopCapturing()
      const handle = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
      const handleBox = handle.getBoundingClientRect()
      const target = new view.DOMPoint(343, 221.5).matrixTransform(matrix)
      const pointer = {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 520, shiftKey: true, metaKey: fromCenter}
      handle.dispatchEvent(new view.PointerEvent("pointerdown", {...pointer, clientX: handleBox.x + handleBox.width / 2, clientY: handleBox.y + handleBox.height / 2}))
      doc.dispatchEvent(new view.PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y}))
      await layout()
      const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
      assert(preview, `${rotation}/${fromCenter}: preview missing`)
      const bounds = preview.getBBox(), previewMatrix = preview.getScreenCTM()!
      assert(Math.abs(bounds.width / bounds.height - sourceBounds.width / sourceBounds.height) < .0002,
        `${rotation}/${fromCenter}: preview lost the aspect ratio (${bounds.width}/${bounds.height})`)
      assert(shape.getAttribute("d") === before, "Resize preview mutated authored geometry")
      const fixed = new view.DOMPoint(bounds.x + (fromCenter ? bounds.width / 2 : 0), bounds.y + (fromCenter ? bounds.height / 2 : 0)).matrixTransform(previewMatrix)
      assert(Math.hypot(fixed.x - anchor.x, fixed.y - anchor.y) < .1, `${rotation}/${fromCenter}: fixed anchor moved`)
      const graphicPoint = new view.DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height)
        .matrixTransform(previewMatrix).matrixTransform(graphic.getScreenCTM()!.inverse())
      for(const axis of ["x", "y"] as const) {
        const guide = editor.appendix.querySelector<SVGLineElement>(`[data-axis="${axis}"]`)!
        if(guide.getAttribute("display") === "none") continue
        const start = new view.DOMPoint(Number(guide.getAttribute("x1")), Number(guide.getAttribute("y1")))
          .matrixTransform(graphic.getScreenCTM()!.inverse())
        assert(Math.abs(start[axis] - graphicPoint[axis]) < .1, `${rotation}/${fromCenter}: guide does not match the resized corner`)
      }
      if(!rotation && !fromCenter) {
        assert(Math.abs(bounds.width - 244) < .1 && Math.abs(bounds.height - 122) < .1, "Sibling snapping chose incompatible dimensions")
      }
      const after = preview.getAttribute("d")
      handle.dispatchEvent(new view.PointerEvent("pointerup", {...pointer, clientX: target.x, clientY: target.y}))
      await layout()
      assert(shape.getAttribute("d") === after, "Resize commit differed from preview")
      editor.doc.undo()
      await layout()
      assert(shape.getAttribute("d") === before, "Resize undo did not restore geometry")
      editor.doc.redo()
      await layout()
      assert(shape.getAttribute("d") === after, "Resize redo did not restore geometry")
      assert(graphic.firstChild?.nodeType === Node.COMMENT_NODE, "Resize removed an authored sibling")
      assert(!editor.toHTML(true).includes("◆"), "Resize serialized an editor artifact")
    }
    keepFixture = inspect
  }
  finally {
    if(!keepFixture) {
      view.editor?.destroy()
      fixture.remove()
    }
  }
}
