import {EditorFeature} from "."
import {$, cloneWithoutEditorMarkers, createStylesheet, getInertDocument, isAppendixInteraction, modifierKeyDown, removeEditorMarker} from "../utility"
import {
  buildTableMap,
  normalizeTableStructure,
  cellForNode,
  clearTableMarkers,
  completeCellRectangle,
  createTable,
  maximumTableMapSlots,
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
type TableResizeEdge = {table: HTMLTableElement, column: number}
type SelectionPoint = {node: Node, offset: number}

const resizeDragThreshold = 4
const tableGapOffset = 8

function cellTagForRow(row: HTMLTableRowElement) {
  const cells = Array.from(row.children).filter(child => child.matches(tableCellSelector))
  return cells.length && cells.every(cell => cell.matches("th")) ? "th" : "td"
}

function newCellForRow(row: HTMLTableRowElement, source?: HTMLTableCellElement | null, tag?: "td" | "th") {
  const cell = document.createElement(tag ?? (source?.localName === "th" ? "th" : source?.localName === "td" ? "td" : cellTagForRow(row)))
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

function authoredClassValue(value: string | null) {
  return (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).sort().join(" ")
}

function inlineWidthInPixels(element: HTMLElement) {
  const inlineWidth = element.style.getPropertyValue("width").trim()
  if(!inlineWidth) return null
  const parsePixels = (value: string) => {
    const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))px$/i)
    return match ? Number.parseFloat(match[1]) : null
  }
  const width = parsePixels(inlineWidth) ?? parsePixels(getComputedStyle(element).width)
  if(width === null) return null
  return Number.isFinite(width) && width > 0 ? width : null
}

/** Native-HTML table editing. The authored table remains the document model;
 * this feature stores only transient cell-selection anchors and derives a
 * fresh rowspan/colspan occupancy map immediately before every command. */
export class TableFeature extends EditorFeature {
  protected handlesAppendixInteractions = true
  private gapOverlay: HTMLDivElement | null = null
  private gapStylesheet: CSSStyleSheet | null = null
  private gapFrame: number | null = null
  private gapResizeObserver: ResizeObserver | null = null
  private gapTable: HTMLTableElement | null = null
  private hoverTable: HTMLTableElement | null = null
  private gapControls: Array<{button: HTMLButtonElement, axis: "row" | "column", index: number, map: TableMap}> = []
  private anchorCell: HTMLTableCellElement | null = null
  private focusCell: HTMLTableCellElement | null = null
  private pendingCell: HTMLTableCellElement | null = null
  private pointerSelecting = false
  private textDragAnchor: SelectionPoint | null = null
  private observer: MutationObserver | null = null
  private refreshQueued = false
  private resizeHover: TableResizeEdge | null = null
  private pendingResize: {
    edge: TableResizeEdge
    startX: number
    startY: number
  } | null = null
  private resize: {
    table: HTMLTableElement
    column: number
    cells: Array<{cell: HTMLTableCellElement, width: number}>
    startX: number
    startWidth: number
    endUndoGroup: () => void
  } | null = null

  get hasCellSelection() {
    return Boolean(this.anchorCell?.isConnected && this.focusCell?.isConnected
      && tableForNode(this.anchorCell) === tableForNode(this.focusCell))
  }

  /** The connected logical focus of a rectangular cell selection. */
  get selectionFocusCell() {
    return this.hasCellSelection ? this.focusCell : null
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
    window.addEventListener("blur", this.finishResize)
    window.addEventListener("resize", this.scheduleGaps)
    const FrameResizeObserver = document.defaultView?.ResizeObserver
    if(FrameResizeObserver) this.gapResizeObserver = new FrameResizeObserver(this.scheduleGaps)
    this.scheduleGaps()
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
    if(!this.isEnabled) return
    window.removeEventListener("blur", this.finishResize)
    window.removeEventListener("resize", this.scheduleGaps)
    this.gapResizeObserver?.disconnect()
    this.gapResizeObserver = null
    if(this.gapFrame !== null) cancelAnimationFrame(this.gapFrame)
    this.gapFrame = null
    this.gapOverlay?.remove()
    this.gapOverlay = null
    this.gapControls = []
    this.gapTable = null
    this.hoverTable = null
    if(this.gapStylesheet) this.editor.appendix.adoptedStyleSheets = this.editor.appendix.adoptedStyleSheets.filter(sheet => sheet !== this.gapStylesheet)
    this.gapStylesheet = null
    this.observer?.disconnect()
    this.observer = null
    this.clearCellSelection(false)
    this.stopResize()
    this.setResizeHover(null)
    super.disable()
  }

