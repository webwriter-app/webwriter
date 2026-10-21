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
  // Left/right use CSS math unsupported by Happy DOM; native-browser.ts checks
  // their rendered alignment and exported HTML at each document breakpoint.
  it("clears floating and centers the live top-level widget without changing its structure", () => {
    const alignment = "center"
    document.body.innerHTML = '<!--before--><custom-card class="authored ww-float-right" style="width: 12rem; margin: 7px; margin-inline: 4px 9px; color: red"><unfamiliar-node>keep</unfamiliar-node><!--inside--></custom-card><!--after--><p>next</p>'
    const target = document.querySelector<HTMLElement>("custom-card")!
    const children = Array.from(target.childNodes), siblings = Array.from(document.body.childNodes)
    editor.features.selection.captureElement(target)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "none", alignment, topLevel: true})).toBe(true)
    expect(target.style.marginLeft).toBe("auto")
    expect(target.style.marginRight).toBe("auto")
    expect(target.style.getPropertyValue("margin-inline")).toBe("")
    expect(target.style.marginTop).toBe("7px")
    expect(target.style.marginBottom).toBe("7px")
    expect(target.style.width).toBe("12rem")
    expect(target.style.color).toBe("red")
    expect(target.classList.contains("ww-float-right")).toBe(false)
    expect(target.classList.contains("authored")).toBe(true)
    expect(Array.from(target.childNodes)).toEqual(children)
    expect(Array.from(document.body.childNodes)).toEqual(siblings)
    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(editor.features.manipulation.getStyleState([], target, false).target?.alignment).toBe(alignment)
  })

  it("synchronizes and serializes alignment with float removal and restores both through undo and redo", () => {
    const target = document.querySelector<HTMLElement>("p")!
    target.classList.add("ww-float-right")
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    $.move(target.firstChild!, 2)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "none", alignment: "center"})).toBe(true)
    editor.doc.syncFromDOM()
    const after = editor.toHTML(true)
    expect(after).toContain("margin-left: auto")
    expect(after).toContain("margin-right: auto")
    expect(after).not.toContain("◆")
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const paragraph = (sharedDOMBody(remote).get(0) as Y.XmlElement).get(0) as Y.XmlElement
      expect(paragraph.getAttribute("style")).toContain("margin-left: auto")
      expect(paragraph.getAttribute("class")).toBeUndefined()
    }
    finally { remote.destroy() }
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it("rejects alignment when the selected endpoint was removed or the command is invalid", () => {
    const target = document.querySelector("p")!
    $.move(target.firstChild!, 2)
    target.remove()
    const before = editor.toHTML(true)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "none", alignment: "left"})).toBe(false)
    expect(editor.features.manipulation.setFloat(document.querySelector("custom-card")!, "far-right", "left")).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
  })

  it.each(["far-left", "far-right"] as const)("adds an unfloated paragraph beside a lone element placed %s", side => {
    document.body.innerHTML = '<!--before-->\n<custom-card title="Keep"><unfamiliar-node>content</unfamiliar-node></custom-card>\n<!--after-->'
    const element = document.querySelector("custom-card")!
    const nodes = Array.from(document.body.childNodes), contents = element.innerHTML
    editor.features.selection.captureElement(element)
    expect(setFloat(side)).toBe(true)
    const paragraph = document.body.lastElementChild!
    expect(paragraph.outerHTML).toBe("<p></p>")
    expect(getComputedStyle(paragraph).float || "none").toBe("none")
    expect(Array.from(document.body.childNodes).slice(0, -1)).toEqual(nodes)
    expect(element.innerHTML).toBe(contents)
    expect(editor.features.selection.captureSelectedElement).toBe(element)
    expect(setFloat(side === "far-left" ? "far-right" : "far-left")).toBe(true)
    expect(setFloat("none")).toBe(true)
    expect(document.body.children.length).toBe(2)
    expect(document.body.lastElementChild).toBe(paragraph)
  })

  it("adds a paragraph when floating the sole top-level container and preserves the inner caret", () => {
    document.body.innerHTML = '<section><p>text</p></section>'
    const container = document.querySelector("section")!, text = container.querySelector("p")!.firstChild!
    $.move(text, 2)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side: "far-left", topLevel: true})).toBe(true)
    expect(container.classList.contains("ww-float-left")).toBe(true)
    expect(container.nextElementSibling?.outerHTML).toBe("<p></p>")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(2)
  })

  it("synchronizes, serializes, undoes and redoes the lone element's float and new paragraph together", () => {
    document.body.innerHTML = '<p lang="de">Text</p>'
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    $.move(document.querySelector("p")!.firstChild!, 2)
    expect(setFloat("far-right")).toBe(true)
    editor.doc.syncFromDOM()
    const floated = editor.toHTML(true)
    expect(floated).toBe('<p lang="de" class="ww-float-right">Text</p><p></p>')
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      expect(sharedDOMBody(remote).length).toBe(2)
      expect((sharedDOMBody(remote).get(1) as Y.XmlElement).nodeName).toBe("p")
    }
    finally { remote.destroy() }
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe('<p lang="de">Text</p>')
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(floated)
  })

  it("keeps a sole element alone when clearing placement", () => {
    document.body.innerHTML = '<p class="ww-float-left">Text</p>'
    $.move(document.querySelector("p")!.firstChild!, 2)
    expect(setFloat("none")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p>Text</p>")
  })

  it("clears a stylesheet float on the added paragraph", () => {
    floatStylesheet.textContent += " p {float: right}"
    document.body.innerHTML = "<custom-card></custom-card>"
    $.selectElement(document.querySelector("custom-card")!)
    expect(setFloat("far-left")).toBe(true)
    const paragraph = document.querySelector("p")!
    expect(paragraph.classList.contains("ww-float-none")).toBe(true)
    expect(getComputedStyle(paragraph).float).toBe("none")
  })

  it("does not add a paragraph outside a sole nested float", () => {
    document.body.innerHTML = "<section><p>Text</p></section>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    expect(setFloat("far-left")).toBe(true)
    expect(document.body.children.length).toBe(1)
    expect(document.querySelector("section")!.children.length).toBe(1)
  })

  it.each(["none", "far-right"] as const)("moves the %s top-level container from an inner text selection", side => {
    document.body.innerHTML = '<div><p>inner</p></div><p>next</p>'
    const container = document.body.firstElementChild!
    const text = container.querySelector("p")!.firstChild!
    $.move(text, 2)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side, topLevel: true})).toBe(true)
    expect(container.classList.contains("ww-float-right")).toBe(side === "far-right")
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

  it.each(["p", "custom-card"].flatMap(tag => ["none", "right"].map(float => ({tag, float}))))("moves a $tag with float $float across adjacent elements while preserving its content and selection", ({tag, float}) => {
    document.body.innerHTML = `<section><p>first</p><!--keep--><${tag} style="float:${float};width:140px;color:red">moving text</${tag}><p>last</p></section>`
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

  it("keeps normal-flow moves within the current parent and rejects locked targets", () => {
    const element = document.querySelector("p")!
    $.selectElement(element)
    expect(editor.features.layout.moveFloat("up")).toBe(false)
    expect(editor.features.layout.moveFloat("down")).toBe(true)
    expect(editor.features.layout.moveFloat("down")).toBe(false)
    const locked = vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    expect(editor.features.layout.moveFloat("up")).toBe(false)
    locked.mockRestore()
    expect(element.parentElement).toBe(document.querySelector("section"))
  })

  it.each(["none", "far-right"] as const)("projects current swap availability for a captured widget placed %s", side => {
    document.body.innerHTML = '<!--before-->\n<custom-card>selected</custom-card><!--between--><p>next</p>\n<!--after-->'
    const selected = document.querySelector("custom-card")!, next = document.querySelector("p")!
    editor.features.selection.captureElement(selected)
    setFloat(side)
    const state = () => editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true}).target
    expect(state()).toMatchObject({canMoveUp: false, canMoveDown: true})
    expect(editor.features.layout.moveFloat("down", true)).toBe(true)
    expect(state()).toMatchObject({canMoveUp: true, canMoveDown: false})
    next.remove()
    expect(state()).toMatchObject({canMoveUp: false, canMoveDown: false})
    selected.before(next)
    const added = document.createElement("p")
    selected.after(added)
    expect(state()).toMatchObject({canMoveUp: true, canMoveDown: true})
    expect(editor.features.manipulation.getStyleState([], document.body, false).target)
      .toMatchObject({canMoveUp: false, canMoveDown: false})
  })

  it("projects swap availability for the top-level container rather than its selected text block", () => {
    document.body.innerHTML = '<p>first</p><div><p>inner</p></div>'
    const inner = document.querySelector("div > p")!
    $.move(inner.firstChild!, 2)
    expect(editor.features.manipulation.getStyleState([], inner, false).target)
      .toMatchObject({canMoveUp: false, canMoveDown: false})
    const state = () => editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true}).target
    expect(state()).toMatchObject({localName: "div", canMoveUp: true, canMoveDown: false})
    expect(editor.features.layout.moveFloat("up", true)).toBe(true)
    expect(state()).toMatchObject({localName: "div", canMoveUp: false, canMoveDown: true})
  })

  it.each(["none", "right"] as const)("moves an element with authored float %s when CSS computes none, and supports undo and redo", side => {
    const element = document.querySelector("p")!
    $.selectElement(element)
    setFloat(side)
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

  it("uses the current adjacent element after another source inserts content", () => {
    document.body.innerHTML = '<p>first</p><p>selected</p><p>last</p>'
    const selected = document.body.children[1], first = document.body.firstElementChild!
    $.move(selected.firstChild!, 2)
    const inserted = document.createElement("custom-card")
    inserted.innerHTML = '<unfamiliar-element>keep<!--inside--></unfamiliar-element>'
    selected.before(inserted)
    expect(editor.features.layout.moveFloat("up", true)).toBe(true)
    expect(Array.from(document.body.children)).toEqual([first, selected, inserted, document.body.lastElementChild])
    expect(inserted.innerHTML).toBe('<unfamiliar-element>keep<!--inside--></unfamiliar-element>')
    expect($.anchor).toBe(selected.firstChild)
    expect($.anchorOffset).toBe(2)
  })

  it("does not move a captured element after it is disconnected", () => {
    document.body.innerHTML = '<custom-card>selected</custom-card><p>keep</p>'
    const selected = document.body.firstElementChild!
    editor.features.selection.captureElement(selected)
    selected.remove()
    const before = editor.toHTML(true)
    expect(editor.features.layout.moveFloat("down", true)).toBe(false)
    expect(editor.features.layout.moveFloat("up", true)).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
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
