import type {DOMEditor} from "../src/domeditor"
import {localDistributionInstruction, writeDistributionConfig} from "../src/distribution-dom"
import {emptyDistributionConfig} from "../src/distribution.js"

export async function checkParagraphClipboard() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `paragraph clipboard fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    doc.body.innerHTML = '<p>A</p><p>B</p><p>C</p>'
    const [target, second, third] = Array.from(doc.querySelectorAll("p"))
    selection.setBaseAndExtent(second.firstChild!, 0, third.firstChild!, 1)
    const data = new view.DataTransfer()
    doc.dispatchEvent(new view.ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true}))
    assert(data.getData("text/html").includes('<p>B</p><p>C</p>'), `copy lost paragraphs: ${data.getData("text/html")}`)
    selection.collapse(target.firstChild!, 1)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    assert(editor.toHTML(true) === '<p>A</p><p>B</p><p>C</p><p>B</p><p>C</p>', `paste merged paragraphs: ${editor.toHTML(true)}`)
    const paragraphs = Array.from(doc.querySelectorAll("p"))
    assert(paragraphs.every((paragraph, index) => !index || paragraph.getBoundingClientRect().top >= paragraphs[index - 1].getBoundingClientRect().bottom), "pasted paragraphs overlap")
    editor.doc.syncFromDOM()
    editor.doc.undo()
    assert(editor.toHTML(true) === '<p>A</p><p>B</p><p>C</p>', "paragraph paste did not undo")
    editor.doc.redo()
    assert(doc.querySelectorAll("p").length === 5, "paragraph paste did not redo")

    // An unregistered widget elsewhere in the flow must not turn block HTML
    // into plain text, including when a nested formatted paragraph is split.
    doc.body.innerHTML = '<p><b>B</b></p><p><i>C</i></p><section><!--keep--><p><b><i>AD</i></b></p><unknown-widget>Widget</unknown-widget></section>'
    const section = doc.querySelector("section")!, widget = doc.querySelector("unknown-widget")!
    const text = section.querySelector("i")!.firstChild!
    selection.setBaseAndExtent(doc.querySelector("p b")!.firstChild!, 0, doc.querySelector("p i")!.firstChild!, 1)
    const formatted = new view.DataTransfer()
    doc.dispatchEvent(new view.ClipboardEvent("copy", {clipboardData: formatted, bubbles: true, cancelable: true}))
    selection.collapse(text, 1)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: formatted, bubbles: true, cancelable: true}))
    await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    const changed = editor.toHTML(true)
    assert(changed.includes('<section><!--keep--><p><b><i>A</i></b></p><p><b>B</b></p><p><i>C</i></p><p><b><i>D</i></b></p><unknown-widget>Widget</unknown-widget></section>'), `nested paste merged paragraphs: ${changed}`)
    assert(section.lastElementChild === widget, "paste replaced the unrelated widget")
    const splitParagraphs = Array.from(section.querySelectorAll("p"))
    assert(splitParagraphs.every((paragraph, index) => !index || paragraph.getBoundingClientRect().top >= splitParagraphs[index - 1].getBoundingClientRect().bottom), "split paragraphs overlap")
    assert(!changed.includes("◆") && !changed.includes("webwriter-clipboard"), "clipboard artifacts leaked into serialization")
    editor.doc.syncFromDOM()
    editor.doc.undo()
    assert(editor.toHTML(true) === original, "nested paragraph paste did not undo")
    editor.doc.redo()
    assert(editor.toHTML(true) === changed, "nested paragraph paste did not redo")

    doc.body.innerHTML = "<h2>Private <em>heading</em></h2>"
    const heading = doc.querySelector("h2")!
    const defaults = emptyDistributionConfig()
    writeDistributionConfig(doc.body, {...defaults, permissions: ["delete"]})
    writeDistributionConfig(heading, {...defaults, view: false, permissions: ["edit"]})
    writeDistributionConfig(heading.querySelector("em")!, {...defaults, permissions: ["move"]})
    selection.selectAllChildren(doc.body)
    const configured = new view.DataTransfer()
    doc.dispatchEvent(new view.ClipboardEvent("copy", {clipboardData: configured, bubbles: true, cancelable: true}))
    doc.body.innerHTML = "<p>BeforeAfter</p>"
    selection.collapse(doc.querySelector("p")!.firstChild, 6)
    doc.dispatchEvent(new view.ClipboardEvent("paste", {clipboardData: configured, bubbles: true, cancelable: true}))
    const [before, pasted, after] = Array.from(doc.body.children)
    assert(before?.textContent === "Before" && pasted?.localName === "h2" && after?.textContent === "After",
      "paste did not preserve the configured heading")
    assert(localDistributionInstruction(pasted)?.config.view === false
      && localDistributionInstruction(pasted)?.config.permissions.includes("edit"), "paste lost the heading permissions")
    assert(localDistributionInstruction(pasted.querySelector("em")!)?.config.permissions.includes("move"),
      "paste lost the nested permissions")
    assert(!localDistributionInstruction(doc.body) && !localDistributionInstruction(before) && !localDistributionInstruction(after),
      "copying document contents also transferred the source document's permissions")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
