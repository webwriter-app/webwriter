// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {graphicPresetFillRule, isGraphicPresetType, readGraphicPreset, writeGraphicPreset, graphicPresetHandles} from "../graphic-shapes"
import {DOMEditor} from "../domeditor"
import {shapeKeyboardInputEvent, markStateChangeEvent, selectionChangeEvent} from "../editor-bridge"
import {previewFrameHTML} from "../frame-document"
import {$, clearEditorMarkerClasses} from "../utility"
import {
  graphicShapeDragType,
  SVG_NAMESPACE,
  graphicShapeForNode,
  graphicShapeOptions,
  graphicShapeRoots,
  graphicShapeType,
  graphicPathGeometry,
  boundsForPoints,
  standaloneGraphicShape,
} from "../graphic"

let editor: DOMEditor

// Every preset's path and handles are covered in graphic-shapes.test.ts. These
// exercise each insertion/painting family through the complete editor lifecycle.
const insertionPresets = new Set([
  "text-box", "rounded-rectangle", "snip-round", "curved-connector-arrow",
  "donut", "cube", "heart", "up-arrow", "quad-arrow-callout", "divide",
  "magnetic-disk", "star-3", "star-32", "vertical-scroll", "cloud-callout", "line-callout-2",
])
const insertionOptions = graphicShapeOptions.filter(option => !isGraphicPresetType(option.type) || insertionPresets.has(option.type))

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

// Exact native bounds for a line preset and a cubic preset. Happy DOM does not
// measure SVG geometry; these exercise the browser's geometry path.
async function withNativePresetBounds(run: () => void | Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(SVGGraphicsElement.prototype, "getBBox")
  Object.defineProperty(SVGGraphicsElement.prototype, "getBBox", {configurable: true, value: function(this: Element) {
    const preset = readGraphicPreset(this)
    if(preset?.type === "lightning-bolt") return boundsForPoints(graphicPathGeometry(this)!.points)
    if(preset?.type === "terminator") {
      const {x, y, width, height} = preset.bounds, [radius] = preset.values
      return {x: x + width * radius / 400, y: y + height / 4, width: width * (1 - radius / 200), height: height / 2}
    }
    throw new Error("Native bounds unavailable")
  }})
  try { await run() }
  finally {
    if(original) Object.defineProperty(SVGGraphicsElement.prototype, "getBBox", original)
    else delete (SVGGraphicsElement.prototype as unknown as {getBBox?: unknown}).getBBox
  }
}

function clickShape(shape: Element, shiftKey = false) {
  shape.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, shiftKey}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, shiftKey}))
}

// Happy DOM does not carry DragEventInit.dataTransfer through its constructor.
function imageDragEvent(type: string, init: DragEventInit) {
  const event = new DragEvent(type, init)
  Object.defineProperty(event, "dataTransfer", {value: init.dataTransfer})
  Object.assign(event, {clientX: init.clientX ?? 0, clientY: init.clientY ?? 0})
  return event
}

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  $.move(document.body.firstElementChild!)
})

afterEach(() => editor.destroy())

