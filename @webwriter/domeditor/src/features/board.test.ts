// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {$} from "../utility"
import {boardStyles, documentLayoutMode, type DocumentLayoutMode} from "../document-layout"

let editor: DOMEditor
const head = document.head.cloneNode(true)
const settle = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
const convert = (mode: DocumentLayoutMode) => editor.setDocumentLayout(mode, editor.getDocumentLayoutState().mode)
const board = () => editor.features.board
const columns = () => board().columns()
const cards = () => columns().flatMap(column => board().cards(column))
const grip = (label: string) => editor.appendix.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
const dragEvent = (type: string, dataTransfer: DataTransfer, x = 60, y = 60) => {
  const event = new MouseEvent(type, {bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y})
  Object.defineProperty(event, "dataTransfer", {value: dataTransfer})
  return event
}
const geometry = () => columns().forEach((column, i) => {
  vi.spyOn(column, "getBoundingClientRect").mockReturnValue(new DOMRect(i * 340, 20, 320, 500))
  const heading = column.querySelector("h2")
  if(heading) vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(i * 340 + 16, 36, 280, 24))
  board().cards(column).forEach((card, j) => vi.spyOn(card, "getBoundingClientRect").mockReturnValue(new DOMRect(i * 340 + 16, 90 + j * 120, 288, 100)))
})
beforeEach(() => { vi.spyOn(DataTransfer.prototype, "setDragImage").mockImplementation(() => {}); document.body.replaceChildren(); document.body.removeAttribute("class"); editor = new DOMEditor() })
afterEach(() => {
  editor.destroy(); document.head.replaceChildren(...Array.from(head.childNodes, node => node.cloneNode(true)))
  document.body.replaceChildren(); document.body.removeAttribute("class"); vi.restoreAllMocks()
})

