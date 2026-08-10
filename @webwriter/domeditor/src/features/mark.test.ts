// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {markNames, primaryMarkOptions} from "../marks"
import {$} from "../utility"

const editor = new DOMEditor()
const feature = editor.features.mark

beforeEach(() => {
  document.body.innerHTML = ""
  document.getSelection()?.removeAllRanges()
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
  it("disables marks for collapsed, element, atomic, and cross-block selections", () => {
    let paragraph = setContent("<p>Text</p>")
    const text = paragraph.firstChild as Text
    $.move(text, 2)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    $.selectElement(paragraph)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    paragraph = setContent("<p>A<img alt='x'>B</p>")
    $.selectRange(paragraph, 0, paragraph, 3)
    expect(feature.getState()).toEqual({canMark: false, marks: []})

    document.body.innerHTML = "<p>A</p><p>B</p>"
    $.selectRange(document.querySelector("p")!.firstChild!, 0, document.querySelector("p:last-child")!.firstChild!, 1)
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
      expect(cleanHTML()).toBe(`<p><${mark}>Text</${mark}></p>`)
      expect(feature.getState().marks).toEqual([mark])

      expect(feature.toggleMark(mark)).toBe(true)
      expect(cleanHTML()).toBe("<p>Text</p>")
      expect(feature.getState().marks).toEqual([])
    }
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
    const paragraph = setContent("<p><b><i>abcd</i></b></p>")
    const text = paragraph.querySelector("i")!.firstChild as Text
    selectText(text, 1, 3)

    feature.toggleMark("b")

    expect(cleanHTML()).toBe("<p><b><i>a</i></b><i>bc</i><b><i>d</i></b></p>")
    expect(document.getSelection()!.toString()).toBe("bc")
    expect(feature.getState()).toEqual({canMark: true, marks: ["i"]})
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
})

describe("MarkFeature shortcuts", () => {
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
})
