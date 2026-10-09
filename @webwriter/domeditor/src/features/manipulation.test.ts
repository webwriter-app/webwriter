import {readCaptionEnumeration} from "../caption-enumeration"
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import "happy-dom"
import '@testing-library/jest-dom/vitest'

import * as Y from "yjs"
import { DOMEditor } from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import { $, cloneWithoutEditorMarkers } from "../utility"
import {excludedMarkNames} from "../marks"
import {sectionNames} from "../sections"
import {mathElement} from "../math"
import {floatSideFromStyles} from "../element-styles"
import {elementDragType, ribbonInsertionDragType} from "../components/insertion-menu"
import {replayHostDrag, type RibbonDropPosition} from "../editor-bridge"

let editor: DOMEditor

const fragmentFromHTML = (html: string) => {
  const template = document.createElement("template")
  template.innerHTML = html
  return template.content
}

describe("saved snippet capture", () => {
  it("previews the same text container it saves and cleans the outline on exit or destruction", () => {
    document.body.innerHTML = '<p>Before <b>selected</b> after</p><p>Other</p>'
    const paragraph = document.querySelector("p")!, text = paragraph.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 3)
    editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
    expect(document.querySelector(".◆snippet-hovered")).toBe(paragraph)
    expect(editor.features.manipulation.actions.getSnippet({type: "getSnippet"})?.html).not.toContain("◆")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
    editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
    expect(document.querySelector(".◆snippet-hovered, .◆element-hovered")).toBeNull()
    editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
    editor.features.selection.disable()
    expect(document.querySelector(".◆snippet-hovered, .◆element-hovered")).toBeNull()
  })

  it("cleans a snippet preview when its target was removed before hover exit", () => {
    const paragraph = document.querySelector("p")!
    paragraph.textContent = "Save"
    $.move(paragraph.firstChild!, 1)
    editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: true})
    paragraph.remove()
    editor.features.manipulation.actions.hoverSnippet({type: "hoverSnippet", hovered: false})
    expect(paragraph.classList.contains("◆snippet-hovered")).toBe(false)
    expect(paragraph.classList.contains("◆element-hovered")).toBe(false)
  })
  it("saves an entire text container from a partial inline text selection without editing it", () => {
    document.body.innerHTML = '<p id="keep">Before <b class="◆text-selected">selected</b> after<!--keep--></p>'
    const paragraph = document.querySelector("p")!, text = paragraph.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 3)
    const before = document.body.innerHTML
    const snippet = editor.features.manipulation.actions.getSnippet({type: "getSnippet"})
    expect(snippet).toEqual({html: '<p id="keep">Before <b>selected</b> after<!--keep--></p>', label: "Before selected after"})
    expect(document.body.innerHTML).toBe(before)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
  })

  it("saves an element selection with unfamiliar valid descendants and no editing markers", () => {
    document.body.innerHTML = '<custom-card title="keep"><template><em>content</em></template><!--comment--><p class="◆text-selected">Text</p></custom-card>'
    const element = document.body.firstElementChild!
    $.selectElement(element)
    const snippet = editor.features.manipulation.actions.getSnippet({type: "getSnippet"})
    expect(snippet?.html).toBe('<custom-card title="keep"><template><em>content</em></template><!--comment--><p>Text</p></custom-card>')
  })

  it("captures a nested gap's surrounding container and rejects top-level gaps", () => {
    document.body.innerHTML = '<section><p>One</p><p>Two</p></section><p>Outside</p>'
    const section = document.querySelector("section")!
    $.move(section, 1)
    expect(editor.features.manipulation.actions.getSnippet({type: "getSnippet"})?.html).toBe('<section><p>One</p><p>Two</p></section>')
    $.move(document.body, 1)
    expect(editor.features.manipulation.actions.getSnippet({type: "getSnippet"})).toBeNull()
  })

  it.each(["canvas", "slides"] as const)("captures text in %s and excludes the layout's top-level gap", mode => {
    const headHTML = document.head.innerHTML
    try {
      document.body.innerHTML = '<p>Saved text</p>'
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      const paragraph = document.querySelector("p")!
      $.move(paragraph.firstChild!, 2)
      expect(editor.features.manipulation.actions.getSnippet({type: "getSnippet"})?.html).toContain('>Saved text</p>')
      $.move(paragraph.parentElement!, 0)
      expect(editor.features.manipulation.actions.getSnippet({type: "getSnippet"})).toBeNull()
    }
    finally { document.head.innerHTML = headHTML }
  })
})

describe("captions", () => {
  const setCaption = (position: "none" | "above" | "below") =>
    editor.features.manipulation.actions.setCaption({type: "setCaption", position})

  it("uses the figure as the selected style target and transfers placement on conversion", () => {
    document.body.innerHTML = '<p class="ww-float-left authored" style="float: left; color: red">Content</p>'
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    setCaption("below")
    const figure = document.querySelector("figure")!
    expect($.isElementSelection).toBe(false)
    expect($.anchor).toBe(figure.querySelector("figcaption"))
    expect(editor.features.manipulation.styleTarget).toBe(figure)
    expect(figure.classList.contains("ww-float-left")).toBe(true)
    expect(figure.style.float).toBe("left")
    expect(paragraph.style.color).toBe("red")
    expect(editor.features.manipulation.getCaptionPosition()).toBe("below")
    setCaption("none")
    expect($.selectedElement).toBe(paragraph)
    expect(paragraph.classList.contains("authored")).toBe(true)
    expect(paragraph.style.float).toBe("left")
  })

  it.each(["p", "caption-widget"] as const)("wraps a selected %s in a figure and adds a caption", tag => {
    document.body.innerHTML = tag === "p"
      ? '<p title="keep"><b>Content</b><!--keep--></p><p>Other</p>'
      : '<caption-widget title="keep"><b>Content</b><!--keep--></caption-widget><p>Other</p>'
    const target = document.body.firstElementChild!
    $.selectElement(target)

    setCaption("above")

    const figure = document.querySelector("figure")!
    expect(figure.firstElementChild?.localName).toBe("figcaption")
    expect(figure.lastElementChild).toBe(target)
    expect(target.getAttribute("title")).toBe("keep")
    expect(target.querySelector("b")?.textContent).toBe("Content")
    expect(target.innerHTML).toContain("<!--keep-->")
    expect($.anchor).toBe(figure.querySelector("figcaption"))
    expect($.isElementSelection).toBe(false)
  })

  it.each([
    {position: "above", order: ["figcaption", "p"]},
    {position: "below", order: ["p", "figcaption"]},
  ] as const)("moves an existing caption $position while preserving its content", ({position, order}) => {
    document.body.innerHTML = '<figure><p>Body</p><figcaption id="caption"><b>Label</b><!--keep--></figcaption></figure>'
    const figure = document.querySelector("figure")!, caption = figure.querySelector("figcaption")!
    $.selectElement(figure)

    setCaption(position)

    expect(Array.from(figure.children).map(child => child.localName)).toEqual(order)
    expect(figure.querySelector("figcaption")).toBe(caption)
    expect(caption.innerHTML).toBe('<b>Label</b><!--keep-->')
  })

  it("unwraps a figure and converts a nonempty caption to a paragraph without losing content", () => {
    document.body.innerHTML = '<figure><figcaption><b>Label</b><!--keep--></figcaption><custom-widget data-x="1">Body</custom-widget></figure><p>Other</p>'
    const figure = document.querySelector("figure")!, widget = figure.querySelector("custom-widget")!
    const captionContent = figure.querySelector("figcaption")!.innerHTML
    $.selectElement(figure)

    setCaption("none")

    expect(document.querySelector("figure")).toBeNull()
    expect(Array.from(document.body.children).map(child => child.localName)).toEqual(["p", "custom-widget", "p"])
    expect(document.body.firstElementChild?.innerHTML).toBe(captionContent)
    expect(document.body.children[1]).toBe(widget)
    expect(widget.getAttribute("data-x")).toBe("1")
  })

  it.each([
    {position: "above", side: "top"},
    {position: "below", side: "bottom"},
  ] as const)("uses a native table caption at $position", ({position, side}) => {
    document.body.innerHTML = '<table><tbody><tr><td>Cell</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    $.selectElement(table)

    setCaption(position)

    expect(table.querySelector(":scope > caption")).not.toBeNull()
    expect(table.querySelector(":scope > caption")?.textContent).toBe("")
    expect(table.querySelector<HTMLTableCaptionElement>(":scope > caption")?.style.captionSide).toBe(side)
    expect($.anchor).toBe(table.caption)
    expect($.isElementSelection).toBe(false)
  })

  it("removes a table caption when set to none", () => {
    document.body.innerHTML = '<table style="border: 1px solid red"><caption style="caption-side: bottom">Label</caption><tbody><tr><td>Cell</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    $.selectElement(table)

    setCaption("none")

    expect(table.querySelector(":scope > caption")).toBeNull()
    expect(table.style.border).toBe("1px solid red")
    expect(table.querySelector("td")?.textContent).toBe("Cell")
  })

  it("records wrapping as one undoable change", () => {
    document.body.innerHTML = '<p title="keep"><b>Content</b></p>'
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    document.head.querySelector("style[data-ww-caption-enumeration]")?.remove()
    editor.doc.syncFromDOM()
    const original = editor.toHTML(true)

    setCaption("below")
    editor.doc.syncFromDOM()
    const wrapped = editor.toHTML(true)
    expect(wrapped).toContain("<figure")
    expect(wrapped).toContain("<figcaption>")
    expect(readCaptionEnumeration(document.head)?.figure.enabled).toBe(true)

    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    expect(readCaptionEnumeration(document.head)).toBeUndefined()
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(wrapped)
    expect(readCaptionEnumeration(document.head)?.figure.enabled).toBe(true)
  })
})

describe("top-level captions", () => {
  it.each(["p", "td", "nested-widget"])("captions the top-level container of a nested %s", tag => {
    document.body.innerHTML = '<section title="Keep"><p>Text</p><table><tbody><tr><td>Cell</td></tr></tbody></table><nested-widget></nested-widget></section><p>Other</p>'
    const section = document.querySelector("section")!, selected = section.querySelector(tag)!
    if(tag === "nested-widget") editor.features.selection.captureElement(selected)
    else $.move(selected.firstChild!, 1)
    expect(editor.features.manipulation.getCaptionPosition()).toBe("none")
    editor.features.manipulation.setCaption("below")
    const figure = document.body.firstElementChild!
    expect(figure.localName).toBe("figure")
    expect(figure.firstElementChild).toBe(section)
    expect(figure.lastElementChild!.localName).toBe("figcaption")
    expect(section.querySelector("figcaption, caption")).toBeNull()
    expect(document.body.lastElementChild!.textContent).toBe("Other")
    expect($.anchor).toBe(figure.lastElementChild)
  })

  it("uses the top-level table when editing a nested table cell", () => {
    document.body.innerHTML = '<table><tbody><tr><td><p>Text</p></td></tr></tbody></table>'
    const table = document.querySelector("table")!
    $.move(table.querySelector("p")!.firstChild!, 1)
    editor.features.manipulation.setCaption("above")
    expect(document.body.firstElementChild).toBe(table)
    expect(table.caption).not.toBeNull()
    expect(table.querySelector("figure")).toBeNull()
  })

  it("uses the document template as the top-level boundary", () => {
    document.body.innerHTML = '<document-template role="document"><section><p>Text</p></section></document-template>'
    const root = document.body.firstElementChild!, section = root.firstElementChild!
    $.move(section.querySelector("p")!.firstChild!, 1)
    editor.features.manipulation.setCaption("above")
    expect(document.body.firstElementChild).toBe(root)
    expect(root.firstElementChild!.localName).toBe("figure")
    expect(root.querySelector("figure")!.lastElementChild).toBe(section)
  })

  it.each(["canvas", "slides"] as const)("captions the top-level layout item in %s", mode => {
    const previousHead = document.head.innerHTML
    try {
      document.body.innerHTML = '<p>Text</p>'
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      const paragraph = document.querySelector("p")!
      paragraph.innerHTML = '<b>Text</b>'
      const root = paragraph.parentElement!
      const container = document.createElement("section")
      paragraph.before(container)
      container.append(paragraph)
      $.move(paragraph.firstElementChild!.firstChild!, 1)
      editor.features.manipulation.setCaption("below")
      const figure = root.querySelector(":scope > figure")!
      expect(figure).not.toBeNull()
      expect(figure.firstElementChild).toBe(container)
      expect(figure.lastElementChild!.localName).toBe("figcaption")
      expect(root.localName).toBe(mode === "canvas" ? "body" : "section")
    }
    finally { document.head.innerHTML = previousHead }
  })

  it("does not caption the document root or disconnected selection content", () => {
    document.body.innerHTML = '<section><p>Text</p></section>'
    $.move(document.body, 0)
    expect(editor.features.manipulation.setCaption("below")).toBe(false)
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 1)
    paragraph.parentElement!.remove()
    expect(editor.features.manipulation.setCaption("below")).toBe(false)
    expect(document.querySelector("figure, caption, figcaption")).toBeNull()
  })

  it("repositions the top-level caption without changing nested authored captions", () => {
    document.body.innerHTML = '<figure><section><figure><img><figcaption>Inner</figcaption></figure></section><figcaption>Outer</figcaption></figure>'
    const outer = document.body.firstElementChild!, inner = outer.querySelector("section > figure")!, caption = outer.lastElementChild!
    $.selectElement(inner)
    editor.features.manipulation.setCaption("above")
    expect(outer.firstElementChild).toBe(caption)
    expect(inner.querySelector("figcaption")!.textContent).toBe("Inner")
    expect(document.querySelectorAll("figure")).toHaveLength(2)
  })
})

describe("captioned element replacement", () => {
  it.each(["above", "below"] as const)("retains a figure caption %s when replacing its content", position => {
    const captionHTML = '<figcaption lang="de" title="Keep"><em>Caption</em><!--keep--></figcaption>'
    document.body.innerHTML = `<p>Before</p><figure style="float:left">${position === "above" ? captionHTML : ""}<img src="old.png">${position === "below" ? captionHTML : ""}</figure><p>After</p>`
    const figure = document.querySelector("figure")!, caption = figure.querySelector("figcaption")!, text = caption.firstChild!
    $.selectElement(figure)
    editor.features.manipulation.insert(document.createElement("video"))
    expect(document.querySelector("figure")).toBe(figure)
    expect(figure.querySelector("img")).toBeNull()
    expect(figure.querySelector("video")).not.toBeNull()
    expect(figure.querySelector("figcaption")).toBe(caption)
    expect(caption.firstChild).toBe(text)
    expect(caption.outerHTML).toBe(captionHTML)
    expect(figure.firstElementChild === caption).toBe(position === "above")
    expect((figure as HTMLElement).style.float).toBe("left")
    expect($.selectedElement).toBe(figure)
    expect(document.body.firstElementChild!.textContent).toBe("Before")
    expect(document.body.lastElementChild!.textContent).toBe("After")
  })

  it.each(["figure", "table"] as const)("retains the caption when replacing a %s with a table", kind => {
    document.body.innerHTML = kind === "figure"
      ? '<figure><img><figcaption lang="fr"><b>Caption</b></figcaption></figure>'
      : '<table><caption lang="fr" style="caption-side:bottom"><b>Caption</b></caption><tbody><tr><td>Old</td></tr></tbody></table>'
    const target = document.body.firstElementChild!, text = target.querySelector("figcaption, caption")!.firstChild!
    $.selectElement(target)
    const table = document.createElement("table")
    table.innerHTML = '<tbody><tr><td>New</td></tr></tbody>'
    editor.features.manipulation.insert(table)
    expect(document.body.firstElementChild).toBe(table)
    expect(table.caption).toHaveAttribute("lang", "fr")
    expect(table.caption!.firstChild).toBe(text)
    expect(table.caption!.textContent).toBe("Caption")
    expect(table.caption!.style.captionSide).toBe("bottom")
    expect(table.querySelector("td")!.textContent).toBe("New")
    expect(document.querySelector("figure")).toBeNull()
  })

  it.each(["top", "bottom"])("retains a table caption on replacement with a widget (%s)", side => {
    document.body.innerHTML = `<table style="float:right"><caption lang="de" style="caption-side:${side}"><em>Caption</em></caption><tbody><tr><td>Old</td></tr></tbody></table>`
    $.selectElement(document.querySelector("table")!)
    editor.features.manipulation.insertHTML('<replacement-widget></replacement-widget>')
    const figure = document.querySelector("figure")!, caption = figure.querySelector("figcaption")!
    expect(figure.querySelector("replacement-widget")).not.toBeNull()
    expect(caption).toHaveAttribute("lang", "de")
    expect(caption.innerHTML).toBe("<em>Caption</em>")
    expect(figure.firstElementChild === caption).toBe(side === "top")
    expect((figure as HTMLElement).style.float).toBe("right")
    expect(document.querySelector("table")).toBeNull()
  })

  it("retains the caption when replacing a captured widget inside a figure", () => {
    editor.schema.extendWidgets([{tagName: "old-widget", editingConfig: {}}])
    document.body.innerHTML = '<figure><old-widget></old-widget><figcaption>Keep</figcaption></figure>'
    const figure = document.querySelector("figure")!, caption = figure.querySelector("figcaption")!
    editor.features.selection.captureElement(figure.querySelector("old-widget")!)
    editor.features.manipulation.insert(document.createElement("video"))
    expect(document.querySelector("figure")).toBe(figure)
    expect(figure.querySelector("figcaption")).toBe(caption)
    expect(figure.querySelector("video")).not.toBeNull()
    expect(figure.querySelector("old-widget")).toBeNull()
  })

  it("preserves the caption and multiple replacement roots through undo and redo", () => {
    document.body.innerHTML = '<figure><img><figcaption>Keep</figcaption></figure>'
    $.selectElement(document.querySelector("figure")!)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    editor.features.manipulation.insertHTML('<!--before--><p>First</p><p>Second</p><!--after-->')
    const figure = document.querySelector("figure")!
    expect(figure.querySelectorAll("p")).toHaveLength(2)
    expect(figure.querySelector("figcaption")!.textContent).toBe("Keep")
    expect(figure.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    editor.doc.syncFromDOM()
    const replaced = editor.toHTML(true)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(replaced)
  })
})

describe("migrated insertion selection", () => {
  function pendingInsertion() {
    let release!: (html: string) => void
    vi.spyOn(editor.features.migration, "needsMigration").mockReturnValue(true)
    vi.spyOn(editor.features.migration, "migrate").mockImplementation(() => new Promise<string>(resolve => { release = resolve }))
    const inserting = editor.features.manipulation.actions.insert({type: "insert", html: "<p>Inserted</p>"})
    return {inserting, release}
  }

  it("does not replace a widget captured while migration was pending", async () => {
    document.body.innerHTML = '<p>Before</p><custom-widget>Keep</custom-widget>'
    const paragraph = document.querySelector("p")!, widget = document.querySelector("custom-widget")!
    $.move(paragraph.firstChild!, 2)
    const {inserting, release} = pendingInsertion()
    editor.features.selection.captureElement(widget)
    release("<p>Inserted</p>")
    await inserting
    expect(widget.isConnected).toBe(true)
    expect(widget.textContent).toBe("Keep")
    expect(document.body.textContent).toContain("Inserted")
  })

  it("does not insert after its original selected text was replaced", async () => {
    document.body.innerHTML = '<p>Original</p><p>Keep</p>'
    const paragraph = document.querySelector("p")!, text = paragraph.firstChild!
    $.selectRange(text, 0, text, 8)
    const {inserting, release} = pendingInsertion()
    paragraph.replaceChildren(document.createTextNode("Remote replacement"))
    release("<p>Inserted</p>")
    await inserting
    expect(document.body.textContent).toBe("Remote replacementKeep")
  })

  it("does not insert after its original selected element was removed", async () => {
    document.body.innerHTML = '<p>Original</p><p>Keep</p>'
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    const {inserting, release} = pendingInsertion()
    paragraph.remove()
    release("<p>Inserted</p>")
    await inserting
    expect(document.body.textContent).toBe("Keep")
  })

  it("does not replace text changed in place while migration was pending", async () => {
    document.body.innerHTML = '<p>Original</p>'
    const text = document.querySelector("p")!.firstChild as Text
    $.selectRange(text, 0, text, 8)
    const {inserting, release} = pendingInsertion()
    text.replaceData(0, 8, "Remote replacement")
    release("<p>Inserted</p>")
    await inserting
    expect(document.body.textContent).toBe("Remote replacement")
  })

  it("replaces the originally captured widget even after another widget was captured", async () => {
    document.body.innerHTML = '<custom-widget>Original</custom-widget><custom-widget>Keep</custom-widget>'
    const [original, keep] = Array.from(document.querySelectorAll("custom-widget"))
    editor.features.selection.captureElement(original)
    const {inserting, release} = pendingInsertion()
    editor.features.selection.captureElement(keep)
    release("<p>Inserted</p>")
    await inserting
    expect(original.isConnected).toBe(false)
    expect(keep.isConnected).toBe(true)
    expect(document.body.textContent).toBe("InsertedKeep")
  })

  it.each([
    {type: "insert", reenable: false}, {type: "insertRibbonDrop", reenable: false},
    {type: "insert", reenable: true}, {type: "insertRibbonDrop", reenable: true},
  ] as const)("cancels pending $type after disable (re-enable: $reenable)", async ({type, reenable}) => {
    document.body.innerHTML = '<p>Keep</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    editor.doc.syncFromDOM()
    const anchor = Y.relativePositionToJSON(editor.doc.relativePositionFromDOMPoint(paragraph.firstChild!, 2)!)
    let release!: (html: string) => void
    vi.spyOn(editor.features.migration, "needsMigration").mockReturnValue(true)
    vi.spyOn(editor.features.migration, "migrate").mockImplementation(() => new Promise<string>(resolve => { release = resolve }))
    const inserting = type === "insert" ? editor.features.manipulation.actions.insert({type, html: "<p>Inserted</p>"})
      : editor.features.manipulation.actions.insertRibbonDrop({type, html: "<p>Inserted</p>", position: {anchor, layout: "document"}})
    editor.features.manipulation.disable()
    if(reenable) editor.features.manipulation.enable()
    release("<p>Inserted</p>")
    await inserting
    expect(document.body.textContent).toBe("Keep")
  })
})

describe("insertable element placement and previews", () => {
  const hover = (hovered = true) => editor.features.manipulation.actions.hoverInsertion({type: "hoverInsertion", hovered})
  const insert = (html: string) => editor.features.manipulation.actions.insert({type: "insert", html})

  it.each(["p", "table", "section", "custom-widget"])("previews the caret and inserts %s in the content column", tag => {
    document.body.innerHTML = '<p>ab<b>cd</b></p><p>Neighbor</p>'
    const paragraph = document.querySelector("p")!, neighbor = paragraph.nextElementSibling!
    const neighborHTML = neighbor.outerHTML
    $.move(paragraph.querySelector("b")!.firstChild!, 1)
    hover()
    expect(document.body).toHaveClass("◆insertion-gap-preview")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("preview")
    insert(`<${tag}></${tag}>`)
    const inserted = paragraph.nextElementSibling as HTMLElement
    expect(inserted.localName).toBe(tag)
    expect(inserted.style.float).toBe("")
    expect(paragraph.textContent).toBe("abc")
    expect(inserted.nextElementSibling?.textContent).toBe("d")
    expect(cloneWithoutEditorMarkers(neighbor, true).outerHTML).toBe(neighborHTML)
    expect(document.body).not.toHaveClass("◆insertion-gap-preview")
  })

  it.each(["", " ", "<br>", "<b><em></em></b>"])("replaces an empty paragraph on command insertion: %s", html => {
    document.body.innerHTML = `<section><p>Before</p><!--keep--><p>${html}</p><p>After</p></section>`
    const section = document.querySelector("section")!, paragraph = section.children[1]
    const before = section.firstChild!, comment = before.nextSibling!, after = section.lastChild!
    $.move(paragraph.firstChild instanceof Text ? paragraph.firstChild : paragraph)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    hover()
    expect(editor.appendix.querySelector("#◆insertion-preview")).not.toBeNull()
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "table"})
    const table = section.querySelector("table")!
    expect(paragraph.isConnected).toBe(false)
    expect(Array.from(section.childNodes)).toEqual([before, comment, table, after])
    expect(table.style.float).toBe("")
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
    editor.doc.syncFromDOM()
    const replaced = editor.toHTML(true)
    expect(replaced).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(replaced)
  })

  it("replaces an empty paragraph with a widget snippet and captures the widget", () => {
    editor.schema.extendWidgets([{tagName: "replacement-widget", editingConfig: {}}])
    document.body.innerHTML = '<p><b><br></b></p><p>Keep</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.querySelector("b")!)
    insert('<replacement-widget></replacement-widget>')
    const widget = document.querySelector<HTMLElement>("replacement-widget")!
    expect(paragraph.isConnected).toBe(false)
    expect(widget.style.float).toBe("")
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    expect(document.body.children).toHaveLength(2)
  })

  it("replaces an empty paragraph through the node insertion API", () => {
    document.body.innerHTML = '<p><br></p><p>Keep</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph)
    const video = document.createElement("video")
    video.controls = true
    editor.features.manipulation.insert(video)
    expect(paragraph.isConnected).toBe(false)
    expect(document.body.firstElementChild).toBe(video)
    expect(video.style.float).toBe("")
    expect(document.body.children).toHaveLength(2)
  })

  it.each(['<img>', '<custom-widget></custom-widget>', '<!--keep-->'])("does not preview replacement of a paragraph containing non-text content: %s", html => {
    document.body.innerHTML = `<p>${html}</p>`
    const paragraph = document.querySelector("p")!, child = paragraph.firstChild!
    $.move(paragraph)
    hover()
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
    expect(paragraph.isConnected).toBe(true)
    expect(child.parentNode).toBe(paragraph)
  })

  it("keeps comments around a content-column snippet", () => {
    document.body.innerHTML = '<p>Text</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 1)
    insert('<!--before-->\n<aside title="Keep">Snippet</aside><!--after-->')
    const aside = document.querySelector("aside")!
    expect(aside.style.float).toBe("")
    expect(aside.getAttribute("title")).toBe("Keep")
    expect(editor.toHTML(true)).toContain("<!--before-->")
    expect(editor.toHTML(true)).toContain("<!--after-->")
    expect(document.body.textContent).toContain("Snippet")
  })

  it.each(["picture", "video", "iframe", "table", "section", "custom-widget"])("inserts ribbon %s at a text caret without floating", tag => {
    if(tag === "custom-widget") editor.schema.extendWidgets([{tagName: tag, editingConfig: {}}])
    document.body.innerHTML = '<p>Before after</p>'
    $.move(document.querySelector("p")!.firstChild!, 7)
    if(tag === "custom-widget") insert('<custom-widget></custom-widget>')
    else editor.features.manipulation.actions.insertElement({type: "insertElement", tag})
    const inserted = document.querySelector<HTMLElement>(tag)!
    expect(inserted).not.toBeNull()
    expect(inserted.style.float).toBe("")
    expect(inserted.style.getPropertyValue("--ww-float-size")).toBe("")
    expect(document.body.textContent).toContain("Before ")
    expect(document.body.textContent).toContain("after")
  })

  it("inserts ribbon media outside a float containing the text caret", () => {
    document.body.innerHTML = '<aside style="float:left"><p>Floating text</p></aside><p>Keep</p>'
    const floated = document.querySelector("aside")!, paragraph = floated.querySelector("p")!
    $.move(paragraph.firstChild!, 3)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "video"})
    const video = document.querySelector("video")!
    expect(video.parentElement).toBe(document.body)
    expect(video.previousElementSibling).toBe(floated)
    expect(video.style.float).toBe("")
    expect(floated.textContent).toBe("Floating text")
  })

  it("uses content-column placement for strict insertion commands", () => {
    document.body.innerHTML = '<p>Text</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 1)
    editor.features.manipulation.actions.insert({type: "insert", html: "<aside>New</aside>", strict: true})
    expect((paragraph.nextElementSibling as HTMLElement).style.float).toBe("")
    expect(paragraph.textContent).toBe("T")
    expect(document.body.textContent).toBe("TNewext")
  })

  it.each(["caret", "gap", "replace", "capture"])("synchronizes and undoes %s insertion without preview artifacts", mode => {
    document.body.innerHTML = '<p>Text</p><hr><p>After</p>'
    const paragraph = document.querySelector("p")!, divider = document.querySelector("hr")!
    if(mode === "caret") $.move(paragraph.firstChild!, 1)
    else if(mode === "gap") $.move(document.body, 1)
    else if(mode === "capture") editor.features.selection.captureElement(divider)
    else $.selectElement(divider)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    hover()
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "table"})
    editor.doc.syncFromDOM()
    const after = editor.toHTML(true)
    expect(after).toContain("<table")
    expect(after).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("preview")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it("highlights the gap caret and inserts at a nested gap without float spacing", () => {
    document.body.innerHTML = '<section><p>Before</p><!--keep--><hr></section>'
    const section = document.querySelector("section")!, before = section.firstChild!, comment = before.nextSibling!, after = section.lastChild!
    $.move(section, 2)
    editor.features.selection.processSelection()
    hover()
    expect(document.body).toHaveClass("◆insertion-gap-preview")
    expect(editor.features.selection.gapCaret).not.toBeNull()
    expect(editor.appendix.querySelector("#◆float-drop-preview, #◆insertion-preview")).toBeNull()
    insert('<aside title="Inserted">Content</aside>')
    const inserted = section.querySelector("aside")!
    expect(Array.from(section.childNodes)).toEqual([before, comment, inserted, after])
    expect(inserted.style.float).toBe("")
    expect(document.body).not.toHaveClass("◆insertion-gap-preview")
  })

  it.each(["left", "right"] as const)("keeps a %s float's lane, manual size, and document position when replacing it", side => {
    document.body.innerHTML = '<section><p>Before</p><!--keep--><picture style="width:180px;max-width:150px!important"><img alt="Old"></picture><p>After</p></section>'
    const parent = document.querySelector("section")!, target = document.querySelector("picture")!
    editor.features.manipulation.setFloat(target, side)
    const size = target.style.getPropertyValue("--ww-float-size"), maximum = target.style.maxWidth
    const before = Array.from(parent.childNodes), neighbor = target.nextSibling!
    $.selectElement(target)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    editor.features.manipulation.actions.insertElement({type:"insertElement", tag:"video"})
    const replacement = parent.querySelector("video")!
    expect(Array.from(parent.childNodes)).toEqual(before.map(node => node === target ? replacement : node))
    expect(replacement.nextSibling).toBe(neighbor)
    expectClassFloat(replacement, side)
    expect(replacement.style.getPropertyValue("--ww-float-size")).toBe(size)
    expect(replacement.style.maxWidth).toBe(maximum)
    expect(replacement.style.getPropertyPriority("max-width")).toBe("important")
    expect($.selectedElement).toBe(replacement)
    editor.doc.syncFromDOM()
    const replaced = editor.toHTML(true)
    expect(replaced).not.toContain("◆")
    editor.doc.undo(); expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo(); expect(editor.toHTML(true)).toContain(`<video controls="" style="${replacement.getAttribute("style")}" class="ww-float-${side}"></video>`)
  })

  it.each([
    {capture: false, float: "none"}, {capture: true, float: "none"},
    {capture: false, float: "right"}, {capture: true, float: "right"},
  ])("keeps an authored float on replacement with responsive float $float (capture: $capture)", ({capture, float}) => {
    document.body.innerHTML = '<p>Before</p><picture style="float:left"><img alt="Old"></picture><p>After</p>'
    const target = document.querySelector("picture")!
    const computed = getComputedStyle.bind(globalThis)
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((node, pseudo) => node === target
      ? new Proxy(computed(node, pseudo), {get: (style, key) => {
        const value = key === "float" ? float : Reflect.get(style, key)
        return typeof value === "function" ? value.bind(style) : value
      }}) : computed(node, pseudo))
    if(capture) editor.features.selection.captureElement(target)
    else $.selectElement(target)
    insert('<!--before--><video controls></video><!--after-->')
    const replacement = document.querySelector("video")!
    expect(replacement).toHaveClass("ww-float-left")
    expect(document.body.children[1]).toBe(replacement)
    expect(replacement.previousSibling?.nodeType).toBe(Node.COMMENT_NODE)
    expect(replacement.nextSibling?.nodeType).toBe(Node.COMMENT_NODE)
    expect(document.querySelector("picture")).toBeNull()
  })

  it.each([false, true])("previews and replaces a selected host including its floated descendants (capture: %s)", capture => {
    document.body.innerHTML = '<p>Before</p><custom-widget title="Keep"><span style="float: left">Child</span></custom-widget><p>After</p>'
    const target = document.querySelector("custom-widget")!, before = target.previousSibling!, after = target.nextSibling!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 90, 60))
    if(capture) editor.features.selection.captureElement(target)
    else $.selectElement(target)
    hover()
    const overlay = editor.appendix.querySelector<HTMLElement>("#◆insertion-preview")!
    expect(overlay.style.left).toBe("10px")
    expect(overlay.style.width).toBe("90px")
    expect(overlay.style.height).toBe("60px")
    expect(editor.toHTML(true)).not.toContain("preview")
    insert('<section title="Replacement"><p>New</p></section>')
    expect(target.isConnected).toBe(false)
    const replacement = document.querySelector("section")!
    expect(Array.from(document.body.childNodes)).toEqual([before, replacement, after])
    expect(replacement.style.float).toBe("")
    expect(document.querySelector("span")).toBeNull()
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
  })

  it.each(["picture", "svg"])("replaces a selected paragraph with a fresh %s element", tag => {
    document.body.innerHTML = '<p>Replace<span style="float: left">Floated child</span></p><p>After</p>'
    const target = document.querySelector("p")!, neighbor = target.nextElementSibling!
    $.selectElement(target)
    hover()
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag})
    expect(target.isConnected).toBe(false)
    expect(document.body.firstElementChild!.localName).toBe(tag)
    expect(document.body.lastElementChild).toBe(neighbor)
    expect(document.body.textContent).toBe("After")
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
  })

  it.each(["p", "h1", "ul", "ol", "details", "table", "section"])("converts a selected paragraph to %s while retaining its positioned subtree", tag => {
    document.body.innerHTML = '<p>Replace<span style="float: left">Floated child</span></p><p>After</p>'
    const target = document.querySelector("p")!, neighbor = target.nextElementSibling!, floating = target.querySelector("span")!
    $.selectElement(target)
    hover()
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag})
    expect(document.body.firstElementChild!.localName).toBe(tag)
    expect(document.body.firstElementChild!.contains(floating)).toBe(true)
    expect(document.body.lastElementChild).toBe(neighbor)
    expect(document.body.textContent).toBe("ReplaceFloated childAfter")
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
  })

  it("replaces the whole selected host with a snippet containing comments and multiple roots", () => {
    document.body.innerHTML = '<p>Replace<span style="float: left">Floated child</span></p><p>After</p>'
    const target = document.querySelector("p")!, neighbor = target.nextElementSibling!
    $.selectElement(target)
    hover()
    insert('<!--before--><h2>Heading</h2><p>Snippet</p><!--after-->')
    expect(target.isConnected).toBe(false)
    expect(document.body.lastElementChild).toBe(neighbor)
    expect(document.body.textContent).toBe("HeadingSnippetAfter")
    expect(document.body.firstChild!.nodeType).toBe(Node.COMMENT_NODE)
    expect(document.body.firstChild!.textContent).toBe("before")
    expect(neighbor.previousSibling!.nodeType).toBe(Node.COMMENT_NODE)
    expect(neighbor.previousSibling!.textContent).toBe("after")
    expect(document.querySelector("span")).toBeNull()
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
  })

  it("updates preview mode on selection changes and cleans up on hover exit and disable", () => {
    document.body.innerHTML = '<p>Text</p><hr><p>After</p>'
    const paragraph = document.querySelector("p")!, divider = document.querySelector("hr")!
    $.move(paragraph.firstChild!, 1)
    hover()
    $.selectElement(divider)
    document.dispatchEvent(new Event("selectionchange"))
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(editor.appendix.querySelector("#◆insertion-preview")).not.toBeNull()
    $.move(document.body, 1)
    document.dispatchEvent(new Event("selectionchange"))
    expect(document.body).toHaveClass("◆insertion-gap-preview")
    expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull()
    hover(false)
    expect(document.body).not.toHaveClass("◆insertion-gap-preview")
    hover()
    editor.features.manipulation.disable()
    expect(document.body).not.toHaveClass("◆insertion-gap-preview")
    expect(editor.appendix.querySelector("#◆float-drop-preview, #◆insertion-preview")).toBeNull()
  })

  it("follows the live selection after the hovered element is removed", async () => {
    document.body.innerHTML = '<p>Before</p><hr><p>After</p>'
    const divider = document.querySelector("hr")!
    editor.features.selection.captureElement(divider)
    hover()
    divider.remove()
    $.move(document.body, 1)
    await vi.waitFor(() => expect(editor.appendix.querySelector("#◆insertion-preview")).toBeNull())
    hover(false)
    expect(document.body).not.toHaveClass("◆insertion-gap-preview")
  })
})

