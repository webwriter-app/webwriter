// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"
import {MATH_NAMESPACE, mathArity, mathBoundaryPoint, mathStructureOptions, mathToolGroups} from "../math"
import {isSelectionChangeMessage, selectionChangeEvent, type SelectionChangeDetail} from "../editor-bridge"
import * as Y from "yjs"

let editor: DOMEditor
const command = (value: string) => editor.features.math.execute(value)
const clean = () => editor.toHTML(true)
function load(html = "<mrow></mrow>") {
  document.body.innerHTML = `<p>Before <math>${html}</math> after</p>`
  // Happy DOM's HTML parser does not enter the MathML namespace.
  const parsed = document.querySelector("math")!
  const namespaced = (node: Node): Node => {
    if(!(node instanceof Element)) return node.cloneNode(true)
    const result = document.createElementNS(MATH_NAMESPACE, node.localName)
    Array.from(node.attributes).forEach(attribute => result.setAttribute(attribute.name, attribute.value))
    result.append(...Array.from(node.childNodes).map(namespaced))
    return result
  }
  const math = namespaced(parsed) as Element
  parsed.replaceWith(math)
  $.move(math, 0)
  return math
}
function key(value: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true, ...options})
  document.dispatchEvent(event)
  return event
}
beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
})
afterEach(() => editor.destroy())

