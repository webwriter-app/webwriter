// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import '@testing-library/jest-dom/vitest'

import {
  $, getContainer, getSidesOfPoint, getSelectionAnchorBlock, getSelectionFocusBlock,
  getIndexBefore, isElement, isComment, isText, isDocument, isOnApple, modifierKeyDown,
  getPathTo, htmlToFragment, roundByDPR, roundTo, angleOnCircle, rotatePoint,
  distanceBetweenPoints, midpoint, intersectionPoint, findClosest, findContainingBlock,
  findScrollingAncestor, compareStackingOrder, getDescendantsInStackingOrder,
  createsStackingContext, findStackingContainer, getZPos, getStaticCoords
} from "./utility"
import { Schema } from "./schema"

// Tests for the EditingSelection class. No DOMEditor is instantiated, so the
// selection state is not post-processed by any editor feature.
// Not testable in happy-dom: extendBy()/moveBy() (require Selection.modify)
// and selectCoords() (requires layout via caretPositionFromPoint).

beforeEach(() => {
  document.body.innerHTML = ""
  $.selectDocumentStart()
})

function setBody(html: string) {
  document.body.innerHTML = html
}

function firstText(parent: Element | null = document.body.firstElementChild) {
  return parent!.firstChild as Text
}

describe("selectRange()", () => {
  it("sets anchor and focus", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 2, firstText(), 5)
    expect($.anchor).toBe(firstText())
    expect($.anchorOffset).toBe(2)
    expect($.focus).toBe(firstText())
    expect($.focusOffset).toBe(5)
  })
  it("collapses when only an anchor is given", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 2)
    expect($.isEmpty).toBe(true)
    expect($.anchorOffset).toBe(2)
  })
})

describe("selectElement()", () => {
  it("selects the element", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.isElementSelection).toBe(true)
    expect($.selectedElement).toBe(document.body.firstElementChild)
  })
  it("anchors the selection in the parent", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.anchor).toBe(document.body)
    expect(Math.abs($.anchorOffset - $.focusOffset)).toBe(1)
  })
})

describe("selectGap()", () => {
  it("places the caret after the element", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(1)
    expect($.isEmpty).toBe(true)
  })
  it("places the caret before the element", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!, "before")
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
  })
})

describe("selectDocumentStart()", () => {
  it("places a collapsed selection at the body start", () => {
    setBody("<p>a</p>")
    $.selectDocumentStart()
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect($.isEmpty).toBe(true)
  })
})

describe("selectCoords()", () => {
  const originalElementFromPoint = document.elementFromPoint
  const originalCaretPositionFromPoint = document.caretPositionFromPoint

  afterEach(() => {
    Object.defineProperty(document, "elementFromPoint", {configurable: true, value: originalElementFromPoint})
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: originalCaretPositionFromPoint})
  })

  function mockHitTest(text: Text, offset: number, element: Element = document.body) {
    Object.defineProperty(document, "elementFromPoint", {configurable: true, value: () => element})
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({offsetNode: text, offset})
    })
  }

  function setBlockRect(block: Element, top: number, bottom: number) {
    Object.defineProperty(block, "getBoundingClientRect", {
      configurable: true,
      value: () => ({top, bottom})
    })
  }

  it("selects the first text position when clicking beside the block", () => {
    setBody("<p>hello</p>")
    const block = document.body.firstElementChild!
    const text = block.firstChild as Text
    setBlockRect(block, 100, 120)
    mockHitTest(text, 0)

    $.selectCoords(0, 110)

    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(0)
  })

  it("selects the last text position when clicking beside the block", () => {
    setBody("<p>hello</p>")
    const block = document.body.firstElementChild!
    const text = block.firstChild as Text
    setBlockRect(block, 100, 120)
    mockHitTest(text, text.length)

    $.selectCoords(100, 110)

    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(text.length)
  })

  it("keeps selecting a gap when clicking outside the block vertically", () => {
    setBody("<p>hello</p><p>world</p>")
    const block = document.body.firstElementChild!
    const text = block.firstChild as Text
    setBlockRect(block, 100, 120)
    mockHitTest(text, 0)

    $.selectCoords(0, 90)

    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
  })
})

