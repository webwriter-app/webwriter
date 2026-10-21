// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {createLayoutPrint} from "./document-layout-print.js"
import {boardStyles, canvasStyles, slidesStyles} from "./document-layout"
import {DOMEditor} from "./domeditor"
import {sharedDOMBody} from "./domdoc"
import * as Y from "yjs"

let printer: ReturnType<typeof createLayoutPrint> | undefined
let editor: DOMEditor | undefined
const beforePrint = () => window.dispatchEvent(new Event("beforeprint"))
const afterPrint = () => window.dispatchEvent(new Event("afterprint"))
const rules = (sheets: CSSStyleSheet[]) => sheets.flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join("\n")
const originalSheets = [...document.adoptedStyleSheets]
const originalHead = document.head.innerHTML
beforeEach(() => {
  document.body.className = "ww-canvas"
  document.body.innerHTML = '<!--keep--><p style="left:-20000px;top:-10000px">Negative</p><test-widget>Widget content</test-widget><p hidden>Hidden</p>'
  const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
  appendix.replaceChildren(document.createElement("slot"))
})
afterEach(() => {
  printer?.destroy(); printer = undefined
  editor?.destroy(); editor = undefined
  vi.restoreAllMocks()
  document.adoptedStyleSheets = originalSheets
  document.head.innerHTML = originalHead
  document.body.replaceChildren(); document.body.removeAttribute("class")
})