describe("graphic editing", () => {
  it.each(["cleared", "removed"])("blocks keyboard insertion and modifier relays until internal selection is %s", state => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const selected = editor.features.graphic.selectedShape!
    const post = vi.spyOn(editor, "postHostMessage")
    const inputs = () => post.mock.calls.filter(([message]) => (message as {type: string}).type === shapeKeyboardInputEvent)
    for(const [type, key] of [["keydown", "Shift"], ["keyup", "Shift"], ["keydown", "CapsLock"], ["keyup", "CapsLock"], ["keydown", "1"]]) {
      document.dispatchEvent(new KeyboardEvent(type, {key, code: key === "1" ? "Digit1" : key, altKey: key === "1", bubbles: true, shiftKey: type === "keydown", cancelable: true}))
    }
    expect(inputs()).toHaveLength(0)
    const command = {type: "addGraphicShape" as const, shape: "ellipse" as const, onlyIfUnselected: true}
    editor.features.graphic.actions.addGraphicShape(command)
    expect(graphic.children).toHaveLength(1)
    if(state === "removed") selected.remove()
    else document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    post.mockClear()
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Shift", shiftKey: true, bubbles: true}))
    expect(inputs()).toHaveLength(1)
    editor.features.graphic.actions.addGraphicShape(command)
    expect(graphic.querySelectorAll("ellipse")).toHaveLength(1)
  })

  it.each(["draw", "lines", "curves"] as const)("relays brush shortcuts while preparing a %s drawing without editing the graphic", mode => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode})
    const authored = editor.toHTML(true)
    const post = vi.spyOn(editor, "postHostMessage")
    for(const code of ["Digit0", "KeyP", "Semicolon", "Period"]) {
      const key = new KeyboardEvent("keydown", {key: "Dead", code, altKey: true, bubbles: true, cancelable: true})
      document.dispatchEvent(key)
      expect(key.defaultPrevented).toBe(true)
    }
    const inputs = post.mock.calls.map(([message]) => message as {type: string, detail?: {code: string}})
      .filter(message => message.type === shapeKeyboardInputEvent)
    expect(inputs.map(message => message.detail!.code)).toEqual(["Digit0", "KeyP", "Semicolon", "Period"])
    expect(editor.features.graphic.getState()!.mode).toBe(mode)
    expect(editor.toHTML(true)).toBe(authored)
  })

  it("relays captured shape keys and modifier releases without intercepting label or widget input", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const post = vi.spyOn(editor, "postHostMessage")
    const inputs = () => post.mock.calls.map(([message]) => message as {type: string, detail?: unknown})
      .filter(message => message.type === shapeKeyboardInputEvent).map(message => message.detail)
    const press = (type: string, init: KeyboardEventInit, target: EventTarget = document) => {
      const event = new KeyboardEvent(type, {bubbles: true, composed: true, cancelable: true, ...init})
      target.dispatchEvent(event)
      return event
    }
    expect(press("keydown", {key: "!", code: "Digit1", altKey: true, shiftKey: true}).defaultPrevented).toBe(true)
    press("keydown", {key: "Shift", code: "ShiftLeft", shiftKey: true})
    press("keyup", {key: "Shift", code: "ShiftLeft"})
    expect(inputs()).toEqual([
      {type: "keydown", key: "!", code: "Digit1", altKey: true, shiftKey: true, capsLock: false, repeat: false},
      {type: "keydown", key: "Shift", code: "ShiftLeft", altKey: false, shiftKey: true, capsLock: false, repeat: false},
      {type: "keyup", key: "Shift", code: "ShiftLeft", altKey: false, shiftKey: false, capsLock: false, repeat: false},
    ])
    post.mockClear()
    expect(press("keydown", {key: "Dead", code: "Equal", altKey: true}).defaultPrevented).toBe(true)
    expect(inputs()).toHaveLength(1)
    post.mockClear()
    press("keydown", {key: "q", code: "KeyQ", ctrlKey: true})
    press("keydown", {key: "q", code: "KeyQ", metaKey: true})
    press("keydown", {key: "q", code: "KeyQ", ctrlKey: true, altKey: true})
    press("keydown", {key: "q", code: "KeyQ", isComposing: true})
    const widget = document.createElement("test-widget")
    const input = document.createElement("input")
    widget.attachShadow({mode: "open"}).append(input)
    document.body.append(widget)
    press("keydown", {key: "q", code: "KeyQ"}, input)
    expect(inputs()).toHaveLength(0)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})
    press("keydown", {key: "Enter"})
    post.mockClear()
    press("keydown", {key: "q", code: "KeyQ"})
    press("keyup", {key: "Shift", code: "ShiftLeft"})
    expect(inputs()).toHaveLength(0)
  })

  it.each(["captured", "selected"])("pastes plain text into a %s graphic without replacing content, with undo and redo", async selection => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<!--keep--><g><path d="M0 0L5 5"/></g>'
    const sibling = graphic.lastElementChild!
    if(selection === "selected") editor.features.selection.selectElement(graphic)
    await mutationsDelivered()
    const data = new DataTransfer()
    data.setData("text/plain", "Hello <world>\r\nSecond line")
    data.setData("text/html", "<p>Hello <b>world</b></p><p>Second line</p>")
    const paste = new ClipboardEvent("paste", {bubbles: true, cancelable: true})
    Object.defineProperty(paste, "clipboardData", {value: data})
    document.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    const text = graphic.querySelector("text")!
    expect(text.textContent).toBe("Hello <world>\nSecond line")
    expect(text.querySelectorAll("tspan")).toHaveLength(0)
    expect(text.getAttribute("x")!.split(/\s+/)).toHaveLength(text.textContent!.length)
    expect(text.getAttribute("y")!.split(/\s+/)).toHaveLength(text.textContent!.length)
    expect(graphic.children[0]).toBe(sibling)
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(editor.features.graphic.getState()?.shape).toBe("text-box")
    await mutationsDelivered()
    expect(editor.doc.body.toString()).toContain("Hello <world>")
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).not.toContain("◆")
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("text")).toBeNull()
    expect(graphic.children[0]).toBe(sibling)
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("text")).not.toBeNull()
  })

  it("drops plain text at SVG coordinates and preserves the existing shape", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.firstElementChild!
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 100, f: 50})})
    const data = new DataTransfer()
    data.setData("text/plain", "Dropped text")
    const over = imageDragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: data})
    rectangle.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    const drop = imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data, clientX: 500, clientY: 350})
    rectangle.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(graphic.children[0]).toBe(rectangle)
    const text = graphic.querySelector("text")!
    expect(text).toHaveTextContent("Dropped text")
    const frame=readGraphicPreset(text.parentElement!.querySelector("path")!)!.bounds
    expect(frame.x+frame.width/2).toBeCloseTo(200,4)
    expect(frame.y+frame.height/2).toBeCloseTo(150,4)
    expect(document.body.querySelectorAll("svg")).toHaveLength(1)
  })

  it.each(["removed", "disabled", "locked", "moved into widget"])("ignores text paste and drop when the graphic is %s", state => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    if(state === "removed") graphic.remove()
    else if(state === "disabled") {
      editor.features.graphic.disable()
      editor.features.manipulation.disable()
    }
    else if(state === "locked") editor.lockEditing("text-test")
    else {
      const widget = document.createElement("test-widget")
      graphic.replaceWith(widget)
      widget.append(graphic)
    }
    const data = new DataTransfer()
    data.setData("text/plain", "No insertion")
    const paste = new ClipboardEvent("paste", {bubbles: true, cancelable: true})
    Object.defineProperty(paste, "clipboardData", {value: data})
    graphic.dispatchEvent(paste)
    graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
    expect(graphic.querySelector("text")).toBeNull()
  })

  it("routes the toolbar paste command into the graphic using plain text", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
      {types: ["text/html", "text/plain"], getType: async (type: string) => new Blob([type === "text/plain" ? "Clipboard text" : "<b>HTML</b>"]), presentationStyle: "unspecified"} as ClipboardItem,
    ])
    expect(await editor.features.manipulation.actions.paste({type: "paste"})).toBe(true)
    expect(graphic.querySelector("text")).toHaveTextContent("Clipboard text")
  })

  it("does not insert delayed toolbar paste into a replaced graphic", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    let resolve!: (items: ClipboardItem[]) => void
    vi.spyOn(navigator.clipboard, "read").mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = editor.features.manipulation.actions.paste({type: "paste"})
    const replacement = graphic.cloneNode(true) as SVGSVGElement
    graphic.replaceWith(replacement)
    editor.features.selection.captureElement(replacement)
    resolve([{types: ["text/plain"], getType: async () => new Blob(["Late text"]), presentationStyle: "unspecified"} as ClipboardItem])
    expect(await pending).toBe(false)
    expect(replacement.querySelector("text")).toBeNull()
  })

  it("pastes into an open shape label instead of adding another text box", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    const data = new DataTransfer()
    data.setData("text/plain", "Pasted label")
    const paste = new ClipboardEvent("paste", {bubbles: true, composed: true, cancelable: true})
    Object.defineProperty(paste, "clipboardData", {value: data})
    proxy.dispatchEvent(paste)
    expect(paste.defaultPrevented).toBe(true)
    expect(graphic.querySelectorAll("text")).toHaveLength(1)
    expect(graphic.querySelector("text")).toHaveTextContent("Pasted label")
    vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
      {types: ["text/plain"], getType: async () => new Blob(["!"]), presentationStyle: "unspecified"} as ClipboardItem,
    ])
    expect(await editor.features.manipulation.actions.paste({type: "paste"})).toBe(true)
    expect(graphic.querySelector("text")).toHaveTextContent("Pasted label!")
    expect(graphic.querySelectorAll("text")).toHaveLength(1)
    proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    expect(graphic.querySelector('[class*="◆graphic-text-editing"]')).toBeNull()
    expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
  })

  it.each(["standalone", "canvas", "preview"])("creates a text box without background or border in %s insertion", mode => {
    let graphic: SVGSVGElement
    if(mode === "preview") graphic = editor.features.graphic.createGraphic("text-box")
    else {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic", ...(mode === "standalone" ? {shape: "text-box" as const} : {})})
      graphic = document.querySelector("svg")!
      if(mode === "canvas") editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "text-box", paint: {opacity: "0.5"}})
    }
    expect(graphic.querySelector("path")).toHaveAttribute("fill", "none")
    expect(graphic.querySelector("path")).toHaveAttribute("stroke", "none")
    expect(graphic.querySelector("text")).toHaveTextContent("Text")
    expect(graphic.querySelector("text")).toHaveAttribute("fill", "#0f172a")
    const textBoxPath = graphic.querySelector("path")!, bounds = readGraphicPreset(textBoxPath)!.bounds
    expect(bounds.width).toBeLessThan(240)
    expect(bounds.height).toBeLessThan(240)
    expect(graphic.querySelector("text")!.getAttribute("x")!.split(/\s+/).length).toBe(4)
    expect(graphic.querySelector("text")!.getAttribute("y")!.split(/\s+/).length).toBe(4)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("allows explicit text box background and border paint", () => {
    const graphic = editor.features.graphic.createGraphic("text-box", {fill: "red", stroke: "blue"})
    expect(graphic.querySelector("path")).toHaveAttribute("fill", "red")
    expect(graphic.querySelector("path")).toHaveAttribute("stroke", "blue")
  })

  it("fits text boxes to label content, wraps long text, and refits after font-size changes", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "text-box"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("g")!
    const path = shape.querySelector("path")!, text = shape.querySelector("text")!
    const bounds = () => readGraphicPreset(path)!.bounds
    const short = bounds()
    expect(short.width).toBeLessThan(240)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: `${"extraordinarilylongword".repeat(5)} ${"word ".repeat(60)}`})
    const long = bounds()
    expect(long.width).toBeLessThanOrEqual(496.001)
    expect(long.height).toBeGreaterThan(short.height)
    expect(new Set(text.getAttribute("y")!.split(/\s+/)).size).toBeGreaterThan(1)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "x"})
    const tiny = bounds()
    expect(tiny.width).toBeLessThan(long.width)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "font-size", value: "72"})
    expect(bounds().height, `${text.getAttribute("font-size")} ${text.style.fontSize} ${getComputedStyle(text).fontSize}`).toBeGreaterThan(tiny.height)
    expect(text.textContent).toBe("x")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("keeps fitted text-box size through moves and rotation, and uses resize width as its wrap cap", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "text-box"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("g")!
    const path = shape.querySelector("path")!, text = shape.querySelector("text")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "A moderately long fitted label"})
    const initial = readGraphicPreset(path)!.bounds
    const xBefore = text.getAttribute("x")!.split(/\s+/).map(Number)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "35"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: String(initial.x + 80)})
    const moved = readGraphicPreset(path)!.bounds
    expect(moved.width).toBeCloseTo(initial.width)
    expect(moved.height).toBeCloseTo(initial.height)
    expect(moved.x + moved.width / 2).toBeCloseTo(initial.x + initial.width / 2 + 80)
    expect(text.getAttribute("x")!.split(/\s+/).map(Number).map((value, index) => value - xBefore[index]).every(value => Math.abs(value - 80) < .001)).toBe(true)
    expect(shape.getAttribute("transform")).toMatch(/^rotate\(35 /)
    const heightBeforeResize = moved.height
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "200"})
    expect(text.style.inlineSize).toBe("184px")
    expect(readGraphicPreset(path)!.bounds.width).toBeLessThanOrEqual(200.001)
    expect(readGraphicPreset(path)!.bounds.height).toBeGreaterThan(heightBeforeResize)
  })

  it.each(["rectangle", "diamond", "rounded-rectangle"] as const)("wraps $shape labels within the unchanged shape frame and reflows after width and font changes", shape => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape})
    clickShape(document.querySelector("svg")!.firstElementChild!)
    const graphic = document.querySelector("svg")!, source = editor.features.graphic.selectedShape!
    const geometry = source.localName === "g" ? source.firstElementChild! : source
    const geometryState = () => [...geometry.attributes].filter(attribute => attribute.name !== "class").map(attribute => [attribute.name,attribute.value])
    const originalGeometry = geometryState()
    const initialWidth = Number(editor.features.graphic.getState()!.parameters!.width)
    const content = "word ".repeat(100)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: content})
    const group = graphic.querySelector("g")!, text = group.querySelector("text")!
    const initialRows = new Set(text.getAttribute("y")!.trim().split(/\s+/)).size
    expect(text.textContent).toBe(content)
    expect(text.querySelectorAll("tspan")).toHaveLength(0)
    expect(parseFloat(text.style.inlineSize)).toBeCloseTo(initialWidth - 16)
    expect(initialRows).toBeGreaterThan(1)
    expect(geometryState()).toEqual(originalGeometry)

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "720"})
    const wideRows = new Set(text.getAttribute("y")!.trim().split(/\s+/)).size
    expect(parseFloat(text.style.inlineSize)).toBeCloseTo(704)
    expect(wideRows).toBeLessThan(initialRows)
    expect(geometryState()).not.toEqual(originalGeometry)
    const wideScale=Number(text.style.scale || 1)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "font-size", value: "72"})
    expect(text.getAttribute("font-size")).toBe("72")
    expect(Number(text.style.scale)).toBeLessThan(wideScale)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("inserts painted shapes in one undo step while preserving unfamiliar content", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.insertAdjacentHTML("beforeend", '<!--keep--><g><path d="M0 0L5 5"/></g>')
    const sibling = graphic.lastElementChild!
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const paint = {fill: "#60a5fa", stroke: "#1d4ed8", "stroke-width": "8", opacity: "0.5"}
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "heart", paint})
    const shape = graphic.lastElementChild!
    for(const [name, value] of Object.entries(paint)) expect(shape).toHaveAttribute(name, value)
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(graphic.children[0]).toBe(sibling)
    await mutationsDelivered()
    expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).not.toContain("◆")
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.children).toHaveLength(1)
    expect(graphic.children[0]).toBe(sibling)
    editor.features.history.actions.redo({type: "redo"})
    for(const [name, value] of Object.entries(paint)) expect(graphic.lastElementChild).toHaveAttribute(name, value)
  })

  it.each(["line", "connector", "curved-connector-arrow"] as const)("keeps %s unfilled with insertion modifiers", shape => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: shape, paint: {fill: "red", stroke: "blue"}})
    expect(document.querySelector("svg")!.lastElementChild).toHaveAttribute("fill", "none")
    expect(document.querySelector("svg")!.lastElementChild).toHaveAttribute("stroke", "blue")
  })

  it("does nothing when the captured canvas was removed before a key is pressed", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.remove()
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "heart", paint: {fill: "red"}})
    expect(graphic.children).toHaveLength(0)
    expect(document.querySelector("svg")).toBeNull()
  })

  it("drops keyboard shapes at SVG coordinates with paint and one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.insertAdjacentHTML("beforeend", '<!--keep--><g><path d="M0 0L5 5"/></g>')
    const sibling = graphic.lastElementChild!
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 100, f: 50})})
    await mutationsDelivered()
    const data = new DataTransfer()
    data.setData(graphicShapeDragType, JSON.stringify({shape: "ellipse", paint: {fill: "red", stroke: "blue"}}))
    const over = imageDragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: data, clientX: 500, clientY: 350})
    graphic.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    const drop = imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data, clientX: 500, clientY: 350})
    graphic.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    const shape = graphic.querySelector("ellipse")!
    expect(shape).toHaveAttribute("cx", "200")
    expect(shape).toHaveAttribute("cy", "150")
    expect(shape).toHaveAttribute("fill", "red")
    expect(shape).toHaveAttribute("stroke", "blue")
    expect(graphic.children[0]).toBe(sibling)
    await mutationsDelivered()
    expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).not.toContain("◆")
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("ellipse")).toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("ellipse")).toHaveAttribute("fill", "red")
  })

  it("keeps keyboard shape drags within the captured graphic without moving document selection", () => {
    document.body.innerHTML = '<p>Before</p><svg viewBox="0 0 400 200"><!--keep--><rect x="20" y="20" width="40" height="40"/></svg><svg viewBox="0 0 400 200"></svg><p>After</p>'
    const [graphic, other] = document.querySelectorAll("svg")
    const paragraph = document.querySelector("p")!
    Object.defineProperty(graphic,"getScreenCTM",{value:() => ({a:2,b:0,c:0,d:2,e:100,f:50})})
    editor.features.selection.captureElement(graphic)
    const before = editor.toHTML(true)
    const selection = document.getSelection()!, anchor = selection.anchorNode, offset = selection.anchorOffset
    const data = new DataTransfer()
    data.setData(graphicShapeDragType,JSON.stringify({shape:"ellipse",paint:{fill:"red"}}))
    const capture = vi.spyOn(editor.features.selection,"captureElement")
    // Values are unavailable on native dragover; only MIME types are exposed.
    const protectedRead = vi.spyOn(data,"getData").mockReturnValue("")
    for(const [target,x,y,effect] of [[paragraph,10,10,"none"],[other,500,250,"none"],[graphic,500,250,"copy"],[graphic,950,250,"none"],[paragraph,10,10,"none"]] as const) {
      target.dispatchEvent(imageDragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:data,clientX:x,clientY:y}))
      expect(data.dropEffect).toBe(effect)
      editor.features.selection.processSelection()
      expect(editor.features.selection.captureSelectedElement).toBe(graphic)
      expect(selection.anchorNode).toBe(anchor)
      expect(selection.anchorOffset).toBe(offset)
      expect(document.body).not.toHaveClass("◆drop-selection-active")
      expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    }
    expect(protectedRead).not.toHaveBeenCalled()
    protectedRead.mockRestore()
    for(const [target,x,y] of [[paragraph,10,10],[other,500,250],[graphic,950,250]] as const) {
      const drop = imageDragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientX:x,clientY:y})
      target.dispatchEvent(drop)
      expect(drop.defaultPrevented).toBe(true)
      expect(data.dropEffect).toBe("none")
      expect(editor.toHTML(true)).toBe(before)
      expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    }
    graphic.dispatchEvent(imageDragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientX:500,clientY:250}))
    expect(graphic.querySelector("ellipse")).toHaveAttribute("cx","200")
    expect(graphic.querySelector("ellipse")).toHaveAttribute("cy","100")
    expect(editor.features.graphic.selectedShape).toBe(graphic.querySelector("ellipse"))
    expect(capture).not.toHaveBeenCalled()
    expect(other.children).toHaveLength(0)
    expect(document.querySelectorAll("svg")).toHaveLength(2)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  })

  it.each(["unselected","removed","replaced","locked"])("rejects keyboard shape drops when the captured graphic is %s", state => {
    document.body.innerHTML = '<svg viewBox="0 0 400 200"></svg><p>Keep</p>'
    const graphic = document.querySelector("svg")!
    editor.features.selection.captureElement(graphic)
    const data = new DataTransfer()
    data.setData(graphicShapeDragType,JSON.stringify({shape:"ellipse"}))
    if(state === "unselected") editor.features.selection.selectElement(graphic)
    else if(state === "removed") graphic.remove()
    else if(state === "replaced") graphic.replaceWith(graphic.cloneNode(true))
    else editor.lockEditing("shape-drop-test")
    const target = document.querySelector("svg") ?? document.body
    const before = editor.toHTML(true)
    target.dispatchEvent(imageDragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:data,clientX:100,clientY:100}))
    target.dispatchEvent(imageDragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientX:100,clientY:100}))
    expect(data.dropEffect).toBe("none")
    expect(editor.toHTML(true)).toBe(before)
    expect(document.querySelector("ellipse")).toBeNull()
    if(state === "locked") editor.unlockEditing("shape-drop-test")
  })

  it.each(["audio/mpeg", "video/mp4"])("inserts %s files into an existing graphic and supports undo", async mime => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<!--keep--><g><path d="M0 0L5 5"/></g>'
    const sibling = graphic.lastElementChild
    await mutationsDelivered()
    const data = new DataTransfer()
    data.items.add(new File(["media"], "media", {type: mime}))
    const over = imageDragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: data})
    graphic.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data, clientX: 200, clientY: 100})
    graphic.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    const container = graphic.querySelector("foreignObject")!
    expect(container).not.toBeNull()
    const media = container.querySelector(mime.startsWith("video") ? "video" : "audio")!
    expect(media.getAttribute("src")).toMatch(/^blob:/)
    expect(media).toHaveAttribute("controls")
    expect(graphic.firstElementChild).toBe(sibling)
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("foreignObject")).toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("foreignObject")).not.toBeNull()
  })

  it("rejects invalid, locked, widget and disconnected shape drops", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const data = new DataTransfer()
    for(const payload of ["{", JSON.stringify({shape: "unknown"}), "null"]) {
      data.setData(graphicShapeDragType, payload)
      graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
      expect(graphic.children).toHaveLength(0)
    }
    data.setData(graphicShapeDragType, JSON.stringify({shape: "rectangle"}))
    editor.lockEditing("shape-test")
    graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
    editor.unlockEditing("shape-test")
    const widget = document.createElement("test-widget")
    document.body.append(widget)
    widget.append(graphic)
    graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
    graphic.remove()
    graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
    expect(graphic.children).toHaveLength(0)
  })

  it("reuses image source controls for a native SVG image and preserves canvas capture", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "image"})
    const graphic = document.querySelector("svg")!
    const image = graphic.querySelector("image")!
    const placeholder = editor.features.media.placeholder
    expect(placeholder.target).toBe(image)
    expect(placeholder.element.getRootNode()).toBe(editor.appendix)
    expect(placeholder.root.querySelector<HTMLInputElement>(".picker")!.accept).toBe("image/*")
    expect(placeholder.root.querySelector<HTMLButtonElement>(".screen")!.hidden).toBe(false)
    expect(placeholder.root.querySelector<HTMLButtonElement>(".record")!.hidden).toBe(false)
    placeholder.root.querySelector(".url")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0}))
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    for(const event of [
      new KeyboardEvent("keydown", {key: "Delete", bubbles: true, composed: true, cancelable: true}),
      new KeyboardEvent("keydown", {key: "a", bubbles: true, composed: true, cancelable: true}),
      new InputEvent("beforeinput", {inputType: "insertText", data: "a", bubbles: true, composed: true, cancelable: true}),
      new Event("paste", {bubbles: true, composed: true, cancelable: true}),
    ]) {
      input.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(image.isConnected).toBe(true)
    }
    input.value = "https://example.com/photo.png"
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    expect(image).toHaveAttribute("href", input.value)
    expect(placeholder.element).not.toHaveAttribute("data-open")
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "480"})
    expect(image).toHaveAttribute("width", "480")
    await mutationsDelivered()
    expect(editor.toHTML(true)).toContain('href="https://example.com/photo.png"')
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(editor.doc.body.toString()).toContain("https://example.com/photo.png")
    expect(editor.toHTML(true)).not.toContain("media-placeholder")
  })

  it("loads a graphic image from the shared file picker", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "image"})
    const image = document.querySelector("svg image")!
    const picker = editor.features.media.placeholder.root.querySelector<HTMLInputElement>(".picker")!
    Object.defineProperty(picker, "files", {value: [new File(["image"], "photo.png", {type: "image/png"})]})
    picker.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(image.getAttribute("href")).toMatch(/^blob:/))
    expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).toContain(`data:image/png;base64,${btoa("image")}`)
    expect(image.getAttribute("href")).toMatch(/^blob:/)
  })

  it("drops image URLs at SVG coordinates without changing unfamiliar siblings, with undo and redo", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.insertAdjacentHTML("beforeend", '<!--keep--><g><path d="M0 0L5 5"/></g>')
    const sibling = graphic.lastElementChild!
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 100, f: 50})})
    await mutationsDelivered()
    const data = new DataTransfer()
    data.setData("text/html", '<img src="https://example.com/photo.png">')
    data.setData("text/plain", "Image fallback text")
    const over = imageDragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: data})
    graphic.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const event = imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data, clientX: 500, clientY: 350})
    graphic.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const image = graphic.querySelector("image")!
    expect(image).toHaveAttribute("href", "https://example.com/photo.png")
    expect(image).toHaveAttribute("x", "120")
    expect(image).toHaveAttribute("y", "90")
    expect(graphic.children[0]).toBe(sibling)
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("image")).toBeNull()
    expect(graphic.children[0]).toBe(sibling)
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("image")).toHaveAttribute("href", "https://example.com/photo.png")
  })

  it.each(["removed", "disabled", "locked", "moved into widget"])("ignores an image file drop when the target is %s", state => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "image"})
    const graphic = document.querySelector("svg")!
    const image = graphic.querySelector("image")!
    const data = new DataTransfer()
    data.items.add(new File(["image"], "photo.png", {type: "image/png"}))
    if(state === "removed") graphic.remove()
    else if(state === "disabled") editor.features.graphic.disable()
    else if(state === "locked") vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    else {
      const widget = document.createElement("image-widget")
      graphic.replaceWith(widget)
      widget.append(graphic)
    }
    const createURL = vi.spyOn(editor, "createMediaURL")
    graphic.dispatchEvent(imageDragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}))
    expect(createURL).not.toHaveBeenCalled()
    expect(image.getAttribute("href")).toBeNull()
    expect(graphic.querySelectorAll("image")).toHaveLength(1)
  })

  it("fills an empty image on file drop and removes source controls after external changes", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "image"})
    const image = document.querySelector("svg image")!
    const data = new DataTransfer()
    data.items.add(new File(["image"], "photo.png", {type: "image/png"}))
    const drop = imageDragEvent("drop", {bubbles: true, composed: true, cancelable: true, dataTransfer: data})
    editor.features.media.placeholder.element.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(image.getAttribute("href")).toMatch(/^blob:/))
    expect(document.querySelectorAll("svg image")).toHaveLength(1)
    image.removeAttribute("href")
    await mutationsDelivered()
    expect(editor.features.media.placeholder.target).toBe(image)
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "remote.png")
    await mutationsDelivered()
    expect(editor.features.media.placeholder.target).toBeNull()
    expect(image).not.toHaveClass("◆media-empty")
  })

  it("imports SVG in place, preserving unfamiliar content, and exports without markers", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const old = document.querySelector("svg")!
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toBe(".svg,image/svg+xml")
    expect(document.body.querySelector('input[type="file"]')).toBeNull()
    Object.defineProperty(input, "files", {value: [{name: "drawing.svg", text: async () =>
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 24"><!--keep--><defs><linearGradient id="paint"/></defs><g class="authored ◆selected"><path d="M0 0L5 5"/></g></svg>'}]})
    input.dispatchEvent(new Event("change"))
    await pending
    expect(old.isConnected).toBe(false)
    const source = (await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"}))!
    expect(source).toContain('viewBox="0 0 42 24"')
    expect(source).toContain("<!--keep-->")
    expect(source).toContain("linearGradient")
    expect(source).toContain('class="authored"')
    expect(source).not.toContain("◆")
    expect(input.isConnected).toBe(false)
  })

  it("imports a host-picked SVG at the original graphic with undo and redo", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const target = document.querySelector("svg")!
    target.innerHTML = '<!--original--><path d="M0 0L5 5"/>'
    await mutationsDelivered()
    const click = vi.spyOn(HTMLInputElement.prototype, "click")
    expect(editor.features.graphic.actions.importGraphic({type: "importGraphic", pickerId: "host"})).toBe(true)
    expect(click).not.toHaveBeenCalled()
    expect(editor.appendix.querySelector('input[type="file"]')).toBeNull()
    const sibling = document.createElementNS(SVG_NAMESPACE, "svg")
    document.body.append(sibling)
    editor.features.selection.captureElement(sibling)
    await mutationsDelivered()
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"><!--keep--><g class="authored ◆selected"><circle r="7"/></g></svg>'], "drawing.svg")
    await editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file, pickerId: "host"})
    await mutationsDelivered()
    expect(target.isConnected).toBe(false)
    expect(sibling.isConnected).toBe(true)
    expect(document.querySelector("svg circle")).not.toBeNull()
    const source = await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})
    expect(source).toContain("<!--keep-->")
    expect(source).toContain('class="authored"')
    expect(source).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.features.history.actions.undo({type: "undo"})
    expect(document.querySelector("svg circle")).toBeNull()
    expect(document.querySelector("svg path")).not.toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(document.querySelector("svg circle")).not.toBeNull()
  })

  it.each(["removed", "replaced", "disabled", "locked", "moved into widget", "cancelled", "superseded"])("guards a host graphic import when %s while reading", async condition => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const target = document.querySelector("svg")!
    let finishRead!: (source: string) => void
    const file = new File([""], "drawing.svg")
    vi.spyOn(file, "text").mockImplementation(() => new Promise(resolve => { finishRead = resolve }))
    editor.features.graphic.actions.importGraphic({type: "importGraphic", pickerId: "first"})
    const pending = editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file, pickerId: "first"})
    if(condition === "removed") target.remove()
    else if(condition === "replaced") target.replaceWith(document.createElementNS(SVG_NAMESPACE, "svg"))
    else if(condition === "disabled") editor.features.graphic.disable()
    else if(condition === "locked") vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    else if(condition === "moved into widget") {
      const widget = document.createElement("graphic-widget")
      target.replaceWith(widget)
      widget.append(target)
    }
    else if(condition === "cancelled") await editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file: null, pickerId: "first"})
    else editor.features.graphic.actions.importGraphic({type: "importGraphic", pickerId: "next"})
    finishRead('<svg xmlns="http://www.w3.org/2000/svg"><circle r="7"/></svg>')
    await pending
    expect(document.querySelector("svg circle")).toBeNull()
    expect(editor.appendix.querySelector('input[type="file"]')).toBeNull()
    if(condition === "superseded") {
      await editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file: null, pickerId: "first"})
      await editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file: new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"/></svg>'], "next.svg"), pickerId: "next"})
      expect(document.querySelector("svg rect")).not.toBeNull()
    }
  })

  it("rejects invalid host imports and allows another attempt", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const target = document.querySelector("svg")!
    editor.features.graphic.actions.importGraphic({type: "importGraphic", pickerId: "bad"})
    await expect(editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file: new File(["<html/>"], "bad.svg"), pickerId: "bad"})).rejects.toThrow("valid SVG")
    expect(target.isConnected).toBe(true)
    editor.features.graphic.actions.importGraphic({type: "importGraphic", pickerId: "good"})
    await editor.features.graphic.actions.setGraphicFile({type: "setGraphicFile", file: new File(['<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>'], "good.svg"), pickerId: "good"})
    expect(document.querySelector("svg circle")).not.toBeNull()
  })

  it("strips active SVG content and root attributes on import while preserving safe namespaced content", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [{name: "untrusted.svg", text: async () =>
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:ww="urn:example:widget" viewBox="0 0 42 24" onload="run()" href="javascript:run()" style="background:url(javascript:run())"><!--keep--><g onclick="run()"><ww:widget data-safe="yes"><ww:part/></ww:widget><script>run()</script></g></svg>'}]})
    input.dispatchEvent(new Event("change"))
    await pending

    const source = (await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"}))!
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml")
    const root = parsed.documentElement
    expect(root).toHaveAttribute("viewBox", "0 0 42 24")
    expect(root.hasAttribute("onload")).toBe(false)
    expect(root.hasAttribute("href")).toBe(false)
    expect(root.hasAttribute("style")).toBe(false)
    expect(root.querySelector("script, [onclick]")).toBeNull()
    const widget = root.querySelector("g")?.firstElementChild
    expect(widget?.localName).toBe("widget")
    expect(widget?.namespaceURI).toBe("urn:example:widget")
    expect(widget?.getAttribute("data-safe")).toBe("yes")
    expect(root.childNodes[0].nodeType).toBe(Node.COMMENT_NODE)
    expect(root.childNodes[0].textContent).toBe("keep")
  })

  it("inserts an imported graphic at the selection and supports undo and redo", async () => {
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [{name: "new.svg", text: async () =>
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="12"/></svg>'}]})
    input.dispatchEvent(new Event("change"))
    await pending
    await mutationsDelivered()
    expect(document.querySelector("svg circle")).not.toBeNull()
    editor.features.history.actions.undo({type: "undo"})
    expect(document.querySelector("svg")).toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(document.querySelector("svg circle")).not.toBeNull()
  })

  it("leaves the graphic untouched on invalid SVG and cleans up cancelled imports", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [{name: "bad.svg", text: async () => '<html></html>'}]})
    input.dispatchEvent(new Event("change"))
    await expect(pending).rejects.toThrow()
    expect(graphic.isConnected).toBe(true)
    const cancelled = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    editor.appendix.querySelector('input[type="file"]')!.dispatchEvent(new Event("cancel"))
    await cancelled
    expect(editor.appendix.querySelector('input[type="file"]')).toBeNull()
  })

  it("does not reinsert a graphic removed while a file is being read", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [{name: "drawing.svg", text: async () => {
      graphic.remove()
      return '<svg xmlns="http://www.w3.org/2000/svg"/>'
    }}]})
    input.dispatchEvent(new Event("change"))
    await pending
    expect(document.querySelector("svg")).toBeNull()
  })

  it("does not replace a graphic moved into an atomic widget while a file is being read", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    let finishRead!: (source: string) => void
    const pending = editor.features.graphic.actions.importGraphic({type: "importGraphic"})
    const input = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [{name: "drawing.svg", text: () => new Promise<string>(resolve => {
      finishRead = resolve
    })}]})
    input.dispatchEvent(new Event("change"))

    const widget = document.createElement("demo-graphic-widget")
    document.body.append(widget)
    widget.append(graphic)
    finishRead('<svg xmlns="http://www.w3.org/2000/svg"><circle r="7"/></svg>')
    await pending

    expect(graphic.isConnected).toBe(true)
    expect(widget.querySelector("svg circle")).toBeNull()
  })

  it("shows a move cursor over preset paths inside a captured graphic", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "heart"})
    const graphic = document.querySelector("svg")!
    const path = graphic.querySelector("path")!
    editor.features.selection.captureElement(graphic)

    expect(getComputedStyle(graphic).cursor).toBe("crosshair")
    expect(getComputedStyle(path).cursor).toBe("move")

    const group = document.createElementNS(SVG_NAMESPACE, "g")
    graphic.append(group)
    group.append(path)
    expect(getComputedStyle(path).cursor).toBe("move")

    document.body.classList.add("◆", "◆graphic-panning")
    expect(getComputedStyle(path).cursor).toBe("grabbing")
  })

  it("recognizes labeled shape roots without normalizing unfamiliar SVG groups", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.innerHTML = `
      <g id="unfamiliar"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></g>
      <g id="labeled"><polygon points="50,0 100,50 50,100 0,50"/><text>Choice</text></g>
    `
    document.body.append(graphic)

    const unfamiliar = graphic.querySelector("#unfamiliar")!
    const labeled = graphic.querySelector("#labeled")!
    expect(graphicShapeType(unfamiliar)).toBeNull()
    expect(graphicShapeType(labeled)).toBe("diamond")
    expect(graphicShapeForNode(labeled.querySelector("text"))).toBe(labeled)
    expect(graphicShapeRoots(graphic)).toEqual([
      ...Array.from(unfamiliar.querySelectorAll("rect")),
      labeled,
    ])
    expect(unfamiliar.children).toHaveLength(2)
  })

  it("inserts an empty native 16:9 SVG drawing area", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})

    const graphic = document.querySelector("svg")!
    expect(graphic.namespaceURI).toBe(SVG_NAMESPACE)
    expect(graphic).toHaveAttribute("viewBox", "0 0 1600 900")
    expect(graphic).toHaveAttribute("width", "100%")
    expect(graphic.children).toHaveLength(0)
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.features.graphic.getState()).toMatchObject({active: true, capture: true})
    expect(editor.toHTML(true)).toBe('<svg viewBox="0 0 1600 900" width="100%"></svg>')
  })

  it("floats a freshly inserted empty graphic from its Move handle", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const previousStyle = document.body.getAttribute("style")
    document.body.style.cssText = '--ww-float-width:280px;padding-left:340px;padding-right:340px'
    try {
      vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1400, 700))
      vi.spyOn(graphic, "getBoundingClientRect").mockReturnValue(new DOMRect(340, 20, 720, 405))
      const mover = editor.features.transformation.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!
      expect(mover.draggable).toBe(true)
      expect(editor.features.selection.captureSelectedElement).toBe(graphic)
      const dataTransfer = new DataTransfer()
      vi.spyOn(dataTransfer, "setDragImage").mockImplementation(() => {})
      mover.dispatchEvent(imageDragEvent("dragstart", {dataTransfer, bubbles:true, composed:true, cancelable:true}))
      expect(editor.features.manipulation.draggedElement).toBe(graphic)
      const point = {dataTransfer, clientX:1395, clientY:695, bubbles:true, composed:true, cancelable:true}
      document.body.dispatchEvent(imageDragEvent("dragover", point))
      expect(editor.appendix.querySelector("#◆float-drop-preview")).not.toBeNull()
      document.body.dispatchEvent(imageDragEvent("drop", point))
      expect(graphic).toHaveClass("ww-float-right")
      expect(graphic.style.position).toBe("")
      expect(graphic.children).toHaveLength(0)
      expect(editor.features.manipulation.draggedElement).toBeNull()
    }
    finally {
      if(previousStyle === null) document.body.removeAttribute("style")
      else document.body.setAttribute("style", previousStyle)
    }
  })

  it("uses tight native preset bounds for selection, movement, and size parameters without changing the design frame", async () => {
    await withNativePresetBounds(async () => {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      const graphic = document.querySelector("svg")!
      Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "lightning-bolt"})
      const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!
      const bounds = boundsForPoints(graphicPathGeometry(shape)!.points)
      expect(bounds.width).toBeCloseTo(148.8)
      expect(Number(editor.features.graphic.getState()!.parameters!.x)).toBeCloseTo(bounds.x)
      expect(editor.features.graphic.getState()!.parameters).toMatchObject({width: "148.8", height: "240"})
      const outline = editor.appendix.querySelector(".◆graphic-selection-outline")!
      expect(outline.getAttribute("points")!.split(" ")[0]).toBe(`${bounds.x},${bounds.y}`)
      await mutationsDelivered()
      editor.doc.stopCapturing()
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: String(bounds.x + 50)})
      let after = readGraphicPreset(shape)!
      expect(after.bounds.x).toBeCloseTo(before.bounds.x + 50)
      expect(after.bounds.width).toBeCloseTo(before.bounds.width)
      expect(editor.features.graphic.getState()!.parameters!.width).toBe("148.8")
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "300"})
      after = readGraphicPreset(shape)!
      after.values.forEach((value, i) => expect(value).toBeCloseTo(before.values[i], 5))
      expect(boundsForPoints(graphicPathGeometry(shape)!.points).width).toBeCloseTo(300)
      expect(boundsForPoints(graphicPathGeometry(shape)!.points).x).toBeCloseTo(bounds.x + 50)
      expect(after.bounds.width).toBeCloseTo(before.bounds.width * 300 / bounds.width)
    })
  })

  it("fits detached preset insertion to native curve bounds and removes its appendix measurement", async () => {
    await withNativePresetBounds(() => {
      const graphic = editor.features.graphic.createGraphic("terminator")
      const path = graphic.querySelector("path")!, preset = readGraphicPreset(path)!
      expect(preset.bounds.width).toBeCloseTo(240)
      expect(preset.bounds.height).toBeCloseTo(240)
      expect(graphic).toHaveAttribute("viewBox", "693 388 214 124")
      expect(graphic).toHaveAttribute("width", "214")
      expect(graphic).toHaveAttribute("height", "124")
      expect(graphic.isConnected).toBe(false)
      expect(graphic.classList.length).toBe(0)
      expect(editor.appendix.querySelector(".◆graphic-measurement")).toBeNull()
      expect(editor.toHTML(true)).not.toContain("◆graphic-measurement")
    })
  })

  it("refreshes tight curve bounds after a POI change and undo without altering the preset frame", async () => {
    await withNativePresetBounds(async () => {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "terminator"})
      const path = document.querySelector("svg path")!, before = readGraphicPreset(path)!
      expect(editor.features.graphic.getState()!.parameters!.width).toBe("210")
      await mutationsDelivered()
      editor.doc.stopCapturing()
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-roundness", value: "45"})
      await mutationsDelivered()
      for(const key of ["x", "y", "width", "height"] as const) expect(readGraphicPreset(path)!.bounds[key]).toBeCloseTo(before.bounds[key], 5)
      expect(editor.features.graphic.getState()!.parameters).toMatchObject({width: "186", height: "120"})
      editor.doc.undo()
      expect(editor.features.graphic.getState()!.parameters!.width).toBe("210")
      editor.doc.redo()
      expect(editor.features.graphic.getState()!.parameters!.width).toBe("186")
    })
  })

  it.each([false, true])("resizes a rotated preset's tight bounds without preview drift (from center: %s)", async fromCenter => {
    await withNativePresetBounds(async () => {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      const graphic = document.querySelector("svg")!
      Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "lightning-bolt"})
      const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
      const {bounds: frame} = before, bounds = boundsForPoints(graphicPathGeometry(shape)!.points)
      const center = {x: frame.x + frame.width / 2, y: frame.y + frame.height / 2}
      shape.setAttribute("transform", `rotate(90 ${center.x} ${center.y})`)
      editor.features.graphic.refresh()
      await mutationsDelivered()
      editor.doc.stopCapturing()
      const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="resize-se"]')!
      const pointer = {bubbles: true, composed: true, button: 0, pointerId: 55, altKey: true, ctrlKey: fromCenter}
      handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
      for(const factor of [.5, 1, 1]) {
        const target = {x: bounds.x + bounds.width + 30 * factor, y: bounds.y + bounds.height + 40 * factor}
        document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: center.x - (target.y - center.y), clientY: center.y + (target.x - center.x)}))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      const preview = editor.appendix.querySelector(".◆graphic-preview path")!
      const previewBounds = boundsForPoints(graphicPathGeometry(preview)!.points)
      handle.dispatchEvent(new PointerEvent("pointerup", pointer))
      const after = boundsForPoints(graphicPathGeometry(shape)!.points)
      expect(after.width).toBeCloseTo(bounds.width + (fromCenter ? 60 : 30), 3)
      expect(after.height).toBeCloseTo(bounds.height + (fromCenter ? 80 : 40), 3)
      for(const key of ["x", "y", "width", "height"] as const) expect(after[key]).toBeCloseTo(previewBounds[key], 3)
      const nextFrame = readGraphicPreset(shape)!.bounds
      const nextCenter = {x: nextFrame.x + nextFrame.width / 2, y: nextFrame.y + nextFrame.height / 2}
      const anchor = fromCenter ? {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2} : bounds
      const nextAnchor = fromCenter ? {x: after.x + after.width / 2, y: after.y + after.height / 2} : after
      expect(nextCenter.x - (nextAnchor.y - nextCenter.y)).toBeCloseTo(center.x - (anchor.y - center.y), 3)
      expect(nextCenter.y + (nextAnchor.x - nextCenter.x)).toBeCloseTo(center.y + (anchor.x - center.x), 3)
      await mutationsDelivered()
      editor.doc.undo()
      expect(shape).toHaveAttribute("d", original)
      editor.doc.redo()
      expect(boundsForPoints(graphicPathGeometry(shape)!.points).width).toBeCloseTo(after.width, 3)
      expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
      expect(editor.toHTML(true)).not.toContain("◆")
    })
  })

  it.each([
    ["line-start-arrow", true, false],
    ["line-end-arrow", false, true],
    ["line-both-arrows", true, true],
  ] as const)("inserts %s as a straight connector with arrow markers, paint and undo", async (type, start, end) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type, paint: {fill: "#ff0000", stroke: "#123456", "stroke-width": "8"}})
    const connector = graphic.querySelector("polyline")!
    expect(graphicShapeRoots(graphic)).toEqual([connector])
    const points = connector.getAttribute("points")!.split(/\s+/).map(point => point.split(",").map(Number))
    expect(points).toHaveLength(2)
    expect(points[0][1]).toBe(points[1][1])
    expect(points[0][0]).toBeLessThan(points[1][0])
    expect(connector).toHaveAttribute("fill", "none")
    expect(connector).toHaveAttribute("stroke", "#123456")
    expect(connector).toHaveAttribute("stroke-width", "8")
    expect(connector.hasAttribute("marker-start")).toBe(start)
    expect(connector.hasAttribute("marker-end")).toBe(end)
    expect(graphic.querySelectorAll("marker")).toHaveLength(1)
    expect(graphic.querySelector("marker")).toHaveAttribute("orient", "auto-start-reverse")
    expect(graphic.querySelector("marker")).toHaveAttribute("refX", "5")
    expect(connector).toHaveAttribute("stroke-linecap", "butt")
    expect(graphic.querySelector("marker path")).toHaveAttribute("fill", "context-stroke")
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "connector", parameters: {routing: "straight", "start-arrow": String(start), "end-arrow": String(end)},
    })
    expect(editor.appendix.querySelector('[data-graphic-handle="connector-start"]')).not.toBeNull()
    expect(editor.appendix.querySelector('[data-graphic-handle="connector-end"]')).not.toBeNull()
    expect(Boolean(editor.appendix.querySelector('[data-graphic-handle="arrowhead-start"]'))).toBe(start)
    expect(Boolean(editor.appendix.querySelector('[data-graphic-handle="arrowhead-end"]'))).toBe(end)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "routing", value: "orthogonal"})
    expect(connector.getAttribute("points")!.split(/\s+/)).toHaveLength(4)
    expect(connector.hasAttribute("marker-start")).toBe(start)
    expect(connector.hasAttribute("marker-end")).toBe(end)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "routing", value: "straight"})
    const serialized = new DOMParser().parseFromString(editor.toHTML(true), "text/html")
    expect(graphicShapeType(serialized.querySelector("polyline"))).toBe("connector")
    for(const endpoint of ["start", "end"]) {
      const reference = serialized.querySelector("polyline")!.getAttribute(`marker-${endpoint}`)
      if(reference) expect(serialized.getElementById(reference.slice(5, -1))?.localName).toBe("marker")
    }
    await mutationsDelivered()
    editor.doc.undo()
    expect(graphic.querySelector("polyline, defs")).toBeNull()
    editor.doc.redo()
    expect(graphic.querySelector("polyline")!.hasAttribute("marker-start")).toBe(start)
    expect(graphic.querySelector("polyline")!.hasAttribute("marker-end")).toBe(end)
    expect(graphic.querySelectorAll("marker")).toHaveLength(1)
  })

  it.each(["line-start-arrow", "line-end-arrow", "line-both-arrows"] as const)("includes standalone %s arrowheads in its fitted viewport and preview", shape => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape})
    const graphic = document.querySelector("svg")!
    expect(graphic.style.overflow).toBe("visible")
    expect(graphic).toHaveAttribute("preserveAspectRatio", "xMidYMid meet")
    expect(Number(graphic.getAttribute("height"))).toBeGreaterThanOrEqual(36)
    const source = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    source.body.classList.add("ww-canvas")
    const preview = new DOMParser().parseFromString(previewFrameHTML(source, {
      bridgeNonce: "arrow-preview", hostOrigin: location.origin, frameOrigin: location.origin,
      packages: [], importMap: null, entryURL: "", executeScripts: false,
    }), "text/html")
    const copy = preview.querySelector("svg")!
    expect(copy.style.overflow).toBe("visible")
    expect(copy.querySelector("polyline")!.outerHTML).toBe((clearEditorMarkerClasses(graphic.querySelector("polyline")!.cloneNode(true)) as Element).outerHTML)
    expect(copy.querySelector("defs")?.outerHTML).toBe(graphic.querySelector("defs")?.outerHTML)
    expect(copy.outerHTML).not.toContain("◆")
  })

  it("sizes arrowheads independently without changing shared heads or connector endpoints", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows"})
    const [first, other] = [...graphic.querySelectorAll("polyline")]
    clickShape(first)
    const points = first.getAttribute("points")
    const marker = (shape: Element, end: string) => graphic.querySelector(`[id="${shape.getAttribute(`marker-${end}`)!.slice(5, -1)}"]`)!
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "start-arrow-size", value: "12"})
    await mutationsDelivered()
    expect(marker(first, "start")).toHaveAttribute("markerWidth", "12")
    expect(marker(first, "start")).toHaveAttribute("markerHeight", "12")
    for(const shape of [first, other]) expect(marker(shape, "end")).toHaveAttribute("markerWidth", "6")
    expect(marker(other, "start")).toHaveAttribute("markerWidth", "6")
    expect(first).toHaveAttribute("points", points!)
    expect(editor.features.graphic.getState()!.parameters).toMatchObject({"start-arrow-size": "12", "end-arrow-size": "6"})
    editor.doc.undo()
    expect(graphic.querySelectorAll("marker")).toHaveLength(1)
    expect(marker(graphic.querySelector("polyline")!, "start")).toHaveAttribute("markerWidth", "6")
    editor.doc.redo()
    const reloaded = new DOMParser().parseFromString(editor.toHTML(true), "text/html")
    expect(reloaded.querySelectorAll("marker")).toHaveLength(2)
    expect(reloaded.body.innerHTML).not.toContain("◆")
    clickShape(graphic.querySelector("polyline")!)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow-size", value: "-10"})
    expect(marker(graphic.querySelector("polyline")!, "end")).toHaveAttribute("markerWidth", "2")
    expect(marker(graphic.querySelector("polyline")!, "start")).toHaveAttribute("markerWidth", "12")
  })

  it("preserves unfamiliar authored arrowhead definitions when a size command cannot edit them", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<defs><marker id="custom-head" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="purple"/></marker></defs><polyline points="100,100 300,100" marker-end="url(#custom-head)"/>'
    const marker = graphic.querySelector("marker")!, original = marker.outerHTML
    clickShape(graphic.querySelector("polyline")!)
    expect(editor.appendix.querySelector('[data-graphic-handle="arrowhead-end"]')).toBeNull()
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow-size", value: "12"})
    expect(marker.outerHTML).toBe(original)
    expect(graphic.querySelector("polyline")).toHaveAttribute("marker-end", "url(#custom-head)")
  })

  it.each(["commit", "cancel", "replace", "remote", "destroy"])("previews arrowhead sizing only in the appendix and cleans up on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows"})
    const connector = graphic.querySelector("polyline")!
    connector.setAttribute("points", "100,100 300,100")
    clickShape(connector)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="arrowhead-end"]')!
    expect(handle).not.toBeNull()
    expect(handle.getAttribute("part")).toContain("graphic-affordance")
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 282, clientY: 82}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 264, clientY: 64}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(graphic.querySelectorAll("marker")).toHaveLength(1)
    expect(graphic.querySelector("marker")).toHaveAttribute("markerWidth", "6")
    expect(editor.appendix.querySelector('.◆graphic-preview marker[markerWidth="12"]')).not.toBeNull()
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") connector.replaceWith(connector.cloneNode(true))
    if(outcome === "remote") graphic.querySelector("marker")!.setAttribute("markerWidth", "8")
    if(outcome === "destroy") editor.features.graphic.disable()
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(graphic.querySelectorAll("marker")).toHaveLength(outcome === "commit" ? 2 : 1)
    expect(editor.appendix.querySelector('.◆graphic-preview')).toBeNull()
    expect(document.querySelector('.◆graphic-preview-source')).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
    if(outcome === "commit") {
      expect(graphic.querySelector('marker[markerWidth="12"]')).not.toBeNull()
      expect(connector).toHaveAttribute("points", "100,100 300,100")
      editor.doc.undo()
      expect(graphic.querySelectorAll("marker")).toHaveLength(1)
      editor.doc.redo()
      expect(graphic.querySelectorAll("marker")).toHaveLength(2)
    }
    if(outcome === "remote") expect(graphic.querySelector("marker")).toHaveAttribute("markerWidth", "8")
  })

  it.each([false, true])("selects a connector through its arrowhead and includes both heads in its outline (rotated: %s)", rotated => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows"})
    const connector = graphic.querySelector("polyline")!
    connector.setAttribute("points", "100,100 300,100")
    if(rotated) connector.setAttribute("transform", "rotate(90 200 100)")
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 700, clientY: 700}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    expect(editor.features.graphic.selectedShape).toBeNull()
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: rotated ? 200 : 315, clientY: rotated ? 215 : 100}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    expect(editor.features.graphic.selectedShape).toBe(connector)
    expect(editor.appendix.querySelector('.◆graphic-selection-outline')).toHaveAttribute("points", rotated
      ? "218,-18 218,218 182,218 182,-18"
      : "82,82 318,82 318,118 82,118")
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="arrowhead-"]')).toHaveLength(2)
  })

  it("uses document flow when inserting a shape through its command", () => {
    document.body.innerHTML = '<p>before</p><p></p><p>after</p>'
    $.move(document.body.children[1])
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    expect(graphic.style.position).toBe("")
    expect(Array.from(document.body.children).map(element => element.localName)).toEqual(["p", "svg", "p"])
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "120"})
    expect(graphic.style.position).toBe("")
  })

  it.each(["canvas", "slides"] as const)("uses the %s placement path for shape commands", layout => {
    expect(editor.setDocumentLayout(layout, "document")).toBe(true)
    try {
      const root = layout === "canvas" ? document.body : document.querySelector(".ww-slide")!
      $.move(root, root.childNodes.length)
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
      const graphic = root.querySelector("svg")!
      expect(graphic.style.position).toBe("absolute")
      expect(graphic.style.left).not.toBe("")
      expect(graphic.style.top).not.toBe("")
      expect($.selectedElement).toBe(graphic)
    }
    finally { editor.setDocumentLayout("document", layout) }
  })

  it.each(insertionOptions)("inserts a $label graphic with its shape selected inside capture", option => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: option.type})

    const graphic = document.querySelector("svg")!
    const shape = graphicShapeRoots(graphic)[0]!
    expect(Number(graphic.getAttribute("width"))).toBeGreaterThan(0)
    expect(graphic).toHaveStyle({
      width: `${graphic.getAttribute("width")}px`,
      height: `${graphic.getAttribute("height")}px`,
    })
    expect(graphic.style.position).toBe("")
    expect(graphic).toHaveAttribute("overflow", "visible")
    expect(graphic.getAttribute("viewBox")).not.toBe("0 0 1600 900")
    expect(shape.namespaceURI).toBe(SVG_NAMESPACE)
    const polygonal = ["triangle", "diamond", "hexagon", "star", "arrow", "polygon"].includes(option.type)
    expect(shape.localName).toBe(option.type === "text-box" ? "g" : isGraphicPresetType(option.type) ? "path" : option.type === "connector" || option.type.startsWith("line-") ? "polyline" : polygonal ? "polygon" : option.type)
    if(option.type !== "image") expect(shape.localName === "g" ? shape.firstElementChild : shape).toHaveAttribute("stroke")
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-selected", "◆element-capture-selected", "◆graphic-grid-visible")
    expect(editor.features.transformation.target).toBe(graphic)
    expect(editor.features.graphic.selectedShape).toBe(shape)
    expect(shape).toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({capture: true, selectionCount: 1})
    expect(editor.appendix.querySelector('[part~="selection-caret-capture"]')).not.toBeNull()
    expect(editor.appendix.querySelector('[part~="atomic-selection-overlay"]')).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-overlay')).not.toHaveAttribute("hidden")
    if(option.type !== "image") expect(editor.appendix.querySelectorAll('.◆graphic-specific-handles button').length).toBeGreaterThan(0)
    expect(editor.appendix.querySelector('.◆graphic-ports')?.children).toHaveLength(["line", "connector"].includes(graphicShapeType(shape)!) ? 0 : 4)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(document.body.querySelector('[data-graphic-handle]')).toBeNull()
    if(isGraphicPresetType(option.type)) expect(shape.localName === "g" ? shape.firstElementChild : shape).toHaveAttribute("fill-rule", graphicPresetFillRule(option.type))
    if(option.type === "text-box") expect(shape.querySelector("text")).toHaveTextContent("Text")
  })

  it("repairs an existing cylinder when filled and restores its old geometry on undo", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<!--keep--><path aria-label="Cylinder" d="M 5 18 C 5 2 95 2 95 18 L 95 84 C 95 98 5 98 5 84 Z M 5 18 C 5 34 95 34 95 18" fill="#fff" fill-rule="evenodd"/><g><title>Other content</title></g>'
    const path = graphic.querySelector("path")!
    const original = path.getAttribute("d")!
    const sibling = graphic.lastElementChild!
    clickShape(path)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "fill", value: "#ef4444"})
    await mutationsDelivered()
    expect(path).toHaveAttribute("fill-rule", "nonzero")
    expect(path).toHaveAttribute("fill", "#ef4444")
    expect(path.getAttribute("d")).not.toBe(original)
    expect(readGraphicPreset(path)?.type).toBe("cylinder")
    expect(graphic.lastElementChild).toBe(sibling)
    expect(graphic.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(editor.toHTML(true)).not.toContain("◆")
    editor.doc.undo()
    expect(graphic.querySelector("path")).toHaveAttribute("d", original)
    expect(graphic.querySelector("path")).toHaveAttribute("fill-rule", "evenodd")
    editor.doc.redo()
    expect(graphic.querySelector("path")).toHaveAttribute("fill-rule", "nonzero")
    expect(graphic.querySelector("path")).toHaveAttribute("fill", "#ef4444")
  })

  it.each([0, 90].flatMap(rotation => [.5, 2].map(scale => ({rotation, scale}))))("dodges resize handles at POI endpoints without a drag jump ($rotation degrees, scale $scale)", async ({rotation, scale}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "donut"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: scale, b: 0, c: 0, d: scale, e: 30, f: 40})})
    const bounds = {x: 120, y: 140, width: 240, height: 160}
    writeGraphicPreset(shape, readGraphicPreset(shape)!, bounds, [50])
    const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    if(rotation) shape.setAttribute("transform", `rotate(${rotation} ${center.x} ${center.y})`)
    const toClient = (point: {x: number, y: number}) => {
      const rotated = rotation ? {x: center.x - (point.y - center.y), y: center.y + (point.x - center.x)} : point
      return {x: rotated.x * scale + 30, y: rotated.y * scale + 40}
    }
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-hole"]')!
    const natural = toClient(graphicPresetHandles(readGraphicPreset(shape)!)[0].point)
    const start = {x: parseFloat(handle.style.left), y: parseFloat(handle.style.top)}
    expect(start.x).toBeCloseTo(natural.x)
    expect(start.y).toBeCloseTo(natural.y - 16)
    const original = shape.getAttribute("d")!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 96}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: start.x, clientY: start.y}))
    const target = toClient(center)
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y - 16}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(0)
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(0)
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-hole", value: "25"})
    editor.features.graphic.refresh()
    const free = toClient(graphicPresetHandles(readGraphicPreset(shape)!)[0].point)
    expect(parseFloat(handle.style.left)).toBeCloseTo(free.x)
    expect(parseFloat(handle.style.top)).toBeCloseTo(free.y)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  })

  it.each([0, 50])("separates coincident corner POIs from each other and resize handles at radius %s", radius => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rounded-rectangle"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: .1, b: 0, c: 0, d: .1, e: 0, f: 0})})
    writeGraphicPreset(shape, readGraphicPreset(shape)!, {x: 120, y: 140, width: 240, height: 160}, [radius, radius, radius, radius])
    const original = shape.getAttribute("d")!
    editor.features.graphic.refresh()
    const point = (handle: HTMLElement) => ({x: parseFloat(handle.style.left), y: parseFloat(handle.style.top)})
    const handles = [...editor.appendix.querySelectorAll<HTMLElement>('[data-graphic-handle^="adjust-"]')]
    expect(handles).toHaveLength(4)
    const occupied = [...editor.appendix.querySelectorAll<HTMLElement>('[data-graphic-handle^="resize-"], [data-graphic-handle="rotate"]')].filter(handle => !handle.hidden).map(point)
    for(const handle of handles) {
      const displayed = point(handle)
      for(const other of occupied) expect(Math.hypot(displayed.x - other.x, displayed.y - other.y)).toBeGreaterThanOrEqual(16 - .0001)
      occupied.push(displayed)
    }
    expect(shape).toHaveAttribute("d", original)
  })

  it.each([
    {label: "Shift", shiftKey: true, metaKey: false, ctrlKey: false, affected: [0, 1], rotation: 0},
    {label: "Ctrl", shiftKey: false, metaKey: false, ctrlKey: true, affected: [0, 3], rotation: 0},
    {label: "Cmd", shiftKey: false, metaKey: true, ctrlKey: false, affected: [0, 3], rotation: 0},
    {label: "Shift+Ctrl", shiftKey: true, metaKey: false, ctrlKey: true, affected: [0, 1, 2, 3], rotation: 0},
    {label: "rotated Shift", shiftKey: true, metaKey: false, ctrlKey: false, affected: [0, 1], rotation: 90},
    {label: "rotated Cmd", shiftKey: false, metaKey: true, ctrlKey: false, affected: [0, 3], rotation: 90},
    {label: "rotated Shift+Cmd", shiftKey: true, metaKey: true, ctrlKey: false, affected: [0, 1, 2, 3], rotation: 90},
  ])("mirrors corner POIs with $label in local coordinates and one undo group", async modifiers => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rounded-rectangle"})
    const shape = graphic.querySelector("path")!
    const before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    const {bounds} = before
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
    if(modifiers.rotation) shape.setAttribute("transform", `rotate(90 ${cx} ${cy})`)
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-radius"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 51, ...modifiers}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
    const target = {x: bounds.x + bounds.width * .3, y: bounds.y}
    const client = modifiers.rotation ? {x: cx - (target.y - cy), y: cy + (target.x - cx)} : target
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: client.x, clientY: client.y}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const expected = before.values.map((value, index) => modifiers.affected.includes(index) ? 30 : value)
    const preview = editor.appendix.querySelector(".◆graphic-preview path")!
    readGraphicPreset(preview)!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    readGraphicPreset(shape)!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("updates mirrored POI previews when modifiers change during a stationary drag", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rounded-rectangle"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    const {bounds} = readGraphicPreset(shape)!
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-radius"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 52}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: bounds.x + bounds.width * .12, clientY: bounds.y}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: bounds.x + bounds.width * .3, clientY: bounds.y}))
    const check = async (expected: number[]) => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const preview = editor.appendix.querySelector(".◆graphic-preview path")!
      readGraphicPreset(preview)!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    }
    await check([30, 12, 12, 12])
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Shift", shiftKey: true, bubbles: true}))
    await check([30, 30, 12, 12])
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Control", shiftKey: true, ctrlKey: true, bubbles: true}))
    await check([30, 30, 30, 30])
    document.dispatchEvent(new KeyboardEvent("keyup", {key: "Shift", ctrlKey: true, bubbles: true}))
    await check([30, 12, 12, 30])
    document.dispatchEvent(new KeyboardEvent("keyup", {key: "Control", bubbles: true}))
    await check([30, 12, 12, 12])
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    readGraphicPreset(shape)!.values.forEach((value, i) => expect(value).toBeCloseTo([30, 12, 12, 12][i], 3))
  })

  it.each([
    {type: "square-rectangle", handle: "path-point-0", right: 1, bottom: 3, diagonal: 2},
    {type: "hexagon", handle: "vertex-0", right: 1, bottom: 4, diagonal: 3},
    {type: "triangle", handle: "vertex-0", right: -1, bottom: -1, diagonal: -1},
  ] as const)("mirrors opposite $type vertex POIs while leaving unpaired vertices unchanged", async ({type, handle: name, right, bottom, diagonal}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
    const shape = graphic.firstElementChild!
    const frame = readGraphicPreset(shape)?.bounds
    const before = type === "square-rectangle" && frame ? [
      {x: frame.x, y: frame.y}, {x: frame.x + frame.width, y: frame.y},
      {x: frame.x + frame.width, y: frame.y + frame.height}, {x: frame.x, y: frame.y + frame.height},
    ] : shape.getAttribute("points")!.split(" ").map(pair => {const [x, y] = pair.split(",").map(Number); return {x, y}})
    const original = shape.outerHTML
    const handle = editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 53, shiftKey: true, metaKey: true, altKey: true}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: before[0].x, clientY: before[0].y}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: before[0].x + 20, clientY: before[0].y + 10}))
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    const after = shape.localName === "path" ? graphicPathGeometry(shape)!.points
      : shape.getAttribute("points")!.split(" ").map(pair => {const [x, y] = pair.split(",").map(Number); return {x, y}})
    after.forEach((point, i) => {
      const dx = i === 0 || i === bottom ? 20 : i === right || i === diagonal ? -20 : 0
      const dy = i === 0 || i === right ? 10 : i === bottom || i === diagonal ? -10 : 0
      expect(point.x).toBeCloseTo(before[i].x + dx, 4)
      expect(point.y).toBeCloseTo(before[i].y + dy, 4)
    })
    expect(shape.outerHTML).not.toBe(original)
    await mutationsDelivered()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("mirrors paired curve-control POIs without moving their anchors", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    graphic.innerHTML = '<g><!--keep--><path d="M 0 50 C 25 0 75 100 100 50" fill="none" stroke="black"/></g>'
    const shape = graphic.querySelector("path")!
    clickShape(shape)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-1"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 54, shiftKey: true, ctrlKey: true, altKey: true}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: 25, clientY: 0}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: 35, clientY: -10}))
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    expect(graphicPathGeometry(shape)!.points).toEqual([{x: 0, y: 50}, {x: 35, y: -10}, {x: 65, y: 110}, {x: 100, y: 50}])
    expect(graphic.querySelector("g")!.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
  })

  it.each((["rectangular-callout", "rounded-rectangular-callout", "oval-callout", "cloud-callout", "line-callout-1", "line-callout-2"] as const).flatMap(type => [0, 90].map(rotation => ({type, rotation}))))("drags one $type connector tip at rotation $rotation with coupled attachment, preview and undo", async ({type, rotation}) => {
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic,"getScreenCTM",{configurable:true,value:() => ({a:1,b:0,c:0,d:1,e:0,f:0})})
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
    const shape = graphic.querySelector("path")!, frame = readGraphicPreset(shape)!.bounds
    if(rotation) shape.setAttribute("transform",`rotate(${rotation} ${frame.x+frame.width/2} ${frame.y+frame.height/2})`)
    editor.features.graphic.refresh()
    graphic.prepend(document.createComment("keep"))
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    expect(before.values).toHaveLength(3)
    expect(editor.appendix.querySelectorAll(".◆graphic-specific-handles button")).toHaveLength(2)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-end-x"]')!
    const start = {x:parseFloat(handle.style.left),y:parseFloat(handle.style.top)}
    const pointer = {bubbles:true,composed:true,button:0,pointerId:72}
    const delta = {x:frame.width*.12,y:-frame.height*.08}
    handle.dispatchEvent(new PointerEvent("pointerdown",{...pointer,clientX:start.x,clientY:start.y}))
    document.dispatchEvent(new PointerEvent("pointermove",{...pointer,buttons:1,
      clientX:start.x+(rotation ? -delta.y : delta.x),clientY:start.y+(rotation ? delta.x : delta.y)}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(shape).toHaveAttribute("d",original)
    const preview = readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!
    expect(preview.values[0]).toBeCloseTo(before.values[0]+12,3)
    expect(preview.values[1]).toBeCloseTo(before.values[1]-8,3)
    expect(preview.values[2]).toBeCloseTo(before.values[2],3)
    document.dispatchEvent(new PointerEvent("pointerup",pointer))
    await mutationsDelivered()
    const after = readGraphicPreset(shape)!, edited = shape.getAttribute("d")!
    expect(after.values[0]).toBeCloseTo(before.values[0]+12,3)
    expect(after.values[1]).toBeCloseTo(before.values[1]-8,3)
    expect(after.values[2]).toBeCloseTo(before.values[2],3)
    editor.doc.undo()
    expect(shape).toHaveAttribute("d",original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d",edited)
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })


  it.each([0, 35].flatMap(rotation => [
    {rotation, index: 0, start: 0, sweep: 240, samples: [330, 300, 240], expected: [240, 360]},
    {rotation, index: 1, start: 0, sweep: 240, samples: [300, 359, 360], expected: [0, 360]},
    {rotation, index: 0, start: 355, sweep: 90, samples: [358, 360, 370], expected: [10, 75]},
    {rotation, index: 1, start: 355, sweep: 90, samples: [470, 600, 714, 715], expected: [355, 360]},
    {rotation, index: 1, start: 0, sweep: 360, samples: [359, 300, 180, 90], expected: [0, 90]},
    {rotation, index: 1, start: 0, sweep: 45, samples: [10, .5], expected: [0, .5]},
  ]))("drags Chord endpoint $index from $start/$sweep at rotation $rotation with a fixed ellipse and undo", async ({rotation, index, start, sweep, samples, expected}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "chord"})
    const shape = graphic.querySelector("path")!, bounds = {x: 80, y: 60, width: 260, height: 170}
    writeGraphicPreset(shape, readGraphicPreset(shape)!, bounds, [start, sweep])
    shape.setAttribute("id", "authored-chord")
    const center = {x: bounds.x + bounds.width/2, y: bounds.y + bounds.height/2}, radians = rotation * Math.PI/180
    if(rotation) shape.setAttribute("transform", `rotate(${rotation} ${center.x} ${center.y})`)
    const at = (angle: number) => {
      const theta = angle * Math.PI/180
      const x = -Math.sin(theta)*bounds.width/2, y = -Math.cos(theta)*bounds.height/2
      return {x: center.x + x*Math.cos(radians) - y*Math.sin(radians), y: center.y + x*Math.sin(radians) + y*Math.cos(radians)}
    }
    graphic.prepend(document.createComment("keep"))
    editor.features.graphic.refresh()
    const controls = [...editor.appendix.querySelectorAll<HTMLElement>('.◆graphic-specific-handles [data-graphic-handle]')]
    expect(controls).toHaveLength(2)
    if(sweep === 360) expect(Math.hypot(parseFloat(controls[0].style.left) - parseFloat(controls[1].style.left),
      parseFloat(controls[0].style.top) - parseFloat(controls[1].style.top))).toBeGreaterThanOrEqual(16 - .0001)
    const guide = editor.appendix.querySelector<SVGEllipseElement>(".◆graphic-ellipse-guide")!
    expect(guide).toHaveAttribute("display", "none")
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!, fixed = graphicPresetHandles(before)[1-index].point
    const handle = controls[index], pointer = {bubbles: true, composed: true, button: 0, pointerId: 94}
    const natural = at(start + (index ? sweep : 0))
    const offset = {x: parseFloat(handle.style.left) - natural.x, y: parseFloat(handle.style.top) - natural.y}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
    expect(guide).not.toHaveAttribute("display", "none")
    const guideFrame = guide.getAttribute("transform")!.match(/[-+]?(?:\d*\.)?\d+/g)!.map(Number)
    for(const angle of samples) {
      const target = at(angle)
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x + offset.x, clientY: target.y + offset.y}))
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!
    preview.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    for(const key of ["x", "y", "width", "height"] as const) expect(preview.bounds[key]).toBeCloseTo(bounds[key], 4)
    const retained = graphicPresetHandles(preview)[1-index].point
    expect(retained.x).toBeCloseTo(fixed.x, 4)
    expect(retained.y).toBeCloseTo(fixed.y, 4)
    guide.getAttribute("transform")!.match(/[-+]?(?:\d*\.)?\d+/g)!.map(Number).forEach((value, i) => expect(value).toBeCloseTo(guideFrame[i], 4))
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    readGraphicPreset(shape)!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(guide).toHaveAttribute("display", "none")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(shape).toHaveAttribute("id", "authored-chord")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["cancel", "replace"])("cleans the Chord ellipse guide and preview after %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "chord"})
    const graphic = document.querySelector("svg")!, shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.refresh()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-sweep"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 95}
    const original = shape.getAttribute("d")!
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: parseFloat(handle.style.left) + 30, clientY: parseFloat(handle.style.top) + 20}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    else shape.replaceWith(clearEditorMarkerClasses(shape.cloneNode(true)))
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    expect(graphic.querySelector("path")).toHaveAttribute("d", original)
    expect(editor.appendix.querySelector(".◆graphic-ellipse-guide")).toHaveAttribute("display", "none")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([
    ...[0, 90].flatMap(rotation => [0, 360].map(sweep => ({rotation, sweep, batched: false, centerRelease: false}))),
    {rotation: 90, sweep: 0, batched: true, centerRelease: false},
    {rotation: 0, sweep: 90, batched: true, centerRelease: true},
  ])("drags the Pie circularly to $sweep degrees at rotation $rotation with undo/redo (batched: $batched, center: $centerRelease)", async ({rotation, sweep, batched, centerRelease}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "pie"})
    const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    const {bounds} = before, center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    expect(before.values[0]).toBeCloseTo(270)
    if(rotation) shape.setAttribute("transform", `rotate(90 ${center.x} ${center.y})`)
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-sweep"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 59}
    const natural = graphicPresetHandles(before)[0].point
    const initial = rotation ? {x: center.x - (natural.y - center.y), y: center.y + (natural.x - center.x)} : natural
    const offset = {x: parseFloat(handle.style.left) - initial.x, y: parseFloat(handle.style.top) - initial.y}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
    for(const angle of sweep === 360 ? [300, 359, 360] : sweep === 90 ? [180, 90] : [180, 90, 10, 0]) {
      const radians = angle * Math.PI / 180
      const local = {x: center.x - Math.sin(radians) * bounds.width / 2, y: center.y - Math.cos(radians) * bounds.height / 2}
      const target = rotation ? {x: center.x - (local.y - center.y), y: center.y + (local.x - center.x)} : local
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x + offset.x, clientY: target.y + offset.y}))
      if(!batched) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(angle, 3)
      }
      expect(shape).toHaveAttribute("d", original)
    }
    if(batched) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(sweep, 3)
    }
    if(centerRelease) {
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: center.x + offset.x, clientY: center.y + offset.y}))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(sweep, 3)
    }
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(sweep, 3)
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([
    {label: "independent", shiftKey: false, ctrlKey: false, metaKey: false, rotation: 0},
    {label: "Shift", shiftKey: true, ctrlKey: false, metaKey: false, rotation: 0},
    {label: "Ctrl", shiftKey: false, ctrlKey: true, metaKey: false, rotation: 0},
    {label: "Cmd", shiftKey: false, ctrlKey: false, metaKey: true, rotation: 0},
    {label: "Shift+Ctrl", shiftKey: true, ctrlKey: true, metaKey: false, rotation: 0},
    {label: "rotated Shift", shiftKey: true, ctrlKey: false, metaKey: false, rotation: 90},
    {label: "rotated Cmd", shiftKey: false, ctrlKey: false, metaKey: true, rotation: 90},
  ].flatMap(modifiers => [0, 1].map(index => ({...modifiers, index}))))("drags Lightning bolt POI $index with $label and preserves undo/redo", async modifiers => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "lightning-bolt"})
    const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    const {bounds} = before, center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    if(modifiers.rotation) shape.setAttribute("transform", `rotate(90 ${center.x} ${center.y})`)
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handles = editor.appendix.querySelectorAll<HTMLElement>('[data-graphic-handle^="adjust-"]')
    expect(handles).toHaveLength(2)
    const handle = handles[modifiers.index]
    const points = graphicPathGeometry(shape)!.points
    const corner = points[modifiers.index === 0 ? 1 : 4]
    const toClient = (point: {x: number, y: number}) => modifiers.rotation ? {x: center.x - (point.y - center.y), y: center.y + (point.x - center.x)} : point
    const start = toClient(corner)
    expect(parseFloat(handle.style.left)).toBeCloseTo(start.x, 2)
    expect(parseFloat(handle.style.top)).toBeCloseTo(start.y, 2)
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 58, shiftKey: modifiers.shiftKey, ctrlKey: modifiers.ctrlKey, metaKey: modifiers.metaKey}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: start.x, clientY: start.y}))
    const target = toClient({x: corner.x + (modifiers.index === 0 ? 1 : -1) * bounds.width * .05, y: corner.y + bounds.height * .2})
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const mirrored = modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey
    const expected = before.values.map((value, i) => value + (i === modifiers.index || mirrored ? 5 : 0))
    readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    readGraphicPreset(shape)!.values.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([0, 90])("drags the Moon's arc midpoint through to a full Moon at rotation %s with undo and redo", async rotation => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "moon"})
    const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    const {bounds} = before, center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    if(rotation) shape.setAttribute("transform", `rotate(90 ${center.x} ${center.y})`)
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-phase"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 57}
    const toClient = (point: {x: number, y: number}) => rotation ? {x: center.x - (point.y - center.y), y: center.y + (point.x - center.x)} : point
    const start = toClient({x: bounds.x + bounds.width * .2, y: center.y})
    expect(parseFloat(handle.style.left)).toBeCloseTo(start.x, 2)
    expect(parseFloat(handle.style.top)).toBeCloseTo(start.y, 2)
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: start.x, clientY: start.y}))
    const move = async (phase: number) => {
      const target = toClient({x: bounds.x + bounds.width * phase / 100, y: bounds.y + bounds.height * .8})
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y}))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
    await move(20)
    expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(20)
    await move(100)
    expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(100)
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(100)
    const points = graphicPathGeometry(shape)!.points
    expect(points[9].x).toBeCloseTo(bounds.x + bounds.width)
    expect(points[9].y).toBeCloseTo(center.y)
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([0, 90])("drags the Collate POI vertically at rotation %s with one undo step", async rotation => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "collate"})
    const shape = graphic.querySelector("path")!, before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
    const {bounds} = before, center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    if(rotation) shape.setAttribute("transform", `rotate(90 ${center.x} ${center.y})`)
    const sibling = document.createComment("keep")
    graphic.append(sibling)
    editor.features.graphic.refresh()
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="adjust-waist"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 56}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
    const move = async (height: number) => {
      const target = {x: bounds.x + bounds.width * .9, y: bounds.y + bounds.height * height / 100}
      const point = rotation ? {x: center.x - (target.y - center.y), y: center.y + (target.x - center.x)} : target
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: point.x, clientY: point.y}))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
    await move(50)
    expect(readGraphicPreset(editor.appendix.querySelector(".◆graphic-preview path"))!.values[0]).toBeCloseTo(50)
    await move(65)
    expect(shape).toHaveAttribute("d", original)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(65)
    const points = graphicPathGeometry(shape)!.points
    for(const index of [2, 5]) {
      expect(points[index].x).toBeCloseTo(center.x)
      expect(points[index].y).toBeCloseTo(bounds.y + bounds.height * .65)
    }
    const edited = shape.getAttribute("d")!
    editor.doc.undo()
    expect(shape).toHaveAttribute("d", original)
    editor.doc.redo()
    expect(shape).toHaveAttribute("d", edited)
    expect(graphic.lastChild).toBe(sibling)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["commit", "cancel", "replace", "mutate"])("adjusts mirrored preset handles safely on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rounded-rectangle"})
    const graphic = document.querySelector("svg")!
    const shape = graphic.querySelector("path")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const original = shape.getAttribute("d")!
    const state = readGraphicPreset(shape)!
    const handle = editor.appendix.querySelector('[data-graphic-handle="adjust-radius"]')!
    const pointer = {bubbles: true, composed: true, button: 0, pointerId: 19}
    handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: state.bounds.x + 28.8, clientY: state.bounds.y}))
    document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, shiftKey: true, ctrlKey: true, clientX: state.bounds.x + 72, clientY: state.bounds.y}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
    expect(shape.getAttribute("d")).toBe(original)
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") {
      const replacement = shape.cloneNode(true) as Element
      replacement.removeAttribute("class")
      shape.replaceWith(replacement)
    }
    const externalPath = "M 0 0 C 10 10 30 70 99 35 Z"
    if(outcome === "mutate") shape.setAttribute("d", externalPath)
    document.dispatchEvent(new PointerEvent("pointerup", pointer))
    await mutationsDelivered()
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(document.querySelector(".◆graphic-preview-source")).toBeNull()
    if(outcome === "commit") {
      expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(30)
      readGraphicPreset(shape)!.values.forEach(value => expect(value).toBeCloseTo(30))
      editor.features.history.actions.undo({type: "undo"})
      expect(shape.getAttribute("d")).toBe(original)
      editor.features.history.actions.redo({type: "redo"})
      expect(readGraphicPreset(shape)!.values[0]).toBeCloseTo(30)
    }
    else expect(shape.getAttribute("d")).toBe(outcome === "mutate" ? externalPath : original)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(document.body.querySelector("[data-graphic-handle]")).toBeNull()
  })

  it("adjusts a labeled preset in an irregular SVG group without changing siblings", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rounded-rectangle"})
    const shape = graphic.querySelector("path")!
    const group = document.createElementNS(SVG_NAMESPACE, "g")
    group.innerHTML = '<!--preserve--><foreignObject><custom-widget xmlns="http://www.w3.org/1999/xhtml" title="keep"/></foreignObject>'
    const sibling = group.innerHTML
    graphic.append(group)
    group.append(shape)
    clickShape(shape)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Caption"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "adjust-radius", value: "35"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "420"})
    expect(readGraphicPreset(shape)?.values[0]).toBeCloseTo(35)
    expect(readGraphicPreset(shape)?.bounds.width).toBeCloseTo(420)
    expect(group.querySelector("text")?.textContent).toBe("Caption")
    expect(group.innerHTML.startsWith(sibling)).toBe(true)
    expect(shape.attributes).not.toEqual(expect.arrayContaining([expect.objectContaining({name: "data-shape"})]))
  })

  it("capture-selects a drawing-area click and adds a shape to that live SVG", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!

    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.features.graphic.getState()).toEqual({
      active: true,
      capture: true,
      mode: "select",
      selectionCount: 0,
      options: {grid: true, snap: true, guides: true},
    })

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    expect(rectangle).toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({
      active: true,
      capture: true,
      shape: "rectangle",
      parameters: {x: "680", y: "330", width: "240", height: "240"},
    })
  })

  it("fits a standalone rectangle to its stroke and reselects it through the element path", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    expect(graphic).toHaveAttribute("viewBox", "678 328 244 244")
    expect(graphic).toHaveAttribute("width", "244")
    expect(graphic).toHaveAttribute("height", "244")
    const paragraph = document.createElement("p")
    paragraph.textContent = "Other content"
    document.body.append(paragraph)
    $.move(paragraph.firstChild!)
    editor.features.selection.processSelection()
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toHaveAttribute("hidden")

    clickShape(graphic.firstElementChild!)
    document.dispatchEvent(new Event("selectionchange"))

    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.features.transformation.target).toBe(graphic)
    expect(editor.appendix.querySelector('.◆graphic-overlay')).not.toHaveAttribute("hidden")
    expect(graphic).not.toHaveClass("◆graphic-grid-visible")
  })

  it.each(["Delete", "Backspace"])("deletes the whole standalone shape with %s and supports undo", async key => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    editor.features.selection.selectElement(document.querySelector("svg")!)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key}))
    await mutationsDelivered()
    expect(document.querySelector("svg")).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toHaveAttribute("hidden")
    editor.features.history.actions.undo({type: "undo"})
    const graphic = document.querySelector("svg")!
    expect(graphic.querySelector("rect")).not.toBeNull()
    clickShape(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.features.graphic.selectedShape).toBe(graphic.querySelector("rect"))
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["commit", "cancel", "replace"])("edits standalone yellow affordances safely on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    editor.features.selection.selectElement(document.querySelector("svg")!)
    const graphic = document.querySelector("svg")!
    const shape = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: -678, f: -328}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="roundness"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 14, clientY: 2}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 62, clientY: 2}))
    expect(editor.appendix.querySelector('.◆graphic-preview')).not.toBeNull()
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") {
      const replacement = shape.cloneNode(true) as Element
      replacement.removeAttribute("class")
      shape.replaceWith(replacement)
    }
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(shape).toHaveAttribute("rx", outcome === "commit" ? "60" : "12")
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.appendix.querySelector('.◆graphic-preview')).toBeNull()
    expect(document.querySelector('.◆graphic-preview-source')).toBeNull()
    if(outcome === "commit") {
      editor.features.history.actions.undo({type: "undo"})
      expect(shape).toHaveAttribute("rx", "12")
      editor.features.history.actions.redo({type: "redo"})
      expect(shape).toHaveAttribute("rx", "60")
    }
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([[300, 100], [100, 300]])("moves a native rectangle's rounding POI from its left corner to its top midpoint at %s × %s", async (width, height) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    for(const [name, value] of Object.entries({x: 100, y: 100, width, height})) rectangle.setAttribute(name, String(value))
    clickShape(rectangle)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="roundness"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 112, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 100 + width, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(rectangle).toHaveAttribute("rx", String(width / 2))
    expect((handle as HTMLElement).style.left).toBe(`${100 + width / 2}px`)
    editor.doc.undo()
    expect(rectangle).toHaveAttribute("rx", "12")
    editor.doc.redo()
    expect(rectangle).toHaveAttribute("rx", String(width / 2))
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "corner-radius", value: "-20"})
    expect(rectangle).toHaveAttribute("rx", "0")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "corner-radius", value: "1000"})
    expect(rectangle).toHaveAttribute("rx", String(width / 2))
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each([
    ["square-rectangle", 4],
    ["right-triangle", 3], ["pentagon", 5],
    ["heptagon", 7], ["octagon", 8], ["decagon", 10], ["dodecagon", 12],
  ] as const)("gives each %s vertex an independent POI", async (type, count) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
    const shape = graphic.querySelector("path")!
    const name = shape.getAttribute("aria-label")
    const container = () => editor.appendix.querySelector('.◆graphic-specific-handles')!
    expect(container().querySelectorAll('[data-graphic-handle^="adjust-"]')).toHaveLength(0)
    expect(container().querySelectorAll('[data-graphic-handle^="path-point-"]')).toHaveLength(count)
    for(let index = 0; index < count; index++) {
      const handles = [...container().querySelectorAll<HTMLElement>('[data-graphic-handle^="path-point-"]')]
      const before = handles.map(handle => ({x: parseFloat(handle.style.left), y: parseFloat(handle.style.top)}))
      expect(handles[index].getAttribute("part")).toContain("graphic-affordance")
      // Distinct moves avoid turning the square into a recognized parallelogram.
      const dx = 11 * (index + 1), dy = 17 * (index + 1)
      handles[index].dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: before[index].x, clientY: before[index].y}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, altKey: true, clientX: before[index].x + dx, clientY: before[index].y + dy}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
      const points = graphicPathGeometry(shape)!.points
      expect(points).toHaveLength(count)
      points.forEach((point, i) => {
        expect(point.x).toBeCloseTo(before[i].x + (i === index ? dx : 0), 4)
        expect(point.y).toBeCloseTo(before[i].y + (i === index ? dy : 0), 4)
      })
      expect(graphic.querySelector("path")).toBe(shape)
      expect(shape).toHaveAttribute("aria-label", name!)
      await mutationsDelivered()
    }
    const source = new DOMParser().parseFromString(editor.toHTML(true), "text/html")
    expect(graphicPathGeometry(source.querySelector("path")!)!.points).toHaveLength(count)
    expect(source.body.innerHTML).not.toContain("◆")
  })

  it.each([
    ["rounded-rectangle", 4], ["snip-one", 1], ["snip-same-side", 2], ["snip-diagonal", 2],
    ["snip-round", 2], ["round-one", 1], ["round-same-side", 2], ["round-diagonal", 2],
  ] as const)("gives %s one independent POI per rounded or slanted corner", async (type, count) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
    const shape = graphic.querySelector("path")!
    const container = () => editor.appendix.querySelector('.◆graphic-specific-handles')!
    expect(container().querySelectorAll('[data-graphic-handle]')).toHaveLength(count)
    expect(container().querySelector('[data-graphic-handle^="path-point-"]')).toBeNull()
    for(let index = 0; index < count; index++) {
      await mutationsDelivered()
      editor.doc.stopCapturing()
      const before = readGraphicPreset(shape)!, original = shape.getAttribute("d")!
      const adjustment = before.definition.adjustments[index]
      const values = [...before.values]; values[index] = 30 + index
      const point = adjustment.point(values)
      const handle = container().querySelector<HTMLElement>(`[data-graphic-handle="adjust-${adjustment.name}"]`)!
      handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: before.bounds.x + point.x / 100 * before.bounds.width, clientY: before.bounds.y + point.y / 100 * before.bounds.height}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
      await mutationsDelivered()
      const after = readGraphicPreset(shape)!, edited = shape.getAttribute("d")!
      expect(after.type).toBe(type)
      after.values.forEach((value, i) => expect(value).toBeCloseTo(values[i], 3))
      expect(container().querySelectorAll('[data-graphic-handle]')).toHaveLength(count)
      editor.doc.undo()
      expect(shape).toHaveAttribute("d", original)
      editor.doc.redo()
      expect(shape).toHaveAttribute("d", edited)
      expect(graphic.querySelector("path")).toBe(shape)
    }
    const source = new DOMParser().parseFromString(editor.toHTML(true), "text/html")
    const reloaded = readGraphicPreset(source.querySelector("path")!)!
    reloaded.values.forEach((value, i) => expect(value).toBeCloseTo(30 + i, 3))
    expect(source.body.innerHTML).not.toContain("◆")
  })

  it.each(["parallelogram", "trapezoid"] as const)("adjusts %s slant with one POI from the left corner to the top midpoint", async type => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
    const shape = graphic.querySelector("path")!, {bounds} = readGraphicPreset(shape)!
    const name = type === "parallelogram" ? "adjust-slant" : "adjust-top-inset"
    for(const [input, expected] of [[100, 50], [-20, 0], [25, 25]]) {
      await mutationsDelivered()
      editor.doc.stopCapturing()
      const original = shape.getAttribute("d")!
      const container = editor.appendix.querySelector('.◆graphic-specific-handles')!
      expect(container.querySelectorAll('[data-graphic-handle]')).toHaveLength(1)
      const handle = container.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!
      handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: parseFloat(handle.style.left), clientY: parseFloat(handle.style.top)}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: bounds.x + bounds.width * input / 100, clientY: bounds.y + 40}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
      await mutationsDelivered()
      expect(readGraphicPreset(shape)?.values[0]).toBeCloseTo(expected)
      expect(parseFloat(handle.style.left)).toBeCloseTo(bounds.x + bounds.width * expected / 100)
      expect(parseFloat(handle.style.top)).toBeCloseTo(bounds.y - (expected === 50 ? 40 : expected === 0 ? 16 : 0))
      const offset = bounds.width * expected / 100
      expect(graphicPathGeometry(shape)!.points).toEqual([
        {x: bounds.x + offset, y: bounds.y},
        {x: bounds.x + bounds.width - (type === "trapezoid" ? offset : 0), y: bounds.y},
        {x: bounds.x + bounds.width - (type === "parallelogram" ? offset : 0), y: bounds.y + bounds.height},
        {x: bounds.x, y: bounds.y + bounds.height},
      ])
      const edited = shape.getAttribute("d")!
      editor.doc.undo()
      expect(shape).toHaveAttribute("d", original)
      editor.doc.redo()
      expect(shape).toHaveAttribute("d", edited)
      expect(graphic.querySelector("path")).toBe(shape)
    }
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["commit", "cancel", "replace", "remote"])("edits a polygon vertex safely on %s, with undo and redo", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "pentagon"})
    const shape = graphic.querySelector("path")!, original = shape.getAttribute("d")!
    const comment = document.createComment("keep")
    graphic.append(comment)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    const x = parseFloat(handle.style.left), y = parseFloat(handle.style.top)
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: x, clientY: y}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, altKey: true, clientX: x + 23, clientY: y + 11}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(shape).toHaveAttribute("d", original)
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    if(outcome === "replace") shape.replaceWith(shape.cloneNode(true))
    const remote = "M 30 30 L 300 30 L 300 300 Z"
    if(outcome === "remote") shape.setAttribute("d", remote)
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(graphic.lastChild).toBe(comment)
    expect(editor.appendix.querySelector('.◆graphic-preview')).toBeNull()
    expect(document.querySelector('.◆graphic-preview-source')).toBeNull()
    if(outcome === "commit") {
      const edited = shape.getAttribute("d")!
      expect(edited).not.toBe(original)
      expect(graphicPathGeometry(shape)!.points).toHaveLength(5)
      editor.doc.undo()
      expect(shape).toHaveAttribute("d", original)
      expect(readGraphicPreset(shape)?.type).toBe("pentagon")
      editor.doc.redo()
      expect(shape).toHaveAttribute("d", edited)
    }
    else expect(graphic.querySelector("path")).toHaveAttribute("d", outcome === "remote" ? remote : original)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("recognizes serialized standalone shapes while preserving unfamiliar or expanded SVG content", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const copy = graphic.cloneNode(true) as SVGSVGElement
    clearEditorMarkerClasses(copy)
    copy.insertAdjacentHTML("afterbegin", '<title>Shape</title><!--keep--><defs><marker id="tip"/></defs>')
    document.body.append(copy)
    clickShape(copy.querySelector("rect")!)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(standaloneGraphicShape(copy)).toBe(copy.querySelector("rect"))
    copy.insertAdjacentHTML("beforeend", '<g transform="translate(3 4)"><path d="M0 0 L10 10"/></g>')
    const content = copy.innerHTML
    clickShape(copy)
    expect(standaloneGraphicShape(copy)).toBeNull()
    expect(editor.features.selection.captureSelectedElement).toBe(copy)
    expect(copy.innerHTML).toBe(content)
    editor.features.graphic.disable()
    expect(copy).not.toHaveClass("◆graphic-grid-visible")
    expect(editor.appendix.querySelector('.◆graphic-overlay')).toBeNull()
  })

  it("restores a standalone node selection after native focus clears its range", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    editor.features.selection.selectElement(document.querySelector("svg")!)
    const graphic = document.querySelector("svg")!
    document.getSelection()!.removeAllRanges()
    editor.features.selection.processSelection()
    expect($.selectedElement).toBe(graphic)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    $.move(document.body, 0)
    editor.features.selection.processSelection()
    expect($.selectedElement).toBeUndefined()
    expect(graphic).not.toHaveClass("◆element-selected")
  })

  it("expands the element to fit an edited radius beyond the original viewport in one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "ellipse"})
    const graphic = document.querySelector("svg")!
    editor.features.selection.selectElement(graphic)
    const ellipse = graphic.querySelector("ellipse")!
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const handle = editor.appendix.querySelector('[data-graphic-handle="radius-x"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: 920, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1100, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    await mutationsDelivered()
    expect(ellipse).toHaveAttribute("rx", "300")
    expect(graphic).toHaveAttribute("viewBox", "498 328 604 244")
    expect(graphic.style.width).toBe("604px")
    expect(graphic.style.height).toBe("244px")
    expect($.selectedElement).toBe(graphic)
    editor.features.history.actions.undo({type: "undo"})
    expect(ellipse).toHaveAttribute("rx", "120")
    expect(graphic).toHaveAttribute("viewBox", "678 328 244 244")
    expect(graphic.style.width).toBe("244px")
    editor.features.history.actions.redo({type: "redo"})
    expect(ellipse).toHaveAttribute("rx", "300")
    expect(graphic.getAttribute("style")).toContain("width: 604px")
  })

  it.each(insertionOptions)("preserves the rendered form and size of an added $label", option => {
    const createGraphic = (xScale: number, yScale: number) => {
      const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
      graphic.setAttribute("viewBox", "0 0 1600 900")
      Object.defineProperty(graphic, "getScreenCTM", {
        configurable: true,
        value: () => ({a: xScale, b: 0, c: 0, d: yScale, e: 0, f: 0}),
      })
      document.body.append(graphic)
      editor.features.selection.captureElement(graphic)
      return graphic
    }
    const baselineGraphic = createGraphic(1, 1)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
    const baseline = editor.features.graphic.getState()!.parameters!
    const transformedGraphic = createGraphic(1, 0.5)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
    const transformed = editor.features.graphic.getState()!.parameters!
    const baselineShape = graphicShapeRoots(baselineGraphic)[0]
    const transformedShape = graphicShapeRoots(transformedGraphic)[0]

    expect(Number(transformed.width)).toBeCloseTo(Number(baseline.width), 2)
    if(option.type === "text-box") {
      // Content-sized text retains its chosen font metrics in SVG coordinates.
      expect(Number(transformed.height)).toBeCloseTo(Number(baseline.height), 2)
      expect(baselineShape.querySelector("text")).toHaveAttribute("font-size", "48")
      expect(transformedShape.querySelector("text")).toHaveAttribute("font-size", "48")
    }
    else expect(Number(transformed.height) * 0.5).toBeCloseTo(Number(baseline.height), 2)
    if(option.type !== "image") expect(baselineShape.localName === "g" ? baselineShape.firstElementChild : baselineShape).toHaveAttribute("vector-effect", "non-scaling-stroke")
    if(option.type !== "image") expect(transformedShape.localName === "g" ? transformedShape.firstElementChild : transformedShape).toHaveAttribute("vector-effect", "non-scaling-stroke")
  })

  it("centers shapes at their natural size in differently sized viewBoxes", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "100 50 800 400")
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true,
      value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
    })
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

    expect(editor.features.graphic.getState()?.parameters).toMatchObject({
      x: "380", y: "130", width: "240", height: "240",
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    expect(editor.features.graphic.getState()?.parameters).toMatchObject({x: "380", y: "130"})
  })

  it("centers inserted shapes on the current pointer using the live SVG transform, with undo and redo", async () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "100 50 800 400")
    graphic.innerHTML = '<!--keep--><g aria-label="Existing content"><path d="M0 0L10 10"/></g>'
    const existing = graphic.lastElementChild!
    let matrix = {a: 0, b: 2, c: -2, d: 0, e: 1000, f: 100}
    Object.defineProperty(graphic, "getScreenCTM", {value: () => matrix})
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)
    vi.spyOn(document, "elementFromPoint").mockReturnValue(graphic)
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 700, clientY: 700}))
    // Recompute coordinates when executing, even if collaboration moved the graphic.
    matrix = {...matrix, e: 1100}
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const center = () => {
      const p = editor.features.graphic.getState()!.parameters!
      return {x: Number(p.x) + Number(p.width) / 2, y: Number(p.y) + Number(p.height) / 2}
    }
    expect(center()).toEqual({x: 300, y: 200})
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(graphic.children[0]).toBe(existing)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.children).toHaveLength(1)
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.children).toHaveLength(2)
    expect(graphic.lastElementChild!.getAttribute("x")).toBe("240")
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it.each(["outside", "left document", "blurred", "covered", "widget", "cancelled"])("falls back to the graphic center when the pointer is %s", state => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 800 400")
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)
    vi.spyOn(document, "elementFromPoint").mockReturnValue(graphic)
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: state === "outside" ? 900 : 200, clientY: 100}))
    if(state === "left document") graphic.dispatchEvent(new PointerEvent("pointerout", {bubbles: true}))
    else if(state === "blurred") window.dispatchEvent(new Event("blur"))
    else if(state === "covered") vi.mocked(document.elementFromPoint).mockReturnValue(document.body)
    else if(state === "cancelled") graphic.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
    else if(state === "widget") {
      const widget = document.createElement("test-widget")
      const input = document.createElement("input")
      widget.attachShadow({mode: "open"}).append(input)
      document.body.append(widget)
      input.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, clientX: 200, clientY: 100}))
    }
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    expect(editor.features.graphic.getState()?.parameters).toMatchObject({x: "280", y: "80"})
  })

  it("uniformly reduces a natural shape only when the rendered graphic is too small", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    Object.defineProperty(graphic, "getScreenCTM", {
      configurable: true,
      value: () => ({a: 0.1, b: 0, c: 0, d: 0.1, e: 0, f: 0}),
    })
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const parameters = editor.features.graphic.getState()!.parameters!
    const renderedWidth = Number(parameters.width) * 0.1
    const renderedHeight = Number(parameters.height) * 0.1

    expect(renderedWidth).toBeLessThan(240)
    expect(renderedHeight).toBeLessThan(240)
    expect(renderedWidth / renderedHeight).toBeCloseTo(1)
    expect(Number(parameters.x)).toBeGreaterThanOrEqual(0)
    expect(Number(parameters.y)).toBeGreaterThanOrEqual(0)
    expect(Number(parameters.x) + Number(parameters.width)).toBeLessThanOrEqual(1600)
    expect(Number(parameters.y) + Number(parameters.height)).toBeLessThanOrEqual(900)
  })

  it("inserts every closed shape without flattening its natural form", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    document.body.append(graphic)
    editor.features.selection.captureElement(graphic)

    graphicShapeOptions.filter(option => option.category !== "Lines").forEach(option => {
      graphic.replaceChildren()
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: option.type})
      const parameters = editor.features.graphic.getState()!.parameters!
      const ratio = Number(parameters.width) / Number(parameters.height)
      expect(ratio, `${option.label} should retain its natural form`).toBeGreaterThanOrEqual(0.85)
      expect(ratio, `${option.label} should retain its natural form`).toBeLessThanOrEqual(1.2)
    })
  })

  it("does not add a shape to a merely node-selected graphic", () => {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    document.body.append(graphic)
    $.selectElement(graphic)
    editor.features.selection.processSelection()

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})

    expect(graphic.children).toHaveLength(0)
    expect(editor.features.graphic.getState()).toEqual({
      active: true,
      capture: false,
      mode: "select",
      selectionCount: 0,
      options: {grid: true, snap: true, guides: true},
    })
  })

  it("moves shapes directly and exposes shape-specific appendix affordances", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    Object.defineProperty(rectangle, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(400, 250, 800, 400),
    })

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 250,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 500,
      clientY: 300,
    }))

    expect(rectangle).toHaveAttribute("x", "680")
    expect(rectangle).toHaveAttribute("y", "330")
    expect(rectangle).toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "780")
    expect(rectangle).toHaveAttribute("y", "380")
    expect(rectangle).not.toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.getRootNode()).toBe(editor.appendix)
    expect(overlay.querySelector('[data-graphic-handle="rotate"]')).not.toBeNull()
    expect(overlay.querySelector('[data-graphic-handle="roundness"]')).not.toBeNull()
    expect(document.body.querySelector("[data-graphic-handle]")).toBeNull()
  })

  it("edits geometry and paint parameters without serializing selection chrome", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "640"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "corner-radius", value: "48"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "fill", value: "#ef4444"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "30"})

    expect(rectangle).toHaveAttribute("width", "640")
    expect(rectangle).toHaveAttribute("rx", "48")
    expect(rectangle).toHaveAttribute("fill", "#ef4444")
    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(30 /)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.toHTML(true)).toContain('width="640"')
    expect(editor.toHTML(true)).not.toContain("data-graphic-handle")
  })

  it.each(["horizontal", "vertical", "diagonal"])("changes a %s line's paint without rewriting its viewport or geometry", async direction => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "line"})
    const graphic = document.querySelector("svg")!
    const line = graphic.querySelector("line")!
    // Other DOM sources can resize or rotate a line without fitting its SVG.
    if(direction === "vertical") line.setAttribute("x2", line.getAttribute("x1")!)
    if(direction !== "horizontal") line.setAttribute("y2", "700")
    line.setAttribute("transform", "rotate(30 800 450)")
    graphic.style.width = "600px"
    graphic.style.height = "200px"
    const viewport = graphic.getAttribute("viewBox")
    const styles = graphic.getAttribute("style")
    const geometry = line.outerHTML
    const stroke = line.getAttribute("stroke")
    await mutationsDelivered()

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "stroke", value: "#ef4444"})
    await mutationsDelivered()
    expect(line).toHaveAttribute("stroke", "#ef4444")
    expect(graphic).toHaveAttribute("viewBox", viewport)
    expect(graphic.getAttribute("style")).toBe(styles)
    expect(editor.features.graphic.selectedShape).toBe(line)
    expect(editor.doc.body.toString()).toContain('stroke="#ef4444"')
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(editor.toHTML(true)).not.toContain("◆")

    editor.features.history.actions.undo({type: "undo"})
    expect(line.outerHTML).toBe(geometry)
    expect(line).toHaveAttribute("stroke", stroke)
    editor.features.history.actions.redo({type: "redo"})
    expect(line).toHaveAttribute("stroke", "#ef4444")
    for(const [name, value] of [["fill", "none"], ["opacity", "0.5"]]) {
      editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name, value})
      expect(line).toHaveAttribute(name, value)
      expect(graphic).toHaveAttribute("viewBox", viewport)
      expect(graphic.getAttribute("style")).toBe(styles)
    }
  })

  it("stores multiline shape labels as native SVG text and keeps them centered", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)
    const rectangleGeometry = ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"].map(name => rectangle.getAttribute(name))

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Release\nplan"})

    const group = graphic.querySelector("g")!
    const text = group.querySelector("text")!
    expect(group.firstElementChild).toBe(rectangle)
    expect(editor.features.graphic.selectedShape).toBe(group)
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "rectangle",
      parameters: {label: "Release\nplan", "font-size": "48", "text-color": "#0f172a"},
    })
    expect(text.textContent).toBe("Release\nplan")
    expect(text.querySelectorAll("tspan")).toHaveLength(0)
    expect(text.getAttribute("x")!.trim().split(/\s+/)).toHaveLength("Release\nplan".length)
    expect(new Set(text.getAttribute("y")!.trim().split(/\s+/)).size).toBeGreaterThan(1)
    expect(["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"].map(name => rectangle.getAttribute(name))).toEqual(rectangleGeometry)
    expect(parseFloat(text.style.inlineSize)).toBeCloseTo(Number(rectangle.getAttribute("width")) - 16)
    expect(getComputedStyle(text).pointerEvents).toBe("auto")
    expect(getComputedStyle(text).cursor).toBe("text")
    expect(text.textContent).toBe("Release\nplan")
    expect(text.querySelectorAll("tspan")).toHaveLength(0)

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "720"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "30"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "fill", value: "#dbeafe"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "font-size", value: "56"})

    expect(text.textContent).toBe("Release\nplan")
    expect(text.getAttribute("x")!.trim().split(/\s+/)).toHaveLength("Release\nplan".length)
    expect(text).toHaveAttribute("font-size", "56")
    expect(text.style.inlineSize).toBe("704px")
    expect(group.getAttribute("transform")).toMatch(/^rotate\(30 /)
    expect(rectangle).not.toHaveAttribute("transform")
    expect(rectangle).toHaveAttribute("fill", "#dbeafe")
    expect(group).not.toHaveAttribute("fill")
    clickShape(text)
    expect(editor.features.graphic.selectedShape).toBe(group)
    expect(editor.toHTML(true)).toContain("<text")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("edits rich labels in the SVG with only an input proxy and caret in the appendix", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
    const polygon = document.querySelector("polygon")!
    polygon.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    expect(proxy).not.toBeNull()
    expect(proxy.style.opacity).toBe("0")
    expect(document.body.querySelector("textarea")).toBeNull()
    editor.features.mark.toggleMark("b")
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Decision", cancelable: true}))
    const group = document.querySelector("svg > g")!
    expect(group.querySelector("text")).toHaveTextContent("Decision")
    expect(group.querySelector("tspan")!.getAttribute("style")).toContain("font-weight: bold")
    expect(editor.features.mark.getState().marks).toContain("b")
    proxy.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    expect(group.querySelector("text")).toHaveTextContent("Decision")
    expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("opens the selected shape label editor with Enter and retains graphic capture on Escape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)

    const enter = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"})
    document.dispatchEvent(enter)

    expect(enter.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆graphic-label-input")).not.toBeNull()

    editor.appendix.querySelector(".◆graphic-label-input")!.dispatchEvent(
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Escape"}),
    )

    expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-capture-selected")
  })

  it("owns text and navigation input while capture-selected", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const events = [
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "a"}),
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}),
      new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"}),
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: "a",
        inputType: "insertText",
      }),
      new Event("paste", {bubbles: true, cancelable: true}),
    ]

    events.forEach(event => document.dispatchEvent(event))

    events.forEach(event => expect(event.defaultPrevented).toBe(true))
    expect(document.body.children).toHaveLength(1)
    expect(graphic).toBe(document.body.firstElementChild)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(graphic).toHaveClass("◆element-capture-selected")
  })

  it("moves labeled shapes and their text together through the preview path", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Move me"})
    const group = graphic.querySelector("g")!
    const rectangle = group.querySelector("rect")!
    const text = group.querySelector("text")!
    const originalX=text.getAttribute("x")!.split(/\s+/).map(Number)
    const originalY=text.getAttribute("y")!.split(/\s+/).map(Number)

    group.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 620, clientY: 360}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 720, clientY: 410}))
    expect(editor.appendix.querySelector(".◆graphic-preview g text")).toHaveTextContent("Move me")
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "780")
    expect(rectangle).toHaveAttribute("y", "380")
    text.getAttribute("x")!.split(/\s+/).map(Number).forEach((value,index) => expect(value).toBeCloseTo(originalX[index]+100,3))
    text.getAttribute("y")!.split(/\s+/).map(Number).forEach((value,index) => expect(value).toBeCloseTo(originalY[index]+50,3))
  })

  it("undoes and redoes a native label wrapper as one edit", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    clickShape(graphic.querySelector("rect")!)
    await mutationsDelivered()
    editor.doc.stopCapturing()

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Milestone"})
    await mutationsDelivered()
    expect(graphic.querySelector("g > text")).toHaveTextContent("Milestone")

    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("g")).toBeNull()
    expect(graphic.querySelector("rect")).not.toBeNull()
    editor.features.history.actions.redo({type: "redo"})
    expect(graphic.querySelector("g > text")).toHaveTextContent("Milestone")
  })

  it.each([0, 90])("adjusts all five star indentations with a single POI at rotation %s, including zero and reload", async rotation => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "star"})
    let shape = graphic.querySelector("polygon")!
    const read = (element: Element) => element.getAttribute("points")!.split(" ").map(pair => {
      const [x, y] = pair.split(",").map(Number)
      return {x, y}
    })
    const originalPoints = read(shape)
    const center = originalPoints.reduce((sum, point) => ({x: sum.x + point.x / 10, y: sum.y + point.y / 10}), {x: 0, y: 0})
    const bounds = boundsForPoints(originalPoints)
    const pivot = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    if(rotation) shape.setAttribute("transform", `rotate(${rotation} ${pivot.x} ${pivot.y})`)
    editor.features.graphic.refresh()
    const toClient = (point: {x: number, y: number}) => rotation ? {x: pivot.x - (point.y - pivot.y), y: pivot.y + (point.x - pivot.x)} : point
    for(const radius of [0, .3]) {
      const handles = editor.appendix.querySelectorAll<HTMLElement>('.◆graphic-specific-handles [data-graphic-handle]')
      expect(handles).toHaveLength(1)
      const handle = handles[0]
      expect(handle.getAttribute("data-graphic-handle")).toBe("inner-radius")
      const points = read(shape), start = toClient(points[1])
      expect(parseFloat(handle.style.left)).toBeCloseTo(start.x, 2)
      expect(parseFloat(handle.style.top)).toBeCloseTo(start.y, 2)
      const rx = Math.abs((points[2].x - center.x) / Math.cos(-Math.PI / 10))
      const ry = Math.abs(points[0].y - center.y)
      const target = toClient({x: center.x + rx * radius * Math.sin(Math.PI / 5), y: center.y - ry * radius * Math.cos(Math.PI / 5)})
      await mutationsDelivered()
      editor.doc.stopCapturing()
      const original = shape.getAttribute("points")!
      const pointer = {bubbles: true, composed: true, button: 0, pointerId: 81, altKey: true, shiftKey: true, ctrlKey: true}
      handle.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: start.x, clientY: start.y}))
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: target.x, clientY: target.y}))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      expect(shape).toHaveAttribute("points", original)
      const preview = read(editor.appendix.querySelector('.◆graphic-preview polygon')!)
      preview.forEach((point, index) => {
        if(index % 2 === 0) expect(point).toEqual(points[index])
        else {
          const angle = (-90 + index * 36) * Math.PI / 180
          expect(point.x).toBeCloseTo(center.x + rx * radius * Math.cos(angle), 2)
          expect(point.y).toBeCloseTo(center.y + ry * radius * Math.sin(angle), 2)
        }
      })
      document.dispatchEvent(new PointerEvent("pointerup", pointer))
      await mutationsDelivered()
      expect(Number(editor.features.graphic.getState()!.parameters!["inner-radius"])).toBeCloseTo(radius * 100, 2)
      const edited = shape.getAttribute("points")!
      editor.doc.undo()
      expect(shape).toHaveAttribute("points", original)
      editor.doc.redo()
      expect(shape).toHaveAttribute("points", edited)
      expect(editor.toHTML(true)).not.toContain("◆")
      const replacement = shape.cloneNode(true) as SVGPolygonElement
      clearEditorMarkerClasses(replacement)
      shape.replaceWith(replacement)
      shape = replacement
      clickShape(shape)
      expect(editor.appendix.querySelectorAll('.◆graphic-specific-handles [data-graphic-handle]')).toHaveLength(1)
    }
  })

  it("exposes native geometry parameters and vertex handles for richer shapes", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "hexagon"})
    const hexagon = graphic.querySelectorAll("polygon")[0]
    expect(editor.features.graphic.getState()).toMatchObject({shape: "hexagon", parameters: {inset: "60"}})
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(6)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "inset", value: "60"})
    expect(hexagon.getAttribute("points")!.split(" ")[0]).toBe("740,330")

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "star"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "inner-radius", value: "30"})
    expect(editor.features.graphic.getState()).toMatchObject({shape: "star", parameters: {"inner-radius": "30"}})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "inner-radius", value: "0"})
    expect(editor.features.graphic.getState()).toMatchObject({shape: "star", parameters: {"inner-radius": "0"}})
    const star = graphic.querySelectorAll("polygon")[1]
    const vertices = star.getAttribute("points")!.split(" ")
    expect(new Set(vertices.filter((_, index) => index % 2))).toHaveProperty("size", 1)
    expect(editor.appendix.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(0)
    expect(editor.appendix.querySelectorAll('[data-graphic-handle="inner-radius"]')).toHaveLength(1)

    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "arrow"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "head-size", value: "50"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "tail-width", value: "30"})
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "arrow",
      parameters: {"head-size": "50", "tail-width": "30"},
    })
    expect([...editor.appendix.querySelectorAll<HTMLElement>('[data-graphic-handle^="arrow-"]')].map(handle => handle.dataset.graphicHandle)).toEqual([
      "arrow-shaft", "arrow-head-start", "arrow-head-width",
    ])
  })

  it("resizes and rotates with appendix handles", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 400, clientY: 250}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    const southeast = overlay.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 1200,
      clientY: 650,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1400, clientY: 750}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("width", "720")
    expect(rectangle).toHaveAttribute("height", "420")

    const rotate = overlay.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 1040,
      clientY: 306,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 1274, clientY: 540}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(90 /)
  })

  it.each([
    {handle: "arrow-shaft", delta: {x: 0, y: -40}, moved: [0, 1, 5, 6]},
    {handle: "arrow-head-start", delta: {x: -35, y: 0}, moved: [1, 2, 4, 5]},
    {handle: "arrow-head-width", delta: {x: 0, y: 40}, moved: [2, 4]},
  ])("edits native arrow geometry independently with $handle", async ({handle, delta, moved}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "arrow"})
    const shape = graphic.querySelector("polygon")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    clickShape(shape)
    editor.features.graphic.refresh()
    const parse = () => shape.getAttribute("points")!.split(/\s+/).map(pair => pair.split(",").map(Number))
    const before = parse(), handleElement = editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${handle}"]`)!
    expect(handleElement, `${graphicShapeType(shape)} ${shape.getAttribute("points")}`).not.toBeNull()
    const start = {x: parseFloat(handleElement.style.left), y: parseFloat(handleElement.style.top)}
    if(handle === "arrow-head-start") expect(start.y).toBeCloseTo(before[1][1])
    handleElement.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 71, clientX: start.x, clientY: start.y}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 71, clientX: start.x + delta.x, clientY: start.y + delta.y}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = editor.appendix.querySelector(".◆graphic-preview polygon")!
    const previewPoints = preview.getAttribute("points")!.split(/\s+/).map(pair => pair.split(",").map(Number))
    expect(shape.getAttribute("points")).toEqual(before.map(point => point.join(",")).join(" "))
    previewPoints.forEach((point, index) => {
      if(!moved.includes(index)) expect(point).toEqual(before[index])
    })
    if(handle !== "arrow-head-start") expect(previewPoints[0][1] + previewPoints[6][1]).toBeCloseTo(previewPoints[2][1] + previewPoints[4][1])
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 71}))
    await mutationsDelivered()
    const committed = shape.getAttribute("points")!
    expect(committed).toEqual(previewPoints.map(point => point.join(",")).join(" "))
    editor.doc.undo()
    expect(shape.getAttribute("points")).toEqual(before.map(point => point.join(",")).join(" "))
    editor.doc.redo()
    expect(shape.getAttribute("points")).toEqual(committed)
  })

  it("widens and narrows native arrow shaft symmetrically while the head-width control preserves a minimum shaft thickness", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "arrow"})
    const shape = graphic.querySelector("polygon")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    clickShape(shape)
    const points = () => shape.getAttribute("points")!.split(/\s+/).map(pair => pair.split(",").map(Number))
    const drag = async (name: string, dx: number, dy: number) => {
      editor.features.graphic.refresh()
      const handle = editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!
      const x = parseFloat(handle.style.left), y = parseFloat(handle.style.top)
      handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 72, clientX: x, clientY: y}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 72, clientX: x + dx, clientY: y + dy}))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const result = editor.appendix.querySelector(".◆graphic-preview polygon")!.getAttribute("points")!
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 72}))
      await mutationsDelivered()
      return result.split(/\s+/).map(pair => pair.split(",").map(Number))
    }
    const initial = points(), initialHalf = (initial[6][1] - initial[0][1]) / 2
    const wide = await drag("arrow-shaft", 0, -25)
    expect((wide[6][1] - wide[0][1]) / 2).toBeGreaterThan(initialHalf)
    expect(wide[0][1] + wide[6][1]).toBeCloseTo(initial[0][1] + initial[6][1])
    const narrow = await drag("arrow-shaft", 0, 20)
    expect((narrow[6][1] - narrow[0][1]) / 2).toBeLessThan((wide[6][1] - wide[0][1]) / 2)
    const headNarrow = await drag("arrow-head-width", 0, 100)
    expect((headNarrow[4][1] - headNarrow[2][1]) / 2).toBeCloseTo((narrow[6][1] - narrow[0][1]) / 2)
    expect(editor.appendix.querySelector('[data-graphic-handle="arrow-shaft"]')).not.toBeNull()
  })

  it.each([
    {type:"square-rectangle",handle:"path-point-0"},
    {type:"hexagon",handle:"vertex-0"},
    {type:"line",handle:"line-start"},
    {type:"bezier",handle:"path-point-1"},
  ] as const)("keeps unedited $type points fixed when its POI crosses rotated bounds", async ({type,handle: name}) => {
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=document.querySelector("svg")!
    Object.defineProperty(graphic,"getScreenCTM",{value:()=>({a:1,b:0,c:0,d:1,e:0,f:0})})
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
    const shape=editor.features.graphic.selectedShape!
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:"35"})
    const screenPoints=(element:Element)=>{
      const preset=readGraphicPreset(element)
      const frame=preset?.type==="square-rectangle" ? preset.bounds : null
      const points=(frame ? [{x:frame.x,y:frame.y},{x:frame.x+frame.width,y:frame.y},{x:frame.x+frame.width,y:frame.y+frame.height},{x:frame.x,y:frame.y+frame.height}] : graphicPathGeometry(element)?.points) ?? (element.localName==="line"
        ? [1,2].map(i=>({x:Number(element.getAttribute(`x${i}`)),y:Number(element.getAttribute(`y${i}`))}))
        : element.getAttribute("points")!.split(/\s+/).map(pair=>{const [x,y]=pair.split(",").map(Number);return {x,y}}))
      const [angle,cx,cy]=element.getAttribute("transform")!.match(/[-+]?\d*\.?\d+/g)!.map(Number)
      const radians=angle*Math.PI/180
      return points.map(({x,y})=>({x:cx+(x-cx)*Math.cos(radians)-(y-cy)*Math.sin(radians),y:cy+(x-cx)*Math.sin(radians)+(y-cy)*Math.cos(radians)}))
    }
    const before=screenPoints(shape),original=shape.outerHTML,pointIndex=name==="path-point-1" ? 1 : 0
    const handle=editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!
    const start={x:parseFloat(handle.style.left),y:parseFloat(handle.style.top)}
    const pointer={bubbles:true,composed:true,button:0,pointerId:83}
    handle.dispatchEvent(new PointerEvent("pointerdown",{...pointer,clientX:start.x,clientY:start.y}))
    for(const [dx,dy] of [[-200,-150],[-240,-180]]) {
      document.dispatchEvent(new PointerEvent("pointermove",{...pointer,buttons:1,altKey:true,clientX:start.x+dx,clientY:start.y+dy}))
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
      const preview=editor.appendix.querySelector<SVGGraphicsElement>(".◆graphic-preview > :not(defs)")!
      const actual=screenPoints(preview)
      actual.forEach((point,index)=>{
        expect(point.x).toBeCloseTo(index===pointIndex ? start.x+dx : before[index].x,1)
        expect(point.y).toBeCloseTo(index===pointIndex ? start.y+dy : before[index].y,1)
      })
      expect(shape.outerHTML.replace(/ ◆graphic-preview-source/g,"")).toBe(original)
    }
    document.dispatchEvent(new PointerEvent("pointerup",pointer))
    const committed=screenPoints(shape)
    committed.forEach((point,index)=>{
      if(index===pointIndex) return
      expect(point.x).toBeCloseTo(before[index].x,1)
      expect(point.y).toBeCloseTo(before[index].y,1)
    })
    await mutationsDelivered()
    editor.doc.undo()
    expect(screenPoints(graphic.firstElementChild!)).toEqual(before)
    editor.doc.redo()
    expect(screenPoints(graphic.firstElementChild!)).toEqual(committed)
  })

  it.each(["cancel", "replace"] as const)("keeps arrow POI edits in local coordinates when rotated 35 degrees and cleans up on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "arrow"})
    const shape = graphic.querySelector("polygon")!
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    const raw = shape.getAttribute("points")!.split(/\s+/).map(pair => pair.split(",").map(Number))
    const bounds = boundsForPoints(raw.map(([x, y]) => ({x, y})))
    const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    shape.setAttribute("transform", `rotate(35 ${center.x} ${center.y})`)
    clickShape(shape)
    editor.features.graphic.refresh()
    const button = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="arrow-shaft"]')!
    const start = {x: parseFloat(button.style.left), y: parseFloat(button.style.top)}
    const angle = 35 * Math.PI / 180
    button.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 73, clientX: start.x, clientY: start.y}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 73, clientX: start.x + 20 * Math.sin(angle), clientY: start.y - 20 * Math.cos(angle)}))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = editor.appendix.querySelector(".◆graphic-preview polygon")!
    const edited = preview.getAttribute("points")!.split(/\s+/).map(pair => pair.split(",").map(Number))
    expect((edited[6][1] - edited[0][1])).toBeGreaterThan(raw[6][1] - raw[0][1])
    expect(edited[0][1] + edited[6][1]).toBeCloseTo(raw[0][1] + raw[6][1])
    expect(shape.getAttribute("points")).toEqual(raw.map(point => point.join(",")).join(" "))
    if(outcome === "cancel") document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 73}))
    else {
      const replacement = shape.cloneNode(true) as Element
      replacement.removeAttribute("class")
      shape.replaceWith(replacement)
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 73}))
    }
    await mutationsDelivered()
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(shape.getAttribute("points")).toEqual(raw.map(point => point.join(",")).join(" "))
  })

  it.each([
    {handle: "move", start: [800, 450], moves: [[810, 470], [830, 490]]},
    {handle: "resize-se", start: [920, 570], moves: [[940, 590], [960, 610]]},
    {handle: "rotate", start: [800, 306], moves: [[944, 450], [800, 594]]},
  ])("keeps an SVG $handle gesture separate from adjacent edits in undo and redo", ({handle, start, moves}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    clickShape(rectangle)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    rectangle.setAttribute("data-before", "keep")
    const before = editor.toHTML(true)
    const control = handle === "move" ? rectangle
      : editor.appendix.querySelector(`[data-graphic-handle="${handle}"]`)!
    control.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, composed: true, button: 0, clientX: start[0], clientY: start[1],
    }))
    for(const [clientX, clientY] of moves) {
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX, clientY}))
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).toBe(before)
    }
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    const after = editor.toHTML(true)
    expect(after).not.toBe(before)
    rectangle.setAttribute("data-after", "later")
    editor.doc.syncFromDOM()

    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(after)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.undo()
    expect(rectangle).not.toHaveAttribute("data-before")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
    editor.doc.redo()
    expect(rectangle).toHaveAttribute("data-after", "later")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it.each([
    {label: "snaps to 5° when Snap is on", snap: true, altKey: false, expected: 15},
    {label: "does not snap when Snap is off", snap: false, altKey: false, expected: 13},
    {label: "temporarily bypasses Snap with Alt", snap: true, altKey: true, expected: 13},
  ])("$label while rotating one shape", ({snap, altKey, expected}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    if(!snap) editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    clickShape(rectangle)

    const center = {x: 800, y: 450}
    const radius = 144
    const radians = (-90 + 13) * Math.PI / 180
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: center.x,
      clientY: center.y - radius,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: center.x + Math.cos(radians) * radius,
      clientY: center.y + Math.sin(radians) * radius,
      altKey,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("transform", `rotate(${expected} 800 450)`)
  })

  it.each(["pointerup", "pointercancel"])("maps rotation previews through the graphic viewport and cleans up on %s", async outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    const rectangle = graphic.querySelector("rect")!
    const local = new DOMMatrix().scale(.5)
    const viewport = new DOMMatrix().translate(17, -11).scale(1.4)
    let outer = new DOMMatrix().translate(300, 120).rotate(30).scale(1.1, .9)
    Object.defineProperties(graphic, {
      getCTM: {value: () => local},
      getScreenCTM: {value: () => outer.multiply(viewport).multiply(local)},
      clientWidth: {value: 800},
      clientHeight: {value: 450},
      currentScale: {value: 1.4},
      currentTranslate: {value: {x: 17, y: -11}},
    })
    clickShape(rectangle)
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    const screen = graphic.getScreenCTM()!
    const start = screen.transformPoint({x: 800, y: 306})
    const end = screen.transformPoint({x: 944, y: 450})
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, composed: true, button: 0, clientX: start.x, clientY: start.y,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, buttons: 1, clientX: end.x, clientY: end.y,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
    expect(preview.querySelector("rect")).toHaveAttribute("transform", "rotate(90 800 450)")
    expect(preview.style.width).toBe("800px")
    expect(preview.style.height).toBe("450px")
    const expectTransform = () => {
      const matrix = new DOMMatrix(preview.style.transform)
      for(const key of ["a", "b", "c", "d", "e", "f"] as const) expect(matrix[key]).toBeCloseTo(outer[key], 4)
    }
    expectTransform()
    outer = new DOMMatrix().translate(40, 60).multiply(outer)
    document.dispatchEvent(new Event("scroll"))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expectTransform()
    editor.doc.syncFromDOM()
    expect(editor.toHTML(true)).toBe(before)
    document.dispatchEvent(new PointerEvent(outcome, {bubbles: true, button: 0}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(document.querySelector(".◆graphic-preview-source, .◆graphic-manipulating")).toBeNull()
    expect(editor.doc.body.toString()).not.toContain("◆")
    if(outcome === "pointercancel") expect(editor.toHTML(true)).toBe(before)
    else {
      expect(rectangle).toHaveAttribute("transform", "rotate(90 800 450)")
      await mutationsDelivered()
      const after = editor.toHTML(true)
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(before)
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(after)
    }
  })

  it("resizes a rotated shape in its local axes", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const fixedNorthwest = outline.getAttribute("points")!.split(" ")[0]
    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 710,
      clientY: 630,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 660,
      clientY: 680,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "615")
    expect(rectangle).toHaveAttribute("y", "375")
    expect(rectangle).toHaveAttribute("width", "350")
    expect(rectangle).toHaveAttribute("height", "260")
    expect(rectangle.getAttribute("transform")).toMatch(/^rotate\(90 /)
    expect(outline.getAttribute("points")!.split(" ")[0]).toBe(fixedNorthwest)
  })

  it("keeps the opposite edge fixed while resizing a rotated shape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})

    const west = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-w"]')!
    const east = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-e"]')!
    const fixedEast = {left: east.style.left, top: east.style.top}
    west.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 800,
      clientY: 270,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 800,
      clientY: 220,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "625")
    expect(rectangle).toHaveAttribute("y", "275")
    expect(rectangle).toHaveAttribute("width", "350")
    expect(rectangle).toHaveAttribute("height", "240")
    expect({left: east.style.left, top: east.style.top}).toEqual(fixedEast)
  })

  it("switches a crossed corner and snaps its new moving edges", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    const northwest = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-nw"]')!
    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!

    northwest.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 620,
      clientY: 360,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 1053,
      clientY: 597,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "920")
    expect(rectangle).toHaveAttribute("y", "570")
    expect(rectangle).toHaveAttribute("width", "136")
    expect(rectangle).toHaveAttribute("height", "30")
    expect({left: northwest.style.left, top: northwest.style.top}).toEqual({left: "920px", top: "570px"})
    expect({left: southeast.style.left, top: southeast.style.top}).toEqual({left: "1056px", top: "600px"})
  })

  it("switches crossed corners around the fixed anchor of a rotated shape", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const fixedSoutheast = outline.getAttribute("points")!.split(" ")[2]
    const northwest = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-nw"]')!

    northwest.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 890,
      clientY: 270,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 660,
      clientY: 680,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "615")
    expect(rectangle).toHaveAttribute("y", "615")
    expect(rectangle).toHaveAttribute("width", "110")
    expect(rectangle).toHaveAttribute("height", "20")
    const corners = outline.getAttribute("points")!.split(" ")
    expect(corners[0]).toBe(fixedSoutheast)
    expect(corners[2]).toBe("660,680")
  })

  it("shows endpoint and vertex affordances for lines and polygons", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "line"})
    let graphic = document.querySelector("svg")!
    graphic.querySelector("line")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    let overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.querySelector('[data-graphic-handle="line-start"]')).not.toBeNull()
    expect(overlay.querySelector('[data-graphic-handle="line-end"]')).not.toBeNull()

    editor.features.selection.captureElement(graphic)
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "polygon"})
    overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
    expect(overlay.querySelectorAll('[data-graphic-handle^="vertex-"]')).toHaveLength(5)
  })

  it("moves a horizontal line without changing its endpoints' axis", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line"})
    const graphic = document.querySelector("svg")!
    const line = graphic.querySelector("line")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })

    line.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 350, clientY: 450}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: 400, clientY: 475}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(line).toHaveAttribute("x1", "690")
    expect(line).toHaveAttribute("x2", "1010")
    expect(line).toHaveAttribute("y1", "475")
    expect(line).toHaveAttribute("y2", "475")
  })

  it("does not move a selected shape until the drag threshold is crossed", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
    const rectangle = document.querySelector("rect")!

    rectangle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 620,
      clientY: 360,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 622,
      clientY: 361,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(rectangle).toHaveAttribute("x", "680")
    expect(rectangle).toHaveAttribute("y", "330")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  })

  it("adds and removes shapes from a shared selection with Shift-click", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})
    const rectangle = graphic.querySelector("rect")!
    const ellipse = graphic.querySelector("ellipse")!

    clickShape(rectangle)
    clickShape(ellipse, true)

    expect(editor.features.graphic.selectedShapes).toEqual([rectangle, ellipse])
    expect(rectangle).toHaveClass("◆graphic-shape-selected")
    expect(ellipse).toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({
      active: true,
      capture: true,
      selectionCount: 2,
      parameters: {fill: "#ffffff"},
    })
    expect(editor.features.graphic.getState()).not.toHaveProperty("shape")
    expect(editor.appendix.querySelectorAll(".◆graphic-individual-outline")).toHaveLength(2)

    clickShape(ellipse, true)

    expect(editor.features.graphic.selectedShapes).toEqual([rectangle])
    expect(ellipse).not.toHaveClass("◆graphic-shape-selected")
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 1, shape: "rectangle"})
  })

  it("marquee-selects intersecting shapes and keeps the marquee in the appendix", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[100, 100], [300, 150], [700, 500]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })

    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 50,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 450,
      clientY: 350,
    }))

    expect(editor.features.graphic.selectedShapes).toEqual(rectangles.slice(0, 2))
    const marquee = editor.appendix.querySelector<SVGRectElement>(".◆graphic-marquee")!
    expect(marquee).not.toHaveAttribute("hidden")
    expect(marquee).not.toHaveAttribute("display")
    expect(marquee).toHaveAttribute("x", "50")
    expect(editor.appendix.querySelector(".◆graphic-selection-outline")).toHaveStyle({display: "none"})
    expect(editor.appendix.querySelectorAll(".◆graphic-handle:not([hidden])")).toHaveLength(0)
    expect(document.body.querySelector(".◆graphic-marquee")).toBeNull()

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(marquee).toHaveAttribute("hidden")
    expect(marquee).toHaveAttribute("display", "none")
    expect(editor.appendix.querySelector(".◆graphic-selection-outline")).not.toHaveStyle({display: "none"})
    expect(editor.appendix.querySelectorAll(".◆graphic-handle:not([hidden])")).toHaveLength(9)
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 2})
    expect(editor.toHTML(true)).not.toContain("◆graphic-marquee")
  })

  it.each(["rectangle", "rounded-rectangle", "square-rectangle", "line", "bezier"] as const)("restores normal %s POIs when a marquee selects only that shape", type => {
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=document.querySelector("svg")!
    Object.defineProperty(graphic,"getScreenCTM",{value:()=>({a:1,b:0,c:0,d:1,e:0,f:0})})
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
    for(const [name,value] of [["x","100"],["y","100"],["width","200"],["height","120"]]) {
      editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name,value})
    }
    const shape=editor.features.graphic.selectedShape!
    const controls=()=>[...editor.appendix.querySelectorAll<HTMLElement>(".◆graphic-specific-handles .◆graphic-handle")]
    graphic.prepend(document.createComment("preserve authored sibling"))
    const original=editor.toHTML(true)
    const initial=controls().map(handle=>({name:handle.dataset.graphicHandle,left:handle.style.left,top:handle.style.top}))
    expect(initial.length).toBeGreaterThan(0)
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))
    expect(editor.features.graphic.selectedShapes).toHaveLength(0)
    const pointer={bubbles:true,button:0,pointerId:46}
    graphic.dispatchEvent(new PointerEvent("pointerdown",{...pointer,clientX:50,clientY:50}))
    document.dispatchEvent(new PointerEvent("pointermove",{...pointer,buttons:1,clientX:350,clientY:250}))
    expect(controls().every(handle=>handle.hidden)).toBe(true)
    document.dispatchEvent(new PointerEvent("pointerup",pointer))
    expect(editor.features.graphic.selectedShape).toBe(shape)
    expect(editor.features.graphic.selectedShapes).toEqual([shape])
    expect(controls().every(handle=>!handle.hidden)).toBe(true)
    expect(controls().map(handle=>({name:handle.dataset.graphicHandle,left:handle.style.left,top:handle.style.top}))).toEqual(initial)
    expect(editor.features.graphic.textEditingRange).toBeNull()
    expect(editor.appendix.querySelector('[part="graphic-text-caret"]')).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.toHTML(true)).toBe(original)
  })

  it.each(["commit", "cancel"])("hides connection ports throughout a marquee and restores them on %s", outcome => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const rectangle = graphic.querySelector("rect")!
    rectangle.setAttribute("x", "100")
    rectangle.setAttribute("y", "100")
    rectangle.setAttribute("width", "100")
    rectangle.setAttribute("height", "100")
    clickShape(rectangle)
    expect(editor.appendix.querySelectorAll("[data-graphic-port]")).toHaveLength(4)
    expect(editor.appendix.querySelector('[data-graphic-handle="roundness"]')).not.toHaveAttribute("hidden")

    const pointer = {bubbles: true, button: 0, pointerId: 42, shiftKey: outcome === "cancel"}
    graphic.dispatchEvent(new PointerEvent("pointerdown", {...pointer, clientX: 50, clientY: 50}))
    for(const [x, y] of [[70, 70], [250, 250], [70, 70], [250, 250]]) {
      document.dispatchEvent(new PointerEvent("pointermove", {...pointer, buttons: 1, clientX: x, clientY: y}))
      expect(editor.appendix.querySelector(".◆graphic-marquee")).not.toHaveAttribute("hidden")
      expect(editor.appendix.querySelectorAll("[data-graphic-port]")).toHaveLength(0)
    }
    if(outcome === "cancel") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
    else document.dispatchEvent(new PointerEvent("pointerup", {...pointer, clientX: 250, clientY: 250}))

    expect(editor.features.graphic.selectedShapes).toEqual([rectangle])
    expect(editor.appendix.querySelector(".◆graphic-marquee")).toHaveAttribute("hidden")
    expect(editor.appendix.querySelectorAll("[data-graphic-port]")).toHaveLength(4)
    expect(editor.appendix.querySelector('[data-graphic-handle="roundness"]')).not.toHaveAttribute("hidden")
    expect(document.body.querySelector("[data-graphic-port]")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("data-graphic-port")
  })

  it("restores the base selection when an additive marquee is cancelled", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[100, 100], [300, 100], [700, 500]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })
    clickShape(rectangles[2])

    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 4,
      shiftKey: true,
      clientX: 50,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 4,
      shiftKey: true,
      clientX: 500,
      clientY: 300,
    }))
    expect(editor.features.graphic.selectedShapes).toHaveLength(3)
    expect(editor.features.graphic.selectedShapes).toEqual(expect.arrayContaining(rectangles))

    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))

    expect(editor.features.graphic.selectedShapes).toEqual([rectangles[2]])
    expect(editor.appendix.querySelector(".◆graphic-marquee")).toHaveAttribute("hidden")
    expect(editor.features.graphic.getState()).toMatchObject({selectionCount: 1})
  })

  it("moves a multi-selection through one preview and one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    let graphicRect = new DOMRect(0, 0, 1600, 900)
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => graphicRect,
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    first.setAttribute("x", "100")
    first.setAttribute("y", "100")
    first.setAttribute("width", "100")
    first.setAttribute("height", "100")
    second.setAttribute("x", "300")
    second.setAttribute("y", "100")
    second.setAttribute("width", "100")
    second.setAttribute("height", "100")
    await mutationsDelivered()
    clickShape(first)
    clickShape(second, true)

    first.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 150,
      clientY: 125,
      altKey: true,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(first).toHaveAttribute("x", "100")
    expect(second).toHaveAttribute("x", "300")
    expect(first).toHaveClass("◆graphic-preview-source")
    expect(second).toHaveClass("◆graphic-preview-source")
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
    expect(Array.from(preview.querySelectorAll("rect"), shape => [shape.getAttribute("x"), shape.getAttribute("y")])).toEqual([
      ["150", "125"], ["350", "125"],
    ])

    graphicRect = new DOMRect(40, 60, 1600, 900)
    document.dispatchEvent(new Event("scroll"))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(preview.style.left).toBe("40px")
    expect(preview.style.top).toBe("60px")

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(first).toHaveAttribute("x", "150")
    expect(second).toHaveAttribute("x", "350")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(Array.from(graphic.querySelectorAll("rect"), shape => shape.getAttribute("x"))).toEqual(["100", "300"])
  })

  it("resizes and rotates a multi-selection around its shared frame", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    clickShape(first)
    clickShape(second, true)

    const southeast = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-se"]')!
    southeast.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 400,
      clientY: 200,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 700,
      clientY: 300,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect([first.getAttribute("x"), first.getAttribute("width")]).toEqual(["100", "200"])
    expect([second.getAttribute("x"), second.getAttribute("width")]).toEqual(["500", "200"])

    // Restore a simple horizontal frame so the group rotation has exact centers.
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    editor.features.graphic.refresh()
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: 250,
      clientY: 50,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 350,
      clientY: 150,
      shiftKey: true,
      altKey: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect([first.getAttribute("x"), first.getAttribute("y")]).toEqual(["200", "0"])
    expect([second.getAttribute("x"), second.getAttribute("y")]).toEqual(["200", "200"])
    expect(first.getAttribute("transform")).toMatch(/^rotate\(90 /)
    expect(second.getAttribute("transform")).toMatch(/^rotate\(90 /)
  })

  it("snaps a multi-selection rotation to 5°", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[first, second].forEach((shape, index) => {
      shape.setAttribute("x", String(100 + index * 200))
      shape.setAttribute("y", "100")
      shape.setAttribute("width", "100")
      shape.setAttribute("height", "100")
    })
    clickShape(first)
    clickShape(second, true)

    const center = {x: 250, y: 150}
    const radius = 100
    const radians = (-90 + 13) * Math.PI / 180
    const rotate = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotate.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: center.x,
      clientY: center.y - radius,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: center.x + Math.cos(radians) * radius,
      clientY: center.y + Math.sin(radians) * radius,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(first.getAttribute("transform")).toMatch(/^rotate\(15 /)
    expect(second.getAttribute("transform")).toMatch(/^rotate\(15 /)
  })

  it("aligns, distributes, and reorders selected shapes as grouped commands", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    for(let index = 0; index < 3; index++) {
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    }
    const rectangles = Array.from(graphic.querySelectorAll("rect"))
    ;[[0, 60], [300, 10], [900, 110]].forEach(([x, y], index) => {
      rectangles[index].setAttribute("x", String(x))
      rectangles[index].setAttribute("y", String(y))
      rectangles[index].setAttribute("width", "100")
      rectangles[index].setAttribute("height", "100")
    })
    clickShape(rectangles[0])
    clickShape(rectangles[1], true)
    clickShape(rectangles[2], true)

    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "align-top"})
    expect(rectangles.map(shape => shape.getAttribute("y"))).toEqual(["10", "10", "10"])

    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "distribute-horizontal"})
    expect(rectangles.map(shape => shape.getAttribute("x"))).toEqual(["0", "450", "900"])

    clickShape(rectangles[2], true)
    editor.features.graphic.actions.arrangeGraphicShapes({type: "arrangeGraphicShapes", operation: "bring-front"})
    expect(Array.from(graphic.querySelectorAll("rect"))).toEqual([rectangles[2], rectangles[0], rectangles[1]])
    expect(editor.toHTML(true)).not.toContain("◆graphic-shape-selected")
  })

  it("snaps a preview to sibling alignment and commits once on release", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [moving, target] = Array.from(graphic.querySelectorAll("rect"))
    moving.setAttribute("x", "100")
    moving.setAttribute("y", "100")
    moving.setAttribute("width", "200")
    moving.setAttribute("height", "100")
    target.setAttribute("x", "500")
    target.setAttribute("y", "300")
    target.setAttribute("width", "200")
    target.setAttribute("height", "100")

    moving.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    expect(moving.isConnected).toBe(true)
    expect(editor.features.graphic.selectedShapes).toEqual([moving])
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 497,
      clientY: 100,
    }))

    expect(moving).toHaveAttribute("x", "100")
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-preview")!
    expect(preview.querySelector("rect")).toHaveAttribute("x", "500")
    const guide = editor.appendix.querySelector<SVGLineElement>('.◆graphic-guide[data-axis="x"]')!
    expect(guide).not.toHaveAttribute("hidden")
    expect(guide).not.toHaveAttribute("display")
    expect(guide.dataset.kind).toBe("object")
    expect(guide.getAttribute("part")).toContain("graphic-guide-object")

    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "guides"})
    expect(guide).toHaveAttribute("hidden")
    expect(guide).toHaveAttribute("display", "none")
    expect(editor.features.graphic.getState()?.options?.guides).toBe(false)

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))

    expect(moving).toHaveAttribute("x", "500")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("draws and reconnects an orthogonal connector through appendix connection ports", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    ;[
      [first, 100, 100],
      [second, 500, 300],
    ].forEach(([shape, x, y]) => {
      ;(shape as SVGRectElement).setAttribute("x", String(x))
      ;(shape as SVGRectElement).setAttribute("y", String(y))
      ;(shape as SVGRectElement).setAttribute("width", "100")
      ;(shape as SVGRectElement).setAttribute("height", "100")
    })
    clickShape(first)

    const ports = editor.appendix.querySelectorAll<HTMLButtonElement>("[data-graphic-port]")
    expect(ports).toHaveLength(4)
    const east = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-port="e"]')!
    east.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      pointerId: 3,
      clientX: 214,
      clientY: 150,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 3,
      clientX: 500,
      clientY: 350,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(graphic.querySelector("polyline")).toBeNull()
    expect(editor.appendix.querySelector(".◆graphic-preview polyline")).toHaveAttribute(
      "points",
      "200,150 350,150 350,350 500,350",
    )
    expect(editor.appendix.querySelector(".◆graphic-port-target")).toHaveAttribute("cx", "500")
    expect(editor.appendix.querySelector(".◆graphic-port-target")).toHaveAttribute("cy", "350")

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 3}))

    const connector = graphic.querySelector("polyline")!
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
    expect(editor.features.graphic.getState()).toMatchObject({shape: "connector", selectionCount: 1})
    expect(editor.appendix.querySelectorAll("[data-graphic-port]")).toHaveLength(0)
    const end = editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="connector-end"]')!
    end.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      button: 0,
      pointerId: 4,
      clientX: 500,
      clientY: 350,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 4,
      clientX: 550,
      clientY: 300,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 4}))

    expect(connector).toHaveAttribute("points", "200,150 375,150 375,300 550,300")
    expect(editor.toHTML(true)).not.toContain("data-graphic")
  })

  it.each(["connector", "line-start-arrow", "line-end-arrow", "line-both-arrows"] as const)("keeps inferred %s endpoints attached while shapes move and resize", type => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: type})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    const connector = graphic.querySelector("polyline")!
    const arrows = [connector.getAttribute("marker-start"), connector.getAttribute("marker-end")]
    first.setAttribute("x", "100")
    first.setAttribute("y", "100")
    first.setAttribute("width", "100")
    first.setAttribute("height", "100")
    second.setAttribute("x", "500")
    second.setAttribute("y", "300")
    second.setAttribute("width", "100")
    second.setAttribute("height", "100")
    connector.setAttribute("points", "200,150 350,150 350,350 500,350")

    clickShape(first)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "label", value: "Source"})
    const labeledSource = first.parentElement as unknown as SVGGElement
    expect(labeledSource.localName).toBe("g")
    expect(editor.features.graphic.selectedShape).toBe(labeledSource)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: "150"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "90"})
    expect(connector).toHaveAttribute("points", "200,200 350,200 350,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "rotation", value: "0"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")

    clickShape(second)
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "200"})
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: "600"})
    expect(connector).toHaveAttribute("points", "250,150 425,150 425,350 600,350")
    expect([connector.getAttribute("marker-start"), connector.getAttribute("marker-end")]).toEqual(arrows)
  })

  it("previews and commits attached connectors with a shape in one undo step", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1600, 900),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "connector"})
    const [first, second] = Array.from(graphic.querySelectorAll("rect"))
    const connector = graphic.querySelector("polyline")!
    ;[
      [first, 100, 100],
      [second, 500, 300],
    ].forEach(([shape, x, y]) => {
      ;(shape as SVGRectElement).setAttribute("x", String(x))
      ;(shape as SVGRectElement).setAttribute("y", String(y))
      ;(shape as SVGRectElement).setAttribute("width", "100")
      ;(shape as SVGRectElement).setAttribute("height", "100")
    })
    connector.setAttribute("points", "200,150 350,150 350,350 500,350")
    await mutationsDelivered()
    clickShape(first)

    first.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 150,
      clientY: 100,
      altKey: true,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(first).toHaveAttribute("x", "100")
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
    expect(connector).toHaveClass("◆graphic-preview-source")
    expect(editor.appendix.querySelector(".◆graphic-preview polyline")).toHaveAttribute(
      "points",
      "250,150 375,150 375,350 500,350",
    )

    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    expect(first).toHaveAttribute("x", "150")
    expect(connector).toHaveAttribute("points", "250,150 375,150 375,350 500,350")
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(first).toHaveAttribute("x", "100")
    expect(connector).toHaveAttribute("points", "200,150 350,150 350,350 500,350")
  })

  it("removes connectors attached to a deleted shape", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "connector"})
    const rectangle = graphic.querySelector("rect")!
    const connector = graphic.querySelector("polyline")!
    rectangle.setAttribute("x", "100")
    rectangle.setAttribute("y", "100")
    rectangle.setAttribute("width", "100")
    rectangle.setAttribute("height", "100")
    connector.setAttribute("points", "200,150 300,150")
    clickShape(rectangle)

    const deletion = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Delete"})
    document.dispatchEvent(deletion)
    await mutationsDelivered()

    expect(deletion.defaultPrevented).toBe(true)
    expect(graphic.isConnected).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(rectangle.isConnected).toBe(false)
    expect(connector.isConnected).toBe(false)
    expect(document.querySelector("rect")).toBeNull()
    expect(document.querySelector("polyline")).toBeNull()
  })

  it("switches connector routing and adds native SVG arrow markers", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "connector"})
    const graphic = document.querySelector("svg")!
    const connector = graphic.querySelector("polyline")!
    connector.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "routing", value: "straight"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow", value: "true"})

    expect(connector.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(2)
    expect(connector.getAttribute("marker-end")).toMatch(/^url\(#graphic-arrow-\d+\)$/)
    expect(graphic.querySelector("defs marker path")).toHaveAttribute("d", "M 0 0 L 10 5 L 0 10 z")
    expect(graphic.querySelector("defs marker path")).toHaveAttribute("fill", "context-stroke")
    expect(editor.features.graphic.getState()).toMatchObject({
      shape: "connector",
      parameters: {routing: "straight", "start-arrow": "false", "end-arrow": "true"},
    })
    expect(editor.toHTML(true)).not.toContain("◆")

    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow", value: "false"})
    expect(connector).not.toHaveAttribute("marker-end")
    expect(graphic.querySelector("defs")).toBeNull()
  })

  it("derives a layer list from live shape roots and safely manages each layer", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "ellipse"})
    const rectangle = graphic.querySelector("rect")!
    const ellipse = graphic.querySelector("ellipse")!
    await mutationsDelivered()

    expect(editor.features.graphic.getState()?.layers).toEqual([
      {index: 0, label: "Rectangle 1", type: "rectangle", selected: false, primary: false, visible: true, locked: false},
      {index: 1, label: "Ellipse 2", type: "ellipse", selected: true, primary: true, visible: true, locked: false},
    ])

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-lock", index: 1})
    expect(ellipse).toHaveClass("◆graphic-shape-locked")
    expect(editor.features.graphic.selectedShapes).toHaveLength(0)
    expect(editor.features.graphic.getState()?.layers?.[1]).toMatchObject({locked: true, selected: false})
    expect(editor.toHTML(true)).not.toContain("graphic-shape-locked")

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-lock", index: 1})
    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "select", index: 1})
    expect(editor.features.graphic.selectedShape).toBe(ellipse)

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "toggle-visibility", index: 0})
    expect(rectangle).toHaveAttribute("visibility", "hidden")
    expect(editor.features.graphic.getState()?.layers?.[0].visible).toBe(false)
    await mutationsDelivered()

    editor.features.graphic.actions.manageGraphicLayer({type: "manageGraphicLayer", operation: "send-back", index: 1})
    expect(graphicShapeRoots(graphic)).toEqual([ellipse, rectangle])
    expect(editor.features.graphic.getState()?.layers?.map(layer => layer.type)).toEqual(["ellipse", "rectangle"])
    expect(editor.toHTML(true)).toContain('visibility="hidden"')

    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphicShapeRoots(graphic).map(shape => shape.localName)).toEqual(["rect", "ellipse"])
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(graphic.querySelector("rect")).not.toHaveAttribute("visibility")
    editor.features.history.actions.redo({type: "redo"})
    await mutationsDelivered()
    editor.features.history.actions.redo({type: "redo"})
    await mutationsDelivered()
    expect(graphicShapeRoots(graphic).map(shape => shape.localName)).toEqual(["ellipse", "rect"])
    expect(graphic.querySelector("rect")).toHaveAttribute("visibility", "hidden")
  })

  it("zooms, fits, and pans a captured graphic without authoring viewport state", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(100, 100, 800, 450),
    })
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "zoom-in"})
    expect(editor.features.graphic.getState()?.viewport).toEqual({zoom: 120})
    expect(graphic).toHaveClass("◆graphic-viewport-active")
    expect(editor.toHTML(true)).not.toContain("graphic-viewport-active")

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      composed: true,
      cancelable: true,
      deltaY: -100,
    })
    Object.defineProperties(wheel, {
      ctrlKey: {value: true},
      clientX: {value: 500},
      clientY: {value: 325},
    })
    graphic.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(editor.features.graphic.getState()!.viewport!.zoom).toBeGreaterThan(120)

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "actual-size"})
    expect(editor.features.graphic.getState()?.viewport).toBeUndefined()
    expect(graphic).not.toHaveClass("◆graphic-viewport-active")

    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: " ", code: "Space"}))
    expect(document.body).toHaveClass("◆graphic-pan-ready")
    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 8,
      clientX: 300,
      clientY: 250,
    }))
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      pointerId: 8,
      clientX: 360,
      clientY: 285,
    }))
    expect(document.body).toHaveClass("◆graphic-panning")
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 8}))
    document.dispatchEvent(new KeyboardEvent("keyup", {bubbles: true, key: " ", code: "Space"}))
    expect(editor.features.graphic.getState()?.viewport).toEqual({zoom: 100})
    expect(document.body).not.toHaveClass("◆graphic-pan-ready", "◆graphic-panning")

    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "fit-content"})
    expect(editor.features.graphic.getState()!.viewport!.zoom).toBeGreaterThan(100)
    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "actual-size"})
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("toggles editor-only grid presentation without serializing it", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    expect(graphic).toHaveClass("◆graphic-grid-visible")
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})

    expect(graphic).not.toHaveClass("◆graphic-grid-visible")
    expect(editor.features.graphic.getState()?.options?.grid).toBe(false)
    expect(editor.toHTML(true)).not.toContain("graphic-grid-visible")
  })

  it("fades captured overflow without changing authored filters, content or selection", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.style.cssText = "width:600px;height:300px;filter:grayscale(0.5);overflow:hidden"
    graphic.innerHTML = '<!--keep--><g transform="rotate(15)"><rect x="-120" y="-40" width="300" height="200" fill="red"/></g><foreignObject><custom-widget xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'
    const content = graphic.innerHTML, authoredStyle = graphic.getAttribute("style")
    const shape = graphic.querySelector("rect")!
    clickShape(shape)
    const sheet = document.adoptedStyleSheets.find(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("graphic-overflow-visible")))!
    const rule = () => sheet.cssRules[0] as CSSStyleRule
    expect(rule().style.filter).toMatch(/^grayscale\(0.5\) url\(/)
    const source = decodeURIComponent(rule().style.filter.match(/data:image\/svg\+xml,([^"#]+)/)![1])
    const filter = new DOMParser().parseFromString(source, "image/svg+xml")
    expect(filter.querySelector('feFlood[result="outside"]')).toHaveAttribute("flood-opacity", "0.35")
    expect(filter.querySelector('feFlood[result="inside"]')).toHaveAttribute("width", "600")
    expect(filter.querySelector('feFlood[result="inside"]')).toHaveAttribute("height", "300")
    expect(editor.features.graphic.selectedShape).toBe(shape.parentElement)
    const clean = graphic.cloneNode(true) as SVGSVGElement
    clearEditorMarkerClasses(clean)
    expect(clean.innerHTML).toBe(content)
    expect(graphic.getAttribute("style")).toBe(authoredStyle)
    await mutationsDelivered()
    expect(editor.doc.domToYxmlNode(graphic)!.toString()).not.toContain("◆graphic-overflow-visible")
    expect(editor.toHTML(true)).not.toContain("#overflow")
    expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).not.toContain("◆")
    editor.features.graphic.disable()
    expect(document.adoptedStyleSheets).not.toContain(sheet)
    expect(graphic).not.toHaveClass("◆graphic-overflow-visible")
    expect(graphic.getAttribute("style")).toBe(authoredStyle)
  })

  it("keeps insertion preview fading at the visible viewport when its SVG dimensions and zoom differ", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 1600 800")
    graphic.style.cssText = "width:800px;height:400px;filter:grayscale(0.5)"
    Object.defineProperty(graphic, "clientWidth", {value: 800})
    Object.defineProperty(graphic, "clientHeight", {value: 400})
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(30, 40, 800, 400)})
    let matrix = {a: .5, b: 0, c: 0, d: .5, e: 30, f: 40}
    Object.defineProperty(graphic, "getScreenCTM", {value: () => matrix})
    vi.spyOn(document, "elementFromPoint").mockReturnValue(graphic)
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 430, clientY: 240}))
    const authored = graphic.innerHTML, style = graphic.getAttribute("style")
    editor.features.graphic.actions.setGraphicShapePreview({type: "setGraphicShapePreview", shape: "rectangle", code: "KeyQ"})
    const preview = editor.appendix.querySelector<SVGSVGElement>(".◆graphic-insertion-preview")!
    Object.defineProperty(preview, "getScreenCTM", {value: () => matrix})
    Object.defineProperty(preview, "getBoundingClientRect", {value: () => new DOMRect(matrix.e, matrix.f, 1600 * matrix.a, 800 * matrix.d)})
    const inside = () => {
      expect(preview.style.filter).toMatch(/^grayscale\(0.5\) url\(/)
      const source = decodeURIComponent(preview.style.filter.match(/data:image\/svg\+xml,([^"#]+)/)![1])
      const flood = new DOMParser().parseFromString(source, "image/svg+xml").querySelector('feFlood[result="inside"]')!
      const values = ["x", "y", "width", "height"].map(name => Number(flood.getAttribute(name)))
      return {x: values[0], y: values[1], width: values[2], height: values[3]}
    }
    editor.features.graphic.refresh()
    expect(inside()).toEqual({x: 0, y: 0, width: 1600, height: 800})
    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom: 150})
    matrix = {a: .75, b: 0, c: 0, d: .75, e: -170, f: -60}
    editor.features.graphic.refresh()
    const mask = inside()
    expect(mask.x * matrix.a + matrix.e).toBeCloseTo(30)
    expect(mask.y * matrix.d + matrix.f).toBeCloseTo(40)
    expect((mask.x + mask.width) * matrix.a + matrix.e).toBeCloseTo(830)
    expect((mask.y + mask.height) * matrix.d + matrix.f).toBeCloseTo(440)
    expect(graphic.innerHTML).toBe(authored)
    expect(graphic.getAttribute("style")).toBe(style)
    expect(editor.toHTML(true)).not.toContain("#overflow")
    editor.features.graphic.disable()
    expect(preview.isConnected).toBe(false)
  })

  it("refreshes overflow boundaries after direct edits and cleans replaced graphics", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.style.cssText = "width:600px;height:300px"
    clickShape(graphic)
    const sheet = document.adoptedStyleSheets.find(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("graphic-overflow-visible")))!
    const before = sheet.cssRules[0].cssText
    graphic.style.width = "800px"
    await mutationsDelivered()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(sheet.cssRules[0].cssText).not.toBe(before)
    const replacement = graphic.cloneNode(true) as SVGSVGElement
    graphic.replaceWith(replacement)
    await mutationsDelivered()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(document.adoptedStyleSheets).not.toContain(sheet)
    expect(graphic).not.toHaveClass("◆graphic-overflow-visible")
    expect(replacement).not.toHaveClass("◆graphic-overflow-visible")
  })

  it.each([false, true])("repeats the grid despite a theme background reset (with shapes: %s)", withShapes => {
    const theme = new CSSStyleSheet()
    theme.replaceSync("* { background-repeat: no-repeat; }")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, theme]
    try {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      const graphic = document.querySelector("svg")!
      if(withShapes) editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})

      expect(getComputedStyle(graphic).backgroundImage).toContain("linear-gradient")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("repeat")

      editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})
      expect(getComputedStyle(graphic).backgroundImage).not.toContain("linear-gradient")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("no-repeat")

      editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("repeat")
      expect(editor.toHTML(true)).not.toContain("graphic-grid-visible")

      editor.features.graphic.disable()
      expect(graphic).not.toHaveClass("◆graphic-grid-visible")
      expect(getComputedStyle(graphic).backgroundRepeat).toBe("no-repeat")
    }
    finally {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== theme)
    }
  })
})