describe("range", () => {
  it("reflects the current selection", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 1, firstText(), 4)
    expect($.range.startContainer).toBe(firstText())
    expect($.range.startOffset).toBe(1)
    expect($.range.endOffset).toBe(4)
  })
})

describe("isEmpty", () => {
  it("is true for a collapsed selection", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 2)
    expect($.isEmpty).toBe(true)
  })
  it("is false for a range selection", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 2)
    expect($.isEmpty).toBe(false)
  })
})

describe("isGapSelection", () => {
  it("is true for a caret between elements", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!)
    expect($.isGapSelection).toBe(true)
  })
  it("is false for a caret in text", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 2)
    expect($.isGapSelection).toBe(false)
  })
  it("is false for a caret in an element with text children", () => {
    setBody("<p>hello</p>")
    $.move(document.body.firstElementChild!, 0)
    expect($.isGapSelection).toBe(false)
  })
  it("is false for a caret in an empty element", () => {
    setBody("<p></p>")
    $.move(document.body.firstElementChild!, 0)
    expect($.isGapSelection).toBe(false)
  })
})

describe("isElementSelection", () => {
  it("is true when an element is selected", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.isElementSelection).toBe(true)
  })
  it("is false for a text range", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 2)
    expect($.isElementSelection).toBe(false)
  })
  it("is false for a gap selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!)
    expect($.isElementSelection).toBe(false)
  })
})

describe("isTextSelection", () => {
  it("is true for a range within one text node", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 2)
    expect($.isTextSelection).toBe(true)
  })
  it("is true for a caret in a non-empty text node", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 2)
    expect($.isTextSelection).toBe(true)
  })
  it("is false for an element selection", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.isTextSelection).toBe(false)
  })
  it("is false for a cross-node selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.isTextSelection).toBe(false)
  })
})

describe("isEmptySelection", () => {
  it("is true for a caret in an empty element", () => {
    setBody("<p></p>")
    $.move(document.body.firstElementChild!, 0)
    expect($.isEmptySelection).toBe(true)
  })
  it("is true for a caret in an element with only an empty text node", () => {
    setBody("<p></p>")
    const empty = document.createTextNode("")
    document.body.firstElementChild!.append(empty)
    $.move(empty, 0)
    expect($.isEmptySelection).toBe(true)
  })
  it("is false for a caret in a non-empty element", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 0)
    expect($.isEmptySelection).toBeFalsy()
  })
})

describe("isCrossNodeSelection", () => {
  it("is true when anchor and focus differ", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.isCrossNodeSelection).toBe(true)
  })
  it("is false when anchor and focus are the same node", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 3)
    expect($.isCrossNodeSelection).toBe(false)
  })
})

describe("isEmptyDocumentSelection", () => {
  it("is true for a collapsed selection in an empty body", () => {
    $.selectDocumentStart()
    expect($.isEmptyDocumentSelection).toBe(true)
  })
  it("is false when the body has content", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 0)
    expect($.isEmptyDocumentSelection).toBe(false)
  })
  it("ignores contenteditable=false elements", () => {
    setBody(`<div contenteditable="false"></div>`)
    $.selectDocumentStart()
    expect($.isEmptyDocumentSelection).toBe(true)
  })
})

