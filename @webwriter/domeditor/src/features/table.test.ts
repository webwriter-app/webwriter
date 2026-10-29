// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "happy-dom"
import "@testing-library/jest-dom/vitest"

import {DOMEditor} from "../domeditor"
import {$} from "../utility"
import {buildTableMap} from "../table"
import {markStateChangeEvent, selectionChangeEvent, type SelectionChangeDetail} from "../editor-bridge"
import * as Y from "yjs"
import {sharedDOMBody} from "../domdoc"

const editor = new DOMEditor()

beforeEach(() => {
  editor.features.table.clearCellSelection(false)
  editor.features.selection.isInDragSelection = false
  document.body.innerHTML = ""
  document.body.className = ""
  $.selectDocumentStart()
})

function cells() {
  return Array.from(document.querySelectorAll<HTMLTableCellElement>("td, th"))
}

function mockCaretPosition(node: Node, offset = 0) {
  const original = document.caretPositionFromPoint
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({offsetNode: node, offset, getClientRect: () => node.parentElement?.getBoundingClientRect()}),
  })
  return () => Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: original})
}

describe("table grid", () => {
  it("maps captions, row groups, header cells, and merged cells without normalizing them", () => {
    document.body.innerHTML = `
      <table id="data">
        <caption>Data</caption>
        <colgroup><col span="2"></colgroup>
        <thead><tr><th rowspan="2">A</th><th>B</th></tr></thead>
        <tbody><tr><td>C</td></tr><tr><td colspan="2">D</td></tr></tbody>
        <tfoot><tr><td>E</td><td>F</td></tr></tfoot>
      </table>`
    const table = document.querySelector("table")!

    const map = buildTableMap(table)

    expect(map.rows).toHaveLength(4)
    expect(map.width).toBe(2)
    expect(map.matrix[0][0]?.cell.textContent).toBe("A")
    // A rowspan cannot cross out of THEAD, so C begins in the first column.
    expect(map.matrix[1][0]?.cell.textContent).toBe("C")
    expect(table.querySelector("col")?.getAttribute("span")).toBe("2")
  })

  it("treats rowspan=0 as extending to the end of its row group", () => {
    document.body.innerHTML = `<table><tbody>
      <tr><td rowspan="0">A</td><td>B</td></tr>
      <tr><td>C</td></tr><tr><td>D</td></tr>
    </tbody></table>`
    const map = buildTableMap(document.querySelector("table")!)

    expect(map.matrix[2][0]?.cell.textContent).toBe("A")
    expect(map.matrix[2][1]?.cell.textContent).toBe("D")
  })

  it("bounds spans to the current row group after direct edits without repeated group scans", () => {
    const table = document.createElement("table")
    table.innerHTML = '<tbody>' + '<tr><td rowspan="0">A</td><td>B</td></tr>'
      + '<tr><td>C</td></tr>'.repeat(99) + '</tbody><tbody><tr><td>D</td></tr></tbody>'
    document.body.replaceChildren(table)
    const rows = Array.from(table.querySelectorAll("tr"))
    const parents = rows.map(row => vi.spyOn(row, "parentElement", "get"))
    const map = buildTableMap(table)
    expect(map.placements[0].rowSpan).toBe(100)
    expect(map.matrix[100][0]?.cell.textContent).toBe("D")
    expect(parents.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBeLessThan(rows.length * 6)
    parents.forEach(spy => spy.mockRestore())

    // A second call must inspect the actual DOM rather than a retained map.
    table.tBodies[1].prepend(rows[99])
    expect(buildTableMap(table).placements[0].rowSpan).toBe(99)
    expect(rows[0].cells[0].getAttribute("rowspan")).toBe("0")
  })

  it.each([false, true])("builds one fresh map for selection state (cell selection: %s)", cellSelection => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    if(cellSelection) editor.features.table.selectCells(cells()[0], cells()[1])
    else $.move(cells()[0].firstChild!, 0)
    const queries = vi.spyOn(table, "querySelectorAll")
    const state = editor.features.table.getState()
    expect(state).toMatchObject({rows: 2, columns: 2, selectedCells: cellSelection ? 2 : 0})
    expect(queries.mock.calls.filter(([selector]) => selector === "tr")).toHaveLength(1)
    table.rows[1].insertCell().textContent = "E"
    expect(editor.features.table.getState()?.columns).toBe(3)
    queries.mockRestore()
  })

  it("bounds raw oversized column spans to the HTML table limit", () => {
    document.body.innerHTML = '<table><tbody><tr><td colspan="4294967296">A</td></tr></tbody></table>'

    const map = buildTableMap(document.querySelector("table")!)

    expect(map.width).toBe(1000)
    expect(map.placements[0].columnSpan).toBe(1000)
  })

  it("returns an empty map when combined row and column spans exceed the occupancy limit", () => {
    const table = document.createElement("table")
    table.innerHTML = `<tbody><tr>${"<td colspan='1000'></td>".repeat(10)}</tr>${"<tr></tr>".repeat(100)}</tbody>`
    document.body.replaceChildren(table)

    const map = buildTableMap(table)
    expect(map).toMatchObject({rows: [], matrix: [], placements: [], width: 0, limited: true})
    editor.features.table.actions.normalizeTable({type: "normalizeTable"})
    expect(table.rows).toHaveLength(101)
  })

  it("rejects paste growth beyond the map limit before changing the table", () => {
    document.body.innerHTML = "<table><tbody><tr><td>Keep</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    $.move(table.querySelector("td")!, 0)
    const original = table.outerHTML
    const matrix: Node[][][] = Array.from({length: 1001}, () => [])
    matrix.at(-1)!.length = 1000
    const pasteMatrix = (editor.features.table as unknown as {
      pasteMatrix(matrix: Node[][][]): boolean
    }).pasteMatrix

    expect(pasteMatrix.call(editor.features.table, matrix)).toBe(false)
    expect(table.outerHTML).toBe(original)
  })

  it("does not expose table internals through generic direct insertion", () => {
    document.body.innerHTML = "<table><tbody><tr><td></td></tr></tbody></table>"
    const row = document.querySelector("tr")!
    $.move(row, 0)

    expect(editor.schema.findValidTypesToInsert()).not.toContain("td")
    expect(editor.schema.findValidTypesToInsert()).not.toContain("th")
    expect(editor.schema.findValidContentTypes(row)).toContain("td")
  })

  it("does not classify positions between table internals as gap selections", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    $.move(document.querySelector("tr")!, 1)

    expect($.isGapSelection).toBe(false)
  })

  it("reports only BODY and TABLE in the breadcrumb path for a cell selection", () => {
    document.body.innerHTML = '<table><tbody><tr><td headers="name">A</td></tr></tbody></table>'
    let detail: SelectionChangeDetail | undefined
    const listener = (event: Event) => detail = (event as CustomEvent<SelectionChangeDetail>).detail
    window.addEventListener(selectionChangeEvent, listener, {once: true})

    editor.features.table.selectCells(cells()[0])

    expect(detail?.path.map(item => item.path)).toEqual([[], [0]])
    expect(detail?.element).toEqual(expect.objectContaining({
      path: [0, 0, 0, 0],
      localName: "td",
      name: "Table Cell",
      attributes: {headers: "name"},
    }))
  })
})

