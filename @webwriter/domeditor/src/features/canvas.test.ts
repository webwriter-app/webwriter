// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {canvasClass, canvasStyles} from "../document-layout"
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
  it("starts in document mode with an empty paragraph shortcut in the appendix", () => {
    const canvas = editor.features.canvas

    expect(canvas.getState()).toEqual({mode: "document", canConvert: true, zoom: 100})
    const start = editor.appendix.querySelector<HTMLButtonElement>('button[name="start"]')
    expect(start).not.toBeNull()
    expect(start?.textContent).toBe("Use canvas layout")
    expect(document.body.querySelector(".◆canvas-controls")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("canvas-controls")
  })

  it("only offers the empty paragraph shortcut for a truly empty document", async () => {
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
      const start = editor.appendix.querySelector<HTMLButtonElement>('button[name="start"]')
      if(html === "<p></p>" || html === "<p><br></p>") expect(start).not.toBeNull()
      else expect(start).toBeNull()
      expect(canvas.getState().mode).toBe("document")
    }
  })

  it("rechecks a stale startCanvas request against current DOM", () => {
    const canvas = editor.features.canvas
    const start = editor.appendix.querySelector<HTMLButtonElement>('button[name="start"]')!
    document.body.firstElementChild!.textContent = "content added after the button was rendered"

    expect(canvas.actions.startCanvas({type: "startCanvas"})).toBe(false)
    expect(start.isConnected).toBe(true)
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
    expect(editor.appendix.querySelector('button[name="start"]')).not.toBeNull()

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
    canvas.actions.navigateCanvas({type: "navigateCanvas", operation: "actual-size"})
    expect(canvas.getState().zoom).toBe(100)

    const before = document.body.children.length
    editor.appendix.querySelector<HTMLButtonElement>('button[name="text"]')!.click()
    expect(document.body.children.length).toBe(before + 1)
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
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 17, button: 1, clientX: 100, clientY: 100}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 17, clientX: 250, clientY: 180}))
    expect(slot.style.transform).not.toBe(initial)
    expect(editor.toHTML()).toBe(authored)
    document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, pointerId: 17}))
    const cancelled = slot.style.transform
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 17, clientX: 400, clientY: 300}))
    expect(slot.style.transform).toBe(cancelled)
    expect(document.body.classList.contains("◆canvas-panning")).toBe(false)
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
})
