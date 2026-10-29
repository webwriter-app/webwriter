// @vitest-environment happy-dom
import {afterAll, beforeEach, describe, expect, it} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {Schema} from "../schema"
import {$, cloneWithoutEditorMarkers} from "../utility"

const editor = new DOMEditor()

beforeEach(() => {
  document.body.innerHTML = ""
  editor.schema = new Schema()
  editor.schema.extendWidgets([
    {tagName: "prompt-widget", editingConfig: {content: "(p | flow)+"}},
    {tagName: "two-prompt-widget", editingConfig: {content: "p{2}"}},
    {tagName: "optional-hint-widget", editingConfig: {content: "webwriter-hint? p"}},
    {tagName: "webwriter-hint"},
    {tagName: "webwriter-advance-organizer", editingConfig: {content: "webwriter-advance-organizer-page*"}},
    {tagName: "webwriter-advance-organizer-page", editingConfig: {content: "flow*"}},
  ])
  editor.features.widget.refresh()
})

afterAll(() => editor.destroy())

const sync = () => editor.doc.syncFromDOM()

describe("editing nested widget pages", () => {
  const mount = (content = "<p>abcd</p>") => {
    document.body.innerHTML = `<webwriter-advance-organizer><webwriter-advance-organizer-page node-id="first">${content}</webwriter-advance-organizer-page><webwriter-advance-organizer-page node-id="second"><p>Other page</p></webwriter-advance-organizer-page></webwriter-advance-organizer><p>Outside</p>`
    editor.features.widget.refresh()
    sync()
    return document.querySelector("webwriter-advance-organizer-page")!
  }
  const key = (host: Element, key: string, extra = {}) => {
    const event = new KeyboardEvent("keydown", {key, bubbles: true, composed: true, cancelable: true, ...extra})
    host.dispatchEvent(event)
    return event
  }

  it("splits paragraphs when keyboard events target the contenteditable page host", () => {
    const page = mount()
    $.move(page.querySelector("p")!.firstChild!, 2)
    expect(key(page, "Enter").defaultPrevented).toBe(true)
    expect(cloneWithoutEditorMarkers(page, true).innerHTML).toBe("<p>ab</p><p>cd</p>")
    expect(editor.features.selection.isCaptureSelection).toBe(false)
  })

  it("creates a paragraph before typing in an empty page", () => {
    const page = mount("")
    $.move(page)
    key(page, "a")
    expect(cloneWithoutEditorMarkers(page, true).innerHTML).toBe("<p></p>")
    expect(document.getSelection()!.anchorNode).toBe(page.firstChild)
  })

  it.each(["abcd", "<b>abcd</b>", "<div>abcd</div>"])("splits existing native content without splitting its page: %s", content => {
    const page = mount(content)
    const text = page.querySelector("b, div")?.firstChild ?? page.firstChild!
    $.move(text, 2)
    key(page, "Enter")
    expect(Array.from(page.children, child => child.textContent)).toEqual(["ab", "cd"])
    expect(document.querySelectorAll('[node-id="first"]')).toHaveLength(1)
    expect(page.nextElementSibling?.textContent).toBe("Other page")
  })

  it("materializes an empty page for text input without a preceding keydown", () => {
    const page = mount("")
    $.move(page)
    const event = new InputEvent("beforeinput", {inputType: "insertText", data: "abcd", bubbles: true, composed: true, cancelable: true})
    page.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(page.querySelector("p")?.textContent).toBe("abcd")
  })

  it("keeps image insertion inside the page after typing", () => {
    const page = mount()
    $.move(page.querySelector("p")!.firstChild!, 2)
    key(page, "ArrowLeft")
    editor.features.manipulation.actions.insert({type: "insert", html: '<img src="test.png" alt="Example">'})
    expect(page.querySelector("img")?.getAttribute("src")).toBe("test.png")
    expect(page.querySelectorAll("p")).toHaveLength(2)
    expect(document.querySelectorAll("webwriter-advance-organizer-page")).toHaveLength(2)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("inserts an image at a page boundary without cloning the page", () => {
    const page = mount("")
    $.move(page)
    editor.features.manipulation.actions.insert({type: "insert", html: '<img src="test.png" alt="Example">'})
    expect(page.querySelector("img")).not.toBeNull()
    expect(document.querySelectorAll('[node-id="first"]')).toHaveLength(1)
  })

  it("keeps a parent split inside the page and supports undo and redo", () => {
    const page = mount()
    $.move(page.querySelector("p")!.firstChild!, 2)
    editor.doc.stopCapturing()
    key(page, "Enter", {ctrlKey: true, metaKey: true})
    sync()
    expect(page.querySelectorAll("p")).toHaveLength(2)
    expect(document.querySelectorAll('[node-id="first"]')).toHaveLength(1)
    editor.doc.undo()
    expect(page.textContent).toBe("abcd")
    expect(page.querySelectorAll("p")).toHaveLength(1)
    editor.doc.redo()
    expect(page.querySelectorAll("p")).toHaveLength(2)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("contenteditable")
  })

  it.each(["insertParagraph", "deleteContentBackward", "deleteContentForward"])("handles host beforeinput %s", inputType => {
    const page = mount(inputType === "insertParagraph" ? "<p>abcd</p>" : "")
    $.move(page.querySelector("p")?.firstChild ?? page, inputType === "insertParagraph" ? 2 : 0)
    const event = new InputEvent("beforeinput", {inputType, bubbles: true, composed: true, cancelable: true})
    page.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(page.isConnected).toBe(true)
    if(inputType === "insertParagraph") expect(page.querySelectorAll("p")).toHaveLength(2)
  })

  it.each(["Backspace", "Delete"])("does not remove an empty page on %s", keyName => {
    const page = mount("")
    $.move(page)
    key(page, keyName)
    expect(page.isConnected).toBe(true)
    expect(document.getSelection()!.anchorNode).toBe(page)
  })

  it("keeps the caret inside the page when deleting its last empty paragraph", () => {
    const page = mount("<p></p>")
    $.move(page.firstChild!)
    key(page, "Backspace")
    expect(page.isConnected).toBe(true)
    expect(page.contains(document.getSelection()!.anchorNode)).toBe(true)
    key(page, "a")
    expect(page.querySelector("p")).not.toBeNull()
  })
})

describe("widget content after local edits", () => {
  it("restores an empty paragraph when the last required child is removed", () => {
    document.body.innerHTML = '<prompt-widget><p>authored</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    sync()

    widget.firstElementChild!.remove()
    sync()

    expect(widget.children).toHaveLength(1)
    expect(widget.firstElementChild!.localName).toBe("p")
    expect(widget.firstElementChild!.textContent).toBe("")
    expect(editor.schema.isContentValid(widget)).toBe(true)
  })

  it("restores a deleted last paragraph after a remote Yjs update without serializing repair provenance", async () => {
    document.body.innerHTML = '<prompt-widget><p>authored</p></prompt-widget>'
    sync()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const widget = sharedDOMBody(remote).toArray().find(node => node instanceof Y.XmlElement && node.nodeName === "prompt-widget") as Y.XmlElement
      widget.delete(0, widget.length)
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote")
      await new Promise(resolve => setTimeout(resolve, 0))

      const repaired = document.querySelector("prompt-widget")!
      expect(repaired.children).toHaveLength(1)
      expect(repaired.firstElementChild!.localName).toBe("p")
      expect(repaired.firstElementChild!.textContent).toBe("")
      expect(repaired.outerHTML).not.toContain("__domeditor_minimum_repair")
      expect(editor.toHTML(true)).not.toContain("__domeditor_minimum_repair")
    }
    finally { remote.destroy() }
  })

  it("restores the p{2} minimum after one removal while preserving the other paragraph", () => {
    document.body.innerHTML = '<two-prompt-widget><p>keep me</p><p>remove me</p></two-prompt-widget>'
    const widget = document.querySelector("two-prompt-widget")!
    const keep = widget.firstElementChild!
    const remove = widget.lastElementChild!
    sync()

    remove.remove()
    sync()

    expect(widget.children).toHaveLength(2)
    expect(widget.firstElementChild).toBe(keep)
    expect(keep.textContent).toBe("keep me")
    expect(widget.lastElementChild!.localName).toBe("p")
    expect(widget.lastElementChild!.textContent).toBe("")
  })

  it("moves a collapsed caret into the restored paragraph", () => {
    document.body.innerHTML = '<prompt-widget><p>remove me</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    sync()
    const selection = document.getSelection()!
    selection.setBaseAndExtent(widget, 0, widget, 0)

    widget.firstElementChild!.remove()
    sync()

    expect(widget.children).toHaveLength(1)
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorNode).toBe(widget.firstElementChild)
  })

  it("preserves remaining child identity and does not add a child when one of several is removed", () => {
    document.body.innerHTML = '<prompt-widget><p>first</p><section>second</section><p>third</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    const [first, section, third] = Array.from(widget.children)
    sync()

    first.remove()
    sync()

    expect(Array.from(widget.children)).toEqual([section, third])
    expect(widget.children).toHaveLength(2)
    expect(widget.textContent).toBe("secondthird")
  })

  it("fills a missing required paragraph after the optional hint without disturbing authored nodes", () => {
    document.body.innerHTML = '<optional-hint-widget><!--keep--><script type="application/json" slot="data">{}</script><webwriter-hint>hint</webwriter-hint><p>required</p></optional-hint-widget>'
    const widget = document.querySelector("optional-hint-widget")!
    const comment = widget.firstChild!
    const data = widget.querySelector("script")!
    const hint = widget.querySelector("webwriter-hint")!
    const required = widget.querySelector("p")!
    sync()

    required.remove()
    sync()

    expect(widget.firstChild).toBe(comment)
    expect(widget.querySelector("script")).toBe(data)
    expect(widget.querySelector("webwriter-hint")).toBe(hint)
    expect(widget.querySelector("p")).not.toBeNull()
    expect(Array.from(widget.children, child => child.localName)).toEqual(["script", "webwriter-hint", "p"])
    expect(Array.from(widget.children).filter(child => child.localName === "p")).toHaveLength(1)
  })

  it("preserves irregular authored nodes and comments without normalizing the widget", () => {
    document.body.innerHTML = '<prompt-widget><!--keep--><p>first</p><unknown-node title="opaque">custom</unknown-node><p>last</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    const comment = widget.firstChild!
    const first = widget.querySelector("p")!
    const unknown = widget.querySelector("unknown-node")!
    const last = widget.querySelectorAll("p")[1]
    sync()

    first.remove()
    sync()

    expect(widget.firstChild).toBe(comment)
    expect(widget.querySelector("unknown-node")).toBe(unknown)
    expect(widget.lastElementChild).toBe(last)
    expect(unknown.outerHTML).toBe('<unknown-node title="opaque">custom</unknown-node>')
    expect(widget.querySelectorAll("p")).toHaveLength(1)
  })

  it("does not repair a detached widget", () => {
    document.body.innerHTML = '<prompt-widget><p>remove me</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    sync()
    widget.remove()
    widget.firstElementChild!.remove()

    sync()

    expect(widget.childNodes).toHaveLength(0)
  })

  it("restores a required child from the mutation observer without an explicit sync", async () => {
    document.body.innerHTML = '<prompt-widget><p>remove me</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    sync()

    widget.firstElementChild!.remove()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(widget.children).toHaveLength(1)
    expect(widget.firstElementChild!.localName).toBe("p")
    expect(widget.firstElementChild!.textContent).toBe("")
  })

  it("undoes and redoes required-child repair while preserving authored text and excluding markers", () => {
    document.body.innerHTML = '<prompt-widget><p class="◆temporary">authored text</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    sync()
    editor.doc.stopCapturing()

    widget.firstElementChild!.remove()
    sync()
    expect(widget.innerHTML).toBe("<p></p>")
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆")

    editor.doc.undo()
    expect(widget.innerHTML).toContain("authored text")
    editor.doc.redo()
    expect(widget.innerHTML).toBe("<p></p>")
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆")
  })
})