describe("table cell selection", () => {
  it("moves Tab and Shift+Tab through distinct cells in irregular header and body rows", () => {
    document.body.innerHTML = '<table><thead><tr><th rowspan="2">A</th><th>B</th></tr></thead><tbody><tr><td>C</td></tr><tr><td colspan="2">D</td></tr></tbody></table>'
    const [a, b, c, d] = cells()
    $.move(b.firstChild!, 1)
    const tab = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
    document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect($.anchor).toBe(c)

    const shiftTab = new KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, cancelable: true})
    document.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect($.anchor).toBe(b)

    $.move(d.firstChild!, 0)
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, cancelable: true}))
    expect($.anchor).toBe(c)
    expect([a, b, c, d].every(cell => !cell.className.includes("◆table-cell-selected"))).toBe(true)
  })

  it("leaves Tab unhandled at table boundaries and inside nested tables uses the innermost cell", () => {
    document.body.innerHTML = '<table><tbody><tr><td id="outer">A<table><tbody><tr><td id="inner">X</td></tr></tbody></table></td><td id="last">B</td></tr></tbody></table>'
    const outer = document.querySelector("#outer") as HTMLTableCellElement
    const inner = document.querySelector("#inner") as HTMLTableCellElement
    const last = document.querySelector("#last") as HTMLTableCellElement

    $.move(inner.firstChild!, 0)
    const tab = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
    editor.features.table.activeListeners.keydown(tab)
    expect(tab.defaultPrevented).toBe(false)
    expect($.anchor).toBe(inner.firstChild)

    $.move(last.firstChild!, 0)
    const boundary = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})
    editor.features.table.activeListeners.keydown(boundary)
    expect(boundary.defaultPrevented).toBe(false)
    expect($.anchor).toBe(last.firstChild)
    expect(outer.isConnected).toBe(true)
  })

  it("leaves Tab untouched when the caret's cell has been disconnected", () => {
    document.body.innerHTML = '<table><tbody><tr><td id="stale">A</td><td>B</td></tr></tbody></table>'
    const stale = document.querySelector("#stale") as HTMLTableCellElement
    $.move(stale.firstChild!, 0)
    stale.remove()
    const event = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})

    editor.features.table.activeListeners.keydown(event)

    expect(event.defaultPrevented).toBe(false)
    expect(cells().map(cell => cell.textContent)).toEqual(["B"])
  })

  it("clears a partial two-dimensional selection while preserving cell positions and attributes", () => {
    document.body.innerHTML = '<table><tbody><tr><td id="a" headers="one"><b>A</b></td><td>B</td><td>C</td></tr><tr><td>D</td><td id="e" headers="two"><i>E</i></td><td>F</td></tr><tr><td>G</td><td>H</td><td>I</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const [a, , , , e] = cells()
    const originalCells = cells()
    editor.features.table.selectCells(a, e)

    expect(editor.features.table.deleteSelection()).toBe(true)

    expect(cells()).toEqual(originalCells)
    expect(buildTableMap(table).matrix.map(row => row.map(placement => placement?.cell.textContent ?? ""))).toEqual([
      ["", "", "C"], ["", "", "F"], ["G", "H", "I"],
    ])
    expect(a).toHaveAttribute("id", "a")
    expect(a).toHaveAttribute("headers", "one")
    expect(e).toHaveAttribute("id", "e")
    expect(a.querySelector("b")).toBeNull()
    expect(e.querySelector("i")).toBeNull()
  })

  it("removes a complete column across every row and leaves a rectangular table", () => {
    document.body.innerHTML = '<table><tbody><tr><td id="a">A</td><td>B</td><td>C</td></tr><tr><td id="d">D</td><td>E</td><td>F</td></tr><tr><td id="g">G</td><td>H</td><td>I</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const [a, , , d, , , g] = cells()
    editor.features.table.selectCells(a, g)

    expect(editor.features.table.deleteSelection()).toBe(true)

    expect(document.querySelectorAll("#a, #d, #g")).toHaveLength(0)
    expect(buildTableMap(table).width).toBe(2)
    expect(buildTableMap(table).matrix.every(row => row.length === 2 && row.every(Boolean))).toBe(true)
    expect(cells().map(cell => cell.textContent)).toEqual(["B", "C", "E", "F", "H", "I"])
  })

  it("clears a partial selection beside merged cells without leaving incomplete rows", async () => {
    document.body.innerHTML = '<table><tbody><tr><td rowspan="2" colspan="2" data-keep="merged">M</td><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr><tr><td>E</td><td>F</td><td>G</td><td>H</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const [merged, a, b, c, d, e, f, g, h] = cells()
    editor.features.table.selectCells(a, b)

    expect(editor.features.table.deleteSelection()).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))

    const map = buildTableMap(table)
    expect(map.width).toBe(4)
    expect(map.matrix.every(row => row.length === map.width && row.every(Boolean))).toBe(true)
    expect(merged).toHaveAttribute("rowspan", "2")
    expect(merged).toHaveAttribute("colspan", "2")
    expect(merged).toHaveAttribute("data-keep", "merged")
    expect(map.matrix[1][0]?.cell).toBe(merged)
    expect([c, d, e, f, g, h].every(cell => cell.isConnected)).toBe(true)
  })

  it("deletes complete rows covered by a merged cell and preserves the remaining row", () => {
    document.body.innerHTML = '<table><tbody><tr><td rowspan="2" colspan="2">M</td><td>A</td></tr><tr><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const remaining = Array.from(table.rows[2].cells)
    editor.features.table.selectCells(cells()[0], cells()[2])

    expect(editor.features.table.deleteSelection()).toBe(true)
    expect(table.rows).toHaveLength(1)
    expect(Array.from(table.rows[0].cells)).toEqual(remaining)
    expect(buildTableMap(table).matrix[0].every(Boolean)).toBe(true)
    expect(remaining.map(cell => cell.textContent)).toEqual(["C", "D", "E"])
  })

  it("repairs an interior occupancy hole beneath a rowspan without moving authored nodes", async () => {
    document.body.innerHTML = '<table><tbody><tr><td rowspan="2">A</td><td>B</td><td rowspan="2">C</td><td>D</td></tr><tr><td colspan="2" id="wide">Wide</td><td id="tail">Tail</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const merged = table.querySelector("td[rowspan]")!
    const wide = table.querySelector("#wide")!
    const tail = table.querySelector("#tail")!
    const comment = document.createComment("authored")
    tail.before(comment)
    table.querySelector("tbody tr:last-child")!.append(document.createElement("test-widget"))
    await new Promise(resolve => setTimeout(resolve, 0))

    const map = buildTableMap(table)
    expect(map.matrix[1].map(placement => placement?.cell.textContent)).toEqual(["A", "", "C", "Wide", "Wide", "Tail"])
    expect(map.matrix.every(row => row.length === map.width && row.every(Boolean))).toBe(true)
    expect(merged).toHaveAttribute("rowspan", "2")
    expect(map.matrix[1][0]?.cell).toBe(merged)
    expect(map.matrix[1][3]?.cell).toBe(wide)
    expect(map.matrix[1][5]?.cell).toBe(tail)
    expect(tail.previousSibling).toBe(comment)
    expect(tail.parentElement?.querySelector("test-widget")).not.toBeNull()
    expect(table.querySelectorAll("td")).toHaveLength(9)
  })

  it("repairs direct table mutations idempotently and leaves widget-owned tables untouched", async () => {
    document.body.innerHTML = '<table id="normal"><tbody><tr><td>A</td><td>B</td></tr></tbody></table><table-data-widget><table id="owned"><tbody><tr><td>Widget</td></tr></tbody></table></table-data-widget>'
    const normal = document.querySelector("#normal") as HTMLTableElement
    const owned = document.querySelector("#owned") as HTMLTableElement
    const ownedRow = owned.rows[0]
    normal.rows[0].deleteCell(0)
    owned.rows[0].deleteCell(0)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(buildTableMap(normal).matrix[0].every(Boolean)).toBe(true)
    expect(normal.rows[0].cells).toHaveLength(1)
    expect(owned.rows[0]).toBe(ownedRow)
    expect(owned.rows[0].cells).toHaveLength(0)
  })

  it("shares blanks repaired after a remote cell deletion without sharing editor markers", async () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const table = sharedDOMBody(remote).get(0) as Y.XmlElement
      const body = table.get(0) as Y.XmlElement
      const firstRow = body.get(0) as Y.XmlElement
      firstRow.delete(0, 1)
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-table")
      await new Promise(resolve => setTimeout(resolve, 0))
      await new Promise(resolve => setTimeout(resolve, 0))

      const live = document.querySelector("table")!
      expect(buildTableMap(live).matrix.every(row => row.length === 2 && row.every(Boolean))).toBe(true)
      editor.doc.syncFromDOM()
      expect(editor.doc.body.toString()).toContain("<td></td>")
      expect(editor.toHTML(true)).not.toContain("◆")
      expect(editor.doc.body.toString()).not.toContain("◆")
    }
    finally { remote.destroy() }
  })

  it("undoes and redoes a partial cell-content clear", () => {
    document.body.innerHTML = '<table><tbody><tr><td><b>A</b></td><td>B</td><td>C</td></tr><tr><td>D</td><td><i>E</i></td><td>F</td></tr><tr><td>G</td><td>H</td><td><u>I</u></td></tr></tbody></table>'
    editor.doc.syncFromDOM()
    const original = editor.toHTML(true)
    editor.doc.stopCapturing()
    editor.features.table.selectCells(cells()[1], cells()[4])

    editor.features.table.deleteSelection()
    editor.doc.syncFromDOM()
    expect(cells().map(cell => cell.textContent)).toEqual(["A", "", "C", "D", "", "F", "G", "H", "I"])
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(original)
    editor.doc.redo()
    expect(cells().map(cell => cell.textContent)).toEqual(["A", "", "C", "D", "", "F", "G", "H", "I"])
  })

  describe.each(["MacIntel", "Win32"])("modifier table selection on %s", platform => {
    const originalPlatform = navigator.platform
    const modifier = platform === "MacIntel" ? {metaKey: true} : {ctrlKey: true}

    beforeEach(() => {
      Object.defineProperty(navigator, "platform", {value: platform, configurable: true})
      document.body.innerHTML = "<table><tbody><tr><th><strong>A</strong></th><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
      document.querySelector("table")!.getBoundingClientRect = () => new DOMRect(0, 0, 200, 60)
      cells().forEach((cell, index) => {
        cell.getBoundingClientRect = () => new DOMRect(index % 2 * 100, Math.floor(index / 2) * 30, 100, 30)
      })
    })

    afterEach(() => {
      document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    })

    it.each([false, true])("keeps the clicked cell selected after pointer movement (existing cell selection: %s)", existingSelection => {
      const table = document.querySelector("table")!
      if(existingSelection) editor.features.table.selectCells(cells()[0])
      const pointerdown = new PointerEvent("pointerdown", {
        ...modifier, shiftKey: existingSelection, clientX: 50, clientY: 15, bubbles: true, cancelable: true,
      })
      table.querySelector("strong")!.dispatchEvent(pointerdown)

      expect(pointerdown.defaultPrevented).toBe(true)
      expect(editor.features.table.selectedCells).toEqual([cells()[0]])
      expect(table).not.toHaveClass("◆element-selected")
      expect(document.body).toHaveClass("◆table-cell-selection")
      expect(document.body).not.toHaveClass("◆table-column-edge")

      table.dispatchEvent(new PointerEvent("pointermove", {
        ...modifier, buttons: 1, clientX: 51, clientY: 15, bubbles: true, cancelable: true,
      }))
      expect(editor.features.table.selectedCells).toEqual([cells()[0]])
      // Releasing the modifier before the pointer must not arm a cell drag.
      cells()[1].dispatchEvent(new PointerEvent("pointermove", {
        buttons: 1, clientX: 150, clientY: 15, bubbles: true, cancelable: true,
      }))
      table.dispatchEvent(new PointerEvent("pointerup", {bubbles: true}))

      expect(table).not.toHaveClass("◆element-selected")
      expect(editor.features.table.selectedCells).toEqual([cells()[0]])
      expect(document.querySelectorAll(".◆table-cell-selected")).toHaveLength(1)
      expect(document.body).toHaveClass("◆table-cell-selection")
      expect(editor.features.selection.isInDragSelection).toBe(false)
    })

    it("selects the cell without resizing an armed inner column edge", () => {
      const table = document.querySelector("table")!
      const first = cells()[0]
      first.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
        toJSON: () => ({}),
      })
      const before = editor.toHTML(true)
      first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true}))
      expect(document.body).toHaveClass("◆table-column-edge")

      first.dispatchEvent(new PointerEvent("pointerdown", {
        ...modifier, clientX: 100, clientY: 15, bubbles: true, cancelable: true,
      }))
      expect(document.body).not.toHaveClass("◆table-column-edge")
      table.dispatchEvent(new PointerEvent("pointermove", {
        ...modifier, buttons: 1, clientX: 130, clientY: 15, bubbles: true, cancelable: true,
      }))
      expect(document.body).not.toHaveClass("◆table-column-resize")
      table.dispatchEvent(new PointerEvent("pointerup", {bubbles: true}))

      expect(editor.features.table.selectedCells).toEqual([first])
      expect(editor.toHTML(true)).toBe(before)
    })

    it.each([
      {selector: "th", x: 100, y: 15, index: 0},
      {selector: "td", x: 100, y: 15, index: 1},
      {selector: "tr", x: 100, y: 15, index: 0},
      {selector: "tbody", x: 50, y: 30, index: 0},
      {selector: "table", x: 150, y: 30, index: 1},
    ])("selects the cell on an inner border targeting $selector at ($x, $y)", ({selector, x, y, index}) => {
      const target = document.querySelector(selector)!
      const received = vi.fn()
      target.addEventListener("pointerdown", received, {capture: true})
      target.addEventListener("click", received, {capture: true})
      for(const type of ["pointerdown", "pointerup", "click"]) {
        const event = new PointerEvent(type, {...modifier, clientX: x, clientY: y, bubbles: true, cancelable: true})
        target.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
      }
      expect(editor.features.table.selectedCells).toEqual([cells()[index]])
      expect(received).not.toHaveBeenCalled()
    })

    it.each([
      {x: 1, y: 15}, {x: 199, y: 15}, {x: 50, y: 1}, {x: 50, y: 59},
    ])("selects the whole table on its outer border at ($x, $y)", ({x, y}) => {
      const table = document.querySelector("table")!
      editor.features.table.selectCells(cells()[0], cells()[3])
      cells()[0].dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: x, clientY: y, bubbles: true, cancelable: true}))
      expect($.selectedElement).toBe(table)
      expect(table).toHaveClass("◆element-selected")
      expect(editor.features.table.hasCellSelection).toBe(false)
      expect(document.querySelector(".◆table-cell-selected")).toBeNull()
    })

    it("selects a merged cell through its control and keeps selection artifacts out of HTML", () => {
      document.querySelector("table")!.innerHTML = '<tbody><tr><th rowspan="2"><button>Run</button></th><td>B</td></tr><tr><td>C</td></tr></tbody>'
      const cell = cells()[0]
      const before = editor.toHTML(true)
      const button = cell.querySelector("button")!
      const activated = vi.fn()
      button.addEventListener("click", activated)
      for(const type of ["pointerdown", "click"]) button.dispatchEvent(new PointerEvent(type, {
        ...modifier, clientX: 50, clientY: 15, bubbles: true, cancelable: true,
      }))
      expect(editor.features.table.selectedCells).toEqual([cell])
      expect(activated).not.toHaveBeenCalled()
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).toBe(before)
      expect(sharedDOMBody(editor.doc.doc).toString()).not.toContain("◆")
      editor.features.table.clearCellSelection()
      expect(document.querySelector(".◆table-cell-selected")).toBeNull()
    })

    it("releases capture and focused shadow controls inside a cell", () => {
      const cell = cells()[0]
      const widget = document.createElement("table-control-widget")
      const button = document.createElement("button")
      widget.attachShadow({mode: "open"}).append(button)
      cell.append(widget)
      editor.features.selection.captureElement(widget)
      button.focus()
      button.dispatchEvent(new PointerEvent("pointerdown", {
        ...modifier, clientX: 50, clientY: 15, bubbles: true, composed: true, cancelable: true,
      }))
      expect(editor.features.table.selectedCells).toEqual([cell])
      expect(editor.features.selection.isCaptureSelection).toBe(false)
      expect(widget).not.toHaveClass("◆element-capture-selected")
      expect(widget.shadowRoot!.activeElement).not.toBe(button)
    })

    it("selects the nearest cell in border spacing and honors thick outer borders", () => {
      const table = document.querySelector("table")!
      cells()[0].getBoundingClientRect = () => new DOMRect(10, 10, 80, 20)
      cells()[1].getBoundingClientRect = () => new DOMRect(110, 10, 80, 20)
      table.dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: 99, clientY: 15, bubbles: true, cancelable: true}))
      expect(editor.features.table.selectedCells).toEqual([cells()[0]])
      table.style.border = "10px solid black"
      cells()[0].dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: 8, clientY: 15, bubbles: true, cancelable: true}))
      expect($.selectedElement).toBe(table)
      expect(editor.features.table.hasCellSelection).toBe(false)
    })

    it("selects cells in the innermost table", () => {
      const outer = document.querySelector("table")!
      const nested = document.createElement("table")
      nested.innerHTML = "<tr><td>Nested</td></tr>"
      cells()[0].append(nested)
      nested.getBoundingClientRect = () => new DOMRect(10, 10, 80, 40)
      nested.querySelector("td")!.dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: 50, clientY: 25, bubbles: true, cancelable: true}))
      expect(editor.features.table.selectedCells).toEqual([nested.querySelector("td")])
      nested.dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: 11, clientY: 25, bubbles: true, cancelable: true}))
      expect($.selectedElement).toBe(nested)
      expect(outer).not.toHaveClass("◆element-selected")
    })

    it.each(["top", "bottom"])("selects the outer grid border beside a %s caption", side => {
      const table = document.querySelector("table")!
      const caption = table.createCaption()
      caption.textContent = "Caption"
      caption.style.captionSide = side
      table.getBoundingClientRect = () => new DOMRect(0, 0, 200, 90)
      caption.getBoundingClientRect = () => new DOMRect(0, side === "top" ? 0 : 60, 200, 30)
      cells()[0].dispatchEvent(new PointerEvent("pointerdown", {...modifier, clientX: 50,
        clientY: side === "top" ? 31 : 59, bubbles: true, cancelable: true}))
      expect($.selectedElement).toBe(table)
      expect(editor.features.table.hasCellSelection).toBe(false)
    })
  })

  it("does not refresh recursively from its own selection markers", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    await new Promise(resolve => setTimeout(resolve, 0))
    const table = editor.features.table
    const scheduleRefresh = vi.spyOn(table as unknown as {scheduleRefresh: () => void}, "scheduleRefresh")

    table.selectCells(cells()[0])
    await new Promise(resolve => setTimeout(resolve, 0))

    // Marker-only class mutations must not schedule a breadcrumb refresh. The
    // native selectionchange raised by selectCells may independently post it.
    expect(scheduleRefresh).not.toHaveBeenCalled()

    cells()[0].setAttribute("title", "authored change")
    await vi.waitFor(() => {
      expect(scheduleRefresh).toHaveBeenCalled()
    }, {timeout: 5_000})
    scheduleRefresh.mockRestore()
  })

  it("expands a drag-style selection around merged cells and removes markers from serialization", () => {
    document.body.innerHTML = `<table><tbody>
      <tr><td rowspan="2">A</td><td>B</td><td>C</td></tr>
      <tr><td>D</td><td>E</td></tr>
    </tbody></table>`
    const [merged, , , , end] = cells()

    editor.features.table.selectCells(merged, end)

    expect(editor.features.table.selectedCells).toHaveLength(5)
    expect(document.querySelectorAll(".◆table-cell-selected")).toHaveLength(5)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("is the only active top-level selection presentation", () => {
    document.body.innerHTML = "<p>Text</p><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const paragraph = document.querySelector("p")!
    $.selectElement(paragraph)
    editor.features.selection.processSelection()
    expect(editor.features.selection.selectionCaret?.getAttribute("part")).toContain("selection-caret-node")

    $.selectRange(cells()[0].firstChild!, 0, cells()[0].firstChild!, 1)
    editor.features.selection.processSelection()
    editor.features.table.selectCells(cells()[0], cells()[1])

    expect(document.body).toHaveClass("◆table-cell-selection")
    expect(document.body).not.toHaveClass("◆node-selection-active")
    expect(document.querySelector(".◆text-selected, .◆element-selected, .◆gap-before-selected, .◆gap-after-selected")).toBeNull()
    expect(editor.features.selection.selectionCaret?.getAttribute("part")).toContain("selection-caret-hidden")
    expect(editor.features.selection.selectionCaret).toHaveAttribute("visibility", "hidden")
  })

  it("switches a text drag to cells outside its origin and restores text when it returns", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    const [first, , , last] = cells()
    const firstText = first.firstChild!
    const lastText = last.firstChild!
    const rectangle = {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30, toJSON: () => ({})}
    first.getBoundingClientRect = () => rectangle
    last.getBoundingClientRect = () => rectangle
    const originalCaretPositionFromPoint = document.caretPositionFromPoint
    let caretPosition = {offsetNode: firstText, offset: 0, getClientRect: () => rectangle}
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => caretPosition,
    })

    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 10, clientY: 15, bubbles: true, cancelable: true}))
    caretPosition = {offsetNode: firstText, offset: 1, getClientRect: () => rectangle}
    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))

    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.anchor).toBe(firstText)
    expect($.anchorOffset).toBe(0)
    expect($.focus).toBe(firstText)
    expect($.focusOffset).toBe(1)

    caretPosition = {offsetNode: lastText, offset: 1, getClientRect: () => rectangle}
    last.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 45, bubbles: true, cancelable: true}))

    expect(editor.features.table.selectedCells).toHaveLength(4)

    caretPosition = {offsetNode: firstText, offset: 1, getClientRect: () => rectangle}
    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))

    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.anchor).toBe(firstText)
    expect($.anchorOffset).toBe(0)
    expect($.focus).toBe(firstText)
    expect($.focusOffset).toBe(1)

    last.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 45, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 150, clientY: 45, bubbles: true, cancelable: true}))
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: originalCaretPositionFromPoint})

    expect(editor.features.table.selectedCells).toHaveLength(4)
    expect(editor.features.selection.isInDragSelection).toBe(false)
  })

  it("publishes only the completed text range when a cell drag returns to its origin", () => {
    document.body.innerHTML = "<table><tbody><tr><td><p>Alpha</p></td><td>Beta</td></tr></tbody></table>"
    const [first, last] = cells()
    const text = first.querySelector("p")!.firstChild!
    first.getBoundingClientRect = () => new DOMRect(0, 0, 100, 30)
    const originalCaretPosition = document.caretPositionFromPoint
    let point = {offsetNode: text, offset: 1, getClientRect: () => new DOMRect(10, 0, 1, 20)}
    Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: () => point})
    const states: Array<{collapsed: boolean, table: boolean, cells: boolean}> = []
    const marks: boolean[] = []
    const onSelection = (event: Event) => {
      const detail = (event as CustomEvent<SelectionChangeDetail>).detail
      states.push({collapsed: $.isEmpty, table: Boolean(detail.table?.active), cells: Boolean(detail.table?.cellSelection)})
    }
    const onMarks = (event: Event) => marks.push((event as CustomEvent).detail.canMark)
    try {
      first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 10, clientY: 15, bubbles: true, cancelable: true}))
      last.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 15, bubbles: true, cancelable: true}))
      expect(editor.features.table.hasCellSelection).toBe(true)
      window.addEventListener(selectionChangeEvent, onSelection)
      window.addEventListener(markStateChangeEvent, onMarks)
      point = {...point, offset: 4}
      first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
      document.dispatchEvent(new Event("selectionchange"))
      expect(window.getSelection()?.toString()).toBe("lph")
      expect(states.length).toBeGreaterThan(0)
      expect(states).toEqual(states.map(() => ({collapsed: false, table: true, cells: false})))
      expect(marks.length).toBeGreaterThan(0)
      expect(marks.every(Boolean)).toBe(true)
    }
    finally {
      window.removeEventListener(selectionChangeEvent, onSelection)
      window.removeEventListener(markStateChangeEvent, onMarks)
      document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
      Object.defineProperty(document, "caretPositionFromPoint", {configurable: true, value: originalCaretPosition})
    }
  })

  it.each([1, 2, 3])("collapses a non-text drag from cell %s back to its anchor", focusIndex => {
    document.body.innerHTML = "<table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>"
    const tableCells = cells()
    const first = tableCells[0]
    const second = tableCells[focusIndex]
    const expanded = focusIndex === 3 ? tableCells : [first, second]
    const restoreCaretPosition = mockCaretPosition(first)

    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    second.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 15, bubbles: true, cancelable: true}))
    expect(editor.features.table.selectedCells).toEqual(expanded)

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    expect(editor.features.table.selectedCells).toEqual([first])
    expect(Array.from(document.querySelectorAll(".◆table-cell-selected"))).toEqual([first])

    second.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 15, bubbles: true, cancelable: true}))
    expect(editor.features.table.selectedCells).toEqual(expanded)

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(editor.features.table.selectedCells).toEqual([first])
  })

  it("places the caret in a clicked cell when Chromium reports the body boundary", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const first = cells()[0]
    table.getBoundingClientRect = () => ({
      x: 0, y: 100, left: 0, right: 200, top: 100, bottom: 140,
      width: 200, height: 40, toJSON: () => ({}),
    })
    const restoreCaretPosition = mockCaretPosition(document.body, 1)

    first.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: 50,
      clientY: 120,
      bubbles: true,
      cancelable: true,
    }))
    document.dispatchEvent(new PointerEvent("pointerup", {
      clientX: 50,
      clientY: 120,
      bubbles: true,
      cancelable: true,
    }))
    restoreCaretPosition()

    expect(first.contains($.anchor)).toBe(true)
    expect(table).not.toHaveClass("◆gap-after-selected")
    expect(document.body).not.toHaveClass("◆gap-caret-visible")
  })

  it("extends a cell drag to the nearest table edge after the pointer leaves the table", () => {
    document.body.innerHTML = `<table><tbody>
      <tr><td>A</td><td>B</td><td>C</td></tr>
      <tr><td>D</td><td>E</td><td>F</td></tr>
      <tr><td>G</td><td>H</td><td>I</td></tr>
    </tbody></table>`
    const tableCells = cells()
    const table = document.querySelector("table")!
    table.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, right: 300, top: 0, bottom: 90,
      width: 300, height: 90, toJSON: () => ({}),
    })
    tableCells.forEach((cell, index) => {
      const row = Math.floor(index / 3)
      const column = index % 3
      cell.getBoundingClientRect = () => ({
        x: column * 100, y: row * 30,
        left: column * 100, right: column * 100 + 100,
        top: row * 30, bottom: row * 30 + 30,
        width: 100, height: 30, toJSON: () => ({}),
      })
    })
    const origin = tableCells[4]
    const restoreCaretPosition = mockCaretPosition(origin.firstChild!)

    origin.dispatchEvent(new PointerEvent("pointerdown", {clientX: 150, clientY: 45, bubbles: true, cancelable: true}))
    origin.dispatchEvent(new PointerEvent("pointermove", {clientX: 350, clientY: 110, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 350, clientY: 110, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(editor.features.table.selectedCells).toEqual([tableCells[4], tableCells[5], tableCells[7], tableCells[8]])
  })

  it("navigates between cells and changes to an outer gap at a table edge", () => {
    document.body.innerHTML = "<p>Before</p><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table><p>After</p>"
    const [first, second] = cells()
    editor.features.table.selectCells(first)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
    expect(editor.features.table.selectedCells).toEqual([second])

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true}))
    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.isGapSelection).toBe(true)
    expect($.elementAfter).toBe(document.querySelector("table"))
  })

  it.each(["Backspace", "Delete"])("removes selected cells on %s and selects the next surviving cell", key => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td><strong>B</strong></td><td>C</td></tr></tbody></table>"
    const [first, second] = cells()
    editor.features.table.selectCells(first, second)
    const event = new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(cells().map(cell => cell.textContent)).toEqual(["C"])
    expect(editor.features.table.selectedCells).toEqual(cells())
  })

  it.each(["Backspace", "Delete"])("removes the table after deleting its last cell with %s", key => {
    document.body.innerHTML = "<p>Before</p><table><tbody><tr><td>A</td></tr></tbody></table><p>After</p>"
    const table = document.querySelector("table")!
    const cell = cells()[0]
    editor.features.table.selectCells(cell)

    document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))

    expect(cells()).toHaveLength(0)
    expect(table.isConnected).toBe(false)
    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(1)
    expect(editor.toHTML(true)).toBe("<p>Before</p><p>After</p>")
    expect(cell.className).not.toContain("◆")
    expect(document.body.className).not.toContain("◆table-cell-selection")
  })

  it.each(["Backspace", "Delete"])("removes a row after deleting its last cell with %s", key => {
    document.body.innerHTML = '<table><tbody><tr id="remove"><td>A</td></tr><tr id="keep"><td>B</td></tr></tbody></table>'
    const [first, second] = cells()
    editor.features.table.selectCells(first)

    document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))

    expect(document.querySelector("#remove")).toBeNull()
    expect(document.querySelectorAll("tr")).toHaveLength(1)
    expect(editor.features.table.selectedCells).toEqual([second])
    expect(first.className).not.toContain("◆")
  })

  it("removes emptied selected rows without changing other rows or their content", () => {
    document.body.innerHTML = '<table><thead><tr><th colspan="2">A</th></tr></thead><tbody><tr id="empty"><!--Preserve--></tr><tr><td>B</td><td>C</td></tr><tr id="keep"><td><table><tbody><tr><td>Nested</td></tr></tbody></table></td><td>D</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const emptyRow = document.querySelector("#empty")!
    const remainingRow = document.querySelector("#keep")!
    const remainingNodes = Array.from(remainingRow.querySelectorAll("*"))
    editor.features.table.selectCells(cells()[0], cells()[2])

    expect(editor.features.table.deleteSelection()).toBe(true)

    expect(buildTableMap(table).rows).toEqual([emptyRow, remainingRow])
    expect(emptyRow.innerHTML).toBe("<!--Preserve-->")
    expect(Array.from(remainingRow.querySelectorAll("*"))).toEqual(remainingNodes)
    expect(remainingRow.textContent).toBe("NestedD")
  })

  it("cuts a row's last cell and restores the row with undo and redo", () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>'
    editor.doc.syncFromDOM()
    const markup = editor.toHTML(true)
    editor.doc.stopCapturing()
    editor.features.table.selectCells(cells()[1])
    const data = new DataTransfer()

    document.dispatchEvent(new ClipboardEvent("cut", {clipboardData: data, bubbles: true, cancelable: true}))
    editor.doc.syncFromDOM()

    expect(data.getData("text/plain")).toBe("B")
    expect(document.querySelectorAll("tr")).toHaveLength(1)
    expect(editor.features.table.selectedCells).toEqual(cells())
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(markup)
    editor.doc.redo()
    expect(document.querySelectorAll("tr")).toHaveLength(1)
    expect(cells()[0].textContent).toBe("A")
  })

  it("removes a table with captions, empty rows, and merged header cells when all cells are deleted", () => {
    document.body.innerHTML = '<table><caption>Caption</caption><colgroup><col span="2"></colgroup><thead><tr><th colspan="2">A</th></tr></thead><tbody><tr></tr><tr><td>B</td><td>C</td></tr></tbody></table>'
    editor.features.table.selectCells(cells()[0], cells()[2])

    expect(editor.features.table.deleteSelection()).toBe(true)

    expect(document.querySelector("table")).toBeNull()
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(0)
  })

  it("removes only the nested table when its last cell is deleted", () => {
    document.body.innerHTML = '<table id="outer"><tbody><tr><td><table id="inner"><tbody><tr><td>A</td></tr></tbody></table></td></tr></tbody></table>'
    const outerCell = cells()[0]
    editor.features.table.selectCells(cells()[1])

    expect(editor.features.table.deleteSelection()).toBe(true)

    expect(document.querySelector("#inner")).toBeNull()
    expect(document.querySelector("#outer")).not.toBeNull()
    expect(cells()).toEqual([outerCell])
    expect($.anchor).toBe(outerCell)
  })

  it("cuts the last cell and restores the whole table with undo and redo", () => {
    document.body.innerHTML = '<p>Before</p><table><caption>Caption</caption><tbody><tr><td><strong>A</strong></td></tr></tbody></table><p>After</p>'
    editor.doc.syncFromDOM()
    const markup = editor.toHTML(true)
    editor.doc.stopCapturing()
    editor.features.table.selectCells(cells()[0])
    const data = new DataTransfer()

    document.dispatchEvent(new ClipboardEvent("cut", {clipboardData: data, bubbles: true, cancelable: true}))
    editor.doc.syncFromDOM()

    expect(data.getData("text/plain")).toBe("A")
    expect(data.getData("text/html")).not.toContain("◆")
    expect(document.querySelector("table")).toBeNull()
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(markup)
    editor.doc.redo()
    expect(document.querySelector("table")).toBeNull()
  })

  it("copies a rectangular segment as table HTML and TSV text", () => {
    document.body.innerHTML = "<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0], cells()[3])
    const data = new DataTransfer()
    const event = new ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(data.getData("text/plain")).toBe("A\tB\nC\tD")
    expect(data.getData("text/html")).toContain("<table")
    expect(data.getData("text/html")).not.toContain("◆")
  })

  it("does not construct widgets while building table clipboard HTML", () => {
    let constructions = 0
    const tag = "table-serialization-probe"
    if(!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        constructor() {
          super()
          constructions++
        }
      })
    }
    document.body.innerHTML = `<table><tbody><tr><td><${tag}>A</${tag}></td></tr></tbody></table>`
    const cell = cells()[0]
    editor.features.table.selectCells(cell)
    const baseline = constructions
    const data = new DataTransfer()

    document.dispatchEvent(new ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true}))

    expect(data.getData("text/html")).toContain(`<${tag}>A</${tag}>`)
    expect(constructions).toBe(baseline)
  })

  it("does not cut selected cells when a programmatic clipboard write fails", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0])
    const write = navigator.clipboard.write
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")),
    })
    try {
      let rejection: unknown
      try {
        await editor.features.table.cut()
      }
      catch(error) {
        rejection = error
      }
      expect(rejection).toMatchObject({message: "Clipboard denied"})
      expect(cells().map(cell => cell.textContent)).toEqual(["A", "B"])
      expect(editor.features.table.hasCellSelection).toBe(true)
    }
    finally {
      Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: write})
    }
  })

  it("propagates a programmatic clipboard read failure without changing cells", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0])
    const read = navigator.clipboard.read
    Object.defineProperty(navigator.clipboard, "read", {
      configurable: true,
      value: vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")),
    })
    try {
      let rejection: unknown
      try {
        await editor.features.table.paste()
      }
      catch(error) {
        rejection = error
      }
      expect(rejection).toMatchObject({message: "Clipboard denied"})
      expect(cells()[0].textContent).toBe("A")
    }
    finally {
      Object.defineProperty(navigator.clipboard, "read", {configurable: true, value: read})
    }
  })

  it.each(["selection", "content", "equal-content replacement", "equal-HTML cell replacement", "other target cell", "disable", "disable and re-enable"])("does not paste into a stale table after pending clipboard work: %s", async change => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const [first, second] = cells()
    editor.features.table.selectCells(first)
    const read = navigator.clipboard.read
    let resolveRead!: (items: ClipboardItems) => void
    const pendingRead = new Promise<ClipboardItems>(resolve => { resolveRead = resolve })
    Object.defineProperty(navigator.clipboard, "read", {configurable: true, value: () => pendingRead})
    try {
      const paste = editor.features.table.paste()
      if(change === "selection") editor.features.table.selectCells(second)
      if(change === "content") first.textContent = "Changed"
      if(change === "equal-content replacement") first.firstChild!.replaceWith(document.createTextNode("A"))
      if(change === "equal-HTML cell replacement") first.replaceWith(first.cloneNode(true))
      if(change === "other target cell") second.textContent = "Changed"
      if(change === "disable" || change === "disable and re-enable") {
        editor.features.table.disable()
        if(change === "disable and re-enable") {
          editor.features.table.enable()
          editor.features.table.selectCells(first)
        }
      }
      resolveRead([{types: ["text/plain"], getType: async () => new Blob(["Pasted"])}] as unknown as ClipboardItems)
      expect(await paste).toBe(false)
      expect(first.textContent).not.toBe("Pasted")
      expect(first.isConnected).toBe(change !== "equal-HTML cell replacement")
      expect(second.textContent).not.toBe("Pasted")
    }
    finally {
      editor.features.table.enable()
      Object.defineProperty(navigator.clipboard, "read", {configurable: true, value: read})
    }
  })

  it("revalidates the table after a delayed clipboard item read", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    const cell = cells()[0]
    editor.features.table.selectCells(cell)
    const read = navigator.clipboard.read
    let resolveType!: (blob: Blob) => void
    const getType = vi.fn(() => new Promise<Blob>(resolve => { resolveType = resolve }))
    const readClipboard = vi.fn(() => [{types: ["text/plain"], getType}])
    Object.defineProperty(navigator.clipboard, "read", {
      configurable: true,
      value: readClipboard,
    })
    try {
      const paste = editor.features.table.paste()
      await Promise.resolve()
      expect(readClipboard).toHaveBeenCalledOnce()
      expect(getType).toHaveBeenCalledOnce()
      cell.textContent = "Changed during getType"
      resolveType(new Blob(["Pasted"]))
      expect(await paste).toBe(false)
      expect(cell.textContent).toBe("Changed during getType")
    }
    finally { Object.defineProperty(navigator.clipboard, "read", {configurable: true, value: read}) }
  })

  it("pastes into the unchanged selection and supports undo", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const [first, second] = cells()
    editor.features.table.selectCells(first)
    const read = navigator.clipboard.read
    Object.defineProperty(navigator.clipboard, "read", {
      configurable: true,
      value: async () => [{types: ["text/plain"], getType: async () => new Blob(["Pasted"])}],
    })
    try {
      expect(await editor.features.table.paste()).toBe(true)
      expect(first.textContent).toBe("Pasted")
      expect(second.textContent).toBe("B")
      editor.doc.syncFromDOM()
      editor.doc.undo()
      expect(cells().map(cell => cell.textContent)).toEqual(["A", "B"])
    }
    finally { Object.defineProperty(navigator.clipboard, "read", {configurable: true, value: read}) }
  })

  it("pastes TSV segments starting at the selected cell and grows the table", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0])
    const data = new DataTransfer()
    data.setData("text/plain", "1\t2\n3\t4")

    document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))

    expect(buildTableMap(document.querySelector("table")!).rows).toHaveLength(2)
    expect(cells().map(cell => cell.textContent)).toEqual(["1", "2", "3", "4"])
  })

  it("sanitizes and canonizes HTML pasted into a cell selection", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0])
    const data = new DataTransfer()
    data.setData("text/html", '<table><tbody><tr><td><strong class="external" style="color:red" onclick="bad()">safe</strong><script>bad()</script><style>td{color:red}</style></td></tr></tbody></table>')

    document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))

    expect(cells()[0].innerHTML).toBe("<b>safe</b>")
  })

  it("resizes a native table column by dragging a cell edge", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const [first] = cells()
    first.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({}),
    })
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointermove", {clientX: 130, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 130, clientY: 15, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(document.querySelector("colgroup, col")).toBeNull()
    expect(first.style.width).toBe("130px")
    expect(editor.toHTML(true)).toContain("width: 130px")
  })

  it("continues resizing from a persisted inline column width", () => {
    document.body.innerHTML = `<table><tbody><tr><td style="width: 160px">A</td><td>B</td></tr></tbody></table>`
    const [first] = cells()
    first.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({}),
    })
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointermove", {clientX: 120, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 120, clientY: 15, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(first.style.width).toBe("180px")
  })

  it.each([
    "",
    'style="width: 160px"',
  ])("undoes a paused column resize from final to original cells: %s", async style => {
    document.body.innerHTML = `<table><caption>Data</caption><tbody><tr><td ${style}><demo-widget>A</demo-widget></td><td>B</td></tr></tbody></table>`
    const table = document.querySelector("table")!
    const [first] = cells()
    first.getBoundingClientRect = () => new DOMRect(0, 0, 100, 30)
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    table.setAttribute("data-before", "keep")
    const before = editor.toHTML(true)
    try {
      first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true}))
      first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true}))
      for(const clientX of [120, 140, 160]) {
        document.dispatchEvent(new PointerEvent("pointermove", {clientX, clientY: 15, bubbles: true}))
        editor.doc.syncFromDOM()
        if(clientX === 120) await new Promise(resolve => setTimeout(resolve, 550))
      }
      document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true}))
      const after = editor.toHTML(true)
      expect(after).not.toBe(before)
      expect(first.getAttribute("style")).toContain(style ? "220px" : "160px")
      expect(editor.doc.body.toString()).not.toContain("◆")
      table.setAttribute("data-after", "later")
      editor.doc.syncFromDOM()

      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(after)
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(before)
      editor.doc.undo()
      expect(table).not.toHaveAttribute("data-before")
      expect(table.querySelector("demo-widget")).toHaveTextContent("A")
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(before)
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(after)
      editor.doc.redo()
      expect(table).toHaveAttribute("data-after", "later")
    }
    finally {
      document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
      restoreCaretPosition()
    }
  })

  it.each(["pointercancel", "blur", "disable", "removed cell"])("closes a column resize undo group on %s", end => {
    document.body.innerHTML = '<table><tbody><tr><td style="width: 100px">A</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const [first] = cells()
    first.getBoundingClientRect = () => new DOMRect(0, 0, 100, 30)
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)
    editor.doc.syncFromDOM()
    const before = editor.toHTML(true)
    try {
      first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true}))
      first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true}))
      document.dispatchEvent(new PointerEvent("pointermove", {clientX: 120, clientY: 15, bubbles: true}))
      editor.doc.syncFromDOM()
      if(end === "disable") editor.features.table.disable()
      else if(end === "blur") window.dispatchEvent(new Event("blur"))
      else if(end === "removed cell") {
        first.remove()
        document.dispatchEvent(new PointerEvent("pointermove", {clientX: 140, clientY: 15, bubbles: true}))
      }
      else document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
      const after = editor.toHTML(true)
      expect(document.body).not.toHaveClass("◆table-column-resize")
      table.setAttribute("data-after", "later")
      editor.doc.syncFromDOM()
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(after)
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(before)
      editor.doc.redo()
      expect(editor.toHTML(true)).toBe(after)
    }
    finally {
      editor.features.table.enable()
      document.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
      restoreCaretPosition()
    }
  })

  it("does not resize from an unarmed edge drag", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const [first] = cells()
    first.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({}),
    })
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)

    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 70, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 70, clientY: 15, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(document.querySelector("colgroup")).toBeNull()
  })

  it("does not resize until an armed edge drag passes the horizontal threshold", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const [first] = cells()
    first.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({}),
    })
    const restoreCaretPosition = mockCaretPosition(first.firstChild!)

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 100, clientY: 15, bubbles: true, cancelable: true}))
    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 102, clientY: 16, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 102, clientY: 16, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(document.querySelector("colgroup")).toBeNull()
  })
})