describe("layout printing", () => {
  it("fits canvas bounds at any camera zoom without changing authored content or the screen camera", () => {
    const slot = document.body.shadowRoot!.querySelector("slot")!
    slot.style.cssText = "transform:translate(120px,-80px) scale(2);width:1280px;height:720px"
    const camera = slot.getAttribute("style"), content = document.body.innerHTML
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1280, 720))
    const [negative, widget, hidden] = document.body.children
    vi.spyOn(negative, "getBoundingClientRect").mockReturnValue(new DOMRect(-20000, -10000, 400, 200))
    vi.spyOn(widget, "getBoundingClientRect").mockReturnValue(new DOMRect(20000, 10000, 400, 200))
    vi.spyOn(hidden, "getBoundingClientRect").mockReturnValue(new DOMRect())
    const sheets = [...document.body.shadowRoot!.adoptedStyleSheets]
    printer = createLayoutPrint(document)
    beforePrint()
    const css = rules(document.body.shadowRoot!.adoptedStyleSheets)
    expect(css).toContain("translate(20000px, 10000px)")
    expect(css).toContain("40400px")
    expect(css).toContain("20200px")
    expect(css).not.toContain("0.1")
    expect(document.body.innerHTML).toBe(content)
    expect(slot.getAttribute("style")).toBe(camera)
    afterPrint()
    expect(document.body.shadowRoot!.adoptedStyleSheets).toEqual(sheets)
    expect(slot.getAttribute("style")).toBe(camera)
  })

  it("remeasures replaced canvas items on every print, including an empty canvas", () => {
    printer = createLayoutPrint(document)
    beforePrint(); afterPrint()
    document.body.innerHTML = '<svg style="left:-500px;top:-300px"></svg>'
    vi.spyOn(document.body.firstElementChild!, "getBoundingClientRect").mockReturnValue(new DOMRect(-500, -300, 2500, 900))
    beforePrint()
    expect(rules(document.body.shadowRoot!.adoptedStyleSheets)).toContain("2500px")
    expect(rules(document.body.shadowRoot!.adoptedStyleSheets)).toContain("translate(500px, 300px)")
    afterPrint(); document.body.replaceChildren(); beforePrint()
    expect(rules(document.body.shadowRoot!.adoptedStyleSheets)).not.toMatch(/NaN|Infinity/)
  })

  it("fits each current board column separately while keeping headings and artifacts out of print", () => {
    document.body.className = "ww-board"
    document.body.innerHTML = '<!--keep--><section class="ww-board-column"><h2>Heading</h2><article class="ww-board-card"><test-widget>Card</test-widget></article></section><style></style><section class="ww-board-column"><h2>Long</h2><article class="ww-board-card">Last card</article></section><section class="ww-board-column" is="custom-column">Custom</section>'
    const columns = document.querySelectorAll("section"), content = document.body.innerHTML
    vi.spyOn(columns[0], "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 450, 200))
    vi.spyOn(columns[1], "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 450, 5000))
    vi.spyOn(columns[1].querySelector("article")!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 1200, 450, 300))
    printer = createLayoutPrint(document); beforePrint()
    const css = rules(document.adoptedStyleSheets)
    expect(css).toContain(":nth-child(1)")
    expect(css).toContain(":nth-child(3)")
    expect(css).not.toContain(":nth-child(4)")
    expect(css).toContain("5000px")
    expect(css).toContain("height: 300px")
    expect(css).toContain("scale(var(--ww-print-scale))")
    expect(document.body.innerHTML).toBe(content)
    afterPrint()
    expect(document.adoptedStyleSheets).toEqual(originalSheets)
    expect(boardStyles).toContain("size: portrait")
    expect(boardStyles).toContain("background: none")
    expect(boardStyles).toContain(":not(article.ww-board-card) { display: none; }")
  })

  it("cleans up during printing and disposes an earlier reader when the editor takes over", () => {
    printer = createLayoutPrint(document); beforePrint()
    const shadow = document.body.shadowRoot!
    expect(shadow.adoptedStyleSheets.length).toBe(1)
    const next = createLayoutPrint(document)
    expect(shadow.adoptedStyleSheets).toHaveLength(0)
    printer.destroy(); printer = next
    beforePrint()
    expect(shadow.adoptedStyleSheets).toHaveLength(1)
    next.destroy(); beforePrint()
    expect(shadow.adoptedStyleSheets).toHaveLength(0)
    expect(document.adoptedStyleSheets).toEqual(originalSheets)
  })

  it.each(["", "ww-canvas ww-board"])("does not alter the '%s' layout", mode => {
    document.body.className = mode
    printer = createLayoutPrint(document); beforePrint()
    expect(document.adoptedStyleSheets).toEqual(originalSheets)
    expect(document.body.shadowRoot!.adoptedStyleSheets).toHaveLength(0)
  })

  it.each(["ww-canvas", "ww-slides", "ww-board"])("hides appendix editing controls in %s and restores them after printing", mode => {
    document.body.className = mode
    const appendix = document.body.shadowRoot!
    const controls = document.createElement("div")
    controls.setAttribute("part", "transform-overlay")
    appendix.append(controls)
    printer = createLayoutPrint(document); beforePrint()
    expect(rules(appendix.adoptedStyleSheets)).toContain(":host > :not(slot)")
    expect(rules(appendix.adoptedStyleSheets)).toContain("display: none !important")
    expect(appendix.querySelector("slot")).not.toBeNull()
    afterPrint()
    expect(appendix.adoptedStyleSheets).toHaveLength(0)
    expect(controls.isConnected).toBe(true)
  })

  it("keeps live print styles out of serialization, collaboration and undo", () => {
    editor = new DOMEditor()
    const content = editor.toHTML(true)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const history = {undo: editor.doc.canUndo, redo: editor.doc.canRedo}
    beforePrint(); editor.doc.syncFromDOM()
    expect(editor.toHTML(true)).toBe(content)
    expect({undo: editor.doc.canUndo, redo: editor.doc.canRedo}).toEqual(history)
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      expect(sharedDOMBody(remote).toString()).not.toContain("◆")
      expect(sharedDOMBody(remote).toString()).not.toContain("100vw")
    }
    finally { remote.destroy() }
    editor.features.layout.disable()
    expect(rules(document.body.shadowRoot!.adoptedStyleSheets)).not.toContain("slot:not([name])")
    afterPrint()
  })

  it("gives slides landscape pages with fixed authored geometry and hides navigation", () => {
    expect(slidesStyles).toContain("size: landscape")
    expect(slidesStyles).toContain("min(calc(100vw / 1280px), calc(100vh / 720px))")
    expect(slidesStyles).toContain("break-inside: avoid; break-after: page")
    expect(slidesStyles).toContain(".ww-slide-directions { display: none; }")
    expect(canvasStyles).toContain("background: none")
  })
})