it("edits standalone SVG text without inventing a shape or rebuilding positioned spans", () => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  const text = document.createElementNS(SVG_NAMESPACE, "text")
  const span = document.createElementNS(SVG_NAMESPACE, "tspan")
  text.setAttribute("x", "100")
  span.setAttribute("rotate", "20")
  span.textContent = "label"
  text.append(span)
  svg.append(text)
  document.body.append(svg)
  span.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  expect(proxy).not.toBeNull()
  editor.features.mark.toggleMark("b")
  expect(svg.firstElementChild).toBe(text)
  expect(text.firstElementChild).toBe(span)
  expect(span.getAttribute("rotate")).toBe("20")
  expect(editor.features.mark.getState().marks).toContain("b")
  editor.destroy()
  expect(text.classList.contains("◆graphic-text-editing")).toBe(false)
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it("cleans up the SVG text input and marker when a remote edit replaces the label", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
  document.querySelector("polygon")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const old = document.querySelector("text")!
  const replacement = document.createElementNS(SVG_NAMESPACE, "text")
  replacement.textContent = "remote"
  old.replaceWith(replacement)
  editor.features.graphic.refresh()
  expect(old.classList.contains("◆graphic-text-editing")).toBe(false)
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
  expect(replacement.textContent).toBe("remote")
})