describe("table gap controls", () => {
  function box(left: number, top: number, right: number, bottom: number) {
    return {x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top, toJSON: () => ({})}
  }

  async function renderGaps(table: HTMLTableElement) {
    table.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, composed: true, clientX: 10, clientY: 10,
    }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const map = buildTableMap(table)
    await vi.waitFor(() => {
      const overlay = editor.appendix.querySelector(".◆table-gaps")
      expect(overlay).not.toBeNull()
      expect(overlay?.querySelector(`button[aria-label="Insert column ${map.width + 1}"]`)).not.toBeNull()
      expect(overlay?.querySelector(`button[aria-label="Insert row ${map.rows.length + 1}"]`)).not.toBeNull()
    })
    return editor.appendix.querySelectorAll<HTMLButtonElement>(".◆table-gaps button")
  }

  function mockTableGeometry(table: HTMLTableElement, rows: HTMLTableRowElement[], cellsByRow: HTMLTableCellElement[][]) {
    table.getBoundingClientRect = () => box(10, 20, 210, 100)
    rows.forEach((row, rowIndex) => {
      row.getBoundingClientRect = () => box(10, 20 + rowIndex * 40, 210, 60 + rowIndex * 40)
      cellsByRow[rowIndex].forEach((cell, columnIndex) => {
        cell.getBoundingClientRect = () => box(10 + columnIndex * 100, 20 + rowIndex * 40, 110 + columnIndex * 100, 60 + rowIndex * 40)
      })
    })
  }

  it("renders row and column controls in the appendix with boundary geometry", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    const cellsByRow = rows.map(row => Array.from(row.cells))
    mockTableGeometry(table, rows, cellsByRow)

    const buttons = await renderGaps(table)

    expect(Array.from(buttons, button => button.getAttribute("aria-label"))).toEqual([
      "Insert column 1", "Insert column 2", "Insert column 3",
      "Insert row 1", "Insert row 2", "Insert row 3",
    ])
    expect(Array.from(buttons, button => [button.dataset.axis, button.style.left, button.style.top])).toEqual([
      ["column", "10px", "12px"], ["column", "110px", "12px"], ["column", "210px", "12px"],
      ["row", "2px", "20px"], ["row", "2px", "60px"], ["row", "2px", "100px"],
    ])
    expect(document.body.querySelector(".◆table-gaps")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("table-gaps")
    expect(editor.doc.body.toString()).not.toContain("table-gaps")
  })

  it("measures only cells needed for column gaps in a tall table", async () => {
    document.body.innerHTML = '<table><tbody>' + '<tr><td>A</td><td>B</td></tr>'.repeat(30) + '</tbody></table>'
    const table = document.querySelector("table")!
    const rows = Array.from(table.rows), cellsByRow = rows.map(row => Array.from(row.cells))
    mockTableGeometry(table, rows, cellsByRow)
    const geometry = vi.spyOn(editor.features.transformation, "boxGeometry")
    await renderGaps(table)
    const measuredCells = new Set(geometry.mock.calls.map(([element]) => element).filter(element => element.matches("td, th")))
    expect([...measuredCells]).toEqual(cellsByRow[0])
    expect(editor.appendix.querySelectorAll('.◆table-gaps button[data-axis="row"]')).toHaveLength(31)
    geometry.mockRestore()
  })

  it("batches gap geometry before overlay writes and reuses ancestor matrices only for that batch", async () => {
    document.body.innerHTML = '<div><table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table></div>'
    const table = document.querySelector("table")!, parent = table.parentElement!
    const rows = Array.from(table.rows), cellsByRow = rows.map(row => Array.from(row.cells))
    mockTableGeometry(table, rows, cellsByRow)
    await renderGaps(table)
    cellsByRow[0][0].getBoundingClientRect = () => box(30, 20, 130, 60)
    const overlay = editor.appendix.querySelector(".◆table-gaps")!
    const writes = new MutationObserver(() => {})
    writes.observe(overlay, {subtree: true, attributes: true, attributeFilter: ["style"]})
    const original = editor.features.transformation.boxGeometry.bind(editor.features.transformation)
    const geometry = vi.spyOn(editor.features.transformation, "boxGeometry").mockImplementation((...args) => {
      expect(writes.takeRecords()).toHaveLength(0)
      return original(...args)
    })
    const styles = vi.spyOn(globalThis, "getComputedStyle")
    const feature = editor.features.table as unknown as {renderGaps(): void}
    feature.renderGaps()
    expect(styles.mock.calls.filter(([element]) => element === parent)).toHaveLength(1)
    expect(overlay.querySelector<HTMLButtonElement>('button[data-axis="column"]')!.style.left).toBe("30px")
    geometry.mockRestore(); writes.disconnect(); styles.mockRestore()

    parent.style.transform = "scale(2)"
    feature.renderGaps()
    expect(overlay.querySelector<HTMLButtonElement>("button")!.style.transform).toContain("matrix(2, 0, 0, 2, 0, 0)")
  })

  it.each([
    {angle: 45, rtl: false, parentScale: 1},
    {angle: 90, rtl: false, parentScale: 1},
    {angle: 135, rtl: false, parentScale: 1},
    {angle: -90, rtl: true, parentScale: 1},
    {angle: 75, rtl: true, parentScale: 1.5},
  ])("follows a $angle degree table (rtl: $rtl, ancestor scale: $parentScale)", async ({angle, rtl, parentScale}) => {
    document.body.innerHTML = '<div><table><tbody><tr><td colspan="2">A</td></tr><tr><td>B</td><td>C</td></tr></tbody></table></div>'
    const table = document.querySelector("table")!
    table.id = "rotated-table"
    table.style.setProperty("rotate", `${angle}deg`)
    table.style.direction = rtl ? "rtl" : "ltr"
    table.parentElement!.style.transform = `scale(${parentScale})`
    const radians = angle * Math.PI / 180
    const a = Math.cos(radians) * parentScale, b = Math.sin(radians) * parentScale
    const point = (x: number, y: number) => ({x: 300 + a * x - b * y, y: 250 + b * x + a * y})
    const mockBox = (element: HTMLElement, x: number, y: number, width: number, height: number) => {
      Object.assign(element.style, {width: `${width}px`, height: `${height}px`, boxSizing: "border-box"})
      const points = [point(x, y), point(x + width, y), point(x + width, y + height), point(x, y + height)]
      element.getBoundingClientRect = () => box(Math.min(...points.map(p => p.x)), Math.min(...points.map(p => p.y)),
        Math.max(...points.map(p => p.x)), Math.max(...points.map(p => p.y)))
    }
    mockBox(table, 0, 0, 200, 80)
    Array.from(table.rows).forEach((row, index) => mockBox(row, 0, index * 40, 200, 40))
    mockBox(table.rows[0].cells[0], 0, 0, 200, 40)
    Array.from(table.rows[1].cells).forEach((cell, index) => mockBox(cell, (rtl ? 1 - index : index) * 100, 40, 100, 40))
    const authored = table.outerHTML

    const buttons = await renderGaps(table)

    const boundaries = [...[0, 100, 200].map(x => point(rtl ? 200 - x : x, -8)),
      ...[0, 40, 80].map(y => point(-8, y))]
    Array.from(buttons).forEach((button, index) => {
      expect(parseFloat(button.style.left)).toBeCloseTo(boundaries[index].x)
      expect(parseFloat(button.style.top)).toBeCloseTo(boundaries[index].y)
      const transform = new DOMMatrix(button.style.transform.replace("translate(-50%, -50%)", "").trim())
      expect(transform.a).toBeCloseTo(a)
      expect(transform.b).toBeCloseTo(b)
      expect(transform.c).toBeCloseTo(-b)
      expect(transform.d).toBeCloseTo(a)
      expect(parseFloat(button.style.getPropertyValue("--gap-length"))).toBeCloseTo(index < 3 ? 88 : 208)
    })
    expect(table.outerHTML).toBe(authored)
    expect(editor.toHTML(true)).not.toContain("table-gaps")
    expect(editor.doc.body.toString()).not.toContain("table-gaps")
  })

  it("hides controls for a table with a singular transform", async () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    mockTableGeometry(table, [table.rows[0]], [Array.from(table.rows[0].cells)])
    await renderGaps(table)
    table.style.transform = "scaleX(0)"
    window.dispatchEvent(new Event("resize"))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(editor.appendix.querySelector<HTMLElement>(".◆table-gaps")!.hidden).toBe(true)
  })

  it.each([
    ["inner column", "Insert column 2", () => {
      const table = document.querySelector("table")!
      return table.querySelectorAll("tr")[0].querySelectorAll("td").length
    }, 3],
    ["outer row", "Insert row 3", () => document.querySelectorAll("table tr").length, 3],
  ] as const)("inserts at an %s boundary", async (_name, label, count, expected) => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    mockTableGeometry(table, rows, rows.map(row => Array.from(row.cells)))
    const buttons = await renderGaps(table)
    const button = Array.from(buttons).find(button => button.getAttribute("aria-label") === label)!

    button.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))

    expect(count()).toBe(expected)
  })

  it("inserts through a colspan and keeps the merged cell spanning the new column", async () => {
    document.body.innerHTML = "<table><tbody><tr><td colspan='2'>A</td></tr><tr><td>B</td><td>C</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    table.getBoundingClientRect = () => box(0, 0, 200, 80)
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => box(0, index * 40, 200, (index + 1) * 40)
      Array.from(row.cells).forEach(cell => cell.getBoundingClientRect = () => box(0, index * 40, 200, (index + 1) * 40))
    })
    const buttons = await renderGaps(table)
    const button = Array.from(buttons).find(button => button.getAttribute("aria-label") === "Insert column 2")!

    button.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))

    expect(table.rows[0].cells[0]).toHaveAttribute("colspan", "3")
    expect(buildTableMap(table).width).toBe(3)
  })

  it.each(["detached", "replaced"])("ignores a stale control after its %s row changes", async kind => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    mockTableGeometry(table, rows, rows.map(row => Array.from(row.cells)))
    const buttons = await renderGaps(table)
    const button = Array.from(buttons).find(button => button.getAttribute("aria-label") === "Insert row 2")!
    if(kind === "detached") rows[1].remove()
    else rows[1].replaceWith(document.createElement("tr"))

    button.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))

    expect(table.querySelectorAll("tr")).toHaveLength(kind === "detached" ? 1 : 2)
  })

  it("groups a gap insertion into one undo and redo step", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const row = table.querySelector("tr")!
    mockTableGeometry(table, [row], [Array.from(row.cells)])
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    const buttons = await renderGaps(table)
    Array.from(buttons).find(button => button.getAttribute("aria-label") === "Insert row 2")!
      .dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))
    editor.doc.syncFromDOM()
    const after = editor.toHTML(true)

    expect(after).not.toBe(before)
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it("removes gap controls and their stylesheet when disabled", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    const row = table.querySelector("tr")!
    mockTableGeometry(table, [row], [Array.from(row.cells)])
    await renderGaps(table)

    editor.features.table.disable()

    expect(editor.appendix.querySelector(".◆table-gaps")).toBeNull()
    expect(editor.appendix.adoptedStyleSheets.some(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes(".◆table-gaps")))).toBe(false)
    editor.features.table.enable()
  })
})