describe("isBackwards, start/end", () => {
  it("is forwards for an ordered selection", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 2, firstText(), 5)
    expect($.isBackwards).toBe(false)
    expect($.start).toBe(firstText())
    expect($.startOffset).toBe(2)
    expect($.endOffset).toBe(5)
  })
  it("normalizes a reversed selection in one node", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 5, firstText(), 2)
    expect($.isBackwards).toBe(true)
    expect($.startOffset).toBe(2)
    expect($.endOffset).toBe(5)
  })
  it("normalizes a reversed cross-node selection", () => {
    setBody("<p>a</p><p>b</p>")
    const ta = firstText(); const tb = firstText(document.body.lastElementChild)
    $.selectRange(tb, 1, ta, 0)
    expect($.isBackwards).toBe(true)
    expect($.start).toBe(ta)
    expect($.end).toBe(tb)
  })
  it("is not backwards for a collapsed selection", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 2)
    expect($.isBackwards).toBe(false)
  })
})

describe("commonAncestor", () => {
  it("is the text node for a selection within it", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 3)
    expect($.commonAncestor).toBe(firstText())
  })
  it("is the shared parent for a cross-block selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.commonAncestor).toBe(document.body)
  })
})

describe("selectedElement", () => {
  it("returns the selected element", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.selectedElement).toBe(document.body.firstElementChild)
  })
  it("returns the element for a reversed element selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(document.body, 1, document.body, 0)
    expect($.selectedElement).toBe(document.body.firstElementChild)
  })
  it("is undefined for a text selection", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 3)
    expect($.selectedElement).toBeUndefined()
  })
})

describe("anchorContainer/focusContainer", () => {
  it("returns the parent element for text anchors", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.anchorContainer).toBe(document.body.firstElementChild)
    expect($.focusContainer).toBe(document.body.lastElementChild)
  })
  it("returns the element itself for element anchors", () => {
    setBody("<p>hello</p>")
    $.move(document.body.firstElementChild!, 0)
    expect($.anchorContainer).toBe(document.body.firstElementChild)
  })
})

describe("siblings", () => {
  it("returns the child nodes of the common ancestor", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.siblings).toEqual([document.body.firstElementChild, document.body.lastElementChild])
  })
  it("is empty when the common ancestor is a text node", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 0, firstText(), 3)
    expect($.siblings).toEqual([])
  })
})

describe("slice/copy()", () => {
  it("clones the selected content without removing it", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 0, firstText(), 5)
    const fragment = $.slice
    expect(fragment.textContent).toBe("hello")
    expect(document.body.innerHTML).toBe("<p>hello world</p>")
  })
  it("clones a selected element", () => {
    setBody("<p>hello</p>")
    $.selectElement(document.body.firstElementChild!)
    const fragment = $.copy()
    expect(fragment.firstElementChild?.outerHTML).toBe("<p>hello</p>")
    expect(document.body.innerHTML).toBe("<p>hello</p>")
  })
})

describe("nodesBetween", () => {
  it("returns the selected element for an element selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectElement(document.body.firstElementChild!)
    expect($.nodesBetween).toEqual([document.body.firstElementChild])
  })
  it("is empty for a selection within a single text node (the common ancestor has no children)", () => {
    setBody("hello world")
    $.selectRange(document.body.firstChild!, 0, document.body.firstChild!, 5)
    expect($.nodesBetween).toEqual([])
  })
  it("includes the blocks containing both selection endpoints", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect($.nodesBetween).toEqual([document.body.firstElementChild, document.body.lastElementChild])
  })
})

describe("elementBefore/elementAfter", () => {
  it("returns the adjacent siblings of a selected element", () => {
    setBody("<p>a</p><hr><p>b</p>")
    $.selectElement(document.body.children.item(1)!)
    expect($.elementBefore).toBe(document.body.firstElementChild)
    expect($.elementAfter).toBe(document.body.lastElementChild)
  })
  it("returns the elements around a gap selection", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!)
    expect($.elementBefore).toBe(document.body.firstElementChild)
    expect($.elementAfter).toBe(document.body.lastElementChild)
  })
  it("has no elementBefore for a gap at the container start", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectGap(document.body.firstElementChild!, "before")
    expect($.elementBefore).toBeFalsy()
    expect($.elementAfter).toBe(document.body.firstElementChild)
  })
  it("returns the container's siblings for a caret in text", () => {
    setBody("<div>x</div><p>b</p>")
    $.move(firstText(document.body.lastElementChild), 0)
    expect($.elementBefore).toBe(document.body.firstElementChild)
    expect($.elementAfter).toBeFalsy()
  })
})