describe("DOM MathML editing", () => {
  it.each(["inline", "block"])("paints a whole %s formula once and restores partial text selection", display => {
    const math = load("<mrow><mi>abc</mi><mfrac><mi>x</mi><mi>y</mi></mfrac></mrow>")
    math.setAttribute("display", display)
    const authored = clean()
    const overlays = () => editor.appendix.querySelectorAll('[part="atomic-selection-overlay"]')
    for(const contents of [false, true]) {
      if(contents) document.getSelection()!.setBaseAndExtent(math, 0, math, math.childNodes.length)
      else $.selectElement(math)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      expect(overlays()).toHaveLength(1)
      expect(math.classList.contains("◆atomic-range-selected")).toBe(true)
      expect(math.querySelector(".◆atomic-range-selected")).toBeNull()
      expect(clean()).toBe(authored)
      const text = math.querySelector("mi")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 0, text, 1)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      expect(overlays()).toHaveLength(0)
      expect(math.classList.contains("◆atomic-range-selected")).toBe(false)
    }
  })

  it.each(["", "<mrow></mrow>"])("retains the empty formula caret across refreshes: %s", content => {
    const math = load(content)
    $.move(math.firstElementChild ?? math, 0)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    editor.features.math.refresh()
    const caret = editor.appendix.querySelector('[part="math-caret"]')!
    expect(caret).not.toBeNull()
    editor.features.math.refresh()
    expect(editor.appendix.querySelector('[part="math-caret"]')).toBe(caret)
    expect(editor.features.selection.selectionCaret?.getAttribute("part") ?? "").not.toContain("selection-caret-text")
    expect(clean()).not.toContain("math-caret")
    editor.features.math.disable()
    expect(editor.appendix.querySelector('[part="math-caret"]')).toBeNull()
  })

  it("owns the empty radicand caret and releases it at formula and prose boundaries", () => {
    const math = load("<mrow><mroot><mrow></mrow><mi>a</mi></mroot></mrow>")
    const slot = math.querySelector("mroot")!.firstElementChild!
    const original = clean()
    $.move(slot, 0)
    editor.features.math.refresh()
    expect(math.classList.contains("◆math-structural-caret")).toBe(true)
    expect(Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
      .filter(element => element.style.background)).toHaveLength(1)
    expect(clean()).toBe(original)
    $.move(math, math.childNodes.length)
    editor.features.math.refresh()
    expect(math.classList.contains("◆math-structural-caret")).toBe(false)
    $.move(math.nextSibling!, 1)
    editor.features.math.refresh()
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
    expect(math.querySelector(".◆math-slot")).toBeNull()
    expect(clean()).toBe(original)
  })

  it.each([0, 1])("owns the measured caret at structure boundary %s", offset => {
    const math = load("<mrow><mfrac><mi>x</mi><mi>y</mi></mfrac><mi>z</mi></mrow>")
    const row = math.firstElementChild!
    const authored = clean()
    $.move(row, offset)
    editor.features.math.refresh()
    expect(math.classList.contains("◆math-structural-caret")).toBe(true)
    expect(editor.appendix.querySelectorAll('[part="math-caret"]')).toHaveLength(1)
    expect(clean()).toBe(authored)
    $.move(row.lastElementChild!.firstChild!, 1)
    editor.features.math.refresh()
    expect(editor.appendix.querySelector('[part="math-caret"]')).toBeNull()
    expect(math.classList.contains("◆math-structural-caret")).toBe(false)
  })

  it.each(["ltr", "rtl"])("insets the %s empty placeholder caret one pixel to the right", direction => {
    const math = load("<msup><mi>x</mi><mrow></mrow></msup>")
    const slot = math.querySelector("mrow")!
    slot.setAttribute("style", `direction:${direction}`)
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 20, 12, 16))
    $.move(slot, 0)
    editor.features.math.refresh()
    expect(editor.appendix.querySelector<HTMLElement>('[part="math-caret"]')!.style.left).toBe("31px")
    expect(editor.appendix.querySelector<HTMLElement>(".◆math-overlay > span")!.style.left).toBe("30px")
  })

  it("keeps small script placeholders inside their reserved native bounds", () => {
    const math = load("<mroot><mrow></mrow><mrow></mrow></mroot>")
    const slots = math.querySelectorAll("mrow")
    vi.spyOn(slots[0], "getBoundingClientRect").mockReturnValue(new DOMRect(30, 20, 12, 16))
    vi.spyOn(slots[1], "getBoundingClientRect").mockReturnValue(new DOMRect(22, 12, 6, 8))
    editor.features.math.refresh()
    const guides = Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
    expect(guides.map(guide => [guide.style.left, guide.style.top, guide.style.width, guide.style.height]))
      .toEqual([["30px", "20px", "12px", "16px"], ["22px", "12px", "6px", "8px"]])
    expect(clean()).not.toContain("◆")
    editor.features.math.disable()
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
    expect(math.querySelector(".◆math-slot")).toBeNull()
  })

  it.each(["ltr", "rtl"])("keeps %s placeholder guides out of spacing reserved for operators", direction => {
    const math = load("<msubsup><mo>∫</mo><mrow></mrow><mrow></mrow></msubsup>")
    const slot = math.querySelector("mrow")!
    slot.setAttribute("style", `direction:${direction};padding-left:${direction === "ltr" ? 10 : 0}px;padding-right:${direction === "rtl" ? 10 : 0}px`)
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 20, 18, 12))
    const authored = clean()
    $.move(slot, 0)
    editor.features.math.refresh()
    const guide = editor.appendix.querySelector<HTMLElement>(".◆math-overlay > span")!
    expect(guide.style.left).toBe(direction === "ltr" ? "40px" : "30px")
    expect(guide.style.width).toBe("8px")
    const caret = editor.appendix.querySelector('[part="math-caret"]')
    expect(caret).not.toBeNull()
    editor.features.math.refresh()
    expect(editor.appendix.querySelector('[part="math-caret"]')).toBe(caret)
    expect(clean()).toBe(authored)
    editor.features.math.disable()
    expect(math.querySelector(".◆math-slot")).toBeNull()
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
  })

  it("highlights only the hovered structure placeholder border and restores it on exit", () => {
    const math = load('<mroot><mrow></mrow><mrow></mrow></mroot>')
    const degree = math.querySelector("mroot")!.lastElementChild!
    const borders = () => Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
      .map(guide => guide.style.borderColor)
    editor.features.math.refresh()
    const normal = borders()
    expect(normal).toHaveLength(2)
    degree.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    editor.features.math.refresh()
    expect(borders()[0]).toBe(normal[0])
    expect(borders()[1]).toContain("var(--sl-color-primary-400)")
    degree.dispatchEvent(new PointerEvent("pointerout", {bubbles: true}))
    editor.features.math.refresh()
    expect(borders()).toEqual(normal)
    expect(clean()).not.toContain("◆")
  })

  it("resolves native whole-formula pointer targets to the rendered argument as the pointer moves", () => {
    const math = load('<mroot><mi>x</mi><mn>2</mn></mroot>')
    const radicand = math.querySelector("mi")!
    const degree = math.querySelector("mn")!
    vi.spyOn(radicand, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 20, 20, 20))
    vi.spyOn(degree, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 10, 10))
    math.dispatchEvent(new PointerEvent("pointerover", {bubbles: true, clientX: 15, clientY: 15}))
    expect(Array.from(math.querySelectorAll(".◆math-hovered"))).toEqual([degree])
    math.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 35, clientY: 25}))
    expect(Array.from(math.querySelectorAll(".◆math-hovered"))).toEqual([radicand])
    math.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 60, clientY: 25}))
    expect(math.querySelector(".◆math-hovered")).toBeNull()
  })

  it("highlights exactly the innermost hovered argument and excludes the marker from saved and shared HTML", () => {
    const math = load('<mroot><mrow><mi>x</mi><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow><mn>3</mn></mroot>')
    const hover = (element: Element) => element.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    const radicand = math.querySelector("mrow")!
    hover(radicand.firstElementChild!)
    expect(Array.from(math.querySelectorAll(".◆math-hovered"))).toEqual([radicand])
    const numerator = math.querySelector("mfrac > mi")!
    hover(numerator)
    expect(Array.from(math.querySelectorAll(".◆math-hovered"))).toEqual([numerator])
    const degree = math.querySelector("mn")!
    hover(degree)
    expect(Array.from(math.querySelectorAll(".◆math-hovered"))).toEqual([degree])
    expect(clean()).not.toContain("◆math-hovered")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("◆math-hovered")
    degree.dispatchEvent(new PointerEvent("pointerout", {bubbles: true}))
    expect(math.querySelector(".◆math-hovered")).toBeNull()
    hover(degree)
    degree.remove()
    editor.features.math.refresh()
    expect(degree.classList.contains("◆math-hovered")).toBe(false)
    hover(numerator)
    editor.features.math.disable()
    expect(math.querySelector(".◆math-hovered")).toBeNull()
  })

  it("does not highlight math owned by widgets or read-only content", () => {
    const math = load('<mroot><mi>x</mi><mrow></mrow></mroot>')
    const degree = math.querySelector("mrow")!
    degree.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    expect(degree.classList.contains("◆math-hovered")).toBe(true)
    math.setAttribute("contenteditable", "false")
    degree.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    expect(math.querySelector(".◆math-hovered")).toBeNull()
    math.removeAttribute("contenteditable")
    const widget = document.createElement("test-widget")
    math.replaceWith(widget)
    widget.append(math)
    degree.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    expect(math.querySelector(".◆math-hovered")).toBeNull()
  })

  it("splits nested marks around a block formula and wraps it when converted back", () => {
    const math = load("<mi>x</mi>")
    const paragraph = math.parentElement!
    const strong = document.createElement("strong")
    paragraph.replaceChildren(strong)
    strong.append("left", math, document.createComment("keep"), "right")
    const token = math.firstChild!.firstChild!
    $.move(token, 1)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(command("display:block")).toBe(true)
    expect(clean()).toBe('<p><strong>left</strong></p><math display="block"><mi>x</mi></math><p><strong><!--keep-->right</strong></p>')
    expect($.anchor).toBe(token)
    expect($.anchorOffset).toBe(1)
    expect(command("display:inline")).toBe(true)
    expect(math.parentElement?.localName).toBe("p")
    expect(document.querySelectorAll("p")).toHaveLength(3)
    expect($.anchor).toBe(token)
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(clean()).toBe('<p><strong>left<math><mi>x</mi></math><!--keep-->right</strong></p>')
    editor.doc.redo()
    expect(document.querySelector("math")?.parentElement?.localName).toBe("p")
    expect(clean()).not.toContain("◆")
  })

  it("removes empty split wrappers when the paragraph contains only a formula", () => {
    const math = load("<mi>x</mi>")
    math.parentElement!.replaceChildren(document.createTextNode(""), math, document.createTextNode(""))
    $.selectElement(math)
    expect(command("display:block")).toBe(true)
    expect(document.body.children).toHaveLength(1)
    expect(math.parentElement).toBe(document.body)
    expect(command("display:inline")).toBe(true)
    expect(clean()).toBe('<p><math display="inline"><mi>x</mi></math></p>')
  })

  it.each(["inline", "block"])("double click selects the whole %s formula", display => {
    const math = load("<msub><mi>x</mi><mi>ij</mi></msub><mo>+</mo><mi>y</mi>")
    math.setAttribute("display", display)
    const token = math.querySelector("msub")!.lastElementChild!
    token.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, button: 0, detail: 2}))
    expect(document.getSelection()!.toString()).toBe("xij+y")
    expect(editor.features.math.activeMath).toBe(math)
    expect(clean()).not.toContain("◆")
  })

  it("distinguishes the end of a subscript from the row position after it", () => {
    const math = load("<mrow><msub><mi>x</mi><mi>ij</mi></msub><mo>+</mo><mi>y</mi></mrow>")
    const row = math.firstElementChild!
    const script = row.firstElementChild!
    const base = script.firstElementChild!
    const sub = script.lastElementChild!
    vi.spyOn(math, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 150, 60))
    vi.spyOn(script, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 40, 40))
    vi.spyOn(base, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 20, 30))
    vi.spyOn(sub, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 45, 20, 15))
    const geometry = vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function(this: Range) {
      if(this.startContainer === sub.firstChild) return new DOMRect(40 + this.startOffset * 10, 45, 0, 15)
      return new DOMRect()
    })
    for(const [x, node, offset] of [[60, sub.firstChild!, 2], [64, row, 1]] as const) {
      sub.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 53}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true}))
      expect($.focus).toBe(node)
      expect($.focusOffset).toBe(offset)
    }
    geometry.mockRestore()
  })

  it.each(["", "<mrow></mrow>", "<mrow><mi></mi><mtext> </mtext></mrow>"])("removes an empty inline formula after leaving: %s", content => {
    const math = load(content)
    const parent = math.parentNode!
    const before = math.previousSibling!, after = math.nextSibling!
    editor.features.math.refresh()
    command("exit")
    expect(math.isConnected).toBe(false)
    expect(math.className).toBe("")
    expect(Array.from(parent.childNodes)).toEqual([before, after])
    expect(parent.textContent).toBe("Before  after")
    expect($.anchor).toBe(after)
    expect($.anchorOffset).toBe(0)
  })

  it("removes an emptied inline formula on an external selection change and supports undo", () => {
    const math = load("<mi>x</mi>")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.move(math.firstChild!.firstChild!, 1)
    command("delete:backward")
    expect(math.isConnected).toBe(true)
    $.move(math.previousSibling!, 0)
    editor.features.math.refresh()
    expect(math.isConnected).toBe(false)
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(document.querySelector("math")?.textContent).toBe("x")
    editor.doc.redo()
    expect(document.querySelector("math")).toBeNull()
  })

  it.each(["<mfrac><mrow></mrow><mrow></mrow></mfrac>", "<msqrt><mrow></mrow></msqrt>", "<mspace width='1em'></mspace>", "<!--authored-->", "<unknown></unknown>"])("keeps authored structures when leaving: %s", content => {
    const math = load(content)
    editor.features.math.refresh()
    command("exit")
    expect(math.isConnected).toBe(true)
  })

  it("keeps empty block formulas and empty inline formulas covered by a text range", () => {
    const math = load()
    editor.features.math.refresh()
    document.getSelection()!.setBaseAndExtent(math.previousSibling!, 0, math.nextSibling!, 1)
    editor.features.math.refresh()
    expect(math.isConnected).toBe(true)
    $.move(math, 0)
    command("display:block")
    command("exit")
    expect(math.isConnected).toBe(true)
  })

  it.each(["only", "first", "middle", "last", "marked", "adjacent"])("preserves all four inline formula boundary positions when %s", placement => {
    const math = load("<mrow><mi>x</mi></mrow>")
    const paragraph = math.parentElement!
    paragraph.replaceChildren(math)
    if(["middle", "last", "marked"].includes(placement)) paragraph.prepend("before")
    if(["first", "middle", "marked"].includes(placement)) paragraph.append("after")
    if(placement === "adjacent") paragraph.append(math.cloneNode(true))
    if(placement === "marked") {
      const mark = document.createElement("em")
      math.replaceWith(mark)
      mark.append(math)
    }
    const parent = math.parentNode!
    const index = Array.from(parent.childNodes).indexOf(math)
    const outsideBefore: [Node, number] = math.previousSibling instanceof Text ? [math.previousSibling, math.previousSibling.length] : [parent, index]
    const outsideAfter: [Node, number] = math.nextSibling instanceof Text ? [math.nextSibling, 0] : [parent, index + 1]
    const end = math.querySelector("mi")!.firstChild!
    const points: [Node, number][] = [[parent, index], [math, 0], [math, math.childNodes.length], [parent, index + 1]]
    for(const [node, offset] of points) {
      $.move(node, offset)
      editor.features.selection.processSelection()
      editor.features.math.refresh()
      expect($.anchor).toBe(node)
      expect($.anchorOffset).toBe(offset)
      expect($.isTextSelection).toBe(true)
      expect($.isGapSelection).toBe(false)
      expect(editor.features.selection.captureSelectedElement).toBeNull()
      expect(math.classList.contains("◆element-selected")).toBe(false)
      expect(math.classList.contains("◆math-editing")).toBe(node === math)
    }
    $.move(parent, index)
    key("ArrowRight")
    expect($.anchor).toBe(math)
    expect($.anchorOffset).toBe(0)
    key("End")
    expect($.anchor).toBe(end)
    expect($.anchorOffset).toBe(1)
    key("ArrowRight")
    expect($.anchor).toBe(outsideAfter[0])
    expect($.anchorOffset).toBe(outsideAfter[1])
    key("ArrowLeft")
    expect($.anchor).toBe(end)
    expect($.anchorOffset).toBe(1)
    key("Home")
    key("ArrowLeft")
    expect($.anchor).toBe(outsideBefore[0])
    expect($.anchorOffset).toBe(outsideBefore[1])
  })

  it.each(["inline", "block"])("omits a %s formula and its internals from the breadcrumb", display => {
    const math = load("<mrow><mi>x</mi></mrow>")
    math.setAttribute("display", display)
    const messages: SelectionChangeDetail[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<SelectionChangeDetail>).detail)
    window.addEventListener(selectionChangeEvent, listener)
    try {
      for(const node of [math, math.querySelector("mi")!.firstChild!]) {
        $.move(node, 0)
        editor.features.selection.processSelection()
        editor.postSelectionPath()
        expect(messages.at(-1)!.path.map(item => item.path)).toEqual([[], [0]])
      }
    }
    finally { window.removeEventListener(selectionChangeEvent, listener) }
  })

  it("selects an inline formula as text and omits all its internals from the breadcrumb", () => {
    const math = load("<mrow><mi>x</mi></mrow>")
    const messages: SelectionChangeDetail[] = []
    const listener = (event: Event) => messages.push((event as CustomEvent<SelectionChangeDetail>).detail)
    window.addEventListener(selectionChangeEvent, listener)
    try {
      for(const node of [math, math.querySelector("mi")!.firstChild!]) {
        $.move(node, 0)
        editor.features.selection.processSelection()
        editor.postSelectionPath()
        expect(messages.at(-1)!.path.map(item => item.name)).not.toContain("Formula")
        expect(messages.at(-1)!.path.map(item => item.path)).toEqual([[], [0]])
      }
      $.selectElement(math)
      editor.features.selection.processSelection()
      expect($.isElementSelection).toBe(false)
      expect($.isTextSelection).toBe(true)
      expect(document.getSelection()!.toString()).toBe("x")
      expect(editor.features.selection.captureSelectedElement).toBeNull()
      editor.features.selection.actions.hoverNode({type: "hoverNode", path: [0, 1]})
      expect(math.classList.contains("◆element-hovered")).toBe(false)
      document.getSelection()!.setBaseAndExtent(math, 1, math, 0)
      editor.features.selection.processSelection()
      editor.postSelectionPath()
      expect($.anchorOffset).toBe(1)
      expect($.focusOffset).toBe(0)
      expect(messages.at(-1)!.nodeSelected).toBeUndefined()
    }
    finally { window.removeEventListener(selectionChangeEvent, listener) }
  })

  it.each(["", "<mrow></mrow>", "<mrow><mrow></mrow></mrow>"])("does not draw an outer dashed guide for %s", content => {
    const math = load(content)
    editor.features.math.refresh()
    expect(math.classList.contains("◆math-editing")).toBe(true)
    expect(Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆math-overlay > span"))
      .filter(element => element.style.borderStyle === "dashed")).toHaveLength(0)
    command("exit")
    expect(math.classList.contains("◆math-editing")).toBe(false)
  })

  it("extends a text drag from an inline formula into surrounding prose", () => {
    const math = load("<mi>x</mi>")
    const prose = math.previousSibling!
    vi.spyOn(math, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 30, 80, 40))
    const point = vi.spyOn($, "pointFromCoords").mockReturnValue({node: prose, offset: 0})
    try {
      math.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8, clientX: 40, clientY: 50}))
      document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, cancelable: true, pointerId: 8, clientX: 10, clientY: 50}))
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
      expect(math.contains($.anchor)).toBe(true)
      expect($.focus).toBe(prose)
      expect($.focusOffset).toBe(0)
      expect($.isTextSelection).toBe(true)
      expect(editor.features.selection.captureSelectedElement).toBeNull()
    }
    finally { point.mockRestore() }
  })

  it("captures a block formula while preserving its native caret and range", () => {
    const math = load("<mi>abc</mi>")
    math.setAttribute("display", "block")
    const text = math.firstChild!.firstChild!
    $.move(text, 1)
    editor.features.selection.processSelection()
    expect(editor.features.selection.captureSelectedElement).toBe(math)
    expect(math.classList.contains("◆element-capture-selected")).toBe(true)
    expect(editor.features.selection.selectionCaret?.classList.contains("◆selection-caret-capture")).toBe(true)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
    expect(key("q").defaultPrevented).toBe(true)
    expect(math.textContent).toBe("aqbc")
    key("ArrowRight", {shiftKey: true})
    expect(document.getSelection()!.toString()).toBe("b")
    expect(editor.features.selection.captureSelectedElement).toBe(math)
    expect(editor.appendix.querySelector(".◆math-overlay")?.children).toHaveLength(0)
    command("exit")
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(math.classList.contains("◆element-capture-selected")).toBe(false)
    expect($.isGapSelection).toBe(true)
  })

  it("uses capture presentation for a whole block formula and releases it on disable", () => {
    const math = load("<mi>x</mi>")
    math.setAttribute("display", "block")
    editor.features.selection.captureElement(math)
    expect(editor.features.selection.captureSelectedElement).toBe(math)
    expect($.selectedElement).toBe(math)
    editor.features.math.disable()
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(math.classList.contains("◆element-capture-selected")).toBe(false)
  })

  it("releases capture from another interactive element when clicking an inline formula", () => {
    const math = load("<mi>x</mi>")
    const button = document.createElement("button")
    button.textContent = "Button"
    document.body.append(button)
    editor.features.selection.captureElement(button)
    expect(editor.features.selection.captureSelectedElement).toBe(button)
    math.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0, pointerId: 8}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 8}))
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(editor.features.math.activeMath).toBe(math)
    expect(button.classList.contains("◆element-capture-selected")).toBe(false)
    expect(key("q").defaultPrevented).toBe(true)
    expect(math.textContent).toContain("q")
  })

  it.each(["inline", "block"])("never uses gaps within a %s formula, including empty arguments", display => {
    const math = load("<mrow><mfrac><mrow></mrow><msqrt><mi>x</mi></msqrt></mfrac></mrow>")
    math.setAttribute("display", display)
    for(const element of [math, ...Array.from(math.querySelectorAll("*"))]) {
      for(let offset = 0; offset <= element.childNodes.length; offset++) {
        $.move(element, offset)
        editor.features.selection.processSelection()
        expect($.isGapSelection).toBe(false)
        expect($.isTextSelection).toBe(true)
        expect(editor.features.selection.captureSelectedElement).toBe(display === "block" ? math : null)
        expect(document.body.classList.contains("◆gap-caret-visible")).toBe(false)
      }
    }
  })

  it.each(["p", "section", "td", "body"])("keeps inline text boundaries and block gaps in %s", tag => {
    for(const display of ["inline", "block"]) {
      for(const surroundings of ["only", "first", "last", "middle", "adjacent", "whitespace"]) {
        const math = load("<mi>x</mi>")
        math.setAttribute("display", display)
        const parent = tag === "body" ? document.body : document.createElement(tag)
        const nodes: Node[] = [math]
        if(["last", "middle"].includes(surroundings)) nodes.unshift(document.createTextNode("before"))
        if(["first", "middle"].includes(surroundings)) nodes.push(document.createTextNode("after"))
        if(surroundings === "adjacent") nodes.push(math.cloneNode(true))
        if(surroundings === "whitespace") nodes.push(document.createTextNode("  "))
        parent.replaceChildren(...nodes)
        if(tag !== "body") {
          if(tag === "td") {
            document.body.innerHTML = "<table><tbody><tr></tr></tbody></table>"
            document.querySelector("tr")!.append(parent)
          }
          else document.body.replaceChildren(parent)
        }
        const index = Array.from(parent.childNodes).indexOf(math)
        for(const offset of [index, index + 1]) {
          $.move(parent, offset)
          editor.features.selection.processSelection()
          expect($.anchor).toBe(parent)
          expect($.anchorOffset).toBe(offset)
          expect($.isGapSelection).toBe(display === "block")
          expect($.isTextSelection).toBe(display === "inline")
          expect(editor.features.selection.captureSelectedElement).toBeNull()
          expect(document.body.classList.contains("◆gap-caret-visible")).toBe(display === "block")
        }
      }
    }
  })

  it.each(["inline", "block"])("stops before and after a %s formula when approaching with arrows", display => {
    const math = load("<mi>x</mi>")
    math.setAttribute("display", display)
    const parent = math.parentNode!
    $.move(parent.firstChild!, parent.firstChild!.textContent!.length)
    expect(key("ArrowRight").defaultPrevented).toBe(true)
    expect($.anchor).toBe(display === "block" ? parent : math)
    expect($.anchorOffset).toBe(display === "block" ? 1 : 0)
    if(display === "block") key("ArrowRight")
    expect(editor.features.selection.captureSelectedElement).toBe(display === "block" ? math : null)
    key("ArrowLeft")
    expect($.anchor).toBe(display === "block" ? parent : parent.firstChild)
    expect($.anchorOffset).toBe(display === "block" ? 1 : parent.firstChild!.textContent!.length)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    $.move(parent.lastChild!, 0)
    key("ArrowLeft")
    expect($.anchor).toBe(display === "block" ? parent : math.firstChild!.firstChild)
    expect($.anchorOffset).toBe(display === "block" ? 2 : 1)
    if(display === "block") key("ArrowLeft")
    expect(editor.features.selection.captureSelectedElement).toBe(display === "block" ? math : null)
    command("exit")
    expect($.anchor).toBe(display === "block" ? parent : parent.lastChild)
    expect($.anchorOffset).toBe(display === "block" ? 2 : 0)
  })

  it("resolves padded formula edges outside, leaving argument interiors editable", () => {
    const math = load("<mi>x</mi>")
    vi.spyOn(math, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 30, 80, 40))
    const parent = math.parentNode!
    expect(mathBoundaryPoint(math, 21, 50)).toEqual({node: math.previousSibling, offset: 7})
    expect(mathBoundaryPoint(math, 99, 50)).toEqual({node: math.nextSibling, offset: 0})
    expect(mathBoundaryPoint(math, 50, 50)).toBeNull()
    // Vertical blank space wins even when x is inside or before the formula.
    expect(mathBoundaryPoint(math, 50, 90)).toEqual({node: math.nextSibling, offset: 0})
    expect(mathBoundaryPoint(math, 0, 90)).toEqual({node: math.nextSibling, offset: 0})
    expect(mathBoundaryPoint(math, 50, 10)).toEqual({node: math.previousSibling, offset: 7})
    math.setAttribute("display", "block")
    expect(mathBoundaryPoint(math, 50, 31)).toEqual({node: parent, offset: 1})
    expect(mathBoundaryPoint(math, 50, 69)).toEqual({node: parent, offset: 2})
    expect(mathBoundaryPoint(math, 50, 50)).toBeNull()
    math.remove()
    expect(mathBoundaryPoint(math, 50, 31)).toBeNull()
  })

  it("places a click below a trailing formula in the gap after its paragraph", () => {
    const math = load("<mfrac><mi>x</mi><mi>y</mi></mfrac>")
    math.nextSibling!.remove()
    const parent = math.parentNode!
    const html = parent.cloneNode(true)
    vi.spyOn(math, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 30, 80, 40))
    vi.spyOn(math.parentElement!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 200, 60))
    const original = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint")
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: () => ({offsetNode: math.querySelectorAll("mi")[1].firstChild, offset: 1})})
    try {
      const down = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, clientX: 50, clientY: 100})
      document.body.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
      document.body.dispatchEvent(new MouseEvent("pointerup", {bubbles: true, clientX: 50, clientY: 100}))
      expect($.anchor).toBe(document.body)
      expect($.anchorOffset).toBe(1)
      expect($.isEmpty).toBe(true)
      expect($.isGapSelection).toBe(true)
      expect(parent.textContent).toBe(html.textContent)
      expect(math.querySelectorAll("mi")).toHaveLength(2)
    }
    finally {
      if(original) Object.defineProperty(document, "caretPositionFromPoint", original)
      else Reflect.deleteProperty(document, "caretPositionFromPoint")
      vi.restoreAllMocks()
    }
  })

  it.each(["parent", "empty text", "token", "marked token"])("selects paragraph gaps on every click with native %s hit testing", hit => {
    const math = load("<mi>x</mi>")
    const parent = math.parentElement!
    const text = math.nextSibling as Text
    text.data = ""
    const token = math.firstChild!.firstChild!
    if(hit === "marked token") {
      const mark = document.createElement("em")
      math.replaceWith(mark)
      mark.append(math, text)
    }
    const original = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint")
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: () => ({
      offsetNode: hit === "parent" ? parent : hit === "empty text" ? text : token,
      offset: hit === "parent" ? 2 : hit === "empty text" ? 0 : 1,
    })})
    vi.spyOn(math, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 30, 80, 40))
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 200, 60))
    try {
      for(const [y, offset] of [[10, 0], [100, 1]]) for(const detail of [1, 2, 3, 1]) {
        $.move(token, 1)
        // A preceding word selection must not suppress blank-space placement.
        editor.features.selection.hasDoubleClicked = true
        const options = {bubbles: true, cancelable: true, clientX: 140, clientY: y, detail}
        const down = new MouseEvent("pointerdown", options)
        parent.dispatchEvent(down)
        expect(down.defaultPrevented).toBe(true)
        expect($.anchor).toBe(document.body)
        expect($.anchorOffset).toBe(offset)
        const mouse = new MouseEvent("mousedown", options)
        parent.dispatchEvent(mouse)
        expect(mouse.defaultPrevented).toBe(true)
        parent.dispatchEvent(new MouseEvent("pointerup", options))
        parent.dispatchEvent(new MouseEvent("click", options))
        expect($.anchor).toBe(document.body)
        expect($.anchorOffset).toBe(offset)
        expect($.isEmpty).toBe(true)
        expect($.isGapSelection).toBe(true)
        expect(editor.features.math.activeMath).toBeNull()
      }
    }
    finally {
      if(original) Object.defineProperty(document, "caretPositionFromPoint", original)
      else Reflect.deleteProperty(document, "caretPositionFromPoint")
      vi.restoreAllMocks()
    }
  })

  it.each(["only", "last", "marked"])("types prose after a %s formula inserted at the end of text", placement => {
    document.body.innerHTML = placement === "marked" ? "<p><em>Before</em></p>" : "<p></p>"
    const parent = document.querySelector(placement === "marked" ? "em" : "p")!
    parent.textContent = placement === "only" ? "" : "Before"
    if(!parent.firstChild) parent.append(document.createTextNode(""))
    $.move(parent.firstChild!, parent.textContent.length)
    editor.features.math.insert()
    command("text:x")
    const math = parent.querySelector("math")!
    expect(math.nextSibling).toBeInstanceOf(Text)
    expect(math.nextSibling!.textContent).toBe("")
    key("ArrowRight")
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "prose"})
    document.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(true)
    expect(math.textContent).toBe("x")
    expect(math.nextSibling!.textContent).toBe("prose")
    expect($.anchor?.parentNode).toBe(parent)
  })

  it.each([0, 1])("inserts prose at inline boundary %s without editing the formula", offset => {
    const math = load("<mi>x</mi>")
    const parent = math.parentNode!
    parent.replaceChildren(math)
    $.move(parent, offset)
    editor.features.selection.processSelection()
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "prose"})
    document.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(true)
    expect(math.textContent).toBe("x")
    expect((offset ? math.nextSibling : math.previousSibling)?.textContent).toBe("prose")
    expect($.anchor?.parentNode).toBe(parent)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
  })

  it.each(mathStructureOptions)("inserts a new formula containing $title with an editable first argument", option => {
    document.body.innerHTML = "<p>beforeafter</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)
    const structure = option.command.slice("structure:".length)
    expect(editor.features.math.actions.insertMath({type: "insertMath", structure})).toBe(true)
    const math = document.querySelector("math")!
    const expectedTags: Record<string, string> = {
      frac: "mfrac", square: "msup", sup: "msup", sub: "msub", sqrt: "mroot", root: "mroot",
      abs: "mo", paren: "mo", binom: "mfrac", matrix: "mtable", sum: "munderover", prod: "munderover",
      int: "msubsup", bigcup: "munderover", bigcap: "munderover",
    }
    expect(math.querySelector(expectedTags[structure])).not.toBeNull()
    expect(document.querySelectorAll("math")).toHaveLength(1)
    expect(math.contains(document.getSelection()!.anchorNode)).toBe(true)
    expect(document.getSelection()!.anchorNode?.textContent).toBe("")
    for(const element of Array.from(math.querySelectorAll("*"))) {
      expect(element.namespaceURI).toBe(MATH_NAMESPACE)
      if(mathArity[element.localName]) expect(element.children).toHaveLength(mathArity[element.localName])
    }
    expect(command("text:x")).toBe(true)
    expect(math.querySelector("mi")?.textContent).toBe("x")
    expect(document.querySelector("p")!.firstChild!.textContent).toBe("before")
    expect(document.querySelector("p")!.lastChild!.textContent).toBe("after")
  })

  it.each(["root", "sqrt"])("inserts %s with an optional editable index", structure => {
    const math = load("")
    expect(command(`structure:${structure}`)).toBe(true)
    const root = math.querySelector("mroot")!
    const [base, index] = Array.from(root.children)
    expect(command("text:x")).toBe(true)
    expect(base.textContent).toBe("x")
    expect(index.childNodes).toHaveLength(0)
    expect(clean()).toContain("<mroot><mrow><mi>x</mi></mrow><mrow></mrow></mroot>")
    $.move(index, 0)
    expect(command("text:3")).toBe(true)
    expect(index.textContent).toBe("3")
    expect(command("delete:backward")).toBe(true)
    expect(index.childNodes).toHaveLength(0)
    expect(root.firstElementChild).toBe(base)
    expect(clean()).not.toContain("◆")
  })

  it("rejects unknown insertion structures before changing the document", () => {
    document.body.innerHTML = "<p>unchanged</p>"
    $.move(document.querySelector("p")!.firstChild!, 3)
    expect(editor.features.math.actions.insertMath({type: "insertMath", structure: "unknown"})).toBe(false)
    expect(clean()).toBe("<p>unchanged</p>")
  })

  it("undoes a prefilled formula insertion as one operation", () => {
    document.body.innerHTML = "<p>beforeafter</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.math.actions.insertMath({type: "insertMath", structure: "frac"})
    editor.doc.syncFromDOM()
    const inserted = clean()
    editor.doc.undo()
    expect(clean()).toBe("<p>beforeafter</p>")
    editor.doc.redo()
    expect(clean()).toBe(inserted)
  })

  it("inserts inline MathML at a text caret and exposes formula state", () => {
    document.body.innerHTML = "<p>beforeafter</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)
    expect(editor.features.math.insert()).toBe(true)
    const math = document.querySelector("math")!
    expect(math.namespaceURI).toBe(MATH_NAMESPACE)
    expect(math.parentElement?.localName).toBe("p")
    expect(editor.features.math.getState()).toEqual({active: true, display: "inline"})
    expect(command("text:x")).toBe(true)
    expect(clean()).toBe("<p>before<math><mrow><mi>x</mi></mrow></math>after</p>")
    expect(editor.schema.isContentValid(document.querySelector("p")!)).toBe(true)
  })

  it("types tokens and transforms the operand into a fraction without rebuilding it", () => {
    const math = load('<mi id="operand" mathvariant="bold">x</mi><!-- keep --><mo>+</mo><mi>y</mi>')
    const operand = math.firstElementChild!
    $.move(operand.firstChild!, 1)
    expect(command("structure:frac")).toBe(true)
    expect(math.querySelector("mfrac")?.firstElementChild?.firstElementChild).toBe(operand)
    command("text:12")
    expect(math.querySelector("mfrac > mrow:last-child")?.textContent).toBe("12")
    expect(clean()).toContain('<!-- keep --><mo>+</mo><mi>y</mi>')
    expect(math.querySelector("#operand")?.getAttribute("mathvariant")).toBe("bold")
  })

  it("keeps fixed-arity slots valid when inserting beside an unwrapped argument", () => {
    const math = load('<mfrac><mi>x</mi><mn>2</mn></mfrac>')
    $.move(math.querySelector("mi")!.firstChild!, 1)
    command("text:+y")
    expect(math.firstElementChild?.children).toHaveLength(2)
    expect(clean()).toContain("<mfrac><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow><mn>2</mn></mfrac>")
  })

  it("wraps selected sibling expressions, including comments, by moving their nodes", () => {
    const math = load('<mi>x</mi><!-- keep --><mo>+</mo><mi>y</mi><mo>=</mo><mn>2</mn>')
    const nodes = Array.from(math.childNodes).slice(0, 4)
    document.getSelection()!.setBaseAndExtent(math, 0, math, 4)
    expect(command("structure:sqrt")).toBe(true)
    expect(Array.from(math.querySelector("mroot > mrow")!.childNodes)).toEqual(nodes)
    expect(math.querySelector("mroot")?.nextElementSibling?.textContent).toBe("=")
  })

  it.each(mathToolGroups.flatMap(group => group.options))("executes toolbox option $title ($command) as MathML", option => {
    const math = load("")
    expect(command(option.command)).toBe(true)
    for(const element of Array.from(math.querySelectorAll("*"))) {
      expect(element.namespaceURI).toBe(MATH_NAMESPACE)
      if(mathArity[element.localName]) expect(element.children).toHaveLength(mathArity[element.localName])
    }
  })

  it("handles physical keyboard shortcuts before generic document manipulation", () => {
    const math = load("")
    expect(key("x").defaultPrevented).toBe(true)
    key("^")
    key("2")
    expect(math.querySelector("msup")?.textContent).toBe("x2")
    key("Enter")
    expect(editor.features.math.getState()).toBeUndefined()
    expect(document.querySelectorAll("p")).toHaveLength(1)
    expect(document.querySelector("p")?.lastChild?.textContent).toBe(" after")
  })

  it.each(["^", "_"])("uses the preceding symbol as the base when typing %s", shortcut => {
    for(const input of ["keydown", "beforeinput"]) for(const token of ["mi", "mn", "mo"]) {
      const math = load(`<${token} id="base">${token === "mi" ? "x" : token === "mn" ? "12" : "∑"}</${token}><mi>z</mi>`)
      const base = math.firstElementChild!
      $.move(base.firstChild!, base.textContent!.length)
      if(input === "keydown") key(shortcut)
      else document.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: shortcut}))
      const script = math.querySelector(shortcut === "^" ? "msup" : "msub")!
      expect(script.firstElementChild!.firstElementChild).toBe(base)
      expect(document.getSelection()!.focusNode).toBe(script.lastElementChild)
      expect(math.lastElementChild!.textContent).toBe("z")
      key("2")
      expect(script.lastElementChild!.textContent).toBe("2")
      expect(base.id).toBe("base")
    }
  })

  it.each(["^", "_"])("keeps an empty base when typing %s without a preceding symbol", shortcut => {
    const math = load("<mi>x</mi>")
    $.move(math.firstElementChild!.firstChild!, 0)
    key(shortcut)
    const script = math.firstElementChild!
    expect(script.localName).toBe(shortcut === "^" ? "msup" : "msub")
    expect(script.textContent).toBe("")
    expect(document.getSelection()!.focusNode).toBe(script.firstElementChild)
    expect(math.lastElementChild!.textContent).toBe("x")
  })

  it.each(["Backquote", "IntlBackslash"])("handles the German circumflex dead key at %s without losing the exponent", code => {
    for(const isComposing of [false, true]) for(const character of ["a", "2", "â"]) {
      const math = load("<mi>x</mi>")
      $.move(math.firstElementChild!.firstChild!, 1)
      expect(key("Dead", {code, isComposing}).defaultPrevented).toBe(true)
      const script = math.querySelector("msup")!
      expect(script.firstElementChild!.textContent).toBe("x")
      expect(document.getSelection()!.focusNode).toBe(script.lastElementChild)
      expect(key(character, {isComposing: true}).defaultPrevented).toBe(true)
      expect(script.lastElementChild!.textContent).toBe(character === "â" ? "a" : character)
      key("b")
      expect(script.lastElementChild!.textContent).toBe(character === "2" ? "2b" : "ab")
    }
  })

  it("accepts a dead-key continuation delivered as composition input", () => {
    const math = load("<mi>x</mi>")
    $.move(math.firstElementChild!.firstChild!, 1)
    key("Dead", {code: "Backquote", isComposing: true})
    for(const data of ["^", "â"]) document.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true, cancelable: true, inputType: "insertCompositionText", isComposing: true, data,
    }))
    expect(math.querySelector("msup")!.lastElementChild!.textContent).toBe("a")
    expect(math.querySelectorAll("msup")).toHaveLength(1)
  })

  it.each(["^2", "â"])("isolates Chrome's non-cancelable dead-key composition %s from authored MathML", data => {
    const math = load("<mi>x</mi><mi>a</mi>")
    $.move(math.lastElementChild!.firstChild!, 1)
    key("Dead", {code: "IntlBackslash", keyCode: 229})
    const script = math.querySelector("msup")!
    document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, data: ""}))
    const input = editor.appendix.querySelector<HTMLTextAreaElement>('textarea[aria-label="Formula exponent input"]')!
    expect(input).not.toBeNull()
    expect(input.getRootNode()).toBe(editor.appendix)
    for(const value of ["^", data]) {
      input.dispatchEvent(new CompositionEvent("compositionupdate", {bubbles: true, data: value}))
      input.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, cancelable: false, inputType: "insertCompositionText", isComposing: true, data: value}))
      input.value = value // The native edit that cannot be prevented.
      input.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertCompositionText", isComposing: true, data: value}))
      expect(script.firstElementChild!.textContent).toBe("a")
      expect(script.lastElementChild!.childNodes).toHaveLength(0)
      expect(clean()).not.toContain("textarea")
    }
    input.dispatchEvent(Object.assign(new Event("compositionend", {bubbles: true}), {data}))
    expect(input.isConnected).toBe(false)
    expect(script.lastElementChild!.textContent).toBe(data === "^2" ? "2" : "a")
    expect(script.lastElementChild!.firstElementChild!.localName).toBe(data === "^2" ? "mn" : "mi")
    expect(script.lastElementChild!.contains(document.getSelection()!.focusNode)).toBe(true)
  })

  it("returns focus and the caret to the exponent start on dead-key release", () => {
    const math = load("<mi>x</mi>")
    $.move(math.firstElementChild!.firstChild!, 1)
    key("Dead", {code: "IntlBackslash", keyCode: 229})
    document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    const input = editor.appendix.querySelector<HTMLTextAreaElement>("textarea")!
    input.value = "^"
    document.getSelection()!.setBaseAndExtent(input, 0, input, 0)
    editor.features.selection.processSelection()
    expect(document.getSelection()!.focusNode).toBe(input)
    editor.features.math.refresh()
    const slot = math.querySelector("msup")!.lastElementChild!
    expect(slot.classList.contains("◆math-slot")).toBe(true)
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "Dead", code: "IntlBackslash", isComposing: true, bubbles: true}))
    expect(input.isConnected).toBe(false)
    expect(document.getSelection()!.focusNode).toBe(slot)
    expect(document.getSelection()!.focusOffset).toBe(0)
    key("2")
    expect(slot.textContent).toBe("2")
  })

  it("clears the hidden input and caret presentation when clicking away during composition", () => {
    const math = load("<mi>x</mi>")
    $.move(math.firstElementChild!.firstChild!, 1)
    key("Dead", {code: "IntlBackslash"})
    document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    const input = editor.appendix.querySelector("textarea")!
    const prose = document.createElement("p")
    prose.textContent = "outside"
    document.body.append(prose)
    editor.features.math.captureListeners.pointerdown!(new PointerEvent("pointerdown", {bubbles: true}))
    $.move(prose.firstChild!, 1)
    editor.features.math.refresh()
    expect(input.isConnected).toBe(false)
    expect(editor.features.math.isComposingPower).toBe(false)
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
    expect(math.querySelector(".◆math-slot")).toBeNull()
    expect(math.classList.contains("◆math-structural-caret")).toBe(false)
    input.dispatchEvent(Object.assign(new Event("compositionend", {bubbles: true}), {data: "^2"}))
    expect(document.getSelection()!.focusNode).toBe(prose.firstChild)
    expect(math.textContent).toBe("x")
  })

  it("cancels the dead-key composition target when the exponent is replaced", () => {
    const math = load("<mi>x</mi>")
    $.move(math.firstElementChild!.firstChild!, 1)
    key("Dead", {code: "IntlBackslash"})
    document.body.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    const input = editor.appendix.querySelector("textarea")!
    math.querySelector("msup")!.lastElementChild!.replaceWith(document.createElementNS(MATH_NAMESPACE, "mrow"))
    input.dispatchEvent(Object.assign(new Event("compositionend", {bubbles: true}), {data: "^2"}))
    expect(math.textContent).toBe("x")
    expect(input.isConnected).toBe(false)
  })

  it("does not treat unrelated composition or a moved selection as a power continuation", () => {
    const math = load("<mi>x</mi><mi>y</mi>")
    $.move(math.firstElementChild!.firstChild!, 1)
    expect(key("Dead", {code: "Quote", isComposing: true}).defaultPrevented).toBe(false)
    expect(math.querySelector("msup")).toBeNull()
    key("Dead", {code: "Backquote", isComposing: true})
    $.move(math.lastElementChild!.firstChild!, 1)
    expect(key("a", {isComposing: true}).defaultPrevented).toBe(false)
    expect(math.textContent).toBe("xy")
  })

  it("completes backslash commands without putting command UI in the authored DOM", () => {
    const math = load("")
    for(const character of "\\sqrt") key(character)
    expect(math.textContent).toBe("")
    expect(editor.appendix.querySelector(".◆math-overlay")?.textContent).toContain("sqrt")
    key(" ")
    expect(math.querySelector("mroot")).not.toBeNull()
    expect(clean()).not.toContain("Space to insert")
  })

  it("moves vertically between fraction arguments and extends a text selection", () => {
    const math = load('<mfrac><mi>abc</mi><mn>12</mn></mfrac>')
    $.move(math.querySelector("mi")!.firstChild!, 1)
    command("move:down")
    expect(math.querySelector("mn")?.contains(document.getSelection()!.focusNode)).toBe(true)
    $.move(math.querySelector("mi")!.firstChild!, 1)
    key("ArrowRight", {shiftKey: true})
    expect(document.getSelection()!.toString()).toBe("b")
    key("Delete")
    expect(math.querySelector("mi")?.textContent).toBe("ac")
  })

  it("leaves selections crossing formula arguments unchanged", () => {
    const math = load('<mfrac><mi>abc</mi><mn>12</mn></mfrac>')
    document.getSelection()!.setBaseAndExtent(math.querySelector("mi")!.firstChild!, 1, math.querySelector("mn")!.firstChild!, 1)
    const html = clean()
    expect(command("structure:frac")).toBe(false)
    expect(command("text:q")).toBe(false)
    expect(command("delete:backward")).toBe(false)
    expect(clean()).toBe(html)
  })

  it.each(["msup", "msub"])("unwraps %s on Backspace in its empty script", tag => {
    for(const empty of ["<mrow></mrow>", "<mrow><mrow></mrow></mrow>", "<mi></mi>"]) {
      const math = load(`<${tag}><mrow id="base"><mi>x</mi><!--keep--></mrow>${empty}</${tag}><mi>z</mi>`)
      const base = math.querySelector("#base")!
      const slot = math.firstElementChild!.lastElementChild!
      $.move(slot.firstElementChild ?? slot, 0)
      expect(key("Backspace").defaultPrevented).toBe(true)
      expect(math.querySelector(tag)).toBeNull()
      expect(math.firstElementChild).toBe(base)
      expect(base.innerHTML).toBe("<mi>x</mi><!--keep-->")
      expect(document.getSelection()!.focusNode).toBe(math)
      expect(document.getSelection()!.focusOffset).toBe(1)
      key("y")
      expect(math.textContent).toBe("xyz")
    }
  })

  it("unwraps an empty script inside a fixed-arity argument without removing the base", () => {
    const math = load("<mfrac><msup><mi id='base'>x</mi><mrow></mrow></msup><mi>y</mi></mfrac>")
    const base = math.querySelector("#base")!
    $.move(math.querySelector("mrow")!, 0)
    key("Backspace")
    expect(math.querySelector("msup")).toBeNull()
    expect(math.querySelector("mfrac")!.children).toHaveLength(2)
    expect(math.querySelector("mfrac")!.firstElementChild!.firstElementChild).toBe(base)
    key("2")
    expect(math.querySelector("mfrac")!.firstElementChild!.textContent).toBe("x2")
  })

  it("preserves nonempty scripts and other empty structure arguments on Backspace", () => {
    for(const content of ["<msup><mi>x</mi><mi>2</mi></msup>", "<mfrac><mi>x</mi><mrow></mrow></mfrac>"]) {
      const math = load(content)
      const structure = math.firstElementChild!
      const slot = structure.lastElementChild!
      $.move(slot.firstChild ?? slot, 0)
      key("Backspace")
      expect(structure.isConnected).toBe(true)
      expect(structure.children).toHaveLength(2)
    }
  })

  it("replaces a deleted fixed argument with an empty row", () => {
    const math = load('<mfrac><mi>x</mi><mn>2</mn></mfrac>')
    $.selectElement(math.querySelector("mi")!)
    command("delete:backward")
    expect(math.querySelector("mfrac")?.children).toHaveLength(2)
    expect(math.querySelector("mfrac")?.firstElementChild?.localName).toBe("mrow")
  })

  it("treats unfamiliar MathML and widgets as opaque and keeps their content intact", () => {
    const math = load('<semantics><mrow><mi>x</mi></mrow><annotation encoding="custom">source</annotation></semantics><mystery custom="keep"><mi>z</mi></mystery>')
    $.move(math.querySelector("annotation")!.firstChild!, 1)
    const html = clean()
    expect(command("text:q")).toBe(false)
    $.move(math.querySelector("mystery mi")!.firstChild!, 1)
    expect(command("structure:sup")).toBe(false)
    expect(clean()).toBe(html)
    const widget = document.createElement("test-widget")
    math.replaceWith(widget)
    widget.append(math)
    $.move(math.querySelector("mi")!.firstChild!, 1)
    expect(editor.features.math.getState()).toBeUndefined()
  })

  it("re-resolves the live selection after a direct replacement", () => {
    const math = load('<mi>x</mi>')
    $.move(math.firstElementChild!.firstChild!, 1)
    editor.features.math.refresh()
    math.remove()
    expect(command("text:q")).toBe(false)
    editor.features.math.refresh()
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
    expect(math.className).toBe("")
  })

  it("keeps markers out of serialization and collaboration and cleans them up", () => {
    const math = load('<mfrac><mrow></mrow><mrow></mrow></mfrac>')
    editor.features.math.refresh()
    expect(editor.appendix.querySelector(".◆math-overlay")).not.toBeNull()
    expect(document.body.querySelector(".◆math-overlay")).toBeNull()
    expect(editor.appendix.querySelector("slot")).not.toBeNull()
    expect(clean()).not.toContain("◆")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("◆math")
    editor.features.math.disable()
    expect(math.querySelector(".◆math-slot")).toBeNull()
    expect(math.classList.contains("◆math-editing")).toBe(false)
    expect(editor.appendix.querySelector(".◆math-overlay")).toBeNull()
  })

  it("does not retain an empty-slot marker on a formula after typing", () => {
    const math = load("")
    editor.features.math.refresh()
    command("display:block")
    command("text:x")
    expect(math.classList.contains("◆math-slot")).toBe(false)
    expect(math.getAttribute("display")).toBe("block")
    expect(editor.features.math.getState()).toEqual({active: true, display: "block"})
  })

  it("round-trips formula edits through undo and redo", () => {
    const math = load('<mi>x</mi>')
    $.move(math.firstChild!.firstChild!, 1)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    command("structure:frac")
    command("text:2")
    editor.doc.syncFromDOM()
    const edited = clean()
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    expect(key("z", {ctrlKey: true, metaKey: true}).defaultPrevented).toBe(true)
    expect(document.querySelector("math")?.textContent).toBe("x")
    expect(document.querySelector("mfrac")).toBeNull()
    editor.doc.redo()
    expect(clean()).toBe(edited)
  })

  it("validates formula presentation state at the bridge", () => {
    const message = {type: selectionChangeEvent, detail: {path: [], math: {active: true, display: "inline"}}}
    expect(isSelectionChangeMessage(message)).toBe(true)
    expect(isSelectionChangeMessage({...message, detail: {...message.detail, math: {active: true, display: "invalid"}}})).toBe(false)
  })

  it("wraps whole tokens selected by native text endpoints", () => {
    const math = load('<mi>x</mi><mo>+</mo><mi>y</mi>')
    const first = math.firstElementChild!, last = math.lastElementChild!
    document.getSelection()!.setBaseAndExtent(first.firstChild!, 0, last.firstChild!, 1)
    expect(command("structure:frac")).toBe(true)
    expect(math.querySelector("mfrac > mrow")?.firstElementChild).toBe(first)
    expect(math.querySelector("mfrac > mrow")?.lastElementChild).toBe(last)
  })

  it("leaves malformed structures unchanged when editing is not supported", () => {
    const math = load('<mfrac><mi>abc</mi></mfrac>')
    $.move(math.querySelector("mi")!.firstChild!, 1)
    const html = clean()
    expect(command("text:+")).toBe(false)
    expect(command("structure:sup")).toBe(false)
    expect(clean()).toBe(html)
  })

  it("moves to the next argument with Tab and to an exponent with ArrowUp", () => {
    const math = load('<mfrac><mi>abc</mi><mn>12</mn></mfrac><msup><mi>x</mi><mn>2</mn></msup>')
    $.move(math.querySelector("mi")!.firstChild!, 1)
    key("Tab")
    expect(math.querySelector("mfrac > mn")!.contains(document.getSelection()!.focusNode)).toBe(true)
    $.move(math.querySelector("msup > mi")!.firstChild!, 1)
    key("ArrowUp")
    expect(math.querySelector("msup > mn")!.contains(document.getSelection()!.focusNode)).toBe(true)
  })

  it.each(["mfrac", "mover", "munder", "munderover"])("leaves stacked %s arguments horizontally without visiting another level", tag => {
    const math = load(`<mi>a</mi><${tag}><mrow><mi>x</mi></mrow><!-- authored --><mrow><mi>y</mi></mrow>${tag === "munderover" ? "<mrow><mi>z</mi></mrow>" : ""}</${tag}><mi>b</mi>`)
    const structure = math.children[1]
    const original = clean()
    for(const argument of Array.from(structure.children)) {
      $.move(argument.querySelector("mi")!.firstChild!, 1)
      key("ArrowRight")
      expect($.focus).toBe(math)
      expect($.focusOffset).toBe(2)
      key("ArrowRight")
      expect($.focus).toBe(math.lastChild!.firstChild)
      $.move(argument.querySelector("mi")!.firstChild!, 0)
      key("ArrowLeft")
      expect($.focus).toBe(math.firstChild!.firstChild)
    }
    expect(clean()).toBe(original)
  })

  it("moves directly between paired scripts vertically and returns to the base horizontally", () => {
    const math = load('<msubsup><mi>x</mi><mi>i</mi><mi>n</mi></msubsup>')
    const [base, sub, sup] = Array.from(math.firstElementChild!.children)
    $.move(sub.firstChild!, 1)
    key("ArrowUp")
    expect(sup.contains($.focus)).toBe(true)
    key("ArrowDown")
    expect(sub.contains($.focus)).toBe(true)
    key("ArrowLeft")
    expect($.focus).toBe(base.firstChild)
    $.move(sub.firstChild!, 1)
    key("ArrowRight")
    expect($.focus).toBe(math)
    expect($.focusOffset).toBe(1)
  })

  it("navigates empty fraction slots without changing authored content", () => {
    const math = load('<mi>a</mi><mfrac><mrow></mrow><mrow></mrow></mfrac><mi>b</mi>')
    const [numerator, denominator] = Array.from(math.children[1].children)
    $.move(numerator, 0)
    const original = clean()
    key("ArrowDown")
    expect($.focus).toBe(denominator)
    key("ArrowUp")
    expect($.focus).toBe(numerator)
    key("ArrowRight")
    expect($.focus).toBe(math)
    expect($.focusOffset).toBe(2)
    expect(clean()).toBe(original)
  })

  it("moves through matrix columns horizontally and rows vertically", () => {
    const math = load('<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable>')
    const cells = math.querySelectorAll("mtd")
    $.move(cells[0].firstChild!.firstChild!, 1)
    key("ArrowRight")
    expect(cells[1].contains($.focus)).toBe(true)
    key("ArrowDown")
    expect(cells[3].contains($.focus)).toBe(true)
    key("ArrowUp")
    expect(cells[1].contains($.focus)).toBe(true)
    $.move(cells[1].firstChild!.firstChild!, 1)
    key("ArrowRight")
    expect($.focus).toBe(math)
    expect($.focusOffset).toBe(1)
  })

  it("visits a root index before its radicand horizontally", () => {
    const math = load('<mroot><mi>x</mi><mn>3</mn></mroot>')
    const root = math.firstElementChild!
    $.move(root.lastChild!.firstChild!, 1)
    key("ArrowRight")
    expect(root.firstChild!.contains($.focus)).toBe(true)
  })

  it("uses live nested arguments after a DOM replacement", () => {
    const math = load('<mfrac><mrow><msup><mi>x</mi><mi>n</mi></msup></mrow><mrow><mi>d</mi></mrow></mfrac><mi>z</mi>')
    const fraction = math.firstElementChild!
    const replacement = fraction.lastElementChild!.cloneNode(true) as Element
    replacement.firstChild!.textContent = "q"
    fraction.lastElementChild!.replaceWith(replacement)
    $.move(math.querySelector("msup > mi:last-child")!.firstChild!, 1)
    key("ArrowDown")
    key("ArrowDown")
    expect(replacement.contains($.focus)).toBe(true)
    $.move(replacement.firstChild!.firstChild!, 1)
    const original = clean()
    key("ArrowRight", {shiftKey: true})
    expect($.focus).toBe(math)
    expect($.focusOffset).toBe(1)
    expect(clean()).toBe(original)
  })

  it("moves across adjacent tokens without invisible duplicate caret stops", () => {
    const math = load('<mi>x</mi><mo>+</mo><mi>y</mi>')
    $.move(math.firstChild!.firstChild!, 1)
    key("ArrowRight")
    expect(document.getSelection()!.focusNode).toBe(math.querySelector("mo")!.firstChild)
    expect(document.getSelection()!.focusOffset).toBe(1)
    key("ArrowRight")
    expect(document.getSelection()!.focusNode).toBe(math.lastChild!.firstChild)
  })

  it.each(["<mi>x</mi>", "<mrow><mrow><mi>x</mi></mrow></mrow>", "<mstyle><mi>x</mi></mstyle>"])("reuses prose and the last token without duplicate formula stops: %s", content => {
    const math = load(content)
    const before = math.previousSibling as Text, after = math.nextSibling as Text
    const token = math.querySelector("mi")!.firstChild!
    const original = clean()
    $.move(before, before.length)
    key("ArrowRight")
    expect($.anchor).toBe(math)
    expect($.anchorOffset).toBe(0)
    key("ArrowRight")
    expect($.anchor).toBe(token)
    expect($.anchorOffset).toBe(1)
    key("ArrowRight")
    expect($.anchor).toBe(after)
    expect($.anchorOffset).toBe(0)
    key("ArrowLeft")
    expect($.anchor).toBe(token)
    expect($.anchorOffset).toBe(1)
    key("ArrowLeft")
    expect($.anchor).toBe(math)
    expect($.anchorOffset).toBe(0)
    key("ArrowLeft")
    expect($.anchor).toBe(before)
    expect($.anchorOffset).toBe(before.length)
    expect(clean()).toBe(original)
  })

  it("uses the current neighboring text after a concurrent replacement", () => {
    const math = load("<mi>x</mi>")
    $.move(math.querySelector("mi")!.firstChild!, 1)
    const replacement = document.createTextNode("replacement")
    math.nextSibling!.replaceWith(replacement)
    key("ArrowRight")
    expect($.anchor).toBe(replacement)
    expect($.anchorOffset).toBe(0)
  })

  it("reuses neighboring prose across authored comments", () => {
    const math = load("<mi>x</mi>")
    const before = math.previousSibling as Text, after = math.nextSibling!
    math.before(document.createComment("before formula"))
    math.after(document.createComment("after formula"))
    const original = clean()
    $.move(before, before.length)
    key("ArrowRight")
    expect($.anchor).toBe(math)
    key("End")
    key("ArrowRight")
    expect($.anchor).toBe(after)
    expect($.anchorOffset).toBe(0)
    expect(clean()).toBe(original)
  })

  it("copies MathML without editing artifacts and cuts without breaking arguments", () => {
    const math = load('<mfrac><mi>x</mi><mn>2</mn></mfrac>')
    $.selectElement(math.querySelector("mi")!)
    const data = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent("cut", {bubbles: true, cancelable: true, clipboardData: data}))
    expect(data.getData("text/html")).toBe('<math><mi>x</mi></math>')
    expect(data.getData("text/plain")).toBe("x")
    expect(math.querySelector("mfrac")!.children).toHaveLength(2)
    expect(math.querySelector("mfrac")!.firstElementChild!.localName).toBe("mrow")
  })

  it("accepts beforeinput text and plain clipboard input as token nodes", () => {
    const math = load("")
    const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "ab+12"})
    document.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(true)
    expect(clean()).toContain('<math><mi>a</mi><mi>b</mi><mo>+</mo><mn>12</mn></math>')
    const data = new DataTransfer()
    data.setData("text/plain", "=5")
    document.dispatchEvent(new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData: data}))
    expect(math.textContent).toBe("ab+12=5")
    expect(math.querySelector("div,span")).toBeNull()
  })

  it("selects formula contents with Ctrl+A and preserves neighboring prose on deletion", () => {
    const math = load('<mi>x</mi><mo>+</mo><mi>y</mi>')
    key("a", {ctrlKey: true})
    key("Backspace", {ctrlKey: true})
    expect(math.children).toHaveLength(0)
    expect(document.querySelector("p")!.textContent).toBe("Before  after")
  })

  it("edits a remotely replaced formula using the current DOM and shared namespace", () => {
    const math = load('<mi>x</mi>')
    $.move(math.firstChild!.firstChild!, 1)
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const paragraph = remote.getXmlElement("body").get(0) as Y.XmlElement
      const sharedMath = paragraph.get(1) as Y.XmlElement
      const token = sharedMath.get(0) as Y.XmlElement
      remote.transact(() => {
        const text = token.get(0) as Y.XmlText
        text.delete(0, text.length)
        text.insert(0, "remote")
        token.setAttribute("mathvariant", "normal")
      })
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client")
      const current = document.querySelector("math mi")!
      expect(current.namespaceURI).toBe(MATH_NAMESPACE)
      expect(current.textContent).toBe("remote")
      $.move(current.firstChild!, current.textContent!.length)
      command("structure:sup")
      command("text:2")
      expect(document.querySelector("msup mi")).toBe(current)
      expect(current.getAttribute("mathvariant")).toBe("normal")
      editor.doc.syncFromDOM()
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      expect(remote.getXmlElement("body").toString()).toContain("msup")
      expect(remote.getXmlElement("body").toString()).not.toContain("◆math")
    }
    finally { remote.destroy() }
  })
})
