import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

/** Rotated SVG viewport drag previews keep the source graphic's screen matrix. */
export async function checkGraphicDragPreviewRotation() {
  const layout = async (view: Window & typeof globalThis) => {
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
  }
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:1000px;height:700px;border:0;max-width:none"
    frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.querySelector("#fixture")!.append(frame)
    try {
      const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
      for(let attempt = 0; !view.editor && !view.editorError && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
      assert(view.editor && !view.editorError, `${mode}: preview fixture did not initialize (${view.editorError ?? "timed out"})`)
      const editor = view.editor!, doc = frame.contentDocument!
      doc.body.innerHTML = '<svg viewBox="100 50 1200 600" style="width:600px;height:360px"><!--keep--><rect x="400" y="250" width="160" height="100" fill="skyblue"/><ellipse cx="900" cy="400" rx="60" ry="40" fill="orange"/></svg>'
      assert(editor.setDocumentLayout(mode, "document"), `${mode}: layout conversion failed`)
      const graphic = doc.querySelector("svg")!, shape = graphic.querySelector("rect")!
      Object.assign(graphic.style, {left: "200px", top: "200px", rotate: "30deg", scale: "1.1 0.9", transform: "translate(12px, 8px)", transformOrigin: "25% 75%"})
      editor.features.selection.captureElement(graphic)
      for(const aspect of ["xMidYMid meet", "none", "xMaxYMin slice"]) {
        graphic.setAttribute("preserveAspectRatio", aspect)
        for(const zoom of [100, 140]) {
          editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom})
          const translate = graphic.currentTranslate as unknown as {x: number, y: number}
          translate.x += 17
          translate.y -= 11
          shape.removeAttribute("transform")
          editor.features.graphic.refresh()
          await layout(view)
          shape.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}))
          doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: 1}))
          await layout(view)
          const before = editor.toHTML(true)
          const rotate = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="rotate"]')!
          const handle = rotate.getBoundingClientRect()
          const start = {x: handle.left + handle.width / 2, y: handle.top + handle.height / 2}
          const matrix = graphic.getScreenCTM()!
          const local = new DOMPoint(start.x, start.y).matrixTransform(matrix.inverse())
          rotate.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 2, clientX: start.x, clientY: start.y}))
          for(const angle of [15, 45, 90]) {
            const radians = angle * Math.PI / 180
            const point = new DOMPoint(
              480 + (local.x - 480) * Math.cos(radians) - (local.y - 300) * Math.sin(radians),
              300 + (local.x - 480) * Math.sin(radians) + (local.y - 300) * Math.cos(radians),
            ).matrixTransform(matrix)
            doc.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 2, clientX: point.x, clientY: point.y}))
            await layout(view)
            const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
            assert(preview, `${mode}/${aspect}/${zoom}: drag preview is missing`)
            const actual = preview.getScreenCTM()!, expected = graphic.getScreenCTM()!
            for(const key of ["a", "b", "c", "d", "e", "f"] as const) {
              const diagnostic = {actual: [actual.a, actual.b, actual.c, actual.d, actual.e, actual.f],
                expected: [expected.a, expected.b, expected.c, expected.d, expected.e, expected.f],
                previewStyle: preview.getAttribute("style"), graphicRect: graphic.getBoundingClientRect().toJSON(),
                previewRect: preview.getBoundingClientRect().toJSON(), ctm: graphic.getCTM()?.toString(),
                screen: graphic.getScreenCTM()?.toString(), zoom: graphic.currentScale,
                translate: {x: graphic.currentTranslate.x, y: graphic.currentTranslate.y}}
              assert(Math.abs(actual[key] - expected[key]) < .01,
                `${mode}/${aspect}/${zoom}: preview ${key} drifted: ${actual[key]} vs ${expected[key]} ${JSON.stringify(diagnostic)}`)
            }
            const rotation = preview.querySelector("rect")!.getAttribute("transform")
            assert(rotation === `rotate(${angle} 480 300)`, `${mode}/${aspect}/${zoom}/${angle}: preview rotation is incorrect (${rotation})`)
            assert(editor.toHTML(true) === before, `${mode}: dragging changed authored HTML`)
          }
          const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
          const bounds = preview.querySelector("rect")!.getBoundingClientRect()
          doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: 2}))
          await layout(view)
          const committed = shape.getBoundingClientRect()
          for(const key of ["x", "y", "width", "height"] as const) {
            assert(Math.abs(committed[key] - bounds[key]) < .1, `${mode}/${aspect}/${zoom}: shape jumped on release (${key})`)
          }
          assert(!editor.appendix.querySelector(".◆graphic-preview") && !doc.querySelector(".◆graphic-preview-source"), `${mode}: preview artifacts survived release`)
          assert(!editor.toHTML(true).includes("◆") && !editor.doc.body.toString().includes("◆"), `${mode}: preview artifacts entered saved or shared HTML`)
        }
      }
    }
    finally {
      (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy()
      frame.remove()
    }
  }
}