describe("delete()", () => {
  it("removes the selected content", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 0, firstText(), 6)
    $.delete()
    expect(document.body.innerHTML).toBe("<p>world</p>")
  })
  it("does nothing for a collapsed selection", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 2)
    $.delete()
    expect(document.body.innerHTML).toBe("<p>hello</p>")
  })
})

describe("cut()", () => {
  it("extracts and returns the selected content", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 0, firstText(), 5)
    const fragment = $.cut()
    expect(fragment.textContent).toBe("hello")
    expect(document.body.innerHTML).toBe("<p> world</p>")
  })
})

describe("replace()", () => {
  it("replaces the selected content with a node", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 0, firstText(), 5)
    $.replace(document.createElement("b"))
    expect(document.body.innerHTML).toBe("<p><b></b> world</p>")
  })
  it("inserts multiple nodes in order", () => {
    setBody("<p>hello world</p>")
    $.selectRange(firstText(), 0, firstText(), 5)
    $.replace(document.createElement("b"), document.createElement("u"))
    expect(document.body.innerHTML).toBe("<p><b></b><u></u> world</p>")
  })
  it("inserts at the caret for a collapsed selection", () => {
    setBody("<p>hello world</p>")
    $.move(firstText(), 5)
    $.replace(document.createElement("b"))
    expect(document.body.innerHTML).toBe("<p>hello<b></b> world</p>")
  })
})

describe("extend()", () => {
  it("extends the focus while keeping the anchor", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 1)
    $.extend(firstText(), 4)
    expect($.anchorOffset).toBe(1)
    expect($.focusOffset).toBe(4)
    expect($.isEmpty).toBe(false)
  })
})

describe("move()", () => {
  it("places a collapsed selection at the given offset", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), 3)
    expect($.anchor).toBe(firstText())
    expect($.anchorOffset).toBe(3)
    expect($.isEmpty).toBe(true)
  })
  it("counts negative offsets from the end of a text node", () => {
    setBody("<p>hello</p>")
    $.move(firstText(), -1)
    expect($.anchorOffset).toBe(5)
  })
  it("counts negative offsets from the end of an element", () => {
    setBody("<p>a</p><p>b</p>")
    $.move(document.body, -1)
    expect($.anchorOffset).toBe(2)
  })
})

describe("getNodesInRange()", () => {
  it("returns the nodes within the range", () => {
    setBody("<p>a</p><p>b</p><p>c</p>")
    const range = document.createRange()
    range.setStart(document.body, 0)
    range.setEnd(document.body, 2)
    expect($.getNodesInRange(range)).toEqual([document.body.children.item(0), document.body.children.item(1)])
  })
  it("throws for a range in a detached text node", () => {
    const detached = document.createTextNode("hello")
    const range = document.createRange()
    range.setStart(detached, 0)
    range.setEnd(detached, 2)
    expect(() => $.getNodesInRange(range)).toThrow(TypeError)
  })
})

describe("toString()", () => {
  it("formats the selection as anchor@offset-focus@offset", () => {
    setBody("<p>hello</p>")
    $.selectRange(firstText(), 2, firstText(), 5)
    expect($.toString()).toBe("#text@2-#text@5")
  })
})

// Standalone functions ///////////////////////////////////////////////////////

describe("getContainer()", () => {
  it("returns the parent element of a text node", () => {
    setBody("<p>hello</p>")
    expect(getContainer(firstText())).toBe(document.body.firstElementChild)
  })
  it("returns an element itself", () => {
    setBody("<p>hello</p>")
    expect(getContainer(document.body.firstElementChild!)).toBe(document.body.firstElementChild)
  })
})

