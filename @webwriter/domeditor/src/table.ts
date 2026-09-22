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

/** Canonicalize table sections without rebuilding cells or widget content. */
export function normalizeTableStructure(table: HTMLTableElement, header?: boolean, footer?: boolean) {
  const changedCells = new Map<HTMLTableCellElement, HTMLTableCellElement>()
  const groups = Array.from(table.children).filter(child => child.matches("thead, tbody, tfoot"))
  const rows = Array.from(table.children).flatMap(child => child.localName === "tr"
    ? [child as HTMLTableRowElement]
    : groups.includes(child) ? Array.from(child.children).filter((row): row is HTMLTableRowElement => row.localName === "tr") : [])
  const first = rows[0]
  const last = rows.at(-1)
  const firstCells = first ? Array.from(first.children).filter(cell => cell.matches(tableCellSelector)) : []
  const hasHeader = header ?? (first?.parentElement?.localName === "thead"
    || firstCells.length > 0 && firstCells.every(cell => cell.localName === "th"))
  const hasFooter = footer ?? groups.some(group => group.localName === "tfoot" && group.querySelector(":scope > tr"))
  const headerRow = hasHeader ? first : undefined
  const footerRow = hasFooter && last !== headerRow ? last : undefined
  const desired = new Map<string, HTMLTableRowElement[]>([
    ["thead", headerRow ? [headerRow] : []],
    ["tbody", rows.filter(row => row !== headerRow && row !== footerRow)],
    ["tfoot", footerRow ? [footerRow] : []],
  ])
  table.removeAttribute("role")
  Array.from(table.children).filter(child => child.matches("col, colgroup")).forEach(child => child.remove())
  const sections: Element[] = []
  for(const [name, sectionRows] of desired) {
    if(!sectionRows.length) continue
    const section = groups.find(group => group.localName === name) ?? table.ownerDocument.createElement(name)
    section.removeAttribute("role")
    if(!section.parentNode) table.append(section)
    // Insert only misplaced rows, retaining comments and already-correct nodes.
    let previous: HTMLTableRowElement | undefined
    for(const row of sectionRows) {
      if(row.parentElement !== section || previous && previous.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING) {
        const next = previous ? previous.nextSibling : Array.from(section.children).find(child => child.localName === "tr") ?? null
        section.insertBefore(row, next)
      }
      previous = row
      row.removeAttribute("role")
      const tag = name === "thead" ? "th" : "td"
      Array.from(row.children).filter(child => child.matches(tableCellSelector)).forEach(child => {
        let cell = child as HTMLTableCellElement
        if(cell.localName !== tag) {
          const replacement = table.ownerDocument.createElement(tag)
          Array.from(cell.attributes).forEach(attribute => replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value))
          replacement.append(...Array.from(cell.childNodes))
          cell.replaceWith(replacement)
          changedCells.set(cell, replacement)
          cell = replacement
        }
        for(const attribute of ["headers", "scope", "abbr", "role"]) cell.removeAttribute(attribute)
      })
    }
    sections.push(section)
  }
  for(const group of groups) {
    if(sections.includes(group)) continue
    // Retain comments and other authored nodes from removed section wrappers.
    group.replaceWith(...Array.from(group.childNodes))
  }
  let previous: Element | undefined = table.caption ?? undefined
  for(const section of sections) {
    if(previous && previous.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_PRECEDING) previous.after(section)
    previous = section
  }
  return changedCells
}