it("stops routing marks to a label when the document selection moves elsewhere", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "diamond"})
  document.querySelector("polygon")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const text = document.querySelector("text")!
  const paragraph = document.createElement("p")
  paragraph.textContent = "outside"
  document.body.append(paragraph)
  document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 0, paragraph.firstChild!, 7)
  editor.features.graphic.refresh()
  editor.features.mark.toggleMark("b")
  expect(paragraph.querySelector("b")?.textContent).toBe("outside")
  expect(text.querySelector("tspan")).toBeNull()
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it.each([
  {matrix:{a:.5,b:0,c:0,d:.5,e:40,f:20},center:{x:190,y:95}},
  {matrix:{a:0,b:.5,c:-.5,d:0,e:200,f:10},center:{x:125,y:160}},
])("centers an empty label caret independently of glyph bearings ($matrix)", ({matrix,center}) => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  svg.innerHTML = '<g><rect x="100" y="80" width="400" height="140"/><text x="300" y="150" font-size="48" dominant-baseline="middle"></text></g>'
  document.body.append(svg)
  const text = svg.querySelector("text")!
  Object.defineProperty(text, "getScreenCTM", {value: () => matrix})
  Object.defineProperty(svg.querySelector("rect")!, "getScreenCTM", {value: () => matrix})
  const measure = vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function(this: Range) {
    const sample = this.startContainer.parentElement
    if(sample?.getRootNode() !== editor.appendix || sample.localName !== "text") return new DOMRect()
    expect(this.collapsed).toBe(true)
    expect(sample.getAttribute("x")).toBe("300")
    expect(sample.getAttribute("y")).toBe(text.getAttribute("y"))
    expect(sample.parentElement!.getAttribute("transform")).toBe(`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`)
    expect(text.childNodes).toHaveLength(0)
    return new DOMRect(214, 53, 22, 28)
  })
  try {
    svg.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
    const caret = editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
    expect(parseFloat(caret.style.left)+.5).toBe(center.x)
    expect(parseFloat(caret.style.top)+14).toBe(center.y)
    expect(caret.style.height).toBe("28px")
    expect(editor.appendix.querySelector("svg text")).toBeNull()
    expect(text.childNodes).toHaveLength(0)
    expect(editor.features.graphic.textEditingRange?.collapsed).toBe(true)
    const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label", cancelable: true}))
    expect(text.textContent).toBe("Label")
    expect(editor.toHTML(true)).not.toContain("graphic-text")
  }
  finally { measure.mockRestore() }
})