describe("getSidesOfPoint()", () => {
  it("splits the container's children around the point", () => {
    setBody("<p>a</p><p>b</p><p>c</p>")
    const point = document.createRange()
    point.setStart(document.body, 1)
    const [left, right] = getSidesOfPoint(point)
    expect(left).toEqual([document.body.children.item(0)])
    expect(right).toEqual([document.body.children.item(1), document.body.children.item(2)])
  })
  it("puts all children right of a point at the container start", () => {
    setBody("<p>a</p><p>b</p>")
    const point = document.createRange()
    point.setStart(document.body, 0)
    const [left, right] = getSidesOfPoint(point)
    expect(left).toEqual([])
    expect(right).toEqual(Array.from(document.body.children))
  })
  it("resolves a point inside a text node against its parent", () => {
    setBody("<p>hello</p>")
    const point = document.createRange()
    point.setStart(firstText(), 3)
    const [left, right] = getSidesOfPoint(point)
    expect(left).toEqual([firstText()])
    expect(right).toEqual([])
  })
})

describe("getSelectionAnchorBlock()/getSelectionFocusBlock()", () => {
  const schema = new Schema()
  it("returns the nearest block container of the anchor", () => {
    setBody("<p><b>hello</b></p>")
    $.move(firstText(document.querySelector("b")), 2)
    expect(getSelectionAnchorBlock(schema)).toBe(document.body.firstElementChild)
  })
  it("returns the nearest block container of the focus", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(firstText(), 0, firstText(document.body.lastElementChild), 1)
    expect(getSelectionFocusBlock(schema)).toBe(document.body.lastElementChild)
  })
})

describe("getIndexBefore()", () => {
  it("returns the index of the node preceding the range", () => {
    setBody("<p>a</p><p>b</p><p>c</p>")
    $.selectRange(document.body, 1, document.body, 3)
    expect(getIndexBefore($.range)).toBe(0)
  })
  it("returns -1 when the range starts at the container start", () => {
    setBody("<p>a</p><p>b</p>")
    $.selectRange(document.body, 0, document.body, 1)
    expect(getIndexBefore($.range)).toBe(-1)
  })
})

describe("type guards", () => {
  it("classify the node types", () => {
    const el = document.createElement("p")
    const text = document.createTextNode("x")
    const comment = document.createComment("x")
    expect(isElement(el)).toBe(true)
    expect(isElement(text)).toBe(false)
    expect(isText(text)).toBe(true)
    expect(isText(el)).toBe(false)
    expect(isComment(comment)).toBe(true)
    expect(isComment(el)).toBe(false)
    expect(isDocument(document)).toBe(true)
    expect(isDocument(el)).toBe(false)
  })
  it("reject non-node values", () => {
    expect(isElement(null)).toBe(false)
    expect(isElement("p")).toBe(false)
    expect(isText(undefined)).toBe(false)
    expect(isComment({})).toBe(false)
    expect(isDocument(null)).toBe(false)
  })
})

describe("isOnApple()/modifierKeyDown()", () => {
  const originalPlatform = navigator.platform
  const stubPlatform = (value: string) =>
    Object.defineProperty(navigator, "platform", {value, configurable: true})
  afterEach(() => stubPlatform(originalPlatform))

  it("uses the meta key on Apple platforms", () => {
    stubPlatform("MacIntel")
    expect(isOnApple()).toBe(true)
    expect(modifierKeyDown(new KeyboardEvent("keydown", {metaKey: true}))).toBe(true)
    expect(modifierKeyDown(new KeyboardEvent("keydown", {ctrlKey: true}))).toBe(false)
  })
  it("uses the ctrl key elsewhere", () => {
    stubPlatform("Win32")
    expect(isOnApple()).toBe(false)
    expect(modifierKeyDown(new KeyboardEvent("keydown", {ctrlKey: true}))).toBe(true)
    expect(modifierKeyDown(new KeyboardEvent("keydown", {metaKey: true}))).toBe(false)
  })
})

