// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "./domeditor"
import {editorFrameControlMessage, executeCompleteEvent, selectionChangeEvent, type SelectionChangeDetail} from "./editor-bridge"
import editorStyleString from "./editor.css?raw"
import {$, cloneInert, getInertDocument} from "./utility"
import * as Y from "yjs"
import {sharedDOMBody} from "./domdoc"

const hasSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule =>
    (rule as CSSStyleRule).selectorText?.includes(selector) || rule.cssText.includes(selector)
  )

const hasExactSelector = (stylesheet: CSSStyleSheet, selector: string) =>
  Array.from(stylesheet.cssRules).some(rule => (rule as CSSStyleRule).selectorText === selector)

describe("collaborative disclosure structure", () => {
  it("preserves missing summaries through remote updates, unrelated local input, and shared snapshot startup", async () => {
    document.body.innerHTML = '<details><summary>Title</summary><p>Body</p></details><p>Other</p>'
    const initialEditor = new DOMEditor()
    initialEditor.doc.syncFromDOM()
    const initial = Y.encodeStateAsUpdate(initialEditor.doc.doc)
    initialEditor.destroy()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, initial)
      const details = sharedDOMBody(remote).get(0) as Y.XmlElement
      details.delete(0, 1)
      const removal = Y.encodeStateAsUpdate(remote)
      const updates: Uint8Array[] = []
      for(let replica = 0; replica < 2; replica++) {
        document.body.replaceChildren()
        const editor = new DOMEditor({initialState: {update: Array.from(initial)}})
        try {
          Y.applyUpdate(editor.doc.doc, removal, "remote-client")
          await new Promise(resolve => setTimeout(resolve))
          expect(document.querySelector("details > summary")).toBeNull()
          const other = document.body.lastElementChild!
          $.move(other, 0)
          other.dispatchEvent(new Event("input", {bubbles: true}))
          await new Promise(resolve => setTimeout(resolve))
          expect(document.querySelector("details > summary")).toBeNull()
          editor.doc.syncFromDOM()
          updates.push(Y.encodeStateAsUpdate(editor.doc.doc))
        }
        finally { editor.destroy() }
      }
      updates.forEach(update => Y.applyUpdate(remote, update))
      expect(sharedDOMBody(remote).toString()).not.toContain("<summary")
      document.body.replaceChildren()
      const resumed = new DOMEditor({initialState: {update: Array.from(Y.encodeStateAsUpdate(remote))}})
      try {
        await new Promise(resolve => setTimeout(resolve))
        expect(document.querySelector("details > summary")).toBeNull()
      }
      finally { resumed.destroy() }
    }
    finally { remote.destroy(); document.body.replaceChildren() }
  })
})