it("creates an editable centered label on double-clicking an unlabeled shape", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const rect = document.querySelector("rect")!
  rect.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const text = rect.parentElement!.querySelector("text")!
  expect(text.textContent).toBe("")
  expect(Number(text.getAttribute("x"))).toBe(Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) / 2)
  expect(Number.isFinite(Number(text.getAttribute("y")))).toBe(true)
  expect(text.getAttribute("dominant-baseline")).toBe("alphabetic")
  expect(parseFloat(text.style.inlineSize)).toBe(Number(rect.getAttribute("width"))-16)
  const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
  editor.features.mark.toggleMark("b")
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "New", cancelable: true}))
  expect(text.textContent).toBe("New")
  expect(editor.features.mark.getState().marks).toContain("b")
})

it.each([false, true])("commits native label input when cancelable beforeinput is absent (beforeinput: %s)", beforeinput => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  document.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = document.querySelector("svg text")!
  editor.features.mark.toggleMark("b")
  if(beforeinput) proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label"}))
  proxy.value = "Label"
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "Label"}))
  expect(text.textContent).toBe("Label")
  expect(proxy.value).toBe("")
  expect(editor.features.mark.getState().marks).toContain("b")
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "!", cancelable: true}))
  expect(text.textContent).toBe("Label!")
  expect(editor.toHTML(true)).not.toContain("graphic-label-input")
})

