import type {DOMEditor} from "../src/domeditor"
import {graphicShapeType} from "../src/graphic"
import {readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

function assert(condition: unknown, message: string): asserts condition {
  if(!condition) throw new Error(message)
}

const distance = (a: DOMPoint, b: DOMPoint) => Math.hypot(a.x - b.x, a.y - b.y)

/** Exercises crossing resize handles in a real SVG viewport, including rotated geometry. */
export async function checkGraphicResizeMirror() {
  const inspect = new URLSearchParams(location.search).has("inspect-resize-mirror")
  const fixture = document.createElement("section")
  fixture.setAttribute("aria-label", "Graphic resize reflection fixture")
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
    assert(view.editor, view.editorError ?? "Graphic resize reflection fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector<SVGSVGElement>("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    Object.assign(graphic.style, {width: "800px", height: "500px"})
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})

    const frameBounds = {x: 360, y: 240, width: 220, height: 130}
    const cases = [
      {axis: "horizontal", target: (b: DOMRect) => ({x: b.x - b.width * .75, y: b.y + b.height * .6}), anchor: "tr"},
      {axis: "vertical", target: (b: DOMRect) => ({x: b.x + b.width * .75, y: b.y - b.height * .6}), anchor: "bl"},
      {axis: "both", target: (b: DOMRect) => ({x: b.x - b.width * .75, y: b.y - b.height * .6}), anchor: "br"},
    ] as const
    let inspected = false
    for(const type of ["curved-right-arrow", "curved-up-arrow"] as const) for(const rotation of [0, 35]) for(const testCase of cases) {
      graphic.replaceChildren(doc.createComment("preserve authored siblings"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
      const shape = editor.features.graphic.selectedShape as SVGPathElement
      const initial = readGraphicPreset(shape)!
      writeGraphicPreset(shape, initial, frameBounds)
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: String(rotation)})
      await layout()
      const bounds = shape.getBBox()
      assert(bounds.width > 0 && bounds.height > 0, `${type}/${rotation}/${testCase.axis}: source has empty bounds`)
      const originalAnchor = new view.DOMPoint(bounds.x, bounds.y).matrixTransform(shape.getScreenCTM()!)
      const originalPath = shape.getAttribute("d")!
      const handle = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
      assert(handle, `${type}/${rotation}/${testCase.axis}: resize handle missing`)
      const handleBox = handle.getBoundingClientRect()
      const targetLocal = testCase.target(bounds)
      const targetScreen = new view.DOMPoint(targetLocal.x, targetLocal.y).matrixTransform(shape.getScreenCTM()!)
      const pointer = {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 300}
      editor.doc.stopCapturing()
      handle.dispatchEvent(new view.PointerEvent("pointerdown", {
        ...pointer, clientX: handleBox.x + handleBox.width / 2, clientY: handleBox.y + handleBox.height / 2,
      }))
      doc.dispatchEvent(new view.PointerEvent("pointermove", {
        ...pointer, buttons: 1, clientX: targetScreen.x, clientY: targetScreen.y,
      }))
      await layout()
      const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
      assert(preview, `${type}/${rotation}/${testCase.axis}: preview missing`)
      assert(shape.getAttribute("d") === originalPath, `${type}/${rotation}/${testCase.axis}: authored path changed during preview`)
      const previewState = readGraphicPreset(preview)
      assert(previewState?.type === type, `${type}/${rotation}/${testCase.axis}: preview lost preset recognition`)
      assert(previewState.bounds.width > 0 && previewState.bounds.height > 0, `${type}/${rotation}/${testCase.axis}: preview has nonpositive design bounds`)
      const firstPreviewPath = preview.getAttribute("d")!
      doc.dispatchEvent(new view.PointerEvent("pointermove", {
        ...pointer, buttons: 1, clientX: targetScreen.x, clientY: targetScreen.y,
      }))
      await layout()
      assert(preview.getAttribute("d") === firstPreviewPath, `${type}/${rotation}/${testCase.axis}: repeated preview drifted`)

      const nextBounds = preview.getBBox()
      const fixedCorner = testCase.anchor === "tr"
        ? {x: nextBounds.x + nextBounds.width, y: nextBounds.y}
        : testCase.anchor === "bl"
          ? {x: nextBounds.x, y: nextBounds.y + nextBounds.height}
          : {x: nextBounds.x + nextBounds.width, y: nextBounds.y + nextBounds.height}
      const nextAnchor = new view.DOMPoint(fixedCorner.x, fixedCorner.y).matrixTransform(preview.getScreenCTM()!)
      assert(distance(originalAnchor, nextAnchor) < .1,
        `${type}/${rotation}/${testCase.axis}: fixed anchor drifted ${distance(originalAnchor, nextAnchor).toFixed(3)}px`)

      doc.dispatchEvent(new view.PointerEvent("pointerup", {
        ...pointer, clientX: targetScreen.x, clientY: targetScreen.y,
      }))
      await layout()
      assert(shape.getAttribute("d") === firstPreviewPath, `${type}/${rotation}/${testCase.axis}: commit differed from preview`)
      assert(graphicShapeType(shape) === type && readGraphicPreset(shape)?.type === type,
        `${type}/${rotation}/${testCase.axis}: committed shape lost its preset type`)
      editor.doc.undo()
      await layout()
      assert(shape.getAttribute("d") === originalPath, `${type}/${rotation}/${testCase.axis}: undo did not restore the path`)
      editor.doc.redo()
      await layout()
      assert(shape.getAttribute("d") === firstPreviewPath, `${type}/${rotation}/${testCase.axis}: redo did not restore the reflected path`)
      assert(graphic.firstChild?.nodeType === Node.COMMENT_NODE, `${type}/${rotation}/${testCase.axis}: authored sibling was removed`)
      assert(!editor.toHTML(true).includes("◆"), `${type}/${rotation}/${testCase.axis}: editor marker was serialized`)
      if(inspect && !inspected && type === "curved-right-arrow" && rotation === 35 && testCase.axis === "both") inspected = true
    }
    keepFixture = inspect && inspected
    assert(!inspect || inspected, "No flipped shape was left for visual inspection")
  }
  finally {
    if(!keepFixture) {
      view.editor?.destroy()
      fixture.remove()
    }
  }
}
