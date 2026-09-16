// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import * as Y from "yjs"
import {$} from "../utility"
import {SVG_NAMESPACE} from "../graphic"
import {isMarkStateChangeMessage, markStateChangeEvent} from "../editor-bridge"

let editor: DOMEditor
beforeEach(() => { document.body.replaceChildren(); editor = new DOMEditor() })
afterEach(() => editor.destroy())
function load(content = "hello world") {
  document.body.innerHTML = `<p>before <svg><text x="20" y="30">${content}</text></svg> after</p>`
  const parsed = document.querySelector("svg")!
  const convert = (node: Node): Node => {
    if(!(node instanceof Element)) return node.cloneNode(true)
    const result = document.createElementNS(SVG_NAMESPACE, node.localName === "textpath" ? "textPath" : node.localName)
    for(const attribute of Array.from(node.attributes)) result.setAttribute(attribute.name, attribute.value)
    result.append(...Array.from(node.childNodes).map(convert))
    return result
  }
  parsed.replaceWith(convert(parsed))
  return document.querySelector("text")!
}
function select(node: Node, start = 0, end = node.textContent!.length) {
  document.getSelection()!.setBaseAndExtent(node, start, node, end)
}
const feature = () => editor.features.mark
const input = (data: string) => feature().handleSVGTextInput(new InputEvent("beforeinput", {inputType: "insertText", data, cancelable: true}))

describe("SVG text marks", () => {
  it.each(["b", "i", "u", "s"] as const)("styles and toggles %s using only SVG spans", mark => {
    const text = load()
    select(text.firstChild!, 1, 4)
    expect(feature().toggleMark(mark)).toBe(true)
    expect(feature().getState().marks).toContain(mark)
    expect(isMarkStateChangeMessage({type: markStateChangeEvent, detail: {...feature().getState(), styles: feature().getStyleState()}})).toBe(true)
    feature().toggleMark(mark)
    expect(feature().getState().marks).not.toContain(mark)
    expect(text.textContent).toBe("hello world")
    expect(text.getAttribute("x")).toBe("20")
    for(const element of Array.from(text.querySelectorAll("*"))) {
      expect(element.namespaceURI).toBe(SVG_NAMESPACE)
      expect(element.localName).toBe("tspan")
    }
  })

  it("maps text color to SVG fill and preserves positioned text spans and paths", () => {
    const text = load('<textPath href="#path"><tspan x="3" rotate="15" style="font-weight: bold; fill: red">hello</tspan></textPath>')
    const path = text.firstElementChild!, span = path.firstElementChild!
    select(span.firstChild!, 1, 4)
    feature().setStyleMark("color", "blue")
    expect(feature().getStyleState().color).toBe("blue")
    expect(feature().getState().marks).toContain("b")
    feature().removeMarks()
    expect(feature().getState().marks).toEqual([])
    expect(feature().getStyleState()).toEqual({})
    expect(text.firstElementChild).toBe(path)
    expect(path.firstElementChild).toBe(span)
    expect(span.getAttribute("x")).toBe("3")
    expect(span.getAttribute("rotate")).toBe("15")
    select(span.firstChild!.firstChild ?? span.firstChild!, 0, 1)
    expect(feature().getState().marks).toContain("b")
  })

  it("creates SVG links and unlinks only the selected text", () => {
    const text = load()
    select(text.firstChild!, 0, 5)
    feature().toggleMark("a")
    feature().setMarkAttribute("a", "href", "https://example.com")
    expect(feature().getAttributeState().a?.href).toBe("https://example.com")
    const anchor = text.querySelector("a")!
    expect(anchor.namespaceURI).toBe(SVG_NAMESPACE)
    select(anchor.firstChild!, 1, 4)
    feature().toggleMark("a")
    expect(feature().getState().marks).not.toContain("a")
    expect(Array.from(text.querySelectorAll("a"), a => a.textContent)).toEqual(["h", "o"])
    expect(text.textContent).toBe("hello world")
  })

  it("stores marks, styles and links at an empty caret and clears them for subsequent input", () => {
    const text = load("")
    $.move(text, 0)
    feature().toggleMark("b")
    feature().toggleMark("a")
    feature().setMarkAttribute("a", "href", "https://example.com")
    feature().setStyleMark("color", "red")
    expect(text.childNodes.length).toBe(0)
    expect(feature().getState().marks).toEqual(["b", "a"])
    input("x")
    expect(feature().getState().marks).toEqual(["b", "a"])
    expect(text.querySelector("a")!.textContent).toBe("x")
    feature().removeMarks()
    input("y")
    expect(feature().getState().marks).toEqual([])
    expect(text.querySelector("a")!.textContent).toBe("x")
    expect(text.textContent).toBe("xy")
  })
})