describe("getPathTo()", () => {
  it("returns an empty string for null", () => {
    expect(getPathTo(null)).toBe("")
  })
  it("uses the id when present", () => {
    setBody(`<div id="foo"></div>`)
    expect(getPathTo(document.body.firstElementChild)).toBe(`id("foo")`)
  })
  it("returns BODY for the body element", () => {
    expect(getPathTo(document.body)).toBe("BODY")
  })
  it("builds an indexed path for nested elements", () => {
    setBody("<div><p>a</p><p>b</p></div>")
    expect(getPathTo(document.querySelectorAll("p").item(1))).toBe("BODY/DIV[1]/P[2]")
  })
  it("anchors the path at the nearest id", () => {
    setBody(`<div id="x"><p>a</p></div>`)
    expect(getPathTo(document.querySelector("p"))).toBe(`id("x")/P[1]`)
  })
  it("returns an empty string for a detached element", () => {
    expect(getPathTo(document.createElement("p"))).toBe("")
  })
})

describe("htmlToFragment()", () => {
  it("parses HTML into a fragment", () => {
    const fragment = htmlToFragment("<p>a</p><b>c</b>")
    expect(fragment).toBeInstanceOf(DocumentFragment)
    expect(Array.from(fragment.children).map(el => el.tagName)).toEqual(["P", "B"])
  })
  it("parses plain text", () => {
    const fragment = htmlToFragment("hello")
    expect(fragment.firstChild).toBeInstanceOf(Text)
    expect(fragment.textContent).toBe("hello")
  })
})

describe("roundByDPR()", () => {
  const originalDPR = window.devicePixelRatio
  const stubDPR = (value: number) =>
    Object.defineProperty(window, "devicePixelRatio", {value, configurable: true})
  afterEach(() => stubDPR(originalDPR))

  it("rounds to integers at a device pixel ratio of 1", () => {
    expect(roundByDPR(1.4)).toBe(1)
    expect(roundByDPR(1.5)).toBe(2)
  })
  it("rounds to half pixels at a device pixel ratio of 2", () => {
    stubDPR(2)
    expect(roundByDPR(1.3)).toBe(1.5)
    expect(roundByDPR(1.2)).toBe(1)
  })
})

describe("roundTo()", () => {
  it("rounds to the nearest multiple", () => {
    expect(roundTo(7, 5)).toBe(5)
    expect(roundTo(8, 5)).toBe(10)
    expect(roundTo(0.3, 0.25)).toBe(0.25)
  })
})

describe("angleOnCircle()", () => {
  it("measures the angle between two points on a circle", () => {
    expect(angleOnCircle(0, 0, 1, 0, 0, 1)).toBeCloseTo(90)
    expect(angleOnCircle(0, 0, 1, 0, 0, -1)).toBeCloseTo(-90)
  })
})

describe("rotatePoint()", () => {
  it("rotates a point around the origin", () => {
    const [x, y] = rotatePoint(1, 0, 0, 0, 90)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1)
  })
  it("rotates a point around an arbitrary center", () => {
    const [x, y] = rotatePoint(2, 1, 1, 1, 90)
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(2)
  })
  it("rotates by 180 degrees", () => {
    const [x, y] = rotatePoint(1, 0, 0, 0, 180)
    expect(x).toBeCloseTo(-1)
    expect(y).toBeCloseTo(0)
  })
})

describe("distanceBetweenPoints()", () => {
  it("measures the euclidean distance", () => {
    expect(distanceBetweenPoints(0, 0, 3, 4)).toBe(5)
    expect(distanceBetweenPoints(1, 1, 1, 1)).toBe(0)
  })
})

