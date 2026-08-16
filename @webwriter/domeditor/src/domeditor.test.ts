// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest"
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

  it("does not enable placeholder text by default", () => {
    const placeholderStylesheet = editor.features.placeholder.placeholderStylesheet

    expect(document.adoptedStyleSheets).not.toContain(placeholderStylesheet)
  })

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
    expect(editor.features.selection.hoverCaret?.getRootNode()).toBe(editor.appendix)
    expect(editorStyleString).toContain("body::part(empty-document-caret)")
    expect(editorStyleString).toMatch(/body::part\(empty-document-caret\)[\s\S]*?left:\s*calc\(anchor\(left\) \+ var\(--body-padding\)\);/)
    expect(editorStyleString).toContain("body::part(presence-caret)")
    expect(editorStyleString).toContain("body::part(presence-element-selection)")
    expect(editorStyleString).toContain("body::part(presence-element-selection-label)")
    expect(editorStyleString).toMatch(/\.◆element-selected\s*\{[\s\S]*?anchor-name:\s*--selection-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected,\s*\.◆element-selected:hover\s*\{[\s\S]*?outline:\s*none;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?position-anchor:\s*--selection-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret-node\),[\s\S]*?body::part\(selection-caret-capture\)\s*\{[\s\S]*?left:\s*anchor\(left\);[\s\S]*?width:\s*anchor-size\(width\);[\s\S]*?outline:\s*2px dotted var\(--sl-color-primary-400\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret-capture\)\s*\{[\s\S]*?outline:\s*2px solid var\(--sl-color-primary-400\);/)
    expect(editorStyleString).toMatch(/\.◆element-selected\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆node-selection-active,\s*body\.◆node-selection-active\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/\.◆element-selected::selection,\s*\.◆element-selected\s+\*::selection\s*\{[\s\S]*?background:\s*transparent;/)
    expect(editorStyleString).not.toMatch(/\.◆element-selected\s*,\s*\.◆element-selected\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body::part\(presence-element-selection\)[\s\S]*?outline:\s*2px solid color-mix\(in srgb, var\(--presence-color\) 40%, transparent\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toContain("body::part(selection-caret)")
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
    expect(editorStyleString).toMatch(/\):hover\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-hovered\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(hover-caret\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?position-anchor:\s*--hover-anchor;[\s\S]*?width:\s*anchor-size\(width\);[\s\S]*?outline:\s*1px dotted var\(--sl-color-gray-400, black\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toMatch(/body:has\(\.◆element-hovered\)::part\(hover-caret\)\s*\{[\s\S]*?outline:\s*2px dotted var\(--sl-color-primary-400\);/)
    expect(editorStyleString).toMatch(/body\.◆element-hovered::part\(hover-caret\)\s*\{[\s\S]*?position-anchor:\s*auto;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("body.◆element-hovered::after")
    expect(editorStyleString).toMatch(/body\.◆element-selected::part\(selection-caret-node\)\s*\{[\s\S]*?inset:\s*0;[\s\S]*?outline:\s*none;[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("body.◆element-selected::after")
    expect(editorStyleString).toContain("body::part(hover-caret)")
    expect(editorStyleString).toMatch(/body::part\(insertion-add\)[\s\S]*?position-anchor:\s*--empty-selected;[\s\S]*?left:\s*anchor\(left\);[\s\S]*?top:\s*anchor\(top\);[\s\S]*?font:\s*inherit;/)
    expect(editorStyleString).toMatch(/body\.◆empty-selected::part\(insertion-add\)[\s\S]*?left:\s*calc\(anchor\(left\) \+ var\(--body-padding\)\);/)
    expect(editorStyleString).toMatch(/summary:is\(:empty, :has\(br:only-child\)\)::after\s*\{[\s\S]*?content:\s*"Summary";/)
    expect(editorStyleString).toContain("body::part(virtual-list-caret)")
    expect(editorStyleString).not.toContain('content: "Content"')
    expect(editorStyleString).toMatch(/summary:is\(:empty, :has\(br:only-child\)\)\.◆empty-selected::before[\s\S]*?display:\s*inline-block;[\s\S]*?margin-inline-end:\s*-1px;/)
    expect(editorStyleString).toMatch(/dl > dt:is\(:empty, :has\(br:only-child\)\)::after[\s\S]*?content:\s*"Term";/)
    expect(editorStyleString).toMatch(/dl > dd:is\(:empty, :has\(br:only-child\)\)::after[\s\S]*?content:\s*"Description";/)
    expect(editorStyleString).not.toMatch(/:is\(ul, ol, menu\):empty[\s\S]*?display:\s*list-item;/)
    expect(editorStyleString).toMatch(/\.◆media-empty\s*\{[\s\S]*?border:\s*1px dashed #6b7280;/)
    expect(editorStyleString).not.toMatch(/\.◆media-empty\.◆element-selected\s*\{/)
    expect(editorStyleString).toMatch(/:is\(picture, audio, video\)\s*\{[\s\S]*?height:\s*auto;[\s\S]*?aspect-ratio:\s*16\s*\/\s*9;/)
    expect(editorStyleString).toMatch(/audio\.◆media-empty::-webkit-media-controls-enclosure\s*\{[\s\S]*?display:\s*none;/)
    expect(editorStyleString).toMatch(/body:has\(\.◆media-empty:is\(\.◆gap-before-selected, \.◆gap-after-selected\)\)::part\(gap-caret\)\s*\{[\s\S]*?display:\s*none;/)
  })

  it("hides Chromium's native label for an empty Details element", () => {
    expect(editorStyleString).toMatch(/details:empty\s*\{[\s\S]*?color:\s*transparent;/)
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

describe("widget shadow interactions", () => {
  const editor = new DOMEditor()

  it("keeps typing inside a selected widget without cancelling the widget", async () => {
    const widget = document.createElement("interactive-widget")
    const input = document.createElement("input")
    widget.attachShadow({mode: "open"}).append(input)
    document.body.append(widget)
    const propagated = vi.fn()
    document.addEventListener("keydown", propagated)

    input.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    input.focus()
    await Promise.resolve()

    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    input.dispatchEvent(event)

    expect(propagated).toHaveBeenCalledWith(event)
    expect(event.defaultPrevented).toBe(false)
    expect(widget).toHaveClass("◆element-selected")
    expect(widget.shadowRoot?.activeElement).toBe(input)
    document.removeEventListener("keydown", propagated)
    widget.remove()
  })

  it("continues to let the editor observe scrolling in widget shadow DOM", () => {
    const widget = document.createElement("scrolling-widget")
    const scroller = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(scroller)
    document.body.append(widget)
    const renderPresence = vi.spyOn(editor.features.collaboration, "renderPresence")

    scroller.dispatchEvent(new Event("scroll", {bubbles: true, composed: true}))

    expect(renderPresence).toHaveBeenCalled()
    renderPresence.mockRestore()
    widget.remove()
  })

  it("does not mistake the editor's shadow appendix for widget content", () => {
    const button = document.createElement("button")
    editor.appendix.append(button)

    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    button.remove()
  })

  it("continues to handle a widget's slotted light-DOM content", () => {
    const widget = document.createElement("slotted-widget")
    const input = document.createElement("input")
    widget.attachShadow({mode: "open"}).append(document.createElement("slot"))
    widget.append(input)
    document.body.append(widget)

    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    widget.remove()
  })
})
