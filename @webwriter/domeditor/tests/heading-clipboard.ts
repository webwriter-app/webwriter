import type {DOMEditor} from "../src/domeditor"

/** Heading text retains its level at a gap and joins existing text in place. */
export async function checkHeadingClipboard() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `heading clipboard fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    doc.body.innerHTML = '<h2><b>Heading</b></h2><p>Dummy text</p>'
    const source = doc.querySelector("h2")!, paragraph = doc.querySelector("p")!
    selection.setBaseAndExtent(source.firstElementChild!.firstChild!, 0, source.firstElementChild!.firstChild!, 7)
    const data = new view.DataTransfer()
    doc.dispatchEvent(new view.ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true}))
    assert(data.getData("text/html").includes("<h2"), "copy lost the heading level")
    selection.collapse(doc.body, doc.body.childNodes.length)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    const pasted = doc.body.lastElementChild!
    assert(pasted.localName === "h2" && pasted.innerHTML === "<b>Heading</b>", "gap paste did not create the copied heading")
    assert(pasted.previousElementSibling === paragraph, "gap paste moved existing content")
    assert(pasted.getBoundingClientRect().top >= paragraph.getBoundingClientRect().bottom, "pasted heading overlaps the preceding paragraph")
    assert(view.getComputedStyle(pasted).fontSize === view.getComputedStyle(source).fontSize, "pasted heading does not render at its source level")
    editor.doc.syncFromDOM()
    editor.doc.undo()
    assert(doc.querySelectorAll("h2").length === 1, "heading paste did not undo")
    editor.doc.redo()
    const target = doc.querySelector("p")!, text = target.firstChild!
    selection.setBaseAndExtent(text, 0, text, 5)
    doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    assert(target.textContent === "Heading text" && target.querySelector("b")?.textContent === "Heading", "text paste did not join the destination paragraph")
    assert(doc.querySelectorAll("h2").length === 2 && !target.querySelector("h2"), "text paste inserted a heading block")
    assert(target.getBoundingClientRect().height > 0 && target.scrollWidth <= target.clientWidth, "destination text overflows its container")
    assert(!editor.toHTML(true).includes("◆") && !editor.toHTML(true).includes("webwriter-clipboard"), "clipboard artifacts leaked into serialization")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