describe("midpoint()", () => {
  it("returns the point in the middle", () => {
    expect(midpoint(0, 0, 4, 2)).toEqual([2, 1])
  })
})

describe("intersectionPoint()", () => {
  it("returns the intersection of two crossing segments", () => {
    expect(intersectionPoint(0, 0, 2, 2, 0, 2, 2, 0)).toEqual([1, 1])
  })
  it("returns false for non-intersecting segments", () => {
    expect(intersectionPoint(0, 0, 1, 1, 3, 0, 3, 1)).toBe(false)
  })
  it("returns false for parallel segments", () => {
    expect(intersectionPoint(0, 0, 1, 0, 0, 1, 1, 1)).toBe(false)
  })
})

describe("findClosest()", () => {
  it("returns the element itself when it matches", () => {
    setBody("<div><p>a</p></div>")
    const p = document.querySelector("p")!
    expect(findClosest(p as HTMLElement, n => n.tagName === "P")).toBe(p)
  })
  it("returns the nearest matching ancestor", () => {
    setBody("<div><p><b>a</b></p></div>")
    const b = document.querySelector("b")!
    expect(findClosest(b as HTMLElement, n => n.tagName === "DIV")).toBe(document.querySelector("div"))
  })
  it("returns undefined when nothing matches", () => {
    setBody("<div><p>a</p></div>")
    const p = document.querySelector("p")!
    expect(findClosest(p as HTMLElement, n => n.tagName === "TABLE")).toBeUndefined()
  })
})

describe("findContainingBlock()", () => {
  it("returns the nearest block-level ancestor for static elements", () => {
    setBody("<div><span><b>x</b></span></div>")
    const b = document.querySelector("b") as HTMLElement
    expect(findContainingBlock(b)).toBe(document.querySelector("div"))
  })
  it("returns the nearest positioned ancestor for absolute elements", () => {
    setBody(`<div style="position: relative"><p><b>x</b></p></div>`)
    const b = document.querySelector("b") as HTMLElement
    expect(findContainingBlock(b, "absolute")).toBe(document.querySelector("div"))
  })
  it("returns window for absolute elements without a positioned ancestor", () => {
    setBody("<p><b>x</b></p>")
    const b = document.querySelector("b") as HTMLElement
    expect(findContainingBlock(b, "absolute")).toBe(window)
  })
  it("returns the nearest transformed ancestor for fixed elements", () => {
    setBody(`<div style="transform: rotate(3deg)"><p><b>x</b></p></div>`)
    const b = document.querySelector("b") as HTMLElement
    expect(findContainingBlock(b, "fixed")).toBe(document.querySelector("div"))
  })
  it("returns window for fixed elements without a transformed ancestor", () => {
    setBody("<p><b>x</b></p>")
    const b = document.querySelector("b") as HTMLElement
    expect(findContainingBlock(b, "fixed")).toBe(window)
  })
  it("returns window for a detached element", () => {
    expect(findContainingBlock(document.createElement("p"))).toBe(window)
  })
  it("throws for an invalid position mode", () => {
    setBody("<p>x</p>")
    expect(() => findContainingBlock(document.querySelector("p") as HTMLElement, "bogus" as any)).toThrow(TypeError)
  })
})

describe("findScrollingAncestor()", () => {
  it("returns the nearest scrolling ancestor", () => {
    setBody(`<div style="overflow: scroll"><p>x</p></div>`)
    expect(findScrollingAncestor(document.querySelector("p") as HTMLElement)).toBe(document.querySelector("div"))
  })
  it("returns the element itself when it scrolls", () => {
    setBody(`<div style="overflow: auto"></div>`)
    const div = document.querySelector("div") as HTMLElement
    expect(findScrollingAncestor(div)).toBe(div)
  })
  it("returns undefined when no ancestor scrolls", () => {
    setBody("<div><p>x</p></div>")
    expect(findScrollingAncestor(document.querySelector("p") as HTMLElement)).toBeUndefined()
  })
})

