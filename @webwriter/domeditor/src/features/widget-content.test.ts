// @vitest-environment happy-dom
import {afterAll, beforeEach, describe, expect, it, vi} from "vitest"
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
    {tagName: "choice-widget", editingConfig: {content: "choice-item+"}},
    {tagName: "single-choice-widget", editingConfig: {content: "choice-item"}},
    {tagName: "choice-item", editingConfig: {content: "(p | text)*", isolating: false}},
    {tagName: "webwriter-choice", editingConfig: {group: "answer", content: "webwriter-choice-item+"}},
    {tagName: "webwriter-choice-item", editingConfig: {group: "", content: "(p | flow)+", isolating: false}},
    {tagName: "webwriter-order", editingConfig: {group: "answer", content: "webwriter-order-item+"}},
    {tagName: "webwriter-order-item", editingConfig: {group: "", content: "(p | flow)+", isolating: false}},
    {tagName: "webwriter-timeline", editingConfig: {content: "webwriter-timeline-event*"}},
    {tagName: "webwriter-timeline-event", editingConfig: {content: "h2 flow+"}},
  ])
  editor.features.widget.refresh()
})

afterAll(() => editor.destroy())

const sync = () => editor.doc.syncFromDOM()

describe("widget descendant placement", () => {
  it("updates availability as the caret moves and reuses parsed snippet content", () => {
    editor.schema.extendWidgets([
      {tagName: "nested-quiz", editingConfig: {content: "prompt-widget", excludedDescendants: ["nested-quiz", "table"]}},
    ])
    document.body.innerHTML = '<nested-quiz><prompt-widget><div><p>Prompt</p></div></prompt-widget></nested-quiz><p>Outside</p>'
    const manipulation = editor.features.manipulation
    const snippets = [{id: "package-member:quiz", html: "<div><nested-quiz></nested-quiz></div>"},
      {id: "user-snippet:text", html: "<p>Prose</p>"}]
    const parse = vi.spyOn(editor, "parseHTMLFragment")
    try {
      manipulation.actions.setInsertionSnippets({type: "setInsertionSnippets", snippets})
      $.move(document.querySelector("prompt-widget p")!.firstChild!, 1)
      expect(manipulation.unavailableInsertions()).toEqual(expect.arrayContaining(["element:table", "widget:nested-quiz", "package-member:quiz"]))
      expect(manipulation.unavailableInsertions()).not.toContain("user-snippet:text")

      $.move(document.body.lastElementChild!.firstChild!, 1)
      const outside = manipulation.unavailableInsertions()
      expect(outside).not.toContain("element:table")
      expect(outside).not.toContain("widget:nested-quiz")
      expect(outside).not.toContain("package-member:quiz")
      manipulation.actions.setInsertionSnippets({type: "setInsertionSnippets", snippets})
      expect(parse).toHaveBeenCalledTimes(snippets.length)
    }
    finally {
      parse.mockRestore()
      manipulation.actions.setInsertionSnippets({type: "setInsertionSnippets", snippets: []})
    }
  })

  it("respects structural content at a widget gap and keeps valid text conversions available", () => {
    editor.schema.extendWidgets([{tagName: "two-prompt-widget", editingConfig: {content: "p{2}", isolating: false}}])
    document.body.innerHTML = '<two-prompt-widget><p>First</p><p>Second</p></two-prompt-widget>'
    const widget = document.querySelector("two-prompt-widget")!
    const manipulation = editor.features.manipulation
    $.move(widget.firstElementChild!.firstChild!, 1)
    expect(manipulation.unavailableInsertions()).not.toContain("element:p")
    expect(manipulation.unavailableInsertions()).toContain("element:h2")
    $.selectGap(widget.lastElementChild!, "before")
    expect($.range.startContainer === widget).toBe(true)
    expect(editor.schema.canInsert(widget, document.createElement("p"), 1)).toBe(false)
    expect(manipulation.unavailableInsertions()).toContain("element:p")
  })

  it("rejects inserting, pasting and dropping an organizer into one of its own pages", () => {
    document.body.innerHTML = '<webwriter-advance-organizer><webwriter-advance-organizer-page><div><p>Keep this</p></div></webwriter-advance-organizer-page></webwriter-advance-organizer>'
    editor.features.widget.refresh()
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 0, text, 4)
    const original = editor.toHTML(true)
    const html = "<webwriter-advance-organizer></webwriter-advance-organizer>"

    editor.features.manipulation.actions.insert({type: "insert", html})
    const transfer = new DataTransfer()
    transfer.setData("text/html", `<section>${html}</section>`)
    document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: transfer, bubbles: true, cancelable: true}))
    document.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertFromDrop", dataTransfer: transfer, bubbles: true, cancelable: true}))

    expect(editor.toHTML(true)).toBe(original)
    expect($.range.toString()).toBe("Keep")
  })
})

