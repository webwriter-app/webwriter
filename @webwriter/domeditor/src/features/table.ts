import {EditorFeature} from "."
import {$, modifierKeyDown} from "../utility"
import {
  buildTableMap,
  cellForNode,
  clearTableMarkers,
  completeCellRectangle,
  createTable,
  placementForCell,
  placementsInRectangle,
  tableCellSelector,
  tableForNode,
  type TableCellPlacement,
  type TableMap,
  type TableSelectionState,
} from "../table"

type CellRectangle = {top: number, left: number, bottom: number, right: number}
type TableSide = "above" | "below" | "left" | "right"
type TableCellStyle = "background-color" | "border-color" | "border-style" | "border-width"

function cellTagForRow(row: HTMLTableRowElement) {
  const cells = Array.from(row.children).filter(child => child.matches(tableCellSelector))
  return cells.length && cells.every(cell => cell.matches("th")) ? "th" : "td"
}

function newCellForRow(row: HTMLTableRowElement, source?: HTMLTableCellElement | null) {
  const cell = document.createElement(source?.localName === "th" ? "th" : source?.localName === "td" ? "td" : cellTagForRow(row))
  if(source) {
    Array.from(source.attributes).forEach(attribute => {
      if(attribute.name !== "id" && attribute.name !== "rowspan" && attribute.name !== "colspan"
        && attribute.name !== "class") cell.setAttribute(attribute.name, attribute.value)
    })
    const authoredClasses = Array.from(source.classList).filter(name => !name.startsWith("◆"))
    if(authoredClasses.length) cell.classList.add(...authoredClasses)
  }
  return cell as HTMLTableCellElement
}

function removeMarker(element: Element, marker: string) {
  element.classList.remove(marker)
  if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) element.classList.remove("◆")
  if(!element.classList.length) element.removeAttribute("class")
}

function authoredClassValue(value: string | null) {
  return (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).sort().join(" ")
}

/** Native-HTML table editing. The authored table remains the document model;
 * this feature stores only transient cell-selection anchors and derives a
 * fresh rowspan/colspan occupancy map immediately before every command. */
export class TableFeature extends EditorFeature {
  private anchorCell: HTMLTableCellElement | null = null
  private focusCell: HTMLTableCellElement | null = null
  private pendingCell: HTMLTableCellElement | null = null
  private pointerSelecting = false
  private observer: MutationObserver | null = null
  private refreshQueued = false
  private resize: {
    table: HTMLTableElement
    column: number
    columnElement: HTMLTableColElement
    startX: number
    startWidth: number
  } | null = null

  get hasCellSelection() {
    return Boolean(this.anchorCell?.isConnected && this.focusCell?.isConnected
      && tableForNode(this.anchorCell) === tableForNode(this.focusCell))
  }

