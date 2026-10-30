import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

/** Exercise rendered grid coordinates and alignment through both layout cameras. */
export async function checkLayoutGrid() {
  for(const mode of ["canvas", "slides"] as const) {
    const frame = document.createElement("iframe")
    frame.style.cssText = "width:900px;height:700px;border:0;display:block"
    frame.srcdoc = '<!doctype html><body><p>Move me</p><test-widget>Align here</test-widget><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
    document.body.append(frame)
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    const settle = async () => { for(let i = 0; i < 3; i++) await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve())) }
    try {
      for(let i = 0; !view.editor && i < 500; i++) await new Promise(resolve => setTimeout(resolve, 20))
      assert(view.editor, `grid fixture did not initialize${view.editorError ? `: ${view.editorError}` : ""}`)
      const editor = view.editor!, doc = frame.contentDocument!
      assert(editor.setDocumentLayout(mode, "document"), `${mode} conversion failed`)
      await settle()
      const target = doc.querySelector("p")!, peer = doc.querySelector<HTMLElement>("test-widget")!
      target.style.cssText = "position:absolute;left:73px;top:117px;width:160px;height:80px;margin:0;background:#dbeafe;border-radius:8px;padding:16px;box-sizing:border-box"
      peer.style.cssText = "position:absolute;left:420px;top:300px;width:160px;height:80px;margin:0;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;box-sizing:border-box"
      if(mode === "canvas") {
        editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "fit-content"})
        editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
      }
      else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "fit-content"})
      await settle()
      editor.features.selection.selectElement(target)
      const feature = editor.features.transformation
      for(const operation of ["initial", "zoom-in"] as const) {
        if(operation === "zoom-in") {
          if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation})
          else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation})
          await settle()
        }
        Object.assign(target.style, {left: "73px", top: "117px"})
        const zoom = mode === "canvas" ? editor.features.canvas.zoom : editor.features.slides.zoom
        const start = target.getBoundingClientRect()
        feature.handleMoveStart(new view.MouseEvent("mousedown", {button: 0, clientX: start.left, clientY: start.top}))
        feature.handleMoveDrag(new view.MouseEvent("mousemove", {clientX: start.left + 34 * zoom, clientY: start.top + 38 * zoom}))
        assert(Math.abs(parseFloat(target.style.left) - 100) < .05 && Math.abs(parseFloat(target.style.top) - 160) < .05, `${mode} did not land on the grid at zoom ${zoom}: ${target.style.left}/${target.style.top}`)
        assert(Boolean(editor.appendix.querySelector('[part="transform-grid"]')) === (mode === "slides"), "slide grid missing")
        if(mode === "canvas") {
          const background = editor.appendix.querySelector<HTMLElement>('[part="canvas-background"]')!
          const [x, y] = background.style.backgroundPosition.split(" ").map(parseFloat)
          const size = parseFloat(background.style.backgroundSize)
          const origin = editor.features.canvas.clientPoint(0, 0)
          assert(Math.abs(x + size / 2 + origin.x * zoom) < .01 && Math.abs(y + size / 2 + origin.y * zoom) < .01, "canvas dots do not share the snapping origin")
        }
        feature.handleMoveEnd()
        const current = target.getBoundingClientRect(), other = peer.getBoundingClientRect()
        feature.handleMoveStart(new view.MouseEvent("mousedown", {button: 0, clientX: current.left, clientY: current.top}))
        feature.handleMoveDrag(new view.MouseEvent("mousemove", {clientX: other.left - current.width - 3, clientY: other.top + 4}))
        const aligned = target.getBoundingClientRect()
        assert(Math.abs(aligned.right - other.left) < .05 && Math.abs(aligned.top - other.top) < .05, `${mode} edge alignment failed at ${zoom}: right ${aligned.right}/${other.left}, top ${aligned.top}/${other.top}`)
        assert(editor.appendix.querySelectorAll('[part~="transform-guide-object"]').length === 2, "alignment lines missing")
        assert(!editor.toHTML(true).match(/transform-grid|transform-guide|◆/), "grid leaked into serialized HTML")
        feature.handleMoveEnd()
        assert(!editor.appendix.querySelector('[part="transform-movement-overlay"]'), "grid/guide cleanup failed")
      }
    }
    finally {
      view.editor?.destroy(); frame.remove()
    }
  }
}
