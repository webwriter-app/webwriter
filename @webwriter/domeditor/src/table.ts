import {clearEditorMarkerClasses} from "./utility"

export const tableCellSelector = "td, th"
export const tableInternalSelector = "caption, colgroup, col, thead, tbody, tfoot, tr, td, th"

export type TableCellPlacement = {
  cell: HTMLTableCellElement
  row: number
  column: number
  rowSpan: number
  columnSpan: number
}

export type TableMap = {
  table: HTMLTableElement
  rows: HTMLTableRowElement[]
  matrix: Array<Array<TableCellPlacement | undefined>>
  placements: TableCellPlacement[]
  width: number
}

export const tableRowGroupTypes = ["thead", "tbody", "tfoot"] as const

export type TableRowGroupType = typeof tableRowGroupTypes[number]

export const tableCellRoles = [
  "data", "header", "column-header", "row-header", "column-group-header", "row-group-header",
] as const

export type TableCellRole = typeof tableCellRoles[number]

export type TableRowGroupState = {
  index: number
  type: TableRowGroupType
  rows: number
  attributes: Record<string, string>
}

export type TableColumnState = {
  path: number[]
  attributes: Record<string, string>
}

export type TableColumnGroupState = {
  path: number[]
  attributes: Record<string, string>
  columns: TableColumnState[]
}

export type TableCellSemanticsState = {
  role: TableCellRole | "mixed"
  /** Empty means absent on every target; null means the targets differ. */
  headers: string | null
  /** Empty means absent on every target; null means the targets differ. */
  abbr: string | null
}

export type TableSelectionState = {
  active: boolean
  cellSelection: boolean
  rows: number
  columns: number
  selectedCells: number
  canMerge: boolean
  canSplit: boolean
  hasCaption: boolean
  selectedRowGroup: TableRowGroupType | "direct" | "mixed"
  rowGroups: TableRowGroupState[]
  canAddHeaderGroup: boolean
  canAddFooterGroup: boolean
  columnGroups: TableColumnGroupState[]
  cellSemantics: TableCellSemanticsState
}

export function isTableRowGroupType(value: unknown): value is TableRowGroupType {
  return typeof value === "string" && (tableRowGroupTypes as readonly string[]).includes(value)
}

export function isTableCellRole(value: unknown): value is TableCellRole {
  return typeof value === "string" && (tableCellRoles as readonly string[]).includes(value)
}

export function tableForNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest("table") as HTMLTableElement | null
}

export function cellForNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  const cell = element?.closest(tableCellSelector) as HTMLTableCellElement | null
  return cell && tableForNode(cell) ? cell : null
}

/** Rows belonging to this table in authored DOM order. Nested tables are excluded. */
export function tableRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    .filter(row => tableForNode(row) === table)
}

function positiveSpan(cell: Element, name: "rowspan" | "colspan") {
  const value = Number.parseInt(cell.getAttribute(name) ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function effectiveRowSpan(cell: HTMLTableCellElement, rows: HTMLTableRowElement[], rowIndex: number) {
  const group = rows[rowIndex]?.parentElement
  let end = rowIndex + 1
  while(end < rows.length && rows[end].parentElement === group) end++
  const available = Math.max(1, end - rowIndex)
  return cell.getAttribute("rowspan") === "0"
    ? available
    : Math.min(positiveSpan(cell, "rowspan"), available)
}

/** Builds a fresh visual occupancy map without changing the authored table. */
export function buildTableMap(table: HTMLTableElement): TableMap {
  const rows = tableRows(table)
  const matrix: Array<Array<TableCellPlacement | undefined>> = rows.map(() => [])
  const placements: TableCellPlacement[] = []
  let width = 0

  rows.forEach((row, rowIndex) => {
    let column = 0
    const cells = Array.from(row.children)
      .filter((child): child is HTMLTableCellElement => child.matches(tableCellSelector))
    cells.forEach(cell => {
      const columnSpan = positiveSpan(cell, "colspan")
      const rowSpan = Math.min(effectiveRowSpan(cell, rows, rowIndex), rows.length - rowIndex)
      while(matrix[rowIndex][column]) column++
      while(Array.from({length: columnSpan}).some((_, offset) => matrix[rowIndex][column + offset])) column++
      const placement = {cell, row: rowIndex, column, rowSpan, columnSpan}
      placements.push(placement)
      for(let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
        for(let columnOffset = 0; columnOffset < columnSpan; columnOffset++) {
          matrix[rowIndex + rowOffset][column + columnOffset] = placement
        }
      }
      column += columnSpan
      width = Math.max(width, column)
    })
    width = Math.max(width, matrix[rowIndex].length)
  })

  return {table, rows, matrix, placements, width}
}

export function placementForCell(map: TableMap, cell: Element | null) {
  return map.placements.find(placement => placement.cell === cell) ?? null
}

export function placementsInRectangle(
  map: TableMap,
  top: number,
  left: number,
  bottom: number,
  right: number,
) {
  return map.placements.filter(placement => (
    placement.row <= bottom
    && placement.row + placement.rowSpan - 1 >= top
    && placement.column <= right
    && placement.column + placement.columnSpan - 1 >= left
  ))
}

/** Expands a rectangle until it contains every merged cell it intersects. */
export function completeCellRectangle(map: TableMap, first: TableCellPlacement, last: TableCellPlacement) {
  let top = Math.min(first.row, last.row)
  let left = Math.min(first.column, last.column)
  let bottom = Math.max(first.row + first.rowSpan - 1, last.row + last.rowSpan - 1)
  let right = Math.max(first.column + first.columnSpan - 1, last.column + last.columnSpan - 1)
  let changed = true
  while(changed) {
    changed = false
    placementsInRectangle(map, top, left, bottom, right).forEach(placement => {
      const nextTop = Math.min(top, placement.row)
      const nextLeft = Math.min(left, placement.column)
      const nextBottom = Math.max(bottom, placement.row + placement.rowSpan - 1)
      const nextRight = Math.max(right, placement.column + placement.columnSpan - 1)
      if(nextTop !== top || nextLeft !== left || nextBottom !== bottom || nextRight !== right) changed = true
      top = nextTop
      left = nextLeft
      bottom = nextBottom
      right = nextRight
    })
  }
  return {top, left, bottom, right}
}

export function createTable(rows: number, columns: number) {
  const table = document.createElement("table")
  const body = table.createTBody()
  for(let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const row = body.insertRow()
    for(let columnIndex = 0; columnIndex < columns; columnIndex++) row.insertCell()
  }
  return table
}

/** Removes editor marker classes from detached clipboard content. */
export function clearTableMarkers(root: ParentNode) {
  clearEditorMarkerClasses(root as Node)
}
