// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {canvasClass, canvasStyles} from "../document-layout"
import editorStyleString from "../editor.css?raw"
import {selectionChangeEvent} from "../editor-bridge"
import {$} from "../utility"

let editor: DOMEditor
const initialHead = document.head.cloneNode(true) as HTMLHeadElement
const initialBodyAttributes = Array.from(document.body.attributes, attribute => [attribute.name, attribute.value] as const)

const restoreAttributes = (element: Element, attributes: readonly (readonly [string, string])[]) => {
  for(const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name)
  for(const [name, value] of attributes) element.setAttribute(name, value)
}

const settle = async () => {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

const makeRect = (left: number, top: number, width: number, height: number) => ({
  x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
  toJSON: () => ({}),
} as DOMRect)

const mockGeometry = (element: Element, rect: DOMRect) => vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect)

beforeEach(() => {
  document.head.replaceChildren(...Array.from(initialHead.childNodes, node => node.cloneNode(true)))
  document.body.replaceChildren()
  restoreAttributes(document.body, initialBodyAttributes)
  editor = new DOMEditor()
})

afterEach(() => {
  editor.destroy()
  vi.restoreAllMocks()
  document.head.replaceChildren(...Array.from(initialHead.childNodes, node => node.cloneNode(true)))
  document.body.replaceChildren()
  restoreAttributes(document.body, initialBodyAttributes)
  document.documentElement.classList.remove("◆canvas-active")
})

