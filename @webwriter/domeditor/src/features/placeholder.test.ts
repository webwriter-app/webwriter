// @vitest-environment happy-dom
import {afterAll, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"

describe("widget placeholders", () => {
  const editor = new DOMEditor()

  afterAll(() => {
    editor.destroy()
    document.body.replaceChildren()
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

  it("removes its adopted stylesheet when disabled and restores it when enabled", () => {
    const feature = editor.features.placeholder
    const stylesheet = feature.placeholderStylesheet

    feature.disable()
    expect(document.adoptedStyleSheets).not.toContain(stylesheet)

    feature.enable()
    expect(document.adoptedStyleSheets).toContain(stylesheet)
  })
})
