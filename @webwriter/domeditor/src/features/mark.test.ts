// @vitest-environment happy-dom
import {clearPresentationState, setPresentationState} from "../presentation-state.js"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import type {XmlElement, XmlText} from "yjs"
import {excludedMarkNames, markNames, normalizeEditingContent, primaryMarkOptions, standardMarkShortcutNames} from "../marks"
import {$, cloneWithoutEditorMarkers} from "../utility"

const editor = new DOMEditor()
const feature = editor.features.mark

beforeEach(() => {
  document.body.innerHTML = ""
  document.getSelection()?.removeAllRanges()
  document.dispatchEvent(new Event("selectionchange"))
  vi.restoreAllMocks()
})

function setContent(html: string) {
  document.body.innerHTML = html
  return document.body.firstElementChild!
}

function selectText(node: Text, start = 0, end = node.length) {
  $.selectRange(node, start, node, end)
}

const cleanHTML = () => editor.toHTML(true)

describe("MarkFeature DOM state", () => {
  it("wraps selected inline content in a popup while preserving surrounding markup", () => {
    const paragraph = setContent('<p>Before <em>selected <b>words</b></em> after</p>')
    const first = paragraph.querySelector("em")!.firstChild!, last = paragraph.querySelector("b")!.firstChild!
    $.selectRange(first, 0, last, 5)
    expect(feature.insertPopup()).toBe(true)
    const wrapper = paragraph.querySelector("span.ww-popup")!, button = wrapper.querySelector("button")!, popup = paragraph.nextElementSibling!
    expect(popup.matches("div.ww-popup-content[popover]")).toBe(true)
    expect(button.innerHTML).toBe('selected <b>words</b>')
    expect(button.getAttribute("popovertarget")).toBe(popup.id)
    expect(popup.querySelector(":scope > p")?.textContent).toBe("")
    expect(paragraph.textContent).toBe("Before selected words after")
    expect($.anchor).toBe(popup.firstElementChild)
    expect(cleanHTML()).not.toContain("◆")
    expect(cleanHTML()).toContain("<p></p>")
    expect(cleanHTML()).not.toContain("Popup content")
    const parsed = new DOMParser().parseFromString(cleanHTML(), "text/html")
    expect(parsed.querySelector(".ww-popup-content")?.firstElementChild?.localName).toBe("p")
  })

  it("toggles a popup off while retaining its toggle text and surrounding markup", () => {
    const paragraph = setContent('<p>Before <em>selected</em> after</p>')
    selectText(paragraph.querySelector("em")!.firstChild as Text)
    expect(feature.togglePopup()).toBe(true)
    const button = paragraph.querySelector(".ww-popup button")!
    expect(feature.getState().popupActive).toBe(true)
    $.move(button.firstChild!, 3)
    expect(feature.togglePopup()).toBe(true)
    expect(paragraph.textContent).toBe("Before selected after")
    expect(paragraph.querySelector(".ww-popup")).toBeNull()
    expect(document.querySelector(".ww-popup-content")).toBeNull()
    expect(feature.getState().popupActive).toBeUndefined()
  })

  it("refuses links in Popup toggles while allowing them in Popup Content", () => {
    const paragraph = setContent('<p>Before <span class="ww-popup"><button popovertarget="popup-link-test">Toggle</button></span> after</p><div class="ww-popup-content" id="popup-link-test" popover><p>Content</p></div>')
    const toggleText = paragraph.querySelector("button")!.firstChild as Text
    selectText(toggleText)
    expect(feature.getState().allowedMarks).not.toContain("a")
    expect(feature.addMark("a")).toBe(false)
    expect(paragraph.querySelector("button a")).toBeNull()

    $.move(toggleText, 3)
    expect(feature.toggleMark("a")).toBe(false)
    expect(feature.getState().marks).not.toContain("a")

    const content = document.querySelector(".ww-popup-content p")!
    selectText(content.firstChild as Text)
    expect(feature.addMark("a")).toBe(true)
    expect(content.querySelector("a")?.textContent).toBe("Content")
  })

  it("refuses a link selection crossing a Popup toggle", () => {
    const paragraph = setContent('<p>Before <span class="ww-popup"><button popovertarget="popup-link-test">Toggle</button></span> after</p><div class="ww-popup-content" id="popup-link-test" popover><p></p></div>')
    $.selectRange(paragraph.firstChild!, 0, paragraph.lastChild!, 6)
    expect(feature.getState().allowedMarks).not.toContain("a")
    expect(feature.addMark("a")).toBe(false)
    expect(paragraph.querySelector("a")).toBeNull()

    $.move(paragraph, 2)
    expect(feature.toggleMark("a")).toBe(true)
    expect(feature.getState().marks).toContain("a")
  })

  it.each([
    '<p><span class="ww-popup"><button popovertarget="note">Toggle</button></span></p><div class="ww-popup-content" id="note" popover><p>Dialog text</p></div>',
    '<p><span class="ww-popup"><button popovertarget="note">Toggle</button><span id="note" popover>Dialog text</span></span></p>',
  ])("disallows a Popup inside Popup Content", html => {
    setContent(html)
    const content = document.querySelector("[popover]")!
    const text = (content.querySelector("p")?.firstChild ?? content.firstChild) as Text
    selectText(text)
    expect(feature.insertPopup()).toBe(false)
    $.move(text, 3)
    expect(feature.insertPopup()).toBe(false)
    expect(document.querySelectorAll(".ww-popup")).toHaveLength(1)
    expect(document.querySelector(".ww-popup button")?.textContent).toBe("Toggle")
  })

  it("can add, remove, and add a popup again without reselecting its text", () => {
    const paragraph = setContent("<p>Before selected after</p>")
    const text = paragraph.firstChild as Text
    selectText(text, 7, 15)

    expect(feature.togglePopup()).toBe(true)
    expect(paragraph.querySelector(".ww-popup button")?.textContent).toBe("selected")
    expect(feature.togglePopup()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("selected")
    expect(feature.togglePopup()).toBe(true)
    expect(paragraph.querySelector(".ww-popup button")?.textContent).toBe("selected")
  })

  it("reselects nested toggle text when removing a popup inside a table cell", () => {
    setContent("<table><tbody><tr><td>Before <em>selected</em> after</td></tr></tbody></table>")
    const cell = document.querySelector("td")!
    selectText(cell.querySelector("em")!.firstChild as Text)

    expect(feature.togglePopup()).toBe(true)
    expect(feature.togglePopup()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("selected")
    expect(feature.togglePopup()).toBe(true)
    expect(cell.querySelector(".ww-popup button")?.innerHTML).toBe("selected")
    expect(cell.querySelector(".ww-popup-content[popover]")).not.toBeNull()
  })

  it.each(["td", "th"])("keeps popup content inside a %s instead of adding a table column", cellName => {
    const table = setContent(`<table><tbody><tr><${cellName}>Selected</${cellName}><td>Other</td></tr><tr><td>Next</td><td>Cell</td></tr></tbody></table>`) as HTMLTableElement
    const cell = table.rows[0].cells[0]
    selectText(cell.firstChild as Text)

    expect(feature.insertPopup()).toBe(true)
    expect(cell.querySelector(".ww-popup-content[popover]")?.parentElement).toBe(cell)
    expect(Array.from(table.rows[0].children, child => child.localName)).toEqual([cellName, "td"])
    expect(table.rows[0].cells).toHaveLength(2)
    expect(new DOMParser().parseFromString(cleanHTML(), "text/html").querySelector("tr")?.children).toHaveLength(2)
  })

  it("keeps popup content inside a table caption", () => {
    const table = setContent("<table><caption>Selected</caption><tbody><tr><td>Cell</td></tr></tbody></table>") as HTMLTableElement
    const caption = table.caption!
    selectText(caption.firstChild as Text)

    expect(feature.insertPopup()).toBe(true)
    expect(caption.querySelector(".ww-popup-content[popover]")?.parentElement).toBe(caption)
    expect(Array.from(table.children, child => child.localName)).toEqual(["caption", "tbody"])
  })

  it("leaves collapsed, multi-block, and widget-crossing selections unchanged", () => {
    const paragraph = setContent('<p>First <test-widget>widget</test-widget> last</p><p>Other</p>')
    const first = paragraph.firstChild!, last = paragraph.lastChild!, other = document.querySelectorAll("p")[1].firstChild!
    for(const [start, startOffset, end, endOffset] of [[first, 1, first, 1], [first, 0, last, 5], [first, 0, other, 5]] as const) {
      $.selectRange(start, startOffset, end, endOffset)
      const before = cleanHTML()
      expect(feature.insertPopup()).toBe(false)
      expect(cleanHTML()).toBe(before)
    }
  })

  it("keeps adjacent inline popups distinct during mark normalization", () => {
    const paragraph = setContent('<p><span class="ww-popup"><button popovertarget="a">One</button><span id="a" popover>First</span></span><span class="ww-popup"><button popovertarget="b">Two</button><span id="b" popover>Second</span></span></p>')
    normalizeEditingContent(paragraph)
    expect(paragraph.querySelectorAll(":scope > .ww-popup")).toHaveLength(2)
    expect(Array.from(paragraph.querySelectorAll("button"), button => button.getAttribute("popovertarget"))).toEqual(["a", "b"])
  })
  it("ignores selection presentation mutations while refreshing authored formatting", async () => {
    const paragraph = setContent("<p>Text</p>")
    selectText(paragraph.firstChild as Text)
    const flush = () => new Promise(resolve => setTimeout(resolve, 20))
    await flush()
    const post = vi.spyOn(editor, "postMarkState")
    setPresentationState(paragraph, "text-selected")
    setPresentationState(document.body, "graphic-pan-ready")
    await flush()
    expect(post).not.toHaveBeenCalled()
    clearPresentationState(paragraph, "text-selected")
    await flush()
    expect(post).not.toHaveBeenCalled()
    paragraph.classList.add("authored")
    await flush()
    expect(post).toHaveBeenCalled()
    post.mockClear()
    ;(paragraph as HTMLElement).style.fontWeight = "bold"
    await flush()
    expect(post).toHaveBeenCalled()
  })

  it("uses semantic mark independently of background color and preserves nested authored marks", () => {
    const paragraph = setContent('<p><em data-source="remote">one <b>two</b></em> three</p>')
    const first = paragraph.querySelector("em")!.firstChild!
    const second = paragraph.querySelector("b")!.firstChild!
    $.selectRange(first, 0, second, second.textContent!.length)

    expect(feature.toggleMark("mark")).toBe(true)

    expect(cleanHTML()).toBe('<p><em data-source="remote"><mark>one </mark><b><mark>two</mark></b></em> three</p>')
    expect(document.querySelector("mark")?.getAttribute("style")).toBeNull()
    expect(feature.toggleMark("mark")).toBe(true)
    expect(cleanHTML()).toBe('<p><em data-source="remote">one <b>two</b></em> three</p>')
  })

  it("restricts bidirectional override direction to HTML's enumerated values", () => {
    const paragraph = setContent("<p><bdo dir=rtl>Text</bdo></p>")
    selectText(paragraph.querySelector("bdo")!.firstChild as Text)

    expect(feature.setMarkAttribute("bdo", "dir", "ltr")).toBe(true)
    expect(cleanHTML()).toBe('<p><bdo dir="ltr">Text</bdo></p>')
    expect(() => feature.setMarkAttribute("bdo", "dir", "auto")).toThrow(TypeError)
  })
  it("enables text carets and derives their active marks from the DOM", () => {
    let paragraph = setContent("<p>Text</p>")
    const text = paragraph.firstChild as Text
    $.move(text, 2)
    expect(feature.getState()).toEqual({canMark: true, marks: []})

    paragraph = setContent("<p><strong><em>Text</em></strong></p>")
    $.move(paragraph.querySelector("em")!.firstChild!, 2)
    expect(feature.getState()).toEqual({canMark: true, marks: ["b", "i"]})

    paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    expect(feature.getState()).toEqual({canMark: true, marks: []})
  })

  it("enables selections containing editable text and disables gaps and non-editable content", () => {
    let paragraph = setContent("<p>Text</p>")

    $.selectElement(paragraph)
    expect(feature.getState()).toEqual({canMark: true, marks: []})

    paragraph = setContent("<p>A<img alt='x'>B</p>")
    $.selectRange(paragraph, 0, paragraph, 3)
    expect(feature.getState()).toEqual({canMark: true, marks: []})

    document.body.innerHTML = "<p>A</p><p>B</p>"
    $.selectRange(document.querySelector("p")!.firstChild!, 0, document.querySelector("p:last-child")!.firstChild!, 1)
    expect(feature.getState()).toEqual({canMark: true, marks: []})

    $.selectGap(document.querySelector("p")!)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    paragraph = setContent('<p><span contenteditable="false">Text</span></p>')
    $.move(paragraph.querySelector("span")!.firstChild!, 2)
    expect(feature.getState()).toEqual({canMark: false, marks: []})
  })

  it("does not construct widget copies while reading a range state", () => {
    const constructed = vi.fn()
    const tag = "mark-query-widget"
    customElements.define(tag, class extends HTMLElement {
      constructor() {
        super()
        constructed()
      }
    })
    const paragraph = setContent(`<p>before<${tag}>inside</${tag}>after</p>`)
    constructed.mockClear()

    $.selectRange(paragraph.firstChild!, 0, paragraph.lastChild!, paragraph.lastChild!.textContent!.length)

    expect(feature.getState()).toEqual({canMark: true, marks: []})
    expect(constructed).not.toHaveBeenCalled()
  })

  it("finds every supported tag directly from the selected DOM", () => {
    for(const mark of markNames) {
      const paragraph = setContent(`<p><${mark}>Text</${mark}></p>`)
      selectText(paragraph.querySelector(mark)!.firstChild as Text)
      expect(feature.getState()).toEqual({canMark: true, marks: [mark]})
    }
  })

  it("treats strong as bold and em as italic", () => {
    const paragraph = setContent("<p><strong>Strong</strong> <em>emphasis</em></p>")
    $.selectRange(paragraph.querySelector("strong")!.firstChild!, 0, paragraph.querySelector("em")!.firstChild!, 8)

    expect(feature.getState()).toEqual({canMark: true, marks: ["b", "i"]})
  })
  it("allows mark commands when an entire mark wrapper is selected", () => {
    const paragraph = setContent("<p><b>Text</b></p>")
    $.selectElement(paragraph.querySelector("b")!)

    expect(feature.getState()).toEqual({canMark: true, marks: ["b"]})
    expect(feature.removeMark("b")).toBe(true)
    expect(cleanHTML()).toBe("<p>Text</p>")
  })

  it("re-reads externally replaced markup without relying on command history", () => {
    const paragraph = setContent("<p>Text</p>")
    selectText(paragraph.firstChild as Text)
    expect(feature.getState().marks).toEqual([])

    paragraph.innerHTML = "<strong>Text</strong>"
    selectText(paragraph.querySelector("strong")!.firstChild as Text)
    expect(feature.getState().marks).toEqual(["b"])

    paragraph.innerHTML = "<em>Text</em>"
    selectText(paragraph.querySelector("em")!.firstChild as Text)
    expect(feature.getState().marks).toEqual(["i"])
  })
})

describe("MarkFeature toggles", () => {
  it("clears mixed style marks even when no style value is shared by the whole selection", () => {
    const paragraph = setContent('<p><span style="color: red">one</span><span style="color: blue; font-size: 20px">two</span></p>')
    $.selectElement(paragraph)
    expect(feature.getState().marks).toEqual([])
    expect(feature.getStyleState()).toEqual({})

    expect(feature.removeMarks()).toBe(true)

    expect(paragraph.innerHTML).toBe("onetwo")
    expect($.selectedElement).toBe(paragraph)
  })

  it("clears a selected mark wrapping whole blocks without rebuilding the blocks", () => {
    const section = setContent('<section><a href="/link"><p>first</p><!--keep--><p><em>second</em></p></a><p><b>outside</b></p></section>')
    const link = section.querySelector("a")!, paragraphs = Array.from(link.querySelectorAll("p")), comment = link.childNodes[1]
    $.selectElement(link)

    expect(feature.removeMarks()).toBe(true)

    expect(section.innerHTML).toBe('<p>first</p><!--keep--><p>second</p><p><b>outside</b></p>')
    expect(paragraphs.every(paragraph => paragraph.parentElement === section)).toBe(true)
    expect(comment.parentElement).toBe(section)
    expect(document.getSelection()?.toString()).toBe("firstsecond")
  })

  it("clears every selected table cell without clearing the intervening unselected cells", () => {
    setContent('<table><tbody><tr><td><b>one</b></td><td><i>keep</i></td></tr><tr><td><span style="color: red"><u>two</u></span></td><td><s>keep too</s></td></tr></tbody></table>')
    const cells = Array.from(document.querySelectorAll("td"))
    editor.features.table.selectCells(cells[0], cells[2])

    expect(feature.canRemoveMarks).toBe(true)
    expect(feature.removeMarks()).toBe(true)

    expect(cells.map(cell => cell.innerHTML)).toEqual(["one", "<i>keep</i>", "two", "<s>keep too</s>"])
    expect(editor.features.table.selectedCells).toEqual([cells[0], cells[2]])
  })

  it("clears a breadcrumb-selected section instead of the previous text selection", () => {
    const section = setContent('<section><h2><strong>Title</strong></h2><!--keep--><p><a href="/link"><em>Body</em></a></p></section><p><b>Outside</b></p>')
    const outside = document.querySelector("body > p")!
    selectText(outside.querySelector("b")!.firstChild as Text)
    editor.features.selection.selectSectionElement(section)

    expect(feature.canRemoveMarks).toBe(true)
    expect(feature.removeMarks()).toBe(true)

    expect(section.innerHTML).toBe('<h2 id="title">Title</h2><!--keep--><p>Body</p>')
    expect(outside.innerHTML).toBe("<b>Outside</b>")
    expect(editor.features.selection.selectedSectionElement).toBe(section)
  })

  it("clears all separately selected canvas items and preserves their selection", () => {
    document.body.classList.add("ww-canvas")
    try {
      setContent('<p><b>one</b></p><p><i>keep</i></p><p><u>two</u></p>')
      const paragraphs = Array.from(document.querySelectorAll("p"))
      $.selectElements([paragraphs[0], paragraphs[2]])

      expect(feature.canRemoveMarks).toBe(true)
      expect(feature.removeMarks()).toBe(true)

      expect(paragraphs.map(paragraph => paragraph.innerHTML)).toEqual(["one", "<i>keep</i>", "two"])
      expect($.selectedElements).toEqual([paragraphs[0], paragraphs[2]])
    }
    finally {
      document.body.classList.remove("ww-canvas")
      $.clearLayoutRanges()
    }
  })

  it("offers clearing for a nonempty selection without editable text and retires stale selections", () => {
    const paragraph = setContent('<p><opaque-widget><b>owned</b></opaque-widget></p>')
    $.selectElement(paragraph)
    expect(feature.getState().canMark).toBe(false)
    expect(feature.canRemoveMarks).toBe(true)
    expect(feature.removeMarks()).toBe(false)
    expect(paragraph.innerHTML).toBe('<opaque-widget><b>owned</b></opaque-widget>')
    paragraph.remove()
    expect(feature.canRemoveMarks).toBe(false)
    expect(feature.removeMarks()).toBe(false)
  })

  it.each(["<img alt='keep'>", "<br>", "<opaque-widget><i>owned</i></opaque-widget>"])("clears marks around selected non-text content without replacing it: %s", html => {
    const paragraph = setContent(`<p><b>before<i>${html}</i>after</b></p>`)
    const node = paragraph.querySelector("i")!.firstElementChild!
    const original = node.outerHTML
    $.selectElement(node)

    expect(feature.canRemoveMarks).toBe(true)
    expect(feature.removeMarks()).toBe(true)

    expect(node.outerHTML).toBe(original)
    expect(node.parentElement).toBe(paragraph)
    expect(paragraph.innerHTML).toBe(`<b>before</b>${original}<b>after</b>`)
    expect($.selectedElement).toBe(node)
    expect(cleanHTML()).not.toContain("◆")
  })

  it("clears marks from selected text and images across blocks as one undoable edit", () => {
    const section = setContent('<section><p><b>before<img alt="keep"><i>one</i></b></p><!--keep--><p><span style="color: red"><u>two</u><br>after</span></p></section>')
    const first = section.querySelector("b")!.firstChild!, last = section.querySelector("span")!.lastChild!
    const image = section.querySelector("img")!, lineBreak = section.querySelector("br")!
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = cleanHTML()
    $.selectRange(last, 2, first, 3)
    editor.doc.updateLocalSelection()

    expect(feature.removeMarks()).toBe(true)
    editor.doc.syncFromDOM()
    const cleared = '<section><p><b>bef</b>ore<img alt="keep">one</p><!--keep--><p>two<br>af<span style="color: red">ter</span></p></section>'
    expect(cleanHTML()).toBe(cleared)
    expect(section.querySelector("img")).toBe(image)
    expect(section.querySelector("br")).toBe(lineBreak)
    expect(document.getSelection()?.toString()).toBe("oreonetwoaf")
    expect($.isBackwards).toBe(true)
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(cleanHTML()).toBe(original)
    editor.doc.redo()
    expect(cleanHTML()).toBe(cleared)
  })

  it.each([
    '<section><p>Before<em>middle</em></p><!--keep--><ul><li>Item</li><li>After</li></ul></section>',
    '<table><tbody><tr><td>Before</td><td><p>middle</p></td></tr><tr><td colspan="2">After</td></tr></tbody></table>',
    '<main><header>Before</header><article>middle<div><p>After</p></div></article></main>',
    'Before<b>middle</b>After',
  ])("formats all text across structural selections without replacing containers: %s", html => {
    for(const backwards of [false, true]) {
      setContent(html)
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const texts: Text[] = []
      while(walker.nextNode()) texts.push(walker.currentNode as Text)
      const first = texts[0], last = texts.at(-1)!
      const start: [Node, number] = [first, 2], end: [Node, number] = [last, last.length - 1]
      $.selectRange(...(backwards ? end : start), ...(backwards ? start : end))
      const selected = document.getSelection()!.toString()
      const containers = Array.from(document.querySelectorAll("section, p, ul, li, table, tbody, tr, td, main, header, article, div"))
      const comment = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT).nextNode()

      // Mixed selections retain the existing any-active toggle semantics.
      if(feature.getState().marks.includes("b")) expect(feature.toggleMark("b")).toBe(true)
      expect(feature.getState().canMark).toBe(true)
      expect(feature.toggleMark("b")).toBe(true)
      const selectedWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      while(selectedWalker.nextNode()) {
        const node = selectedWalker.currentNode as Text
        if(node.textContent && document.getSelection()!.getRangeAt(0).intersectsNode(node)) expect(node.parentElement!.closest("b")).not.toBeNull()
      }
      expect(feature.setStyleMark("color", "red")).toBe(true)
      expect(feature.getStyleState().color).toBe("red")
      expect(feature.toggleMark("b")).toBe(true)
      expect(feature.getState().marks).not.toContain("b")
      expect(feature.removeMarks()).toBe(true)
      expect(document.getSelection()!.toString()).toBe(selected)
      expect($.isBackwards).toBe(backwards)
      expect(containers.every(node => node.isConnected)).toBe(true)
      if(comment) expect(comment.isConnected).toBe(true)
      expect(cleanHTML()).not.toMatch(/◆|data-domeditor-mark-boundary/)
    }
  })

  it.each(markNames)("toggles %s across all selected blocks", mark => {
    setContent('<section><p>one</p><p>two</p></section>')
    $.selectElement(document.querySelector("section")!)
    expect(feature.toggleMark(mark)).toBe(true)
    expect(Array.from(document.querySelectorAll("p"), node => node.querySelector(mark)?.firstChild?.textContent)).toEqual(["one", "two"])
    expect(feature.toggleMark(mark)).toBe(true)
    expect(cleanHTML()).toBe('<section><p>one</p><p>two</p></section>')
    expect(document.getSelection()!.toString()).toBe("onetwo")
  })

  it("formats every selected run when DOM normalization merges retained text nodes", () => {
    const section = setContent('<section><p></p><p><b>last</b></p></section>')
    const paragraph = section.querySelector("p")!
    paragraph.append(document.createTextNode("first"), document.createTextNode("second"), document.createTextNode("third"))
    $.selectElement(section)
    expect(feature.setStyleMark("color", "red")).toBe(true)
    expect(feature.getStyleState().color).toBe("red")
    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.getState().marks).not.toContain("b")
    expect(feature.toggleMark("b")).toBe(true)
    expect(Array.from(section.querySelectorAll("p"), node => node.querySelector("b")?.textContent)).toEqual(["firstsecondthird", "last"])
    expect(document.getSelection()!.toString()).toBe("firstsecondthirdlast")
  })

  it("formats container selections and skips atomic, non-editable, and non-content text", () => {
    const paragraph = setContent('<p>A<img alt="keep"><opaque-widget><b>widget</b></opaque-widget><span contenteditable="false"><i>locked</i></span><script type="application/json">{"keep":true}</script><em>B</em></p>')
    const untouched = Array.from(paragraph.querySelectorAll("img, opaque-widget, [contenteditable=false], script"))
    const html = untouched.map(node => cloneWithoutEditorMarkers(node, true).outerHTML)
    $.selectElement(paragraph)

    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.setStyleMark("color", "red")).toBe(true)
    expect(feature.getStyleState().color).toBe("red")
    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.removeMarks()).toBe(true)
    expect(untouched.map(node => cloneWithoutEditorMarkers(node, true).outerHTML)).toEqual(html)
    expect(untouched.every(node => node.parentElement === paragraph)).toBe(true)
    expect(paragraph.firstChild!.textContent).toBe("A")
    expect(paragraph.lastChild!.textContent).toBe("B")
  })

  it("marks the current text after selected containers are replaced externally", () => {
    setContent('<section><p>old</p></section>')
    $.selectElement(document.querySelector("section")!)
    document.querySelector("section")!.innerHTML = '<h2>new</h2><p>text</p>'
    $.selectElement(document.querySelector("section")!)
    expect(feature.toggleMark("u")).toBe(true)
    expect(cleanHTML()).toBe('<section><h2 id="new"><u>new</u></h2><p><u>text</u></p></section>')
  })

  it("synchronizes cross-block formatting as one undoable edit", () => {
    setContent('<p>one</p><ul><li>two</li></ul>')
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectRange(document.querySelector("p")!.firstChild!, 1, document.querySelector("li")!.firstChild!, 2)
    editor.doc.updateLocalSelection()
    expect(feature.toggleMark("b")).toBe(true)
    editor.doc.syncFromDOM()
    const formatted = '<p>o<b>ne</b></p><ul><li><b>tw</b>o</li></ul>'
    expect(cleanHTML()).toBe(formatted)
    expect(editor.doc.body.toString()).toBe(`<body>${formatted}</body>`)
    editor.doc.undo()
    expect(cleanHTML()).toBe('<p>one</p><ul><li>two</li></ul>')
    editor.doc.redo()
    expect(cleanHTML()).toBe(formatted)
    expect(document.getSelection()!.toString()).toBe("netw")
  })

  it.each([
    "Before<br>middle<br>After",
    '<em>Before<br>middle</em><!--keep--><br><span>After</span>',
    "Before<br><br>middle<wbr>After",
  ])("formats text across authored line breaks: %s", html => {
    for(const backwards of [false, true]) {
      const paragraph = setContent(`<p>${html}</p>`)
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      const text: Text[] = []
      while(walker.nextNode()) text.push(walker.currentNode as Text)
      const start: [Node, number] = [text[0], 2]
      const end: [Node, number] = [text.at(-1)!, 3]
      $.selectRange(...(backwards ? end : start), ...(backwards ? start : end))
      const selected = document.getSelection()!.toString()
      const breaks = Array.from(paragraph.querySelectorAll("br, wbr"))

      expect(feature.getState().canMark).toBe(true)
      expect($.isTextSelection).toBe(true)
      expect(feature.toggleMark("b")).toBe(true)
      expect(feature.getState().marks).toContain("b")
      expect(feature.setStyleMark("font-size", "24px")).toBe(true)
      expect(feature.getStyleState()["font-size"]).toBe("24px")
      expect(feature.toggleMark("b")).toBe(true)
      expect(feature.getState().marks).not.toContain("b")
      expect(feature.removeMarks()).toBe(true)
      expect(feature.getState().canMark).toBe(true)
      expect($.isTextSelection).toBe(true)
      expect($.isBackwards).toBe(backwards)
      expect(document.getSelection()!.toString()).toBe(selected)
      expect(Array.from(paragraph.querySelectorAll("br, wbr"))).toEqual(breaks)
      expect(paragraph.textContent).toBe("BeforemiddleAfter")
      expect(cleanHTML()).not.toMatch(/◆|data-domeditor-mark-boundary/)
    }
  })

  it("synchronizes multiline marks and supports undo and redo", () => {
    const paragraph = setContent("<p>one<br>two</p>")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectRange(paragraph.firstChild!, 1, paragraph.lastChild!, 2)
    editor.doc.updateLocalSelection()

    expect(feature.toggleMark("b")).toBe(true)
    editor.doc.syncFromDOM()
    const formatted = "<p>o<b>ne</b><br><b>tw</b>o</p>"
    expect(cleanHTML()).toBe(formatted)
    expect(editor.doc.body.toString()).toBe("<body><p>o<b>ne</b><br></br><b>tw</b>o</p></body>")

    editor.doc.undo()
    expect(cleanHTML()).toBe("<p>one<br>two</p>")
    editor.doc.redo()
    expect(cleanHTML()).toBe(formatted)
    expect(feature.getState().canMark).toBe(true)
    expect(document.getSelection()!.toString()).toBe("netw")
  })

  it("individually adds and removes every primary and secondary mark", () => {
    for(const mark of markNames) {
      const paragraph = setContent("<p>Text</p>")
      selectText(paragraph.firstChild as Text)

      expect(feature.toggleMark(mark)).toBe(true)
      expect(cleanHTML()).toBe(mark === "bdo"
        ? '<p><bdo dir="ltr">Text</bdo></p>'
        : mark === "ruby"
          ? "<p><ruby>Text<rt></rt></ruby></p>"
          : `<p><${mark}>Text</${mark}></p>`)
      expect(feature.getState().marks).toEqual([mark])

      expect(feature.toggleMark(mark)).toBe(true)
      expect(cleanHTML()).toBe("<p>Text</p>")
      expect(feature.getState().marks).toEqual([])
    }
  })

  it("creates one ruby base from rich phrasing content with an editable annotation and fallback", () => {
    const paragraph = setContent("<p><em>漢</em>字 example</p>")
    $.selectRange(paragraph.querySelector("em")!.firstChild!, 0, paragraph.childNodes[1], 1)

    expect(feature.createRuby("かんじ", true)).toBe(true)

    expect(cleanHTML()).toBe("<p><ruby><em>漢</em>字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby> example</p>")
    expect(document.getSelection()?.toString()).toBe("漢字")
    expect(feature.getRubyState()).toEqual({
      active: true,
      canCreate: false,
      base: "漢字",
      annotations: [{index: 3, text: "かんじ", hasMarkup: false}],
      fallbacks: [
        {index: 2, text: "(", hasMarkup: false},
        {index: 4, text: ")", hasMarkup: false},
      ],
    })
  })

  it("reads and edits multiple authored rt children without normalizing unrelated ruby DOM", () => {
    const paragraph = setContent('<p><ruby data-source="external">東<rt><em>とう</em></rt><!--keep--><rt>east</rt></ruby></p>')
    selectText(paragraph.querySelector("ruby")!.firstChild as Text)
    const original = cleanHTML()

    let state = feature.getRubyState()
    expect(state.base).toBe("東")
    expect(state.annotations).toEqual([
      {index: 1, text: "とう", hasMarkup: true},
      {index: 3, text: "east", hasMarkup: false},
    ])
    expect(cleanHTML()).toBe(original)

    const first = state.annotations[0]
    paragraph.querySelector("rt")!.textContent = "changed remotely"
    expect(feature.setRubyComponent("rt", first.index, first.text, "ひがし")).toBe(false)
    expect(paragraph.querySelector("rt")?.textContent).toBe("changed remotely")

    state = feature.getRubyState()
    expect(feature.setRubyComponent("rt", state.annotations[0].index, "changed remotely", "ひがし")).toBe(true)
    expect(paragraph.querySelector("rt")?.innerHTML).toBe("ひがし")
    expect(paragraph.querySelector("ruby")?.getAttribute("data-source")).toBe("external")
    expect(Array.from(paragraph.querySelector("ruby")!.childNodes).some(node => node.nodeType === Node.COMMENT_NODE)).toBe(true)
  })

  it("adds, removes, and customizes rt and rp components through guarded live state", () => {
    const paragraph = setContent("<p><ruby>漢<rt>かん</rt></ruby></p>")
    selectText(paragraph.querySelector("ruby")!.firstChild as Text)

    expect(feature.addRubyAnnotation("Chinese")).toBe(true)
    expect(cleanHTML()).toBe("<p><ruby>漢<rt>かん</rt><rt>Chinese</rt></ruby></p>")
    expect(feature.addRubyFallback()).toBe(true)
    expect(cleanHTML()).toBe("<p><ruby>漢<rp>(</rp><rt>かん</rt><rt>Chinese</rt><rp>)</rp></ruby></p>")

    let state = feature.getRubyState()
    expect(feature.setRubyComponent("rp", state.fallbacks[0].index, "(", "[")).toBe(true)
    state = feature.getRubyState()
    expect(feature.removeRubyAnnotation(state.annotations[1].index, "Chinese")).toBe(true)
    expect(cleanHTML()).toBe("<p><ruby>漢<rp>[</rp><rt>かん</rt><rp>)</rp></ruby></p>")
    expect(feature.removeRubyFallback()).toBe(true)
    expect(cleanHTML()).toBe("<p><ruby>漢<rt>かん</rt></ruby></p>")
  })

  it("removes ruby semantics and annotation components while preserving the exact base subtree", () => {
    const paragraph = setContent('<p>Before <ruby class="reading"><strong data-origin="author">漢</strong>字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby> after</p>')
    selectText(paragraph.querySelector("strong")!.firstChild as Text)

    expect(feature.removeRuby()).toBe(true)

    expect(cleanHTML()).toBe('<p>Before <strong data-origin="author">漢</strong>字 after</p>')
    expect(document.getSelection()?.toString()).toBe("漢字")
  })

  it("removes ruby as semantics without leaking annotation text through Remove formatting", () => {
    const paragraph = setContent("<p><ruby><strong>漢</strong><rt>かん</rt></ruby></p>")
    selectText(paragraph.querySelector("strong")!.firstChild as Text)

    expect(feature.removeMarks()).toBe(true)

    expect(cleanHTML()).toBe("<p>漢</p>")
    expect(document.getSelection()?.toString()).toBe("漢")
  })

  it("keeps adjacent ruby sequences independent during generic mark normalization", () => {
    const paragraph = setContent("<p><ruby>漢<rt>かん</rt></ruby><ruby>字<rt>じ</rt></ruby></p>")

    normalizeEditingContent(paragraph)

    expect(paragraph.querySelectorAll("ruby")).toHaveLength(2)
    expect(cleanHTML()).toBe("<p><ruby>漢<rt>かん</rt></ruby><ruby>字<rt>じ</rt></ruby></p>")
  })

  it("treats custom elements and customized built-ins as atomic during mark normalization", () => {
    const paragraph = setContent('<p><demo-widget><b>one</b><b>two</b></demo-widget><b>three</b><b>four</b><b is="demo-widget"><i>five</i><i>six</i></b></p>')

    normalizeEditingContent(paragraph)

    expect(paragraph.innerHTML).toBe('<demo-widget><b>one</b><b>two</b></demo-widget><b>threefour</b><b is="demo-widget"><i>five</i><i>six</i></b>')
  })

  it("does not create nested ruby or combine a selection containing an existing ruby", () => {
    const paragraph = setContent("<p><ruby>漢<rt>かん</rt></ruby>字</p>")
    $.selectRange(paragraph.querySelector("ruby")!.firstChild!, 0, paragraph.lastChild!, 1)

    expect(feature.getRubyState().canCreate).toBe(false)
    expect(feature.createRuby("かんじ", false)).toBe(false)
    expect(document.querySelectorAll("ruby")).toHaveLength(1)
  })

  it("adds a mark across inline boundaries without flattening other markup", () => {
    const paragraph = setContent("<p><i>one</i> two</p>")
    const italicText = paragraph.querySelector("i")!.firstChild as Text
    const plainText = paragraph.lastChild as Text
    $.selectRange(italicText, 1, plainText, 2)

    feature.toggleMark("b")

    expect(cleanHTML()).toBe("<p><i>o<b>ne</b></i><b> t</b>wo</p>")
    expect(feature.getState().marks).toEqual(["b", "i"])
    expect(document.getSelection()!.toString()).toBe("ne t")
  })

  it("removes a partially selected ancestor while preserving other marks and both outer sides", () => {
    const paragraph = setContent('<p><b class="authored ◆temporary"><i>abcd</i></b></p>')
    const text = paragraph.querySelector("i")!.firstChild as Text
    selectText(text, 1, 3)

    feature.toggleMark("b")

    expect(cleanHTML()).toBe('<p><b class="authored"><i>a</i></b><i>bc</i><b class="authored"><i>d</i></b></p>')
    expect(document.getSelection()!.toString()).toBe("bc")
    expect(feature.getState()).toEqual({canMark: true, marks: ["i"]})
    expect(Array.from(paragraph.querySelectorAll("b")).every(element => (
      element.classList.contains("authored")
      && !Array.from(element.classList).some(name => name.startsWith("◆"))
    ))).toBe(true)
  })

  it("removes an active mark wherever it occurs in a mixed selection", () => {
    const paragraph = setContent("<p><b>one</b> two</p>")
    $.selectRange(paragraph, 0, paragraph, paragraph.childNodes.length)

    feature.toggleMark("b")

    expect(cleanHTML()).toBe("<p>one two</p>")
    expect(document.getSelection()!.toString()).toBe("one two")
  })

  it("removes strong through the bold control and em through italic", () => {
    const paragraph = setContent("<p><strong>bold</strong> <em>italic</em></p>")
    let text = paragraph.querySelector("strong")!.firstChild as Text
    selectText(text)
    feature.toggleMark("b")
    expect(cleanHTML()).toBe("<p>bold <em>italic</em></p>")

    text = paragraph.querySelector("em")!.firstChild as Text
    selectText(text)
    feature.toggleMark("i")
    expect(cleanHTML()).toBe("<p>bold italic</p>")
  })

  it("clears all supported marks only within the selected text", () => {
    const paragraph = setContent('<p><b data-origin="external"><i>abcd</i></b></p>')
    const text = paragraph.querySelector("i")!.firstChild as Text
    selectText(text, 1, 3)

    feature.removeMarks()

    expect(cleanHTML()).toBe('<p><b data-origin="external"><i>a</i></b>bc<b data-origin="external"><i>d</i></b></p>')
    expect(document.getSelection()!.toString()).toBe("bc")
    expect(feature.getState()).toEqual({canMark: true, marks: []})
  })

  it("preserves a backwards selection after toggling", () => {
    const paragraph = setContent("<p>Text</p>")
    const text = paragraph.firstChild as Text
    $.selectRange(text, 4, text, 1)

    feature.toggleMark("u")

    const selection = document.getSelection()!
    expect(selection.toString()).toBe("ext")
    expect(selection.anchorOffset).toBeGreaterThan(selection.focusOffset)
  })

  it("toggles the span group and keeps multiple exact advanced types", () => {
    let paragraph = setContent("<p><samp>Text</samp></p>")
    selectText(paragraph.querySelector("samp")!.firstChild as Text)

    expect(feature.toggleMarkGroup("span")).toBe(true)
    expect(cleanHTML()).toBe("<p>Text</p>")
    expect(feature.toggleMarkGroup("span")).toBe(true)
    expect(cleanHTML()).toBe("<p><span>Text</span></p>")

    paragraph = document.querySelector("p")!
    selectText(paragraph.querySelector("span")!.firstChild as Text)
    expect(feature.setMarkGroup("span", ["time", "var"])).toBe(true)
    expect(cleanHTML()).toBe("<p><time><var>Text</var></time></p>")
    expect(feature.getState()).toEqual({canMark: true, marks: ["time", "var"]})
    expect(feature.setMarkGroup("span", [])).toBe(true)
    expect(cleanHTML()).toBe("<p>Text</p>")
    expect(feature.getState()).toEqual({canMark: true, marks: []})
  })

  it("enables downloads without a filename and preserves unrelated link attributes", () => {
    const paragraph = setContent('<p><a href="/file" ping="/track" rel="author" hreflang="en" type="text/plain" referrerpolicy="origin">Text</a></p>')
    const link = paragraph.querySelector("a")!
    selectText(link.firstChild as Text)
    expect(feature.getAttributeState().a?.download).toBeUndefined()
    expect(feature.setMarkAttribute("a", "download", "")).toBe(true)
    expect(link.getAttribute("download")).toBe("")
    expect(feature.getAttributeState().a?.download).toBe("")
    expect(feature.setMarkAttribute("a", "download", "file.txt")).toBe(true)
    expect(link.getAttribute("download")).toBe("file.txt")
    expect(feature.setMarkAttribute("a", "download", null)).toBe(true)
    expect(link.hasAttribute("download")).toBe(false)
    expect(feature.getAttributeState().a?.download).toBeUndefined()
    expect(link.outerHTML).toBe('<a href="/file" ping="/track" rel="author" hreflang="en" type="text/plain" referrerpolicy="origin">Text</a>')
    $.move(link.firstChild!, 1)
    expect(feature.setMarkAttribute("a", "download", "")).toBe(true)
    expect(feature.getAttributeState().a?.download).toBe("")
    expect(feature.setMarkAttribute("a", "download", null)).toBe(true)
    expect(link.hasAttribute("download")).toBe(false)
  })

  it("reads, sets, and removes mark-specific attributes", () => {
    const paragraph = setContent('<p><a href="/old" target="_blank">Text</a></p>')
    selectText(paragraph.querySelector("a")!.firstChild as Text)

    expect(feature.getAttributeState()).toEqual({
      a: {
        href: "/old",
        target: "_blank",
        ping: "",
        rel: "",
        hreflang: "",
        type: "",
        referrerpolicy: "",
      },
    })
    expect(feature.setMarkAttribute("a", "href", "/new")).toBe(true)
    expect(paragraph.querySelector("a")!.getAttribute("href")).toBe("/new")
    expect(feature.setMarkAttribute("a", "target", "")).toBe(true)
    expect(paragraph.querySelector("a")!.hasAttribute("target")).toBe(false)
    expect(() => feature.setMarkAttribute("a", "title", "ignored")).toThrow(TypeError)
  })

  it("reads, sets, and removes the abbreviation title detail", () => {
    const paragraph = setContent('<p><abbr title="Old expansion">Text</abbr></p>')
    selectText(paragraph.querySelector("abbr")!.firstChild as Text)

    expect(feature.getAttributeState()).toEqual({abbr: {title: "Old expansion"}})
    expect(feature.setMarkAttribute("abbr", "title", "New expansion")).toBe(true)
    expect(paragraph.querySelector("abbr")!.getAttribute("title")).toBe("New expansion")
    expect(feature.setMarkAttribute("abbr", "title", "")).toBe(true)
    expect(paragraph.querySelector("abbr")!.hasAttribute("title")).toBe(false)
  })
})

