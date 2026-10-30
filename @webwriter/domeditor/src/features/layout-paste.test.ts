// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  editor = new DOMEditor()
  mockLayoutGeometry()
})

afterEach(() => {
  editor.destroy()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.body.removeAttribute("class")
})

const slides = () => Array.from(document.querySelectorAll<HTMLElement>(".ww-slides-viewport > section.ww-slide"))
const positioned = (parent: ParentNode) => Array.from(parent.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.style.position === "absolute")
const coords = (element: HTMLElement) => [parseFloat(element.style.left), parseFloat(element.style.top)]
const mockLayoutGeometry = () => vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
  if(this.style.position !== "absolute" && this.style.position !== "fixed") return new DOMRect()
  const zoom = editor.features.canvas.active ? editor.features.canvas.zoom : editor.features.slides.zoom
  const left = (parseFloat(this.style.left) || 0) * zoom, top = (parseFloat(this.style.top) || 0) * zoom
  const width = (parseFloat(this.style.width) || 120) * zoom, height = (parseFloat(this.style.height) || 80) * zoom
  return new DOMRect(left, top, width, height)
})

function slideDeck() {
  document.body.innerHTML = '<h1>Source</h1><p>Content</p>'
  expect(editor.setDocumentLayout("slides", "document")).toBe(true)
  editor.features.slides.actions.addSlide({type: "addSlide"})
  const [sourceSlide, targetSlide] = slides()
  sourceSlide.querySelectorAll("h1, p").forEach(element => element.remove())
  targetSlide.querySelectorAll("h1, p").forEach(element => element.remove())
  sourceSlide.insertAdjacentHTML("beforeend", '<article style="position:absolute;left:40px;top:70px;width:120px;height:80px"><custom-card title="authored"><!--inside--><b>Canvas item</b></custom-card></article>')
  const source = sourceSlide.querySelector<HTMLElement>("article")!
  return {sourceSlide, targetSlide, source}
}

function canvasDeck() {
  document.body.innerHTML = "<p>Seed</p>"
  expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("beforeend", '<article style="position:absolute;left:40px;top:70px;width:120px;height:80px"><custom-card title="authored"><!--inside--><b>Canvas item</b></custom-card></article>')
  return {sourceRoot: document.body, source: document.body.querySelector<HTMLElement>("article")!}
}

function clipboardHTML(element: Element) {
  $.selectElement(element)
  const copied = editor.serializeClipboardFragment($.copy())
  return copied.clipboardHTML
}

function transfer(html: string) {
  const data = new DataTransfer()
  data.setData("text/html", html)
  return data
}

function nativePaste(html: string) {
  const data = transfer(html)
  const event = new InputEvent("beforeinput", {inputType: "insertFromPaste", bubbles: true, cancelable: true})
  Object.defineProperty(event, "dataTransfer", {value: data})
  document.dispatchEvent(event)
  return event
}

function clipboardItem(html: string) {
  return {
    types: ["text/html"],
    presentationStyle: "unspecified",
    getType: async () => new Blob([html], {type: "text/html"}),
  } as ClipboardItem
}

