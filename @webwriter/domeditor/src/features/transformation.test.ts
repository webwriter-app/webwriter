// @vitest-environment happy-dom
import {hasPresentationState, presentationStateElements} from "../presentation-state.js"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"

import editorStyles from "../editor.css?raw"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {markStateChangeEvent, selectionChangeEvent} from "../editor-bridge"
import {MATH_NAMESPACE} from "../math"
import * as Y from "yjs"

let editor: DOMEditor
let feature: DOMEditor["features"]["transformation"]
let floatStylesheet: HTMLStyleElement
let frameCallbacks: Map<number, FrameRequestCallback>
let originalRequestAnimationFrame: typeof requestAnimationFrame
let originalCancelAnimationFrame: typeof cancelAnimationFrame
let nextFrameId: number
let lastPointerPositions: Map<number, Pick<PointerEventInit, "clientX" | "clientY" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>

beforeEach(() => {
  originalRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis)
  originalCancelAnimationFrame = globalThis.cancelAnimationFrame.bind(globalThis)
  frameCallbacks = new Map()
  lastPointerPositions = new Map()
  nextFrameId = 0
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => {
    const id = ++nextFrameId
    const nativeId = originalRequestAnimationFrame(time => {
      frameCallbacks.delete(id)
      callback(time)
    })
    // Preserve the browser's returned id for cancellation while keeping a
    // stable test-side key for synchronously flushed callbacks.
    frameCallbacks.set(id, callback)
    nativeFrameIds.set(id, nativeId)
    return id
  })
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => {
    const nativeId = nativeFrameIds.get(id)
    if(nativeId !== undefined) originalCancelAnimationFrame(nativeId)
    nativeFrameIds.delete(id)
    frameCallbacks.delete(id)
  })
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
  for(const id of frameCallbacks.keys()) {
    const nativeId = nativeFrameIds.get(id)
    if(nativeId !== undefined) originalCancelAnimationFrame(nativeId)
  }
  frameCallbacks.clear()
  nativeFrameIds.clear()
  vi.restoreAllMocks()
  editor.destroy()
  floatStylesheet.remove()
})

function append<T extends Element>(element: T) {
  document.body.append(element)
  return element
}

const nativeFrameIds = new Map<number, number>()

function flushAnimationFrame() {
  const callbacks = [...frameCallbacks]
  for(const [id, callback] of callbacks) {
    if(!frameCallbacks.delete(id)) continue
    const nativeId = nativeFrameIds.get(id)
    if(nativeId !== undefined) originalCancelAnimationFrame(nativeId)
    nativeFrameIds.delete(id)
    callback(0)
  }
}

function movePointer(event: PointerEvent) {
  document.dispatchEvent(event)
  flushAnimationFrame()
}

function queuePointer(event: PointerEvent) {
  document.dispatchEvent(event)
}

function targetElement(tag = "p") {
  const element = document.createElement(tag)
  element.textContent = "target"
  return append(element)
}

it("defines the theme tokens the editor stylesheet uses without fallbacks", () => {
  // Read the source because Happy DOM omits ::part rules from the CSSOM.
  const tokens = new Set(Array.from(editorStyles.matchAll(/var\(\s*(--sl-[\w-]+)\s*\)/g), match => match[1]))
  const rootStyles = getComputedStyle(document.documentElement)
  expect([...tokens].filter(token => !rootStyles.getPropertyValue(token).trim())).toEqual([])
})

it.each(["button", "[popover]"])("keeps a selected popup %s free of transform controls", selector => {
  document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button><span id="note" popover>Content</span></span></p>'
  const part = document.querySelector(selector)!
  editor.features.selection.selectElement(part)
  expect($.selectedElement).toBe(part)
  expect(feature.target).toBeNull()
  expect(feature.overlay).toHaveAttribute("visibility", "hidden")
})

/** Happy-dom has no layout. Keep the rect tied to authored offsets so the
 * movement/resize code still exercises its geometry calculations. */
function mockRect(target: HTMLElement | SVGSVGElement | MathMLElement, values: {left?: number, top?: number, width?: number, height?: number} = {}) {
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

it("anchors ordinary flow frames and retains measured geometry during transformation", () => {
  const target = targetElement()
  mockRect(target)
  selectNode(target)
  feature.updateInfo()
  expect(feature.overlay.style.left).toBe("")
  expect(feature.overlay.style.top).toBe("")
  expect(feature.overlay.getAttribute("part")).toContain("anchor-control-")
  vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect(100, 10, 100, 50))
  document.dispatchEvent(new Event("scroll"))
  expect(feature.overlay.getAttribute("part")).toContain("transform-overlay-at-top")
  expect(feature.overlay.style.top).toBe("")
  target.style.setProperty("rotate", "12deg")
  feature.updateInfo()
  expect(feature.overlay.style.transform).toContain("matrix(")
  expect(feature.overlay.style.left).not.toBe("")
  target.style.removeProperty("rotate")
  feature.updateInfo()
  expect(feature.overlay.style.left).toBe("")
  const binding = feature.overlay.getAttribute("part")!.split(/\s+/).find(value => value.startsWith("anchor-control-"))!
  feature.clearTransform()
  expect(feature.overlay.getAttribute("part")).not.toContain(binding)
})

it.each(["left", "right"])("connects a %s float to the opposite edge of its live flow anchor", async side => {
  document.body.innerHTML = `<main><p id="before">Before</p><aside style="float:${side}">Selected float</aside>
    <!-- Keep this comment --><aside class="ww-float-left">Another float</aside><p id="after">After</p></main>`
  const target = document.querySelector("aside")!
  const before = document.querySelector<HTMLElement>("#before")!
  const after = document.querySelector<HTMLElement>("#after")!
  const floatLeft = side === "left" ? 40 : 710
  mockRect(target, {left: floatLeft, top: 250})
  mockRect(before, {left: 180, top: 75, width: 500})
  mockRect(after, {left: 200, top: 150, width: 480})
  selectNode(target)
  const line = feature.overlay.querySelector<SVGLineElement>('[part="transform-overlay-float-anchor"] line')!
  expect(line.style.display).toBe("")
  expect(Number(line.getAttribute("x2")) + floatLeft).toBe(side === "left" ? 680 : 200)
  expect(Number(line.getAttribute("y2")) + 250).toBe(150)
  expect(editor.toHTML(true)).not.toContain("transform-overlay-float-anchor")
  expect(editor.doc.body.toString()).not.toContain("transform-overlay-float-anchor")

  // An edit can move the float after the last flow block without reselecting it.
  after.after(target)
  await mutationsDelivered()
  expect(Number(line.getAttribute("x2")) + floatLeft).toBe(side === "left" ? 680 : 200)
  expect(Number(line.getAttribute("y2")) + 250).toBe(200)
  feature.clearTransform()
  expect(line.style.display).toBe("none")
})

it("refreshes a pinned float's anchor on scroll and hides it when the float collapses into flow", () => {
  document.body.innerHTML = '<aside class="ww-float-left" style="position:sticky">Float</aside><p>Prose</p>'
  const target = document.querySelector("aside")!
  const prose = document.querySelector("p")!
  mockRect(target, {left: 25, top: 16})
  mockRect(prose, {left: 150, top: 120, width: 500})
  selectNode(target)
  const line = feature.overlay.querySelector<SVGLineElement>('[part="transform-overlay-float-anchor"] line')!
  expect(Number(line.getAttribute("y2"))).toBe(104)
  vi.mocked(prose.getBoundingClientRect).mockReturnValue(new DOMRect(150, -20, 500, 50))
  document.dispatchEvent(new Event("scroll"))
  expect(Number(line.getAttribute("y2"))).toBe(-36)
  target.classList.add("ww-float-none")
  feature.updateInfo()
  expect(line.style.display).toBe("none")
})

it("switches an idle selection between anchored and masked outlines as a sticky float overlaps it", () => {
  document.body.innerHTML = '<aside style="float:left;position:sticky">Pinned</aside><p>Selected</p>'
  const pin = document.querySelector("aside")!
  const target = document.querySelector("p")!
  mockRect(target, {left: 0, top: 240, width: 400, height: 150})
  vi.spyOn(pin, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 16, 100, 120))
  selectNode(target)
  flushAnimationFrame()

  const caret = editor.features.selection.selectionCaret!
  const mask = () => caret.querySelector('[part~="selection-float-outline"] mask path')
  expect(caret).toHaveAttribute("part", expect.stringContaining("selection-caret-anchored"))
  expect(mask()).toBeNull()

  vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect(0, 40, 400, 150))
  document.dispatchEvent(new Event("scroll"))
  flushAnimationFrame()
  expect(mask()).not.toBeNull()
  expect(caret.style.top).toBe("40px")

  vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect(0, 240, 400, 150))
  document.dispatchEvent(new Event("scroll"))
  flushAnimationFrame()
  expect(mask()).toBeNull()
  expect(caret).toHaveAttribute("part", expect.stringContaining("selection-caret-anchored"))
  expect($.selectedElement).toBe(target)
})

it("finishes a stable text resize without reprocessing the unchanged node selection", () => {
  const target = targetElement()
  mockRect(target)
  selectNode(target)
  const selection = vi.spyOn(editor.features.selection, "processSelection")
  const handle = feature.overlay.querySelector<HTMLElement>('[data-transform-mode="scale"][data-resize-direction*="right"]')!
  const start = new MouseEvent("mousedown", {button: 0, clientX: 200, clientY: 125})
  Object.defineProperty(start, "composedPath", {value: () => [handle]})
  feature.handleScaleStart(start)
  feature.handleScaleDrag(new MouseEvent("mousemove", {button: 0, clientX: 220, clientY: 125}))
  feature.handleScaleEnd()
  expect(selection).not.toHaveBeenCalled()
  expect($.selectedElement).toBe(target)
  expect(feature.target).toBe(target)
  expect(hasPresentationState(target, "element-selected")).toBe(true)
})

it("hides transforms for a zero-area widget host and recovers when its live box returns", () => {
  const target = targetElement("self-positioned-widget")
  target.attachShadow({mode: "open"}).innerHTML = '<div style="position:absolute;width:200px;height:100px">Popup</div>'
  let rect = new DOMRect(31, 20, 0, 0)
  vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => rect)
  feature.startTransform(target)
  expect(feature.target).toBe(target)
  expect(feature.overlay.getAttribute("visibility")).toBe("hidden")

  rect = new DOMRect(100, 100, 200, 100)
  feature.updateInfo()
  expect(feature.overlay.hasAttribute("visibility")).toBe(false)

  rect = new DOMRect(31, 20, 0, 0)
  feature.updateInfo()
  expect(feature.overlay.getAttribute("visibility")).toBe("hidden")
  expect(target.hasAttribute("style")).toBe(false)
})

describe("text container resizing", () => {
  it("coalesces live resize geometry and still processes an unrelated shared change", async () => {
    const target = targetElement()
    const other = targetElement()
    mockRect(target)
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id) })
    const tick = () => {
      for(const [id, callback] of [...frames]) if(frames.delete(id)) callback(0)
    }
    selectNode(target)
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    const handle = feature.overlay.querySelector<HTMLElement>(".◆transform-overlay-scale:not([hidden])")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 9, clientX: 200, clientY: 150}))
    expect(feature.stableSingleTransformTarget()).toBe(target)
    await mutationsDelivered()
    const refresh = vi.spyOn(feature, "updateInfo")
    const selection = vi.spyOn(editor.features.selection, "processSelection")
    const direction = handle.dataset.resizeDirection!.includes("right") ? -1 : 1
    for(const delta of [10, 20]) document.dispatchEvent(pointer("pointermove", {pointerId: 9, clientX: 200 + delta * direction, clientY: 150}))
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    expect(selection).not.toHaveBeenCalled()
    expect(target.style.maxWidth).toBe("")
    expect(refresh).not.toHaveBeenCalled()
    tick()
    expect(target.style.maxWidth).toBe("80px")
    expect(refresh).toHaveBeenCalledOnce()
    expect(feature.overlay.style.width).toBe("")
    expect(editor.features.selection.selectionCaret).toHaveAttribute("part", expect.stringContaining("selection-caret-anchored"))
    tick()
    expect(refresh).toHaveBeenCalledTimes(2)
    tick()
    expect(refresh).toHaveBeenCalledTimes(2)

    other.setAttribute("title", "External edit")
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    expect(selection).toHaveBeenCalled()
    document.dispatchEvent(pointer("pointercancel", {pointerId: 9}))
    expect(target.style.maxWidth).toBe("")
    expect(other.title).toBe("External edit")
  })

  describe("document layout", () => {
    it("gives resized popup content an explicit width so its bubble can grow", () => {
      document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" popover="auto"><p>Short</p></div>'
      const target = document.querySelector<HTMLElement>(".ww-popup-content > p")!
      mockRect(target)
      captureNode(target)
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!

      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 125}))
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 125}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

      expect(target.style.width).toBe("140px")
      expect(target.style.maxWidth).toBe("140px")
      expect(document.querySelector(".ww-popup-content")?.parentElement).toBe(document.body)
    })

    it.each(["p", "h1", "h2", "h3", "h4", "h5", "h6"])("keeps the bottom-right handle horizontal for %s and lets height follow content", async tag => {
      const target = targetElement(tag)
      target.id = "text-container"
      target.innerHTML = 'Text <em>with formatting</em><!--keep--><unfamiliar-inline>and content</unfamiliar-inline>'
      const children = Array.from(target.childNodes)
      Object.assign(target.style, {width: "200px", height: "50px", minHeight: "40px", maxHeight: "60px"})
      mockRect(target, {width: 200})
      captureNode(target)
      const visible = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"), handle => handle.dataset.resizeDirection)
      expect(visible).toEqual(["down-right"])
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const initial = editor.toHTML(true)
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 125}))
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 260, clientY: 300, shiftKey: true}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
      expect(target.style.maxWidth).toBe("160px")
      expect(target.style.height).toBe("auto")
      expect(target.style.minHeight).toBe("0px")
      expect(target.style.maxHeight).toBe("none")
      expect(target.style.getPropertyValue("scale")).toBe("")
      expect(Array.from(target.childNodes)).toEqual(children)
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      const resized = editor.toHTML(true)
      expect(resized).not.toContain("◆")
      expect(editor.doc.body.toString()).not.toContain("◆")
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(initial)
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(resized)
    })
  })

  describe.each(["canvas", "slides"] as const)("%s layout", mode => {
    function freeformText(tag: string) {
      let target: HTMLElement | MathMLElement = targetElement(tag === "math" ? "p" : tag)
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      if(tag === "math") {
        const formula = document.createElementNS(MATH_NAMESPACE, "math")
        target.replaceWith(formula)
        target = formula
        target.setAttribute("display", "block")
        const identifier = document.createElementNS(MATH_NAMESPACE, "mi")
        identifier.textContent = "x"
        target.append(identifier)
      }
      else target.innerHTML = 'Text <em>with formatting</em><!--keep--><unfamiliar-inline>and content</unfamiliar-inline>'
      if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      Object.assign(target.style, {width: "200px", height: "100px", left: "0px", top: "0px"})
      mockRect(target)
      captureNode(target)
      return target
    }

    it.each(["p", "h1", "h2", "h3", "h4", "h5", "h6", "math"])("offers all corners and edge midpoints for %s", tag => {
      freeformText(tag)
      const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
      expect(handles.map(handle => handle.dataset.resizeDirection).sort()).toEqual([
        "down-down", "down-left", "down-right", "left-left", "right-right", "up-left", "up-right", "up-up",
      ])
      for(const handle of handles) expect(handle.getAttribute("part")).not.toContain("transform-overlay-scale-text")
    })

    it.each(["up-left", "up-up", "up-right", "right-right", "down-right", "down-down", "down-left", "left-left"])("resizes text with %s while anchoring the opposite edge", async direction => {
      const target = freeformText("p"), children = Array.from(target.childNodes)
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const initial = editor.toHTML(true), before = target.getBoundingClientRect()
      const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
      const y = direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
      const drag = () => {
        feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
          .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
        movePointer(pointer("pointermove", {pointerId: 3, clientX: 200 + x * 40, clientY: 150 + y * 30}))
      }
      drag()
      document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
      expect(editor.toHTML(true)).toBe(initial)
      drag()
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
      const after = target.getBoundingClientRect()
      expect(after.width).toBe(200 + (x ? 40 : 0))
      expect(after.height).toBe(100 + (y ? 30 : 0))
      expect(x < 0 ? after.right : after.left).toBe(x < 0 ? before.right : before.left)
      expect(y < 0 ? after.bottom : after.top).toBe(y < 0 ? before.bottom : before.top)
      expect(Array.from(target.childNodes)).toEqual(children)
      expect(document.body.className).not.toContain("◆transform-scaling")
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      const resized = editor.toHTML(true)
      expect(resized).not.toMatch(/◆|transform-overlay/)
      expect(editor.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(initial)
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(resized)
    })
  })

  it.each(["Escape", "pointercancel", "removed"])("restores height constraints and cleans markers on %s", cancellation => {
    const target = targetElement("p")
    Object.assign(target.style, {height: "50px", minHeight: "40px", maxHeight: "60px"})
    const initial = target.style.cssText
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 125}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 300}))
    expect(target.style.height).toBe("auto")
    target.title = "Concurrent edit"
    if(cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(cancellation === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    else {
      target.replaceWith(document.createElement("p"))
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 160, clientY: 300}))
    }
    expect(target.style.cssText).toBe(initial)
    expect(target.title).toBe("Concurrent edit")
    expect(document.body.className).not.toContain("◆transform-scaling")
  })

  it("ignores vertical drags and preserves customized built-in widget resizing", () => {
    const target = targetElement("h2")
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 150, clientY: 150}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 150, clientY: 190}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.hasAttribute("style")).toBe(false)
    target.setAttribute("is", "heading-widget")
    feature.updateInfo()
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.hidden).toBe(false)
    expect(handle.getAttribute("part")).not.toContain("transform-overlay-scale-text")
  })
})

