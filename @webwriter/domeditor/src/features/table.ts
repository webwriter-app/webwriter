import {EditorFeature} from "."
import {$, cloneWithoutEditorMarkers, modifierKeyDown} from "../utility"
import {
  buildTableMap,
  cellForNode,
  clearTableMarkers,
  completeCellRectangle,
  createTable,
  isTableCellRole,
  isTableRowGroupType,
  placementForCell,
  placementsInRectangle,
  tableCellSelector,
  tableForNode,
  type TableCellPlacement,
  type TableCellRole,
  type TableColumnGroupState,
  type TableMap,
  type TableRowGroupState,
  type TableRowGroupType,
  type TableSelectionState,
} from "../table"

type CellRectangle = {top: number, left: number, bottom: number, right: number}
type TableSide = "above" | "below" | "left" | "right"
type TableCellStyle = "background-color" | "border-color" | "border-style" | "border-width"
type TableResizeEdge = {table: HTMLTableElement, column: number}
type SelectionPoint = {node: Node, offset: number}

const resizeDragThreshold = 4

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

function stateAttributes(element: Element) {
  return Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
    if(attribute.name !== "class") return [[attribute.name, attribute.value]]
    const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
    return classes.length ? [["class", classes.join(" ")]] : []
  }))
}

function equalAttributes(element: Element, expected: Record<string, string>) {
  const current = stateAttributes(element)
  const names = Object.keys(current)
  return names.length === Object.keys(expected).length && names.every(name => current[name] === expected[name])
}

function pathFrom(root: Node, node: Node) {
  const path: number[] = []
  let current: Node | null = node
  while(current && current !== root) {
    const parent: ParentNode | null = current.parentNode
    if(!parent) return null
    const index = Array.from(parent.childNodes).indexOf(current as ChildNode)
    if(index < 0) return null
    path.unshift(index)
    current = parent as Node
  }
  return current === root ? path : null
}

function nodeAtPath(root: Node, path: number[]) {
  return path.reduce<Node | null>((node, index) => node?.childNodes.item(index) ?? null, root)
}

function sharedCellAttribute(cells: HTMLTableCellElement[], name: string) {
  const values = new Set(cells.map(cell => cell.getAttribute(name) ?? ""))
  return values.size === 1 ? values.values().next().value as string : null
}

