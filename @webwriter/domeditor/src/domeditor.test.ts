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

  it("keeps the empty editing surface interactive and its caret in the shadow appendix", () => {
    const bodyRule = Array.from(document.adoptedStyleSheets.flatMap(sheet => Array.from(sheet.cssRules)))
      .find(rule => (rule as CSSStyleRule).selectorText === "body") as CSSStyleRule | undefined

    expect(bodyRule?.style.margin).toBe("1.25rem auto")
    expect(bodyRule?.style.getPropertyValue("--body-padding")).toBe("1.25rem")
    expect(bodyRule?.style.getPropertyValue("anchor-name")).toBe("--body-anchor")
    expect(bodyRule?.style.padding).toBe("0px var(--body-padding)")
    expect(bodyRule?.style.maxWidth).toBe("calc(960px + var(--body-padding) + var(--body-padding))")
    expect(bodyRule?.style.pointerEvents).toBe("auto")
    expect(bodyRule?.style.userSelect).toBe("text")
    expect(document.body).toHaveAttribute("contenteditable", "true")
    expect(editor.doc.body.getAttribute("contenteditable")).toBeUndefined()
    expect(editor.toHTML()).not.toContain("contenteditable")
    expect(editor.features.selection.emptyDocumentCaret?.getRootNode()).toBe(editor.appendix)
    expect(editorStyleString).toContain("body::part(empty-document-caret)")
    expect(editorStyleString).toMatch(/body::part\(empty-document-caret\)[\s\S]*?left:\s*calc\(anchor\(left\) \+ var\(--body-padding\)\);/)
    expect(editorStyleString).toContain("body::part(presence-caret)")
    expect(editorStyleString).toContain("body::part(presence-element-selection)")
    expect(editorStyleString).toContain("body::part(presence-element-selection-label)")
    expect(editorStyleString).toMatch(/body::part\(presence-element-selection\)[\s\S]*?color:\s*color-mix\(in srgb, var\(--presence-color\) 40%, transparent\);/)
    expect(editorStyleString).toMatch(/\.◆element-selected\s*\{[\s\S]*?anchor-name:\s*--element-caret-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(element-caret\)[\s\S]*?position-anchor:\s*--element-caret-anchor;[\s\S]*?animation:\s*blink 1s step-end 0s infinite;/)
    expect(editorStyleString).toMatch(/body::part\(element-caret\)::before,\s*body::part\(element-caret\)::after,\s*body::part\(presence-element-selection\)::before,\s*body::part\(presence-element-selection\)::after\s*\{[\s\S]*?border:\s*1px solid currentColor;/)
    expect(editorStyleString).toMatch(/body::part\(element-caret\)::before,\s*body::part\(presence-element-selection\)::before[\s\S]*?left:\s*-2px;[\s\S]*?border-right:\s*0;/)
    expect(editorStyleString).toMatch(/body::part\(element-caret\)::after,\s*body::part\(presence-element-selection\)::after[\s\S]*?right:\s*-2px;[\s\S]*?border-left:\s*0;/)
    expect(editorStyleString).toMatch(/body\s*>\s*\*\s*\+\s*\*\s*\{[\s\S]*?margin-block-start:\s*1\.25rem;/)
    expect(editorStyleString).toMatch(/body::part\(presence-caret-label\)[\s\S]*?width:\s*1\.125rem;/)
    expect(editorStyleString).toMatch(/body::part\(presence-caret-label\)[\s\S]*?font:\s*8px\/1\.25/)
    expect(editorStyleString).toMatch(/body::part\(presence-caret-label\)[\s\S]*?color:\s*white;[\s\S]*?background:\s*color-mix\(in srgb, var\(--presence-color\) 40%, transparent\);/)
    expect(editorStyleString).toMatch(/body::part\(presence-caret-label\)[\s\S]*?user-select:\s*none;/)
    expect(editorStyleString).toContain("body::part(presence-gap-caret-label)")
    expect(editorStyleString).toContain("::highlight(insertion-trigger)")
    expect(editorStyleString).toMatch(/::highlight\(insertion-trigger\)[\s\S]*?color:\s*#5279a2;/)
    expect(editorStyleString).toMatch(/body::part\(presence-gap-caret-label\)[\s\S]*?transform:\s*translateX\(-100%\)/)
    expect(editorStyleString).toMatch(/body::part\(presence-gap-caret\)[\s\S]*?color:\s*color-mix\(in srgb, var\(--presence-color\) 40%, transparent\);/)

    expect(editorStyleString).toMatch(/body::part\(presence-gap-caret\)::after\s*\{[\s\S]*?animation:\s*none;/)
    expect(editorStyleString).toMatch(/\.◆element-hovered\s*\{[\s\S]*?anchor-name:\s*--element-hover-caret-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(element-hover-caret\)[\s\S]*?color:\s*#2563eb;[\s\S]*?opacity:\s*0\.5;[\s\S]*?animation:\s*none;/)
    expect(editorStyleString).toMatch(/body::part\(insertion-add\)[\s\S]*?position-anchor:\s*--empty-selected;[\s\S]*?left:\s*anchor\(left\);[\s\S]*?top:\s*anchor\(top\);[\s\S]*?font:\s*inherit;/)
    expect(editorStyleString).toMatch(/body\.◆empty-selected::part\(insertion-add\)[\s\S]*?left:\s*calc\(anchor\(left\) \+ var\(--body-padding\)\);/)
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
