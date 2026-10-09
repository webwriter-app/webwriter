// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"

import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"

let editor: DOMEditor
let feature: DOMEditor["features"]["transformation"]
let floatStylesheet: HTMLStyleElement

beforeEach(() => {
  document.body.replaceChildren()
  floatStylesheet = document.createElement("style")
  floatStylesheet.textContent = ".ww-float-left { float: left !important } .ww-float-right { float: right !important } .ww-float-none { float: none !important }"
  document.head.append(floatStylesheet)
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
  floatStylesheet.remove()
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
function mockRect(target: HTMLElement | SVGSVGElement, values: {left?: number, top?: number, width?: number, height?: number} = {}) {
  const base = {left: 100, top: 100, width: 100, height: 50, ...values}
  const computedStyle = vi.mocked(getComputedStyle).getMockImplementation?.() ?? getComputedStyle
  const size = () => {
    const style = computedStyle(target)
    const limit = (value: string) => Number.isFinite(parseFloat(value)) ? parseFloat(value) : Infinity
    return {
      width: Math.min(parseFloat(style.width) || base.width, limit(style.maxWidth)),
      height: Math.min(parseFloat(style.height) || base.height, limit(style.maxHeight)),
    }
  }
  // Browsers expose used dimensions after max-size constraints; Happy DOM does not.
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computedStyle(element, pseudo)
    return element !== target ? style : new Proxy(style, {
      get(style, property) {
        if(property === "width" || property === "height") return `${size()[property]}px`
        const value = Reflect.get(style, property, style)
        return typeof value === "function" ? value.bind(style) : value
      },
    })
  })
  vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
    const left = base.left + (parseFloat(target.style.left) || 0)
    const top = base.top + (parseFloat(target.style.top) || 0)
    const {width, height} = size()
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
  it.each(["p", "demo-widget", "svg"])("element-selects a %s with the Move affordance without moving it", async tag => {
    const target = tag === "svg" ? append(document.createElementNS("http://www.w3.org/2000/svg", "svg")) : targetElement(tag)
    target.innerHTML = tag === "svg" ? '<g><circle r="5"/></g><!--keep-->' : "before<!--keep--><b>target</b><i>after</i>"
    const section = document.createElement("section")
    target.replaceWith(section)
    section.append(target)
    const children = Array.from(target.childNodes)
    mockRect(target)
    captureNode(target)
    const mover = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!
    expect(mover).toHaveAccessibleName("Move")
    expect(mover.title).toBe("Move")
    expect(mover.dataset.transformMode).toBe("move")
    expect(feature.overlay.querySelector("#◆transform-overlay-selector")).toBeNull()
    mover.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    mover.click()

    expect($.selectedElement).toBe(target)
    expect($.isElementSelection).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(target.parentElement).toBe(section)
    expect(Array.from(target.childNodes)).toEqual(children)
    expect(target.hasAttribute("style")).toBe(false)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    expect(editor.toHTML(true)).not.toMatch(/◆|transform-overlay/)
    expect(editor.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
    editor.destroy()
    expect(target.getAttribute("class") ?? "").not.toContain("◆")
  })

  it.each(["p", "demo-widget", "svg"])("deletes the current %s and supports undo/redo", async tag => {
    const target = tag === "svg" ? append(document.createElementNS("http://www.w3.org/2000/svg", "svg")) : targetElement(tag)
    target.innerHTML = tag === "svg" ? '<g><circle r="5"/></g><!--keep-->' : 'before<!--keep--><unfamiliar-node>keep</unfamiliar-node>'
    const sibling = targetElement()
    const before = document.createComment("keep sibling")
    target.before(before)
    captureNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const initial = editor.toHTML(true)
    const deleter = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
    expect(deleter).toHaveAccessibleName("Delete")
    deleter.click()
    expect(target.isConnected).toBe(false)
    expect(sibling.previousSibling).toBe(before)
    expect(target.className?.toString() ?? "").not.toContain("◆")
    expect(feature.target).toBeNull()
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const deleted = editor.toHTML(true)
    expect(deleted).not.toMatch(/◆|transform-overlay/)
    editor.doc.undo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(initial)
    editor.doc.redo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(deleted)
  })

  it("ignores disconnected targets and locked editing on Delete", () => {
    const target = targetElement()
    captureNode(target)
    const deleter = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
    target.remove()
    const sibling = targetElement()
    deleter.click()
    expect(sibling.isConnected).toBe(true)
    captureNode(sibling)
    vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    deleter.click()
    expect(sibling.isConnected).toBe(true)
  })

  it("clears table-cell selection when the Move affordance selects the table", () => {
    const table = append(document.createElement("table"))
    table.innerHTML = "<tbody><tr><td>A</td><td>B</td></tr></tbody>"
    const cells = table.querySelectorAll("td")
    editor.features.table.selectCells(cells[0], cells[1])
    feature.startTransform(table)
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!.click()
    expect($.selectedElement).toBe(table)
    expect(editor.features.table.hasCellSelection).toBe(false)
  })

  it("retains capture if the Move pointer interaction is cancelled", () => {
    const target = targetElement("demo-widget")
    captureNode(target)
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!
      .dispatchEvent(pointer("pointerdown", {pointerId: 3}))
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(target.hasAttribute("style")).toBe(false)
  })

  it("uses the current target and ignores a disconnected target on Move", () => {
    const first = targetElement(), second = targetElement("demo-widget")
    captureNode(first)
    const mover = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!
    captureNode(second)
    mover.click()
    expect($.selectedElement).toBe(second)
    captureNode(first)
    first.remove()
    mover.click()
    expect($.selectedElement).not.toBe(first)
    expect(second.isConnected).toBe(true)
  })

  it.each([
    {control: "outline", selector: ".◆transform-overlay-edge"},
    {control: "resize", selector: "#◆transform-overlay-scale-down-right"},
  ])("switches capture to element selection on a $control click, but retains capture on cancellation", ({selector}) => {
    const target = targetElement("demo-widget")
    target.innerHTML = "before<!--keep--><b>target</b><i>after</i>"
    const children = Array.from(target.childNodes)
    const section = document.createElement("section")
    target.replaceWith(section)
    section.append(target)
    mockRect(target)
    for(const ending of ["pointercancel", "pointerup"]) {
      captureNode(target)
      const handle = feature.overlay.querySelector<HTMLElement>(selector)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
      document.dispatchEvent(pointer(ending, {pointerId: 3}))
      if(ending === "pointerup") handle.click()
      expect(editor.features.selection.captureSelectedElement).toBe(ending === "pointercancel" ? target : null)
      if(ending === "pointerup") expect($.selectedElement).toBe(target)
      expect(target.parentElement).toBe(section)
      expect(Array.from(target.childNodes)).toEqual(children)
      expect(target.hasAttribute("style")).toBe(false)
    }
  })

  describe.each(["canvas", "slides"] as const)("selections inside %s items", mode => {
    it("restores dimensions on cancellation and supports undo/redo after resizing", async () => {
      const target = targetElement()
      target.id = "resized-item"
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      Object.assign(target.style, {width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      selectNode(target)
      captureNode(target)
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      const initial = target.getAttribute("style")
      const drag = () => {
        feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
          .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
        document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 180}))
      }
      drag()
      expect(target.style.width).toBe("140px")
      document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
      expect(target.getAttribute("style")).toBe(initial)
      drag()
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
      await mutationsDelivered()
      const resized = target.getAttribute("style")
      expect(resized).toContain("width: 140px")
      expect(editor.toHTML(true)).not.toContain("transform-overlay")
      expect(editor.doc.body.toString()).toContain("width: 140px")
      editor.doc.undo()
      await mutationsDelivered()
      expect(document.getElementById("resized-item")!.getAttribute("style")).toBe(initial)
      editor.doc.redo()
      await mutationsDelivered()
      expect(document.getElementById("resized-item")!.getAttribute("style")).toBe(resized)
    })

    it.each([
      {direction: "down-right", dx: 40, dy: 30, width: 140, height: 80},
      {direction: "right-right", dx: 40, dy: 30, width: 140, height: 50},
      {direction: "down-down", dx: 40, dy: 30, width: 100, height: 80},
      {direction: "up-left", dx: -40, dy: -30, width: 140, height: 80},
      {direction: "down-right", dx: -20, dy: -10, width: 80, height: 40},
    ])("changes rendered dimensions with $direction ($dx, $dy)", ({direction, dx, dy, width, height}) => {
      const target = targetElement("demo-widget")
      target.innerHTML = "<span>content</span><!--keep-->"
      const children = Array.from(target.childNodes)
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      Object.assign(target.style, {width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      selectNode(target)
      captureNode(target)
      expect(feature.target).toBe(target)
      const before = target.getBoundingClientRect()
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

      const after = target.getBoundingClientRect()
      expect(after.width).toBe(width)
      expect(after.height).toBe(height)
      expect(direction.includes("left") ? after.right : after.left).toBe(direction.includes("left") ? before.right : before.left)
      expect(direction.includes("up") ? after.bottom : after.top).toBe(direction.includes("up") ? before.bottom : before.top)
      expect(Array.from(target.childNodes)).toEqual(children)
      expect(document.body.className).not.toContain("◆transform-scaling")
    })

    function item() {
      document.body.innerHTML = "<article><p>Hello <em>world</em></p><p></p><hr><table><tr><td>A</td><td>B</td></tr></table><ul></ul><demo-widget></demo-widget></article>"
      const article = document.querySelector("article")!
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      return article
    }

    it.each(["Delete", "Backspace"])("deletes the whole root with %s after clicking its content-selection frame, with undo/redo", async key => {
      const article = item()
      article.id = "deleted-root"
      article.insertAdjacentHTML("beforeend", '<div style="position: absolute"><demo-widget><span>Nested</span></demo-widget><svg><circle r="5"></circle></svg><!--keep--></div>')
      const sibling = document.createElement("p")
      sibling.textContent = "Neighbor"
      article.after(sibling)
      Object.assign(article.style, {left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      captureNode(article.querySelector("demo-widget")!)
      const frame = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
      frame.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
      expect(editor.features.selection.captureSelectedElement).toBeNull()
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const contents = cloneWithoutEditorMarkers(article, true)
      const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})
      document.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(article.isConnected).toBe(false)
      expect(sibling.isConnected).toBe(true)
      expect(sibling.textContent).toBe("Neighbor")
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).not.toContain("deleted-root")
      expect(editor.toHTML(true)).not.toContain("◆")
      editor.doc.undo()
      await mutationsDelivered()
      expect(document.getElementById("deleted-root")!.innerHTML).toBe(contents.innerHTML)
      editor.doc.redo()
      await mutationsDelivered()
      expect(document.getElementById("deleted-root")).toBeNull()
      expect(sibling.isConnected).toBe(true)
    })

    it("keeps the interior free of drag surfaces and uses borders for moving and corners for resizing", () => {
      const article = item()
      selectNode(article)
      expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()
      selectNode(article.querySelector("p")!)
      expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()
      for(const edge of feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-edge")) {
        expect(edge.dataset.transformMode).toBe("move")
        expect(edge.title).toBe("Move")
      }
      for(const corner of feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale")) expect(corner.dataset.transformMode).toBe("scale")
      expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!.hidden).toBe(true)
      expect(feature.orderer.hidden).toBe(true)
      expect(feature.overlay.querySelectorAll(".◆transform-overlay-midpoint:not([hidden])")).toHaveLength(4)
    })

    it("promotes a table-cell selection to the root and keeps it selected when resizing is cancelled", () => {
      const article = item()
      Object.assign(article.style, {left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      const cells = article.querySelectorAll("td")
      editor.features.table.selectCells(cells[0], cells[1])
      editor.features.selection.processSelection()
      const before = article.style.cssText
      feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
        .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
      expect(editor.features.table.hasCellSelection).toBe(false)
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 180}))
      document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
      expect(article.style.cssText).toBe(before)
      expect($.selectedElement).toBe(article)
      expect(feature.target).toBe(article)
    })

    it.each(["scale-right", "scale-up-up", "scale-down-down", "scale-left-left", "scale-right-right", "scale-down-right", "rotator"])("selects the root from an inner text range and immediately drags %s", control => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      Object.assign(article.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      document.getSelection()!.setBaseAndExtent(text, 4, text, 1)
      editor.features.selection.processSelection()
      expect(feature.overlay.getAttribute("part")?.split(/\s+/)).toContain("transform-overlay-content-selected")
      const before = article.style.cssText
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${control}`)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
      expect(editor.features.selection.captureSelectedElement).toBeNull()
      expect(feature.overlay.getAttribute("part")?.split(/\s+/)).not.toContain("transform-overlay-content-selected")
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, altKey: true, clientX: 220, clientY: 180}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 220, clientY: 180}))
      expect(article.style.cssText).not.toBe(before)
      expect($.selectedElement).toBe(article)
      expect($.isElementSelection).toBe(true)
      expect(feature.target).toBe(article)
      if(control === "scale-right") {
        expect(article.style.width).toBe("100px"); expect(article.style.height).toBe("50px")
        expect(article.style.left).toBe("20px"); expect(article.style.top).toBe("30px")
      }
    })

    it("shows controls for text, empty, gap, virtual-list and cell selections without selecting the item", () => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      const check = () => {
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        expect(feature.target).toBe(article)
        expect(article).toHaveClass("◆transform-target")
        expect(article).not.toHaveClass("◆element-selected")
        expect(feature.overlay).not.toHaveAttribute("visibility", "hidden")
        expect(feature.overlay.getAttribute("part")?.split(/\s+/)).toContain("transform-overlay-content-selected")
      }
      $.selectRange(text, 1, text, 4); check()
      expect(document.getSelection()?.toString()).toBe("orl")
      expect($.isTextSelection).toBe(true)
      $.move(article.querySelector("p:empty")!); check()
      expect($.isEmptySelection).toBe(true)
      $.selectGap(article.querySelector("hr")!, "before"); check()
      expect($.isGapSelection).toBe(true)
      $.move(article.querySelector("ul")!); check()
      expect(editor.features.list.isVirtualSelection).toBe(true)
      const cells = article.querySelectorAll("td")
      editor.features.table.selectCells(cells[0], cells[1]); check()
      expect(editor.features.table.hasCellSelection).toBe(true)
      editor.features.table.clearCellSelection()
      editor.features.selection.selectElement(article)
      expect(feature.overlay.getAttribute("part")?.split(/\s+/)).not.toContain("transform-overlay-content-selected")
    })

    it("frames the direct item for nested node and capture selections, then follows another item", () => {
      const article = item(), paragraph = article.querySelector("p")!, widget = article.querySelector("demo-widget")!
      selectNode(paragraph)
      expect($.selectedElement).toBe(paragraph)
      expect(feature.target).toBe(article)
      captureNode(widget)
      expect(editor.features.selection.captureSelectedElement).toBe(widget)
      expect(feature.target).toBe(article)
      const next = document.createElement("p"); next.textContent = "Next"
      article.after(next)
      editor.features.selection.selectDropRange((() => { const range = document.createRange(); range.setStart(next.firstChild!, 1); range.collapse(true); return range })())
      expect(feature.target).toBe(next)
      expect(article).not.toHaveClass("◆transform-target")
    })

    it("cleans up disconnected targets and excludes controls from saved and shared content", async () => {
      const article = item()
      $.move(article.querySelector("em")!.firstChild!, 1)
      editor.features.selection.processSelection()
      expect(feature.target).toBe(article)
      expect(editor.toHTML(true)).not.toContain("◆transform-target")
      editor.doc.syncFromDOM()
      expect(editor.doc.body.toString()).not.toContain("◆transform-target")
      article.remove()
      await mutationsDelivered()
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      expect(feature.target).not.toBe(article)
      expect(article).not.toHaveClass("◆transform-target")
    })
  })

  it("keeps controls hidden for text inside ordinary document content", () => {
    const paragraph = targetElement()
    $.move(paragraph.firstChild!, 2)
    editor.features.selection.processSelection()
    expect(feature.target).toBeNull()
    expect(paragraph).not.toHaveClass("◆element-selected")
  })

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
    vi.spyOn($, "pointFromCoords").mockReturnValue(undefined)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 120, clientY: 100}))
    feature.handleMoveEnd()

    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(feature.target).toBe(target)
  })

  it("keeps all controls in the shadow appendix and hides positioning controls in document layout", () => {
    const target = targetElement()
    target.style.position = "relative"
    selectNode(target)

    expect(document.body.querySelector("#◆transform-overlay")).toBeNull()
    expect(editor.appendix.querySelectorAll(".◆transform-overlay-scale:not([hidden])")).toHaveLength(1)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.hidden).toBe(false)
    for(const direction of ["up-left", "up-right", "down-left"]) {
      expect(editor.appendix.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!.hidden).toBe(true)
    }
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-delete")!.hidden).toBe(false)
    for(const direction of ["up-left", "up-right", "down-left", "down-right"]) {
      expect(editor.appendix.querySelector(`#◆transform-overlay-scale-${direction}`)).not.toBeNull()
    }
    expect(editor.appendix.querySelectorAll(".◆transform-overlay-edge")).toHaveLength(4)
    for(const direction of ["up-up", "left-left", "right-right", "down-down"]) {
      expect(editor.appendix.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!.hidden).toBe(true)
    }
    expect(editor.appendix.querySelector("#◆transform-overlay-mover")).not.toBeNull()
    expect(editor.appendix.querySelector("#◆transform-overlay-restorer")).toBeNull()
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-arranger")).toHaveProperty("hidden", true)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-rotator")).toHaveProperty("hidden", true)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-orderer")).toHaveProperty("hidden", true)

    target.style.position = "absolute"
    feature.updateInfo()
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-rotator")).toHaveProperty("hidden", true)
    expect(editor.appendix.querySelector<HTMLElement>("#◆transform-overlay-orderer")).toHaveProperty("hidden", true)
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
  describe("unresolved CSS dimensions", () => {
    function unresolvedSize(target: HTMLElement, rect: {left: number, top: number, width: number, height: number}) {
      const computedStyle = getComputedStyle
      vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element, pseudo) => {
        const style = computedStyle(element, pseudo)
        if(element !== target) return style
        return new Proxy(style, {
          get(style, property) {
            if(property === "width") return "100%"
            if(property === "height") return "auto"
            const value = Reflect.get(style, property, style)
            return typeof value === "function" ? value.bind(style) : value
          },
        })
      })
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        x: rect.left, y: rect.top, left: rect.left, top: rect.top,
        right: rect.left + rect.width, bottom: rect.top + rect.height,
        width: rect.width, height: rect.height, toJSON: () => ({}),
      } as DOMRect)
    }

    it("uses the rendered rect for unresolved percentage and auto sizes in controls", () => {
      const target = targetElement("demo-widget")
      target.style.width = "100%"
      target.style.height = "auto"
      target.textContent = "authored"
      unresolvedSize(target, {left: 20, top: 30, width: 2000, height: 96})

      captureNode(target)

      expect(feature.overlay.style.width).toBe("2000px")
      expect(feature.overlay.style.height).toBe("96px")
      expect(target.getAttribute("style")).toBe("width: 100%; height: auto;")
      expect(target.textContent).toBe("authored")
      expect(target.parentElement).toBe(document.body)
    })

    it("falls back to offset dimensions for a rect scaled by an ancestor", () => {
      const ancestor = document.createElement("section")
      ancestor.style.transform = "scale(2)"
      const target = document.createElement("demo-widget")
      target.style.width = "100%"
      target.style.height = "auto"
      target.textContent = "authored"
      ancestor.append(target)
      document.body.append(ancestor)
      Object.defineProperties(target, {
        offsetWidth: {configurable: true, value: 2000},
        offsetHeight: {configurable: true, value: 96},
      })
      unresolvedSize(target, {left: 20, top: 30, width: 4000, height: 192})

      captureNode(target)

      expect(feature.overlay.style.width).toBe("2000px")
      expect(feature.overlay.style.height).toBe("96px")
      expect(target.getAttribute("style")).toBe("width: 100%; height: auto;")
      expect(target.textContent).toBe("authored")
      expect(target.parentElement).toBe(ancestor)
    })

    it("subtracts padding and borders from content-box CSS fallback without double counting", () => {
      const target = targetElement("demo-widget")
      target.style.cssText = "width: 100%; height: auto; box-sizing: content-box; padding: 5px; border: 2px solid"
      unresolvedSize(target, {left: 20, top: 30, width: 2000, height: 96})

      const geometry = feature.boxGeometry(target)

      expect(geometry.width).toBe(2000)
      expect(geometry.height).toBe(96)
      expect(target.getAttribute("style")).toContain("width: 100%")
    })

    it("preserves explicit zero pixel dimensions", () => {
      const target = targetElement("demo-widget")
      target.style.cssText = "width: 0px; height: 0px; box-sizing: content-box; padding: 5px; border: 2px solid"
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        x: 20, y: 30, left: 20, top: 30, right: 34, bottom: 44,
        width: 14, height: 14, toJSON: () => ({}),
      } as DOMRect)

      const geometry = feature.boxGeometry(target)

      expect(geometry.width).toBe(14)
      expect(geometry.height).toBe(14)
      expect(target.getAttribute("style")).toContain("width: 0px")
    })
  })

  describe("selection controls around native floats", () => {
    const flowSpan = (name: string) => {
      const value = feature.overlay.style.getPropertyValue(`--selection-flow-${name}`)
      return Number.parseFloat(value)
    }

    const setup = (height: number, floatSide: "left" | "right" = "right") => {
      const float = document.createElement("aside")
      float.style.float = floatSide
      float.style.margin = "5px"
      document.body.append(float)
      const target = targetElement()
      mockRect(target, {left: 100, top: 100, width: 300, height})
      vi.spyOn(float, "getBoundingClientRect").mockReturnValue({
        x: floatSide === "right" ? 300 : 100, y: 100,
        left: floatSide === "right" ? 300 : 100, top: 100,
        right: floatSide === "right" ? 400 : 200, bottom: 180,
        width: 100, height: 80, toJSON: () => ({}),
      } as DOMRect)
      selectNode(target)
      return {float, target}
    }

    it("keeps both control rows in the remaining span beside a float", () => {
      setup(40)

      expect(flowSpan("top-right") - flowSpan("top-left")).toBe(195)
      expect(flowSpan("bottom-right") - flowSpan("bottom-left")).toBe(195)
    })

    it("widens the lower controls after a tall target flows below the float", () => {
      setup(120)

      expect(flowSpan("top-right") - flowSpan("top-left")).toBe(195)
      expect(flowSpan("bottom-right") - flowSpan("bottom-left")).toBe(300)
    })

    it("clears the flow spans when the float is removed and when the transform clears", () => {
      const {float} = setup(40)
      expect(feature.overlay.style.getPropertyValue("--selection-flow-top-left")).not.toBe("")

      float.remove()
      feature.updateInfo()
      expect(feature.overlay.style.getPropertyValue("--selection-flow-top-left")).toBe("")

      feature.clearTransform()
      for(const name of ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right"]) {
        expect(feature.overlay.style.getPropertyValue(`--selection-flow-${name}`)).toBe("")
      }
    })
  })

  it("releases transformed frame geometry when the controls are disabled", () => {
    const target = targetElement("demo-widget")
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px"})
    target.style.setProperty("rotate", "20deg")
    mockRect(target)
    captureNode(target)
    const caret = editor.features.selection.selectionCaret!
    expect(caret.style.transform).not.toBe("")
    feature.disable()
    expect(caret.style.transform).toBe("")
    expect(caret.style.getPropertyValue("position-anchor")).toBe("")
    expect(caret).toHaveClass("◆selection-caret-capture")
    expect(target).not.toHaveClass("◆transform-target")
  })

  it.each([
    {mode: "canvas", capture: false}, {mode: "canvas", capture: true},
    {mode: "slides", capture: false}, {mode: "slides", capture: true},
  ] as const)("rotates the $mode selection frame with its controls (capture: $capture)", ({mode, capture}) => {
    const target = targetElement(capture ? "demo-widget" : "p")
    document.body.replaceChildren(target)
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    Object.assign(target.style, {width: "160px", height: "80px", transformOrigin: "0 0"})
    target.style.setProperty("rotate", "30deg")
    expect(getComputedStyle(target).getPropertyValue("rotate")).toBe("30deg")
    expect(getComputedStyle(target).position).toBe("absolute")
    // A transformed bounding box is wider and taller than the local border box.
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(60, 100, 178.56, 149.28))
    if(capture) captureNode(target)
    else selectNode(target)
    if(!capture) expect($.selectedElement).toBe(target)
    const caret = editor.features.selection.selectionCaret!
    const expectGeometry = () => {
      const overlay = feature.overlay
      for(const property of ["left", "top", "width", "height", "transform"] as const) {
        expect(caret.style[property]).toBe(overlay.style[property])
        expect(caret.style.getPropertyPriority(property)).toBe("important")
      }
      expect(caret.style.width).toBe("160px")
      expect(caret.style.height).toBe("80px")
      expect(caret.style.getPropertyValue("position-anchor")).toBe("auto")
      expect(caret.style.transformOrigin).toBe("center")
      expect(new DOMMatrix(caret.style.transform).b).not.toBe(0)
    }
    expectGeometry()
    if(mode === "canvas") {
      editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
      expectGeometry()
    }
    target.style.setProperty("rotate", "90deg")
    feature.updateInfo()
    expectGeometry()
    expect(caret.getRootNode()).toBe(editor.appendix)
    expect(target.querySelector(".◆selection-caret")).toBeNull()
    const paragraph = document.createElement("p")
    paragraph.textContent = "Elsewhere"
    document.body.append(paragraph)
    const range = document.createRange()
    range.setStart(paragraph.firstChild!, 0); range.collapse(true)
    editor.features.selection.selectDropRange(range)
    expect(caret.style.transform).toBe("")
    expect(caret.style.transformOrigin).toBe("")
  })

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

  it("keeps legacy anchor and sticky controls hidden when positioning changes", () => {
    const target = targetElement()
    selectNode(target)

    for(const position of ["static", "relative", "absolute", "sticky", "fixed", "relative"]) {
      target.style.position = position
      feature.updateInfo()
      for(const name of ["anchor", "anchor-sticky"]) {
        const control = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!
        expect(control.hidden).toBe(true)
        expect(control).toHaveAttribute("part", expect.stringContaining(`transform-overlay-${name}-hidden`))
      }
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
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    target.style.width = "100px"
    target.style.height = "50px"
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 120, clientY: 100}))

    expect(target.style.position).toBe("absolute")
    expect(target.style.width).toBe("100px")
    expect(target.style.height).toBe("50px")
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
  })

  it("constrains movement to one axis with Shift and keeps unsnapped coordinates with Alt", () => {
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
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

  it("keeps a paused drag in one undo item and restores exact states", async () => {
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const startingHTML = editor.toHTML(true)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 110, clientY: 100}))
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    await new Promise(resolve => setTimeout(resolve, 550))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 130, clientY: 100}))
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    feature.handleMoveEnd()
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const finalHTML = editor.toHTML(true)
    expect(finalHTML).not.toBe(startingHTML)

    editor.doc.undo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(startingHTML)
    editor.doc.redo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(finalHTML)
  })

  it.each(["release", "Escape", "pointercancel", "removed", "replaced", "disable"])("stops canvas edge scrolling on %s", async ending => {
    const target = targetElement("demo-widget")
    document.body.replaceChildren(target)
    editor.features.canvas.convert("canvas")
    mockRect(target)
    selectNode(target)
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id) })
    const tick = () => {
      for(const [id, callback] of [...frames]) {
        if(!frames.delete(id)) continue
        callback(0)
      }
    }
    const pan = vi.spyOn(editor.features.canvas, "panAtEdge").mockReturnValue(true)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 19, clientX: 150, clientY: 125}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 19, buttons: 1, clientX: 170, clientY: 125}))
    const rect = target.getBoundingClientRect()
    tick()
    expect(pan).toHaveBeenLastCalledWith({x: 170, y: 125}, expect.objectContaining({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}))
    tick()
    expect(pan).toHaveBeenCalledTimes(2)

    if(ending === "release") document.dispatchEvent(pointer("pointerup", {pointerId: 19}))
    else if(ending === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    else if(ending === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 19}))
    else if(ending === "removed") target.remove()
    else if(ending === "replaced") target.replaceWith(target.cloneNode(true))
    else feature.disable()
    await mutationsDelivered()
    tick()
    expect(pan).toHaveBeenCalledTimes(2)
    expect(document.body).not.toHaveClass("◆transform-moving")
  })

  it.each(["resize", "rotate"] as const)("groups a paused %s gesture into one exact undo item", async mode => {
    if(mode === "rotate") document.body.classList.add("ww-canvas")
    const target = targetElement("demo-widget")
    const sibling = targetElement("aside")
    sibling.setAttribute("data-neighbor", "keep")
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const startingHTML = editor.toHTML(true)
    if(mode === "resize") {
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 210, clientY: 160}))
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      await new Promise(resolve => setTimeout(resolve, 550))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 230, clientY: 180}))
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    }
    else {
      feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
      feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 180, clientY: 110}))
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      await new Promise(resolve => setTimeout(resolve, 550))
      feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      feature.handleRotateEnd()
    }
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const finalHTML = editor.toHTML(true)
    expect(finalHTML).not.toBe(startingHTML)
    sibling.setAttribute("data-after", "later")
    editor.doc.syncFromDOM()

    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(finalHTML)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(startingHTML)
    expect(sibling).toHaveAttribute("data-neighbor", "keep")
    editor.doc.redo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(finalHTML)
    editor.doc.redo()
    expect(sibling).toHaveAttribute("data-after", "later")
  })

  it.each(["relative", "sticky", "fixed"] as const)("retains %s positioning while moving in canvas", position => {
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    Object.assign(target.style, {position, width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 120, clientY: 100}))
    feature.handleMoveEnd()

    expect(target.style.position).toBe(position)
  })

  it("retains zero offsets instead of falling back to resolved right and bottom offsets", () => {
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", left: "0px", top: "0px", right: "960px", bottom: "696px", width: "320px", height: "24px"})
    mockRect(target)
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, altKey: true, clientX: 124, clientY: 116}))
    feature.handleMoveEnd()
    expect(target.style.left).toBe("24px")
    expect(target.style.top).toBe("16px")
    expect(target.style.width).toBe("320px")
    expect(target.style.height).toBe("24px")
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

    expect(target.style.width).toBe("100px")
    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.maxHeight).toBe("50px")
    expect(target.style.left).toBe("0px")
    expect(target.style.top).toBe("0px")
    expect(target).toHaveClass("◆transform-target")
  })

  describe.each(["p", "demo-widget"])("static %s resizing", tag => {
    it.each(["up-left", "up-right", "down-left", "down-right", "up-up", "right-right", "down-down", "left-left"])("keeps normal flow when dragging %s", direction => {
      const target = targetElement(tag)
      Object.assign(target.style, {width: "100px", height: "50px"})
      if(tag === "demo-widget") target.style.position = "static"
      mockRect(target)
      if(tag === "demo-widget") captureNode(target)
      else selectNode(target)
      const initialPosition = target.style.position
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      const dx = direction.includes("left") ? 20 : direction.includes("right") ? -20 : 0
      const dy = direction.includes("up") ? 10 : direction.includes("down") ? -10 : 0

      for(const modifiers of [{}, {ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true}]) {
        handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
        document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy, ...modifiers}))
        expect(target.style.position).toBe(initialPosition)
        for(const property of ["left", "top", "right", "bottom"]) expect(target.style.getPropertyValue(property)).toBe("")
        if(modifiers.shiftKey) expect(target.style.scale).not.toBe("")
        else {
          if(dx) expect(parseFloat(target.style.maxWidth)).toBeLessThan(100)
          else expect(target.style.maxWidth).toBe("")
          if(dy) expect(parseFloat(target.style.maxHeight)).toBeLessThan(50)
          else expect(target.style.maxHeight).toBe("")
        }
        document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
        expect(target.style.position).toBe(initialPosition)
        expect(target.style.maxWidth).toBe("")
        expect(target.style.maxHeight).toBe("")
        expect(document.body).not.toHaveClass("◆transform-scaling-ew", "◆transform-scaling-ns", "◆transform-scaling-nwse", "◆transform-scaling-nesw")
      }
    })
  })

  describe.each([false, true])("edge resizing with capture selection %s", captured => {
    it.each([
      {edge: "right", x: 200, y: 115, dx: -20, dy: 13, width: "80px", height: "", left: "0px", top: "0px"},
      {edge: "left", x: 100, y: 115, dx: 20, dy: 13, width: "80px", height: "", left: "20px", top: "0px"},
      {edge: "up", x: 130, y: 100, dx: 13, dy: 20, width: "", height: "30px", left: "0px", top: "20px"},
      {edge: "down", x: 130, y: 150, dx: 13, dy: -20, width: "", height: "30px", left: "0px", top: "0px"},
    ])("resizes only the $edge axis without changing document insets", ({edge, x, y, dx, dy, width, height, left, top}) => {
      const target = targetElement(captured ? "demo-widget" : "p")
      const child = target.appendChild(document.createElement(captured ? "unfamiliar-content" : "mark"))
      target.appendChild(document.createComment("keep"))
      target.setAttribute("data-authored", "keep")
      Object.assign(target.style, {position: "relative", width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      if(captured) captureNode(target)
      else selectNode(target)
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${edge}-${edge}`)!

      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: x, clientY: y}))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: x + dx, clientY: y + dy}))
      expect(document.body).toHaveClass(`◆transform-scaling-${dx === 13 ? "ns" : "ew"}`)
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

      expect(target.style.maxWidth).toBe(width)
      expect(target.style.maxHeight).toBe(height)
      expect(target.style.width).toBe("100px")
      expect(target.style.height).toBe("50px")
      expect(target.style.left).toBe("0px")
      expect(target.style.top).toBe("0px")
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
    {modifiers: {ctrlKey: true}, width: "130px", left: "0px", scale: ""},
    {modifiers: {shiftKey: true}, width: "", left: "0px", scale: "1.1 1"},
  ])("preserves resize modifiers at edges: $modifiers", ({modifiers, width, left, scale}) => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 213, clientY: 115, ...modifiers}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

    expect(target.style.maxWidth).toBe(width)
    expect(target.style.width).toBe("100px")
    expect(target.style.height).toBe("50px")
    // Document resizing never compensates by changing authored insets.
    expect(target.style.left).toBe(left)
    expect(target.style.getPropertyValue("scale")).toBe(scale)
  })

  it.each(["Escape", "pointercancel", "removed"])("cleans up an edge resize on %s", cancellation => {
    const target = targetElement()
    Object.assign(target.style, {position: "relative", width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 220, clientY: 115}))
    expect(target.style.maxWidth).toBe("120px")
    target.style.color = "red"
    if(cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(cancellation === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    else {
      target.remove()
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 230, clientY: 115}))
    }
    expect(target.style.width).toBe("100px")
    expect(target.style.maxWidth).toBe("")
    expect(target.style.color).toBe("red")
    expect(document.body).not.toHaveClass("◆transform-scaling-ew", "◆transform-scaling-ns")
  })

  it.each(["horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl"])("maps resize edges to physical maxima in %s", writingMode => {
    const target = targetElement("demo-widget")
    Object.assign(target.style, {writingMode, width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const resize = (edge: string, dx: number, dy: number) => {
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${edge}-${edge}`)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    }
    resize("right", -20, 0)
    expect(target.style.maxWidth).toBe("80px")
    expect(target.style.maxHeight).toBe("")
    resize("down", 0, -20)
    expect(target.style.maxWidth).toBe("80px")
    expect(target.style.maxHeight).toBe("30px")
    expect(target.style.width).toBe("100px")
    expect(target.style.height).toBe("50px")
  })

  it("expands an existing maximum without fixing the widget's dimensions and groups undo/redo", async () => {
    const target = targetElement("demo-widget")
    target.contentEditable = "true"
    Object.assign(target.style, {maxWidth: "100px", maxHeight: "50px"})
    mockRect(target, {width: 300, height: 200})
    selectNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 210, clientY: 160}))
    await mutationsDelivered()
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 220, clientY: 170}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    await mutationsDelivered()

    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.maxHeight).toBe("70px")
    expect(target.style.width).toBe("")
    expect(target.style.height).toBe("")
    expect(target.getBoundingClientRect().width).toBe(120)
    expect(target.style.position).toBe("")
    expect(feature.overlay).toHaveClass("◆transform-overlay-changed")
    expect(editor.toHTML(true)).toContain("max-width: 120px")
    expect(editor.doc.body.toString()).toContain("max-width: 120px")
    expect(editor.doc.body.toString()).not.toContain("position:")
    editor.doc.undo()
    await mutationsDelivered()
    // Happy DOM can cache .style after attribute replacement; assert authored DOM.
    expect(document.querySelector("demo-widget")!.getAttribute("style")).toContain("max-width: 100px")
    expect(document.querySelector("demo-widget")!.getAttribute("style")).toContain("max-height: 50px")
    editor.doc.redo()
    await mutationsDelivered()
    expect(document.querySelector("demo-widget")!.getAttribute("style")).toContain("max-width: 120px")
    expect(document.querySelector("demo-widget")!.getAttribute("style")).toContain("max-height: 70px")
    expect(document.querySelector("demo-widget")!.getAttribute("style")).not.toContain("position:")
  })

  it("resizes a float's preferred width and restores it on cancellation and undo", async () => {
    const target = targetElement("aside")
    target.style.width = "100px"
    editor.features.manipulation.setFloat(target, "far-right")
    mockRect(target)
    selectNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const initial = target.getAttribute("style")
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    const drag = () => {
      handle.dispatchEvent(pointer("pointerdown", {pointerId:3, clientX:200, clientY:125}))
      document.dispatchEvent(pointer("pointermove", {pointerId:3, clientX:240, clientY:125}))
    }
    drag()
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), 140px)")
    document.dispatchEvent(pointer("pointercancel", {pointerId:3}))
    expect(target.getAttribute("style")).toBe(initial)
    drag()
    document.dispatchEvent(pointer("pointerup", {pointerId:3}))
    await mutationsDelivered()
    const resized = target.getAttribute("style")
    expect(resized).toContain("--ww-float-size: min(100%, var(--ww-float-width), 140px)")
    editor.doc.undo()
    await mutationsDelivered()
    expect(document.querySelector("aside")!.getAttribute("style")).toBe(initial)
    editor.doc.redo()
    await mutationsDelivered()
    expect(document.querySelector("aside")!.getAttribute("style")).toBe(resized)
  })

  it("retains a concurrent maximum while restoring other gesture-owned properties", () => {
    const target = targetElement("demo-widget")
    Object.assign(target.style, {width: "100px", height: "50px", maxWidth: "100px"})
    target.style.setProperty("max-height", "50px", "important")
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 130}))
    target.style.maxWidth = "90px"
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 170, clientY: 120}))

    expect(target.style.maxWidth).toBe("90px")
    expect(target.style.maxHeight).toBe("50px")
    expect(target.style.getPropertyPriority("max-height")).toBe("important")
    expect(document.body).not.toHaveClass("◆transform-scaling-nwse")
  })

  it("constrains an SVG root without altering its authored dimensions or children", () => {
    const target = append(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    target.setAttribute("width", "100")
    target.setAttribute("height", "50")
    const child = target.appendChild(document.createElementNS(target.namespaceURI, "rect"))
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 150}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

    expect(target.style.maxWidth).toBe("80px")
    expect(target.style.maxHeight).toBe("")
    expect(target).toHaveAttribute("width", "100")
    expect(target).toHaveAttribute("height", "50")
    expect(target.firstElementChild).toBe(child)
  })

  it("resizes a standalone shape beyond its initial SVG dimensions", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const target = document.querySelector("svg")!
    mockRect(target, {width: 244, height: 244})
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 344, clientY: 344}))
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 464, clientY: 424}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.width).toBe("364px")
    expect(target.style.height).toBe("324px")
    expect(target).toHaveAttribute("preserveAspectRatio", "none")
    expect(target.querySelector("rect")).toHaveAttribute("width", "240")
    expect($.selectedElement).toBe(target)
  })

  it("rotates only an absolute target in canvas layout", () => {
    document.body.classList.add("ww-canvas")
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
    const caret = editor.features.selection.selectionCaret!
    expect(caret.style.transform).toBe(feature.overlay.style.transform)
    expect(new DOMMatrix(caret.style.transform).b).toBeCloseTo(1)
    feature.handleRotateEnd()
    expect(target.style.getPropertyValue("rotate")).toBe("90deg")
    expect(caret.style.transform).toBe(feature.overlay.style.transform)

    target.style.position = "relative"
    feature.updateInfo()
    target.style.removeProperty("rotate")
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
    expect(target.style.getPropertyValue("rotate")).toBe("")
  })
})

