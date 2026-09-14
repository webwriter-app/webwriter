// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {slidesStyles} from "../document-layout"
import {selectionChangeEvent, type SelectionChangeDetail} from "../editor-bridge"

let editor: DOMEditor
const head = document.head.cloneNode(true)
const settle = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
const convert = (mode: "document" | "canvas" | "slides") => editor.setDocumentLayout(mode, editor.getDocumentLayoutState().mode)
const slides = () => Array.from(document.querySelectorAll<HTMLElement>(".ww-slides-viewport > section.ww-slide"))
const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>("nav.ww-slides-navigation > a"))
const button = (name: string) => editor.appendix.querySelector<HTMLButtonElement>(`[part=slide-navigation-actions] button[name="${name}"]`)!
const seed = () => {
  document.body.innerHTML = '<h1>One</h1><p>First</p>'
  expect(convert("slides")).toBe(true)
  editor.features.slides.actions.addSlide({type: "addSlide"})
  const [one, two] = slides()
  two.querySelector("h1")!.remove()
  two.firstElementChild!.textContent = "Second"
  $.move(one.querySelector("p")!.firstChild!, 2)
  return [one, two]
}
beforeEach(() => { document.body.replaceChildren(); document.body.removeAttribute("class"); editor = new DOMEditor() })
afterEach(() => {
  editor.destroy(); document.head.replaceChildren(...Array.from(head.childNodes, node => node.cloneNode(true)))
  document.body.replaceChildren(); document.body.removeAttribute("class"); vi.restoreAllMocks()
})