describe("MarkFeature span styles", () => {
  it.each([false, true])("keeps a selected canvas line after repeated formatting (backwards: %s)", backwards => {
    const paragraph = setContent('<p style="position: absolute">Heading<br><!--keep--><em>Selected line</em><br>After</p>')
    const text = paragraph.querySelector("em")!.firstChild as Text
    $.selectRange(text, backwards ? text.length : 0, text, backwards ? 0 : text.length)
    const breaks = Array.from(paragraph.querySelectorAll("br"))

    for(const size of ["24px", "32px", "18px"]) {
      expect(feature.setStyleMark("font-size", size)).toBe(true)
      expect(document.getSelection()!.toString()).toBe("Selected line")
      expect(feature.getState()).toEqual({canMark: true, marks: ["i"]})
      expect(feature.getStyleState()["font-size"]).toBe(size)
      expect($.isTextSelection).toBe(true)
      expect($.isBackwards).toBe(backwards)
      const range = document.getSelection()!.getRangeAt(0)
      expect(breaks.some(node => range.intersectsNode(node))).toBe(false)
      expect(Array.from(paragraph.querySelectorAll("br"))).toEqual(breaks)
    }
    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.removeMarks()).toBe(true)
    expect(feature.getState()).toEqual({canMark: true, marks: []})
    expect(document.getSelection()!.toString()).toBe("Selected line")
    expect(cleanHTML()).toBe('<p style="position: absolute">Heading<br><!--keep-->Selected line<br>After</p>')
  })

  it("sets each style mark on a span and derives uniform values from the DOM", () => {
    const paragraph = setContent("<p>Text</p>")
    selectText(paragraph.firstChild as Text)

    feature.setStyleMark("font-family", "Arial, sans-serif")
    feature.setStyleMark("font-size", "18px")
    feature.setStyleMark("color", "#dc2626")
    feature.setStyleMark("background-color", "#fef08a")

    expect(paragraph.querySelectorAll("span")).toHaveLength(1)
    const span = paragraph.querySelector("span") as HTMLSpanElement
    expect(span.style.fontFamily).toBe("Arial, sans-serif")
    expect(span.style.fontSize).toBe("18px")
    expect(span.style.color).toBe("#dc2626")
    expect(span.style.backgroundColor).toBe("#fef08a")
    expect(feature.getState()).toEqual({canMark: true, marks: []})
    expect(feature.getStyleState()).toEqual({
      "font-family": "Arial, sans-serif",
      "font-size": "18px",
      color: "#dc2626",
      "background-color": "#fef08a",
    })
  })

  it("keeps style-only spans out of the semantic Span group", () => {
    let paragraph = setContent('<p><span style="font-size: 18px; color: red">Text</span></p>')
    selectText(paragraph.querySelector("span")!.firstChild as Text)

    expect(feature.getState()).toEqual({canMark: true, marks: []})
    expect(feature.getStyleState()).toEqual({"font-size": "18px", color: "red"})
    expect(feature.setMarkGroup("span", ["q"])).toBe(true)
    expect(paragraph.querySelector("q")!.textContent).toBe("Text")
    expect(paragraph.querySelector<HTMLSpanElement>("span")!.style.fontSize).toBe("18px")
    expect(feature.setMarkGroup("span", [])).toBe(true)
    expect(paragraph.querySelector("q")).toBeNull()
    expect(paragraph.querySelector<HTMLSpanElement>("span")!.style.fontSize).toBe("18px")

    paragraph = setContent('<p><span title="Semantic" style="font-size: 18px">Text</span></p>')
    selectText(paragraph.querySelector("span")!.firstChild as Text)
    expect(feature.getState()).toEqual({canMark: true, marks: ["span"]})
  })

  it("splits a styled span for a partial change and keeps its other styles", () => {
    const paragraph = setContent('<p><span style="color: red; font-size: 16px">abcd</span></p>')
    const text = paragraph.querySelector("span")!.firstChild as Text
    selectText(text, 1, 3)

    feature.setStyleMark("color", "blue")

    const spans = Array.from(paragraph.querySelectorAll<HTMLSpanElement>("span"))
    expect(spans.map(span => [span.textContent, span.style.color, span.style.fontSize])).toEqual([
      ["a", "red", "16px"],
      ["bc", "blue", "16px"],
      ["d", "red", "16px"],
    ])
    expect(document.getSelection()!.toString()).toBe("bc")
  })

  it.each([true, false])("applies color outside underline regardless of order (color first: %s)", colorFirst => {
    const paragraph = setContent("<p>Before selected after</p>")
    selectText(paragraph.firstChild as Text, 7, 15)

    const color = () => feature.setStyleMark("color", "red")
    const underline = () => feature.toggleMark("u")
    const commands = colorFirst ? [color, underline] : [underline, color]
    commands.forEach(command => expect(command()).toBe(true))

    expect(cleanHTML()).toBe('<p>Before <span style="color: red;"><u>selected</u></span> after</p>')
    expect(document.getSelection()!.toString()).toBe("selected")
    expect(feature.getStyleState().color).toBe("red")
    expect(feature.getState().marks).toContain("u")
  })

  it("recolors only the selected run of an existing underline", () => {
    const paragraph = setContent('<p><span style="color: blue;"><u id="note" title="Note"><em>abcd</em></u></span></p>')
    const text = paragraph.querySelector("em")!.firstChild as Text
    selectText(text, 3, 1)

    expect(feature.setStyleMark("color", "red")).toBe(true)

    const underlines = Array.from(paragraph.querySelectorAll("u"))
    expect(underlines.map(underline => [underline.innerHTML, underline.parentElement!.style.color])).toEqual([
      ["<em>a</em>", "blue"],
      ["<em>bc</em>", "red"],
      ["<em>d</em>", "blue"],
    ])
    expect(underlines.map(underline => [underline.id, underline.title])).toEqual([["note", "Note"], ["", "Note"], ["", "Note"]])
    expect(document.getSelection()!.toString()).toBe("bc")
    expect($.isBackwards).toBe(true)
    expect(feature.setStyleMark("color", "")).toBe(true)
    expect(paragraph.querySelector("p > u")?.innerHTML).toBe("<em>bc</em>")
  })

  it("preserves comments at the edges of a recolored underline", () => {
    const paragraph = setContent("<p><u><!--before-->Text<!--after--></u></p>")
    const underline = paragraph.querySelector("u")!
    const [before, text, after] = Array.from(underline.childNodes)
    selectText(text as Text)

    expect(feature.setStyleMark("color", "red")).toBe(true)

    expect(paragraph.firstElementChild?.firstChild).toBe(before)
    expect(paragraph.lastElementChild?.firstChild).toBe(after)
    expect(paragraph.querySelector("span > u")?.textContent).toBe("Text")
  })

  it("can still recolor text inside an underline with its own inline color", () => {
    const paragraph = setContent('<p><u style="color: blue">Text</u></p>')
    selectText(paragraph.querySelector("u")!.firstChild as Text)

    expect(feature.setStyleMark("color", "red")).toBe(true)

    expect(paragraph.querySelector("u")!.style.color).toBe("blue")
    expect(paragraph.querySelector("u > span")?.getAttribute("style")).toBe("color: red;")
  })

  it("removes only the chosen style and merges equivalent neighboring spans", () => {
    const paragraph = setContent('<p><span style="color: red">ab</span><span style="color: red">cd</span></p>')
    const first = paragraph.firstElementChild!.firstChild as Text
    const second = paragraph.lastElementChild!.firstChild as Text
    $.selectRange(first, 1, second, 1)

    feature.setStyleMark("color", "")

    expect(cleanHTML()).toBe('<p><span style="color: red">a</span>bc<span style="color: red">d</span></p>')
    selectText(paragraph.childNodes[1] as Text)
    feature.setStyleMark("color", "red")
    expect(cleanHTML()).toBe('<p><span style="color: red">abcd</span></p>')
  })

  it("stores style marks at a caret and applies them to newly typed text", () => {
    const paragraph = setContent("<p>ab</p>")
    $.move(paragraph.firstChild!, 1)

    feature.setStyleMark("font-size", "20px")
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "X",
      inputType: "insertText",
    })
    paragraph.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe('<p>a<span style="font-size: 20px;">X</span>b</p>')
    expect(feature.getStyleState()).toEqual({"font-size": "20px"})
  })

  it("increases and decreases through the font-size presets", () => {
    const paragraph = setContent("<p>Text</p>")
    selectText(paragraph.firstChild as Text)

    expect(feature.adjustFontSize(1)).toBe(true)
    expect(paragraph.querySelector<HTMLElement>("span")!.style.fontSize).toBe("18px")
    expect(feature.adjustFontSize(-1)).toBe(true)
    expect(paragraph.querySelector<HTMLElement>("span")!.style.fontSize).toBe("16px")
  })

  it("removes semantic and span-style formatting together", () => {
    const paragraph = setContent('<p><b><span style="color: red">abcd</span></b></p>')
    const text = paragraph.querySelector("span")!.firstChild as Text
    selectText(text, 1, 3)

    feature.removeMarks()

    expect(cleanHTML()).toBe('<p><b><span style="color: red">a</span></b>bc<b><span style="color: red">d</span></b></p>')
    expect(feature.getStyleState()).toEqual({})
  })

  it("removes formatting from a style-only selection", () => {
    const paragraph = setContent('<p><span style="color: red">abcd</span></p>')
    const text = paragraph.querySelector("span")!.firstChild as Text
    selectText(text, 1, 3)

    expect(feature.removeMarks()).toBe(true)

    expect(cleanHTML()).toBe('<p><span style="color: red">a</span>bc<span style="color: red">d</span></p>')
    expect(feature.getStyleState()).toEqual({})
  })
})

