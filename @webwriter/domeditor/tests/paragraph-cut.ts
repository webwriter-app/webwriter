import type {DOMEditor} from "../src/domeditor"

/** Clipboard action regression for #282, using real Chromium layout/editing. */
export async function checkParagraphCut() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "cut fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    // Exercise the real Cut action without requesting system clipboard access.
    Object.defineProperty(view.navigator, "clipboard", {configurable: true, value: {write: async () => {}}})
    for(const html of ["<p>First paragraph</p><p>Second paragraph</p>",
      "<section><!--keep--><h2>First paragraph</h2><p>Second paragraph</p><unknown-cut-widget></unknown-cut-widget></section>"]) {
      doc.body.innerHTML = html
      const paragraph = doc.querySelector<HTMLElement>("p, h2")!
      const following = paragraph.nextElementSibling!
      const siblings = Array.from(paragraph.parentNode!.childNodes)
      selection.selectAllChildren(paragraph)
      editor.doc.syncFromDOM(); editor.doc.stopCapturing()
      assert(await editor.features.manipulation.cut(), "cut action failed")
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      await new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
      assert(!paragraph.textContent && paragraph.matches(":empty"), "cut did not leave an empty paragraph")
      assert(selection.isCollapsed && paragraph.contains(selection.anchorNode), "cut moved the insertion position")
      const placeholder = view.getComputedStyle(paragraph, "::before")
      assert(placeholder.content !== "none" && placeholder.content !== '""' && placeholder.visibility === "visible",
        `empty paragraph has no visible inline position for the native caret: ${JSON.stringify({content: placeholder.content, visibility: placeholder.visibility, html: paragraph.outerHTML})}`)
      assert(paragraph.getBoundingClientRect().height > 0
        && paragraph.getBoundingClientRect().bottom <= following.getBoundingClientRect().top,
        "empty paragraph lost its line or overlaps the following paragraph")
      assert(siblings.every((node, index) => paragraph.parentNode!.childNodes[index] === node), "cut rebuilt unrelated content")
      editor.doc.syncFromDOM(); editor.doc.undo()
      assert(paragraph.textContent === "First paragraph", "cut did not undo")
      editor.doc.redo()
      assert(!paragraph.textContent && !editor.toHTML(true).includes("\u200b"), "cut redo serialized a caret placeholder")
      selection.collapse(paragraph, 0)
      paragraph.focus(); doc.body.focus()
      assert(doc.execCommand("insertText", false, "Replacement"), "native typing failed after cut")
      assert(paragraph.textContent === "Replacement" && following.textContent === "Second paragraph", "typing missed the emptied paragraph")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
