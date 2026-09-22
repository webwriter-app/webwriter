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
  limited?: boolean
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
  hasHeader: boolean
  hasFooter: boolean
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

const maximumColumnSpan = 1000
export const maximumTableMapSlots = 1_000_000

function positiveSpan(cell: Element, name: "rowspan" | "colspan") {
  const value = Number.parseInt(cell.getAttribute(name) ?? "", 10)
  if(!Number.isFinite(value) || value <= 0) return 1
  // colspan is a limited unsigned integer in HTML. Read the reflected range
  // here instead of letting a raw, oversized attribute drive grid allocation.
  return name === "colspan" ? Math.min(value, maximumColumnSpan) : value
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
  const emptyMap = (): TableMap => ({table, rows: [], matrix: [], placements: [], width: 0, limited: true})
  if(rows.length > maximumTableMapSlots) return emptyMap()
  const matrix: Array<Array<TableCellPlacement | undefined>> = rows.map(() => [])
  const placements: TableCellPlacement[] = []
  let width = 0

  for(let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    let column = 0
    const cells = Array.from(row.children)
      .filter((child): child is HTMLTableCellElement => child.matches(tableCellSelector))
    for(const cell of cells) {
      const columnSpan = positiveSpan(cell, "colspan")
      const rowSpan = Math.min(effectiveRowSpan(cell, rows, rowIndex), rows.length - rowIndex)
      while(matrix[rowIndex][column]) column++
      while(true) {
        let occupied = false
        for(let offset = 0; offset < columnSpan; offset++) {
          if(matrix[rowIndex][column + offset]) {
            occupied = true
            break
          }
        }
        if(!occupied) break
        column++
      }
      const placement = {cell, row: rowIndex, column, rowSpan, columnSpan}
      if(Math.max(width, column + columnSpan) * rows.length > maximumTableMapSlots) return emptyMap()
      placements.push(placement)
      for(let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
        for(let columnOffset = 0; columnOffset < columnSpan; columnOffset++) {
          matrix[rowIndex + rowOffset][column + columnOffset] = placement
        }
      }
      column += columnSpan
      width = Math.max(width, column)
    }
    width = Math.max(width, matrix[rowIndex].length)
  }

  return {table, rows, matrix, placements, width, limited: false}
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

/** Toggle the first and last row groups while preserving other authored table structure. */
export function normalizeTableStructure(table: HTMLTableElement, header?: boolean, footer?: boolean) {
  const changedCells = new Map<HTMLTableCellElement, HTMLTableCellElement>()
  const rows = tableRows(table)
  if(header === undefined && footer === undefined) return changedCells
  const first = rows[0]
  const last = rows.at(-1)
  const topLevelChild = (node: Node) => {
    let child = node
    while(child.parentNode && child.parentNode !== table) child = child.parentNode
    return child.parentNode === table ? child : null
  }
  const section = (name: "thead" | "tbody" | "tfoot", relativeRow?: HTMLTableRowElement) => {
    const existing = Array.from(table.children).find(child => child.localName === name)
    if(existing) return existing
    const created = table.ownerDocument.createElement(name)
    const reference = relativeRow ? topLevelChild(relativeRow) : null
    if(name === "thead" && reference) table.insertBefore(created, reference)
    else if(name === "tfoot" && reference) table.insertBefore(created, reference.nextSibling)
    else {
      const footerSection = Array.from(table.children).find(child => child.localName === "tfoot")
      footerSection ? table.insertBefore(created, footerSection) : table.append(created)
    }
    return created
  }
  const bodySection = (row: HTMLTableRowElement) => {
    const index = rows.indexOf(row)
    const neighbor = rows.slice(index + 1).find(candidate => candidate.parentElement?.localName === "tbody")
      ?? rows.slice(0, index).reverse().find(candidate => candidate.parentElement?.localName === "tbody")
    return neighbor?.parentElement ?? section("tbody", row)
  }
  const moveRow = (row: HTMLTableRowElement, name: "thead" | "tbody" | "tfoot") => {
    const target = name === "tbody" ? bodySection(row) : section(name, row)
    if(row.parentElement === target) return
    const previousParent = row.parentElement
    if(name === "thead") target.prepend(row)
    else if(name === "tfoot") target.append(row)
    else {
      const index = rows.indexOf(row)
      const next = rows.slice(index + 1).find(candidate => candidate.parentElement === target)
      const previous = rows.slice(0, index).reverse().find(candidate => candidate.parentElement === target)
      if(next) target.insertBefore(row, next)
      else if(previous) previous.after(row)
      else target.append(row)
    }
    if(previousParent && previousParent !== target && /^(thead|tbody|tfoot)$/.test(previousParent.localName)
      && previousParent.childNodes.length === 0) previousParent.remove()
  }
  const setRowType = (row: HTMLTableRowElement, tag: "td" | "th") => {
    Array.from(row.children).filter(child => child.matches(tableCellSelector)).forEach(child => {
      const cell = child as HTMLTableCellElement
      if(cell.localName === tag) return
      const replacement = table.ownerDocument.createElement(tag)
      Array.from(cell.attributes).forEach(attribute => replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value))
      replacement.append(...Array.from(cell.childNodes))
      cell.replaceWith(replacement)
      changedCells.set(cell, replacement)
    })
  }
  if(first && first === last) {
    const name = header ? "thead" : footer ? "tfoot" : "tbody"
    moveRow(first, name)
    setRowType(first, name === "thead" ? "th" : "td")
  }
  else {
    if(first && header !== undefined) {
      moveRow(first, header ? "thead" : "tbody")
      setRowType(first, header ? "th" : "td")
    }
    if(last && footer !== undefined) {
      moveRow(last, footer ? "tfoot" : "tbody")
      setRowType(last, "td")
    }
  }
  return changedCells
}
