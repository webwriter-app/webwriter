// @vitest-environment happy-dom
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest"
import "happy-dom"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {$} from "../utility"

const editor = new DOMEditor()

// Happy DOM toggles DETAILS while bubbling through the element, before the
// document listener can cancel the click. Browsers run that default action
// after propagation. These tests exercise the editor's explicit activation.
let detailsDispatch: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  detailsDispatch = vi.spyOn(HTMLDetailsElement.prototype, "dispatchEvent")
    .mockImplementation(HTMLElement.prototype.dispatchEvent)
})
afterAll(() => detailsDispatch.mockRestore())

const cleanHTML = () => editor.toHTML(true)

const keydown = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true, ...init})
  document.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML = "<p></p>"
  $.move(document.body.firstElementChild!)
})

describe("semantic list editing", () => {
  it("mirrors aligned image markers into empty-list affordances and cleans them up", () => {
    document.body.innerHTML = '<ul style="--ww-list-marker-image: url(data:image/png;base64,AQID); list-style-image: var(--ww-list-marker-image)"></ul><p>Elsewhere</p>'
    $.move(document.querySelector("ul")!, 0)
    editor.features.list.refreshSelectionPresentation()
    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.style.getPropertyValue("--ww-list-marker-image")).toContain("data:image/png;base64,AQID")
    expect(marker.getAttribute("part")).toContain("virtual-list-item-image-marker")
    expect(document.querySelector("ul")!.childNodes).toHaveLength(0)
    $.move(document.querySelector("p")!.firstChild!, 0)
    editor.features.list.refreshSelectionPresentation()
    expect(marker.style.getPropertyValue("--ww-list-marker-image")).toBe("")
    expect(marker.getAttribute("part")).not.toContain("virtual-list-item-image-marker")
  })

  it("shares aligned image formatting and supports undo without changing list structure", async () => {
    document.body.innerHTML = '<ul><!--keep--><li><my-widget></my-widget>Item</li></ul>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const list = document.querySelector("ul")!
    const children = Array.from(list.childNodes)
    editor.features.manipulation.setElementStyles(list, {
      "list-style-image": "var(--ww-list-marker-image)",
      "--ww-list-marker-image": 'url("data:image/png;base64,AQID")',
    })
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(Array.from(list.childNodes)).toEqual(children)
    expect(editor.doc.body.toString()).toContain("--ww-list-marker-image")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(document.querySelector("ul")!.getAttribute("style")).toBeNull()
    expect(document.querySelector("ul")!.innerHTML).toBe('<!--keep--><li><my-widget></my-widget>Item</li>')
    editor.doc.redo()
    await Promise.resolve()
    // Happy DOM's style parser drops custom properties containing quoted data
    // URLs when restored through setAttribute; the authored attribute is intact.
    expect(document.querySelector("ul")!.getAttribute("style")).toContain('--ww-list-marker-image: url("data:image/png;base64,AQID")')
  })

  it.each(["ul", "ol"] as const)("sets %s without unwrapping an already matching list", type => {
    document.body.innerHTML = `<${type}><li>A</li></${type}>`
    const list = document.body.firstElementChild!
    $.selectElement(list)
    expect(editor.features.list.setListType(type, [{localName: type, namespaceURI: list.namespaceURI}])).toBe(0)
    expect(document.body.firstElementChild).toBe(list)
    expect(cleanHTML()).toBe(`<${type}><li>A</li></${type}>`)
  })

  it("changes list type while preserving irregular DOM, widgets, attributes, and selection", () => {
    document.body.innerHTML = '<ul id="items" class="authored" style="list-style-type: square; color: red"><!--keep--><li>A<my-widget></my-widget></li><div>unfamiliar</div><li><ul><li>nested</li></ul></li></ul>'
    const list = document.body.firstElementChild!
    const text = list.querySelector("li")!.firstChild!
    const children = Array.from(list.childNodes)
    $.move(text, 1)
    expect(editor.features.list.setListType("ol", [{localName: "ul", namespaceURI: list.namespaceURI}])).toBe(1)
    const replacement = document.body.firstElementChild as HTMLElement
    expect(replacement.localName).toBe("ol")
    expect(Array.from(replacement.childNodes)).toEqual(children)
    expect(replacement.id).toBe("items")
    expect(replacement.classList.contains("authored")).toBe(true)
    expect(replacement.style.color).toBe("red")
    expect(replacement.style.listStyleType).toBe("")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
  })

  it("rejects stale and non-list scopes without changing the current DOM", () => {
    document.body.innerHTML = "<ol><li>A</li></ol>"
    $.selectElement(document.body.firstElementChild!)
    expect(editor.features.list.setListType("ul", [{localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"}])).toBe(0)
    expect(editor.features.list.setListType("ul", [{localName: "ol", namespaceURI: "http://www.w3.org/2000/svg"}])).toBe(0)
    expect(cleanHTML()).toBe("<ol><li>A</li></ol>")
  })

  it("converts mixed list selections together while retaining unrelated selected elements", () => {
    document.body.innerHTML = '<ul><li>A<ul><li>nested</li></ul></li></ul><ol><li>B</li></ol><p>keep</p>'
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    try {
      const selected = Array.from(document.body.children)
      $.selectElements(selected)
      const scopes = ["ul", "ol"].map(localName => ({localName, namespaceURI: "http://www.w3.org/1999/xhtml"}))
      expect(editor.features.list.setListType("ol", scopes)).toBe(1)
      expect(Array.from(document.body.children, element => element.localName)).toEqual(["ol", "ol", "p"])
      expect(document.body.firstElementChild!.querySelector("ul")).not.toBeNull()
      expect(document.body.lastElementChild).toBe(selected[2])
      expect($.selectedElements).toEqual(Array.from(document.body.children))
      expect(editor.features.list.setListType("ul", scopes)).toBe(2)
      expect($.selectedElements).toEqual(Array.from(document.body.children))
    }
    finally { editor.setDocumentLayout("document", "canvas") }
  })

  it("shares list type changes and supports undo and redo without editor artifacts", async () => {
    document.body.innerHTML = '<ul class="authored"><li>A</li></ul>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectElement(document.body.firstElementChild!)
    editor.features.list.setListType("ol", [{localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"}])
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(editor.doc.body.toString()).toContain('<ol class="authored"><li>A</li></ol>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<ul class="authored"><li>A</li></ul>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<ol class="authored"><li>A</li></ol>')
  })

  it("supports menu as a bulleted list type", () => {
    editor.features.list.toggleList("menu")

    expect(cleanHTML()).toBe("<menu></menu>")
    expect($.anchor).toBe(document.querySelector("menu"))
    expect(editor.features.list.getState().type).toBe("menu")
  })

  it("inserts an empty authored list and paints its first item from the body shadow root", () => {
    editor.features.list.toggleList("ul")

    expect(cleanHTML()).toBe("<ul></ul>")
    expect($.anchor).toBe(document.querySelector("ul"))
    expect($.anchorOffset).toBe(0)
    expect(document.body.querySelector(".◆virtual-list-item")).toBeNull()
    expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
      .not.toContain("virtual-list-item-hidden")
  })

  it("uses CSS anchors for the virtual item and releases its target marker when cleared", () => {
    editor.features.list.toggleList("ul")
    const list = document.querySelector("ul")!
    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.style.left).toBe("")
    expect(marker.style.top).toBe("")
    expect(list.classList.contains("◆virtual-list-selected")).toBe(true)

    window.dispatchEvent(new Event("blur"))

    expect(marker.style.left).toBe("")
    expect(marker.style.top).toBe("")
    expect(Array.from(list.classList).some(name => name.startsWith("◆anchor-target-"))).toBe(false)
  })

  it("toggles an empty active list back to the required default paragraph", async () => {
    editor.features.list.toggleList("ul")

    editor.features.list.toggleList("ul")
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(cleanHTML()).toBe("<p></p>")
    expect($.anchor).toBe(document.querySelector("p"))
    expect($.anchorOffset).toBe(0)
  })

  it("materializes the virtual item on text input", () => {
    editor.features.list.toggleList("ul")
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "A",
      bubbles: true,
      cancelable: true,
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<ul><li>A</li></ul>")
    expect($.anchor?.textContent).toBe("A")
    expect($.anchorOffset).toBe(1)
    expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
      .toContain("virtual-list-item-hidden")
    expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
      .not.toMatch(/virtual-list-item-(?:ul|ol|dl)/)
  })

  it("hides the virtual marker when focus leaves the editor", () => {
    editor.features.list.toggleList("ul")
    const marker = editor.appendix.querySelector(".◆virtual-list-item")!
    expect(marker.getAttribute("part")).not.toContain("virtual-list-item-hidden")

    window.dispatchEvent(new Event("blur"))

    expect(marker.getAttribute("part")).toContain("virtual-list-item-hidden")
    expect(document.querySelector("ul")?.classList.contains("◆virtual-list-selected")).toBe(false)
  })

  it("uses the insertion state when an empty paragraph is toggled into a list", () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)

    editor.features.list.toggleList("ul")

    const list = document.querySelector("ul")!
    expect(cleanHTML()).toBe("<ul></ul>")
    expect($.anchor).toBe(list)
    expect($.anchorOffset).toBe(0)
    expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
      .not.toContain("virtual-list-item-hidden")
  })

  it("materializes the virtual item before a modified Enter inserts a break", () => {
    editor.features.list.toggleList("ul")

    keydown("Enter", {altKey: true})

    expect(cleanHTML()).toBe("<ul><li><br><br></li></ul>")
  })

  it("uses Shift+Enter for a soft break instead of creating another list item", () => {
    document.body.innerHTML = "<ul><li>AB</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, 1)

    keydown("Enter", {shiftKey: true})

    expect(cleanHTML()).toBe("<ul><li>A<br>B</li></ul>")
    expect(document.querySelectorAll("li")).toHaveLength(1)
  })

  it("materializes a virtual item before Shift+Enter inserts a soft break", () => {
    editor.features.list.toggleList("ul")

    keydown("Enter", {shiftKey: true})

    expect(cleanHTML()).toBe("<ul><li><br><br></li></ul>")
  })

  it("materializes the virtual item before Alt+Shift+Enter inserts a word break", () => {
    editor.features.list.toggleList("ul")

    keydown("Enter", {altKey: true, shiftKey: true})

    expect(cleanHTML()).toBe("<ul><li><wbr></li></ul>")
  })

  it("uses the primary modifier to split the containing list", () => {
    document.body.innerHTML = '<ol id="steps" start="4"><li>AB</li></ol>'
    $.move(document.querySelector("li")!.firstChild!, 1)

    keydown("Enter", {ctrlKey: true, metaKey: true})

    expect(cleanHTML()).toBe('<ol id="steps" start="4"><li>A</li></ol><ol start="5"><li>B</li></ol>')
  })

  it("uses Enter to create a real empty item, then exits a top-level list", () => {
    document.body.innerHTML = "<ul><li>A</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, -1)

    keydown("Enter")

    const empty = document.querySelectorAll("li")[1]
    expect(cleanHTML()).toBe("<ul><li>A</li><li></li></ul>")
    expect($.anchor).toBe(empty)
    expect($.anchorOffset).toBe(0)
    expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
      .toContain("virtual-list-item-hidden")

    keydown("Enter")

    const paragraph = document.querySelector("ul + p")!
    expect(cleanHTML()).toBe("<ul><li>A</li></ul><p></p>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
  })

  it("keeps a visible empty-item caret after a nonempty item", () => {
    document.body.innerHTML = "<ul><li>A</li></ul>"
    const list = document.querySelector("ul")!
    const item = document.querySelector("li")!
    Object.defineProperty(item, "getBoundingClientRect", {
      value: () => ({left: 80, right: 180, top: 20, bottom: 40, width: 100, height: 20, x: 80, y: 20, toJSON() { return {} }}),
    })
    Object.defineProperty(list, "getBoundingClientRect", {
      value: () => ({left: 20, right: 300, top: 20, bottom: 40, width: 280, height: 20, x: 20, y: 20, toJSON() { return {} }}),
    })
    $.move(item.firstChild!, 1)

    keydown("Enter")
    editor.features.selection.processSelection()

    const empty = document.querySelectorAll("li")[1]
    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect($.anchor).toBe(empty)
    expect(empty.matches(":empty")).toBe(true)
    expect(marker.getAttribute("part")).toContain("virtual-list-item-hidden")
    expect(document.body.classList.contains("◆gap-caret-visible")).toBe(false)
    expect(editor.features.selection.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden")
      .toContain("selection-caret-hidden")
  })

  it("matches the authored marker style for an empty list", async () => {
    document.body.innerHTML = '<ul style="list-style-type: square;"></ul>'
    $.move(document.querySelector("ul")!)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.style.listStyleType).toBe("square")
    expect(marker.getAttribute("value")).toBeNull()
  })

  it("uses the authored start value for an empty ordered list", async () => {
    document.body.innerHTML = '<ol start="4"></ol>'
    $.move(document.querySelector("ol")!)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.getAttribute("value")).toBe("4")
  })

  it("starts an empty reversed ordered list at one", async () => {
    document.body.innerHTML = '<ol reversed></ol>'
    $.move(document.querySelector("ol")!)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.getAttribute("value")).toBe("1")
  })

  it("uses normal gap selections above, between, and after real list items", async () => {
    document.body.innerHTML = "<ul><li>A</li><li>B</li></ul>"
    const list = document.querySelector("ul")!
    for(const offset of [0, 1, 2]) {
      $.move(list, offset)
      document.dispatchEvent(new Event("selectionchange"))
      await Promise.resolve()
      editor.features.selection.processSelection()

      expect(editor.appendix.querySelector(".◆virtual-list-item")?.getAttribute("part"))
        .toContain("virtual-list-item-hidden")
      expect(document.body.classList.contains("◆gap-caret-visible")).toBe(true)
      expect(editor.features.selection.selectionCaret?.getAttribute("part"))
        .not.toContain("selection-caret-hidden")
    }
  })

  it("nests with Tab, leaves the first item in place, and outdents with Shift-Tab", () => {
    document.body.innerHTML = "<ul><li>A</li><li>B</li></ul>"
    const [first, second] = Array.from(document.querySelectorAll("li"))

    $.move(first.firstChild!, -1)
    expect(keydown("Tab").defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<ul><li>A</li><li>B</li></ul>")

    $.move(second.firstChild!, -1)
    const secondText = second.firstChild
    keydown("Tab")
    expect(cleanHTML()).toBe("<ul><li>A<ul><li>B</li></ul></li></ul>")
    expect($.anchor).toBe(secondText)
    expect($.anchorOffset).toBe(1)

    keydown("Tab", {shiftKey: true})
    expect(cleanHTML()).toBe("<ul><li>A</li><li>B</li></ul>")
    expect($.anchor).toBe(secondText)
    expect($.anchorOffset).toBe(1)
  })

  it.each(["ul", "ol", "menu"])("splits %s text and inline marks at the caret", type => {
    document.body.innerHTML = `<${type}><li id="original" class="authored"><b>Hello World</b><!--keep--><my-widget></my-widget></li></${type}>`
    const widget = document.querySelector("my-widget")!
    $.move(document.querySelector("b")!.firstChild!, 6)
    keydown("Enter")
    expect(cleanHTML()).toBe(`<${type}><li id="original" class="authored"><b>Hello </b></li><li class="authored"><b>World</b><!--keep--><my-widget></my-widget></li></${type}>`)
    expect(document.querySelectorAll("li")[1].querySelector("my-widget")).toBe(widget)
    expect($.anchor?.textContent).toBe("World")
    expect($.anchorOffset).toBe(0)
  })

  it("splits converted paragraph items through their wrappers on Enter and beforeinput", () => {
    for(const input of ["keydown", "beforeinput"]) {
      document.body.innerHTML = '<ol type="a"><li><p><em>Hello World</em></p><p>Next paragraph</p></li><li>Last</li></ol>'
      $.move(document.querySelector("em")!.firstChild!, 6)
      const event = input === "keydown" ? keydown("Enter")
        : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})
      if(input === "beforeinput") document.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(cleanHTML()).toBe('<ol type="a"><li><p><em>Hello </em></p></li><li><p><em>World</em></p><p>Next paragraph</p></li><li>Last</li></ol>')
      expect($.anchor?.textContent).toBe("World")
    }
  })

  it("replaces a backward text selection before splitting and exits an empty wrapped item", () => {
    document.body.innerHTML = '<ul><li><p>Hello dear World</p></li></ul>'
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 11, text, 6)
    keydown("Enter")
    expect(cleanHTML()).toBe('<ul><li><p>Hello </p></li><li><p>World</p></li></ul>')
    document.body.innerHTML = '<ul><li><p><br></p></li></ul>'
    $.move(document.querySelector("p")!, 0)
    keydown("Enter")
    expect(cleanHTML()).toBe('<p></p>')
  })

  it.each([false, true])("nests and outdents every text-selected item (backward: %s)", backward => {
    document.body.innerHTML = '<ol type="a"><li>A</li><li><p>B</p></li><li><b>C</b></li><li>D</li></ol>'
    const b = document.querySelector("p")!.firstChild!, c = document.querySelector("b")!.firstChild!
    backward ? $.selectRange(c, 1, b, 0) : $.selectRange(b, 0, c, 1)
    keydown("Tab")
    expect(cleanHTML()).toBe('<ol type="a"><li>A<ol type="a"><li><p>B</p></li><li><b>C</b></li></ol></li><li>D</li></ol>')
    expect($.anchor).toBe(backward ? c : b)
    expect($.focus).toBe(backward ? b : c)
    keydown("Tab", {shiftKey: true})
    expect(cleanHTML()).toBe('<ol type="a"><li>A</li><li><p>B</p></li><li><b>C</b></li><li>D</li></ol>')
  })

  it("nests item ranges anchored on the list without CSS indentation", () => {
    document.body.innerHTML = '<ul><li>A</li><!--keep--><li>B</li><li>C</li><li>D</li></ul>'
    const list = document.querySelector("ul")!
    $.selectRange(list, 2, list, 4)
    keydown("Tab")
    expect(cleanHTML()).toBe('<ul><li>A<ul><li>B</li><li>C</li></ul></li><!--keep--><li>D</li></ul>')
    keydown("Tab", {shiftKey: true})
    expect(Array.from(list.querySelectorAll(":scope > li"), item => item.textContent)).toEqual(["A", "B", "C", "D"])
    expect(list.querySelector("[style]")).toBeNull()
    expect(list.innerHTML).toContain("<!--keep-->")
  })

  it("keeps existing descendant lists at their depth when their parent is indented", () => {
    document.body.innerHTML = '<ul><li>A</li><li>B<ul id="children" class="authored"><!--keep--><li>C<ul><li>D</li></ul></li></ul></li></ul>'
    const children = document.querySelector("#children")!, c = children.querySelector("li")!
    $.move(document.querySelectorAll("li")[1].firstChild!, 1)
    keydown("Tab")
    expect(cleanHTML()).toBe('<ul><li>A<ul id="children" class="authored"><li>B</li><!--keep--><li>C<ul><li>D</li></ul></li></ul></li></ul>')
    expect(document.querySelector("#children")).toBe(children)
    expect(c.parentElement).toBe(children)
    expect($.anchor?.textContent).toBe("B")
  })

  it("retains descendant containers beside existing sublists while nesting multiple parents", () => {
    document.body.innerHTML = '<ul><li>A<ul><li>X</li></ul></li><li>B<ol id="children" type="a"><li>C</li></ol></li><li>D</li></ul>'
    const list = document.querySelector("ul")!
    $.selectRange(list, 1, list, 3)
    editor.features.list.actions.indentListItems({type: "indentListItems"})
    expect(cleanHTML()).toBe('<ul><li>A<ul><li>X</li><li>B</li></ul><ol id="children" type="a"><li>C</li></ol><ul><li>D</li></ul></li></ul>')
  })

  it("outdents a selected run in order, retaining following items as descendants", () => {
    document.body.innerHTML = '<ul><li>A<ul><!--keep--><li>B</li><li>C</li><li>D</li></ul></li><li>E</li></ul>'
    const inner = document.querySelector("ul ul")!
    $.selectRange(inner, 1, inner, 3)
    editor.features.list.actions.outdentListItems({type: "outdentListItems"})
    expect(cleanHTML()).toBe('<ul><li>A<ul><!--keep--></ul></li><li>B</li><li>C<ul><li>D</li></ul></li><li>E</li></ul>')
  })

  it("excludes an item touched only by the selection's ending text boundary", () => {
    document.body.innerHTML = '<ul><li>A</li><li>B</li><li><b>C</b></li></ul>'
    const items = Array.from(document.querySelectorAll("li"))
    $.selectRange(items[1].firstChild!, 0, items[2].firstChild!.firstChild!, 0)
    keydown("Tab")
    expect(cleanHTML()).toBe('<ul><li>A<ul><li>B</li></ul></li><li><b>C</b></li></ul>')
  })

  it("resolves selections inside wrapped nested lists without moving their ancestor item", () => {
    document.body.innerHTML = '<ul><li>A<div title="keep"><ul><li>B</li><li>C</li></ul></div></li><li>D</li></ul>'
    const list = document.querySelector("div ul")!, ancestor = document.querySelector("body > ul > li")!
    $.selectRange(list.querySelector("li + li")!.firstChild!, 0, list.querySelector("li + li")!.firstChild!, 1)
    keydown("Tab")
    expect(list.querySelector("li > ul > li")?.textContent).toBe("C")
    expect(ancestor.parentElement).toBe(document.querySelector("body > ul"))
    expect(document.querySelector("div")?.getAttribute("title")).toBe("keep")
    keydown("Tab", {shiftKey: true})
    keydown("Tab", {shiftKey: true})
    expect(Array.from(document.querySelector("body > ul")!.children, item => item.textContent)).toEqual(["AB", "C", "D"])
    expect(document.querySelector("div")?.getAttribute("title")).toBe("keep")
  })

  it("preserves disjoint element selections while indenting their owning items", () => {
    document.body.innerHTML = '<ul><li>A</li><li><p>B</p></li><li>C</li><li><p>D</p></li></ul>'
    editor.setDocumentLayout("canvas", "document")
    try {
      const paragraphs = Array.from(document.querySelectorAll("p"))
      $.selectElements(paragraphs)
      editor.features.list.indentItems()
      expect(document.querySelectorAll("body > ul > li > ul > li")).toHaveLength(2)
      expect($.selectedElements).toEqual(paragraphs)
    }
    finally { editor.setDocumentLayout("document", "canvas") }
  })

  it("splits an explicitly numbered item without copying its number override", () => {
    document.body.innerHTML = '<ol type="a"><li value="7">AB</li></ol>'
    $.move(document.querySelector("li")!.firstChild!, 1)
    keydown("Enter")
    expect(cleanHTML()).toBe('<ol type="a"><li value="7">A</li><li>B</li></ol>')
  })

  it("handles whole-list selections and first-item runs without paragraph indentation", () => {
    document.body.innerHTML = '<ul><li><p>A</p></li><li><p>B</p></li></ul>'
    const list = document.querySelector("ul")!, before = cleanHTML()
    $.selectElement(list)
    expect(keydown("Tab").defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe(before)
    $.selectRange(list, 0, list, 2)
    keydown("Tab")
    expect(cleanHTML()).toBe(before)
  })

  it("ignores list-like widget internals and uses replacement items from the current DOM", () => {
    document.body.innerHTML = '<my-widget><ul><li>A</li><li>B</li></ul></my-widget><ul><li>C</li><li>D</li></ul>'
    $.move(document.querySelector("my-widget li + li")!.firstChild!)
    editor.features.list.indentItems()
    expect(document.querySelector("my-widget ul ul")).toBeNull()
    const list = document.querySelector("body > ul")!
    list.lastElementChild!.outerHTML = '<li><b>Replacement</b></li>'
    $.move(list.querySelector("b")!.firstChild!, 3)
    editor.features.list.indentItems()
    expect(list.querySelector("ul b")?.textContent).toBe("Replacement")
    expect($.anchorOffset).toBe(3)
  })

  it("uses the current predecessor after a remote insertion and keeps that remote edit on undo", async () => {
    document.body.innerHTML = '<ul><li>A</li><li id="local">B</li></ul>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.move(document.querySelector("#local")!.firstChild!, 1)
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const list = sharedDOMBody(remote).get(0) as Y.XmlElement
      const inserted = new Y.XmlElement("li")
      inserted.insert(0, [new Y.XmlText("Remote")])
      remote.transact(() => list.insert(1, [inserted]))
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      await new Promise<void>(resolve => setTimeout(resolve))
      // Re-read the editing point just as the host selection bridge does.
      $.move(document.querySelector("#local")!.firstChild!, 1)
      editor.features.list.indentItems()
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      expect(cleanHTML()).toBe('<ul><li>A</li><li>Remote<ul><li id="local">B</li></ul></li></ul>')
      editor.doc.undo()
      await Promise.resolve()
      expect(cleanHTML()).toBe('<ul><li>A</li><li>Remote</li><li id="local">B</li></ul>')
    }
    finally { remote.destroy() }
  })

  it("shares item nesting and splitting with undo and redo without editor artifacts", async () => {
    document.body.innerHTML = '<ol type="a"><li>A</li><li><p>Hello World</p></li><li>C</li></ol>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.move(document.querySelector("p")!.firstChild!, 6)
    keydown("Enter")
    editor.features.list.indentItems()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const changed = cleanHTML()
    expect(changed).toContain('<ol type="a"><li><p>World</p></li></ol>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<ol type="a"><li>A</li><li><p>Hello World</p></li><li>C</li></ol>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe(changed)
  })

  it("promotes a nested real empty item by one level with Enter", () => {
    document.body.innerHTML = "<ul><li>A<ul><li>B</li></ul></li></ul>"
    const innerItem = document.querySelector("ul ul li")!
    $.move(innerItem.firstChild!, -1)

    keydown("Enter")

    keydown("Enter")

    const promoted = document.querySelector("ul > li + li")!
    expect($.anchor).toBe(promoted)
    expect($.anchorOffset).toBe(0)
    expect(promoted.matches(":empty")).toBe(true)
    expect(cleanHTML()).toBe("<ul><li>A<ul><li>B</li></ul></li><li></li></ul>")

    keydown("Enter")
    const paragraph = document.querySelector("ul + p")!
    expect(cleanHTML()).toBe("<ul><li>A<ul><li>B</li></ul></li></ul><p></p>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
  })

  it("nests and outdents a newly inserted real empty item without losing its caret", () => {
    document.body.innerHTML = "<ul><li>A</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, 1)

    keydown("Enter")
    const empty = document.querySelectorAll("li")[1]
    keydown("Tab")
    expect(cleanHTML()).toBe("<ul><li>A<ul><li></li></ul></li></ul>")
    expect($.anchor).toBe(empty)
    expect($.anchorOffset).toBe(0)

    keydown("Tab", {shiftKey: true})
    expect(cleanHTML()).toBe("<ul><li>A</li><li></li></ul>")
    expect($.anchor).toBe(empty)
    expect($.anchorOffset).toBe(0)
  })

  it("splits a top-level list when an empty item exits between real items", () => {
    document.body.innerHTML = "<ul><li>A</li><li>B</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, 1)

    keydown("Enter")
    expect(cleanHTML()).toBe("<ul><li>A</li><li></li><li>B</li></ul>")
    keydown("Enter")

    const paragraph = document.querySelector("ul + p")!
    expect(cleanHTML()).toBe("<ul><li>A</li></ul><p></p><ul><li>B</li></ul>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
  })

  it("preserves ordered numbering and does not duplicate an id when exiting mid-list", () => {
    document.body.innerHTML = '<ol id="steps" start="4"><li>A</li><li>B</li></ol>'
    $.move(document.querySelector("li")!.firstChild!, 1)

    keydown("Enter")
    document.querySelector("ol")!.classList.add("authored", "◆temporary")
    keydown("Enter")

    expect(cleanHTML()).toBe('<ol id="steps" start="4" class="authored"><li>A</li></ol><p></p><ol start="6" class="authored"><li>B</li></ol>')
    expect(document.querySelectorAll("#steps")).toHaveLength(1)
    expect(document.querySelectorAll("ol")[1].classList.contains("◆temporary")).toBe(false)
  })

  it("keeps attribution only on the original list when Enter creates a trailing list", () => {
    document.body.innerHTML = '<ol data-ww-license="MIT" data-ww-attribution-name="Ada" data-other="keep"><li>A</li><li data-ww-license="CC0-1.0">B</li></ol>'
    editor.doc.syncFromDOM()
    const moved = document.querySelectorAll("li")[1]
    $.move(document.querySelector("li")!.firstChild!, 1)
    keydown("Enter")
    keydown("Enter")
    const [left, right] = document.querySelectorAll("ol")
    expect(left.getAttribute("data-ww-license")).toBe("MIT")
    expect(left.getAttribute("data-ww-attribution-name")).toBe("Ada")
    expect(right.hasAttribute("data-ww-license")).toBe(false)
    expect(right.hasAttribute("data-ww-attribution-name")).toBe(false)
    expect(right.getAttribute("data-other")).toBe("keep")
    expect(right.firstElementChild).toBe(moved)
    expect(moved.hasAttribute("data-ww-license")).toBe(false)
  })

  it("replaces an entirely empty list with a paragraph when Enter exits it", () => {
    editor.features.list.toggleList("ul")

    keydown("Enter")

    const paragraph = document.querySelector("p")!
    expect(cleanHTML()).toBe("<p></p>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
  })

  it("uses the same paragraph exit for insertParagraph beforeinput", () => {
    editor.features.list.toggleList("ol")
    const event = new InputEvent("beforeinput", {
      inputType: "insertParagraph", bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    const paragraph = document.querySelector("p")!
    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<p></p>")
    expect($.anchor).toBe(paragraph)
  })

  it("removes an empty description pair and exits into a paragraph", () => {
    document.body.innerHTML = "<dl><dt>Term</dt><dd>Meaning</dd></dl>"
    $.move(document.querySelector("dd")!.firstChild!, -1)
    keydown("Enter")

    keydown("Enter")

    const paragraph = document.querySelector("dl + p")!
    expect(cleanHTML()).toBe("<dl><dt>Term</dt><dd>Meaning</dd></dl><p></p>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
  })

  it("wraps one or more selected text blocks as list items", () => {
    document.body.innerHTML = "<p>A</p><h2>B</h2>"
    $.selectRange(document.body, 0, document.body, 2)

    editor.features.list.toggleList("ol")

    expect(cleanHTML()).toBe('<ol><li><p>A</p></li><li><p id="b">B</p></li></ol>')
  })

  it.each(["ul", "ol"] as const)("keeps Backspace inside a converted %s item after its paragraph becomes empty", type => {
    document.body.innerHTML = "<p>One</p><p>Two</p><p>Three</p>"
    $.selectRange(document.body, 0, document.body, 3)
    editor.features.list.toggleList(type)
    const items = Array.from(document.querySelectorAll("li"))
    const text = items[2].querySelector("p")!.firstChild!
    $.selectRange(text, 0, text, text.textContent!.length)
    keydown("Backspace")

    keydown("Backspace")

    expect(items[2].childNodes).toHaveLength(0)
    expect($.anchor).toBe(items[2])
    expect($.anchorOffset).toBe(0)
    keydown("Backspace")
    expect(cleanHTML()).toBe(`<${type}><li><p>One</p></li><li><p>Two</p></li></${type}>`)
    expect($.anchor).toBe(items[1])
    expect($.anchorOffset).toBe(items[1].childNodes.length)
  })

  it("keeps the former paragraph offset beside an out-of-flow widget", () => {
    document.body.innerHTML = '<ul><li><test-widget style="position: absolute"></test-widget><p></p></li></ul>'
    const item = document.querySelector("li")!
    const widget = item.firstElementChild!
    $.move(item.querySelector("p")!)

    keydown("Backspace")

    expect(item.firstElementChild).toBe(widget)
    expect(widget.isConnected).toBe(true)
    expect(item.childNodes).toHaveLength(1)
    expect($.anchor).toBe(item)
    expect($.anchorOffset).toBe(1)
  })

  it("shares empty paragraph and bullet deletion and supports undo and redo", async () => {
    document.body.innerHTML = '<ul><!--keep--><li><p>One</p></li><li><p></p></li></ul>'
    $.move(document.querySelectorAll("p")[1])
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    keydown("Backspace")
    keydown("Backspace")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    expect(cleanHTML()).toBe('<ul><!--keep--><li><p>One</p></li></ul>')
    expect(editor.doc.body.toString()).toContain('<li><p>One</p></li></ul>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<ul><!--keep--><li><p>One</p></li><li><p></p></li></ul>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<ul><!--keep--><li><p>One</p></li></ul>')
  })

  it("switches the active list type without losing item content", () => {
    document.body.innerHTML = "<ul><li><p>A</p></li></ul>"
    const text = document.querySelector("p")!.firstChild!
    $.move(text, 1)

    editor.features.list.toggleList("ol")

    expect(cleanHTML()).toBe("<ol><li><p>A</p></li></ol>")
    expect(editor.features.list.getState().type).toBe("ol")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
  })

  it("sustains an empty-item caret while switching to a description list", () => {
    document.body.innerHTML = "<ul><li></li></ul>"
    const oldItem = document.querySelector("li")!
    $.move(oldItem)

    editor.features.list.toggleList("dl")

    const term = document.querySelector("dt")!
    expect(cleanHTML()).toBe("<dl><dt></dt></dl>")
    expect($.anchor).toBe(term)
    expect($.anchorOffset).toBe(0)
  })

  it("sustains a cross-item text selection while switching list type", () => {
    document.body.innerHTML = "<ul><li>Alpha</li><li>Beta</li></ul>"
    const [alpha, beta] = Array.from(document.querySelectorAll("li"), item => item.firstChild!)
    $.selectRange(alpha, 2, beta, 3)

    editor.features.list.toggleList("ol")

    expect(cleanHTML()).toBe("<ol><li>Alpha</li><li>Beta</li></ol>")
    expect($.anchor).toBe(alpha)
    expect($.anchorOffset).toBe(2)
    expect($.focus).toBe(beta)
    expect($.focusOffset).toBe(3)
  })

  it("sustains the virtual position while switching an empty list type", () => {
    editor.features.list.toggleList("ul")

    editor.features.list.toggleList("ol")

    const list = document.querySelector("ol")!
    expect(cleanHTML()).toBe("<ol></ol>")
    expect($.anchor).toBe(list)
    expect($.anchorOffset).toBe(0)
    expect(editor.features.list.isVirtualSelection).toBe(true)
  })

  it("toggles only the active item out of a list", () => {
    document.body.innerHTML = "<ul><li><p>A</p></li><li><p>B</p></li></ul>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    editor.features.list.toggleList("ul")

    expect(cleanHTML()).toBe("<p>A</p><ul><li><p>B</p></li></ul>")
  })

  it("authors list marker configuration as an inline style", () => {
    document.body.innerHTML = "<ol><li>A</li></ol>"
    $.move(document.querySelector("li")!.firstChild!, 1)

    editor.features.list.setListStyle("ol", "upper-roman")

    expect(cleanHTML()).toBe('<ol style="list-style-type: upper-roman;"><li>A</li></ol>')
    expect(editor.features.list.getState()).toEqual({
      type: "ol",
      style: "upper-roman",
      ordered: {start: "", reversed: false, numbering: "", itemValue: ""},
    })
  })

  it("edits native ordered-list and direct item numbering without normalizing the list", () => {
    document.body.innerHTML = '<ol data-origin="remote"><li>A</li><li><span>B</span></li><div>preserve</div></ol>'
    const text = document.querySelector("span")!.firstChild!
    $.move(text, 1)

    editor.features.list.setOrderedListAttribute("start", "4")
    editor.features.list.setOrderedListAttribute("reversed", "")
    editor.features.list.setOrderedListAttribute("type", "I")
    editor.features.list.setOrderedListItemValue("9")

    expect(cleanHTML()).toBe('<ol data-origin="remote" start="4" reversed="" type="I"><li>A</li><li value="9"><span>B</span></li><div>preserve</div></ol>')
    expect(editor.features.list.getState()).toEqual({
      type: "ol",
      style: "",
      ordered: {start: "4", reversed: true, numbering: "I", itemValue: "9"},
    })

    editor.features.list.setOrderedListAttribute("start", null)
    editor.features.list.setOrderedListAttribute("reversed", null)
    editor.features.list.setOrderedListAttribute("type", null)
    editor.features.list.setOrderedListItemValue(null)

    expect(cleanHTML()).toBe('<ol data-origin="remote"><li>A</li><li><span>B</span></li><div>preserve</div></ol>')
  })

  it("does not expose or change an outer item override from a nested ordered list", () => {
    document.body.innerHTML = '<ol><li value="8">Outer<ol start="2"><li>Inner</li></ol></li></ol>'
    $.move(document.querySelector("ol ol li")!.firstChild!, 2)

    expect(editor.features.list.getState().ordered).toEqual({
      start: "2", reversed: false, numbering: "", itemValue: "",
    })
    editor.features.list.setOrderedListItemValue("3")

    expect(cleanHTML()).toBe('<ol><li value="8">Outer<ol start="2"><li value="3">Inner</li></ol></li></ol>')
  })

  it("alternates description terms and descriptions as virtual items materialize", () => {
    editor.features.list.toggleList("dl")
    document.body.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertText", data: "Term", bubbles: true, cancelable: true,
    }))
    keydown("Enter")
    const description = document.querySelector("dd")!
    expect($.anchor).toBe(description)
    const meaning = document.createTextNode("Meaning")
    description.append(meaning)
    $.move(meaning, meaning.length)
    document.dispatchEvent(new InputEvent("input", {
      inputType: "insertText", data: "Meaning", bubbles: true,
    }))

    expect(cleanHTML()).toBe("<dl><dt>Term</dt><dd>Meaning</dd></dl>")
    expect(editor.schema.isContentValid(document.querySelector("dl")!)).toBe(true)
  })

  it("previews a description-list insertion as a Term and Description pair", () => {
    editor.features.list.toggleList("dl")

    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    expect(marker.querySelector(".◆virtual-list-placeholder")?.textContent).toBe("Term")
    expect(marker.querySelector(".◆virtual-list-placeholder-secondary")?.textContent).toBe("Description")
    expect(marker.querySelector(".◆virtual-list-caret")).not.toBeNull()
    expect(document.body.classList.contains("◆gap-caret-visible")).toBe(false)
  })

  it("keeps a real empty description placeholder after a term is entered", () => {
    editor.features.list.toggleList("dl")
    document.body.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertText", data: "Term", bubbles: true, cancelable: true,
    }))

    const marker = editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")!
    const description = document.querySelector("dd")!
    expect(cleanHTML()).toBe("<dl><dt>Term</dt><dd></dd></dl>")
    expect(description.matches(":empty")).toBe(true)
    expect(marker.getAttribute("part")).toContain("virtual-list-item-hidden")
  })

  it("creates a real empty Term and Description pair after a completed pair", () => {
    document.body.innerHTML = "<dl><dt>Term</dt><dd>Meaning</dd></dl>"
    const description = document.querySelector("dd")!
    $.move(description.firstChild!, -1)

    keydown("Enter")

    const items = Array.from(document.querySelectorAll("dt, dd"))
    expect(cleanHTML()).toBe("<dl><dt>Term</dt><dd>Meaning</dd><dt></dt><dd></dd></dl>")
    expect($.anchor).toBe(items[2])
    expect(items[2].matches(":empty")).toBe(true)
    expect(items[3].matches(":empty")).toBe(true)
  })

  it("restores term and description placeholders when either authored item becomes empty", async () => {
    document.body.innerHTML = "<dl><dt>Term</dt><dd>Description</dd></dl>"
    const term = document.querySelector("dt")!
    const description = document.querySelector("dd")!
    term.replaceChildren()
    $.move(term)
    document.dispatchEvent(new InputEvent("input", {
      inputType: "deleteContentBackward", bubbles: true,
    }))
    await Promise.resolve()

    expect(term.matches(":empty")).toBe(true)
    expect(description.textContent).toBe("Description")
    expect($.anchor).toBe(term)

    description.replaceChildren()
    $.move(description)
    document.dispatchEvent(new InputEvent("input", {
      inputType: "deleteContentBackward", bubbles: true,
    }))
    await Promise.resolve()
    expect(description.matches(":empty")).toBe(true)
    expect(term.matches(":empty")).toBe(true)
  })

  it("wraps selected blocks into description term/description pairs", () => {
    document.body.innerHTML = "<p>One</p><p>First</p><p>Two</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, 4)

    editor.features.list.toggleList("dl")

    expect(cleanHTML()).toBe("<dl><dt><p>One</p></dt><dd><p>First</p></dd><dt><p>Two</p></dt><dd><p>Second</p></dd></dl>")
  })

  it("inserts Details with a real editable summary and no UI nodes in the main DOM", () => {
    editor.features.list.insertDetails()

    expect(cleanHTML()).toBe("<details><summary></summary><p></p></details>")
    expect($.anchor).toBe(document.querySelector("summary"))
    expect(document.body.querySelector(".◆editor-only")).toBeNull()
  })

  it("restores a paragraph when the last Details body node is deleted", () => {
    document.body.innerHTML = '<details><summary>Title</summary><p>Body</p></details>'
    editor.doc.syncFromDOM()
    const details = document.querySelector("details")!
    const summary = details.querySelector("summary")!
    details.querySelector("p")!.remove()
    editor.doc.syncFromDOM()

    expect(cleanHTML()).toBe('<details><summary>Title</summary><p></p></details>')
    expect(details.firstElementChild).toBe(summary)
    expect(details.querySelectorAll(":scope > p")).toHaveLength(1)
  })

  it("undoes and redoes deletion of the last Details body node", async () => {
    document.body.innerHTML = '<details><summary>Title</summary><p>Body</p></details>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    document.querySelector("details > p")!.remove()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(cleanHTML()).toBe('<details><summary>Title</summary><p></p></details>')

    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details><summary>Title</summary><p>Body</p></details>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details><summary>Title</summary><p></p></details>')
  })

  it("repairs a remotely emptied Details body while preserving its summary and comments", async () => {
    document.body.innerHTML = '<details><summary title="keep">Title</summary><!--keep--><p>Body</p></details>'
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const details = sharedDOMBody(remote).get(0) as Y.XmlElement
      remote.transact(() => details.delete(details.length - 1, 1))
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      editor.doc.syncFromDOM()
      expect(cleanHTML()).toBe('<details><summary title="keep">Title</summary><!--keep--><p></p></details>')
      expect(editor.doc.body.toString()).toContain('<summary title="keep">Title</summary>')
      expect(editor.doc.body.toString()).toContain('<p></p></details>')
    }
    finally { remote.destroy() }
  })

  it("accepts other Details content and preserves a missing summary", () => {
    document.body.innerHTML = '<details><summary>Title</summary><test-widget></test-widget></details><details><!--keep--></details>'
    editor.doc.syncFromDOM()
    expect(cleanHTML()).toBe('<details><summary>Title</summary><test-widget></test-widget><p></p></details><details><!--keep--><p></p></details>')
  })

  it("restores a direct paragraph even while other Details content remains", () => {
    document.body.innerHTML = '<details><summary>Title</summary><test-widget></test-widget><p>Body</p></details>'
    editor.doc.syncFromDOM()
    document.querySelector("details > p")!.remove()
    editor.doc.syncFromDOM()
    expect(cleanHTML()).toBe('<details><summary>Title</summary><test-widget></test-widget><p></p></details>')
  })

  it("places selected inline content below the summary and opens Details", () => {
    document.body.innerHTML = "<p>before <b>selected</b> after</p>"
    $.selectElement(document.querySelector("b")!)

    editor.features.list.actions.insertDetails({type: "insertDetails"})

    expect(cleanHTML()).toBe('<p>before </p><details open=""><summary></summary><b>selected</b><p></p></details><p> after</p>')
    expect($.anchor).toBe(document.querySelector("summary"))
  })

  it("keeps comments, attributes and atomic widgets in selected Details content", () => {
    const content = '<p title="keep">One <em>two</em></p><!--keep--><test-widget title="widget"><span>Body</span></test-widget>'
    document.body.innerHTML = content + '<p>Outside</p>'
    const outside = document.body.lastElementChild
    $.selectRange(document.body, 0, document.body, 3)

    editor.features.list.insertDetails()

    expect(cleanHTML()).toBe(`<details open=""><summary></summary>${content}</details><p>Outside</p>`)
    expect(document.body.lastElementChild).toBe(outside)
    expect(document.body.querySelector(".◆editor-only")).toBeNull()
  })

  it("shares wrapping a text selection in open Details and supports undo and redo", async () => {
    document.body.innerHTML = "<p>before selected after</p>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 7, text, 15)

    editor.features.list.insertDetails()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    const inserted = '<p>before </p><details open=""><summary></summary>selected<p></p></details><p> after</p>'
    expect(cleanHTML()).toBe(inserted)
    expect(editor.doc.body.toString()).toContain('<details open=""><summary></summary>selected<p></p></details>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe("<p>before selected after</p>")
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe(inserted)
  })

  it("starts typing in a newly inserted summary without a preceding browser input event", () => {
    editor.features.list.insertDetails()
    const summary = document.querySelector("summary")!
    expect($.anchorOffset).toBe(0)

    expect(keydown("H").defaultPrevented).toBe(true)

    expect(cleanHTML()).toBe("<details><summary>H</summary><p></p></details>")
    expect($.anchor).toBe(summary.firstChild)
    expect($.anchorOffset).toBe(1)
    expect($.isTextSelection).toBe(true)
    expect(keydown("i").defaultPrevented).toBe(false)
  })

  it.each(["backward", "forward"] as const)("keeps an empty summary during %s deletion", direction => {
    editor.features.list.insertDetails()
    const summary = document.querySelector("summary")!

    editor.features.manipulation.delete(direction)

    expect(document.querySelector("summary")).toBe(summary)
    expect(cleanHTML()).toBe("<details><summary></summary><p></p></details>")
    expect($.anchor).toBe(summary)
  })

  it.each(["backward", "forward"] as const)("does not merge across the %s edge of summary", direction => {
    document.body.innerHTML = '<details open><summary>Title</summary><p>Body</p></details>'
    const summary = document.querySelector("summary")!
    $.move(summary.firstChild!, direction === "backward" ? 0 : 5)

    editor.features.manipulation.delete(direction)

    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>Body</p></details>')
    expect(document.querySelector("summary")).toBe(summary)
  })

  it("joins the first body paragraph backwards into the summary", () => {
    document.body.innerHTML = '<details open><summary></summary><p>Body</p></details>'
    $.move(document.querySelector("p")!.firstChild!, 0)

    editor.features.manipulation.delete("backward")

    expect(cleanHTML()).toBe('<details open=""><summary>Body</summary><p></p></details>')
    expect($.anchor).toBe(document.querySelector("summary"))
    expect($.anchorOffset).toBe(0)
  })

  it("allows summary text deletion through beforeinput without deleting its element", () => {
    document.body.innerHTML = '<details><summary title="keep">Title</summary><p>Body</p></details>'
    const summary = document.querySelector("summary")!
    $.selectRange(summary.firstChild!, 0, summary.firstChild!, 5)
    const event = new InputEvent("beforeinput", {inputType: "deleteContentBackward", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector("summary")).toBe(summary)
    expect(cleanHTML()).toBe('<details><summary title="keep"></summary><p>Body</p></details>')
  })

  it("repairs missing summaries at local editing boundaries without touching widget internals", async () => {
    document.body.innerHTML = '<details><p>Body</p><!--keep--></details><test-widget><details><p>Owned</p></details></test-widget>'
    await new Promise<void>(resolve => setTimeout(resolve))

    expect(cleanHTML()).toBe('<details><p>Body</p><!--keep--></details><test-widget><details><p>Owned</p></details></test-widget>')
    editor.normalizeSurroundingElements(document.querySelector("details")!)

    expect(cleanHTML()).toBe('<details><summary></summary><p>Body</p><!--keep--></details><test-widget><details><p>Owned</p></details></test-widget>')
    document.querySelector("summary")!.remove()
    await new Promise<void>(resolve => setTimeout(resolve))
    expect(document.querySelector("summary")).toBeNull()
    editor.normalizeSurroundingElements(document.querySelector("details")!)
    expect(document.querySelector("details")!.firstElementChild!.localName).toBe("summary")
  })

  it("clears a native range spanning summary without removing its element or attributes", () => {
    document.body.innerHTML = '<details><summary title="keep">Title</summary><p>Body</p></details>'
    const summary = document.querySelector("summary")!
    const details = summary.parentNode!
    $.selectRange(details, 0, details, 1)

    editor.features.manipulation.delete()

    expect(document.querySelector("summary")).toBe(summary)
    expect(cleanHTML()).toBe('<details><summary title="keep"></summary><p>Body</p></details>')
  })

  it("preserves a collaborative summary removal without authoring another summary", async () => {
    document.body.innerHTML = '<details><summary>Title</summary><p>Body</p></details>'
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const details = sharedDOMBody(remote).get(0) as Y.XmlElement
      remote.transact(() => details.delete(0, 1))
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      await new Promise<void>(resolve => setTimeout(resolve))
      editor.doc.syncFromDOM()

      expect(cleanHTML()).toBe('<details><p>Body</p></details>')
      expect(editor.doc.body.toString()).not.toContain('<summary')
    }
    finally { remote.destroy() }
  })

  it("preserves authored summary placement after a direct insertion or move", async () => {
    document.body.innerHTML = '<details><summary title="keep">Title</summary><p>Body</p><!--keep--></details>'
    const details = document.querySelector("details")!
    const summary = details.querySelector("summary")!
    const paragraph = document.createElement("p")
    paragraph.textContent = "Inserted"
    details.prepend(paragraph)
    await new Promise<void>(resolve => setTimeout(resolve))
    expect(details.firstElementChild).toBe(paragraph)
    details.append(summary)
    await new Promise<void>(resolve => setTimeout(resolve))
    expect(details.lastElementChild).toBe(summary)
    expect(cleanHTML()).toBe('<details><p>Inserted</p><p>Body</p><!--keep--><summary title="keep">Title</summary></details>')
  })

  it("inserts block content below summary when the native caret is before it", () => {
    document.body.innerHTML = '<details open><summary>Title</summary><p>Body</p></details>'
    const details = document.querySelector("details")!
    document.getSelection()!.setPosition(details, 0)

    editor.features.manipulation.insertHTML("<p>Inserted</p>")

    expect(details.firstElementChild!.localName).toBe("summary")
    expect(details.querySelectorAll(":scope > summary")).toHaveLength(1)
    expect(details.textContent).toContain("Inserted")
  })

  it("applies stored formatting to the first summary character", () => {
    editor.features.list.insertDetails()
    editor.features.mark.toggleMark("b")

    keydown("H")

    expect(cleanHTML()).toBe("<details><summary><b>H</b></summary><p></p></details>")
    expect($.anchorOffset).toBe(1)
  })

  it("shares the first summary character and supports undo and redo without editor artifacts", async () => {
    editor.features.list.insertDetails()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    keydown("H")
    editor.features.selection.processSelection()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    expect(editor.doc.body.toString()).toContain("<details><summary>H</summary><p></p></details>")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe("<details><summary></summary><p></p></details>")
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe("<details><summary>H</summary><p></p></details>")
  })

  it.each([
    {isComposing: true}, {metaKey: true}, {ctrlKey: true},
  ])("leaves composition and shortcuts native in an empty summary: %j", init => {
    editor.features.list.insertDetails()

    expect(keydown("h", init).defaultPrevented).toBe(false)
    expect(cleanHTML()).toBe("<details><summary></summary><p></p></details>")
  })

  it("respects cancellation of the initial summary input", () => {
    editor.features.list.insertDetails()
    const summary = document.querySelector("summary")!
    const input = vi.fn()
    summary.addEventListener("beforeinput", event => event.preventDefault(), {once: true})
    summary.addEventListener("input", input)

    keydown("H")

    expect(summary.childNodes).toHaveLength(0)
    expect(input).not.toHaveBeenCalled()
  })

  it("does not insert at a selection changed by an input listener", () => {
    editor.features.list.insertDetails()
    const summary = document.querySelector("summary")!
    const paragraph = document.createElement("p")
    document.body.append(paragraph)
    summary.addEventListener("beforeinput", () => {
      summary.parentElement!.remove()
      $.move(paragraph)
    }, {once: true})

    keydown("H")

    expect(cleanHTML()).toBe("<p></p>")
    expect($.anchor).toBe(paragraph)
  })

  it("does not bootstrap summary text inside an atomic widget", () => {
    document.body.innerHTML = "<test-widget><details><summary></summary></details></test-widget>"
    $.move(document.querySelector("summary")!)

    expect(keydown("H").defaultPrevented).toBe(false)
    expect(document.querySelector("summary")!.childNodes).toHaveLength(0)
  })

  it("opens Details when selection enters content but not when it enters Summary", async () => {
    document.body.innerHTML = "<details><summary>Heading</summary><p>Body</p></details>"
    const details = document.querySelector("details")!
    const summary = document.querySelector("summary")!
    const paragraph = document.querySelector("p")!

    $.move(summary.firstChild!, 2)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()
    expect(details.open).toBe(false)

    $.move(paragraph.firstChild!, 2)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()
    expect(details.open).toBe(true)
  })

  it("only toggles Details over the summary chevron", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const summary = document.querySelector("summary")!
    Object.defineProperty(summary, "getBoundingClientRect", {
      value: () => ({left: 20, right: 220, top: 20, bottom: 40, width: 200, height: 20, x: 20, y: 20, toJSON() { return {} }}),
    })

    const textClick = new MouseEvent("click", {clientX: 120, clientY: 30, bubbles: true, cancelable: true})
    summary.dispatchEvent(textClick)
    const firstCharacterClick = new MouseEvent("click", {clientX: 41, clientY: 30, bubbles: true, cancelable: true})
    summary.dispatchEvent(firstCharacterClick)
    const chevronClick = new MouseEvent("click", {clientX: 25, clientY: 30, bubbles: true, cancelable: true})
    summary.dispatchEvent(chevronClick)

    expect(textClick.defaultPrevented).toBe(true)
    expect(firstCharacterClick.defaultPrevented).toBe(true)
    expect(chevronClick.defaultPrevented).toBe(true)
    expect(document.querySelector("details")!.open).toBe(true)
  })

  it.each(["left", "right"])("uses the current %s-floated theme chevron, including summary padding", side => {
    document.body.innerHTML = '<details><summary style="padding: 10px; border: 2px solid; font-size: 16px"><b>Heading</b></summary></details>'
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    const computedStyle = window.getComputedStyle.bind(window)
    const styles = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      if(element === summary && pseudo === "::after") {
        return {display: "block", backgroundImage: 'url("chevron.svg")', cssFloat: side, width: "16px"} as CSSStyleDeclaration
      }
      return computedStyle(element, pseudo)
    })
    try {
      const clickAt = (clientX: number, target: Element = summary) => {
        const event = new MouseEvent("click", {clientX, clientY: 35, bubbles: true, cancelable: true})
        const wasOpen = summary.parentElement!.hasAttribute("open")
        target.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        return summary.parentElement!.hasAttribute("open") === wasOpen
      }
      expect(clickAt(side === "right" ? 200 : 40)).toBe(false)
      expect(clickAt(side === "right" ? 40 : 200)).toBe(true)
      expect(clickAt(120, summary.querySelector("b")!)).toBe(true)
      expect(clickAt(side === "right" ? 215 : 25)).toBe(true)
      // Removing the icon (e.g. a theme change) restores native marker geometry.
      styles.mockImplementation((element, pseudo) => computedStyle(element, pseudo))
      expect(clickAt(40)).toBe(false)
      expect(clickAt(200)).toBe(true)
    }
    finally {
      styles.mockRestore()
    }
  })

  it("keeps RTL marker activation and non-pointer activation available", () => {
    document.body.innerHTML = '<details><summary style="direction: rtl; padding: 10px">Heading</summary></details>'
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    const markerClick = new MouseEvent("click", {clientX: 205, clientY: 30, bubbles: true, cancelable: true})
    const textClick = new MouseEvent("click", {clientX: 120, clientY: 30, bubbles: true, cancelable: true})
    const activation = new MouseEvent("click", {bubbles: true, cancelable: true})
    summary.dispatchEvent(markerClick)
    expect(document.querySelector("details")!.open).toBe(true)
    summary.dispatchEvent(textClick)
    expect(document.querySelector("details")!.open).toBe(true)
    summary.dispatchEvent(activation)
    expect(document.querySelector("details")!.open).toBe(false)
    expect(markerClick.defaultPrevented).toBe(true)
    expect(textClick.defaultPrevented).toBe(true)
    expect(activation.defaultPrevented).toBe(true)
  })

  it("prevents chevron pointerdown from selecting text and opens at the body start", () => {
    document.body.innerHTML = '<p>Keep this selection</p><details><summary>Heading</summary><p>Body</p></details>'
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 2, text, 7)
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    const down = new PointerEvent("pointerdown", {clientX: 25, clientY: 30, button: 0, bubbles: true, cancelable: true})
    summary.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    summary.dispatchEvent(new MouseEvent("click", {clientX: 25, clientY: 30, detail: 2, bubbles: true, cancelable: true}))
    expect($.anchor).toBe(document.querySelector("details > p"))
    expect($.anchorOffset).toBe(0)
    expect($.isTextSelection).toBe(true)
    expect(document.querySelector("details")!.open).toBe(true)
  })

  it("does not treat clicks above or below the summary as chevron interactions", () => {
    document.body.innerHTML = '<details><summary>Heading</summary></details>'
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    for(const clientY of [10, 70]) {
      const event = new MouseEvent("click", {clientX: 25, clientY, bubbles: true, cancelable: true})
      summary.dispatchEvent(event)
      expect(editor.features.list.isDetailsToggleInteraction(event)).toBe(false)
      expect(document.querySelector("details")!.open).toBe(false)
    }
  })

  it.each(["", "\n  <!-- keep -->\n"])("opens a summary-only disclosure and focuses one empty paragraph (%j)", extra => {
    document.body.innerHTML = `<details><summary>Heading</summary>${extra}</details>`
    const details = document.querySelector("details")!
    const summary = details.querySelector("summary")!
    summary.click()
    const paragraph = details.querySelector("p")!
    expect(details.open).toBe(true)
    expect(paragraph).not.toBeNull()
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(cleanHTML()).toBe(`<details><summary>Heading</summary>${extra}<p></p></details>`)
    summary.click()
    expect(details.open).toBe(false)
    summary.click()
    expect(details.querySelectorAll("p")).toHaveLength(1)
  })

  it.each(["<p></p>", "<test-widget></test-widget>", "Bare text", "<span></span>"])("preserves existing details content: %s", content => {
    document.body.innerHTML = `<details><summary>Heading</summary>${content}</details>`
    const summary = document.querySelector("summary")!
    const existing = summary.nextSibling
    $.move(summary.firstChild!, 2)
    summary.click()
    expect(summary.nextSibling).toBe(existing)
    expect(cleanHTML()).toBe(`<details><summary>Heading</summary>${content}${content.startsWith("<p") ? "" : "<p></p>"}</details>`)
    if(content.startsWith("<test-widget")) {
      expect($.anchor).toBe(summary.parentElement)
      expect($.anchorOffset).toBe(1)
      expect($.isGapSelection).toBe(true)
    }
    else {
      expect($.anchor).toBe(existing)
      expect($.anchorOffset).toBe(0)
    }
  })

  it("opens at the first formatted text element and closes at the summary end", () => {
    document.body.innerHTML = '<p>Outside</p><details><summary><b>Title</b></summary>\n<!--keep--><p><em>Body</em></p><p>Later</p></details>'
    const summary = document.querySelector("summary")!
    const first = document.querySelector("details > p")!
    $.move(document.querySelector("p")!.firstChild!, 3)

    summary.click()

    expect($.anchor).toBe(first)
    expect($.anchorOffset).toBe(0)
    expect($.isTextSelection).toBe(true)
    expect(document.getSelection()!.isCollapsed).toBe(true)
    summary.click()
    expect($.anchor).toBe(summary)
    expect($.anchorOffset).toBe(summary.childNodes.length)
    expect($.isTextSelection).toBe(true)
    expect(document.querySelector("details")!.open).toBe(false)
  })

  it.each(["test-widget", "img", "hr", "ul"])("opens at a gap before a first %s without entering its content", tag => {
    document.body.innerHTML = `<details><summary>Title</summary><!--keep--><${tag}></${tag}><p>Later</p></details>`
    const summary = document.querySelector("summary")!
    const first = summary.nextElementSibling!

    summary.click()

    expect($.anchor).toBe(summary.parentElement)
    expect($.anchorOffset).toBe(Array.from(summary.parentElement!.childNodes).indexOf(first))
    expect($.isGapSelection).toBe(true)
    summary.click()
    expect($.anchor).toBe(summary)
    expect($.anchorOffset).toBe(1)
    expect($.isTextSelection).toBe(true)
  })

  it("rechecks content added between chevron pointerdown and click", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    summary.dispatchEvent(new PointerEvent("pointerdown", {clientX: 25, clientY: 30, bubbles: true, cancelable: true}))
    const widget = document.createElement("test-widget")
    summary.parentElement!.append(widget)
    summary.click()
    expect(summary.nextSibling).toBe(widget)
    expect(document.querySelectorAll("details > p")).toHaveLength(1)
  })

  it("keeps opening an empty disclosure out of the authored document", () => {
    document.body.innerHTML = '<details><summary>Heading</summary></details>'
    $.move(document.querySelector("summary")!.firstChild!, 2)
    editor.doc.syncFromDOM()
    document.querySelector("summary")!.click()
    editor.doc.syncFromDOM()
    expect(document.querySelector("details")!.open).toBe(true)
    expect(editor.doc.body.toString()).toContain('<details><summary>Heading</summary><p></p></details>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(cleanHTML()).toBe('<details><summary>Heading</summary><p></p></details>')
  })

  it("leaves widget shadow interactions inside summaries alone", () => {
    document.body.innerHTML = "<details><summary><test-widget></test-widget></summary></details>"
    const widget = document.querySelector("test-widget")!
    const root = widget.attachShadow({mode: "open"})
    root.innerHTML = "<button>Widget action</button>"
    const event = new MouseEvent("click", {clientX: 120, clientY: 30, bubbles: true, composed: true, cancelable: true})
    root.querySelector("button")!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it("lifts a trailing empty paragraph out of Details and keeps its caret", () => {
    document.body.innerHTML = "<details open><summary>Heading</summary><p>Body</p><p></p></details>"
    const details = document.querySelector("details")!
    const empty = details.querySelectorAll("p")[1]
    $.move(empty)

    expect(editor.schema.isBlock(empty)).toBe(true)
    expect(details.lastElementChild).toBe(empty)
    expect($.anchor).toBe(empty)

    const event = keydown("Enter")

    expect(event.defaultPrevented).toBe(true)
    expect(details.nextElementSibling).toBe(empty)
    expect(cleanHTML()).toBe("<details open=\"\"><summary>Heading</summary><p>Body</p></details><p></p>")
    expect($.anchor).toBe(empty)
    expect($.anchorOffset).toBe(0)
  })

  it("splits Summary content into a paragraph when Enter is before its end", () => {
    document.body.innerHTML = "<details><summary>Heading text</summary></details>"
    const text = document.querySelector("summary")!.firstChild!
    $.move(text, 7)

    expect(keydown("Enter").defaultPrevented).toBe(true)
    const details = document.querySelector("details")!
    expect(cleanHTML()).toBe("<details><summary>Heading</summary><p> text</p><p></p></details>")
    expect(details.querySelectorAll("summary")).toHaveLength(1)
    expect(details.querySelectorAll("p")).toHaveLength(2)
    expect($.anchor).toBe(details.querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(0)
  })

  it.each([false, true])("moves Enter at the Summary end to the first text in Details (open: %s)", open => {
    document.body.innerHTML = `<details${open ? " open" : ""}><summary>Heading</summary><p><b>Body</b></p></details>`
    const details = document.querySelector("details")!
    const summary = details.querySelector("summary")!
    $.move(summary.firstChild!, -1)

    expect(keydown("Enter").defaultPrevented).toBe(true)
    expect(details.open).toBe(true)
    expect($.anchor).toBe(details.querySelector("b")!.firstChild)
    expect($.anchorOffset).toBe(0)
    expect($.isTextSelection).toBe(true)
    expect(cleanHTML()).toBe(`<details${open ? ' open=""' : ""}><summary>Heading</summary><p><b>Body</b></p></details>`)
  })

  it("places a caret in an empty first Details paragraph from the Summary end", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const summaryText = document.querySelector("summary")!.firstChild!
    $.move(summaryText, -1)

    expect(keydown("Enter").defaultPrevented).toBe(true)
    expect(document.querySelector("details")!.open).toBe(true)
    const content = document.querySelector("details > p")!
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect($.anchor).toBe(content)
    expect($.anchorOffset).toBe(0)
    expect($.selectedElement).not.toBe(content)
    expect($.isElementSelection).toBe(false)
    expect(cleanHTML()).toBe("<details><summary>Heading</summary><p></p></details>")

    keydown("Enter")
    expect(document.querySelectorAll("details > p")).toHaveLength(2)
    expect(document.querySelector("details")!.nextElementSibling).toBeNull()
  })

  it("returns from the first Details paragraph to the Summary with Backspace", () => {
    document.body.innerHTML = "<details><summary>Heading</summary><p></p></details>"
    const summary = document.querySelector("summary")!
    const paragraph = document.querySelector("p")!
    $.move(summary.firstChild!, -1)

    keydown("Enter")
    expect($.anchor).toBe(paragraph)
    keydown("Backspace")

    expect($.anchor).toBe(summary)
    expect($.anchorOffset).toBe(1)
    expect(paragraph.isConnected).toBe(true)
    expect(cleanHTML()).toBe("<details><summary>Heading</summary><p></p></details>")
  })

  it("uses a text caret for an empty inline wrapper at the start of Details content", () => {
    document.body.innerHTML = "<details><summary>Heading</summary><p><span></span>Body</p></details>"
    $.move(document.querySelector("summary")!.firstChild!, -1)

    keydown("Enter")

    expect($.anchor).toBe(document.querySelector("span"))
    expect($.anchorOffset).toBe(0)
    expect($.isTextSelection).toBe(true)
    expect($.isElementSelection).toBe(false)
  })

  it("selects a first widget as an element from the Summary end", () => {
    document.body.innerHTML = '<details><summary>Heading</summary><test-widget></test-widget></details>'
    const summary = document.querySelector("summary")!
    $.move(summary.firstChild!, -1)

    expect(keydown("Enter").defaultPrevented).toBe(true)
    expect(document.querySelector("details")!.open).toBe(true)
    expect($.selectedElement).toBe(document.querySelector("test-widget"))
    expect(cleanHTML()).toBe('<details><summary>Heading</summary><test-widget></test-widget><p></p></details>')
  })

  it("redirects insertParagraph at the Summary end into its first content", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const text = document.querySelector("summary")!.firstChild!
    $.move(text, -1)
    const event = new InputEvent("beforeinput", {
      inputType: "insertParagraph", bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector("details")!.open).toBe(true)
    expect(cleanHTML()).toBe("<details><summary>Heading</summary><p></p></details>")
    expect($.anchor).toBe(document.querySelector("details > p"))
    expect(document.getSelection()!.isCollapsed).toBe(true)
  })

  it("splits Summary on insertParagraph before its end", () => {
    document.body.innerHTML = '<details><summary>Heading</summary><p>Body</p></details>'
    const text = document.querySelector("summary")!.firstChild!
    $.move(text, 4)
    const event = new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe('<details><summary>Head</summary><p>ing</p><p>Body</p></details>')
  })

  it("lifts a later empty paragraph even when content follows it", () => {
    document.body.innerHTML = '<details open><summary>Title</summary><p>First</p><p></p><p>Later</p></details>'
    const details = document.querySelector("details")!
    const empty = details.querySelectorAll("p")[1]
    $.move(empty)

    expect(keydown("Enter").defaultPrevented).toBe(true)
    expect(details.nextElementSibling).toBe(empty)
    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>First</p><p>Later</p></details><p></p>')
    expect($.anchor).toBe(empty)
    expect($.anchorOffset).toBe(0)
  })

  it("lifts a later empty paragraph on beforeinput and supports undo and redo", async () => {
    document.body.innerHTML = '<details open><summary>Title</summary><p>First</p><p></p></details>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const empty = document.querySelectorAll("details > p")[1]
    $.move(empty)
    const event = new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})

    document.dispatchEvent(event)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>First</p></details><p></p>')
    expect($.anchor).toBe(empty)

    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>First</p><p></p></details>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>First</p></details><p></p>')
  })

  it("splits the first empty paragraph inside Details", () => {
    document.body.innerHTML = '<details open><summary>Title</summary><p></p><p>Later</p></details>'
    const details = document.querySelector("details")!
    const first = details.querySelector("p")!
    $.move(first)

    keydown("Enter")

    expect(first.parentElement).toBe(details)
    expect(details.querySelectorAll(":scope > p")).toHaveLength(3)
    expect(details.nextElementSibling).toBeNull()
  })

  it("splits text inside a Details paragraph without splitting the Details element", () => {
    document.body.innerHTML = '<details open><summary>Title</summary><p>Before after</p></details>'
    const details = document.querySelector("details")!
    $.move(details.querySelector("p")!.firstChild!, 6)

    keydown("Enter")

    expect(cleanHTML()).toBe('<details open=""><summary>Title</summary><p>Before</p><p> after</p></details>')
    expect(details.nextElementSibling).toBeNull()
  })

  it("splits Details content inside a list item without splitting the list item", () => {
    document.body.innerHTML = '<ol><li><details open><summary>Title</summary><p>Before after</p></details></li></ol>'
    const details = document.querySelector("details")!
    $.move(details.querySelector("p")!.firstChild!, 6)

    keydown("Enter")

    expect(document.querySelectorAll("ol > li")).toHaveLength(1)
    expect(details.querySelectorAll(":scope > p")).toHaveLength(2)
    expect(cleanHTML()).toBe('<ol><li><details open=""><summary>Title</summary><p>Before</p><p> after</p></details></li></ol>')
  })
})