describe("CSS-only Slides layout", () => {
  it("initializes empty documents and added slides with aligned heading and paragraph boxes", async () => {
    const original = document.body.firstElementChild!
    expect(convert("slides")).toBe(true)
    expect(slides()[0].querySelector("p")).toBe(original)
    editor.features.slides.actions.addSlide({type: "addSlide"})
    for(const slide of slides()) {
      expect(Array.from(slide.children, child => child.localName)).toEqual(["h1", "p", "nav"])
      const heading = slide.querySelector("h1")!, paragraph = slide.querySelector("p")!
      expect(heading.style.position).toBe("absolute")
      expect(paragraph.style.position).toBe("absolute")
      expect(heading.style.height).toBe("20%")
      expect(paragraph.style.top).toBe("calc(20% + 2.5rem)")
      expect(paragraph.style.height).toBe("calc(80% - 3.75rem)")
    }
    expect($.anchor).toBe(slides()[1].querySelector("h1"))
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(saved.querySelector<HTMLElement>("section.ww-slide > p")!.style.height).toBe("calc(80% - 3.75rem)")
    expect(saved.body.innerHTML).not.toContain("◆")
  })

  it("positions existing flow content on opening a deck and leaves later authored placements intact", async () => {
    editor.destroy()
    document.body.className = "ww-slides"
    document.body.innerHTML = '<div class="ww-slides-viewport"><section class="ww-slide"><h1>Title</h1><!--keep--><custom-card><p>Private</p></custom-card></section></div><nav class="ww-slides-navigation"></nav>'
    const slide = slides()[0], heading = slide.querySelector("h1")!, widget = slide.querySelector<HTMLElement>("custom-card")!
    vi.spyOn(slide, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 800, 450))
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 120, 760, 60))
    vi.spyOn(widget, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 200, 760, 300))
    editor = new DOMEditor()
    expect(heading.style.left).toBe("20px"); expect(heading.style.top).toBe("20px")
    expect(widget.style.left).toBe("20px"); expect(widget.style.top).toBe("100px")
    expect(widget.style.width).toBe("760px")
    expect(widget.querySelector("p")?.hasAttribute("style")).toBe(false)
    expect(slide.innerHTML).toContain("<!--keep-->")
    widget.style.left = "35%"
    await settle()
    expect(widget.style.left).toBe("35%")
    expect(convert("document")).toBe(true)
    expect(heading.style.position).toBe("")
    expect(widget.style.position).toBe("")
  })

  it("highlights the active bubble and reveals removal on the active slide or hover, with cleanup", async () => {
    const [one, two] = seed(); await settle()
    const [active, inactive] = links()
    const remove = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Remove slide 2"]')!
    expect(active.classList.contains("◆slide-current")).toBe(true)
    expect(button("remove").classList.contains("shown")).toBe(true)
    expect(remove.classList.contains("shown")).toBe(false)
    const matchesLink = inactive.matches.bind(inactive), matchesButton = remove.matches.bind(remove)
    let hoverLink = true, hoverButton = false
    vi.spyOn(inactive, "matches").mockImplementation(selector => selector === ":hover, :focus-visible" ? hoverLink : matchesLink(selector))
    vi.spyOn(remove, "matches").mockImplementation(selector => selector === ":hover, :focus-visible" ? hoverButton : matchesButton(selector))
    inactive.dispatchEvent(new PointerEvent("pointerover", {bubbles: true})); await settle()
    expect(remove.classList.contains("shown")).toBe(true)
    hoverLink = false; hoverButton = true
    inactive.dispatchEvent(new PointerEvent("pointerout", {bubbles: true, relatedTarget: remove})); await settle()
    expect(remove.classList.contains("shown")).toBe(true)
    hoverButton = false
    remove.dispatchEvent(new PointerEvent("pointerout", {bubbles: true, composed: true})); await settle()
    expect(remove.classList.contains("shown")).toBe(false)
    editor.features.slides.selectStart(two); await settle()
    expect(active.classList.contains("◆slide-current")).toBe(false)
    expect(inactive.classList.contains("◆slide-current")).toBe(true)
    expect(editor.appendix.querySelector('[aria-label="Remove slide 2"]')?.classList.contains("shown")).toBe(true)
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("◆slide-current")
    expect(await editor.serializeHTML(true)).not.toContain("◆slide-current")
    editor.features.slides.disable()
    expect(inactive.classList.contains("◆slide-current")).toBe(false)
    expect(one.isConnected).toBe(true)
  })

  it("prevents dragging and dropping on every slide control and exports non-draggable links", async () => {
    seed(); await settle()
    const controls = [...document.querySelectorAll<HTMLElement>("nav a"), ...editor.appendix.querySelectorAll<HTMLElement>("[part=slide-navigation-actions] button")]
    const before = editor.toHTML(true)
    for(const control of controls) {
      expect(control.getAttribute("draggable")).toBe("false")
      for(const type of ["dragstart", "dragover", "drop"]) {
        const event = new DragEvent(type, {bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer()})
        Object.defineProperty(event, "dataTransfer", {value: new DataTransfer()})
        control.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        expect(event.dataTransfer?.dropEffect).toBe("none")
      }
    }
    expect(editor.toHTML(true)).toBe(before)
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(Array.from(saved.querySelectorAll("nav a"), link => link.getAttribute("draggable"))).toEqual(controls.filter(control => control.localName === "a").map(() => "false"))
  })

  it("shows Slides > Slide number > content without carousel sectioning and follows live order", () => {
    const [one, two] = seed()
    const viewport = one.parentElement!
    viewport.prepend(document.createComment("keep"), document.createElement("custom-slide"))
    const section = document.createElement("article")
    const paragraph = two.firstElementChild!
    paragraph.before(section)
    section.append(paragraph)
    $.move(paragraph.firstChild!, 1)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const detail = () => {
      editor.postSelectionPath()
      const event = postMessage.mock.calls.at(-1)![0]
      expect(event.type).toBe(selectionChangeEvent)
      return event.detail as SelectionChangeDetail
    }

    expect(detail().path).toMatchObject([
      {path: [], name: "Slides", icon: "KeywordPresentation"},
      {path: [0, 3], name: "Slide 2", icon: "Rectangle"},
      {path: [0, 3, 0, 0], name: "Paragraph", icon: "Paragraph", sections: [
        {path: [0, 3, 0], type: "article", name: "Article", icon: "Article"},
      ]},
    ])
    viewport.insertBefore(two, one)
    $.move(paragraph.firstChild!, 1)
    expect(detail().path[1]).toMatchObject({path: [0, 2], name: "Slide 1", icon: "Rectangle"})

    convert("document")
    const documentPath = detail().path
    expect(documentPath[0].name).toBe("Document")
    expect(documentPath.flatMap(item => item.sections ?? []).map(section => section.type)).toEqual(["article"])
  })

  it("selects and hovers the whole slide from its breadcrumb without entering its text", async () => {
    const [, two] = seed()
    links()[0].click()
    editor.features.selection.actions.selectNode({type: "selectNode", path: [0, 1]})
    two.dispatchEvent(new FocusEvent("focusin", {bubbles: true}))
    two.parentElement!.dispatchEvent(new Event("scrollend"))
    await settle()
    expect($.selectedElement).toBe(two)
    expect($.isElementSelection).toBe(true)
    expect(editor.features.selection.selectedSectionElement).toBeNull()
    expect(editor.features.selection.selectSectionElement(two)).toBe(false)
    editor.features.selection.actions.hoverNode({type: "hoverNode", path: [0, 1]})
    expect(two.classList.contains("◆element-hovered")).toBe(true)
    editor.features.selection.actions.hoverNode({type: "hoverNode", path: null})
    expect(two.classList.contains("◆element-hovered")).toBe(false)
  })

  it("places a caret in the first text block after native slide navigation", async () => {
    const [one, two] = seed()
    links()[1].click(); await settle()
    expect($.anchor).toBe(two.firstElementChild)
    expect($.anchorOffset).toBe(0)
    expect($.isTextSelection).toBe(true)
    two.querySelector<HTMLAnchorElement>(".ww-slide-previous")!.click(); await settle()
    expect($.anchor).toBe(one.firstElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("uses a gap before non-text content, including widgets, without entering it", async () => {
    const [, two] = seed()
    for(const html of ['<table><tr><td>Cell</td></tr></table>', '<custom-card><p>Private</p></custom-card>', '<p contenteditable="false">Read only</p>', '<article><p>Nested</p></article>']) {
      two.innerHTML = `<!--keep--> \n${html}`
      const first = two.firstElementChild!
      editor.features.slides.selectStart(two)
      expect($.isGapSelection).toBe(true)
      expect($.anchor).toBe(two)
      expect(two.childNodes[$.anchorOffset]).toBe(first)
      expect(two.firstElementChild).toBe(first)
    }
    const paragraph = editor.features.manipulation.ensureTextBlock()
    expect(two.firstElementChild).toBe(paragraph)
    expect(paragraph instanceof Element && paragraph.matches("p:empty")).toBe(true)
    expect($.anchor).toBe(paragraph)
    expect(two.querySelector("article p")?.textContent).toBe("Nested")
  })

  it("ignores a navigation target removed before its caret placement and cancels on teardown", async () => {
    const [one, two] = seed()
    links()[1].click(); two.remove(); await settle()
    expect($.anchor?.isConnected).toBe(true)
    expect(two.contains($.anchor)).toBe(false)
    links()[0].click()
    editor.features.slides.disable()
    $.move(one.querySelector("p")!.firstChild!, 2)
    await settle()
    expect($.anchorOffset).toBe(2)
  })

  it("leaves widget capture and table selections when entering another slide", () => {
    const [one, two] = seed()
    const widget = document.createElement("custom-card")
    one.prepend(widget)
    editor.features.selection.captureElement(widget)
    expect(editor.features.selection.isCaptureSelection).toBe(true)
    editor.features.slides.selectStart(two)
    expect(editor.features.selection.isCaptureSelection).toBe(false)
    expect($.anchor).toBe(two.firstElementChild)
    const table = document.createElement("table")
    table.innerHTML = "<tr><td>One</td><td>Two</td></tr>"
    one.append(table)
    editor.features.table.selectCells(table.rows[0].cells[0], table.rows[0].cells[1])
    expect(editor.features.table.hasCellSelection).toBe(true)
    editor.features.slides.selectStart(two)
    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.anchor).toBe(two.firstElementChild)
  })

  it("repairs an initially empty slides document before editing or serialization", () => {
    editor.destroy()
    document.body.className = "ww-slides"
    document.body.replaceChildren()
    editor = new DOMEditor()
    expect(slides()).toHaveLength(1)
    expect(slides()[0].firstElementChild?.matches("p:empty")).toBe(true)
    expect(links()).toHaveLength(1)
  })

  it("restores the minimum slide when external class edits remove the last slide role", async () => {
    document.body.innerHTML = "<p>Keep this</p>"
    convert("slides")
    const original = slides()[0]
    original.classList.remove("ww-slide")
    await settle()
    expect(original.isConnected).toBe(true)
    expect(original.querySelector("p")?.textContent).toBe("Keep this")
    expect(slides()).toHaveLength(1)
    expect(slides()[0].firstElementChild?.matches("p:empty")).toBe(true)
    expect(links()).toHaveLength(1)
  })

  it("restores an empty slide after command and native deletions while retaining navigation", async () => {
    const [, two] = seed(), paragraph = two.firstElementChild!, directions = two.querySelector("nav")!
    $.selectElement(paragraph)
    editor.features.manipulation.delete()
    expect(two.firstElementChild?.matches("p:empty")).toBe(true)
    expect(two.querySelector("nav")).toBe(directions)
    expect($.anchor).toBe(two.firstElementChild)
    two.firstElementChild!.remove()
    two.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "deleteContentBackward"}))
    expect(two.firstElementChild?.matches("p:empty")).toBe(true)
    await settle()
    expect(two.querySelectorAll("p")).toHaveLength(1)
  })

  it("always retains a slide and a paragraph after removing the last slide, with undo/redo", async () => {
    document.body.innerHTML = "<p>Original</p>"
    convert("slides")
    const original = slides()[0].id
    editor.doc.syncFromDOM()
    editor.features.slides.actions.removeSlide({type: "removeSlide"})
    expect(slides()).toHaveLength(1)
    expect(slides()[0].firstElementChild?.matches("p:empty")).toBe(true)
    expect(links()).toHaveLength(1)
    expect($.anchor).toBe(slides()[0].firstElementChild)
    editor.doc.undo(); await settle()
    expect(slides()).toHaveLength(1)
    expect(slides()[0].id).toBe(original)
    expect(slides()[0].firstElementChild?.textContent).toBe("Original")
    editor.doc.redo(); await settle()
    expect(slides()).toHaveLength(1)
    expect(slides()[0].firstElementChild?.matches("p:empty")).toBe(true)
  })

  it("repairs direct DOM and remote deletions without changing other content or selection", async () => {
    const [one, two] = seed()
    const anchor = $.anchor, offset = $.anchorOffset
    two.replaceChildren(document.createComment("preserve"), document.createTextNode(" \n"))
    await settle()
    expect(two.firstElementChild?.matches("p:empty")).toBe(true)
    expect(two.innerHTML).toContain("<!--preserve-->")
    expect($.anchor).toBe(anchor); expect($.anchorOffset).toBe(offset)
    editor.doc.syncFromDOM()
    editor.doc.doc.transact(() => editor.doc.body.delete(0, editor.doc.body.length), "remote-test")
    await settle()
    expect(slides()).toHaveLength(1)
    expect(slides()[0].firstElementChild?.matches("p:empty")).toBe(true)
    expect(links()).toHaveLength(1)
    expect($.anchor).toBe(slides()[0].firstElementChild)
    expect(one.isConnected).toBe(false)
    const serialized = await editor.serializeHTML(true)
    expect(serialized).toContain('<p></p>')
    expect(serialized).not.toContain("◆")
  })

  it("omits slide direction controls and their descendants from the selection path", () => {
    const [one] = seed()
    // Happy DOM does not resolve percentage transforms to matrices.
    one.querySelector<HTMLElement>(".ww-slide-next")!.style.transform = "none"
    $.selectElement(one.querySelector(".ww-slide-next")!)
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    editor.postSelectionPath()
    expect(postMessage.mock.calls.at(-1)![0].detail.path).toEqual([
      {path: [], name: "Slides", icon: "KeywordPresentation"},
      {path: [0, 0], name: "Slide 1", icon: "Rectangle"},
    ])
  })

  it("rechecks empty-document Slides requests against the current DOM", () => {
    document.body.firstElementChild!.textContent = "new content"
    expect(editor.features.slides.actions.startSlides({type: "startSlides"})).toBe(false)
    expect(editor.getDocumentLayoutState().mode).toBe("document")
    document.body.firstElementChild!.textContent = ""
    expect(editor.features.slides.actions.startSlides({type: "startSlides"})).toBe(true)
    expect(slides()).toHaveLength(1)
    expect(links()).toHaveLength(1)
  })

  it("groups original nodes, comments, raw text, SVG and widgets without rebuilding them", () => {
    document.body.innerHTML = '<p id="p">Before</p><!--note-->raw text<custom-card data-authored="yes"><section>Widget content</section></custom-card><svg><circle r="5"/></svg><style>p {color:red}</style>'
    const nodes = Array.from(document.body.childNodes), widget = document.querySelector("custom-card")!
    editor.doc.syncFromDOM()
    expect(convert("slides")).toBe(true)
    expect(Array.from(slides()[0].childNodes).slice(0, nodes.length - 1)).toEqual(nodes.slice(0, -1))
    expect(document.body.contains(nodes.at(-1)!)).toBe(true)
    expect(document.querySelector("custom-card")).toBe(widget)
    expect(links()[0].getAttribute("href")).toBe(`#${slides()[0].id}`)
    expect(convert("document")).toBe(true)
    expect(document.querySelector(".ww-slides-viewport, .ww-slide, .ww-slides-navigation, .ww-slide-directions")).toBeNull()
    expect(Array.from(document.body.childNodes).filter(node => nodes.includes(node))).toEqual(nodes)
    expect(convert("slides")).toBe(true)
    expect(slides()).toHaveLength(1); expect(links()).toHaveLength(1)
  })

  it("withholds custom roots, malformed existing carousels, locks and stale requests", () => {
    for(const html of ['<custom-document role="document"><p>x</p></custom-document>', '<div class="ww-slides-viewport"><section>One</section></div>']) {
      document.body.innerHTML = html; expect(convert("slides")).toBe(false); expect(document.body.innerHTML).toBe(html)
    }
    document.body.innerHTML = "<p>x</p>"
    expect(convert("slides")).toBe(true)
    const owner = {}; editor.lockEditing(owner)
    expect(editor.features.slides.actions.addSlide({type: "addSlide"})).toBe(false)
    expect(convert("document")).toBe(false); editor.unlockEditing(owner)
    expect(editor.setDocumentLayout("document", "canvas")).toBe(false)
  })

  it("switches directly between Canvas and Slides in a single undo step, preserving irregular content", async () => {
    document.body.innerHTML = '<p id="intro">Hello</p><!--keep--><custom-card data-authored="yes"><em>Widget</em></custom-card><svg><circle r="5"/></svg><section id="nested"><div>Nested</div></section>'
    await settle()
    expect(convert("canvas")).toBe(true)
    const content = Array.from(document.body.childNodes)
    const originalHTML = editor.toHTML(true)
    expect(editor.getDocumentLayoutState().conversions?.slides).toBeNull()
    expect(convert("slides")).toBe(true)
    expect(content.every(node => slides()[0].contains(node))).toBe(true)
    expect(document.querySelector("custom-card")!.getAttribute("data-authored")).toBe("yes")
    await settle()
    editor.doc.undo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("canvas")
    expect(editor.toHTML(true)).toBe(originalHTML)
    editor.doc.redo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("slides")
    const deckHTML = editor.toHTML(true)
    const deckContent = Array.from(slides()[0].childNodes).filter(node => !(node instanceof Element && node.matches(".ww-slide-directions")))
    expect(editor.getDocumentLayoutState().conversions?.canvas).toBeNull()
    expect(convert("canvas")).toBe(true)
    expect(Array.from(document.body.childNodes)).toEqual(deckContent)
    expect(document.querySelector(".ww-slides-viewport, .ww-slide")).toBeNull()
    expect(document.querySelectorAll("custom-card, svg, #nested")).toHaveLength(3)
    await settle()
    editor.doc.undo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("slides")
    expect(editor.toHTML(true)).toBe(deckHTML)
    editor.doc.redo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("canvas")
    expect(convert("slides")).toBe(true)
    expect(document.querySelector<HTMLElement>(".ww-slides-viewport")!.style.position).not.toBe("absolute")
    expect(document.querySelectorAll("custom-card, svg, #nested")).toHaveLength(3)
  })

  it("removes slide navigation from shared and exported content on exit, with undo and redo", async () => {
    seed()
    const authoredNav = document.createElement("nav")
    authoredNav.innerHTML = '<a href="https://example.com">Authored link</a>'
    slides()[0].append(authoredNav)
    await settle()
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    expect(convert("document")).toBe(true)
    await settle()
    expect(document.querySelector(".ww-slides-navigation, .ww-slide-directions")).toBeNull()
    expect(document.body.contains(authoredNav)).toBe(true)
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(saved.body.querySelector(".ww-slides-viewport, .ww-slide, .ww-slides-navigation, .ww-slide-directions")).toBeNull()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    expect(remote.getXmlElement("body").toString()).not.toContain("ww-slides-navigation")
    expect(remote.getXmlElement("body").toString()).not.toContain("ww-slide-directions")
    expect(remote.getXmlElement("body").toString()).not.toContain("ww-slides-viewport")
    expect(remote.getXmlElement("body").toString()).not.toContain('class="ww-slide"')
    editor.doc.undo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("slides")
    expect(links()).toHaveLength(2)
    editor.doc.redo(); await settle()
    expect(editor.getDocumentLayoutState().mode).toBe("document")
    expect(document.querySelector(".ww-slides-navigation, .ww-slide-directions")).toBeNull()
    remote.destroy()
  })

  it("unwraps multiple slides in order and preserves authored nesting when converting to Canvas", () => {
    const originalSlides = seed()
    const nested = document.createElement("section")
    nested.innerHTML = '<div><p>Nested content</p></div>'
    originalSlides[0].append(nested)
    const content = originalSlides.flatMap(slide => Array.from(slide.childNodes)
      .filter(node => !(node instanceof Element && node.matches(".ww-slide-directions"))))
    expect(convert("canvas")).toBe(true)
    expect(Array.from(document.body.childNodes)).toEqual(content)
    expect(nested.innerHTML).toBe('<div><p>Nested content</p></div>')
    expect(document.querySelector(".ww-slide, .ww-slides-viewport, .ww-slide-directions")).toBeNull()
    expect(links()).toHaveLength(0)
    expect(convert("slides")).toBe(true)
    expect(slides()).toHaveLength(1)
    expect(content.every(node => slides()[0].contains(node))).toBe(true)
    expect(links()).toHaveLength(1)
  })

  describe.each([
    ["document", "canvas"], ["document", "slides"], ["canvas", "document"],
    ["canvas", "slides"], ["slides", "document"], ["slides", "canvas"],
  ] as const)("selection retention from %s to %s", (source, target) => {
    beforeEach(() => {
      document.body.innerHTML = '<p>First</p><section><p id="selected">Before <strong>selected</strong> after</p></section><img alt="Authored image">'
      if(source !== "document") expect(convert(source)).toBe(true)
    })

    it.each(["caret", "forward", "backward"])("preserves a %s text selection in nested content", async kind => {
      const paragraph = document.querySelector("#selected")!
      const start = paragraph.firstChild!, end = paragraph.querySelector("strong")!.firstChild!
      const anchor = kind === "backward" ? end : start, focus = kind === "caret" ? start : kind === "backward" ? start : end
      $.selectRange(anchor, 2, focus, kind === "caret" ? 2 : 5)
      const text = document.getSelection()!.toString()
      expect(convert(target)).toBe(true)
      await settle()
      const selection = document.getSelection()!
      expect(selection.anchorNode).toBe(anchor)
      expect(selection.anchorOffset).toBe(2)
      expect(selection.focusNode).toBe(focus)
      expect(selection.focusOffset).toBe(kind === "caret" ? 2 : 5)
      expect(selection.toString()).toBe(text)
    })

    it("retains a selected authored element", async () => {
      const element = document.querySelector("img")!
      $.selectElement(element)
      editor.features.selection.processSelection()
      expect(convert(target)).toBe(true)
      await settle()
      expect($.selectedElement).toBe(element)
    })

    it("retains an explicit document selection", async () => {
      $.selectElement(document.body)
      expect(convert(target)).toBe(true)
      await settle()
      expect($.selectedElement).toBe(document.body)
    })

    it("retains an explicit authored section selection", async () => {
      const section = document.querySelector("section:not(.ww-slide)")!
      editor.features.selection.selectSectionElement(section)
      expect(convert(target)).toBe(true)
      await settle()
      expect(editor.features.selection.selectedSectionElement).toBe(section)
    })

    it("retains a gap adjacent to moved top-level content", async () => {
      const element = document.body.querySelector("p")!
      $.selectGap(element, "before")
      expect(convert(target)).toBe(true)
      await settle()
      expect($.anchor).toBe(element.parentNode)
      expect($.anchorOffset).toBe(Array.from(element.parentNode!.childNodes).indexOf(element))
    })
  })

  it("restores retained text selections through conversion undo and redo", async () => {
    document.body.innerHTML = '<p>First</p><p id="selected">Second</p>'
    expect(convert("canvas")).toBe(true)
    const text = document.querySelector("#selected")!.firstChild!
    $.selectRange(text, 5, text, 2)
    await settle()
    expect(convert("slides")).toBe(true)
    await settle()
    for(const undo of [true, false]) {
      if(undo) editor.doc.undo()
      else editor.doc.redo()
      await settle()
      expect(editor.getDocumentLayoutState().mode).toBe(undo ? "canvas" : "slides")
      expect(document.getSelection()!.toString()).toBe("con")
      expect($.anchorOffset).toBe(5)
      expect($.focusOffset).toBe(2)
    }
  })

  it("preserves the selected empty paragraph when it survives entering Slides", async () => {
    const paragraph = document.body.querySelector("p")!
    $.move(paragraph)
    expect(convert("slides")).toBe(true)
    await settle()
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    expect(slides()[0].contains(paragraph)).toBe(true)
  })

  it.each([
    ["document", "canvas"], ["document", "slides"], ["canvas", "document"],
    ["canvas", "slides"], ["slides", "document"], ["slides", "canvas"],
  ] as const)("keeps an editable caret when switching an empty %s to %s", async (source, target) => {
    if(source !== "document") expect(convert(source)).toBe(true)
    const previous = document.body.querySelector("h1, p")!
    $.move(previous)
    expect(convert(target)).toBe(true)
    await settle()
    const initial = previous.isConnected ? previous : target === "slides" ? slides()[0].querySelector("h1")! : document.body.querySelector("p")!
    expect(initial).not.toBeNull()
    expect($.anchor).toBe(initial)
    expect($.anchorOffset).toBe(0)
    expect(document.getSelection()!.isCollapsed).toBe(true)
    expect(editor.features.selection.selectedSectionElement).toBeNull()
    expect(initial.classList.contains("◆text-selected")).toBe(false)
    expect(initial.classList.contains("◆empty-selected")).toBe(true)
    expect(initial.classList.contains("◆element-selected")).toBe(false)
    expect(document.body.classList.contains("◆node-selection-active")).toBe(false)
    expect($.isElementSelection).toBe(false)
    expect(initial.childNodes).toHaveLength(0)
    if(target !== "document") expect(editor.features.transformation.target).toBe(initial)
  })

  it("starts clean when switching between empty templates, including an empty Canvas", async () => {
    for(const mode of ["slides", "document", "slides", "canvas", "slides", "document", "canvas", "document", "slides"] as const) {
      expect(convert(mode)).toBe(true)
      await settle()
      if(mode === "slides") {
        expect(slides()).toHaveLength(1)
        expect(Array.from(slides()[0].children, child => child.localName)).toEqual(["h1", "p", "nav"])
        expect(slides()[0].querySelector("h1")!.textContent).toBe("")
      }
      else {
        expect(Array.from(document.body.children, child => child.localName)).toEqual(["p"])
        expect(document.body.textContent).toBe("")
        expect(document.querySelector(".ww-slides-viewport, .ww-slide, nav")).toBeNull()
      }
    }
    expect(convert("canvas")).toBe(true)
    document.body.replaceChildren()
    expect(convert("slides")).toBe(true)
    expect(Array.from(slides()[0].children, child => child.localName)).toEqual(["h1", "p", "nav"])
    editor.features.slides.actions.addSlide({type: "addSlide"})
    expect(convert("document")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p></p>")
  })

  it("resets empty slide text blocks with selection markers on native line breaks", () => {
    expect(convert("slides")).toBe(true)
    for(const item of slides()[0].querySelectorAll("h1, p")) {
      item.innerHTML = '<br class="◆ ◆empty-selected">'
    }
    expect(convert("document")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it.each(['<custom-card></custom-card>', '<img alt="">', '<svg><circle r="5"/></svg>', '<!--keep-->', '<section><div></div></section>', '<p id="anchor"></p>', '<p><br class="authored"></p>', '<p style="border: 1px solid red"></p>'])("preserves textless authored content on exit: %s", async html => {
    expect(convert("slides")).toBe(true)
    const template = document.createElement("template")
    template.innerHTML = html
    const node = template.content.firstChild!
    slides()[0].append(node)
    await settle()
    expect(convert("document")).toBe(true)
    expect(node.parentNode).toBe(document.body)
    expect(document.querySelector(".ww-slides-viewport, .ww-slide")).toBeNull()
  })

  it("rechecks current slide content before conversion and rejects unsupported Canvas content without a partial switch", () => {
    expect(convert("slides")).toBe(true)
    const viewport = document.querySelector(".ww-slides-viewport")!
    const comment = document.createComment("between slides")
    viewport.prepend(comment)
    const text = document.createTextNode("Added externally")
    slides()[0].append(text)
    const before = editor.toHTML(true)
    expect(editor.getDocumentLayoutState().conversions?.canvas).not.toBeNull()
    expect(convert("canvas")).toBe(false)
    expect(editor.getDocumentLayoutState().mode).toBe("slides")
    expect(editor.toHTML(true)).toBe(before)
    expect(convert("document")).toBe(true)
    expect(text.parentNode).toBe(document.body)
    expect(document.body.firstChild).toBe(comment)
  })

  it("updates authored links with local add, move and delete, with undo/redo", async () => {
    const [one, two] = seed()
    editor.doc.syncFromDOM()
    expect(editor.features.slides.actions.moveSlide({type: "moveSlide", direction: "later"})).toBe(true)
    expect(slides()).toEqual([two, one])
    expect(links().map(link => link.hash)).toEqual([`#${two.id}`, `#${one.id}`])
    editor.doc.undo(); await settle()
    expect(slides().map(slide => slide.id)).toEqual([one.id, two.id])
    expect(links().map(link => link.hash)).toEqual([`#${one.id}`, `#${two.id}`])
    editor.doc.redo(); await settle()
    expect(slides().map(slide => slide.id)).toEqual([two.id, one.id])
    $.move(slides()[0].firstElementChild!)
    expect(editor.features.slides.actions.removeSlide({type: "removeSlide"})).toBe(true)
    expect(slides()).toHaveLength(1); expect(links()).toHaveLength(1)
    expect(links()[0].hash).toBe(`#${slides()[0].id}`)
  })

  it("rejects a stale delete button when the selected node was replaced", async () => {
    const [one] = seed(); await settle()
    const remove = button("remove")
    one.replaceWith(one.cloneNode(true)); remove.click()
    expect(slides()).toHaveLength(2)
  })

  it("preserves boundaries for Enter, edge deletion and cross-slide edits", async () => {
    const [one, two] = seed(), text = one.querySelector("p")!.firstChild!
    $.move(text, 2); editor.features.manipulation.insert(undefined, 5)
    expect(slides()).toEqual([one, two]); expect(one.querySelectorAll("p")).toHaveLength(2)
    $.move(two.firstElementChild!.firstChild!, 0); editor.features.manipulation.delete("backward")
    expect(slides()).toEqual([one, two])
    $.move(one, 1)
    const data = new DataTransfer(); data.setData("text/html", "<p>Pasted</p>")
    one.dispatchEvent(new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData: data}))
    expect(slides()).toEqual([one, two]); expect(one.textContent).toContain("Pasted")
    // Positioned text boxes normally clamp selections to their own flow.
    // Exercise the command guards with an unprocessed cross-slide range.
    editor.features.selection.disable()
    document.getSelection()!.setBaseAndExtent(one.querySelector("h1")!.firstChild!, 1, two.firstElementChild!.firstChild!, 2)
    const before = document.body.innerHTML
    editor.features.manipulation.delete(); editor.features.manipulation.insert(document.createTextNode("replacement"))
    expect(await editor.features.manipulation.cut()).toBe(false)
    const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "x"})
    two.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(document.body.innerHTML).toBe(before)
  })

  it("exports identical CSS and authored navigation with no reader runtime", async () => {
    seed()
    const root = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(root.querySelector("nav.ww-slides-navigation")?.innerHTML).toBe(cloneWithoutEditorMarkers(document.querySelector("nav.ww-slides-navigation")!, true).innerHTML)
    expect(root.querySelector("nav.ww-slides-navigation")?.className).toBe("ww-slides-navigation")
    expect(root.querySelectorAll("script")).toHaveLength(0)
    expect(root.head.textContent).toContain(slidesStyles)
    expect(root.body.innerHTML).not.toContain("slide-navigation-actions")
    expect(root.body.innerHTML).not.toContain("◆slide-navigation-editing")
    for(const link of root.querySelectorAll<HTMLAnchorElement>("nav a[href]")) expect(root.getElementById(decodeURIComponent(link.hash.slice(1)))).not.toBeNull()
    editor.features.slides.disable()
    expect(editor.appendix.querySelector("[part=slide-navigation-actions]")).toBeNull()
    expect(links()).toHaveLength(2)
  })

  it("enhances navigation with appendix-only add and remove affordances and cleans up", async () => {
    seed(); await settle()
    const nav = document.querySelector("nav.ww-slides-navigation")!
    const actions = editor.appendix.querySelector("[part=slide-navigation-actions]")!
    expect(editor.appendix.querySelector("[part=slide-editing-controls]")).toBeNull()
    expect(Array.from(actions.querySelectorAll("button"), button => button.getAttribute("aria-label"))).toEqual(["Add slide", "Remove slide 1", "Remove slide 2"])
    expect(document.body.querySelector("[part=slide-navigation-actions]")).toBeNull()
    expect(nav.classList.contains("◆slide-navigation-editing")).toBe(true)
    button("add").click(); expect(slides()).toHaveLength(3)
    button("remove").click(); expect(slides()).toHaveLength(2)
    expect(convert("document")).toBe(true)
    expect(nav.classList.contains("◆slide-navigation-editing")).toBe(false)
    expect((actions as HTMLElement).hidden).toBe(true)
    expect(convert("slides")).toBe(true)
    editor.features.slides.disable()
    expect(nav.classList.contains("◆slide-navigation-editing")).toBe(false)
    expect(editor.appendix.querySelector("[part=slide-navigation-actions]")).toBeNull()
  })

  it("removes the bubble's slide and keeps neighboring previous/next links correct", async () => {
    const [one, two] = seed(); $.move(two.firstElementChild!)
    await settle()
    expect(one.querySelector(".ww-slide-previous")?.hasAttribute("href")).toBe(false)
    expect(one.querySelector(".ww-slide-next")?.getAttribute("href")).toBe(`#${two.id}`)
    expect(two.querySelector(".ww-slide-previous")?.getAttribute("href")).toBe(`#${one.id}`)
    expect(two.querySelector(".ww-slide-next")?.getAttribute("aria-disabled")).toBe("true")
    const removeFirst = editor.appendix.querySelector<HTMLButtonElement>('[aria-label="Remove slide 1"]')!
    expect(removeFirst.textContent).toBe("×")
    removeFirst.click()
    expect(slides()).toEqual([two])
    expect(two.querySelector(".ww-slide-previous")?.hasAttribute("href")).toBe(false)
    expect(document.getSelection()?.anchorNode).toBe(two.firstElementChild)
    expect(links()).toHaveLength(1)
  })

  it("synchronizes authored navigation and preserves external changes without repair", async () => {
    seed(); editor.doc.syncFromDOM()
    const remote = new Y.Doc(); Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    expect(remote.getXmlElement("body").toString()).toContain("ww-slides-navigation")
    const viewport = document.querySelector(".ww-slides-viewport")!
    viewport.append(document.createComment("external change")); slides()[0].id = "externally-changed"
    const html = editor.toHTML(true); await settle()
    expect(editor.toHTML(true)).toBe(html)
    expect(links()[0].hash).not.toBe("#externally-changed")
    remote.destroy()
  })
})
