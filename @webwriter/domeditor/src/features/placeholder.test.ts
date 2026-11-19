// @vitest-environment happy-dom
import {afterAll, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import {hasPresentationState} from "../presentation-state.js"
import * as Y from "yjs"
import {sharedDOMBody} from "../domdoc"

describe("widget placeholders", () => {
  const editor = new DOMEditor()

  afterAll(() => {
    editor.destroy()
    document.body.replaceChildren()
  })

  it.each([1, 2, 3, 4, 5, 6])("only displays the level %s placeholder for empty inline content", async level => {
    document.body.innerHTML = `<h${level}><br></h${level}>`
    const heading = document.body.firstElementChild!
    const refresh = () => new Promise(resolve => setTimeout(resolve, 0))
    await refresh()
    expect(hasPresentationState(heading, "empty-heading")).toBe(true)
    for(const html of ["Text<br>", "<b>Text<br></b>", "First<br>Second", "<br><br>", "<my-widget></my-widget>"]) {
      heading.innerHTML = html
      await refresh()
      expect(hasPresentationState(heading, "empty-heading"), html).toBe(false)
      expect(heading.innerHTML).toBe(html)
    }
    heading.innerHTML = "<!--keep--><b><br></b>"
    await refresh()
    expect(hasPresentationState(heading, "empty-heading")).toBe(true)
    expect(editor.toHTML(true)).not.toContain("empty-heading")
    heading.remove()
    await refresh()
    expect(hasPresentationState(heading, "empty-heading")).toBe(false)
  })

  it("refreshes heading emptiness for direct text changes, collaboration, undo, and redo", async () => {
    document.body.innerHTML = "<h2><br></h2>"
    const refresh = () => new Promise(resolve => setTimeout(resolve, 0))
    await refresh()
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const heading = document.querySelector("h2")!
    heading.prepend("Title")
    await refresh()
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    expect(hasPresentationState(heading, "empty-heading")).toBe(false)
    editor.doc.undo(); await refresh()
    expect(hasPresentationState(document.querySelector("h2")!, "empty-heading")).toBe(true)
    editor.doc.redo(); await refresh()
    expect(hasPresentationState(document.querySelector("h2")!, "empty-heading")).toBe(false)
    const localText = document.querySelector("h2")!.firstChild as Text
    localText.data = ""
    await refresh()
    expect(hasPresentationState(document.querySelector("h2")!, "empty-heading")).toBe(true)
    localText.data = "Title"
    await refresh()
    expect(hasPresentationState(document.querySelector("h2")!, "empty-heading")).toBe(false)

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const body = sharedDOMBody(remote)
    const remoteHeading = body.get(0) as Y.XmlElement
    const text = remoteHeading.get(0) as Y.XmlText
    text.delete(0, text.length)
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote))
    await refresh()
    expect(hasPresentationState(document.querySelector("h2")!, "empty-heading")).toBe(true)
    expect(editor.toHTML(true)).not.toContain("empty-heading")
    remote.destroy()
  })

  it("keeps heading descendants of atomic widgets opaque", async () => {
    document.body.innerHTML = "<my-widget><h2><br></h2></my-widget>"
    const heading = document.querySelector("h2")!
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(hasPresentationState(heading, "empty-heading")).toBe(false)
    expect(heading.outerHTML).toBe("<h2><br></h2>")
  })

  it("shows inherited content for empty blocks without changing authored DOM or HTML", () => {
    document.body.innerHTML = '<p id="empty"></p><p id="text">Text<br></p><p id="br-only"><br></p><p id="legacy"><br class="ProseMirror-trailingBreak"></p><h2 id="heading"></h2>'
    const authoredDOM = document.body.innerHTML
    const authoredHTML = editor.toHTML(true)
    const stylesheet = editor.features.placeholder.placeholderStylesheet
    const rules = Array.from(stylesheet.cssRules, rule => rule.cssText)
    const widgetRule = rules.find(rule => rule.includes("--ww-placeholder"))!
    const headingRule = rules.find(rule => rule.startsWith("h2:"))!

    expect(widgetRule).toContain(":empty::before")
    expect(widgetRule).toContain('content: var(--ww-placeholder, "\u200B")')
    expect(widgetRule).toContain("width: 0")
    expect(widgetRule).toContain("white-space: nowrap")
    expect(widgetRule).toContain("color: darkgray")
    expect(widgetRule).toContain("pointer-events: none")
    expect(widgetRule).toContain("user-select: none")
    // Text-bearing and br-only blocks do not match the safe :empty selector.
    expect(widgetRule).not.toContain(":has(")
    // Schema headings keep their own label as the fallback while accepting a widget override.
    expect(headingRule).toContain('content: var(--ww-placeholder, "Heading")')
    expect(headingRule).toContain("white-space: nowrap")
    expect(document.body.innerHTML).toBe(authoredDOM)
    expect(editor.toHTML(true)).toBe(authoredHTML)
    expect(authoredHTML).not.toContain("ww-placeholder")
    expect(document.adoptedStyleSheets).toContain(stylesheet)
  })

  it("clears heading state and its adopted stylesheet when disabled and restores them when enabled", async () => {
    const feature = editor.features.placeholder
    const stylesheet = feature.placeholderStylesheet
    document.body.innerHTML = "<h2><br></h2>"
    const heading = document.querySelector("h2")!
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(hasPresentationState(heading, "empty-heading")).toBe(true)

    feature.disable()
    expect(document.adoptedStyleSheets).not.toContain(stylesheet)
    expect(hasPresentationState(heading, "empty-heading")).toBe(false)

    feature.enable()
    expect(document.adoptedStyleSheets).toContain(stylesheet)
    expect(hasPresentationState(heading, "empty-heading")).toBe(true)
  })
})
