// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import "happy-dom"
import "@testing-library/jest-dom/vitest"

import {DOMEditor} from "../domeditor"
import {$} from "../utility"
import {buildTableMap} from "../table"
import {selectionChangeEvent, type SelectionChangeDetail} from "../editor-bridge"

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
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    let detail: SelectionChangeDetail | undefined
    const listener = (event: Event) => detail = (event as CustomEvent<SelectionChangeDetail>).detail
    window.addEventListener(selectionChangeEvent, listener, {once: true})

    editor.features.table.selectCells(cells()[0])

    expect(detail?.path.map(item => item.path)).toEqual([[], [0]])
  })
})

describe("table cell selection", () => {
  it("does not refresh recursively from its own selection markers", async () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    await new Promise(resolve => setTimeout(resolve, 0))
    const postSelectionPath = vi.spyOn(editor, "postSelectionPath")

    editor.features.table.selectCells(cells()[0])
    const synchronousCalls = postSelectionPath.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(postSelectionPath).toHaveBeenCalledTimes(synchronousCalls)

    cells()[0].setAttribute("title", "authored change")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(postSelectionPath.mock.calls.length).toBeGreaterThan(synchronousCalls)
    postSelectionPath.mockRestore()
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

  it("keeps a cell selection when a non-text drag returns to its empty origin", () => {
    document.body.innerHTML = "<table><tbody><tr><td></td><td></td></tr></tbody></table>"
    const [first, second] = cells()
    const restoreCaretPosition = mockCaretPosition(first)

    first.dispatchEvent(new PointerEvent("pointerdown", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    second.dispatchEvent(new PointerEvent("pointermove", {clientX: 150, clientY: 15, bubbles: true, cancelable: true}))
    expect(editor.features.table.selectedCells).toEqual([first, second])

    first.dispatchEvent(new PointerEvent("pointermove", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    document.dispatchEvent(new PointerEvent("pointerup", {clientX: 50, clientY: 15, bubbles: true, cancelable: true}))
    restoreCaretPosition()

    expect(editor.features.table.selectedCells).toEqual([first, second])
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

  it("selects an emptied table after deleting all of its cells", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    const table = document.querySelector("table")!
    editor.features.table.selectCells(cells()[0])

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))

    expect(cells()).toHaveLength(0)
    expect(editor.features.table.hasCellSelection).toBe(false)
    expect($.selectedElement).toBe(table)
    expect(table).toHaveClass("◆element-selected")
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

  it("pastes TSV segments starting at the selected cell and grows the table", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0])
    const data = new DataTransfer()
    data.setData("text/plain", "1\t2\n3\t4")

    document.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}))

    expect(buildTableMap(document.querySelector("table")!).rows).toHaveLength(2)
    expect(cells().map(cell => cell.textContent)).toEqual(["1", "2", "3", "4"])
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

    const columns = document.querySelectorAll<HTMLTableColElement>("colgroup > col")
    expect(columns).toHaveLength(2)
    expect(columns[0].style.width).toBe("130px")
    expect(editor.toHTML(true)).toContain("width: 130px")
  })

  it("continues resizing from a persisted inline column width", () => {
    document.body.innerHTML = `<table><colgroup><col style="width: 160px"><col></colgroup>
      <tbody><tr><td>A</td><td>B</td></tr></tbody></table>`
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

    expect(document.querySelector<HTMLTableColElement>("col")?.style.width).toBe("180px")
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

describe("table actions", () => {
  it("inserts a requested table size as the top-level element", () => {
    editor.features.table.actions.insertTable({type: "insertTable", rows: 3, columns: 4})

    const table = document.body.firstElementChild as HTMLTableElement
    const map = buildTableMap(table)
    expect(table.localName).toBe("table")
    expect(map.rows).toHaveLength(3)
    expect(map.width).toBe(4)
  })

  it("lifts an inserted table out of a text-only paragraph", () => {
    document.body.innerHTML = "<p>Before after</p>"
    $.move(document.querySelector("p")!.firstChild!, 6)

    editor.features.table.actions.insertTable({type: "insertTable", rows: 2, columns: 2})

    const table = document.querySelector("table")!
    expect(table.parentElement).toBe(document.body)
    expect(buildTableMap(table).width).toBe(2)
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

  it("splits a table at the selection and retains column definitions", () => {
    document.body.innerHTML = `<table class="data"><colgroup><col><col></colgroup><thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody><tr><td>C</td><td>D</td></tr><tr><td>E</td><td>F</td></tr></tbody></table>`
    editor.features.table.selectCells(cells()[2])

    editor.features.table.actions.splitTable({type: "splitTable"})

    const tables = document.querySelectorAll("table")
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelectorAll("tr")).toHaveLength(1)
    expect(tables[1].querySelectorAll("tr")).toHaveLength(2)
    expect(tables[1].querySelectorAll("col")).toHaveLength(2)
    expect(tables[1]).toHaveClass("data")
  })

  it("adds a caption and applies cell border and background styles", () => {
    document.body.innerHTML = "<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>"
    editor.features.table.selectCells(cells()[0], cells()[1])
    editor.features.table.actions.setTableCellStyle({type: "setTableCellStyle", property: "border-style", value: "solid"})
    editor.features.table.actions.setTableCellStyle({type: "setTableCellStyle", property: "background-color", value: "#ff0000"})
    editor.features.table.actions.addTableCaption({type: "addTableCaption"})

    expect(document.querySelector("table")?.firstElementChild?.localName).toBe("caption")
    expect(cells().every(cell => cell.style.borderStyle === "solid")).toBe(true)
    expect(cells().every(cell => cell.style.backgroundColor === "#ff0000")).toBe(true)
  })
})