describe("createsStackingContext()", () => {
  it("is true for the document element", () => {
    expect(createsStackingContext(document.documentElement)).toBe(true)
  })
  it("is false for a plain element", () => {
    setBody("<div></div>")
    expect(createsStackingContext(document.querySelector("div") as HTMLElement)).toBe(false)
  })
  it("is true for a positioned element with a z-index", () => {
    setBody(`<div style="position: relative; z-index: 1"></div>`)
    expect(createsStackingContext(document.querySelector("div") as HTMLElement)).toBe(true)
  })
  it("is true for a transformed element", () => {
    setBody(`<div style="transform: rotate(3deg)"></div>`)
    expect(createsStackingContext(document.querySelector("div") as HTMLElement)).toBe(true)
  })
  it("is true for a translucent element", () => {
    setBody(`<div style="opacity: 0.5"></div>`)
    expect(createsStackingContext(document.querySelector("div") as HTMLElement)).toBe(true)
  })
  it("is true for an isolated element", () => {
    setBody(`<div style="isolation: isolate"></div>`)
    expect(createsStackingContext(document.querySelector("div") as HTMLElement)).toBe(true)
  })
})

describe("findStackingContainer()", () => {
  it("returns the nearest ancestor creating a stacking context", () => {
    setBody(`<div style="transform: rotate(3deg)"><p><b>x</b></p></div>`)
    expect(findStackingContainer(document.querySelector("b") as HTMLElement)).toBe(document.querySelector("div"))
  })
  it("falls back to the document element", () => {
    setBody("<div><p>x</p></div>")
    expect(findStackingContainer(document.querySelector("p") as HTMLElement)).toBe(document.documentElement)
  })
})

describe("compareStackingOrder()", () => {
  it("orders equal-z siblings by DOM order", () => {
    setBody("<div>a</div><div>b</div>")
    const [first, second] = Array.from(document.body.children) as HTMLElement[]
    expect(compareStackingOrder(second, first)).toBe(1)
    expect(compareStackingOrder(first, second)).toBe(-1)
  })
  it("orders by z-index when stacking contexts differ", () => {
    setBody(`<div style="position: relative; z-index: 3">a</div><div style="position: relative; z-index: 2">b</div>`)
    const [high, low] = Array.from(document.body.children) as HTMLElement[]
    expect(compareStackingOrder(high, low)).toBe(1)
    expect(compareStackingOrder(low, high)).toBe(-1)
  })
  it("throws when comparing a node with itself", () => {
    setBody("<div></div>")
    const div = document.querySelector("div") as HTMLElement
    expect(() => compareStackingOrder(div, div)).toThrow()
  })
})

describe("getDescendantsInStackingOrder()", () => {
  it("sorts descendants by ascending z-index", () => {
    setBody(`<div id="top" style="position: relative; z-index: 2"></div><div id="bottom" style="position: relative; z-index: 1"></div>`)
    const ordered = getDescendantsInStackingOrder(document.body, "div")
    expect(ordered.map(el => el.id)).toEqual(["bottom", "top"])
  })
})

describe("getZPos()", () => {
  it("returns the element's index in stacking order", () => {
    setBody("<div>a</div><div>b</div><div>c</div>")
    const middle = document.body.children.item(1) as HTMLElement
    expect(getZPos(middle, "div")).toBe(1)
  })
})

describe("getStaticCoords()", () => {
  it("returns coordinates and leaves the document unchanged", () => {
    setBody("<p>hello</p><p>world</p>")
    const coords = getStaticCoords(document.body.lastElementChild as HTMLElement)
    expect(coords).toHaveLength(2)
    coords.forEach(c => expect(typeof c).toBe("number"))
    expect(document.body.innerHTML).toBe("<p>hello</p><p>world</p>")
  })
})
