import type {DOMEditor} from "../src/domeditor"
import {ShapeKeyboard} from "../src/components/shape-keyboard"
import {MathKeyboard} from "../src/components/math-keyboard"
import {mathKeyboardTabEvent, selectionChangeEvent, shapeKeyboardInputEvent} from "../src/editor-bridge"

function assert(condition: unknown, message: string): asserts condition { if(!condition) throw new Error(message) }

export async function checkKeyboardTabs() {
  const inspect = new URLSearchParams(location.search).has("inspect-tabs")
  const fixture = document.createElement("section")
  fixture.style.cssText = "position:fixed;inset:12px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;padding:8px;background:#eef2f7"
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:100%;flex:1;min-height:240px;border:1px solid #94a3b8;background:white;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  const shapes = new ShapeKeyboard(), math = new MathKeyboard()
  math.style.display = "none"
  fixture.append(frame, shapes, math)
  document.body.append(fixture)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  const relay = (event: MessageEvent) => {
    if(event.source !== view) return
    if(event.data?.type === shapeKeyboardInputEvent) shapes.handleInput(event.data.detail)
    if(event.data?.type === mathKeyboardTabEvent) math.cycleLayout(event.data.detail.backward)
    if(event.data?.type === selectionChangeEvent && event.data.detail.graphic?.capture) shapes.mode = event.data.detail.graphic.mode
  }
  window.addEventListener("message", relay)
  try {
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, view.editorError ?? "Keyboard tab fixture did not initialize")
    const editor = view.editor, doc = frame.contentDocument!
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      await shapes.updateComplete
      await math.updateComplete
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    shapes.addEventListener("ribbon-button-click", event => {
      const label = (event as CustomEvent<{label: string}>).detail.label
      if(label.startsWith("graphic-mode:")) editor.features.graphic.actions.setGraphicMode({
        type: "setGraphicMode", mode: label.slice(13) as "select" | "draw" | "lines" | "curves",
      })
    })
    const tab = async (backward = false) => {
      const event = new view.KeyboardEvent("keydown", {key: "Tab", code: "Tab", shiftKey: backward, bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      assert(event.defaultPrevented, "Tab escaped to native focus navigation")
      doc.dispatchEvent(new view.KeyboardEvent("keyup", {key: "Tab", code: "Tab", shiftKey: backward, bubbles: true}))
      await settle()
    }
    doc.body.innerHTML = '<svg viewBox="0 0 600 300" style="width:100%;height:100%"><!--keep--><rect x="60" y="60" width="100" height="80"/></svg>'
    const graphic = doc.querySelector("svg")!
    editor.features.selection.captureElement(graphic)
    await settle()
    const originalGraphic = editor.toHTML(true)
    for(const backward of [false, true]) {
      const pages = backward ? ["Curves", "Lines", "Freehand", "Flowchart", "Arrows", "Advanced", "Basic"]
        : ["Advanced", "Arrows", "Flowchart", "Freehand", "Lines", "Curves", "Basic"]
      for(const page of pages) {
        await tab(backward)
        assert(shapes.activePage === page, `Expected ${page} shape tab, got ${shapes.activePage}`)
        const selected = shapes.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!
        assert(selected.getAttribute("aria-label") === page, `${page} was not visually selected`)
        assert(editor.features.selection.captureSelectedElement === graphic, `${page} lost graphic capture`)
        assert(editor.toHTML(true) === originalGraphic, "Shape tab navigation changed document content")
      }
    }
    shapes.style.display = "none"
    math.style.display = ""
    math.display = "block"
    doc.body.innerHTML = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" style="font-size:36px"><mfrac><mi>x</mi><mn>2</mn></mfrac></math>'
    const formula = doc.querySelector("math")!
    editor.features.selection.captureElement(formula)
    // The iframe's native Selection is authoritative; retain an editing caret.
    const caret = formula.querySelector("mi")!.firstChild!
    const selection = doc.getSelection()!
    selection.setPosition(caret, 1)
    editor.features.math.refresh()
    await settle()
    const originalMath = editor.toHTML(true)
    for(const [backward, layout] of [[false, "operators"], [false, "letters"], [false, "greek"],
      [true, "letters"], [true, "operators"], [true, "numbers"]] as const) {
      await tab(backward)
      assert(math.activeLayout === layout, `Expected ${layout} formula tab, got ${math.activeLayout}`)
      assert(math.shadowRoot!.querySelector('.tabs button[aria-pressed="true"]'), "Formula tab was not visually selected")
      assert(selection.focusNode === caret && selection.focusOffset === 1, "Formula tab navigation moved the caret")
      assert(editor.features.selection.captureSelectedElement === formula, "Formula tab navigation lost capture")
      assert(editor.toHTML(true) === originalMath, "Formula tab navigation changed document content")
    }
  }
  finally {
    if(!inspect) { window.removeEventListener("message", relay); view.editor?.destroy(); fixture.remove() }
  }
}