it("resizes a quiz inside a board card vertically without squeezing its question", async () => {
  expect(editor.setDocumentLayout("board", "document")).toBe(true)
  const card = document.querySelector<HTMLElement>(".ww-board-card")!
  const quiz = document.createElement("webwriter-quiz")
  quiz.innerHTML = "<webwriter-task><webwriter-task-prompt>Question</webwriter-task-prompt><!--keep--></webwriter-task>"
  card.append(quiz)
  mockRect(quiz, {width: 200, height: 100})
  captureNode(quiz)
  const visible = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"), handle => handle.dataset.resizeDirection)
  expect(visible).toEqual(["down-down"])
  const corner = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
  expect(corner.hidden).toBe(true)
  corner.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
  movePointer(pointer("pointermove", {pointerId: 3, clientX: 100, clientY: 240}))
  expect(quiz.hasAttribute("style")).toBe(false)

  const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-down")!
  handle.dispatchEvent(pointer("pointerdown", {pointerId: 4, clientX: 200, clientY: 200}))
  movePointer(pointer("pointermove", {pointerId: 4, clientX: 100, clientY: 240}))
  document.dispatchEvent(pointer("pointerup", {pointerId: 4}))
  expect(quiz.style.maxWidth).toBe("")
  expect(quiz.style.maxHeight).toBe("140px")
  expect(quiz.innerHTML).toContain("<!--keep-->")
  await mutationsDelivered()
  editor.doc.syncFromDOM()
  expect(editor.toHTML(true)).not.toContain("◆")
})

describe("block formula affordances", () => {
  function formula(display = "block") {
    document.body.innerHTML = "<p>After</p>"
    // Happy DOM's HTML parser does not enter the MathML namespace.
    const target = document.createElementNS(MATH_NAMESPACE, "math") as MathMLElement
    target.setAttribute("display", display)
    const fraction = document.createElementNS(MATH_NAMESPACE, "mfrac")
    const numerator = document.createElementNS(MATH_NAMESPACE, "mi")
    numerator.textContent = "x"
    const denominator = document.createElementNS(MATH_NAMESPACE, "mn")
    denominator.textContent = "2"
    fraction.append(numerator, denominator)
    target.append(document.createComment("keep"), fraction)
    document.body.prepend(target)
    return target
  }

  it.each([false, true])("shows standard block controls for capture=%s and preserves the formula through captioning", async captured => {
    const target = formula()
    const children = Array.from(target.childNodes)
    mockRect(target)
    captured ? captureNode(target) : selectNode(target)
    expect(feature.target).toBe(target)
    for(const name of ["mover", "caption", "delete"]) {
      expect(feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!.hidden).toBe(false)
    }
    expect(feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!.draggable).toBe(true)
    const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
    expect(handles.map(handle => handle.dataset.resizeDirection)).toEqual(["down-right"])
    expect(handles[0].getAttribute("part")).toContain("transform-overlay-scale-text")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!.click()
    expect(target.parentElement!.localName).toBe("figure")
    expect(target.nextElementSibling!.localName).toBe("figcaption")
    expect(Array.from(target.childNodes)).toEqual(children)
    expect(feature.target).toBe(target.parentElement)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(document.querySelector("figure")).toBeNull()
    editor.doc.redo()
    expect(document.querySelector("figure math")).toBeTruthy()
  })

  it("resizes only horizontally, ignoring Shift and vertical movement, and supports undo", async () => {
    const target = formula()
    Object.assign(target.style, {width: "200px", height: "50px", minHeight: "40px", maxHeight: "60px"})
    mockRect(target, {width: 200})
    selectNode(target)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const initial = editor.toHTML(true)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 125}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 300, clientY: 300}))
    expect(target.style.maxWidth).toBe("")
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 260, clientY: 300, shiftKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.maxWidth).toBe("160px")
    expect(target.style.height).toBe("auto")
    expect(target.style.minHeight).toBe("")
    expect(target.style.maxHeight).toBe("none")
    expect(target.style.getPropertyValue("scale")).toBe("")
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const resized = editor.toHTML(true)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(initial)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(resized)
  })

  it("deletes the formula using the block control", () => {
    const target = formula()
    captureNode(target)
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!.click()
    expect(target.isConnected).toBe(false)
    expect(document.querySelector("p")!.textContent).toBe("After")
    expect(feature.target).toBeNull()
    expect(target.className).not.toContain("◆transform-target")
  })

  it("excludes inline formulas and MathML descendants and clears controls after concurrent replacement", async () => {
    const target = formula()
    selectNode(target)
    target.replaceWith(document.createElement("p"))
    await mutationsDelivered()
    expect(feature.target).not.toBe(target)
    expect(target.className).not.toContain("◆transform-target")
    const inline = formula("inline")
    feature.syncSelection(inline)
    expect(feature.target).toBeNull()
    feature.startTransform(inline.querySelector("mi")!)
    expect(feature.target).toBeNull()
  })
})

it("uses an explicit image width when resized inside popup content", () => {
  document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" popover="auto"><img alt="Image"></div>'
  const target = document.querySelector<HTMLImageElement>(".ww-popup-content > img")!
  Object.assign(target.style, {width: "100px", height: "50px"})
  mockRect(target)
  selectNode(target)
  const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!

  handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 125}))
  movePointer(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 125}))
  document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

  expect(target.style.width).toBe("140px")
  expect(target.style.maxWidth).toBe("140px")
})

describe.each(["img", "picture"])("%s stretching", tag => {
  function imageTarget() {
    const target = targetElement(tag)
    if(tag === "picture") target.innerHTML = '<source srcset="alternate.png"><!--keep--><img alt="Keep description">'
    const image = (tag === "picture" ? target.querySelector("img")! : target) as HTMLImageElement
    image.style.objectFit = "contain"
    Object.assign(target.style, {width: "200px", height: "100px"})
    mockRect(target, {width: 200, height: 100})
    selectNode(target)
    return {target, image}
  }

  it("stops proportional resizing at the CSS minimum width and grows again", () => {
    const {target} = imageTarget()
    target.style.minWidth = "120px"
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    const move = (clientX: number, clientY: number) => movePointer(pointer("pointermove",
      {pointerId: 3, clientX, clientY, shiftKey: true, altKey: true}))

    move(160, 175)
    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.maxHeight).toBe("60px")
    expect(target.style.aspectRatio).toBe("120 / 60")
    move(240, 170)
    expect(target.style.maxWidth).toBe("140px")
    expect(target.style.maxHeight).toBe("70px")
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.minWidth).toBe("120px")
  })

  it.each([{dx: 60, dy: -20}, {dx: -40, dy: 30}, {dx: 0, dy: 40}, {dx: 40, dy: 0}])("changes dimensions independently by $dx/$dy and preserves undo", async ({dx, dy}) => {
    const {target, image} = imageTarget()
    const children = Array.from(target.childNodes)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 300 + dx, clientY: 200 + dy, altKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.maxWidth).toBe(`${200 + dx}px`)
    expect(target.style.maxHeight).toBe(`${100 + dy}px`)
    expect(target.style.width).toBe("100%")
    expect(target.style.height).toBe("auto")
    expect(target.style.aspectRatio).toBe(`${200 + dx} / ${100 + dy}`)
    expect(image.style.objectFit).toBe("fill")
    if(tag === "picture") {
      expect(image.style.width).toBe("100%")
      expect(image.style.height).toBe("100%")
    }
    expect(Array.from(target.childNodes)).toEqual(children)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const resized = editor.toHTML(true)
    expect(resized).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(resized)
  })

  it.each([
    {direction: "down-right", dx: 60, dy: -20, width: 260, height: 130},
    {direction: "down-right", dx: -60, dy: -10, width: 140, height: 70},
    {direction: "down-right", dx: 0, dy: 40, width: 280, height: 140},
    {direction: "right-right", dx: 40, dy: 0, width: 240, height: 120},
    {direction: "down-down", dx: 0, dy: -20, width: 160, height: 80},
    {direction: "up-left", dx: -40, dy: 10, width: 240, height: 120},
  ])("keeps proportions with Shift at $direction ($dx/$dy) and preserves undo", async ({direction, dx, dy, width, height}) => {
    const {target} = imageTarget()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
    // Exercise resize geometry for directions hidden by the current document UI.
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 300 + dx, clientY: 200 + dy, shiftKey: true, altKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.maxWidth).toBe(`${width}px`)
    expect(target.style.maxHeight).toBe(`${height}px`)
    expect(target.style.aspectRatio).toBe(`${width} / ${height}`)
    expect(target.style.getPropertyValue("scale")).toBe("")
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const resized = editor.toHTML(true)
    expect(resized).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(resized)
  })

  it("switches between proportional and free resizing during one gesture", () => {
    const {target} = imageTarget()
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    const move = (shiftKey: boolean) => movePointer(pointer("pointermove", {pointerId: 3, clientX: 360, clientY: 180, shiftKey, altKey: true}))
    move(false)
    expect(target.style.aspectRatio).toBe("260 / 80")
    move(true)
    expect(target.style.aspectRatio).toBe("260 / 130")
    move(false)
    expect(target.style.aspectRatio).toBe("260 / 80")
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(target.style.width).toBe("200px")
    expect(target.style.height).toBe("100px")
    expect(target.style.aspectRatio).toBe("")
  })

  it.each(["Escape", "pointercancel", "replace", "concurrent", "destroy"])("restores owned image styles on %s", cancellation => {
    const {target, image} = imageTarget()
    const original = target.style.cssText, imageOriginal = image.style.cssText
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 340, clientY: 180}))
    image.title = "Concurrent edit"
    if(cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(cancellation === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    else if(cancellation === "destroy") editor.destroy()
    else {
      if(cancellation === "replace") image.replaceWith(document.createElement("img"))
      else image.style.objectFit = "cover"
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 350, clientY: 180}))
    }
    if(cancellation === "concurrent") {
      expect(image.style.objectFit).toBe("cover")
      image.style.objectFit = "contain"
    }
    expect(target.style.cssText).toBe(original)
    expect(image.style.cssText).toBe(imageOriginal)
    expect(image.title).toBe("Concurrent edit")
    expect(document.body.className).not.toContain("◆transform-scaling")
  })
})

describe("resize alignment", () => {
  it("clamps a floated widget to its stylesheet minimum width", () => {
    floatStylesheet.textContent += " demo-widget { min-width: 120px }"
    const target = targetElement("demo-widget")
    Object.assign(target.style, {width: "200px", height: "100px", float: "right"})
    mockRect(target, {width: 200, height: 100})
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-left")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 270, clientY: 180, altKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("120px")
    expect(target.style.minWidth).toBe("")
  })

  it.each([
    {marginLeft: "0px", marginRight: "auto", float: "none", corner: "down-right", width: 230},
    {marginLeft: "20px", marginRight: "20px", float: "none", corner: "down-right", width: 230},
    {marginLeft: "auto", marginRight: "0px", float: "none", corner: "down-left", width: 230},
    {marginLeft: "auto", marginRight: "auto", float: "none", corner: "down-right", width: 260},
    {marginLeft: "auto", marginRight: "auto", float: "right", corner: "down-left", width: 230},
    {marginLeft: "auto", marginRight: "auto", float: "left", corner: "down-right", width: 230},
  ])("uses $corner for margins $marginLeft/$marginRight and float $float", ({marginLeft, marginRight, float, corner, width}) => {
    const target = targetElement("img")
    Object.assign(target.style, {width: "200px", height: "100px", marginLeft, marginRight, float})
    mockRect(target, {width: 200, height: 100})
    selectNode(target)
    const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
    expect(handles.map(handle => handle.dataset.resizeDirection)).toEqual([corner])
    handles[0].dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: corner === "down-left" ? 270 : 330, clientY: 220, altKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.maxWidth).toBe(`${width}px`)
    expect(target.style.maxHeight).toBe("120px")
    expect(target.style.marginLeft).toBe(marginLeft)
    expect(target.style.marginRight).toBe(marginRight)
    expect(target.style.position).toBe("")
  })

  it.each(["p", "demo-widget", "picture", "img"])("refreshes %s handles after placement changes", tag => {
    const target = targetElement(tag)
    mockRect(target)
    selectNode(target)
    for(const alignment of ["right", "center", "left"] as const) {
      editor.features.manipulation.setFloat(target, "none", alignment)
      feature.updateInfo()
      const handles = Array.from(feature.overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not([hidden])"))
      expect(handles.map(handle => handle.dataset.resizeDirection)).toEqual([alignment === "right" ? "down-left" : "down-right"])
    }
    // Happy DOM matches the sticky float rule even without the sticky class.
    if(tag === "picture") target.style.position = "relative"
    target.classList.add("ww-float-right")
    feature.updateInfo()
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-left")!.hidden).toBe(false)
    target.classList.replace("ww-float-right", "ww-float-left")
    feature.updateInfo()
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.hidden).toBe(false)
  })

  it("does not compound centered resizing with Ctrl/Cmd", () => {
    const target = targetElement("img")
    Object.assign(target.style, {width: "200px", height: "100px", margin: "auto"})
    mockRect(target, {width: 200, height: 100})
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 200}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 330, clientY: 220, ctrlKey: true, altKey: true}))
    expect(target.style.maxWidth).toBe("260px")
    expect(target.style.maxHeight).toBe("140px")
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(target.style.maxWidth).toBe("")
    expect(target.style.maxHeight).toBe("")
  })

  it("follows responsive float placement instead of the authored side", () => {
    const target = targetElement("img")
    target.classList.add("ww-float-left")
    target.style.setProperty("float", "right", "important")
    mockRect(target)
    selectNode(target)
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-left")!.hidden).toBe(false)
    target.style.setProperty("float", "none", "important")
    target.style.setProperty("--ww-responsive-float", "none")
    target.style.margin = "auto"
    feature.updateInfo()
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.hidden).toBe(false)
  })
})