  private scheduleRefresh = () => {
    if(this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if(!this.isEnabled) return
      this.scheduleGaps()
      if(this.hasCellSelection) {
        this.applyCellMarkers()
        this.editor.postSelectionPath()
      }
      else if(this.anchorCell || this.focusCell) this.clearCellSelection()
    })
  }

  private scheduleGaps = () => {
    if(!this.isEnabled || this.gapFrame !== null) return
    this.gapFrame = requestAnimationFrame(() => {
      this.gapFrame = null
      this.renderGaps()
    })
  }

  private editableTable(table: HTMLTableElement | null): table is HTMLTableElement {
    if(!table?.isConnected || this.editor.isEditingLocked) return false
    for(let node: Element | null = table; node && node !== document.body; node = node.parentElement) {
      if(node.localName.includes("-") || node.hasAttribute("is") || node.getAttribute("contenteditable") === "false") return false
    }
    return document.body.contains(table)
  }

  private createGapOverlay() {
    this.gapStylesheet = createStylesheet(`
      .◆table-gaps { position: fixed; inset: 0; pointer-events: none; z-index: 10002; color: var(--sl-color-primary-400, #38bdf8); }
      .◆table-gaps button { position: absolute; width: 24px; height: 24px; padding: 0; margin: 0; border: 0;
        background: transparent; color: inherit; pointer-events: auto; cursor: pointer; transform: translate(-50%, -50%); }
      .◆table-gaps button::before { content: ''; position: absolute; width: 6px; height: 6px; border-radius: 50%;
        background: currentColor; left: 50%; top: 50%; transform: translate(-50%, -50%); }
      .◆table-gaps button::after { content: ''; position: absolute; inset: 4px; border-radius: 50%;
        background: linear-gradient(white, white) center / 8px 2px no-repeat,
          linear-gradient(white, white) center / 2px 8px no-repeat, var(--sl-color-primary-400, #38bdf8);
        opacity: 0; }
      .◆table-gaps button:is(:hover, :focus-visible)::after { opacity: 1; }
      .◆table-gaps button:focus-visible { outline: 2px solid white; border-radius: 50%; }
      .◆table-gaps button span { position: absolute; display: none; background: currentColor; pointer-events: none; }
      .◆table-gaps button:is(:hover, :focus-visible) span { display: block; }
      .◆table-gaps button[data-axis=column] span { left: 11px; top: 12px; width: 2px; height: var(--gap-length); }
      .◆table-gaps button[data-axis=row] span { left: 12px; top: 11px; height: 2px; width: var(--gap-length); }
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.gapStylesheet]
    this.gapOverlay = document.createElement("div")
    this.gapOverlay.className = "◆table-gaps"
    this.gapOverlay.setAttribute("role", "group")
    this.gapOverlay.setAttribute("aria-label", "Insert table rows and columns")
    this.editor.addAppendix(this.gapOverlay)
    return this.gapOverlay
  }

  private renderGaps() {
    const table = this.editableTable(this.hoverTable) ? this.hoverTable : this.selectedTable
    if(!this.editableTable(table) || this.pointerSelecting || this.resize) {
      if(this.gapOverlay) this.gapOverlay.hidden = true
      return
    }
    const map = buildTableMap(table)
    const rect = table.getBoundingClientRect()
    if(!map.rows.length || !map.width || !rect.width || !rect.height) {
      if(this.gapOverlay) this.gapOverlay.hidden = true
      return
    }
    if(this.gapTable !== table) {
      this.gapResizeObserver?.disconnect()
      this.gapResizeObserver?.observe(table)
      this.gapResizeObserver?.observe(document.body)
      this.gapTable = table
    }
    const overlay = this.gapOverlay ?? this.createGapOverlay()
    overlay.hidden = false
    const rtl = getComputedStyle(table).direction === "rtl"
    const cellRects = new Map(map.placements.map(placement => [placement, placement.cell.getBoundingClientRect()]))
    const rowRects = map.rows.map(row => row.getBoundingClientRect())
    const top = rowRects[0].top
    const bottom = rowRects.at(-1)!.bottom
    let controlIndex = 0
    for(const axis of ["column", "row"] as const) {
      const count = axis === "column" ? map.width : map.rows.length
      for(let index = 0; index <= count; index++) {
        let position: number
        if(axis === "row") {
          position = index === 0 ? top : index === count ? bottom : (rowRects[index - 1].bottom + rowRects[index].top) / 2
        }
        else {
          const before = map.placements.find(cell => cell.column + cell.columnSpan === index)
          const after = map.placements.find(cell => cell.column === index)
          const end = before && cellRects.get(before)![rtl ? "left" : "right"]
          const start = after && cellRects.get(after)![rtl ? "right" : "left"]
          if(end !== undefined && start !== undefined) position = (end + start) / 2
          else if(end !== undefined || start !== undefined) position = (end ?? start)!
          else {
            const cell = map.placements.find(cell => cell.column < index && cell.column + cell.columnSpan > index)
            if(!cell) continue
            const box = cellRects.get(cell)!
            position = rtl ? box.right - box.width * (index - cell.column) / cell.columnSpan
              : box.left + box.width * (index - cell.column) / cell.columnSpan
          }
        }
        let control = this.gapControls[controlIndex++]
        if(!control) {
          const button = document.createElement("button")
          button.type = "button"
          const line = document.createElement("span")
          line.setAttribute("aria-hidden", "true")
          button.append(line)
          overlay.append(button)
          control = {button, axis, index, map}
          this.gapControls.push(control)
        }
        Object.assign(control, {axis, index, map})
        control.button.dataset.axis = axis
        control.button.setAttribute("aria-label", `Insert ${axis} ${index + 1}`)
        control.button.style.left = `${axis === "column" ? position : rect.left - tableGapOffset}px`
        control.button.style.top = `${axis === "row" ? position : top - tableGapOffset}px`
        control.button.style.setProperty("--gap-length", `${axis === "column" ? bottom - top + tableGapOffset : rect.width + tableGapOffset}px`)
      }
    }
    this.gapControls.splice(controlIndex).forEach(control => control.button.remove())
  }

  private gapControl(event: Event) {
    return this.gapControls.find(control => event.composedPath().includes(control.button))
  }

  private insertAtGap(event: Event) {
    const control = this.gapControl(event)
    if(!control || this.gapOverlay?.hidden) return
    event.preventDefault()
    const {map: previous, axis, index} = control
    const table = previous.table
    if(!this.editableTable(table)) return
    const current = buildTableMap(table)
    // Do not reinterpret an old handle after a remote or widget structural edit.
    if(current.rows.length !== previous.rows.length || current.width !== previous.width
      || current.rows.some((row, index) => row !== previous.rows[index])
      || current.placements.length !== previous.placements.length
      || current.placements.some((cell, index) => {
        const old = previous.placements[index]
        return cell.cell !== old.cell || cell.row !== old.row || cell.column !== old.column
          || cell.rowSpan !== old.rowSpan || cell.columnSpan !== old.columnSpan
      })) {
      this.scheduleGaps()
      return
    }
    const endUndoGroup = this.editor.doc.beginUndoGroup()
    try {
      axis === "row" ? this.insertRowAt(table, index) : this.insertColumnAt(table, index)
      this.hoverTable = table
      this.scheduleGaps()
    }
    finally { endUndoGroup() }
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
    if(map.limited) return []
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
    document.querySelectorAll(".◆table-cell-selected").forEach(cell => removeEditorMarker(cell, "◆table-cell-selected"))
    removeEditorMarker(document.body, "◆table-cell-selection")
  }

  private applyCellMarkers() {
    const cells = this.selectedCells
    const selected = new Set(cells)
    document.querySelectorAll(".◆table-cell-selected").forEach(cell => {
      if(!selected.has(cell as HTMLTableCellElement)) removeEditorMarker(cell, "◆table-cell-selected")
    })
    cells.forEach(cell => {
      if(!cell.classList.contains("◆table-cell-selected")) cell.classList.add("◆", "◆table-cell-selected")
    })
    const active = Boolean(cells.length)
    if(document.body.classList.contains("◆table-cell-selection") !== active) {
      document.body.classList.toggle("◆table-cell-selection", active)
    }
    if(active && !document.body.classList.contains("◆")) document.body.classList.add("◆")
    else removeEditorMarker(document.body)
  }

  clearCellSelection(post = true) {
    const hadSelection = this.hasCellSelection || Boolean(this.anchorCell || this.focusCell)
    this.anchorCell = null
    this.focusCell = null
    this.pendingCell = null
    this.pointerSelecting = false
    this.textDragAnchor = null
    this.pendingResize = null
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
      hasHeader: Boolean(map.table.querySelector(":scope > thead > tr")),
      hasFooter: Boolean(map.table.querySelector(":scope > tfoot > tr")),
    }
  }

  /** Adds only missing cells. Existing sections, cell types, attributes,
   * comments, captions, and merged cells are left intact. */
  normalizeTable(table: HTMLTableElement) {
    let map = buildTableMap(table)
    if(map.limited) return map
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
    if(table.isConnected) this.editor.postSelectionPath(true)
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
    this.insertRowAt(table, side === "above" ? rectangle.top : rectangle.bottom + 1, rectangle.top)
  }

  private insertRowAt(table: HTMLTableElement, boundary: number, sourceRow = boundary) {
    let map = this.normalizeTable(table)
    if(map.limited || boundary < 0 || boundary > map.rows.length) return
    if((map.rows.length + 1) * map.width > maximumTableMapSlots) return
    const crossing = map.placements.filter(placement => placement.row < boundary && placement.row + placement.rowSpan > boundary)
    crossing.forEach(placement => {
      if(placement.cell.getAttribute("rowspan") !== "0") placement.cell.rowSpan = placement.rowSpan + 1
    })

    const row = document.createElement("tr")
    const source = map.rows[Math.min(Math.max(0, sourceRow), map.rows.length - 1)]
    let parent: Element = source?.parentElement ?? table
    const sourceGroup = parent.localName
    if(source && (sourceGroup === "thead" && boundary > sourceRow
      || sourceGroup === "tfoot" && boundary <= sourceRow)) {
      parent = Array.from(table.children).find(child => child.localName === "tbody") ?? table.ownerDocument.createElement("tbody")
      if(!parent.parentNode) {
        const footer = Array.from(table.children).find(child => child.localName === "tfoot")
        footer ? table.insertBefore(parent, footer) : table.append(parent)
      }
    }
    const next = map.rows.slice(boundary).find(candidate => candidate.parentElement === parent)
    const previous = map.rows.slice(0, boundary).reverse().find(candidate => candidate.parentElement === parent)
    if(next) parent.insertBefore(row, next)
    else if(previous) previous.after(row)
    else parent.append(row)
    for(let column = 0; column < map.width; column++) {
      if(crossing.some(placement => placement.column <= column && column < placement.column + placement.columnSpan)) continue
      const source = map.matrix[Math.min(sourceRow, map.rows.length - 1)]?.[column]?.cell
      row.append(newCellForRow(row, source, parent.localName === "tbody" ? "td" : undefined))
    }
    normalizeTableStructure(table)
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
    this.insertColumnAt(table, side === "left" ? rectangle.left : rectangle.right + 1)
  }

  private insertColumnAt(table: HTMLTableElement, boundary: number) {
    let map = this.normalizeTable(table)
    if(map.limited || boundary < 0 || boundary > map.width) return
    if(map.rows.length * (map.width + 1) > maximumTableMapSlots) return
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
    const next = cloneWithoutEditorMarkers(table, false) as HTMLTableElement
    clearTableMarkers(next)
    next.removeAttribute("id")
    const sectionClones = new Map<Element, Element>()
    map.rows.slice(first.row).forEach(row => {
      const parent = row.parentElement!
      if(parent === table) next.append(row)
      else {
        let section = sectionClones.get(parent)
        if(!section) {
          section = cloneWithoutEditorMarkers(parent, false) as Element
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

  private toggleCaption() {
    const table = this.selectedTable
    if(!table) return
    const caption = table.caption
    if(!caption) {
      this.addCaption()
      return
    }
    const selectionWasInCaption = Boolean($.anchor && caption.contains($.anchor))
    caption.remove()
    if(selectionWasInCaption) {
      const cell = table.querySelector<HTMLTableCellElement>(tableCellSelector)
      cell ? $.move(cell, 0) : $.selectElement(table)
    }
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

  private toggleRowGroup(type: "thead" | "tfoot") {
    const table = this.selectedTable
    if(!table) return false
    const rows = buildTableMap(table).rows
    if(!rows.length) return false
    let header = Boolean(table.querySelector(":scope > thead > tr"))
    let footer = Boolean(table.querySelector(":scope > tfoot > tr"))
    if(type === "thead") {
      header = !header
      if(header && rows.length === 1) footer = false
    }
    else {
      footer = !footer
      if(footer && rows.length === 1) header = false
    }
    const endUndoGroup = this.editor.doc.beginUndoGroup()
    try {
      const anchor = this.hasCellSelection ? this.anchorCell : null
      const focus = this.hasCellSelection ? this.focusCell : null
      const selection = window.getSelection()
      const point = selection?.anchorNode && selection.focusNode ? {
        anchor: selection.anchorNode, anchorOffset: selection.anchorOffset,
        focus: selection.focusNode, focusOffset: selection.focusOffset,
      } : null
      const replacements = normalizeTableStructure(table, header, footer)
      if(anchor && focus) {
        const nextAnchor = replacements.get(anchor) ?? anchor
        const nextFocus = replacements.get(focus) ?? focus
        if(nextAnchor.isConnected && nextFocus.isConnected) this.selectCells(nextAnchor, nextFocus)
        else this.clearCellSelection(false)
      }
      else if(point) {
        const nextAnchor = replacements.get(point.anchor as HTMLTableCellElement) ?? point.anchor
        const nextFocus = replacements.get(point.focus as HTMLTableCellElement) ?? point.focus
        if(nextAnchor.isConnected && nextFocus.isConnected) {
          $.selectRange(nextAnchor, point.anchorOffset, nextFocus, point.focusOffset)
        }
      }
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
    }
    finally { endUndoGroup() }
    return true
  }

  deleteSelection() {
    const selected = this.selectedCells
    const table = tableForNode(selected[0])
    if(!selected.length || !table) return false

    const selectedSet = new Set(selected)
    const placements = buildTableMap(table).placements
    const selectedIndexes = placements.flatMap(({cell}, index) => selectedSet.has(cell) ? [index] : [])
    const first = selectedIndexes[0]
    const last = selectedIndexes.at(-1)!
    const nextCell = placements.slice(last + 1).find(({cell}) => !selectedSet.has(cell))?.cell
      ?? placements.slice(0, first).reverse().find(({cell}) => !selectedSet.has(cell))?.cell

    this.clearCellSelection(false)
    selected.forEach(cell => cell.remove())

    if(nextCell?.isConnected) this.selectCells(nextCell)
    else if(table.isConnected) {
      $.selectElement(table)
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
    }
    return true
  }

  private clipboardFragment() {
    const map = this.selectionMap()
    const rectangle = this.cellRectangle(map)
    if(!map || !rectangle) return null
    const table = getInertDocument(document).createElement("table")
    const body = table.createTBody()
    for(let rowIndex = rectangle.top; rowIndex <= rectangle.bottom; rowIndex++) {
      const row = body.insertRow()
      map.placements
        .filter(placement => placement.row === rowIndex && placement.column <= rectangle.right
          && placement.column + placement.columnSpan - 1 >= rectangle.left)
        .sort((a, b) => a.column - b.column)
        .forEach(placement => {
          const clone = cloneWithoutEditorMarkers(placement.cell, true, {inert: true}) as HTMLTableCellElement
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

  /** Missing clipboard capabilities return false. Permission and runtime
   * failures reject so command callers receive an actionable failure. */
  async copy() {
    const content = this.clipboardFragment()
    if(!content || typeof ClipboardItem !== "function" || !navigator.clipboard?.write) return false
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
      const {fragment} = this.editor.parseHTMLFragment(html, true)
      const table = fragment.querySelector<HTMLTableElement>("table")
      if(table) {
        const map = buildTableMap(table)
        return map.matrix.map(row => Array.from({length: map.width}, (_, column) => {
          const cell = row[column]?.cell
          return cell
            ? Array.from(cell.childNodes).map(node => cloneWithoutEditorMarkers(node, true, {inert: true}))
            : []
        }))
      }
    }
    const ownerDocument = getInertDocument(document)
    return plain.split(/\r?\n/).map(row => row.split("\t").map(text => [ownerDocument.createTextNode(text)] as Node[]))
  }

  private ensureSize(table: HTMLTableElement, rows: number, columns: number) {
    let map = this.normalizeTable(table)
    if(map.limited) return null
    if(Math.max(rows, map.rows.length) * Math.max(columns, map.width) > maximumTableMapSlots) return null
    while(map.rows.length < rows) {
      const last = map.rows.at(-1)!
      const row = document.createElement("tr")
      for(let column = 0; column < Math.max(columns, map.width); column++) row.append(newCellForRow(row, map.matrix.at(-1)?.[column]?.cell))
      last.after(row)
      map = this.normalizeTable(table)
      if(map.limited) return null
    }
    while(map.width < columns) {
      map.rows.forEach((row, rowIndex) => row.append(newCellForRow(row, map.matrix[rowIndex]?.at(-1)?.cell)))
      map = this.normalizeTable(table)
      if(map.limited) return null
    }
    normalizeTableStructure(table)
    return buildTableMap(table)
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
    const sizedMap = this.ensureSize(table, rectangle.top + targetRows, rectangle.left + targetColumns)
    if(!sizedMap) return false
    map = sizedMap
    const changed = new Set<HTMLTableCellElement>()
    for(let rowOffset = 0; rowOffset < targetRows; rowOffset++) {
      for(let columnOffset = 0; columnOffset < targetColumns; columnOffset++) {
        const target = map.matrix[rectangle.top + rowOffset]?.[rectangle.left + columnOffset]?.cell
        const source = matrix[rowOffset % sourceRows]?.[columnOffset % sourceColumns] ?? []
        if(!target || changed.has(target)) continue
        target.replaceChildren(...source.map(node => cloneWithoutEditorMarkers(node, true)))
        changed.add(target)
      }
    }
    const first = map.matrix[rectangle.top]?.[rectangle.left]?.cell
    const last = map.matrix[rectangle.top + targetRows - 1]?.[rectangle.left + targetColumns - 1]?.cell
    if(first && last) this.selectCells(first, last)
    return true
  }

  /** Missing clipboard capabilities return false; supported API failures are
   * deliberately propagated without changing the selected cells. */
  async paste() {
    if(!this.hasCellSelection || !navigator.clipboard?.read) return false
    const items = await navigator.clipboard.read()
    const htmlItem = items.find(item => item.types.includes("text/html"))
    const textItem = items.find(item => item.types.includes("text/plain"))
    const html = htmlItem ? await (await htmlItem.getType("text/html")).text() : ""
    const plain = textItem ? await (await textItem.getType("text/plain")).text() : ""
    return this.pasteMatrix(this.clipboardMatrix(html, plain))
  }

  private resizeEdge(event: PointerEvent, cell: HTMLTableCellElement): TableResizeEdge | null {
    const table = tableForNode(cell)
    if(!table) return null
    const map = buildTableMap(table)
    const placement = placementForCell(map, cell)
    if(!placement) return null
    const rect = cell.getBoundingClientRect()
    if(Math.abs(event.clientX - rect.right) <= 5) return {table, column: placement.column + placement.columnSpan - 1}
    if(placement.column > 0 && Math.abs(event.clientX - rect.left) <= 5) return {table, column: placement.column - 1}
    return null
  }

  private sameResizeEdge(first: TableResizeEdge | null, second: TableResizeEdge | null) {
    return Boolean(first && second && first.table === second.table && first.column === second.column)
  }

  private setResizeHover(edge: TableResizeEdge | null) {
    this.resizeHover = edge
    document.body.classList.toggle("◆table-column-edge", Boolean(edge))
    if(edge) document.body.classList.add("◆")
    else removeEditorMarker(document.body)
  }

  private startResize(edge: TableResizeEdge, startX: number) {
    if(this.resize || !edge.table.isConnected) return false
    const map = buildTableMap(edge.table)
    if(edge.column < 0 || edge.column >= map.width) return false
    // Every intermediate width belongs to the same drag.
    const endUndoGroup = this.editor.doc.beginUndoGroup()
    try {
      const targets = map.placements.filter(placement => placement.column <= edge.column
        && placement.column + placement.columnSpan > edge.column)
      const cells = targets.map(({cell}) => ({
        cell, width: inlineWidthInPixels(cell) ?? (cell.getBoundingClientRect().width || 80),
      }))
      if(!cells.length) return false
      const startWidth = Math.min(...cells.map(({width}, index) => width / targets[index].columnSpan))
      document.body.classList.add("◆", "◆table-column-resize")
      this.resize = {table: edge.table, column: edge.column, cells, startX, startWidth, endUndoGroup}
      return true
    }
    finally {
      if(!this.resize) endUndoGroup()
    }
  }

  private captureTextDragAnchor() {
    if(this.textDragAnchor || !this.pendingCell || !this.editor.features.selection.isInDragSelection) return
    const node = $.anchor
    if(node && cellForNode(node) === this.pendingCell && $.isTextSelection) {
      this.textDragAnchor = {node, offset: $.anchorOffset}
    }
  }

  private restoreTextDragSelection(restoreCaret = true) {
    const point = this.textDragAnchor
    const origin = this.pendingCell
    if(!point || !origin || !point.node.isConnected || cellForNode(point.node) !== origin) return false
    const maximumOffset = point.node instanceof Text ? point.node.length : point.node.childNodes.length
    if(point.offset < 0 || point.offset > maximumOffset) return false

    this.anchorCell = null
    this.focusCell = null
    this.pointerSelecting = false
    this.clearCellMarkers()
    // Returning to text dragging lets the selection feature restore both
    // endpoints later in this pointermove. Publishing a collapsed caret here
    // would briefly switch the host toolbox and mark controls.
    if(restoreCaret) {
      $.selectRange(point.node, point.offset)
      this.editor.features.selection.processSelection(true)
      this.editor.postSelectionPath()
    }
    return true
  }

  private edgeCellAtPoint(table: HTMLTableElement, x: number, y: number) {
    let closest: {cell: HTMLTableCellElement, distance: number} | null = null
    for(const {cell} of buildTableMap(table).placements) {
      const rect = cell.getBoundingClientRect()
      const horizontalDistance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
      const verticalDistance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
      const distance = horizontalDistance ** 2 + verticalDistance ** 2
      if(!closest || distance < closest.distance) closest = {cell, distance}
    }
    return closest?.cell ?? null
  }

  private updatePendingResize(event: PointerEvent) {
    const pending = this.pendingResize
    if(!pending) return false
    const horizontalDistance = Math.abs(event.clientX - pending.startX)
    const verticalDistance = Math.abs(event.clientY - pending.startY)
    if(horizontalDistance < resizeDragThreshold && verticalDistance < resizeDragThreshold) return false
    this.pendingResize = null
    if(horizontalDistance < resizeDragThreshold || horizontalDistance < verticalDistance) {
      this.setResizeHover(null)
      return false
    }

    this.restoreTextDragSelection()
    this.pendingCell = null
    this.pointerSelecting = false
    this.textDragAnchor = null
    this.editor.features.selection.isInDragSelection = false
    this.setResizeHover(null)
    return this.startResize(pending.edge, pending.startX) && this.updateResize(event)
  }

  private updateResize(event: PointerEvent) {
    if(!this.resize) return false
    if(!this.resize.table.isConnected || this.resize.cells.some(({cell}) => !cell.isConnected || tableForNode(cell) !== this.resize!.table)) {
      this.stopResize()
      return false
    }
    const width = Math.max(24, this.resize.startWidth + event.clientX - this.resize.startX)
    const delta = width - this.resize.startWidth
    this.resize.cells.forEach(({cell, width}) => cell.style.width = `${Math.round(Math.max(24, width + delta))}px`)
    return true
  }

  private stopResize() {
    if(!this.resize) return
    const {endUndoGroup} = this.resize
    this.resize = null
    removeEditorMarker(document.body, "◆table-column-resize")
    endUndoGroup()
    this.editor.postSelectionPath()
  }

  private finishResize = () => {
    this.stopResize()
    this.pendingCell = null
    this.pointerSelecting = false
    this.textDragAnchor = null
    this.pendingResize = null
    this.editor.features.selection.isInDragSelection = false
    this.setResizeHover(null)
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
    toggleTableCaption: ({}: {type: "toggleTableCaption"}) => this.toggleCaption(),
    toggleTableHeader: ({}: {type: "toggleTableHeader"}) => this.toggleRowGroup("thead"),
    toggleTableFooter: ({}: {type: "toggleTableFooter"}) => this.toggleRowGroup("tfoot"),
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

  captureListeners = {scroll: this.scheduleGaps}

  passiveListeners = {
    pointerout: (event: PointerEvent) => {
      if(!event.relatedTarget) {
        this.hoverTable = null
        this.scheduleGaps()
      }
    },
    selectionchange: () => queueMicrotask(() => {
      this.scheduleGaps()
      if(this.hasCellSelection && tableForNode($.anchor) !== tableForNode(this.anchorCell)) this.clearCellSelection()
    }),
  }

  activeListeners = {
    click: (event: MouseEvent) => this.insertAtGap(event),
    pointerdown: (event: PointerEvent) => {
      if(this.gapControl(event)) {
        event.preventDefault()
        this.finishResize()
        return
      }
      if(isAppendixInteraction(event)) return
      const cell = cellForNode(event.target instanceof Node ? event.target : null)
      // Modifier-click belongs to node selection; leave no cell drag or
      // column resize pending for subsequent pointer movement.
      if(!cell || modifierKeyDown(event)) {
        this.setResizeHover(null)
        this.clearCellSelection()
        return
      }
      const edge = this.resizeEdge(event, cell)
      const resizeArmed = document.body.classList.contains("◆table-column-edge")
        && this.sameResizeEdge(edge, this.resizeHover)
      if(event.shiftKey && this.hasCellSelection && tableForNode(this.anchorCell) === tableForNode(cell)) {
        this.setResizeHover(null)
        event.preventDefault()
        event.stopImmediatePropagation()
        this.selectCells(this.anchorCell!, cell)
        this.pendingCell = this.anchorCell
        this.pointerSelecting = true
        return
      }
      if(!resizeArmed) this.setResizeHover(null)
      this.clearCellSelection(false)
      this.pendingCell = cell
      if(resizeArmed && edge) {
        this.pendingResize = {edge, startX: event.clientX, startY: event.clientY}
      }
    },
    pointermove: (event: PointerEvent) => {
      if(isAppendixInteraction(event)) return
      const hovered = tableForNode(event.target instanceof Node ? event.target : null)
      const box = this.hoverTable?.getBoundingClientRect()
      if(hovered || !box || event.clientX < box.left - 32 || event.clientX > box.right + 16
        || event.clientY < box.top - 32 || event.clientY > box.bottom + 16) this.hoverTable = hovered
      this.scheduleGaps()
      if(this.updateResize(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      this.captureTextDragAnchor()
      if(this.updatePendingResize(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if(this.pendingCell) {
        if(!this.pendingCell.isConnected) {
          this.clearCellSelection()
          return
        }
        const target = event.target instanceof Node ? event.target : null
        const originRect = this.pendingCell.getBoundingClientRect()
        const hasOriginBox = originRect.right > originRect.left || originRect.bottom > originRect.top
        const insideOrigin = hasOriginBox
          ? originRect.left <= event.clientX && event.clientX <= originRect.right
            && originRect.top <= event.clientY && event.clientY <= originRect.bottom
          : target === this.pendingCell || Boolean(target && this.pendingCell.contains(target))
        if(insideOrigin) {
          if(this.pointerSelecting && !this.restoreTextDragSelection(false)) {
            event.preventDefault()
            event.stopImmediatePropagation()
            if(this.anchorCell !== this.pendingCell || this.focusCell !== this.pendingCell) this.selectCells(this.pendingCell)
          }
          return
        }
        const cell = cellForNode(target)
        const table = tableForNode(this.pendingCell)
        const tableRect = table?.getBoundingClientRect()
        const hasTableBox = Boolean(tableRect && (tableRect.right > tableRect.left || tableRect.bottom > tableRect.top))
        const pointInsideTable = !hasTableBox || Boolean(tableRect
          && tableRect.left <= event.clientX && event.clientX <= tableRect.right
          && tableRect.top <= event.clientY && event.clientY <= tableRect.bottom)
        const focus = pointInsideTable && cell && tableForNode(cell) === table
          ? cell
          : table ? this.edgeCellAtPoint(table, event.clientX, event.clientY) ?? this.pendingCell : this.pendingCell
        event.preventDefault()
        event.stopImmediatePropagation()
        this.pointerSelecting = true
        if(this.anchorCell !== this.pendingCell || this.focusCell !== focus) this.selectCells(this.pendingCell, focus)
        return
      }
      const cell = cellForNode(event.target instanceof Node ? event.target : null)
      const edge = cell ? this.resizeEdge(event, cell) : null
      this.setResizeHover(edge)
    },
    pointerup: (event: PointerEvent) => {
      if(isAppendixInteraction(event)) return
      if(this.resize) {
        event.preventDefault()
        this.stopResize()
      }
      else if(this.pointerSelecting) {
        event.preventDefault()
      }
      this.pendingCell = null
      this.pointerSelecting = false
      this.textDragAnchor = null
      this.pendingResize = null
      this.setResizeHover(null)
    },
    pointercancel: this.finishResize,
    keydown: (event: KeyboardEvent) => {
      if(isAppendixInteraction(event)) return
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
      if(isAppendixInteraction(event)) return
      const content = this.clipboardFragment()
      if(!content) return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.clipboardData?.setData("text/html", content.html)
      event.clipboardData?.setData("text/plain", content.plain)
    },
    cut: (event: ClipboardEvent) => {
      if(isAppendixInteraction(event)) return
      const content = this.clipboardFragment()
      if(!content) return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.clipboardData?.setData("text/html", content.html)
      event.clipboardData?.setData("text/plain", content.plain)
      this.deleteSelection()
    },
    paste: (event: ClipboardEvent) => {
      if(isAppendixInteraction(event)) return
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