describe("deleting the selected document", () => {
  it.each(["Delete", "Backspace", "beforeinput"])("removes floated descendants with %s and supports undo and redo", input => {
    document.body.innerHTML = '<p>before<span style="float: left">nested</span></p><!--keep--><custom-widget style="float: right">widget</custom-widget><aside style="float: left"><p>floating</p></aside><p>after</p>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    $.selectElement(document.body)
    const event = input === "beforeinput" ? new InputEvent("beforeinput", {inputType: "deleteContentForward", bubbles: true, cancelable: true})
      : new KeyboardEvent("keydown", {key: input, bubbles: true, cancelable: true})
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.body.querySelector("span, custom-widget, aside")).toBeNull()
    expect(document.body.textContent).toBe("")
    editor.doc.syncFromDOM()
    const deleted = editor.toHTML(true)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(deleted)
  })

  it("deletes floats after selecting all with Cmd+A", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
    document.body.innerHTML = '<p>before</p><aside style="float: right">floating</aside><p>after</p>'
    $.move(document.querySelector("p")!.firstChild!, 1)
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "a", metaKey: true, bubbles: true, cancelable: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))
    expect(document.querySelector("aside")).toBeNull()
    expect(document.body.textContent).toBe("")
  })
})

describe("line breaks inside floated text blocks", () => {
  it.each(["left", "right"])("keeps %s floats intact on Enter and native paragraph input", side => {
    for(const tag of ["p", "h1", "section", "ul", "details"]) {
      for(const input of ["key", "beforeinput"]) {
        document.body.innerHTML = `<${tag} style="float: ${side}">${tag === "section" ? "<p>a<b>bc</b></p>"
          : tag === "ul" ? "<li>a<b>bc</b></li>" : tag === "details" ? "<summary>a<b>bc</b></summary><p>Body</p>"
          : "a<b>bc</b>"}</${tag}><p>Neighbor</p>`
        const root = document.body.firstElementChild!, neighbor = root.nextElementSibling!
        const style = root.getAttribute("style"), neighborHTML = neighbor.outerHTML
        const text = root.querySelector("b")!.firstChild!
        $.move(text, 1)
        const event = input === "key" ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
          : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})
        text.parentElement!.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        expect(root.querySelector("b")!.innerHTML).toBe("b<br>c")
        expect(Array.from(document.body.children)).toEqual([root, neighbor])
        expect(root.getAttribute("style")).toBe(style)
        expect(neighbor.outerHTML).toBe(neighborHTML)
        expect(root.contains($.anchor)).toBe(true)
      }
    }
  })

  it("uses live stylesheet floats and resumes paragraph splitting when the float is removed", () => {
    const style = document.createElement("style")
    style.textContent = ".floated { float: left }"
    document.head.append(style)
    try {
      document.body.innerHTML = '<p class="floated">abcd</p>'
      const paragraph = document.querySelector("p")!
      $.selectRange(paragraph.firstChild!, 1, paragraph.firstChild!, 3)
      paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
      expect(paragraph.innerHTML).toBe("a<br>d")
      paragraph.classList.remove("floated")
      $.move(paragraph.lastChild!, 1)
      paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
      expect(document.querySelectorAll("p")).toHaveLength(2)
    }
    finally { style.remove() }
  })

  it("inserts a break into an empty float", () => {
    document.body.innerHTML = '<p style="float: right"></p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(cloneWithoutEditorMarkers(paragraph, true).innerHTML).toBe("<br>")
    expect(document.body.children).toHaveLength(1)
  })

  it("synchronizes, serializes, undoes and redoes the break without splitting the float", () => {
    document.body.innerHTML = '<p style="float: left">ab</p><p>Neighbor</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 1)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    editor.doc.syncFromDOM()
    const inserted = editor.toHTML(true)
    expect(inserted).toBe('<p style="float: left">a<br>b</p><p>Neighbor</p>')
    expect(sharedDOMBody(editor.doc.doc).toString()).toContain("a<br></br>b")
    editor.doc.undo()
    expect(document.querySelector("p")!.innerHTML).toBe("ab")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(inserted)
  })

  it("leaves Enter inside a floated widget's shadow input to the widget", () => {
    document.body.innerHTML = '<p>Keep</p><custom-widget style="float: left"></custom-widget>'
    const paragraph = document.querySelector("p")!, widget = document.querySelector("custom-widget")!
    const input = document.createElement("textarea")
    widget.attachShadow({mode: "open"}).append(input)
    $.move(paragraph.firstChild!, 1)
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(paragraph.innerHTML).toBe("Keep")
    expect(widget.childNodes).toHaveLength(0)
  })
})

describe.each(["canvas", "slides"] as const)("line breaks inside %s text roots", mode => {
  let headHTML: string
  beforeEach(() => { headHTML = document.head.innerHTML })
  afterEach(() => { document.head.innerHTML = headHTML })

  it.each(["p", "h1", "section", "ul", "details"])("keeps a %s root intact on Enter and native paragraph input", tag => {
    for(const input of ["key", "beforeinput"]) {
      const root = document.createElement(tag)
      root.innerHTML = tag === "section" ? "<p>ab</p>" : tag === "ul" ? "<li>ab</li>"
        : tag === "details" ? "<summary>ab</summary><p>Body</p>" : "ab"
      document.body.replaceChildren(root)
      document.body.className = ""
      expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      const parent = root.parentElement!, siblings = Array.from(parent.childNodes)
      const style = root.getAttribute("style")
      const textBlock = root.querySelector("p, li, summary") ?? root
      $.move(textBlock.firstChild!, 1)
      const event = input === "key" ? new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
        : new InputEvent("beforeinput", {inputType: "insertParagraph", bubbles: true, cancelable: true})
      textBlock.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(textBlock.innerHTML).toBe("a<br>b")
      expect(Array.from(parent.childNodes)).toEqual(siblings)
      expect(root.getAttribute("style")).toBe(style)
      expect(root.contains($.anchor)).toBe(true)
    }
  })

  it("replaces selected text with a line break and leaves adjacent roots alone", () => {
    document.body.innerHTML = '<p><b>ab</b><i>cd</i></p><p>Neighbor</p>'
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const paragraph = document.querySelector("p")!, neighbor = document.querySelectorAll("p")[1]
    const initialNeighbor = neighbor.outerHTML
    $.selectRange(paragraph.querySelector("b")!.firstChild!, 1, paragraph.querySelector("i")!.firstChild!, 1)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(paragraph.textContent).toBe("ad")
    expect(paragraph.querySelectorAll("br")).toHaveLength(1)
    expect(paragraph.contains($.anchor)).toBe(true)
    expect(neighbor.outerHTML).toBe(initialNeighbor)
  })

  it("leaves a widget's shadow input in control of Enter", () => {
    const widget = document.createElement("custom-widget")
    const shadow = widget.attachShadow({mode: "open"}), input = document.createElement("textarea")
    shadow.append(input); document.body.replaceChildren(widget)
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const original = cloneWithoutEditorMarkers(widget, true).outerHTML
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(cloneWithoutEditorMarkers(widget, true).outerHTML).toBe(original)
  })

  it("inserts a line break into an empty text root", () => {
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const paragraph = document.querySelector("p")!, parent = paragraph.parentElement!
    $.move(paragraph)
    paragraph.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(cloneWithoutEditorMarkers(paragraph, true).innerHTML).toBe("<br>")
    expect(parent.querySelectorAll("p")).toHaveLength(1)
    expect(paragraph.contains($.anchor)).toBe(true)
  })

  it("lets an inline formula own Enter inside a text root", () => {
    document.body.innerHTML = '<p>Before </p>'
    const math = mathElement("math", mathElement("mrow", mathElement("mi", "x")))
    document.querySelector("p")!.append(math, " after")
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const text = math.querySelector("mi")!.firstChild!
    $.move(text, 1)
    editor.features.math.refresh()

    text.parentElement!.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(math.textContent).toBe("x")
    expect(math.querySelector("br")).toBeNull()
    expect(math.contains($.anchor)).toBe(false)
  })
})

/*
Selection: caret, gap, node, text, span (reversed)
Context nodes: text, comment, element
Parameters: Per function 
*/

function expectBodyToBe(html: string) {
  return expect(editor.toHTML(true)).toEqual(html)
}

function expectClassFloat(element: HTMLElement, side: "left" | "right") {
  expect(element).toHaveClass(side === "left" ? "ww-float-left" : "ww-float-right")
  expect(element.style.float).toBe("")
}

function expectFarFloat(element: HTMLElement, side: "left" | "right") {
  expect(element).toHaveClass(side === "left" ? "ww-float-left" : "ww-float-right")
  expect(element.style.float).toBe("")
  expect(element.style.width).toBe("")
  expect(element.style.maxWidth).toBe("")
  expect(element.style.margin).toBe("")
  expect(element.style.getPropertyValue("--ww-float-size")).toBe("")
}

beforeEach(async () => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute("class")
  document.documentElement.removeAttribute("style")
  document.body.innerHTML = "<p></p>"
  document.body.removeAttribute("style")
  document.body.removeAttribute("class")
  editor = new DOMEditor()
  $.move(document.body.firstElementChild!)
  await new Promise<void>(resolve => queueMicrotask(resolve))
  $.move(document.body.firstElementChild!)
})


afterEach(() => editor.destroy())

describe("legacy column groups are preserved as authored DOM", () => {
  const groupHTML = '<div class="ww-column-group"><p class="ww-column-left">left</p><p class="ww-column-right">right</p></div><p>outside</p>'
  const mutationsDelivered = () => new Promise<void>(resolve => setTimeout(resolve))

  it("preserves the group after a remote child removal", async () => {
    document.body.innerHTML = groupHTML
    $.move(document.body.lastElementChild!.firstChild!, 1)
    await mutationsDelivered()
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const group = sharedDOMBody(remote).get(0) as Y.XmlElement
    remote.transact(() => group.delete(1, 1))
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
    await mutationsDelivered()
    document.dispatchEvent(new Event("selectionchange"))
    expect(document.querySelector(".ww-column-group")?.children).toHaveLength(1)
    remote.destroy()
  })

  it("preserves the group after a local child removal", async () => {
    document.body.innerHTML = groupHTML
    $.move(document.body.lastElementChild!.firstChild!, 1)
    await mutationsDelivered()
    document.querySelector(".ww-column-right")!.remove()
    await mutationsDelivered()
    expect(document.querySelector(".ww-column-group")?.children).toHaveLength(1)
    expectBodyToBe('<div class="ww-column-group"><p class="ww-column-left">left</p></div><p>outside</p>')
  })
})

describe("column insertion", () => {
  it.each(["p", "h2", "blockquote", "pre"])("inserts media at a caret inside %s without splitting it", tag => {
    document.body.innerHTML = `<${tag}>before<b>after</b><!--keep--></${tag}>`
    const block = document.body.firstElementChild!
    const bold = block.querySelector("b")!
    $.move(bold.firstChild!, 2)
    const image = document.createElement("img")
    editor.features.manipulation.insert(image)
    expect(image.nextElementSibling).toBe(block)
    expect(image).toHaveClass("ww-float-right")
    expect(block.textContent).toBe("beforeafter")
    expect(block.querySelector("b")).toBe(bold)
    expect(document.body.children).toHaveLength(2)
    expect(image.style.maxWidth).toBe("var(--ww-float-width)")
    expect(image).toHaveClass("ww-float-right")
    expect(image.parentElement).toBe(block.parentElement)
    expect(block.previousElementSibling).toBe(image)
    expect(bold.innerHTML).toBe("after")
  })

  it.each(["", "text*"])("respects widget content declaration %s", content => {
    editor.schema.extendWidgets([{tagName: "float-widget", editingConfig: {content}}])
    const block = document.querySelector("p")!
    block.textContent = "text"
    $.move(block.firstChild!, 2)
    const widget = document.createElement("float-widget")
    editor.features.manipulation.insert(widget)
    expect(widget.style.float).toBe(content ? "" : "right")
    if(!content) expect(widget.nextElementSibling).toBe(block)
  })

  it.each(["", " ", "<br>", "<b></b>"])("does not float insertion at a caret in an empty paragraph: %s", html => {
    document.body.innerHTML = `<p>${html}</p>`
    $.move(document.querySelector("p")!)
    const image = document.createElement("img")
    editor.features.manipulation.insert(image)
    expect(image.style.float).toBe("")
  })

  it("does not apply automatic floating when replacing selected text", () => {
    document.body.innerHTML = "<p>text</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 1, text, 3)
    const image = document.createElement("img")
    editor.features.manipulation.insert(image)
    expect(image.style.float).toBe("")
  })

  it("sets the far float without changing authored limits and refuses a disconnected container", () => {
    const image = document.createElement("img")
    image.style.float = "left"
    image.style.maxWidth = "30rem"
    image.style.setProperty("--ww-column", "1")
    image.classList.add("authored", "ww-column-left")
    document.body.append(image)
    expect(editor.features.manipulation.setFloat(image, "right")).toBe(true)
    expect(image).toHaveClass("ww-float-right")
    expect(floatSideFromStyles(image.style.float, image.style, image.classList)).toBe("far-right")
    expect(image.style.width).toBe("")
    expect(image.style.getPropertyValue("--ww-float-size")).toBe("")
    expect(image.style.maxWidth).toBe("30rem")
    expect(image.style.getPropertyValue("--ww-column")).toBe("1")
    expect(image).toHaveClass("authored", "ww-column-left")
    const paragraph = document.createElement("p")
    paragraph.textContent = "detached"
    expect(editor.features.manipulation.placeFloat(image, paragraph, "left")).toBe(false)
    expect(image).toHaveClass("ww-float-right")
    expect(paragraph.textContent).toBe("detached")
  })

  it("undoes and redoes a floated insertion", () => {
    document.querySelector("p")!.textContent = "text"
    $.move(document.querySelector("p")!.firstChild!, 2)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.manipulation.insert(document.createElement("img"))
    editor.doc.syncFromDOM()
    const inserted = editor.toHTML(true)
    expect(document.querySelector("p")!.previousElementSibling).toBe(document.querySelector("img"))
    editor.doc.undo()
    expect(document.querySelector("img")).toBeNull()
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(inserted)
  })

  it.each(["far-left", "far-right"] as const)("sets and clears %s using theme classes", side => {
    document.body.innerHTML = '<p>before</p><!--keep--><custom-widget title="Keep"><unfamiliar-node>content</unfamiliar-node></custom-widget><p>after</p>'
    const widget = document.querySelector<HTMLElement>("custom-widget")!
    const siblings = Array.from(document.body.childNodes)
    $.selectElement(widget)
    expect(editor.features.layout.actions.setFloat({type: "setFloat", side})).toBe(true)
    const physicalSide = side === "far-left" ? "left" : "right"
    expect(widget).toHaveClass(physicalSide === "left" ? "ww-float-left" : "ww-float-right")
    expect(widget.style.width).toBe("")
    expect(widget.style.getPropertyValue(`margin-${physicalSide}`)).toBe("")
    expect(floatSideFromStyles(widget.style.float, widget.style, widget.classList)).toBe(side)
    expect(Array.from(document.body.childNodes)).toEqual(siblings)
    expect(widget.innerHTML).toBe("<unfamiliar-node>content</unfamiliar-node>")
    expect(Array.from(widget.attributes, attr => attr.name).sort()).toEqual(["class", "title"])
    expect(editor.toHTML(true)).toContain(physicalSide === "left" ? "ww-float-left" : "ww-float-right")
    expect(editor.features.manipulation.setFloat(widget, "none")).toBe(true)
    expect(widget.classList.contains("ww-float-left") || widget.classList.contains("ww-float-right")).toBe(false)
  })

  it("switches far sides and ordinary floats without retaining the outset or preferred width", () => {
    const image = document.createElement("img")
    document.body.append(image)
    const manipulation = editor.features.manipulation
    manipulation.setFloat(image, "far-left")
    manipulation.setFloat(image, "far-right")
    expect(floatSideFromStyles(image.style.float, image.style, image.classList)).toBe("far-right")
    expect(image.style.marginLeft).toBe("")
    expect(image.style.marginRight).toBe("")
    expect(image.style.width).toBe("")
    manipulation.setFloat(image, "left")
    expect(image.style.marginLeft).toBe("")
    expect(image.style.marginRight).toBe("")
    expect(floatSideFromStyles(image.style.float, image.style, image.classList)).toBe("far-left")
    manipulation.setFloat(image, "none")
    expect(image.getAttribute("style")).toBeNull()
  })

  it("clears far margins after another source removes the native float declaration", () => {
    const target = document.createElement("aside")
    document.body.append(target)
    editor.features.manipulation.setFloat(target, "far-right")
    target.style.removeProperty("float")
    editor.features.manipulation.setFloat(target, "none")
    expect(target.getAttribute("style")).toBeNull()
  })

  it("preserves authored widths and unrelated styles when clearing a far float", () => {
    document.body.innerHTML = '<section><aside style="width: 80px; max-width: 120px; color: red">keep<!--note--></aside></section>'
    const target = document.querySelector("aside")!
    editor.features.manipulation.setFloat(target, "far-right")
    expect(target.style.width).toBe("80px")
    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), 80px)")
    expect(target.style.getPropertyValue("--ww-float-outset")).toBe("")
    editor.features.manipulation.setFloat(target, "none")
    expect(target.style.width).toBe("80px")
    expect(target.style.maxWidth).toBe("120px")
    expect(target.style.color).toBe("red")
    expect(target.style.margin).toBe("")
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("")
    expect(target.style.getPropertyValue("--ww-float-outset")).toBe("")
    expect(target.style.getPropertyValue("--ww-float-spacing")).toBe("")
    expect(target.innerHTML).toBe("keep<!--note-->")
  })

  it("updates float sizing through physical and logical width controls", () => {
    const target = document.body.appendChild(document.createElement("aside"))
    const manipulation = editor.features.manipulation
    manipulation.setFloat(target, "far-left")
    manipulation.setElementStyles(target, {width: "180px", "margin-top": "12px"})
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), 180px)")
    expect(target.style.marginTop).toBe("12px")
    manipulation.setElementStyles(target, {"inline-size": "120px"})
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), 120px)")
    manipulation.setElementStyles(target, {"inline-size": null, width: null})
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("min(100%, var(--ww-float-width), var(--ww-float-width))")
    manipulation.setFloat(target, "none")
    expect(target.style.getPropertyValue("--ww-float-size")).toBe("")
  })

  it("refuses far floating disconnected targets, the document root and widget internals", () => {
    const target = document.createElement("aside")
    expect(editor.features.manipulation.setFloat(target, "far-left")).toBe(false)
    expect(target.getAttribute("style")).toBeNull()
    expect(editor.features.manipulation.setFloat(document.body, "far-right")).toBe(false)
    document.body.innerHTML = '<custom-widget><aside>private</aside></custom-widget>'
    expect(editor.features.manipulation.setFloat(document.querySelector("aside")!, "far-right")).toBe(false)
  })

  it("shares, undoes and redoes a far float without DOM artifacts", () => {
    document.body.innerHTML = '<p>before</p><aside title="Keep">content</aside><p>after</p>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    editor.features.manipulation.setFloat(document.querySelector("aside")!, "far-left")
    editor.doc.syncFromDOM()
    const after = editor.toHTML(true)
    expect(after).toContain("ww-float-left")
    expect(after).not.toContain("◆")
    expect(sharedDOMBody(editor.doc.doc).toString()).toContain("ww-float-left")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })
})

