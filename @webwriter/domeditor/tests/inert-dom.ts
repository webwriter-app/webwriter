import {DOMEditor} from "../src/domeditor"
import {$, cloneInert, cloneRangeContents} from "../src/utility"

if(!new URLSearchParams(location.search).has("fixture")) {
  const status = document.querySelector<HTMLElement>("#results")!
  const button = document.querySelector<HTMLButtonElement>("#run")!
  let frame: HTMLIFrameElement | null = null
  button.addEventListener("click", () => {
    button.disabled = true
    status.textContent = "Running…"
    frame = document.createElement("iframe")
    frame.title = "Disposable editor fixture"
    frame.src = `${location.pathname}?fixture`
    document.querySelector("#stage")!.replaceChildren(frame)
  })
  window.addEventListener("message", event => {
    if(event.source !== frame?.contentWindow || event.origin !== location.origin || !event.data?.inertDOMResults) return
    status.textContent = JSON.stringify(event.data.inertDOMResults, null, 2)
    button.disabled = false
  })
}
else {
  let constructions = 0
  let adoptions = 0
  customElements.define("inert-audit-widget", class extends HTMLElement {
    constructor() {
      super()
      constructions++
      this.attachShadow({mode: "open"}).textContent = "Private widget state"
    }
    adoptedCallback() { adoptions++ }
  })
  const results: {name: string, constructions: number, error?: string}[] = []
  const widgetHTML = '<inert-audit-widget value="keep"></inert-audit-widget>'
  const mixed = `<p>before</p>${widgetHTML}<p>after</p>`
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const caret = () => $.move(document.querySelector("p")!.firstChild!, 2)
  const cross = () => $.selectRange(document.body.firstElementChild!.firstChild!, 2, document.body.lastElementChild!.firstChild!, 2)
  const selectWidget = () => $.selectElement(document.querySelector("inert-audit-widget")!)
  const clipboardHTML = async (action: () => unknown) => {
    const clipboard = navigator.clipboard
    const descriptor = Object.getOwnPropertyDescriptor(clipboard, "write")
    let written: ClipboardItem[] = []
    Object.defineProperty(clipboard, "write", {configurable: true, value: async (items: ClipboardItem[]) => { written = items }})
    try {
      await action()
      return await (await written[0].getType("text/html")).text()
    }
    finally {
      if(descriptor) Object.defineProperty(clipboard, "write", descriptor)
      else Reflect.deleteProperty(clipboard, "write")
    }
  }
  const check = async (name: string, html: string, setup: (editor: DOMEditor) => void, action: (editor: DOMEditor) => unknown, expected = 0) => {
    document.body.innerHTML = html
    const editor = new DOMEditor()
    editor.schema.extendWidgets([{tagName: "inert-audit-widget"}])
    try {
      setup(editor)
      await new Promise(resolve => setTimeout(resolve, 0))
      constructions = 0
      adoptions = 0
      await action(editor)
      assert(constructions === expected, `Expected ${expected} constructors; observed ${constructions}`)
      assert(adoptions === 0, "Original widgets were adopted into a temporary document")
      results.push({name, constructions})
    }
    catch(error) { results.push({name, constructions, error: String(error)}) }
    finally { editor.destroy() }
  }

  await check("Formatting state", `<p>before${widgetHTML}after</p>`, () => {
    const p = document.querySelector("p")!
    $.selectRange(p.firstChild!, 1, p.lastChild!, 2)
  }, editor => editor.postMarkState())
  await check("Arrow boundary query", `<p>before${widgetHTML}after</p>`, caret, editor => {
    editor.features.selection.activeListeners.keydown(new KeyboardEvent("keydown", {key: "ArrowRight"}))
  })
  await check("Enter preserves unrelated widgets", mixed, caret, editor => {
    const original = document.querySelector("inert-audit-widget")!
    editor.features.manipulation.insert()
    assert(document.querySelector("inert-audit-widget") === original, "Widget identity changed")
    assert(document.querySelectorAll("p").length === 3, "Paragraph did not split")
  })
  await check("Copy selection", mixed, cross, () => {
    const copy = $.copy()
    assert(copy.querySelector("inert-audit-widget"), "Copied widget missing")
    assert(copy.ownerDocument.defaultView === null, "Copy is not inert")
  })
  await check("Native clipboard serialization", mixed, cross, () => {
    const data = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent("copy", {bubbles: true, cancelable: true, clipboardData: data}))
    assert(data.getData("text/html").includes("<inert-audit-widget"), "Clipboard lost widget")
  })
  await check("Cut serialization", mixed, selectWidget, async editor => {
    const html = await clipboardHTML(() => editor.features.manipulation.cut())
    assert(html.includes("<inert-audit-widget"), "Cut lost serialized widget")
    assert(!document.querySelector("inert-audit-widget"), "Cut did not remove widget")
  })
  await check("Table clipboard serialization", `<table><tbody><tr><td>${widgetHTML}</td><td>after</td></tr></tbody></table>`, editor => {
    const cells = document.querySelectorAll("td")
    editor.features.table.selectCells(cells[0], cells[1])
  }, async editor => {
    const html = await clipboardHTML(() => editor.features.table.copy())
    assert(html.includes("<inert-audit-widget"), "Table copy lost widget")
    assert(!html.includes("◆"), "Table copy includes editing markers")
  })
  await check("Node drag serialization", mixed, selectWidget, editor => {
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector('[part="node-drag-surface"]')!
    const data = new DataTransfer()
    surface.dispatchEvent(new DragEvent("dragstart", {bubbles: true, cancelable: true, dataTransfer: data}))
    assert(data.getData("text/html").includes("<inert-audit-widget"), "Drag lost widget")
  })
  await check("Read AI selection", mixed, cross, editor => editor.getActionHandler("readAISelection")({type: "readAISelection"}))
  await check("Read selected HTML", mixed, cross, editor => {
    const result = editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"})
    assert(result.html.includes("<inert-audit-widget"), "HTML source lost widget")
  })
  await check("Section wrapping and replacement", mixed, selectWidget, editor => {
    const original = document.querySelector("inert-audit-widget")!
    assert(editor.features.manipulation.toggleSection(), "Section wrap failed")
    $.selectElement(original)
    assert(editor.features.manipulation.setSectionType("article"), "Section replacement failed")
    assert(original.parentElement?.localName === "article", "Widget was replaced")
  })
  await check("Partial section unwrapping preserves sibling widgets", `<section>${widgetHTML}<p>middle</p>${widgetHTML}</section>`, () => $.selectElement(document.querySelector("p")!), editor => {
    const originals = Array.from(document.querySelectorAll("inert-audit-widget"))
    assert(editor.features.manipulation.toggleSection(), "Partial unwrap failed")
    assert(originals.every(widget => widget.isConnected && widget.parentElement?.localName === "section"), "Sibling widget was replaced")
  })
  await check("Media fallback state", `<video>${widgetHTML}</video>`, () => $.selectElement(document.querySelector("video")!), editor => editor.features.media.getState())
  await check("Comment range comparison", mixed, editor => {
    const before = document.querySelector("p")!.firstChild!
    $.selectRange(before, 0, before, 2)
    editor.features.comment.toggleComment("note")
    const after = document.body.lastElementChild!.firstChild!
    $.selectRange(after, 0, after, 2)
  }, editor => editor.features.comment.getState())
  await check("Schema registration and type queries", mixed, caret, editor => {
    editor.schema.extendWidgets([{tagName: "inert-audit-widget", editingConfig: {content: "flow*"}}])
    assert(editor.schema.isContentValid("inert-audit-widget", []), "Schema probe rejected empty content")
    editor.schema.findValidContentTypes("inert-audit-widget")
  })
  await check("Inert import upgrades only on actual insertion", mixed, caret, () => {
    const original = document.querySelector("inert-audit-widget")!
    const copy = cloneInert(original, true)
    assert(constructions === 0, "Import ran widget constructor")
    document.body.append(copy)
    assert(copy.shadowRoot, "Inserted widget did not upgrade")
  }, 1)
  await check("Partial range preserves namespaces and templates", `<p><b>before</b></p>${widgetHTML}<template><inert-audit-widget></inert-audit-widget></template><svg><use href="#shape"></use></svg><p><i>after</i></p>`, () => {
    $.selectRange(document.querySelector("b")!.firstChild!, 2, document.querySelector("i")!.firstChild!, 2)
  }, () => {
    const copy = cloneRangeContents($.range)
    assert(copy.firstElementChild?.textContent === "fore" && copy.lastElementChild?.textContent === "af", "Partial boundaries changed")
    assert(copy.querySelector("template")?.content.querySelector("inert-audit-widget"), "Template content lost")
    assert(copy.querySelector("use")?.namespaceURI === "http://www.w3.org/2000/svg", "Namespace changed")
  })
  window.parent.postMessage({inertDOMResults: results}, location.origin)
}