  get selectedTable() {
    if(this.hasCellSelection) return tableForNode(this.anchorCell)
    const selected = $.selectedElement
    if(selected?.matches("table")) return selected as HTMLTableElement
    return tableForNode($.anchor)
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver
    if(FrameMutationObserver) {
      this.observer = new FrameMutationObserver(mutations => {
        const hasAuthoredMutation = mutations.some(mutation => (
          mutation.type !== "attributes"
          || mutation.attributeName !== "class"
          || !(mutation.target instanceof Element)
          || authoredClassValue(mutation.oldValue) !== authoredClassValue(mutation.target.getAttribute("class"))
        ))
        if(hasAuthoredMutation) this.scheduleRefresh()
      })
      try {
        this.observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeOldValue: true,
        })
      }
      catch {
        this.observer.disconnect()
        this.observer = null
      }
    }
  }

  disable() {
    this.observer?.disconnect()
    this.observer = null
    this.clearCellSelection(false)
    this.stopResize()
    document.body.classList.remove("◆table-column-edge")
    super.disable()
  }

  private scheduleRefresh = () => {
    if(this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if(!this.isEnabled) return
      if(this.hasCellSelection) {
        this.applyCellMarkers()
        this.editor.postSelectionPath()
      }
      else if(this.anchorCell || this.focusCell) this.clearCellSelection()
    })
  }

  private selectionMap() {
    const table = this.selectedTable
    return table ? buildTableMap(table) : null
  }

  private cellRectangle(map = this.selectionMap()): CellRectangle | null {
    if(!map || !this.hasCellSelection) return null
    const anchor = placementForCell(map, this.anchorCell)
    const focus = placementForCell(map, this.focusCell)
    return anchor && focus ? completeCellRectangle(map, anchor, focus) : null
  }

  get selectedCells() {
    const map = this.selectionMap()
    const rectangle = this.cellRectangle(map)
    return map && rectangle
      ? placementsInRectangle(map, rectangle.top, rectangle.left, rectangle.bottom, rectangle.right).map(({cell}) => cell)
      : []
  }

  private actionCells(map: TableMap) {
    const selected = this.selectedCells
    if(selected.length) return selected
    const current = cellForNode($.anchor)
    if(current && tableForNode(current) === map.table) return [current]
    return map.placements.map(({cell}) => cell)
  }

  private actionRectangle(map: TableMap) {
    const selected = this.cellRectangle(map)
    if(selected) return selected
    const current = placementForCell(map, cellForNode($.anchor))
    if(current) return completeCellRectangle(map, current, current)
    return map.rows.length && map.width
      ? {top: 0, left: 0, bottom: map.rows.length - 1, right: map.width - 1}
      : null
  }

  private clearCellMarkers() {
    document.querySelectorAll(".◆table-cell-selected").forEach(cell => removeMarker(cell, "◆table-cell-selected"))
    document.body.classList.remove("◆table-cell-selection")
    if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) document.body.classList.remove("◆")
    if(!document.body.classList.length) document.body.removeAttribute("class")
  }

  private applyCellMarkers() {
    const cells = this.selectedCells
    const selected = new Set(cells)
    document.querySelectorAll(".◆table-cell-selected").forEach(cell => {
      if(!selected.has(cell as HTMLTableCellElement)) removeMarker(cell, "◆table-cell-selected")
    })
    cells.forEach(cell => {
      if(!cell.classList.contains("◆table-cell-selected")) cell.classList.add("◆", "◆table-cell-selected")
    })
    const active = Boolean(cells.length)
    if(document.body.classList.contains("◆table-cell-selection") !== active) {
      document.body.classList.toggle("◆table-cell-selection", active)
    }
    if(active && !document.body.classList.contains("◆")) document.body.classList.add("◆")
    else if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) document.body.classList.remove("◆")
  }

  clearCellSelection(post = true) {
    const hadSelection = this.hasCellSelection || Boolean(this.anchorCell || this.focusCell)
    this.anchorCell = null
    this.focusCell = null
    this.pendingCell = null
    this.pointerSelecting = false
    this.clearCellMarkers()
    if(post && hadSelection) this.editor.postSelectionPath()
  }

  /** Establishes a rectangular selection and expands it around merged cells. */
  selectCells(anchor: HTMLTableCellElement, focus: HTMLTableCellElement = anchor) {
    const table = tableForNode(anchor)
    if(!table || tableForNode(focus) !== table) return false
    const map = buildTableMap(table)
    if(!placementForCell(map, anchor) || !placementForCell(map, focus)) return false
    this.anchorCell = anchor
    this.focusCell = focus
    $.move(anchor, 0)
    this.applyCellMarkers()
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    return true
  }

  getState(): TableSelectionState | undefined {
    const map = this.selectionMap()
    if(!map) return
    const cells = this.actionCells(map)
    const selected = this.selectedCells
    return {
      active: true,
      cellSelection: this.hasCellSelection,
      rows: map.rows.length,
      columns: map.width,
      selectedCells: selected.length,
      canMerge: selected.length > 1,
      canSplit: cells.some(cell => {
        const placement = placementForCell(map, cell)
        return Boolean(placement && (placement.rowSpan > 1 || placement.columnSpan > 1))
      }),
      hasCaption: Boolean(map.table.caption),
    }
  }

  /** Adds only missing cells. Existing sections, cell types, attributes,
   * comments, captions, and merged cells are left intact. */
  normalizeTable(table: HTMLTableElement) {
    let map = buildTableMap(table)
    if(!map.rows.length) {
      const body = table.tBodies[0] ?? table.createTBody()
      body.insertRow().append(document.createElement("td"))
      map = buildTableMap(table)
    }
    const width = Math.max(1, map.width)
    map.rows.forEach((row, rowIndex) => {
      for(let column = 0; column < width; column++) {
        if(!map.matrix[rowIndex]?.[column]) row.append(newCellForRow(row))
      }
    })
    return buildTableMap(table)
  }

  private insertTable(rows: number, columns: number) {
    if(!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1 || rows > 100 || columns > 100) {
      throw new RangeError("A table must contain between 1 and 100 rows and columns")
    }
    const table = createTable(rows, columns)
    this.editor.features.manipulation.insert(table)
    while(table.isConnected && table.parentElement && !this.editor.schema.isContentValid(table.parentElement)) {
      const parent = table.parentElement
      $.selectElement(table)
      this.editor.features.manipulation.lift()
      if(table.parentElement === parent) break
    }
    const firstCell = table.querySelector<HTMLTableCellElement>(tableCellSelector)
    if(firstCell) this.selectCells(firstCell)
    else if(table.isConnected) $.selectElement(table)
    return table
  }

  private selectedPlacement(map: TableMap, prefer: "first" | "last") {
    const rectangle = this.actionRectangle(map)
    if(!rectangle) return null
    const placements = placementsInRectangle(map, rectangle.top, rectangle.left, rectangle.bottom, rectangle.right)
      .sort((a, b) => a.row - b.row || a.column - b.column)
    return prefer === "first" ? placements[0] ?? null : placements.at(-1) ?? null
  }

  private insertRow(side: Extract<TableSide, "above" | "below">) {
    const table = this.selectedTable
    if(!table) return
    let map = this.normalizeTable(table)
    const rectangle = this.actionRectangle(map)
    if(!rectangle) return
    const boundary = side === "above" ? rectangle.top : rectangle.bottom + 1
    const crossing = map.placements.filter(placement => placement.row < boundary && placement.row + placement.rowSpan > boundary)
    crossing.forEach(placement => {
      if(placement.cell.getAttribute("rowspan") !== "0") placement.cell.rowSpan = placement.rowSpan + 1
    })

    const row = document.createElement("tr")
    const reference = side === "above" ? map.rows[rectangle.top] : map.rows[rectangle.bottom]
    side === "above" ? reference.before(row) : reference.after(row)
    for(let column = 0; column < map.width; column++) {
      if(crossing.some(placement => placement.column <= column && column < placement.column + placement.columnSpan)) continue
      const source = map.matrix[Math.min(rectangle.top, map.rows.length - 1)]?.[column]?.cell
      row.append(newCellForRow(row, source))
    }
    map = this.normalizeTable(table)
    const rowIndex = map.rows.indexOf(row)
    const cells = map.placements.filter(placement => placement.row === rowIndex).map(({cell}) => cell)
    if(cells.length) this.selectCells(cells[0], cells.at(-1)!)
  }

  private insertCellAt(map: TableMap, rowIndex: number, column: number, cell: HTMLTableCellElement) {
    const row = map.rows[rowIndex]
    const next = map.placements
      .filter(placement => placement.row === rowIndex && placement.column >= column)
      .sort((a, b) => a.column - b.column)[0]
    next ? next.cell.before(cell) : row.append(cell)
  }

  private insertColumn(side: Extract<TableSide, "left" | "right">) {
    const table = this.selectedTable
    if(!table) return
    let map = this.normalizeTable(table)
    const rectangle = this.actionRectangle(map)
    if(!rectangle) return
    const boundary = side === "left" ? rectangle.left : rectangle.right + 1
    const crossing = map.placements.filter(placement => placement.column < boundary
      && placement.column + placement.columnSpan > boundary)
    crossing.forEach(placement => placement.cell.colSpan = placement.columnSpan + 1)

    const inserted: HTMLTableCellElement[] = []
    map.rows.forEach((row, rowIndex) => {
      if(crossing.some(placement => placement.row <= rowIndex && rowIndex < placement.row + placement.rowSpan)) return
      const source = map.matrix[rowIndex]?.[Math.min(boundary, Math.max(0, map.width - 1))]?.cell
      const cell = newCellForRow(row, source)
      this.insertCellAt(map, rowIndex, boundary, cell)
      inserted.push(cell)
    })
    map = this.normalizeTable(table)
    const connected = inserted.filter(cell => cell.isConnected)
    if(connected.length) this.selectCells(connected[0], connected.at(-1)!)
  }

  private mergeCells() {
    const table = this.selectedTable
    if(!table || !this.hasCellSelection) return
    const map = this.normalizeTable(table)
    const rectangle = this.cellRectangle(map)
    if(!rectangle) return
    const placements = placementsInRectangle(map, rectangle.top, rectangle.left, rectangle.bottom, rectangle.right)
      .sort((a, b) => a.row - b.row || a.column - b.column)
    if(placements.length < 2) return
    const primary = placements[0].cell
    placements.slice(1).forEach(({cell}) => {
      primary.append(...Array.from(cell.childNodes))
      cell.remove()
    })
    const rowSpan = rectangle.bottom - rectangle.top + 1
    const columnSpan = rectangle.right - rectangle.left + 1
    rowSpan > 1 ? primary.setAttribute("rowspan", String(rowSpan)) : primary.removeAttribute("rowspan")
    columnSpan > 1 ? primary.setAttribute("colspan", String(columnSpan)) : primary.removeAttribute("colspan")
    this.selectCells(primary)
  }

  private splitCells() {
    const table = this.selectedTable
    if(!table) return
    const map = this.normalizeTable(table)
    const targets = this.actionCells(map)
      .map(cell => placementForCell(map, cell))
      .filter((placement): placement is TableCellPlacement => Boolean(placement && (placement.rowSpan > 1 || placement.columnSpan > 1)))
    targets.forEach(placement => {
      placement.cell.removeAttribute("rowspan")
      placement.cell.removeAttribute("colspan")
      for(let row = placement.row; row < placement.row + placement.rowSpan; row++) {
        for(let column = placement.column; column < placement.column + placement.columnSpan; column++) {
          if(row === placement.row && column === placement.column) continue
          const current = buildTableMap(table)
          this.insertCellAt(current, row, column, newCellForRow(current.rows[row], placement.cell))
        }
      }
    })
    if(targets[0]) this.selectCells(targets[0].cell)
  }

  private splitTable() {
    const table = this.selectedTable
    if(!table) return
    const map = this.normalizeTable(table)
    const first = this.selectedPlacement(map, "first")
    if(!first || first.row === 0) return
    const next = table.cloneNode(false) as HTMLTableElement
    clearTableMarkers(next)
    next.removeAttribute("id")
    Array.from(table.children).filter(child => child.matches("colgroup")).forEach(group => next.append(group.cloneNode(true)))
    const sectionClones = new Map<Element, Element>()
    map.rows.slice(first.row).forEach(row => {
      const parent = row.parentElement!
      if(parent === table) next.append(row)
      else {
        let section = sectionClones.get(parent)
        if(!section) {
          section = parent.cloneNode(false) as Element
          sectionClones.set(parent, section)
          next.append(section)
        }
        section.append(row)
      }
    })
    Array.from(table.children).filter(child => child.matches("thead, tbody, tfoot") && !child.querySelector("tr")).forEach(child => child.remove())
    table.after(next)
    const cell = next.querySelector<HTMLTableCellElement>(tableCellSelector)
    cell ? this.selectCells(cell) : $.selectElement(next)
  }

  private addCaption() {
    const table = this.selectedTable
    if(!table) return
    const caption = table.caption ?? table.createCaption()
    if(table.firstElementChild !== caption) table.prepend(caption)
    this.clearCellSelection(false)
    $.move(caption, 0)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
  }

  private setCellStyle(property: TableCellStyle, value: string) {
    const table = this.selectedTable
    if(!table) return
    const map = buildTableMap(table)
    this.actionCells(map).forEach(cell => value
      ? cell.style.setProperty(property, value)
      : cell.style.removeProperty(property))
    this.editor.postSelectionPath()
  }

  deleteSelection() {
    this.selectedCells.forEach(cell => cell.replaceChildren())
    this.applyCellMarkers()
    this.editor.postSelectionPath()
  }

  private clipboardFragment() {
    const map = this.selectionMap()
    const rectangle = this.cellRectangle(map)
    if(!map || !rectangle) return null
    const table = document.createElement("table")
    const body = table.createTBody()
    for(let rowIndex = rectangle.top; rowIndex <= rectangle.bottom; rowIndex++) {
      const row = body.insertRow()
      map.placements
        .filter(placement => placement.row === rowIndex && placement.column <= rectangle.right
          && placement.column + placement.columnSpan - 1 >= rectangle.left)
        .sort((a, b) => a.column - b.column)
        .forEach(placement => {
          const clone = placement.cell.cloneNode(true) as HTMLTableCellElement
          const rowSpan = Math.min(placement.rowSpan, rectangle.bottom - placement.row + 1)
          const columnSpan = Math.min(placement.columnSpan, rectangle.right - placement.column + 1)
          rowSpan > 1 ? clone.setAttribute("rowspan", String(rowSpan)) : clone.removeAttribute("rowspan")
          columnSpan > 1 ? clone.setAttribute("colspan", String(columnSpan)) : clone.removeAttribute("colspan")
          row.append(clone)
        })
    }
    clearTableMarkers(table)
    const plain = Array.from({length: rectangle.bottom - rectangle.top + 1}, (_, rowOffset) =>
      Array.from({length: rectangle.right - rectangle.left + 1}, (_, columnOffset) =>
        map.matrix[rectangle.top + rowOffset]?.[rectangle.left + columnOffset]?.cell.textContent ?? "",
      ).join("\t"),
    ).join("\n")
    return {table, html: table.outerHTML, plain}
  }

  async copy() {
    const content = this.clipboardFragment()
    if(!content) return false
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": content.html,
      "text/plain": content.plain,
    })])
    return true
  }

  async cut() {
    const copied = await this.copy()
    if(copied) this.deleteSelection()
    return copied
  }

  private clipboardMatrix(html: string, plain: string) {
    if(html) {
      const template = document.createElement("template")
      template.innerHTML = html
      const table = template.content.querySelector<HTMLTableElement>("table")
      if(table) {
        const map = buildTableMap(table)
        return map.matrix.map(row => Array.from({length: map.width}, (_, column) => {
          const cell = row[column]?.cell
          return cell ? Array.from(cell.childNodes).map(node => node.cloneNode(true)) : []
        }))
      }
    }
    return plain.split(/\r?\n/).map(row => row.split("\t").map(text => [document.createTextNode(text)] as Node[]))
  }

  private ensureSize(table: HTMLTableElement, rows: number, columns: number) {
    let map = this.normalizeTable(table)
    while(map.rows.length < rows) {
      const last = map.rows.at(-1)!
      const row = document.createElement("tr")
      for(let column = 0; column < Math.max(columns, map.width); column++) row.append(newCellForRow(row, map.matrix.at(-1)?.[column]?.cell))
      last.after(row)
      map = this.normalizeTable(table)
    }
    while(map.width < columns) {
      map.rows.forEach((row, rowIndex) => row.append(newCellForRow(row, map.matrix[rowIndex]?.at(-1)?.cell)))
      map = this.normalizeTable(table)
    }
    return map
  }

  private pasteMatrix(matrix: Node[][][]) {
    const table = this.selectedTable
    if(!table || !matrix.length || !matrix.some(row => row.length)) return false
    let map = this.normalizeTable(table)
    const rectangle = this.actionRectangle(map)
    if(!rectangle) return false
    const sourceRows = matrix.length
    const sourceColumns = Math.max(...matrix.map(row => row.length))
    const targetRows = this.hasCellSelection ? Math.max(sourceRows, rectangle.bottom - rectangle.top + 1) : sourceRows
    const targetColumns = this.hasCellSelection ? Math.max(sourceColumns, rectangle.right - rectangle.left + 1) : sourceColumns
    map = this.ensureSize(table, rectangle.top + targetRows, rectangle.left + targetColumns)
    const changed = new Set<HTMLTableCellElement>()
    for(let rowOffset = 0; rowOffset < targetRows; rowOffset++) {
      for(let columnOffset = 0; columnOffset < targetColumns; columnOffset++) {
        const target = map.matrix[rectangle.top + rowOffset]?.[rectangle.left + columnOffset]?.cell
        const source = matrix[rowOffset % sourceRows]?.[columnOffset % sourceColumns] ?? []
        if(!target || changed.has(target)) continue
        target.replaceChildren(...source.map(node => node.cloneNode(true)))
        changed.add(target)
      }
    }
    const first = map.matrix[rectangle.top]?.[rectangle.left]?.cell
    const last = map.matrix[rectangle.top + targetRows - 1]?.[rectangle.left + targetColumns - 1]?.cell
    if(first && last) this.selectCells(first, last)
    return true
  }

  async paste() {
    if(!this.hasCellSelection) return false
    const items = await navigator.clipboard.read()
    const htmlItem = items.find(item => item.types.includes("text/html"))
    const textItem = items.find(item => item.types.includes("text/plain"))
    const html = htmlItem ? await (await htmlItem.getType("text/html")).text() : ""
    const plain = textItem ? await (await textItem.getType("text/plain")).text() : ""
    return this.pasteMatrix(this.clipboardMatrix(html, plain))
  }

  private normalizeColumnElements(table: HTMLTableElement, width: number) {
    let groups = Array.from(table.children).filter((child): child is HTMLTableColElement => child.matches("colgroup"))
    if(!groups.length) {
      const group = document.createElement("colgroup")
      if(table.caption) table.caption.after(group)
      else table.prepend(group)
      groups = [group]
    }
    const columns: HTMLTableColElement[] = []
    groups.forEach(group => {
      const children = Array.from(group.children).filter((child): child is HTMLTableColElement => child.matches("col"))
      if(!children.length) {
        const span = Math.max(1, Number.parseInt(group.getAttribute("span") ?? "1", 10) || 1)
        group.removeAttribute("span")
        for(let index = 0; index < span; index++) group.append(document.createElement("col"))
      }
      Array.from(group.children).filter((child): child is HTMLTableColElement => child.matches("col")).forEach(column => {
        const span = Math.max(1, Number.parseInt(column.getAttribute("span") ?? "1", 10) || 1)
        column.removeAttribute("span")
        columns.push(column)
        for(let index = 1; index < span; index++) {
          const clone = column.cloneNode(false) as HTMLTableColElement
          column.after(clone)
          columns.push(clone)
        }
      })
    })
    const targetGroup = groups.at(-1)!
    while(columns.length < width) {
      const column = document.createElement("col")
      targetGroup.append(column)
      columns.push(column)
    }
    return columns
  }

  private resizeEdge(event: PointerEvent, cell: HTMLTableCellElement) {
    const table = tableForNode(cell)
    if(!table) return null
    const map = buildTableMap(table)
    const placement = placementForCell(map, cell)
    if(!placement) return null
    const rect = cell.getBoundingClientRect()
    if(Math.abs(event.clientX - rect.right) <= 5) return {table, map, column: placement.column + placement.columnSpan - 1}
    if(placement.column > 0 && Math.abs(event.clientX - rect.left) <= 5) return {table, map, column: placement.column - 1}
    return null
  }

  private startResize(event: PointerEvent, cell: HTMLTableCellElement) {
    const edge = this.resizeEdge(event, cell)
    if(!edge) return false
    const columns = this.normalizeColumnElements(edge.table, edge.map.width)
    const columnElement = columns[edge.column]
    if(!columnElement) return false
    const placement = edge.map.matrix.find(row => row[edge.column])?.[edge.column]
    const cellWidth = placement?.cell.getBoundingClientRect().width ?? 0
    const startWidth = cellWidth > 0 ? cellWidth / (placement?.columnSpan ?? 1)
      : Number.parseFloat(getComputedStyle(columnElement).width) || 80
    this.resize = {table: edge.table, column: edge.column, columnElement, startX: event.clientX, startWidth}
    document.body.classList.add("◆", "◆table-column-resize")
    return true
  }

  private updateResize(event: PointerEvent) {
    if(!this.resize) return false
    const width = Math.max(24, this.resize.startWidth + event.clientX - this.resize.startX)
    this.resize.columnElement.style.width = `${Math.round(width)}px`
    return true
  }

  private stopResize() {
    if(!this.resize) return
    this.resize = null
    document.body.classList.remove("◆table-column-resize")
    if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) document.body.classList.remove("◆")
    if(!document.body.classList.length) document.body.removeAttribute("class")
    this.editor.postSelectionPath()
  }

  private navigateCells(event: KeyboardEvent) {
    const keyOffsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    }
    const offset = keyOffsets[event.key]
    if(!offset) return false
    const currentCell = this.hasCellSelection ? this.focusCell : event.shiftKey ? cellForNode($.anchor) : null
    const table = tableForNode(currentCell)
    if(!currentCell || !table) return false
    const map = buildTableMap(table)
    const current = placementForCell(map, currentCell)
    if(!current) return false
    const row = offset[0] < 0 ? current.row - 1
      : offset[0] > 0 ? current.row + current.rowSpan
        : current.row
    const column = offset[1] < 0 ? current.column - 1
      : offset[1] > 0 ? current.column + current.columnSpan
        : current.column
    if(row < 0 && event.key === "ArrowUp") {
      this.clearCellSelection(false)
      $.selectGap(table, "before")
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
      return true
    }
    if(row >= map.rows.length && event.key === "ArrowDown") {
      this.clearCellSelection(false)
      $.selectGap(table, "after")
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
      return true
    }
    const target = map.matrix[row]?.[column]?.cell
    if(!target) return false
    const anchor = event.shiftKey ? (this.hasCellSelection ? this.anchorCell! : currentCell) : target
    this.selectCells(anchor, target)
    return true
  }

  actions = {
    insertTable: ({rows, columns}: {type: "insertTable", rows: number, columns: number}) => this.insertTable(rows, columns),
    insertTableRow: ({side}: {type: "insertTableRow", side: "above" | "below"}) => this.insertRow(side),
    insertTableColumn: ({side}: {type: "insertTableColumn", side: "left" | "right"}) => this.insertColumn(side),
    mergeTableCells: ({}: {type: "mergeTableCells"}) => this.mergeCells(),
    splitTableCells: ({}: {type: "splitTableCells"}) => this.splitCells(),
    splitTable: ({}: {type: "splitTable"}) => this.splitTable(),
    addTableCaption: ({}: {type: "addTableCaption"}) => this.addCaption(),
    setTableCellStyle: ({property, value}: {type: "setTableCellStyle", property: TableCellStyle, value: string}) => {
      if(!["background-color", "border-color", "border-style", "border-width"].includes(property)) {
        throw new TypeError(`Unsupported table cell style '${String(property)}'`)
      }
      this.setCellStyle(property, value)
    },
    normalizeTable: ({}: {type: "normalizeTable"}) => {
      const table = this.selectedTable
      return table ? this.normalizeTable(table) : undefined
    },
  } as const

  passiveListeners = {
    selectionchange: () => queueMicrotask(() => {
      if(this.hasCellSelection && tableForNode($.anchor) !== tableForNode(this.anchorCell)) this.clearCellSelection()
    }),
  }

  activeListeners = {
    pointerdown: (event: PointerEvent) => {
      const cell = cellForNode(event.target instanceof Node ? event.target : null)
      if(!cell) {
        this.clearCellSelection()
        return
      }
      if(this.startResize(event, cell)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if(event.shiftKey && this.hasCellSelection && tableForNode(this.anchorCell) === tableForNode(cell)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.selectCells(this.anchorCell!, cell)
        this.pointerSelecting = true
        return
      }
      this.clearCellSelection(false)
      this.pendingCell = cell
    },
    pointermove: (event: PointerEvent) => {
      if(this.updateResize(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if(this.pendingCell) {
        const cell = cellForNode(event.target instanceof Node ? event.target : null)
        if(cell && cell !== this.pendingCell && tableForNode(cell) === tableForNode(this.pendingCell)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          this.pointerSelecting = true
          this.selectCells(this.pendingCell, cell)
        }
        return
      }
      const cell = cellForNode(event.target instanceof Node ? event.target : null)
      const edge = cell ? this.resizeEdge(event, cell) : null
      document.body.classList.toggle("◆table-column-edge", Boolean(edge))
      if(edge) document.body.classList.add("◆")
      else if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) document.body.classList.remove("◆")
    },
    pointerup: (event: PointerEvent) => {
      if(this.resize) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.stopResize()
      }
      else if(this.pointerSelecting) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      this.pendingCell = null
      this.pointerSelecting = false
    },
    keydown: (event: KeyboardEvent) => {
      if((event.key === "Backspace" || event.key === "Delete") && this.hasCellSelection) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.deleteSelection()
        return
      }
      if(event.key === "Escape" && this.hasCellSelection) {
        const cell = this.focusCell
        this.clearCellSelection(false)
        if(cell?.isConnected) $.move(cell, 0)
        this.editor.features.selection.processSelection()
        this.editor.postSelectionPath()
        return
      }
      if(!event.altKey && !modifierKeyDown(event) && this.navigateCells(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    copy: (event: ClipboardEvent) => {
      const content = this.clipboardFragment()
      if(!content) return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.clipboardData?.setData("text/html", content.html)
      event.clipboardData?.setData("text/plain", content.plain)
    },
    cut: (event: ClipboardEvent) => {
      const content = this.clipboardFragment()
      if(!content) return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.clipboardData?.setData("text/html", content.html)
      event.clipboardData?.setData("text/plain", content.plain)
      this.deleteSelection()
    },
    paste: (event: ClipboardEvent) => {
      if(!this.hasCellSelection || !event.clipboardData) return
      const html = event.clipboardData.getData("text/html")
      const plain = event.clipboardData.getData("text/plain")
      if(!html && !plain) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.pasteMatrix(this.clipboardMatrix(html, plain))
    },
  }
}
