// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {$, cloneWithoutEditorMarkers} from "../utility"
import {layoutPresets} from "../layouts"
import {selectionChangeEvent, isSelectionChangeMessage, type SelectionChangeDetail} from "../editor-bridge"

let editor: DOMEditor
beforeEach(() => {
  document.body.innerHTML = ""
  editor = new DOMEditor()
  $.selectDocumentStart()
})
afterEach(() => { editor.destroy(); vi.restoreAllMocks() })

function grid(html = '<div>A</div><!--keep--><div>B</div><div>C</div><div>D</div>') {
  document.body.innerHTML = `<section style="display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);grid-template-rows:auto auto;gap:16px">${html}</section>`
  const section = document.querySelector("section")!
  $.selectElement(section)
  editor.features.selection.selectSectionElement(section)
  return section
}

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

describe("layout insertion", () => {
  it.each(layoutPresets)("inserts $name as authored HTML and selects the wrapper", preset => {
    const changes: SelectionChangeDetail[] = []
    const listen = (event: Event) => changes.push((event as CustomEvent<SelectionChangeDetail>).detail)
    window.addEventListener(selectionChangeEvent, listen)
    try {
      expect(editor.features.layout.actions.insertLayout({type: "insertLayout", preset: preset.id})).toBe(true)
      const section = document.querySelector("section")!
      expect(section.style.display).toBe(preset.kind)
      expect(section.children).toHaveLength(preset.items)
      expect(Array.from(section.children).every(child => child.localName === "p" && !child.children.length)).toBe(true)
      expect(section.querySelector("div")).toBeNull()
      expect((section.firstElementChild as HTMLElement).style.minInlineSize).toBe("0")
      expect(editor.features.selection.selectedSectionElement).toBe(section)
      expect(changes.some(detail => detail.inserted && detail.layout?.kind === preset.kind)).toBe(true)
      expect(Array.from(section.attributes).some(attr => attr.name.startsWith("data-"))).toBe(false)
      expect(section.textContent).toBe("")
    }
    finally { window.removeEventListener(selectionChangeEvent, listen) }
  })

  it("wraps complete live blocks and comments without cloning their content", () => {
    document.body.innerHTML = '<p lang="de">A</p><!--keep--><p><custom-content data-authored="yes">B</custom-content></p>'
    const nodes = Array.from(document.body.childNodes)
    document.getSelection()!.setBaseAndExtent(document.body, 0, document.body, nodes.length)
    expect(document.getSelection()!.isCollapsed).toBe(false)
    expect(editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})).toBe(true)
    expect(Array.from(document.querySelector("section")!.childNodes)).toEqual(nodes)
    expect(document.querySelector("custom-content")!.getAttribute("data-authored")).toBe("yes")
    expect((nodes[0] as HTMLElement).style.gridColumn).toBe("1 / 2")
    expect((nodes[2] as HTMLElement).style.gridColumn).toBe("2 / 3")
  })

  it("does not replace a partial text selection", () => {
    document.body.innerHTML = "<p>Hello world</p>"
    const text = document.querySelector("p")!.firstChild!
    getSelection()!.setBaseAndExtent(text, 2, text, 7)
    expect(() => editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})).toThrow(/complete/)
    expect(document.querySelector("p")!.textContent).toBe("Hello world")
    expect(document.querySelector("section")).toBeNull()
  })

  it("undoes and redoes insertion as one command", () => {
    editor.doc.syncFromDOM()
    editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "four-panels"})
    expect(document.querySelectorAll("section > p")).toHaveLength(4)
    editor.doc.undo()
    expect(document.querySelector("section")).toBeNull()
    editor.doc.redo()
    expect(document.querySelectorAll("section > p")).toHaveLength(4)
  })

  it("styles existing flex content directly and retains author-created divs", () => {
    document.body.innerHTML = '<div lang="de" style="color:red"><p>A</p></div><!--keep--><p>B</p>'
    const nodes = Array.from(document.body.childNodes)
    getSelection()!.setBaseAndExtent(document.body, 0, document.body, nodes.length)
    editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "horizontal-row"})
    const section = document.querySelector("section")!
    expect(Array.from(section.childNodes)).toEqual(nodes)
    expect((nodes[0] as HTMLElement).style.flex).toBe("1 1 0px")
    expect((nodes[2] as HTMLElement).style.flex).toBe("1 1 0px")
    expect((nodes[0] as HTMLElement).style.color).toBe("red")
    expect(section.querySelectorAll("div")).toHaveLength(1)
  })

  it("creates enough explicit rows when wrapping more blocks than the preset", () => {
    document.body.innerHTML = '<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p>'
    getSelection()!.setBaseAndExtent(document.body, 0, document.body, 5)
    editor.features.layout.actions.insertLayout({type: "insertLayout", preset: "two-columns"})
    const section = document.querySelector("section")!
    expect(section.style.gridTemplateRows).toBe("auto auto auto")
    expect((section.lastElementChild as HTMLElement).style.gridRow).toBe("3 / 4")
    expect(editor.features.layout.getState()!.rows.reason).toBeNull()
  })
})