describe("table actions", () => {
  it("inserts a requested table size as the top-level element", () => {
    const postSelectionPath = vi.spyOn(editor, "postSelectionPath")
    const result = editor.features.table.actions.insertTable({type: "insertTable", rows: 3, columns: 4})

    const table = document.body.firstElementChild as HTMLTableElement
    const map = buildTableMap(table)
    expect(table.localName).toBe("table")
    expect(map.rows).toHaveLength(3)
    expect(map.width).toBe(4)
    expect(postSelectionPath).toHaveBeenLastCalledWith(true)
    expect(result).toBe(true)
  })

  it("returns a bridge-safe result when normalizing the selected table", () => {
    expect(editor.features.table.actions.normalizeTable({type: "normalizeTable"})).toBe(false)
    document.body.innerHTML = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>'
    editor.features.table.selectCells(cells()[0])

    expect(editor.features.table.actions.normalizeTable({type: "normalizeTable"})).toBe(true)
    expect(document.querySelectorAll("tr:last-child > td")).toHaveLength(2)
  })

  it("converts a text-only paragraph to a table", () => {
    document.body.innerHTML = "<p>Before after</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)

    editor.features.table.actions.insertTable({type: "insertTable", rows: 2, columns: 2})

    const table = document.querySelector("table")!
    expect(table.parentElement).toBe(document.body)
    expect(buildTableMap(table).width).toBe(1)
    expect(table.querySelector("td > p")?.textContent).toBe("Before after")
  })

  it("inserts a row through a rowspan and keeps it in the selected row group", () => {
    document.body.innerHTML = `<table><tbody>
      <tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr>
    </tbody><tfoot><tr><td>D</td><td>E</td></tr></tfoot></table>`
    editor.features.table.selectCells(cells()[1])

    editor.features.table.actions.insertTableRow({type: "insertTableRow", side: "below"})

    const table = document.querySelector("table")!
    expect(table.querySelectorAll(":scope > tbody > tr")).toHaveLength(3)
    expect(table.querySelector("td")?.rowSpan).toBe(3)
    expect(table.querySelectorAll(":scope > tfoot > tr")).toHaveLength(1)
  })

  it("preserves column definitions, accessibility attributes, and multiple row groups on row commands", () => {
    document.body.innerHTML = '<table role="grid"><colgroup><col style="width:40%"></colgroup><tbody id="first" role="rowgroup"><tr><td headers="name" scope="row" abbr="Name" role="cell">A</td></tr></tbody><tbody id="second"><tr><td>B</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    const originalCell = cells()[0]
    editor.features.table.selectCells(originalCell)

    editor.features.table.actions.insertTableRow({type: "insertTableRow", side: "below"})

    expect(table.querySelector<HTMLTableColElement>("colgroup col")?.style.width).toBe("40%")
    expect(table).toHaveAttribute("role", "grid")
    expect(table.querySelectorAll(":scope > tbody")).toHaveLength(2)
    expect(table.querySelector("tbody#first")).toHaveAttribute("role", "rowgroup")
    expect(originalCell).toHaveAttribute("headers", "name")
    expect(originalCell).toHaveAttribute("scope", "row")
    expect(originalCell).toHaveAttribute("abbr", "Name")
    expect(originalCell).toHaveAttribute("role", "cell")
  })

  it.each([
    {group: "thead", side: "below", selected: 0},
    {group: "tfoot", side: "above", selected: 2},
  ] as const)("inserts $side inside a multi-row $group at the selected boundary", ({group, side, selected}) => {
    document.body.innerHTML = `<table><${group} id="keep"><tr><th>A</th></tr><tr><th>B</th></tr><tr><th>C</th></tr></${group}></table>`
    const rowGroup = document.querySelector(group)!
    const originalRows = Array.from(rowGroup.children)
    editor.features.table.selectCells(cells()[selected])

    editor.features.table.actions.insertTableRow({type: "insertTableRow", side})

    const rows = Array.from(rowGroup.children)
    expect(rows).toHaveLength(4)
    const boundary = side === "below" ? selected + 1 : selected
    expect(rows.slice(0, boundary)).toEqual(originalRows.slice(0, boundary))
    expect(rows.slice(boundary + 1)).toEqual(originalRows.slice(boundary))
    expect(rows[boundary].querySelector("th")).not.toBeNull()
    expect(document.querySelector("tbody")).toBeNull()
  })

  it("preserves column definitions and cell accessibility attributes while toggling row groups", () => {
    document.body.innerHTML = '<table role="grid"><colgroup><col></colgroup><tbody><tr><td headers="name" scope="row" abbr="Name" role="cell">A</td></tr><tr><td>B</td></tr></tbody></table>'
    const table = document.querySelector("table")!
    editor.features.table.selectCells(cells()[0])

    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})

    const headerCell = table.querySelector("thead th")!
    expect(table.querySelector("colgroup col")).not.toBeNull()
    expect(table).toHaveAttribute("role", "grid")
    expect(headerCell).toHaveAttribute("headers", "name")
    expect(headerCell).toHaveAttribute("scope", "row")
    expect(headerCell).toHaveAttribute("abbr", "Name")
    expect(headerCell).toHaveAttribute("role", "cell")
  })

  it("inserts a column through a colspan", () => {
    document.body.innerHTML = "<table><tbody><tr><td colspan='2'>A</td></tr><tr><td>B</td><td>C</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[1])

    editor.features.table.actions.insertTableColumn({type: "insertTableColumn", side: "right"})

    expect(cells()[0].colSpan).toBe(3)
    expect(buildTableMap(document.querySelector("table")!).width).toBe(3)
  })

  it("merges and splits cells while preserving their authored content", () => {
    document.body.innerHTML = "<table><tbody><tr><td><em>A</em></td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0], cells()[3])

    editor.features.table.actions.mergeTableCells({type: "mergeTableCells"})
    expect(cells()).toHaveLength(1)
    expect(cells()[0].rowSpan).toBe(2)
    expect(cells()[0].colSpan).toBe(2)
    expect(cells()[0].textContent).toBe("ABCD")

    editor.features.table.actions.splitTableCells({type: "splitTableCells"})
    expect(cells()).toHaveLength(4)
    expect(cells()[0].innerHTML).toContain("<em>A</em>")
  })

  it("splits a table at the selection without copying column definitions", () => {
    document.body.innerHTML = `<table class="data ◆table-marker"><colgroup class="columns ◆column-marker"><col><col></colgroup><thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody class="rows ◆row-marker"><tr><td>C</td><td>D</td></tr><tr><td>E</td><td>F</td></tr></tbody></table>`
    editor.features.table.selectCells(cells()[2])

    editor.features.table.actions.splitTable({type: "splitTable"})

    const tables = document.querySelectorAll("table")
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelectorAll("tr")).toHaveLength(1)
    expect(tables[1].querySelectorAll("tr")).toHaveLength(2)
    expect(tables[1].querySelectorAll("col")).toHaveLength(0)
    expect(tables[1]).toHaveClass("data")
    expect(tables[1]).not.toHaveClass("◆table-marker")
    expect(tables[1].querySelector("tbody")).toHaveClass("rows")
    expect(tables[1].querySelector("tbody")).not.toHaveClass("◆row-marker")
  })

  it("toggles a caption and applies cell border and background styles", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0], cells()[1])
    editor.features.table.actions.setTableCellStyle({type: "setTableCellStyle", property: "border-style", value: "solid"})
    editor.features.table.actions.setTableCellStyle({type: "setTableCellStyle", property: "background-color", value: "#ff0000"})
    editor.features.table.actions.toggleTableCaption({type: "toggleTableCaption"})

    expect(document.querySelector("table")?.firstElementChild?.localName).toBe("caption")
    expect(cells().every(cell => cell.style.borderStyle === "solid")).toBe(true)
    expect(cells().every(cell => cell.style.backgroundColor === "#ff0000")).toBe(true)

    editor.features.table.actions.toggleTableCaption({type: "toggleTableCaption"})
    expect(document.querySelector("caption")).toBeNull()
  })

  it("keeps only one header and footer row when inserting adjacent rows", () => {
    document.body.innerHTML = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody><tfoot><tr><td>C</td></tr></tfoot></table>'
    editor.features.table.selectCells(cells()[0])
    editor.features.table.actions.insertTableRow({type: "insertTableRow", side: "below"})
    expect(document.querySelectorAll("thead > tr")).toHaveLength(1)
    expect(document.querySelectorAll("tbody > tr")).toHaveLength(2)
    editor.features.table.selectCells(cells().at(-1)!)
    editor.features.table.actions.insertTableRow({type: "insertTableRow", side: "above"})
    expect(document.querySelectorAll("tfoot > tr")).toHaveLength(1)
    expect(document.querySelector("tfoot")?.textContent).toBe("C")
    expect(document.querySelectorAll("tbody th")).toHaveLength(0)
  })

  it("preserves a text selection inside a row designated as header", () => {
    document.body.innerHTML = '<table><tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr></tbody></table>'
    const text = cells()[0].firstChild!
    $.selectRange(text, 1, text, 4)
    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
    expect(window.getSelection()?.toString()).toBe("lph")
  })

  it("toggles the first and last rows regardless of which cells are selected", () => {
    document.body.innerHTML = '<table><tbody><tr><td id="name"><strong>A</strong></td></tr><tr><td><demo-widget>B</demo-widget></td></tr><tr><td>C</td></tr></tbody></table>'
    const widget = document.querySelector("demo-widget")
    editor.features.table.selectCells(cells()[1])
    expect(editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})).toBe(true)
    expect(document.querySelector("thead th")?.innerHTML).toBe("<strong>A</strong>")
    expect(document.querySelector("thead th")).toHaveAttribute("id", "name")
    expect(editor.features.table.selectedCells[0]?.textContent).toBe("B")
    expect(editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})).toBe(true)
    expect(document.querySelector("tfoot td")?.textContent).toBe("C")
    expect(editor.features.table.getState()).toMatchObject({hasHeader: true, hasFooter: true})
    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
    editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})
    expect(document.querySelector("thead, tfoot, th")).toBeNull()
    expect(cells().map(cell => cell.textContent)).toEqual(["A", "B", "C"])
    expect(document.querySelector("demo-widget")).toBe(widget)
  })

  it("designates whole boundary rows even when only one cell is selected", () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr><tr><td>E</td><td>F</td></tr></tbody></table>'
    editor.features.table.selectCells(cells()[3])
    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
    editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})
    expect(document.querySelectorAll("thead > tr > th")).toHaveLength(2)
    expect(document.querySelectorAll("tfoot > tr > td")).toHaveLength(2)
    expect(document.querySelectorAll("tbody > tr > td")).toHaveLength(2)
    expect(document.querySelector("tbody")?.textContent).toBe("CD")
  })

  it.each(["thead", "tfoot"] as const)("leaves spanning cells intact when a full %s row cannot be designated", type => {
    document.body.innerHTML = '<table><tbody><tr><td rowspan="2"><demo-widget>A</demo-widget></td><td>B</td></tr><tr><td>C</td></tr></tbody></table>'
    editor.features.table.selectCells(cells()[1])
    const before = editor.toHTML(true)
    const widget = document.querySelector("demo-widget")
    expect(editor.features.table.getState()).toMatchObject({canToggleHeader: false, canToggleFooter: false})
    const result = type === "thead" ? editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
      : editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})
    expect(result).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
    expect(document.querySelector("demo-widget")).toBe(widget)
    expect(cells()[0].rowSpan).toBe(2)
  })

  it.each(["thead", "tfoot"] as const)("does not merge cells across a %s boundary", type => {
    document.body.innerHTML = type === "thead"
      ? '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>C</td><td>D</td></tr></tbody></table>'
      : '<table><tbody><tr><td>A</td><td>B</td></tr></tbody><tfoot><tr><td>C</td><td>D</td></tr></tfoot></table>'
    editor.features.table.selectCells(cells()[0], cells()[2])
    const before = editor.toHTML(true)
    expect(editor.features.table.getState()?.canMerge).toBe(false)
    editor.features.table.actions.mergeTableCells({type: "mergeTableCells"})
    expect(editor.toHTML(true)).toBe(before)
    editor.features.table.selectCells(cells()[0], cells()[1])
    expect(editor.features.table.getState()?.canMerge).toBe(true)
    editor.features.table.actions.mergeTableCells({type: "mergeTableCells"})
    expect(cells()[0].colSpan).toBe(2)
  })

  it("keeps a selected header cell selected through tag changes and undo", () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.table.selectCells(cells()[0])
    const before = editor.toHTML(true)
    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
    expect(editor.features.table.selectedCells[0]?.localName).toBe("th")
    const after = editor.toHTML(true)
    expect(after).not.toContain("◆")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(after)
  })

  it.each(["thead", "tfoot"] as const)("toggles %s without converting or moving the opposite authored row", type => {
    document.body.innerHTML = '<table><tbody id="first"><tr><th scope="row">A</th></tr></tbody><tbody id="last"><tr><th scope="row">B</th></tr></tbody></table>'
    const untouched = cells()[type === "thead" ? 1 : 0]
    const parent = untouched.parentElement!.parentElement
    const html = untouched.outerHTML
    editor.features.table.selectCells(cells()[0])

    type === "thead" ? editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
      : editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})

    expect(untouched.isConnected).toBe(true)
    expect(untouched.parentElement!.parentElement).toBe(parent)
    expect(untouched.outerHTML.replace(/ class="[^"]*"/g, "")).toBe(html)
  })

  it("uses the current first row after replacement and handles a single-row table", () => {
    document.body.innerHTML = '<table><tbody><tr><td>A</td></tr></tbody></table>'
    editor.features.table.selectCells(cells()[0])
    document.querySelector("tr")!.innerHTML = '<td>B</td>'
    $.move(cells()[0], 0)
    editor.features.table.actions.toggleTableHeader({type: "toggleTableHeader"})
    expect(document.querySelector("thead th")?.textContent).toBe("B")
    $.move(cells()[0], 0)
    editor.features.table.actions.toggleTableFooter({type: "toggleTableFooter"})
    expect(document.querySelector("thead")).toBeNull()
    expect(document.querySelector("tfoot td")?.textContent).toBe("B")
  })
})

