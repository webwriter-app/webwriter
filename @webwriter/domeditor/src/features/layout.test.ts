// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
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

const setFloat = (side: "left" | "none" | "right") => editor.features.layout.actions.setFloat({type: "setFloat", side})

describe("document floats", () => {
  it.each(["left", "right"] as const)("adds a 5px margin for %s floats and clears it with the float", side => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    expect(setFloat(side)).toBe(true)
    expect(paragraph.style.margin).toBe("5px")
    expect(setFloat("none")).toBe(true)
    expect(paragraph.style.margin).toBe("")
    paragraph.style.margin = "12px"
    setFloat("none")
    expect(paragraph.style.margin).toBe("12px")
  })

  it.each(["left", "right", "none"] as const)("sets %s on the live block without rebuilding its surroundings", side => {
    const paragraph = document.querySelector("p")!
    const nodes = Array.from(paragraph.parentNode!.childNodes)
    paragraph.style.float = "left"
    $.move(paragraph.firstChild!, 2)
    expect(setFloat(side)).toBe(true)
    expect(paragraph.style.float).toBe(side === "none" ? "" : side)
    expect(paragraph.style.color).toBe("red")
    expect(Array.from(paragraph.parentNode!.childNodes)).toEqual(nodes)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(2)
    expect(document.querySelector(".ww-column-group")).toBeNull()
  })

  it("floats a captured custom element without touching its contents or selection", () => {
    const widget = document.querySelector("custom-card")!
    widget.innerHTML = '<div style="display:grid"><span>Private content</span></div>'
    const contents = widget.innerHTML
    editor.features.selection.captureElement(widget)
    expect(setFloat("right")).toBe(true)
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
    expect(setFloat("left")).toBe(false)
    expect(editor.features.manipulation.setFloat(document.body, "right")).toBe(false)
    expect(document.body.style.float).toBe("")
  })

  it.each(["canvas", "slides"] as const)("withholds floats in %s", mode => {
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = document.querySelector("custom-card")!
    $.selectElement(target)
    const before = target.getAttribute("style")
    expect(setFloat("left")).toBe(false)
    expect(target.getAttribute("style")).toBe(before)
    expect(editor.features.manipulation.floatContainer(document.querySelector("p")!, target)).toBeNull()
  })

  it("undoes and redoes the float and serializes native CSS without editing artifacts", () => {
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectElement(document.querySelector("p")!)
    expect(setFloat("right")).toBe(true)
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
      expect(setFloat("right")).toBe(true)
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
    expect(setFloat("right")).toBe(true)
    expect(image.style.width).toBe("100%")
    expect(image.style.maxWidth).toBe("min(50%, 30rem)")
    expect(setFloat("left")).toBe(true)
    expect(image.style.maxWidth).toBe("min(50%, 30rem)")
    expect(setFloat("none")).toBe(true)
    expect(image.style.maxWidth).toBe("30rem")
    image.style.removeProperty("max-width")
    setFloat("right")
    expect(image.style.maxWidth).toBe("50%")
    setFloat("none")
    expect(image.style.maxWidth).toBe("")
  })

  it("does not expose former column, flex or grid commands or selection controls", () => {
    expect(Object.keys(editor.features.layout.actions)).toEqual(["setFloat"])
    document.querySelector<HTMLElement>("section")!.style.display = "grid"
    $.selectElement(document.querySelector("section")!)
    editor.features.layout.refresh()
    expect(editor.features.layout.getState()).toBeNull()
    expect(editor.appendix.querySelector('[part="layout-overlay"]')).toBeNull()
    expect(document.querySelector(".◆layout-selected")).toBeNull()
  })
})