describe("flat timeline event content", () => {
  it.each(["Enter", "a"])("edits the existing title from its leading boundary on %s", key => {
    document.body.innerHTML = '<webwriter-timeline><webwriter-timeline-event>\n<!--keep--><h2 slot="title">Title</h2>\n<p>Body</p>\n</webwriter-timeline-event></webwriter-timeline>'
    editor.features.widget.refresh()
    const event = document.querySelector("webwriter-timeline-event")!, title = event.querySelector("h2")!
    $.selectGap(title, "before")
    editor.features.selection.processSelection()
    expect($.anchor).toBe(title.firstChild)
    expect($.anchorOffset).toBe(0)
    expect($.isGapSelection).toBe(false)
    event.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, composed: true, cancelable: true}))
    expect(event.querySelectorAll('h2[slot="title"]')).toHaveLength(1)
    expect(event.querySelectorAll("h2")).toHaveLength(1)
    expect(event.querySelector("h2")).toBe(title)
    expect(event.innerHTML).toContain("<!--keep-->")
    expect(editor.schema.isContentValid(event)).toBe(true)
  })

  it("rechecks the current title after a remote replacement before materializing a gap", () => {
    document.body.innerHTML = '<webwriter-timeline><webwriter-timeline-event><h2 slot="title">Old</h2><p>Body</p></webwriter-timeline-event></webwriter-timeline>'
    editor.features.widget.refresh()
    const event = document.querySelector("webwriter-timeline-event")!
    const title = document.createElement("h2")
    title.slot = "title"
    title.textContent = "Remote"
    event.firstElementChild!.replaceWith(title)
    $.selectGap(title, "before")
    editor.features.manipulation.ensureTextBlock()
    expect($.anchor).toBe(title.firstChild)
    expect($.anchorOffset).toBe(0)
    expect(event.querySelectorAll("h2")).toHaveLength(1)
  })

  it.each(["keydown", "beforeinput"])("splits flow children on Enter via %s without duplicating the title", input => {
    document.body.innerHTML = '<webwriter-timeline>\n  <webwriter-timeline-event id="event">\n    <!--keep--><h2 slot="title">Title</h2>\n    <p>abcd</p>\n  </webwriter-timeline-event>\n</webwriter-timeline>'
    editor.features.widget.refresh()
    const event = document.querySelector("webwriter-timeline-event")!
    const heading = event.querySelector("h2")!
    sync()
    editor.doc.stopCapturing()
    $.move(event.querySelector("p")!.firstChild!, 2)
    event.dispatchEvent(input === "keydown"
      ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
      : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, composed: true, cancelable: true}))
    sync()
    expect(Array.from(event.querySelectorAll("p"), node => node.textContent)).toEqual(["ab", "cd"])
    expect(event.querySelector("h2")).toBe(heading)
    expect(event.querySelectorAll("h2")).toHaveLength(1)
    expect(event.innerHTML).toContain("<!--keep-->")
    expect(editor.schema.isContentValid(event)).toBe(true)
    expect(editor.toHTML(true)).not.toContain("contenteditable")
    editor.doc.undo()
    expect(event.querySelector("p")?.textContent).toBe("abcd")
    editor.doc.redo()
    expect(Array.from(event.querySelectorAll("p"), node => node.textContent)).toEqual(["ab", "cd"])
  })
})

