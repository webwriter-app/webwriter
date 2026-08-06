// @vitest-environment happy-dom
import { describe, it, expect } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"
import editorStyleString from "./editor.css?raw"

const hasSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule =>
    (rule as CSSStyleRule).selectorText?.includes(selector) || rule.cssText.includes(selector)
  )

const hasExactSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule => (rule as CSSStyleRule).selectorText === selector)

describe("DOMEditor stylesheets", () => {
  const editor = new DOMEditor()

  it("mounts the main-DOM stylesheet on the document", () => {
    const stylesheet = document.adoptedStyleSheets.find(sheet => hasSelector(sheet, "html"))

    expect(stylesheet).toBeInstanceOf(CSSStyleSheet)
    expect(document.adoptedStyleSheets).toContain(stylesheet)
    expect(hasSelector(stylesheet!, "body")).toBe(true)
    expect(hasExactSelector(stylesheet!, "#◆transform-overlay")).toBe(false)
  })

  it("uses the main-DOM stylesheet to style exposed shadow parts", () => {
    const appendix = editor.appendix
    const overlay = editor.features.transformation.overlay
    const stylesheet = document.adoptedStyleSheets.find(sheet => hasSelector(sheet, "html"))

    expect(stylesheet).toBeInstanceOf(CSSStyleSheet)
    expect(appendix.adoptedStyleSheets).toHaveLength(0)
    expect(editorStyleString).toContain("body::part(transform-overlay)")
    expect(overlay.getAttribute("part")).toContain("transform-overlay")
    expect(overlay.querySelector("#◆transform-overlay-scale-up-left")?.getAttribute("part"))
      .toContain("transform-overlay-scale-up-left")
  })

  it("does not duplicate constructed stylesheets", () => {
    const documentSheetCount = document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html")).length
    const appendix = editor.appendix
    const appendixSheetCount = appendix.adoptedStyleSheets.length

    new DOMEditor().appendix

    expect(document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html"))).toHaveLength(documentSheetCount)
    expect(appendix.adoptedStyleSheets).toHaveLength(appendixSheetCount)
  })
})