describe("editing direct layout content", () => {
  function preset(id = "four-panels") {
    editor.features.layout.actions.insertLayout({type: "insertLayout", preset: id})
    const section = document.querySelector("section")!
    editor.features.selection.clearSelectedSection()
    const first = section.firstElementChild as HTMLElement
    first.textContent = "Hello world"
    $.move(first.firstChild!, 5)
    return {section, first}
  }

  it("splits in the same grid column without overlapping the next panel", () => {
    const {section, first} = preset()
    const neighbor = section.children[1] as HTMLElement, lower = section.children[2] as HTMLElement
    editor.features.manipulation.insert()
    const continuation = first.nextElementSibling as HTMLElement
    expect(first.textContent).toBe("Hello")
    expect(continuation.textContent).toBe(" world")
    expect(section.style.gridTemplateRows).toBe("auto auto auto")
    expect(continuation.style.gridColumnStart).toBe("1")
    expect(continuation.style.gridRowStart).toBe("2")
    expect(neighbor.style.gridRowStart).toBe("1")
    expect(neighbor.style.gridRowEnd).toBe("3")
    expect(lower.style.gridRowStart).toBe("3")
    expect(section.querySelector("div")).toBeNull()
  })

  it("preserves layout and inline formatting when headings continue as paragraphs", () => {
    const section = grid('<h2 style="grid-row:1 / 2;grid-column:2 / 3;min-inline-size:0"><em>Hello world</em></h2>')
    editor.features.selection.clearSelectedSection()
    $.move(section.querySelector("em")!.firstChild!, 5)
    editor.features.manipulation.insert()
    const continuation = section.lastElementChild as HTMLElement
    expect(continuation.localName).toBe("p")
    expect(continuation.querySelector("em")?.textContent).toBe(" world")
    expect(continuation.style.gridColumnStart).toBe("2")
    expect(continuation.style.gridRowStart).toBe("2")
    expect(continuation.style.minInlineSize).toBe("0")
  })

  it("transfers item placement when an empty paragraph becomes another block", () => {
    const {section, first} = preset()
    first.textContent = ""
    $.move(first, 0)
    const replacement = document.createElement("hr")
    replacement.style.color = "red"
    editor.features.manipulation.insert(replacement)
    expect(section.firstElementChild).toBe(replacement)
    expect(replacement.style.gridColumnStart).toBe("1")
    expect(replacement.style.gridRowStart).toBe("1")
    expect(replacement.style.minInlineSize).toBe("0")
    expect(replacement.style.color).toBe("red")
    expect(section.style.gridTemplateRows).toBe("auto auto")
  })

  it("places pasted blocks and both retained text halves in the same column", () => {
    const {section} = preset("two-columns")
    editor.features.manipulation.insertHTML('<h2>Pasted</h2><p>More</p>')
    const blocks = Array.from(section.children) as HTMLElement[]
    expect(blocks.map(block => block.textContent)).toEqual(["Hello", "Pasted", "More", " world", ""])
    expect(blocks.slice(0, 4).map(block => block.style.gridColumnStart)).toEqual(["1", "1", "1", "1"])
    expect(blocks.slice(0, 4).map(block => block.style.gridRowStart)).toEqual(["1", "2", "3", "4"])
    expect(blocks[4].style.gridRowEnd).toBe("5")
    expect(section.style.gridTemplateRows).toBe("auto auto auto auto")
  })

  it("inherits flex sizing when a heading splits and when an empty block is replaced", () => {
    const section = grid('<h2 style="flex:2 1 14rem;min-inline-size:0">Hello world</h2>')
    section.style.display = "flex"
    editor.features.selection.clearSelectedSection()
    $.move(section.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.insert()
    const continuation = section.lastElementChild as HTMLElement
    expect(continuation.localName).toBe("p")
    expect(continuation.style.flexGrow).toBe("2")
    expect(continuation.style.flexBasis).toBe("14rem")
    continuation.textContent = ""
    $.move(continuation, 0)
    const rule = document.createElement("hr")
    editor.features.manipulation.insert(rule)
    expect(rule.style.flexGrow).toBe("2")
    expect(rule.style.flexBasis).toBe("14rem")
    expect(section.querySelector("div")).toBeNull()
  })

  it("undoes and redoes the split and placement changes together", () => {
    const {section} = preset()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const html = () => (cloneWithoutEditorMarkers(document.querySelector("section")!, true) as HTMLElement).outerHTML
    const before = html()
    editor.features.manipulation.insert()
    editor.doc.syncFromDOM()
    const after = html()
    expect(after).not.toBe(before)
    editor.doc.undo()
    expect(html()).toBe(before)
    editor.doc.redo()
    expect(html()).toBe(after)
  })

  it("does not normalize author-created regions or independent DOM mutations", async () => {
    const section = grid('<div style="grid-row:1 / 2;grid-column:1 / 2"><p>Hello world</p></div>')
    editor.features.selection.clearSelectedSection()
    $.move(section.querySelector("p")!.firstChild!, 5)
    editor.features.manipulation.insert()
    expect(section.children).toHaveLength(1)
    expect(section.querySelectorAll("div > p")).toHaveLength(2)
    expect(section.style.gridTemplateRows).toBe("auto auto")
    const external = document.createElement("p")
    external.textContent = "External"
    external.style.gridArea = "custom-area"
    section.append(external)
    const styles = external.getAttribute("style")
    await frame()
    editor.doc.syncFromDOM()
    expect(external.getAttribute("style")).toBe(styles)
  })

  it("does not style replacement DOM after the layout disconnects during an edit", () => {
    const {section} = preset()
    const replacement = document.createElement("section")
    replacement.innerHTML = "<p>Other content</p>"
    editor.features.layout.preserveItemLayout(() => section.replaceWith(replacement))
    expect(replacement.outerHTML).toBe("<section><p>Other content</p></section>")
  })

  it("preserves priorities and row order through repeated splits", () => {
    const {section, first} = preset("two-columns")
    first.style.setProperty("grid-column", "1 / 2", "important")
    first.style.setProperty("grid-row", "1 / 2", "important")
    section.style.setProperty("grid-template-rows", "auto", "important")
    editor.features.manipulation.insert()
    $.move(first.firstChild!, 2)
    editor.features.manipulation.insert()
    const blocks = Array.from(section.children) as HTMLElement[]
    expect(blocks.map(block => block.textContent)).toEqual(["He", "llo", " world", ""])
    expect(blocks.slice(0, 3).map(block => block.style.gridRowStart)).toEqual(["1", "2", "3"])
    expect(blocks[1].style.getPropertyPriority("grid-column-start")).toBe("important")
    expect(blocks[1].style.getPropertyPriority("grid-row-start")).toBe("important")
    expect(section.style.getPropertyPriority("grid-template-rows")).toBe("important")
  })

  it("lets continuations auto-flow when named grid placements prevent track adaptation", () => {
    const section = grid('<p style="grid-column:sidebar;grid-row:1 / 2">Hello world</p>')
    editor.features.selection.clearSelectedSection()
    $.move(section.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.insert()
    const continuation = section.lastElementChild as HTMLElement
    expect(continuation.style.gridColumn).toBe("sidebar")
    expect(continuation.style.gridRowStart).toBe("auto")
    expect(continuation.style.gridRowEnd).toBe("auto")
    expect(section.style.gridTemplateRows).toBe("auto auto")
  })

  it("respects a sibling placement changed during a command", () => {
    const {section, first} = preset("two-columns")
    const other = section.lastElementChild as HTMLElement
    const inserted = document.createElement("p")
    editor.features.layout.preserveItemLayout(() => {
      first.after(inserted)
      other.style.gridColumn = "1 / 3"
    })
    expect(other.style.gridColumn).toBe("1 / 3")
    expect(inserted.hasAttribute("style")).toBe(false)
    expect(section.style.gridTemplateRows).toBe("auto")
  })
})

describe("live layout commands", () => {
  it("removes a column without removing or moving content nodes", () => {
    const section = grid()
    const nodes = Array.from(section.childNodes)
    expect(editor.features.layout.actions.removeLayoutTrack({type: "removeLayoutTrack", axis: "column", index: 0})).toBe(true)
    expect(section.style.gridTemplateColumns).toBe("minmax(0, 1fr)")
    expect(Array.from(section.childNodes)).toEqual(nodes)
    expect(section.textContent).toBe("ABCD")
    expect(section.style.gridTemplateRows).toBe("auto auto")
  })

  it("remaps numeric placements, shrinks spans, and auto-places removed content", () => {
    const section = grid('<div style="grid-column:1 / 2;grid-row:2">A</div><div style="grid-column:2 / 3">B</div><div style="grid-column:1 / 3">C</div>')
    editor.features.layout.actions.removeLayoutTrack({type: "removeLayoutTrack", axis: "column", index: 0})
    const children = Array.from(section.children) as HTMLElement[]
    expect(children[0].style.gridColumnStart).toBe("auto")
    expect(children[0].style.gridColumnEnd).toBe("auto")
    expect(children[0].style.gridRow).toBe("2")
    expect(children[1].style.gridColumnStart).toBe("1")
    expect(children[1].style.gridColumnEnd).toBe("2")
    expect(children[2].style.gridColumnStart).toBe("1")
    expect(children[2].style.gridColumnEnd).toBe("2")
    expect(section.textContent).toBe("ABC")
  })

  it("inserts at the boundary while preserving the preceding item's end line", () => {
    const section = grid('<div style="grid-column:1 / 2">A</div><div style="grid-column:2 / 3">B</div>')
    editor.features.layout.actions.insertLayoutTrack({type: "insertLayoutTrack", axis: "column", index: 1})
    expect((section.children[0] as HTMLElement).style.gridColumn).toBe("1 / 2")
    expect((section.children[1] as HTMLElement).style.gridColumnStart).toBe("3")
    expect((section.children[1] as HTMLElement).style.gridColumnEnd).toBe("4")
    expect(editor.features.layout.getState()!.columns.tracks).toHaveLength(3)
  })

  it("withholds structural edits on named placement and keeps complex CSS intact", () => {
    const section = grid('<div style="grid-column:sidebar">A</div>')
    const before = section.innerHTML
    expect(editor.features.layout.getState()!.columns.reason).toMatch(/complex/)
    expect(editor.features.layout.actions.removeLayoutTrack({type: "removeLayoutTrack", axis: "column", index: 0})).toBe(false)
    expect(section.innerHTML).toBe(before)
    section.style.gridTemplateColumns = "repeat(auto-fit, minmax(12rem, 1fr))"
    expect(editor.features.layout.getState()!.columns.tracks).toBeNull()
    expect(section.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(12rem, 1fr))")
  })

  it("styles only the selected wrapper without normalizing unfamiliar content", () => {
    const section = grid('<strange-layout foo="bar"><!--comment--><p>A</p></strange-layout>')
    const nodes = Array.from(section.childNodes)
    const content = section.innerHTML
    editor.features.layout.actions.setLayoutStyles({type: "setLayoutStyles", styles: {"column-gap": "2rem", display: "flex"}})
    expect(section.innerHTML).toBe(content)
    expect(Array.from(section.childNodes)).toEqual(nodes)
    expect(section.style.gridTemplateColumns).toContain("1fr")
    expect(editor.features.layout.getState()?.kind).toBe("flex")
  })

  it("does not target BODY or a replacement after selection removal", () => {
    const section = grid()
    const replacement = document.createElement("section")
    replacement.style.display = "grid"
    section.replaceWith(replacement)
    expect(editor.features.layout.actions.setLayoutStyles({type: "setLayoutStyles", styles: {gap: "99px"}})).toBe(false)
    expect(replacement.style.gap).toBe("")
    expect(document.body.style.gap).toBe("")
  })

  it("targets an explicitly selected direct item without looking inside a widget", () => {
    const section = grid('<custom-layout>Authored</custom-layout>')
    const widget = section.firstElementChild as HTMLElement
    widget.attachShadow({mode: "open"}).innerHTML = '<div style="display:grid">Private</div>'
    editor.features.selection.clearSelectedSection()
    $.selectElement(widget)
    expect(editor.features.layout.getState()?.item).toBe(true)
    editor.features.layout.actions.setLayoutStyles({type: "setLayoutStyles", target: "item", styles: {"flex-grow": "2"}})
    expect(widget.style.flexGrow).toBe("2")
    expect(widget.shadowRoot!.querySelector("div")!.style.flexGrow).toBe("")
    expect(section.style.flexGrow).toBe("")
  })

  it("validates serialized layout state and rejects malformed capability payloads", () => {
    grid()
    const detail = {path: [], layout: editor.features.layout.getState()}
    expect(isSelectionChangeMessage({type: selectionChangeEvent, detail})).toBe(true)
    expect(isSelectionChangeMessage({type: selectionChangeEvent, detail: {...detail, layout: {...detail.layout, columns: {tracks: [42], automatic: -1, reason: null}}}})).toBe(false)
  })

  it("cleans appendix controls and markers on deselection and disable", async () => {
    const section = grid()
    await frame()
    expect(section.classList.contains("◆layout-selected")).toBe(true)
    expect(editor.appendix.querySelector(".◆layout-overlay")).not.toBeNull()
    expect(section.querySelector("button")).toBeNull()
    editor.features.selection.clearSelectedSection()
    $.move(section.querySelector("div")!.firstChild!, 0)
    editor.features.selection.processSelection()
    await frame()
    expect(section.classList.contains("◆layout-selected")).toBe(false)
    editor.features.layout.disable()
    expect(editor.appendix.querySelector(".◆layout-overlay")).toBeNull()
  })
})
