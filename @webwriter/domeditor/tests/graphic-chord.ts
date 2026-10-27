import type {DOMEditor} from "../src/domeditor"
import {graphicPresetHandles, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicChord() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, view.editorError ?? "Chord fixture did not initialize")
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
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "chord"})
    const path = graphic.querySelector("path")!
    const frameBounds = {x: 110, y: 85, width: 430, height: 190}
    writeGraphicPreset(path, readGraphicPreset(path)!, frameBounds, [32, 117])
    await layout()

    const pointAt = (angle: number, radius = 1) => {
      const theta = angle * Math.PI / 180
      return new view.DOMPoint(frameBounds.x + frameBounds.width / 2 - Math.sin(theta) * frameBounds.width / 2 * radius,
        frameBounds.y + frameBounds.height / 2 - Math.cos(theta) * frameBounds.height / 2 * radius)
    }
    const normalized = (point: DOMPoint) => ({
      x: (point.x - frameBounds.x - frameBounds.width / 2) / (frameBounds.width / 2),
      y: (point.y - frameBounds.y - frameBounds.height / 2) / (frameBounds.height / 2),
    })
    for(const start of [0, 90, 359]) for(const sweep of [.5, 45, 180, 240, 359.5, 360]) {
      writeGraphicPreset(path, readGraphicPreset(path)!, frameBounds, [start, sweep])
      const state = readGraphicPreset(path)!
      assert(state.type === "chord" && Math.abs(state.values[0] - start) < .001 && Math.abs(state.values[1] - sweep) < .001,
        `${start}/${sweep}: state did not round-trip`)
      for(const key of ["x", "y", "width", "height"] as const) assert(Math.abs(state.bounds[key] - frameBounds[key]) < .001, `${start}/${sweep}: frame changed`)
      const handles = graphicPresetHandles(state)
      for(const [index, angle] of [start, start + sweep].entries()) {
        const expected = pointAt(angle), actual = new view.DOMPoint(handles[index].point.x, handles[index].point.y)
        assert(Math.hypot(expected.x - actual.x, expected.y - actual.y) < .001, `${start}/${sweep}: endpoint POI drifted`)
        assert(path.isPointInStroke(actual), `${start}/${sweep}: endpoint left native path perimeter`)
      }

      const a = normalized(pointAt(start)), b = normalized(pointAt(start + sweep)), middle = normalized(pointAt(start + sweep / 2))
      const cross = (p: {x: number, y: number}) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      const midpointSide = Math.sign(cross(middle))
      for(const angle of [13, 47, 111, 173, 229, 301]) for(const radius of [.25, .65, .94, 1.08]) {
        const point = pointAt(angle, radius), p = normalized(point)
        const insideEllipse = p.x * p.x + p.y * p.y < 1
        const expectedFill = sweep === 360 ? insideEllipse : insideEllipse && Math.sign(cross(p)) === midpointSide
        assert(path.isPointInFill(point) === expectedFill, `${start}/${sweep}: native fill disagreed at ${angle}/${radius}`)
      }
      const nativeBox = path.getBBox()
      const sampleCount = sweep === 360 ? 1441 : Math.ceil(sweep * 4) + 1
      const boundary = Array.from({length: sampleCount}, (_, i) => pointAt(start + sweep * i / (sampleCount - 1)))
      const limits = {
        x: Math.min(...boundary.map(point => point.x)), y: Math.min(...boundary.map(point => point.y)),
        right: Math.max(...boundary.map(point => point.x)), bottom: Math.max(...boundary.map(point => point.y)),
      }
      assert(Math.abs(nativeBox.x - limits.x) < 1 && Math.abs(nativeBox.y - limits.y) < 1
        && Math.abs(nativeBox.x + nativeBox.width - limits.right) < 1
        && Math.abs(nativeBox.y + nativeBox.height - limits.bottom) < 1,
      `${start}/${sweep}: native getBBox was not tight to the arc`)
      if(sweep === 360) {
        assert(!/\bL\b/.test(path.getAttribute("d")!), "full Chord added a radial line command")
        assert(!path.isPointInStroke(pointAt(start, 0)), "full Chord has a radial stroke through its center")
      }
    }

    const guide = editor.appendix.querySelector<SVGElement>(".◆graphic-ellipse-guide")!
    assert(guide && guide.getAttribute("display") === "none", "ellipse guide should start hidden")
    for(const rotation of [0, 35]) for(const [handleName, targetAngle, fixedAngle] of [
      ["adjust-start-angle", 300, 149], ["adjust-sweep", 221, 32],
    ] as const) {
      writeGraphicPreset(path, readGraphicPreset(path)!, frameBounds, [32, 117])
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: String(rotation)})
      await layout()
      editor.doc.stopCapturing()
      const original = path.getAttribute("d")!
      const button = editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${handleName}"]`)!
      assert(button, `${handleName}: handle was not rendered`)
      const box = button.getBoundingClientRect(), pointer = {bubbles: true, composed: true, button: 0, pointerId: 94}
      button.dispatchEvent(new view.PointerEvent("pointerdown", {...pointer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2}))
      const screenPoint = DOMMatrix.fromMatrix(path.getScreenCTM()!).transformPoint(pointAt(targetAngle))
      doc.dispatchEvent(new view.PointerEvent("pointermove", {...pointer, buttons: 1, clientX: screenPoint.x, clientY: screenPoint.y}))
      await layout()
      assert(guide.getAttribute("display") !== "none", `${handleName}: guide did not show during drag`)
      const preview = readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!
      assert(preview?.type === "chord", `${handleName}: preview did not remain a Chord`)
      const fixedEndpoint = handleName === "adjust-start-angle" ? preview.values[0] + preview.values[1] : preview.values[0]
      const delta = Math.abs(((fixedEndpoint - fixedAngle + 540) % 360) - 180)
      assert(delta < .01, `${handleName}: changed the fixed endpoint`)
      assert(path.getAttribute("d") === original, `${handleName}: preview mutated the source path`)
      doc.dispatchEvent(new view.PointerEvent("pointerup", pointer))
      await layout()
      const edited = path.getAttribute("d")!
      assert(edited !== original, `${handleName}: drag did not commit`)
      assert(guide.getAttribute("display") === "none", `${handleName}: guide remained visible after drag`)
      editor.doc.undo()
      assert(path.getAttribute("d") === original, `${handleName}: drag did not undo in one step`)
      editor.doc.redo()
      assert(path.getAttribute("d") === edited, `${handleName}: drag did not redo`)
      assert(!editor.appendix.querySelector(".◆graphic-preview"), `${handleName}: preview leaked`)
    }

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-sweep", value: "360"})
    await layout()
    const fullCircleHandles = ["adjust-start-angle", "adjust-sweep"].map(name =>
      editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!.getBoundingClientRect())
    const centers = fullCircleHandles.map(box => ({x: box.x + box.width / 2, y: box.y + box.height / 2}))
    assert(Math.hypot(centers[1].x - centers[0].x, centers[1].y - centers[0].y) >= 16, "full-circle handle hit targets overlap")
    assert(!editor.toHTML(true).includes("◆"), "Chord serialized editor markers")
    assert(!doc.querySelector(".◆graphic-ellipse-guide"), "ellipse guide leaked into authored DOM")
  }
  finally { view.editor?.destroy(); frame.remove() }
}
