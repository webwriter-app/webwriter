import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

/** Native selection focuses a tabindex slide, even when its text owns the caret. */
export async function checkSlideEditing() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px;border:0"
  frame.srcdoc = '<!doctype html><body><h1>Slide heading</h1><p>First editable paragraph</p><p>Second editable paragraph</p><picture><img width="160" height="90" alt="Image"></picture><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
  const settle = async () => { for(let i = 0; i < 3; i++) await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve())) }
  try {
    for(let i = 0; !view.editor && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "slide editing fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    assert(editor.setDocumentLayout("slides", "document"), "slide conversion failed")
    await settle()
    const slide = doc.querySelector<HTMLElement>("section.ww-slide")!, paragraphs = slide.querySelectorAll("p")
    const selection = doc.getSelection()!
    const clearOnBackground = async (grey = false) => {
      const rect = slide.getBoundingClientRect(), clientX = rect.right - 50, clientY = grey ? rect.top / 2 : rect.bottom - 50
      const background = grey ? doc.elementFromPoint(clientX, clientY)! : slide
      if(grey) assert(rect.top > 5 && background !== slide, "fixture lacks a grey slide margin")
      for(const type of ["pointerdown", "pointerup", "click"]) {
        const target = type === "pointerdown" ? background : doc.body
        target.dispatchEvent(new view.PointerEvent(type, {bubbles: true, cancelable: true,
          pointerId: 3, button: 0, clientX, clientY}))
      }
      await settle()
      assert(selection.isCollapsed && selection.anchorNode === slide, "background click did not clear the selection")
      assert(!editor.features.selection.captureSelectedElement && !editor.features.transformation.target, "background click retained capture or resize handles")
      assert(!doc.querySelector(".◆element-selected, .◆text-selected, .◆gap-before-selected, .◆gap-after-selected"), "background click retained visible selection markers")
      assert(view.getComputedStyle(slide).caretColor === "rgba(0, 0, 0, 0)"
        && view.getComputedStyle(paragraphs[0]).caretColor === "rgba(0, 0, 0, 0)", "background click left a native caret visible")
      if(grey) {
        const count = slide.childNodes.length
        background.dispatchEvent(new view.MouseEvent("dblclick", {bubbles: true, cancelable: true, button: 0, clientX, clientY}))
        assert(slide.childNodes.length === count, "double clicking the grey margin inserted slide content")
      }
    }
    for(const paragraph of paragraphs) {
      const text = paragraph.firstChild!
      for(const backward of [false, true]) {
        // Focus change is the native side effect of clicking or extending a
        // selection inside a focusable slide. It must never re-enter its start.
        doc.body.focus({preventScroll: true})
        selection.setBaseAndExtent(text, backward ? 8 : 2, text, backward ? 2 : 8)
        slide.focus({preventScroll: true})
        await settle()
        assert(selection.anchorNode === text && selection.focusNode === text
          && selection.anchorOffset === (backward ? 8 : 2) && selection.focusOffset === (backward ? 2 : 8), "slide focus reset the text range")
        assert(editor.features.transformation.target === paragraph, "text selection lost its item frame")
        assert(!slide.classList.contains("◆element-selected"), "text selection selected the slide")
        assert(view.getComputedStyle(paragraph).caretColor !== "rgba(0, 0, 0, 0)", "text editing retained background caret suppression")
        await clearOnBackground(backward)
      }
    }
    const picture = slide.querySelector("picture")!
    editor.features.selection.captureElement(picture)
    slide.focus({preventScroll: true})
    await settle()
    assert(editor.features.selection.captureSelectedElement === picture, "slide focus reset media capture")
    await clearOnBackground(true)
    editor.features.selection.actions.hoverNode({type: "hoverNode", path: [0, 0]})
    assert(!slide.classList.contains("◆element-hovered"), "outline hover highlighted the slide")
    const blank = slide.getBoundingClientRect()
    doc.body.dispatchEvent(new view.MouseEvent("dblclick", {bubbles: true, cancelable: true,
      button: 0, clientX: blank.right - 100, clientY: blank.bottom - 100}))
    await settle()
    const added = slide.lastElementChild!
    assert(added.localName === "p" && selection.anchorNode === added, "background double click did not enter a slide text box")
    assert(editor.features.transformation.target === added, "new slide text box lost its frame")
    editor.features.selection.actions.selectNode({type: "selectNode", path: [0, 0]})
    await settle()
    assert(slide.classList.contains("◆element-selected"), "breadcrumb could not select the slide")
    await clearOnBackground(true)
    // Grey margins start the same marquee as the slide and canvas backgrounds.
    // Enclose two items, with unrelated content deliberately outside the box.
    paragraphs.forEach((paragraph, index) => Object.assign(paragraph.style, {
      position: "absolute", left: "80px", top: `${100 + index * 100}px`, width: "300px", height: "60px",
    }))
    for(const item of [slide.querySelector("h1")!, picture, added]) Object.assign((item as HTMLElement).style, {left: "700px"})
    for(const operation of ["fit-content", "zoom-out"] as const) {
      editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation})
      await settle()
      const rect = slide.getBoundingClientRect(), zoom = editor.features.slides.zoom
      const start = {clientX: rect.left + 20 * zoom, clientY: rect.top / 2}
      const end = {clientX: rect.left + 400 * zoom, clientY: rect.top + 280 * zoom}
      assert(rect.top > 5, "box-selection fixture lacks a grey margin")
      const origin = doc.elementFromPoint(start.clientX, start.clientY)!
      assert(origin && origin !== slide && !slide.contains(origin), "box selection did not start in the grey margin")
      origin.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 4, button: 0, ...start}))
      doc.body.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, cancelable: true, pointerId: 4, button: 0, ...end}))
      assert(editor.appendix.querySelectorAll('[part~="box-selection-preview"]').length === 2, "grey-to-slide drag did not preview the enclosed items")
      doc.body.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, cancelable: true, pointerId: 4, button: 0, ...end}))
      await settle()
      assert(Array.from(paragraphs).every(paragraph => paragraph.classList.contains("◆element-selected"))
        && doc.querySelectorAll(".◆element-selected").length === 2, "grey-to-slide drag did not select exactly the enclosed items")
      assert(!slide.classList.contains("◆element-selected"), "marquee selected the slide itself")
      assert(!editor.appendix.querySelector('[part="selection-box"], [part~="box-selection-preview"]'), "marquee artifacts survived release")
      await clearOnBackground(true)
    }
    editor.features.slides.actions.addSlide({type: "addSlide"})
    await settle()
    const emptySlide = doc.querySelectorAll<HTMLElement>("section.ww-slide")[1]
    assert(!emptySlide.querySelector("h1, p"), "new slide contains automatic text boxes")
    assert(selection.anchorNode === emptySlide && !editor.features.transformation.target, "blank slide retains text box controls")
    const emptyRect = emptySlide.getBoundingClientRect()
    emptySlide.dispatchEvent(new view.MouseEvent("dblclick", {bubbles: true, cancelable: true,
      button: 0, clientX: emptyRect.left + 200, clientY: emptyRect.top + 150}))
    await settle()
    assert(emptySlide.querySelectorAll("p").length === 1 && selection.anchorNode === emptySlide.querySelector("p"), "blank slide does not accept a text box")
    assert(!editor.toHTML(true).includes("◆"), "slide editing serialized editor markers")
  }
  finally { view.editor?.destroy(); frame.remove() }
}