describe("table clipboard and split regressions", () => {
  it.each(["application/json", "application/xml"])("exports authored %s widget defaults through native and programmatic copy", async type => {
    const defaults = type === "application/json" ? '{"answer":"default"}' : '<data>default</data>'
    const privateData = type === "application/json" ? '{"answer":"private-participant"}' : '<data>private-participant</data>'
    editor.schema.extendWidgets([{tagName: "table-data-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = `<table><tbody><tr><td><table-data-widget id="table-data"><script type="${type}" slot="data">${defaults}</script></table-data-widget></td></tr></tbody></table>`
    editor.doc.syncFromDOM()
    document.querySelector("script")!.textContent = privateData
    editor.doc.syncFromDOM()
    editor.features.table.selectCells(cells()[0])
    const data = new DataTransfer()
    document.dispatchEvent(new ClipboardEvent("copy", {clipboardData: data, bubbles: true, cancelable: true}))
    expect(data.getData("text/html")).toContain(defaults)
    expect(data.getData("text/html") + data.getData("text/plain")).not.toContain("private-participant")
    expect(data.getData("text/html")).not.toContain("◆")
    const original = navigator.clipboard.write
    const write = vi.fn(async (items: ClipboardItem[]) => {
      const html = await items[0].getType("text/html")
      const plain = await items[0].getType("text/plain")
      expect(await html.text()).toContain(defaults)
      expect(await html.text() + await plain.text()).not.toContain("private-participant")
    })
    Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: write})
    try { expect(await editor.features.table.copy()).toBe(true); expect(write).toHaveBeenCalledOnce() }
    finally { Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: original}) }
  })

  it.each(["selection", "content", "replacement", "widget", "disable"])("does not cut stale cells after a pending clipboard write: %s", async change => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    const [first, second] = cells()
    editor.features.table.selectCells(first)
    let resolve!: () => void
    const original = navigator.clipboard.write
    Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: () => new Promise<void>(done => { resolve = done })})
    try {
      const cut = editor.features.table.cut()
      if(change === "selection") editor.features.table.selectCells(second)
      if(change === "content") first.textContent = "Changed"
      if(change === "replacement") first.firstChild!.replaceWith(document.createTextNode("A"))
      if(change === "widget") {
        const widget = document.createElement("atomic-table-widget")
        document.body.append(widget)
        widget.append(first.closest("table")!)
      }
      if(change === "disable") editor.features.table.disable()
      resolve()
      expect(await cut).toBe(false)
      expect(first.isConnected).toBe(true)
      expect(second.isConnected).toBe(true)
    }
    finally {
      editor.features.table.enable()
      Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: original})
    }
  })

  it("cuts the unchanged original cells and supports undo", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.table.selectCells(cells()[0])
    const original = navigator.clipboard.write
    Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: async () => {}})
    try {
      expect(await editor.features.table.cut()).toBe(true)
      editor.doc.syncFromDOM()
      expect(cells().map(cell => cell.textContent)).toEqual(["B"])
      editor.doc.undo()
      expect(cells().map(cell => cell.textContent)).toEqual(["A", "B"])
    }
    finally { Object.defineProperty(navigator.clipboard, "write", {configurable: true, value: original}) }
  })

  it.each(["2", "0", "3"])("leaves a table intact when a rowspan=%s crosses the split", span => {
    document.body.innerHTML = `<table id="keep"><caption>Caption</caption><colgroup><col span="2"></colgroup><tbody><tr><td rowspan="${span}">A</td><td>B</td></tr><tr><td>C</td></tr><tr><td>D</td></tr></tbody></table>`
    const table = document.querySelector("table")!
    editor.features.table.selectCells(cells()[2])
    const markup = table.outerHTML
    const nodes = [...table.querySelectorAll("*")]
    editor.features.table.actions.splitTable({type: "splitTable"})
    expect(document.querySelectorAll("table")).toHaveLength(1)
    expect(table.outerHTML).toBe(markup)
    expect([...table.querySelectorAll("*")]).toEqual(nodes)
    expect(editor.features.table.selectedCells).toEqual([cells()[2]])
  })
})
