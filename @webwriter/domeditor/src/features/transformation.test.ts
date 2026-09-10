// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"

import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor
let feature: DOMEditor["features"]["transformation"]

beforeEach(() => {
  document.body.replaceChildren()
  document.body.className = ""
  document.documentElement.className = ""
  document.getSelection()?.removeAllRanges()
  editor = new DOMEditor()
  document.body.replaceChildren()
  editor.doc.syncFromDOM()
  feature = editor.features.transformation
})

afterEach(() => {
  vi.restoreAllMocks()
  editor.destroy()
})

function append<T extends Element>(element: T) {
  document.body.append(element)
  return element
}

function targetElement(tag = "p") {
  const element = document.createElement(tag)
  element.textContent = "target"
  return append(element)
}

/** Happy-dom has no layout. Keep the rect tied to authored offsets so the
 * movement/resize code still exercises its geometry calculations. */
function mockRect(target: HTMLElement, values: {left?: number, top?: number, width?: number, height?: number} = {}) {
  const base = {left: 100, top: 100, width: 100, height: 50, ...values}
  vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
    const left = base.left + (parseFloat(target.style.left) || 0)
    const top = base.top + (parseFloat(target.style.top) || 0)
    const width = parseFloat(target.style.width) || base.width
    const height = parseFloat(target.style.height) || base.height
    return {x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({})} as DOMRect
  })
}

function selectNode(target: Element) {
  const parent = target.parentNode!
  const index = Array.from(parent.childNodes).indexOf(target)
  $.selectRange(parent, index, parent, index + 1)
  editor.features.selection.processSelection()
}

function captureNode(target: Element) {
  editor.features.selection.captureElement(target)
}

function pointer(type: string, options: PointerEventInit = {}) {
  return new PointerEvent(type, {bubbles: true, composed: true, button: 0, ...options})
}

async function mutationsDelivered() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("selection-owned transformation", () => {
  it("starts from ordinary element selection", () => {
    const target = targetElement()
    selectNode(target)

    expect(feature.target).toBe(target)
    expect(target).toHaveClass("◆transform-target")
    expect(feature.overlay).toBe(editor.appendix.querySelector("#◆transform-overlay"))
  })

  it("starts from capture selection and keeps the capture after a completed drag", () => {
    const target = targetElement()
    captureNode(target)
    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(feature.target).toBe(target)

    target.style.position = "absolute"
    target.style.width = "100px"
    target.style.height = "50px"
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 120, clientY: 100}))
    feature.handleMoveEnd()

    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(feature.target).toBe(target)
  })

  it("keeps all controls in the shadow appendix and gates rotate/z-order on absolute positioning", () => {
    const target = targetElement()
    target.style.position = "relative"
    selectNode(target)

    expect(document.body.querySelector("#◆transform-overlay")).toBeNull()
    expect(editor.appendix.querySelectorAll(".◆transform-overlay-scale")).toHaveLength(4)
    for(const direction of ["up-left", "up-right", "down-left", "down-right"]) {
      expect(editor.appendix.querySelector(`#◆transform-overlay-scale-${direction}`)).not.toBeNull()
    }
    expect(editor.appendix.querySelectorAll(".◆transform-overlay-edge")).toHaveLength(4)
    for(const direction of ["up-up", "left-left", "right-right", "down-down"]) {
      expect(editor.appendix.querySelector(`#◆transform-overlay-scale-${direction}`)).toBeNull()
    }
    expect(editor.appendix.querySelector("#◆transform-overlay-mover")).not.toBeNull()
    expect(editor.appendix.querySelector("#◆transform-overlay-restorer")).toBeNull()
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-arranger")).toHaveProperty("hidden", true)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-rotator")).toHaveProperty("hidden", true)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-orderer")).toHaveProperty("hidden", true)

    target.style.position = "absolute"
    feature.updateInfo()
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-rotator")).toHaveProperty("hidden", false)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-orderer")).toHaveProperty("hidden", false)
  })

  it("marks the overlay for top placement when the target reaches the viewport top", () => {
    const target = targetElement()
    target.style.position = "absolute"
    let top = 0
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => ({
      x: 100, y: top, left: 100, top, right: 200, bottom: top + 50, width: 100, height: 50,
      toJSON: () => ({}),
    } as DOMRect))
    selectNode(target)

    const hasTopPart = () => feature.overlay.getAttribute("part")?.split(/\s+/).includes("transform-overlay-at-top")
    expect(hasTopPart()).toBe(true)
    top = 100
    feature.updateInfo()
    expect(hasTopPart()).toBe(false)
  })

  it("clears the target and appendix state when selection is deselected", () => {
    const target = targetElement()
    selectNode(target)
    $.selectDocumentStart()
    editor.features.selection.processSelection()

    expect(feature.target).toBeNull()
    expect(target).not.toHaveClass("◆transform-target")
    expect(feature.overlay).toHaveAttribute("visibility", "hidden")
  })

  it("clears a disconnected target without touching authored children", async () => {
    const target = targetElement()
    const child = target.appendChild(document.createElement("custom-content"))
    selectNode(target)
    target.remove()
    await Promise.resolve()

    expect(feature.target).toBeNull()
    expect(target).not.toHaveClass("◆transform-target")
    expect(target.firstElementChild).toBe(child)
  })
})

