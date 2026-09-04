// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"
import {executeCompleteEvent, selectionChangeEvent} from "./editor-bridge"
import editorStyleString from "./editor.css?raw"
import {$} from "./utility"

const hasSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule =>
    (rule as CSSStyleRule).selectorText?.includes(selector) || rule.cssText.includes(selector)
  )

const hasExactSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule => (rule as CSSStyleRule).selectorText === selector)

describe("DOMEditor stylesheets", () => {
  let editor: DOMEditor

  beforeAll(() => editor = new DOMEditor())
  afterAll(() => editor.destroy())

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
    const appendixStylesheet = appendix.adoptedStyleSheets.find(sheet =>
      hasExactSelector(sheet, ":host(.◆editing-locked) > :not(slot):not(.◆ai-review-toolbar)"),
    )

    expect(stylesheet).toBeInstanceOf(CSSStyleSheet)
    expect(appendixStylesheet).toBeInstanceOf(CSSStyleSheet)
    expect((Array.from(appendixStylesheet!.cssRules)[0] as CSSStyleRule).style.display).toBe("none")
    expect(editorStyleString).toContain("body::part(transform-overlay)")
    expect(overlay.getAttribute("part")).toContain("transform-overlay")
    expect(overlay.querySelector("#◆transform-overlay-scale-up-left")?.getAttribute("part"))
      .toContain("transform-overlay-scale-up-left")
  })

  it("shows a full-width contiguous editor-only grid for otherwise unstyled tables", () => {
    const stylesheet = document.adoptedStyleSheets.find(sheet => hasSelector(sheet, "html"))!
    const tableRule = Array.from(stylesheet.cssRules)
      .find(rule => (rule as CSSStyleRule).selectorText === ":where(table)") as CSSStyleRule | undefined
    const cellRule = Array.from(stylesheet.cssRules)
      .find(rule => (rule as CSSStyleRule).selectorText === ":where(td, th)") as CSSStyleRule | undefined

    expect(tableRule?.style.boxSizing).toBe("border-box")
    expect(tableRule?.style.width).toBe("100%")
    expect(tableRule?.style.borderCollapse).toBe("collapse")
    expect(cellRule?.style.border).toBe("1px solid #aeb8c4")
    expect(cellRule?.style.minWidth).toBe("2rem")
    expect(cellRule?.style.height).toBe("1.5rem")
    expect(cellRule?.style.padding).toBe("0.35rem 0.5rem")
    expect(editorStyleString).toMatch(/:where\(table:not\(:has\(td, th\)\)\)::after\s*\{[\s\S]*?display:\s*table-cell;[\s\S]*?height:\s*2\.2rem;[\s\S]*?border:\s*1px dashed #aeb8c4;[\s\S]*?content:\s*"";/)
  })

  it("starts with an editable default paragraph", () => {
    const bodyRule = Array.from(document.adoptedStyleSheets.flatMap(sheet => Array.from(sheet.cssRules)))
      .find(rule => (rule as CSSStyleRule).selectorText === "body") as CSSStyleRule | undefined

    expect(bodyRule?.style.margin).toBe("1.25rem auto")
    expect(bodyRule?.style.getPropertyValue("--body-padding")).toBe("1.25rem")
    expect(bodyRule?.style.getPropertyValue("anchor-name")).toBe("--body-anchor")
    expect(bodyRule?.style.padding).toBe("0px var(--body-padding)")
    expect(bodyRule?.style.minHeight).toBe("calc(100% - 2.5rem)")
    expect(bodyRule?.style.maxWidth).toBe("calc(960px + var(--body-padding) + var(--body-padding))")
    expect(bodyRule?.style.pointerEvents).toBe("auto")
    expect(bodyRule?.style.userSelect).toBe("text")
    expect(document.body).toHaveAttribute("contenteditable", "true")
    expect(editor.doc.body.getAttribute("contenteditable")).toBeUndefined()
    expect(editor.toHTML()).not.toContain("contenteditable")
    expect(editor.toHTML(true)).toBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect(editor.features.selection.emptyDocumentCaret).toBeNull()
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
    expect(editorStyleString).toMatch(/body\.◆node-selection-active\s+\.◆element-capture-selected\s*\{[\s\S]*?caret-color:\s*auto\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆table-cell-selection,\s*body\.◆table-cell-selection\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆table-cell-selection::selection,\s*body\.◆table-cell-selection\s+\*::selection\s*\{[\s\S]*?background:\s*transparent;/)
    expect(editorStyleString).toMatch(/body\.◆editing-locked,\s*body\.◆editing-locked\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆editing-locked::selection,\s*body\.◆editing-locked\s+\*::selection\s*\{[\s\S]*?background:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/td\.◆table-cell-selected,\s*th\.◆table-cell-selected\s*\{[\s\S]*?box-shadow:\s*inset 0 0 0 2px var\(--sl-color-primary-400\);[\s\S]*?rgb\(56 189 248 \/ 6%\)/)
    expect(editorStyleString).toMatch(/\.◆element-selected:not\(\.◆element-capture-selected\)::selection,\s*\.◆element-selected:not\(\.◆element-capture-selected\)\s+\*::selection\s*\{[\s\S]*?background:\s*transparent;/)
    expect(editorStyleString).not.toMatch(/\.◆element-selected::selection[\s\S]*?background:\s*transparent;/)
    expect(editorStyleString).not.toMatch(/\.◆element-selected\s*,\s*\.◆element-selected\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body::part\(presence-element-selection\)[\s\S]*?outline:\s*2px solid color-mix\(in srgb, var\(--presence-color\) 40%, transparent\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toContain("body::part(selection-caret)")
    expect(editorStyleString).toMatch(/body\s*>\s*\*\s*\+\s*\*\s*\{[\s\S]*?margin-block-start:\s*1\.25rem;/)
    expect(editorStyleString).toMatch(/body\s*>\s*:last-child\s*\{[\s\S]*?margin-block-end:\s*0;/)
    expect(editorStyleString).toMatch(/body:has\(>\s*:last-child\)\s*\{[\s\S]*?padding-block-end:\s*1\.25rem;/)
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
    expect(editorStyleString).toMatch(/\.◆style-target-hovered\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\):not\(table \*\):hover\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/body table:hover\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected:is\(:hover, \.◆element-hovered\):not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--selection-anchor, --hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected\.◆style-target-hovered:not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--selection-anchor, --hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆empty-selected:is\(:hover, \.◆element-hovered\):not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--empty-selected, --hover-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(hover-caret\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?position-anchor:\s*--hover-anchor;[\s\S]*?width:\s*anchor-size\(width\);[\s\S]*?outline:\s*1px dotted var\(--sl-color-gray-400, black\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toMatch(/body:has\(\.◆style-target-hovered\)::part\(hover-caret\),\s*body\.◆style-target-hovered::part\(hover-caret\)\s*\{[\s\S]*?display:\s*block;/)
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
    expect(editorStyleString).toMatch(/html:has\(> body\.◆template-active\),\s*body\.◆template-active\s*\{[\s\S]*?overflow:\s*hidden;/)
    expect(editorStyleString).toMatch(/body\.◆template-active\s*\{[\s\S]*?display:\s*contents;/)
    expect(editorStyleString).toMatch(/body\.◆template-active > \[role~="document"\]:only-child\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto;/)
    expect(editorStyleString).toMatch(/body\.◆template-active:has\(> \[role~="document"\]\.◆element-selected:only-child\)::part\(selection-caret-node\)[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("template-add")
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

  it("restores the default paragraph after a direct DOM change empties the body", async () => {
    document.body.replaceChildren()

    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(editor.toHTML(true)).toBe("<p></p>")
  })

  it("moves a user-editing selection into the restored paragraph", () => {
    document.body.replaceChildren()
    document.body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
    }))

    const paragraph = document.body.firstElementChild
    expect(editor.toHTML(true)).toBe("<p></p>")
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    expect($.isEmptyDocumentSelection).toBe(false)
  })

  it("removes nested editing attributes from serialized widgets", () => {
    document.body.innerHTML = '<webwriter-demo contenteditable="true" spellcheck="false" value="7"></webwriter-demo>'
      + '<template><span class="authored ◆text-selected">Template</span><i class="◆editor-only">helper</i></template>'

    expect(editor.toHTML(true)).toBe('<webwriter-demo value="7"></webwriter-demo>'
      + '<template><span class="authored">Template</span></template>')
    document.body.replaceChildren()
  })

  it("hides Chromium's native label for an empty Details element", () => {
    expect(editorStyleString).toMatch(/details:empty\s*\{[\s\S]*?color:\s*transparent;/)
  })

  it("keeps a selected closed dialog in editable document flow", () => {
    expect(editorStyleString).toMatch(/dialog\.◆dialog-editing\s*\{[\s\S]*?display:\s*block\s*!important;[\s\S]*?position:\s*static\s*!important;[\s\S]*?z-index:\s*auto\s*!important;[\s\S]*?min-width:\s*0\s*!important;[\s\S]*?max-height:\s*none\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/)
    expect(editorStyleString).toMatch(/dialog\.◆dialog-editing::backdrop\s*\{[\s\S]*?display:\s*none\s*!important;/)
  })

  it("does not duplicate constructed stylesheets when the appendix is revisited", () => {
    const documentSheetCount = document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html")).length
    const appendix = editor.appendix
    const appendixSheetCount = appendix.adoptedStyleSheets.length

    editor.appendix

    expect(document.adoptedStyleSheets.filter(sheet => hasSelector(sheet, "html"))).toHaveLength(documentSheetCount)
    expect(appendix.adoptedStyleSheets).toHaveLength(appendixSheetCount)
  })

  it("marks every editing lock without serializing the marker", () => {
    const owner = {}
    editor.lockEditing(owner)
    const slot = Array.from(editor.appendix.children)
      .find(element => element.localName === "slot" && !element.hasAttribute("name")) as HTMLSlotElement

    expect(document.body).toHaveClass("◆editing-locked")
    expect(document.body.inert).toBe(false)
    expect(slot.inert).toBe(true)
    expect(editor.toHTML()).not.toContain("◆editing-locked")
    expect(editor.toHTML()).not.toContain(" inert")

    editor.unlockEditing(owner)
    expect(document.body).not.toHaveClass("◆editing-locked")
    expect(slot.inert).toBe(false)
  })

  it("creates a direct default slot without moving a nested slot", () => {
    const appendix = editor.appendix
    Array.from(appendix.children)
      .filter(element => element.localName === "slot" && !element.hasAttribute("name"))
      .forEach(element => element.remove())
    const container = document.createElement("div")
    const nested = document.createElement("slot")
    container.append(nested)
    editor.addAppendix(container)

    const refreshed = editor.appendix
    const directSlots = Array.from(refreshed.children).filter(element => (
      element.localName === "slot" && !element.hasAttribute("name")
    ))

    expect(directSlots).toHaveLength(1)
    expect(nested.parentElement).toBe(container)
    container.remove()
  })
})

describe("widget shadow interactions", () => {
  let editor: DOMEditor

  beforeAll(() => editor = new DOMEditor())
  afterAll(() => editor.destroy())

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

  it("keeps inactive widget scrolls from reaching the widget while the editor observes them", () => {
    const widget = document.createElement("scrolling-widget")
    const scroller = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(scroller)
    document.body.append(widget)
    const renderPresence = vi.spyOn(editor.features.collaboration, "renderPresence")
    const widgetScroll = vi.fn()
    scroller.addEventListener("scroll", widgetScroll)

    scroller.dispatchEvent(new Event("scroll", {bubbles: true, composed: true}))

    expect(renderPresence).toHaveBeenCalled()
    expect(widgetScroll).not.toHaveBeenCalled()
    renderPresence.mockRestore()
    widget.remove()
  })

  it("keeps authored-document shortcuts out of the editor's shadow appendix", () => {
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

    expect(event.defaultPrevented).toBe(false)
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

describe("bridge origin binding", () => {
  it("posts bridge events to the verified initialization origin", () => {
    const bridgeOrigin = "https://editor-host.example"
    const bridgeNonce = "0123456789abcdef"
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    const editor = new DOMEditor({bridgeOrigin, bridgeNonce})

    editor.postPresence([])

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "dom-editor-presence-change",
      bridgeNonce,
    }), bridgeOrigin)
    editor.destroy()
    postMessage.mockRestore()
  })

  it("posts actions through the authenticated parent bridge", () => {
    const bridgeOrigin = "https://editor-host.example"
    const bridgeNonce = "0123456789abcdef"
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    const editor = new DOMEditor({bridgeOrigin, bridgeNonce})

    editor.postAction({type: "undo"})

    expect(postMessage).toHaveBeenCalledWith({type: "undo", bridgeNonce}, bridgeOrigin)
    editor.destroy()
    postMessage.mockRestore()
  })

  it("returns selected HTML without reposting an unchanged selection", async () => {
    document.body.innerHTML = "<p>Hello world</p>"
    const text = document.querySelector("p")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 0, text, 5)
    const bridgeNonce = "0123456789abcdef"
    const editor = new DOMEditor({bridgeNonce})
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)

    window.dispatchEvent(new MessageEvent("message", {data: {
      type: "beginHTMLSelectionEdit",
      requestId: "html-source",
      bridgeNonce,
    }}))

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: executeCompleteEvent,
      detail: {requestId: "html-source", result: {html: "<p>Hello world</p>"}},
    }), window.location.origin))
    expect(postMessage.mock.calls.some(([message]) => message.type === selectionChangeEvent)).toBe(false)

    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    editor.destroy()
    postMessage.mockRestore()
  })
})