describe("Board layout", () => {
  it("drags cards vertically and between columns, including an empty column", async () => {
    convert("board"); const one = cards()[0]
    board().addCard(columns()[0]); const two = cards()[1]
    board().addColumn(); await settle(); geometry()
    const data = new DataTransfer(), handle = grip("Drag card 1 in column 1")
    expect(handle.draggable).toBe(true); expect(one.hasAttribute("draggable")).toBe(false)
    handle.dispatchEvent(dragEvent("dragstart", data))
    expect(data.effectAllowed).toBe("move")
    const over = dragEvent("dragover", data, 80, 330); two.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true); expect(data.dropEffect).toBe("move")
    expect(editor.appendix.querySelector<HTMLElement>("[part=board-drop-indicator]")!.hidden).toBe(false)
    columns()[0].dispatchEvent(dragEvent("drop", data, 80, 330)); await settle()
    expect(board().cards(columns()[0])).toEqual([two, one])
    const next = new DataTransfer()
    grip("Drag card 2 in column 1").dispatchEvent(dragEvent("dragstart", next))
    columns()[1].dispatchEvent(dragEvent("drop", next, 400, 130)); await settle()
    expect(board().cards(columns()[0])).toEqual([two]); expect(board().cards(columns()[1])).toEqual([one])
    expect(document.body.innerHTML).not.toContain("◆board-dragging")
    expect(editor.appendix.querySelector<HTMLElement>("[part=board-drop-indicator]")!.hidden).toBe(true)
  })

  it("drags columns horizontally while keeping nested cards and unfamiliar content intact", async () => {
    convert("board"); const one = columns()[0], card = cards()[0]
    card.append(document.createComment("keep"), document.createElement("custom-card"))
    board().addColumn(); board().addColumn(); await settle(); geometry()
    const [_, two, three] = columns(), children = Array.from(card.childNodes), data = new DataTransfer()
    grip("Drag column 1").dispatchEvent(dragEvent("dragstart", data))
    three.dispatchEvent(dragEvent("drop", data, 1020, 100)); await settle()
    expect(columns()).toEqual([two, three, one])
    expect(board().cards(one)).toEqual([card]); expect(Array.from(card.childNodes)).toEqual(children)
    const next = new DataTransfer()
    grip("Drag column 3").dispatchEvent(dragEvent("dragstart", next))
    two.dispatchEvent(dragEvent("drop", next, 0, 100)); await settle()
    expect(columns()).toEqual([one, two, three])
  })

  it("keeps a card drag in one undo step and restores its text selection", async () => {
    convert("board"); const card = cards()[0], text = document.createTextNode("Selected")
    card.querySelector("p")!.append(text)
    board().addColumn(); await settle(); geometry(); $.move(text, 3)
    const data = new DataTransfer()
    grip("Drag card 1 in column 1").dispatchEvent(dragEvent("dragstart", data))
    columns()[1].dispatchEvent(dragEvent("drop", data, 400, 100)); await settle()
    expect($.anchor).toBe(text); expect($.anchorOffset).toBe(3)
    expect(board().cards(columns()[1])).toEqual([card])
    editor.doc.undo(); await settle(); expect(board().cards(columns()[0])).toHaveLength(1); expect(board().cards(columns()[1])).toHaveLength(0)
    editor.doc.redo(); await settle(); expect(board().cards(columns()[0])).toHaveLength(0); expect(board().cards(columns()[1])).toHaveLength(1)
  })

  it("rejects spoofed transfers, replaced sources, invalid destinations, and editing locks", async () => {
    convert("board"); board().addColumn(); await settle(); geometry()
    const source = cards()[0], destination = columns()[1]
    for(const invalid of ["token", "outside", "replaced", "locked"] as const) {
      const card = cards()[0], data = new DataTransfer()
      grip("Drag card 1 in column 1").dispatchEvent(dragEvent("dragstart", data))
      if(invalid === "token") data.setData("application/x-webwriter-board", "spoofed")
      if(invalid === "replaced") card.replaceWith(card.cloneNode(true))
      const owner = {}; if(invalid === "locked") editor.lockEditing(owner)
      destination.dispatchEvent(dragEvent("drop", data, invalid === "outside" ? -200 : 400, 100))
      editor.unlockEditing(owner); await settle()
      expect(board().cards(destination)).toHaveLength(0)
      expect(card.classList.contains("◆board-dragging")).toBe(false)
      expect(source.classList.contains("◆board-dragging")).toBe(false)
    }
    const data = new DataTransfer(); data.setData("application/x-webwriter-board", "foreign")
    destination.dispatchEvent(dragEvent("drop", data, 400, 100))
    expect(board().cards(destination)).toHaveLength(0)
  })

  it("excludes drag artifacts from shared/exported HTML and cleans up cancellation and destruction", async () => {
    convert("board"); await settle(); geometry()
    const source = cards()[0], data = new DataTransfer(), handle = grip("Drag card 1 in column 1")
    handle.dispatchEvent(dragEvent("dragstart", data)); expect(source.classList.contains("◆board-dragging")).toBe(true)
    editor.doc.syncFromDOM()
    expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆board-dragging")
    const saved = await editor.serializeHTML(true)
    expect(saved).not.toContain("board-drop-indicator"); expect(saved).not.toContain("◆board-dragging")
    handle.dispatchEvent(dragEvent("dragend", data)); expect(source.classList.contains("◆board-dragging")).toBe(false)
    handle.dispatchEvent(dragEvent("dragstart", data)); editor.features.board.disable()
    expect(source.classList.contains("◆board-dragging")).toBe(false)
    expect(editor.appendix.querySelector("[part=board-drop-indicator], [part=board-actions]")).toBeNull()
  })

  it("retains the handle across pointer selection changes and native drag pointer cancellation", async () => {
    convert("board"); board().addColumn(); await settle(); geometry()
    const handle = grip("Drag card 1 in column 1"), source = cards()[0]
    handle.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true, composed: true}))
    $.move(source.querySelector("p")!); await settle()
    expect(handle.isConnected).toBe(true)
    const data = new DataTransfer(); handle.dispatchEvent(dragEvent("dragstart", data))
    handle.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, composed: true})); await settle()
    expect(handle.isConnected).toBe(true); expect(source.classList.contains("◆board-dragging")).toBe(true)
    columns()[1].dispatchEvent(dragEvent("drop", data, 400, 100)); await settle()
    expect(board().cards(columns()[1])).toEqual([source])
  })

  it("cleans up a failed drag image and a layout change during dragging", async () => {
    convert("board"); await settle(); geometry()
    const source = cards()[0], data = new DataTransfer()
    vi.spyOn(data, "setDragImage").mockImplementation(() => { throw new Error("Unavailable") })
    const start = dragEvent("dragstart", data)
    grip("Drag card 1 in column 1").dispatchEvent(start)
    expect(start.defaultPrevented).toBe(true); expect(source.classList.contains("◆board-dragging")).toBe(false)
    grip("Drag card 1 in column 1").dispatchEvent(dragEvent("dragstart", new DataTransfer()))
    convert("document")
    expect(source.classList.contains("◆board-dragging")).toBe(false)
    expect(document.body.innerHTML).not.toContain("◆board-dragging")
    expect(editor.appendix.querySelector<HTMLElement>("[part=board-drop-indicator]")!.hidden).toBe(true)
  })

  it("uses equal-width horizontal columns and vertical cards, with an editable heading", () => {
    expect(convert("board")).toBe(true)
    expect(editor.getDocumentLayoutState().mode).toBe("board")
    board().addColumn(); board().addColumn()
    columns().forEach(column => { board().addCard(column); board().addCard(column) })
    expect(columns()).toHaveLength(3)
    expect(getComputedStyle(document.body).display).toBe("flex")
    expect(getComputedStyle(document.body).flexWrap).toBe("nowrap")
    expect(new Set(columns().map(column => getComputedStyle(column).width)).size).toBe(1)
    for(const column of columns()) {
      expect(getComputedStyle(column).flexDirection).toBe("column")
      expect(column.firstElementChild?.localName).toBe("h2")
      expect(board().cards(column).length).toBeGreaterThanOrEqual(2)
    }
  })

  it("preserves irregular nesting, comments, custom elements, attributes, SVG, and selection on conversion", () => {
    document.body.innerHTML = '<p id="intro">Hello</p><!--keep--><custom-board-widget data-authored="yes"><em>Private</em></custom-board-widget><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg><section id="nested"><div>Nested</div></section>'
    const content = Array.from(document.body.childNodes), text = content[0].firstChild!
    $.move(text, 2)
    expect(convert("board")).toBe(true)
    expect(content.every(node => cards()[0].contains(node))).toBe(true)
    expect($.anchor).toBe(text); expect($.anchorOffset).toBe(2)
    expect(document.querySelector("custom-board-widget")!.getAttribute("data-authored")).toBe("yes")
    expect(convert("document")).toBe(true)
    expect(Array.from(document.body.childNodes)).toEqual(content)
    expect($.anchor).toBe(text); expect($.anchorOffset).toBe(2)
  })

  it("adds cards in the requested column and moves cards vertically and between columns", () => {
    convert("board"); const first = columns()[0], original = cards()[0]
    board().addCard(first); const second = cards()[1]
    second.querySelector("p")!.textContent = "Second"
    expect(board().moveCard(second, "up")).toBe(true)
    expect(board().cards(first)).toEqual([second, original])
    expect(board().moveCard(second, "up")).toBe(false)
    board().addColumn(); const next = columns()[1]
    expect(board().moveCard(second, "right")).toBe(true)
    expect(board().cards(next)).toEqual([second]); expect(board().cards(first)).toEqual([original])
    expect(board().moveCard(second, "left")).toBe(true)
    $.move(second.querySelector("p")!)
    expect(board().actions.addBoardCard({type: "addBoardCard"})).toBe(true)
    expect(board().cards(first)).toHaveLength(3)
  })

  it("preserves authored attributes on board wrappers and empty authored headings within cards on exit", () => {
    document.body.innerHTML = '<h2></h2><!--keep--><p>Content</p>'
    const content = Array.from(document.body.childNodes)
    convert("board")
    const column = columns()[0], card = cards()[0]
    column.id = "authored-column"; card.setAttribute("data-purpose", "authored")
    convert("document")
    expect(document.getElementById("authored-column")).toBe(column)
    expect(column.classList.contains("ww-board-column")).toBe(false)
    expect(card.getAttribute("data-purpose")).toBe("authored")
    expect(card.classList.contains("ww-board-card")).toBe(false)
    expect(Array.from(card.childNodes)).toEqual(content)
  })

  it("refreshes controls after remote insertion without normalizing unfamiliar column content", async () => {
    convert("board"); await settle(); editor.doc.syncFromDOM()
    const remote = new Y.Doc(); Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const column = new Y.XmlElement("section"), heading = new Y.XmlElement("h2"), widget = new Y.XmlElement("custom-card")
    column.setAttribute("class", "ww-board-column"); widget.setAttribute("data-authored", "yes")
    column.insert(0, [heading, widget]); sharedDOMBody(remote).push([column])
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client"); await settle()
    expect(columns()).toHaveLength(2)
    expect(columns()[1].querySelector("custom-card")?.getAttribute("data-authored")).toBe("yes")
    expect(board().cards(columns()[1])).toHaveLength(0)
    expect(editor.appendix.querySelector('[aria-label="Add card to column 2"]')).not.toBeNull()
    remote.destroy()
  })

  it("uses appendix-only controls, rejects stale targets, and cleans up", async () => {
    convert("board"); await settle()
    const controls = editor.appendix.querySelector<HTMLElement>("[part=board-actions]")!
    expect(document.body.querySelector("[part=board-actions], button")).toBeNull()
    const add = controls.querySelector<HTMLButtonElement>('[aria-label="Add card to column 1"]')!
    add.click(); expect(cards()).toHaveLength(2)
    const oldColumn = columns()[0]
    oldColumn.replaceWith(oldColumn.cloneNode(true))
    add.click(); expect(cards()).toHaveLength(2)
    await settle()
    controls.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click()
    expect(columns()).toHaveLength(2)
    editor.features.board.disable()
    expect(editor.appendix.querySelector("[part=board-actions]")).toBeNull()
    expect(document.body.innerHTML).not.toContain("◆board")
  })

  it("keeps card and heading boundaries intact for deletion, deep splits, and cross-card edits", () => {
    convert("board"); const column = columns()[0], first = cards()[0]
    first.querySelector("p")!.textContent = "First"
    board().addCard(column); const second = cards()[1]
    second.querySelector("p")!.textContent = "Second"
    $.move(second.querySelector("p")!.firstChild!, 0)
    editor.features.manipulation.delete("backward")
    expect(cards()).toEqual([first, second])
    $.move(first.querySelector("p")!.firstChild!, 2)
    editor.features.manipulation.insert(undefined, 5)
    expect(cards()).toEqual([first, second]); expect(first.querySelectorAll("p")).toHaveLength(2)
    editor.features.selection.disable()
    document.getSelection()!.setBaseAndExtent(first.querySelector("p")!.firstChild!, 1, second.querySelector("p")!.firstChild!, 2)
    const html = document.body.innerHTML
    editor.features.manipulation.delete(); editor.features.manipulation.insert(document.createTextNode("replacement"))
    expect(document.body.innerHTML).toBe(html)
    const event = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "x"})
    second.dispatchEvent(event); expect(event.defaultPrevented).toBe(true)
  })

  it("Enter on a column heading adds a card without splitting the column", () => {
    convert("board"); const heading = columns()[0].querySelector("h2")!
    heading.textContent = "Ideas"; $.move(heading.firstChild!, 5)
    heading.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(columns()).toHaveLength(1); expect(cards()).toHaveLength(2)
    expect(heading.textContent).toBe("Ideas")
    expect(board().containingCard($.anchor)).toBe(cards()[1])
  })

  it("rejects locked actions, stale layout requests, and custom template conversions", () => {
    convert("board"); const owner = {}; editor.lockEditing(owner)
    expect(board().addColumn()).toBe(false); expect(board().addCard()).toBe(false)
    expect(convert("document")).toBe(false); editor.unlockEditing(owner)
    expect(editor.setDocumentLayout("document", "canvas")).toBe(false)
    expect(board().removeColumn(columns()[0])).toBe(false)
    convert("document")
    document.body.innerHTML = '<custom-document role="document"><p>Owned</p></custom-document>'
    const html = document.body.innerHTML
    expect(convert("board")).toBe(false); expect(document.body.innerHTML).toBe(html)
    expect(documentLayoutMode(Object.assign(document.createElement("body"), {className: "ww-board ww-canvas"}))).toBe("document")
  })

  it("groups layout conversions and card mutations for undo and redo", async () => {
    document.body.innerHTML = "<p>Original</p>"; await settle()
    const before = editor.toHTML(true)
    convert("board"); await settle(); const boardHTML = editor.toHTML(true)
    editor.doc.undo(); await settle(); expect(editor.getDocumentLayoutState().mode).toBe("document"); expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo(); await settle(); expect(editor.toHTML(true)).toBe(boardHTML)
    board().addCard(); await settle(); expect(cards()).toHaveLength(2)
    editor.doc.undo(); await settle(); expect(cards()).toHaveLength(1)
    editor.doc.redo(); await settle(); expect(cards()).toHaveLength(2)
    convert("slides"); await settle(); expect(editor.getDocumentLayoutState().mode).toBe("slides")
    editor.doc.undo(); await settle(); expect(editor.getDocumentLayoutState().mode).toBe("board"); expect(cards()).toHaveLength(2)
    convert("canvas"); await settle(); expect(editor.getDocumentLayoutState().mode).toBe("canvas")
  })

  it("shares and exports authored columns and cards with CSS and no editing UI", async () => {
    convert("board"); board().addColumn(); board().addCard(); await settle()
    editor.doc.syncFromDOM()
    const remote = new Y.Doc(); Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const html = sharedDOMBody(remote).toString()
    expect(html).toContain("ww-board-column"); expect(html).toContain("ww-board-card"); expect(html).not.toContain("board-actions")
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(saved.head.textContent).toContain(boardStyles)
    expect(saved.body.querySelectorAll(".ww-board-column")).toHaveLength(2)
    expect(saved.body.querySelectorAll(".ww-board-card")).toHaveLength(2)
    expect(saved.body.innerHTML).not.toContain("◆"); expect(saved.body.querySelector("button, [part=board-actions]")).toBeNull()
    // Observation updates affordances without normalizing externally authored structure.
    const column = columns()[1]
    column.append(document.createComment("external")); column.querySelector("article")!.replaceWith(document.createElement("custom-card"))
    const authored = editor.toHTML(true); await settle(); expect(editor.toHTML(true)).toBe(authored)
    remote.destroy()
  })
})
