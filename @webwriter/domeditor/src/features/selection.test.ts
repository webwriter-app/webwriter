// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { SelectionFeature } from "./selection"
import { $ } from "../utility"
import { selectionChangeEvent } from "../editor-bridge"

let editor: DOMEditor
let feature: SelectionFeature
let initialParagraph: Element | null = null

// Coordinate tests stub native hit testing. Real browser checks also cover
// native painting, pointer capture, and live Range adjustment after mutations.
beforeEach(() => {
  document.body.innerHTML = ""
  document.getSelection()?.removeAllRanges()
  editor = new DOMEditor()
  feature = editor.features.selection
  initialParagraph = document.body.firstElementChild
  document.body.className = ""
})

afterEach(() => editor.destroy())

function appendToBody(...nodes: Node[]) {
  if(initialParagraph?.parentElement === document.body) {
    initialParagraph.replaceWith(...nodes)
    initialParagraph = null
  }
  else document.body.append(...nodes)
}

function el(tag = "p", text = "") {
  const element = document.createElement(tag)
  element.textContent = text
  appendToBody(element)
  return element
}

describe("contentful widgets", () => {
  const originalHitTest = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint")
  beforeEach(() => {
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, writable: true, value: () => null})
    editor.schema.extendWidgets([
      {tagName: "timeline-widget", editingConfig: {content: "timeline-item*"}},
      {tagName: "timeline-item", editingConfig: {content: "flow*"}},
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if(originalHitTest) Object.defineProperty(document, "caretPositionFromPoint", originalHitTest)
    else Reflect.deleteProperty(document, "caretPositionFromPoint")
  })

  function timeline(slotted = false) {
    document.body.innerHTML = '<timeline-widget><timeline-item><!--keep--><div><p><b>hello</b> world</p></div></timeline-item></timeline-widget>'
    const widget = document.querySelector<HTMLElement>("timeline-widget")!
    const item = document.querySelector("timeline-item")!
    if(slotted) {
      widget.attachShadow({mode: "open"}).append(document.createElement("slot"))
      item.attachShadow({mode: "open"}).append(document.createElement("slot"))
    }
    return {widget, item, paragraph: document.querySelector("p")!}
  }

  it.each([false, true])("selects an inner paragraph directly, including when its widget is selected (slotted: %s)", slotted => {
    const {widget, paragraph} = timeline(slotted)
    for(const selected of [document.body, widget]) {
      $.selectElement(selected)
      feature.processSelection()
      paragraph.querySelector("b")!.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true, composed: true, cancelable: true, ctrlKey: true,
      }))

      expect($.selectedElement).toBe(paragraph)
      expect(paragraph).toHaveClass("◆element-selected")
      expect(widget).not.toHaveClass("◆element-selected", "◆element-capture-selected")
      expect(feature.isCaptureSelection).toBe(false)
    }
  })

  it("keeps pointer selection and drags in slotted authored text", () => {
    const {widget, paragraph} = timeline(true)
    const text = paragraph.querySelector("b")!.firstChild!
    const rect = new DOMRect(0, 0, 200, 40)
    vi.spyOn(widget, "getBoundingClientRect").mockReturnValue(rect)
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(rect)
    const caret = vi.spyOn(document, "caretPositionFromPoint").mockReturnValue({offsetNode: text, offset: 1, getClientRect: () => rect})
    $.selectElement(widget)
    feature.processSelection()
    expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()

    const pointerdown = new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, clientX: 10, clientY: 10})
    paragraph.dispatchEvent(pointerdown)
    expect(pointerdown.defaultPrevented).toBe(false)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)

    caret.mockReturnValue({offsetNode: text, offset: 4, getClientRect: () => rect})
    paragraph.dispatchEvent(new MouseEvent("pointermove", {bubbles: true, composed: true, clientX: 30, clientY: 10}))
    paragraph.dispatchEvent(new MouseEvent("pointerup", {bubbles: true, composed: true, clientX: 30, clientY: 10}))
    expect(document.getSelection()!.toString()).toBe("ell")
    expect(feature.isCaptureSelection).toBe(false)
    expect(widget).not.toHaveClass("◆element-selected", "◆element-capture-selected")
    caret.mockRestore()
  })

  it.each(["host", "open", "closed"] as const)("never promotes repeated modifier clicks on a %s surface to capture", mode => {
    const {widget} = timeline()
    const target = mode === "host" ? widget : document.createElement("button")
    if(mode !== "host") widget.attachShadow({mode}).append(target)
    for(let i = 0; i < 3; i++) {
      target.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, ctrlKey: true}))
      expect($.selectedElement).toBe(widget)
      expect(widget).toHaveClass("◆element-selected")
      expect(widget).not.toHaveClass("◆element-capture-selected")
      expect(feature.isCaptureSelection).toBe(false)
    }
  })

  it.each(["open", "closed"] as const)("leaves %s shadow controls independent without capturing their host", mode => {
    const {widget, paragraph} = timeline()
    const control = document.createElement("input")
    widget.attachShadow({mode}).append(control)
    $.selectElement(paragraph)
    feature.processSelection()
    const input = new InputEvent("beforeinput", {bubbles: true, composed: true, cancelable: true, inputType: "insertParagraph"})
    const received = vi.fn()
    control.addEventListener("beforeinput", received)
    control.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    control.focus()
    control.dispatchEvent(input)
    feature.processSelection()
    expect(received).toHaveBeenCalledOnce()
    expect(input.defaultPrevented).toBe(false)
    expect(paragraph.innerHTML).toBe("<b>hello</b> world")
    expect($.selectedElement).toBe(paragraph)
    expect(feature.isCaptureSelection).toBe(false)
    expect(widget).not.toHaveClass("◆element-capture-selected")
  })

  it("keeps focused light-DOM selections and styling on the inner paragraph", () => {
    const {widget, paragraph} = timeline(true)
    widget.tabIndex = 0
    widget.focus()
    $.selectRange(paragraph.firstChild!.firstChild!, 1)
    document.dispatchEvent(new Event("selectionchange"))
    editor.features.manipulation.setStyle({color: "red"})
    expect(feature.isCaptureSelection).toBe(false)
    expect(paragraph).toHaveStyle({color: "red"})
    expect(widget).not.toHaveAttribute("style")
    expect($.anchor).toBe(paragraph.firstChild!.firstChild)
  })

  it("leaves retargeted closed-shadow pointer and keyboard events to the widget", () => {
    const {widget, paragraph} = timeline()
    $.selectElement(paragraph)
    feature.processSelection()
    // Closed roots expose only the host to document listeners in browsers.
    const pointer = new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true})
    widget.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(false)
    expect(feature.isInDragSelection).toBe(false)
    const key = new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true, cancelable: true})
    widget.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(false)
    expect(paragraph.isConnected).toBe(true)
    expect(feature.isCaptureSelection).toBe(false)
  })

  it("lets a contentful widget scroll without capture", () => {
    const {widget} = timeline()
    const scroller = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(scroller)
    const onWheel = vi.fn()
    const onScroll = vi.fn()
    scroller.addEventListener("wheel", onWheel)
    scroller.addEventListener("scroll", onScroll)
    const wheel = new WheelEvent("wheel", {deltaY: 100, bubbles: true, composed: true, cancelable: true})
    scroller.dispatchEvent(wheel)
    scroller.dispatchEvent(new Event("scroll", {bubbles: false}))
    expect(wheel.defaultPrevented).toBe(false)
    expect(onWheel).toHaveBeenCalledOnce()
    expect(onScroll).toHaveBeenCalledOnce()
    expect(feature.isCaptureSelection).toBe(false)
  })

  it("releases another widget's capture when focus moves to a contentful widget", () => {
    const {widget} = timeline()
    const opaque = document.createElement("opaque-widget")
    document.body.append(opaque)
    feature.captureElement(opaque)
    expect(opaque).toHaveClass("◆element-capture-selected")
    const control = document.createElement("input")
    widget.attachShadow({mode: "open"}).append(control)
    control.focus()
    expect(feature.isCaptureSelection).toBe(false)
    expect(opaque).not.toHaveClass("◆element-capture-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")
  })

  it.each(["open", "closed"] as const)("does not reveal the outer selection while a %s shadow control is active", async mode => {
    const {widget} = timeline()
    const control = document.createElement("input")
    widget.attachShadow({mode}).append(control)
    $.selectElement(widget)
    feature.processSelection()
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    const nativeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect")
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(10, window.innerHeight + 40, 0, 20),
    })
    try {
      control.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
      control.focus({preventScroll: true})
      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(scrollBy).not.toHaveBeenCalled()

      // Native controls can project their selection to a gap beside the host.
      document.getSelection()!.collapse(document.body, 0)
      document.dispatchEvent(new Event("selectionchange"))
      control.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
      feature.processSelection()
      widget.append(document.createComment("widget mutation"))
      editor.doc.syncFromDOM()
      await Promise.resolve()
      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(scrollBy).not.toHaveBeenCalled()
      expect(feature.isCaptureSelection).toBe(false)

    }
    finally {
      if(nativeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", nativeRect)
      else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
    }
  })

  it("does not scroll when a contentful shadow interaction releases another widget's capture", () => {
    const {widget} = timeline()
    const control = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(control)
    const opaque = document.createElement("opaque-widget")
    document.body.append(opaque)
    feature.captureElement(opaque)
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    control.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(opaque).not.toHaveClass("◆element-capture-selected")
  })

  it("modifier-selects a contentful widget from its shadow DOM without scrolling", () => {
    const {widget} = timeline()
    const control = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(control)
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    control.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, ctrlKey: true, cancelable: true}))
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("cleans up nested selection markers without adding artifacts to serialized content", () => {
    const {widget, paragraph} = timeline(true)
    $.selectElement(paragraph)
    feature.processSelection()
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.toHTML(true)).toContain("<!--keep-->")
    feature.disable()
    expect(widget.querySelector('[class*="◆"]')).toBeNull()
  })
})

