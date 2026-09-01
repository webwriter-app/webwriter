// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {markNames, normalizeMarkElements, primaryMarkOptions, standardMarkShortcutNames} from "../marks"
import {$} from "../utility"

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

  it("disables marks for element, gap, atomic, cross-block, and non-editable selections", () => {
    let paragraph = setContent("<p>Text</p>")

    $.selectElement(paragraph)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    paragraph = setContent("<p>A<img alt='x'>B</p>")
    $.selectRange(paragraph, 0, paragraph, 3)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    document.body.innerHTML = "<p>A</p><p>B</p>"
    $.selectRange(document.querySelector("p")!.firstChild!, 0, document.querySelector("p:last-child")!.firstChild!, 1)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    $.selectGap(document.querySelector("p")!)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    paragraph = setContent('<p><span contenteditable="false">Text</span></p>')
    $.move(paragraph.querySelector("span")!.firstChild!, 2)
    expect(feature.getState()).toEqual({canMark: false, marks: []})
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

    normalizeMarkElements(paragraph)

    expect(paragraph.querySelectorAll("ruby")).toHaveLength(2)
    expect(cleanHTML()).toBe("<p><ruby>漢<rt>かん</rt></ruby><ruby>字<rt>じ</rt></ruby></p>")
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

  it("reads, sets, and removes mark-specific attributes", () => {
    const paragraph = setContent('<p><a href="/old" target="_blank">Text</a></p>')
    selectText(paragraph.querySelector("a")!.firstChild as Text)

    expect(feature.getAttributeState()).toEqual({
      a: {
        href: "/old",
        target: "_blank",
        download: "",
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
        download: "",
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

  it("provides and handles a unique Alt/Option+Shift shortcut for every primary mark", () => {
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

      expect(event.defaultPrevented, option.name).toBe(true)
      expect(paragraph.querySelector(option.name), option.name).not.toBeNull()
    }
  })

  it("does not consume shortcuts for a non-text selection", () => {
    const paragraph = setContent("<p>Text</p>")
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
