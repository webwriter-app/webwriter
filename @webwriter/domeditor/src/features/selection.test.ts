// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { SelectionFeature } from "./selection"
import { $ } from "../utility"
import { selectionChangeEvent } from "../editor-bridge"

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
    expect(feature.selectionCaret).toBeInstanceOf(HTMLElement)
    expect(feature.selectionCaret?.getRootNode()).toBe(document.body.shadowRoot)
    expect(feature.selectionCaret).toHaveAttribute("aria-hidden", "true")
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-node")
    expect(feature.selectionCaret).not.toHaveAttribute("visibility")
  })
  it.each(["webwriter-demo", "video"])("uses the element selection marker for %s", tag => {
    const element = el(tag)
    $.selectElement(element)
    feature.processSelection()
    expect(element).toHaveClass("◆element-selected")
    expect(element).not.toHaveClass("◆element-capture-selected")
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
  it("treats an exactly selected mark as text in its containing block", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    const p = document.querySelector("p")!
    const bold = document.querySelector("b")!
    $.selectElement(bold)
    feature.processSelection()
    expect($.isElementSelection).toBe(false)
    expect(p).toHaveClass("◆text-selected")
    expect(bold).not.toHaveClass("◆element-selected")
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
    expect(feature.gapCaret).toBe(feature.selectionCaret)
    expect(feature.gapCaret!.classList.contains("◆gap-after-selected")).toBe(true)
    expect(feature.gapCaret!.getAttribute("part")).toContain("selection-caret-gap")
    expect(feature.gapCaret!.getAttribute("part")).toContain("gap-caret")
    expect(feature.gapCaret!.hasAttribute("visibility")).toBe(false)
  })
  it("reuses one shadow caret for node and gap selections", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectElement(p1)
    feature.processSelection()
    const caret = feature.selectionCaret

    $.selectGap(p1)
    feature.processSelection()

    expect(feature.selectionCaret).toBe(caret)
    expect(editor.appendix.querySelectorAll(".◆selection-caret")).toHaveLength(1)
    expect(feature.selectionCaret?.getAttribute("part")).not.toContain("selection-caret-node")
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-gap")
  })
  it("temporarily reuses the node caret for a transformation drop gap", () => {
    const p = el("p", "a")
    $.selectElement(p)
    feature.processSelection()
    const caret = feature.selectionCaret

    feature.showDropCaret("before")
    expect(feature.selectionCaret).toBe(caret)
    expect(caret?.getAttribute("part")).toContain("selection-caret-node")
    expect(caret?.getAttribute("part")).toContain("selection-caret-gap")
    expect(caret?.getAttribute("part")).toContain("gap-caret-drop-caret-before")

    feature.clearDropCaret()
    expect(caret?.getAttribute("part")).toContain("selection-caret-node")
    expect(caret?.getAttribute("part")).not.toContain("selection-caret-gap")
    expect(caret?.getAttribute("part")).not.toContain("selection-caret-hidden")
  })
  it("marks the element after a gap at the container start", () => {
    const p1 = el("p", "a"); el("p", "b")
    $.selectGap(p1, "before")
    feature.processSelection()
    expect(p1.classList.contains("◆gap-before-selected")).toBe(true)
  })
  it("marks the first body element when whitespace precedes the gap", () => {
    document.body.innerHTML = "\n<p>a</p>"
    const p = document.body.firstElementChild!
    $.selectDocumentStart()
    feature.processSelection()
    expect(p.classList.contains("◆gap-before-selected")).toBe(true)
    expect(feature.gapCaret!.getAttribute("visibility")).not.toBe("hidden")
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
  it("shows and clears an outline preview for a breadcrumb path", () => {
    const p = el("p", "hello")

    feature.actions.hoverNode({type: "hoverNode", path: [0]})

    expect(p).toHaveClass("◆element-hovered")
    expect(feature.hoverCaret).toBeInstanceOf(HTMLElement)
    expect(feature.hoverCaret?.getRootNode()).toBe(document.body.shadowRoot)
    expect(feature.hoverCaret).toHaveAttribute("part", "hover-caret")
    expect(feature.hoverCaret).toHaveAttribute("aria-hidden", "true")

    feature.actions.hoverNode({type: "hoverNode", path: null})

    expect(p).not.toHaveClass("◆element-hovered")
    expect(editor.appendix.querySelectorAll(".◆hover-caret")).toHaveLength(1)
  })
  it("clears a document hover without leaving a body marker", () => {
    feature.actions.hoverNode({type: "hoverNode", path: []})
    expect(document.body).toHaveClass("◆element-hovered")
    expect(feature.hoverCaret?.getRootNode()).toBe(document.body.shadowRoot)

    feature.actions.hoverNode({type: "hoverNode", path: null})

    expect(document.body).not.toHaveClass("◆element-hovered")
  })
  it("adds the dotted hover outline to an already selected element", () => {
    const p = el("p", "hello")
    $.selectElement(p)
    feature.processSelection()

    feature.actions.hoverNode({type: "hoverNode", path: [0]})

    expect(p).toHaveClass("◆element-selected")
    expect(p).toHaveClass("◆element-hovered")
  })
  it("keeps a breadcrumb hover preview when its element becomes selected", () => {
    const p = el("p", "hello")
    feature.actions.hoverNode({type: "hoverNode", path: [0]})
    expect(p).toHaveClass("◆element-hovered")

    $.selectElement(p)
    feature.processSelection()

    expect(p).toHaveClass("◆element-selected")
    expect(p).toHaveClass("◆element-hovered")
  })

  it("selects an element from a BODY-relative breadcrumb path", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    const paragraph = document.querySelector("p")!

    feature.actions.selectNode({type: "selectNode", path: [0, 0]})

    expect($.selectedElement).toBe(paragraph)
  })
  it("uses the shared node caret for the document breadcrumb", () => {
    el("p", "hello")

    feature.actions.selectNode({type: "selectNode", path: []})

    expect($.selectedElement).toBe(document.body)
    expect(document.body).toHaveClass("◆element-selected")
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-node")
  })
  it("resolves a stale mark breadcrumb path to its containing block", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    const paragraph = document.querySelector("p")!

    feature.actions.selectNode({type: "selectNode", path: [0, 0]})

    expect($.selectedElement).toBe(paragraph)
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

  it("marks an empty document selection", () => {
    const fresh = new SelectionFeature(editor)
    fresh.enable()
    expect(document.body.classList.contains("◆empty-selected")).toBe(true)
    expect(fresh.emptyDocumentCaret).toBeInstanceOf(HTMLElement)
    expect(fresh.emptyDocumentCaret).toHaveClass("◆editor-only")
    expect(fresh.emptyDocumentCaret).toHaveAttribute("part", "empty-document-caret")
    expect(fresh.emptyDocumentCaret?.getRootNode()).toBe(document.body.shadowRoot)
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

  it("restores the empty-document caret when a shared change removes the final node", async () => {
    const p = el("p", "hello")
    await new Promise<void>(resolve => queueMicrotask(resolve))
    $.move(p.firstChild!, 2)
    feature.processSelection()

    editor.doc.doc.transact(() => editor.doc.body.delete(0, editor.doc.body.length), "remote-test")
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(document.body.innerHTML).toBe("")
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect(document.body).toHaveClass("◆empty-selected")
    expect(feature.emptyDocumentCaret).toHaveAttribute("part", "empty-document-caret")
  })

  it("posts the Document breadcrumb when a shared change removes the final node", async () => {
    const p = el("p", "hello")
    await new Promise<void>(resolve => queueMicrotask(resolve))
    $.move(p.firstChild!, 2)
    feature.processSelection()
    await new Promise<void>(resolve => queueMicrotask(resolve))
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.doc.doc.transact(() => editor.doc.body.delete(0, editor.doc.body.length), "remote-test")
    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(postMessage).toHaveBeenLastCalledWith({
      type: selectionChangeEvent,
      detail: {
        path: [{path: [], name: "Document", icon: "Document"}],
      },
    }, "*")
  })

  it("posts a user-facing selection path through the bridge", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenCalledWith({
      type: selectionChangeEvent,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {path: [0], name: "Section", icon: "Section"},
          {path: [0, 0], name: "Paragraph", icon: "Paragraph"},
        ],
      },
      }, "*")
  })
  it("omits mark wrappers from the posted selection path", () => {
    document.body.innerHTML = "<section><p><strong><span>hello</span></strong></p></section>"
    $.move(document.querySelector("span")!.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenLastCalledWith({
      type: selectionChangeEvent,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {path: [0], name: "Section", icon: "Section"},
          {path: [0, 0], name: "Paragraph", icon: "Paragraph"},
        ],
      },
    }, "*")
  })
  it("posts a gap position through the bridge", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    const firstParagraph = document.querySelector("p")!
    $.selectGap(firstParagraph)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenLastCalledWith({
      type: selectionChangeEvent,
      detail: {
        path: [{path: [], name: "Document", icon: "Document"}],
        gap: {parentPath: [], offset: 1},
      },
    }, "*")
  })
  it("posts the focused widget path instead of its projected outer gap", () => {
    const widget = document.createElement("editable-widget")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    widget.attachShadow({mode: "open"}).append(editable)
    document.body.append(widget)
    editable.focus()
    document.getSelection()?.setPosition(document.body, 0)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    const message = postMessage.mock.lastCall?.[0] as {detail: {path: Array<{path: number[]}>, capture?: boolean, gap?: unknown}}
    expect(message.detail.path.at(-1)?.path).toEqual([0])
    expect(message.detail.capture).toBe(true)
    expect(message.detail).not.toHaveProperty("gap")
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
  it("selects the containing block rather than a clicked mark on modifier pointerdown", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    const p = document.querySelector("p")!
    document.querySelector("b")!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.selectedElement).toBe(p)
    expect(p).toHaveClass("◆element-selected")
  })
  it("capture-selects a widget without starting an editor drag from its shadow DOM", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    document.body.append(widget)
    feature.isInDragSelection = true
    const event = new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true})

    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(feature.isInDragSelection).toBe(false)
    button.focus()
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget).toHaveClass("◆element-capture-selected")
    expect(feature.isCaptureSelection).toBe(true)
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-capture")
    expect(feature.selectionCaret?.getAttribute("part")).not.toContain("selection-caret-node")
    expect(widget.shadowRoot?.activeElement).toBe(button)

    const keydown = new KeyboardEvent("keydown", {key: "a", bubbles: true, composed: true, cancelable: true})
    button.dispatchEvent(keydown)
    expect(keydown.defaultPrevented).toBe(false)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget.shadowRoot?.activeElement).toBe(button)
  })
  it("capture-selects interaction retargeted from a closed widget shadow DOM", () => {
    const widget = document.createElement("closed-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "closed"}).append(button)
    document.body.append(widget)

    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))

    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
  })
  it("downgrades capture to node selection when the widget breadcrumb is selected", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    document.body.append(widget)
    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    expect(widget).toHaveClass("◆element-capture-selected")

    feature.actions.selectNode({type: "selectNode", path: [0]})

    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")
    expect(feature.isCaptureSelection).toBe(false)
  })
  it("does not reset a widget's shadow contenteditable selection during input", () => {
    const widget = document.createElement("editable-widget")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    editable.textContent = "code"
    widget.attachShadow({mode: "open"}).append(editable)
    document.body.append(widget)
    editable.addEventListener("pointerdown", event => event.stopPropagation())

    editable.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    editable.focus()
    const text = editable.firstChild!
    document.getSelection()?.setPosition(text, 2)
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      composed: true,
      cancelable: true,
      data: "x",
      inputType: "insertText",
    })

    editable.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(document.getSelection()?.anchorNode).toBe(text)
    expect(document.getSelection()?.anchorOffset).toBe(2)
    expect(widget).toHaveClass("◆element-selected")
  })
  it("keeps a focused widget selected when its shadow caret projects to an outer gap", () => {
    const widget = document.createElement("editable-widget")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    editable.textContent = "code"
    widget.attachShadow({mode: "open"}).append(editable)
    document.body.append(widget)

    editable.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    editable.focus()
    document.getSelection()?.setPosition(document.body, 0)

    feature.processSelection()

    expect(widget).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆gap-before-selected")
  })
  it("keeps an editor range out of a widget's shadow text", async () => {
    const before = el("p", "before")
    const widget = document.createElement("interactive-widget")
    widget.attachShadow({mode: "open"}).textContent = "shadow text"
    document.body.append(widget)
    const after = el("p", "after")

    $.selectRange(before.firstChild!, 0, after.firstChild!, after.textContent!.length)
    feature.processSelection()

    expect(document.getSelection()?.toString()).toBe("beforeafter")
    expect(document.getSelection()?.toString()).not.toContain("shadow text")
    $.move(document.body, 0)
    await Promise.resolve()
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
  it("lets the browser focus an empty document on pointerdown", () => {
    $.selectDocumentStart()
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true})
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(feature.isInDragSelection).toBe(false)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
  })
  it("ends the drag selection on pointerup", () => {
    feature.isInDragSelection = true
    document.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
    expect(feature.isInDragSelection).toBe(false)
  })
  it("shows the gap before the first body element on ArrowUp", () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 0)
    const event = new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true})
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect(p.classList.contains("◆gap-before-selected")).toBe(true)
  })
  it("clamps a selection before the body to its start", () => {
    const p = el("p", "hello")
    $.selectRange(document.documentElement, 0)
    feature.processSelection()
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect(p.classList.contains("◆gap-before-selected")).toBe(true)
  })
  it("clamps a selection after the body to its end", () => {
    el("p", "hello")
    $.selectRange(document.documentElement, document.documentElement.childNodes.length)
    feature.processSelection()
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(document.body.childNodes.length)
  })
  it("keeps select-all selections spanning the document", () => {
    const p = el("p", "hello")
    $.selectRange(document, 0, document, 1)
    feature.processSelection()
    expect($.isEmpty).toBe(false)
    expect($.isGapSelection).toBe(false)
    expect(p.classList.contains("◆gap-before-selected")).toBe(false)
  })
  it("selects the whole body on Ctrl+A", () => {
    const p = el("p", "hello")
    $.move(p.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "a", ctrlKey: true, bubbles: true, cancelable: true})
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect($.isEmpty).toBe(false)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect($.focus).toBe(document.body)
    expect($.focusOffset).toBe(document.body.childNodes.length)
  })
})