it("clears SVG text inside a larger document selection", () => {
  const text = load('<tspan style="font-weight: bold; fill: red">hello</tspan>')
  const paragraph = text.closest("p")!
  const span = text.firstElementChild!
  const before = document.createElement("b")
  before.textContent = "bold"
  paragraph.prepend(before)
  document.getSelection()!.setBaseAndExtent(paragraph, 0, paragraph, paragraph.childNodes.length)
  expect(feature().getState().canMark).toBe(true)
  feature().removeMarks()
  expect(text.textContent).toBe("hello")
  expect(text.querySelector("[style]")).toBeNull()
  expect(paragraph.querySelector("b")).toBeNull()
  expect(text.getAttribute("x")).toBe("20")
})

it("keeps typography on unselected text when typing with stored marks", () => {
  const text = load("before")
  text.setAttribute("font-size", "36")
  $.move(text.firstChild!, 6)
  feature().toggleMark("b")
  input("after")
  select(text.firstChild!.firstChild ?? text.firstChild!, 0, 6)
  expect(feature().getStyleState()["font-size"]).toBe("36px")
  expect(feature().getState().marks).not.toContain("b")
})

it("supports undo/redo and strips editor markers from SVG formatting", () => {
  const text = load("hello")
  editor.doc.syncFromDOM()
  editor.doc.stopCapturing()
  select(text.firstChild!)
  feature().toggleMark("b")
  editor.doc.syncFromDOM()
  expect(editor.toHTML(true)).toContain("font-weight: bold")
  expect(editor.toHTML(true)).not.toContain("◆")
  editor.doc.undo()
  expect(document.querySelector("text")!.textContent).toBe("hello")
  expect(document.querySelector("text [style]")).toBeNull()
  editor.doc.redo()
  expect(document.querySelector("text tspan")!.getAttribute("style")).toContain("font-weight: bold")
})

it("does not enter widget-owned SVG content", () => {
  const text = load("hello")
  const widget = document.createElement("test-widget")
  text.closest("svg")!.before(widget)
  widget.append(text.closest("svg")!)
  select(text.firstChild!)
  expect(feature().getState().canMark).toBe(false)
  expect(feature().toggleMark("b")).toBe(false)
  expect(text.querySelector("tspan")).toBeNull()
})

it("drops stored styles when the SVG caret is replaced", () => {
  const text = load("hello")
  $.move(text.firstChild!, 2)
  feature().toggleMark("b")
  text.textContent = "remote"
  $.move(text.firstChild!, 6)
  expect(feature().getState().marks).toEqual([])
  input("!")
  expect(feature().getState().marks).toEqual([])
})


it("reads remotely changed SVG styles from the current DOM", () => {
  const text = load('<tspan style="font-weight: bold">hello</tspan>')
  editor.doc.syncFromDOM()
  const remote = new Y.Doc()
  try {
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const paragraph = remote.getXmlElement("body").get(0) as Y.XmlElement
    const svg = paragraph.get(1) as Y.XmlElement
    const sharedText = svg.get(0) as Y.XmlElement
    const span = sharedText.get(0) as Y.XmlElement
    span.setAttribute("style", "font-style: italic; fill: blue")
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client")
    const current = document.querySelector("text tspan")!
    select(current.firstChild!)
    expect(feature().getState().marks).toEqual(["i"])
    expect(feature().getStyleState().color).toBe("blue")
    feature().toggleMark("i")
    expect(feature().getState().marks).toEqual([])
  }
  finally { remote.destroy() }
})

it("shows and toggles inherited SVG presentation decorations without changing the unselected suffix", () => {
  const text = load("hello")
  text.setAttribute("text-decoration", "underline line-through")
  select(text.firstChild!, 0, 2)
  expect(feature().getState().marks).toEqual(["u", "s"])
  feature().toggleMark("u")
  expect(feature().getState().marks).toEqual(["s"])
  const suffix = text.lastElementChild!.firstChild!
  select(suffix)
  expect(feature().getState().marks).toEqual(["u", "s"])
})


it("routes native SVG text replacement through SVG marks instead of HTML insertion", () => {
  const text = load('<tspan style="font-weight: bold">old</tspan>')
  select(text.firstElementChild!.firstChild!)
  const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "new"})
  document.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(text.textContent).toBe("new")
  expect(text.querySelector("b, span")).toBeNull()
  expect(feature().getState().marks).toContain("b")
})


it("preserves different link attributes when changing the selected SVG links' address", () => {
  const text = load('<a href="/first" target="_blank">one</a><a href="/second" target="_self">two</a>')
  document.getSelection()!.setBaseAndExtent(text, 0, text, text.childNodes.length)
  feature().setMarkAttribute("a", "href", "/new")
  expect(Array.from(text.querySelectorAll("a"), link => [link.getAttribute("href"), link.getAttribute("target")]))
    .toEqual([["/new", "_blank"], ["/new", "_self"]])
})