describe("MarkFeature stored marks", () => {
  const typeText = (target: Element, data: string) => {
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data,
      inputType: "insertText",
    })
    target.dispatchEvent(event)
    return event
  }

  it("stores Popup at an empty caret and wraps the next typed text", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)

    expect(feature.togglePopup()).toBe(true)
    expect(feature.getState().popupActive).toBe(true)
    expect(cleanHTML()).toBe("<p></p>")

    const event = typeText(paragraph, "Hello")
    const button = paragraph.querySelector(".ww-popup button")!
    expect(event.defaultPrevented).toBe(true)
    expect(button.textContent).toBe("Hello")
    expect(document.querySelector(".ww-popup-content[popover]")).not.toBeNull()
    expect(button.contains(document.getSelection()!.anchorNode)).toBe(true)
    expect(document.getSelection()!.anchorOffset).toBe(5)
    expect(feature.getState().popupActive).toBe(true)
    expect(cleanHTML()).not.toContain("◆")
  })

  it("combines a pending Popup with another stored mark", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.togglePopup()).toBe(true)

    expect(typeText(paragraph, "X").defaultPrevented).toBe(true)
    expect(paragraph.querySelector("b .ww-popup button")?.textContent).toBe("X")
    expect(paragraph.querySelector(".ww-popup button")?.contains(document.getSelection()!.anchorNode)).toBe(true)
  })

  it("clears a pending Popup when toggled off or when the selection moves", () => {
    const paragraph = setContent("<p>Text</p>")
    const text = paragraph.firstChild!
    $.move(text, 1)
    expect(feature.togglePopup()).toBe(true)
    expect(feature.togglePopup()).toBe(true)
    expect(feature.getState().popupActive).toBeUndefined()
    expect(typeText(paragraph, "X").defaultPrevented).toBe(false)

    expect(feature.togglePopup()).toBe(true)
    $.move(text, 3)
    document.dispatchEvent(new Event("selectionchange"))
    expect(feature.getState().popupActive).toBeUndefined()
    expect(typeText(paragraph, "Y").defaultPrevented).toBe(false)
    expect(paragraph.querySelector(".ww-popup")).toBeNull()
  })

  it("keeps stored Link and Popup mutually exclusive", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    expect(feature.togglePopup()).toBe(true)
    expect(feature.toggleMark("a")).toBe(false)
    expect(feature.togglePopup()).toBe(true)
    expect(feature.toggleMark("a")).toBe(true)
    expect(feature.togglePopup()).toBe(false)
    expect(feature.getState().popupActive).toBeUndefined()
  })

  it("keeps an empty download filename when typing a new link", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    feature.toggleMark("a")
    feature.setMarkAttribute("a", "href", "/file")
    feature.setMarkAttribute("a", "download", "")
    expect(feature.getAttributeState().a?.download).toBe("")
    typeText(paragraph, "X")
    expect(paragraph.querySelector("a")!.getAttribute("download")).toBe("")
  })

  it("stores and unstores marks at a caret without changing the DOM", () => {
    const paragraph = setContent("<p>Text</p>")
    $.move(paragraph.firstChild!, 2)

    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.toggleMark("i")).toBe(true)
    expect(feature.getState()).toEqual({canMark: true, marks: ["b", "i"]})
    expect(cleanHTML()).toBe("<p>Text</p>")

    expect(feature.toggleMark("b")).toBe(true)
    expect(feature.getState()).toEqual({canMark: true, marks: ["i"]})
    expect(cleanHTML()).toBe("<p>Text</p>")
  })

  it("wraps the next typed text in every stored mark", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    feature.toggleMark("b")
    feature.toggleMark("i")

    const event = typeText(paragraph, "X")

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<p><b><i>X</i></b></p>")
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(feature.getState()).toEqual({canMark: true, marks: ["b", "i"]})
  })

  it("can explicitly turn off an inherited mark for newly typed text", () => {
    const paragraph = setContent("<p><b>ab</b></p>")
    const text = paragraph.querySelector("b")!.firstChild!
    $.move(text, 1)
    expect(feature.getState().marks).toEqual(["b"])

    feature.toggleMark("b")
    expect(feature.getState().marks).toEqual([])
    const event = typeText(paragraph, "X")

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<p><b>a</b>X<b>b</b></p>")
    expect(feature.getState().marks).toEqual([])
  })

  it("clears inferred marks for newly typed text through remove marks", () => {
    const paragraph = setContent("<p><b><i>ab</i></b></p>")
    $.move(paragraph.querySelector("i")!.firstChild!, 1)

    expect(feature.removeMarks()).toBe(true)
    expect(feature.getState().marks).toEqual([])
    typeText(paragraph, "X")

    expect(cleanHTML()).toBe("<p><b><i>a</i></b>X<b><i>b</i></b></p>")
    expect(feature.getState().marks).toEqual([])
  })

  it("discards stored marks after native or programmatic selection changes", () => {
    const paragraph = setContent("<p>Text</p>")
    const text = paragraph.firstChild!
    $.move(text, 1)
    feature.toggleMark("b")
    expect(feature.getState().marks).toEqual(["b"])

    $.move(text, 3)
    document.dispatchEvent(new Event("selectionchange"))

    expect(feature.getState()).toEqual({canMark: true, marks: []})

    feature.toggleMark("i")
    const liveRange = document.getSelection()!.getRangeAt(0)
    liveRange.setStart(text, 2)
    liveRange.collapse(true)

    expect(feature.getState()).toEqual({canMark: true, marks: []})
  })

  it("stores primary marks through their keyboard shortcuts at a caret", () => {
    const paragraph = setContent("<p>Text</p>")
    $.move(paragraph.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {
      key: "b",
      code: "KeyB",
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(feature.getState().marks).toEqual(["b"])
    expect(cleanHTML()).toBe("<p>Text</p>")
  })

  it("stores mark attributes at a caret and applies them to typed text", () => {
    const paragraph = setContent("<p></p>")
    $.move(paragraph, 0)
    feature.toggleMark("a")
    feature.setMarkAttribute("a", "href", "https://example.com")

    typeText(paragraph, "X")

    expect(cleanHTML()).toBe('<p><a href="https://example.com">X</a></p>')
    expect(feature.getAttributeState()).toEqual({
      a: {
        href: "https://example.com",
        target: "",
        ping: "",
        rel: "",
        hreflang: "",
        type: "",
        referrerpolicy: "",
      },
    })
  })
})