describe("widget-safe validation and transfer", () => {
  const constructed = vi.fn()
  const adopted = vi.fn()
  customElements.define("manipulation-probe-widget", class extends HTMLElement {
    constructor() {
      super()
      constructed()
      this.attachShadow({mode: "open"}).textContent = "private state"
    }
    adoptedCallback() { adopted() }
  })

  function content() {
    editor.schema.extendWidgets([{tagName: "manipulation-probe-widget"}])
    document.body.innerHTML = '<p>before</p><manipulation-probe-widget></manipulation-probe-widget><p>after</p>'
    editor.features.widget.refresh()
    const widget = document.querySelector("manipulation-probe-widget")!
    const before = document.body.firstElementChild!.firstChild!
    return {widget, before}
  }

  it("validates Enter without constructing unrelated widgets or changing their identity", () => {
    const {widget, before} = content()
    const shadow = widget.shadowRoot
    $.move(before, 2)
    constructed.mockClear()
    adopted.mockClear()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(constructed).not.toHaveBeenCalled()
    expect(adopted).not.toHaveBeenCalled()
    expect(document.querySelector("manipulation-probe-widget")).toBe(widget)
    expect(widget.shadowRoot).toBe(shadow)
    expect(Array.from(document.querySelectorAll("p"), p => p.textContent)).toEqual(["be", "fore", "after"])
  })

  it("validates section wrapping and replacement while moving the original widget", () => {
    const {widget} = content()
    $.selectElement(widget)
    constructed.mockClear()
    adopted.mockClear()

    expect(editor.features.manipulation.toggleSection()).toBe(true)
    expect(widget.parentElement!.localName).toBe("section")
    $.selectElement(widget)
    expect(editor.features.manipulation.setSectionType("article")).toBe(true)

    expect(widget.parentElement!.localName).toBe("article")
    expect(widget.ownerDocument).toBe(document)
    expect(constructed).not.toHaveBeenCalled()
    expect(adopted).not.toHaveBeenCalled()
  })

  it.each(["copy", "cut"] as const)("serializes %s without initializing a temporary widget", async operation => {
    const {widget} = content()
    $.selectElement(widget)
    const write = vi.spyOn(navigator.clipboard, "write").mockResolvedValue()
    constructed.mockClear()

    const result = editor.features.manipulation[operation]()
    expect(constructed).not.toHaveBeenCalled()
    await result

    expect(write).toHaveBeenCalledOnce()
    const item = write.mock.calls[0][0][0]
    const html = await (await item.getType("text/html")).text()
    expect(html).toContain("<manipulation-probe-widget")
    expect(html).toContain(`id="${widget.id}"`)
    expect(html).not.toContain("◆")
    expect(widget.isConnected).toBe(operation === "copy")
  })

  it("starts a node drag without constructing its serialized widget", () => {
    const {widget} = content()
    $.selectElement(widget)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector<HTMLElement>('[part="node-drag-surface"]')!
    const data = new DataTransfer()
    vi.spyOn(data, "setDragImage").mockImplementation(() => {})
    constructed.mockClear()

    surface.dispatchEvent(transferEvent("dragstart", data))

    expect(data.getData("text/html")).toContain("<manipulation-probe-widget")
    expect(data.getData("text/html")).not.toContain("◆")
    expect(constructed).not.toHaveBeenCalled()
    expect(widget.isConnected).toBe(true)
  })
})

describe("insert()", () => { // deletes selection => selection = caret/gap
  it("creates a real editing target before the first printable key is committed", () => {
    const event = new KeyboardEvent("keydown", {key: "a", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("creates a new paragraph before printable input is committed at a trailing gap", () => {
    document.body.innerHTML = "<p>existing</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.selection.processSelection()
    const event = new KeyboardEvent("keydown", {key: "a", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p>existing</p><p></p>")
    expect($.anchor).toBe(document.body.lastElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("creates a real editing target before an IME composition starts", () => {
    document.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, data: ""}))

    expectBodyToBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
  })

  it("splits the schema-provided initial paragraph when Enter is pressed", () => {
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p></p><p></p>")
    expect($.anchor).toBe(document.body.lastElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("can repeatedly split the initial paragraph", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p></p><p></p><p></p>")
    expect($.anchor).toBe(document.body.lastElementChild)
    expect($.anchorOffset).toBe(0)
  })

  describe.each(["h1", "h2", "h3", "h4", "h5", "h6"])("splitting %s", tag => {
    it.each([0, 2, 5])("continues as a paragraph at offset %i", offset => {
      document.body.innerHTML = `<${tag} id="title">hello</${tag}>`
      const heading = document.body.firstElementChild!
      $.move(heading.firstChild!, offset)

      const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
      document.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expectBodyToBe(`<${tag} id="title">${"hello".slice(0, offset)}</${tag}><p>${"hello".slice(offset)}</p>`)
      expect(document.body.firstElementChild).toBe(heading)
      expect(document.querySelector("p")!.contains($.anchor)).toBe(true)
      expect($.anchorOffset).toBe(0)
    })

    it("handles native paragraph input while preserving inline content and siblings", () => {
      document.body.innerHTML = `<section><${tag}><b><i>hello</i></b><span> world</span></${tag}><p>after</p></section>`
      const following = document.querySelector("p")!
      $.move(document.querySelector("i")!.firstChild!, 2)
      const event = new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, inputType: "insertParagraph",
      })

      document.body.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expectBodyToBe(`<section><${tag}><b><i>he</i></b></${tag}><p><b><i>llo</i></b><span> world</span></p><p>after</p></section>`)
      expect(document.querySelectorAll("p")[1]).toBe(following)
      expect($.anchor).toBe(document.querySelectorAll("i")[1].firstChild)
      expect($.anchorOffset).toBe(0)
    })
  })

  it("handles insertParagraph beforeinput without a preceding key event", () => {
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertParagraph",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p></p>")
  })

  it("inserts a line break with Alt+Enter into the initial text block", () => {
    const event = new KeyboardEvent("keydown", {key: "Enter", altKey: true, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p><br></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(1)
  })

  it("inserts a word-break opportunity with Alt+Shift+Enter", () => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p><wbr></p>")
  })

  it("inserts a Word-compatible soft line break with Shift+Enter", () => {
    document.body.innerHTML = "<p>ab</p>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    const event = new KeyboardEvent("keydown", {
      key: "Enter", shiftKey: true, bubbles: true, cancelable: true,
    })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>a<br>b</p>")
    expect($.anchor).toBe(document.querySelector("p"))
    expect($.anchorOffset).toBe(2)
  })

  it("handles native insertLineBreak input inside a non-empty paragraph", () => {
    document.body.innerHTML = "<p>ab</p>"
    $.move(document.querySelector("p")!.firstChild!, 1)
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertLineBreak",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>a<br>b</p>")
  })

  it("does not insert a break where the schema allows only text", () => {
    document.body.innerHTML = "<select><option>ab</option></select>"
    $.move(document.querySelector("option")!.firstChild!, 1)
    const event = new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<select><option>ab</option></select>")
  })

  it("does not insert a word break where the schema allows only text", () => {
    document.body.innerHTML = "<select><option>ab</option></select>"
    $.move(document.querySelector("option")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<select><option>ab</option></select>")
  })

  it("does not create content for a keyboard shortcut", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "b", ctrlKey: true, bubbles: true, cancelable: true}))

    expectBodyToBe("<p></p>")
  })

  it("synchronizes native text input in the schema-provided paragraph", async () => {
    const paragraph = document.body.firstElementChild!
    const text = document.createTextNode("a")
    paragraph.append(text)
    $.move(text, 1)
    document.body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: "a",
    }))

    expect(paragraph.tagName).toBe("P")
    expect(paragraph.textContent).toBe("a")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)

    await vi.waitFor(() => {
      expect({
        dom: editor.toHTML(true),
        shared: editor.doc.body.firstChild?.toString(),
      }).toEqual({dom: "<p>a</p>", shared: "<p>a</p>"})
    }, {timeout: 5_000})
  }, 10_000)

  it("keeps replacement text in a block when the selection spans body children", () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "Replacement",
      inputType: "insertText",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>Replacement</p>")
    expect(Array.from(document.body.childNodes).every(node => node instanceof Element)).toBe(true)
  })

  it("inserts HTML through its action handler", () => {
    editor.features.manipulation.actions.insert({type: "insert", html: "<p></p>"})
    expect(Array.from(document.body.children, element => element.localName)).toEqual(["p", "p"])
    expectFarFloat(document.body.firstElementChild as HTMLElement, "right")
  })
  it("sanitizes arbitrary HTML while preserving safe inline styles", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: '<style>body { display: none }</style><link rel="stylesheet"><dialog><p style="color: red" onclick="evil()">Safe<script>while(true) {}</script></p></dialog>',
    })

    expect(Array.from(document.body.children, element => element.localName)).toEqual(["p", "p"])
    expect(document.body.firstElementChild?.textContent).toBe("Safe")
    expect((document.body.firstElementChild as HTMLElement).style.color).toBe("red")
    expectFarFloat(document.body.firstElementChild as HTMLElement, "right")
    expect(document.querySelector("script, style, link[rel~='stylesheet']")).toBeNull()
  })
  it("schema-corrects arbitrary HTML before insertion", () => {
    const correct = vi.spyOn(editor.schema, "checkAndCorrect")

    editor.features.manipulation.actions.insert({type: "insert", html: "<ul><p>Item</p></ul>"})

    expect(correct).toHaveBeenCalledWith(expect.any(HTMLBodyElement), true)
    expect(document.querySelector("ul")?.firstElementChild?.localName).toBe("li")
  })
  it.each([false, true])("unwraps inserted heading groups while preserving their content (transfer=%s)", transfer => {
    const {fragment} = editor.parseHTMLFragment('<hgroup><p>Before</p><h2>Title</h2><hgroup><p>Nested</p></hgroup><!-- keep --><test-widget><hgroup><h3>Widget</h3></hgroup></test-widget></hgroup>', transfer)
    expect(fragment.querySelector("hgroup")).toBeNull()
    expect(Array.from(fragment.children).map(element => element.localName)).toEqual(["p", "h2", "p", "test-widget"])
    expect(fragment.textContent).toBe("BeforeTitleNestedWidget")
    expect(fragment.childNodes[3].nodeType).toBe(Node.COMMENT_NODE)
    expect(fragment.childNodes[3].textContent).toBe(" keep ")
    expect(fragment.querySelector("test-widget")?.innerHTML).toBe("<h3>Widget</h3>")
  })
  it("preserves absent contenteditable when HTML is inserted through its action handler", async () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<section><webwriter-demo></webwriter-demo></section>",
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector("webwriter-demo")).not.toHaveAttribute("contenteditable")
    expect(Array.from(document.body.children, element => element.localName)).toEqual(["section", "p"])
    expect(document.querySelector("section > webwriter-demo")).not.toBeNull()
    expectFarFloat(document.querySelector("section")!, "right")
  })
  it("preserves authored contenteditable through inserted widget undo and redo", async () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: '<webwriter-demo contenteditable="false"></webwriter-demo>',
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    editor.doc.syncFromDOM()
    const insertedHTML = editor.toHTML(true)
    editor.doc.undo()
    expect(document.querySelector("webwriter-demo")).toBeNull()
    editor.doc.redo()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector("webwriter-demo")).toHaveAttribute("contenteditable", "false")
    expect(editor.toHTML(true)).toBe(insertedHTML)
  })
  it("capture-selects a directly inserted widget", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<webwriter-demo></webwriter-demo>",
    })

    const widget = document.querySelector("webwriter-demo")!
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(Array.from(document.body.children, element => element.localName)).toEqual(["webwriter-demo", "p"])
    expectFarFloat(widget as HTMLElement, "right")
  })
  it.each(["node", "HTML"] as const)("replaces a capture-selected widget through %s insertion", kind => {
    document.body.innerHTML = "<p>before</p><opaque-widget><span>Authored fallback</span></opaque-widget><p>after</p>"
    const widget = document.querySelector("opaque-widget")!
    widget.attachShadow({mode: "open"}).innerHTML = "<span>Rendered label</span>"
    editor.features.selection.captureElement(widget)
    expect(document.getSelection()?.isCollapsed).toBe(true)

    if(kind === "node") editor.features.manipulation.insert(document.createElement("replacement-widget"))
    else editor.features.manipulation.insertHTML("<replacement-widget></replacement-widget>")

    expect(widget.isConnected).toBe(false)
    expectBodyToBe("<p>before</p><replacement-widget></replacement-widget><p>after</p>")
    expect(editor.features.selection.captureSelectedElement?.localName).toBe("replacement-widget")
  })
  it("replaces a capture-selected inline widget without changing surrounding text", () => {
    editor.schema.extendWidgets([{tagName: "opaque-widget", editingConfig: {inline: true, group: "phrasing"}}])
    document.body.innerHTML = "<p>before<opaque-widget>fallback</opaque-widget>after</p>"
    const widget = document.querySelector("opaque-widget")!
    editor.features.selection.captureElement(widget)

    editor.features.manipulation.insertHTML("<em>new</em>")

    expect(widget.isConnected).toBe(false)
    expectBodyToBe("<p>before<em>new</em>after</p>")
  })
  it.each(["empty paragraph", "gap", "block split", "inline", "HTML", "paste"])("element-selects a contentful widget inserted through %s", async context => {
    editor.schema.extendWidgets([{
      tagName: "webwriter-demo",
      editingConfig: {content: "flow*", ...(context === "inline" ? {inline: true, group: "phrasing"} : {})},
    }])
    if(context === "gap") {
      document.body.innerHTML = "<section><p>before</p><!--keep--><p>after</p></section>"
      $.selectGap(document.querySelector("p")!)
    }
    else if(context === "block split" || context === "inline") {
      document.body.innerHTML = "<p>before after</p>"
      $.move(document.querySelector("p")!.firstChild!, 6)
    }
    if(context === "HTML") editor.features.manipulation.actions.insert({type: "insert", html: "<webwriter-demo><p>inside</p></webwriter-demo>"})
    else if(context === "paste") {
      await navigator.clipboard.write([new ClipboardItem({"text/html": "<webwriter-demo><p>inside</p></webwriter-demo>"})])
      await editor.features.manipulation.paste()
    }
    else editor.features.manipulation.insert(document.createElement("webwriter-demo"))

    const widget = document.querySelector("webwriter-demo")!
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget).not.toHaveClass("◆element-capture-selected")
    expect(editor.features.selection.isCaptureSelection).toBe(false)
    expect(editor.toHTML(true)).not.toContain("◆")
  })
  it("edits and formats a paragraph inside a contentful widget with undo and redo", () => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo", editingConfig: {content: "flow*"}}])
    document.body.innerHTML = '<webwriter-demo><!--keep--><div><p>hello</p></div></webwriter-demo>'
    const widget = document.querySelector("webwriter-demo")!
    widget.attachShadow({mode: "open"}).append(document.createElement("slot"))
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    const input = new KeyboardEvent("keydown", {bubbles: true, composed: true, cancelable: true, key: "Enter"})
    paragraph.dispatchEvent(input)
    expect(input.defaultPrevented).toBe(true)
    expectBodyToBe('<webwriter-demo><!--keep--><div><p>he</p><p>llo</p></div></webwriter-demo>')
    expect(editor.features.manipulation.setBlockStyle({"text-align": "center"})).toBe(1)
    editor.doc.syncFromDOM()
    expect(widget.querySelectorAll("p")[1]).toHaveStyle({textAlign: "center"})
    expect(editor.features.selection.isCaptureSelection).toBe(false)

    editor.doc.undo()
    expectBodyToBe('<webwriter-demo><!--keep--><div><p>hello</p></div></webwriter-demo>')
    editor.doc.redo()
    expect(document.querySelectorAll("p")).toHaveLength(2)
    expect(document.querySelectorAll("p")[1]).toHaveStyle({textAlign: "center"})
    expect(editor.toHTML(true)).toContain("<!--keep-->")
  })
  it.each(["empty paragraph", "gap", "inline"])("capture-selects a widget inserted into an %s through the node API", context => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo", editingConfig: context === "inline" ? {inline: true, group: "phrasing"} : {}}])
    if(context === "gap") {
      document.body.innerHTML = "<section><p>before</p><!--keep--><p>after</p></section>"
      $.selectGap(document.querySelector("p")!)
    }
    const widget = document.createElement("webwriter-demo")

    editor.features.manipulation.insert(widget)

    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.toHTML(true)).not.toContain("◆")
  })
  it.each(["open", "closed"] as const)("inserts a widget without selecting its %s shadow content", mode => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo"}])
    document.body.innerHTML = "<section><p>before</p><!--keep--><p>after</p></section>"
    $.selectGap(document.querySelector("p")!)
    const widget = document.createElement("webwriter-demo")
    const shadow = widget.attachShadow({mode})
    shadow.innerHTML = '<span>Private label</span><div contenteditable="true">Editable text</div>'

    editor.features.manipulation.insert(widget)
    editor.features.selection.processSelection()

    const selection = document.getSelection()!
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorNode).toBe(widget.parentNode)
    expect(selection.toString()).toBe("")
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.toHTML(true)).toBe("<section><p>before</p><webwriter-demo></webwriter-demo><!--keep--><p>after</p></section>")

    const editable = shadow.querySelector<HTMLElement>("div")!
    editable.focus()
    selection.setBaseAndExtent(editable.firstChild!, 1, editable.firstChild!, 5)
    editable.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    editor.features.selection.processSelection()
    editor.features.selection.captureElement(widget, {preserveNativeSelection: true})
    expect(selection.anchorNode).toBe(editable.firstChild)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.focusOffset).toBe(5)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
  })
  it("capture-selects an inline widget inserted through its action handler", () => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo", editingConfig: {inline: true, group: "phrasing"}}])
    document.body.innerHTML = "<p>before after</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)

    editor.features.manipulation.actions.insert({type: "insert", html: "<webwriter-demo></webwriter-demo>"})

    const widget = document.querySelector("webwriter-demo")!
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect((document.querySelector("webwriter-demo") as HTMLElement | null)?.style.float).toBe("right")
  })
  it.each([0, 6, 12])("places an atomic widget beside a paragraph at text offset %i", offset => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo"}])
    document.body.innerHTML = "<p>before after</p>"
    const text = document.querySelector("p")!.firstChild!
    $.move(text, offset)

    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<webwriter-demo></webwriter-demo>",
    })

    expect((document.querySelector("webwriter-demo") as HTMLElement | null)?.style.float).toBe("right")
    const widget = document.querySelector("webwriter-demo")!
    expect(widget.nextElementSibling).toBe(document.querySelector("p"))
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
  })

  it("can insert <p> at document start", () => {
    const p = document.createElement("p")
    $.selectGap(document.body.firstElementChild!, "before")
    editor.features.manipulation.insert(p)
    expect(document.body.firstElementChild).toBe(p)
  })
  it("inserts a node at a gap between elements", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.insert(document.createElement("hr"))
    expectBodyToBe("<p>a</p><hr><p>b</p>")
  })
  it("inserts a schema-conformant default element at a gap", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectGap(document.body.firstElementChild!)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p>a</p><p></p><p>b</p>")
  })
  it("materializes a normal gap between list items on Enter", () => {
    document.body.innerHTML = "<ul><li>a</li><li>b</li></ul>"
    $.selectGap(document.querySelector("li")!)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<ul><li>a</li><li></li><li>b</li></ul>")
    expect($.anchor).toBe(document.querySelectorAll("li")[1])
    expect($.anchorOffset).toBe(0)
  })
  it("replaces the selected element", () => {
    document.body.innerHTML = "<p>old</p>"
    $.selectElement(document.body.firstElementChild!)
    const p = document.createElement("p")
    p.textContent = "new"
    editor.features.manipulation.insert(p)
    expectBodyToBe("<p>new</p>")
  })
  it("splits the containing block when called without a node", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.insert()
    expectBodyToBe("<p>hello</p><p> world</p>")
  })
  it("uses the primary modifier to split the parent", () => {
    document.body.innerHTML = "<section><p>ab</p><p>tail</p></section>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<section><p>a</p></section><section><p>b</p><p>tail</p></section>")
  })
  it("falls back to splitting the element when its parent cannot be split validly", () => {
    document.body.innerHTML = "<details><summary>Heading</summary><p>ab</p></details>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<details open=\"\"><summary>Heading</summary><p>a</p><p>b</p></details>")
  })
  it("continues a heading group with a paragraph when splitting its heading", () => {
    document.body.innerHTML = "<hgroup><h1>ab</h1></hgroup>"
    $.move(document.querySelector("h1")!.firstChild!, 1)
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<hgroup><h1>a</h1><p>b</p></hgroup>")
  })
  it("splits nested marks with their containing block", () => {
    document.body.innerHTML = "<p><b><i>hello</i></b> world</p>"
    $.move(document.querySelector("i")!.firstChild!, 2)
    editor.features.manipulation.insert()
    expectBodyToBe("<p><b><i>he</i></b></p><p><b><i>llo</i></b> world</p>")
    expect($.anchor).toBe(document.querySelectorAll("i")[1].firstChild)
    expect($.anchorOffset).toBe(0)
  })
  it("does not leave empty mark wrappers when splitting at a mark boundary", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    $.move(document.querySelector("b")!.firstChild!, 0)
    editor.features.manipulation.insert()
    expectBodyToBe("<p></p><p><b>hello</b></p>")
  })
  it("splits at the start of a block, leaving an empty block", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 0)
    editor.features.manipulation.insert()
    expectBodyToBe("<p></p><p>hello world</p>")
  })
  it("continues a heading with a paragraph even when not strict", () => {
    document.body.innerHTML = "<h1>hello</h1>"
    $.move(document.body.firstElementChild!.firstChild!, 2)
    editor.features.manipulation.insert()
    expectBodyToBe("<h1>he</h1><p>llo</p>")
  })
  it("splits an inseperable element into a default node when strict", () => {
    document.body.innerHTML = "<h1>hello</h1>"
    $.move(document.body.firstElementChild!.firstChild!, 2)
    editor.features.manipulation.insert(undefined, 0, true)
    expectBodyToBe("<h1>he</h1><p>llo</p>")
  })/*
  it("can laxly insert invalid content", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild?.firstChild!, 2)
    const p = document.createElement("p")
    p.textContent = "test"
    editor.features.manipulation.insert(p)
    expectBodyToBe("<p>he<p>test< /p>llo world</p>")
  })/*
  it("can insert conformantly with split+insert", () => {
    editor.replaceContent("<p>hello world</p>")
    $.move(document.body.firstElementChild?.firstChild!, 2)
    const p = document.createElement("p")
    p.textContent = "test"
    editor.features.manipulation.insert(p, true)
    expectBodyToBe("<p>he</p><p>test</p><p>llo world</p>")
  })*/
})

describe("heading groups", () => {
  it("reports and changes the direct heading while preserving attributes and irregular children", () => {
    document.body.innerHTML = '<hgroup data-origin="remote"><p>Eyebrow</p><h2 id="title"><em>Title</em></h2><x-note></x-note><p>Deck</p></hgroup>'
    $.move(document.querySelector("em")!.firstChild!, 2)

    expect(editor.features.manipulation.getHeadingGroupState()).toEqual({
      heading: "h2", beforeCount: 1, afterCount: 1,
    })
    editor.features.manipulation.setHeadingGroupLevel("h3")

    expectBodyToBe('<hgroup data-origin="remote"><p>Eyebrow</p><h3 id="title"><em>Title</em></h3><x-note></x-note><p>Deck</p></hgroup>')
    expect($.anchor).toBe(document.querySelector("em")!.firstChild)
    expect($.anchorOffset).toBe(2)
  })

  it("keeps a caret in the heading's own text when changing its level", () => {
    document.body.innerHTML = "<hgroup><h2>Heading</h2><p>Deck</p></hgroup>"
    const text = document.querySelector("h2")!.firstChild!
    $.move(text, 5)
    // Moving the children collapses live ranges inside them to the old heading.
    const append = Element.prototype.append
    vi.spyOn(Element.prototype, "append").mockImplementation(function(this: Element, ...nodes) {
      const selection = document.getSelection()!
      const collapses = nodes.some(node => node instanceof Node && node.contains(selection.anchorNode))
      const parent = selection.anchorNode?.parentNode
      append.apply(this, nodes)
      if(collapses && parent) selection.setPosition(parent, 0)
    })
    editor.features.manipulation.setHeadingGroupLevel("h3")
    vi.mocked(Element.prototype.append).mockRestore()
    expect(document.querySelector("h3")!.firstChild).toBe(text)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(5)
  })

  it("adds supporting paragraphs on either side without rebuilding unrelated content", () => {
    document.body.innerHTML = "<hgroup><x-note></x-note><h1>Title</h1><p>Deck</p><x-widget></x-widget></hgroup>"
    $.selectElement(document.querySelector("hgroup")!)

    editor.features.manipulation.addHeadingGroupText("before")
    expect($.anchor).toBe(document.querySelector("hgroup > p:first-of-type"))

    editor.features.manipulation.addHeadingGroupText("after")

    expectBodyToBe("<hgroup><x-note></x-note><p></p><h1>Title</h1><p>Deck</p><p></p><x-widget></x-widget></hgroup>")
    expect(editor.features.manipulation.getHeadingGroupState()).toEqual({
      heading: "h1", beforeCount: 1, afterCount: 2,
    })
  })

  it("repairs only the missing heading when an irregular group has none", () => {
    document.body.innerHTML = "<hgroup><p>Supporting text</p><custom-title></custom-title></hgroup>"
    $.selectElement(document.querySelector("hgroup")!)

    expect(editor.features.manipulation.getHeadingGroupState()).toEqual({
      heading: null, beforeCount: 0, afterCount: 1,
    })
    editor.features.manipulation.setHeadingGroupLevel("h4")

    expectBodyToBe("<hgroup><h4></h4><p>Supporting text</p><custom-title></custom-title></hgroup>")
  })
})

describe("figures", () => {
  it("adds a caption at either valid edge while preserving irregular authored children", () => {
    document.body.innerHTML = '<figure data-origin="remote"><x-media></x-media><img src="photo.png"><p>Notes</p></figure>'
    const figure = document.querySelector("figure")!
    $.selectElement(document.querySelector("img")!)

    expect(editor.features.manipulation.getFigureState()).toEqual({hasCaption: false})
    expect(editor.features.manipulation.addFigureCaption("before")).toBe(true)

    expectBodyToBe('<figure data-origin="remote" id="figure"><figcaption></figcaption><x-media></x-media><img src="photo.png"><p>Notes</p></figure>')
    expect($.anchor).toBe(figure.firstElementChild)
    expect(editor.features.manipulation.getFigureState()).toEqual({hasCaption: true})
    expect(editor.features.manipulation.addFigureCaption("after")).toBe(false)
    expect(figure.querySelectorAll(":scope > figcaption")).toHaveLength(1)
  })

  it("adds a trailing caption to a breadcrumb-selected figure and focuses an existing caption", () => {
    document.body.innerHTML = "<figure><img src=photo.png></figure>"
    $.move(document.body.firstElementChild!)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})

    expect(editor.features.manipulation.addFigureCaption("after")).toBe(true)
    expectBodyToBe('<figure id="figure"><img src="photo.png"><figcaption></figcaption></figure>')
    expect(editor.features.selection.selectedSectionElement).toBeNull()

    $.selectElement(document.querySelector("img")!)
    expect(editor.features.manipulation.editFigureCaption()).toBe(true)
    expect($.anchor).toBe(document.querySelector("figcaption"))
  })
})

describe("document template protection", () => {
  it.each(["backward", "forward"] as const)("%s deletion clears a selected template without removing it", direction => {
    document.body.innerHTML = '<demo-widget role="document"><p>Template content</p></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    editor.features.manipulation.delete(direction)

    expect(document.body.firstElementChild).toBe(template)
    expect(template).toHaveAttribute("role", "document")
    expect(template).toBeEmptyDOMElement()
    expect($.anchor).toBe(template)
    expect($.anchorOffset).toBe(0)
  })

  it("protects an empty widget template from keyboard deletion", () => {
    document.body.innerHTML = '<demo-widget role="document"></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))

    expect(document.body.firstElementChild).toBe(template)
    expect(document.body.children).toHaveLength(1)
  })

  it("replaces a selected template's contents without replacing its wrapper", () => {
    document.body.innerHTML = '<demo-widget role="document"><p>Old content</p></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    document.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "New content",
      bubbles: true,
      cancelable: true,
    }))

    expect(document.body.firstElementChild).toBe(template)
    expect(template).toHaveAttribute("role", "document")
    expect(template).toHaveTextContent("New content")
  })
})

