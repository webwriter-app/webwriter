// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {floatSideFromStyles} from "../element-styles"
import * as Y from "yjs"
import {sharedDOMBody} from "../domdoc"

let editor: DOMEditor
let floatStylesheet: HTMLStyleElement
beforeEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.removeAttribute("style")
  floatStylesheet = document.createElement("style")
  floatStylesheet.textContent = ".ww-float-left { float: left !important } .ww-float-right { float: right !important } .ww-float-none { float: none !important }"
  document.head.append(floatStylesheet)
  editor = new DOMEditor()
  document.body.innerHTML = '<section lang="de"><p style="color:red">Text</p><!--keep--><custom-card data-authored="yes"></custom-card></section>'
})
afterEach(() => { editor.destroy(); floatStylesheet.remove(); vi.restoreAllMocks() })

const setFloat = (side: "far-left" | "none" | "far-right" | "left" | "right") => editor.features.layout.actions.setFloat({type: "setFloat", side})

describe("document floats", () => {
  it("floats and moves the top-level container from an inner text selection", () => {
    document.body.innerHTML = '<div><p>inner</p></div><p>next</p>'
    const container = document.body.firstElementChild!
    const text = container.querySelector("p")!.firstChild!
    $.move(text, 2)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "far-right", topLevel: true})).toBe(true)
    expect(container.classList.contains("ww-float-right")).toBe(true)
    expect(container.firstElementChild!.classList.contains("ww-float-right")).toBe(false)
    expect(editor.features.layout.actions.moveFloat({type: "moveFloat", direction: "down", topLevel: true})).toBe(true)
    expect(document.body.lastElementChild).toBe(container)
    expect($.anchor).toBe(text)
  })

  it("rejects placement commands at a top-level gap", () => {
    $.selectGap(document.body.firstElementChild!, "before")
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "far-right", topLevel: true})).toBe(false)
    expect(editor.features.layout.actions.moveFloat({type: "moveFloat", direction: "down", topLevel: true})).toBe(false)
  })

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

  it.each(["far-left", "far-right"] as const)("uses a placement class for %s and preserves authored styles", side => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    expect(setFloat(side)).toBe(true)
    expect(paragraph.classList.contains(side === "far-left" ? "ww-float-left" : "ww-float-right")).toBe(true)
    expect(paragraph.style.float).toBe("")
    expect(paragraph.style.width).toBe("")
    expect(paragraph.style.maxWidth).toBe("")
    expect(paragraph.style.margin).toBe("")
    for(const property of ["--ww-float-size", "--ww-float-outset", "--ww-float-spacing"]) expect(paragraph.style.getPropertyValue(property)).toBe("")
    expect(setFloat("none")).toBe(true)
    expect(paragraph.classList.contains("ww-float-left")).toBe(false)
    expect(paragraph.classList.contains("ww-float-right")).toBe(false)
    expect(paragraph.classList.contains("ww-float-none")).toBe(false)
    paragraph.style.margin = "12px"
    setFloat("none")
    expect(paragraph.style.margin).toBe("12px")
  })

  it("switches placement classes and removes float classes on a normal-flow drop", () => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    setFloat("far-left")
    setFloat("far-right")
    expect(paragraph.classList.contains("ww-float-right")).toBe(true)
    setFloat("far-left")
    expect(paragraph.classList.contains("ww-float-left")).toBe(true)
    editor.features.manipulation.clearDropFloat(paragraph)
    expect(paragraph.classList.contains("ww-float-left")).toBe(false)
    expect(paragraph.classList.contains("ww-float-right")).toBe(false)
    expect(paragraph.style.float).toBe("")
    expect(paragraph.style.color).toBe("red")
  })

  it("clears legacy float formulas while preserving authored width, color, and classes", () => {
    const paragraph = document.querySelector<HTMLElement>("p")!
    paragraph.classList.add("authored-class", "ww-float-left")
    paragraph.style.cssText = "float: left; width: 42%; max-width: 30rem; margin: 5px var(--ww-float-spacing) 5px var(--ww-float-outset); --ww-float-size: 12rem; --ww-float-outset: calc(0px - var(--ww-lane)); --ww-float-spacing: calc(var(--ww-lane) - var(--ww-float-size)); color: red"
    $.selectElement(paragraph)
    expect(setFloat("none")).toBe(true)
    expect(paragraph.classList.contains("ww-float-left")).toBe(false)
    expect(paragraph.classList.contains("ww-float-none")).toBe(false)
    expect(paragraph.classList.contains("authored-class")).toBe(true)
    expect(paragraph.style.float).toBe("")
    expect(paragraph.style.width).toBe("42%")
    expect(paragraph.style.maxWidth).toBe("30rem")
    expect(paragraph.style.margin).toBe("")
    expect(paragraph.style.color).toBe("red")
    for(const property of ["--ww-float-size", "--ww-float-outset", "--ww-float-spacing"]) expect(paragraph.style.getPropertyValue(property)).toBe("")
  })

  it.each(["left", "right", "none"] as const)("sets %s on the live block without rebuilding its surroundings", side => {
    const paragraph = document.querySelector("p")!
    const nodes = Array.from(paragraph.parentNode!.childNodes)
    paragraph.style.float = "left"
    $.move(paragraph.firstChild!, 2)
    expect(setFloat(side)).toBe(true)
    expect(side === "none"
      ? paragraph.classList.contains("ww-float-left") || paragraph.classList.contains("ww-float-right")
      : paragraph.classList.contains(`ww-float-${side}`)).toBe(side !== "none")
    expect(paragraph.style.float).toBe("")
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
    expect(floatSideFromStyles(getComputedStyle(paragraph).float, paragraph.style, paragraph.classList)).toBe(expected)
    expect(paragraph.style.getPropertyValue("--ww-float-outset")).toBe("")
  })

  it("reads class placement and exposes the authored placement in style state", () => {
    const paragraph = document.querySelector<HTMLElement>("p")!
    paragraph.classList.add("ww-float-right")
    expect(floatSideFromStyles("none", paragraph.style, paragraph.classList)).toBe("far-right")
    $.selectElement(paragraph)
    expect(editor.features.manipulation.getStyleState(["float"], paragraph).target?.float).toBe("far-right")
    paragraph.classList.replace("ww-float-right", "ww-float-left")
    expect(floatSideFromStyles("none", paragraph.style, paragraph.classList)).toBe("far-left")
    expect(editor.features.manipulation.getStyleState(["float"], paragraph).target?.float).toBe("far-left")
    paragraph.classList.add("ww-float-right")
    expect(floatSideFromStyles("none", paragraph.style, paragraph.classList)).toBe("far-right")
    paragraph.classList.add("ww-float-none")
    expect(floatSideFromStyles("none", paragraph.style, paragraph.classList)).toBe("none")
  })

  it("floats a captured custom element without touching its contents or selection", () => {
    const widget = document.querySelector("custom-card")!
    widget.innerHTML = '<div style="display:grid"><span>Private content</span></div>'
    const contents = widget.innerHTML
    editor.features.selection.captureElement(widget)
    expect(setFloat("far-right")).toBe(true)
    expect(widget.classList.contains("ww-float-right")).toBe(true)
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
    expect(floated).toContain("ww-float-right")
    expect(floated).not.toContain("◆")
    expect(floated).not.toContain("ww-column")
    expect(cloneWithoutEditorMarkers(paragraph, true).classList.contains("ww-float-right")).toBe(true)
    editor.doc.undo()
    expect(document.querySelector<HTMLElement>("p")!.classList.contains("ww-float-right")).toBe(false)
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
      paragraph.setAttribute("class", "ww-float-right")
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      const live = document.querySelector<HTMLElement>("p")!
      expect(live.classList.contains("ww-float-right")).toBe(true)
      $.selectElement(live)
      expect(setFloat("none")).toBe(true)
      expect(live.classList.contains("ww-float-right")).toBe(false)
      expect(live.classList.contains("ww-float-none")).toBe(false)
      expect(live.style.color).toBe("red")
      expect(document.querySelector("custom-card")!.getAttribute("data-authored")).toBe("yes")
    }
    finally { remote.destroy() }
  })

  it("clears legacy inline floats and preserves authored declarations when switching sides", () => {
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
      expect(paragraph.style.float).toBe("")
      expect(paragraph.classList.contains("ww-float-right")).toBe(true)
    }
    finally { stylesheet.remove() }
  })

  it("preserves authored media width constraints while floating", () => {
    const image = document.createElement("picture")
    image.append(document.createElement("img"))
    image.style.width = "100%"
    image.style.maxWidth = "30rem"
    document.querySelector("section")!.prepend(image)
    $.selectElement(image)
    expect(setFloat("far-right")).toBe(true)
    expect(image.style.width).toBe("100%")
    expect(image.style.maxWidth).toBe("30rem")
    expect(setFloat("far-left")).toBe(true)
    expect(image.style.maxWidth).toBe("30rem")
    expect(setFloat("none")).toBe(true)
    expect(image.style.maxWidth).toBe("30rem")
    image.style.removeProperty("max-width")
    setFloat("far-right")
    expect(image.style.maxWidth).toBe("")
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