describe("transform controls and geometry", () => {
  function expectAnchorAt(left: number, top: number) {
    const overlay = feature.overlay
    const matrix = new DOMMatrix(overlay.style.transform)
    const x = parseFloat(feature.anchor.style.left) - parseFloat(overlay.style.width) / 2
    const y = parseFloat(feature.anchor.style.top) - parseFloat(overlay.style.height) / 2
    expect(parseFloat(overlay.style.left) + parseFloat(overlay.style.width) / 2 + matrix.a * x + matrix.c * y).toBeCloseTo(left)
    expect(parseFloat(overlay.style.top) + parseFloat(overlay.style.height) / 2 + matrix.b * x + matrix.d * y).toBeCloseTo(top)
    const orientation = matrix.multiply(new DOMMatrix(feature.anchor.style.transform))
    expect(orientation.a).toBeCloseTo(1)
    expect(orientation.b).toBeCloseTo(0)
    expect(orientation.c).toBeCloseTo(0)
    expect(orientation.d).toBeCloseTo(1)
  }

  it.each(["absolute", "fixed"])("places the %s anchor at the positioning ancestor's top-left corner", position => {
    const ancestor = append(document.createElement("section"))
    ancestor.style.cssText = "position: relative; display: block; transform: scale(2)"
    mockRect(ancestor, {left: 30, top: 40})
    const wrapper = ancestor.appendChild(document.createElement("span"))
    wrapper.style.display = "inline"
    const target = wrapper.appendChild(document.createElement("custom-widget"))
    target.style.position = position
    target.style.rotate = "90deg"
    mockRect(target)
    selectNode(target)

    expectAnchorAt(30, 40)
    expect(feature.anchor.getRootNode()).toBe(editor.appendix)
    expect(ancestor.querySelector("#◆transform-overlay-anchor")).toBeNull()
  })

  it.each(["static", "relative", "sticky"])("hides the anchor for %s positioning and updates it when the mode changes", position => {
    const target = targetElement()
    target.style.position = position
    selectNode(target)

    expect(feature.anchor.hidden).toBe(true)
    expect(feature.anchor).toHaveAttribute("part", expect.stringContaining("transform-overlay-anchor-hidden"))

    for(const visiblePosition of ["absolute", "fixed"]) {
      target.style.position = visiblePosition
      feature.updateInfo()
      expect(feature.anchor.hidden).toBe(false)

      target.style.position = position
      feature.updateInfo()
      expect(feature.anchor.hidden).toBe(true)
    }
  })

  it("updates the anchor when the positioning ancestor moves or is replaced", () => {
    const ancestor = append(document.createElement("section"))
    ancestor.style.position = "relative"
    mockRect(ancestor, {left: 30, top: 40})
    const target = ancestor.appendChild(document.createElement("p"))
    target.style.position = "absolute"
    mockRect(target)
    selectNode(target)
    expectAnchorAt(30, 40)

    ancestor.style.top = "-20px"
    feature.updateInfo()
    expectAnchorAt(30, 20)

    const replacement = append(document.createElement("section"))
    replacement.style.position = "relative"
    mockRect(replacement, {left: 70, top: 80})
    replacement.append(target)
    ancestor.remove()
    feature.updateInfo()
    expectAnchorAt(70, 80)
  })

  it.each(["absolute", "fixed"])("places a %s anchor at the viewport origin without a positioning ancestor", position => {
    vi.spyOn(window, "scrollX", "get").mockReturnValue(20)
    vi.spyOn(window, "scrollY", "get").mockReturnValue(40)
    const target = targetElement()
    target.style.position = position
    mockRect(target)
    selectNode(target)

    expectAnchorAt(position === "fixed" ? 0 : -20, position === "fixed" ? 0 : -40)
  })

  it("does not move a static target before the eight-pixel threshold", () => {
    const target = targetElement()
    target.setAttribute("data-unknown", "keep")
    const before = target.getAttribute("style")
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 105, clientY: 106}))
    feature.handleMoveEnd()

    expect(target.getAttribute("style")).toBe(before)
    expect(target).toHaveAttribute("data-unknown", "keep")
  })

  it("detaches a static target into absolute positioning after the threshold", () => {
    const target = targetElement()
    target.style.width = "100px"
    target.style.height = "50px"
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 120, clientY: 100}))

    expect(target.style.position).toBe("absolute")
    expect(target.style.width).toBe("100px")
    expect(target.style.height).toBe("50px")
    feature.handleMoveEnd()
  })

  it("constrains movement to one axis with Shift and keeps unsnapped coordinates with Alt", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 124, clientY: 132, shiftKey: true}))

    expect(target.style.left).toBe("0px")
    expect(target.style.top).toBe("30px")
    feature.handleMoveEnd()

    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 113, clientY: 100, altKey: true}))
    expect(target.style.left).toBe("13px")
    feature.handleMoveEnd()
  })

  it("keeps a paused drag in one undo item and redoes it", async () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 110, clientY: 100}))
    await mutationsDelivered()
    await new Promise(resolve => setTimeout(resolve, 550))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 130, clientY: 100}))
    await mutationsDelivered()
    feature.handleMoveEnd()
    await mutationsDelivered()
    const finalLeft = target.style.left

    editor.doc.undo()
    await mutationsDelivered()
    expect((document.body.lastElementChild as HTMLElement).getAttribute("style")).not.toContain("left: 30px")
    editor.doc.redo()
    await mutationsDelivered()
    expect((document.body.lastElementChild as HTMLElement).getAttribute("style")).toContain(`left: ${finalLeft}`)
  })

  it.each(["relative", "sticky", "fixed"] as const)("retains %s positioning while moving", position => {
    const target = targetElement()
    Object.assign(target.style, {position, width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 120, clientY: 100}))
    feature.handleMoveEnd()

    expect(target.style.position).toBe(position)
  })

  it("handles scale through composed appendix pointer events", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!

    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 220, clientY: 150}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 220, clientY: 150}))

    expect(parseFloat(target.style.width)).toBeGreaterThan(100)
    expect(target).toHaveClass("◆transform-target")
  })

  describe.each([false, true])("edge resizing with capture selection %s", captured => {
    it.each([
      {edge: "right", x: 200, y: 115, dx: 20, dy: 13, width: "120px", height: "50px", left: "0px", top: "0px"},
      {edge: "left", x: 100, y: 115, dx: -20, dy: 13, width: "120px", height: "50px", left: "-20px", top: "0px"},
      {edge: "up", x: 130, y: 100, dx: 13, dy: -20, width: "100px", height: "70px", left: "0px", top: "-20px"},
      {edge: "down", x: 130, y: 150, dx: 13, dy: 20, width: "100px", height: "70px", left: "0px", top: "0px"},
    ])("resizes only the $edge axis and preserves the opposite edge", ({edge, x, y, dx, dy, width, height, left, top}) => {
      const target = targetElement(captured ? "demo-widget" : "p")
      const child = target.appendChild(document.createElement(captured ? "unfamiliar-content" : "mark"))
      target.appendChild(document.createComment("keep"))
      target.setAttribute("data-authored", "keep")
      Object.assign(target.style, {position: "relative", width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      if(captured) captureNode(target)
      else selectNode(target)
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${edge}`)!

      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: x, clientY: y}))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: x + dx, clientY: y + dy}))
      expect(document.body).toHaveClass(`◆transform-scaling-${dx === 13 ? "ns" : "ew"}`)
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

      expect(target.style.width).toBe(width)
      expect(target.style.height).toBe(height)
      expect(target.style.left).toBe(left)
      expect(target.style.top).toBe(top)
      expect(target.style.position).toBe("relative")
      expect(target.firstElementChild).toBe(child)
      expect(target.lastChild?.nodeType).toBe(Node.COMMENT_NODE)
      expect(target).toHaveAttribute("data-authored", "keep")
      expect(target).toHaveClass("◆element-selected")
      expect(editor.features.selection.captureSelectedElement).toBe(captured ? target : null)
      expect(document.body).not.toHaveClass("◆transform-scaling-ew", "◆transform-scaling-ns")
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).not.toContain("transform-overlay-edge")
      expect(editor.doc.body.toString()).not.toContain("transform-overlay-edge")
    })
  })

  it.each([
    {modifiers: {altKey: true}, width: "113px", left: "0px", scale: ""},
    {modifiers: {ctrlKey: true}, width: "130px", left: "-15px", scale: ""},
    {modifiers: {shiftKey: true}, width: "100px", left: "5px", scale: "1.1 1"},
  ])("preserves resize modifiers at edges: $modifiers", ({modifiers, width, left, scale}) => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 213, clientY: 115, ...modifiers}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

    expect(target.style.width).toBe(width)
    expect(target.style.height).toBe("50px")
    // The mock rect does not apply CSS scale; the measured offset compensates for it.
    expect(target.style.left).toBe(left)
    expect(target.style.getPropertyValue("scale")).toBe(scale)
  })

  it.each(["Escape", "pointercancel", "removed"])("cleans up an edge resize on %s", cancellation => {
    const target = targetElement()
    Object.assign(target.style, {position: "relative", width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 220, clientY: 115}))
    expect(target.style.width).toBe("120px")
    target.style.color = "red"
    if(cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(cancellation === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    else {
      target.remove()
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 230, clientY: 115}))
    }
    expect(target.style.width).toBe("100px")
    expect(target.style.color).toBe("red")
    expect(document.body).not.toHaveClass("◆transform-scaling-ew", "◆transform-scaling-ns")
  })

  it("rotates only an absolute target", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
    feature.handleRotateEnd()
    expect(target.style.getPropertyValue("rotate")).toBe("90deg")

    target.style.position = "relative"
    feature.updateInfo()
    target.style.removeProperty("rotate")
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
    expect(target.style.getPropertyValue("rotate")).toBe("")
  })
})

describe("drop, cancellation, and document ownership", () => {
  it("sets float through the appendix buttons", () => {
    const target = targetElement()
    selectNode(target)
    const click = (id: string) => feature.overlay.querySelector<HTMLElement>(id)!.dispatchEvent(new MouseEvent("click", {bubbles: true}))

    click("#◆transform-overlay-float-left")
    expect(target.style.float).toBe("left")
    click("#◆transform-overlay-float-right")
    expect(target.style.float).toBe("right")
    click("#◆transform-overlay-float-none")
    expect(target.style.float).toBe("")
  })

  it("restores transform properties while retaining unrelated styling", () => {
    const target = targetElement()
    Object.assign(target.style, {
      width: "80px", height: "40px", position: "absolute", top: "12px", left: "14px",
      float: "left", color: "rebeccapurple",
    })
    target.style.setProperty("rotate", "15deg")
    target.style.setProperty("z-index", "7")
    target.style.setProperty("--unfamiliar", "keep")
    selectNode(target)
    feature.restore()

    for(const property of ["width", "height", "rotate", "float", "position", "top", "left", "z-index"]) {
      expect(target.style.getPropertyValue(property)).toBe("")
    }
    expect(target.style.color).toBe("rebeccapurple")
    expect(target.style.getPropertyValue("--unfamiliar")).toBe("keep")
  })

  it("cycles anchor positioning with Ctrl/Cmd and switches to fixed with Shift", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "80px", height: "40px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    const anchor = feature.anchor
    const modifierClick = (options: MouseEventInit = {}) => anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, ctrlKey: true, ...options}))

    modifierClick()
    expect(target.style.position).toBe("relative")
    modifierClick()
    expect(target.style.position).toBe("sticky")
    modifierClick()
    expect(target.style.position).toBe("absolute")
    modifierClick({ctrlKey: false, shiftKey: true})
    expect(target.style.position).toBe("fixed")
  })

  it("uses front/back z-order controls without touching nested peers", () => {
    const target = targetElement()
    const sibling = targetElement()
    const nested = target.appendChild(document.createElement("span")) as HTMLElement
    Object.assign(target.style, {position: "absolute", zIndex: "1"})
    Object.assign(sibling.style, {position: "absolute", zIndex: "2"})
    Object.assign(nested.style, {position: "absolute", zIndex: "77"})
    selectNode(target)

    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-z-front")!.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(parseInt(target.style.zIndex)).toBeGreaterThan(parseInt(sibling.style.zIndex))
    expect(nested.style.zIndex).toBe("77")
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-z-back")!.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(parseInt(target.style.zIndex)).toBeLessThan(parseInt(sibling.style.zIndex))
    expect(nested.style.zIndex).toBe("77")
  })

  it("excludes editor markers from serialized and shared HTML", () => {
    const target = targetElement()
    selectNode(target)
    expect(target).toHaveClass("◆transform-target")
    editor.doc.syncFromDOM()

    expect(editor.toHTML(true)).not.toContain("◆transform-target")
    expect(editor.toHTML(true)).not.toContain("◆element-selected")
    expect(editor.doc.body.toString()).not.toContain("◆transform-target")
    expect(editor.doc.body.toString()).not.toContain("◆element-selected")
  })

  it("disables the feature by removing overlay and active gesture markers", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 130, clientY: 100}))
    expect(document.body).toHaveClass("◆transform-moving")

    feature.disable()

    expect(editor.appendix.querySelector("#◆transform-overlay")).toBeNull()
    expect(document.body).not.toHaveClass("◆transform-moving", "◆transform-rotating", "◆transform-scaling-ew", "◆transform-scaling-ns")
    expect(target).not.toHaveClass("◆transform-target")
  })

  it("returns a Ctrl/Cmd drop to normal flow while preserving size, rotation, and unknown structure", () => {
    const target = targetElement()
    const child = target.appendChild(document.createElement("unfamiliar-node"))
    Object.assign(target.style, {width: "80px", height: "40px"})
    target.style.setProperty("rotate", "15deg")
    const dropTarget = targetElement()
    mockRect(target)
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue({left: 300, top: 100, right: 400, bottom: 200, width: 100, height: 100, x: 300, y: 100, toJSON: () => ({})} as DOMRect)
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [dropTarget]),
    })
    selectNode(target)

    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 310, clientY: 150, ctrlKey: true}))
    feature.handleMoveEnd()

    expect(target.parentElement).toBe(dropTarget.parentElement)
    expect(dropTarget.nextElementSibling).toBe(target)
    expect(target.style.width).toBe("80px")
    expect(target.style.height).toBe("40px")
    expect(target.style.getPropertyValue("rotate")).toBe("15deg")
    expect(target.firstElementChild).toBe(child)
  })

  it("reverts only properties owned by an Escape-cancelled gesture", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 130, clientY: 100}))
    target.style.width = "140px"
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))

    expect(target.style.left).toBe("0px")
    expect(target.style.width).toBe("140px")
  })

  it("reverts only properties owned by a pointer-cancelled gesture", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new PointerEvent("pointerdown", {button: 0, pointerId: 7, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new PointerEvent("pointermove", {button: 0, pointerId: 7, buttons: 1, clientX: 130, clientY: 100}))
    target.style.height = "70px"
    document.dispatchEvent(pointer("pointercancel", {pointerId: 7}))

    expect(target.style.left).toBe("0px")
    expect(target.style.height).toBe("70px")
  })

  it("does not swallow input from a capture-selected authored element", () => {
    const target = targetElement()
    captureNode(target)
    let received = false
    target.addEventListener("input", () => { received = true })
    const event = new Event("input", {bubbles: true, cancelable: true})
    expect(target.dispatchEvent(event)).toBe(true)
    expect(received).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it("does not style nested static children during z-order changes", () => {
    const target = targetElement()
    const sibling = targetElement()
    const nested = target.appendChild(document.createElement("span")) as HTMLElement
    nested.style.zIndex = "77"
    Object.assign(target.style, {position: "absolute", zIndex: "1"})
    Object.assign(sibling.style, {position: "absolute", zIndex: "2"})

    feature.moveZ(target, true)

    expect(nested.style.zIndex).toBe("77")
    expect(target.style.zIndex).not.toBe("1")
  })
})