it("commits composed label text once after native input", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  document.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = document.querySelector("svg text")!
  proxy.value = "é"
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertCompositionText", data: "é", isComposing: true}))
  expect(text.textContent).toBe("")
  proxy.dispatchEvent(Object.assign(new Event("compositionend"), {data: "é"}))
  proxy.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "é"}))
  expect(text.textContent).toBe("é")
  expect(proxy.value).toBe("")
})

it("leaves printable keydown events focused on the label proxy until beforeinput", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const selection = document.getSelection()!
  for(const key of ["a", "b", "é"]) {
    // Native shadow input focus projects its selection outside the SVG.
    selection.setBaseAndExtent(document.documentElement, 1, document.documentElement, 1)
    const setRange = vi.spyOn(selection, "setBaseAndExtent")
    const event = new KeyboardEvent("keydown", {key, altKey: key === "é", bubbles: true, cancelable: true})
    proxy.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(setRange).not.toHaveBeenCalled()
    expect(editor.features.graphic.isTextInputFocused).toBe(true)
    setRange.mockRestore()
    proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: key, cancelable: true}))
  }
  expect(graphic.querySelector("text")!.textContent).toBe("abé")
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
})

it("allows typing when native label focus is projected to the document", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  for(const key of "Label") {
    proxy.blur()
    document.getSelection()!.setBaseAndExtent(document.documentElement, 1, document.documentElement, 1)
    const keydown = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})
    document.body.dispatchEvent(keydown)
    expect(keydown.defaultPrevented).toBe(false)
    const input = new InputEvent("beforeinput", {inputType: "insertText", data: key, bubbles: true, cancelable: true})
    document.body.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(true)
    expect(editor.features.graphic.isTextInputFocused).toBe(true)
  }
  expect(graphic.querySelector("text")!.textContent).toBe("Label")
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
})

