// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {$, pathFromNode} from "../utility"
import {boardStyles, documentLayoutMode, type DocumentLayoutMode} from "../document-layout"
import {selectionChangeEvent, type SelectionChangeDetail} from "../editor-bridge"
import {getElementPresentation} from "../element-names"

let editor: DOMEditor
const head = document.head.cloneNode(true)
const settle = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
const convert = (mode: DocumentLayoutMode) => editor.setDocumentLayout(mode, editor.getDocumentLayoutState().mode)
const board = () => editor.features.board
const columns = () => board().columns()
const cards = () => columns().flatMap(column => board().cards(column))
const grip = (label: string) => {
  const cardMatch = /^Drag card (\d+) in column (\d+)$/.exec(label), columnMatch = /^Drag column (\d+)$/.exec(label)
  const overlayTarget = cardMatch ? board().cards(columns()[Number(cardMatch[2]) - 1] ?? document.createElement("section"))[Number(cardMatch[1]) - 1]
    : columnMatch ? columns()[Number(columnMatch[1]) - 1] : null
  const target = cardMatch
    ? board().cards(columns()[Number(cardMatch[2]) - 1] ?? document.createElement("section"))[Number(cardMatch[1]) - 1]?.querySelector("p")
    : columnMatch ? columns()[Number(columnMatch[1]) - 1]?.querySelector("h2") : null
  if(target) {
    if(!overlayTarget?.contains($.anchor)) $.move(target)
    editor.features.selection.processSelection(); board().refresh()
  }
  const overlay = overlayTarget && board().transformOverlay(overlayTarget)
  return overlay?.querySelector<HTMLButtonElement>("[part~='transform-overlay-mover']") ?? null!
}
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
  it("applies column width edits from Element options after default and dragged sizes", () => {
    convert("board")
    const column = columns()[0], heading = column.querySelector("h2")!
    editor.features.selection.selectElement(column)
    const manipulation = editor.features.manipulation
    const setWidth = (width: string) => manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {width}})

    setWidth("300px")
    expect(column.style.width).toBe("300px")
    expect(column.style.flexBasis).toBe("300px")
    expect(column.style.maxWidth).toBe("")
    expect(manipulation.actions.getStyleState({type: "getStyleState", topLevel: true, properties: ["width"]}).inline.width?.value).toBe("300px")

    // A drag writes all three declarations; a later toolbox edit must also
    // move its cap so the column can grow beyond the dragged size.
    column.style.maxWidth = "300px"
    setWidth("520px")
    expect(column.style.width).toBe("520px")
    expect(column.style.flexBasis).toBe("520px")
    expect(column.style.maxWidth).toBe("520px")
    setWidth("")
    expect(column.style.width).toBe("")
    expect(column.style.flexBasis).toBe("")
    expect(column.style.maxWidth).toBe("")
    expect(column.querySelector("h2")).toBe(heading)
  })

  it("styles the selected card or embedded element without changing its column", () => {
    convert("board")
    const column = columns()[0], card = cards()[0]
    card.innerHTML = '<!--keep--><div title="authored"><p>Text</p><img src="test.png"><custom-content><p>Private</p></custom-content></div>'
    const elements = [column, column.querySelector("h2")!, card, card.querySelector("p")!, card.querySelector("img")!, card.querySelector("custom-content")!]
    const nodes = Array.from(column.querySelectorAll("*"))
    const manipulation = editor.features.manipulation
    for(const target of elements) {
      editor.features.selection.selectElement(target)
      expect(manipulation.topLevelStyleTarget).toBe(target)
      manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {
        "background-color": "gold", "border-width": "2px", "border-style": "solid", "border-color": "red", padding: "8px",
      }})
      expect(target.getAttribute("style")).toContain("background-color: gold")
      expect(target.getAttribute("style")).toContain("border-color: red")
      const state = manipulation.actions.getStyleState({type: "getStyleState", topLevel: true, properties: ["background-color", "border-color"]})
      expect(state.inline["background-color"]?.value).toBe("gold")
      expect(state.inline["border-color"]?.value).toBe("red")
      for(const other of column.querySelectorAll("*")) if(other !== target) expect(other.hasAttribute("style")).toBe(false)
      if(target !== column) expect(column.hasAttribute("style")).toBe(false)
      target.removeAttribute("style")
    }
    expect(Array.from(column.querySelectorAll("*"))).toEqual(nodes)
    expect(card.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
  })

  it.each(["img", "custom-content"])("styles a capture-selected %s inside a card", tag => {
    convert("board")
    const column = columns()[0], card = cards()[0], target = document.createElement(tag)
    card.append(target)
    editor.features.selection.captureElement(target)
    const manipulation = editor.features.manipulation
    expect(manipulation.topLevelStyleTarget).toBe(target)
    manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"border-color": "red"}})
    expect(target.getAttribute("style")).toContain("border-color: red")
    expect(card.hasAttribute("style")).toBe(false)
    expect(column.hasAttribute("style")).toBe(false)
  })

  it("resolves current card content at the caret and preserves styles through undo and redo", () => {
    convert("board")
    const column = columns()[0], card = cards()[0], previous = card.querySelector("p")!
    $.move(previous)
    const manipulation = editor.features.manipulation
    expect(manipulation.topLevelStyleTarget).toBe(previous)
    const replacement = document.createElement("p")
    replacement.textContent = "Replacement"
    previous.replaceWith(replacement)
    $.move(replacement.firstChild!, 2)
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const original = editor.toHTML(true)
    manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"background-color": "gold"}})
    expect(replacement.style.backgroundColor).toBe("gold")
    expect(previous.hasAttribute("style")).toBe(false)
    expect(card.hasAttribute("style")).toBe(false)
    expect(column.hasAttribute("style")).toBe(false)
    editor.doc.syncFromDOM()
    const changed = editor.toHTML(true)
    expect(changed).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(changed)
  })

  it("creates a group with an editable heading from the column frame and retains authored content", async () => {
    convert("board"); const column = columns()[0], card = cards()[0]
    column.append(document.createComment("keep"), document.createElement("custom-column-content"))
    const children = Array.from(column.childNodes)
    $.move(column.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    const control = board().transformOverlay(column)!.querySelector<HTMLButtonElement>('[part~="transform-overlay-group"]')!
    expect(control.title).toBe("Create group for column 1")
    control.click()
    const group = board().groups()[0], heading = group.firstElementChild!
    expect(group.parentElement).toBe(document.body)
    expect(getComputedStyle(group).inlineSize).toBe("max-content")
    expect(group.children[1]).toBe(column)
    expect(heading.localName).toBe("h2")
    expect(heading.textContent).toBe("")
    expect(getComputedStyle(heading).getPropertyValue("--ww-placeholder")).toContain("Group heading")
    expect(board().editingScope($.anchor)).toBe(heading)
    expect(board().allowsSelection()).toBe(true)
    expect(columns()).toEqual([column]); expect(board().cards(column)).toEqual([card])
    expect(Array.from(column.childNodes)).toEqual(children)
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 484, 300))
    board().refresh()
    const addColumn = editor.appendix.querySelector<HTMLElement>('[part~="board-add-column"]')!
    expect(addColumn.style.left).toBe("")
    expect(addColumn.getAttribute("part")).toMatch(/anchor-control-\d+/)
    expect(getElementPresentation(heading)).toEqual({name: "Group Heading", icon: "Heading"})
    await settle()
    const html = await editor.serializeHTML()
    expect(html).toContain("ww-board-group"); expect(html).not.toContain("Group heading")
    expect(html).not.toContain("transform-overlay-group"); expect(html).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it("numbers columns globally across groups and ungrouped columns in current board order", () => {
    convert("board"); board().addColumn(); board().addColumn(); board().addColumn()
    const [one, two, three, four] = columns()
    board().setGrouping("new", one); board().setGrouping("left", two)
    board().setGrouping("new", four)
    const names = () => columns().map(column => getElementPresentation(column).name)
    expect(columns()).toEqual([one, two, three, four])
    expect(names()).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"])
    board().setGrouping("right", three)
    expect(names()).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"])
    document.body.prepend(board().groups()[1])
    expect(columns()).toEqual([three, four, one, two])
    expect(names()).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"])
  })

  it("joins adjacent groups in either direction and ungroups without discarding authored headings or metadata", () => {
    convert("board"); board().addColumn(); board().addColumn()
    const [left, middle, right] = columns()
    board().setGrouping("new", left); const first = board().groups()[0]
    first.querySelector("h2")!.textContent = "Keep this heading"
    board().setGrouping("new", right); const last = board().groups()[1]
    expect(board().groupingState(middle)).toMatchObject({grouped: false, canJoinLeft: true, canJoinRight: true})
    expect(board().setGrouping("left", middle)).toBe(true)
    expect(Array.from(first.children).filter(element => element.matches(".ww-board-column"))).toEqual([left, middle])
    expect(board().setGrouping("right", middle)).toBe(true)
    expect(last.children[1]).toBe(middle)
    last.setAttribute("title", "authored")
    expect(board().setGrouping("none", middle)).toBe(true)
    expect(middle.parentElement).toBe(document.body)
    expect(board().setGrouping("none", right)).toBe(true)
    expect(last.isConnected).toBe(true); expect(last.title).toBe("authored")
    expect(first.querySelector("h2")!.textContent).toBe("Keep this heading")
  })

  it("keeps grouped column style controls and grouping state scoped to the current column", () => {
    convert("board"); const column = columns()[0]
    board().setGrouping("new", column); const group = board().groups()[0]
    $.move(column.querySelector("h2")!); editor.features.selection.processSelection()
    const state = editor.features.manipulation.actions.getStyleState({type: "getStyleState", topLevel: true})
    expect(state.target?.grouping).toMatchObject({grouped: true})
    expect(editor.features.manipulation.topLevelStyleTarget).toBe(column)
    editor.features.manipulation.actions.setStyle({type: "setStyle", topLevel: true, styles: {"background-color": "pink"}})
    expect(column.style.backgroundColor).toBe("pink")
    expect(group.style.backgroundColor).toBe("")
  })

  it("rechecks grouping permissions and current neighboring DOM when commands execute", () => {
    convert("board"); board().addColumn()
    const [one, two] = columns()
    board().setGrouping("new", one)
    expect(board().groupingState(two)?.canJoinLeft).toBe(true)
    const group = board().groups()[0]
    group.replaceWith(group.cloneNode(true))
    expect(board().setGrouping("left", two)).toBe(true)
    expect(two.parentElement).not.toBe(group)
    const replacement = two.parentElement!
    const allows = editor.allows.bind(editor)
    vi.spyOn(editor, "allows").mockImplementation((permission, node) => node === replacement && permission === "insert" ? false : allows(permission, node))
    board().addColumn(); const ungrouped = columns().at(-1)!
    expect(board().groupingState(ungrouped)?.canJoinLeft).toBe(false)
    expect(board().setGrouping("left", ungrouped)).toBe(false)
    const owner = {}; editor.lockEditing(owner)
    expect(board().setGrouping("none", two)).toBe(false)
    editor.unlockEditing(owner)
    two.remove()
    expect(board().setGrouping("new", two)).toBe(false)
  })

  it("drags columns into groups and back out while preserving nested widgets and cleaning empty groups", async () => {
    convert("board"); board().addColumn()
    const [one, two] = columns(), card = cards()[0]
    card.append(document.createComment("keep"), document.createElement("custom-card"))
    board().setGrouping("new", two); const group = board().groups()[0]
    await settle(); geometry()
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(330, 0, 660, 540))
    const data = new DataTransfer(), children = Array.from(card.childNodes)
    grip("Drag column 1").dispatchEvent(dragEvent("dragstart", data))
    group.dispatchEvent(dragEvent("dragover", data, 350, 10))
    expect(data.dropEffect).toBe("move")
    group.dispatchEvent(dragEvent("drop", data, 350, 10))
    expect(one.parentElement).toBe(group); expect(columns()).toEqual([one, two])
    expect(Array.from(card.childNodes)).toEqual(children)
    expect(document.querySelector(".◆board-dragging")).toBeNull()
    expect(board().setGrouping("none", two)).toBe(true)
    const next = new DataTransfer()
    grip("Drag column 1").dispatchEvent(dragEvent("dragstart", next))
    document.body.dispatchEvent(dragEvent("drop", next, 1100, 10))
    expect(one.parentElement).toBe(document.body); expect(group.isConnected).toBe(false)
    expect(document.querySelector(".◆board-dragging")).toBeNull()
  })

  it("recognizes remotely replaced groups and rejects stale columns and drag sources", async () => {
    convert("board"); await settle()
    const original = columns()[0], data = new DataTransfer()
    geometry()
    $.move(original.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    grip("Drag column 1").dispatchEvent(dragEvent("dragstart", data))
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const body = sharedDOMBody(remote)
      const index = body.toArray().findIndex(node => node instanceof Y.XmlElement && node.nodeName === "section")
      const column = (body.get(index) as Y.XmlElement).clone()
      const group = new Y.XmlElement("section"), heading = new Y.XmlElement("h2"), text = new Y.XmlText()
      group.setAttribute("class", "ww-board-group"); text.insert(0, "Remote group")
      heading.insert(0, [text]); group.insert(0, [heading, column])
      body.delete(index, 1); body.insert(index, [group])
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client"); await settle()
      expect(board().groups()).toHaveLength(1); expect(columns()).toHaveLength(1)
      expect(board().groups()[0].querySelector("h2")!.textContent).toBe("Remote group")
      expect(board().setGrouping("new", original)).toBe(false)
      document.body.dispatchEvent(dragEvent("drop", data, 100, 100))
      expect(document.querySelector(".◆board-dragging")).toBeNull()
      expect(board().groupingState(columns()[0])?.grouped).toBe(true)
      $.move(columns()[0].querySelector("h2")!); editor.features.selection.processSelection()
      expect(board().addCard()).toBe(true)
      expect(cards()).toHaveLength(2)
    }
    finally { remote.destroy() }
  })

  it("undoes and redoes grouping and converts without losing authored group content", async () => {
    convert("board"); await settle(); editor.doc.stopCapturing()
    expect(board().setGrouping("new", columns()[0])).toBe(true); await settle()
    expect(board().groups()).toHaveLength(1)
    editor.doc.undo(); await settle(); expect(board().groups()).toHaveLength(0); expect(columns()).toHaveLength(1)
    editor.doc.redo(); await settle(); expect(board().groups()).toHaveLength(1); expect(columns()).toHaveLength(1)
    const group = board().groups()[0]
    group.querySelector("h2")!.textContent = "Group title"
    const comment = document.createComment("preserve"), widget = document.createElement("custom-group-content")
    group.append(comment, widget)
    expect(convert("document")).toBe(true)
    expect(document.body.textContent).toContain("Group title")
    expect(document.body.contains(comment)).toBe(true); expect(document.body.contains(widget)).toBe(true)
    expect(document.querySelector(".ww-board-group, .ww-board-column, .ww-board-card")).toBeNull()
  })

  it.each(["breadcrumb", "modifier-click"])("selects and formats each column heading independently through %s", async source => {
    convert("board"); board().addColumn(); board().addColumn()
    const headings = columns().map((column, i) => {
      const heading = column.querySelector("h2")!
      heading.innerHTML = `<!--keep ${i}--><em>Column ${i + 1}</em>`
      heading.setAttribute("title", `Heading ${i + 1}`)
      return heading
    })
    await settle(); editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    for(const [index, heading] of headings.entries()) {
      if(!index) continue
      const content = Array.from(heading.childNodes)
      if(source === "breadcrumb") editor.features.selection.actions.selectNode({type: "selectNode", path: pathFromNode(document.body, heading)!})
      else heading.querySelector("em")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, ctrlKey: true, metaKey: true}))
      expect($.selectedElement).toBe(heading)
      expect(board().allowsSelection()).toBe(true)
      editor.features.manipulation.setStyle({color: "red"})
      expect(heading.style.color).toBe("red")
      expect(headings.filter(other => other !== heading).every(other => !other.style.color)).toBe(true)
      expect(Array.from(heading.childNodes)).toEqual(content)
      await settle(); editor.doc.undo(); await settle()
      expect(columns()[index].querySelector("h2")!.hasAttribute("style")).toBe(false)
      editor.doc.redo(); await settle()
      expect(columns()[index].querySelector("h2")!.getAttribute("style")).toContain("color: red")
      editor.doc.undo(); await settle()
    }
    expect(await editor.serializeHTML()).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it("retains breadcrumb document selection for the Document toolbox", async () => {
    convert("board")
    const html = await editor.serializeHTML()
    const post = vi.spyOn(window.parent, "postMessage")
    editor.features.selection.actions.selectNode({type: "selectNode", path: []})
    await settle()
    editor.features.selection.processSelection()
    editor.postSelectionPath()

    expect($.selectedElement).toBe(document.body)
    const detail = post.mock.calls.filter(([message]) => message.type === selectionChangeEvent).at(-1)![0].detail as SelectionChangeDetail
    expect(detail.nodeSelected).toBe(true)
    expect(detail.path.map(item => item.path)).toEqual([[]])
    expect(detail.selectedElementTypes ?? []).toEqual([])
    expect(await editor.serializeHTML()).toBe(html)
  })

  it.each(["", "<br>"])("discards only empty column heading placeholders during layout conversion (%s)", placeholder => {
    convert("board")
    const heading = columns()[0].querySelector("h2")!
    heading.innerHTML = placeholder
    $.move(heading); editor.features.selection.processSelection()
    heading.classList.add("◆", "◆empty-selected")
    expect(heading.className).toContain("◆")
    expect(convert("slides")).toBe(true)
    expect(document.querySelector("h2")).toBeNull()
    expect(document.querySelector(".ww-slide")).not.toBeNull()
  })

  it("allows deleting the last column, undoing it, and adding a column to an empty board", async () => {
    convert("board"); await settle()
    const column = columns()[0]
    editor.features.selection.selectElement(column)
    const deleter = board().transformOverlay(column)!.querySelector<HTMLButtonElement>('[part~="transform-overlay-delete"]')!
    expect(deleter.disabled).toBe(false)
    deleter.click(); await settle()
    expect(columns()).toHaveLength(0)
    expect(document.body.children).toHaveLength(0)
    expect(editor.getDocumentLayoutState().mode).toBe("board")
    expect(editor.appendix.querySelector('[part~=board-add-card]')).toBeNull()
    expect(editor.appendix.querySelector('[part~=board-add-column]')).not.toBeNull()
    editor.doc.undo(); await settle(); expect(columns()).toHaveLength(1)
    editor.doc.redo(); await settle(); expect(columns()).toHaveLength(0)
    editor.features.board.disable(); editor.features.board.enable(); await settle()
    expect(columns()).toHaveLength(0)
    editor.appendix.querySelector<HTMLButtonElement>('[part~=board-add-column]')!.click(); await settle()
    expect(columns()).toHaveLength(1)
  })

  it.each([false, true])("keeps paragraphs in both cards when splitting at the card boundary (column=%s)", intoColumn => {
    convert("board")
    const card = cards()[0]
    card.innerHTML = '<p>Content</p>'
    $.move(card, 0)
    expect(board().splitAtSelection(intoColumn)).toBe(true)
    expect(card.innerHTML).toBe("<p></p>")
    expect(cards()[1].querySelector("p")?.textContent).toBe("Content")
    $.move(cards()[1], cards()[1].childNodes.length)
    expect(board().splitAtSelection(intoColumn)).toBe(true)
    expect(cards()[2].querySelector("p")).not.toBeNull()
  })

  it("restores empty cards after DOM edits while preserving comments and unfamiliar valid content", async () => {
    convert("board")
    const card = cards()[0]
    card.replaceChildren(document.createComment("keep"), document.createTextNode(" \n"))
    await settle()
    expect(card.querySelectorAll("p")).toHaveLength(1)
    expect(card.innerHTML).toContain("<!--keep-->")
    card.replaceChildren(document.createElement("custom-empty-card-widget"))
    await settle()
    expect(card.querySelector("p")).toBeNull()
    const widget = card.firstElementChild!
    card.replaceChildren(document.createElement("section"), widget)
    await settle()
    expect(card.querySelector("p")).toBeNull()
  })

  it.each(["ctrlKey", "metaKey"] as const)("splits a card at the caret with %s+Enter, preserving nested content and widgets", async modifier => {
    convert("board")
    const column = columns()[0], card = cards()[0]
    card.innerHTML = '<section data-authored="yes"><p>ab<em>cdef</em>gh</p><!--keep--><custom-split-widget data-authored="yes"></custom-split-widget></section>'
    const widget = card.querySelector("custom-split-widget")!
    $.move(card.querySelector("em")!.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "Enter", [modifier]: true, bubbles: true, cancelable: true})
    card.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(board().cards(column)).toHaveLength(2)
    const next = board().cards(column)[1]
    expect(card.textContent).toBe("abcd"); expect(next.textContent).toBe("efgh")
    expect(next.querySelector("section")?.getAttribute("data-authored")).toBe("yes")
    expect(next.querySelector("custom-split-widget")).toBe(widget)
    expect(next.innerHTML).toContain("<!--keep-->")
    expect(board().containingCard($.anchor)).toBe(next)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["ctrlKey", "metaKey"] as const)("splits into a column with Shift+%s+Enter and moves following siblings intact", modifier => {
    convert("board")
    const column = columns()[0], card = cards()[0]
    card.innerHTML = '<p>LeftRight</p>'
    const comment = document.createComment("keep"), widget = document.createElement("custom-column-widget")
    column.append(comment, widget); board().addCard(column)
    const later = board().cards(column)[1]
    $.move(card.querySelector("p")!.firstChild!, 4)
    card.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", shiftKey: true, [modifier]: true, bubbles: true, cancelable: true}))
    const next = columns()[1]
    expect(columns()).toHaveLength(2)
    expect(card.textContent).toBe("Left")
    expect(board().cards(next)[0].textContent).toBe("Right")
    expect(Array.from(next.childNodes).slice(2)).toEqual([comment, widget, later])
    expect(board().containingColumn($.anchor)).toBe(next)
  })

  it("splits headings into cards or column headings and replaces selected text", () => {
    convert("board")
    const column = columns()[0], heading = column.querySelector("h2")!
    heading.textContent = "BeforeSelectedAfter"
    document.getSelection()!.setBaseAndExtent(heading.firstChild!, 6, heading.firstChild!, 14)
    expect(board().splitAtSelection()).toBe(true)
    expect(heading.textContent).toBe("Before")
    expect(board().cards(column)[0].textContent).toBe("After")
    $.move(heading.firstChild!, 3)
    expect(board().splitAtSelection(true)).toBe(true)
    expect(heading.textContent).toBe("Bef")
    expect(columns()[1].querySelector("h2")!.textContent).toBe("ore")
    expect(board().cards(columns()[1])).toHaveLength(2)
  })

  it.each(["ctrlKey", "metaKey"] as const)("joins backwards across cards with %s+Backspace, preserving irregular content", modifier => {
    convert("board")
    const column = columns()[0], previous = cards()[0]
    previous.innerHTML = '<section><p>Before</p></section><!--previous-->'
    const between = document.createComment("between")
    column.append(between); board().addCard(column)
    const current = board().cards(column)[1]
    current.innerHTML = '<!--keep--><custom-join-widget data-authored="yes"></custom-join-widget><section data-authored="yes"><p>After</p></section>'
    const content = Array.from(current.childNodes)
    const offset = previous.childNodes.length
    $.move(current.querySelector("p")!.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "Backspace", [modifier]: true, bubbles: true, cancelable: true})
    current.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(board().cards(column)).toEqual([previous])
    expect(Array.from(previous.childNodes).slice(offset)).toEqual(content)
    expect(between.parentNode).toBe(column)
    expect(previous.textContent).toBe("BeforeAfter")
    expect($.anchor).toBe(previous); expect(document.getSelection()!.anchorOffset).toBe(offset)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["ctrlKey", "metaKey"] as const)("joins backwards across columns with Shift+%s+Backspace without merging their cards", modifier => {
    convert("board")
    const previous = columns()[0], originalCard = cards()[0]
    previous.querySelector("h2")!.textContent = "Before"
    board().addColumn()
    const current = columns()[1], heading = current.querySelector("h2")!
    heading.textContent = "After"
    const comment = document.createComment("keep"), widget = document.createElement("custom-column-widget")
    current.append(comment, widget); board().addCard(current)
    const content = Array.from(current.childNodes), movedCard = board().cards(current)[0]
    const offset = previous.childNodes.length
    $.move(movedCard.querySelector("p")!)
    const event = new KeyboardEvent("keydown", {key: "Backspace", shiftKey: true, [modifier]: true, bubbles: true, cancelable: true})
    movedCard.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(columns()).toEqual([previous])
    expect(Array.from(previous.childNodes).slice(offset)).toEqual(content)
    expect(board().cards(previous)).toEqual([originalCard, movedCard])
    expect(previous.querySelectorAll("h2")).toHaveLength(2)
    expect(board().containingColumn($.anchor)).toBe(previous)
    expect(board().allowsSelection()).toBe(true)
  })

  it.each([false, true])("undoes and redoes a backwards join as one change (columns=%s)", acrossColumns => {
    convert("board")
    cards()[0].innerHTML = '<p>Before</p>'
    if(acrossColumns) board().addColumn()
    const column = columns()[acrossColumns ? 1 : 0]
    board().addCard(column)
    const current = board().cards(column).at(-1)!
    current.innerHTML = '<p>After</p><!--keep-->'
    editor.doc.syncFromDOM()
    const before = editor.toHTML(true)
    $.move(current.querySelector("p")!.firstChild!, 2)
    expect(board().joinBackward(acrossColumns)).toBe(true)
    const after = editor.toHTML(true)
    editor.doc.undo(); expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo(); expect(editor.toHTML(true)).toBe(after)
  })

  it("fails safely at the first card or column and for headings, selections, widgets, or authored wrapper metadata", () => {
    convert("board")
    const column = columns()[0], first = cards()[0]
    $.move(first.querySelector("p")!)
    expect(board().joinBackward()).toBe(false)
    expect(board().joinBackward(true)).toBe(false)
    $.move(column.querySelector("h2")!)
    expect(board().joinBackward()).toBe(false)
    board().addCard(column)
    const current = board().cards(column)[1]
    current.innerHTML = '<p>After</p><custom-join-widget>Atomic</custom-join-widget>'
    const before = editor.toHTML(true)
    document.getSelection()!.setBaseAndExtent(current.firstChild!.firstChild!, 0, current.firstChild!.firstChild!, 2)
    expect(board().joinBackward()).toBe(false)
    $.move(current.querySelector("custom-join-widget")!.firstChild!)
    expect(board().joinBackward()).toBe(false)
    $.move(current.firstChild!.firstChild!)
    current.id = "authored"
    expect(board().joinBackward()).toBe(false)
    current.removeAttribute("id")
    const detached = document.createTextNode("Detached")
    $.isSettingRanges = true
    try { document.getSelection()!.setBaseAndExtent(detached, 2, detached, 2) }
    finally { $.isSettingRanges = false }
    expect(board().joinBackward()).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
  })

  it("keeps a board split in one undo group and fails safely for detached selections", async () => {
    convert("board"); cards()[0].innerHTML = '<p>BeforeAfter</p>'; await settle(); editor.doc.syncFromDOM()
    const before = editor.toHTML(true)
    $.move(cards()[0].firstChild!.firstChild!, 6)
    expect(board().splitAtSelection(true)).toBe(true)
    await settle(); const after = editor.toHTML(true)
    editor.doc.undo(); await settle(); expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo(); await settle(); expect(editor.toHTML(true)).toBe(after)
    const detached = document.createElement("p"); detached.textContent = "Detached"
    $.isSettingRanges = true
    try { document.getSelection()!.setBaseAndExtent(detached.firstChild!, 2, detached.firstChild!, 2) }
    finally { $.isSettingRanges = false }
    expect(board().splitAtSelection()).toBe(false)
    expect(editor.toHTML(true)).toBe(after)
  })

  it("posts columns and cards as selectable breadcrumb elements with live names and distinct icons", async () => {
    convert("board")
    document.body.innerHTML = '<!--root--><section class="ww-board-column"><h2>Todo</h2><!--keep--><custom-card></custom-card><article class="ww-board-card"><section><p>Text</p></section></article><article class="ww-board-card"></article></section><section class="ww-board-column"></section>'
    await settle()
    const [column, otherColumn] = columns(), [card, otherCard] = board().cards(column)
    expect(getElementPresentation(column.querySelector("h2")!)).toEqual({name: "Column Heading", icon: "Heading"})
    const cardHeading = document.createElement("h2"); card.append(cardHeading)
    expect(getElementPresentation(cardHeading)).toEqual({name: "Heading 2", icon: "Heading 2"})
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const state = () => {
      postMessage.mockClear(); editor.postSelectionPath()
      return postMessage.mock.calls.find(([message]) => message.type === selectionChangeEvent)![0].detail as SelectionChangeDetail
    }
    $.move(card.querySelector("p")!.firstChild!, 2); editor.features.selection.processSelection()
    expect(state().path).toEqual([
      {path: [], name: "Board", icon: "Columns"},
      {path: [1], name: "Column 1", icon: "BoardColumn"},
      {path: [1, 3], name: "Card 1", icon: "BoardCard"},
      {path: [1, 3, 0, 0], name: "Paragraph", icon: "Paragraph", sections: [
        {path: [1, 3, 0], type: "section", name: "Section", icon: "Section"},
      ]},
    ])
    for(const [target, path] of [[card, [1, 3]], [column, [1]]] as const) {
      editor.features.selection.actions.selectNode({type: "selectNode", path: [...path]})
      expect($.selectedElement).toBe(target)
      expect(state()).toMatchObject({nodeSelected: true, path: expect.arrayContaining([
        {path: [...path], ...getElementPresentation(target)},
      ])})
    }
    column.before(otherColumn); card.before(otherCard)
    expect(getElementPresentation(column)).toEqual({name: "Column 2", icon: "BoardColumn"})
    expect(getElementPresentation(card)).toEqual({name: "Card 2", icon: "BoardCard"})
    expect(getElementPresentation(column.querySelector("section")!)).toEqual({name: "Section", icon: "Section"})
    const lookalike = document.createElement("article"); lookalike.className = "ww-board-card"
    card.append(lookalike)
    expect(getElementPresentation(lookalike)).toEqual({name: "Article", icon: "Article"})
  })

  it("sizes the board to the available viewport without reserving a side gutter", () => {
    convert("board")
    expect(getComputedStyle(document.documentElement).height).toBe("100%")
    expect(getComputedStyle(document.documentElement).getPropertyValue("scrollbar-gutter")).not.toBe("stable")
    expect(getComputedStyle(document.body).minHeight).toBe("100%")
  })

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

  it("keeps a card drag in one undo step and selects the card", async () => {
    convert("board"); const card = cards()[0], text = document.createTextNode("Selected")
    card.querySelector("p")!.append(text)
    board().addColumn(); await settle(); geometry(); $.move(text, 3)
    const data = new DataTransfer()
    grip("Drag card 1 in column 1").dispatchEvent(dragEvent("dragstart", data))
    columns()[1].dispatchEvent(dragEvent("drop", data, 400, 100)); await settle()
    expect($.selectedElement).toBe(card)
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
    const column = new Y.XmlElement("section"), heading = new Y.XmlElement("h2"), widget = new Y.XmlElement("custom-card"), card = new Y.XmlElement("article")
    card.setAttribute("class", "ww-board-card")
    column.setAttribute("class", "ww-board-column"); widget.setAttribute("data-authored", "yes")
    column.insert(0, [heading, widget, card]); sharedDOMBody(remote).push([column])
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client"); await settle()
    expect(columns()).toHaveLength(2)
    expect(columns()[1].querySelector("custom-card")?.getAttribute("data-authored")).toBe("yes")
    expect(board().cards(columns()[1])).toHaveLength(1)
    expect(board().cards(columns()[1])[0].innerHTML).toBe("<p></p>")
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

  it("reserves card and column insertion slots without adding authored nodes", async () => {
    convert("board"); await settle()
    const content = editor.toHTML(true)
    const sheets = document.adoptedStyleSheets
    const layout = sheets.find(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("body.ww-board::after")))!
    expect(layout).toBeDefined()
    // The canonical layout must also work when CSP blocks authored <style>.
    expect(Array.from(layout.cssRules).some(rule => (rule as CSSStyleRule).selectorText === "body.ww-board"
      && (rule as CSSStyleRule).style.display === "flex")).toBe(true)
    const controls = editor.appendix.querySelector<HTMLElement>("[part=board-actions]")!
    expect(controls.querySelector('[part~=board-add-card]')?.textContent).toBe("+ Add card")
    expect(controls.querySelector('[part~=board-add-column]')?.textContent).toBe("+ Add column")
    expect(editor.toHTML(true)).toBe(content)
    editor.features.board.disable()
    expect(document.adoptedStyleSheets).not.toContain(layout)
    expect(editor.toHTML(true)).toBe(content)
  })

  it("anchors ordinary board controls without measuring or refreshing on scroll", async () => {
    convert("board"); await settle()
    const geometry = vi.spyOn(editor.features.transformation, "boxGeometry")
    board().refresh()
    expect(geometry).not.toHaveBeenCalled()
    const buttons = editor.appendix.querySelectorAll<HTMLElement>("[part=board-actions] button")
    for(const button of buttons) {
      expect(button.style.left).toBe(""); expect(button.style.top).toBe("")
      expect(button.style.width).toBe(""); expect(button.style.height).toBe("")
      expect(button.getAttribute("part")).toMatch(/anchor-control-\d+/)
    }
    const overlay = board().transformOverlay(cards()[0])!
    expect(overlay.matches('[part~="transform-overlay-board-anchored"]')).toBe(true)
    const refresh = vi.spyOn(board(), "refresh")
    document.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("resize"))
    await settle()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("keeps measured geometry only for transformed frames and returns to CSS anchors", async () => {
    convert("board"); await settle()
    const card = cards()[0], column = columns()[0]
    column.style.setProperty("rotate", "12deg")
    const geometry = vi.spyOn(editor.features.transformation, "boxGeometry")
    board().refresh()
    const overlay = board().transformOverlay(card)!
    expect(geometry).toHaveBeenCalledWith(card)
    expect(overlay.matches('[part~="transform-overlay-board-anchored"]')).toBe(false)
    expect(overlay.style.transform).toContain("matrix(")
    column.style.removeProperty("rotate"); geometry.mockClear()
    board().refresh()
    expect(geometry).not.toHaveBeenCalled()
    expect(overlay.matches('[part~="transform-overlay-board-anchored"]')).toBe(true)
    expect(overlay.style.transform).toBe("")
    expect(overlay.style.left).toBe("")
    column.style.transform = "translate(15px, 20px)"
    board().refresh()
    expect(geometry).not.toHaveBeenCalled()
    expect(overlay.matches('[part~="transform-overlay-board-anchored"]')).toBe(true)
  })

  it("preserves authored anchor names and removes replaced and cloned anchor markers", async () => {
    convert("board"); await settle()
    const column = columns()[0], card = cards()[0]
    card.style.setProperty("anchor-name", "--authored-card")
    board().refresh()
    const rules = () => document.adoptedStyleSheets.flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join("\n")
    expect(rules()).toMatch(/anchor-name: --authored-card,\s*--ww-ui-anchor-/)
    const clone = column.cloneNode(true) as HTMLElement
    column.replaceWith(clone)
    board().refresh()
    const marker = (element: Element) => Array.from(element.classList).filter(name => name.startsWith("◆anchor-target-"))
    expect(marker(column)).toEqual([]); expect(marker(card)).toEqual([])
    expect(marker(clone)).toHaveLength(1)
    expect(marker(clone.querySelector("article")!)).toEqual([])
    expect(editor.toHTML(true)).not.toContain("◆anchor-target-")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toContain("◆anchor-target-")
    convert("document"); board().refresh()
    expect(document.body.querySelector('[class*="◆anchor-target-"]')).toBeNull()
  })

  it("cleans cloned anchor markers even when disabled before the next refresh", async () => {
    convert("board"); await settle()
    const column = columns()[0], clone = column.cloneNode(true)
    document.body.append(clone)
    board().disable()
    expect(document.body.querySelector('[class*="◆anchor-target-"]')).toBeNull()
    expect(column.className).toBe("ww-board-column")
  })

  it("makes only add-button labels unselectable when a column is selected", async () => {
    convert("board"); await settle()
    const column = columns()[0], paragraph = cards()[0].querySelector("p")!
    editor.features.selection.selectElement(column)
    expect($.selectedElement).toBe(column)
    expect(getComputedStyle(column).userSelect).not.toBe("none")
    expect(getComputedStyle(paragraph).userSelect).not.toBe("none")
    for(const button of editor.appendix.querySelectorAll('[part=board-actions] button')) {
      expect(getComputedStyle(button).userSelect).toBe("none")
    }
    $.move(paragraph); editor.features.selection.processSelection()
    expect(column.classList.contains("◆element-selected")).toBe(false)
    expect(getComputedStyle(paragraph).userSelect).not.toBe("none")
  })

  it("highlights only breadcrumb and outline hover, and restores the editing target on exit", async () => {
    convert("board"); await settle()
    const column = columns()[0], card = cards()[0], paragraph = card.querySelector("p")!
    $.move(paragraph); editor.features.selection.processSelection()
    paragraph.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    board().refresh()
    expect(board().transformOverlay(card)?.getAttribute("part")).not.toContain("transform-overlay-board-hovered")
    for(const target of [card, column]) {
      editor.features.selection.actions.hoverNode({type: "hoverNode", path: pathFromNode(document.body, target)!})
      await settle()
      expect(board().transformOverlay(target)?.getAttribute("part")).toContain("transform-overlay-board-hovered")
      expect(editor.features.selection.hoverCaret?.getAttribute("part")).toContain("hover-caret-board")
      expect(board().transformOverlay(target === card ? column : card)).toBeNull()
      expect($.anchor).toBe(paragraph)
      editor.features.selection.actions.hoverNode({type: "hoverNode", path: null})
      await settle()
      expect(board().transformOverlay(card)?.getAttribute("part")).not.toContain("transform-overlay-board-hovered")
      expect(board().transformOverlay(column)).toBeNull()
      expect(editor.features.selection.hoverCaret?.getAttribute("part")).not.toContain("hover-caret-board")
    }
  })

  it("selects a column background without scrolling or intercepting its contents", async () => {
    convert("board"); await settle()
    const column = columns()[0], paragraph = cards()[0].querySelector("p")!
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    const reveal = vi.spyOn(column, "scrollIntoView").mockImplementation(() => {})
    const background = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
    column.dispatchEvent(background)
    expect(background.defaultPrevented).toBe(true)
    expect($.selectedElement).toBe(column)
    expect(scroll).not.toHaveBeenCalled(); expect(reveal).not.toHaveBeenCalled()
    expect(getComputedStyle(column).cursor).toBe("pointer")
    expect(getComputedStyle(paragraph).cursor).not.toBe("pointer")
    $.move(paragraph); editor.features.selection.processSelection()
    const content = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
    Object.defineProperty(content, "target", {value: paragraph})
    board().captureListeners.pointerdown!(content)
    expect(content.defaultPrevented).toBe(false)
    expect($.selectedElement).not.toBe(column)
  })

  it("shows controls for only the selected card or column", async () => {
    convert("board"); board().addColumn(); await settle(); geometry()
    const [first, second] = columns(), [card] = board().cards(first)
    const p = card.querySelector("p")!
    $.move(p); editor.features.selection.processSelection(); board().refresh()
    expect(board().transformOverlay(card)?.getAttribute("part")).not.toContain("transform-overlay-board-selected")
    expect(board().transformOverlay(first)).toBeNull()
    expect([first, card].filter(target => board().transformOverlay(target))).toEqual([card])
    editor.features.selection.selectElement(card); board().refresh()
    expect(board().transformOverlay(card)?.getAttribute("part")).toContain("transform-overlay-board-selected")
    expect(board().transformOverlay(first)).toBeNull()
    expect([first, card].filter(target => board().transformOverlay(target))).toEqual([card])
    $.move(first.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    expect(board().transformOverlay(first)?.getAttribute("part")).not.toContain("transform-overlay-board-selected")
    expect(board().transformOverlay(card)).toBeNull()
    expect([first, card].filter(target => board().transformOverlay(target))).toEqual([first])
    editor.features.selection.selectElement(first); board().refresh()
    expect(board().transformOverlay(first)?.getAttribute("part")).toContain("transform-overlay-board-selected")
    expect([first, card].filter(target => board().transformOverlay(target))).toEqual([first])
    $.move(second.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    expect(board().transformOverlay(first)).toBeNull()
    expect(board().transformOverlay(second)?.getAttribute("part")).not.toContain("transform-overlay-board-selected")
    expect([first, second, card].filter(target => board().transformOverlay(target))).toEqual([second])
    expect(editor.appendix.querySelectorAll('[aria-label^="Drag "], [aria-label^="Remove "], [aria-label="Move card up"], [aria-label="Move card down"], [aria-label="Move card left"], [aria-label="Move card right"]')).toHaveLength(0)
  })

  it.each([
    ["card", "[part~='transform-overlay-edge']"],
    ["card", "[part~='transform-overlay-mover']"],
    ["card", "[part~='transform-overlay-board-resize-card']"],
    ["card", "[part~='transform-overlay-delete']"],
    ["column", "[part~='transform-overlay-edge']"],
    ["column", "[part~='transform-overlay-mover']"],
    ["column", "[part~='transform-overlay-board-resize-column']"],
    ["column", "[part~='transform-overlay-delete']"],
    ["column", "[part~='transform-overlay-group']"],
  ])("element-selects the %s from its grey frame affordance %s", async (kind, selector) => {
    convert("board"); await settle(); geometry()
    const target = kind === "card" ? cards()[0] : columns()[0]
    const content = target.querySelector(kind === "card" ? "p" : "h2")!
    $.move(content); editor.features.selection.processSelection(); board().refresh()
    expect($.selectedElement).not.toBe(target)
    const overlay = board().transformOverlay(target)!
    const handle = overlay.querySelector<HTMLElement>(selector)!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 35}))
    expect($.selectedElement).toBe(target)
    expect(target.classList.contains("◆element-selected")).toBe(true)
    document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, composed: true, pointerId: 35}))
    expect($.selectedElement).toBe(target)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("exposes mover, delete, and resize controls and preserves explicit selection when moving", async () => {
    convert("board"); board().addColumn(); await settle(); geometry()
    const [first, second] = columns(), card = board().cards(first)[0]
    editor.features.selection.selectElement(card); board().refresh()
    const cardOverlay = board().transformOverlay(card)!
    expect(cardOverlay.querySelector('[aria-label="Move card 1 in column 1"]')).not.toBeNull()
    expect(cardOverlay.querySelector('[aria-label="Delete card 1 in column 1"]')).not.toBeNull()
    expect(cardOverlay.querySelector('[aria-label="Resize card 1 in column 1"]')).not.toBeNull()
    cardOverlay.querySelector<HTMLButtonElement>('[aria-label="Move card 1 in column 1"]')!.click()
    expect($.selectedElement).toBe(card)
    cardOverlay.querySelector<HTMLButtonElement>('[aria-label="Delete card 1 in column 1"]')!.click()
    expect(board().cards(first)).toHaveLength(0)
    $.move(first.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    const columnOverlay = board().transformOverlay(first)!
    expect(columnOverlay.querySelector('[aria-label="Move column 1"]')).not.toBeNull()
    expect(columnOverlay.querySelector('[aria-label="Delete column 1"]')).not.toBeNull()
    expect(columnOverlay.querySelector('[aria-label="Resize column 1"]')).not.toBeNull()
    columnOverlay.querySelector<HTMLButtonElement>('[aria-label="Delete column 1"]')!.click()
    expect(columns()).toEqual([second])
  })

  it("cleans controls when selection targets are replaced and excludes them from serialization", async () => {
    convert("board"); await settle(); geometry()
    const column = columns()[0], card = board().cards(column)[0]
    $.move(card.querySelector("p")!); editor.features.selection.processSelection(); board().refresh()
    expect(board().transformOverlay(card)).not.toBeNull()
    const saved = await editor.serializeHTML(true)
    expect(saved).not.toContain("transform-overlay")
    card.replaceWith(card.cloneNode(true)); await settle(); board().refresh()
    expect(board().transformOverlay(card)).toBeNull()
    expect(editor.appendix.querySelector('[aria-label^="Move card "]')).toBeNull()
  })

  it("restores authored dimensions when a board resize gesture is cancelled", async () => {
    convert("board"); await settle()
    const card = cards()[0]
    card.style.maxWidth = "100px"; card.style.maxHeight = "50px"
    geometry()
    $.move(card.querySelector("p")!); editor.features.selection.processSelection(); board().refresh()
    const handle = board().transformOverlay(card)?.querySelector<HTMLElement>("[part~='transform-overlay-board-resize-card']")!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 31, clientX: 160, clientY: 190}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, buttons: 1, pointerId: 31, clientX: 180, clientY: 210}))
    await settle()
    expect(card.style.maxHeight).not.toBe("50px")
    expect(card.style.height).not.toBe("")
    expect(card.style.maxWidth).toBe("100px")
    expect(card.style.width).toBe("")
    document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true, composed: true, pointerId: 31}))
    await settle()
    expect(card.style.maxWidth).toBe("100px")
    expect(card.style.maxHeight).toBe("50px")
    expect(card.style.width).toBe("")
    expect(card.style.height).toBe("")
    expect(card.className).not.toContain("◆transform-target")
    expect(document.body.className).not.toContain("◆transform-scaling-")
  })

  it("resizes columns horizontally despite vertical pointer movement and restores the size on undo", async () => {
    convert("board"); await settle(); geometry()
    const column = columns()[0]
    $.move(column.querySelector("h2")!); editor.features.selection.processSelection(); board().refresh()
    await settle(); editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const initial = {width: column.style.width, flexBasis: column.style.flexBasis, height: column.style.height, maxHeight: column.style.maxHeight}
    const handle = board().transformOverlay(column)?.querySelector<HTMLElement>("[part~='transform-overlay-board-resize-column']")!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 32, clientX: 320, clientY: 270}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, buttons: 1, pointerId: 32, clientX: 340, clientY: 310}))
    await settle()
    expect(column.style.width).not.toBe(initial.width)
    expect(column.style.flexBasis).not.toBe(initial.flexBasis)
    expect(column.style.height).toBe(initial.height)
    expect(column.style.maxHeight).toBe(initial.maxHeight)
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, pointerId: 32}))
    await settle(); editor.doc.undo(); await settle()
    expect(column.style.width).toBe(initial.width)
    expect(column.style.flexBasis).toBe(initial.flexBasis)
    expect(column.style.height).toBe(initial.height)
    expect(column.style.maxHeight).toBe(initial.maxHeight)
    expect(column.className).not.toContain("◆transform-target")
    expect(document.body.className).not.toContain("◆transform-scaling-")
  })

  it("keeps media authored dimensions intact through card resize, undo, redo and remote resizing", async () => {
    convert("board"); await settle()
    const card = cards()[0]
    card.innerHTML = '<!--keep--><figure title="Authored"><picture><source srcset="image.png"><img src="image.png" alt="Keep" width="800" height="600" style="width: 100%; height: auto"></picture><figcaption>Caption</figcaption></figure><custom-card answer="42"></custom-card>'
    const content = card.innerHTML, children = Array.from(card.childNodes)
    geometry(); editor.features.selection.selectElement(card); board().refresh()
    await settle(); editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const handle = board().transformOverlay(card)!.querySelector<HTMLElement>("[part~='transform-overlay-board-resize-card']")!
    handle.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 33, clientX: 160, clientY: 190}))
    document.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, buttons: 1, pointerId: 33, clientX: 160, clientY: 150}))
    document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, pointerId: 33}))
    await settle()
    expect(Array.from(card.childNodes)).toEqual(children)
    const resized = card.getAttribute("style")
    expect(card.style.height).not.toBe("")
    const authoredCard = () => new DOMParser().parseFromString(editor.toHTML(true), "text/html").querySelector(".ww-board-card")!
    expect(authoredCard().innerHTML).toBe(content)
    editor.doc.undo(); await settle()
    expect(cards()[0].style.height).toBe("")
    expect(authoredCard().innerHTML).toBe(content)
    editor.doc.redo(); await settle()
    expect(cards()[0].getAttribute("style")).toBe(resized)
    expect(authoredCard().innerHTML).toBe(content)

    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const column = sharedDOMBody(remote).toArray().find(node => node instanceof Y.XmlElement && node.nodeName === "section") as Y.XmlElement
      const remoteCard = column.toArray().find(node => node instanceof Y.XmlElement && node.nodeName === "article") as Y.XmlElement
      remoteCard.setAttribute("style", "height: 140px; max-height: 140px")
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client"); await settle()
      expect(cards()[0].style.height).toBe("140px")
      expect(authoredCard().innerHTML).toBe(content)
      expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆")
      expect(editor.toHTML(true)).not.toContain("◆")
    }
    finally { remote.destroy() }
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
    expect(board().removeColumn(columns()[0])).toBe(true)
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

  it("keeps blank card paragraphs in shared and serialized HTML", async () => {
    convert("board")
    const card = cards()[0]
    card.innerHTML = '<p></p><p></p><custom-widget>Content</custom-widget>'
    await settle()
    editor.doc.syncFromDOM()
    const remote = new Y.Doc(); Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    expect(sharedDOMBody(remote).toString()).toContain(card.innerHTML)
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(), "text/html")
    expect(saved.querySelector(".ww-board-card")?.innerHTML).toBe(card.innerHTML)
    expect(saved.head.textContent).toContain(boardStyles)
    remote.destroy()
  })
})
