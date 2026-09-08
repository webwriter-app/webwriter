// @vitest-environment happy-dom
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest"
import "happy-dom"
import {DOMEditor} from "../domeditor"
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

    expect(cleanHTML()).toBe("<ul><li><br></li></ul>")
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

    expect(cleanHTML()).toBe("<ul><li><br></li></ul>")
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

    expect(cleanHTML()).toBe("<ol><li><p>A</p></li><li><h2>B</h2></li></ol>")
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

    expect(cleanHTML()).toBe("<details><summary></summary></details>")
    expect($.anchor).toBe(document.querySelector("summary"))
    expect(document.body.querySelector(".◆editor-only")).toBeNull()
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

  it("prevents chevron pointerdown and double click from selecting text", () => {
    document.body.innerHTML = '<p>Keep this selection</p><details><summary>Heading</summary><p>Body</p></details>'
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 2, text, 7)
    const summary = document.querySelector("summary")!
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 200, 40))
    const down = new PointerEvent("pointerdown", {clientX: 25, clientY: 30, button: 0, bubbles: true, cancelable: true})
    summary.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    summary.dispatchEvent(new MouseEvent("click", {clientX: 25, clientY: 30, detail: 2, bubbles: true, cancelable: true}))
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(2)
    expect(document.getSelection()!.focusOffset).toBe(7)
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
    expect(cleanHTML()).toBe(`<details open=""><summary>Heading</summary>${extra}<p></p></details>`)
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
    expect(cleanHTML()).toBe(`<details open=""><summary>Heading</summary>${content}</details>`)
    expect($.anchor).toBe(summary.firstChild)
    expect($.anchorOffset).toBe(2)
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
    expect(document.querySelector("details > p")).toBeNull()
  })

  it("undoes and redoes opening an empty disclosure with its new paragraph", async () => {
    document.body.innerHTML = '<details><summary>Heading</summary></details>'
    $.move(document.querySelector("summary")!.firstChild!, 2)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    document.querySelector("summary")!.click()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(editor.doc.body.toString()).toContain('<details open=""><summary>Heading</summary><p></p></details>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details><summary>Heading</summary></details>')
    editor.doc.redo()
    await Promise.resolve()
    expect(cleanHTML()).toBe('<details open=""><summary>Heading</summary><p></p></details>')
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

  it("splits Summary content into a paragraph without ever creating another Summary", () => {
    document.body.innerHTML = "<details><summary>Heading text</summary></details>"
    const text = document.querySelector("summary")!.firstChild!
    $.move(text, 7)

    keydown("Enter")

    const details = document.querySelector("details")!
    expect(cleanHTML()).toBe("<details open=\"\"><summary>Heading</summary><p> text</p></details>")
    expect(details.querySelectorAll("summary")).toHaveLength(1)
    expect(details.querySelectorAll("p")).toHaveLength(1)
    expect($.anchor).toBe(details.querySelector("p")!.firstChild)
    expect($.anchorOffset).toBe(0)
  })

  it("creates the empty first Details content block with a retained caret", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const summaryText = document.querySelector("summary")!.firstChild!
    $.move(summaryText, -1)

    keydown("Enter")

    const content = document.querySelector("details > p")!
    expect(content).not.toBeNull()
    expect(content.matches(":empty")).toBe(true)
    expect($.anchor).toBe(content)
    expect($.anchorOffset).toBe(0)
  })

  it("redirects insertParagraph input in Summary into a paragraph split", () => {
    document.body.innerHTML = "<details><summary>Heading</summary></details>"
    const text = document.querySelector("summary")!.firstChild!
    $.move(text, 4)
    const event = new InputEvent("beforeinput", {
      inputType: "insertParagraph", bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<details open=\"\"><summary>Head</summary><p>ing</p></details>")
    expect(document.querySelectorAll("summary")).toHaveLength(1)
  })
})