it("retains graphic capture while editing a label and typing after native focus moves", async () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  const text = graphic.querySelector("text")!
  const restoreInputCaret = vi.spyOn(proxy, "setSelectionRange")
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  proxy.blur()
  editor.features.selection.processSelection()
  expect(graphic).toHaveClass("◆element-capture-selected")
  document.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "First", cancelable: true}))
  await mutationsDelivered()
  expect(text.textContent).toBe("First")
  expect(restoreInputCaret).toHaveBeenCalledWith(0, 0)
  expect(editor.features.graphic.isTextInputFocused).toBe(true)
  expect(editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!.style.animation).toContain("blink")
  document.getSelection()!.removeAllRanges()
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: " second", cancelable: true}))
  expect(text.textContent).toBe("First second")
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
})

it.each(["shape", "outline", "resize-se", "rotate", "roundness", "port", "graphic-resize"])("selects the shape and exits label editing on its %s", surface => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  const graphic = document.querySelector("svg")!
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
  editor.features.mark.toggleMark("b")
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label", cancelable: true}))
  const shape = editor.features.graphic.selectedShape!, text = shape.querySelector("text")!
  const geometry = shape.querySelector("rect")!
  const target = surface === "shape" ? geometry
    : surface === "outline" ? editor.appendix.querySelector('[part="graphic-selection-outline"]')!
    : surface === "port" ? editor.appendix.querySelector('[data-graphic-port="n"]')!
    : surface === "graphic-resize" ? editor.features.transformation.overlay.querySelector('[data-transform-mode="scale"]')!
    : editor.appendix.querySelector(`[data-graphic-handle="${surface}"]`)!
  expect(target).not.toBeNull()
  const pointer = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 7})
  if(surface === "shape") Object.defineProperty(pointer, "composedPath", {value: () => [geometry, shape, graphic, editor.appendix.querySelector("slot"), editor.appendix, document.body, document, window]})
  target.dispatchEvent(pointer)
  expect(editor.features.graphic.selectedShape).toBe(shape)
  expect(editor.features.graphic.textEditingRange).toBeNull()
  expect(editor.features.graphic.isTextInputFocused).toBe(false)
  expect(editor.appendix.querySelector('.◆graphic-label-input, [part="graphic-text-caret"]')).toBeNull()
  expect(text).not.toHaveClass("◆graphic-text-editing")
  document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 7}))
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(text.textContent).toBe("Label")
  expect(editor.toHTML(true)).not.toContain("◆")
  const x = Number(geometry.getAttribute("x"))
  document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
  expect(Number(geometry.getAttribute("x"))).toBe(x+1)
  expect(text.textContent).toBe("Label")
  const labelTarget = text.firstElementChild ?? text
  labelTarget.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 8}))
  expect(editor.features.graphic.textEditingRange).not.toBeNull()
  expect(editor.features.graphic.isTextInputFocused).toBe(true)
  expect(editor.appendix.querySelector('[part="graphic-text-caret"]')).not.toBeNull()
})

it("keeps canvas capture and mark availability stable when dismissing a shape label on the blank graphic", async () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
  const graphic = document.querySelector("svg")!, geometry = graphic.querySelector("rect")!
  geometry.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  const proxy = editor.appendix.querySelector(".◆graphic-label-input")!
  proxy.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "Label", cancelable: true}))
  await mutationsDelivered()
  expect(editor.features.mark.getState()).toMatchObject({canMark: true, svgText: true})
  const post = vi.spyOn(editor, "postHostMessage")
  graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 89, clientX: 10, clientY: 10}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 89}))
  await mutationsDelivered()
  document.dispatchEvent(new Event("selectionchange"))
  const messages = post.mock.calls.map(([message]) => message as {type: string, detail?: {canMark?: boolean, svgText?: boolean, graphic?: {capture: boolean}}})
  const marks = messages.filter(message => message.type === markStateChangeEvent)
  expect(marks.length).toBeGreaterThan(0)
  expect(marks.every(message => !message.detail?.canMark || message.detail.svgText)).toBe(true)
  expect(messages.filter(message => message.type === selectionChangeEvent).every(message => message.detail?.graphic?.capture)).toBe(true)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(editor.features.graphic.selectedShapes).toHaveLength(0)
  expect(editor.features.graphic.textEditingRange).toBeNull()
  expect(editor.features.mark.getState()).toMatchObject({canMark: false})
  expect(graphic.querySelector("text")).toHaveTextContent("Label")
  expect(editor.toHTML(true)).not.toContain("◆")
})

it("reopens a label on one click and preserves backwards Shift selection across proxy focus", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "text-box"})
  const graphic = document.querySelector("svg")!
  const text = graphic.querySelector("text")!
  text.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 1}))
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 1}))
  const proxy = editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
  expect(proxy).not.toBeNull()
  const node = text.firstChild!
  document.getSelection()!.setBaseAndExtent(node, 4, node, 2)
  editor.features.graphic.rememberTextSelection()
  // Chromium projects an appendix input selection to BODY while it is focused.
  document.getSelection()!.setBaseAndExtent(document.body, 0, document.body, 0)
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true}))
  expect(document.getSelection()!.anchorOffset).toBe(4)
  expect(document.getSelection()!.focusOffset).toBe(1)
  expect(editor.features.graphic.textEditingRange?.toString()).toBe("ext")
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true}))
  expect(editor.features.graphic.textEditingRange?.toString()).toBe("xt")
  proxy.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(text).not.toHaveClass("◆graphic-text-editing")
  expect(editor.toHTML(true)).not.toContain("◆")
})


it.each(["shape", "canvas"])("capture-selects an element-selected standalone graphic by clicking its %s", surface => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  editor.features.selection.selectElement(document.querySelector("svg")!)
  const graphic = document.querySelector("svg")!
  const shape = graphic.querySelector("rect")!
  expect($.selectedElement).toBe(graphic)
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  clickShape(surface === "shape" ? shape : graphic)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(graphic).toHaveClass("◆element-capture-selected")
  expect(editor.features.graphic.getState()?.capture).toBe(true)
  clickShape(shape)
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(editor.features.graphic.selectedShape).toBe(shape)
  expect(editor.toHTML(true)).not.toContain("◆")
})

it.each(["document", "canvas", "slides"] as const)("capture-selects an element-selected drawing canvas on an interior click in %s", mode => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
  editor.features.selection.selectElement(graphic)
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  const hit = vi.spyOn($, "pointFromCoords").mockReturnValue({node: graphic.parentNode!, offset: Array.from(graphic.parentNode!.childNodes).indexOf(graphic)})
  try {
    clickShape(graphic)
    expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    expect(editor.features.selection.isInDragSelection).toBe(false)
    if(mode !== "document") {
      expect(editor.features.transformation.overlay.getAttribute("part")?.split(/\s+/)).toContain("transform-overlay-capture-selected")
      editor.features.selection.selectElement(graphic)
      expect(editor.features.transformation.overlay.getAttribute("part")?.split(/\s+/)).not.toContain("transform-overlay-capture-selected")
    }
  }
  finally { hit.mockRestore(); document.body.className = "" }
})

it("does not capture an element-selected graphic on a secondary click", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape: "rectangle"})
  editor.features.selection.selectElement(document.querySelector("svg")!)
  document.querySelector("rect")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 2}))
  expect(editor.features.selection.captureSelectedElement).toBeNull()
})


it("leaves label editing and capture selection when its canvas edge is clicked", () => {
  const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
  graphic.innerHTML = '<g><rect width="100" height="50"/><text>Label</text></g>'
  document.body.append(graphic)
  graphic.querySelector("rect")!.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, button: 0}))
  expect(editor.features.selection.captureSelectedElement).toBe(graphic)
  expect(editor.features.graphic.isTextInputFocused).toBe(true)
  editor.features.selection.selectionCaret!.querySelector(".◆capture-edge")!
    .dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  expect($.selectedElement).toBe(graphic)
  expect(graphic).not.toHaveClass("◆element-capture-selected")
  expect(editor.appendix.querySelector(".◆graphic-label-input")).toBeNull()
})


it("keeps graphic grid tiles fixed when dimensions and the viewBox change", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  const tileSize = getComputedStyle(graphic).backgroundSize
  expect(tileSize).toContain("24px 24px")
  for(const [width, height, viewBox] of [["300px", "200px", "0 0 1600 900"], ["900px", "100px", "200 300 400 200"]]) {
    graphic.style.width = width
    graphic.style.height = height
    graphic.setAttribute("viewBox", viewBox)
    editor.features.graphic.refresh()
    expect(getComputedStyle(graphic).backgroundSize).toBe(tileSize)
  }
})

it("previews and commits a freehand stroke in SVG coordinates without touching existing content", async () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  graphic.innerHTML = '<!--keep--><g><path d="M0 0L5 5"/></g>'
  const sibling = graphic.lastElementChild!
  graphic.setAttribute("viewBox", "0 0 400 300")
  Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 100, f: 50})})
  await mutationsDelivered()
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})

  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 11, clientX: 120, clientY: 90}))
  expect(Array.from(graphic.querySelectorAll("path")).filter(path => graphicShapeType(path) === "freehand")).toHaveLength(0)
  const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
  expect(preview).toBeTruthy()
  expect(preview).toHaveAttribute("fill", "none")
  expect(preview).toHaveAttribute("stroke", "#334155")
  expect(preview).toHaveAttribute("stroke-width", "4")
  graphic.dispatchEvent(new PointerEvent("pointermove", {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 11, buttons: 1, clientX: 160, clientY: 110}))
  expect(Array.from(graphic.querySelectorAll("path")).filter(path => graphicShapeType(path) === "freehand")).toHaveLength(0)
  graphic.dispatchEvent(new PointerEvent("pointerup", {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 11, clientX: 180, clientY: 130}))

  const stroke = Array.from(graphic.querySelectorAll<SVGPathElement>("path")).find(path => graphicShapeType(path) === "freehand")!
  expect(stroke).toBeTruthy()
  expect(stroke.getAttribute("d")).toMatch(/^M\s*10\s*20/)
  expect(stroke.getAttribute("d")).toContain("40 40")
  expect(stroke.getAttribute("d")).toContain("30 30")
  expect(stroke).toHaveAttribute("fill", "none")
  expect(stroke).toHaveAttribute("stroke-linecap", "round")
  expect(stroke).toHaveAttribute("stroke-linejoin", "round")
  expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
  expect(graphic.children[0]).toBe(sibling)
  expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  await mutationsDelivered()
  expect(editor.doc.body.toString()).not.toContain("◆")
  expect(await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})).not.toContain("◆")
  editor.features.history.actions.undo({type: "undo"})
  expect(Array.from(graphic.querySelectorAll("path")).some(path => graphicShapeType(path) === "freehand")).toBe(false)
  expect(graphic.lastElementChild).toBe(sibling)
  editor.features.history.actions.redo({type: "redo"})
  expect(Array.from(graphic.querySelectorAll("path")).some(path => graphicShapeType(path) === "freehand")).toBe(true)
})

it("creates a freehand dot on tap and applies the selected drawing paint", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  editor.features.graphic.actions.setGraphicDrawPaint({type: "setGraphicDrawPaint", paint: {stroke: "rebeccapurple", "stroke-width": "7"}})
  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 12, clientX: 32, clientY: 48}))
  graphic.dispatchEvent(new PointerEvent("pointerup", {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 12, clientX: 32, clientY: 48}))
  const stroke = Array.from(graphic.querySelectorAll<SVGPathElement>("path")).find(path => graphicShapeType(path) === "freehand")!
  expect(stroke.getAttribute("d")).toMatch(/^M\s*32\s*48/)
  expect(stroke).toHaveAttribute("stroke", "rebeccapurple")
  expect(stroke).toHaveAttribute("stroke-width", "7")
  expect(stroke).toHaveAttribute("fill", "none")
})

it("selects, moves, and resizes a finished freehand stroke", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 15, clientX: 10, clientY: 10}))
  graphic.dispatchEvent(new PointerEvent("pointermove", {isPrimary: true, pointerType: "pen", bubbles: true, buttons: 1, pointerId: 15, clientX: 50, clientY: 50}))
  graphic.dispatchEvent(new PointerEvent("pointerup", {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 15, clientX: 70, clientY: 70}))
  const stroke = Array.from(graphic.querySelectorAll<SVGPathElement>("path")).find(path => graphicShapeType(path) === "freehand")!
  expect(stroke).toBeTruthy()
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
  clickShape(stroke)
  expect(editor.features.graphic.selectedShape).toBe(stroke)
  const overlay = editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")!
  expect(overlay.querySelector('[data-graphic-handle="resize-se"]')).not.toBeNull()
  const before = stroke.getAttribute("d")!
  editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "x", value: "20"})
  expect(stroke.getAttribute("d")).toMatch(/^M 20 10/)
  editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "width", value: "120"})
  expect(stroke.getAttribute("d")).toMatch(/L 140 70$/)
  expect(stroke.getAttribute("d")).not.toBe(before)
  expect(stroke).toHaveAttribute("stroke-width", "4")
  expect(graphicShapeType(stroke)).toBe("freehand")
})

it("keeps the first freehand pointer active when a secondary pointer presses the canvas", () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 21, clientX: 10, clientY: 15}))
  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 22, clientX: 80, clientY: 85}))
  graphic.dispatchEvent(new PointerEvent("pointermove", {isPrimary: true, pointerType: "pen", bubbles: true, buttons: 1, pointerId: 21, clientX: 40, clientY: 45}))
  graphic.dispatchEvent(new PointerEvent("pointerup", {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 21, clientX: 50, clientY: 55}))
  const stroke = Array.from(graphic.querySelectorAll<SVGPathElement>("path")).find(path => graphicShapeType(path) === "freehand")!
  expect(stroke).toBeTruthy()
  expect(stroke.getAttribute("d")).toContain("40 45")
  expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
})

it.each(["pointercancel", "lostpointercapture", "blur"])("cleans up a freehand preview on %s", eventName => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  graphic.dispatchEvent(new PointerEvent("pointerdown", {isPrimary: true, pointerType: "pen", bubbles: true, cancelable: true, button: 0, pointerId: 31, clientX: 10, clientY: 20}))
  graphic.dispatchEvent(new PointerEvent("pointermove", {isPrimary: true, pointerType: "pen", bubbles: true, buttons: 1, pointerId: 31, clientX: 30, clientY: 40}))
  expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
  const target: EventTarget = eventName === "blur" ? window : graphic
  target.dispatchEvent(eventName === "blur" ? new Event(eventName) : new PointerEvent(eventName, {isPrimary: true, pointerType: "pen", bubbles: true, pointerId: 31}))
  expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  expect(Array.from(graphic.querySelectorAll("path")).some(path => graphicShapeType(path) === "freehand")).toBe(false)
  expect(graphic.querySelector("[class*='◆']")).toBeNull()
  expect(editor.features.graphic.getState()?.mode).toBe("draw")
})