describe("sections", () => {
  it("wraps the current structural element in a section by default", () => {
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    expectBodyToBe("<section><p>hello</p></section>")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(2)
  })

  it("changes the active section type without rebuilding its contents or attributes", () => {
    document.body.innerHTML = '<section class="authored"><p>hello</p></section>'
    const text = document.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "article",
    })).toBe(true)

    expectBodyToBe('<article class="authored"><p>hello</p></article>')
    expect($.anchor).toBe(text)
  })
  it("does not copy editor marker classes when changing section type", () => {
    document.body.innerHTML = '<section class="authored ◆stale-marker"><p>hello</p></section>'
    const section = document.querySelector("section")!
    const text = section.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "article",
    })).toBe(true)

    const replacement = document.querySelector("article")!
    expect(replacement).toHaveClass("authored")
    expect(replacement).not.toHaveClass("◆stale-marker")
  })

  it("splits a section when only one of its elements is toggled off", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p><p>three</p></section>"
    const middle = document.querySelectorAll("p")[1]
    $.move(middle.firstChild!, 1)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    expectBodyToBe("<section><p>one</p></section><p>two</p><section><p>three</p></section>")
    expect($.anchor).toBe(middle.firstChild)
  })
  it("does not copy editor marker classes to split section wrappers", () => {
    document.body.innerHTML = '<section class="authored ◆stale-marker"><p>one</p><p>two</p><p>three</p></section>'
    const middle = document.querySelectorAll("p")[1]
    $.move(middle.firstChild!, 1)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    const wrappers = document.querySelectorAll("section")
    expect(wrappers).toHaveLength(2)
    wrappers.forEach(wrapper => {
      expect(wrapper).toHaveClass("authored")
      expect(wrapper).not.toHaveClass("◆stale-marker")
    })
  })

  it("stacks a default outer section around a breadcrumb-selected section", () => {
    document.body.innerHTML = "<article><p>hello</p></article>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})

    expect(editor.features.manipulation.actions.addSection({type: "addSection"})).toBe(true)

    expectBodyToBe("<section><article><p>hello</p></article></section>")
    expect(editor.features.selection.selectedSectionElement?.localName).toBe("article")
  })

  it("edits and removes empty or inline section wrappers selected from the breadcrumb", () => {
    document.body.innerHTML = "<section></section><article>inline</article>"
    $.move(document.body.firstElementChild!)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [1]})

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "aside",
    })).toBe(true)
    expectBodyToBe("<section></section><aside>inline</aside>")

    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})
    expect(editor.features.manipulation.actions.removeSection({type: "removeSection"})).toBe(true)
    expectBodyToBe("<aside>inline</aside>")
  })
})
describe("Tab paragraph behavior", () => {
  it("indents the paragraph when Tab is pressed at its start", () => {
    document.body.innerHTML = "<p>text</p>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 0)
    const event = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(paragraph).toHaveStyle({marginInlineStart: "2em"})
  })

  it("outdents an indented paragraph with Shift+Tab", () => {
    document.body.innerHTML = '<p style="margin-inline-start: 2em">text</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(paragraph.style.marginInlineStart).toBe("")
  })

  it("indents every paragraph in a cross-block selection", () => {
    document.body.innerHTML = "<p>one</p><p>two</p>"
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(paragraphs[0].firstChild!, 1, paragraphs[1].firstChild!, 2)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}))

    expect(paragraphs.every(paragraph => paragraph.style.marginInlineStart === "2em")).toBe(true)
  })

  it("does not structurally wrap content when Tab is pressed mid-paragraph", () => {
    document.body.innerHTML = "<p>text</p>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p>text</p>")
  })
})
describe("delete()", () => {
  describe.each(["backward", "forward"] as const)("selecting an adjacent widget on %s deletion", direction => {
    it.each(["gap", "inline", "block"])("selects before deleting from a %s caret", shape => {
      const widget = document.createElement("opaque-widget")
      widget.innerHTML = "<unfamiliar-content data-authored='keep'>fallback</unfamiliar-content><!--keep-->"
      widget.attachShadow({mode: "open"}).innerHTML = "<button>Widget control</button>"
      const paragraph = document.createElement("p")
      paragraph.innerHTML = "<strong><em>text</em></strong>"
      const text = paragraph.querySelector("em")!.firstChild!
      if(shape === "inline") {
        direction === "backward" ? paragraph.prepend(widget, document.createComment("between")) : paragraph.append(document.createComment("between"), widget)
        document.body.replaceChildren(paragraph)
      }
      else document.body.replaceChildren(...(direction === "backward" ? [widget, paragraph] : [paragraph, widget]))
      if(shape === "gap") $.selectGap(widget, direction === "backward" ? "after" : "before")
      else $.move(text, direction === "backward" ? 0 : 4)
      const before = editor.toHTML(true)
      const key = direction === "backward" ? "Backspace" : "Delete"

      document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))

      expect($.selectedElement).toBe(widget)
      expect(editor.features.selection.isCaptureSelection).toBe(false)
      expect(editor.toHTML(true)).toBe(before)
      expect(widget).toHaveClass("◆element-selected")
      document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
      expect(widget.isConnected).toBe(false)
      expect(paragraph.textContent).toBe("text")
    })

    it("selects a widget at the document boundary", () => {
      document.body.innerHTML = "<opaque-widget></opaque-widget>"
      const widget = document.body.firstElementChild!
      $.selectGap(widget, direction === "backward" ? "after" : "before")
      editor.features.manipulation.delete(direction)
      expect($.selectedElement).toBe(widget)
      expect(widget.isConnected).toBe(true)
    })

    it("does not intercept deletion beside a contentful widget", () => {
      editor.schema.extendWidgets([{tagName: "content-widget", editingConfig: {content: "text*"}}])
      document.body.innerHTML = "<content-widget>text</content-widget>"
      const widget = document.body.firstElementChild!
      $.selectGap(widget, direction === "backward" ? "after" : "before")
      expect(editor.features.selection.selectAdjacentContentlessWidget(direction)).toBe(false)
      expect($.selectedElement).not.toBe(widget)
    })

    it("uses the current sibling after a widget is replaced", () => {
      document.body.innerHTML = "<opaque-widget></opaque-widget>"
      const widget = document.body.firstElementChild!
      $.selectGap(widget, direction === "backward" ? "after" : "before")
      const replacement = document.createElement("replacement-widget")
      widget.replaceWith(replacement)
      $.selectGap(replacement, direction === "backward" ? "after" : "before")
      editor.features.manipulation.delete(direction)
      expect($.selectedElement).toBe(replacement)
      expect(widget).not.toHaveClass("◆element-selected")
    })
  })

  it("uses Ctrl for word deletion on non-Apple platforms", () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      const deletion = vi.spyOn(editor.features.manipulation, "delete").mockImplementation(() => undefined)

      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Backspace", ctrlKey: true, bubbles: true, cancelable: true,
      }))
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Delete", ctrlKey: true, bubbles: true, cancelable: true,
      }))

      expect(deletion).toHaveBeenNthCalledWith(1, "backward", "word")
      expect(deletion).toHaveBeenNthCalledWith(2, "forward", "word")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

  it("uses Option for words and Command for line boundaries on Apple platforms", () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      const deletion = vi.spyOn(editor.features.manipulation, "delete").mockImplementation(() => undefined)

      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Backspace", altKey: true, bubbles: true, cancelable: true,
      }))
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Delete", metaKey: true, bubbles: true, cancelable: true,
      }))

      expect(deletion).toHaveBeenNthCalledWith(1, "backward", "word")
      expect(deletion).toHaveBeenNthCalledWith(2, "forward", "line")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

  it("deletes the selected text range", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 6)
    editor.features.manipulation.delete()
    expectBodyToBe("<p>world</p>")
  })
  it("deletes a selected element", () => {
    document.body.innerHTML = "<p>hello</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.delete()
    expectBodyToBe("<p></p>")
  })
  it("removes an empty element and moves the caret to the previous node", () => {
    document.body.innerHTML = "<p>a</p><p></p>"
    $.move(document.body.lastElementChild!, 0)
    editor.features.manipulation.delete()
    expectBodyToBe("<p>a</p>")
  })
  it("removes a sole empty element", () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.body.firstElementChild!, 0)
    editor.features.manipulation.delete()
    expectBodyToBe("<p></p>")
  })
  it("moves the caret to the next element when deleting an empty first element", () => {
    document.body.innerHTML = "<p></p><p>hello</p>"
    const next = document.body.lastElementChild!
    $.move(document.body.firstElementChild!, 0)

    editor.features.manipulation.delete("forward")

    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(next)
    expect($.anchorOffset).toBe(0)
  })
  it("keeps Enter working after deleting an empty first element", () => {
    document.body.innerHTML = "<p></p><p>hello</p>"
    $.move(document.body.firstElementChild!, 0)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p></p><p>hello</p>")
  })
  it("merges two blocks on backward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("joins equivalent mark runs when merging blocks", () => {
    document.body.innerHTML = "<p><b>hello</b></p><p><b>world</b></p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p><b>helloworld</b></p>")
    expect($.anchor).toBe(document.querySelector("b")!.firstChild)
    expect($.anchorOffset).toBe(5)
  })
  it("merges two blocks on forward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("moves to the end of the last block on backward delete at the final gap", () => {
    document.body.innerHTML = "<p>hello</p>"
    const block = document.body.firstElementChild!
    $.selectGap(block)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(block)
    expect($.anchorOffset).toBe(block.childNodes.length)
  })
  it("moves to the start of the first block on forward delete at the initial gap", () => {
    document.body.innerHTML = "<p>hello</p>"
    const block = document.body.firstElementChild!
    $.selectGap(block, "before")
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(block)
    expect($.anchorOffset).toBe(0)
  })
  it("removes only an empty previous element on backward delete", () => {
    document.body.innerHTML = "<p>a</p><p></p><h1>b</h1>"
    $.selectGap(document.body.children[1])
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>a</p><h1>b</h1>")
  })
  it("removes only an empty next element on forward delete", () => {
    document.body.innerHTML = "<p>a</p><h1></h1><p>b</p>"
    $.selectGap(document.body.children[1], "before")
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>a</p><p>b</p>")
  })
  it("removes an empty previous element when deleting backward at the next element's start", () => {
    document.body.innerHTML = "<p>a</p><p></p><h1>b</h1>"
    $.move(document.body.lastElementChild!.firstChild!, 0)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>a</p><h1>b</h1>")
  })
  it("removes an empty next element when deleting forward at the previous element's end", () => {
    document.body.innerHTML = "<p>a</p><h1></h1><p>b</p>"
    $.move(document.body.firstElementChild!.firstChild!, 1)
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>a</p><p>b</p>")
  })
  it("deletes from block start to the caret with block granularity", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.delete("backward", "block")
    expectBodyToBe("<p> world</p>")
  })
  // character/word/line granularities rely on Selection.modify(), which
  // happy-dom does not implement, so they cannot be tested in this environment.
})
describe("split()")
describe("join()")
describe("wrap()", () => {
  it("wraps a <p> in a <div>", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.wrap(document.createElement("div"))
    expectBodyToBe(`<div><p>hello world</p></div>`)
  })
  it("wraps text in a <b>", async () => {
    document.body.innerHTML = "hello world"
    $.selectRange(document.body.firstChild!, 0, document.body.firstChild!, 5)
    editor.features.manipulation.wrap(document.createElement("b"))
    expectBodyToBe(`<b>hello</b> world`)
  })
  it("accepts a fragment as wrapper", () => {
    document.body.innerHTML = "<p>a</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.wrap(fragmentFromHTML("<section></section>"))
    expectBodyToBe(`<section><p>a</p></section>`)
  })
  it("does nothing for an empty or text-only fragment wrapper", () => {
    document.body.innerHTML = "<p>a</p>"
    $.selectElement(document.body.firstElementChild!)

    expect(() => editor.features.manipulation.wrap(fragmentFromHTML(""))).not.toThrow()
    expectBodyToBe("<p>a</p>")
    expect(() => editor.features.manipulation.wrap(fragmentFromHTML("text"))).not.toThrow()
    expectBodyToBe("<p>a</p>")
  })
  it("wraps multiple selected blocks", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectRange(document.body, 0, document.body, 2)
    editor.features.manipulation.wrap(document.createElement("div"))
    expectBodyToBe(`<div><p>a</p><p>b</p></div>`)
  })
  it("moves the current block into the previous element when called without a wrapper", () => {
    document.body.innerHTML = "<div>x</div><p>b</p>"
    $.move(document.body.lastElementChild!.firstChild!, 0)
    editor.features.manipulation.wrap()
    expectBodyToBe(`<div>x<p>b</p></div>`)
  })
  it("does nothing without a wrapper when there is no adjacent element", () => {
    document.body.innerHTML = "<p>b</p>"
    $.move(document.body.firstElementChild!.firstChild!, 0)
    const result = editor.features.manipulation.wrap()
    expect(result).toBeUndefined()
    expectBodyToBe(`<p>b</p>`)
  })
})
describe("lift()", () => {
  it("lifts an element out of its parent", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>hello</p>`)
  })
  it("lifts the element containing the caret", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>hello</p>`)
  })
  it("lifts the block rather than a mark containing the caret", () => {
    document.body.innerHTML = "<div><p><b>hello</b></p></div>"
    $.move(document.querySelector("b")!.firstChild!, 2)
    editor.features.manipulation.lift()
    expectBodyToBe("<p><b>hello</b></p>")
  })
  it("splits the parent around a lifted element with siblings", () => {
    document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
    $.selectElement(document.querySelectorAll("p").item(1))
    editor.features.manipulation.lift()
    expectBodyToBe(`<div><p>a</p></div><p>b</p><div><p>c</p></div>`)
  })
  it("lifts multiple levels with depth", () => {
    document.body.innerHTML = "<section><div><p>x</p></div></section>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift(2)
    expectBodyToBe(`<p>x</p>`)
  })
  it("does nothing for an element at the body level", () => {
    document.body.innerHTML = "<p>top</p>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>top</p>`)
  })
  it("selects the lifted element", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    const p = document.querySelector("p")!
    $.selectElement(p)
    editor.features.manipulation.lift()
    expect($.selectedElement).toBe(p)
  })
})
describe("copy()", () => {
  it("fills the clipboard with correct HTML", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expectBodyToBe(html!)
  })
  it("leaves the document unchanged", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.copy()
    expectBodyToBe("<p>hello world</p>")
  })
  it("fills the clipboard with a plain text flavor", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello world")
  })
  it("copies a plain text selection", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 5)
    await editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello")
  })

  it("preserves block boundaries in the plain-text flavor of a native copy", () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
    const clipboardData = new DataTransfer()
    const event = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(clipboardData.getData("text/html")).toContain(">First</p>")
    expect(clipboardData.getData("text/html")).toContain(">Second</p>")
    expect(clipboardData.getData("text/plain")).toMatch(/^First\r?\n+Second$/)
  })
  it("serializes every selected sibling into the programmatic HTML flavor", async () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, 2)

    await editor.features.manipulation.copy()

    const item = (await navigator.clipboard.read()).find(candidate => candidate.types.includes("text/html"))!
    const html = await (await item.getType("text/html")).text()
    expect(html).toContain("<p>First</p>")
    expect(html).toContain("<p>Second</p>")
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"))
  })
})
describe("cut()", () => {
  it("fills the clipboard with correct HTML", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.cut()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expect(html).toBe("<p>hello world</p>")
  })
  it("removes content from the DOM", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.cut()
    expectBodyToBe("<p></p>")
  })
  it("cuts a partial text selection", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 5)
    await editor.features.manipulation.cut()
    expectBodyToBe("<p> world</p>")
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello")
  })
  it("does not delete content when the clipboard write fails", async () => {
    document.body.innerHTML = "<p>keep me</p>"
    $.selectElement(document.body.firstElementChild!)
    const write = navigator.clipboard.write
    try {
      Object.defineProperty(navigator.clipboard, "write", {
        value: vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")),
        configurable: true,
      })

      let rejection: unknown
      try {
        await editor.features.manipulation.cut()
      }
      catch(error) {
        rejection = error
      }

      expect(rejection).toMatchObject({message: "Clipboard denied"})
      expectBodyToBe("<p>keep me</p>")
    }
    finally {
      Object.defineProperty(navigator.clipboard, "write", {value: write, configurable: true})
    }
  })

  it("does not cut a selected element whose subtree changed while the clipboard write was pending", async () => {
    document.body.innerHTML = "<p>original</p><p>end</p>"
    const selected = document.body.firstElementChild!
    $.selectElement(selected)
    let resolveWrite!: () => void
    const write = navigator.clipboard.write
    Object.defineProperty(navigator.clipboard, "write", {
      value: vi.fn(() => new Promise<void>(resolve => { resolveWrite = resolve })),
      configurable: true,
    })
    try {
      const cutting = editor.features.manipulation.cut()
      const selection = document.getSelection()!
      const endpoints = [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]
      selected.textContent = "changed"
      expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual(endpoints)
      resolveWrite()

      await expect(cutting).resolves.toBe(false)
      expectBodyToBe("<p>changed</p><p>end</p>")
    }
    finally { Object.defineProperty(navigator.clipboard, "write", {value: write, configurable: true}) }
  })

  it("does not cut a replacement node with the same outer selection endpoints", async () => {
    document.body.innerHTML = "<p>original</p><p>end</p>"
    const selected = document.body.firstElementChild!
    $.selectElement(selected)
    let resolveWrite!: () => void
    const write = navigator.clipboard.write
    Object.defineProperty(navigator.clipboard, "write", {
      value: vi.fn(() => new Promise<void>(resolve => { resolveWrite = resolve })),
      configurable: true,
    })
    try {
      const cutting = editor.features.manipulation.cut()
      const selection = document.getSelection()!
      const endpoints = [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]
      const replacement = document.createElement("p")
      replacement.textContent = "original"
      selected.replaceWith(replacement)
      expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual(endpoints)
      resolveWrite()

      await expect(cutting).resolves.toBe(false)
      expectBodyToBe("<p>original</p><p>end</p>")
      expect(document.body.firstElementChild).toBe(replacement)
    }
    finally { Object.defineProperty(navigator.clipboard, "write", {value: write, configurable: true}) }
  })
})
describe("paste()", () => {
  it("handles a native plain-text paste into an empty document", () => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", "pasted text")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>pasted text</p>")
    expect($.anchor).toBe(document.querySelector("p")?.firstChild)
    expect($.anchorOffset).toBe(11)
  })

  it("handles a native plain-text paste at a trailing gap", () => {
    document.body.innerHTML = "<p>existing</p>"
    $.selectGap(document.body.firstElementChild!)
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", "pasted")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>existing</p><p>pasted</p>")
  })

  it("keeps block HTML at the document root on native paste", () => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/html", "<h1>Heading</h1>")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<h1>Heading</h1>")
  })

  it("fills the DOM with correct HTML clipboard content", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "test",
      "text/html": "<p>hello world</p>"
    })])
    $.move(document.body.firstElementChild!)
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>hello world</p>")
  })
  it("replaces the selected element with clipboard content", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "new",
      "text/html": "<p>new</p>"
    })])
    document.body.innerHTML = "<p>old</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>new</p>")
  })
  it("pastes plain text into the initial paragraph", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "test"
    })])
    $.move(document.body.firstElementChild!)
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>test</p>")
  })

  it("does not parse markup characters from a plain-text clipboard flavor", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "<b>text</b>"
    })])
    $.move(document.body.firstElementChild!)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>&lt;b&gt;text&lt;/b&gt;</p>")
  })
  it("replaces inline text without splitting its paragraph", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "new",
      "text/html": "<b>new</b>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 1, text, 4)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>h<b>new</b>o</p>")
  })
  it("places pasted blocks beside the split paragraph", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "Title",
      "text/html": "<h1>Title</h1>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>he</p><h1>Title</h1><p>llo</p>")
  })
  it("preserves a pasted custom element as an atomic native float", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "Widget",
      "text/html": "<demo-widget>Widget</demo-widget>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    await editor.features.manipulation.paste()

    expect(document.querySelector("demo-widget")).toHaveClass("ww-float-right")
    expect(document.querySelector("demo-widget")).not.toHaveAttribute("contenteditable")
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBe(document.querySelector("demo-widget"))
  })
  it("preserves plain-text line boundaries as soft breaks", async () => {
    await navigator.clipboard.write([new ClipboardItem({"text/plain": "one\ntwo"})])
    $.move(document.body.firstElementChild!)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>one<br>two</p>")
  })
  it("handles native paste consistently inside an ordinary text selection", () => {
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 1, text, 4)
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/html", '<i class="◆text-selected external">new</i>')
    clipboardData.setData("text/plain", "new")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe('<p>h<i>new</i>o</p>')
  })
})
describe("setAttributes()", () => {
  it("can set a title attribute", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: "test"})
    expect((document.body.firstElementChild as HTMLElement).title).toEqual("test")
  })
  it("can remove an attribute by passing null", () => {
    document.body.innerHTML = `<p title="test">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: null})
    expect((document.body.firstElementChild as HTMLElement)).not.toHaveAttribute("title")
  })
  it("preserves an empty value for boolean authored attributes", () => {
    document.body.innerHTML = "<details><summary>More</summary></details>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({open: ""})
    expect(document.body.firstElementChild).toHaveAttribute("open", "")
  })
  it("accepts null removal through the action payload", () => {
    document.body.innerHTML = `<p title="test">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.actions.setAttributes({type: "setAttributes", attrs: {title: null}})
    expect(document.body.firstElementChild).not.toHaveAttribute("title")
  })
  it("can set and remove attributes in the same call", () => {
    document.body.innerHTML = `<p id="old">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: "test", id: null})
    expect(document.body.firstElementChild).toHaveAttribute("title", "test")
    expect(document.body.firstElementChild).not.toHaveAttribute("id")
  })
  it("applies attributes to every element in a cross-block selection", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.lastElementChild!.firstChild!, 1)
    editor.features.manipulation.setAttributes({title: "test"})
    expect(document.body.firstElementChild).toHaveAttribute("title", "test")
    expect(document.body.lastElementChild).toHaveAttribute("title", "test")
  })
  it("does not affect elements outside the selection", () => {
    document.body.innerHTML = "<p>a</p><p>b</p><p>c</p>"
    $.selectElement(document.body.children.item(1)!)
    editor.features.manipulation.setAttributes({title: "test"})
    expect(document.body.children.item(0)).not.toHaveAttribute("title")
    expect(document.body.children.item(1)).toHaveAttribute("title", "test")
    expect(document.body.children.item(2)).not.toHaveAttribute("title")
  })

  it.each(["script", "style"])("does not mutate a selected <%s> through the bulk attribute command", localName => {
    const element = document.createElement(localName)
    document.body.replaceChildren(element)
    $.selectElement(element)

    expect(() => editor.features.manipulation.setAttributes({title: "changed"})).toThrow("not editable")
    expect(element).not.toHaveAttribute("title")
  })

  it("normalizes adjacent text nodes after a command", () => {
    document.body.innerHTML = "<p>a</p>"
    const p = document.body.firstElementChild!
    const first = p.firstChild!
    p.append(document.createTextNode("b"))
    $.move(first, 1)

    editor.features.manipulation.setAttributes({title: "test"})

    expect(p.childNodes).toHaveLength(1)
    expect(p.textContent).toBe("ab")
  })
})

describe("explicit multi-element selection editing", () => {
  const htmlNamespace = "http://www.w3.org/1999/xhtml"
  const selectionType = {localName: "p", namespaceURI: htmlNamespace}
  const selectOnCanvas = (elements: Element[]) => {
    expect(editor.setDocumentLayout("canvas", "document")).toBe(true)
    $.selectElements(elements)
  }

  it("projects common and mixed state by selected element type", () => {
    document.body.innerHTML = '<p id="one" title="shared" style="color: red; width: 10px">one</p><!--keep--><p id="two" title="shared" style="color: red; width: 20px">two</p><img alt="diagram"><p id="outside" title="outside">outside</p>'
    const paragraphs = document.querySelectorAll("p")
    const image = document.querySelector("img")!
    const outside = document.body.lastElementChild!
    selectOnCanvas([paragraphs[0], paragraphs[1], image])

    const states = editor.features.manipulation.getSelectedElementTypes(["color", "width", "display"])

    expect(states.map(({element, count}) => [element.localName, element.namespaceURI, count])).toEqual([
      ["p", htmlNamespace, 2], ["img", htmlNamespace, 1],
    ])
    const paragraphGroup = states.find(state => state.element.localName === "p")!
    expect(paragraphGroup.element.attributes).toMatchObject({title: "shared"})
    expect(paragraphGroup.element.attributes).not.toHaveProperty("id")
    expect(paragraphGroup.style.inline.color).toEqual({value: "red", priority: ""})
    expect(paragraphGroup.style.inline).not.toHaveProperty("width")
    expect(paragraphGroup.style.computed).toHaveProperty("display")
    expect(outside).toHaveAttribute("id", "outside")
    expect(document.body.childNodes[1]).toBeInstanceOf(Comment)
  })

  it("shares style reads and applies style changes across every explicitly selected element", () => {
    document.body.innerHTML = '<p id="one" style="color: red">one</p><p id="two" style="color: blue">two</p><img alt="diagram"><p id="outside">outside</p>'
    const [first, second, image] = Array.from(document.body.children)
    const outside = document.body.lastElementChild!
    selectOnCanvas([first, second, image])

    const mixed = editor.features.manipulation.getStyleState(["color"])
    expect(mixed.inline).not.toHaveProperty("color")
    editor.features.manipulation.setStyle({color: {value: "rebeccapurple", priority: "important"}})

    for(const element of [first, second, image]) {
      expect((element as HTMLElement).style.getPropertyValue("color")).toBe("rebeccapurple")
      expect((element as HTMLElement).style.getPropertyPriority("color")).toBe("important")
    }
    expect((outside as HTMLElement).style.color).toBe("")
    expect(editor.features.manipulation.getStyleState(["color"]).inline.color)
      .toEqual({value: "rebeccapurple", priority: "important"})
  })

  it("mutates only matching HTML elements in the current explicit selection and preserves surrounding DOM", () => {
    document.body.innerHTML = '<p id="first" title="old" data-keep="yes" style="color: red">one</p><!--keep--><p id="second" title="old" data-keep="yes">two</p><img alt="diagram"><svg xmlns="http://www.w3.org/2000/svg"></svg><p id="outside">outside</p>'
    const [first, second, image, svg] = Array.from(document.body.children)
    const svgParagraph = document.createElementNS("http://www.w3.org/2000/svg", "p")
    svgParagraph.id = "svg-p"
    svgParagraph.textContent = "vector"
    svg.append(svgParagraph)
    const outside = document.body.lastElementChild!
    selectOnCanvas([first, second, image, svgParagraph])

    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType,
      name: "data-source", previousName: "title", value: "curriculum",
    })
    editor.features.manipulation.actions.setSelectedElementStyles({
      type: "setSelectedElementStyles", selectionType,
      styles: {"background-color": "gold", width: "120px"},
    })

    for(const paragraph of [first, second]) {
      expect(paragraph).toHaveAttribute("data-source", "curriculum")
      expect(paragraph).not.toHaveAttribute("title")
      expect(paragraph).toHaveAttribute("data-keep", "yes")
      expect(paragraph).toHaveStyle({backgroundColor: "gold", width: "120px"})
    }
    expect(image).toHaveAttribute("alt", "diagram")
    expect(image).not.toHaveAttribute("data-source")
    expect(svgParagraph).toHaveAttribute("id", "svg-p")
    expect(svgParagraph).not.toHaveAttribute("data-source")
    expect(outside).toHaveAttribute("id", "outside")
    expect(document.body.childNodes[1]).toBeInstanceOf(Comment)
    expect(document.body.children).toHaveLength(5)
  })

  it("uses the current selection and safely ignores disconnected members", () => {
    document.body.innerHTML = '<p id="first">one</p><p id="second">two</p><p id="third">three</p>'
    const [first, second, third] = Array.from(document.body.children)
    selectOnCanvas([first, second])
    $.selectElements([second, third])

    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType, name: "title", value: "current",
    })
    expect(second).toHaveAttribute("title", "current")
    expect(third).toHaveAttribute("title", "current")
    expect(first).not.toHaveAttribute("title")

    third.remove()
    expect(() => editor.features.manipulation.actions.setSelectedElementStyles({
      type: "setSelectedElementStyles", selectionType, styles: {color: "red"},
    })).not.toThrow()
    expect((first as HTMLElement).style.color).toBe("")
  })

  it("does not apply a type-specific mutation to another selected element type", () => {
    document.body.innerHTML = '<p id="outside">one</p><img id="only" alt="diagram">'
    const image = document.querySelector("img")!
    $.selectElement(image)

    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType, name: "title", value: "ignored",
    })
    editor.features.manipulation.actions.setSelectedElementStyles({
      type: "setSelectedElementStyles", selectionType, styles: {color: "red"},
    })

    expect(image).not.toHaveAttribute("title")
    expect((image as HTMLElement).style.color).toBe("")
  })

  it("projects and edits the paragraph and its ancestors at a collapsed text caret", () => {
    document.body.innerHTML = '<section id="section"><div id="container"><p id="target">hello</p></div></section>'
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 2)

    const states = editor.features.manipulation.getSelectedElementTypes()
    expect(states.map(state => [state.element.localName, state.count])).toEqual(expect.arrayContaining([
      ["p", 1], ["div", 1], ["section", 1],
    ]))
    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType, name: "title", value: "selected",
    })

    expect(document.querySelector("#target")).toHaveAttribute("title", "selected")
    expect(document.querySelector("#container")).not.toHaveAttribute("title")
  })

  it("projects an atomic widget host instead of its internal descendants", () => {
    document.body.innerHTML = '<section><demo-widget id="widget"><span id="inside">inside</span></demo-widget></section>'
    const text = document.querySelector("#inside")!.firstChild!
    $.selectRange(text, 0, text, 2)

    const states = editor.features.manipulation.getSelectedElementTypes()
    expect(states.map(state => state.element.localName)).toContain("demo-widget")
    expect(states.map(state => state.element.localName)).not.toContain("span")
    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute",
      selectionType: {localName: "demo-widget", namespaceURI: htmlNamespace},
      name: "title", value: "host",
    })

    expect(document.querySelector("demo-widget")).toHaveAttribute("title", "host")
    expect(document.querySelector("#inside")).not.toHaveAttribute("title")
  })

  it("groups and edits all authored containers intersected across nested sections", () => {
    document.body.innerHTML = '<section id="first-section"><p id="first"><span>one</span><!--keep--></p></section><section id="second-section"><p id="second"><em>two</em></p></section>'
    const [firstText, secondText] = [document.querySelector("span")!.firstChild!, document.querySelector("em")!.firstChild!]
    $.selectRange(firstText, 0, secondText, 3)

    const states = editor.features.manipulation.getSelectedElementTypes()
    expect(states.map(state => [state.element.localName, state.count])).toEqual(expect.arrayContaining([
      ["p", 2], ["section", 2], ["span", 1], ["em", 1],
    ]))
    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType, name: "data-selected", value: "yes",
    })
    editor.features.manipulation.actions.setSelectedElementStyles({
      type: "setSelectedElementStyles", selectionType: {localName: "section", namespaceURI: htmlNamespace},
      styles: {"background-color": "gold"},
    })

    expect(document.querySelector("#first")).toHaveAttribute("data-selected", "yes")
    expect(document.querySelector("#second")).toHaveAttribute("data-selected", "yes")
    expect(document.querySelector("#first-section")).toHaveStyle({backgroundColor: "gold"})
    expect(document.querySelector("#second-section")).toHaveStyle({backgroundColor: "gold"})
    expect(document.querySelector("#first-section")!.firstChild!.firstChild!.nextSibling).toBeInstanceOf(Comment)
  })

  it("records matching element mutations as one undoable change", async () => {
    document.body.innerHTML = '<p id="one">one</p><p id="two">two</p><img alt="diagram">'
    const [first, second, image] = Array.from(document.body.children)
    selectOnCanvas([first, second, image])
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    editor.features.manipulation.actions.setSelectedElementAttribute({
      type: "setSelectedElementAttribute", selectionType, name: "title", value: "selected",
    })
    expect(first).toHaveAttribute("title", "selected")
    expect(second).toHaveAttribute("title", "selected")
    expect(sharedDOMBody(editor.doc.doc).toString()).toContain('title="selected"')
    editor.doc.undo()
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain('title="selected"')
    editor.doc.redo()
    expect(sharedDOMBody(editor.doc.doc).toString()).toMatch(/<p id="one"[^>]*title="selected"/)
    expect(sharedDOMBody(editor.doc.doc).toString()).toMatch(/<p id="two"[^>]*title="selected"/)
  })
})

describe("text input normalization", () => {
  it("normalizes adjacent text nodes after text input", () => {
    document.body.innerHTML = "<p>ab</p>"
    const p = document.body.firstElementChild!
    const second = (p.firstChild as Text).splitText(1)
    $.move(second, 0)

    document.dispatchEvent(new Event("input", {bubbles: true}))

    expect(p.childNodes).toHaveLength(1)
    expect(p.textContent).toBe("ab")
  })
})
describe("setBlockType()", () => {
  it.each(["caret", "range", "node"])("converts paragraphs to heading text and back with a %s selection", selection => {
    document.body.innerHTML = '<section><test-widget></test-widget><!--keep--><p id="intro" class="lead">  first\n<b>hello</b><br>tail</p></section>'
    const section = document.querySelector("section")!
    const paragraph = document.querySelector("p")!
    const children = Array.from(paragraph.childNodes)
    const siblings = Array.from(section.childNodes).slice(0, 2)
    const text = paragraph.querySelector("b")!.firstChild!
    if(selection === "node") $.selectElement(paragraph)
    else if(selection === "range") $.selectRange(text, 1, text, 4)
    else $.move(text, 2)

    for(const tag of ["h3", "p"] as const) {
      expect(editor.features.manipulation.setBlockType(tag)).toBe(1)
      const replacement = document.querySelector(tag)!
      expect(replacement.id).toBe("intro")
      expect(replacement).toHaveClass("lead")
      expect(Array.from(replacement.childNodes)).toEqual(children)
      expect(Array.from(section.childNodes).slice(0, 2)).toEqual(siblings)
      expect(document.querySelector("section")).toBe(section)
      if(selection === "node") expect($.selectedElement).toBe(replacement)
      else {
        expect($.anchor).toBe(text)
        expect($.anchorOffset).toBe(selection === "range" ? 1 : 2)
        expect($.focus).toBe(text)
        expect($.focusOffset).toBe(selection === "range" ? 4 : 2)
      }
    }
  })

  it("supports collaboration undo and redo for paragraph/heading conversion", () => {
    document.body.innerHTML = '<p id="intro">  hello\nworld</p>'
    $.selectElement(document.querySelector("p")!)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.manipulation.setBlockType("h3")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain('<h3 id="intro">  hello\nworld</h3>')
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expectBodyToBe('<p id="intro">  hello\nworld</p>')
    editor.doc.redo()
    expectBodyToBe('<h3 id="intro">  hello\nworld</h3>')
  })

  it("converts a block while preserving authored attributes, inline DOM, and selection", () => {
    document.body.innerHTML = '<p id="intro" class="lead"><b>hello</b></p>'
    const text = document.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 4)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(1)
    expectBodyToBe('<h2 id="intro" class="lead"><b>hello</b></h2>')
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
    expect($.focus).toBe(text)
    expect($.focusOffset).toBe(4)
  })
  it("does not copy editor marker classes to a replacement block", () => {
    document.body.innerHTML = '<p class="authored ◆stale-marker"><b>hello</b></p>'
    const text = document.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 4)

    expect(editor.features.manipulation.setBlockType("h2")).toBe(1)

    const replacement = document.querySelector("h2")!
    expect(replacement).toHaveClass("authored")
    expect(replacement).not.toHaveClass("◆stale-marker")
  })

  it("preserves namespaced attributes on a replacement block", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.querySelector("p")!
    paragraph.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", "de")
    $.move(paragraph.firstChild!, 1)

    expect(editor.features.manipulation.setBlockType("h2")).toBe(1)

    const language = document.querySelector("h2")!.getAttributeNode("xml:lang")
    expect(language?.namespaceURI).toBe("http://www.w3.org/XML/1998/namespace")
    expect(language?.value).toBe("de")
  })

  it("converts every selected leaf block without rebuilding their container", () => {
    document.body.innerHTML = "<section><p>one</p><h1>two</h1><pre>three</pre></section>"
    const section = document.querySelector("section")!
    const first = section.firstElementChild!.firstChild!
    const last = section.lastElementChild!.firstChild!
    $.selectRange(first, 1, last, 3)

    editor.features.manipulation.setBlockType("h3")

    expectBodyToBe("<section><h3>one</h3><h3>two</h3><h3>three</h3></section>")
    expect(document.querySelector("section")).toBe(section)
  })

  it("disallows converting paragraphs nested in list items to headings", () => {
    document.body.innerHTML = "<ol><li><p>one</p></li><li><p>two</p></li></ol>"
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    editor.features.manipulation.setBlockType("h2")

    expectBodyToBe("<ol><li><p>one</p></li><li><p>two</p></li></ol>")
  })

  it("skips a replacement that would violate the parent content model", () => {
    document.body.innerHTML = "<ul><li>item</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, 2)

    const count = editor.features.manipulation.setBlockType("p")

    expect(count).toBe(0)
    expectBodyToBe("<ul><li>item</li></ul>")
  })

  it("treats a selected custom element as atomic", () => {
    document.body.innerHTML = "<demo-widget><p>inside</p></demo-widget><p>outside</p>"
    $.selectElement(document.querySelector("demo-widget")!)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(0)
    expectBodyToBe("<demo-widget><p>inside</p></demo-widget><p>outside</p>")
  })

  it("does not format light-DOM descendants of a custom element in a spanning selection", () => {
    document.body.innerHTML = "<p>before</p><demo-widget><p>inside</p></demo-widget><p>after</p>"
    $.selectRange(document.body, 0, document.body, 3)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(2)
    expectBodyToBe("<h2>before</h2><demo-widget><p>inside</p></demo-widget><h2>after</h2>")
  })

  it("retains parent selector constraints when unfamiliar siblings are present", () => {
    document.body.innerHTML = "<address><p>contact</p><demo-widget></demo-widget></address>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(0)
    expectBodyToBe("<address><p>contact</p><demo-widget></demo-widget></address>")
  })

  it("formats the schema-provided initial paragraph", () => {
    $.move(document.body.firstElementChild!)

    editor.features.manipulation.actions.setBlockType({type: "setBlockType", tag: "h1"})

    expectBodyToBe("<h1></h1>")
    expect($.anchor).toBe(document.querySelector("h1"))
  })
})
describe("setStyle()", () => {
  it("styles the rendered image inside a picture while preserving responsive sources and undo", () => {
    document.body.innerHTML = '<picture data-keep="yes"><!--keep--><source srcset="large.png 2x"><img src="small.png" style="object-fit:contain !important"></picture><p>Other</p>'
    const picture = document.querySelector("picture")!
    const image = picture.querySelector("img")!
    const source = picture.querySelector("source")!
    $.selectElement(picture)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    expect(editor.features.manipulation.getStyleState(["object-fit"]).inline["object-fit"])
      .toEqual({value: "contain", priority: "important"})
    editor.features.manipulation.setStyle({"object-fit": {value: "cover", priority: "important"}, "object-position": "top", width: "200px"})
    expect(picture).toHaveStyle({width: "200px"})
    expect(picture.style.objectFit).toBe("")
    expect(image.style.objectFit).toBe("cover")
    expect(image.style.objectPosition).toBe("top")
    expect(picture.querySelector("source")).toBe(source)
    editor.doc.syncFromDOM()
    const changed = editor.toHTML(true)
    expect(changed).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it("uses the current picture image and safely ignores a missing image", () => {
    document.body.innerHTML = '<picture><source srcset="large.png"><img src="old.png"></picture>'
    const picture = document.querySelector("picture")!
    $.selectElement(picture)
    const old = picture.querySelector("img")!
    const replacement = document.createElement("img")
    old.replaceWith(replacement)
    editor.features.manipulation.setStyle({"object-fit": "cover"})
    expect(replacement.style.objectFit).toBe("cover")
    expect(old.style.objectFit).toBe("")
    replacement.remove()
    $.selectElement(picture)
    expect(editor.features.manipulation.setStyle({"object-fit": "contain"})).toBe(false)
    expect(picture.style.objectFit).toBe("")
    expect(editor.features.manipulation.getStyleState(["object-fit"]).inline["object-fit"]).toBeUndefined()
  })

  it.each([
    ["border-width", "4px", "4px", "solid", "black"],
    ["border-style", "dashed", "1px", "dashed", "black"],
    ["border-color", "red", "1px", "solid", "red"],
  ])("completes a border when %s is set", (property, value, width, line, color) => {
    document.body.innerHTML = "<p>Text</p>"
    const paragraph = document.body.firstElementChild as HTMLElement
    $.selectElement(paragraph)
    editor.features.manipulation.setStyle({[property]: value})
    const state = editor.features.manipulation.getStyleState(["border-width", "border-style", "border-color"])
    expect(state.inline["border-width"]?.value).toBe(width)
    expect(state.inline["border-style"]?.value).toBe(line)
    expect(state.inline["border-color"]?.value).toBe(color)
    for(const side of ["top", "right", "bottom", "left"]) {
      expect(paragraph.style.getPropertyValue(`border-${side}-width`)).toBe(width)
      expect(paragraph.style.getPropertyValue(`border-${side}-style`)).toBe(line)
      expect(paragraph.style.getPropertyValue(`border-${side}-color`)).toBe(color)
    }
  })
  it("preserves existing border sides and priority while filling missing parts", () => {
    document.body.innerHTML = '<p style="border-top: 3px dotted green !important; border-bottom-width: 7px">Text</p>'
    const paragraph = document.body.firstElementChild as HTMLElement
    $.selectElement(paragraph)
    editor.features.manipulation.setStyle({"border-color": "red"})
    expect(paragraph.style.borderTopWidth).toBe("3px")
    expect(paragraph.style.borderTopStyle).toBe("dotted")
    expect(paragraph.style.getPropertyPriority("border-top-width")).toBe("important")
    expect(paragraph.style.borderBottomWidth).toBe("7px")
    expect(paragraph.style.borderLeftWidth).toBe("1px")
    expect(paragraph.style.borderBottomStyle).toBe("solid")
    editor.features.manipulation.setStyle({"border-width": null})
    expect(paragraph.style.borderTopWidth).toBe("")
  })

  it("allows only background changes on a document-template root", () => {
    document.body.innerHTML = '<my-document role="document" style="width: 500px"><p>Text</p></my-document>'
    const root = document.body.firstElementChild as HTMLElement
    $.selectElement(root)
    editor.features.manipulation.setStyle({width: "20px", "background-color": "red"})
    expect(root.style.width).toBe("500px")
    expect(root.style.backgroundColor).toBe("red")
    expect(editor.features.manipulation.getStyleState().target?.documentRoot).toBe(true)
    expect(editor.features.manipulation.setElementStyles(root, {padding: "5px"})).toBe(false)
    editor.features.manipulation.setElementStyles(root, {"background-color": null})
    expect(root.style.backgroundColor).toBe("")
    expect(root.style.width).toBe("500px")
    $.selectElement(root.firstElementChild!)
    editor.features.manipulation.setStyle({width: "20px"})
    expect(root.firstElementChild).toHaveStyle({width: "20px"})
  })

  it.each(["section", "div", "demo-widget"])("styles the top-level %s from nested content in the Edit toolbox", tag => {
    document.body.innerHTML = `<${tag}><div><p style="color: blue">hello</p></div></${tag}><p>other</p>`
    const outer = document.body.firstElementChild!
    const paragraph = outer.querySelector("p")!
    $.move(paragraph.firstChild!, 2)

    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {color: "red", padding: "4px"}})

    expect(outer).toHaveStyle({color: "red", padding: "4px"})
    expect(paragraph).toHaveStyle({color: "blue"})
    expect(outer.firstElementChild).not.toHaveAttribute("style")
    expect(editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true}).target?.localName).toBe(tag)
  })

  it.each(["img", "demo-widget"])("keeps styling available for a capture-selected %s with a native top-level gap", tag => {
    document.body.innerHTML = `<${tag} style="opacity: 0.8"></${tag}><p>other</p>`
    const captured = document.body.firstElementChild!
    $.selectGap(captured, "before")
    editor.features.selection.captureElement(captured, {preserveNativeSelection: true})
    expect($.isGapSelection).toBe(true)
    const state = editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true})
    expect(state.target?.localName).toBe(tag)
    expect(state.inline.opacity?.value).toBe("0.8")
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {opacity: "0.5"}})
    expect(captured).toHaveStyle({opacity: "0.5"})
    expect(document.body).not.toHaveAttribute("style")

    captured.remove()
    $.selectGap(document.body.firstElementChild!, "before")
    expect(editor.features.manipulation.topLevelStyleTarget).toBeNull()
  })

  it("keeps captured widget styling on its top-level container", () => {
    document.body.innerHTML = '<section><demo-widget></demo-widget></section><p>other</p>'
    const container = document.body.firstElementChild!, widget = container.firstElementChild!
    $.selectGap(container, "before")
    editor.features.selection.captureElement(widget, {preserveNativeSelection: true})
    expect(editor.features.manipulation.topLevelStyleTarget).toBe(container)
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {padding: "4px"}})
    expect(container).toHaveStyle({padding: "4px"})
    expect(widget).not.toHaveAttribute("style")
  })

  it("uses the top-level container below a document template", () => {
    document.body.innerHTML = '<demo-document role="document"><section><div><p>text</p></div></section></demo-document>'
    $.move(document.querySelector("p")!.firstChild!, 1)
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {padding: "8px"}})
    expect(document.querySelector("section")).toHaveStyle({padding: "8px"})
    expect(document.body.firstElementChild).not.toHaveAttribute("style")
    expect(document.querySelector("div")).not.toHaveAttribute("style")
    $.selectGap(document.querySelector("section")!, "before")
    expect(editor.features.manipulation.topLevelStyleTarget).toBeNull()
  })

  it("disables top-level gap styling while preserving document styling", () => {
    document.body.innerHTML = '<section><p>one</p></section><p>two</p>'
    $.selectGap(document.body.lastElementChild!, "before")
    expect(editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true}).target).toBeNull()
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"background-color": "red"}})
    expect(document.body).not.toHaveAttribute("style")
    expect(document.body.firstElementChild).not.toHaveAttribute("style")

    $.selectElement(document.body)
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"background-color": "red"}})
    expect(document.body).toHaveStyle({backgroundColor: "red"})
  })

  it("resolves a replaced top-level container from the current selection", () => {
    document.body.innerHTML = '<section><p>old</p></section>'
    $.move(document.querySelector("p")!.firstChild!, 1)
    const previous = editor.features.manipulation.topLevelStyleTarget!
    previous.replaceWith(document.createElement("article"))
    document.querySelector("article")!.innerHTML = '<div><p>new</p></div>'
    $.move(document.querySelector("p")!.firstChild!, 1)
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {opacity: "0.5"}})
    expect(document.querySelector("article")).toHaveStyle({opacity: "0.5"})
    expect(previous).not.toHaveAttribute("style")
  })

  it.each(["relative", "absolute", "sticky"])("rejects %s positioning commands in document layout", position => {
    document.body.innerHTML = '<p style="position: relative; left: 12px">text</p>'
    const target = document.body.firstElementChild as HTMLElement
    $.selectElement(target)
    editor.features.manipulation.setStyle({position, color: "red"})
    expect(target.style.position).toBe("relative")
    expect(target.style.left).toBe("12px")
    expect(target.style.color).toBe("red")
    expect(editor.features.manipulation.setElementStyles(target, {position})).toBe(false)
    expect(editor.features.manipulation.getStyleState().context.positioning).toBe(false)
    document.body.classList.add("ww-canvas")
    expect(editor.features.manipulation.setElementStyles(target, {position})).toBe(true)
    expect(target.style.position).toBe(position)
    expect(editor.features.manipulation.getStyleState().context.positioning).toBe(true)
  })

  it("can set a style property", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "50px"})
    expect(document.body.firstElementChild).toHaveStyle({width: "50px"})
  })
  it("can remove a property by passing the empty string", () => {
    document.body.innerHTML = `<p style="width: 50px">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: ""})
    expect(document.body.firstElementChild).not.toHaveStyle({width: "50px"})
  })
  it("can set multiple properties at once", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "10px", color: "red"})
    expect(document.body.firstElementChild).toHaveStyle({width: "10px", color: "red"})
  })
  it("merges with existing inline styles", () => {
    document.body.innerHTML = `<p style="color: red">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "50px"})
    expect(document.body.firstElementChild).toHaveStyle({color: "red", width: "50px"})
  })
  it("styles the containing element for a collapsed text selection", () => {
    document.body.innerHTML = "<p>hello world</p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstChild!, 4)

    editor.features.manipulation.setStyle({color: "red"})

    expect(paragraph).toHaveStyle({color: "red"})
  })
  it("styles an empty text container", () => {
    document.body.innerHTML = "<p></p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph)

    editor.features.manipulation.setStyle({"min-height": "20px"})

    expect(paragraph).toHaveStyle({minHeight: "20px"})
  })
  it("does not change root layout when the selection is a gap", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p></section>"
    const section = document.body.firstElementChild!
    $.selectGap(section.lastElementChild!, "before")

    editor.features.manipulation.setStyle({display: "grid"})

    expect(document.body).not.toHaveStyle({display: "grid"})
    expect(section).not.toHaveAttribute("style")
    expect(section.lastElementChild).not.toHaveAttribute("style")
  })
  it("styles the containing element for a same-node text range", () => {
    document.body.innerHTML = "<p>hello world</p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstChild!, 1, paragraph.firstChild!, 5)

    editor.features.manipulation.setStyle({"line-height": "2"})

    expect(paragraph).toHaveStyle({lineHeight: "2"})
  })
  it("styles the common ancestor for a cross-node text range", () => {
    document.body.innerHTML = "<p><span>one</span><em>two</em></p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstElementChild!.firstChild!, 1, paragraph.lastElementChild!.firstChild!, 2)

    editor.features.manipulation.setStyle({"text-align": "center"})

    expect(paragraph).toHaveStyle({textAlign: "center"})
    expect(paragraph.firstElementChild).not.toHaveAttribute("style")
    expect(paragraph.lastElementChild).not.toHaveAttribute("style")
  })
  it("skips a section wrapper as the structural common ancestor across blocks", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p></section>"
    const section = document.body.firstElementChild!
    $.selectRange(section.firstElementChild!.firstChild!, 0, section.lastElementChild!.firstChild!, 3)

    editor.features.manipulation.setStyle({"background-color": "gold"})

    expect(document.body).toHaveStyle({backgroundColor: "gold"})
    expect(section).not.toHaveAttribute("style")
    expect(section.firstElementChild).not.toHaveAttribute("style")
  })
  it("applies paragraph styles to every selected block instead of their common ancestor", () => {
    document.body.innerHTML = '<section><p style="color: red">one</p><p>two</p></section>'
    const section = document.querySelector("section")!
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(paragraphs[0].firstChild!, 1, paragraphs[1].firstChild!, 2)

    const count = editor.features.manipulation.setBlockStyle({"text-align": "center", "line-height": "1.5"})

    expect(count).toBe(2)
    expect(section).not.toHaveAttribute("style")
    expect(paragraphs[0]).toHaveStyle({color: "red", textAlign: "center", lineHeight: "1.5"})
    expect(paragraphs[1]).toHaveStyle({textAlign: "center", lineHeight: "1.5"})
  })
  it("formats the schema-provided initial paragraph", () => {
    $.move(document.body.firstElementChild!)

    const count = editor.features.manipulation.setBlockStyle({"text-align": "center"})

    expect(count).toBe(1)
    expect(document.querySelector("p")).toHaveStyle({textAlign: "center"})
  })
  it("removes a paragraph style from every selected block", () => {
    document.body.innerHTML = '<p style="text-indent: 2em">one</p><p style="text-indent: 2em">two</p>'
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(document.body, 0, document.body, 2)

    editor.features.manipulation.actions.setBlockStyle({
      type: "setBlockStyle",
      styles: {"text-indent": ""},
    })

    expect(paragraphs.every(paragraph => paragraph.style.textIndent === "")).toBe(true)
  })
  it("projects a shared paragraph declaration from a multi-block selection", () => {
    document.body.innerHTML = '<section><p style="text-align: center">one</p><p style="text-align: center">two</p></section>'
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    const state = editor.features.manipulation.getStyleState(["text-align"])

    expect(state.target?.localName).toBe("body")
    expect(state.inline["text-align"]).toEqual({value: "center", priority: ""})
  })
  it("styles a section after it is explicitly selected from the breadcrumb", () => {
    document.body.innerHTML = "<section><p>one</p></section>"
    const section = document.querySelector("section")!
    $.move(document.querySelector("p")!.firstChild!, 1)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})

    editor.features.manipulation.setStyle({display: "grid"})

    expect(section).toHaveStyle({display: "grid"})
    expect(document.body).not.toHaveStyle({display: "grid"})
  })
  it("reports a mixed paragraph declaration as unset", () => {
    document.body.innerHTML = '<section><p style="text-align: start">one</p><p style="text-align: end">two</p></section>'
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    const state = editor.features.manipulation.getStyleState(["text-align"])

    expect(state.inline).not.toHaveProperty("text-align")
    expect(state.computed["text-align"]).toBe("")
  })
  it("uses the authored widget host while capture is active", () => {
    document.body.innerHTML = "<demo-widget></demo-widget><p>other</p>"
    const widget = document.body.firstElementChild!
    editor.features.selection.captureElement(widget)
    $.selectRange(document.body.lastElementChild!.firstChild!, 2)

    editor.features.manipulation.setStyle({opacity: "0.5"})

    expect(widget).toHaveStyle({opacity: "0.5"})
    expect(document.body.lastElementChild).not.toHaveAttribute("style")
  })
  it("styles the table for an existing multi-cell selection", () => {
    document.body.innerHTML = "<table><tbody><tr><td>one</td><td>two</td></tr></tbody></table>"
    const table = document.body.firstElementChild as HTMLTableElement
    const cells = table.querySelectorAll("td")
    editor.features.table.selectCells(cells[0], cells[1])

    editor.features.manipulation.setStyle({"border-collapse": "collapse"})

    expect(table).toHaveStyle({borderCollapse: "collapse"})
  })
  it("styles the body without a live selection", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)
    editor.features.selection.disable()
    document.getSelection()?.removeAllRanges()

    editor.features.manipulation.setStyle({"background-color": "red", color: "blue"})
    const target = editor.features.manipulation.styleTarget
    const state = editor.features.manipulation.getStyleState(["background-color"])
    editor.features.selection.enable()

    expect(target).toBe(document.body)
    expect(state.target).toMatchObject({localName: "body"})
    expect(state.inline["background-color"]).toEqual({value: "red", priority: ""})
    expect(paragraph).not.toHaveAttribute("style")
    expect(document.body).toHaveStyle({backgroundColor: "red"})
    expect(document.body.style.color).not.toBe("blue")
  })
  it("supports custom properties and important priority", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)

    editor.features.manipulation.setStyle({
      "--accent": "rebeccapurple",
      color: {value: "var(--accent)", priority: "important"},
    })

    const style = (paragraph as HTMLElement).style
    expect(style.getPropertyValue("--accent")).toBe("rebeccapurple")
    expect(style.getPropertyValue("color")).toBe("var(--accent)")
    expect(style.getPropertyPriority("color")).toBe("important")
  })
  it("returns a serializable authored and computed style projection", () => {
    document.body.innerHTML = '<p style="width: 20px; color: red !important">hello</p>'
    $.selectElement(document.body.firstElementChild!)

    const state = editor.features.manipulation.getStyleState(["width", "display"])

    expect(state.target).toMatchObject({localName: "p"})
    expect(state.inline.width).toEqual({value: "20px", priority: ""})
    expect(state.inline.color).toEqual({value: "red", priority: "important"})
    expect(state.computed.width).toBeTruthy()
    expect(state.computed).toHaveProperty("display")
  })
  it("rejects malformed property names without changing authored styles", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)

    expect(() => editor.features.manipulation.setStyle({"color; display": "none"})).toThrow(TypeError)
    expect(paragraph).not.toHaveAttribute("style")
  })
})

// Native drag data is unavailable on Happy DOM's DragEvent constructor.
function transferEvent(type: string, dataTransfer: DataTransfer, extra: Record<string, unknown> = {}) {
  const event = new Event(type, {bubbles: true, cancelable: true, composed: true})
  Object.assign(event, {dataTransfer, clientX: 10, clientY: 10, ...extra})
  return event
}

describe("unified content transfer", () => {
  beforeEach(() => {
    vi.spyOn(DataTransfer.prototype, "setDragImage").mockImplementation(() => {})
  })

  function ribbonData(tag: string) {
    const data = new DataTransfer()
    data.setData(elementDragType, tag)
    data.setData(`${elementDragType}-${tag}`, tag)
    data.setData("text/html", `<${tag}></${tag}>`)
    return data
  }

  it("drops a ribbon element at the same text caret as a widget insertion", () => {
    document.body.innerHTML = "<p>before</p><p>after</p>"
    const first = document.body.firstElementChild!
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 20))
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: first.firstChild!, offset: 3})
    const data = ribbonData("h2")
    const read = vi.spyOn(data, "getData").mockReturnValue("")
    document.body.dispatchEvent(transferEvent("dragover", data, {clientX: 150, clientY: 20}))
    read.mockRestore()
    expect(document.body).toHaveClass("◆drop-selection-active")
    document.body.dispatchEvent(transferEvent("drop", data, {clientX: 150, clientY: 20}))
    expect(Array.from(document.body.children).map(child => child.localName)).toEqual(["p", "h2", "p", "p"])
    expect(Array.from(document.body.children).map(child => child.textContent)).toEqual(["bef", "", "ore", "after"])
    expect(document.body).not.toHaveClass("◆drop-selection-active")
  })

  it("replays host-relayed ribbon drags that the browser withholds from the cross-site frame", () => {
    // Happy DOM's DragEvent ignores dataTransfer, which browsers carry.
    vi.stubGlobal("DragEvent", class extends MouseEvent {
      dataTransfer: DataTransfer | null
      constructor(type: string, init: DragEventInit = {}) { super(type, init); this.dataTransfer = init.dataTransfer ?? null }
    })
    try {
      document.body.innerHTML = "<p>before</p><p>after</p>"
      const first = document.body.firstElementChild!
      vi.spyOn(first, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 20))
      vi.spyOn(document, "elementFromPoint").mockReturnValue(first)
      vi.spyOn($, "pointFromCoords").mockReturnValue({node: first.firstChild!, offset: 3})
      const data = {[elementDragType]: "h2", [`${elementDragType}-h2`]: "h2", "text/html": "<h2></h2>"}
      expect(replayHostDrag({event: "dragover", x: 150, y: 20, data})).toBe(true)
      expect(document.body).toHaveClass("◆drop-selection-active")
      expect(replayHostDrag({event: "dragleave", x: 0, y: 0, data})).toBe(false)
      expect(document.body).not.toHaveClass("◆drop-selection-active")
      replayHostDrag({event: "dragover", x: 150, y: 20, data})
      expect(replayHostDrag({event: "drop", x: 150, y: 20, data})).toBe(true)
      expect(Array.from(document.body.children).map(child => child.localName)).toEqual(["p", "h2", "p", "p"])
      expect(document.body).not.toHaveClass("◆drop-selection-active")
      expect(replayHostDrag({event: "drop", x: Number.NaN, y: 20, data})).toBe(false)
      expect(replayHostDrag({event: "click" as "drop", x: 150, y: 20, data})).toBe(false)
      expect(document.body.children).toHaveLength(4)
    }
    finally { vi.unstubAllGlobals() }
  })

  it("drops ribbon elements onto the selected element beneath its drag surface", () => {
    document.body.innerHTML = "<p>before</p><h2>selected</h2><p>after</p>"
    const selected = document.body.children[1]
    $.selectElement(selected)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector<HTMLElement>('[part="node-drag-surface"]')!
    expect(surface).not.toBeNull()
    vi.spyOn(selected, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 100, 20))
    // Like native hit testing, the point resolves to the surface's host
    // position outside the document while the surface is hit-testable.
    // The native browser suite covers the real appendix hit testing.
    let beneath = false
    const hitTest = editor.hitTestBeneathAppendix.bind(editor)
    vi.spyOn(editor, "hitTestBeneathAppendix").mockImplementation(test => hitTest(() => {
      beneath = true
      try { return test() }
      finally { beneath = false }
    }))
    vi.spyOn($, "pointFromCoords").mockImplementation(() => surface.isConnected && !beneath
      ? undefined : {node: selected.firstChild!, offset: 2})
    const data = ribbonData("table")
    const over = transferEvent("dragover", data, {clientX: 50, clientY: 25})
    surface.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(document.body).toHaveClass("◆drop-selection-active")
    // Float hover keeps the selection stable and only updates the appendix.
    expect(surface.isConnected).toBe(true)
    selected.dispatchEvent(transferEvent("drop", data, {clientX: 50, clientY: 25}))
    expect(document.body.querySelector("table")).not.toBeNull()
    expect(selected.isConnected).toBe(true)
  })

  it("uses the ribbon's prepared table content when dropped", () => {
    document.body.innerHTML = "<p>before</p><p>after</p>"
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: 1})
    document.body.dispatchEvent(transferEvent("drop", ribbonData("table")))
    const table = document.body.children[1] as HTMLTableElement
    expect(table.localName).toBe("table")
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0].cells).toHaveLength(2)
  })

  it("centers ribbon elements at the canvas drop position", () => {
    expect(editor.features.canvas.convert("canvas")).toBe(true)
    vi.spyOn(editor.features.canvas, "clientPoint").mockImplementation((x, y) => ({x: x - 100, y: y - 50}))
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return new DOMRect(100 + parseFloat(this.style.left || "0"), 50 + parseFloat(this.style.top || "0"), 40, 20)
    })
    const data = ribbonData("p")
    document.body.dispatchEvent(transferEvent("drop", data, {clientX: 300, clientY: 150}))
    const item = document.body.lastElementChild as HTMLElement
    expect(item.localName).toBe("p")
    expect(item.style.position).toBe("absolute")
    expect(item.style.left).toBe("180px")
    expect(item.style.top).toBe("90px")
    expect(item.style.width).toBe("")
  })

  it("accepts a ribbon drop on the canvas's blank shadow slot", () => {
    expect(editor.features.canvas.convert("canvas")).toBe(true)
    const slot = editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")!
    const data = ribbonData("p")
    const over = transferEvent("dragover", data, {clientX: 240, clientY: 180})
    slot.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const original = document.body.firstElementChild
    slot.dispatchEvent(transferEvent("drop", data, {clientX: 240, clientY: 180}))
    expect(document.body.lastElementChild).not.toBe(original)
    expect(document.body.lastElementChild?.localName).toBe("p")
    expect((document.body.lastElementChild as HTMLElement).style.position).toBe("absolute")
  })

  it.each(["document", "canvas", "slides"] as const)("captures ribbon drops on editor overlays in %s", mode => {
    document.body.className = ""
    if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = mode === "slides" ? document.querySelector<HTMLElement>(".ww-slide")! : document.body
    const surface = document.createElement("div")
    editor.addAppendix(surface)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: target, offset: 0})
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: () => [surface, target]})
    const data = ribbonData("h1")
    const over = transferEvent("dragover", data)
    surface.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    surface.dispatchEvent(transferEvent("drop", data))
    expect(target.querySelectorAll("h1")).toHaveLength(mode === "slides" ? 2 : 1)
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    surface.remove()
    Reflect.deleteProperty(document, "elementsFromPoint")
  })

  function packageDrop(action: string, target: Element, x = 200, y = 100) {
    const data = new DataTransfer()
    data.setData(ribbonInsertionDragType, action)
    const post = vi.spyOn(editor, "postHostMessage")
    target.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: y}))
    const message = post.mock.calls.find(([message]) => (message as {type?: string}).type === "editor-ribbon-drop")?.[0]
    return message as {action: string, position: RibbonDropPosition} | undefined
  }

  it("resolves a drop beside a sole selected image when there is no native caret", () => {
    document.body.innerHTML = "<picture><img></picture>"
    const image = document.querySelector("picture")!
    editor.features.selection.selectElement(image)
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100))
    const caretDescriptor = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint")
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: () => null})
    const descriptor = Object.getOwnPropertyDescriptor(document, "elementsFromPoint")
    Object.defineProperty(document, "elementsFromPoint", {configurable: true, value: () => [document.body]})
    try {
      const data = ribbonData("h2")
      document.body.dispatchEvent(transferEvent("dragover", data, {clientX: 200, clientY: 300}))
      expect(document.body).toHaveClass("◆drop-selection-active")
      expect($.anchor).toBe(document.body)
      expect($.anchorOffset).toBe(1)
      document.body.dispatchEvent(transferEvent("drop", data, {clientX: 200, clientY: 300}))
      expect(Array.from(document.body.children).map(node => node.localName)).toEqual(["picture", "h2"])
      expect(image.isConnected).toBe(true)
      expect(document.querySelector("h2")!.contains($.anchor)).toBe(true)
    }
    finally {
      if(caretDescriptor) Object.defineProperty(document, "caretPositionFromPoint", caretDescriptor)
      else Reflect.deleteProperty(document, "caretPositionFromPoint")
      if(descriptor) Object.defineProperty(document, "elementsFromPoint", descriptor)
      else Reflect.deleteProperty(document, "elementsFromPoint")
    }
  })

  it.each([elementDragType, ribbonInsertionDragType])("previews protected native ribbon drags on overlays using only %s", type => {
    document.body.innerHTML = "<p>content</p>"
    const paragraph = document.querySelector("p")!
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: paragraph.firstChild!, offset: 3})
    const surface = document.createElement("div")
    editor.addAppendix(surface)
    const data = new DataTransfer()
    data.setData(type, type === elementDragType ? "h1" : "element:h1")
    const hidden = vi.spyOn(data, "getData").mockReturnValue("")
    const over = transferEvent("dragover", data)
    surface.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    expect(document.body).toHaveClass("◆drop-selection-active")
    hidden.mockRestore()
    surface.dispatchEvent(transferEvent("drop", data))
    expect(document.querySelectorAll("h1")).toHaveLength(1)
    expect(document.body).not.toHaveClass("◆drop-selection-active")
  })

  it.each(["document", "canvas", "slides"] as const)("repeated native drags use the widget insertion channel in %s", mode => {
    document.body.className = ""
    if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = mode === "slides" ? document.querySelector<HTMLElement>(".ww-slide")! : document.body
    vi.spyOn($, "pointFromCoords").mockImplementation(() => ({node: target, offset: target.childNodes.length}))
    for(const tag of ["picture", "h2", "table", "details", "math"]) {
      const data = new DataTransfer()
      data.setData(ribbonInsertionDragType, `element:${tag}`)
      target.dispatchEvent(transferEvent("dragover", data))
      target.dispatchEvent(transferEvent("drop", data))
      expect(target.querySelector(tag)).not.toBeNull()
    }
    expect(editor.features.math.activeMath).toBe(target.querySelector("math"))
  })

  describe.each(["document", "canvas", "slides"] as const)("ribbon drop editing selection in %s", mode => {
    function drop(tag: string) {
      document.body.className = ""
      if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
      const target = mode === "slides" ? document.querySelector<HTMLElement>(".ww-slide")! : document.body
      vi.spyOn($, "pointFromCoords").mockReturnValue({node: target, offset: target.childNodes.length})
      target.dispatchEvent(transferEvent("drop", ribbonData(tag), {clientX: 200, clientY: 100}))
      return target.lastElementChild!
    }

    it("uses the table command's first-cell selection", () => {
      const table = drop("table")
      expect(table.localName).toBe("table")
      expect(editor.features.table.hasCellSelection).toBe(true)
      expect(table.querySelector("td")!.contains($.anchor)).toBe(true)
      expect($.selectedElement).not.toBe(table)
    })

    it.each(["p", "h2", "details", "math"])("keeps the editing caret inside the dropped %s", tag => {
      const root = drop(tag)
      const content = tag === "details" ? root.querySelector("summary")! : tag === "math" ? root.querySelector("mrow")! : root
      expect(content.contains($.anchor)).toBe(true)
      expect($.range.collapsed).toBe(true)
      expect($.selectedElement).not.toBe(root)
    })

    it.each(["ul", "ol"])("uses the virtual empty-list selection for %s", tag => {
      const list = drop(tag)
      expect(list.localName).toBe(tag)
      expect(list.children).toHaveLength(0)
      expect($.anchor).toBe(list)
      expect(editor.features.list.getState().type).toBe(tag)
    })

    it("captures a blank graphic like click insertion", () => {
      const graphic = drop("svg")
      expect(editor.features.selection.captureSelectedElement).toBe(graphic)
    })

    it.each(["picture", "iframe"] as const)("retains the click insertion selection for %s media", tag => {
      const media = drop(tag)
      expect(media.localName).toBe(tag)
      const selected = $.selectedElement === media
      const captured = editor.features.selection.captureSelectedElement === media
      const collapsed = $.range.collapsed
      const parent = media.parentNode!
      const range = document.createRange()
      range.setStart(parent, parent.childNodes.length)
      range.collapse(true)
      editor.features.selection.selectDropRange(range)
      editor.features.media.actions.insertMedia({type: "insertMedia", media: tag})
      const clicked = parent.lastChild!
      expect($.selectedElement === clicked).toBe(selected)
      expect(editor.features.selection.captureSelectedElement === clicked).toBe(captured)
      expect($.range.collapsed).toBe(collapsed)
    })
  })

  it.each(["document", "canvas", "slides"] as const)("inserts repeated prepared widget drops directly in %s", async mode => {
    document.body.className = ""
    if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = mode === "slides" ? document.querySelector<HTMLElement>(".ww-slide")! : document.body
    vi.spyOn($, "pointFromCoords").mockImplementation(() => ({node: target, offset: target.childNodes.length}))
    const post = vi.spyOn(editor, "postHostMessage")
    for(let index = 0; index < 3; index++) {
      const data = new DataTransfer()
      data.setData(ribbonInsertionDragType, "package:demo")
      data.setData("text/html", '<x-demo-widget><p>Content</p></x-demo-widget>')
      target.dispatchEvent(transferEvent("dragover", data))
      target.dispatchEvent(transferEvent("drop", data, {clientX: 200 + index * 100, clientY: 100}))
      await vi.waitFor(() => expect(target.querySelectorAll("x-demo-widget")).toHaveLength(index + 1))
      expect(editor.features.selection.captureSelectedElement).toBe(target.querySelectorAll("x-demo-widget")[index])
    }
    expect(post.mock.calls.some(([message]) => (message as {type?: string}).type === "editor-ribbon-drop")).toBe(false)
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("moves the package drop caret in protected dragover mode and retains the drop point after selection changes", async () => {
    document.body.innerHTML = '<p>before after</p><p>other</p>'
    const text = document.querySelector("p")!.firstChild!
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: text, offset: 7})
    const data = new DataTransfer()
    data.setData(ribbonInsertionDragType, "user-snippet:saved")
    const protectedData = vi.spyOn(data, "getData").mockReturnValue("")
    document.body.dispatchEvent(transferEvent("dragover", data))
    expect(document.body).toHaveClass("◆drop-selection-active")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(7)
    protectedData.mockRestore()
    const message = packageDrop("user-snippet:saved", document.body)!
    $.move(document.querySelectorAll("p")[1].firstChild!, 0)
    expect(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html: '<em>inserted</em>', position: message.position})).toBe(true)
    expect(document.querySelector("p")!.innerHTML).toBe('before <em>inserted</em>after')
    expect(document.body).not.toHaveClass("◆drop-selection-active")
  })

  it.each(["canvas", "slides"] as const)("centers a saved snippet in %s and preserves nested content and explicit width", async mode => {
    document.body.className = ""
    expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = mode === "canvas" ? document.body : document.querySelector<HTMLElement>(".ww-slide")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 800, 600))
    vi.spyOn(editor.features.canvas, "clientPoint").mockImplementation((x, y) => ({x: (x - 100) / 2, y: (y - 50) / 2}))
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const scale = mode === "canvas" ? 2 : 1
      return new DOMRect(100 + parseFloat(this.style.left || "0") * scale, 50 + parseFloat(this.style.top || "0") * scale, 80 * scale, 40 * scale)
    })
    const message = packageDrop("user-snippet:saved", target, 300, 150)!
    expect(message.position.layout).toBe(mode)
    expect(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html: '<p style="width:80px"><b>Saved</b><!--keep--></p>', position: message.position})).toBe(true)
    const inserted = target.lastElementChild as HTMLElement
    expect(inserted.innerHTML, target.outerHTML).toBe('<b>Saved</b><!--keep-->')
    expect(inserted.style.width).toBe("80px")
    expect(inserted.style.left).toBe(mode === "canvas" ? "60px" : "160px")
    expect(inserted.style.top).toBe(mode === "canvas" ? "30px" : "80px")
    expect(inserted.parentElement).toBe(target)
  })

  it("does not route unknown ribbon actions or drops outside a slide", () => {
    expect(packageDrop("delete", document.body)).toBeUndefined()
    document.body.className = ""
    expect(editor.features.slides.convert("slides")).toBe(true)
    expect(packageDrop("package:demo", document.body)).toBeUndefined()
  })

  it("ignores an asynchronous drop whose target was replaced", async () => {
    document.body.innerHTML = '<p>before</p>'
    const text = document.querySelector("p")!.firstChild!
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: text, offset: 2})
    const message = packageDrop("package-member:demo", document.body)!
    document.body.innerHTML = '<p>replacement</p>'
    editor.doc.syncFromDOM()
    expect(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html: '<em>new</em>', position: message.position})).toBe(false)
    expect(document.querySelector("p")!.textContent).toBe("replacement")
  })

  it("retains the document drop position after a package reload restores the shared DOM", async () => {
    document.body.innerHTML = '<p>before after</p>'
    const text = document.querySelector("p")!.firstChild!
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: text, offset: 7})
    const message = packageDrop("package:demo", document.body)!
    const initialState = editor.doc.snapshot()
    editor.destroy()
    document.body.innerHTML = '<p></p>'
    editor = new DOMEditor({initialState})
    expect(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html: '<em>inserted </em>', position: message.position})).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe("before inserted after")
  })

  it("undoes and redoes a positioned snippet drop as one authored change", async () => {
    expect(editor.features.canvas.convert("canvas")).toBe(true)
    const message = packageDrop("user-snippet:saved", document.body)!
    const before = editor.toHTML(true)
    expect(await editor.features.manipulation.actions.insertRibbonDrop({type: "insertRibbonDrop", html: '<p style="width:80px">Saved</p>', position: message.position})).toBe(true)
    const after = editor.toHTML(true)
    expect(after).toContain("Saved")
    expect(after).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it.each(["document", "canvas", "slides"] as const)("drops graphic shapes, formula structures and styled lists in %s", mode => {
    document.body.className = ""
    if(mode !== "document") expect(editor.setDocumentLayout(mode, "document")).toBe(true)
    const target = mode === "slides" ? document.querySelector<HTMLElement>(".ww-slide")! : document.body
    const point = vi.spyOn($, "pointFromCoords").mockImplementation(() => ({node: target, offset: target.childNodes.length}))
    for(const [action, selector] of [["insert-graphic-shape:rectangle", "svg"], ["insert-math:frac", "math mfrac"], ["list-style:ol:lower-alpha", "ol"]]) {
      const data = new DataTransfer()
      data.setData(ribbonInsertionDragType, action)
      target.dispatchEvent(transferEvent("drop", data, {clientX: 200, clientY: 100}))
      const inserted = target.querySelector(selector)
      expect(inserted, `${action}: ${target.innerHTML}`).not.toBeNull()
      if(action.startsWith("list-style:")) expect((inserted as HTMLElement).style.listStyleType).toBe("lower-alpha")
      if(mode !== "document") {
        let root = inserted!
        while(root.parentElement !== target) root = root.parentElement!
        expect((root as HTMLElement).style.position).toBe("absolute")
      }
    }
    point.mockRestore()
  })

  it("keeps a dropped formula in a positioned canvas text box", () => {
    expect(editor.features.canvas.convert("canvas")).toBe(true)
    vi.spyOn(editor.features.canvas, "clientPoint").mockReturnValue({x: 100, y: 100})
    document.body.dispatchEvent(transferEvent("drop", ribbonData("math"), {clientX: 100, clientY: 100}))
    const box = document.body.lastElementChild as HTMLElement
    expect(box.localName).toBe("p")
    expect(box.style.position).toBe("absolute")
    expect(box.querySelector("math > mrow")?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML")
  })

  it("centers ribbon elements within the slide under the drop", () => {
    document.body.removeAttribute("class")
    expect(editor.features.slides.convert("slides")).toBe(true)
    const slide = document.querySelector<HTMLElement>("section.ww-slide")!
    vi.spyOn(slide, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 800, 600))
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return new DOMRect(100 + parseFloat(this.style.left || "0"), 100 + parseFloat(this.style.top || "0"), 40, 20)
    })
    const data = ribbonData("p")
    slide.dispatchEvent(transferEvent("drop", data, {clientX: 300, clientY: 250}))
    const item = Array.from(slide.children).find(child => child instanceof HTMLElement && child.style.left === "180px") as HTMLElement
    expect(item.localName).toBe("p")
    expect(item.style.left).toBe("180px")
    expect(item.style.top).toBe("140px")
    const before = slide.children.length
    document.body.dispatchEvent(transferEvent("drop", ribbonData("p"), {clientX: 10, clientY: 10}))
    expect(slide.children).toHaveLength(before)
  })

  function beginDrag(element: Element) {
    $.selectElement(element)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector<HTMLElement>('[part="node-drag-surface"]')!
    expect(surface).not.toBeNull()
    const data = new DataTransfer()
    surface.dispatchEvent(transferEvent("dragstart", data))
    return {data, surface}
  }

  function dropAt(data: DataTransfer, node: Node, offset: number, extra: Record<string, unknown> = {}) {
    vi.spyOn($, "pointFromCoords").mockReturnValue({node, offset})
    const event = transferEvent("drop", data, extra)
    document.body.dispatchEvent(event)
    return event
  }

  it.each(["mover", "scale-up", "scale-right", "scale-down", "scale-left"].flatMap(handle =>
    [false, true].map(copy => ({handle, copy}))))("uses native element drag semantics from $handle (copy: $copy)", ({handle, copy}) => {
    document.body.innerHTML = '<section><demo-widget draggable="false">before<!--keep--><b>content</b></demo-widget></section><p>target</p>'
    const source = document.querySelector("demo-widget")!, section = source.parentElement!
    const children = Array.from(source.childNodes)
    editor.features.selection.captureElement(source)
    const mover = editor.features.transformation.overlay.querySelector<HTMLElement>(`#◆transform-overlay-${handle}`)!
    expect(mover.draggable).toBe(true)
    const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0})
    mover.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    const data = new DataTransfer()
    const start = transferEvent("dragstart", data)
    mover.dispatchEvent(start)
    expect(start.defaultPrevented).toBe(false)
    expect(data.effectAllowed).toBe("copyMove")
    expect(data.getData("application/x-webwriter-node")).not.toBe("")
    expect(data.getData("text/html")).not.toContain("◆")
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: 2})
    const over = transferEvent("dragover", data, {ctrlKey: copy})
    document.body.dispatchEvent(over)
    expect(data.dropEffect).toBe(copy ? "copy" : "move")
    dropAt(data, document.body, 2, {ctrlKey: copy})
    const result = document.body.lastElementChild!
    expect(result.localName).toBe("demo-widget")
    expect(result.getAttribute("draggable")).toBe("false")
    if(copy) {
      expect(source.parentElement).toBe(section)
      expect(result).not.toBe(source)
    }
    else {
      expect(result).toBe(source)
      expect(Array.from(source.childNodes)).toEqual(children)
    }
    mover.dispatchEvent(transferEvent("dragend", data))
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(editor.toHTML(true)).not.toMatch(/◆|transform-overlay|node-drag-surface/)
  })

  it.each([[125, "left"], [150, "right"], [175, "right"]] as const)("floats dragged content at x=%i with native CSS", (x, side) => {
    document.body.innerHTML = '<p>source</p><article><p>nested</p></article>'
    const source = document.querySelector("body > p") as HTMLParagraphElement, target = document.querySelector("article")!
    const nested = target.querySelector("p")!
    vi.spyOn(nested, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    const {data} = beginDrag(source)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: target.firstElementChild!.firstChild!, offset: 2})
    target.dispatchEvent(transferEvent("dragover", data, {clientX: x, clientY: 50}))
    const preview = editor.appendix.querySelector("#◆float-drop-preview")
    expect(preview?.getAttribute("part")).toContain(`float-drop-preview-${side}`)
    target.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: 50}))
    expect(source.parentElement).toBe(target)
    expect(source.nextElementSibling).toBe(nested)
    expectClassFloat(source, side)
    expect(source.style.maxWidth).toBe("")
    expect(source.style.marginLeft).toBe("")
    expect(source.style.marginRight).toBe("")
    expect(source.style.getPropertyValue("--ww-float-spacing")).toBe("")
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
  })

  it("rejects a dragged inline element's descendants before resolving the containing paragraph", () => {
    document.body.innerHTML = '<p><strong>source <span>nested</span></strong> rest</p>'
    const source = document.querySelector("strong")!
    const child = source.querySelector("span")!
    vi.spyOn(editor, "hitTestBeneathAppendix").mockReturnValue(child)
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    expect(editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX: 125, clientY: 50}), source)).toBeNull()
  })

  it.each([
    ["the dragged element", "source"],
    ["a descendant", "nested"],
  ] as const)("does not float or preview a drop onto %s in either half", (_description, hitSelector) => {
    for(const x of [125, 175]) {
      document.body.innerHTML = '<aside style="color: red; float: left; margin: 8px; width: 80px"><p>source <strong>nested</strong></p></aside><p>end</p>'
      const source = document.querySelector("aside") as HTMLElement
      const hit = hitSelector === "source" ? source : source.querySelector("strong")!
      const originalStyle = source.getAttribute("style")
      const originalOrder = Array.from(document.body.childNodes)
      vi.spyOn(hit, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
      const {data} = beginDrag(source)
      vi.spyOn($, "pointFromCoords").mockReturnValue({node: hit, offset: hit === source ? 0 : 1})

      hit.dispatchEvent(transferEvent("dragover", data, {clientX: x, clientY: 50}))
      expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
      hit.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: 50}))

      expect(source.getAttribute("style")).toBe(originalStyle)
      expect(Array.from(document.body.childNodes)).toEqual(originalOrder)
      expect(document.body.firstElementChild).toBe(source)
      expect(document.body.lastElementChild?.textContent).toBe("end")
      expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    }
  })

  it.each([[120, "left"], [180, "right"]] as const)("uses the projected %s float box beyond the target's height", (x, side) => {
    document.body.innerHTML = '<video style="width:40px;height:60px"></video><p>target</p><p>displaced content</p>'
    const source = document.querySelector("video")!, target = document.querySelector("p")!
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 200, 40, 60))
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 100, 30))
    const {data} = beginDrag(source)
    const event = new MouseEvent("mousemove", {clientX:x, clientY:100})
    expect(editor.features.manipulation.floatDropTarget(event, source)).toBe(target)
    expect(editor.features.manipulation.floatSide(target, x)).toBe(side)
    editor.features.manipulation.showFloatDropPreview(target, side, "transfer", source)
    const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!
    expect(parseFloat(preview.style.top)).toBe(55)
    expect(parseFloat(preview.style.height)).toBe(60)
    expect(editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX:150, clientY:100}), source)).toBeNull()
    expect(editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX:x, clientY:116}), source)).toBeNull()
    document.body.dispatchEvent(transferEvent("drop", data, {clientX:x, clientY:100}))
    expect(source.nextElementSibling).toBe(target)
    expectClassFloat(source, side)
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    expect(document.body.querySelector("#◆float-drop-preview")).toBeNull()
  })

  it("previews every successive paragraph in both drag directions without remeasurement", () => {
    document.body.innerHTML = '<p>first</p><p>second</p><p>third</p><video controls style="width:40px;height:120px"></video>'
    const source = document.querySelector("video")!, paragraphs = Array.from(document.querySelectorAll("p"))
    vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 500))
    const sourceRect = vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 200, 40, 120))
    for(const [index, paragraph] of paragraphs.entries()) vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(100, index * 40, 400, 30))
    editor.features.manipulation.prepareFloatDropTargets(source)
    sourceRect.mockClear()
    for(const index of [0, 1, 2, 1, 0]) {
      const x = 580, event = new MouseEvent("mousemove", {clientX:x, clientY:index * 40 + 10})
      const target = editor.features.manipulation.floatDropTarget(event, source)
      expect(target).toBe(paragraphs[index])
      editor.features.manipulation.showFloatDropPreview(target!, "right", "transfer", source)
      expect(parseFloat(editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!.style.top)).toBe(index * 40 + 5)
    }
    expect(sourceRect).not.toHaveBeenCalled()
  })

  it("measures a standard insertion once per lane across many sibling targets", () => {
    document.body.innerHTML = Array.from({length:50}, (_, index) => `<p>${index}</p>`).join("")
    vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 2000))
    for(const [index, paragraph] of Array.from(document.querySelectorAll("p")).entries()) {
      vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(0, index * 40, 600, 30))
    }
    const source = document.createElement("video")
    const clone = vi.spyOn(source, "cloneNode")
    expect(editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX:300, clientY:1990}), source)).toBeNull()
    expect(clone).toHaveBeenCalledTimes(2)
    for(let index = 0; index < 50; index++) editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX:300, clientY:index * 40}), source)
    expect(clone).toHaveBeenCalledTimes(2)
    expect(editor.appendix.querySelector("video")).toBeNull()
    expect(document.body.querySelectorAll("p")).toHaveLength(50)
  })

  it("does not keep a remotely removed preview target eligible for dropping", () => {
    document.body.innerHTML = '<video style="width:40px;height:60px"></video><p>target</p>'
    const source = document.querySelector("video")!, target = document.querySelector("p")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 100, 30))
    editor.features.manipulation.showFloatDropPreview(target, "left", "transfer", source)
    target.remove()
    expect(editor.features.manipulation.floatDropTarget(new MouseEvent("mousemove", {clientX:120, clientY:70}), source)).toBeNull()
  })

  it.each([false, true])("floats a dragged media element beside the target paragraph in reading order (copy: %s)", copy => {
    for(const [x, side] of [[125, "left"], [175, "right"]] as const) {
      document.body.innerHTML = '<picture style="position: absolute; width: 40px"><img alt="dragged"></picture><p>target</p>'
      const source = document.querySelector("picture") as HTMLElement
      const paragraph = document.querySelector("p")!
      vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
      const {data} = beginDrag(source)
      vi.spyOn($, "pointFromCoords").mockReturnValue({node: paragraph.firstChild!, offset: 3})
      document.body.dispatchEvent(transferEvent("dragover", data, {clientX: x, clientY: 15, ctrlKey: copy}))
      const preview = editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")!
      expect(preview).not.toBeNull()
      expect(preview.getAttribute("part")).toContain(`float-drop-preview-${side}`)
      expect(parseFloat(preview.style.left)).toBeCloseTo(side === "left" ? 100 : 160)
      expect(parseFloat(preview.style.width)).toBeCloseTo(40)
      expect(editor.features.selection.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden").toContain("selection-caret-hidden")
      document.body.dispatchEvent(transferEvent("dragover", data, {clientX: x, clientY: 15, ctrlKey: copy}))
      expect(editor.appendix.querySelector("#◆float-drop-preview")).toBe(preview)
      document.body.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: 15, ctrlKey: copy}))
      const placed = paragraph.previousElementSibling as HTMLElement
      expect(placed).not.toBeNull()
      expect(placed.localName).toBe("picture")
      expect(paragraph.querySelector("img")).toBeNull()
      expectClassFloat(placed, side)
      expect(placed.style.position).toBe("absolute")
      expect(placed.style.width).toBe("40px")
      expect(placed === source).toBe(!copy)
      expect(paragraph.textContent).toBe("target")
      expect(document.body).not.toHaveClass("◆drop-selection-active")
      expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    }
  })

  it.each([[125, "left"], [150, "right"], [175, "right"]] as const)("floats externally dropped media at x=%i using native CSS", (x, side) => {
    document.body.innerHTML = "<p>target</p>"
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    const data = new DataTransfer()
    data.setData("text/html", '<img alt="external">')

    dropAt(data, paragraph.firstChild!, 3, {clientX: x, clientY: 50})

    const placed = paragraph.previousElementSibling as HTMLElement
    expect(placed).not.toBeNull()
    expect(placed.localName).toBe("picture")
    expect(placed.querySelector('img[alt="external"]')).not.toBeNull()
    expectClassFloat(placed, side)
    expect(paragraph.querySelector("img")).toBeNull()
  })

  it.each([[90, 50], [210, 50], [150, -10], [150, 110]])("does not float a drop outside the target box at (%i, %i)", (x, y) => {
    document.body.innerHTML = '<picture style="color: red; float: left; margin: 8px"><source srcset="wide.webp"><img src="fallback.png" alt="media"></picture><p>target</p>'
    const media = document.querySelector("picture") as HTMLElement
    const target = document.querySelector("p")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    const {data} = beginDrag(media)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: target.firstChild!, offset: 3})

    document.body.dispatchEvent(transferEvent("dragover", data, {clientX: x, clientY: y}))
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    document.body.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: y}))

    expect(media.querySelector("source")?.getAttribute("srcset")).toBe("wide.webp")
    expect(media.querySelector("img")?.getAttribute("src")).toBe("fallback.png")
    expect(media.style.float).toBe("")
    expect(media.style.margin).toBe("")
    expect(media.style.marginInlineStart).toBe("")
    expect(media.style.marginInlineEnd).toBe("")
    expect(media.style.color).toBe("red")
    expect(target.textContent).toBe("target")
  })

  it.each([[90, 50], [210, 50], [150, -10], [150, 110]])("does not apply default float styles to external picture media outside the target box at (%i, %i)", (x, y) => {
    document.body.innerHTML = "<p>target</p>"
    const target = document.querySelector("p")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    const data = new DataTransfer()
    data.setData("text/html", '<picture><source srcset="wide.webp"><img src="fallback.png" alt="media"></picture>')
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: target.firstChild!, offset: 3})

    document.body.dispatchEvent(transferEvent("drop", data, {clientX: x, clientY: y}))

    const media = document.querySelector("picture") as HTMLElement
    expect(media.querySelector("source")?.getAttribute("srcset")).toBe("wide.webp")
    expect(media.querySelector("img")?.getAttribute("src")).toBe("fallback.png")
    expect(media.style.float).toBe("")
    expect(media.style.maxWidth).toBe("")
    expect(media.style.margin).toBe("")
  })

  it.each(["before", "after"] as const)("clears float and margin declarations on a dragged gap drop %s the target", position => {
    document.body.innerHTML = '<picture style="float: left; max-width: 50%; margin: 5px; margin-inline-start: 8px; margin-block-end: 9px"><img alt="media"></picture><p>target</p>'
    const source = document.querySelector("picture") as HTMLElement
    const target = document.querySelector("p")!
    const originalStyle = source.getAttribute("style")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const {data} = beginDrag(source)

    dropAt(data, document.body, position === "before" ? 1 : 2)

    expect(source.parentElement).toBe(document.body)
    expect(source.style.float).toBe("")
    expect(source.style.margin).toBe("")
    expect(source.style.marginInlineStart).toBe("")
    expect(source.style.marginBlockEnd).toBe("")
    expect(source.nextElementSibling === target).toBe(position === "before")
    expect(source.previousElementSibling === target).toBe(position === "after")
    editor.doc.syncFromDOM()
    const droppedStyle = source.getAttribute("style")
    editor.doc.undo()
    expect(document.querySelector("picture")?.getAttribute("style")).toBe(originalStyle)
    editor.doc.redo()
    expect(document.querySelector("picture")?.getAttribute("style")).toBe(droppedStyle)
  })

  it("clears float and margins from a copied gap drop while preserving the original", () => {
    document.body.innerHTML = '<picture style="float: left; margin: 5px; margin-inline-start: 8px"><img alt="media"></picture><p>target</p>'
    const source = document.querySelector("picture") as HTMLElement
    const originalStyle = source.getAttribute("style")
    const {data} = beginDrag(source)

    dropAt(data, document.body, 2, {ctrlKey: true})

    const copy = document.querySelectorAll("picture")[1] as HTMLElement
    expect(copy).not.toBe(source)
    expect(copy.style.float).toBe("")
    expect(copy.style.margin).toBe("")
    expect(copy.style.marginInlineStart).toBe("")
    expect(source.getAttribute("style")).toBe(originalStyle)
  })

  it("clears float and margins from externally dropped styled media at a gap", () => {
    document.body.innerHTML = "<p>first</p><p>last</p>"
    const data = new DataTransfer()
    data.setData("text/html", '<picture style="color: red; float: right; margin: 5px; margin-inline-start: 8px; margin-block-end: 9px"><img alt="external"></picture>')

    dropAt(data, document.body, 1)

    const media = document.querySelector("picture") as HTMLElement
    expect(media.style.float).toBe("")
    expect(media.style.margin).toBe("")
    expect(media.style.marginInlineStart).toBe("")
    expect(media.style.marginBlockEnd).toBe("")
    expect(media.nextElementSibling?.textContent).toBe("last")
  })

  it("does not float a drop into a section background gap between its paragraphs", () => {
    document.body.innerHTML = '<p>source</p><section><p>first</p><p>last</p></section>'
    const source = document.body.firstElementChild! as HTMLElement
    const section = document.querySelector("section")!
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 100, 100))
    const {data} = beginDrag(source)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: section, offset: 1})

    section.dispatchEvent(transferEvent("dragover", data, {clientX: 150, clientY: 75}))
    expect(editor.appendix.querySelector("#◆float-drop-preview")).toBeNull()
    section.dispatchEvent(transferEvent("drop", data, {clientX: 150, clientY: 75}))

    expect(source.style.float).toBe("")
    expect(source.style.maxWidth).toBe("")
    expect(source.style.margin).toBe("")
    expect(Array.from(section.children).map(child => child.textContent)).toEqual(["first", "source", "last"])
  })

  it.each(["webwriter-map", "webwriter-code-javascript", "svg"])("capture-selects %s when its node drag surface is clicked", tag => {
    document.body.innerHTML = `<${tag}></${tag}><p>end</p>`
    const widget = document.body.firstElementChild!
    $.selectElement(widget)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector('[part="node-drag-surface"]')!

    surface.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, cancelable: true}))
    // Browsers queue selectionchange after the native mouse default. Happy
    // DOM fires it synchronously, so defer that processing until after click.
    document.addEventListener("selectionchange", event => event.stopImmediatePropagation(), {capture: true, once: true})
    document.getSelection()?.setPosition(document.body, 0)
    surface.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))

    expect(editor.features.selection.captureSelectedWidget).toBe(widget)
    expect(widget).toHaveClass("◆element-selected", "◆element-capture-selected")
    expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()
    expect(editor.features.selection.isInDragSelection).toBe(false)
  })

  it.each(["test-widget", "svg"])("does not capture %s from a stale node drag surface", tag => {
    document.body.innerHTML = `<${tag}></${tag}><p>end</p>`
    const widget = document.body.firstElementChild!
    $.selectElement(widget)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector('[part="node-drag-surface"]')!
    surface.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
    widget.replaceWith(document.createElement("hr"))

    surface.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true}))

    expect(editor.features.selection.isCaptureSelection).toBe(false)
  })

  it.each(["test-widget", "svg"].flatMap(tag => ["pointercancel", "dragstart"].map(type => ({tag, type}))))("does not capture $tag after $type on its drag surface", ({tag, type}) => {
    document.body.innerHTML = `<${tag}></${tag}><p>end</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector('[part="node-drag-surface"]')!
    surface.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true}))
    const data = new DataTransfer()
    surface.dispatchEvent(transferEvent(type, data))
    if(type === "dragstart") {
      expect(data.getData("application/x-webwriter-node")).toBeTruthy()
      surface.dispatchEvent(transferEvent("dragend", data))
    }

    surface.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true}))

    expect(editor.features.selection.isCaptureSelection).toBe(false)
  })

  it("uses the same HTML and innerText for native copy, programmatic copy and node drag", async () => {
    document.body.innerHTML = '<p class="authored" style="color: red"><b>hello</b><br>world</p><p>end</p>'
    const element = document.body.firstElementChild! as HTMLElement
    const {data, surface} = beginDrag(element)
    const copied = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent("copy", {clipboardData: copied, cancelable: true}))
    await editor.features.manipulation.copy()
    const [item] = await navigator.clipboard.read()
    for(const type of ["text/html", "text/plain"]) {
      expect(data.getData(type)).toBe(copied.getData(type))
      expect(await (await item.getType(type)).text()).toBe(data.getData(type))
    }
    expect(data.getData("text/plain")).toBe(element.innerText)
    expect(data.getData("text/html")).toContain('class="authored"')
    expect(data.getData("text/html")).not.toContain("◆")
    expect(element.hasAttribute("draggable")).toBe(false)
    expect(document.body.contains(surface)).toBe(false)
    surface.dispatchEvent(transferEvent("dragend", data))
  })

  it.each(["paste", "drop", "beforeinput", "async paste"])("sanitizes and canonizes external %s", async method => {
    document.body.innerHTML = ""
    const data = new DataTransfer()
    const html = '<script>bad()</script><style>p{color:red}</style><dialog open><hgroup><p class="external" style="color:red" onclick="bad()"><strong>bold</strong> <em>italic</em> <strike>old</strike><span><abbr title="abbreviation"><small>plain</small></abbr></span><ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby><a href="javascript:bad()">link</a></p></hgroup></dialog><img src="photo.png" class="photo" style="width:10px">'
    data.setData("text/html", html)
    data.setData("text/plain", "fallback")
    $.selectDocumentStart()
    if(method === "drop") dropAt(data, document.body, 0)
    else if(method === "paste") document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
    else if(method === "beforeinput") {
      const event = new InputEvent("beforeinput", {inputType: "insertFromPaste", cancelable: true})
      Object.defineProperty(event, "dataTransfer", {value: data})
      document.dispatchEvent(event)
    }
    else {
      await navigator.clipboard.write([new ClipboardItem({"text/html": html})])
      await editor.features.manipulation.paste()
    }
    expectBodyToBe('<p><b>bold</b> <i>italic</i> <s>old</s>plain漢<a>link</a></p><picture><img src="photo.png"></picture>')
  })

  it.each(excludedMarkNames)("strips imported <%s> marks while preserving nested content", name => {
    const {fragment} = editor.parseHTMLFragment(`<p>before<${name} title="discard"><strong>keep</strong><sup>2</sup></${name}>after</p>`, true)
    expect(fragment.firstElementChild?.outerHTML).toBe('<p>before<b>keep</b><sup>2</sup>after</p>')
  })

  it("imports only ruby base content, including explicit and nested bases", () => {
    const {fragment} = editor.parseHTMLFragment('<p><ruby><rb><strong>漢</strong></rb><rb><ruby>字<rt>じ</rt></ruby></rb><rp>(</rp><rt><em>かんじ</em></rt><rp>)</rp><rtc><rt>characters</rt></rtc></ruby></p>', true)
    expect(fragment.firstElementChild?.outerHTML).toBe('<p><b>漢</b>字</p>')
  })

  it("strips marks in imported templates while preserving widget and foreign subtrees", () => {
    const {fragment} = editor.parseHTMLFragment('<template><p><span><abbr>plain</abbr></span></p></template><test-widget><span><abbr>widget</abbr></span></test-widget><p is="custom-text"><span>customized</span></p><svg><text><span>foreign</span></text></svg>', true)
    expect(fragment.querySelector("template")?.innerHTML).toBe('<p>plain</p>')
    expect(fragment.querySelector("test-widget")?.innerHTML).toBe('<span><abbr>widget</abbr></span>')
    expect(fragment.querySelector('[is="custom-text"]')?.innerHTML).toBe('<span>customized</span>')
    expect(fragment.querySelector("svg")?.innerHTML).toBe('<text><span>foreign</span></text>')
  })

  it("keeps explicit HTML edits intact when they contain excluded import marks", () => {
    const html = '<p><span style="color:red"><abbr title="meaning">text</abbr></span><ruby>漢<rt>かん</rt></ruby></p>'
    const {fragment} = editor.parseHTMLFragment(html)
    expect(fragment.firstElementChild?.outerHTML).toBe(html)
  })

  it("undoes and redoes imported content without restoring stripped markup", () => {
    const data = new DataTransfer()
    data.setData("text/html", '<dialog><hgroup><p><span><small>plain</small></span><ruby>漢<rt>かん</rt></ruby></p></hgroup></dialog>')
    document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
    editor.doc.syncFromDOM()
    expectBodyToBe('<p>plain漢</p>')
    editor.doc.undo()
    expectBodyToBe('<p></p>')
    editor.doc.redo()
    expectBodyToBe('<p>plain漢</p>')
    expect(editor.doc.body.toString()).not.toMatch(/<(dialog|hgroup|span|small|ruby|rt)[ >]/)
  })

  it.each(["paste", "drop"])("preserves nested widget editing attributes on native %s", async method => {
    const data = new DataTransfer()
    data.setData("text/html", '<section><demo-widget contenteditable="false"><nested-widget></nested-widget></demo-widget><div is="custom-widget" contenteditable="plaintext-only"></div></section>')
    if(method === "drop") dropAt(data, document.body, 0)
    else document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
    await new Promise(resolve => setTimeout(resolve, 0))

    const widgets = document.querySelectorAll("demo-widget, nested-widget, [is]")
    expect(widgets).toHaveLength(3)
    expect(widgets[0]).toHaveAttribute("contenteditable", "false")
    expect(widgets[1]).not.toHaveAttribute("contenteditable")
    expect(widgets[2]).toHaveAttribute("contenteditable", "plaintext-only")
    expect(editor.toHTML(true)).toContain('<demo-widget contenteditable="false"><nested-widget></nested-widget></demo-widget>')
    expect(editor.toHTML(true)).toContain('<div is="custom-widget" contenteditable="plaintext-only"></div>')
  })

  it("sanitizes widget and template contents without canonizing a widget's private structure", () => {
    const {fragment} = editor.parseHTMLFragment('<test-widget class="external"><strong style="color:red">keep alias</strong><script>bad()</script><template><style>bad</style><span class="external" onclick="bad()">safe</span></template></test-widget>', true)
    const widget = fragment.querySelector("test-widget")!
    expect(widget.outerHTML).toBe('<test-widget><strong>keep alias</strong><template><span>safe</span></template></test-widget>')
  })

  it.each([false, true])("preserves installed quiz subtrees despite editing metadata (transfer=%s)", transfer => {
    editor.schema.extendWidgets([
      {tagName: "webwriter-task", editingConfig: {content: "webwriter-task-prompt webwriter-mark"}},
      {tagName: "webwriter-task-prompt", editingConfig: {group: "", content: "p+"}},
      {tagName: "webwriter-mark", editingConfig: {group: "answer", content: "(text | br | wbr)*"}},
    ])
    const html = '<webwriter-task contenteditable="false">\n  <webwriter-task-prompt slot="prompt" contenteditable="plaintext-only"><p>Question</p></webwriter-task-prompt>\n  <!--keep--><webwriter-mark contenteditable="true"><p>Answer</p><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg></webwriter-mark>\n</webwriter-task>'
    const {fragment} = editor.parseHTMLFragment(html, transfer)

    expect(fragment.querySelector("webwriter-task")).toHaveAttribute("contenteditable", "false")
    expect(fragment.querySelector("webwriter-task-prompt")).toHaveAttribute("contenteditable", "plaintext-only")
    expect(fragment.querySelector("webwriter-mark")).toHaveAttribute("contenteditable", "true")
    expect(fragment.querySelector("[class]")).toBeNull()
    editor.clearEditingArtifacts(fragment)
    expect(fragment.firstElementChild?.outerHTML).toBe(html)
    expect(fragment.querySelector("svg")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("preserves customized built-in widget editing attributes while sanitizing active markup", () => {
    const {fragment} = editor.parseHTMLFragment('<div is="custom-quiz" contenteditable="plaintext-only"><span><section>Widget layout</section></span><script>bad()</script></div>')
    expect(fragment.firstElementChild?.outerHTML).toBe('<div is="custom-quiz" contenteditable="plaintext-only"><span><section>Widget layout</section></span></div>')
  })

  it.each(sectionNames)("unwraps external <%s> sections while preserving non-section content", name => {
    const {fragment} = editor.parseHTMLFragment(`<${name} id="wrapper"><p>first</p><!--keep--><p><strong>second</strong></p></${name}>`, true)
    const container = document.createElement("div")
    container.append(fragment)
    expect(container.innerHTML).toBe('<p>first</p><!--keep--><p><b>second</b></p>')
  })

  it.each(["paste", "drop", "async paste"])("flattens nested external sections and retains picture captions on %s", async method => {
    document.body.innerHTML = ""
    const html = '<article><div><h2>Title</h2><section><p><strong>Bold</strong></p></section><figure><img src="photo.png"><figcaption><em>Caption</em></figcaption></figure><blockquote><ul><li>Item</li></ul></blockquote></div></article>'
    const data = new DataTransfer()
    data.setData("text/html", html)
    $.selectDocumentStart()
    if(method === "drop") dropAt(data, document.body, 0)
    else if(method === "paste") document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
    else {
      await navigator.clipboard.write([new ClipboardItem({"text/html": html})])
      await editor.features.manipulation.paste()
    }
    expectBodyToBe('<h2>Title</h2><p><b>Bold</b></p><picture><img src="photo.png"></picture><p><i>Caption</i></p><ul><li>Item</li></ul>')
  })

  it.each(["paste", "clipboard", "drop"])("unwraps forms and extracts control values on %s", async method => {
    document.body.replaceChildren()
    $.selectDocumentStart()
    const html = '<form><fieldset><legend>Contact</legend><p>Before <label>Name <input value="Ada &amp; Bob"></label> after <textarea>Notes</textarea> <button><strong>Send</strong></button></p><p><select><optgroup label="Choices"><option value="a">Alpha</option><option value="b"></option></optgroup></select> <output>42</output> <meter value="3"></meter> <progress value="7"></progress></p></fieldset></form>'
    const data = new DataTransfer()
    data.setData("text/html", html)
    if(method === "drop") dropAt(data, document.body, 0)
    else if(method === "paste") document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
    else {
      await navigator.clipboard.write([new ClipboardItem({"text/html": html})])
      await editor.features.manipulation.paste()
    }
    expectBodyToBe('<p>Contact</p><p>Before Name Ada &amp; Bob after Notes <b>Send</b></p><p>Alphab 42 3 7</p>')
    expect(document.body.querySelector('form,fieldset,legend,label,input,textarea,button,select,optgroup,option,output,meter,progress')).toBeNull()
  })

  it("keeps widget-owned sections atomic while unwrapping their external containers", () => {
    const {fragment} = editor.parseHTMLFragment('<div><test-widget contenteditable="false"><section><div>widget structure</div></section></test-widget></div>', true)
    expect(fragment.firstElementChild?.outerHTML).toBe('<test-widget contenteditable="false"><section><div>widget structure</div></section></test-widget>')
    expect(fragment.childNodes).toHaveLength(1)
  })

  it.each(["inline", "block"])("adapts a %s formula on paste and external drop", display => {
    for(const method of ["paste", "drop"]) for(const inline of [true, false]) {
      document.body.innerHTML = "<p>target</p>"
      const target = inline ? document.querySelector("p")!.firstChild! : document.body
      const data = new DataTransfer()
      data.setData("text/html", `<math display="${display}"><mi>x</mi></math>`)
      // Happy DOM does not switch namespaces when parsing MathML in HTML.
      const parse = editor.parseHTMLFragment.bind(editor)
      const parser = vi.spyOn(editor, "parseHTMLFragment").mockImplementation((...args) => {
        const result = parse(...args)
        for(const original of Array.from(result.fragment.querySelectorAll("math"))) {
          const math = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math")
          math.setAttribute("display", original.getAttribute("display")!)
          const token = document.createElementNS(math.namespaceURI, "mi")
          token.textContent = "x"
          math.append(token)
          original.replaceWith(math)
        }
        return result
      })
      $.move(target, 1)
      if(method === "drop") dropAt(data, target, 1)
      else document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, cancelable: true}))
      parser.mockRestore()
      const math = document.querySelector("math")!
      expect(math.getAttribute("display")).toBe(inline ? "inline" : "block")
      expect(math.parentElement).toBe(inline ? document.querySelector("p") : document.body)
    }
  })

  it.each([false, true])("adapts internal formula moves and copies to their destination (copy=%s)", copy => {
    document.body.innerHTML = "<p>target</p>"
    const math = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math")
    const token = document.createElementNS(math.namespaceURI, "mi")
    token.textContent = "x"
    math.append(token)
    math.setAttribute("display", "block")
    document.body.append(math)
    const {data} = beginDrag(math)
    dropAt(data, document.querySelector("p")!.firstChild!, 3, {ctrlKey: copy})
    const inline = document.querySelector("p math")!
    expect(inline.getAttribute("display")).toBe("inline")
    expect(inline === math).toBe(!copy)
    const next = beginDrag(inline)
    dropAt(next.data, document.body, 0)
    expect(document.body.firstElementChild).toBe(inline)
    expect(inline.getAttribute("display")).toBe("block")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("retains sections in explicit HTML edits and internal node drops", () => {
    const {fragment} = editor.parseHTMLFragment('<div><section><p>authored</p></section></div>')
    expect(fragment.firstElementChild?.outerHTML).toBe('<div><section><p>authored</p></section></div>')
    document.body.innerHTML = '<test-widget><div><section>authored</section></div></test-widget><p>target</p>'
    const widget = document.body.firstElementChild!
    const {data} = beginDrag(widget)
    dropAt(data, document.body, 2)
    expect(document.body.lastElementChild).toBe(widget)
    expect(widget.innerHTML).toBe('<div><section>authored</section></div>')
  })

  it.each(["static", "relative", "absolute", "fixed", "sticky"])("drops a widget with %s positioning into flow between irregular siblings and supports collaboration undo/redo", position => {
    document.body.innerHTML = '<section><p>first</p><!--keep--><test-widget class="authored" style="color:red"><strong>unchanged</strong></test-widget><p>last</p></section>'
    const widget = document.querySelector("test-widget")!
    const section = document.querySelector("section")!
    const style = (widget as HTMLElement).style
    style.setProperty("position", position, "important")
    style.width = "80px"
    style.setProperty("inset", "30px")
    const originalStyle = widget.getAttribute("style")
    const clicked = vi.fn()
    widget.addEventListener("custom-action", clicked)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const {data} = beginDrag(widget)
    expect(dropAt(data, section, 0).defaultPrevented).toBe(true)
    expect(section.firstElementChild).toBe(widget)
    widget.dispatchEvent(new Event("custom-action"))
    expect(clicked).toHaveBeenCalledOnce()
    expect(widget.querySelector("strong")).not.toBeNull()
    expect(widget).toHaveClass("authored")
    expect(style.color).toBe("red")
      expect(style.position).toBe(position)
    expect(style.width).toBe("80px")
    expect(style.getPropertyValue("inset")).toBe("30px")
    expect(style.maxWidth).toBe("")
    expect(style.float).toBe("")
    editor.doc.syncFromDOM()
    const droppedStyle = widget.getAttribute("style")
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("node-drag-surface")
    expect(editor.toHTML(true)).not.toContain("◆")
    editor.doc.undo()
    expect(document.querySelector("section")!.childNodes[2].nodeName).toBe("TEST-WIDGET")
    expect(document.querySelector("test-widget")!.getAttribute("style")).toBe(originalStyle)
    editor.doc.redo()
    expect(document.querySelector("section")!.firstElementChild!.nodeName).toBe("TEST-WIDGET")
    expect(document.querySelector("test-widget")!.getAttribute("style")).toBe(droppedStyle)
  })

  it.each(["aside", "svg"])("clears float and margin while preserving other styles and descendants on a gap drop of %s", tag => {
    document.body.innerHTML = `<${tag} style="position: absolute !important; inset: 30px 40px; inset-block: 10px 20px; inset-inline: 5px 15px; width: 80px; height: 50px; min-width: 20px; max-width: 100px; min-height: 30px; max-height: 90px; inline-size: 80px; block-size: 50px; min-inline-size: 20px; max-inline-size: 100px; min-block-size: 30px; max-block-size: 90px; aspect-ratio: 2; float: left; z-index: 7; transform: translateX(10px); translate: 5px; rotate: 15deg; scale: 2; color: red; margin: 8px; --authored: value"><unfamiliar-node style="position: absolute; width: 12px">keep</unfamiliar-node></${tag}><p>end</p>`
    const source = document.body.firstElementChild! as HTMLElement | SVGSVGElement
    const child = source.firstElementChild!
    const content = source.innerHTML
    const {data} = beginDrag(source)

    dropAt(data, document.body, 2)

    expect(document.body.lastElementChild).toBe(source)
    expect(source.style.position).toBe("absolute")
    expect(source.style.width).toBe("80px")
    expect(source.style.maxWidth).toBe("100px")
    expect(source.style.float).toBe("")
    expect(source.style.color).toBe("red")
    expect(source.style.margin).toBe("")
    expect(source.style.getPropertyValue("--authored")).toBe("value")
    expect(source.firstElementChild).toBe(child)
    expect(editor.toHTML(true)).toContain(content)
  })

  it.each(["static", "fixed"])("lets destination stylesheet positioning apply when dropping a %s element", position => {
    const sheet = document.createElement("style")
    sheet.textContent = `.drop-positioned { position: ${position} !important } section > .drop-positioned { position: sticky !important }`
    document.head.append(sheet)
    try {
      document.body.innerHTML = '<p class="drop-positioned" style="width: 80px; height: 50px; inset: 30px">source</p><section><p>target</p></section>'
      const source = document.body.firstElementChild!
      const section = document.querySelector("section")!
      expect(getComputedStyle(source).position).toBe(position)
      const {data} = beginDrag(source)

      dropAt(data, section, 1)

      expect(section.lastElementChild).toBe(source)
      expect((source as HTMLElement).style.width).toBe("80px")
      expect((source as HTMLElement).style.height).toBe("50px")
      expect((source as HTMLElement).style.getPropertyValue("inset")).toBe("30px")
      expect((source as HTMLElement).style.maxWidth).toBe("")
      expect((source as HTMLElement).style.float).toBe("")
      expect(getComputedStyle(source).position).toBe("sticky")
      expect(source).toHaveClass("drop-positioned")
    }
    finally { sheet.remove() }
  })

  it("preserves inline dimensions and caps width on a dropped element", () => {
    document.body.innerHTML = '<p style="width: 80px; height: 50px; max-inline-size: 100px">source</p><p>end</p>'
    const source = document.body.firstElementChild!
    const {data} = beginDrag(source)

    dropAt(data, document.body, 2)

    expect(document.body.lastElementChild).toBe(source)
    expect((source as HTMLElement).style.width).toBe("80px")
    expect((source as HTMLElement).style.height).toBe("50px")
    expect((source as HTMLElement).style.maxInlineSize).toBe("100px")
    expect((source as HTMLElement).style.maxWidth).toBe("")
    expect((source as HTMLElement).style.float).toBe("")
  })

  it.each(["ctrlKey", "altKey"])("floats only the dropped copy when %s is pressed", modifier => {
    document.body.innerHTML = '<p style="position: fixed; left: 30px; top: 40px; width: 80px; height: 50px">source</p><p>end</p>'
    const source = document.body.firstElementChild!
    const originalStyle = source.getAttribute("style")
    const {data} = beginDrag(source)

    dropAt(data, document.body, 2, {[modifier]: true})

    const copy = document.body.lastElementChild!
    expect(copy).not.toBe(source)
    expect(copy.textContent).toBe("source")
    expect((copy as HTMLElement).style.position).toBe("fixed")
    expect((copy as HTMLElement).style.maxWidth).toBe("")
    expect((copy as HTMLElement).style.float).toBe("")
    expect(document.body.firstElementChild).toBe(source)
    expect(source.getAttribute("style")).toBe(originalStyle)
  })

  it("keeps positioning changed during drag when applying native float", () => {
    document.body.innerHTML = '<p>source</p><p>end</p>'
    const source = document.body.firstElementChild! as HTMLElement
    const {data} = beginDrag(source)
    source.style.position = "absolute"
    source.style.width = "120px"

    dropAt(data, document.body, 2)

    expect(document.body.lastElementChild).toBe(source)
    expect(source.style.position).toBe("absolute")
    expect(source.style.width).toBe("120px")
    expect(source.style.maxWidth).toBe("")
    expect(source.style.float).toBe("")
  })

  it.each(["cancel", "self", "disconnected"])("preserves positioning when a drop ends with %s", ending => {
    document.body.innerHTML = '<aside style="position: absolute; left: 30px; top: 40px; width: 80px; height: 50px"><p>source</p></aside><p>end</p>'
    const source = document.body.firstElementChild!
    const originalStyle = source.getAttribute("style")
    const {data, surface} = beginDrag(source)
    if(ending === "cancel") surface.dispatchEvent(transferEvent("dragend", data))
    else if(ending === "self") dropAt(data, source.firstChild!, 0)
    else {
      source.replaceWith(document.createElement("hr"))
      dropAt(data, document.body, 2)
    }

    expect(source.getAttribute("style")).toBe(originalStyle)
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    if(ending === "disconnected") expect(document.body.firstElementChild!.localName).toBe("hr")
    else expect(document.body.firstElementChild).toBe(source)
  })

  it("treats spoofed editor data as an external drop", () => {
    document.body.innerHTML = ""
    const data = new DataTransfer()
    data.setData("application/x-webwriter-node", "untrusted")
    data.setData("text/html", '<p class="external" style="color:red"><strong>safe</strong><script>bad()</script></p>')
    dropAt(data, document.body, 0)
    expectBodyToBe("<p><b>safe</b></p>")
  })

  it("rejects drops into the dragged node and does not delete a concurrently replaced source", () => {
    document.body.innerHTML = '<test-widget><p>source</p></test-widget><p>end</p>'
    const source = document.body.firstElementChild!
    let {data} = beginDrag(source)
    dropAt(data, source.firstChild!, 0)
    expectBodyToBe('<test-widget><p>source</p></test-widget><p>end</p>')
    ;({data} = beginDrag(source))
    source.replaceWith(document.createElement("hr"))
    dropAt(data, document.body, 2)
    expectBodyToBe('<hr><p>end</p>')
  })

  it("copies on a modified internal drop and keeps plain text literal on external drop", () => {
    document.body.innerHTML = '<p class="authored">source</p>'
    const source = document.body.firstElementChild!
    const {data} = beginDrag(source)
    dropAt(data, document.body, 1, {ctrlKey: true})
    const copy = document.body.lastElementChild as HTMLElement
    expect(copy).toHaveClass("authored")
    expect(copy.textContent).toBe("source")
    expect(copy.style.maxWidth).toBe("")
    expect(copy.style.float).toBe("")
    expect(document.body.firstElementChild).toBe(source)
    const plain = new DataTransfer()
    plain.setData("text/plain", "<b>literal</b>\nnext")
    dropAt(plain, document.body, 2)
    expect(document.body.lastElementChild!.innerHTML).toBe('&lt;b&gt;literal&lt;/b&gt;<br>next')
  })

  it("removes the drag surface on deselection and disable", () => {
    document.body.innerHTML = '<p>source</p>'
    const {surface, data} = beginDrag(document.body.firstElementChild!)
    surface.dispatchEvent(transferEvent("dragend", data))
    $.move(document.body.firstElementChild!.firstChild!, 1)
    editor.features.selection.processSelection()
    expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()
    beginDrag(document.body.firstElementChild!)
    editor.features.manipulation.disable()
    editor.features.selection.processSelection()
    expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBeNull()
    editor.features.manipulation.enable()
  })

  it.each(["p", "h2", "table", "test-widget", "svg"])("keeps %s drag hit areas in the appendix and out of shared HTML", tag => {
    document.body.innerHTML = tag === "table" ? "<table><tbody><tr><td>source</td></tr></tbody></table>" : `<${tag}>source</${tag}>`
    const source = document.body.firstElementChild!
    const {surface, data} = beginDrag(source)
    expect(surface.style.clipPath !== "").toBe(["p", "h2", "table"].includes(tag))
    expect(surface.getRootNode()).toBe(editor.appendix)
    expect(data.getData("text/html")).not.toContain("clip-path")
    expect(source.getAttribute("style")).toBeNull()
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("clip-path")
    expect(editor.toHTML(true)).not.toContain("clip-path")
    surface.dispatchEvent(transferEvent("dragend", data))
    $.move(document.body, 0)
    editor.features.selection.processSelection()
    expect(surface.isConnected).toBe(false)
  })

  it("accepts external drops over the selection's drag surface", () => {
    document.body.innerHTML = '<p>selected</p><p>end</p>'
    $.selectElement(document.body.firstElementChild!)
    editor.features.selection.processSelection()
    const surface = editor.appendix.querySelector('[part="node-drag-surface"]')!
    const data = new DataTransfer()
    data.setData("text/html", '<p class="external"><em>safe</em><script>bad()</script></p>')
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: 1})
    const over = transferEvent("dragover", data)
    surface.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    surface.dispatchEvent(transferEvent("drop", data))
    expectBodyToBe('<p>selected</p><p><i>safe</i></p><p>end</p>')
  })

  it("moves a paragraph into a list item's flow content without rebuilding the list", () => {
    document.body.innerHTML = '<p>source</p><ul><li>target</li></ul>'
    const paragraph = document.body.firstElementChild as HTMLParagraphElement
    const list = document.querySelector("ul")!
    const item = document.querySelector("li")!
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 90, 30))
    const {data} = beginDrag(paragraph)
    dropAt(data, item.firstChild!, 3, {clientX: 145, clientY: 15})
    expect(document.body.firstElementChild).toBe(list)
    expect(item.children[0]).toBe(paragraph)
    expect(paragraph.style.float).toBe("")
    expectBodyToBe('<ul><li>tar<p>source</p>get</li></ul>')
  })

  it("moves a collapsed drop selection between text and gaps, then removes its blue state on drop", () => {
    document.body.innerHTML = '<p>first</p><p>last</p>'
    const text = document.querySelector("p")!.firstChild!
    const data = new DataTransfer()
    data.setData("text/plain", "inserted")
    const point = vi.spyOn($, "pointFromCoords").mockReturnValue({node: text, offset: 2})
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 30, 0, 18))
    document.body.dispatchEvent(transferEvent("dragover", data))
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect($.isTextSelection).toBe(true)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(2)
    expect(document.body).toHaveClass("◆drop-selection-active")
    const caret = editor.features.selection.selectionCaret!
    expect(caret.getAttribute("part")).toContain("selection-caret-text")
    expect(caret.style.left).toBe("20px")
    expect(caret.style.top).toBe("30px")
    expect(caret.style.height).toBe("18px")

    point.mockReturnValue({node: document.body, offset: 1})
    document.body.dispatchEvent(transferEvent("dragover", data))
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect($.isGapSelection).toBe(true)
    expect($.anchorOffset).toBe(1)
    expect(editor.features.selection.selectionCaret!.getAttribute("part")).toContain("gap-caret")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("◆drop-selection-active")
    expect(editor.toHTML(true)).not.toContain("◆drop-selection-active")
    document.body.dispatchEvent(transferEvent("drop", data))
    expectBodyToBe('<p>first</p><p>inserted</p><p>last</p>')
    expect(document.body).not.toHaveClass("◆drop-selection-active")
  })

  it("previews the right half at the center for an internal block drop", () => {
    document.body.innerHTML = '<p>source</p><p>target</p>'
    const source = document.body.firstElementChild!
    const target = document.body.lastElementChild!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 90, 30))
    const {data} = beginDrag(source)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: target.firstChild!, offset: 2})
    target.dispatchEvent(transferEvent("dragover", data, {clientX: 45, clientY: 15}))
    expect(editor.appendix.querySelector("#◆float-drop-preview")?.getAttribute("part")).toContain("float-drop-preview-right")
    expect(editor.features.selection.selectionCaret?.getAttribute("part") ?? "selection-caret-hidden").toContain("selection-caret-hidden")
    target.dispatchEvent(transferEvent("drop", data, {clientX: 45, clientY: 15}))
    expect(target.previousElementSibling).toBe(source)
    expect((source as HTMLElement)).toHaveClass("ww-float-right")
    expect((source as HTMLElement).style.maxWidth).toBe("")
    expectFarFloat(source as HTMLElement, "right")
    expect(Array.from(document.body.children, element => element.localName)).toEqual(["p", "p"])
    expect(document.body.firstElementChild?.textContent).toBe("source")
    expect(document.body.lastElementChild?.textContent).toBe("target")
    expect(document.body).not.toHaveClass("◆drop-selection-active")
  })

  it("keeps the native drag source connected and hit-testable until drop", () => {
    document.body.innerHTML = '<p>source</p><p>target</p>'
    const source = document.body.firstElementChild!
    const {data, surface} = beginDrag(source)
    expect(surface.isConnected).toBe(true)
    expect(getComputedStyle(surface).pointerEvents).not.toBe("none")
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: 2})
    document.body.dispatchEvent(transferEvent("dragover", data))
    expect(editor.appendix.querySelector('[part="node-drag-surface"]')).toBe(surface)
    expect(getComputedStyle(surface).pointerEvents).not.toBe("none")
    document.body.dispatchEvent(transferEvent("drop", data))
    expect(document.body.lastElementChild).toBe(source)
    expect(surface.isConnected).toBe(false)
  })

  it("positions the idle node drag surface only after geometry invalidation and cleans up observers", () => {
    document.body.innerHTML = "<p>source</p>"
    const source = document.body.firstElementChild!
    // Presence carets also redraw on resize; count only the drag surface's frames.
    editor.features.collaboration.disable()
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    const requestFrame = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => {
      const id = ++nextFrame
      callbacks.set(id, callback)
      return id
    })
    const cancelFrame = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(id => { callbacks.delete(id) })
    const measure = vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 100, 30))

    editor.features.manipulation.refreshNodeDragTarget(source)
    expect(requestFrame).toHaveBeenCalledOnce()
    callbacks.get(1)!(0)
    expect(measure).toHaveBeenCalledOnce()
    expect(requestFrame).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event("resize"))
    expect(requestFrame).toHaveBeenCalledTimes(2)
    callbacks.get(2)!(16)
    expect(measure).toHaveBeenCalledTimes(2)

    editor.features.manipulation.disable()
    expect(cancelFrame).not.toHaveBeenCalled()
    window.dispatchEvent(new Event("resize"))
    expect(requestFrame).toHaveBeenCalledTimes(2)
    editor.features.manipulation.enable()
    editor.features.collaboration.enable()
  })

  it.each(["dragend", "dragleave", "disable"])("cleans up the drop indicator and handles %s", ending => {
    document.body.innerHTML = '<p>source</p><p>target</p>'
    const source = document.body.firstElementChild!
    const {data, surface} = beginDrag(source)
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.body, offset: 2})
    document.body.dispatchEvent(transferEvent("dragover", data))
    if(ending === "disable") editor.features.manipulation.disable()
    else if(ending === "dragend") surface.dispatchEvent(transferEvent("dragend", data))
    else {
      document.body.dispatchEvent(transferEvent("dragleave", data, {relatedTarget: null, clientX: -1}))
      surface.dispatchEvent(transferEvent("dragend", data))
    }
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    expectBodyToBe('<p>source</p><p>target</p>')
    if(ending !== "disable") expect($.selectedElement).toBe(source)
    editor.features.manipulation.enable()
  })

  it("hides the text drop caret when transfer handling is disabled", () => {
    document.body.innerHTML = '<p>target</p>'
    const data = new DataTransfer()
    data.setData("text/plain", "text")
    vi.spyOn($, "pointFromCoords").mockReturnValue({node: document.querySelector("p")!.firstChild!, offset: 2})
    document.body.dispatchEvent(transferEvent("dragover", data))
    const caret = editor.features.selection.selectionCaret!
    expect(caret.getAttribute("part")).toContain("selection-caret-text")
    editor.features.manipulation.disable()
    expect(document.body).not.toHaveClass("◆drop-selection-active")
    expect(caret.getAttribute("part")).toContain("selection-caret-hidden")
    editor.features.manipulation.enable()
  })
})


describe("independent positioned flows", () => {
  it.each(["position: absolute", "position: fixed", "float: left", "float: right"])("deletes across %s widgets without changing them", style => {
    document.body.innerHTML = `<p>before</p><flow-probe style="${style}"><p>private</p></flow-probe><p>after</p>`
    const widget = document.querySelector("flow-probe")!
    const html = widget.outerHTML
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.lastElementChild!.firstChild!, 5)
    editor.features.manipulation.delete()
    expect(widget.parentElement).toBe(document.body)
    expect(widget.outerHTML).toBe(html)
    expect(document.body.textContent).toBe("private")
  })

  it.each(["backward", "forward"] as const)("joins the flow across positioned siblings on %s deletion", direction => {
    document.body.innerHTML = '<p>before</p><img style="position: fixed"><p>after</p>'
    const image = document.querySelector("img")!
    $.selectRange(document.body, 1)
    editor.features.manipulation.delete(direction)
    expect(image.parentElement).toBe(document.body)
    expect(document.querySelector("p")!.textContent).toBe("beforeafter")
    expect(document.querySelectorAll("p")).toHaveLength(1)
  })

  it.each(["position: absolute", "float: left", "float: right"])("keeps nested %s nodes in the original block on Enter", style => {
    document.body.innerHTML = `<p>before<span style="${style}">floating</span>after</p>`
    const block = document.querySelector("p")!
    const floating = document.querySelector("span")!
    $.move(block.firstChild!, 3)
    editor.features.manipulation.insert()
    expect(floating.parentElement).toBe(block)
    expect(document.querySelectorAll("p")).toHaveLength(2)
    expect(document.body.lastElementChild!.textContent).toBe("oreafter")
  })

  it("formats only text blocks belonging to the selected flow", () => {
    document.body.innerHTML = '<p>before</p><aside style="position: fixed"><p>floating</p></aside><p>after</p>'
    const floating = document.querySelector("aside")!
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.lastElementChild!.firstChild!, 5)
    editor.features.manipulation.setBlockType("h2")
    expect(document.querySelectorAll("h2")).toHaveLength(2)
    expect(floating.firstElementChild!.localName).toBe("p")
    expect(floating.textContent).toBe("floating")
  })

  it("wraps a section around flow siblings without moving a positioned sibling", () => {
    document.body.innerHTML = '<p>before</p><aside style="position: fixed">floating</aside><p>after</p>'
    const floating = document.querySelector("aside")!
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.lastElementChild!.firstChild!, 5)
    expect(editor.features.manipulation.toggleSection()).toBe(true)
    expect(floating.parentElement).toBe(document.body)
    expect(document.querySelector("section")!.textContent).toBe("beforeafter")
  })

  it("replaces a native text range while preserving its positioned subtree", () => {
    document.body.innerHTML = '<p>before<span style="position: absolute">floating</span>after</p>'
    const block = document.querySelector("p")!
    const floating = document.querySelector("span")!
    $.selectRange(block.firstChild!, 2, block.lastChild!, 3)
    const event = new InputEvent("beforeinput", {inputType: "insertText", data: "X", bubbles: true, cancelable: true})
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(floating.parentElement).toBe(block)
    expect(block.textContent).toBe("beXfloatinger")
  })
})

describe("legacy column groups", () => {
  it("preserves an authored group and its unfamiliar children during ordinary insertion", () => {
    document.body.innerHTML = '<div class="ww-column-group"><!--keep--><p class="ww-column-left">left</p><unknown-widget custom="yes"></unknown-widget></div>'
    const group = document.querySelector(".ww-column-group")!
    const widget = group.querySelector("unknown-widget")!
    const heading = document.createElement("h2")
    heading.textContent = "Heading"
    group.append(heading)
    expect(group).toHaveClass("ww-column-group")
    expect(group.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(widget.parentElement).toBe(group)
    expect(widget.getAttribute("custom")).toBe("yes")
    expect(heading.parentElement).toBe(group)
  })
})

describe("element insertion conversions", () => {
  const convert = (tag: string) => editor.features.manipulation.actions.insertElement({type: "insertElement", tag})

  it.each([["h2", "p"], ["p", "h3"]])("converts a %s caret container to %s", (source, target) => {
    document.body.innerHTML = `<${source} id="intro" class="authored">one <b>two</b><!--keep--></${source}><p>other</p>`
    const bold = document.querySelector("b")!
    $.move(bold.firstChild!, 1)
    convert(target)
    expect(document.body.firstElementChild?.localName).toBe(target)
    expect(document.body.firstElementChild?.id).toBe("intro")
    expect(document.querySelector("b")).toBe(bold)
    expect(editor.toHTML(true)).toContain("<!--keep-->")
  })

  it.each(["ul", "ol", "table"])("converts multiple text elements to %s", tag => {
    document.body.innerHTML = `<p id="one">first</p><!--keep--><h2>second</h2><p>other</p>`
    const first = document.body.firstElementChild!, second = document.querySelector("h2")!
    $.selectRange(document.body, 0, document.body, 3)
    convert(tag)
    const wrapper = document.body.firstElementChild!
    expect(wrapper.localName).toBe(tag)
    expect(wrapper.querySelectorAll(tag === "table" ? "td" : "li")).toHaveLength(2)
    expect(wrapper.querySelector("p")).toBe(first)
    if(tag === "table") expect(wrapper.querySelector("h2")).toBe(second)
    else {
      expect(wrapper.querySelector("h2")).toBeNull()
      expect(wrapper.querySelectorAll("li > p")[1]?.textContent).toBe("second")
    }
    expect(wrapper.querySelectorAll("#one")).toHaveLength(1)
    expect(editor.toHTML(true)).toContain("<!--keep-->")
    expect(document.body.lastElementChild?.textContent).toBe("other")
  })

  it.each(["h2", "ul", "table", "details"])("wraps a partial formatted range in %s and splits the paragraph", tag => {
    document.body.innerHTML = "<p>before <b>selected</b> after</p>"
    const text = document.querySelector("b")!.firstChild!
    $.selectRange(text, 0, text, 8)
    convert(tag)
    expect(Array.from(document.body.children).map(element => element.localName)).toEqual(["p", tag, "p"])
    expect(document.body.children[0].textContent).toBe("before ")
    expect(document.body.children[1].textContent).toBe("selected")
    expect(document.body.children[2].textContent).toBe(" after")
    expect(document.body.children[1].querySelector("b")?.textContent).toBe("selected")
  })

  it.each(["ul", "table"])("converts %s back to paragraphs", source => {
    document.body.innerHTML = source === "ul"
      ? "<ul><li><p>first</p></li><li>second</li></ul><p>other</p>"
      : "<table><tbody><tr><td><p>first</p></td><td>second</td></tr></tbody></table><p>other</p>"
    $.selectElement(document.body.firstElementChild!)
    convert("p")
    expect(Array.from(document.body.children).map(element => element.localName)).toEqual(["p", "p", "p"])
    expect(document.body.textContent).toBe("firstsecondother")
  })

  it("wraps a whole unfamiliar element in details without rebuilding it", () => {
    document.body.innerHTML = `<unknown-widget title="keep"><p>inside</p></unknown-widget><p>other</p>`
    const widget = document.body.firstElementChild!
    $.selectElement(widget)
    convert("details")
    expect(document.querySelector("details > unknown-widget")).toBe(widget)
    expect(document.querySelector("details > summary")).not.toBeNull()
  })

  it("converts a text container to a table with undo and redo", () => {
    document.body.innerHTML = "<p>one <b>two</b></p><p>other</p>"
    $.move(document.querySelector("b")!.firstChild!, 1)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    convert("table")
    editor.doc.syncFromDOM()
    const converted = editor.toHTML(true)
    expect(converted).toContain("<td>")
    expect(converted).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(converted)
  })
})

describe("conversion boundaries", () => {
  it("splits both endpoints across different text blocks", () => {
    document.body.innerHTML = "<p>before first</p><!--keep--><h2>second after</h2><p>other</p>"
    const first = document.querySelector("p")!.firstChild!, second = document.querySelector("h2")!.firstChild!
    $.selectRange(first, 7, second, 6)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "ul"})
    expect(editor.toHTML(true)).toBe("<p>before </p><ul><li><p>first</p></li><!--keep--><li><p>second</p></li></ul><h2> after</h2><p>other</p>")
  })

  it("leaves an invalid heading conversion untouched", () => {
    document.body.innerHTML = "<address><p>keep</p></address>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "h2"})
    expect(document.querySelector("p")).toBe(paragraph)
    expect(editor.toHTML(true)).toBe("<address><p>keep</p></address>")
  })

  it("converts tables to lists while retaining comments and cell content", () => {
    document.body.innerHTML = `<table>\n<tbody><tr><td id="cell"><p>one</p></td><!--keep--><td>two</td></tr></tbody></table><p>other</p>`
    const paragraph = document.querySelector("td > p")!
    $.selectElement(document.querySelector("table")!)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "ol"})
    expect(document.querySelectorAll("ol > li")).toHaveLength(2)
    expect(document.querySelector("ol p")).toBe(paragraph)
    expect(document.querySelector("ol > li")?.id).toBe("cell")
    expect(editor.toHTML(true)).toContain("<!--keep-->")
  })

  it("wraps a range in a section when its content model permits it", () => {
    document.body.innerHTML = "<p>before selected after</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 7, text, 15)
    editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "section"})
    expect(editor.toHTML(true)).toBe("<p>before </p><section>selected</section><p> after</p>")
  })
})

it("disallows heading insertion inside a list without changing other items", () => {
  document.body.innerHTML = "<ul><li><p>one</p></li><li><p>two</p></li></ul>"
  const list = document.querySelector("ul")!, other = document.querySelectorAll("li")[1]
  $.move(document.querySelector("p")!.firstChild!, 1)
  editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "h2"})
  expect(document.querySelector("ul")).toBe(list)
  expect(document.querySelector("li > h2")).toBeNull()
  expect(document.querySelector("li > p")?.textContent).toBe("one")
  expect(document.querySelectorAll("li")[1]).toBe(other)
})

it("wraps a capture-selected widget in details", () => {
  editor.schema.extendWidgets([{tagName: "capture-widget", editingConfig: {}}])
  document.body.innerHTML = "<capture-widget title=\"keep\"></capture-widget><p>other</p>"
  const widget = document.body.firstElementChild!
  editor.features.selection.captureElement(widget)
  editor.features.manipulation.actions.insertElement({type: "insertElement", tag: "details"})
  expect(document.querySelector("details > capture-widget")).toBe(widget)
  expect(widget.getAttribute("title")).toBe("keep")
  expect(editor.features.selection.captureSelectedElement).toBeNull()
  expect(widget.classList.contains("◆element-selected")).toBe(false)
})

it.each(["h1", "h2", "h3", "h4", "h5", "h6"])("disallows %s within a section nested in a list item", tag => {
  document.body.innerHTML = "<ul><li><section><p>keep</p></section></li></ul>"
  const paragraph = document.querySelector("p")!
  $.move(paragraph.firstChild!, 2)
  editor.features.manipulation.actions.insertElement({type: "insertElement", tag})
  expect(document.querySelector("p")).toBe(paragraph)
  expect(document.querySelector("li h1, li h2, li h3, li h4, li h5, li h6")).toBeNull()
})


describe("caption alignment", () => {
  const states = (["figure", "table"] as const).flatMap(kind => (["above", "below"] as const)
    .flatMap(position => (["left", "center", "right"] as const).map(alignment => ({kind, position, alignment}))))
  it.each(states)("applies $position/$alignment to a $kind caption", ({kind, position, alignment}) => {
    document.body.innerHTML = kind === "figure" ? '<figure><p>Content</p><figcaption>Keep</figcaption></figure>'
      : '<table><caption>Keep</caption><tbody><tr><td>Content</td></tr></tbody></table>'
    const target = document.body.firstElementChild!, caption = target.querySelector("figcaption, caption") as HTMLElement
    $.selectElement(target)
    editor.features.manipulation.actions.setCaption({type: "setCaption", position, alignment})
    expect(caption.style.textAlign).toBe(alignment)
    expect(caption.textContent).toBe("Keep")
    expect(editor.features.manipulation.getCaptionPosition()).toBe(position)
    expect(editor.features.manipulation.getCaptionAlignment()).toBe(alignment)
    expect($.anchor).toBe(caption)
    expect(editor.toHTML(true)).toContain(`text-align: ${alignment}`)
  })

  it("undoes and redoes caption position and alignment together", () => {
    document.body.innerHTML = '<figure><p>Content</p><figcaption style="text-align: left">Keep</figcaption></figure>'
    $.selectElement(document.body.firstElementChild!)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    editor.features.manipulation.actions.setCaption({type: "setCaption", position: "above", alignment: "right"})
    const changed = editor.toHTML(true)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })
})
