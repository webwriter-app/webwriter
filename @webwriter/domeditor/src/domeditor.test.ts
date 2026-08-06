// @vitest-environment happy-dom
import { describe, it, expect } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"

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

  it("mounts the shadow-DOM stylesheet on the editor appendix", () => {
    const appendix = editor.appendix
    const stylesheet = appendix.adoptedStyleSheets.find(sheet => hasSelector(sheet, "#◆transform-overlay"))

    expect(stylesheet).toBeInstanceOf(CSSStyleSheet)
    expect(appendix.adoptedStyleSheets).toContain(stylesheet)
    expect(document.adoptedStyleSheets).not.toContain(stylesheet)
    expect(hasSelector(stylesheet!, ".◆gap-caret")).toBe(true)
  })

  it("does not duplicate constructed stylesheets", () => {
    const documentSheetCount = document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html")).length
    const appendix = editor.appendix
    const appendixSheetCount = appendix.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "#◆transform-overlay")).length

    new DOMEditor().appendix

    expect(document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html"))).toHaveLength(documentSheetCount)
    expect(appendix.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "#◆transform-overlay"))).toHaveLength(appendixSheetCount)
  })
})