function roleForCell(cell: HTMLTableCellElement): TableCellRole {
  if(cell.localName === "td") return "data"
  switch(cell.getAttribute("scope")?.toLowerCase()) {
    case "col": return "column-header"
    case "row": return "row-header"
    case "colgroup": return "column-group-header"
    case "rowgroup": return "row-group-header"
    default: return "header"
  }
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
    columnElement: HTMLTableColElement
    startX: number
    startWidth: number
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

  private actionRows(map: TableMap) {
    const rectangle = this.actionRectangle(map)
    return rectangle ? map.rows.slice(rectangle.top, rectangle.bottom + 1) : []
  }

  private rowGroupState(table: HTMLTableElement): TableRowGroupState[] {
    return Array.from(table.childNodes).flatMap((node, index) => (
      node instanceof Element && isTableRowGroupType(node.localName)
        ? [{
          index,
          type: node.localName,
          rows: Array.from(node.children).filter(child => child.localName === "tr").length,
          attributes: stateAttributes(node),
        }]
        : []
    ))
  }

  private columnGroupState(table: HTMLTableElement): TableColumnGroupState[] {
    return Array.from(table.children).flatMap(group => {
      if(group.localName !== "colgroup") return []
      const groupPath = pathFrom(table, group)
      if(!groupPath) return []
      return [{
        path: groupPath,
        attributes: stateAttributes(group),
        columns: Array.from(group.children).flatMap(column => {
          if(column.localName !== "col") return []
          const path = pathFrom(table, column)
          return path ? [{path, attributes: stateAttributes(column)}] : []
        }),
      }]
    })
  }

  getState(): TableSelectionState | undefined {
    const map = this.selectionMap()
    if(!map) return
    const cells = this.actionCells(map)
    const selected = this.selectedCells
    const rows = this.actionRows(map)
    const rowGroupTypes = new Set(rows.map(row => {
      const parent = row.parentElement
      return parent && isTableRowGroupType(parent.localName) ? parent.localName : "direct"
    }))
    const cellRoles = new Set(cells.map(roleForCell))
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
      selectedRowGroup: rowGroupTypes.size === 1
        ? rowGroupTypes.values().next().value as TableRowGroupType | "direct"
        : "mixed",
      rowGroups: this.rowGroupState(map.table),
      canAddHeaderGroup: !Array.from(map.table.children).some(child => child.localName === "thead"),
      canAddFooterGroup: !Array.from(map.table.children).some(child => child.localName === "tfoot"),
      columnGroups: this.columnGroupState(map.table),
      cellSemantics: {
        role: cellRoles.size === 1 ? cellRoles.values().next().value as TableCellRole : "mixed",
        headers: sharedCellAttribute(cells, "headers"),
        abbr: sharedCellAttribute(cells, "abbr"),
      },
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
    const next = cloneWithoutEditorMarkers(table, false) as HTMLTableElement
    clearTableMarkers(next)
    next.removeAttribute("id")
    Array.from(table.children).filter(child => child.matches("colgroup"))
      .forEach(group => next.append(cloneWithoutEditorMarkers(group, true)))
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

  private rowGroupShell(source: Element, type: TableRowGroupType, keepId: boolean) {
    const group = cloneWithoutEditorMarkers(source, false) as HTMLTableSectionElement
    const replacement = document.createElement(type)
    Array.from(group.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value))
    if(!keepId) replacement.removeAttribute("id")
    return replacement
  }

  private convertRowSegment(rows: HTMLTableRowElement[], type: TableRowGroupType) {
    const first = rows[0]
    const last = rows.at(-1)
    if(!first || !last || first.parentElement !== last.parentElement) return
    const parent = first.parentElement
    const table = tableForNode(first)
    if(!parent || !table) return
    if(parent === table) {
      const group = document.createElement(type)
      first.before(group)
      rows.forEach(row => group.append(row))
      return
    }
    if(!isTableRowGroupType(parent.localName) || parent.localName === type) return
    const directRows = Array.from(parent.children).filter((child): child is HTMLTableRowElement => child.localName === "tr")
    const firstPosition = directRows.indexOf(first)
    const lastPosition = directRows.indexOf(last)
    if(firstPosition < 0 || lastPosition < firstPosition) return
    const nodes = Array.from(parent.childNodes)
    const firstIndex = nodes.indexOf(first)
    const lastIndex = nodes.indexOf(last)
    const hasPrefix = firstPosition > 0
    const hasSuffix = lastPosition < directRows.length - 1
    const prefixNodes = hasPrefix ? nodes.slice(0, firstIndex) : []
    const selectedNodes = nodes.slice(hasPrefix ? firstIndex : 0, hasSuffix ? lastIndex + 1 : nodes.length)
    const suffixNodes = hasSuffix ? nodes.slice(lastIndex + 1) : []
    const groups: HTMLTableSectionElement[] = []
    if(hasPrefix) {
      const prefix = this.rowGroupShell(parent, parent.localName, true)
      prefix.append(...prefixNodes)
      groups.push(prefix)
    }
    const selected = this.rowGroupShell(parent, type, !hasPrefix)
    selected.append(...selectedNodes)
    groups.push(selected)
    if(hasSuffix) {
      const suffix = this.rowGroupShell(parent, parent.localName, false)
      suffix.append(...suffixNodes)
      groups.push(suffix)
    }
    parent.replaceWith(...groups)
  }

  private convertSelectedRows(type: TableRowGroupType) {
    const table = this.selectedTable
    if(!table || !isTableRowGroupType(type)) return false
    const rows = this.actionRows(buildTableMap(table))
    if(!rows.length) return false
    const segments: HTMLTableRowElement[][] = []
    rows.forEach(row => {
      const segment = segments.at(-1)
      if(segment?.at(-1)?.parentElement === row.parentElement) segment.push(row)
      else segments.push([row])
    })
    segments.forEach(segment => this.convertRowSegment(segment, type))
    if(this.anchorCell?.isConnected && this.focusCell?.isConnected) this.applyCellMarkers()
    this.editor.postSelectionPath()
    return true
  }

  private rowGroupAt(index: number, expected: Record<string, string>) {
    if(!Number.isInteger(index) || index < 0 || !expected || typeof expected !== "object" || Array.isArray(expected)) return null
    const table = this.selectedTable
    const group = table?.childNodes.item(index)
    return group instanceof Element && isTableRowGroupType(group.localName) && equalAttributes(group, expected)
      ? group as HTMLTableSectionElement
      : null
  }

  private insertRowGroup(type: TableRowGroupType) {
    const table = this.selectedTable
    if(!table || !isTableRowGroupType(type)) return false
    if(type !== "tbody" && Array.from(table.children).some(child => child.localName === type)) return false
    const group = document.createElement(type)
    const row = document.createElement("tr")
    const width = Math.max(1, buildTableMap(table).width)
    for(let index = 0; index < width; index++) row.append(document.createElement(type === "thead" ? "th" : "td"))
    group.append(row)
    const children = Array.from(table.children)
    const reference = type === "thead"
      ? children.find(child => child.matches("thead, tbody, tfoot, tr")) ?? null
      : type === "tbody"
        ? children.find(child => child.localName === "tfoot") ?? null
        : null
    table.insertBefore(group, reference)
    const cells = Array.from(row.children) as HTMLTableCellElement[]
    if(cells.length) this.selectCells(cells[0], cells.at(-1)!)
    else this.editor.postSelectionPath()
    return true
  }

  private removeRowGroup(index: number, expected: Record<string, string>) {
    const group = this.rowGroupAt(index, expected)
    if(!group) return false
    group.replaceWith(...Array.from(group.childNodes))
    if(this.anchorCell?.isConnected && this.focusCell?.isConnected) this.applyCellMarkers()
    this.editor.postSelectionPath()
    return true
  }

  private moveRowGroup(index: number, expected: Record<string, string>, direction: -1 | 1) {
    if(direction !== -1 && direction !== 1) throw new TypeError("Row groups can only move up or down")
    const group = this.rowGroupAt(index, expected)
    const table = this.selectedTable
    if(!group || !table) return false
    const groups = Array.from(table.children).filter((child): child is HTMLTableSectionElement => isTableRowGroupType(child.localName))
    const position = groups.indexOf(group)
    const neighbour = groups[position + direction]
    if(!neighbour) return false
    direction < 0 ? table.insertBefore(group, neighbour) : table.insertBefore(group, neighbour.nextSibling)
    this.editor.postSelectionPath()
    return true
  }

  private columnElement(path: number[], expected: Record<string, string>) {
    if(!Array.isArray(path) || path.some(index => !Number.isInteger(index) || index < 0)
      || !expected || typeof expected !== "object" || Array.isArray(expected)) return null
    const table = this.selectedTable
    const element = table ? nodeAtPath(table, path) : null
    return element instanceof Element
      && (element.localName === "colgroup" || element.localName === "col")
      && equalAttributes(element, expected)
      ? element as HTMLTableColElement
      : null
  }

  private addColumnGroup() {
    const table = this.selectedTable
    if(!table) return false
    const group = document.createElement("colgroup")
    group.setAttribute("span", "1")
    const groups = Array.from(table.children).filter(child => child.localName === "colgroup")
    const reference = groups.at(-1)?.nextSibling
      ?? Array.from(table.children).find(child => child.matches("thead, tbody, tfoot, tr"))
      ?? null
    table.insertBefore(group, reference)
    this.editor.postSelectionPath()
    return true
  }

  private removeColumnGroup(path: number[], expected: Record<string, string>) {
    const group = this.columnElement(path, expected)
    if(!group || group.localName !== "colgroup" || group.parentElement !== this.selectedTable) return false
    group.remove()
    this.editor.postSelectionPath()
    return true
  }

  private moveColumnGroup(path: number[], expected: Record<string, string>, direction: -1 | 1) {
    if(direction !== -1 && direction !== 1) throw new TypeError("Column groups can only move up or down")
    const group = this.columnElement(path, expected)
    const table = this.selectedTable
    if(!group || group.localName !== "colgroup" || group.parentElement !== table || !table) return false
    const groups = Array.from(table.children).filter((child): child is HTMLTableColElement => child.localName === "colgroup")
    const position = groups.indexOf(group)
    const neighbour = groups[position + direction]
    if(!neighbour) return false
    direction < 0 ? table.insertBefore(group, neighbour) : table.insertBefore(group, neighbour.nextSibling)
    this.editor.postSelectionPath()
    return true
  }

  private addColumn(path: number[], expected: Record<string, string>) {
    const group = this.columnElement(path, expected)
    if(!group || group.localName !== "colgroup") return false
    const columns = Array.from(group.children).filter(child => child.localName === "col")
    if(!columns.length) {
      const span = Math.max(1, Number.parseInt(group.getAttribute("span") ?? "1", 10) || 1)
      group.removeAttribute("span")
      for(let index = 0; index < span; index++) group.append(document.createElement("col"))
    }
    else group.append(document.createElement("col"))
    this.editor.postSelectionPath()
    return true
  }

  private removeColumn(path: number[], expected: Record<string, string>) {
    const column = this.columnElement(path, expected)
    if(!column || column.localName !== "col" || column.parentElement?.localName !== "colgroup") return false
    const group = column.parentElement
    column.remove()
    if(group && !Array.from(group.children).some(child => child.localName === "col")) group.setAttribute("span", "1")
    this.editor.postSelectionPath()
    return true
  }

  private setColumnSpan(path: number[], expected: Record<string, string>, value: string | null) {
    const element = this.columnElement(path, expected)
    if(!element) return false
    if(value !== null && (!/^[1-9]\d*$/.test(value) || Number(value) > 1000)) throw new RangeError("Column span must be between 1 and 1000")
    if(element.localName === "colgroup" && element.querySelector(":scope > col") && value !== null) return false
    value === null ? element.removeAttribute("span") : element.setAttribute("span", value)
    this.editor.postSelectionPath()
    return true
  }

  private replaceCell(cell: HTMLTableCellElement, tag: "td" | "th", scope: string | null) {
    const replacement = document.createElement(tag) as HTMLTableCellElement
    Array.from(cell.attributes).forEach(attribute => {
      if(attribute.name === "class") {
        const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
        if(classes.length) replacement.setAttribute("class", classes.join(" "))
      }
      else replacement.setAttribute(attribute.name, attribute.value)
    })
    if(tag === "td") {
      replacement.removeAttribute("scope")
      replacement.removeAttribute("abbr")
    }
    else if(scope) replacement.setAttribute("scope", scope)
    else replacement.removeAttribute("scope")
    replacement.append(...Array.from(cell.childNodes))
    cell.replaceWith(replacement)
    return replacement
  }

  private setCellRole(role: TableCellRole) {
    if(!isTableCellRole(role)) throw new TypeError(`Unsupported table cell role '${String(role)}'`)
    const table = this.selectedTable
    if(!table) return false
    const cells = this.actionCells(buildTableMap(table))
    if(!cells.length) return false
    const tag = role === "data" ? "td" : "th"
    const scope = role === "column-header" ? "col"
      : role === "row-header" ? "row"
        : role === "column-group-header" ? "colgroup"
          : role === "row-group-header" ? "rowgroup"
            : null
    const replacements = new Map<HTMLTableCellElement, HTMLTableCellElement>()
    cells.forEach(cell => replacements.set(cell, this.replaceCell(cell, tag, scope)))
    const anchor = this.anchorCell ? replacements.get(this.anchorCell) ?? this.anchorCell : null
    const focus = this.focusCell ? replacements.get(this.focusCell) ?? this.focusCell : null
    if(anchor?.isConnected && focus?.isConnected) this.selectCells(anchor, focus)
    else this.editor.postSelectionPath()
    return true
  }

  private setCellSemanticAttribute(name: "headers" | "abbr", value: string | null) {
    const table = this.selectedTable
    if(!table) return false
    const cells = this.actionCells(buildTableMap(table))
    if(!cells.length || name === "abbr" && cells.some(cell => cell.localName !== "th")) return false
    cells.forEach(cell => value === null ? cell.removeAttribute(name) : cell.setAttribute(name, value))
    this.editor.postSelectionPath()
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
    const table = document.createElement("table")
    const body = table.createTBody()
    for(let rowIndex = rectangle.top; rowIndex <= rectangle.bottom; rowIndex++) {
      const row = body.insertRow()
      map.placements
        .filter(placement => placement.row === rowIndex && placement.column <= rectangle.right
          && placement.column + placement.columnSpan - 1 >= rectangle.left)
        .sort((a, b) => a.column - b.column)
        .forEach(placement => {
          const clone = cloneWithoutEditorMarkers(placement.cell, true) as HTMLTableCellElement
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
      const template = document.createElement("template")
      template.innerHTML = html
      const table = template.content.querySelector<HTMLTableElement>("table")
      if(table) {
        const map = buildTableMap(table)
        return map.matrix.map(row => Array.from({length: map.width}, (_, column) => {
          const cell = row[column]?.cell
          return cell ? Array.from(cell.childNodes).map(node => cloneWithoutEditorMarkers(node, true)) : []
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
          const clone = cloneWithoutEditorMarkers(column, false) as HTMLTableColElement
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
    else if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) document.body.classList.remove("◆")
  }

  private startResize(edge: TableResizeEdge, startX: number) {
    if(!edge.table.isConnected) return false
    const map = buildTableMap(edge.table)
    if(edge.column < 0 || edge.column >= map.width) return false
    const columns = this.normalizeColumnElements(edge.table, map.width)
    const columnElement = columns[edge.column]
    if(!columnElement) return false
    const placement = map.matrix.find(row => row[edge.column])?.[edge.column]
    const cellWidth = placement?.cell.getBoundingClientRect().width ?? 0
    const persistedWidth = inlineWidthInPixels(columnElement)
    const startWidth = persistedWidth ?? (cellWidth > 0 ? cellWidth / (placement?.columnSpan ?? 1)
      : Number.parseFloat(getComputedStyle(columnElement).width) || 80
    )
    this.resize = {table: edge.table, column: edge.column, columnElement, startX, startWidth}
    document.body.classList.add("◆", "◆table-column-resize")
    return true
  }

  private captureTextDragAnchor() {
    if(this.textDragAnchor || !this.pendingCell || !this.editor.features.selection.isInDragSelection) return
    const node = $.anchor
    if(node && cellForNode(node) === this.pendingCell && $.isTextSelection) {
      this.textDragAnchor = {node, offset: $.anchorOffset}
    }
  }

  private restoreTextDragSelection() {
    const point = this.textDragAnchor
    const origin = this.pendingCell
    if(!point || !origin || !point.node.isConnected || cellForNode(point.node) !== origin) return false
    const maximumOffset = point.node instanceof Text ? point.node.length : point.node.childNodes.length
    if(point.offset < 0 || point.offset > maximumOffset) return false

    this.anchorCell = null
    this.focusCell = null
    this.pointerSelecting = false
    this.clearCellMarkers()
    $.selectRange(point.node, point.offset)
    this.editor.features.selection.processSelection(true)
    this.editor.postSelectionPath()
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
    toggleTableCaption: ({}: {type: "toggleTableCaption"}) => this.toggleCaption(),
    convertTableRows: ({group}: {type: "convertTableRows", group: TableRowGroupType}) => this.convertSelectedRows(group),
    insertTableRowGroup: ({group}: {type: "insertTableRowGroup", group: TableRowGroupType}) => this.insertRowGroup(group),
    removeTableRowGroup: ({index, expected}: {
      type: "removeTableRowGroup", index: number, expected: Record<string, string>
    }) => this.removeRowGroup(index, expected),
    moveTableRowGroup: ({index, expected, direction}: {
      type: "moveTableRowGroup", index: number, expected: Record<string, string>, direction: -1 | 1
    }) => this.moveRowGroup(index, expected, direction),
    addTableColumnGroup: ({}: {type: "addTableColumnGroup"}) => this.addColumnGroup(),
    removeTableColumnGroup: ({path, expected}: {
      type: "removeTableColumnGroup", path: number[], expected: Record<string, string>
    }) => this.removeColumnGroup(path, expected),
    moveTableColumnGroup: ({path, expected, direction}: {
      type: "moveTableColumnGroup", path: number[], expected: Record<string, string>, direction: -1 | 1
    }) => this.moveColumnGroup(path, expected, direction),
    addTableColumnDefinition: ({path, expected}: {
      type: "addTableColumnDefinition", path: number[], expected: Record<string, string>
    }) => this.addColumn(path, expected),
    removeTableColumnDefinition: ({path, expected}: {
      type: "removeTableColumnDefinition", path: number[], expected: Record<string, string>
    }) => this.removeColumn(path, expected),
    setTableColumnSpan: ({path, expected, value}: {
      type: "setTableColumnSpan", path: number[], expected: Record<string, string>, value: string | null
    }) => this.setColumnSpan(path, expected, value),
    setTableCellRole: ({role}: {type: "setTableCellRole", role: TableCellRole}) => this.setCellRole(role),
    setTableCellSemanticAttribute: ({name, value}: {
      type: "setTableCellSemanticAttribute", name: "headers" | "abbr", value: string | null
    }) => this.setCellSemanticAttribute(name, value),
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
          if(this.pointerSelecting && !this.restoreTextDragSelection()) {
            event.preventDefault()
            event.stopImmediatePropagation()
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
    pointercancel: () => {
      this.stopResize()
      this.pendingCell = null
      this.pointerSelecting = false
      this.textDragAnchor = null
      this.pendingResize = null
      this.editor.features.selection.isInDragSelection = false
      this.setResizeHover(null)
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