describe("drop, cancellation, and document ownership", () => {
  it.each(["img", "demo-widget"])("changes native float without moving %s or changing its contents", tag => {
    const paragraph = targetElement()
    const target = paragraph.appendChild(document.createElement(tag))
    target.style.maxWidth = "30rem"
    const text = paragraph.firstChild
    if(tag === "demo-widget") captureNode(target)
    else selectNode(target)
    expect(Array.from(feature.overlay.querySelectorAll<HTMLButtonElement>('[id^="◆transform-overlay-float-"]'))
      .map(button => button.id)).toEqual([
        "◆transform-overlay-float-none",
        "◆transform-overlay-float-far-left",
        "◆transform-overlay-float-far-right",
      ])
    const click = (side: string) => feature.overlay.querySelector<HTMLButtonElement>(`#◆transform-overlay-float-${side}`)!.click()
    click("far-left")
    expect(target).toHaveClass("ww-float-left")
    expect(target.style.getPropertyValue("margin-left")).toBe("")
    expect(feature.arranger.getAttribute("data-float")).toBe("far-left")
    expect(feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-float-far-left")?.getAttribute("aria-label")).toBe("Float left")
    click("far-right")
    expect(target).toHaveClass("ww-float-right")
    expect(target.style.getPropertyValue("margin-right")).toBe("")
    expect(feature.arranger.getAttribute("data-float")).toBe("far-right")
    click("none")
    expect(target).not.toHaveClass("ww-float-left", "ww-float-right")
    expect(target.style.float).toBe("")
    expect(target.style.maxWidth).toBe("30rem")
    expect(target.parentElement).toBe(paragraph)
    expect(paragraph.firstChild).toBe(text)
    expect(document.querySelector(".ww-column-group")).toBeNull()
    if(tag === "demo-widget") expect(editor.features.selection.captureSelectedElement).toBe(target)
    else expect($.selectedElement).toBe(target)
  })

  it("restores transform properties while retaining unrelated styling", () => {
    const target = targetElement()
    Object.assign(target.style, {
      width: "80px", height: "40px", position: "absolute", top: "12px", left: "14px",
      maxWidth: "70px", maxHeight: "30px",
      float: "left", color: "rebeccapurple",
    })
    target.classList.add("ww-column-left", "authored")
    target.style.setProperty("rotate", "15deg")
    target.style.setProperty("z-index", "7")
    target.style.setProperty("--unfamiliar", "keep")
    selectNode(target)
    feature.restore()
    expect(target).toHaveClass("authored")
    expect(target.classList.contains("ww-column-left")).toBe(true)

    for(const property of ["width", "height", "max-width", "max-height", "rotate", "float", "position", "top", "left", "z-index"]) {
      expect(target.style.getPropertyValue(property)).toBe("")
    }
    expect(target.style.color).toBe("rebeccapurple")
    expect(target.style.getPropertyValue("--unfamiliar")).toBe("keep")
  })

  it("ignores positioning controls in document layout", () => {
    const target = targetElement()
    target.style.cssText = "width:80px;height:40px"
    selectNode(target)
    const initial = target.style.cssText
    feature.toggleAbsoluteRelative()
    feature.toggleSticky()
    feature.anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, ctrlKey: true}))
    feature.anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, shiftKey: true}))
    expect(target.style.cssText).toBe(initial)
  })

  it("cycles canvas anchor positioning with Ctrl/Cmd and switches to fixed with Shift", () => {
    document.body.classList.add("ww-canvas")
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
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
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

  it.each([125, 175])("does not apply a float when dragging over itself or its descendants at x=%i", x => {
    const target = targetElement()
    Object.assign(target.style, {width: "100px", color: "red", float: "left", margin: "9px"})
    const child = target.appendChild(document.createElement("span"))
    child.textContent = "nested text"
    const style = target.style.cssText
    const children = Array.from(target.childNodes)
    mockRect(target)
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => x === 125 ? [target, document.body] : [child, target, document.body])})
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: child.firstChild!, offset: 0})
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: x, clientY: 125}))
    expect(target.style.float).toBe("left")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    feature.handleMoveEnd()
    expect(target.style.cssText).toBe(style)
    expect(target.style.width).toBe("100px")
    expect(target.style.color).toBe("red")
    expect(target.style.position).toBe("")
    expect(target.parentElement).toBe(document.body)
    expect(Array.from(target.childNodes)).toEqual(children)
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
  })

  it.each([[310, "left"], [390, "right"]] as const)("floats media before a paragraph at x=%i", (x, side) => {
    const target = append(document.createElement("img"))
    const paragraph = targetElement()
    paragraph.textContent = "keep text"
    target.style.width = "40px"
    mockRect(target)
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 100, 100, 100))
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => [paragraph])})
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: x, clientY: 150, ctrlKey: true}))
    const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!
    expect(preview).not.toBeNull()
    expect(preview.getAttribute("part")).toContain(`float-drop-preview-${side}`)
    expect(parseFloat(preview.style.left)).toBeCloseTo(300 + (side === "left" ? 0 : 60))
    expect(preview.style.top).toBe("105px")
    expect(parseFloat(preview.style.width)).toBeCloseTo(40)
    expect(preview.style.height).toBe("50px")
    expect(paragraph).not.toHaveClass("◆drop-caret-before", "◆drop-caret-after")
    feature.handleMoveEnd()
    expect(target.parentElement!.parentElement).toBe(paragraph.parentElement!.parentElement)
    expect(target).toHaveClass(side === "left" ? "ww-float-left" : "ww-float-right")
    expect(paragraph.textContent).toBe("keep text")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("moves the float preview between target halves and removes it on cancellation", () => {
    const target = append(document.createElement("img"))
    const paragraph = targetElement()
    target.style.width = "40px"
    mockRect(target)
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 100, 100, 100))
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => [paragraph])})
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))

    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 310, clientY: 150, ctrlKey: true}))
    expect(editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!.style.left).toBe("300px")
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 390, clientY: 150, ctrlKey: true}))
    const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!
    expect(editor.appendix.querySelectorAll("#◆float-drop-preview")).toHaveLength(1)
    expect(parseFloat(preview.style.left)).toBeCloseTo(360)
    expect(preview.getAttribute("part")).toContain("float-drop-preview-right")

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(target.parentElement).toBe(document.body)
  })

  it.each([[110, "before"], [190, "after"]] as const)("uses ordinary %s placement outside the target rectangle", (y, placement) => {
    const target = append(document.createElement("img"))
    Object.assign(target.style, {float: "right", margin: "5px", maxWidth: "50%", marginBlockStart: "8px", color: "red"})
    const paragraph = targetElement()
    paragraph.textContent = "keep text"
    target.style.width = "40px"
    mockRect(target)
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 100, 100, 100))
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => [paragraph])})
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 250, clientY: y, ctrlKey: true}))

    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(paragraph).toHaveClass(`◆drop-caret-${placement}`)
    feature.handleMoveEnd()

    expect(target.style.float).toBe("")
    expect(target.style.marginLeft).toBe("")
    expect(target.style.marginRight).toBe("")
    expect(target.style.marginBlockStart).toBe("")
    expect(target.style.maxWidth).toBe("")
    expect(target.style.color).toBe("red")
    expect(target.parentElement).toBe(paragraph.parentElement)
    expect(target[placement === "before" ? "nextElementSibling" : "previousElementSibling"]).toBe(paragraph)
    expect(paragraph.textContent).toBe("keep text")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
  })

  it("places a drag at a normal body gap when hit testing finds no element, with undo/redo", async () => {
    const target = append(document.createElement("picture"))
    target.append(document.createElement("img"))
    Object.assign(target.style, {float: "left", margin: "5px", marginInlineEnd: "8px", maxWidth: "50%", color: "red"})
    const existing = targetElement()
    mockRect(target)
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => [])})
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: document.body.childNodes.length})
    selectNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const startingHTML = editor.toHTML(true)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 500, clientY: 300, ctrlKey: true}))

    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    feature.handleMoveEnd()
    expect(target.parentElement).toBe(document.body)
    expect(target.previousElementSibling).toBe(existing)
    expect(target.style.float).toBe("")
    expect(target.style.margin).toBe("")
    expect(target.style.marginInlineEnd).toBe("")
    expect(target.style.maxWidth).toBe("")
    expect(target.style.color).toBe("red")
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const droppedHTML = editor.toHTML(true)
    editor.doc.undo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(startingHTML)
    editor.doc.redo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(droppedHTML)
  })

  it("preserves authored styles and structure on a document float drop through undo/redo", async () => {
    const target = targetElement()
    const child = target.appendChild(document.createElement("unfamiliar-node"))
    Object.assign(target.style, {position: "absolute", width: "80px", height: "40px", maxInlineSize: "100px", color: "red"})
    target.style.setProperty("inset", "12px")
    target.classList.add("ww-column-left")
    target.style.setProperty("rotate", "15deg")
    const dropTarget = targetElement()
    mockRect(target)
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue({left: 300, top: 100, right: 400, bottom: 200, width: 100, height: 100, x: 300, y: 100, toJSON: () => ({})} as DOMRect)
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [dropTarget]),
    })
    selectNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const startingHTML = editor.toHTML(true)

    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 310, clientY: 120, ctrlKey: true}))
    feature.handleMoveEnd()
    await mutationsDelivered()
    editor.doc.syncFromDOM()

    expect(target.parentElement).toBe(dropTarget.parentElement)
    expect(dropTarget.previousElementSibling).toBe(target)
    expect(target.style.width).toBe("80px")
    expect(target.style.color).toBe("red")
    expect(target).toHaveClass("ww-float-left")
    expect(target.firstElementChild).toBe(child)
    const droppedHTML = editor.toHTML(true)
    editor.doc.undo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(startingHTML)
    editor.doc.redo()
    await mutationsDelivered()
    expect(editor.toHTML(true)).toBe(droppedHTML)
  })

  it.each(["absolute", "fixed"])("skips %s elements and their descendants as flow drop anchors", position => {
    const target = targetElement()
    const floating = targetElement("div")
    floating.style.position = position
    const child = floating.appendChild(document.createElement("span"))
    const dropTarget = targetElement()
    mockRect(target)
    vi.spyOn(dropTarget, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 100, 100, 100))
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: vi.fn(() => [child, floating, dropTarget])})
    selectNode(target)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 310, clientY: 120, ctrlKey: true}))
    feature.handleMoveEnd()
    expect(dropTarget.previousElementSibling).toBe(target)
    expect(floating.firstElementChild).toBe(child)
    expect(target.parentElement).toBe(document.body)
  })

  it("reverts only properties owned by an Escape-cancelled gesture", () => {
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    vi.spyOn($, "pointFromCoords").mockReturnValue(undefined)
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
    vi.spyOn($, "pointFromCoords").mockReturnValue(undefined)
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


describe("SVG canvas cropping", () => {
  function canvas(viewBox = "10 20 200 100", aspect = "none") {
    const target = append(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    target.setAttribute("viewBox", viewBox)
    target.setAttribute("preserveAspectRatio", aspect)
    target.innerHTML = '<g transform="translate(5 7)"><rect width="40" height="30"/></g><text x="20" y="30">Label</text>'
    target.style.position = "absolute"
    mockRect(target)
    selectNode(target)
    return target
  }
  function start(direction = "down-right") {
    if(!direction.includes("-")) direction = `${direction}-${direction}`
    feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
  }
  function drag(options: PointerEventInit = {}) {
    document.dispatchEvent(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 140, ...options}))
  }

  it.each([
    {direction: "down-right", box: "10 20 160 80", left: "", top: ""},
    {direction: "up-left", box: "-30 0 240 120", left: "", top: ""},
    {direction: "right", box: "10 20 160 100", left: "", top: ""},
  ])("crops from $direction without changing child geometry", ({direction, box, left, top}) => {
    const target = canvas()
    const child = target.firstElementChild
    const contents = target.innerHTML
    start(direction)
    drag()
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.getAttribute("viewBox")).toBe(box)
    expect(target.style.overflow).toBe("hidden")
    expect(target.style.left).toBe(left)
    expect(target.style.top).toBe(top)
    expect(target.firstElementChild).toBe(child)
    expect(target.innerHTML).toBe(contents)
  })

  it.each(["", "static"])("preserves normal flow when cropping a centered canvas with position %j", position => {
    const target = canvas()
    target.style.position = position
    const rect = vi.mocked(target.getBoundingClientRect).getMockImplementation()!
    vi.mocked(target.getBoundingClientRect).mockImplementation(() => {
      const box = rect.call(target)
      const left = box.left + (100 - box.width) / 2
      return new DOMRect(left, box.top, box.width, box.height)
    })
    start()
    drag()
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.getBoundingClientRect().left).toBe(110)
    expect(target.getBoundingClientRect().top).toBe(100)
    expect(target.getAttribute("viewBox")).toBe("10 20 160 80")
    expect(target.style.position).toBe(position)
    for(const property of ["left", "top", "right", "bottom"]) expect(target.style.getPropertyValue(property)).toBe("")
  })

  it.each(["", "static", "relative", "absolute", "fixed", "sticky"].flatMap(position => [false, true].map(altKey => ({position, altKey}))))("preserves position $position when resizing with Alt=$altKey", ({position, altKey}) => {
    const target = canvas()
    target.style.position = position
    start("up-left")
    drag({altKey})
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.position).toBe(position)
    expect(target.style.width).toBe("120px")
    expect(target.style.height).toBe("60px")
    expect(target.getAttribute("viewBox")).toBe(altKey ? "10 20 200 100" : "-30 0 240 120")
    if(!position || position === "static") {
      for(const property of ["left", "top", "right", "bottom"]) expect(target.style.getPropertyValue(property)).toBe("")
    }
  })

  it("switches between cropping and Alt resizing during a drag and cancels both", () => {
    const target = canvas()
    const initial = target.style.cssText
    start()
    drag()
    expect(target.getAttribute("viewBox")).toBe("10 20 160 80")
    drag({altKey: true})
    expect(target.getAttribute("viewBox")).toBe("10 20 200 100")
    expect(target.style.width).toBe("80px")
    expect(target.style.height).toBe("40px")
    expect(target.style.overflow).toBe("")
    drag()
    expect(target.getAttribute("viewBox")).toBe("10 20 160 80")
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(target.getAttribute("viewBox")).toBe("10 20 200 100")
    expect(target.style.cssText).toBe(initial)
  })

  it("preserves letterboxed content scale and supports centered cropping", () => {
    const target = canvas("0 0 100 100", "xMidYMid meet")
    start()
    drag({ctrlKey: true})
    expect(target.getAttribute("viewBox")).toBe("-10 20 120 60")
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
  })

  it("leaves a concurrently changed viewBox authoritative", () => {
    const target = canvas()
    start()
    drag()
    target.setAttribute("viewBox", "0 0 500 500")
    drag({clientX: 170})
    expect(target.getAttribute("viewBox")).toBe("0 0 500 500")
    expect(target.style.width).toBe("")
  })

  it("undoes and redoes the viewport and dimensions together", async () => {
    const target = canvas()
    target.id = "cropped-canvas"
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    start()
    drag()
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    await mutationsDelivered()
    editor.doc.undo()
    await mutationsDelivered()
    expect(document.getElementById("cropped-canvas")!.getAttribute("viewBox")).toBe("10 20 200 100")
    editor.doc.redo()
    await mutationsDelivered()
    expect(document.getElementById("cropped-canvas")!.getAttribute("viewBox")).toBe("10 20 160 80")
  })
})