describe("DOMEditor stylesheets", () => {
  let editor: DOMEditor

  beforeAll(() => editor = new DOMEditor())
  afterAll(() => editor.destroy())

  it("enables heading placeholders by default", () => {
    const placeholderStylesheet = editor.features.placeholder.placeholderStylesheet

    expect(document.adoptedStyleSheets).toContain(placeholderStylesheet)
  })

  it("mounts the main-DOM stylesheet on the document", () => {
    const stylesheet = document.adoptedStyleSheets.find(sheet => hasSelector(sheet, "html"))

    expect(stylesheet).toBeInstanceOf(CSSStyleSheet)
    expect(document.adoptedStyleSheets).toContain(stylesheet)
    expect(hasSelector(stylesheet!, "body")).toBe(true)
    expect(hasExactSelector(stylesheet!, "#◆transform-overlay")).toBe(false)
  })

  it.each([
    ['<details open><summary></summary><p></p></details>', 1],
    ['<details open><summary>Heading</summary>\n<!-- keep --><p><br></p></details>', 1],
    ['<details open><summary></summary><p><b>Body</b></p></details>', 0],
    ['<details open><summary></summary><p></p><p></p></details>', 0],
    ['<details open><summary></summary><test-widget></test-widget><p></p></details>', 0],
    ['<details open><summary><p></p></summary></details>', 0],
  ] as const)("shows the Details placeholder only in a sole empty body paragraph: %s", (html, count) => {
    const stylesheet = new CSSStyleSheet()
    stylesheet.replaceSync(editorStyleString)
    const rule = Array.from(stylesheet.cssRules).find(rule => (rule as CSSStyleRule).style?.content === '"Details"') as CSSStyleRule
    expect(rule).toBeDefined()
    const fixture = document.createElement("div")
    fixture.innerHTML = html
    expect(fixture.querySelectorAll(rule.selectorText.replace(/::after$/, ""))).toHaveLength(count)
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
    const lockRule = Array.from(appendixStylesheet!.cssRules).find(rule =>
      (rule as CSSStyleRule).selectorText === ":host(.◆editing-locked) > :not(slot):not(.◆ai-review-toolbar)") as CSSStyleRule
    expect(lockRule.style.display).toBe("none")
    expect(Array.from(appendixStylesheet!.cssRules).some(rule => (rule as CSSKeyframesRule).name === "blink")).toBe(true)
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

  it("keeps body spacing in theme margins and aligns the empty caret with the content edge", () => {
    const stylesheet = new CSSStyleSheet()
    stylesheet.replaceSync(editorStyleString)
    const rules = Array.from(stylesheet.cssRules) as CSSStyleRule[]
    for(const rule of rules.filter(rule => /^body(?::has\(> :last-child\))?$/.test(rule.selectorText))) {
      expect(rule.style.padding).toBe("")
      expect(rule.style.paddingBlockEnd).toBe("")
    }
    const body = rules.find(rule => rule.selectorText === "body")!
    expect(body.style.minHeight).toBe("calc(100% - 2.5rem)")
    expect(editorStyleString).toMatch(/body::part\(empty-document-caret\)\s*\{[^}]*left:\s*anchor\(left\);/)
  })

  it("starts with an editable default paragraph", () => {
    const bodyRule = Array.from(document.adoptedStyleSheets.flatMap(sheet => Array.from(sheet.cssRules)))
      .find(rule => (rule as CSSStyleRule).selectorText === "body") as CSSStyleRule | undefined

    expect(bodyRule?.style.margin).toBe("")
    expect(bodyRule?.style.getPropertyValue("anchor-name")).toBe("--body-anchor")
    expect(bodyRule?.style.padding).toBe("")
    expect(bodyRule?.style.minHeight).toBe("calc(100% - 2.5rem)")
    expect(bodyRule?.style.maxWidth).toBe("")
    expect(bodyRule?.style.pointerEvents).toBe("auto")
    expect(bodyRule?.style.userSelect).toBe("text")
    expect(document.body).not.toHaveAttribute("contenteditable")
    expect(editor.doc.body.getAttribute("contenteditable")).toBeUndefined()
    expect(editor.toHTML()).not.toContain("contenteditable")
    expect(editor.toHTML(true)).toBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect(editor.features.selection.emptyDocumentCaret).toBeNull()
    expect(editor.features.selection.hoverCaret?.getRootNode()).toBe(editor.appendix)
    expect(editorStyleString).toContain("body::part(empty-document-caret)")
    expect(editorStyleString).toMatch(/body::part\(empty-document-caret\)[\s\S]*?left:\s*anchor\(left\);/)
    expect(editorStyleString).toContain("body::part(presence-caret)")
    expect(editorStyleString).toContain("body::part(presence-element-selection)")
    expect(editorStyleString).toContain("body::part(presence-element-selection-label)")
    expect(editorStyleString).toMatch(/\.◆element-selected\s*\{[\s\S]*?anchor-name:\s*--selection-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected,\s*\.◆element-selected:hover\s*\{[\s\S]*?outline:\s*none;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?position-anchor:\s*--selection-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret-node\),[\s\S]*?body::part\(selection-caret-capture\)\s*\{[\s\S]*?left:\s*anchor\(left\);[\s\S]*?width:\s*anchor-size\(width\);[\s\S]*?outline:\s*2px dotted var\(--sl-color-primary-400\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toMatch(/body::part\(selection-caret-capture\)\s*\{[\s\S]*?outline:\s*2px solid var\(--sl-color-primary-400\);/)
    expect(editorStyleString).toMatch(/body\s+\*:not\(\s*:where\(/)
    expect(editorStyleString).toContain("body:has(.◆element-capture-selected:is(:hover, .◆pointer-hovered, .◆element-hovered, .◆style-target-hovered))::part(hover-caret) {\n  display: none;")
    expect(editorStyleString).toMatch(/\.◆element-selected\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆node-selection-active,\s*body\.◆node-selection-active\s+\*\s*\{[\s\S]*?caret-color:\s*transparent\s*!important;/)
    expect(editorStyleString).toMatch(/body\.◆node-selection-active\s+\.◆element-capture-selected,\s*body\.◆node-selection-active\s+math\.◆element-capture-selected\s+\*\s*\{[\s\S]*?caret-color:\s*auto\s*!important;/)
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
    expect(editorStyleString).not.toMatch(/body\s*>\s*\*\s*\+\s*\*\s*\{[^}]*margin-block-start:/)
    expect(editorStyleString).toMatch(/body\s*>\s*:last-child\s*\{[\s\S]*?margin-block-end:\s*0;/)
    expect(editorStyleString).not.toMatch(/body:has\(>\s*:last-child\)\s*\{[^}]*padding/)
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
    expect(editorStyleString).toMatch(/\):is\(:hover, \.◆pointer-hovered\)\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-hovered\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆style-target-hovered\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\):not\(table \*\):is\(:hover, \.◆pointer-hovered\)\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/body table:is\(:hover, \.◆pointer-hovered\)\s*\{[\s\S]*?anchor-name:\s*--hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected:is\(:hover, \.◆pointer-hovered, \.◆element-hovered\):not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--selection-anchor, --hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆element-selected\.◆style-target-hovered:not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--selection-anchor, --hover-anchor;/)
    expect(editorStyleString).toMatch(/\.◆empty-selected:is\(:hover, \.◆pointer-hovered, \.◆element-hovered\):not\(table \*\)\s*\{[\s\S]*?anchor-name:\s*--empty-selected, --hover-anchor;/)
    expect(editorStyleString).toMatch(/body::part\(hover-caret\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?position-anchor:\s*--hover-anchor;[\s\S]*?width:\s*anchor-size\(width\);[\s\S]*?outline:\s*1px dotted var\(--sl-color-gray-400, black\);[\s\S]*?outline-offset:\s*2px;/)
    expect(editorStyleString).toMatch(/body:has\(\.◆style-target-hovered\)::part\(hover-caret\),\s*body\.◆style-target-hovered::part\(hover-caret\)\s*\{[\s\S]*?display:\s*block;/)
    expect(editorStyleString).toMatch(/body:has\(\.◆element-hovered\)::part\(hover-caret\)\s*\{[\s\S]*?outline:\s*2px dotted var\(--sl-color-primary-400\);/)
    expect(editorStyleString).toMatch(/body\.◆element-hovered::part\(hover-caret\)\s*\{[\s\S]*?position-anchor:\s*auto;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("body.◆element-hovered::after")
    expect(editorStyleString).toMatch(/body\.◆element-selected::part\(selection-caret-node\)\s*\{[\s\S]*?inset:\s*0;[\s\S]*?outline:\s*none;[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("body.◆element-selected::after")
    expect(editorStyleString).toContain("body::part(hover-caret)")
    expect(editorStyleString).toMatch(/summary:is\(:empty, :has\(> br:only-child\)\)::before\s*\{[\s\S]*?content:\s*"Summary";/)
    expect(editorStyleString).toMatch(/summary\s*\{\s*cursor:\s*text;/)
    expect(editorStyleString).toMatch(/body:has\(summary:is\(:hover, \.◆pointer-hovered, \.◆element-hovered, \.◆style-target-hovered\)\)::part\(hover-caret\)\s*\{\s*display:\s*none;/)
    expect(editorStyleString).toMatch(/summary::after\s*\{\s*cursor:\s*pointer;\s*\}/)
    expect(editorStyleString).not.toMatch(/summary:is\([^{}]*\)::after\s*\{[^}]*content:/)
    expect(editorStyleString).toMatch(/details > summary:first-child \+ p:last-child:is\(:empty, :has\(> br:only-child\)\)::after\s*\{\s*content:\s*"Details";/)
    expect(editorStyleString).toMatch(/details > summary:first-child \+ p:last-child:has\(> br:only-child\) > br\s*\{\s*display:\s*none;/)
    expect(editorStyleString).toContain("body::part(virtual-list-caret)")
    expect(editorStyleString).not.toMatch(/^(?:html|body)(?:\.◆template-active)?\s*\{[^}]*overflow(?:-x)?:\s*hidden;/m)
    expect(editorStyleString).not.toMatch(/body\.◆template-active\s*\{/)
    expect(editorStyleString).not.toMatch(/body\.◆template-active > \[role~="document"\]:only-child\s*\{/)
    expect(editorStyleString).toMatch(/body\.◆template-active:has\(> \[role~="document"\]\.◆element-selected:only-child\)::part\(selection-caret-node\)[\s\S]*?background:\s*rgb\(56 189 248 \/ 6%\);/)
    expect(editorStyleString).not.toContain("template-add")
    expect(editorStyleString).not.toContain('content: "Content"')
    expect(editorStyleString).toMatch(/summary:is\(:empty, :has\(> br:only-child\)\)\.◆empty-selected::before[\s\S]*?border-inline-start-color:\s*currentColor;/)
    expect(editorStyleString).toMatch(/@keyframes summary-caret-blink\s*\{\s*50%\s*\{\s*border-inline-start-color:\s*transparent;/)
    expect(editorStyleString).toMatch(/dl > dt:is\(:empty, :has\(br:only-child\)\)::after[\s\S]*?content:\s*"Term";/)
    expect(editorStyleString).toMatch(/dl > dd:is\(:empty, :has\(br:only-child\)\)::after[\s\S]*?content:\s*"Description";/)
    expect(editorStyleString).not.toMatch(/:is\(ul, ol, menu\):empty[\s\S]*?display:\s*list-item;/)
    expect(editorStyleString).toMatch(/\.◆media-empty\s*\{[\s\S]*?border:\s*1px dashed #6b7280;/)
    expect(editorStyleString).not.toMatch(/\.◆media-empty\.◆element-selected\s*\{/)
    expect(editorStyleString).toMatch(/:is\(picture, audio, video\)\s*\{[^}]*?width:\s*100%;/)
    expect(editorStyleString).not.toMatch(/:is\(picture, audio, video\)\s*\{[^}]*?(?:height|aspect-ratio):/)
    expect(editorStyleString).toMatch(/:is\(picture, video\)\s*\{[^}]*?height:\s*auto;[^}]*?aspect-ratio:\s*16\s*\/\s*9;/)
    expect(editorStyleString).not.toContain("audio.◆media-empty::-webkit-media-controls-enclosure")
    expect(editorStyleString).not.toMatch(/:is\([^)]*audio[^)]*\)\.◆media-empty\s*\{/)
    expect(editorStyleString).not.toMatch(/body:has\(\.◆media-empty:is\(\.◆gap-before-selected, \.◆gap-after-selected\)\)::part\(gap-caret\)\s*\{[\s\S]*?display:\s*none;/)
  })

  it("restores the default paragraph after a direct DOM change empties the body", async () => {
    document.body.replaceChildren()

    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(editor.toHTML(true)).toBe("<p></p>")
  })

  it.each(["style", "class"])("restores static content after a %s change", async attribute => {
    const style = document.createElement("style")
    style.textContent = ".positioned-test { position: absolute; }"
    document.head.append(style)
    try {
      document.body.innerHTML = "<p>Keep</p>"
      const original = document.body.firstElementChild!
      original.setAttribute(attribute, attribute === "style" ? "position: fixed" : "positioned-test")
      await vi.waitFor(() => expect(document.body.children).toHaveLength(2))
      expect(document.body.firstElementChild).toBe(original)
      expect(document.body.lastElementChild?.localName).toBe("p")
      expect(document.body.lastElementChild?.textContent).toBe("")
      expect(editor.toHTML(true)).toMatch(/<p><\/p>$/)
    }
    finally { style.remove() }
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

  it("wraps native body text beside the restored paragraph and preserves the caret", () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    const paragraph = document.body.firstElementChild!
    const text = document.createTextNode("typed")
    paragraph.before(text)
    $.move(text, 3)

    document.body.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: "typed"}))

    expect(editor.toHTML(true)).toBe("<p>typed</p><p></p>")
    expect(document.body.lastElementChild).toBe(paragraph)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(3)
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toBe("<body><p>typed</p><p></p></body>")
  })

  it("repairs only native body text runs while retaining comments, widgets and whitespace", () => {
    document.body.innerHTML = ' \n<!--before-->one<!--between--><unknown-widget custom="yes">private</unknown-widget>two<p>kept</p>'
    const comment = document.body.childNodes[1]
    const widget = document.querySelector("unknown-widget")!
    const paragraph = document.querySelector("p")!
    const text = widget.nextSibling!
    $.selectRange(text, 0, text, 2)

    document.body.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertReplacementText"}))

    expect(editor.toHTML(true)).toBe(' \n<!--before--><p>one</p><!--between--><unknown-widget custom="yes">private</unknown-widget><p>two</p><p>kept</p>')
    expect(document.body.childNodes[1]).toBe(comment)
    expect(document.querySelector("unknown-widget")).toBe(widget)
    expect(document.body.lastElementChild).toBe(paragraph)
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(0)
    expect($.focus).toBe(text)
    expect($.focusOffset).toBe(2)
  })

  it("keeps text repair in the same undo step as native insertion", () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.body.firstElementChild!)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const first = document.createTextNode("ab")
    const second = document.createTextNode("cd")
    document.body.prepend(first, second)
    $.move(second, 1)
    document.body.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))
    expect(editor.toHTML(true)).toBe("<p>abcd</p><p></p>")
    expect($.anchor?.textContent).toBe("abcd")
    expect($.anchorOffset).toBe(3)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()

    editor.doc.undo()
    expect(editor.toHTML(true)).toBe("<p></p>")
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe("<p>abcd</p><p></p>")
    expect(Array.from(document.body.childNodes).every(node => !(node instanceof Text))).toBe(true)
  })

  it("retains the adjusted body endpoint when wrapping a run with a text endpoint", () => {
    const first = document.createTextNode("ab"), second = document.createTextNode("cd")
    document.body.replaceChildren(first, second, document.createElement("p"))
    $.selectRange(second, 1, document.body, 3)
    document.body.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText"}))

    expect(editor.toHTML(true)).toBe("<p>abcd</p><p></p>")
    expect($.anchor).toBe(second)
    expect($.anchorOffset).toBe(1)
    expect($.focus).toBe(document.body)
    expect($.focusOffset).toBe(2)
  })

  it("preserves authored widget contenteditable attributes in saved HTML", () => {
    document.body.innerHTML = '<webwriter-demo contenteditable="true" spellcheck="false" value="7"></webwriter-demo>'
      + '<template><span class="authored ◆text-selected">Template</span><i class="◆editor-only">helper</i></template>'

    expect(editor.toHTML(true)).toBe('<webwriter-demo contenteditable="true" spellcheck="false" value="7"></webwriter-demo>'
      + '<template><span class="authored">Template</span></template>')
    document.body.replaceChildren()
  })

  it("preserves authored contenteditable values on ordinary and custom elements", () => {
    document.body.innerHTML = '<section contenteditable="false" spellcheck="true"><demo-widget contenteditable="false" spellcheck="true"></demo-widget></section>'

    expect(editor.toHTML(true)).toBe('<section contenteditable="false" spellcheck="true"><demo-widget contenteditable="false" spellcheck="true"></demo-widget></section>')
    document.body.replaceChildren()
  })

  it("extracts current input and textarea values without interpreting them as HTML", () => {
    const template = document.createElement("template")
    template.innerHTML = '<p><input value="old"> / <textarea>old</textarea></p>'
    template.content.querySelector("input")!.value = '<b>current</b>'
    template.content.querySelector("textarea")!.value = 'new notes'
    const {fragment} = editor.prepareHTMLFragment(template.content, true)
    expect(fragment.firstElementChild?.outerHTML).toBe('<p>&lt;b&gt;current&lt;/b&gt; / new notes</p>')
  })

  it("preserves absent and explicit editing attributes on arbitrary DOM insertions", async () => {
    document.body.innerHTML = '<section><p>Keep</p></section>'
    const section = document.querySelector("section")!
    section.insertAdjacentHTML("beforeend", '<demo-widget contenteditable="false"><span contenteditable="false">Keep</span><nested-widget></nested-widget></demo-widget><div is="custom-widget"></div>')
    await new Promise(resolve => setTimeout(resolve, 0))
    const widget = section.querySelector("demo-widget")!
    const shadow = widget.attachShadow({mode: "open"})
    shadow.innerHTML = '<private-widget contenteditable="false"></private-widget>'
    const removed = document.createElement("removed-widget")
    section.append(removed)
    removed.remove()

    expect(widget).toHaveAttribute("contenteditable", "false")
    expect(section.querySelector("nested-widget")).not.toHaveAttribute("contenteditable")
    expect(section.querySelector("[is]")).not.toHaveAttribute("contenteditable")
    expect(section.querySelector("span")).toHaveAttribute("contenteditable", "false")
    expect(shadow.firstElementChild).toHaveAttribute("contenteditable", "false")
    expect(removed).not.toHaveAttribute("contenteditable")

    widget.removeAttribute("contenteditable")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(widget).not.toHaveAttribute("contenteditable")
    widget.setAttribute("contenteditable", "plaintext-only")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(widget).toHaveAttribute("contenteditable", "plaintext-only")
  })

  it.each([false, true])("preserves widget editing attributes on save, including inert templates (offline=%s)", async offline => {
    document.body.innerHTML = '<demo-widget contenteditable="false" value="7"></demo-widget><div is="custom-widget" contenteditable="true"></div><template><nested-widget contenteditable="plaintext-only"></nested-widget></template>'
    const saved = await editor.serializeHTML(offline)
    expect(saved).toContain('<demo-widget contenteditable="false" value="7"></demo-widget>')
    expect(saved).toContain('<div is="custom-widget" contenteditable="true"></div>')
    expect(saved).toContain('<template><nested-widget contenteditable="plaintext-only"></nested-widget></template>')
    expect(document.querySelector("demo-widget")).toHaveAttribute("contenteditable", "false")
  })

  it("keeps data URLs in offline CSS as authored", async () => {
    document.body.innerHTML = `<p style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot;></svg>')">x</p>`
    const style = document.querySelector("p")!.getAttribute("style")
    const saved = await editor.serializeHTML(true)
    const paragraph = new DOMParser().parseFromString(saved, "text/html").querySelector("p")!
    expect(paragraph.getAttribute("style")).toBe(style)
    expect(paragraph.attributes).toHaveLength(1)
  })

  it("unwraps every form element and preserves allowed nested content", () => {
    const {fragment} = editor.parseHTMLFragment('<form><fieldset><legend>Title</legend><p>before <label><em>label</em></label><datalist><option value="choice"></option></datalist><selectedcontent>selected</selectedcontent> after</p></fieldset></form>', true)
    expect(fragment.textContent).toBe("Titlebefore labelchoiceselected after")
    expect(Array.from(fragment.children, element => element.outerHTML).join("")).toBe('<p>before <i>label</i>choiceselected after</p>')
  })

  it("does not expose temporary schema attributes to registered widgets", () => {
    const observed: string[] = []
    class PreparationProbe extends HTMLElement {
      static observedAttributes = ["contenteditable"]

      attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        observed.push(`${name}=${newValue}`)
      }

      connectedCallback() {
        observed.push(`connected=${this.getAttribute("contenteditable")}`)
      }
    }
    customElements.define("ww-preparation-probe", PreparationProbe)

    const inertDocument = new DOMParser().parseFromString(
      '<ww-preparation-probe contenteditable="true"></ww-preparation-probe>',
      "text/html",
    )
    const source = inertDocument.createDocumentFragment()
    source.append(...Array.from(inertDocument.body.childNodes))
    const {fragment} = editor.prepareHTMLFragment(source)
    expect(fragment.firstElementChild).toHaveAttribute("contenteditable", "true")
    expect(observed).not.toContain("contenteditable=false")

    document.body.append(fragment)
    expect(observed).not.toContain("connected=false")
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

describe("DOMEditor serialization", () => {
  it("does not construct widgets while serializing an inert clipboard fragment", () => {
    let constructions = 0
    const tag = "domeditor-serialization-probe"
    if(!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        constructor() {
          super()
          constructions++
        }
      })
    }
    document.body.innerHTML = `<${tag}>Copied</${tag}>`
    const source = document.body.firstElementChild!
    const fragment = getInertDocument(document).createDocumentFragment()
    fragment.append(cloneInert(source, true))
    const editor = new DOMEditor()
    const baseline = constructions

    const {html} = editor.serializeClipboardFragment(fragment)

    expect(html).toBe(`<${tag}>Copied</${tag}>`)
    expect(constructions).toBe(baseline)
    editor.destroy()
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

  it("keeps inactive widget scrolls from reaching the widget while the editor observes them", async () => {
    const widget = document.createElement("scrolling-widget")
    const scroller = document.createElement("div")
    widget.attachShadow({mode: "open"}).append(scroller)
    document.body.append(widget)
    const renderPresence = vi.spyOn(editor.features.collaboration, "renderPresence")
    const widgetScroll = vi.fn()
    scroller.addEventListener("scroll", widgetScroll)

    scroller.dispatchEvent(new Event("scroll", {bubbles: true, composed: true}))
    // Presence is repositioned once per frame.
    await new Promise(resolve => requestAnimationFrame(resolve))

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

describe("breadcrumb positioning", () => {
  it("omits summary from the breadcrumb while its text is edited", () => {
    document.body.innerHTML = '<details><summary style="position: relative; left: 2px">Title</summary><p>Body</p></details>'
    const editor = new DOMEditor()
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    try {
      $.move(document.querySelector("summary")!.firstChild!, 2)
      editor.postSelectionPath()
      const detail = postMessage.mock.calls.find(([message]) => message.type === selectionChangeEvent)![0].detail as SelectionChangeDetail
      expect(detail.path.map(item => item.path)).toEqual([[], [0]])
    }
    finally {
      editor.destroy()
      postMessage.mockRestore()
      document.body.replaceChildren()
    }
  })

  const withSelection = (html: string, check: (editor: DOMEditor, readPath: () => SelectionChangeDetail["path"]) => void) => {
    document.body.innerHTML = html
    const editor = new DOMEditor()
    const target = document.getElementById("target")!
    const parent = target.parentNode!
    const index = Array.from(parent.childNodes).indexOf(target)
    $.selectRange(parent, index, parent, index + 1)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    const readPath = () => {
      postMessage.mockClear()
      editor.postSelectionPath()
      return (postMessage.mock.calls.find(([message]) => message.type === selectionChangeEvent)![0].detail as SelectionChangeDetail).path
    }
    try { check(editor, readPath) }
    finally {
      editor.destroy()
      postMessage.mockRestore()
      document.body.replaceChildren()
    }
  }

  it.each(["absolute", "fixed"])("finds the actual %s anchor across irregular and custom-element nesting", position => {
    withSelection(`<div style="transform: translateX(0)">text<!--keep--><custom-wrapper><span><p id="target" style="position: ${position}">Text</p></span></custom-wrapper></div>`, (editor, readPath) => {
      const authoredHTML = editor.toHTML(true)
      const path = readPath()
      expect(path.flatMap(item => item.sections ?? []).find(section => section.path.join() === "0")?.positionAnchor).toBe(true)
      expect(path.at(-1)).toMatchObject({path: [0, 2, 0, 0], position})
      expect(path.at(-1)?.positionAnchor).toBeUndefined()
      expect(path[0].positionAnchor).toBeUndefined()
      expect(editor.toHTML(true)).toBe(authoredHTML)
      expect(document.body.querySelector("sup, .position-icons")).toBeNull()
    })
  })

  it.each(["absolute", "fixed"])("uses Document for the %s viewport anchor", position => {
    withSelection(`<p id="target" style="position: ${position}">Text</p>`, (_editor, readPath) => {
      expect(readPath()).toMatchObject([
        {path: [], positionAnchor: true},
        {path: [0], position},
      ])
    })
  })

  it.each(["left", "right"])("includes an authored %s float in the selection path", side => {
    withSelection(`<p id="target" style="float: ${side}">Text</p>`, (_editor, readPath) => {
      expect(readPath().at(-1)?.float).toBe(`far-${side}`)
    })
  })

  it("preserves an authored float when responsive CSS computes to none", () => {
    withSelection(`<style>.responsive { float: none !important }</style><p id="target" class="responsive" style="float: left">Text</p>`, (_editor, readPath) => {
      expect(getComputedStyle(document.getElementById("target")!).float).toBe("none")
      expect(readPath().at(-1)?.float).toBe("far-left")
    })
  })

  it.each(["relative", "sticky"])("marks the %s element's own normal-flow anchor", position => {
    withSelection(`<div><p id="target" style="position: ${position}; top: 8px">Text</p></div>`, (_editor, readPath) => {
      const path = readPath()
      expect(path.at(-1)).toMatchObject({position, positionAnchor: true})
      expect(path.slice(0, -1).every(item => !item.positionAnchor)).toBe(true)
    })
  })

  it.each(["", "inset: auto", "inset: 0", "top: 0px; right: auto; bottom: 0%; left: -0px"])("omits relative positioning without an offset: %s", offsets => {
    withSelection(`<section style="position: relative"><span style="position: relative"><custom-widget id="target" style="position: relative; ${offsets}">Text</custom-widget></span></section>`, (editor, readPath) => {
      const authoredHTML = editor.toHTML(true)
      const path = readPath()
      expect(path.map(item => item.path)).toEqual([[], [0, 0, 0]])
      expect(path.flatMap(item => [item, ...(item.sections ?? [])]).every(item => !item.position && !item.positionAnchor)).toBe(true)
      expect(editor.toHTML(true)).toBe(authoredHTML)
    })
  })

  it.each(["top: 4px", "right: -4px", "bottom: 0.5px", "left: -0.5px"])("updates relative positioning indicators as offsets change: %s", offsets => {
    withSelection('<p id="target" style="position: relative">Text</p>', (_editor, readPath) => {
      const target = document.getElementById("target")!
      expect(readPath().at(-1)?.position).toBeUndefined()
      target.style.cssText = `position: relative; ${offsets}`
      expect(readPath().at(-1)).toMatchObject({position: "relative", positionAnchor: true})
      target.style.cssText = "position: relative; inset: 0"
      expect(readPath().at(-1)?.position).toBeUndefined()
      expect(readPath().at(-1)?.positionAnchor).toBeUndefined()
    })
  })

  it("keeps a relative element without an offset as an absolute child's anchor", () => {
    withSelection('<section style="position: relative; inset: 0"><p id="target" style="position: absolute">Text</p></section>', (_editor, readPath) => {
      const section = readPath().at(-1)?.sections?.[0]
      expect(section?.position).toBeUndefined()
      expect(section?.positionAnchor).toBe(true)
    })
  })

  it("keeps anchors on section labels and exposes otherwise hidden inline anchors", () => {
    withSelection('<section style="position: relative"><span style="transform: translateX(0)"><p id="target" style="position: absolute">Text</p></span></section>', (_editor, readPath) => {
      const path = readPath()
      expect(path[1]).toMatchObject({
        path: [0, 0], positionAnchor: true,
        sections: [{path: [0]}],
      })
      expect(path[1].sections?.[0].position).toBeUndefined()
      expect(path[1].sections?.[0].positionAnchor).toBeUndefined()
      expect(path.at(-1)).toMatchObject({position: "absolute"})
    })
  })

  it("recomputes positioning after style changes and removal of the selected element", () => {
    withSelection('<div style="position: relative"><p id="target" style="position: absolute">Text</p></div>', (_editor, readPath) => {
      expect(readPath()[1].sections?.[0].positionAnchor).toBe(true)
      const target = document.getElementById("target")!
      target.style.position = "fixed"
      expect(readPath()[0].positionAnchor).toBe(true)
      target.style.position = "static"
      expect(readPath().at(-1)?.position).toBeUndefined()
      expect(readPath()[0].positionAnchor).toBeUndefined()
      target.remove()
      expect(readPath().some(item => item.position === "fixed" || item.position === "absolute")).toBe(false)
    })
  })
})

describe("appendix hit testing", () => {
  it("makes editor UI transparent only while resolving a hit test", () => {
    const editor = new DOMEditor()
    try {
      const rules = () => editor.appendix.adoptedStyleSheets.map(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n")).join("\n")
      const before = rules()
      expect(editor.hitTestBeneathAppendix(() => rules())).toMatch(/pointer-events:\s*none\s*!important/)
      expect(rules()).toBe(before)
      expect(() => editor.hitTestBeneathAppendix(() => { throw new Error("hit test failed") })).toThrow("hit test failed")
      expect(rules()).toBe(before)
    }
    finally { editor.destroy() }
  })
})

describe("bridge origin binding", () => {
  it("leaves frame controls to the frame host listener", () => {
    const bridgeNonce = "0123456789abcdef"
    const editor = new DOMEditor({bridgeNonce})
    try {
      expect(() => window.dispatchEvent(new MessageEvent("message", {data: {
        type: editorFrameControlMessage, command: "focus", bridgeNonce,
      }}))).not.toThrow()
      expect(() => window.dispatchEvent(new MessageEvent("message", {data: {
        type: "unregistered-action", bridgeNonce,
      }}))).toThrow("No handler registered")
    }
    finally { editor.destroy() }
  })

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

  it("returns selected styles without reposting an unchanged selection", async () => {
    document.body.innerHTML = '<p style="padding: 8px">One</p><p style="padding: 16px">Two</p>'
    const editor = new DOMEditor({bridgeNonce: "0123456789abcdef"})
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    try {
      for(const [index, paragraph] of Array.from(document.querySelectorAll("p")).entries()) {
        const text = paragraph.firstChild!
        document.getSelection()!.setBaseAndExtent(text, 0, text, 0)
        postMessage.mockClear()
        window.dispatchEvent(new MessageEvent("message", {data: {
          type: "getStyleState", properties: ["padding"], requestId: `style-${index}`,
          bridgeNonce: editor.trustedScriptNonce,
        }}))
        await Promise.resolve()
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
          type: executeCompleteEvent,
          detail: {requestId: `style-${index}`, result: expect.objectContaining({
            inline: expect.objectContaining({padding: {value: paragraph.style.padding, priority: ""}}),
          })},
        }), window.location.origin)
        expect(postMessage.mock.calls.some(([message]) => message.type === selectionChangeEvent)).toBe(false)
      }
    }
    finally {
      editor.destroy()
      postMessage.mockRestore()
    }
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

    postMessage.mockClear()
    window.dispatchEvent(new MessageEvent("message", {data: {
      type: "hoverHTMLSelectionEdit", hovered: true, requestId: "html-hover", bridgeNonce,
    }}))
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: executeCompleteEvent, detail: {requestId: "html-hover", result: undefined},
    }), window.location.origin))
    expect(postMessage.mock.calls.some(([message]) => message.type === selectionChangeEvent)).toBe(false)
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    editor.destroy()
    postMessage.mockRestore()
  })
})

describe("command normalization boundaries", () => {
  it.each([undefined, [17]])("preserves authored node identity for a style read with properties %s", async properties => {
    document.body.innerHTML = '<p><b>one</b><b>two</b></p><test-widget></test-widget>'
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    const editor = new DOMEditor()
    try {
      const paragraph = document.querySelector("p")!
      const marks = Array.from(paragraph.children)
      const widget = document.querySelector("test-widget")!
      const texts = [document.createTextNode("x"), document.createTextNode("y")]
      widget.append(...texts)
      document.getSelection()!.setBaseAndExtent(document.body, 0, document.body, 1)
      window.dispatchEvent(new MessageEvent("message", {data: {
        type: "getStyleState", properties, requestId: "read-style", bridgeNonce: editor.trustedScriptNonce,
      }}))
      await vi.waitFor(() => expect(postMessage.mock.calls.some(([message]) => message.detail?.requestId === "read-style")).toBe(true))
      expect(Array.from(paragraph.children)).toEqual(marks)
      expect(Array.from(widget.childNodes)).toEqual(texts)
      expect(paragraph.innerHTML).toBe("<b>one</b><b>two</b>")
    }
    finally {
      editor.destroy()
      postMessage.mockRestore()
    }
  })

  it("normalizes only the edited block and leaves widget-owned content intact", () => {
    document.body.innerHTML = '<p id="edited"><b>one</b><b>two</b><test-widget></test-widget></p><p id="other"><b>x</b><b>y</b></p>'
    const editor = new DOMEditor()
    try {
      const edited = document.querySelector("#edited")!
      const widget = document.querySelector("test-widget")!
      const texts = [document.createTextNode("x"), document.createTextNode("y")]
      widget.append(...texts)
      const selection = document.getSelection()!
      selection.setBaseAndExtent(edited.firstChild!.firstChild!, 1, edited.firstChild!.firstChild!, 1)
      editor.normalizeSurroundingElements(edited)
      expect(edited.querySelectorAll("b")).toHaveLength(1)
      expect(Array.from(widget.childNodes)).toEqual(texts)
      expect(document.querySelector("#other")!.innerHTML).toBe("<b>x</b><b>y</b>")
      expect(selection.anchorNode?.textContent).toBe("onetwo")
      expect(selection.anchorOffset).toBe(1)
      selection.setBaseAndExtent(document.body, 0, document.body, 1)
      editor.normalizeSurroundingElements(document.body)
      expect(document.querySelector("#other")!.innerHTML).toBe("<b>x</b><b>y</b>")
    }
    finally { editor.destroy() }
  })
})

describe("registered editor commands", () => {
  it("resolves only registered names and retains stable handler identity", () => {
    const editor = new DOMEditor()
    try {
      for(const name of ["toString", "constructor", "__proto__", "missing-command"]) {
        expect(editor.getActionHandler(name)).toBeUndefined()
      }
      expect(editor.getActionHandler("getStyleState")).toBe(editor.features.manipulation.actions.getStyleState)
      expect(editor.getActionHandler("getStyleState")).toBe(editor.getActionHandler("getStyleState"))
    }
    finally { editor.destroy() }
  })
})

describe("legacy preformatted blocks", () => {
  it.each([false, true])("imports PRE as styled paragraphs (transfer: %s)", transfer => {
    const editor = new DOMEditor()
    try {
      const {fragment} = editor.parseHTMLFragment('<pre id="sample" style="color: red">  first\n<b>second</b><!--keep--></pre>', transfer)
      expect(fragment.querySelector("pre")).toBeNull()
      const paragraph = fragment.querySelector("p")!
      expect(paragraph.textContent).toBe("  first\nsecond")
      expect(paragraph.style.whiteSpace).toBe("pre-wrap")
      expect(paragraph.style.fontFamily).toBe("monospace")
      expect(paragraph.id).toBe("sample")
      expect(paragraph.querySelector("b")!.textContent).toBe("second")
      expect(paragraph.style.color).toBe(transfer ? "" : "red")
    }
    finally {editor.destroy()}
  })

  it("converts opened PRE content while preserving inline overrides and widget-owned content", () => {
    document.body.innerHTML = '<pre id="sample" style="font-family: serif; white-space: break-spaces">  hello\nworld</pre><test-widget><pre>owned</pre></test-widget>'
    const editor = new DOMEditor()
    try {
      const paragraph = document.querySelector<HTMLParagraphElement>("p#sample")!
      expect(paragraph).not.toBeNull()
      expect(paragraph.style.fontFamily).toBe("serif")
      expect(paragraph.style.whiteSpace).toBe("break-spaces")
      expect(paragraph.textContent).toBe("  hello\nworld")
      expect(document.querySelector("test-widget pre")!.textContent).toBe("owned")
      expect(editor.toHTML()).not.toContain('<pre id="sample"')
    }
    finally {editor.destroy()}
  })
})

describe("independent disclosure elements", () => {
  it("removes accordion names on opening and importing while retaining open state and content", () => {
    document.body.innerHTML = '<details name="faq" open><summary>Question</summary><p>Answer</p></details>'
    const editor = new DOMEditor()
    try {
      expect(document.querySelector("details")!.hasAttribute("name")).toBe(false)
      expect(document.querySelector("details")!.open).toBe(true)
      expect(() => editor.features.manipulation.setAuthoredElementAttribute(document.querySelector("details")!, "name", "faq"))
        .toThrow()
      for(const transfer of [false, true]) {
        const {fragment} = editor.parseHTMLFragment('<details name="faq" open><summary>Question</summary><p>Answer</p></details>', transfer)
        const details = fragment.querySelector("details")!
        expect(details.hasAttribute("name")).toBe(false)
        expect(details.open).toBe(true)
        expect(details.querySelector("summary")!.textContent).toBe("Question")
        expect(details.querySelector("p")!.textContent).toBe("Answer")
      }
    }
    finally {editor.destroy()}
  })
})