describe("processSelection()", () => {
  const atomicOverlays = () => editor.appendix.querySelectorAll<HTMLElement>('[part="atomic-selection-overlay"]')

  it("overlays atomic hosts once in a mixed range without changing authored content", () => {
    document.body.innerHTML = '<p>before<img><span><test-widget><img></test-widget></span><input>after</p>'
    const paragraph = document.querySelector("p")!
    const authored = paragraph.innerHTML
    $.selectRange(paragraph.firstChild!, 2, paragraph.lastChild!, 3)
    feature.processSelection(true)

    expect(atomicOverlays()).toHaveLength(3)
    expect(editor.toHTML(true)).not.toContain("atomic-selection-overlay")
    expect(editor.toHTML(true)).not.toContain("◆atomic-range-selected")
    for(const overlay of atomicOverlays()) {
      expect(overlay.getRootNode()).toBe(editor.appendix)
      expect(overlay).toHaveAttribute("aria-hidden", "true")
    }
    $.move(paragraph.firstChild!, 0)
    feature.processSelection()
    expect(paragraph.innerHTML).toBe(authored)
  })

  it.each(["test-widget", "img", "video", "input", "select", "textarea", "button", "svg", "hr"])("overlays a selected %s and removes the overlay on collapse", tag => {
    const element = tag === "svg" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : el(tag)
    if(tag === "svg") appendToBody(element)
    $.selectElement(element)
    feature.processSelection()
    expect(atomicOverlays()).toHaveLength(1)

    $.selectGap(element, "after")
    feature.processSelection()
    expect(atomicOverlays()).toHaveLength(0)
  })

  it("excludes atomic elements merely touching a range edge in either direction", () => {
    document.body.innerHTML = '<p><img>text<input></p>'
    const paragraph = document.querySelector("p")!
    $.selectRange(paragraph, 1, paragraph, 2)
    feature.processSelection(true)
    expect(atomicOverlays()).toHaveLength(0)
    document.getSelection()!.setBaseAndExtent(paragraph, 2, paragraph, 0)
    feature.processSelection(true)
    expect(atomicOverlays()).toHaveLength(1)
  })

  it.each([false, true])("overlays a fully included table once in a mixed range (backward: %s)", backward => {
    document.body.innerHTML = '<p>before</p><table><tbody><tr><td><img><test-widget></test-widget></td></tr></tbody></table><p>after</p>'
    const before = document.body.firstElementChild!.firstChild!
    const after = document.body.lastElementChild!.firstChild!
    const table = document.querySelector("table")!
    document.getSelection()!.setBaseAndExtent(backward ? after : before, 2, backward ? before : after, 2)
    feature.processSelection()

    expect(table).toHaveClass("◆atomic-range-selected")
    expect(table.querySelector(".◆atomic-range-selected")).toBeNull()
    expect(atomicOverlays()).toHaveLength(1)
    expect(editor.toHTML(true)).not.toContain("◆atomic-range-selected")

    $.move(before, 0)
    feature.processSelection()
    expect(table).not.toHaveClass("◆atomic-range-selected")
    expect(atomicOverlays()).toHaveLength(0)
  })

  it("keeps partial table selections native while overlaying fully selected cell widgets", () => {
    document.body.innerHTML = '<table><tbody><tr><td>before<img>after</td><td>outside</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const cell = document.querySelector("td")!
    $.selectRange(cell.firstChild!, 2, cell.lastChild!, 2)
    feature.processSelection()

    expect(table).not.toHaveClass("◆atomic-range-selected")
    expect(cell.querySelector("img")).toHaveClass("◆atomic-range-selected")
    expect(atomicOverlays()).toHaveLength(1)

    $.selectRange(cell.firstChild!, 0, cell.firstChild!, 2)
    feature.processSelection()
    expect(atomicOverlays()).toHaveLength(0)
  })

  it("does not overlay captured controls or a widget's internal text selection", () => {
    const widget = el("test-widget", "content")
    $.selectRange(widget.firstChild!, 0, widget.firstChild!, 3)
    feature.processSelection(true)
    expect(atomicOverlays()).toHaveLength(0)
    feature.captureElement(widget)
    expect(atomicOverlays()).toHaveLength(0)
  })

  it("updates overlay geometry and cleans up removed nodes and disabled selections", () => {
    const frames: FrameRequestCallback[] = []
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.push(callback)
      return frames.length
    })
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
    try {
      const element = el("img")
      const rect = vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 30, 40))
      $.selectElement(element)
      feature.processSelection()
      const overlay = atomicOverlays()[0]
      expect(overlay.style.left).toBe("10px")
      expect(overlay.style.height).toBe("40px")
      rect.mockReturnValue(new DOMRect(50, 60, 70, 80))
      frames.splice(0).forEach(frame => frame(0))
      expect(overlay.style.left).toBe("50px")
      expect(overlay.style.width).toBe("70px")
      element.remove()
      frames.splice(0).forEach(frame => frame(0))
      expect(atomicOverlays()).toHaveLength(0)
      appendToBody(element)
      $.selectElement(element)
      feature.processSelection()
      feature.disable()
      expect(atomicOverlays()).toHaveLength(0)
      expect(cancel).toHaveBeenCalled()
    }
    finally {
      request.mockRestore()
      cancel.mockRestore()
    }
  })

  const appliedKinds = () => [
    Boolean(document.querySelector(".◆text-selected")),
    Boolean(document.querySelector(".◆element-selected, .◆element-capture-selected")),
    Boolean(document.querySelector(".◆gap-before-selected, .◆gap-after-selected")),
    Boolean(document.querySelector(".◆empty-selected")),
    Boolean(document.querySelector(".◆virtual-list-anchor, .◆virtual-list-selected")),
  ].filter(Boolean).length

  it("enforces one selection kind after an external selectionchange", async () => {
    document.body.innerHTML = "<p>text</p><interactive-widget></interactive-widget>"
    const paragraph = document.querySelector("p")!
    const widget = document.querySelector("interactive-widget")!
    paragraph.classList.add("◆", "◆element-selected", "◆gap-after-selected", "◆empty-selected", "◆virtual-list-anchor")
    widget.classList.add("◆", "◆element-capture-selected", "◆virtual-list-selected")

    document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 1, paragraph.firstChild!, 3)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect(appliedKinds()).toBe(1)
    expect(paragraph).toHaveClass("◆text-selected")
    expect(document.body).not.toHaveClass("◆node-selection-active")
    expect(document.querySelector(".◆element-selected, .◆element-capture-selected, .◆gap-before-selected, .◆gap-after-selected, .◆empty-selected, .◆virtual-list-anchor, .◆virtual-list-selected")).toBeNull()

    document.getSelection()!.getRangeAt(0).selectNode(widget)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect(appliedKinds()).toBe(1)
    expect(widget).toHaveClass("◆element-selected")
    expect(document.body).toHaveClass("◆node-selection-active")
    expect(document.querySelector(".◆text-selected, .◆gap-before-selected, .◆gap-after-selected, .◆empty-selected, .◆virtual-list-anchor, .◆virtual-list-selected")).toBeNull()

    document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 0, paragraph.firstChild!, 2)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect(appliedKinds()).toBe(1)
    expect(paragraph).toHaveClass("◆text-selected")
    expect(document.body).not.toHaveClass("◆node-selection-active")
  })

  it("marks a selected element", () => {
    const p = el("p", "hello")
    $.selectElement(p)
    feature.processSelection()
    expect(p.classList.contains("◆element-selected")).toBe(true)
    expect(document.body).toHaveClass("◆node-selection-active")
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
  it("repaints an empty list placeholder during a canonical selection refresh", () => {
    editor.features.list.toggleList("ul")
    const list = document.querySelector("ul")!
    const marker = editor.appendix.querySelector(".◆virtual-list-item")!

    feature.processSelection()

    expect(editor.features.list.isVirtualSelection).toBe(true)
    expect(list).toHaveClass("◆virtual-list-anchor", "◆virtual-list-selected")
    expect(marker.getAttribute("part")).not.toContain("virtual-list-item-hidden")
    expect(appliedKinds()).toBe(1)
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
  it("restores an underlying gap selection after clearing a drop caret", () => {
    const p = el("p", "a"); el("p", "b")
    $.selectGap(p)
    feature.processSelection()
    const caret = feature.selectionCaret

    feature.showDropCaret("before")
    feature.clearDropCaret()

    expect(p).toHaveClass("◆gap-after-selected")
    expect(caret).toHaveClass("◆selection-caret-gap", "◆gap-after-selected")
    expect(caret?.getAttribute("part")).toContain("selection-caret-gap")
    expect(caret?.getAttribute("part")).toContain("gap-caret")
    expect(caret?.getAttribute("part")).not.toContain("selection-caret-hidden")
    expect(caret).not.toHaveAttribute("visibility")
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
  it("keeps a gap anchored across formatting whitespace after selection refreshes", async () => {
    document.body.innerHTML = "<p>a</p>\n<p>b</p>"
    const [first, second] = Array.from(document.body.children)
    $.selectGap(second, "before")

    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(2)
    expect(first).toHaveClass("◆gap-after-selected")
    expect(document.body).toHaveClass("◆gap-caret-visible")
    expect(feature.gapCaret).not.toHaveAttribute("visibility")
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
    expect(feature.selectionCaret).not.toHaveClass("◆selection-caret-gap")
    expect(feature.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden").toContain("selection-caret-hidden")
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
  it("shows the thin hover preview on the live style target", () => {
    const p = el("p", "hello")
    $.selectRange(p.firstChild!, 2)

    feature.actions.hoverStyleTarget({type: "hoverStyleTarget", hovered: true})

    expect(p).toHaveClass("◆style-target-hovered")
    expect(p).not.toHaveClass("◆element-hovered")

    feature.actions.hoverStyleTarget({type: "hoverStyleTarget", hovered: false})

    expect(p).not.toHaveClass("◆style-target-hovered")
  })
  it("previews the body as the style target without a selection", () => {
    document.getSelection()?.removeAllRanges()

    feature.actions.hoverStyleTarget({type: "hoverStyleTarget", hovered: true})

    expect(document.body).toHaveClass("◆style-target-hovered")

    feature.actions.hoverStyleTarget({type: "hoverStyleTarget", hovered: false})

    expect(document.body).not.toHaveClass("◆style-target-hovered")
  })
  it("promotes a table descendant hover preview to the table", () => {
    document.body.innerHTML = "<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const paragraph = document.querySelector("p")!

    feature.actions.hoverNode({type: "hoverNode", path: [0, 0, 0, 0, 0]})

    expect(table).toHaveClass("◆element-hovered")
    expect(paragraph).not.toHaveClass("◆element-hovered")
  })
  it("keeps an active empty-cell text position separate from the table hover", () => {
    document.body.innerHTML = "<table><tbody><tr><td></td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const cell = document.querySelector("td")!
    $.move(cell, 0)
    feature.processSelection()

    feature.actions.hoverNode({type: "hoverNode", path: [0, 0, 0, 0]})

    expect(cell).toHaveClass("◆empty-selected")
    expect(cell).not.toHaveClass("◆element-hovered")
    expect(table).toHaveClass("◆element-hovered")
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
  it("addresses document-level attributes on the HTML element", () => {
    document.documentElement.setAttribute("lang", "de")
    try {
      feature.actions.selectNode({type: "selectNode", path: []})
      const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

      editor.postSelectionPath()

      const message = postMessage.mock.lastCall?.[0] as {detail: {element?: unknown}}
      expect(message.detail.element).toEqual(expect.objectContaining({
        path: null,
        localName: "html",
        name: "Document",
        attributes: expect.objectContaining({lang: "de"}),
      }))
      editor.features.manipulation.actions.setElementAttribute({
        type: "setElementAttribute",
        path: null,
        localName: "html",
        namespaceURI: "http://www.w3.org/1999/xhtml",
        name: "dir",
        value: "rtl",
      })
      expect(document.documentElement).toHaveAttribute("dir", "rtl")
    }
    finally {
      document.documentElement.removeAttribute("lang")
      document.documentElement.removeAttribute("dir")
    }
  })
  it("treats a template as the document editing root", () => {
    document.body.innerHTML = '<demo-widget role="document"></demo-widget>'
    const template = document.body.firstElementChild!

    $.selectDocumentStart()
    feature.processSelection()

    expect($.anchor).toBe(template)
    expect(template).toHaveClass("◆empty-selected")
    expect(feature.emptyDocumentCaret).toBeInTheDocument()
  })
  it("does not reinterpret a list template as an empty authored list", () => {
    document.body.innerHTML = '<ul is="list-widget" role="document"></ul>'
    const template = document.body.firstElementChild!

    $.selectDocumentStart()
    feature.processSelection()

    expect(template).toHaveClass("◆empty-selected")
    expect(editor.features.list.isVirtualSelection).toBe(false)
    expect(feature.emptyDocumentCaret).toBeInTheDocument()
  })
  it("resolves a stale mark breadcrumb path to its containing block", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    const paragraph = document.querySelector("p")!

    feature.actions.selectNode({type: "selectNode", path: [0, 0]})

    expect($.selectedElement).toBe(paragraph)
  })
})

describe("scrolling selections into view", () => {
  const options = {behavior: "smooth", block: "nearest", inline: "nearest"} as const

  it("reveals an element only when the selected element changes", () => {
    document.body.innerHTML = "<p>first</p><p>second</p>"
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    try {
      feature.actions.selectNode({type: "selectNode", path: [0]})
      expect(scrollIntoView).toHaveBeenCalledOnce()
      feature.processSelection()
      document.dispatchEvent(new Event("selectionchange"))
      feature.actions.selectNode({type: "selectNode", path: [0]})
      expect(scrollIntoView).toHaveBeenCalledOnce()
      feature.actions.selectNode({type: "selectNode", path: [1]})
      expect(scrollIntoView).toHaveBeenCalledTimes(2)
      expect(scrollIntoView.mock.instances.at(-1)).toBe(document.body.children[1])
    }
    finally { scrollIntoView.mockRestore() }
  })

  it.each(["open", "closed"] as const)("does not scroll an already selected widget on capture, %s shadow focus, or input", mode => {
    const widget = el("interactive-widget")
    const input = document.createElement("input")
    widget.attachShadow({mode}).append(input)
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    try {
      $.selectElement(widget)
      feature.processSelection()
      expect(scrollIntoView).toHaveBeenCalledOnce()
      input.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
      input.focus({preventScroll: true})
      document.getSelection()!.collapse(document.body, 0)
      for(const type of ["keydown", "input", "change"]) input.dispatchEvent(new Event(type, {bubbles: true, composed: true}))
      feature.processSelection()
      expect(feature.captureSelectedWidget).toBe(widget)
      expect(scrollIntoView).toHaveBeenCalledOnce()
    }
    finally { scrollIntoView.mockRestore() }
  })

  it("does not let passive native selection changes trigger or re-arm widget scrolling", () => {
    const widget = el("interactive-widget")
    const control = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(control)
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    try {
      $.selectElement(widget)
      feature.processSelection()
      expect(scrollIntoView).toHaveBeenCalledOnce()
      scrollBy.mockClear()
      document.getSelection()!.collapse(document.body, 0)
      document.dispatchEvent(new Event("selectionchange"))
      control.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
      expect(feature.captureSelectedWidget).toBe(widget)
      expect(scrollIntoView).toHaveBeenCalledOnce()
      expect(scrollBy).not.toHaveBeenCalled()
    }
    finally {
      scrollIntoView.mockRestore()
      scrollBy.mockRestore()
    }
  })

  it("reveals a changed caret but does not reveal refreshes or mutations before that caret", () => {
    const paragraph = el("p", "hello")
    const text = paragraph.firstChild as Text
    const nativeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect")
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true, value: () => new DOMRect(10, window.innerHeight + 40, 0, 20),
    })
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    try {
      $.move(text, 2)
      feature.processSelection()
      expect(scrollBy).toHaveBeenCalledOnce()
      feature.processSelection()
      expect(scrollBy).toHaveBeenCalledOnce()
      text.insertData(0, "prefix")
      feature.processSelection()
      expect(scrollBy).toHaveBeenCalledOnce()
      $.move(text, 1)
      feature.processSelection()
      expect(scrollBy).toHaveBeenCalledTimes(2)
    }
    finally {
      if(nativeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", nativeRect)
      else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
      scrollBy.mockRestore()
    }
  })

  it("smoothly reveals ordinary, capture, section, and cell element selections", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    try {
      const paragraph = el("p", "selected")
      $.selectElement(paragraph)
      feature.processSelection()
      expect(scrollIntoView).toHaveBeenLastCalledWith(options)
      expect(scrollIntoView.mock.instances.at(-1)).toBe(paragraph)

      document.body.innerHTML = "<interactive-widget></interactive-widget>"
      const widget = document.querySelector("interactive-widget")!
      feature.captureElement(widget)
      expect(scrollIntoView).toHaveBeenLastCalledWith(options)
      expect(scrollIntoView.mock.instances.at(-1)).toBe(widget)

      document.body.innerHTML = "<section><p>inside</p></section>"
      const section = document.querySelector("section")!
      feature.actions.selectSection({type: "selectSection", path: [0]})
      expect(scrollIntoView).toHaveBeenLastCalledWith(options)
      expect(scrollIntoView.mock.instances.at(-1)).toBe(section)

      feature.clearSelectedSection()
      document.body.innerHTML = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>"
      const cells = Array.from(document.querySelectorAll<HTMLTableCellElement>("td"))
      editor.features.table.selectCells(cells[0], cells[1])
      expect(scrollIntoView).toHaveBeenLastCalledWith(options)
      expect(scrollIntoView.mock.instances.at(-1)).toBe(cells[1])
    }
    finally {
      scrollIntoView.mockRestore()
      editor.features.table.clearCellSelection(false)
    }
  })

  it("reveals the focus caret for text, empty, gap, and virtual-list selections", () => {
    const nativeRect = Range.prototype.getBoundingClientRect
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(10, window.innerHeight + 40, 0, 20),
    })
    const expectMinimalScroll = (select: () => void, behavior = "smooth") => {
      scrollBy.mockClear()
      select()
      feature.processSelection()
      expect(scrollBy).toHaveBeenCalledOnce()
      expect(scrollBy).toHaveBeenCalledWith({left: 0, top: 60, behavior})
    }

    try {
      document.body.innerHTML = "<p>text</p>"
      const text = document.querySelector("p")!.firstChild!
      expectMinimalScroll(() => $.selectRange(text, 0, text, 2))

      document.body.innerHTML = "<p></p>"
      expectMinimalScroll(() => $.move(document.querySelector("p")!, 0))

      document.body.innerHTML = "<p>a</p><p>b</p>"
      expectMinimalScroll(() => $.selectGap(document.querySelector("p")!, "after"), "instant")

      document.body.innerHTML = "<ul></ul>"
      expectMinimalScroll(() => $.move(document.querySelector("ul")!, 0))
    }
    finally {
      Object.defineProperty(Range.prototype, "getBoundingClientRect", {configurable: true, value: nativeRect})
      scrollBy.mockRestore()
    }
  })
})

describe("disable()", () => {
  it("removes authored selection markers before stopping listeners", () => {
    const paragraph = el("p", "selected")
    $.selectElement(paragraph)
    feature.processSelection()
    expect(paragraph).toHaveClass("◆element-selected")

    feature.disable()
    expect(paragraph).not.toHaveClass("◆element-selected")
    expect(paragraph).not.toHaveClass("◆")
    feature.enable()
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

  it("marks the schema-provided empty paragraph selection", () => {
    const fresh = new SelectionFeature(editor)
    fresh.enable()
    expect(document.body.firstElementChild).toHaveClass("◆empty-selected")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect(document.body).not.toHaveClass("◆empty-selected")
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

  it("restores the default paragraph when a shared change removes the final node", async () => {
    const p = el("p", "hello")
    await vi.waitFor(() => {
      expect(editor.doc.body.firstChild?.toString()).toBe("<p>hello</p>")
    }, {timeout: 5_000})
    $.move(p.firstChild!, 2)
    feature.processSelection()

    editor.doc.doc.transact(() => editor.doc.body.delete(0, editor.doc.body.length), "remote-test")
    await vi.waitFor(() => {
      expect(editor.toHTML(true)).toBe("<p></p>")
      expect($.anchor).toBe(document.body.firstElementChild)
      expect($.anchorOffset).toBe(0)
      expect($.isEmptyDocumentSelection).toBe(false)
    }, {timeout: 5_000})
  })

  it("posts the default paragraph breadcrumb when a shared change removes the final node", async () => {
    const p = el("p", "hello")
    await vi.waitFor(() => {
      expect(editor.doc.body.firstChild?.toString()).toBe("<p>hello</p>")
    }, {timeout: 5_000})
    $.move(p.firstChild!, 2)
    feature.processSelection()
    await new Promise<void>(resolve => queueMicrotask(resolve))
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.doc.doc.transact(() => editor.doc.body.delete(0, editor.doc.body.length), "remote-test")
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenLastCalledWith({
        type: selectionChangeEvent,
        bridgeNonce: editor.trustedScriptNonce,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Paragraph", icon: "Paragraph"},
          ],
        },
      }, window.location.origin)
    }, {timeout: 5_000})
  })

  it("posts a user-facing selection path through the bridge", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenCalledWith({
      type: selectionChangeEvent,
      bridgeNonce: editor.trustedScriptNonce,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {
            path: [0, 0],
            name: "Paragraph",
            icon: "Paragraph",
            sections: [{path: [0], type: "div", name: "Division", icon: "Section"}],
          },
        ],
      },
    }, window.location.origin)
  })
  it("posts the template instead of BODY as the top-level breadcrumb item", () => {
    document.body.innerHTML = '<demo-widget role="document"></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    feature.processSelection()
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    postMessage.mockClear()

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenCalledWith({
      type: selectionChangeEvent,
      bridgeNonce: editor.trustedScriptNonce,
      detail: {
        path: [{path: [0], name: "Content", icon: "Section"}],
        nodeSelected: true,
        element: {
          path: [0],
          localName: "demo-widget",
          namespaceURI: "http://www.w3.org/1999/xhtml",
          name: "Content",
          icon: "Section",
          attributes: {role: "document"},
        },
      },
    }, window.location.origin)
  })

  it("posts authored attributes only for an exact element selection", () => {
    document.body.innerHTML = '<blockquote cite="source.html" class="authored ◆stale-marker" contenteditable="false" spellcheck="true">Quote</blockquote>'
    const quote = document.querySelector("blockquote")!
    $.move(quote.firstChild!, 2)
    feature.actions.selectSection({type: "selectSection", path: [0]})
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    const message = postMessage.mock.lastCall?.[0] as {detail: {element?: unknown}}
    expect(message.detail.element).toEqual({
      path: [0],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Quote",
      icon: "Quote",
      attributes: {cite: "source.html", class: "authored"},
    })

    feature.clearSelectedSection()
    $.move(quote.firstChild!, 2)
    editor.postSelectionPath()
    const textMessage = postMessage.mock.lastCall?.[0] as {detail: {element?: unknown}}
    expect(textMessage.detail.element).toBeUndefined()
  })

  it("edits, renames, and removes attributes without losing selection markers", () => {
    document.body.innerHTML = '<blockquote cite="source.html" class="authored"></blockquote>'
    const quote = document.querySelector("blockquote")!
    quote.classList.add("◆", "◆element-selected")
    const target = {
      path: [0],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
    }

    editor.features.manipulation.actions.setElementAttribute({...target, type: "setElementAttribute", name: "open", value: ""})
    editor.features.manipulation.actions.setElementAttribute({
      ...target,
      type: "setElementAttribute",
      name: "data-cite",
      previousName: "cite",
      value: "source.html",
    })
    editor.features.manipulation.actions.setElementAttribute({...target, type: "setElementAttribute", name: "class", value: "changed ◆injected"})

    expect(quote).toHaveAttribute("open", "")
    expect(quote).not.toHaveAttribute("cite")
    expect(quote).toHaveAttribute("data-cite", "source.html")
    expect(quote).toHaveClass("changed", "◆", "◆element-selected")
    expect(quote).not.toHaveClass("◆injected")

    editor.features.manipulation.actions.setElementAttribute({...target, type: "setElementAttribute", name: "class", value: null})
    expect(quote).not.toHaveClass("changed")
    expect(quote).toHaveClass("◆", "◆element-selected")
  })

  it("rejects active attributes, unsafe URLs, and stale element paths", () => {
    document.body.innerHTML = "<blockquote></blockquote>"
    const target = {
      path: [0],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      type: "setElementAttribute" as const,
    }

    expect(() => editor.features.manipulation.actions.setElementAttribute({...target, name: "onclick", value: "alert(1)"})).toThrow()
    expect(() => editor.features.manipulation.actions.setElementAttribute({...target, name: "cite", value: "javascript:alert(1)"})).toThrow()
    expect(() => editor.features.manipulation.actions.setElementAttribute({...target, name: "srcdoc", value: "<script></script>"})).toThrow()

    document.body.innerHTML = "<div></div>"
    expect(() => editor.features.manipulation.actions.setElementAttribute({...target, name: "title", value: "Quote"})).toThrow(
      "selected element changed",
    )
  })

  it.each(["script", "style"])("keeps <%s> and all of its attributes read-only", localName => {
    document.body.replaceChildren(document.createElement(localName))
    const target = {
      path: [0],
      localName,
      namespaceURI: "http://www.w3.org/1999/xhtml",
      type: "setElementAttribute" as const,
    }

    expect(() => editor.features.manipulation.actions.setElementAttribute({
      ...target,
      name: localName === "script" ? "src" : "media",
      value: "example",
    })).toThrow("not editable")
    expect(document.body.firstElementChild?.attributes).toHaveLength(0)
  })
  it("omits mark wrappers from the posted selection path", () => {
    document.body.innerHTML = "<section><p><strong><span>hello</span></strong></p></section>"
    $.move(document.querySelector("span")!.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenLastCalledWith({
      type: selectionChangeEvent,
      bridgeNonce: editor.trustedScriptNonce,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {
            path: [0, 0],
            name: "Paragraph",
            icon: "Paragraph",
            sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
          },
        ],
      },
    }, window.location.origin)
  })
  it("stacks section types on the next structural breadcrumb item", () => {
    document.body.innerHTML = "<section><article><aside><p>hello</p></aside></article></section>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    const message = postMessage.mock.lastCall?.[0] as {detail: {path: Array<{sections?: Array<{type: string}>}>}}
    expect(message.detail.path).toHaveLength(2)
    expect(message.detail.path[1].sections?.map(section => section.type)).toEqual([
      "section", "article", "aside",
    ])
  })
  it("attaches empty and inline-like sections to their structural parent", () => {
    document.body.innerHTML = "<section>inline</section>"
    $.move(document.querySelector("section")!.firstChild!, 2)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    const message = postMessage.mock.lastCall?.[0] as {detail: {path: Array<{name: string, sections?: unknown[]}>}}
    expect(message.detail.path).toEqual([{
      path: [],
      name: "Document",
      icon: "Document",
      sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
    }])
  })
  it("selects a section only through the explicit breadcrumb action", () => {
    document.body.innerHTML = "<section><p>hello</p></section>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)

    feature.actions.selectSection({type: "selectSection", path: [0]})

    expect(feature.selectedSectionElement).toBe(document.querySelector("section"))
    expect(document.querySelector("section")).toHaveClass("◆element-selected")
    expect($.anchor).toBe(paragraph.firstChild)

    document.dispatchEvent(new Event("selectionchange"))
    expect(feature.selectedSectionElement).toBeNull()
    expect(document.querySelector("section")).not.toHaveClass("◆element-selected")
    expect(paragraph).toHaveClass("◆text-selected")
  })
  it("posts a gap position through the bridge", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    const firstParagraph = document.querySelector("p")!
    $.selectGap(firstParagraph)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    expect(postMessage).toHaveBeenLastCalledWith({
      type: selectionChangeEvent,
      bridgeNonce: editor.trustedScriptNonce,
      detail: {
        path: [{path: [], name: "Document", icon: "Document"}],
        gap: {parentPath: [], offset: 1},
      },
    }, window.location.origin)
  })
  it("posts the focused widget path instead of its projected outer gap", () => {
    const widget = document.createElement("editable-widget")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    widget.attachShadow({mode: "open"}).append(editable)
    appendToBody(widget)
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
    expect(getComputedStyle(document.documentElement).cursor).toBe("pointer")
    expect(getComputedStyle(document.body).cursor).toBe("pointer")
  })
  it("removes the key markers on keyup", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {ctrlKey: true, altKey: true, shiftKey: true}))
    document.dispatchEvent(new KeyboardEvent("keyup", {}))
    expect(document.body.hasAttribute("class")).toBe(false)
  })
  it("selects an element on modifier pointerdown", () => {
    const p = el("p", "hello")
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true})
    p.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(p)
    expect(p.classList.contains("◆element-selected")).toBe(true)
  })
  it("prevents the default modifier-click action", () => {
    const link = document.createElement("a")
    link.href = "#target"
    appendToBody(link)
    link.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    const event = new MouseEvent("click", {bubbles: true, cancelable: true, ctrlKey: true})

    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
  it("selects the containing block rather than a clicked mark on modifier pointerdown", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    const p = document.querySelector("p")!
    document.querySelector("b")!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.selectedElement).toBe(p)
    expect(p).toHaveClass("◆element-selected")
  })
  it("selects the containing block rather than a clicked phrase on modifier pointerdown", () => {
    document.body.innerHTML = "<p><span>hello</span></p>"
    const p = document.querySelector("p")!
    document.querySelector("span")!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.selectedElement).toBe(p)
    expect(p).toHaveClass("◆element-selected")
  })
  it.each(["br", "wbr"])("does not node-select <%s> itself on modifier pointerdown", tag => {
    document.body.innerHTML = `<p>a<${tag}>b</p>`
    const p = document.querySelector("p")!
    document.querySelector(tag)!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true}))
    expect($.selectedElement).toBe(p)
    expect(p).toHaveClass("◆element-selected")
  })
  it("promotes a modifier-clicked widget from node to capture selection", () => {
    const widget = document.createElement("webwriter-demo")
    appendToBody(widget)
    const clickWidget = () => {
      const pointerdown = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, ctrlKey: true})
      widget.dispatchEvent(pointerdown)
      return pointerdown
    }

    expect(clickWidget().defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")

    expect(clickWidget().defaultPrevented).toBe(true)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")

    expect(clickWidget().defaultPrevented).toBe(false)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
  })
  it("leaves modifier-clicks to a capture-selected widget", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
    const pointerdown = () => {
      const event = new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, ctrlKey: true})
      button.dispatchEvent(event)
      return event
    }

    expect(pointerdown().defaultPrevented).toBe(true)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")

    expect(pointerdown().defaultPrevented).toBe(true)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")

    expect(pointerdown().defaultPrevented).toBe(false)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")

    const click = new MouseEvent("click", {bubbles: true, composed: true, cancelable: true, ctrlKey: true})
    button.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })
  it.each(["host", "light", "slotted", "open", "closed"] as const)("capture-selects an element-selected widget on an ordinary click in its %s content", kind => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    if(kind === "open" || kind === "closed") {
      widget.attachShadow({mode: kind}).append(button)
    }
    else {
      const wrapper = document.createElement("span")
      wrapper.append(button)
      widget.append(wrapper)
      if(kind === "slotted") widget.attachShadow({mode: "open"}).append(document.createElement("slot"))
    }
    appendToBody(widget)
    $.selectElement(widget)
    feature.processSelection()
    expect(feature.isCaptureSelection).toBe(false)
    const target = kind === "host" ? widget : button
    const onPointerDown = vi.fn()
    target.addEventListener("pointerdown", onPointerDown)
    const event = new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true})

    target.dispatchEvent(event)

    expect(feature.captureSelectedWidget).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(feature.isInDragSelection).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(onPointerDown).toHaveBeenCalledOnce()
    target.dispatchEvent(new MouseEvent("pointerup", {bubbles: true, composed: true}))
    target.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true}))
    expect(feature.captureSelectedWidget).toBe(widget)
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-capture")
  })
  it("capture-selects a widget without starting an editor drag from its shadow DOM", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
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
  it("lets scroll events reach only a capture-selected widget", () => {
    const widget = document.createElement("scrolling-widget")
    const scroller = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(scroller)
    appendToBody(widget)
    const onScroll = vi.fn()
    scroller.addEventListener("scroll", onScroll)

    scroller.dispatchEvent(new Event("scroll", {bubbles: true, composed: true}))
    expect(onScroll).not.toHaveBeenCalled()

    scroller.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    scroller.dispatchEvent(new Event("scroll", {bubbles: true, composed: true}))

    expect(widget).toHaveClass("◆element-capture-selected")
    expect(onScroll).toHaveBeenCalledOnce()
  })
  it("routes wheel input to the document until the widget is capture-selected", () => {
    const widget = document.createElement("map-widget")
    const map = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(map)
    appendToBody(widget)
    const onWheel = vi.fn((event: WheelEvent) => event.preventDefault())
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    map.addEventListener("wheel", onWheel)

    const documentWheel = new WheelEvent("wheel", {deltaY: 100, bubbles: true, composed: true, cancelable: true})
    map.dispatchEvent(documentWheel)

    expect(onWheel).not.toHaveBeenCalled()
    expect(documentWheel.defaultPrevented).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith({left: 0, top: 100, behavior: "instant"})

    map.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    const widgetWheel = new WheelEvent("wheel", {deltaY: 100, bubbles: true, composed: true, cancelable: true})
    map.dispatchEvent(widgetWheel)

    expect(widget).toHaveClass("◆element-capture-selected")
    expect(onWheel).toHaveBeenCalledOnce()
    expect(widgetWheel.defaultPrevented).toBe(true)
    expect(scrollBy).toHaveBeenCalledOnce()
    scrollBy.mockRestore()
  })
  it("capture-selects interaction retargeted from a closed widget shadow DOM", () => {
    const widget = document.createElement("closed-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "closed"}).append(button)
    appendToBody(widget)

    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))

    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
  })
  it("keeps capture when a widget control projects the native selection to the gap above it", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))

    document.getSelection()?.setPosition(document.body, 0)
    document.dispatchEvent(new Event("selectionchange"))

    expect(feature.isCaptureSelection).toBe(true)
    expect(feature.captureSelectedWidget).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(widget).not.toHaveClass("◆gap-before-selected")
    expect(feature.selectionCaret?.getAttribute("part")).toContain("selection-caret-capture")
    expect(feature.selectionCaret?.getAttribute("part")).not.toContain("selection-caret-gap")
  })
  it("posts capture without a gap when a widget control projects the native selection above it", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    document.getSelection()?.setPosition(document.body, 0)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    editor.postSelectionPath()

    const message = postMessage.mock.lastCall?.[0] as {detail: {path: Array<{path: number[]}>, capture?: boolean, gap?: unknown}}
    expect(message.detail.path.at(-1)?.path).toEqual([0])
    expect(message.detail.capture).toBe(true)
    expect(message.detail).not.toHaveProperty("gap")
  })
  it("releases persistent capture on the next ordinary editor selection interaction", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    document.getSelection()?.setPosition(document.body, 0)
    const paragraph = el("p", "hello")

    paragraph.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    }))

    expect(feature.isCaptureSelection).toBe(false)
    expect($.selectedElement).toBe(paragraph)
    expect(paragraph).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")
  })
  it("downgrades capture to node selection when the widget breadcrumb is selected", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
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
    appendToBody(widget)
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
    appendToBody(widget)

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
    appendToBody(widget)
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
  it("ends the drag selection on pointerup", () => {
    feature.isInDragSelection = true
    document.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
    expect(feature.isInDragSelection).toBe(false)
  })
  it.each([
    ["ArrowRight", "before"],
    ["ArrowDown", "before"],
    ["ArrowLeft", "after"],
    ["ArrowUp", "after"],
  ] as const)("node-selects an adjacent atomic element on %s from the %s boundary", (key, placement) => {
    document.body.innerHTML = "<p>before</p>\n<interactive-widget></interactive-widget>\n<p>after</p>"
    const widget = document.querySelector("interactive-widget")!
    $.selectGap(widget, placement)
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
  })
  it.each([
    ["ArrowRight", "before", -1],
    ["ArrowDown", "before", 2],
    ["ArrowLeft", "after", 0],
    ["ArrowUp", "after", 2],
  ] as const)("node-selects an atomic element on %s from a neighboring paragraph", (key, paragraphPosition, textOffset) => {
    document.body.innerHTML = "<p>before</p><interactive-widget></interactive-widget><p>after</p>"
    const widget = document.querySelector("interactive-widget")!
    const paragraph = paragraphPosition === "before" ? widget.previousElementSibling! : widget.nextElementSibling!
    const text = paragraph.firstChild as Text
    $.move(text, textOffset)
    feature.processSelection()
    expect(paragraph).toHaveClass("◆text-selected")
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(widget)
    expect($.isTextSelection).toBe(false)
    expect(document.querySelectorAll(".◆text-selected")).toHaveLength(0)
    expect(document.querySelectorAll(".◆element-selected")).toHaveLength(1)
  })
  it("normalizes an externally installed node range to exact forward parent offsets", () => {
    document.body.innerHTML = "<p>before</p><interactive-widget></interactive-widget>"
    const paragraph = document.querySelector("p")!
    const widget = document.querySelector("interactive-widget")!
    $.move(paragraph.firstChild!, 2)
    feature.processSelection()
    const selection = document.getSelection()!
    const setBaseAndExtent = vi.spyOn(selection, "setBaseAndExtent").mockImplementation(() => {})

    try {
      selection.getRangeAt(0).selectNode(widget)
      const index = Array.from(document.body.childNodes).indexOf(widget)
      Object.defineProperties(selection, {
        anchorNode: {configurable: true, value: document.body},
        anchorOffset: {configurable: true, value: index + 1},
        focusNode: {configurable: true, value: document.body},
        focusOffset: {configurable: true, value: index},
        direction: {configurable: true, value: "backward"},
      })
      document.dispatchEvent(new Event("selectionchange"))

      expect(setBaseAndExtent).toHaveBeenCalledWith(document.body, index, document.body, index + 1)
      expect($.selectedElement).toBe(widget)
      expect(paragraph).not.toHaveClass("◆text-selected")
      expect(widget).toHaveClass("◆element-selected")
      expect(document.body).toHaveClass("◆node-selection-active")
    }
    finally {
      setBaseAndExtent.mockRestore()
      for(const property of ["anchorNode", "anchorOffset", "focusNode", "focusOffset", "direction"]) {
        delete (selection as unknown as Record<string, unknown>)[property]
      }
    }
  })
  it("does not cross a paragraph boundary horizontally from the middle of its text", () => {
    document.body.innerHTML = "<p>before</p><interactive-widget></interactive-widget>"
    const widget = document.querySelector("interactive-widget")!
    $.move(document.querySelector("p")!.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect($.selectedElement).not.toBe(widget)
  })
  it.each([
    ["ArrowLeft", "before"],
    ["ArrowUp", "before"],
    ["ArrowRight", "after"],
    ["ArrowDown", "after"],
  ] as const)("moves %s out of an atomic node selection to the %s boundary", (key, placement) => {
    document.body.innerHTML = "<p>before</p>\n<video></video>\n<p>after</p>"
    const video = document.querySelector("video")!
    $.selectElement(video)
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    const index = Array.from(document.body.childNodes).indexOf(video)
    expect(event.defaultPrevented).toBe(true)
    expect($.isElementSelection).toBe(false)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(placement === "before" ? index : index + 1)
  })
  it("does not arrow-select an atomic element while extending a selection", () => {
    const widget = el("interactive-widget")
    $.selectGap(widget, "before")
    const event = new KeyboardEvent("keydown", {key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect($.selectedElement).toBeUndefined()
  })
  it("leaves arrow navigation to a capture-selected widget", () => {
    const widget = document.createElement("interactive-widget")
    const button = document.createElement("button")
    widget.attachShadow({mode: "open"}).append(button)
    appendToBody(widget)
    button.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    button.focus()
    const event = new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(feature.isCaptureSelection).toBe(true)
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-capture-selected")
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


describe("divider selection", () => {
  const press = (key: string) => {
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})
    document.dispatchEvent(event)
    return event
  }

  it("selects a clicked divider and cleans up its markers when selection changes", () => {
    document.body.innerHTML = '<p>before</p><hr title="break"><p>after</p>'
    const divider = document.querySelector("hr")!
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true})
    divider.dispatchEvent(event)
    divider.dispatchEvent(new MouseEvent("pointerup", {bubbles: true}))
    divider.dispatchEvent(new MouseEvent("click", {bubbles: true}))

    expect(event.defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(divider)
    expect(divider).toHaveClass("◆element-selected")
    expect(feature.selectionCaret?.getRootNode()).toBe(editor.appendix)
    expect(editor.toHTML(true)).toContain('<hr title="break">')
    expect(editor.toHTML(true)).not.toContain("◆")

    $.move(document.querySelector("p")!.firstChild!, 1)
    feature.processSelection()
    expect(divider.outerHTML).toBe('<hr title="break">')
  })

  it.each([
    '<p>before</p>\n<!--break-->\n<hr>\n<p>after</p>',
    '<section>before<!--break--><hr>after</section>',
    '<table><tbody><tr><td>before<hr>after</td></tr></tbody></table>',
    '<hr>',
  ])("navigates between both divider gaps and the element in %s", html => {
    document.body.innerHTML = html
    const divider = document.querySelector("hr")!
    const parent = divider.parentNode!
    const index = Array.from(parent.childNodes).indexOf(divider)
    for(const [into, out, placement] of [
      ["ArrowDown", "ArrowUp", "before"],
      ["ArrowRight", "ArrowLeft", "before"],
      ["ArrowUp", "ArrowDown", "after"],
      ["ArrowLeft", "ArrowRight", "after"],
    ] as const) {
      $.selectGap(divider, placement)
      expect(press(into).defaultPrevented).toBe(true)
      expect($.selectedElement).toBe(divider)
      expect(press(out).defaultPrevented).toBe(true)
      expect($.isGapSelection).toBe(true)
      expect($.anchor).toBe(parent)
      expect($.anchorOffset).toBe(index + (placement === "after" ? 1 : 0))
      expect(divider).toHaveClass(`◆gap-${placement}-selected`)
      expect(divider).not.toHaveClass("◆element-selected")
    }
  })

  it.each([
    ["ArrowRight", "before", -1],
    ["ArrowDown", "before", 2],
    ["ArrowLeft", "after", 0],
    ["ArrowUp", "after", 2],
  ] as const)("selects a divider with %s from neighboring text", (key, placement, offset) => {
    document.body.innerHTML = '<p>before</p>\n<!--break--><hr>\n<p>after</p>'
    const divider = document.querySelector("hr")!
    const paragraph = placement === "before" ? divider.previousElementSibling! : divider.nextElementSibling!
    $.move(paragraph.firstChild!, offset)
    expect(press(key).defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(divider)
  })
})

describe("selection invariants", () => {
  const originalHitTest = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint")
  beforeEach(() => {
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, writable: true, value: () => null})
  })
  afterEach(() => {
    document.dispatchEvent(new MouseEvent("pointercancel", {bubbles: true}))
    vi.restoreAllMocks()
    if(originalHitTest) Object.defineProperty(document, "caretPositionFromPoint", originalHitTest)
    else Reflect.deleteProperty(document, "caretPositionFromPoint")
  })

  function pointer(target: EventTarget, type: string, x: number, y: number, options: MouseEventInit = {}) {
    const event = new MouseEvent(type, {bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, ...options})
    target.dispatchEvent(event)
    return event
  }

  function hitTest() {
    return vi.spyOn(document, "caretPositionFromPoint").mockImplementation((x, y) => {
      const text = document.querySelector("p")!.firstChild!
      return {offsetNode: text, offset: y < 20 ? 0 : Math.min(5, Math.floor(x / 10))} as unknown as CaretPosition
    })
  }

  function textDocument() {
    document.body.innerHTML = "<p>hello</p><second-widget></second-widget><p>world</p>"
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 60, 20))
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 60, 20))
    return paragraph
  }

  it.each(["before", "after"] as const)("clicks the gap %s a divider using native parent hit testing", placement => {
    document.body.innerHTML = '<section>before<!--break--><hr>after</section>'
    const divider = document.querySelector("hr")!
    const parent = divider.parentElement!
    const index = Array.from(parent.childNodes).indexOf(divider)
    vi.spyOn(divider, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 11))
    vi.spyOn(document, "caretPositionFromPoint").mockReturnValue({offsetNode: parent, offset: index} as unknown as CaretPosition)
    const y = placement === "before" ? 95 : 116

    expect(pointer(parent, "pointerdown", 50, y).defaultPrevented).toBe(true)
    pointer(parent, "pointerup", 50, y)
    expect($.isGapSelection).toBe(true)
    expect($.anchor).toBe(parent)
    expect($.anchorOffset).toBe(index + (placement === "after" ? 1 : 0))
    expect(divider).toHaveClass(`◆gap-${placement}-selected`)
  })

  it("restores a visible caret when an active frame has no native range", () => {
    textDocument()
    document.getSelection()!.removeAllRanges()
    window.dispatchEvent(new Event("focus"))
    expect(document.getSelection()!.rangeCount).toBe(1)
    expect(feature.selectionCaret).not.toHaveAttribute("visibility")
  })

  it("leaves cross-block highlighting to the browser without changing its endpoints", () => {
    const paragraph = textDocument()
    const last = document.querySelectorAll("p")[1].firstChild!
    $.selectRange(last, 3, paragraph.firstChild!, 1)
    feature.processSelection()
    expect($.anchor).toBe(last)
    expect($.focusOffset).toBe(1)
    expect(feature.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden").toContain("selection-caret-hidden")
    expect(document.body).not.toHaveClass("◆node-selection-active", "◆gap-caret-visible")
  })

  it("extends a text drag both ways and restores the exact text point", () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    pointer(paragraph, "pointermove", 50, 25)
    expect($.anchorOffset).toBe(2)
    expect($.focusOffset).toBe(5)
    pointer(paragraph, "pointermove", 0, 25)
    expect($.anchorOffset).toBe(2)
    expect($.focusOffset).toBe(0)
    pointer(paragraph, "pointermove", 20, 25)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(2)
    expect($.isEmpty).toBe(true)
  })

  it("allows native text clicks to focus the editing host and establish the caret", () => {
    const paragraph = textDocument()
    hitTest()
    const down = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, clientX: 20, clientY: 25})
    paragraph.dispatchEvent(down)
    const mouse = new MouseEvent("mousedown", {bubbles: true, cancelable: true})
    paragraph.dispatchEvent(mouse)
    const start = new Event("selectstart", {bubbles: true, cancelable: true})
    paragraph.dispatchEvent(start)
    expect(down.defaultPrevented).toBe(false)
    expect(mouse.defaultPrevented).toBe(false)
    expect(start.defaultPrevented).toBe(false)
    expect(document.body).not.toHaveClass("◆selection-dragging", "◆gap-caret-visible", "◆node-selection-active")
    pointer(paragraph, "pointermove", 40, 25)
    const dragStart = new Event("selectstart", {bubbles: true, cancelable: true})
    paragraph.dispatchEvent(dragStart)
    expect(dragStart.defaultPrevented).toBe(true)
  })

  it("restores the browser's native click point when its hit test has different affinity", async () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    paragraph.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true}))
    // Model the native mouse default choosing the other side of an inline or
    // bidi boundary after pointerdown's coordinate estimate.
    $.selectRange(paragraph.firstChild!, 3)
    await Promise.resolve()
    pointer(paragraph, "pointermove", 50, 25)
    expect($.anchorOffset).toBe(3)
    pointer(paragraph, "pointermove", 20, 25)
    expect($.anchorOffset).toBe(3)
    expect($.focusOffset).toBe(3)
  })

  it("allows a native text click when coordinate hit testing returns no point", () => {
    const paragraph = textDocument()
    $.selectGap(paragraph, "before")
    const down = pointer(paragraph, "pointerdown", 20, 25)
    const mouse = new MouseEvent("mousedown", {bubbles: true, cancelable: true})
    paragraph.dispatchEvent(mouse)
    expect(down.defaultPrevented).toBe(false)
    expect(mouse.defaultPrevented).toBe(false)
  })

  it("preserves an internal details gap through native focus changes", () => {
    document.body.innerHTML = '<p>Before</p><details open><summary>Summary</summary><p>Body</p></details>'
    const details = document.querySelector("details")!
    const summary = details.querySelector("summary")!
    const paragraph = details.querySelector("p")!
    vi.spyOn(details, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 100, 200, 150))
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 110, 180, 20))
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 160, 160, 20))
    vi.spyOn(document, "caretPositionFromPoint").mockReturnValue({offsetNode: document.body, offset: 1} as unknown as CaretPosition)
    const down = pointer(details, "pointerdown", 80, 150)
    expect(down.defaultPrevented).toBe(true)
    expect($.anchor).toBe(details)
    expect($.anchorOffset).toBe(1)
    // Native focus can replace even a prevented click below the summary.
    $.selectRange(document.body.firstChild!.firstChild!, 0)
    pointer(details, "pointerup", 80, 150)
    expect($.anchor).toBe(details)
    expect($.anchorOffset).toBe(1)
    expect($.isGapSelection).toBe(true)
    expect(summary).toHaveClass("◆gap-after-selected")
    expect(editor.schema.findValidTypesToInsert()).toContain("p")
    details.dispatchEvent(new KeyboardEvent("keydown", {key: "x", bubbles: true, cancelable: true}))
    expect(details.children).toHaveLength(3)
    expect($.anchor).toBe(details.children[1])
  })

  it("keeps the corrected empty paragraph position when clicking the details indentation", () => {
    document.body.innerHTML = '<details open><summary>Summary</summary><p></p></details>'
    const details = document.querySelector("details")!
    const paragraph = details.querySelector("p")!
    vi.spyOn(details, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 100, 200, 150))
    vi.spyOn(details.querySelector("summary")!, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 110, 180, 20))
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 160, 160, 20))
    vi.spyOn(document, "caretPositionFromPoint").mockReturnValue({offsetNode: document.body, offset: 0} as unknown as CaretPosition)
    expect(pointer(details, "pointerdown", 30, 170).defaultPrevented).toBe(true)
    $.selectRange(document.body, 0)
    pointer(details, "pointerup", 30, 170)
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    expect(paragraph).toHaveClass("◆empty-selected")
  })

  it("does not restore a prevented gap click after pointer cancellation", () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 0, 10)
    $.selectRange(paragraph.firstChild!, 3)
    pointer(paragraph, "pointercancel", 0, 10)
    pointer(paragraph, "pointerup", 0, 10)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(3)
  })

  it("projects a drag over nested SVG text to the outer graphic boundary", () => {
    const paragraph = textDocument()
    document.body.insertAdjacentHTML("beforeend", '<svg><svg><text>graphic label</text></svg></svg>')
    const graphic = document.querySelector("svg")!
    const label = graphic.querySelector("text")!
    const hit = hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    hit.mockReturnValue({offsetNode: label.firstChild!, offset: 3} as unknown as CaretPosition)
    vi.spyOn(graphic, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 50, 100, 40))
    pointer(label, "pointermove", 50, 80)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(2)
    expect($.focus).toBe(document.body)
    expect($.focusOffset).toBe(4)
    pointer(paragraph, "pointermove", 20, 25)
    expect($.isEmpty).toBe(true)
    expect($.anchorOffset).toBe(2)
  })

  it("repairs an external selection inside SVG without changing its contents", () => {
    document.body.innerHTML = '<p>hello</p><svg><svg><text>label</text></svg></svg>'
    const graphic = document.querySelector("svg")!
    const text = graphic.querySelector("text")!.firstChild!
    $.selectRange(text, 2)
    feature.processSelection()
    expect($.selectedElement).toBe(graphic)
    expect(graphic.textContent).toBe("label")
    expect($.anchor).toBe(document.body)
  })

  it("restores a gap after extending into text and back to its original position", () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 0, 10)
    expect($.isGapSelection).toBe(true)
    pointer(paragraph, "pointermove", 40, 25)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
    expect($.focus).toBe(paragraph.firstChild)
    pointer(paragraph, "pointermove", 0, 10)
    expect($.isGapSelection).toBe(true)
    expect($.anchorOffset).toBe(0)
    expect(paragraph).toHaveClass("◆gap-before-selected")
  })

  it("extends a text selection into a gap instead of ignoring the pointer", () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 30, 25)
    pointer(paragraph, "pointermove", 0, 10)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(3)
    expect($.focus).toBe(document.body)
    expect($.focusOffset).toBe(0)
  })

  it("preserves the anchor and backward direction while crossing a one-element range", () => {
    const paragraph = textDocument()
    vi.spyOn(document, "caretPositionFromPoint").mockImplementation((_x, y) => ({offsetNode: document.body, offset: y > 50 ? 2 : 1}) as unknown as CaretPosition)
    pointer(paragraph, "pointerdown", 0, 60)
    pointer(paragraph, "pointermove", 0, 45)
    expect($.anchorOffset).toBe(2)
    expect($.focusOffset).toBe(1)
    expect(feature.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden").toContain("selection-caret-hidden")
    pointer(paragraph, "pointermove", 0, 60)
    expect($.isGapSelection).toBe(true)
    expect($.anchorOffset).toBe(2)
  })

  it("shift-drag preserves the existing anchor and restores its initial range", () => {
    const paragraph = textDocument()
    hitTest()
    $.selectRange(paragraph.firstChild!, 1)
    pointer(paragraph, "pointerdown", 30, 25, {shiftKey: true})
    pointer(paragraph, "pointermove", 50, 25)
    expect($.anchorOffset).toBe(1)
    pointer(paragraph, "pointermove", 30, 25)
    expect($.anchorOffset).toBe(1)
    expect($.focusOffset).toBe(3)
  })

  it.each(["open", "closed"] as const)("keeps drag endpoints outside a %s widget shadow tree and ends there", mode => {
    const paragraph = textDocument()
    const widget = document.querySelector("second-widget")!
    const shadow = widget.attachShadow({mode})
    const surface = document.createElement("span")
    surface.textContent = "private widget text"
    shadow.append(surface)
    const hit = hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    hit.mockReturnValue({offsetNode: surface.firstChild!, offset: 4} as unknown as CaretPosition)
    vi.spyOn(widget, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 50, 100, 40))
    pointer(surface, "pointermove", 50, 80)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.focus).toBe(document.body)
    expect($.focusOffset).toBe(2)
    expect(feature.isCaptureSelection).toBe(false)
    pointer(surface, "pointerup", 50, 80)
    expect(feature.isInDragSelection).toBe(false)
    expect(document.body).not.toHaveClass("◆selection-dragging")
  })

  it("cleans selection markers from a remotely removed selected element", async () => {
    const paragraph = textDocument()
    $.selectElement(paragraph)
    feature.processSelection()
    paragraph.remove()
    editor.doc.doc.transact(() => {})
    await Promise.resolve()
    expect(paragraph).not.toHaveAttribute("class")
    expect(feature.selectionCaret).not.toHaveAttribute("visibility")
  })

  it("keeps selection visuals out of serialized HTML", () => {
    const paragraph = textDocument()
    const authored = editor.toHTML(true)
    hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    pointer(paragraph, "pointermove", 40, 25)
    expect(editor.toHTML(true)).toBe(authored)
    expect(document.querySelector(".◆selection-caret")).toBeNull()
    expect(editor.appendix.querySelector("slot")).not.toBeNull()
  })

  it("safely continues after the original text endpoint is replaced", () => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    paragraph.replaceChildren(document.createTextNode("fresh"))
    expect(() => pointer(paragraph, "pointermove", 40, 25)).not.toThrow()
    expect($.anchor?.isConnected).toBe(true)
    expect($.focus?.isConnected).toBe(true)
  })

  it.each(["pointercancel", "lostpointercapture"])("cleans drag state on %s", type => {
    const paragraph = textDocument()
    hitTest()
    pointer(paragraph, "pointerdown", 20, 25)
    pointer(paragraph, type, 20, 25)
    expect(feature.isInDragSelection).toBe(false)
    expect(feature.dragAnchor).toBeNull()
    expect(document.body).not.toHaveClass("◆selection-dragging")
  })
})