describe("pasting positioned layout items", () => {
  it.each(["canvas", "slides"] as const)("offsets each native paste from the last copy in %s while retaining original authored descendants", mode => {
    const {sourceRoot, source} = mode === "canvas"
      ? canvasDeck()
      : (() => { const {sourceSlide, source} = slideDeck(); return {sourceRoot: sourceSlide, source} })()
    const html = clipboardHTML(source)
    expect(html).toContain("webwriter-clipboard")
    expect(new DOMParser().parseFromString(html, "text/html").querySelector('meta[name="webwriter-clipboard"][data-layout]')).not.toBeNull()
    expect(html).toContain("custom-card")
    expect(html).toContain("<!--inside-->")
    editor.doc.syncFromDOM()

    for(const expected of [[64, 94], [88, 118], [112, 142]]) {
      $.selectElement(source)
      const event = nativePaste(html)
      expect(event.defaultPrevented).toBe(true)
      const items = positioned(sourceRoot)
      expect(items).toHaveLength(expected[0] === 64 ? 2 : expected[0] === 88 ? 3 : 4)
      const copy = items.at(-1)!
      expect(coords(copy)).toEqual(expected)
      expect(copy.querySelector("custom-card")?.getAttribute("title")).toBe("authored")
      expect(copy.querySelector("custom-card")?.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
      expect(source.isConnected).toBe(true)
    }

    editor.doc.syncFromDOM()
    const htmlAfter = editor.toHTML(true)
    expect(htmlAfter).not.toContain("◆")
    expect(htmlAfter).not.toContain("webwriter-clipboard")
    expect(htmlAfter).not.toContain("data-layout")
    expect(editor.doc.body.toString()).not.toContain("webwriter-clipboard")
    expect(editor.doc.body.toString()).not.toContain("data-layout")
    editor.doc.undo()
    expect(positioned(sourceRoot)).toHaveLength(3)
    editor.doc.redo()
    expect(positioned(sourceRoot)).toHaveLength(4)
  })

  it("pastes on another slide at the copied position, then stacks there and back on the source", async () => {
    const {sourceSlide, targetSlide, source} = slideDeck()
    const html = clipboardHTML(source)
    const read = vi.spyOn(navigator.clipboard, "read").mockResolvedValue([clipboardItem(html)] as ClipboardItems)
    $.selectGap(targetSlide, "after")

    expect(await editor.features.manipulation.actions.paste({type: "paste"})).toBe(true)
    expect(positioned(sourceSlide)).toEqual([source])
    const [copy] = positioned(targetSlide)
    expect(copy).toBeDefined()
    expect(coords(copy)).toEqual([40, 70])
    $.selectGap(targetSlide, "after")
    expect(await editor.features.manipulation.actions.paste({type: "paste"})).toBe(true)
    expect(positioned(targetSlide).map(coords)).toEqual([[40, 70], [64, 94]])
    $.selectElement(source)
    expect(await editor.features.manipulation.actions.paste({type: "paste"})).toBe(true)
    expect(positioned(sourceSlide).map(coords)).toEqual([[40, 70], [64, 94]])
    expect(source.isConnected).toBe(true)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it.each(["disconnected", "replaced"] as const)("falls back to the clipboard position plus one step when the last copy is %s", state => {
    const {sourceSlide, source} = slideDeck()
    const html = clipboardHTML(source)
    nativePaste(html)
    const firstCopy = positioned(sourceSlide).at(-1)!
    expect(coords(firstCopy)).toEqual([64, 94])
    if(state === "disconnected") firstCopy.remove()
    else firstCopy.replaceWith(firstCopy.cloneNode(true))

    $.selectElement(source)
    nativePaste(html)

    expect(positioned(sourceSlide).at(-1)).toBeDefined()
    expect(coords(positioned(sourceSlide).at(-1)!)).toEqual([64, 94])
  })

  it("uses the moved live copy position as the next paste anchor", () => {
    const {sourceSlide, source} = slideDeck()
    const html = clipboardHTML(source)
    nativePaste(html)
    const movedCopy = positioned(sourceSlide).at(-1)!
    Object.assign(movedCopy.style, {left: "100px", top: "150px"})

    $.selectElement(source)
    nativePaste(html)

    expect(coords(positioned(sourceSlide).at(-1)!)).toEqual([124, 174])
  })

  it("offsets a top-level SVG copy once while leaving its source in place", () => {
    const {source} = canvasDeck()
    source.outerHTML = '<svg style="position:absolute;left:20px;top:30px;width:80px;height:60px" viewBox="0 0 80 60"><!--svg comment--><circle cx="10" cy="10" r="5"/></svg>'
    const svg = document.body.querySelector<SVGSVGElement>("svg")!
    $.selectElement(svg)
    const html = editor.serializeClipboardFragment($.copy()).clipboardHTML

    nativePaste(html)

    const copies = Array.from(document.body.querySelectorAll<SVGSVGElement>(":scope > svg"))
    expect(copies).toHaveLength(2)
    expect(copies[0]).toBe(svg)
    expect([parseFloat(copies[1].style.left), parseFloat(copies[1].style.top)]).toEqual([44, 54])
    expect(copies[1].firstChild?.nodeType).toBe(Node.COMMENT_NODE)
  })

  it("retains authored right, bottom, and calc positioning when offsetting a copy", () => {
    const {source} = canvasDeck()
    source.outerHTML = '<article style="position:absolute;right:calc(50% - 20px);bottom:30px"><b>Right anchored</b></article>'
    const original = document.body.querySelector<HTMLElement>("article")!
    $.selectElement(original)
    const html = editor.serializeClipboardFragment($.copy()).clipboardHTML

    nativePaste(html)

    const [kept, copy] = Array.from(document.body.children) as HTMLElement[]
    expect(kept).toBe(original)
    expect(kept.style.right).toBe("calc(50% - 20px)")
    expect(kept.style.bottom).toBe("30px")
    expect(copy.style.left).toBe("")
    expect(copy.style.top).toBe("")
    expect(copy.style.right).toContain("calc(")
    expect(copy.style.right).toContain("50%")
    expect(copy.style.bottom).toBe("6px")
  })

  it("cuts a positioned item through the toolbar while keeping clipboard metadata out of the document", async () => {
    const {source} = slideDeck()
    editor.doc.syncFromDOM()
    const write = vi.spyOn(navigator.clipboard, "write").mockResolvedValue()
    $.selectElement(source)

    expect(await editor.features.manipulation.actions.cut({type: "cut"})).toBe(true)
    expect(source.isConnected).toBe(false)
    expect(write).toHaveBeenCalledOnce()
    editor.doc.syncFromDOM()
    expect(editor.toHTML(true)).not.toContain("webwriter-clipboard")
    expect(editor.toHTML(true)).not.toContain("data-layout")
    expect(editor.doc.body.toString()).not.toContain("data-layout")
  })

  it("copies and offsets every member of a multi-item selection as one positioned group", () => {
    document.body.innerHTML = '<section style="position:absolute;left:10px;top:20px"><custom-card><!--first--></custom-card></section><aside style="position:absolute;left:150px;top:220px"><!--second--><b>Two</b></aside>'
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    const [first, second] = Array.from(document.body.children) as HTMLElement[]
    Object.assign(first.style, {left: "10px", top: "20px"})
    Object.assign(second.style, {left: "150px", top: "220px"})
    $.selectElements([first, second])
    const html = editor.serializeClipboardFragment($.copy()).clipboardHTML
    expect(html).toContain("custom-card")
    expect(html).toContain("<!--first-->")
    expect(html).toContain("<!--second-->")
    editor.doc.syncFromDOM()

    nativePaste(html)

    expect(document.body.children).toHaveLength(4)
    const [firstCopy, secondCopy] = Array.from(document.body.children).slice(2) as HTMLElement[]
    expect(coords(firstCopy)).toEqual([34, 44])
    expect(coords(secondCopy)).toEqual([174, 244])
    expect(first.isConnected).toBe(true)
    expect(second.isConnected).toBe(true)
    expect(firstCopy.querySelector("custom-card")?.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(secondCopy.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
  })
})