describe("repeatable widget options", () => {
  it.each([["choice", "<p>abcd</p>"], ["order", "<p>abcd</p>"], ["choice", "abcd"]])("splits a quiz %s item containing %s", (type, content) => {
    document.body.innerHTML = `<webwriter-${type}><webwriter-${type}-item>${content}</webwriter-${type}-item></webwriter-${type}>`
    editor.features.widget.refresh()
    const item = document.querySelector(`webwriter-${type}-item`)!
    $.move(item.querySelector("p")?.firstChild ?? item.firstChild!, 2)
    item.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true}))
    expect(Array.from(document.querySelectorAll(`webwriter-${type}-item`), element => element.textContent)).toEqual(["ab", "cd"])
    expect(Array.from(document.querySelectorAll(`webwriter-${type}-item`), element => editor.schema.isContentValid(element))).toEqual([true, true])
  })

  it.each([["ArrowUp", 0], ["ArrowDown", 4]] as const)("keeps %s navigation inside repeatable option content", (keyName, offset) => {
    document.body.innerHTML = '<webwriter-choice><webwriter-choice-item><p>abcd</p></webwriter-choice-item><webwriter-choice-item><p>other</p></webwriter-choice-item></webwriter-choice>'
    editor.features.widget.refresh()
    const parent = document.querySelector("webwriter-choice")!
    const item = parent.firstElementChild!
    const authored = cloneWithoutEditorMarkers(parent, true).innerHTML
    $.move(item.querySelector("p")!.firstChild!, offset)
    const event = new KeyboardEvent("keydown", {key: keyName, bubbles: true, composed: true, cancelable: true})
    item.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect($.anchor).toBe(parent.children[offset ? 1 : 0].querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(0)
    expect($.isGapSelection).toBe(false)
    expect(editor.features.selection.selectionCaret?.getAttribute("part") ?? "").not.toContain("gap-caret")
    expect(cloneWithoutEditorMarkers(parent, true).innerHTML).toBe(authored)
  })

  it("addresses a gap above or below a widget item from its box", () => {
    document.body.innerHTML = '<webwriter-choice><webwriter-choice-item><p>abcd</p></webwriter-choice-item></webwriter-choice>'
    const parent = document.querySelector("webwriter-choice")!
    const item = parent.firstElementChild!
    item.getBoundingClientRect = () => new DOMRect(0, 20, 100, 20)
    expect($.widgetGapFromCoords(50, 10, item, editor.schema)).toMatchObject({node: parent, offset: 0})
    expect($.widgetGapFromCoords(50, 50, item, editor.schema)).toMatchObject({node: parent, offset: 1})
  })

  it("addresses the outer gaps of a top-level contentful widget", () => {
    document.body.innerHTML = '<prompt-widget><p>Text</p></prompt-widget>'
    const widget = document.querySelector("prompt-widget")!
    widget.getBoundingClientRect = () => new DOMRect(0, 20, 100, 20)
    expect($.widgetGapFromCoords(50, 10, widget, editor.schema)).toMatchObject({node: document.body, offset: 0})
    expect($.widgetGapFromCoords(50, 50, widget, editor.schema)).toMatchObject({node: document.body, offset: 1})
  })

  it.each(["abcd", "<p>abcd</p>"])("splits an option with the primary modifier: %s", content => {
    document.body.innerHTML = `<choice-widget><choice-item id="original">${content}</choice-item><choice-item>other</choice-item></choice-widget>`
    editor.features.widget.refresh()
    const parent = document.querySelector("choice-widget")!
    const item = parent.firstElementChild!
    const text = item.querySelector("p")?.firstChild ?? item.firstChild!
    sync()
    editor.doc.stopCapturing()
    $.move(text, 2)
    item.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true}))
    sync()
    expect(Array.from(parent.children, child => child.textContent)).toEqual(["ab", "cd", "other"])
    expect(parent.children[0].id).toBe("original")
    expect(parent.children[1].id).not.toBe("original")
    expect(parent.children[1].contains($.anchor)).toBe(true)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("contenteditable")
    editor.doc.undo()
    expect(Array.from(parent.children, child => child.textContent)).toEqual(["abcd", "other"])
    editor.doc.redo()
    expect(Array.from(parent.children, child => child.textContent)).toEqual(["ab", "cd", "other"])
  })

  it("keeps an isolating widget intact on a parent split", () => {
    document.body.innerHTML = '<webwriter-advance-organizer><webwriter-advance-organizer-page><p>abcd</p></webwriter-advance-organizer-page></webwriter-advance-organizer>'
    editor.features.widget.refresh()
    const page = document.querySelector("webwriter-advance-organizer-page")!
    $.move(page.querySelector("p")!.firstChild!, 2)
    page.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true}))
    expect(document.querySelectorAll("webwriter-advance-organizer-page")).toHaveLength(1)
    expect(page.querySelectorAll("p")).toHaveLength(2)
  })

  it("falls back to splitting the paragraph when the parent cannot accept another option", () => {
    document.body.innerHTML = '<single-choice-widget><choice-item><p>abcd</p></choice-item></single-choice-widget>'
    editor.features.widget.refresh()
    const item = document.querySelector("choice-item")!
    $.move(item.querySelector("p")!.firstChild!, 2)
    item.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true}))
    expect(document.querySelectorAll("choice-item")).toHaveLength(1)
    expect(Array.from(item.querySelectorAll("p"), element => element.textContent)).toEqual(["ab", "cd"])
  })
})

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
  it("moves a widget-created caret into its initial required paragraph", () => {
    document.body.innerHTML = '<section><p>Keep</p></section>'
    const parent = document.querySelector("section")!
    const hint = document.createElement("prompt-widget")
    parent.prepend(hint)
    document.getSelection()!.setBaseAndExtent(hint, 0, hint, 0)

    sync()

    expect(hint.firstElementChild?.localName).toBe("p")
    expect(document.getSelection()!.anchorNode).toBe(hint.firstElementChild)
    expect(document.getSelection()!.anchorOffset).toBe(0)
    expect(parent.lastElementChild?.textContent).toBe("Keep")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

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

describe("widget editingConfig.split", () => {
  beforeEach(() => {
    editor.schema.extendWidgets([
      {tagName: "split-list-widget", editingConfig: {group: "answer", content: "split-item+"}},
      {tagName: "split-item", editingConfig: {group: "", content: "(p | flow)+", isolating: false, split: "self"}},
      {tagName: "break-multi-widget", editingConfig: {content: "p+", split: "line"}},
      {tagName: "break-single-widget", editingConfig: {content: "p", split: "line"}},
    ])
    editor.features.widget.refresh()
  })

  it.each(["keydown", "beforeinput"])("splits an item with split: \"self\" on plain %s", input => {
    document.body.innerHTML = "<split-list-widget><split-item><p>abcd</p></split-item></split-list-widget>"
    editor.features.widget.refresh()
    const item = document.querySelector("split-item")!
    $.move(item.querySelector("p")!.firstChild!, 2)
    item.dispatchEvent(input === "keydown"
      ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
      : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, composed: true, cancelable: true}))
    expect(Array.from(document.querySelectorAll("split-item"), el => el.textContent)).toEqual(["ab", "cd"])
  })

  it.each(["keydown", "beforeinput"])("inserts a line break instead of splitting in break-multi-widget on %s", input => {
    document.body.innerHTML = "<break-multi-widget><p>abcd</p></break-multi-widget>"
    editor.features.widget.refresh()
    const widget = document.querySelector("break-multi-widget")!
    $.move(widget.querySelector("p")!.firstChild!, 2)
    widget.dispatchEvent(input === "keydown"
      ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
      : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, composed: true, cancelable: true}))
    expect(widget.querySelectorAll("p")).toHaveLength(1)
    expect(widget.querySelector("p")!.innerHTML).toBe("ab<br>cd")
  })

  it.each(["keydown", "beforeinput"])("inserts a line break inside single-paragraph widgets with split: \"line\" on %s", input => {
    document.body.innerHTML = "<break-single-widget><p>abcd</p></break-single-widget>"
    editor.features.widget.refresh()
    const widget = document.querySelector("break-single-widget")!
    $.move(widget.querySelector("p")!.firstChild!, 2)
    widget.dispatchEvent(input === "keydown"
      ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
      : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, composed: true, cancelable: true}))
    expect(widget.querySelectorAll("p")).toHaveLength(1)
    expect(widget.querySelector("p")!.innerHTML).toBe("ab<br>cd")
  })

  it("splits the last webwriter-choice-item at the end of its paragraph on plain Enter", () => {
    editor.schema.extendWidgets([
      {tagName: "webwriter-quiz-hint", editingConfig: {group: "containerinline", content: "p+", isolating: true, split: "line"}},
      {tagName: "webwriter-quiz-feedback", editingConfig: {content: "flow+", isolating: true, split: "line"}},
      {tagName: "webwriter-choice", editingConfig: {content: "webwriter-quiz-hint? p webwriter-choice-item+ webwriter-quiz-feedback?", isolating: true, split: "line"}},
      {tagName: "webwriter-choice-item", editingConfig: {group: "", content: "webwriter-quiz-hint? (p | flow)+", isolating: false, split: "self"}},
    ])
    editor.features.widget.refresh()
    document.body.innerHTML = `<webwriter-choice><p slot="prompt">Question</p><webwriter-choice-item><p>A theme</p></webwriter-choice-item><webwriter-choice-item><p>A snippet</p></webwriter-choice-item><webwriter-choice-item><p>A live session</p></webwriter-choice-item><webwriter-quiz-feedback><p>Feedback</p></webwriter-quiz-feedback></webwriter-choice>`
    editor.features.widget.refresh()
    const choice = document.querySelector("webwriter-choice")!
    const items = choice.querySelectorAll("webwriter-choice-item")
    $.move(items[2].querySelector("p")!.firstChild!, 14)
    items[2].dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true}))
    const updatedItems = choice.querySelectorAll("webwriter-choice-item")
    expect(updatedItems).toHaveLength(4)
    expect(updatedItems[2].querySelectorAll("p")).toHaveLength(1)
    expect(updatedItems[2].textContent).toBe("A live session")
    expect(updatedItems[3].querySelectorAll("p")).toHaveLength(1)
    expect(updatedItems[3].textContent).toBe("")
    expect(updatedItems[3].nextElementSibling?.localName).toBe("webwriter-quiz-feedback")
  })

  it("removes an empty second split: \"self\" item on Backspace and moves caret to end of the first", () => {
    document.body.innerHTML = "<split-list-widget><split-item><p>First</p></split-item><split-item><p><br></p></split-item></split-list-widget>"
    editor.features.widget.refresh()
    const items = document.querySelectorAll("split-item")
    $.move(items[1].querySelector("p")!, 0)
    items[1].dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true}))
    const remaining = document.querySelectorAll("split-item")
    expect(remaining).toHaveLength(1)
    expect(remaining[0].textContent).toBe("First")
    expect($.anchor).toBe(remaining[0].querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(5)
  })

  it("merges a non-empty split: \"self\" item into the previous one on Backspace and supports undo/redo", () => {
    document.body.innerHTML = "<split-list-widget><split-item><p>ab</p></split-item><split-item><p>cd</p></split-item></split-list-widget>"
    editor.features.widget.refresh()
    sync()
    editor.doc.stopCapturing()
    const items = document.querySelectorAll("split-item")
    $.move(items[1].querySelector("p")!.firstChild!, 0)
    items[1].dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true}))
    sync()
    const remaining = document.querySelectorAll("split-item")
    expect(remaining).toHaveLength(1)
    expect(remaining[0].querySelectorAll("p")).toHaveLength(1)
    expect(remaining[0].textContent).toBe("abcd")
    expect($.anchor).toBe(remaining[0].querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(2)

    editor.doc.undo()
    expect(Array.from(document.querySelectorAll("split-item"), el => el.textContent)).toEqual(["ab", "cd"])
    editor.doc.redo()
    expect(Array.from(document.querySelectorAll("split-item"), el => el.textContent)).toEqual(["abcd"])
  })

  it("merges the next split: \"self\" item on Delete at the end of the first item", () => {
    document.body.innerHTML = "<split-list-widget><split-item><p>ab</p></split-item><split-item><p>cd</p></split-item></split-list-widget>"
    editor.features.widget.refresh()
    const items = document.querySelectorAll("split-item")
    $.move(items[0].querySelector("p")!.firstChild!, 2)
    items[0].dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, composed: true, cancelable: true}))
    const remaining = document.querySelectorAll("split-item")
    expect(remaining).toHaveLength(1)
    expect(remaining[0].textContent).toBe("abcd")
    expect($.anchor).toBe(remaining[0].querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(2)
  })

  it("does not join across prompt, feedback, or non-self-splitting widgets", () => {
    editor.schema.extendWidgets([
      {tagName: "webwriter-quiz-hint", editingConfig: {group: "containerinline", content: "p+", isolating: true, split: "line"}},
      {tagName: "webwriter-quiz-feedback", editingConfig: {content: "flow+", isolating: true, split: "line"}},
      {tagName: "webwriter-choice", editingConfig: {content: "webwriter-quiz-hint? p webwriter-choice-item+ webwriter-quiz-feedback?", isolating: true, split: "line"}},
      {tagName: "webwriter-choice-item", editingConfig: {group: "", content: "webwriter-quiz-hint? (p | flow)+", isolating: false, split: "self"}},
      {tagName: "block-split-widget", editingConfig: {group: "answer", content: "block-item+"}},
      {tagName: "block-item", editingConfig: {group: "", content: "p+", isolating: false, split: "block"}},
    ])
    editor.features.widget.refresh()

    document.body.innerHTML = `<webwriter-choice><p slot="prompt">Prompt</p><webwriter-choice-item><p>Only</p></webwriter-choice-item><webwriter-quiz-feedback><p>Feedback</p></webwriter-quiz-feedback></webwriter-choice>`
    editor.features.widget.refresh()
    const item = document.querySelector("webwriter-choice-item")!
    $.move(item.querySelector("p")!.firstChild!, 0)
    item.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true}))
    expect(document.querySelectorAll("webwriter-choice-item")).toHaveLength(1)
    expect(document.querySelector('p[slot="prompt"]')!.textContent).toBe("Prompt")

    $.move(item.querySelector("p")!.firstChild!, 4)
    item.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, composed: true, cancelable: true}))
    expect(document.querySelectorAll("webwriter-choice-item")).toHaveLength(1)
    expect(document.querySelector("webwriter-quiz-feedback")!.textContent).toBe("Feedback")

    document.body.innerHTML = `<block-split-widget><block-item><p>First</p></block-item><block-item><p>Second</p></block-item></block-split-widget>`
    editor.features.widget.refresh()
    const blockItems = document.querySelectorAll("block-item")
    $.move(blockItems[1].querySelector("p")!.firstChild!, 0)
    blockItems[1].dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true}))
    expect(document.querySelectorAll("block-item")).toHaveLength(2)
  })
})
