// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { SelectionFeature } from "./selection"
import { $ } from "../utility"

var editor = new DOMEditor()
const feature = editor.features.selection

// Not testable in happy-dom: plain pointerdown drag selection and pointermove
// (require document.caretPositionFromPoint) and double/triple click word/line
// selection (requires Selection.modify). These are exercised in the browser.

beforeEach(() => {
  document.body.innerHTML = ""
  document.body.className = ""
})

function el(tag = "p", text = "") {
  const element = document.createElement(tag)
  element.textContent = text
  document.body.append(element)
  return element
}

describe("processSelection()", () => {
  it("marks a selected element", () => {
    const p = el("p", "hello")
    $.selectElement(p)
    feature.processSelection()
    expect(p.classList.contains("◆element-selected")).toBe(true)
  })
  it("skips element markers during drag selection", () => {
    const p = el("p", "hello")
    $.selectElement(p)
    feature.processSelection(true)
    expect(p.classList.contains("◆element-selected")).toBe(false)
  })
  it("marks the container of a text selection", () => {
    const p = el("p", "hello")
    $.selectRange(p.firstChild!, 0, p.firstChild!, 3)
    feature.processSelection()
    expect(p.classList.contains("◆text-selected")).toBe(true)
  })
  it("marks the container of a caret in text", () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 2)
    feature.processSelection()
    expect(p.classList.contains("◆text-selected")).toBe(true)
  })
  it("marks an empty element containing the caret", () => {
    const p = el("p")
    $.move(p, 0)
    feature.processSelection()
    expect(p.classList.contains("◆empty-selected")).toBe(true)
  })
  it("marks the element before a gap and shows the gap caret", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectGap(p1)
    feature.processSelection()
    expect(p1.classList.contains("◆gap-after-selected")).toBe(true)
    expect(feature.gapCaret).not.toBeNull()
    expect(feature.gapCaret!.classList.contains("◆gap-after-selected")).toBe(true)
    expect(feature.gapCaret!.hasAttribute("visibility")).toBe(false)
  })
  it("marks the element after a gap at the container start", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectGap(p1, "before")
    feature.processSelection()
    expect(p1.classList.contains("◆gap-before-selected")).toBe(true)
  })
  it("clears previous markers when the selection changes", () => {
    const p1 = el("p", "a"); const p2 = el("p", "b")
    $.selectRange(p1.firstChild!, 0, p1.firstChild!, 1)
    feature.processSelection()
    expect(p1.classList.contains("◆text-selected")).toBe(true)
    $.selectElement(p2)
    feature.processSelection()
    expect(p1.hasAttribute("class")).toBe(false)
    expect(p2.classList.contains("◆element-selected")).toBe(true)
  })
  it("hides the gap caret when leaving a gap selection", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectGap(p1)
    feature.processSelection()
    $.move(p1.firstChild!, 0)
    feature.processSelection()
    expect(feature.gapCaret!.getAttribute("visibility")).toBe("hidden")
  })
})

describe("gapAnchor", () => {
  it("returns the gap-marked element, not the caret", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectGap(p1)
    feature.processSelection()
    expect(SelectionFeature.gapAnchor).toBe(p1)
  })
  it("is null without a gap selection", () => {
    const p = el("p", "hello")
    $.selectElement(p)
    feature.processSelection()
    expect(SelectionFeature.gapAnchor).toBeNull()
  })
})

describe("enable()", () => {
  it("selects the document start", () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 3)
    const fresh = new SelectionFeature(editor)
    fresh.enable()
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    fresh.disable()
  })
})

describe("document listeners", () => {
  // happy-dom fires selectionchange for Selection methods (setPosition,
  // setBaseAndExtent) but not for direct Range mutations (selectNode), so
  // this integration test uses a caret move.
  it("applies markers on selection change", async () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 2)
    await new Promise(resolve => setTimeout(resolve))
    expect(p.classList.contains("◆text-selected")).toBe(true)
  })
  it("tracks modifier keys on the body", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {ctrlKey: true, altKey: true, shiftKey: true}))
    expect(document.body.classList.contains("◆key-mod-down")).toBe(true)
    expect(document.body.classList.contains("◆key-alt-down")).toBe(true)
    expect(document.body.classList.contains("◆key-shift-down")).toBe(true)
  })
  it("removes the key markers on keyup", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {ctrlKey: true, altKey: true, shiftKey: true}))
    document.dispatchEvent(new KeyboardEvent("keyup", {}))
    expect(document.body.hasAttribute("class")).toBe(false)
  })
  it("selects an element on modifier pointerdown", () => {
    const p = el("p", "hello")
    p.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.selectedElement).toBe(p)
    expect(p.classList.contains("◆element-selected")).toBe(true)
  })
  it("ignores pointerdown on editor-only elements", () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 2)
    const helper = el("div")
    helper.classList.add("◆", "◆editor-only")
    helper.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.anchor).toBe(p.firstChild)
    expect($.anchorOffset).toBe(2)
  })
  it("ends the drag selection on pointerup", () => {
    feature.isInDragSelection = true
    document.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
    expect(feature.isInDragSelection).toBe(false)
  })
})