describe("canvas document layout", () => {
  it("posts Canvas as the breadcrumb root and restores Document after conversion", () => {
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    for(const mode of ["canvas", "document"] as const) {
      expect(editor.features.canvas.convert(mode)).toBe(true)
      editor.postSelectionPath()
      const event = postMessage.mock.calls.at(-1)![0]
      expect(event.type).toBe(selectionChangeEvent)
      expect(event.detail.path[0]).toMatchObject({path: [], name: mode === "canvas" ? "Canvas" : "Document", icon: mode === "canvas" ? "Canvas" : "Document"})
    }
  })

  it("keeps a dotted canvas background while editing and in the saved layout", () => {
    const theme = document.createElement("style")
    theme.textContent = "* { background-repeat: no-repeat; }"
    document.head.append(theme)
    editor.features.canvas.convert("canvas")
    const style = document.createElement("style")
    style.textContent = editorStyleString
    document.head.append(style)
    const dots = editor.appendix.querySelector<HTMLElement>('[part="canvas-background"]')!
    const background = getComputedStyle(dots)
    expect(background.backgroundImage).toContain("radial-gradient")
    expect(background.backgroundSize).toBe("20px 20px")
    const image = background.backgroundImage

    editor.features.canvas.disable()
    expect(dots.isConnected).toBe(false)
    style.remove()
    expect(getComputedStyle(document.documentElement).backgroundImage).toBe(image)
    expect(getComputedStyle(document.documentElement).backgroundSize).toBe("20px 20px")
    expect(getComputedStyle(document.documentElement).backgroundRepeat).toBe("repeat")
    expect(editor.toHTML()).toContain("radial-gradient")

  })

  it("keeps native text input inside positioned paragraphs without materializing a new element", () => {
    editor.features.canvas.actions.startCanvas({type: "startCanvas"})
    const paragraph = document.body.firstElementChild as HTMLElement
    for(const value of ["", "Existing text"]) {
      paragraph.textContent = value
      $.move(paragraph.firstChild ?? paragraph, 0)
      const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "x"})
      paragraph.dispatchEvent(input)
      expect(input.defaultPrevented).toBe(false)
      expect(document.body.firstElementChild).toBe(paragraph)
      expect(paragraph.querySelector("link")).toBeNull()
      expect(paragraph.textContent).toBe(value)
      expect(editor.features.manipulation.ensureTextBlock()).toBeNull()
    }
  })

  it("uses an arrow on the canvas background and native cursors on its items", () => {
    document.body.innerHTML = '<p>Canvas text</p><div style="cursor: crosshair">Custom cursor</div>'
    const style = document.createElement("style")
    style.textContent = editorStyleString
    document.head.append(style)
    editor.features.canvas.convert("canvas")

    expect(getComputedStyle(document.body).cursor).toBe("default")
    // Native-browser coverage checks the low-specificity item reset; Happy
    // DOM incorrectly lets the inherited BODY cursor override :where().
    expect(getComputedStyle(document.querySelector("div")!).cursor).toBe("crosshair")
    document.body.classList.add("◆canvas-hand")
    expect(getComputedStyle(document.body).cursor).toBe("grab")
    expect(getComputedStyle(document.querySelector("p")!).cursor).toBe("grab")
    document.body.classList.add("◆canvas-panning")
    expect(getComputedStyle(document.body).cursor).toBe("grabbing")
    editor.features.canvas.convert("document")
    expect(getComputedStyle(document.body).cursor).not.toBe("default")
  })

  it("suppresses the native item caret only while the canvas background is selected", () => {
    document.body.innerHTML = '<p>Canvas text</p>'
    editor.features.canvas.convert("canvas")
    const style = document.createElement("style")
    style.textContent = editorStyleString
    document.head.append(style)
    const paragraph = document.querySelector("p")!
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))

    expect(document.body.classList.contains("◆empty-selected")).toBe(true)
    expect(editor.features.selection.emptyDocumentCaret).not.toBeNull()
    expect(getComputedStyle(document.body).caretColor).toBe("transparent")
    expect(getComputedStyle(paragraph).caretColor).toBe("transparent")

    $.move(paragraph.firstChild!, 2)
    editor.features.selection.processSelection()
    expect(document.body.classList.contains("◆empty-selected")).toBe(false)
    expect(getComputedStyle(paragraph).caretColor).not.toBe("transparent")
  })

  it("does not use metadata elements as a text-block fallback at an inline gap", () => {
    document.body.innerHTML = '<p><img alt="Keep"></p>'
    editor.features.canvas.convert("canvas")
    const paragraph = document.body.firstElementChild!, image = paragraph.firstElementChild!
    $.selectGap(image, "before")
    expect(editor.features.manipulation.ensureTextBlock()).toBeNull()
    expect(paragraph.firstElementChild).toBe(image)
    expect(paragraph.childNodes.length).toBe(1)
  })
  it("starts in document mode without the old appendix template shortcuts", () => {
    const canvas = editor.features.canvas

    expect(canvas.getState()).toEqual({mode: "document", canConvert: true, zoom: 100})
    const start = editor.appendix.querySelector<HTMLButtonElement>('button[name="start"]')
    expect(start).toBeNull()
    expect(editor.appendix.querySelector<HTMLElement>("[part=canvas-controls]")!.hidden).toBe(true)
    expect(document.body.querySelector(".◆canvas-controls")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("canvas-controls")
  })

  it("only accepts the empty paragraph shortcut for a truly empty document", async () => {
    const canvas = editor.features.canvas
    const cases = [
      "<p></p>",
      "<p><br></p>",
      "<p>text</p>",
      "<p></p><p></p>",
      "<p></p><unknown-widget></unknown-widget>",
    ]

    for(const html of cases) {
      document.body.innerHTML = html
      await settle()
      if(html === "<p></p>" || html === "<p><br></p>") expect(canvas.emptyParagraph()).not.toBeNull()
      else expect(canvas.emptyParagraph()).toBeNull()
      expect(canvas.getState().mode).toBe("document")
    }
  })

  it("rechecks a stale startCanvas request against current DOM", () => {
    const canvas = editor.features.canvas
    document.body.firstElementChild!.textContent = "content added after the button was rendered"

    expect(canvas.actions.startCanvas({type: "startCanvas"})).toBe(false)
    expect(canvas.getState().mode).toBe("document")
    expect(document.body.classList.contains(canvasClass)).toBe(false)
  })

  it("preserves nodes, comments, custom elements, SVG, and nested layout while converting", () => {
    document.body.innerHTML = '<custom-card id="card" data-authored="yes"><p>Nested custom</p></custom-card><svg id="shape" viewBox="0 0 20 20"><g><path d="M0 0"></path></g></svg><section id="layout" style="display:grid;grid-template-columns:1fr 1fr"><div><p>Nested layout</p></div></section><!--keep-->'
    editor.doc.syncFromDOM()
    const section = document.querySelector("section")!
    const custom = document.querySelector("custom-card")!
    const nested = custom.querySelector("p")!
    const svg = document.querySelector("svg")!
    const path = svg.querySelector("path")!
    const nodes = Array.from(document.body.childNodes)
    mockGeometry(document.body, makeRect(10, 20, 800, 600))
    mockGeometry(custom, makeRect(40, 70, 200, 100))
    mockGeometry(svg, makeRect(300, 70, 40, 30))
    mockGeometry(section, makeRect(40, 70, 500, 300))

    expect(editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(true)

    expect(Array.from(document.body.childNodes)).toEqual(nodes)
    expect(document.querySelector("section")).toBe(section)
    expect(document.querySelector("custom-card")).toBe(custom)
    expect(custom.querySelector("p")).toBe(nested)
    expect(document.querySelector("svg")).toBe(svg)
    expect(svg.querySelector("path")).toBe(path)
    expect(document.querySelector("#layout")?.getAttribute("style")).toContain("display: grid")
    expect(document.body.lastChild).toBe(nodes[3])
    expect(editor.features.canvas.getState().mode).toBe("canvas")
  })

  it("uses a geometry snapshot for deterministic placement", () => {
    document.body.innerHTML = '<div id="one" style="width:200px;margin-left:5px;margin-top:7px;color:red">One</div><svg id="two" width="40" height="30"></svg><!--keep-->'
    editor.doc.syncFromDOM()
    const one = document.querySelector<HTMLElement>("#one")!
    const two = document.querySelector<SVGSVGElement>("#two")!
    mockGeometry(document.body, makeRect(10, 20, 800, 600))
    mockGeometry(one, makeRect(40, 70, 200, 50))
    mockGeometry(two, makeRect(300, 180, 40, 30))

    expect(editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(true)
    expect(one.style.position).toBe("absolute")
    expect(one.style.left).toBe("25px")
    expect(one.style.top).toBe("43px")
    expect(one.style.width).toBe("200px")
    expect(one.style.color).toBe("red")
    expect(two.style.position).toBe("absolute")
    expect(two.style.left).toBe("290px")
    expect(two.style.top).toBe("160px")
  })

  it("rejects raw direct text and a custom document root", () => {
    document.body.innerHTML = "<p>content</p>raw text"
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.getState().canConvert).toBe(false)
    expect(editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(false)
    expect(document.body.classList.contains(canvasClass)).toBe(false)

    document.body.innerHTML = '<document-widget role="document"><p>inside</p></document-widget>'
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.getState().canConvert).toBe(false)
    expect(editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(false)
  })

  it("makes expectedMode and editing locks safe no-ops", () => {
    const canvas = editor.features.canvas
    expect(canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "canvas",
    })).toBe(false)
    const owner = {}
    editor.lockEditing(owner)
    expect(canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(false)
    editor.unlockEditing(owner)
    expect(canvas.getState().mode).toBe("document")
  })

  it("undoes and redoes conversion in both directions", async () => {
    document.body.innerHTML = "<p>Canvas content</p>"
    editor.doc.syncFromDOM()
    const canvas = editor.features.canvas
    expect(canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })).toBe(true)
    expect(canvas.getState().mode).toBe("canvas")

    editor.doc.undo()
    await settle()
    expect(canvas.getState().mode).toBe("document")
    expect(document.body.classList.contains(canvasClass)).toBe(false)
    editor.doc.redo()
    await settle()
    expect(canvas.getState().mode).toBe("canvas")

    expect(canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "document", expectedMode: "canvas",
    })).toBe(true)
    editor.doc.undo()
    await settle()
    expect(canvas.getState().mode).toBe("canvas")
    editor.doc.redo()
    await settle()
    expect(canvas.getState().mode).toBe("document")
  })

  it("serializes authored canvas class and placement while excluding the local camera", () => {
    document.body.innerHTML = '<p class="authored" style="color: red">Canvas content</p>'
    document.body.classList.add("authored-body")
    editor.doc.syncFromDOM()
    mockGeometry(document.body, makeRect(0, 0, 800, 600))
    mockGeometry(document.body.firstElementChild!, makeRect(20, 30, 200, 40))
    editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })
    const html = editor.toHTML()
    expect(html).toContain(`class="authored-body ${canvasClass}"`)
    expect(html).toContain("position: absolute")
    expect(html).toContain("color: red")
    expect(html).not.toContain("◆canvas")
    expect(html).not.toContain("canvas-controls")
  })

  it("removes local canvas controls, styles, and markers on disable while retaining authored mode", () => {
    document.body.innerHTML = "<p>Canvas content</p>"
    editor.doc.syncFromDOM()
    editor.features.canvas.actions.setDocumentLayout({
      type: "setDocumentLayout", mode: "canvas", expectedMode: "document",
    })
    expect(editor.appendix.querySelector('[part="canvas-controls"]')).not.toBeNull()
    expect(document.documentElement.classList.contains("◆canvas-active")).toBe(true)
    expect(document.head.querySelector(`style`)).not.toBeNull()

    editor.features.canvas.disable()

    expect(document.body.classList.contains(canvasClass)).toBe(true)
    expect(editor.appendix.querySelector('[part="canvas-controls"]')).toBeNull()
    expect(document.documentElement.classList.contains("◆canvas-active")).toBe(false)
    expect(editor.appendix.adoptedStyleSheets.some(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes(".◆canvas-controls")))).toBe(false)
    expect(Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === canvasStyles)).toBe(true)
  })

  it("refreshes mode controls after direct and remote changes", async () => {
    const canvas = editor.features.canvas
    document.body.classList.add(canvasClass)
    await settle()
    expect(canvas.getState().mode).toBe("canvas")
    expect(editor.appendix.querySelector('button[name="zoom-in"]')).not.toBeNull()

    document.body.classList.remove(canvasClass)
    await settle()
    expect(canvas.getState().mode).toBe("document")
    expect(editor.appendix.querySelector<HTMLElement>("[part=canvas-controls]")!.hidden).toBe(true)

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    remote.getXmlElement("body").setAttribute("class", canvasClass)
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client")
    await settle()
    expect(canvas.getState().mode).toBe("canvas")
    expect(editor.appendix.querySelector('button[name="zoom-out"]')).not.toBeNull()
    remote.destroy()
  })

  it("supports local zoom and insertion controls in canvas mode", () => {
    const canvas = editor.features.canvas
    expect(canvas.actions.startCanvas({type: "startCanvas"})).toBe(true)
    canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "zoom-in"})
    expect(canvas.getState().zoom).toBe(120)
    const dots = editor.appendix.querySelector<HTMLElement>('[part="canvas-background"]')!
    expect(dots.style.backgroundSize).toBe("24px 24px")
    canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    expect(canvas.getState().zoom).toBe(100)
    expect(dots.style.backgroundSize).toBe("20px 20px")

    const before = document.body.firstElementChild!
    editor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    expect(before.isConnected).toBe(false)
    expect(document.body.children.length).toBe(1)
    const inserted = document.body.lastElementChild as HTMLElement
    expect(inserted.localName).toBe("p")
    expect(inserted.style.position).toBe("absolute")
    expect(inserted.style.width).toBe("320px")
  })

  it("pans locally and stops on cancellation without changing authored placement", () => {
    editor.features.canvas.actions.startCanvas({type: "startCanvas"})
    const slot = editor.appendix.querySelector("slot")!
    const authored = editor.toHTML()
    const initial = slot.style.transform
    const dots = editor.appendix.querySelector<HTMLElement>('[part="canvas-background"]')!
    const [x, y] = dots.style.backgroundPosition.split(" ").map(parseFloat)
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 17, button: 1, clientX: 100, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 17, clientX: 250, clientY: 180}))
    expect(slot.style.transform).not.toBe(initial)
    expect(dots.style.backgroundPosition).toBe(`${x + 150}px ${y + 80}px`)
    expect(editor.toHTML()).toBe(authored)
    document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 17}))
    const cancelled = slot.style.transform
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 17, clientX: 400, clientY: 300}))
    expect(slot.style.transform).toBe(cancelled)
    expect(dots.style.backgroundPosition).toBe(`${x + 150}px ${y + 80}px`)
    expect(document.body.classList.contains("◆canvas-panning")).toBe(false)
  })

  it.each([
    ["BODY", () => document.body],
    ["HTML", () => document.documentElement],
    ["the default slot", () => editor.appendix.querySelector("slot")!],
  ] as const)("treats %s as blank canvas and clears the current target", (_name, target) => {
    document.body.innerHTML = "<p>content<img></p>"
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})).toBe(true)
    const image = document.querySelector("img")!
    editor.features.selection.selectElement(image)
    editor.features.selection.captureElement(image)
    expect(editor.features.selection.captureSelectedElement).toBe(image)
    expect(image.classList.contains("◆element-capture-selected")).toBe(true)
    expect(editor.features.selection.selectionCaret).not.toBeNull()

    const selectCoords = vi.spyOn($, "selectCoords")
    const event = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0, clientX: 300, clientY: 200})
    target().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(selectCoords).not.toHaveBeenCalled()
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(document.getSelection()?.isCollapsed).toBe(true)
    expect(document.getSelection()?.anchorNode).toBe(document.body)
    expect(document.getSelection()?.anchorOffset).toBe(0)
    expect(image.classList.contains("◆element-capture-selected")).toBe(false)
  })

  it("removes a focused empty canvas paragraph when a blank canvas click clears selection", () => {
    document.body.innerHTML = "<p></p><p>filled</p>"
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})).toBe(true)
    const empty = document.body.firstElementChild!
    $.move(empty)
    editor.features.selection.processSelection()

    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0, clientX: 500, clientY: 400}))

    expect(empty.isConnected).toBe(false)
    expect(document.body.textContent).toBe("filled")
  })

  it("keeps authored descendants on the normal exact-hit selection path", () => {
    document.body.innerHTML = "<div><span>inside</span></div>"
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})).toBe(true)
    const span = document.querySelector("span")!
    const selectCoords = vi.spyOn($, "selectCoords").mockReturnValue({node: span.firstChild!, offset: 2})
    const event = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0, clientX: 20, clientY: 20})
    span.dispatchEvent(event)

    expect(selectCoords).toHaveBeenCalledWith(20, 20, false, span, editor.schema)
    expect(event.defaultPrevented).toBe(false)
  })

  it("keeps centered items still and uses the pointer for items spanning both canvas edges", () => {
    const canvas = editor.features.canvas
    canvas.actions.startCanvas({type: "startCanvas"})
    const slot = editor.appendix.querySelector("slot")!
    const initial = slot.style.transform
    const center = {x: window.innerWidth / 2, y: window.innerHeight / 2}
    expect(canvas.panAtEdge(center, makeRect(center.x - 50, center.y - 50, 100, 100))).toBe(false)
    const oversized = makeRect(-100, -100, window.innerWidth + 200, window.innerHeight + 200)
    expect(canvas.panAtEdge(center, oversized)).toBe(false)
    expect(slot.style.transform).toBe(initial)
    expect(canvas.panAtEdge({x: window.innerWidth - 1, y: center.y}, oversized)).toBe(true)
    expect(slot.style.transform).not.toBe(initial)
  })

  it("keeps spaces as text input and returns irregular canvas content to document flow", () => {
    editor.features.canvas.actions.startCanvas({type: "startCanvas"})
    const paragraph = document.body.firstElementChild!
    paragraph.textContent = "hello"
    $.move(paragraph.firstChild!, 2)
    const space = new KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: " ", code: "Space"})
    paragraph.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(false)
    document.body.append("text inserted directly by a widget")
    expect(editor.features.canvas.getState().canConvert).toBe(true)
    expect(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "document", expectedMode: "canvas"})).toBe(true)
    expect(document.body.lastChild?.textContent).toBe("text inserted directly by a widget")
    expect(getComputedStyle(paragraph).position).not.toBe("absolute")
  })

  it("withholds placement when a command also changes unrelated root siblings", () => {
    document.body.innerHTML = "<p>First</p><p>Last</p>"
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    const first = document.body.firstElementChild!
    $.move(first.firstChild!, 2)
    const independent = document.createElement("p")
    independent.style.cssText = "position:absolute;left:-500px;top:20px"
    const initial = independent.getAttribute("style")
    editor.features.canvas.preservePlacement(() => {
      first.after(document.createElement("p"))
      document.body.append(independent)
    })
    expect(independent.getAttribute("style")).toBe(initial)
  })

  it("removes the previously focused empty canvas paragraph when focus leaves it", () => {
    document.body.innerHTML = "<p></p><p>filled</p>"
    editor.doc.syncFromDOM()
    expect(editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})).toBe(true)
    const empty = document.body.firstElementChild!, filled = document.body.lastElementChild!

    $.move(empty)
    editor.features.selection.processSelection()
    expect(empty.isConnected).toBe(true)
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()

    expect(empty.isConnected).toBe(false)
    expect(filled.isConnected).toBe(true)
  })

  it("retains filled and current empty paragraphs, and keeps paragraphs selected by a drag range", () => {
    document.body.innerHTML = "<p></p><p>filled</p><p></p>"
    editor.doc.syncFromDOM()
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    const [first, filled, last] = Array.from(document.body.children)

    $.move(first)
    editor.features.selection.processSelection()
    editor.features.selection.processSelection()
    $.move(filled.firstChild!, 2)
    editor.features.selection.processSelection()
    expect(filled.isConnected).toBe(true)

    $.move(last)
    editor.features.selection.processSelection()
    editor.features.selection.processSelection()
    expect(last.isConnected).toBe(true)

    const range = document.createRange()
    range.setStart(filled, 0)
    range.setEnd(last, last.childNodes.length)
    const selection = document.getSelection()!
    editor.features.selection.isInDragSelection = true
    selection.removeAllRanges()
    selection.addRange(range)
    editor.features.selection.processSelection(true)
    expect(last.isConnected).toBe(true)
    editor.features.selection.isInDragSelection = false
    editor.features.selection.processSelection()
  })

  it("only removes visited direct plain paragraphs and preserves irregular authored content", () => {
    document.body.innerHTML = "<p></p><section><p></p></section><!--keep--><unknown-widget></unknown-widget><p></p>"
    editor.doc.syncFromDOM()
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    const direct = document.body.firstElementChild!
    const nested = document.querySelector("section p")!
    const widget = document.querySelector("unknown-widget")!
    const unvisited = document.body.lastElementChild!

    $.move(direct)
    editor.features.selection.processSelection()
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()

    expect(direct.isConnected).toBe(false)
    expect(nested.isConnected).toBe(true)
    expect(widget.isConnected).toBe(true)
    expect(Array.from(document.body.childNodes).some(node => node.nodeType === Node.COMMENT_NODE && node.textContent === "keep")).toBe(true)
    expect(unvisited.isConnected).toBe(true)
  })

  it.each(["<!--keep-->", "<unknown-widget></unknown-widget>", '<img alt="Keep">', "<br><br>", "<span></span>"])("retains paragraph content %s when focus leaves", content => {
    document.body.innerHTML = `<p>${content}</p><p>Other</p>`
    editor.features.canvas.convert("canvas")
    const paragraph = document.body.firstElementChild!
    $.move(paragraph)
    editor.features.selection.processSelection()
    $.move(document.body.lastElementChild!.firstChild!)
    editor.features.selection.processSelection()
    expect(paragraph.isConnected).toBe(true)
    expect(paragraph.innerHTML).toBe(content)
  })

  it("leaves an empty paragraph alone when it changes or disconnects before focus leaves", () => {
    document.body.innerHTML = "<p></p><p></p><p></p>"
    editor.doc.syncFromDOM()
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    const [changed, reparented, disconnected] = Array.from(document.body.children)

    $.move(changed)
    editor.features.selection.processSelection()
    changed.textContent = "text added concurrently"
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    expect(changed.isConnected).toBe(true)

    $.move(reparented)
    editor.features.selection.processSelection()
    const wrapper = document.createElement("div")
    document.body.append(wrapper)
    wrapper.append(reparented)
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    expect(reparented.isConnected).toBe(true)

    $.move(disconnected)
    editor.features.selection.processSelection()
    disconnected.remove()
    $.move(document.body, document.body.childNodes.length)
    expect(() => editor.features.selection.processSelection()).not.toThrow()
  })

  it("leaves the canvas empty when its last paragraph loses focus", async () => {
    editor.features.canvas.actions.startCanvas({type: "startCanvas"})
    const paragraph = document.body.firstElementChild!
    $.move(paragraph)
    editor.features.selection.processSelection()
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    await settle()
    expect(paragraph.isConnected).toBe(false)
    expect(document.body.childElementCount).toBe(0)
  })

  it("undoes and redoes empty paragraph cleanup", async () => {
    document.body.innerHTML = "<p></p><p>content</p>"
    editor.doc.syncFromDOM()
    editor.features.canvas.actions.setDocumentLayout({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    const empty = document.body.firstElementChild!
    $.move(empty)
    editor.features.selection.processSelection()
    $.move(document.body, document.body.childNodes.length)
    editor.features.selection.processSelection()
    expect(empty.isConnected).toBe(false)
    await settle()

    editor.doc.undo()
    await settle()
    expect(document.body.querySelectorAll("p").length).toBe(2)
    editor.doc.redo()
    await settle()
    expect(document.body.querySelectorAll("p").length).toBe(1)
  })
})
