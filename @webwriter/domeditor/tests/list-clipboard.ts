import type {DOMEditor} from "../src/domeditor"

/** List marker regression for #304 using real browser selections and layout. */
export async function checkListClipboard() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `list clipboard fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    for(const [tag, style] of [["ol", "upper-alpha"], ["ol", "lower-roman"], ["ul", "square"]]) {
      doc.body.innerHTML = `<${tag} style="list-style-type:${style}"><li>First</li><li>Second</li><li>Third</li><li>Fourth</li></${tag}><p>Elsewhere</p>`
      const list = doc.querySelector(tag)!
      editor.doc.syncFromDOM(); editor.doc.stopCapturing()
      selection.setBaseAndExtent(list, 2, list, 4)
      const data = new view.DataTransfer()
      const cut = new view.ClipboardEvent("cut", {clipboardData: data, bubbles: true, cancelable: true})
      doc.dispatchEvent(cut)
      assert(cut.defaultPrevented && list.children.length === 2, "native cut did not remove just the selected items")
      assert(data.getData("text/html").includes("webwriter-clipboard"), "native cut lost its internal clipboard format")
      editor.doc.syncFromDOM(); editor.doc.stopCapturing()
      selection.collapse(doc.body, doc.body.childNodes.length)
      doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      editor.doc.syncFromDOM()
      const pasted = doc.body.lastElementChild!
      assert(pasted.localName === tag && pasted.innerHTML === "<li>Third</li><li>Fourth</li>", "paste lost the selected list structure")
      const first = pasted.firstElementChild!
      assert(view.getComputedStyle(first).listStyleType === style, `${style} markers changed after cut/paste`)
      assert(first.getBoundingClientRect().height > 0 && pasted.getBoundingClientRect().top >= doc.querySelector("p")!.getBoundingClientRect().bottom,
        "pasted list does not render below the intervening paragraph")
      editor.doc.undo()
      assert(doc.querySelectorAll(tag).length === 1, "list paste did not undo")
      editor.doc.redo()
      assert(view.getComputedStyle(doc.body.lastElementChild!.firstElementChild!).listStyleType === style, "list markers changed after redo")
      assert(!editor.toHTML(true).includes("◆") && !editor.toHTML(true).includes("webwriter-clipboard"), "clipboard artifacts leaked into serialization")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
