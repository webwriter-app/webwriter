// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {floatSideFromStyles} from "../element-styles"
import * as Y from "yjs"
import {sharedDOMBody} from "../domdoc"

let editor: DOMEditor
beforeEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.removeAttribute("style")
  editor = new DOMEditor()
  document.body.innerHTML = '<section lang="de"><p style="color:red">Text</p><!--keep--><custom-card data-authored="yes"></custom-card></section>'
})
afterEach(() => { editor.destroy(); vi.restoreAllMocks() })

const setFloat = (side: "far-left" | "none" | "far-right" | "left" | "right") => editor.features.layout.actions.setFloat({type: "setFloat", side})

describe("document floats", () => {
  it.each(["p", "custom-card"])("moves a floated %s across adjacent elements while preserving its content and selection", tag => {
    document.body.innerHTML = `<section><p>first</p><!--keep--><${tag} style="float:right;width:140px;color:red">floating text</${tag}><p>last</p></section>`
    const parent = document.querySelector("section")!, element = parent.children[1] as HTMLElement
    const comment = parent.childNodes[1], text = element.firstChild!, style = element.getAttribute("style")
    if(tag === "custom-card") editor.features.selection.captureElement(element)
    else $.move(text, 4)
    expect(editor.features.layout.actions.moveFloat({type:"moveFloat", direction:"up"})).toBe(true)
    expect(parent.firstElementChild).toBe(element)
    expect(element.getAttribute("style")).toBe(style)
    expect(parent.childNodes).toContain(comment)
    if(tag === "custom-card") expect(editor.features.selection.captureSelectedElement).toBe(element)
    else { expect($.anchor).toBe(text); expect($.anchorOffset).toBe(4) }
    expect(editor.features.layout.actions.moveFloat({type:"moveFloat", direction:"down"})).toBe(true)
    expect(parent.children[1]).toBe(element)
    expect(element.firstChild).toBe(text)
    expect(element.getAttribute("style")).toBe(style)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("keeps moves within the current parent and rejects nonfloated and locked targets", () => {
    const element = document.querySelector("p")!
    $.selectElement(element)
    expect(editor.features.layout.moveFloat("down")).toBe(false)
    setFloat("left")
    expect(editor.features.layout.moveFloat("up")).toBe(false)
    expect(editor.features.layout.moveFloat("down")).toBe(true)
    expect(editor.features.layout.moveFloat("down")).toBe(false)
    const locked = vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    expect(editor.features.layout.moveFloat("up")).toBe(false)
    locked.mockRestore()
    expect(element.parentElement).toBe(document.querySelector("section"))
  })

  it("moves an authored float when responsive CSS stacks it, and supports undo and redo", () => {
    const element = document.querySelector("p")!
    $.selectElement(element)
    setFloat("right")
    // A stylesheet can override the authored side on a narrow page.
    const computed = getComputedStyle.bind(globalThis)
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((node, pseudo) => node === element
      ? new Proxy(computed(node, pseudo), {get: (style, key) => {
        const value = key === "float" ? "none" : Reflect.get(style, key)
        return typeof value === "function" ? value.bind(style) : value
      }}) : computed(node, pseudo))
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    expect(editor.features.layout.moveFloat("down")).toBe(true)
    editor.doc.syncFromDOM()
    expect(document.querySelector("section")!.lastElementChild?.localName).toBe("p")
    editor.doc.undo()
    expect(document.querySelector("section")!.firstElementChild?.localName).toBe("p")
    editor.doc.redo()
    expect(document.querySelector("section")!.lastElementChild?.localName).toBe("p")
  })

  it.each(["far-left", "far-right"] as const)("adds lane-aware spacing with a flush outer edge for %s floats and clears it with the float", side => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    expect(setFloat(side)).toBe(true)
    const physicalSide = side === "far-left" ? "left" : "right"
    expect(paragraph.style.width).toBe("var(--ww-float-width)")
    expect(paragraph.style.marginTop).toBe("5px")
    expect(paragraph.style.marginBottom).toBe("5px")
    expect(paragraph.style.marginLeft).toBe(physicalSide === "left" ? "var(--ww-float-outset)" : "var(--ww-float-spacing)")
    expect(paragraph.style.marginRight).toBe(physicalSide === "right" ? "var(--ww-float-outset)" : "var(--ww-float-spacing)")
    expect(paragraph.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), var(--ww-float-width))")
    expect(paragraph.style.getPropertyValue("--ww-float-outset")).toBe("calc(0px - var(--ww-lane, 0px))")
    expect(paragraph.style.getPropertyValue("--ww-float-spacing")).toBe("calc(var(--ww-lane, 0px) - var(--ww-float-size))")
    expect(setFloat("none")).toBe(true)
    expect(paragraph.style.margin).toBe("")
    expect(paragraph.style.marginLeft).toBe("")
    expect(paragraph.style.marginRight).toBe("")
    expect(paragraph.style.width).toBe("")
    for(const property of ["--ww-float-size", "--ww-float-outset", "--ww-float-spacing"]) expect(paragraph.style.getPropertyValue(property)).toBe("")
    paragraph.style.margin = "12px"
    setFloat("none")
    expect(paragraph.style.margin).toBe("12px")
  })

  it("switches far sides and removes lane-aware margins on a normal-flow drop", () => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    setFloat("far-left")
    setFloat("far-right")
    expect(paragraph.style.marginLeft).toBe("var(--ww-float-spacing)")
    expect(paragraph.style.marginRight).toBe("var(--ww-float-outset)")
    setFloat("far-left")
    expect(paragraph.style.marginLeft).toBe("var(--ww-float-outset)")
    expect(paragraph.style.marginRight).toBe("var(--ww-float-spacing)")
    editor.features.manipulation.clearDropFloat(paragraph)
    expect(paragraph.style.margin).toBe("")
    expect(paragraph.style.marginLeft).toBe("")
    expect(paragraph.style.marginRight).toBe("")
    expect(paragraph.style.float).toBe("")
    expect(paragraph.style.color).toBe("red")
  })

  it.each(["left", "right", "none"] as const)("sets %s on the live block without rebuilding its surroundings", side => {
    const paragraph = document.querySelector("p")!
    const nodes = Array.from(paragraph.parentNode!.childNodes)
    paragraph.style.float = "left"
    $.move(paragraph.firstChild!, 2)
    expect(setFloat(side)).toBe(true)
    expect(paragraph.style.float).toBe(side === "none" ? "" : side === "left" ? "left" : "right")
    expect(paragraph.style.color).toBe("red")
    expect(Array.from(paragraph.parentNode!.childNodes)).toEqual(nodes)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(2)
    expect(document.querySelector(".ww-column-group")).toBeNull()
  })

  it.each([["left", "far-left"], ["right", "far-right"]] as const)("treats legacy %s as %s", (legacy, expected) => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    expect(setFloat(legacy)).toBe(true)
    expect(floatSideFromStyles(paragraph.style.float, paragraph.style)).toBe(expected)
    expect(paragraph.style.getPropertyValue("--ww-float-outset")).toBe("calc(0px - var(--ww-lane, 0px))")
  })

  it("floats a captured custom element without touching its contents or selection", () => {
    const widget = document.querySelector("custom-card")!
    widget.innerHTML = '<div style="display:grid"><span>Private content</span></div>'
    const contents = widget.innerHTML
    editor.features.selection.captureElement(widget)
    expect(setFloat("far-right")).toBe(true)
    expect((widget as HTMLElement).style.float).toBe("right")
    expect(widget.innerHTML).toBe(contents)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
  })

  it("does not target widget internals, a disconnected selection or the document", () => {
    const widget = document.querySelector("custom-card")!
    const child = widget.appendChild(document.createElement("p"))
    expect(editor.features.manipulation.setFloat(child, "left")).toBe(false)
    const paragraph = document.querySelector("section > p")!
    $.selectElement(paragraph)
    paragraph.remove()
    expect(setFloat("far-left")).toBe(false)
    expect(editor.features.manipulation.setFloat(document.body, "right")).toBe(false)
    expect(document.body.style.float).toBe("")
  })

  it.each(["canvas", "slides"] as const)("withholds floats in %s", mode => {
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = document.querySelector("custom-card")!
    $.selectElement(target)
    const before = target.getAttribute("style")
    expect(setFloat("far-left")).toBe(false)
    expect(target.getAttribute("style")).toBe(before)
    expect(editor.features.manipulation.floatContainer(document.querySelector("p")!, target)).toBeNull()
  })

  it("undoes and redoes the float and serializes native CSS without editing artifacts", () => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectElement(document.querySelector("p")!)
    expect(setFloat("far-right")).toBe(true)
    editor.doc.syncFromDOM()
    const floated = editor.toHTML(true)
    expect(floated).toContain("float: right")
    expect(floated).not.toContain("◆")
    expect(floated).not.toContain("ww-column")
    expect(cloneWithoutEditorMarkers(paragraph, true).getAttribute("style")).toContain("float: right")
    editor.doc.undo()
    expect(document.querySelector<HTMLElement>("p")!.style.float).toBe("")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(floated)
  })

  it("clears the current remotely authored float without changing adjacent content", () => {
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const section = sharedDOMBody(remote).get(0) as Y.XmlElement
      const paragraph = section.get(0) as Y.XmlElement
      paragraph.setAttribute("style", "color: red; float: right")
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      const live = document.querySelector<HTMLElement>("p")!
      expect(live.style.float).toBe("right")
      $.selectElement(live)
      expect(setFloat("none")).toBe(true)
      expect(live.style.float).toBe("")
      expect(live.style.color).toBe("red")
      expect(document.querySelector("custom-card")!.getAttribute("data-authored")).toBe("yes")
    }
    finally { remote.destroy() }
  })

  it("clears stylesheet floats and preserves an authored important priority when switching sides", () => {
    const stylesheet = document.createElement("style")
    stylesheet.textContent = "p {float: right !important}"
    document.head.append(stylesheet)
    try {
      const paragraph = document.querySelector("p")!
      $.selectElement(paragraph)
      expect(setFloat("none")).toBe(true)
      expect(getComputedStyle(paragraph).float).toBe("none")
      paragraph.style.setProperty("float", "left", "important")
      expect(setFloat("far-right")).toBe(true)
      expect(paragraph.style.float).toBe("right")
      expect(paragraph.style.getPropertyPriority("float")).toBe("important")
    }
    finally { stylesheet.remove() }
  })

  it("caps floated media at half the containing width and restores authored limits when clearing", () => {
    const image = document.createElement("picture")
    image.append(document.createElement("img"))
    image.style.width = "100%"
    image.style.maxWidth = "30rem"
    document.querySelector("section")!.prepend(image)
    $.selectElement(image)
    expect(setFloat("far-right")).toBe(true)
    expect(image.style.width).toBe("100%")
    expect(image.style.maxWidth).toBe("min(var(--ww-float-width), 30rem)")
    expect(setFloat("far-left")).toBe(true)
    expect(image.style.maxWidth).toBe("min(var(--ww-float-width), 30rem)")
    expect(setFloat("none")).toBe(true)
    expect(image.style.maxWidth).toBe("30rem")
    image.style.removeProperty("max-width")
    setFloat("far-right")
    expect(image.style.maxWidth).toBe("var(--ww-float-width)")
    setFloat("none")
    expect(image.style.maxWidth).toBe("")
  })

  it("does not expose former column, flex or grid commands or selection controls", () => {
    expect(Object.keys(editor.features.layout.actions)).toEqual(["setFloat", "moveFloat"])
    document.querySelector<HTMLElement>("section")!.style.display = "grid"
    $.selectElement(document.querySelector("section")!)
    editor.features.layout.refresh()
    expect(editor.features.layout.getState()).toBeNull()
    expect(editor.appendix.querySelector('[part="layout-overlay"]')).toBeNull()
    expect(document.querySelector(".◆layout-selected")).toBeNull()
  })
})