it("uses coalesced pen samples and keeps consecutive strokes in separate undo items across remote changes", async () => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  await mutationsDelivered()
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  const pointer = (type: string, x: number, y: number) => new PointerEvent(type, {
    bubbles: true, cancelable: true, isPrimary: true, pointerType: "pen", button: 0, pointerId: 7, clientX: x, clientY: y,
  })
  graphic.dispatchEvent(pointer("pointerdown", 10, 10))
  const move = pointer("pointermove", 90, 90)
  Object.defineProperty(move, "getCoalescedEvents", {value: () => [pointer("pointermove", 20, 30), pointer("pointermove", 40, 10)]})
  graphic.dispatchEvent(move)
  // A remote change to the same live canvas must survive the local commit and undo.
  const sharedGraphic = editor.doc.body.toArray().find(node => node instanceof Y.XmlElement && node.nodeName === "svg") as Y.XmlElement
  editor.doc.doc.transact(() => sharedGraphic.setAttribute("aria-label", "Remote label"), "remote-client")
  graphic.dispatchEvent(pointer("pointerup", 50, 20))
  const first = graphic.querySelector("path")!
  expect(first.getAttribute("d")).toContain("20 30")
  expect(first.getAttribute("d")).toContain("40 10")
  expect(first.getAttribute("d")).not.toContain("90 90")
  expect(editor.features.graphic.getState()?.mode).toBe("draw")
  graphic.dispatchEvent(pointer("pointerdown", 60, 10))
  graphic.dispatchEvent(pointer("pointerup", 80, 20))
  expect(graphic.querySelectorAll("path")).toHaveLength(2)
  editor.doc.undo()
  expect(graphic.querySelectorAll("path")).toHaveLength(1)
  expect(graphic.querySelector("path")).toBe(first)
  editor.doc.undo()
  expect(graphic.querySelector("path")).toBeNull()
  expect(graphic).toHaveAttribute("aria-label", "Remote label")
  editor.doc.redo()
  editor.doc.redo()
  expect(graphic.querySelectorAll("path")).toHaveLength(2)
})

it.each(["select", "escape", "disable", "replace", "widget", "lock"])("discards a pending freehand stroke on %s", async ending => {
  editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
  const graphic = document.querySelector("svg")!
  editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
  graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, isPrimary: true, button: 0, pointerId: 41}))
  expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
  if(ending === "select") editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
  else if(ending === "escape") document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "Escape"}))
  else if(ending === "disable") editor.features.graphic.disable()
  else if(ending === "replace") graphic.replaceWith(graphic.cloneNode(true))
  else if(ending === "lock") editor.lockEditing("test")
  else {
    const widget = document.createElement("test-widget")
    graphic.replaceWith(widget)
    widget.append(graphic)
  }
  await mutationsDelivered()
  document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 41, clientX: 100, clientY: 100}))
  expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  expect(graphic.querySelector("path")).toBeNull()
  expect(graphic).not.toHaveClass("◆graphic-drawing")
  expect(editor.features.graphic.getState()?.mode).not.toBe("draw")
})

describe("polyline and Bezier path drawing", () => {
  let pointerId = 100
  const pointClick = (graphic: SVGSVGElement, x: number, y: number, options: {altKey?: boolean, shiftKey?: boolean} = {}) => {
    const id = pointerId++
    graphic.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, isPrimary: true, pointerType: "mouse", button: 0, pointerId: id,
      clientX: x, clientY: y, ...options,
    }))
    graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerType: "mouse", button: 0, pointerId: id, clientX: x, clientY: y}))
  }

  it("draws through an SVG transform, snaps to the grid, and supports Alt bypass and captured undo shortcuts", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 400 300")
    graphic.style.width = "800px"
    graphic.style.height = "600px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(100, 50, 800, 600)})
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 100, f: 50})})
    await mutationsDelivered()
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})

    pointClick(graphic, 120, 90)
    expect(editor.appendix.querySelector(".◆graphic-preview path")).not.toBeNull()
    pointClick(graphic, 160, 110)
    pointClick(graphic, 180, 130, {altKey: true})
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))

    const path = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "polyline")!
    expect(graphicShapeType(path)).toBe("polyline")
    expect(path.getAttribute("d")).toBe("M 12 24 L 36 36 L 40 40")
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    await mutationsDelivered()
    expect(editor.doc.body.toString()).not.toContain("◆")
    const serialized = await editor.features.graphic.actions.serializeGraphic({type: "serializeGraphic"})
    expect(serialized).toContain("<path")
    expect(serialized).not.toContain("◆")
    expect(serialized).not.toContain("data-graphic-handle")

    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      const undo = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "z", metaKey: true})
      document.dispatchEvent(undo)
      expect(undo.defaultPrevented).toBe(true)
      expect([...graphic.querySelectorAll("path")].some(shape => graphicShapeType(shape) === "polyline")).toBe(false)
      const redo = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Z", metaKey: true, shiftKey: true})
      document.dispatchEvent(redo)
      expect(redo.defaultPrevented).toBe(true)
      expect([...graphic.querySelectorAll("path")].some(shape => graphicShapeType(shape) === "polyline")).toBe(true)
    }
    finally { Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true}) }
  })

  it("uses Ctrl+Z and Ctrl+Y for a captured path on Windows and Linux", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    await mutationsDelivered()
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 0, 0)
    pointClick(graphic, 100, 100)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    await mutationsDelivered()
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      const undo = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "z", ctrlKey: true})
      document.dispatchEvent(undo)
      expect(undo.defaultPrevented).toBe(true)
      expect([...graphic.querySelectorAll("path")].some(shape => graphicShapeType(shape) === "polyline")).toBe(false)
      const redo = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "y", ctrlKey: true})
      document.dispatchEvent(redo)
      expect(redo.defaultPrevented).toBe(true)
      expect([...graphic.querySelectorAll("path")].some(shape => graphicShapeType(shape) === "polyline")).toBe(true)
    }
    finally { Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true}) }
  })

  it("closes a Lines path at its first vertex and finishes a Curves path on double-click", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 0, 0)
    pointClick(graphic, 50, 0)
    pointClick(graphic, 50, 50)
    pointClick(graphic, 0, 0)
    // This triangle also matches a Merge preset at its new apex endpoint.
    const closed = graphic.querySelector<SVGPathElement>("path")!
    expect(closed.getAttribute("d")).toMatch(/^M 0 0 L 48 0 L 48 48 Z$/)

    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "curves"})
    pointClick(graphic, 100, 100)
    pointClick(graphic, 200, 100)
    graphic.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true, button: 0}))
    const curve = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "bezier")!
    expect(curve).toBeTruthy()
    expect(curve.getAttribute("d")).toMatch(/^M\s*96\s*96\s*C/)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
  })

  it("constrains a shifted Lines segment to a 45 degree direction", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 0, 0)
    pointClick(graphic, 80, 40, {shiftKey: true})
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    const path = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "polyline")!
    expect(path.getAttribute("d")).toBe("M 0 0 L 72 72")
  })

  it("creates symmetric curve handles and supports selected path point edits as one undo step", async () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "curves"})
    const id = pointerId++
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true, button: 0, pointerId: id, clientX: 50, clientY: 50}))
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, isPrimary: true, buttons: 1, pointerId: id, clientX: 100, clientY: 100}))
    graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerId: id, clientX: 100, clientY: 100}))
    const middleId = pointerId++
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true, button: 0, pointerId: middleId, clientX: 200, clientY: 50}))
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, isPrimary: true, buttons: 1, pointerId: middleId, clientX: 250, clientY: 100}))
    graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerId: middleId, clientX: 250, clientY: 100}))
    pointClick(graphic, 350, 50)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))

    const curve = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "bezier")!
    const symmetricPath = "M 50 50 C 100 100 150 0 200 50 C 250 100 300 50 350 50"
    expect(curve.getAttribute("d")).toBe(symmetricPath)
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    clickShape(curve)
    const incomingHandle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-2"]')!
    const tangentId = pointerId++
    incomingHandle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: tangentId, clientX: 150, clientY: 0}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, buttons: 1, altKey: true, pointerId: tangentId, clientX: 150, clientY: -50}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, altKey: true, pointerId: tangentId, clientX: 150, clientY: -50}))
    expect(curve.getAttribute("d")).toBe("M 50 50 C 100 100 150 -50 200 50 C 250 100 300 50 350 50")

    const firstAnchor = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    expect(firstAnchor).toBeTruthy()
    const before = curve.getAttribute("d")!
    const dragId = pointerId++
    firstAnchor.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: dragId, clientX: 50, clientY: 50}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, buttons: 1, pointerId: dragId, clientX: 125, clientY: 50}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: dragId, clientX: 125, clientY: 50}))
    expect(curve.getAttribute("d")).not.toBe(before)
    await mutationsDelivered()
    editor.features.history.actions.undo({type: "undo"})
    expect(curve.getAttribute("d")).toBe(before)
    editor.features.history.actions.redo({type: "redo"})
    expect(curve.getAttribute("d")).not.toBe(before)
  })

  it("cleans a path preview and drawing markers when the captured graphic is replaced", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 10, 10)
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
    const replacement = graphic.cloneNode(true) as SVGSVGElement
    graphic.replaceWith(replacement)
    await mutationsDelivered()
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.appendix.querySelector(".◆graphic-path-controls")).toBeNull()
    expect(document.querySelectorAll(".◆graphic-drawing")).toHaveLength(0)
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: pointerId - 1, clientX: 100, clientY: 100}))
    expect(replacement.querySelector("path")).toBeNull()
  })

  it.each([
    {mode: "select", platform: "Win32", modifier: "ctrl"},
    {mode: "draw", platform: "Win32", modifier: "ctrl"},
    {mode: "select", platform: "MacIntel", modifier: "meta"},
    {mode: "draw", platform: "MacIntel", modifier: "meta"},
  ] as const)("routes undo and redo while captured in $mode mode on $platform", async ({mode, platform, modifier}) => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    await mutationsDelivered()
    if(mode === "select") {
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
      pointClick(graphic, 0, 0)
      pointClick(graphic, 100, 100)
      document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    }
    else {
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "draw"})
      const id = pointerId++
      graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true, pointerType: "pen", button: 0, pointerId: id, clientX: 10, clientY: 10}))
      graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerType: "pen", pointerId: id, clientX: 10, clientY: 10}))
    }
    await mutationsDelivered()
    const shapeType = mode === "select" ? "polyline" : "freehand"
    const hasShape = () => [...graphic.querySelectorAll<SVGPathElement>("path")].some(shape => graphicShapeType(shape) === shapeType)
    expect(hasShape()).toBe(true)

    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: platform, configurable: true})
      const undo = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "z", ctrlKey: modifier === "ctrl", metaKey: modifier === "meta"})
      document.dispatchEvent(undo)
      expect(undo.defaultPrevented).toBe(true)
      expect(hasShape()).toBe(false)
      const redo = new KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, key: modifier === "ctrl" ? "y" : "Z",
        ctrlKey: modifier === "ctrl", metaKey: modifier === "meta", shiftKey: modifier === "meta",
      })
      document.dispatchEvent(redo)
      expect(redo.defaultPrevented).toBe(true)
      expect(hasShape()).toBe(true)
    }
    finally { Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true}) }
  })

  it("moves a selected path point by one or fifty pixels with arrow keys", async () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    await mutationsDelivered()
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 100, 100)
    pointClick(graphic, 200, 100)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    const path = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "polyline")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    clickShape(path)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: pointerId++, clientX: 100, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: pointerId - 1, clientX: 100, clientY: 100}))

    const one = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"})
    document.dispatchEvent(one)
    expect(one.defaultPrevented).toBe(true)
    expect(path.getAttribute("d")).toBe("M 101 100 L 200 100")
    const fifty = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight", shiftKey: true})
    document.dispatchEvent(fifty)
    expect(fifty.defaultPrevented).toBe(true)
    expect(path.getAttribute("d")).toBe("M 151 100 L 200 100")
  })

  it("moves the last draft vertex with arrows, removes it with Backspace, and cancels without inserting", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 0, 0)
    pointClick(graphic, 100, 0)
    const one = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"})
    document.dispatchEvent(one)
    expect(one.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆graphic-preview path")?.getAttribute("d")).toBe("M 0 0 L 101 0")
    const fifty = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight", shiftKey: true})
    document.dispatchEvent(fifty)
    expect(fifty.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆graphic-preview path")?.getAttribute("d")).toBe("M 0 0 L 151 0")
    const removeLast = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Backspace"})
    document.dispatchEvent(removeLast)
    expect(removeLast.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆graphic-preview path")?.getAttribute("d")).toBe("M 0 0 L 0 0")
    expect(graphic.querySelector("path")).toBeNull()
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Escape"}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.appendix.querySelector(".◆graphic-path-controls")).toBeNull()
    expect(graphic.querySelector("path")).toBeNull()
  })

  it("moves a closed curve's first anchor, closing endpoint, and adjacent controls together", () => {
    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "snap"})
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0})})
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "curves"})
    const first = pointerId++
    graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true, button: 0, pointerId: first, clientX: 50, clientY: 50}))
    graphic.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, isPrimary: true, buttons: 1, pointerId: first, clientX: 100, clientY: 100}))
    graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerId: first, clientX: 100, clientY: 100}))
    pointClick(graphic, 200, 50)
    pointClick(graphic, 200, 200)
    pointClick(graphic, 50, 50)
    const path = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "bezier")!
    expect(path.getAttribute("d")).toMatch(/Z$/)
    const before = graphicPathGeometry(path)!
    expect(before.points[0]).toEqual({x: 50, y: 50})
    expect(before.points.at(-1)).toEqual(before.points[0])

    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    clickShape(path)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    const id = pointerId++
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: id, clientX: 50, clientY: 50}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, buttons: 1, pointerId: id, clientX: 100, clientY: 50}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: id, clientX: 100, clientY: 50}))
    const after = graphicPathGeometry(path)!
    expect(after.points[0]).toEqual({x: 100, y: 50})
    expect(after.points.at(-1)).toEqual(after.points[0])
    expect(after.points[1]).toEqual({x: 150, y: 100})
    expect(after.points.at(-2)).toEqual({x: 50, y: 0})
  })

  it("keeps an external path edit when the original geometry changes during a handle drag", async () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    await mutationsDelivered()
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 100, 100)
    pointClick(graphic, 200, 100)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    const path = [...graphic.querySelectorAll<SVGPathElement>("path")].find(shape => graphicShapeType(shape) === "polyline")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    clickShape(path)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    const id = pointerId++
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: id, clientX: 100, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, buttons: 1, pointerId: id, clientX: 150, clientY: 150}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
    const external = "M 10 20 L 30 40"
    path.setAttribute("d", external)
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: id, clientX: 150, clientY: 150}))
    await mutationsDelivered()
    expect(path.getAttribute("d")).toBe(external)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })
  it("keeps an imported curve's implicit closing edge when editing its first anchor", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<g><!--keep--><path d="M 50 50 C 100 0 150 100 200 50 Z" fill="none" stroke="black"/></g>'
    const path = graphic.querySelector<SVGPathElement>("path")!
    clickShape(path)
    expect(editor.appendix.querySelector('[data-graphic-handle="path-point-3"]')).not.toBeNull()
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-0"]')!
    const id = pointerId++
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: id, clientX: 50, clientY: 50}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: id, clientX: 50, clientY: 50}))
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"}))
    expect(path.getAttribute("d")).toBe("M 51 50 C 101 0 150 100 200 50 Z")
    expect(graphic.querySelector("g")!.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
  })

  it("uses the grid ahead of object edges and ignores secondary contacts between vertices", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<rect x="12" y="31" width="100" height="100"/>'
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
    pointClick(graphic, 12, 31)
    const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
    expect(preview.getAttribute("d")).toBe("M 24 24 L 24 24")
    const secondary = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: false, pointerType: "touch", button: 0, pointerId: pointerId++, clientX: 200, clientY: 200})
    graphic.dispatchEvent(secondary)
    expect(secondary.defaultPrevented).toBe(true)
    expect(editor.features.graphic.getState()?.mode).toBe("lines")
    expect(preview.getAttribute("d")).toBe("M 24 24 L 24 24")
    pointClick(graphic, 100, 100)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    expect(graphic.querySelector("path")!.getAttribute("d")).toBe("M 24 24 L 96 96")
    expect(graphic.querySelector("rect")).toHaveAttribute("x", "12")
  })

  it("snaps to fixed screen-grid intersections with a translated nonzero viewBox", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("viewBox", "100 200 400 300")
    graphic.style.width = "200px"
    graphic.style.height = "170px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(0, 0, 200, 170)})
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 0.5, b: 0, c: 0, d: 0.5, e: -50, f: -90})})
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})

    pointClick(graphic, 25, 25)
    const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
    expect(preview.getAttribute("d")).toBe("M 148 228 L 148 228")
  })

  it("maps a fixed screen grid through anisotropic SVG scaling", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 400 300")
    graphic.setAttribute("preserveAspectRatio", "none")
    graphic.style.width = "800px"
    graphic.style.height = "150px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(0, 0, 800, 150)})
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 0.5, e: 0, f: 0})})
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})

    pointClick(graphic, 73, 15.75)
    const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
    expect(preview.getAttribute("d")).toBe("M 36 48 L 36 48")
  })

  it("includes native SVG zoom and pan when choosing screen-grid intersections", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")! as SVGSVGElement & {currentScale: number, currentTranslate: DOMPoint}
    graphic.setAttribute("viewBox", "0 0 400 300")
    graphic.style.width = "400px"
    graphic.style.height = "300px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(0, 0, 400, 300)})
    Object.defineProperty(graphic, "currentScale", {value: 2, configurable: true})
    Object.defineProperty(graphic, "currentTranslate", {value: {x: 10, y: -10}, configurable: true})
    Object.defineProperty(graphic, "getScreenCTM", {value: () => ({a: 2, b: 0, c: 0, d: 2, e: 10, f: -10})})
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})

    pointClick(graphic, 73, 15)
    const preview = editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
    expect(preview.getAttribute("d")).toBe("M 31 17 L 31 17")
  })

  it("moves on the viewport grid with Alt bypass and with the visible grid hidden", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("preserveAspectRatio", "none")
    graphic.style.width = "3200px"
    graphic.style.height = "900px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(0, 0, 3200, 900)})
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 2, b: 0, c: 0, d: 1, e: 10, f: 5})})
    const rectangle = graphic.querySelector<SVGRectElement>("rect")!
    rectangle.setAttribute("x", "100")
    rectangle.setAttribute("y", "100")
    rectangle.setAttribute("width", "100")
    rectangle.setAttribute("height", "100")
    clickShape(rectangle)
    const drag = (id: number, start: {x: number, y: number}, end: {x: number, y: number}, altKey = false) => {
      rectangle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: id, clientX: start.x, clientY: start.y}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: id, clientX: end.x, clientY: end.y, altKey}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: id, clientX: end.x, clientY: end.y, altKey}))
    }

    drag(181, {x: 310, y: 155}, {x: 330, y: 167}, true)
    expect(rectangle).toHaveAttribute("x", "110")
    expect(rectangle).toHaveAttribute("y", "112")

    editor.features.graphic.actions.toggleGraphicOption({type: "toggleGraphicOption", name: "grid"})
    drag(182, {x: 330, y: 167}, {x: 336, y: 170})
    expect(rectangle).toHaveAttribute("x", "115")
    expect(rectangle).toHaveAttribute("y", "115")
    expect(graphic).not.toHaveClass("◆graphic-grid-visible")
  })

  it("resizes a rectangle to viewport-grid intersections under anisotropic mapping", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "rectangle"})
    const graphic = document.querySelector("svg")!
    graphic.setAttribute("preserveAspectRatio", "none")
    graphic.style.width = "3200px"
    graphic.style.height = "900px"
    Object.defineProperty(graphic, "getBoundingClientRect", {value: () => new DOMRect(0, 0, 3200, 900)})
    Object.defineProperty(graphic, "getScreenCTM", {configurable: true, value: () => ({a: 2, b: 0, c: 0, d: 1, e: 10, f: 5})})
    const rectangle = graphic.querySelector<SVGRectElement>("rect")!
    rectangle.setAttribute("x", "100")
    rectangle.setAttribute("y", "100")
    rectangle.setAttribute("width", "100")
    rectangle.setAttribute("height", "100")
    clickShape(rectangle)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="resize-se"]')!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 183, clientX: 410, clientY: 205}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: 183, clientX: 426, clientY: 213}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0, pointerId: 183, clientX: 426, clientY: 213}))

    expect(rectangle).toHaveAttribute("width", "111")
    expect(rectangle).toHaveAttribute("height", "111")
  })

  it("cancels a completed curve handle drag with Escape while its tab can remain open", () => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "curves"})
    pointClick(graphic, 50, 50)
    pointClick(graphic, 200, 100)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
    const path = graphic.querySelector("path")!
    const before = path.getAttribute("d")
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    clickShape(path)
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="path-point-1"]')!
    const id = pointerId++
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: id, clientX: 100, clientY: 66.67}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, buttons: 1, pointerId: id, clientX: 100, clientY: 150}))
    expect(editor.appendix.querySelector(".◆graphic-preview")).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Escape"}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: id, clientX: 100, clientY: 150}))
    expect(path.getAttribute("d")).toBe(before)
    expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
    expect(editor.features.graphic.getState()?.mode).toBe("select")
  })

  it.each(["draw", "lines", "curves"] as const)("uses the active %s brush as a centered dot cursor without authored artifacts", mode => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    const before = editor.toHTML(true)
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode, paint: {stroke: "#c03060", "stroke-width": "8", opacity: ".6"}})
    const sheet = document.adoptedStyleSheets.find(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("body:not(.◆graphic-pan-ready):not(.◆graphic-panning)")))!
    expect(sheet).toBeDefined()
    const checkDot = (width: number, color: string, opacity: string) => {
      const rule = sheet.cssRules[0].cssText
      expect(rule).toContain("body:not(.◆graphic-pan-ready):not(.◆graphic-panning) svg.◆graphic-drawing")
      const source = decodeURIComponent(rule.match(/data:image\/svg\+xml,([^"\s]+)/)![1])
      const svg = new DOMParser().parseFromString(source, "image/svg+xml").documentElement
      const circle = svg.querySelector("circle")!
      const center = Math.ceil(width / 2 + 1)
      expect(circle).toHaveAttribute("r", String(width / 2))
      expect(circle).toHaveAttribute("cx", String(center))
      expect(circle).toHaveAttribute("cy", String(center))
      expect(circle).toHaveAttribute("fill", color)
      expect(circle).toHaveAttribute("opacity", opacity)
      expect(svg).toHaveAttribute("width", String(center * 2))
      expect(svg).toHaveAttribute("height", String(center * 2))
      expect(rule).toContain(`${center} ${center}, crosshair`)
    }
    checkDot(8, "#c03060", "0.6")
    for(const width of [.5, 100]) {
      editor.features.graphic.actions.setGraphicDrawPaint({type: "setGraphicDrawPaint", paint: {stroke: "rebeccapurple", "stroke-width": String(width), opacity: ".8"}})
      checkDot(width, "rebeccapurple", "0.8")
    }
    editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "zoom-in"})
    checkDot(100, "rebeccapurple", "0.8")
    expect(graphic.querySelector("circle")).toBeNull()
    expect(graphic.hasAttribute("style")).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    expect(document.adoptedStyleSheets).not.toContain(sheet)
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode})
    const replacement = document.adoptedStyleSheets.find(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("body:not(.◆graphic-pan-ready):not(.◆graphic-panning)")))!
    expect(replacement).toBeDefined()
    editor.features.graphic.disable()
    expect(document.adoptedStyleSheets).not.toContain(replacement)
    expect(document.body.querySelector(".◆graphic-drawing")).toBeNull()
  })

  it.each(["draw", "lines", "curves"] as const)("keeps the %s brush active across completed shapes, shortcuts and undo", async mode => {
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = document.querySelector("svg")!
    graphic.innerHTML = '<!--keep--><rect x="300" y="300" width="100" height="100"/>'
    const sibling = graphic.querySelector("rect")!
    await mutationsDelivered()
    const paint = {fill: "#ffffff", stroke: "#5b9bd5", "stroke-width": "8", opacity: "0.6"}
    editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode, paint})
    const focus = vi.spyOn(document.body, "focus"), post = vi.spyOn(editor, "postHostMessage")
    for(const offset of [0, 160]) {
      if(mode === "draw") {
        const id = pointerId++
        graphic.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true, button: 0, pointerId: id, clientX: 50 + offset, clientY: 50}))
        graphic.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, isPrimary: true, pointerId: id, clientX: 150 + offset, clientY: 100}))
      }
      else {
        pointClick(graphic, 50 + offset, 50)
        pointClick(graphic, 150 + offset, 100)
        document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
      }
      expect(editor.features.graphic.selectedShape).toBeNull()
      expect(editor.features.graphic.getState()).toMatchObject({mode, selectionCount: 0, capture: true})
      expect(graphic).toHaveClass("◆graphic-drawing")
      expect(document.body).toHaveClass("◆graphic-drawing")
      expect(graphic.querySelector(".◆graphic-shape-selected")).toBeNull()
      expect(editor.appendix.querySelector<HTMLElement>(".◆graphic-overlay")?.hidden ?? true).toBe(true)
      expect(editor.appendix.querySelector(".◆graphic-preview")).toBeNull()
      expect(editor.appendix.querySelector(".◆graphic-path-controls")).toBeNull()
      await mutationsDelivered()
    }
    const paths = [...graphic.querySelectorAll("path")]
    expect(paths).toHaveLength(2)
    for(const path of paths) {
      expect(path).toHaveAttribute("stroke", paint.stroke)
      expect(path).toHaveAttribute("stroke-width", paint["stroke-width"])
      expect(path).toHaveAttribute("opacity", paint.opacity)
    }
    expect(focus).toHaveBeenCalledWith({preventScroll: true})
    const first = paths[0].getAttribute("d")!, second = paths[1].getAttribute("d")!
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "ArrowRight"}))
    expect(paths.map(path => path.getAttribute("d"))).toEqual([first, second])
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "1", code: "Digit1", altKey: true}))
    expect(post.mock.calls.some(([message]) => (message as {type: string}).type === shapeKeyboardInputEvent)).toBe(true)
    editor.doc.undo()
    expect([...graphic.querySelectorAll("path")].map(path => path.getAttribute("d"))).toEqual([first])
    editor.doc.redo()
    expect([...graphic.querySelectorAll("path")].map(path => path.getAttribute("d"))).toEqual([first, second])
    expect(editor.features.graphic.getState()).toMatchObject({mode, selectionCount: 0})
    expect(graphic.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(sibling.isConnected).toBe(true)
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Escape"}))
    expect(editor.features.graphic.getState()?.mode).toBe("select")
    expect(graphic).not.toHaveClass("◆graphic-drawing")
    expect(document.body).not.toHaveClass("◆graphic-drawing")
    clickShape(sibling)
    expect(editor.features.graphic.selectedShape).toBe(sibling)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

})