it("excludes positioned blocks and their text descendants from list wrapping", () => {
  document.body.innerHTML = '<p>before</p><aside style="position: fixed"><p>floating</p></aside><p>after</p>'
  const floating = document.querySelector("aside")!
  $.selectRange(document.body, 0, document.body, 3)
  editor.features.list.toggleList("ul")
  expect(floating.parentElement).toBe(document.body)
  expect(floating.innerHTML).toBe("<p>floating</p>")
  expect(Array.from(document.querySelectorAll("li"), node => node.textContent)).toEqual(["before", "after"])
})

it("wraps text blocks selected entirely inside a positioned editing flow", () => {
  document.body.innerHTML = '<p>before</p><aside style="position: fixed"><p>floating</p></aside><p>after</p>'
  const floating = document.querySelector("aside")!
  const before = document.body.firstElementChild
  const paragraph = floating.querySelector("p")!
  const after = document.body.lastElementChild
  $.selectRange(floating, 0, floating, 1)
  editor.features.list.toggleList("ul")

  expect(floating.parentElement).toBe(document.body)
  expect(floating.querySelector("ul > li > p")).toBe(paragraph)
  expect(before?.parentElement).toBe(document.body)
  expect(after?.parentElement).toBe(document.body)
  expect(before?.textContent).toBe("before")
  expect(after?.textContent).toBe("after")
})

it.each(["ul", "ol"] as const)("converts headings to paragraphs when wrapping in %s", type => {
  document.body.innerHTML = '<h2 id="intro" class="authored ◆old">One <b>two</b><!--keep--></h2><p>Other</p>'
  const bold = document.querySelector("b")!
  $.selectRange(document.body, 0, document.body, 2)
  editor.features.list.toggleList(type)
  const paragraph = document.querySelector(`${type} > li > p`)!
  expect(paragraph.id).toBe("intro")
  expect(paragraph.className).toBe("authored")
  expect(paragraph.querySelector("b")).toBe(bold)
  expect(document.querySelector("li h2")).toBeNull()
  expect(cleanHTML()).toContain("<!--keep-->")
})