describe("MarkFeature shortcuts", () => {
  it("handles the standard primary-modifier shortcuts for bold, italic, underline, and link", () => {
    for(const name of standardMarkShortcutNames) {
      const option = primaryMarkOptions.find(candidate => candidate.name === name)!
      const paragraph = setContent("<p>Text</p>")
      selectText(paragraph.firstChild as Text)
      const event = new KeyboardEvent("keydown", {
        key: option.shortcutKey,
        code: `Key${option.shortcutKey!.toUpperCase()}`,
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })

      document.dispatchEvent(event)

      expect(event.defaultPrevented, name).toBe(true)
      expect(paragraph.querySelector(name), name).not.toBeNull()
    }
  })

  it("handles insertable primary mark shortcuts and ignores excluded marks", () => {
    expect(new Set(primaryMarkOptions.map(option => option.shortcutKey)).size).toBe(primaryMarkOptions.length)

    for(const option of primaryMarkOptions) {
      const paragraph = setContent("<p>Text</p>")
      selectText(paragraph.firstChild as Text)
      const event = new KeyboardEvent("keydown", {
        key: option.shortcutKey,
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })

      document.dispatchEvent(event)

      expect(event.defaultPrevented, option.name).toBe(!excludedMarkNames.includes(option.name))
      expect(Boolean(paragraph.querySelector(option.name)), option.name).toBe(!excludedMarkNames.includes(option.name))
    }
  })

  it("does not consume shortcuts for a non-text selection", () => {
    const paragraph = setContent("<p><img></p>")
    $.selectElement(paragraph)
    const event = new KeyboardEvent("keydown", {
      key: "b",
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(paragraph.querySelector("b")).toBeNull()
  })

  it("uses the physical letter when macOS Option changes event.key", () => {
    const paragraph = setContent("<p>Text</p>")
    selectText(paragraph.firstChild as Text)
    const event = new KeyboardEvent("keydown", {
      key: "ı",
      code: "KeyB",
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(paragraph.querySelector("b")).not.toBeNull()
  })

  it("toggles code independently when it is an advanced mark", () => {
    const paragraph = setContent("<p><samp>Text</samp></p>")
    selectText(paragraph.querySelector("samp")!.firstChild as Text)
    const event = new KeyboardEvent("keydown", {
      key: "c",
      code: "KeyC",
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cleanHTML()).toBe("<p><samp><code>Text</code></samp></p>")
  })
})


describe("independent positioned flows", () => {
  it.each(["absolute", "fixed"])("formats surrounding text without changing %s content", position => {
    const paragraph = setContent(`<p>before<span style="position: ${position}">floating</span>after</p>`)
    const floating = paragraph.querySelector("span")!
    $.selectRange(paragraph.firstChild!, 0, paragraph.lastChild!, 5)
    expect(feature.addMark("code")).toBe(true)
    expect(floating.parentElement).toBe(paragraph)
    expect(floating.innerHTML).toBe("floating")
    expect(Array.from(paragraph.querySelectorAll("code"), node => node.textContent)).toEqual(["before", "after"])
    expect(feature.toggleMarkGroup("span")).toBe(true)
    expect(paragraph.querySelector("code")).toBeNull()
    expect(floating.parentElement).toBe(paragraph)
  })

  it("styles surrounding text while preserving a positioned widget's identity", () => {
    const paragraph = setContent('<p>before<flow-widget style="position: fixed">floating</flow-widget>after</p>')
    const widget = paragraph.querySelector("flow-widget")!
    $.selectRange(paragraph.firstChild!, 0, paragraph.lastChild!, 5)
    expect(feature.setStyleMark("color", "red")).toBe(true)
    expect(widget.parentElement).toBe(paragraph)
    expect(widget.innerHTML).toBe("floating")
    expect(Array.from(paragraph.querySelectorAll("span"), node => node.textContent)).toEqual(["before", "after"])
  })
})


describe("inline references", () => {
  const metadata = JSON.stringify({type: "book", title: "Learning", author: [{family: "Smith", given: "Alex"}]})

  it("generates a fragment for a reference without a URL and preserves metadata in serialization", () => {
    const paragraph = setContent('<p><a>citation</a></p>')
    const anchor = paragraph.querySelector("a")!
    $.move(anchor.firstChild!, 2)
    expect(feature.setMarkAttribute("a", "data-reference", metadata)).toBe(true)
    expect(anchor.getAttribute("href")).toMatch(/^#ref-/)
    expect(anchor.getAttribute("data-reference")).toBe(metadata)
    expect(cleanHTML()).toContain("data-reference=")
    expect(document.body.querySelector("button, dialog")).toBeNull()
  })

  it("updates all occurrences by literal href without updating widgets or occurrence locators", () => {
    setContent('<p><a href="#source">first</a> <em><a href="#source">second</a></em></p><custom-box><a href="#source">widget</a></custom-box>')
    const anchors = document.querySelectorAll("a")
    anchors.forEach(anchor => anchor.setAttribute("data-reference", metadata))
    anchors[1].setAttribute("data-reference-locator", "42")
    $.move(anchors[0].firstChild!, 2)
    const next = JSON.stringify({type: "book", title: "Changed"})
    expect(feature.setMarkAttribute("a", "data-reference", next)).toBe(true)
    expect(anchors[0].getAttribute("data-reference")).toBe(next)
    expect(anchors[1].getAttribute("data-reference")).toBe(next)
    expect(anchors[2].getAttribute("data-reference")).toBe(metadata)
    expect(anchors[1].getAttribute("data-reference-locator")).toBe("42")
    expect(feature.setMarkAttribute("a", "data-reference-locator", "8")).toBe(true)
    expect(anchors[0].getAttribute("data-reference-locator")).toBe("8")
    expect(anchors[1].getAttribute("data-reference-locator")).toBe("42")
  })

  it("resolves conflicting copies even when the selected occurrence already has the requested metadata", () => {
    setContent('<p><a href="#source">first</a> <a href="#source">second</a></p>')
    const anchors = document.querySelectorAll("a")
    anchors[0].setAttribute("data-reference", metadata)
    anchors[1].setAttribute("data-reference", JSON.stringify({type: "book", title: "Conflict"}))
    $.move(anchors[0].firstChild!, 2)
    feature.setMarkAttribute("a", "data-reference", metadata)
    expect(anchors[1].getAttribute("data-reference")).toBe(metadata)
  })

  it("rejects invalid reference metadata before changing the authored DOM", () => {
    const paragraph = setContent('<p><a href="#source">citation</a></p>')
    $.move(paragraph.querySelector("a")!.firstChild!, 2)
    const before = cleanHTML()
    for(const value of ['{', '[]', '{"type":"book"}'])
      expect(() => feature.setMarkAttribute("a", "data-reference", value)).toThrow(TypeError)
    expect(cleanHTML()).toBe(before)
  })
})


describe("link keyboard edits", () => {
  const currentIdentity = () => feature.getLinkState()!.identity

  it("stages a cross reference, then switches one anchor to a citation without rebuilding its label", () => {
    const paragraph = setContent('<p>Before <em>two</em><!--keep--> words after</p><h2 id="intro">Intro</h2>')
    const first = paragraph.querySelector("em")!.firstChild!, last = paragraph.lastChild!
    $.selectRange(first, 0, last, 6)
    expect(feature.selectLinkKind("cross-reference")).toBe(true)
    expect(feature.getLinkState()).toMatchObject({kind: "cross-reference", text: "two words"})
    expect(paragraph.querySelector("a")).toBeNull()
    const crossReference = currentIdentity()
    expect(feature.editLink({identity: crossReference, kind: "cross-reference", href: "#intro", attributes: {}})).toBe(true)
    const anchor = paragraph.querySelector("a")!
    const emphasis = anchor.querySelector("em")!
    expect(anchor.outerHTML).toBe('<a href="#intro"><em>two</em><!--keep--> words</a>')
    expect(feature.getLinkState()?.kind).toBe("cross-reference")

    expect(feature.selectLinkKind("citation")).toBe(true)
    expect(anchor.getAttribute("href")).toBe("#intro")
    const citation = currentIdentity()
    expect(() => feature.editLink({identity: crossReference, kind: "cross-reference", href: "#intro", attributes: {}})).toThrow(/selected link changed/)
    expect(feature.editLink({identity: citation, kind: "citation", href: "https://example.test/source", attributes: {
      "data-reference": JSON.stringify({type: "book", title: "Source"}),
    }})).toBe(true)
    expect(feature.getLinkState()?.kind).toBe("citation")
    expect(anchor.querySelector("em")).toBe(emphasis)
    expect(paragraph.querySelectorAll("a")).toHaveLength(1)
    expect(feature.selectLinkKind("citation", true)).toBe(true)
    expect(paragraph.querySelector("a")).toBeNull()
    expect([...paragraph.querySelectorAll("em")].some(element => element.textContent === "two")).toBe(true)
    expect(paragraph.textContent).toBe("Before two words after")
  })

  it("converts a download to a plain link without carrying the attachment attributes over", () => {
    const paragraph = setContent('<p><a href="data:text/plain,test" download="note.txt" data-custom="keep"><em>Label</em></a></p>')
    const anchor = paragraph.querySelector("a")!
    $.move(anchor.querySelector("em")!.firstChild!, 2)
    expect(feature.getAttachmentState()).not.toBeNull()
    expect(feature.selectLinkKind("link", true)).toBe(true)
    expect(feature.getLinkState()).toMatchObject({kind: "link", href: ""})
    expect(feature.getAttachmentState()).toBeNull()
    expect(feature.editLink({identity: currentIdentity(), kind: "link", href: "https://example.test", attributes: {}})).toBe(true)
    expect(anchor.getAttribute("href")).toBe("https://example.test")
    expect(anchor.hasAttribute("download")).toBe(false)
    expect(anchor.getAttribute("data-custom")).toBe("keep")
    expect(feature.getAttachmentState()).toBeNull()
  })

  it("switches between a popup and a link, leaving the popup in place until applying", () => {
    const paragraph = setContent('<p><a href="https://example.test" id="label" data-custom="keep"><em>Label</em></a></p><h2 id="intro">Intro</h2>')
    const emphasis = paragraph.querySelector("em")!
    $.move(emphasis.firstChild!, 2)
    expect(feature.selectLinkKind("popup")).toBe(true)
    const toggle = paragraph.querySelector("button")!
    const popup = document.getElementById(toggle.getAttribute("popovertarget")!)!
    expect(paragraph.querySelector("a")).toBeNull()
    expect(toggle.querySelector("em")).toBe(emphasis)
    $.move(emphasis.firstChild!, 2)
    expect(feature.selectLinkKind("cross-reference")).toBe(true)
    expect(toggle.isConnected && popup.isConnected).toBe(true)
    feature.actions.cancelLinkKindDraft({type: "cancelLinkKindDraft", identity: currentIdentity()})
    expect(feature.getLinkState()).toBeNull()
    expect(popup.isConnected).toBe(true)

    expect(feature.selectLinkKind("cross-reference")).toBe(true)
    expect(feature.editLink({identity: currentIdentity(), kind: "cross-reference", href: "#intro", attributes: {}})).toBe(true)
    expect(toggle.isConnected || popup.isConnected).toBe(false)
    expect(paragraph.querySelector('a[href="#intro"] em')).toBe(emphasis)
    expect(paragraph.querySelector("#label")?.getAttribute("data-custom")).toBe("keep")
  })

  it("invalidates a staged link when its selection is replaced", () => {
    const paragraph = setContent('<p>Draft link</p><h2 id="intro">Intro</h2>')
    $.selectRange(paragraph.firstChild!, 0, paragraph.firstChild!, 5)
    expect(feature.selectLinkKind("cross-reference")).toBe(true)
    const identity = currentIdentity()
    paragraph.textContent = "New content"
    $.move(paragraph.firstChild!, 2)
    expect(() => feature.editLink({identity, kind: "cross-reference", href: "#intro", attributes: {}})).toThrow(/selected link changed/)
    expect(paragraph.innerHTML).toBe("New content")
  })

  it("still toggles plain links across separate paragraphs", () => {
    const first = setContent("<p>First</p><p>Second</p>")
    const second = first.nextElementSibling!
    $.selectRange(first.firstChild!, 0, second.firstChild!, 6)
    expect(feature.selectLinkKind("link", true)).toBe(true)
    expect(first.querySelector("a")?.textContent).toBe("First")
    expect(second.querySelector("a")?.textContent).toBe("Second")
    expect(feature.selectLinkKind("link", true)).toBe(true)
    expect(first.querySelector("a") ?? second.querySelector("a")).toBeNull()
  })

  it("opens for a selection within one link, including the entire link", () => {
    const paragraph = setContent('<p>Before <a href="#intro">one <em>two</em><!--keep--></a> after</p>')
    const anchor = paragraph.querySelector("a")!
    const first = anchor.firstChild!, last = anchor.querySelector("em")!.firstChild!
    $.selectRange(first, 1, last, 2)
    expect(feature.getLinkState()?.text).toBe("ne tw")
    $.selectRange(last, 3, first, 0)
    expect(feature.getLinkState()?.text).toBe("one two")
    $.selectElement(anchor, false)
    expect(feature.getLinkState()?.href).toBe("#intro")
  })

  it("keeps the keyboard closed when a selection extends outside a link", () => {
    const paragraph = setContent('<p>Before <a href="#intro">Link</a><br> after</p>')
    const text = paragraph.querySelector("a")!.firstChild!
    $.selectRange(paragraph.firstChild!, 1, text, 2)
    expect(feature.getLinkState()).toBeNull()
    $.selectRange(paragraph.lastChild!, 2, text, 1)
    expect(feature.getLinkState()).toBeNull()
    $.selectRange(paragraph, 1, paragraph, 3)
    expect(feature.getLinkState()).toBeNull()
  })

  it("keeps the keyboard closed across separate links to the same address", () => {
    const paragraph = setContent('<p><a href="#intro">one</a><a href="#intro">two</a></p>')
    $.selectRange(paragraph.firstChild!.firstChild!, 0, paragraph.lastChild!.firstChild!, 3)
    expect(feature.getLinkState()).toBeNull()
  })

  it("lists current authored targets and references without entering widgets", () => {
    const paragraph = setContent('<p><a href="#intro">Text</a></p><h2 id="intro">Introduction</h2><h2 id="odd id">Odd title</h2><custom-box><h2 id="private">Private</h2></custom-box>')
    const source = document.createElement("a")
    source.href = "#source"
    source.dataset.reference = JSON.stringify({type: "book", title: "Source title"})
    document.body.append(source)
    $.move(paragraph.querySelector("a")!.firstChild!, 2)
    const state = feature.getLinkState()!
    expect(state.active).toBe(true)
    expect(state.href).toBe("#intro")
    expect(state.targets).toEqual(expect.arrayContaining([
      {href: "#intro", label: "Introduction"}, {href: "#odd%20id", label: "Odd title"},
    ]))
    expect(state.references).toEqual([{href: "#source", label: "Source title", data: source.dataset.reference}])
    expect(state.targets.some(target => target.href === "#private")).toBe(false)
    expect(document.querySelector("[data-link-identity]")).toBeNull()
  })

  it("updates a caret link without rebuilding irregular authored content", () => {
    const paragraph = setContent('<p><a href="#intro" data-custom="keep">one <em>two</em><!--keep--></a></p><h2 id="intro">Introduction</h2>')
    const anchor = paragraph.querySelector("a")!
    const child = anchor.querySelector("em")!
    $.move(child.firstChild!, 1)
    feature.editLink({identity: currentIdentity(), href: "https://example.test", attributes: {target: "_blank", rel: "noopener"}})
    expect(anchor.getAttribute("href")).toBe("https://example.test")
    expect(anchor.getAttribute("data-custom")).toBe("keep")
    expect(anchor.querySelector("em")).toBe(child)
    expect(anchor.innerHTML).toBe("one <em>two</em><!--keep-->")
    expect(document.getSelection()?.anchorNode).toBe(child.firstChild)
  })

  it("defaults new keyboard links to new tabs while preserving an explicit opt-out", () => {
    const paragraph = setContent("<p>New link</p>")
    $.selectRange(paragraph.firstChild!, 0, paragraph.firstChild!, 8)
    feature.addMark("a")
    feature.editLink({identity: currentIdentity(), href: "https://example.test", attributes: {}})
    const link = paragraph.querySelector("a")!
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    feature.editLink({identity: currentIdentity(), href: "https://example.test/next", attributes: {target: null}})
    expect(link.hasAttribute("target")).toBe(false)
  })

  it("normalizes link commands without using the document's base URL", () => {
    const paragraph = setContent('<p><a href="">Link</a></p>')
    $.move(paragraph.querySelector("a")!.firstChild!, 2)
    feature.editLink({identity: currentIdentity(), href: "example.test:8443/path", attributes: {}})
    expect(paragraph.querySelector("a")!.getAttribute("href")).toBe("https://example.test:8443/path")
    feature.editLink({identity: currentIdentity(), href: "http://example.test/path", attributes: {}})
    expect(paragraph.querySelector("a")!.getAttribute("href")).toBe("http://example.test/path")
    const reference = JSON.stringify({type: "book", title: "Local reading"})
    feature.editLink({identity: currentIdentity(), href: "../reading/book.html#chapter", attributes: {"data-reference": reference}})
    expect(paragraph.querySelector("a")!.getAttribute("href")).toBe("../reading/book.html#chapter")
    expect(paragraph.querySelector("a")!.dataset.reference).toBe(reference)
  })

  it("rejects a stale link after direct replacement or metadata changes", () => {
    const paragraph = setContent('<p><a href="#intro">Text</a></p><h2 id="intro">Introduction</h2>')
    const anchor = paragraph.querySelector("a")!
    $.move(anchor.firstChild!, 2)
    const identity = currentIdentity()
    anchor.href = "https://remote.test"
    const authored = cleanHTML()
    expect(() => feature.editLink({identity, href: "https://local.test", attributes: {}})).toThrow(/selected link changed/i)
    expect(cleanHTML()).toBe(authored)
    const nextIdentity = currentIdentity()
    anchor.replaceWith(anchor.cloneNode(true))
    expect(() => feature.editLink({identity: nextIdentity, href: "https://local.test", attributes: {}})).toThrow(/selected link changed/i)
  })

  it("validates the entire reference edit before changing any link attribute", () => {
    const paragraph = setContent('<p><a href="https://before.test">Text</a></p>')
    $.move(paragraph.querySelector("a")!.firstChild!, 2)
    const before = cleanHTML()
    expect(() => feature.editLink({identity: currentIdentity(), href: "https://after.test", attributes: {"data-reference": "{"}})).toThrow(/title/i)
    expect(cleanHTML()).toBe(before)
    expect(() => feature.editLink({identity: currentIdentity(), href: "#missing", attributes: {}})).toThrow(/no longer exists/i)
    expect(cleanHTML()).toBe(before)
  })

  it("creates a fragment reference and reuses an existing source for document links", () => {
    const paragraph = setContent('<p><a>new</a> <a href="#old">old</a></p>')
    const [first, second] = paragraph.querySelectorAll("a")
    const metadata = JSON.stringify({type: "book", title: "Source"})
    $.move(first.firstChild!, 1)
    feature.editLink({identity: currentIdentity(), href: "", attributes: {"data-reference": metadata, "data-reference-locator": "3"}})
    const href = first.getAttribute("href")!
    expect(href).toMatch(/^#ref-/)
    $.move(second.firstChild!, 1)
    feature.editLink({identity: currentIdentity(), href, attributes: {"data-reference": null, "data-reference-locator": null}})
    expect(second.getAttribute("href")).toBe(href)
    expect(second.dataset.reference).toBe(metadata)
    expect(second.dataset.referenceLocator).toBeUndefined()
    expect(first.dataset.referenceLocator).toBe("3")
  })

  it("allows converting a reference to a web link without retaining source metadata", () => {
    const paragraph = setContent('<p><a href="https://source.test">Text</a></p>')
    const anchor = paragraph.querySelector("a")!
    anchor.dataset.reference = JSON.stringify({type: "book", title: "Source"})
    $.move(anchor.firstChild!, 2)
    feature.editLink({identity: currentIdentity(), href: "https://source.test", attributes: {"data-reference": null, "data-reference-locator": null}})
    expect(anchor.dataset.reference).toBeUndefined()
    expect(anchor.getAttribute("href")).toBe("https://source.test")
  })

  it("reassigns only the selected citation when choosing another source", () => {
    const paragraph = setContent('<p><a href="#old">one</a> <a href="#old">two</a> <a href="#new">three</a></p>')
    const [first, second, third] = paragraph.querySelectorAll("a")
    const old = JSON.stringify({type: "book", title: "Old"})
    const next = JSON.stringify({type: "book", title: "New"})
    first.dataset.reference = second.dataset.reference = old
    third.dataset.reference = next
    $.move(first.firstChild!, 1)
    feature.editLink({identity: currentIdentity(), href: "#new", attributes: {"data-reference": next}})
    expect(first.getAttribute("href")).toBe("#new")
    expect(first.dataset.reference).toBe(next)
    expect(second.getAttribute("href")).toBe("#old")
    expect(second.dataset.reference).toBe(old)
    expect(third.dataset.reference).toBe(next)
  })

  it("supports pending caret links without inserting editor-owned DOM", () => {
    const paragraph = setContent('<p>Text</p>')
    $.move(paragraph.firstChild!, 2)
    feature.addMark("a")
    const identity = currentIdentity()
    feature.editLink({identity, href: "https://example.test", attributes: {target: "_blank"}})
    expect(feature.getAttributeState().a?.href).toBe("https://example.test")
    expect(cleanHTML()).toBe("<p>Text</p>")
  })
})


describe("attachment marks", () => {
  it("toggles off at a caret and preserves the exact text position and descendants", () => {
    const paragraph = setContent('<p>Before <a href="data:application/octet-stream;base64,AA==" download="notes.txt">one <em>two</em><!--keep--></a> after</p>')
    const emphasis = paragraph.querySelector("em")!
    const text = emphasis.firstChild!
    $.move(text, 1)
    expect(feature.toggleAttachment()).toBe("removed")
    expect(paragraph.innerHTML).toBe("Before one <em>two</em><!--keep--> after")
    expect(paragraph.querySelector("em")).toBe(emphasis)
    expect(document.getSelection()?.anchorNode).toBe(text)
    expect(document.getSelection()?.anchorOffset).toBe(1)
    expect(document.getSelection()?.isCollapsed).toBe(true)
  })

  it("toggles off a whole backwards text selection and keeps unrelated anchor attributes", () => {
    const paragraph = setContent('<p>Before <a id="notes" data-note="keep" download href="/notes.txt"><!--start--><strong>one</strong> <em>two</em><!--end--></a> after</p>')
    const start = paragraph.querySelector("strong")!.firstChild!
    const end = paragraph.querySelector("em")!.firstChild!
    $.selectRange(end, 3, start, 0)
    expect(feature.toggleAttachment()).toBe("removed")
    expect(paragraph.querySelector("a")).toBeNull()
    expect(paragraph.querySelector("span#notes")?.outerHTML).toBe('<span id="notes" data-note="keep"><!--start--><strong>one</strong> <em>two</em><!--end--></span>')
    expect(document.getSelection()?.anchorNode).toBe(end)
    expect(document.getSelection()?.focusNode).toBe(start)
    expect(document.getSelection()?.toString()).toBe("one two")
  })

  it("keeps a partially selected attachment and removes it when its whole element is selected", () => {
    const paragraph = setContent('<p><a download href="/notes.txt"><img alt="Cover">Label</a> after</p>')
    const anchor = paragraph.querySelector("a")!
    const image = paragraph.querySelector("img")!
    selectText(anchor.lastChild as Text)
    expect(feature.toggleAttachment()).toEqual(expect.objectContaining({identity: expect.any(String)}))
    expect(paragraph.querySelector("a")).toBe(anchor)
    $.selectElement(anchor, false)
    expect(feature.toggleAttachment()).toBe("removed")
    expect(paragraph.querySelector("a")).toBeNull()
    expect(paragraph.firstChild).toBe(image)
    expect(document.getSelection()?.toString()).toBe("Label")
  })

  it("turns off a pending caret or draft and restores an underlying web link", () => {
    const paragraph = setContent('<p>Before <a href="/web">Link</a> after</p>')
    const link = paragraph.querySelector("a")!
    $.move(paragraph.firstChild!, 3)
    expect(feature.toggleAttachment()).toEqual(expect.objectContaining({identity: expect.any(String)}))
    expect(feature.toggleAttachment()).toBe("removed")
    expect(feature.getAttachmentState()).toBeNull()
    selectText(link.firstChild as Text)
    expect(feature.toggleAttachment()).toEqual(expect.objectContaining({identity: expect.any(String)}))
    expect(link.hasAttribute("data-ww-attachment")).toBe(true)
    expect(feature.toggleAttachment()).toBe("removed")
    expect(paragraph.querySelector("a")).toBe(link)
    expect(link.outerHTML).toBe('<a href="/web">Link</a>')
  })

  it("undoes and redoes attachment removal as one edit", () => {
    const paragraph = setContent('<p><a download="notes.txt" href="/notes.txt">Notes</a></p>')
    $.move(paragraph.querySelector("a")!.firstChild!, 1)
    expect(feature.toggleAttachment()).toBe("removed")
    expect(cleanHTML()).toBe("<p>Notes</p>")
    editor.doc.undo()
    expect(cleanHTML()).toBe('<p><a download="notes.txt" href="/notes.txt">Notes</a></p>')
    editor.doc.redo()
    expect(cleanHTML()).toBe("<p>Notes</p>")
  })

  it.each(["download href='data:application/octet-stream;base64,AA=='", "download href='/worksheet.pdf'", "data-ww-attachment"])(
    "tracks the live selection inside an attachment with %s", attributes => {
      const paragraph = setContent(`<p>Before <a ${attributes}>one <em>two</em></a> after</p>`)
      const link = paragraph.querySelector("a")!
      const emphasis = link.querySelector("em")!.firstChild!
      $.move(emphasis, 1)
      const state = feature.getAttachmentState()
      expect(state?.identity).toBeTruthy()
      expect(feature.getAttachmentState()).toEqual(state)
      expect(feature.getLinkState()).toBeNull()
      $.selectRange(link.firstChild!, 1, emphasis, 2)
      expect(feature.getAttachmentState()?.identity).not.toBe(state!.identity)
      $.selectElement(link, false)
      expect(feature.getAttachmentState()).not.toBeNull()
      $.selectRange(link.firstChild!, 0, paragraph.lastChild!, 2)
      expect(feature.getAttachmentState()).toBeNull()
      $.move(paragraph.firstChild!, 2)
      expect(feature.getAttachmentState()).toBeNull()
    },
  )

  it("marks the first text typed at a caret with a pending attachment", () => {
    const paragraph = setContent("<p>Before after</p>")
    $.move(paragraph.firstChild!, 7)
    const state = feature.activateAttachment()
    expect(feature.getAttachmentState()).toEqual(state)
    expect(paragraph.querySelector("a")).toBeNull()
    paragraph.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertText", data: "Notes", bubbles: true, cancelable: true,
    }))
    expect(paragraph.querySelector("a[data-ww-attachment]")?.textContent).toBe("Notes")
    expect(feature.getAttachmentState()).not.toBeNull()
  })

  it("wraps selected phrasing content and exports its exact file bytes as a download", async () => {
    const paragraph = setContent("<p>Before <em>these</em> files<!--keep--> after</p>")
    const emphasis = paragraph.querySelector("em")!
    $.selectRange(paragraph, 1, emphasis.nextSibling!, 6)
    const state = feature.activateAttachment()!
    const draft = paragraph.querySelector("a[data-ww-attachment]")!
    expect(draft.innerHTML).toBe("<em>these</em> files")
    expect(draft.hasAttribute("href")).toBe(false)
    expect(document.getSelection()?.toString()).toBe("these files")
    const file = new File([new Uint8Array([0, 255, 128])], "worksheet.bin")
    expect(await feature.attach(state.identity, {file})).toBe(true)
    const anchor = paragraph.querySelector("a")!
    expect(anchor).toBe(draft)
    expect(anchor.hasAttribute("data-ww-attachment")).toBe(false)
    expect(anchor.querySelector("em")).toBe(emphasis)
    expect(anchor.innerHTML).toBe("<em>these</em> files")
    expect(anchor.download).toBe("worksheet.bin")
    expect(anchor.getAttribute("href")).toBe("data:application/octet-stream;base64,AP+A")
    expect(paragraph.innerHTML).toContain("<!--keep--> after")
    expect(feature.getLinkState()).toBeNull()
    const exported = new DOMParser().parseFromString(await editor.serializeHTML(), "text/html")
    expect(exported.querySelector("a[download]")?.outerHTML).toBe(anchor.outerHTML)
  })

  it("inserts a filename at a caret and edits the resulting link in place", async () => {
    const paragraph = setContent("<p>Before after</p>")
    $.move(paragraph.firstChild!, 7)
    await feature.attach(feature.activateAttachment()!.identity, {file: new File(["first"], "first.txt")})
    const anchor = paragraph.querySelector("a")!
    expect(paragraph.textContent).toBe("Before first.txtafter")
    await feature.attach(feature.activateAttachment()!.identity, {file: new File(["second"], "second.txt")})
    expect(paragraph.querySelector("a")).toBe(anchor)
    expect(anchor.textContent).toBe("first.txt")
    expect(anchor.download).toBe("second.txt")
  })

  it("uses the selected media resource and excludes media inside widgets", async () => {
    const paragraph = setContent('<p>Download</p><picture><source srcset="/large.png"><img alt="Diagram" src="/fallback.png"></picture><widget-box><img src="/private.png"></widget-box>')
    const image = document.querySelector("picture img")!
    Object.defineProperty(image, "currentSrc", {value: "https://cdn.example/large.png"})
    const fetch = vi.spyOn(window, "fetch").mockResolvedValue(new Response("image bytes"))
    selectText(paragraph.firstChild as Text)
    const state = feature.activateAttachment()!
    expect(state.media).toEqual([{id: expect.any(String), label: "Diagram"}])
    await feature.attach(state.identity, {mediaId: state.media[0].id})
    expect(String(fetch.mock.calls[0][0])).toBe("https://cdn.example/large.png")
    expect(paragraph.querySelector("a")?.download).toBe("large.png")
    expect(paragraph.querySelector("a")?.getAttribute("href")).toBe("data:application/octet-stream;base64,aW1hZ2UgYnl0ZXM=")
    expect(image.getAttribute("src")).toBe("/fallback.png")
  })

  it("keeps a media URL when its server serves it as a download", async () => {
    const paragraph = setContent('<p>Download</p><video src="https://cdn.example/recording.mp4"></video>')
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(null, {headers: {"Content-Disposition": 'attachment; filename="recording.mp4"'}}))
    selectText(paragraph.firstChild as Text)
    const state = feature.activateAttachment()!
    await feature.attach(state.identity, {mediaId: state.media[0].id})
    expect(paragraph.querySelector("a")?.getAttribute("href")).toBe("https://cdn.example/recording.mp4")
  })

  it("waits for confirmation before embedding a large file and leaves the document alone on cancellation", async () => {
    const paragraph = setContent("<p>Download</p>")
    const post = vi.spyOn(editor, "postHostMessage")
    const encode = vi.spyOn(editor, "blobDataURL").mockResolvedValue("data:application/octet-stream;base64,AA==")
    selectText(paragraph.firstChild as Text)
    const {identity} = feature.activateAttachment()!
    const file = new File([new Uint8Array(5_000_001)], "large.bin")
    const first = feature.attach(identity, {file})
    const message = post.mock.calls.find(([event]) => "type" in event && event.type === "editor-attachment-confirmation")![0] as {id: string, files: object[]}
    expect(message.files).toEqual([{name: "large.bin", size: 5_000_001}])
    expect(encode).not.toHaveBeenCalled()
    expect(paragraph.querySelector("a[download]")).toBeNull()
    feature.actions.resolveAttachmentConfirmation({type: "resolveAttachmentConfirmation", id: message.id, confirmed: false})
    await expect(first).resolves.toBe(false)
    expect(paragraph.querySelector("a[download]")).toBeNull()

    post.mockClear()
    const second = feature.attach(identity, {file})
    const accepted = post.mock.calls.find(([event]) => "type" in event && event.type === "editor-attachment-confirmation")![0] as {id: string}
    feature.actions.resolveAttachmentConfirmation({type: "resolveAttachmentConfirmation", id: accepted.id, confirmed: true})
    await expect(second).resolves.toBe(true)
    expect(paragraph.querySelector("a")?.download).toBe("large.bin")
  })

  it("rechecks the live selection after reading a file", async () => {
    const paragraph = setContent("<p>Download</p><p>Elsewhere</p>")
    selectText(paragraph.firstChild as Text)
    const {identity} = feature.activateAttachment()!
    const pending = feature.attach(identity, {file: new File(["small"], "small.txt")})
    selectText(paragraph.nextElementSibling!.firstChild as Text)
    await expect(pending).rejects.toThrow(/selection changed/)
    expect(document.body.querySelector("a[download]")).toBeNull()
  })
})

describe("automatic links in the edited text block", () => {
  it("waits for whitespace while typing a URL across inline formatting", async () => {
    const block = setContent('<p><em>example</em><!--keep--><strong>.</strong></p>')
    const emphasis = block.firstChild!, comment = emphasis.nextSibling!, tail = block.lastChild!.firstChild as Text
    for(const data of ["c", "o", "m", ".", "a", "u", "/", "p", "?", "q", "=", "1", ".", " "]) {
      tail.appendData(data)
      $.move(tail, tail.length)
      block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data}))
      await settle()
      if(data !== " ") expect(block.querySelector("a")).toBeNull()
    }
    const links = Array.from(block.querySelectorAll("a"))
    expect(links.map(link => link.textContent)).toEqual(["example", ".com.au/p?q=1"])
    expect(links.map(link => link.getAttribute("href"))).toEqual(Array(2).fill("https://example.com.au/p?q=1"))
    expect(emphasis.nextSibling).toBe(comment)
    expect($.anchor!.textContent).toBe(". ")
    expect($.anchorOffset).toBe(2)
  })

  it("skips Popup toggle text while linking surrounding text", async () => {
    const block = setContent('<p>before.com <span class="ww-popup"><button popovertarget="popup-autolink-test">inside.com</button></span> after.com</p><div class="ww-popup-content" id="popup-autolink-test" popover><p></p></div>')
    const trailing = block.lastChild as Text
    $.move(trailing, trailing.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()
    expect(block.querySelector("button a")).toBeNull()
    expect(Array.from(block.querySelectorAll("a"), link => link.textContent)).toEqual(["before.com", "after.com"])
  })

  it("preserves explicitly written HTTP links and their visible text", async () => {
    const block = setContent("<p>http://example.com/path</p>")
    $.move(block.firstChild!, block.textContent!.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()
    expect(block.querySelector("a")!.getAttribute("href")).toBe("http://example.com/path")
    expect(block.textContent).toBe("http://example.com/path")
  })

  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }

  it("requires an IANA top-level domain for bare URLs, HTTP URLs, and email addresses", async () => {
    const valid = "example.dev docs.example.co.uk EXAMPLE.NET demo.xn--p1ai https://пример.рф/путь https://example.com./path reader@demo.xn--p1ai"
    const invalid = "feature.enabled example.test example.com.local example.com.123 example.com..net reader@example.com.123 reader@example.invalid https://intranet/path/example.com https://example.com@localhost https://192.0.2.1"
    const block = setContent(`<p>${valid} ${invalid}</p>`)
    $.move(block.firstChild!, block.textContent!.length)
    await settle()

    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual([
      "https://example.dev", "https://docs.example.co.uk", "https://EXAMPLE.NET", "https://demo.xn--p1ai",
      "https://пример.рф/путь", "https://example.com./path", "mailto:reader@demo.xn--p1ai",
    ])
    expect(block.textContent).toBe(`${valid} ${invalid}`)
  })

  it("links bare domains with paths, queries, ports and surrounding punctuation", async () => {
    const block = setContent('<p>Visit example.com, (docs.example.co.uk/a_(b)?q=yes#part); example.org:8443/path! EXAMPLE.NET.</p><p>untouched.com</p>')
    const text = block.firstChild as Text
    $.move(text, text.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["example.com", "https://example.com"],
      ["docs.example.co.uk/a_(b)?q=yes#part", "https://docs.example.co.uk/a_(b)?q=yes#part"],
      ["example.org:8443/path", "https://example.org:8443/path"],
      ["EXAMPLE.NET", "https://EXAMPLE.NET"],
    ])
    expect(document.body.lastElementChild!.querySelector("a")).toBeNull()
    expect($.anchor!.textContent).toBe(".")
    expect($.anchorOffset).toBe(1)
  })

  it("does not reset a live caret that remains correct when wrapping a link", async () => {
    const block = setContent("<p>example.com/path</p>")
    const text = block.firstChild as Text
    $.move(text, text.length)
    const selection = document.getSelection()!
    const restore = vi.spyOn(selection, "setBaseAndExtent")

    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()

    expect(block.querySelector("a")?.textContent).toBe("example.com/path")
    expect($.anchor).toBe(block.querySelector("a")!.firstChild)
    expect($.anchorOffset).toBe(text.length)
    expect(restore).not.toHaveBeenCalled()
  })

  it("restores backward selection endpoints when unwrapping changes their text points", async () => {
    const block = setContent("<p>example.com</p>")
    $.move(block.firstChild!, block.firstChild!.textContent!.length)
    await settle()
    const link = block.querySelector("a")!
    const text = link.firstChild as Text
    const selection = document.getSelection()!
    selection.setBaseAndExtent(block, 1, text, 3)
    const restore = vi.spyOn(selection, "setBaseAndExtent")

    text.data = "plain prose"
    await settle()

    expect(block.querySelector("a")).toBeNull()
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(text.length)
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(3)
    expect($.isBackwards).toBe(true)
    expect(restore).toHaveBeenCalledOnce()
  })

  it("links complete email addresses with mailto while leaving surrounding punctuation intact", async () => {
    const block = setContent('<p>Email reader@example.com, (First.Last+tag@sub.example.co.uk); support@example.org.</p><p>untouched@example.com</p>')
    const text = block.firstChild as Text
    $.move(text, text.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["reader@example.com", "mailto:reader@example.com"],
      ["First.Last+tag@sub.example.co.uk", "mailto:First.Last+tag@sub.example.co.uk"],
      ["support@example.org", "mailto:support@example.org"],
    ])
    expect(document.body.lastElementChild!.querySelector("a")).toBeNull()
    expect($.anchor!.textContent).toBe(".")
    expect($.anchorOffset).toBe(1)
  })

  it("recognizes and updates emails across formatting without changing authored links or excluded content", async () => {
    const block = setContent('<p><b>first.last+tag</b><em>@example.com</em><!--keep--> <a href="mailto:manual@example.com">authored@example.com</a> <code>code@example.com</code> <test-widget>widget@example.com</test-widget> <span contenteditable="false">readonly@example.com</span></p>')
    const bold = block.querySelector("b")!, emphasis = block.querySelector("em")!, comment = emphasis.nextSibling!, manual = block.querySelector("a")!
    $.move(emphasis.firstChild!, 12)
    await settle()
    expect(Array.from(bold.parentElement!.querySelectorAll("b a, em a"), link => link.getAttribute("href"))).toEqual(["mailto:first.last+tag@example.com", "mailto:first.last+tag@example.com"])
    expect(block.querySelectorAll("a")).toHaveLength(3)
    expect(block.querySelector("b")).toBe(bold)
    expect(emphasis.nextSibling).toBe(comment)
    expect(manual.getAttribute("href")).toBe("mailto:manual@example.com")
    const text = bold.querySelector("a")!.firstChild as Text
    text.data = "updated"
    $.move(text, text.length)
    await settle()
    expect(Array.from(block.querySelectorAll("b a, em a"), link => link.getAttribute("href"))).toEqual(["mailto:updated@example.com", "mailto:updated@example.com"])
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(7)
  })

  it("encodes email URI delimiters and keeps emails inside web URLs as web links", async () => {
    const block = setContent('<p>ask?me@example.com tag#name@example.com https://example.com/users/reader@example.com</p>')
    $.move(block.firstChild!, block.textContent!.length)
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual([
      "mailto:ask%3Fme@example.com", "mailto:tag%23name@example.com", "https://example.com/users/reader@example.com",
    ])
    expect(block.textContent).toBe("ask?me@example.com tag#name@example.com https://example.com/users/reader@example.com")
  })

  it("does not link malformed emails, numeric versions, invalid labels or URL/path suffixes", async () => {
    const block = setContent('<p>bad..email@example.com @example.com reader@@example.com reader@bad-.example.com reader@example.com123 1.2.3 example.com123 bad-.example.com _example.com ftp://example.com /folder/example.com example.com:99999 example.com:123456</p>')
    block.append(document.createTextNode(` ${"+".repeat(65)}@example.com`))
    $.move(block.lastChild!, block.lastChild!.textContent!.length)
    await settle()
    expect(block.querySelector("a")).toBeNull()
  })

  it("recognizes bare domains across inline formatting and updates their generated links", async () => {
    const block = setContent('<p><b>example</b><em>.com</em><!--keep--></p>')
    const bold = block.querySelector("b")!, emphasis = block.querySelector("em")!, comment = block.lastChild!
    $.move(emphasis.firstChild!, 4)
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual(["https://example.com", "https://example.com"])
    expect(block.querySelector("b")).toBe(bold)
    expect(block.querySelector("em")).toBe(emphasis)
    expect(block.lastChild).toBe(comment)
    const text = emphasis.querySelector("a")!.firstChild as Text
    text.data += "/path"
    $.move(text, text.length)
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual(["https://example.com/path", "https://example.com/path"])
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(text.length)
  })

  it("links URLs after native input, trims punctuation and scans only the edited block", async () => {
    const block = setContent('<p>Visit https://example.com/a_(b), www.example.org.</p><p>https://untouched.com</p>')
    const text = block.firstChild as Text
    $.move(text, text.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["https://example.com/a_(b)", "https://example.com/a_(b)"], ["www.example.org", "https://www.example.org"],
    ])
    expect(Array.from(block.querySelectorAll("a"), link => [link.getAttribute("target"), link.getAttribute("rel")])).toEqual([["_blank", "noopener noreferrer"], ["_blank", "noopener noreferrer"]])
    expect(document.body.lastElementChild!.querySelector("a")).toBeNull()
    expect(block.textContent).toBe("Visit https://example.com/a_(b), www.example.org.")
    expect($.anchorOffset).toBe(1)
    expect($.anchor!.textContent).toBe(".")
    expect(cleanHTML()).not.toContain("◆")
  })

  it("handles direct DOM changes and URLs across formatting without rebuilding wrappers", async () => {
    const block = setContent('<p><b class="keep">https://exa</b><span title="keep">mple.com</span><!--keep--></p>')
    const bold = block.querySelector("b")!, span = block.querySelector("span")!, comment = block.lastChild!
    $.selectRange(span.firstChild!, 5, bold.firstChild!, 3)
    await settle()
    expect(block.querySelectorAll("a")).toHaveLength(2)
    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual(["https://example.com", "https://example.com"])
    expect(block.querySelector("b")).toBe(bold)
    expect(block.querySelector("span")).toBe(span)
    expect(block.lastChild).toBe(comment)
    expect($.anchorOffset).toBe(5)
    expect($.focusOffset).toBe(3)
    const linkText = span.querySelector("a")!.firstChild as Text
    linkText.data += "/new"
    $.move(linkText, linkText.length)
    await settle()
    expect(Array.from(block.querySelectorAll("a"), link => link.getAttribute("href"))).toEqual(["https://example.com/new", "https://example.com/new"])
    const next = document.createTextNode(" https://second.com")
    span.after(next)
    await settle()
    expect(block.querySelectorAll("a")).toHaveLength(3)
  })

  it("updates generated links while leaving authored links and excluded content intact", async () => {
    const block = setContent('<p>https://example.com <a href="https://manual.test">https://label.com</a><code>https://code.com</code><test-widget>https://widget.com</test-widget><span contenteditable="false">https://readonly.com</span></p>')
    $.move(block.firstChild!, 10)
    await settle()
    const generated = block.querySelector("a")!, manual = block.querySelectorAll("a")[1]
    const text = generated.firstChild as Text
    text.data += "/new"
    $.move(text, text.length)
    block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: "/new"}))
    await settle()
    expect(block.querySelector("a")!.getAttribute("href")).toBe("https://example.com/new")
    expect(block.querySelectorAll("a")).toHaveLength(2)
    expect(manual.getAttribute("href")).toBe("https://manual.test")
    expect(block.querySelector("code a, test-widget a, [contenteditable=false] a")).toBeNull()
    const edited = block.querySelector("a")!.firstChild as Text
    edited.data = "ordinary text"
    $.move(edited, edited.length)
    await settle()
    expect(block.querySelectorAll("a")).toHaveLength(1)
    expect(block.querySelector("a")).toBe(manual)
  })

  it("waits for composition and skips disconnected or concurrently changed selection blocks", async () => {
    const block = setContent('<p>https://example.com</p><p>Keep</p>')
    $.move(block.firstChild!, 5)
    block.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    await settle()
    expect(block.querySelector("a")).toBeNull()
    block.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true}))
    await settle()
    expect(block.querySelector("a")).not.toBeNull()
    block.firstChild!.textContent = "https://changed.com"
    $.move(document.body.lastElementChild!.firstChild!, 0)
    await settle()
    expect(block.querySelector("a")!.getAttribute("href")).toBe("https://example.com")
    block.remove()
    await settle()
    expect(block.querySelectorAll("a")).toHaveLength(1)
  })

  it("recognizes remote text changes only in the currently edited block", async () => {
    const block = setContent("<p>Edited</p><p>Other</p>")
    $.move(block.firstChild!, 0)
    await settle()
    editor.doc.syncFromDOM()
    const current = (editor.doc.body.get(0) as XmlElement).get(0) as XmlText
    const other = (editor.doc.body.get(1) as XmlElement).get(0) as XmlText
    editor.doc.doc.transact(() => {
      current.insert(0, "https://remote.com ")
      other.insert(0, "https://unrelated.com ")
    }, "remote-test")
    await settle()
    expect(document.body.firstElementChild!.querySelector("a")!.getAttribute("href")).toBe("https://remote.com")
    expect(document.body.lastElementChild!.querySelector("a")).toBeNull()
  })

  it("does not reapply a link when undo restores the same plain URL text", async () => {
    const block = setContent("<p>https://example.com</p>")
    $.move(block.firstChild!, 10)
    block.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    await settle()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    block.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true}))
    await settle()
    editor.doc.syncFromDOM()
    expect(block.querySelector("a")).not.toBeNull()
    editor.doc.undo()
    await settle()
    expect(document.querySelector("p")!.textContent).toBe("https://example.com")
    expect(document.querySelector("a")).toBeNull()
    editor.doc.redo()
    await settle()
    expect(document.querySelector("a")).not.toBeNull()
  })

  it("leaves unrelated changes alone and performs one scan for a batch of text mutations", async () => {
    const block = setContent("<p>Edited</p><p>Other</p>")
    $.move(block.firstChild!, 0)
    await settle()
    const scan = vi.spyOn(feature as any, "applyAutomaticLinks")
    document.body.lastElementChild!.firstChild!.textContent = "https://unrelated.com"
    await settle()
    expect(scan).not.toHaveBeenCalled()
    block.firstChild!.textContent = "https://first.com"
    block.firstChild!.textContent = "https://last.com"
    await settle()
    expect(scan).toHaveBeenCalledTimes(1)
    expect(block.querySelectorAll("a")).toHaveLength(1)
  })

  it("supports collaboration undo and redo without immediately relinking undone text", async () => {
    const block = setContent("<p>Before</p>")
    $.move(block.firstChild!, 0)
    await settle()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const url = "https://example.com"
    block.firstChild!.textContent = url
    $.move(block.firstChild!, url.length)
    await settle()
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain('<a href="https://example.com" rel="noopener noreferrer" target="_blank">https://example.com</a>')
    editor.doc.undo()
    await settle()
    expect(document.querySelector("a")).toBeNull()
    editor.doc.redo()
    await settle()
    expect(document.querySelector("a")!.getAttribute("href")).toBe("https://example.com")
  })
})