describe("disclosure gap navigation", () => {
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true, ...init})
    document.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    document.body.innerHTML = '<p>Before</p>\n<details><summary><b>Heading</b></summary><p>Body</p></details>\n<p>After</p>'
  })

  it.each(["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"])("stops at both sides of a closed disclosure with %s", key => {
    const details = document.querySelector("details")!
    const backward = key === "ArrowLeft" || key === "ArrowUp"
    const text = details.querySelector("b")!.firstChild!
    $.move(text, backward ? 0 : -1)
    expect(press(key).defaultPrevented).toBe(true)
    expect($.detailsGap).toEqual({element: details, placement: backward ? "before" : "after"})
    expect(details).toHaveClass(backward ? "◆gap-before-selected" : "◆gap-after-selected")
    expect(details.open).toBe(false)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.appendix.querySelector('[part~="gap-caret"]')).not.toBeNull()
  })

  it.each(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"])("stops beside a disclosure when approaching it with %s", key => {
    const details = document.querySelector("details")!
    const forward = key === "ArrowRight" || key === "ArrowDown"
    $.move((forward ? details.previousElementSibling : details.nextElementSibling)!.firstChild!, forward ? -1 : 0)
    expect(press(key).defaultPrevented).toBe(true)
    expect($.detailsGap).toEqual({element: details, placement: forward ? "before" : "after"})
    expect(press(key).defaultPrevented).toBe(true)
    expect($.anchor).toBe(details.querySelector("b")!.firstChild)
    expect($.anchorOffset).toBe(forward ? 0 : 7)
    expect(details.open).toBe(false)
  })

  it("exits an open disclosure from its last body block and reenters from its following gap", () => {
    const details = document.querySelector("details")!
    details.open = true
    const text = details.querySelector("p")!.firstChild!
    $.move(text, -1)
    expect(press("ArrowDown").defaultPrevented).toBe(true)
    expect($.detailsGap?.placement).toBe("after")
    expect(press("ArrowUp").defaultPrevented).toBe(true)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(4)
  })

  it.each(["section", "div", "li", "td"])("paints details gaps among bare text in a %s", tag => {
    document.body.innerHTML = `<${tag}>Before<details><summary>Heading</summary></details>After</${tag}>`
    const details = document.querySelector("details")!
    for(const placement of ["before", "after"] as const) {
      $.selectGap(details, placement)
      feature.processSelection()
      expect($.isGapSelection).toBe(true)
      expect(details).toHaveClass(`◆gap-${placement}-selected`)
    }
  })

  it("crosses nested disclosure boundaries one at a time", () => {
    document.body.innerHTML = '<details open><summary>Outer</summary><details><summary>Inner</summary></details></details>'
    const outer = document.querySelector("details")!
    const inner = outer.querySelector("details")!
    $.move(inner.querySelector("summary")!.firstChild!, -1)
    press("ArrowRight")
    expect($.detailsGap?.element).toBe(inner)
    press("ArrowRight")
    expect($.detailsGap?.element).toBe(outer)
  })

  it("keeps the caret in an outer document gap when there is nowhere farther to move", () => {
    document.body.innerHTML = '<details><summary>Heading</summary></details>'
    const details = document.querySelector("details")!
    $.selectGap(details, "before")
    expect(press("ArrowUp").defaultPrevented).toBe(true)
    expect($.detailsGap?.placement).toBe("before")
    $.selectGap(details, "after")
    expect(press("ArrowDown").defaultPrevented).toBe(true)
    expect($.detailsGap?.placement).toBe("after")
  })

  it("does not intercept ordinary summary editing, shift selection, or stale endpoints", () => {
    const details = document.querySelector("details")!
    const text = details.querySelector("b")!.firstChild!
    $.move(text, 3)
    expect(press("ArrowRight").defaultPrevented).toBe(false)
    $.move(text, 0)
    expect(press("ArrowLeft", {shiftKey: true}).defaultPrevented).toBe(false)
    details.remove()
    expect(() => press("ArrowRight")).not.toThrow()
  })

  it("keeps an empty open body editable instead of turning it into an outer gap", () => {
    document.body.innerHTML = '<details open><summary>Heading</summary><p></p></details>'
    const paragraph = document.querySelector("details > p")!
    $.move(paragraph)
    feature.processSelection()
    expect($.isGapSelection).toBe(false)
    expect(paragraph).toHaveClass("◆empty-selected")
  })

  it("only exits a multiline summary vertically from its first or last line", () => {
    document.body.innerHTML = '<details><summary>012345678901234567890123456789</summary></details>'
    const text = document.querySelector("summary")!.firstChild!
    const original = Range.prototype.getBoundingClientRect
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {configurable: true, value: function(this: Range) {
      return new DOMRect(20, 100 + Math.min(2, Math.floor(this.startOffset / 10)) * 20, 1, 20)
    }})
    try {
      $.move(text, 15)
      expect(press("ArrowUp").defaultPrevented).toBe(false)
      expect(press("ArrowDown").defaultPrevented).toBe(false)
      $.move(text, 5)
      expect(press("ArrowUp").defaultPrevented).toBe(true)
      expect($.detailsGap?.placement).toBe("before")
      $.move(text, 25)
      expect(press("ArrowDown").defaultPrevented).toBe(true)
      expect($.detailsGap?.placement).toBe("after")
    }
    finally {
      Object.defineProperty(Range.prototype, "getBoundingClientRect", {configurable: true, value: original})
    }
  })

  it.each(["before", "after"] as const)("inserts typed content outside details from its %s gap", placement => {
    const details = document.querySelector("details")!
    const original = details.innerHTML
    $.selectGap(details, placement)
    feature.processSelection()
    document.body.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "New", bubbles: true, cancelable: true}))
    const paragraph = placement === "before" ? details.previousElementSibling : details.nextElementSibling
    expect(paragraph?.textContent).toBe("New")
    expect(details.innerHTML).toBe(original)
    expect(details.open).toBe(false)
  })
})