describe("caption affordance", () => {
  it("applies figure transforms to its content while keeping the caption upright through undo and redo", () => {
    document.body.innerHTML = '<figure><!--keep--><demo-widget title="Preserve"><unfamiliar-child></unfamiliar-child></demo-widget><figcaption><em>Upright</em></figcaption></figure>'
    const figure = document.querySelector<HTMLElement>("figure")!, content = figure.querySelector<HTMLElement>("demo-widget")!
    const caption = figure.querySelector("figcaption")!, nodes = Array.from(figure.childNodes)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    expect(editor.features.manipulation.setElementStyles(figure, {rotate: "30deg", "transform-origin": "0px 0px"})).toBe(true)
    expect(content.style.getPropertyValue("rotate")).toBe("30deg")
    expect(figure.style.getPropertyValue("rotate")).toBe("")
    expect(caption.getAttribute("style")).toBeNull()
    expect(Array.from(figure.childNodes)).toEqual(nodes)
    const state = editor.features.manipulation.getStyleState(["rotate"], figure, false)
    expect(state.inline.rotate.value).toBe("30deg")
    editor.doc.syncFromDOM()
    const after = editor.toHTML(true)
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it.each(["pointercancel", "removed", "commit"])("rotates only figure content with the freeform handle and handles %s", outcome => {
    document.body.innerHTML = '<figure style="width: 200px; height: 140px"><demo-widget style="width: 200px; height: 100px"></demo-widget><figcaption>Upright</figcaption></figure>'
    const figure = document.querySelector<HTMLElement>("figure")!, content = figure.firstElementChild as HTMLElement
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    mockRect(figure, {width: 200, height: 140})
    mockRect(content, {width: 200, height: 100})
    captureNode(figure)
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 300, clientY: 150}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {clientX: 200, clientY: 250}))
    expect(content.style.getPropertyValue("rotate")).toBe("90deg")
    expect(figure.style.getPropertyValue("rotate")).toBe("")
    if(outcome === "commit") feature.handleRotateEnd()
    else if(outcome === "pointercancel") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else { content.remove(); feature.handleRotateDrag(new MouseEvent("mousemove", {clientX: 100, clientY: 150})) }
    expect(content.style.getPropertyValue("rotate")).toBe(outcome === "commit" ? "90deg" : "")
    if(outcome === "commit") {
      feature.restore()
      expect(content.style.getPropertyValue("rotate")).toBe("")
      expect(content.style.width).toBe("200px")
    }
    expect(document.body.className).not.toContain("◆transform-rotating")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  const button = () => feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!

  it("requires Styling permission to add or reposition a caption", () => {
    document.body.innerHTML = "<figure><p>Content</p></figure>"
    const figure = document.querySelector("figure")!
    const allows = vi.spyOn(editor, "allows").mockImplementation(permission => permission !== "style")
    mockRect(figure, {width: 240, height: 40})
    captureNode(figure)
    expect(button().hidden).toBe(true)
    expect(editor.features.manipulation.setCaption("below")).toBe(false)
    expect(editor.features.manipulation.addFigureCaption("before")).toBe(false)
    expect(figure.querySelector("figcaption")).toBeNull()
    allows.mockReturnValue(true)
    expect(editor.features.manipulation.setCaption("below")).toBe(true)
    expect(figure.lastElementChild?.localName).toBe("figcaption")
  })

  it.each((["document", "canvas", "slides"] as const).flatMap(mode =>
    ["p", "caption-widget", "table"].flatMap(tag => [false, true].map(captured => ({mode, tag, captured})))))("adds a bottom-left caption to $tag in $mode and preserves capture=$captured selection", async ({mode, tag, captured}) => {
    const target = targetElement(tag)
    if(tag === "table") target.innerHTML = '<tbody><tr><td>Content</td></tr></tbody>'
    if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    mockRect(target)
    if(mode === "canvas") {
      // Retire the initial canvas caret placeholder before creating a node range;
      // Happy DOM collapses parent ranges when that preceding paragraph is removed.
      $.move(target.firstChild ?? target, 0)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
    }
    if(captured) captureNode(target)
    else {
      // Happy DOM delivers selectionchange synchronously while ranges are set.
      $.isSettingRanges = true
      try { $.selectElement(target) }
      finally { $.isSettingRanges = false }
      editor.features.selection.processSelection(false, {scrollIntoView: false})
    }
    expect(button().hidden).toBe(mode !== "document")
    expect(button().getAttribute("part")).toContain("transform-overlay-button")
    expect(button().getAttribute("aria-label")).toBe("Add caption")
    const addIcon = decodeURIComponent(button().style.getPropertyValue("--icon"))
    expect(addIcon).toContain('<path d="M9 10.143h6M12 7.143v6M6 16.857h12"/>')
    expect(addIcon).not.toContain("<rect")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    if(mode === "document") button().click()
    else editor.features.manipulation.actions.cycleCaption({type: "cycleCaption"})
    const caption = document.querySelector<HTMLElement>("figcaption, caption")!
    expect(caption.style.textAlign).toBe("left")
    expect(editor.features.manipulation.getCaptionPosition()).toBe("below")
    expect(editor.features.selection.captureSelectedElement).toBe(captured ? target : null)
    if(!captured) expect($.selectedElement).toBe(tag === "table" ? target : target.parentElement)
    expect(document.getSelection()!.anchorNode).not.toBe(caption)
    expect(button().hidden).toBe(mode !== "document")
    if(mode === "document") button().click()
    else editor.features.manipulation.actions.cycleCaption({type: "cycleCaption"})
    expect(caption.style.textAlign).toBe("center")
    expect(editor.features.selection.captureSelectedElement).toBe(captured ? target : null)
    expect(document.body.querySelector("#◆transform-overlay-caption")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
    const changed = editor.toHTML(true)
    editor.doc.undo()
    expect(document.querySelector<HTMLElement>("figcaption, caption")!.style.textAlign).toBe("left")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it.each(["figure", "table"])("cycles bottom right, left and center from the current %s caption, preserving content and undo", tag => {
    document.body.innerHTML = tag === "figure"
      ? '<figure><!--keep--><figcaption style="text-align: center"><b>Label</b></figcaption><p>Content</p><custom-element></custom-element></figure>'
      : '<table><caption style="text-align: center"><b>Label</b></caption><tbody><tr><td>Content</td></tr></tbody></table>'
    const target = document.body.firstElementChild as HTMLElement
    const caption = target.querySelector<HTMLElement>("caption, figcaption")!
    const content = target.querySelector("p, tbody")
    mockRect(target)
    selectNode(target)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    for(const [position, alignment] of [["below", "right"], ["below", "left"], ["below", "center"]]) {
      button().click()
      expect(editor.features.manipulation.getCaptionPosition()).toBe(position)
      expect(editor.features.manipulation.getCaptionAlignment()).toBe(alignment)
      expect(button().getAttribute("aria-label")).toBe(`Caption ${position}, align ${alignment}: cycle position`)
      const icon = decodeURIComponent(button().style.getPropertyValue("--icon"))
      const x = alignment === "left" ? 6 : alignment === "center" ? 9 : 12
      const y = position === "above" ? 3 : 21
      expect(icon).toContain(`<line x1="${x}" x2="${x + 6}" y1="${y}" y2="${y}"/>`)
      expect(target.querySelector("caption, figcaption")).toBe(caption)
      expect(caption.innerHTML).toBe("<b>Label</b>")
      expect(target.querySelector("p, tbody")).toBe(content)
      expect(button().hidden).toBe(false)
      expect($.selectedElement).toBe(target)
    }
    const changed = editor.toHTML(true)
    editor.doc.undo()
    expect(editor.features.manipulation.getCaptionAlignment()).toBe("left")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it("ignores a disconnected target and removes the control on disable", () => {
    const target = targetElement()
    mockRect(target)
    selectNode(target)
    const control = button()
    target.remove()
    control.click()
    expect(document.querySelector("figure")).toBeNull()
    feature.disable()
    expect(control.isConnected).toBe(false)
  })
})

function pointer(type: string, options: PointerEventInit = {}) {
  const terminalInput = type === "pointerup" ? lastPointerPositions.get(options.pointerId ?? 0) : undefined
  const event = new PointerEvent(type, {
    bubbles: true, composed: true, button: 0,
    ...(terminalInput ? {
      ...(options.clientX === undefined ? {clientX: terminalInput.clientX} : {}),
      ...(options.clientY === undefined ? {clientY: terminalInput.clientY} : {}),
      ...(options.altKey === undefined ? {altKey: terminalInput.altKey} : {}),
      ...(options.ctrlKey === undefined ? {ctrlKey: terminalInput.ctrlKey} : {}),
      ...(options.metaKey === undefined ? {metaKey: terminalInput.metaKey} : {}),
      ...(options.shiftKey === undefined ? {shiftKey: terminalInput.shiftKey} : {}),
    } : {}),
    ...options,
  })
  if(type === "pointermove") lastPointerPositions.set(options.pointerId ?? 0, {
    clientX: event.clientX, clientY: event.clientY,
    altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
  })
  else if(type === "pointerup" || type === "pointercancel") lastPointerPositions.delete(options.pointerId ?? 0)
  return event
}

async function mutationsDelivered() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("freeform group transformation", () => {
  function group(mode: "canvas" | "slides" = "canvas") {
    document.body.className = `ww-${mode}`
    const parent = mode === "canvas" ? document.body : append(document.createElement("div"))
      .appendChild(Object.assign(document.createElement("section"), {className: "ww-slide"}))
    if(mode === "slides") parent.parentElement!.className = "ww-slides-viewport"
    const first = parent.appendChild(document.createElement("group-widget"))
    first.innerHTML = '<span>Authored content</span><!--keep-->'
    first.attachShadow({mode: "open"}).innerHTML = '<button>Widget input</button>'
    const outside = parent.appendChild(document.createElement("p"))
    outside.textContent = "Unselected"
    const last = parent.appendChild(document.createElement("p"))
    last.textContent = "Last"
    for(const [target, x] of [[first, 0], [last, 200]] as const) {
      target.style.cssText = `position:absolute;left:${x}px;top:0px;width:100px;height:50px`
      vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
        const matrix = new DOMMatrix(target.style.transform || undefined)
        const cssWidth = parseFloat(target.style.width), cssHeight = parseFloat(target.style.height)
        const width = Math.abs(matrix.a) * cssWidth + Math.abs(matrix.c) * cssHeight
        const height = Math.abs(matrix.b) * cssWidth + Math.abs(matrix.d) * cssHeight
        return new DOMRect(100 + parseFloat(target.style.left) + cssWidth / 2 - width / 2,
          100 + parseFloat(target.style.top) + cssHeight / 2 - height / 2, width, height)
      })
    }
    if(mode === "slides") {
      editor.features.slides.ensureContent()
      flushAnimationFrame()
      editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
    }
    $.selectElements([first, last])
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    return {first, last, outside, parent}
  }

  function start(control: string, x = 400, y = 150) {
    feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${control}`)!
      .dispatchEvent(pointer("pointerdown", {pointerId: 31, clientX: x, clientY: y}))
  }
  const move = (x: number, y: number, modifiers: PointerEventInit = {}) => movePointer(pointer("pointermove", {
    pointerId: 31, clientX: x, clientY: y, ...modifiers,
  }))
  const end = () => document.dispatchEvent(pointer("pointerup", {pointerId: 31}))

  it.each(["canvas", "slides"] as const)("offers a %s group frame without resize handles and moves every selected item from its border", async mode => {
    const {first, last, outside, parent} = group(mode)
    const children = Array.from(parent.childNodes), content = first.innerHTML
    expect(feature.overlay).not.toHaveAttribute("visibility")
    expect(feature.overlay.style.left).toBe("100px")
    expect(feature.overlay.style.width).toBe("300px")
    expect(feature.overlay.style.height).toBe("50px")
    expect(feature.overlay.querySelectorAll(".◆transform-overlay-scale:not([hidden])")).toHaveLength(0)
    expect(feature.overlay.querySelector("#◆transform-overlay-rotator")).not.toHaveAttribute("hidden")
    expect(feature.controlContainer(first)).toBeNull()
    editor.doc.syncFromDOM()
    const initial = editor.toHTML(true)
    start("scale-right", 400, 125)
    move(440, 155)
    end()
    expect(first.style.left).toBe("40px")
    expect(last.style.left).toBe("240px")
    expect(first.style.top).toBe("40px")
    expect(last.style.top).toBe("40px")
    expect($.selectedElements).toEqual([first, last])
    expect(Array.from(parent.childNodes)).toEqual(children)
    expect(first.innerHTML).toBe(content)
    expect(outside.style.cssText).toBe("")
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const moved = editor.toHTML(true)
    expect(moved).not.toMatch(/◆|transform-overlay/)
    expect(editor.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(initial)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(moved)
  })

  it("moves the group when dragging a selected item's authored content", () => {
    const {first, last} = group()
    first.firstElementChild!.dispatchEvent(pointer("pointerdown", {pointerId: 31, clientX: 150, clientY: 125}))
    move(180, 145, {shiftKey: true})
    end()
    expect(first.style.left).toBe("40px")
    expect(last.style.left).toBe("240px")
    expect(first.style.top).toBe("0px")
    expect($.selectedElements).toEqual([first, last])
  })

  it("ignores incidental widget shadow input", () => {
    const {first, last} = group()
    first.shadowRoot!.querySelector("button")!.dispatchEvent(pointer("pointerdown", {pointerId: 31, clientX: 150, clientY: 125}))
    move(190, 155)
    end()
    expect(first.style.left).toBe("0px")
    expect(last.style.left).toBe("200px")
  })

  describe.each(["canvas", "slides"] as const)("%s group resizing", mode => {
    it.each(["up-left", "up-up", "up-right", "right-right", "down-right", "down-down", "down-left", "left-left"])("hides and ignores the %s resize handle", direction => {
      const {first, last} = group(mode)
      const initial = [first.style.cssText, last.style.cssText]
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      expect(handle).toHaveAttribute("hidden")
      expect(handle.getAttribute("part")).toContain("transform-overlay-scale-hidden")
      start(`scale-${direction}`)
      move(460, 170, {ctrlKey: true, metaKey: true, shiftKey: true})
      end()
      handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
      handle.dispatchEvent(new MouseEvent("mousedown", {button: 0, clientX: 400, clientY: 150}))
      feature.handleScaleDrag(new MouseEvent("mousemove", {clientX: 460, clientY: 170}))
      feature.handleScaleEnd()
      expect([first.style.cssText, last.style.cssText]).toEqual(initial)
      expect($.selectedElements).toEqual([first, last])
      expect(document.body.className).not.toContain("◆transform-scaling")
    })

    it("restores individual resize handles after selecting one item", () => {
      const {first} = group(mode)
      editor.features.selection.selectElement(first)
      expect(feature.overlay.querySelectorAll(".◆transform-overlay-scale:not([hidden])")).toHaveLength(8)
    })
  })

  it("rotates all members around the group center", () => {
    const {first, last} = group()
    start("rotator", 250, 75)
    move(300, 125)
    end()
    for(const target of [first, last]) expect(new DOMMatrix(target.style.transform).b).toBeCloseTo(1)
    expect(first.getBoundingClientRect().top).toBeCloseTo(-25)
    expect(last.getBoundingClientRect().top - first.getBoundingClientRect().top).toBeCloseTo(200)
    expect(first.getBoundingClientRect().left).toBeCloseTo(last.getBoundingClientRect().left)
    expect($.selectedElements).toEqual([first, last])
  })

  it("keeps existing outlines during a shared resize and refreshes them when the selection changes", async () => {
    const {first, last, outside} = group()
    expect(feature.setSpatialGrouping("group")).toBe(true)
    await mutationsDelivered()
    const outlines = () => Array.from(editor.appendix.querySelectorAll('[part~="multi-selection-overlay"]'))
    const original = outlines()
    expect(original).toHaveLength(2)
    start("scale-down-right")
    move(460, 180)
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    const current = outlines()
    expect(current).toHaveLength(original.length)
    current.forEach((outline, index) => expect(outline).toBe(original[index]))
    expect(first.style.width).not.toBe("100px")

    const post = vi.spyOn(editor, "postHostMessage")
    $.selectElements([first, outside])
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    editor.postSelectionPath()
    expect(post).toHaveBeenCalledWith(expect.objectContaining({type: selectionChangeEvent}))
    move(470, 190)
    await mutationsDelivered()
    expect(first.style.width).toBe("100px")
    expect($.selectedElements).toEqual([first, outside])
    expect(hasPresentationState(last, "atomic-range-selected")).toBe(false)
    expect(hasPresentationState(outside, "atomic-range-selected")).toBe(true)
    expect(original.every(outline => !outline.isConnected)).toBe(true)
  })

  it.each(["resize", "rotate", "rotate and cancel"])("publishes mark and selection state once after group %s", async mode => {
    const {first} = group()
    expect(feature.setSpatialGrouping("group")).toBe(true)
    await mutationsDelivered()
    const initialStyle = first.style.cssText
    const outlines = () => Array.from(editor.appendix.querySelectorAll('[part~="multi-selection-overlay"]'))
    const original = outlines()
    const post = vi.spyOn(editor, "postHostMessage")
    const events = (type: string) => post.mock.calls.filter(([message]) => (message as {type: string}).type === type)
    if(mode === "resize") {
      start("scale-down-right")
      move(460, 180)
    }
    else {
      start("rotator", 250, 75)
      move(300, 125)
    }
    expect(first.style.cssText).not.toBe(initialStyle)
    editor.doc.syncFromDOM()
    await mutationsDelivered()
    expect(events(markStateChangeEvent)).toHaveLength(0)
    expect(events(selectionChangeEvent)).toHaveLength(0)

    if(mode !== "rotate and cancel") end()
    else {
      document.dispatchEvent(pointer("pointercancel", {pointerId: 31}))
      expect(first.style.cssText).toBe(initialStyle)
    }
    await mutationsDelivered()
    expect(events(markStateChangeEvent)).toHaveLength(1)
    expect(events(selectionChangeEvent)).toEqual([[expect.objectContaining({
      type: selectionChangeEvent, detail: expect.objectContaining({nodeSelected: true}),
    })]])
    expect(outlines()).toHaveLength(original.length)
    outlines().forEach((outline, index) => expect(outline).toBe(original[index]))
  })

  it.each(["resize", "rotate"] as const)("cancels group %s when another edit changes a gesture-owned style", async mode => {
    const {first, last} = group()
    expect(feature.setSpatialGrouping("group")).toBe(true)
    const initial = first.style.cssText
    const property = mode === "resize" ? "width" : "transform"
    const before = last.style.getPropertyValue(property)
    if(mode === "resize") {
      start("scale-down-right")
      move(460, 180)
    }
    else {
      start("rotator", 250, 75)
      move(300, 125)
    }
    expect(last.style.getPropertyValue(property)).not.toBe(before)
    const concurrent = mode === "resize" ? "210px" : "rotate(5deg)"
    last.style.setProperty(property, concurrent, "important")
    move(470, 190)
    end()
    await mutationsDelivered()

    expect(first.style.cssText).toBe(initial)
    expect(last.style.getPropertyValue(property)).toBe(concurrent)
    expect(last.style.getPropertyPriority(property)).toBe("important")
    expect(document.body.className).not.toMatch(/◆transform-(?:scaling|rotating)/)
    expect($.selectedElements).toEqual([first, last])
  })

  it.each(["canvas", "slides"] as const)("persists non-adjacent %s groups and drills into an individual member", async mode => {
    const {first, last, outside, parent} = group(mode)
    const children = Array.from(parent.childNodes)
    const button = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-group")!
    expect(button).toHaveAttribute("aria-label", "Group")
    editor.doc.syncFromDOM()
    button.click()
    const id = first.getAttribute("data-ww-group")
    expect(id).toBeTruthy()
    expect(last).toHaveAttribute("data-ww-group", id)
    expect(outside).not.toHaveAttribute("data-ww-group")
    expect(Array.from(parent.childNodes)).toEqual(children)
    expect(editor.doc.body.toString()).toContain(`data-ww-group="${id}"`)
    expect(editor.toHTML(true)).not.toContain("transform-overlay-group")
    expect(button).toHaveAttribute("aria-label", "Ungroup")

    editor.features.selection.selectElement(outside)
    const press = () => first.firstElementChild!.dispatchEvent(pointer("pointerdown", {pointerId: 31, clientX: 150, clientY: 125}))
    press(); end()
    expect($.selectedElements).toEqual([first, last])
    press(); end()
    expect($.selectedElement).toBe(first)
    expect(button.hidden).toBe(true)
    const outline = () => editor.appendix.querySelector<HTMLElement>('[part~="transform-overlay-group-context"]')
    expect(outline()?.style.width).toBe("300px")
    expect(outline()).toHaveAttribute("aria-label", "Select group")
    const edge = outline()!.querySelector<HTMLElement>('[part~="transform-overlay-edge-right"]')!
    const pointerDown = pointer("pointerdown", {cancelable: true})
    edge.dispatchEvent(pointerDown)
    expect(pointerDown.defaultPrevented).toBe(true)
    edge.click()
    expect($.selectedElements).toEqual([first, last])
    expect(outline()).toBeNull()
    press(); end()
    expect(editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true}).target?.spatialGrouping)
      .toEqual({canGroup: false, canUngroup: true})
    expect(feature.actions.setSpatialGrouping({type: "setSpatialGrouping", mode: "ungroup"})).toBe(true)
    expect(last).not.toHaveAttribute("data-ww-group")
    expect(outline()).toBeNull()
    await mutationsDelivered()
    editor.doc.undo()
    expect(last).toHaveAttribute("data-ww-group", id)
    await mutationsDelivered()
    expect(outline()).not.toBeNull()
    editor.doc.redo()
    expect(last).not.toHaveAttribute("data-ww-group")
  })

  it.each(["canvas", "slides"] as const)("resizes, rotates and deletes a saved %s group as a unit", async mode => {
    const {first, last, outside} = group(mode)
    expect(feature.setSpatialGrouping("group")).toBe(true)
    expect(feature.overlay.querySelectorAll(".◆transform-overlay-scale:not([hidden])")).toHaveLength(8)
    start("scale-down-right")
    move(550, 175)
    end()
    for(const target of [first, last]) {
      expect(target.style.width).toBe("150px")
      expect(target.style.height).toBe("80px") // The 25px pointer delta snaps to 30px.
      expect(target.style.transform).toBe("")
    }
    expect(first.getBoundingClientRect().left).toBeCloseTo(100)
    expect(last.getBoundingClientRect().left).toBeCloseTo(400)
    expect(feature.overlay.style.width).toBe("450px")
    start("rotator", 325, 70)
    move(410, 140)
    end()
    expect(new DOMMatrix(first.style.transform).b).toBeCloseTo(1)
    expect(new DOMMatrix(last.style.transform).b).toBeCloseTo(1)
    expect(feature.overlay.style.transform).toBe("rotate(90deg)")
    expect(parseFloat(feature.overlay.style.width)).toBeCloseTo(450)
    expect(first.getAttribute("data-ww-group-rotation")).toBe("90")
    expect(editor.toHTML(true)).toContain('data-ww-group-rotation="90"')
    expect(editor.doc.body.toString()).toContain("transform: matrix(0, 1")
    const rotated = editor.doc.body.toString()
    editor.features.selection.selectElement(first)
    const outline = editor.appendix.querySelector<HTMLElement>('[part~="transform-overlay-group-context"]')!
    expect(outline.style.transform).toBe("rotate(90deg)")
    outline.click()
    expect(feature.overlay.style.transform).toBe("rotate(90deg)")

    const transforms = [first.style.transform, last.style.transform]
    expect([first.style.width, last.style.width]).toEqual(["150px", "150px"])
    expect(parseFloat(feature.overlay.style.width)).toBeCloseTo(450)
    start("scale-right-right", 325, 365)
    move(325, 455)
    end()
    for(const [index, target] of [first, last].entries()) {
      expect(parseFloat(target.style.width)).toBeCloseTo(180)
      expect(target.style.height).toBe("80px")
      expect(target.style.transform).toBe(transforms[index])
    }
    expect(feature.overlay.style.transform).toBe("rotate(90deg)")
    expect(parseFloat(feature.overlay.style.width)).toBeCloseTo(540)

    await mutationsDelivered()
    editor.doc.undo()
    expect(editor.doc.body.toString()).toBe(rotated)
    editor.doc.undo()
    expect(first.hasAttribute("data-ww-group-rotation")).toBe(false)
    editor.doc.redo()
    expect(editor.doc.body.toString()).toBe(rotated)
    expect(first.getAttribute("data-ww-group-rotation")).toBe("90")
    feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!.click()
    expect(first.isConnected).toBe(false)
    expect(last.isConnected).toBe(false)
    expect(outside.isConnected).toBe(true)
  })

  it("keeps membership scoped to one slide and refreshes it after a remote edit", async () => {
    const {first, last, parent} = group("slides")
    expect(feature.setSpatialGrouping("group")).toBe(true)
    const otherSlide = parent.cloneNode() as HTMLElement
    const elsewhere = first.cloneNode() as HTMLElement
    otherSlide.removeAttribute("id")
    parent.after(otherSlide)
    otherSlide.append(elsewhere)
    expect(feature.groupSelectionPeers(first)).toEqual([first, last])
    $.selectElements([first, elsewhere])
    expect(feature.setSpatialGrouping("group")).toBe(false)
    editor.features.selection.selectElement(first)
    last.id = "last-group-member"
    editor.doc.syncFromDOM()
    const [shared] = [...editor.doc.body.createTreeWalker(node => node instanceof Y.XmlElement && node.getAttribute("id") === last.id)]
    editor.doc.doc.transact(() => (shared as Y.XmlElement).removeAttribute("data-ww-group"), "remote-test")
    await mutationsDelivered()
    expect(feature.groupSelectionPeers(first)).toEqual([first])
    expect(editor.appendix.querySelector('[part~="transform-overlay-group-context"]')).toBeNull()
  })

  it.each(["Escape", "pointercancel", "removed", "replaced", "remote", "concurrent", "disable", "destroy"])("cancels every member and cleans markers on %s", async outcome => {
    const {first, last} = group()
    const initial = first.style.cssText
    start("scale-right", 400, 125)
    move(440, 155)
    first.title = "Concurrent unrelated edit"
    if(outcome === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    else if(outcome === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 31}))
    else if(outcome === "disable") feature.disable()
    else if(outcome === "destroy") editor.destroy()
    else {
      if(outcome === "removed") last.remove()
      else if(outcome === "replaced") last.replaceWith(last.cloneNode(true))
      else if(outcome === "remote") {
        editor.doc.syncFromDOM()
        editor.doc.doc.transact(() => editor.doc.body.delete(editor.doc.body.length - 1, 1), "remote-test")
      }
      else last.style.left = "500px"
      move(460, 165)
    }
    await mutationsDelivered()
    expect(first.style.cssText).toBe(initial)
    expect(first.title).toBe("Concurrent unrelated edit")
    expect(last.style.left).toBe(outcome === "concurrent" ? "500px" : "200px")
    expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
    editor.features.selection.selectElement(first)
    expect(hasPresentationState(last, "transform-target")).toBe(false)
    expect(presentationStateElements(document, "transform-target")).toHaveLength(outcome === "disable" || outcome === "destroy" ? 0 : 1)
  })

  it("deletes all selected members in one undo step", () => {
    const {first, last, outside} = group()
    editor.doc.syncFromDOM()
    const initial = editor.toHTML(true)
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-delete")!.click()
    expect(first.isConnected).toBe(false)
    expect(last.isConnected).toBe(false)
    expect(outside.isConnected).toBe(true)
    expect(feature.overlay).toHaveAttribute("visibility", "hidden")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(initial)
  })
})

describe("selection-owned transformation", () => {
  it.each(["img", "video"])("reveals and restores previously cropped %s content outside its frame", tag => {
    const media = targetElement(tag) as HTMLImageElement | HTMLVideoElement
    media.setAttribute("src", "media.mp4")
    Object.defineProperties(media, tag === "img"
      ? {naturalWidth: {value: 200}, naturalHeight: {value: 100}, complete: {value: true}}
      : {videoWidth: {value: 200}, videoHeight: {value: 100}, readyState: {value: 2}})
    media.style.cssText = "width:160px;height:80px;object-fit:fill;object-position:0% 0%;object-view-box:inset(10%)"
    mockRect(media, {width: 160, height: 80})
    captureNode(media)
    const preview = feature.overlay.querySelector<HTMLCanvasElement>("canvas")!
    const context = {clearRect: vi.fn(), drawImage: vi.fn()}
    vi.spyOn(preview, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    for(const [direction, dx, dy] of [["up-left", -100, -100], ["down-right", 100, 100]] as const) {
      const before = editor.toHTML(true)
      feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-crop-${direction}`)!
        .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
      expect(preview.hidden).toBe(false)
      if(direction === "up-left") {
        expect(preview.style.left).toBe("-12.5%")
        expect(preview.style.width).toBe("125%")
      }
      movePointer(pointer("pointermove", {pointerId: 42, clientX: 100 + dx, clientY: 100 + dy}))
      expect(editor.toHTML(true)).toBe(before)
      expect(preview.getRootNode()).toBe(editor.appendix)
      document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
      expect(preview.hidden).toBe(true)
      expect(preview.width).toBe(0)
      expect(editor.features.selection.captureSelectedElement).toBe(media)
    }
    expect(media.style.getPropertyValue("object-view-box")).toBe("inset(0% 0% 0% 0%)")
    expect(media.style.width).toBe("200px")
    expect(media.style.height).toBe("100px")
    expect(editor.toHTML(true)).not.toContain("crop-preview")
    editor.doc.syncFromDOM()
    const restored = editor.toHTML(true)
    editor.doc.undo()
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(restored)
  })

  it("restores the figure frame, source dimensions and margins when a crop drag is cancelled", () => {
    const figure = targetElement("figure")
    figure.style.width = "360px"
    figure.innerHTML = '<picture style="width: 360px; height: 200px;"><img src="photo.png" style="width: 360px; height: 200px; object-view-box: inset(5%);"></picture><figcaption>Caption</figcaption>'
    const image = figure.querySelector("img")!
    mockRect(figure, {width: 360, height: 224})
    mockRect(figure.querySelector("picture")!, {width: 360, height: 200})
    mockRect(image, {width: 360, height: 200})
    selectNode(figure)
    const before = editor.toHTML(true)
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
      .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 42, clientX: 136, clientY: 120}))
    expect(figure.style.maxWidth).toBe("")
    expect(figure.style.maxHeight).toBe("")
    expect(figure.style.width).toBe("360px")
    expect(figure.style.display).toBe("")
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    expect(editor.toHTML(true)).toBe(before)
    expect(figure.outerHTML).not.toContain("--ww-crop")
  })

  it("fits selection and transform geometry to the visible crop without scaling the source", () => {
    const video = targetElement("video")
    video.setAttribute("src", "movie.mp4")
    video.style.cssText = "width: 360px; height: 200px; object-view-box: inset(15% 20% 25% 10%)"
    mockRect(video, {left: 10, top: 20, width: 360, height: 200})
    selectNode(video)
    const geometry = feature.boxGeometry(video)
    expect(geometry.width).toBeCloseTo(360)
    expect(geometry.height).toBeCloseTo(200)
    expect(geometry.rect.left).toBeCloseTo(10)
    expect(geometry.rect.top).toBeCloseTo(20)
    expect(parseFloat(feature.overlay.style.width)).toBeCloseTo(360)
    expect(parseFloat(feature.overlay.style.height)).toBeCloseTo(200)
    expect(feature.boxGeometry(video, false).width).toBe(360)
    expect(feature.boxGeometry(video, false).height).toBe(200)
  })

  it.each([
    ["up-left", "18% 10% 10% 18%"],
    ["down-right", "10% 18% 18% 10%"],
  ])("drags the %s media crop handle using ordinary max-size constraints", (direction, expected) => {
    const video = targetElement("video")
    video.setAttribute("src", "movie.mp4")
    video.style.width = "200px"
    video.style.height = "100px"
    video.style.setProperty("object-view-box", "inset(10%)", "important")
    mockRect(video, {width: 200, height: 100})
    selectNode(video)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    const handles = feature.overlay.querySelectorAll<HTMLElement>('[data-transform-mode="crop"]')
    expect(Array.from(handles, handle => handle.dataset.cropDirection)).toEqual(["up-left", "down-right"])
    expect(feature.overlay.querySelector<HTMLElement>('.◆transform-overlay-crop-frame')!.hidden).toBe(false)
    const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-crop-${direction}`)!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    expect(hasPresentationState(document.body, `transform-cropping-${direction}`)).toBe(true)
    movePointer(pointer("pointermove", {pointerId: 42, clientX: direction === "up-left" ? 110 : 90, clientY: direction === "up-left" ? 105 : 95}))
    expect(video.style.maxWidth).toBe("")
    expect(video.style.maxHeight).toBe("")
    expect(feature.boxGeometry(video, false).width).toBe(200)
    expect(feature.boxGeometry(video, false).height).toBe(100)
    movePointer(pointer("pointermove", {pointerId: 42, clientX: direction === "up-left" ? 120 : 80, clientY: direction === "up-left" ? 110 : 90}))
    expect(video.style.maxWidth).toBe("")
    expect(video.style.maxHeight).toBe("")
    expect(video.style.getPropertyValue("object-view-box")).toBe("inset(10%)")
    const masks = feature.overlay.querySelectorAll<HTMLElement>("[data-crop-mask]")
    expect(masks).toHaveLength(4)
    expect(Array.from(masks).every(mask => !mask.hidden)).toBe(true)
    const topMask = feature.overlay.querySelector<HTMLElement>('[data-crop-mask="top"]')!
    const leftMask = feature.overlay.querySelector<HTMLElement>('[data-crop-mask="left"]')!
    expect(topMask.style.height).toBe(direction === "up-left" ? "22.5%" : "12.5%")
    expect(leftMask.style.top).toBe(direction === "up-left" ? "10%" : "0%")
    expect(leftMask.style.height).toBe("90%")
    expect(editor.toHTML(true)).not.toContain("◆transform-crop-preview")
    expect(document.body.querySelector("[data-crop-mask]")).toBeNull()
    document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
    expect(video).not.toHaveClass("◆transform-crop-preview")
    expect(video.style.getPropertyPriority("object-view-box")).toBe("important")
    expect(Array.from(masks).every(mask => mask.hidden)).toBe(true)
    expect(document.body.className).not.toContain("◆transform-cropping-")
    expect(video.style.getPropertyValue("object-view-box")).toBe(`inset(${expected})`)
    expect(parseFloat(video.style.maxWidth)).toBeCloseTo(180)
    expect(parseFloat(video.style.maxHeight)).toBeCloseTo(90)
    expect(video.style.width).toBe("180px")
    expect(video.style.height).toBe("90px")
    expect(video.style.left).toBe("")
    const changed = editor.toHTML(true)
    expect(changed).not.toContain("◆")
    expect(changed).not.toContain("transform-overlay")
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it("reveals stylesheet crops during preview and cleans up a click without a drag", () => {
    const sheet = document.createElement("style")
    sheet.textContent = "video { object-view-box: inset(12% 8%) }"
    document.head.append(sheet)
    try {
      const video = targetElement("video")
      video.setAttribute("src", "movie.mp4")
      mockRect(video, {width: 200, height: 100})
      selectNode(video)
      feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
        .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
      const topMask = feature.overlay.querySelector<HTMLElement>('[data-crop-mask="top"]')!
      expect(parseFloat(topMask.style.height)).toBeCloseTo(12 / 76 * 100)
      document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
      expect(video).not.toHaveClass("◆transform-crop-preview")
      expect(video.style.getPropertyValue("object-view-box")).toBe("")
      expect(video.style.maxWidth).toBe("")
      expect(topMask.hidden).toBe(true)
    }
    finally { sheet.remove() }
  })

  it("preserves size constraints changed concurrently during a crop", () => {
    const video = targetElement("video")
    video.setAttribute("src", "movie.mp4")
    video.style.cssText = "width: 200px; height: 100px; max-width: 200px; max-height: 100px"
    mockRect(video, {width: 200, height: 100})
    selectNode(video)
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
      .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 42, clientX: 120, clientY: 110}))
    expect(video.style.maxWidth).toBe("200px")
    expect(video.style.maxHeight).toBe("100px")
    video.style.maxWidth = "170px"
    document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
    expect(video.style.maxWidth).toBe("170px")
    expect(video.style.maxHeight).toBe("100px")
    expect(video.style.getPropertyValue("object-view-box")).toBe("")
  })

  it("does not overwrite a container resized concurrently during a crop", () => {
    const picture = targetElement("picture")
    picture.innerHTML = '<img src="photo.png" style="width:200px;height:100px">'
    const image = picture.querySelector("img")!
    mockRect(picture, {width: 200, height: 100})
    mockRect(image, {width: 200, height: 100})
    selectNode(picture)
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
      .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 42, clientX: 120, clientY: 110}))
    picture.style.maxWidth = "150px"
    document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
    expect(picture.style.maxWidth).toBe("150px")
    expect(image.style.getPropertyValue("object-view-box")).toBe("")
    expect(image.style.width).toBe("200px")
    expect(document.body.className).not.toContain("◆transform-cropping-")
  })

  it.each(["Escape", "pointercancel", "disable", "replace", "concurrent", "source removal"])("cleans up a media crop gesture after %s", outcome => {
    const picture = targetElement("picture")
    picture.textContent = ""
    const image = document.createElement("img")
    image.src = "photo.png"
    image.style.setProperty("object-view-box", "inset(5%)", "important")
    picture.append(image)
    mockRect(picture, {width: 200, height: 100})
    mockRect(image, {width: 200, height: 100})
    selectNode(picture)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
    const preview = feature.overlay.querySelector<HTMLCanvasElement>("canvas")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 42, clientX: 120, clientY: 110}))
    expect(image.style.getPropertyValue("object-view-box")).toBe("inset(5%)")
    expect(image.style.getPropertyPriority("object-view-box")).toBe("important")
    image.style.color = "red"
    if(outcome === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(outcome === "disable") feature.disable()
    else {
      if(outcome === "concurrent") image.style.setProperty("object-view-box", "inset(20%)")
      if(outcome === "replace") image.replaceWith(document.createElement("img"))
      if(outcome === "source removal") image.removeAttribute("src")
      const event = pointer(outcome === "pointercancel" ? "pointercancel" : "pointermove", {pointerId: 42, clientX: 130, clientY: 120})
      if(outcome === "pointercancel") document.dispatchEvent(event)
      else movePointer(event)
    }
    expect(image.style.getPropertyValue("object-view-box")).toBe(outcome === "concurrent" ? "inset(20%)" : "inset(5%)")
    expect(image.style.color).toBe("red")
    expect(image).not.toHaveClass("◆transform-crop-preview")
    expect(image.style.getPropertyPriority("object-view-box")).toBe(outcome === "concurrent" ? "" : "important")
    expect(document.body.className).not.toContain("◆transform-cropping-")
    expect(preview.hidden).toBe(true)
    expect(preview.width).toBe(0)
    expect(document.querySelector('[class*="◆transform-scaling"]')).toBeNull()
    if(outcome === "replace") expect(picture.querySelector("img")!.hasAttribute("style")).toBe(false)
    if(outcome === "disable") expect(editor.appendix.querySelector("#◆transform-overlay")).toBeNull()
  })

  it.each(["p", "audio", "demo-widget"])("does not expose crop handles for %s", tag => {
    const target = targetElement(tag)
    mockRect(target)
    feature.startTransform(target)
    expect(feature.overlay.querySelector<HTMLElement>('.◆transform-overlay-crop-frame')!.hidden).toBe(true)
  })

  it("maps crop movement through rotation and scale, and clamps edges before they cross", () => {
    const video = targetElement("video")
    video.setAttribute("src", "movie.mp4")
    video.style.cssText = "width: 200px; height: 100px; rotate: 90deg; scale: 2; object-view-box: inset(10%)"
    mockRect(video, {width: 200, height: 100})
    selectNode(video)
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-crop-up-left")!
      .dispatchEvent(pointer("pointerdown", {pointerId: 42, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 42, clientX: 80, clientY: 140}))
    expect(feature.overlay.querySelector<HTMLElement>('[data-crop-mask="top"]')!.style.height).toBe("22.5%")
    movePointer(pointer("pointermove", {pointerId: 42, clientX: -1000, clientY: 2000}))
    expect(feature.overlay.querySelector<HTMLElement>('[data-crop-mask="top"]')!.style.height).toBe("112.4%")
    document.dispatchEvent(pointer("pointerup", {pointerId: 42}))
    expect(video.style.getPropertyValue("rotate")).toBe("90deg")
    expect(video.style.getPropertyValue("scale")).toBe("2")
  })

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

  describe.each(["p", "demo-widget"])("%s resize cancellation", tag => {
    it.each(["Escape", "pointercancel", "blur"])("accepts the first Delete activation after %s", ending => {
      const target = targetElement(tag)
      Object.assign(target.style, {width: "100px", height: "50px"})
      mockRect(target)
      captureNode(target)
      const initialStyle = target.style.cssText
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 220, clientY: 170}))
      expect(target.style.maxWidth).toBe("120px")

      if(ending === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
      else if(ending === "blur") window.dispatchEvent(new Event("blur"))
      else document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))

      expect(target.style.cssText).toBe(initialStyle)
      expect(editor.features.selection.captureSelectedElement).toBe(target)
      expect(document.body.className).not.toContain("◆transform-")
      // Keyboard/programmatic activation has no intervening pointerdown.
      feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!.click()
      expect(target.isConnected).toBe(false)
      expect(feature.target).toBeNull()
      expect(target.className).not.toContain("◆")
    })
  })

  it("suppresses an anchor drag's trailing click but accepts a fresh click on the same handle", () => {
    document.body.classList.add("ww-canvas")
    const target = targetElement()
    target.style.position = "relative"
    mockRect(target)
    selectNode(target)
    vi.spyOn($, "pointFromCoords").mockReturnValue(undefined)
    const anchor = feature.anchor
    anchor.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 130, clientY: 100}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, shiftKey: true}))
    expect(target.style.position).toBe("relative")

    // A second cancellation may have no trailing click at all.
    anchor.dispatchEvent(pointer("pointerdown", {pointerId: 4, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 4, buttons: 1, clientX: 130, clientY: 100}))
    document.dispatchEvent(pointer("pointercancel", {pointerId: 4}))
    anchor.dispatchEvent(pointer("pointerdown", {pointerId: 5}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 5}))
    anchor.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, shiftKey: true}))
    expect(target.style.position).toBe("fixed")
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
    it.each(["p", "demo-widget", "svg"])("exposes Delete for a %s item and supports undo/redo", async tag => {
      const target = tag === "svg" ? append(document.createElementNS("http://www.w3.org/2000/svg", "svg")) : targetElement(tag)
      target.innerHTML = tag === "svg" ? '<g><circle r="5"/></g><!--keep-->' : 'before<!--keep--><unfamiliar-node>keep</unfamiliar-node>'
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      const sibling = document.createElement("p")
      sibling.textContent = "Keep sibling"
      target.after(sibling)
      captureNode(target)
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const initial = editor.toHTML(true)
      const deleter = feature.overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-delete")!
      expect(deleter.hidden).toBe(false)
      expect(deleter).toHaveAccessibleName("Delete")
      expect(deleter).toHaveAttribute("part", expect.stringContaining("transform-overlay-delete-freeform"))
      expect(deleter.getRootNode()).toBe(editor.appendix)
      deleter.click()
      expect(target.isConnected).toBe(false)
      expect(sibling.isConnected).toBe(true)
      expect(feature.target).toBeNull()
      expect(target.getAttribute("class") ?? "").not.toContain("◆")
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      const deleted = editor.toHTML(true)
      expect(deleted).not.toMatch(/◆|transform-overlay/)
      expect(editor.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
      editor.doc.undo()
      await mutationsDelivered()
      expect(editor.toHTML(true)).toBe(initial)
      editor.doc.redo()
      await mutationsDelivered()
      expect(editor.toHTML(true)).toBe(deleted)
    })

    it("restores dimensions on cancellation and supports undo/redo after resizing", async () => {
      const target = targetElement("figure")
      target.id = "resized-item"
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      // These rect mocks model unscaled CSS pixels. Zoom has separate coverage.
      if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
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
        movePointer(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 180}))
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
      // These rect mocks model unscaled CSS pixels. Zoom has separate coverage.
      if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      Object.assign(target.style, {width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      selectNode(target)
      captureNode(target)
      expect(feature.target).toBe(target)
      const before = target.getBoundingClientRect()
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy}))
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
      // These rect mocks model unscaled CSS pixels. Zoom has separate coverage.
      if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
      return article
    }

    it.each([[2, 2], [1, 4], [4, 1]])("keeps the text box element-selected after dragging from %i → %i", (anchorOffset, focusOffset) => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      Object.assign(article.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      const children = Array.from(article.childNodes), content = cloneWithoutEditorMarkers(article, true).innerHTML
      $.selectRange(text, anchorOffset, text, focusOffset)
      editor.features.selection.processSelection()
      const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, altKey: true, clientX: 220, clientY: 180}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 220, clientY: 180}))
      expect($.selectedElement).toBe(article)
      expect(article.style.left).toBe("20px")
      expect(article.style.top).toBe("30px")
      expect(Array.from(article.childNodes)).toEqual(children)
      expect(cloneWithoutEditorMarkers(article, true).innerHTML).toBe(content)
    })

    it.each(["pointercancel", "Escape"])("keeps the text box selected when a move ends with %s", outcome => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      Object.assign(article.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      $.move(text, 2)
      editor.features.selection.processSelection()
      feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
        .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      movePointer(pointer("pointermove", {pointerId: 3, altKey: true, clientX: 220, clientY: 180}))
      if(outcome === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
      else document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
      expect($.selectedElement).toBe(article)
      expect(article.style.left).toBe("0px")
      expect(article.style.top).toBe("0px")
      expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
    })

    it.each(["selection", "remote replacement", "remote text edit", "local text edit"])("respects a concurrent %s while moving a text box", outcome => {
      const article = item(), text = article.querySelector("em")!.firstChild! as Text
      const neighbor = document.createElement("p")
      neighbor.textContent = "Neighbor"
      article.after(neighbor)
      Object.assign(article.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
      mockRect(article)
      $.move(text, 2)
      editor.features.selection.processSelection()
      feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
        .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      movePointer(pointer("pointermove", {pointerId: 3, altKey: true, clientX: 220, clientY: 180}))
      if(outcome === "selection") $.move(neighbor.firstChild!, 3)
      else if(outcome === "local text edit") text.insertData(0, "local ")
      else {
        editor.doc.syncFromDOM()
        const shared = mode === "canvas" ? editor.doc.body : (editor.doc.body.get(0) as Y.XmlElement).get(0) as Y.XmlElement
        const target = shared.get(0) as Y.XmlElement
        editor.doc.doc.transact(() => {
          if(outcome === "remote replacement") {
            const replacement = target.clone()
            shared.delete(0, 1); shared.insert(0, [replacement])
          }
          else (((target.get(0) as Y.XmlElement).get(1) as Y.XmlElement).get(0) as Y.XmlText).insert(0, "remote ")
        }, "remote-test")
      }
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
      if(outcome === "selection") {
        expect(document.getSelection()!.anchorNode).toBe(neighbor.firstChild)
        expect(document.getSelection()!.anchorOffset).toBe(3)
      }
      else if(outcome === "remote replacement") {
        expect(article.isConnected).toBe(false)
        expect(document.getSelection()!.anchorNode).not.toBe(text)
        expect(hasPresentationState(article, "transform-target")).toBe(false)
      }
      else {
        expect($.selectedElement).toBe(article)
        expect(text.data).toBe(outcome === "local text edit" ? "local world" : "remote world")
      }
      expect(neighbor.textContent).toBe("Neighbor")
      expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
    })

    it("selects the whole text box when its border is clicked without dragging", () => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      mockRect(article)
      $.move(text, 2)
      editor.features.selection.processSelection()
      feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
        .dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
    })

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
      expect(cloneWithoutEditorMarkers(document.getElementById("deleted-root")!, true).innerHTML).toBe(contents.innerHTML)
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
        expect(edge.hasAttribute("title")).toBe(false)
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
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 240, clientY: 180}))
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
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, altKey: true, clientX: 220, clientY: 180}))
      document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 220, clientY: 180}))
      expect(article.style.cssText).not.toBe(before)
      expect(feature.target).toBe(article)
      if(control === "scale-right") {
        expect($.selectedElement).toBe(article)
        expect(article.style.width).toBe("100px"); expect(article.style.height).toBe("50px")
        expect(article.style.left).toBe("20px"); expect(article.style.top).toBe("30px")
      }
      else {
        expect($.selectedElement).toBe(article)
        expect($.isElementSelection).toBe(true)
      }
    })

    it("shows controls for text, empty, gap, virtual-list and cell selections without selecting the item", () => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      mockRect(article)
      const check = () => {
        editor.features.selection.processSelection(undefined, {scrollIntoView: false})
        expect(feature.target).toBe(article)
        expect(hasPresentationState(article, "transform-target")).toBe(true)
        expect(hasPresentationState(article, "element-selected")).toBe(false)
        expect(feature.overlay).not.toHaveAttribute("visibility", "hidden")
        expect(feature.overlay.getAttribute("part")?.split(/\s+/)).toContain("transform-overlay-content-selected")
      }
      $.selectRange(text, 1, text, 4); check()
      expect(document.getSelection()?.toString()).toBe("orl")
      expect($.isTextSelection).toBe(true)
      $.move(article.querySelector("p:empty")!); check()
      expect($.isEmptySelection).toBe(true)
      $.selectGap(article.querySelector("hr")!, "after"); check()
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

    it.each(["scale-right", "scale-down-right", "mover", "delete", "arranger", "orderer", "caption", "anchor"])("element-selects on the grey frame's %s affordance", control => {
      const article = item(), text = article.querySelector("em")!.firstChild!
      mockRect(article)
      $.selectRange(text, 1, text, 4)
      editor.features.selection.processSelection()
      expect(feature.overlay.getAttribute("part")?.split(/\s+/)).toContain("transform-overlay-content-selected")
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${control}`)!
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      expect($.selectedElement).toBe(article)
      expect(hasPresentationState(article, "element-selected")).toBe(true)
      expect(feature.overlay.getAttribute("part")?.split(/\s+/)).not.toContain("transform-overlay-content-selected")
      document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
      expect($.selectedElement).toBe(article)
      expect(editor.toHTML(true)).not.toContain("◆")
    })

    it("frames the direct item for nested node and capture selections, then follows another item", () => {
      const article = item(), paragraph = article.querySelector("p")!, widget = article.querySelector("demo-widget")!
      selectNode(paragraph)
      expect($.selectedElement).toBe(paragraph)
      expect(feature.target).toBe(article)
      expect(feature.overlay.getAttribute("part")).not.toContain("transform-overlay-content-selected")
      captureNode(widget)
      expect(editor.features.selection.captureSelectedElement).toBe(widget)
      expect(feature.target).toBe(article)
      expect(feature.overlay.getAttribute("part")).not.toContain("transform-overlay-content-selected")
      const next = document.createElement("p"); next.textContent = "Next"
      article.after(next)
      editor.features.selection.selectDropRange((() => { const range = document.createRange(); range.setStart(next.firstChild!, 1); range.collapse(true); return range })())
      expect(feature.target).toBe(next)
      expect(hasPresentationState(article, "transform-target")).toBe(false)
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
      expect(hasPresentationState(article, "transform-target")).toBe(false)
    })
  })

  it("keeps controls hidden for text inside ordinary document content", () => {
    const paragraph = targetElement()
    $.move(paragraph.firstChild!, 2)
    editor.features.selection.processSelection()
    expect(feature.target).toBeNull()
    expect(hasPresentationState(paragraph, "element-selected")).toBe(false)
  })

  it("starts from ordinary element selection", () => {
    const target = targetElement()
    selectNode(target)

    expect(feature.target).toBe(target)
    expect(hasPresentationState(target, "transform-target")).toBe(true)
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

  it("keeps the rotated top-right delete control in the viewport even when rotation still fits above", () => {
    const target = targetElement()
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    Object.assign(target.style, {width: "240px", height: "100px"})
    target.style.setProperty("rotate", "-30deg")
    let top = 35
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => new DOMRect(50, top, 257.85, 206.6))
    feature.startTransform(target)
    expect(feature.overlay.getAttribute("part")).toContain("transform-overlay-at-top")
    top = 100
    feature.updateInfo()
    expect(feature.overlay.getAttribute("part")).not.toContain("transform-overlay-at-top")
  })

  it("flips the rotated top-left copyright control inward with the other top controls", () => {
    const target = targetElement()
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    Object.assign(target.style, {width: "240px", height: "100px"})
    target.style.setProperty("rotate", "30deg")
    let top = 35
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => new DOMRect(50, top, 257.85, 206.6))
    feature.startTransform(target)
    expect(feature.overlay.getAttribute("part")).toContain("transform-overlay-at-top")
    top = 100
    feature.updateInfo()
    expect(feature.overlay.getAttribute("part")).not.toContain("transform-overlay-at-top")
  })

  it("clears the target and appendix state when selection is deselected", () => {
    const target = targetElement()
    selectNode(target)
    $.selectDocumentStart()
    editor.features.selection.processSelection()

    expect(feature.target).toBeNull()
    expect(hasPresentationState(target, "transform-target")).toBe(false)
    expect(feature.overlay).toHaveAttribute("visibility", "hidden")
  })

  it("clears a disconnected target without touching authored children", async () => {
    const target = targetElement()
    const child = target.appendChild(document.createElement("custom-content"))
    selectNode(target)
    target.remove()
    await Promise.resolve()

    expect(feature.target).toBeNull()
    expect(hasPresentationState(target, "transform-target")).toBe(false)
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

      expect(feature.boxGeometry(target).styles.width).toBe("2000px")
      expect(feature.boxGeometry(target).styles.height).toBe("96px")
      expect(feature.overlay.style.width).toBe("")
      expect(feature.overlay.style.height).toBe("")
      expect(feature.overlay.getAttribute("part")).toContain("anchor-control-")
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
    expect(caret?.getAttribute("part")).toContain("selection-caret-capture")
    expect(hasPresentationState(target, "transform-target")).toBe(false)
  })

  it.each([
    {mode: "canvas", capture: false}, {mode: "canvas", capture: true},
    {mode: "slides", capture: false}, {mode: "slides", capture: true},
  ] as const)("rotates the $mode selection frame with its controls (capture: $capture)", ({mode, capture}) => {
    const target = targetElement(capture ? "demo-widget" : "p")
    document.body.replaceChildren(target)
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    if(mode === "slides") editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
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
    if(mode === "canvas") editor.features.canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    else editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "zoom-in"})
    expectGeometry()
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
    // Happy DOM cannot resolve anchor() or anchor-size(). The live target box
    // supplies that frame here; the native fixture checks the rendered frame.
    const geometry = overlay.style.width ? overlay.style : feature.boxGeometry(feature.target!).styles
    const matrix = new DOMMatrix(geometry.transform)
    const x = parseFloat(feature.anchor.style.left) - parseFloat(geometry.width) / 2
    const y = parseFloat(feature.anchor.style.top) - parseFloat(geometry.height) / 2
    expect(parseFloat(geometry.left) + parseFloat(geometry.width) / 2 + matrix.a * x + matrix.c * y).toBeCloseTo(left)
    expect(parseFloat(geometry.top) + parseFloat(geometry.height) / 2 + matrix.b * x + matrix.d * y).toBeCloseTo(top)
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
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 120, clientY: 100}))

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
    expect(target.style.top).toBe("40px")
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
    const minimap = vi.spyOn(editor.features.canvas, "setMinimapRefreshPaused")
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 19, clientX: 150, clientY: 125}))
    expect(minimap).toHaveBeenLastCalledWith(true)
    movePointer(pointer("pointermove", {pointerId: 19, buttons: 1, clientX: 170, clientY: 125}))
    tick()
    expect(pan).toHaveBeenLastCalledWith({x: 170, y: 125})
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
    expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
    expect(minimap).toHaveBeenLastCalledWith(false)
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
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 210, clientY: 160}))
      await mutationsDelivered()
      editor.doc.syncFromDOM()
      await new Promise(resolve => setTimeout(resolve, 550))
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 230, clientY: 180}))
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

  it.each(["canvas", "slides"].flatMap(mode => ["p", "demo-widget", "svg"].map(tag => ({mode, tag}))))("raises a $mode $tag on frame activation with one style mutation and one undo step", async ({mode, tag}) => {
    document.body.replaceChildren()
    const target = tag === "svg" ? append(document.createElementNS("http://www.w3.org/2000/svg", "svg")) : targetElement(tag)
    const sibling = targetElement("section")
    target.innerHTML = tag === "svg" ? '<g><circle r="5"/></g><!--keep-->' : '<unfamiliar-node>keep</unfamiliar-node><!--keep-->'
    const nested = target.firstElementChild as HTMLElement | SVGElement
    nested.style.cssText = "position: absolute; z-index: 77"
    document.body.className = `ww-${mode}`
    if(mode === "slides") {
      const viewport = document.createElement("div"), slide = document.createElement("section")
      viewport.className = "ww-slides-viewport"; slide.className = "ww-slide"
      viewport.append(slide); document.body.append(viewport); slide.append(target, sibling)
    }
    Object.assign(target.style, {position: "absolute", left: "20px", top: "30px"})
    Object.assign(sibling.style, {position: "absolute", zIndex: "5"})
    mockRect(target)
    selectNode(target)
    await mutationsDelivered()
    const nodes = Array.from(document.body.childNodes)
    const content = target.innerHTML
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const startingHTML = editor.toHTML(true)
    const mover = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
    const siblingStyle = sibling.getAttribute("style")
    const observer = new MutationObserver(() => {})
    observer.observe(target.parentElement!, {attributes: true, subtree: true, attributeFilter: ["style"]})

    mover.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
    expect(observer.takeRecords().map(record => record.target)).toEqual([target])
    observer.disconnect()
    expect(Number(target.style.zIndex)).toBeGreaterThan(Number(sibling.style.zIndex))
    expect(target.style.left).toBe("20px")
    expect(target.style.top).toBe("30px")
    expect(target.innerHTML).toBe(content)
    expect(Array.from(document.body.childNodes)).toEqual(nodes)
    document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 100, clientY: 100}))
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const finalHTML = editor.toHTML(true)
    expect(finalHTML).not.toBe(startingHTML)
    expect(target.style.zIndex).toBe("6")
    expect(sibling.getAttribute("style")).toBe(siblingStyle)
    expect(finalHTML).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(startingHTML)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(finalHTML)
  })

  it.each(["canvas", "slides"].flatMap(mode => [
    {forward: true, edge: true, cycle: true, selected: 1, expected: [10, 101, 100]},
    {forward: false, edge: true, cycle: true, selected: 1, expected: [10, 9, 100]},
    {forward: true, edge: false, cycle: false, selected: 1, expected: [10, 100, 50]},
    {forward: false, edge: false, cycle: false, selected: 1, expected: [50, 10, 100]},
    {forward: true, edge: false, cycle: true, selected: 2, expected: [10, 50, 9]},
    {forward: false, edge: false, cycle: true, selected: 0, expected: [101, 50, 100]},
  ].map(scenario => ({mode, ...scenario}))))("scans once for $mode frame stacking (forward=$forward, edge=$edge, cycle=$cycle)", ({mode, forward, edge, cycle, selected, expected}) => {
    document.body.replaceChildren()
    document.body.className = `ww-${mode}`
    const items = [targetElement(), targetElement(), targetElement()]
    items.forEach((item, i) => Object.assign(item.style, {position: "absolute", zIndex: String([10, 50, 100][i])}))
    if(mode === "slides") {
      const viewport = document.createElement("div"), slide = document.createElement("section")
      viewport.className = "ww-slides-viewport"; slide.className = "ww-slide"
      viewport.append(slide); document.body.append(viewport); slide.append(...items)
    }
    vi.spyOn(editor.doc, "beginUndoGroup").mockReturnValue(() => {})
    vi.spyOn(feature, "updateInfo").mockImplementation(() => {})
    const read = vi.spyOn(globalThis, "getComputedStyle")
    feature.moveZ(items[selected], forward, edge, cycle)
    expect(read.mock.calls).toHaveLength(items.length)
    expect(new Set(read.mock.calls.map(([element]) => element))).toEqual(new Set(items))
    expect(items.map(item => Number(item.style.zIndex))).toEqual(expected)
  })

  it.each(["canvas", "slides"])("keeps the last moved %s item in front throughout dragging and subsequent move starts", mode => {
    document.body.replaceChildren()
    document.body.className = `ww-${mode}`
    const first = targetElement(), second = targetElement("section")
    if(mode === "slides") {
      const viewport = document.createElement("div"), slide = document.createElement("section")
      viewport.className = "ww-slides-viewport"; slide.className = "ww-slide"
      viewport.append(slide); document.body.append(viewport); slide.append(first, second)
    }
    for(const target of [first, second]) {
      Object.assign(target.style, {position: "absolute", left: "0px", top: "0px"})
      mockRect(target)
    }
    selectNode(first)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0, clientX: 100, clientY: 100}))
    feature.handleMoveDrag(new MouseEvent("mousemove", {buttons: 1, clientX: 120, clientY: 100}))
    feature.handleMoveEnd()
    expect(Number(first.style.zIndex)).toBeGreaterThan(Number(second.style.zIndex))
    expect(first.style.left).toBe("20px")
    selectNode(second)
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0}))
    expect(Number(second.style.zIndex)).toBeGreaterThan(Number(first.style.zIndex))
    feature.handleMoveEnd()
    const style = second.style.cssText
    feature.handleMoveStart(new MouseEvent("mousedown", {button: 0}))
    feature.handleMoveEnd()
    expect(second.style.cssText).toBe(style)
  })

  it.each((["canvas", "slides"] as const).flatMap(mode => ["p", "img", "demo-widget"].map(tag => ({mode, tag}))))("keeps a released $tag drag in $mode when capture loss arrives before pointerup", async ({mode, tag}) => {
    const target = targetElement(tag)
    target.id = "quick-drag"
    document.body.className = `ww-${mode}`
    if(mode === "slides") {
      const viewport = document.createElement("div"), slide = document.createElement("section")
      viewport.className = "ww-slides-viewport"; slide.className = "ww-slide"
      viewport.append(slide); document.body.append(viewport); slide.append(target)
      flushAnimationFrame()
      editor.features.slides.actions.navigateSlides({type: "navigateSlides", operation: "actual-size"})
    }
    Object.assign(target.style, {position: "absolute", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const initial = editor.toHTML(true)
    const handle = feature.overlay.querySelector<HTMLElement>(".◆transform-overlay-edge")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 17, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 17, buttons: 1, clientX: 400, clientY: 250}))
    expect(target.style.left).toBe("300px")
    expect(target.style.top).toBe("160px")
    handle.dispatchEvent(pointer("lostpointercapture", {pointerId: 17, buttons: 0, clientX: 400, clientY: 250}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 17, clientX: 400, clientY: 250}))
    expect(target.style.left).toBe("300px")
    expect(target.style.top).toBe("160px")
    expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const moved = editor.toHTML(true)
    expect(moved).not.toMatch(/◆|transform-overlay/)
    expect(editor.doc.body.toString()).not.toMatch(/◆|transform-overlay/)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(initial)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(moved)
  })

  it.each(["held", "pointercancel", "changed", "removed", "reparented", "other-pointer"])("handles %s during a quick move without committing an invalid gesture", scenario => {
    const target = targetElement("img")
    document.body.className = "ww-canvas"
    Object.assign(target.style, {position: "absolute", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>(".◆transform-overlay-edge")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 17, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 17, buttons: 1, clientX: 400, clientY: 250}))
    if(scenario === "changed") target.style.top = "777px"
    else if(scenario === "removed") target.remove()
    else if(scenario === "reparented") append(document.createElement("section")).append(target)
    handle.dispatchEvent(pointer(scenario === "pointercancel" ? "pointercancel" : "lostpointercapture", {
      pointerId: scenario === "other-pointer" ? 99 : 17, buttons: scenario === "held" ? 1 : 0,
    }))
    if(scenario === "other-pointer") {
      expect(target.style.left).toBe("300px")
      document.dispatchEvent(pointer("pointerup", {pointerId: 17}))
    }
    else {
      expect(target.style.left).toBe("0px")
      expect(target.style.top).toBe(scenario === "changed" ? "777px" : "0px")
    }
    expect(hasPresentationState(document.body, "transform-moving")).toBe(false)
  })

  it.each(["document", "slides", "nested-canvas", "right-button", "locked", "disconnected"])("does not automatically raise a move in %s", scenario => {
    const target = targetElement(), sibling = targetElement()
    Object.assign(target.style, {position: "absolute", zIndex: "1"})
    Object.assign(sibling.style, {position: "absolute", zIndex: "2"})
    if(scenario !== "document") document.body.classList.add(scenario === "slides" ? "ww-slides" : "ww-canvas")
    if(scenario === "nested-canvas") {
      const wrapper = append(document.createElement("section"))
      wrapper.append(target, sibling)
    }
    mockRect(target)
    selectNode(target)
    if(scenario === "locked") vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    if(scenario === "disconnected") target.remove()
    feature.handleMoveStart(new MouseEvent("mousedown", {button: scenario === "right-button" ? 2 : 0}))
    feature.handleMoveEnd()
    expect(target.style.zIndex).toBe("1")
    expect(sibling.style.zIndex).toBe("2")
  })

  it.each(["canvas", "slides"])("keeps %s activation on cancellation and preserves a concurrent stacking change", mode => {
    document.body.replaceChildren()
    document.body.className = `ww-${mode}`
    const target = targetElement(), sibling = targetElement()
    if(mode === "slides") {
      const viewport = document.createElement("div"), slide = document.createElement("section")
      viewport.className = "ww-slides-viewport"; slide.className = "ww-slide"
      viewport.append(slide); document.body.append(viewport); slide.append(target, sibling)
    }
    Object.assign(target.style, {position: "absolute", zIndex: "1", left: "0px", top: "0px"})
    Object.assign(sibling.style, {position: "absolute", zIndex: "2"})
    mockRect(target)
    selectNode(target)
    const mover = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
    mover.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 120, clientY: 100}))
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(target.style.zIndex).toBe("3")
    expect(sibling.style.zIndex).toBe("2")
    expect(target.style.left).toBe("0px")
    expect(hasPresentationState(document.body, "transform-moving")).toBe(false)

    mover.dispatchEvent(pointer("pointerdown", {pointerId: 4, clientX: 100, clientY: 100}))
    target.style.zIndex = "9"
    document.dispatchEvent(pointer("pointercancel", {pointerId: 4}))
    expect(target.style.zIndex).toBe("9")
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
    const target = targetElement("figure")
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!

    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 220, clientY: 150}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3, clientX: 220, clientY: 150}))

    expect(target.style.width).toBe("120px")
    expect(target.style.height).toBe("50px")
    expect(target.style.left).toBe("0px")
    expect(target.style.top).toBe("0px")
    expect(hasPresentationState(target, "transform-target")).toBe(true)
  })

  it("resizes a canvas picture's figure and cancels when its image is replaced", () => {
    document.body.innerHTML = '<figure style="width:200px"><picture style="width:200px;height:100px"><img style="width:200px;height:100px"></picture><!--keep--><figcaption>Keep caption</figcaption></figure>'
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    const figure = document.querySelector("figure")!, picture = figure.querySelector("picture")!, image = picture.querySelector("img")!
    mockRect(figure, {width: 200, height: 124})
    const original = [figure, picture, image].map(element => element.style.cssText)
    captureNode(figure)
    const handle = feature.overlay.querySelector<HTMLElement>('[data-resize-direction="down-right"]')!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 300, clientY: 224}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 400, clientY: 274, shiftKey: true, altKey: true}))
    expect(figure.style.width).toBe("300px")
    expect(picture.style.width).toBe("200px")
    expect(image.style.width).toBe("200px")
    expect(figure.style.getPropertyValue("scale")).toBe("")

    const replacement = document.createElement("img")
    replacement.style.width = "175px"
    image.replaceWith(replacement)
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect([figure, picture, image].map(element => element.style.cssText)).toEqual(original)
    expect(picture.firstElementChild).toBe(replacement)
    expect(replacement.style.width).toBe("175px")
    expect(figure.querySelector("figcaption")?.textContent).toBe("Keep caption")
    expect(hasPresentationState(document.body, "transform-scaling-nwse")).toBe(false)
  })

  it("keeps the iframe transformation frame at the same size across website zoom levels", () => {
    document.body.innerHTML = '<section style="scale: 1.5"><iframe title="Activity" style="width: 320px; height: 180px; box-sizing: border-box"></iframe></section>'
    const target = document.querySelector("iframe")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 120, 480, 270))
    captureNode(target)
    expect(feature.target).toBe(target)
    const selectionType = {localName: "iframe", namespaceURI: target.namespaceURI}
    for(const zoom of ["50%", "200%", null]) {
      editor.features.manipulation.actions.setSelectedElementStyles({type: "setSelectedElementStyles", selectionType, styles: {zoom}})
      feature.updateInfo()
      expect(feature.overlay.style.width).toBe("320px")
      expect(feature.overlay.style.height).toBe("180px")
      expect(feature.overlay.style.transform).toBe("matrix(1.5, 0, 0, 1.5, 0, 0)")
    }
  })

  it("refreshes measured iframe frames and selection outlines after a non-bubbling scroll", () => {
    document.body.innerHTML = '<section style="overflow: auto"><iframe title="Activity" style="width: 320px; height: 180px; zoom: 1.25"></iframe></section>'
    const target = document.querySelector<HTMLIFrameElement>("iframe")!
    let rect = new DOMRect(100, 120, 400, 225)
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => rect)
    captureNode(target)

    const caret = editor.features.selection.selectionCaret!
    const overlay = feature.overlay
    expect(overlay.style.left).toBe("100px")
    expect(overlay.style.top).toBe("120px")
    expect(caret.style.left).toBe(overlay.style.left)
    expect(caret.style.top).toBe(overlay.style.top)
    flushAnimationFrame()

    rect = new DOMRect(60, 35, 400, 225)
    // Scroll events do not bubble; the document capture listener must refresh
    // measured geometry while the iframe remains selected and idle.
    target.parentElement!.dispatchEvent(new Event("scroll"))
    flushAnimationFrame()

    expect(overlay.style.left).toBe("60px")
    expect(overlay.style.top).toBe("35px")
    expect(caret.style.left).toBe("60px")
    expect(caret.style.top).toBe("35px")
  })

  it.each([30, -20])("resizes an iframe figure vertically by %s pixels, preserving its DOM and undo/redo", async dy => {
    document.body.innerHTML = '<figure><!--keep--><iframe title="Activity" height="180" src="about:blank"></iframe><figcaption>Keep caption</figcaption></figure>'
    const target = document.querySelector("iframe")!
    const figure = document.querySelector("figure")!
    mockRect(target, {width: 320, height: 180})
    mockRect(figure, {width: 320, height: 230})
    selectNode(target)
    expect(feature.target).toBe(figure)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(target).toHaveAttribute("sandbox", "allow-scripts")
    expect(editor.doc.body.toString()).toContain('sandbox="allow-scripts"')
    const original = editor.toHTML(true)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 420, clientY: 280}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 420, clientY: 280 + dy, altKey: true}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    await mutationsDelivered()
    editor.doc.syncFromDOM()

    expect(figure.style.height).toBe(`${230 + dy}px`)
    expect(target.style.height).toBe("")
    expect(target.style.position).toBe("")
    expect(target.getAttribute("height")).toBe("180")
    expect(target.getAttribute("title")).toBe("Activity")
    expect(target.parentElement!.innerHTML).toContain("<!--keep-->")
    expect(target.nextElementSibling!.textContent).toBe("Keep caption")
    const resized = editor.toHTML(true)
    expect(resized).not.toContain("◆")
    expect(editor.doc.body.toString()).toContain(`height: ${230 + dy}px`)
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(resized)
  })

  it("restores iframe height on cancellation while preserving concurrent changes", () => {
    const target = targetElement("iframe") as HTMLIFrameElement
    target.style.height = "180px"
    mockRect(target, {width: 320, height: 180})
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 420, clientY: 280}))
    movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: 420, clientY: 310, altKey: true}))
    expect(target.style.height).toBe("210px")
    target.title = "Updated activity"
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(target.style.height).toBe("180px")
    expect(target.style.maxHeight).toBe("")
    expect(target.title).toBe("Updated activity")
    expect(hasPresentationState(document.body, "transform-scaling-nwse")).toBe(false)
  })

  it.each([
    {tag: "audio", captioned: false}, {tag: "audio", captioned: true},
    {tag: "video", captioned: false}, {tag: "video", captioned: true},
  ])("Shift-resizes a $tag player in layout (captioned=$captioned)", ({tag, captioned}) => {
    document.body.innerHTML = captioned
      ? `<figure style="max-height:120px"><${tag} controls></${tag}><!--keep--><figcaption>Keep caption</figcaption></figure>`
      : `<${tag} controls></${tag}>`
    const player = document.querySelector<HTMLMediaElement>(tag)!
    const target = captioned ? document.querySelector("figure")! : player
    const playerHeight = tag === "video" ? 100 : 54
    if(tag === "video") Object.defineProperties(player, {videoWidth: {value: 200}, videoHeight: {value: 100}})
    mockRect(player, {width: 200, height: playerHeight})
    if(captioned) mockRect(target, {width: 220, height: playerHeight + 32})
    if(captioned) captureNode(player)
    else selectNode(target)
    expect(feature.target).toBe(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 160, clientY: 130, shiftKey: true, altKey: true}))

    if(captioned) expect(parseFloat(target.style.width)).toBeLessThan(220)
    else {
      expect(parseFloat(player.style.width)).toBeLessThan(200)
      expect(parseFloat(player.style.width)).toBeGreaterThanOrEqual(tag === "video" ? 140 : 100)
      expect(player.style.height).toBe("auto")
      expect(player.style.getPropertyValue("aspect-ratio") || "").toMatch(tag === "video" ? /^auto 2(?: \/ 1)?$/ : /^$/)
    }
    expect(player.style.getPropertyValue("scale") || "").toBe("")
    expect(target.style.getPropertyValue("scale") || "").toBe("")
    if(captioned) {
      expect(target.style.maxHeight).toBe("none")
      expect(player.hasAttribute("style")).toBe(false)
      expect(target.querySelector("figcaption")?.textContent).toBe("Keep caption")
    }
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    expect(player.hasAttribute("style")).toBe(false)
    expect(target.style.maxHeight).toBe(captioned ? "120px" : "")
  })

  it("resizes the wrapper of a mixed media figure without scaling its player", () => {
    document.body.innerHTML = '<figure><p>Leading content</p><!--keep--><audio controls></audio><figcaption>Caption</figcaption></figure>'
    const figure = document.querySelector("figure")!, player = figure.querySelector("audio")!
    const children = [...figure.childNodes]
    mockRect(figure, {width: 260, height: 150})
    selectNode(figure)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 160, clientY: 130, shiftKey: true, altKey: true}))

    expect(parseFloat(figure.style.width)).toBeLessThan(260)
    expect(figure.style.getPropertyValue("scale") || "").toBe("")
    expect(player.hasAttribute("style")).toBe(false)
    expect([...figure.childNodes]).toEqual(children)
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
  })

  it.each([false, true])("clamps the figure to its child's bounds and box chrome (captioned=%s)", captioned => {
    document.body.innerHTML = `<figure style="box-sizing:border-box; padding:10px; border:2px solid">
      <div style="min-width:120px; max-width:260px; min-height:50px; max-height:140px; margin:4px; padding:3px; border:1px solid"></div>
      ${captioned ? "<figcaption>Caption</figcaption>" : ""}</figure>`
    const figure = document.querySelector("figure")!, child = figure.firstElementChild as HTMLElement
    const original = child.getAttribute("style")
    const caption = figure.querySelector("figcaption")
    if(caption) mockRect(caption, {width: 200, height: 24})
    mockRect(figure, {width: 220, height: 120})
    captureNode(child)
    expect(feature.target).toBe(figure)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 220, clientY: 120}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 10, clientY: 10, shiftKey: true, altKey: true}))
    expect(figure.style.width).toBe("160px")
    expect(figure.style.height).toBe(`${90 + (captioned ? 24 : 0)}px`)
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 600, clientY: 600, shiftKey: true, altKey: true}))
    expect(figure.style.width).toBe("300px")
    expect(figure.style.height).toBe(`${180 + (captioned ? 24 : 0)}px`)
    expect(child.getAttribute("style")).toBe(original)
    document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
  })

  describe.each(["figure", "demo-widget"])("static %s resizing", tag => {
    it.each(["up-left", "up-right", "down-left", "down-right", "up-up", "right-right", "down-down", "left-left"])("keeps normal flow when dragging %s", direction => {
      const target = targetElement(tag)
      Object.assign(target.style, {width: "100px", height: "50px"})
      if(tag === "demo-widget") target.style.position = "static"
      mockRect(target)
      if(tag === "demo-widget") captureNode(target)
      else selectNode(target)
      const initialPosition = target.style.position
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
      // Exercise resize geometry for directions hidden by the current document UI.
      handle.hidden = false
      const dx = direction.includes("left") ? 20 : direction.includes("right") ? -20 : 0
      const dy = direction.includes("up") ? 10 : direction.includes("down") ? -10 : 0

      for(const modifiers of [{}, {ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true}]) {
        handle.hidden = false
        handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
        movePointer(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy, ...modifiers}))
        expect(target.style.position).toBe(initialPosition)
        for(const property of ["left", "top", "right", "bottom"]) expect(target.style.getPropertyValue(property)).toBe("")
        if(tag === "figure") {
          if(dx) expect(parseFloat(target.style.width)).toBeLessThan(100)
          else expect(target.style.width).toBe("100px")
          if(dy) expect(parseFloat(target.style.height)).toBeLessThan(50)
          else expect(target.style.height).toBe("50px")
          expect(target.style.getPropertyValue("scale") || "").toBe("")
        }
        else if(modifiers.shiftKey) expect(target.style.scale).not.toBe("")
        else {
          if(dx) expect(parseFloat(target.style.maxWidth)).toBeLessThan(100)
          else expect(target.style.maxWidth).toBe("")
          if(dy) expect(parseFloat(target.style.maxHeight)).toBeLessThan(50)
          else expect(target.style.maxHeight).toBe("")
        }
        document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
        expect(target.style.position).toBe(initialPosition)
        expect(target.style.width).toBe("100px")
        expect(target.style.height).toBe("50px")
        expect(target.style.maxWidth).toBe("")
        expect(target.style.maxHeight).toBe("")
        expect(hasPresentationState(document.body, "transform-scaling-ew") || hasPresentationState(document.body, "transform-scaling-ns") || hasPresentationState(document.body, "transform-scaling-nwse") || hasPresentationState(document.body, "transform-scaling-nesw")).toBe(false)
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
      const target = targetElement(captured ? "demo-widget" : "figure")
      const child = target.appendChild(document.createElement(captured ? "unfamiliar-content" : "mark"))
      target.appendChild(document.createComment("keep"))
      target.setAttribute("data-authored", "keep")
      Object.assign(target.style, {position: "relative", width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
      if(captured) captureNode(target)
      else selectNode(target)
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${edge}-${edge}`)!
      // Exercise resize geometry for directions hidden by the current document UI.
      handle.hidden = false

      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: x, clientY: y}))
      movePointer(pointer("pointermove", {pointerId: 3, buttons: 1, clientX: x + dx, clientY: y + dy}))
      expect(hasPresentationState(document.body, `transform-scaling-${dx === 13 ? "ns" : "ew"}`)).toBe(true)
      document.dispatchEvent(pointer("pointerup", {pointerId: 3}))

      expect(target.style.maxWidth).toBe(captured ? width : "")
      expect(target.style.maxHeight).toBe(captured ? height : height ? "none" : "")
      expect(target.style.width).toBe(captured ? "100px" : width || "100px")
      expect(target.style.height).toBe(captured ? "50px" : height || "50px")
      expect(target.style.left).toBe("0px")
      expect(target.style.top).toBe("0px")
      expect(target.style.position).toBe("relative")
      expect(target.firstElementChild).toBe(child)
      expect(target.lastChild?.nodeType).toBe(Node.COMMENT_NODE)
      expect(target).toHaveAttribute("data-authored", "keep")
      expect(hasPresentationState(target, "element-selected")).toBe(true)
      expect(editor.features.selection.captureSelectedElement).toBe(captured ? target : null)
      expect(hasPresentationState(document.body, "transform-scaling-ew") || hasPresentationState(document.body, "transform-scaling-ns")).toBe(false)
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
    const target = targetElement("div")
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    // Exercise resize geometry for directions hidden by the current document UI.
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 213, clientY: 115, ...modifiers}))
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
    // Exercise resize geometry for directions hidden by the current document UI.
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 115}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 220, clientY: 115}))
    expect(target.style.maxWidth).toBe("120px")
    target.style.color = "red"
    if(cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(cancellation === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 3}))
    else {
      target.remove()
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 230, clientY: 115}))
    }
    expect(target.style.width).toBe("100px")
    expect(target.style.maxWidth).toBe("")
    expect(target.style.color).toBe("red")
    expect(hasPresentationState(document.body, "transform-scaling-ew") || hasPresentationState(document.body, "transform-scaling-ns")).toBe(false)
  })

  it.each(["horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl"])("maps resize edges to physical maxima in %s", writingMode => {
    const target = targetElement("demo-widget")
    Object.assign(target.style, {writingMode, width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const resize = (edge: string, dx: number, dy: number) => {
      const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${edge}-${edge}`)!
      // Exercise resize geometry for directions hidden by the current document UI.
      handle.hidden = false
      handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
      movePointer(pointer("pointermove", {pointerId: 3, clientX: 200 + dx, clientY: 150 + dy}))
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
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 210, clientY: 160}))
    await mutationsDelivered()
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 220, clientY: 170}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    await mutationsDelivered()

    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.maxHeight).toBe("70px")
    expect(target.style.width).toBe("")
    expect(target.style.height).toBe("")
    expect(target.getBoundingClientRect().width).toBe(120)
    expect(target.style.position).toBe("")
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
    // Exercise resize geometry for directions hidden by the current document UI.
    handle.hidden = false
    const drag = () => {
      handle.hidden = false
      handle.dispatchEvent(pointer("pointerdown", {pointerId:3, clientX:200, clientY:125}))
      movePointer(pointer("pointermove", {pointerId:3, clientX:240, clientY:125}))
    }
    drag()
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("140px")
    document.dispatchEvent(pointer("pointercancel", {pointerId:3}))
    expect(target.getAttribute("style")).toBe(initial)
    drag()
    document.dispatchEvent(pointer("pointerup", {pointerId:3}))
    await mutationsDelivered()
    const resized = target.getAttribute("style")
    expect(resized).toContain("--ww-float-size: 140px")
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
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 130}))
    target.style.maxWidth = "90px"
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 170, clientY: 120}))

    expect(target.style.maxWidth).toBe("90px")
    expect(target.style.maxHeight).toBe("50px")
    expect(target.style.getPropertyPriority("max-height")).toBe("important")
    expect(hasPresentationState(document.body, "transform-scaling-nwse")).toBe(false)
  })

  it("constrains an SVG root without altering its authored dimensions or children", () => {
    const target = append(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    target.setAttribute("width", "100")
    target.setAttribute("height", "50")
    const child = target.appendChild(document.createElementNS(target.namespaceURI, "rect"))
    mockRect(target)
    selectNode(target)
    const handle = feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right-right")!
    // Exercise resize geometry for directions hidden by the current document UI.
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 150}))
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
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 464, clientY: 424}))
    document.dispatchEvent(pointer("pointerup", {pointerId: 3}))
    expect(target.style.width).toBe("364px")
    expect(target.style.height).toBe("324px")
    expect(target).toHaveAttribute("preserveAspectRatio", "none")
    expect(target.querySelector("rect")).toHaveAttribute("width", "240")
    expect($.selectedElement).toBe(target)
  })

  it("disallows starting-view rotation both alone and in a multi-selection", () => {
    document.body.classList.add("ww-canvas")
    const frame = targetElement("div"), other = targetElement()
    frame.classList.add("ww-canvas-starting-view")
    for(const target of [frame, other]) {
      Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
      mockRect(target)
    }
    for(const elements of [[frame], [frame, other]]) {
      if(elements.length === 1) selectNode(frame)
      else { $.selectElements(elements); editor.features.selection.processSelection(undefined, {scrollIntoView: false}) }
      expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!.hidden).toBe(true)
      const initial = elements.map(element => element.style.cssText)
      feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
      feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
      feature.handleRotateEnd()
      expect(elements.map(element => element.style.cssText)).toEqual(initial)
    }
    selectNode(other)
    expect(feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!.hidden).toBe(false)
    expect(feature.overlay.getAttribute("part")).not.toContain("transform-overlay-starting-view")
  })

  it("rotates only an absolute target in canvas layout", async () => {
    document.body.classList.add("ww-canvas")
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    selectNode(target)
    mockRect(target)
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    feature.handleRotateDrag(new MouseEvent("mousemove", {button: 0, clientX: 200, clientY: 125}))
    await new Promise(requestAnimationFrame)
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

  it("coalesces ordinary rotation and skips geometry reads and writes within a snapped angle", async () => {
    document.body.classList.add("ww-canvas")
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", width: "100px", height: "50px", left: "0px", top: "0px"})
    mockRect(target)
    selectNode(target)
    await mutationsDelivered()
    const {layout, canvas, selection} = editor.features
    const initial = target.style.cssText
    const minimap = vi.spyOn(canvas, "setMinimapRefreshPaused")
    feature.handleRotateStart(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 100}))
    expect(minimap).toHaveBeenLastCalledWith(true)
    await mutationsDelivered()
    const refreshLayout = vi.spyOn(layout, "refresh")
    const refreshFigures = vi.spyOn(layout, "refreshFigureLayout")
    const update = vi.spyOn(feature, "updateInfo")
    const process = vi.spyOn(selection, "processSelection")
    const read = vi.mocked(target.getBoundingClientRect).mockClear()
    const observer = new MutationObserver(() => {})
    observer.observe(target, {attributes: true, attributeFilter: ["style"]})
    try {
      const drag = (x: number, y: number) => feature.handleRotateDrag(new MouseEvent("mousemove", {clientX: x, clientY: y}))
      drag(151, 99)
      expect(observer.takeRecords()).toHaveLength(0)
      expect(read).not.toHaveBeenCalled()
      drag(190, 125)
      expect(target.style.getPropertyValue("rotate")).toBe("90deg")
      expect(observer.takeRecords().length).toBeGreaterThan(0)
      read.mockClear()
      drag(191, 125)
      drag(192, 126)
      expect(observer.takeRecords()).toHaveLength(0)
      expect(read).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(refreshLayout).not.toHaveBeenCalled()
      expect(refreshFigures).toHaveBeenCalledTimes(1)
      expect(refreshFigures).toHaveBeenCalledWith(target)
      editor.doc.syncFromDOM()
      await mutationsDelivered()
      expect(process).not.toHaveBeenCalled()
      await new Promise(requestAnimationFrame)
      expect(update).toHaveBeenCalledOnce()
      expect(new DOMMatrix(feature.overlay.style.transform).b).toBeCloseTo(1)
      document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
      expect(target.style.cssText).toBe(initial)
      expect(minimap).toHaveBeenLastCalledWith(false)
      expect(hasPresentationState(document.body, "transform-rotating")).toBe(false)
    }
    finally { observer.disconnect() }
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
    expect(hasPresentationState(target, "transform-target")).toBe(true)
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
    expect(hasPresentationState(document.body, "transform-moving")).toBe(true)

    feature.disable()

    expect(editor.appendix.querySelector("#◆transform-overlay")).toBeNull()
    expect(hasPresentationState(document.body, "transform-moving") || hasPresentationState(document.body, "transform-rotating") || hasPresentationState(document.body, "transform-scaling-ew") || hasPresentationState(document.body, "transform-scaling-ns")).toBe(false)
    expect(hasPresentationState(target, "transform-target")).toBe(false)
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
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: x, clientY: 110, ctrlKey: true}))
    const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!
    expect(preview).not.toBeNull()
    expect(preview.getAttribute("part")).toContain(`float-drop-preview-${side}`)
    expect(parseFloat(preview.style.left)).toBeCloseTo(300 + (side === "left" ? 0 : 60))
    expect(preview.style.top).toBe("100px")
    expect(parseFloat(preview.style.width)).toBeCloseTo(40)
    expect(preview.style.height).toBe("50px")
    expect(hasPresentationState(paragraph, "drop-caret-before") || hasPresentationState(paragraph, "drop-caret-after")).toBe(false)
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

    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 310, clientY: 110, ctrlKey: true}))
    expect(editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!.style.left).toBe("300px")
    feature.handleMoveDrag(new MouseEvent("mousemove", {button: 0, clientX: 390, clientY: 110, ctrlKey: true}))
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
    expect(hasPresentationState(paragraph, `drop-caret-${placement}`)).toBe(true)
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
    const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
    // Exercise the geometry for directions hidden in document layout.
    handle.hidden = false
    handle.dispatchEvent(pointer("pointerdown", {pointerId: 3, clientX: 200, clientY: 150}))
  }
  function drag(options: PointerEventInit = {}) {
    movePointer(pointer("pointermove", {pointerId: 3, clientX: 180, clientY: 140, ...options}))
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


describe.each(["canvas", "slides"] as const)("%s movement grid and guides", mode => {
  function setup(zoom = 1, tag = "test-widget") {
    document.body.className = `ww-${mode}`
    let root = document.body
    if(mode === "slides") {
      const viewport = append(document.createElement("div"))
      viewport.className = "ww-slides-viewport"
      root = viewport.appendChild(document.createElement("section"))
      root.className = "ww-slide"
    }
    root.style.setProperty("zoom", String(zoom))
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 40, 640 * zoom, 360 * zoom))
    vi.spyOn(mode === "canvas" ? editor.features.canvas : editor.features.slides, "zoom", "get").mockReturnValue(zoom)
    if(mode === "canvas") vi.spyOn(editor.features.canvas, "clientPoint").mockImplementation((x, y) => ({x: (x - 30) / zoom, y: (y - 40) / zoom}))
    const box = (tag: string, left: number, top: number, width: number, height: number) => {
      const target = root.appendChild(document.createElement(tag))
      target.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px`
      vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => new DOMRect(
        30 + parseFloat(target.style.left) * zoom, 40 + parseFloat(target.style.top) * zoom, width * zoom, height * zoom))
      return target
    }
    const target = box(tag, 13, 17, 64, 46)
    target.innerHTML = '<span>Authored</span><!--keep--><unfamiliar-inline title="kept">content</unfamiliar-inline>'
    if(tag.includes("-")) target.attachShadow({mode: "open"}).innerHTML = '<button>Widget UI</button>'
    selectNode(target)
    const start = () => feature.handleMoveStart(pointer("pointerdown", {pointerId: 61, clientX: 100, clientY: 100}))
    const move = (x: number, y: number, modifiers: PointerEventInit = {}) => movePointer(pointer("pointermove", {
      pointerId: 61, clientX: 100 + x * zoom, clientY: 100 + y * zoom, ...modifiers,
    }))
    const end = () => document.dispatchEvent(pointer("pointerup", {pointerId: 61}))
    const overlay = () => editor.appendix.querySelector('[part="transform-movement-overlay"]')
    return {target, root, box, start, move, end, overlay}
  }

  it.each([.5, 1, 1.2, 2])("snaps an off-grid visual box exactly to the dots at zoom %s", zoom => {
    const {target, start, move, end, overlay} = setup(zoom)
    const children = Array.from(target.childNodes)
    start(); move(24, 31)
    expect(parseFloat(target.style.left)).toBeCloseTo(40)
    expect(parseFloat(target.style.top)).toBeCloseTo(40)
    expect(Boolean(overlay()?.querySelector('[part="transform-grid"]'))).toBe(mode === "slides")
    expect(Array.from(target.childNodes)).toEqual(children)
    expect(document.body.querySelector('[part="transform-movement-overlay"]')).toBeNull()
    end()
    expect(overlay()).toBeNull()
  })

  it.each(["edges", "centers"])("aligns %s against live peer boxes and shows supporting lines", alignment => {
    const {target, box, start, move, overlay, end} = setup()
    const peer = box("peer-widget", 203, 147, 100, 80)
    const left = alignment === "edges" ? 139 : 221, top = alignment === "edges" ? 147 : 164
    const x = alignment === "edges" ? 233 : 283, y = alignment === "edges" ? 187 : 227
    start(); move(left - 13 - 3, top - 17 + 4)
    expect(parseFloat(target.style.left)).toBeCloseTo(left)
    expect(parseFloat(target.style.top)).toBeCloseTo(top)
    expect(overlay()?.querySelector('[part~="transform-guide-x"]')).toHaveAttribute("x1", String(x))
    expect(overlay()?.querySelector('[part~="transform-guide-y"]')).toHaveAttribute("y1", String(y))
    peer.remove()
    move(24, 31)
    expect(target.style.left).toBe("40px")
    expect(target.style.top).toBe("40px")
    expect(Array.from(overlay()?.querySelectorAll<SVGLineElement>('[part~="transform-guide"]') ?? [])
      .every(line => line.style.display === "none")).toBe(true)
    end()
  })

  it("reuses peer boxes during a drag and remeasures an externally changed peer", () => {
    const {box, start, move, end} = setup()
    const peer = box("peer-widget", 203, 147, 100, 80)
    const rect = vi.mocked(peer.getBoundingClientRect)
    start(); move(24, 31)
    const first = rect.mock.calls.length
    move(32, 39)
    expect(rect.mock.calls.length).toBe(first)
    peer.style.left = "240px"
    move(40, 47)
    expect(rect.mock.calls.length).toBeGreaterThan(first)
    end()
  })

  it("keeps a moved text item selected without reprocessing its unchanged selection", () => {
    const {target, start, move, end} = setup(1, "p")
    start(); move(24, 31)
    const selection = vi.spyOn(editor.features.selection, "processSelection")
    end()
    expect(selection).not.toHaveBeenCalled()
    expect($.selectedElement).toBe(target)
    expect(feature.target).toBe(target)
    expect(hasPresentationState(target, "element-selected")).toBe(true)
  })

  it("bypasses all snapping with Alt and leaves the locked Shift axis unchanged", () => {
    const {target, box, start, move, end, overlay} = setup()
    box("peer-widget", 203, 147, 100, 80)
    start(); move(123, 134, {altKey: true})
    expect(target.style.left).toBe("136px")
    expect(target.style.top).toBe("151px")
    expect(Array.from(overlay()?.querySelectorAll<SVGLineElement>('[part~="transform-guide"]') ?? [])
      .every(line => line.style.display === "none")).toBe(true)
    move(24, 31, {shiftKey: true})
    expect(target.style.left).toBe("13px")
    expect(target.style.top).toBe("40px")
    end()
  })

  it.each(["release", "Escape", "pointercancel", "removed", "disable", "blur"])("cleans up the grid and guides on %s", ending => {
    const {target, box, start, move, end, overlay} = setup()
    box("peer-widget", 203, 147, 100, 80)
    start(); move(123, 134)
    expect(overlay()).not.toBeNull()
    expect(editor.toHTML(true)).not.toMatch(/◆|transform-grid|transform-guide/)
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toMatch(/◆|transform-grid|transform-guide/)
    if(ending === "release") end()
    else if(ending === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(ending === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId: 61}))
    else if(ending === "removed") { target.remove(); move(24, 31) }
    else if(ending === "disable") feature.disable()
    else window.dispatchEvent(new Event("blur"))
    expect(overlay()).toBeNull()
    expect(document.body.className).not.toContain("◆transform-moving")
  })
})

describe("queued pointer movement", () => {
  it.each(["move", "resize", "rotate"] as const)("applies only the latest %s input once per frame", mode => {
    const canvas = mode !== "resize"
    if(canvas) {
      document.body.classList.add("ww-canvas")
      vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    }
    const target = targetElement(mode === "resize" ? "img" : "p")
    if(canvas) Object.assign(target.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)

    const pointerId = 71
    const start = pointer("pointerdown", {pointerId, clientX: 100, clientY: 100})
    if(mode === "move") feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!.dispatchEvent(start)
    else if(mode === "resize") feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.dispatchEvent(start)
    else feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!.dispatchEvent(start)

    const drag = mode === "move" ? vi.spyOn(feature, "handleMoveDrag")
      : mode === "resize" ? vi.spyOn(feature, "handleScaleDrag") : vi.spyOn(feature, "handleRotateDrag")
    queuePointer(pointer("pointermove", {pointerId, clientX: 115, clientY: 110}))
    queuePointer(pointer("pointermove", {pointerId, clientX: 135, clientY: 125}))
    expect(drag).not.toHaveBeenCalled()

    flushAnimationFrame()
    expect(drag).toHaveBeenCalledOnce()
    expect(drag.mock.calls[0][0]).toMatchObject({clientX: 135, clientY: 125})
    document.dispatchEvent(pointer("pointerup", {pointerId}))
  })

  it("discovers paused animations before coalesced gesture writes and refreshes geometry", () => {
    const target = targetElement("img")
    Object.assign(target.style, {width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const pointerId = 76
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!
      .dispatchEvent(pointer("pointerdown", {pointerId, clientX: 200, clientY: 150}))
    queuePointer(pointer("pointermove", {pointerId, clientX: 220, clientY: 160}))

    const order: string[] = []
    const animation = {effect: {target: document.body}, playState: "paused"} as unknown as Animation
    const originalGetAnimations = Object.getOwnPropertyDescriptor(document, "getAnimations")
    Object.defineProperty(document, "getAnimations", {configurable: true, value: () => { order.push("discover"); return [animation] }})
    vi.spyOn(feature, "handleScaleDrag").mockImplementation(() => { order.push("write") })
    vi.spyOn(feature, "updateInfo").mockImplementation(() => { order.push("refresh") })

    try {
      flushAnimationFrame()
      expect(order.indexOf("discover")).toBeLessThan(order.indexOf("write"))
      expect(order).toContain("refresh")
      document.dispatchEvent(pointer("pointerup", {pointerId}))
    } finally {
      if(originalGetAnimations) Object.defineProperty(document, "getAnimations", originalGetAnimations)
      else Reflect.deleteProperty(document, "getAnimations")
    }
  })

  it("commits the latest queued move and terminal release coordinates as one undo step", async () => {
    document.body.classList.add("ww-canvas")
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const initial = editor.toHTML(true)
    const pointerId = 72
    const captions = vi.spyOn(editor.features.layout, "refreshFigureLayout")
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
      .dispatchEvent(pointer("pointerdown", {pointerId, clientX: 100, clientY: 100}))
    queuePointer(pointer("pointermove", {pointerId, clientX: 120, clientY: 100}))
    expect(target.style.left).toBe("0px")
    document.dispatchEvent(pointer("pointerup", {pointerId, clientX: 130, clientY: 100}))
    expect(target.style.left).toBe("40px")
    expect(captions).toHaveBeenCalledWith(target)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const changed = editor.toHTML(true)
    expect(changed).not.toBe(initial)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(initial)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it.each(["pointercancel", "Escape", "disable", "removed", "replaced", "remote style change", "permission revoked"] as const)("drops queued movement on %s before the next frame", async ending => {
    document.body.classList.add("ww-canvas")
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    target.id = "queued-move"
    Object.assign(target.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    editor.doc.syncFromDOM()
    const initialStyle = target.style.cssText
    const pointerId = 73
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
      .dispatchEvent(pointer("pointerdown", {pointerId, clientX: 100, clientY: 100}))
    queuePointer(pointer("pointermove", {pointerId, clientX: 140, clientY: 130}))

    if(ending === "pointercancel") document.dispatchEvent(pointer("pointercancel", {pointerId}))
    else if(ending === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    else if(ending === "disable") feature.disable()
    else if(ending === "removed") target.remove()
    else if(ending === "replaced") target.replaceWith(target.cloneNode(true))
    else if(ending === "permission revoked") vi.spyOn(editor, "allows").mockReturnValue(false)
    else {
      const [shared] = [...editor.doc.body.createTreeWalker(node => node instanceof Y.XmlElement && node.getAttribute("id") === target.id)]
      editor.doc.doc.transact(() => (shared as Y.XmlElement).setAttribute("style", "position: absolute; left: 77px; top: 0px; width: 100px; height: 50px"), "remote-test")
      await mutationsDelivered()
    }

    flushAnimationFrame()
    if(ending === "remote style change") expect(target.style.left).toBe("77px")
    else if(ending === "removed" || ending === "replaced") expect(target.isConnected).toBe(false)
    else expect(target.style.cssText).toBe(initialStyle)
    expect(document.body.className).not.toContain("◆transform-moving")
    expect(presentationStateElements(document, "transform-moving")).toHaveLength(0)
  })

  it.each(["move", "resize"] as const)("does not write styles again for an identical %s frame", mode => {
    const isMove = mode === "move"
    if(isMove) {
      document.body.classList.add("ww-canvas")
      vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    }
    const target = targetElement(isMove ? "p" : "img")
    if(isMove) Object.assign(target.style, {position: "absolute", left: "0px", top: "0px", width: "100px", height: "50px"})
    else Object.assign(target.style, {width: "100px", height: "50px"})
    mockRect(target)
    selectNode(target)
    const pointerId = 74
    const start = pointer("pointerdown", {pointerId, clientX: 200, clientY: 150})
    if(isMove) feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!.dispatchEvent(start)
    else feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-down-right")!.dispatchEvent(start)
    const observer = new MutationObserver(() => {})
    observer.observe(target, {attributes: true, attributeFilter: ["style"]})
    const x = isMove ? 220 : 220
    movePointer(pointer("pointermove", {pointerId, clientX: x, clientY: 150}))
    observer.takeRecords()
    movePointer(pointer("pointermove", {pointerId, clientX: x, clientY: 150}))
    expect(observer.takeRecords()).toHaveLength(0)
    observer.disconnect()
    document.dispatchEvent(pointer("pointerup", {pointerId}))
  })

  it("reuses visible snap guide nodes across identical frames", () => {
    document.body.classList.add("ww-canvas")
    vi.spyOn(editor.features.canvas, "active", "get").mockReturnValue(true)
    const target = targetElement()
    Object.assign(target.style, {position: "absolute", left: "13px", top: "17px", width: "64px", height: "46px"})
    mockRect(target)
    const peer = targetElement("peer-widget")
    Object.assign(peer.style, {position: "absolute", left: "203px", top: "147px", width: "100px", height: "80px"})
    mockRect(peer)
    selectNode(target)
    const pointerId = 75
    feature.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
      .dispatchEvent(pointer("pointerdown", {pointerId, clientX: 100, clientY: 100}))
    movePointer(pointer("pointermove", {pointerId, clientX: 223, clientY: 234}))
    const overlay = editor.appendix.querySelector('[part="transform-movement-overlay"]')!
    const guideX = overlay.querySelector('[part~="transform-guide-x"]')
    const guideY = overlay.querySelector('[part~="transform-guide-y"]')
    expect(guideX).not.toBeNull()
    expect(guideY).not.toBeNull()
    movePointer(pointer("pointermove", {pointerId, clientX: 223, clientY: 234}))
    expect(overlay.querySelector('[part~="transform-guide-x"]')).toBe(guideX)
    expect(overlay.querySelector('[part~="transform-guide-y"]')).toBe(guideY)
    document.dispatchEvent(pointer("pointerup", {pointerId}))
  })
})
