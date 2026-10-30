import {EditorFeature, type DocumentListenerMap} from "."
import {$, atomicEditingContainer, clearEditorMarkerClasses, createAnchorPositioner, createStylesheet, isAppendixInteraction, isCaretAtBoundary, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker, setPart} from "../utility"
import {getDocumentRoot} from "../document-template"
import {boardClass, boardColumns, boardColumnSelector, boardStyles, documentLayoutMode, isBoardCard, isBoardColumn, isBoardGroup} from "../document-layout"

type DragSelection = {anchor: Node | null, focus: Node | null, anchorOffset: number, focusOffset: number}

/** Authored sections and articles own the board; editing controls stay in the appendix. */
export class BoardFeature extends EditorFeature {
  readonly readerPermission = "view" as const
  private controls: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private layoutStylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private anchors = createAnchorPositioner()
  private measuredTransforms = false
  private frame: number | null = null
  private columnsCache: HTMLElement[] = []
  private groupsCache: HTMLElement[] = []
  private cardsCache: HTMLElement[] = []
  private pressedHandle = false
  private pressedSelection: DragSelection | null = null
  private drag: {source: HTMLElement, parent: HTMLElement, token: string, selection: DragSelection} | null = null
  private dropIndicator: HTMLElement | null = null
  private readonly dragType = "application/x-webwriter-board"
  private transformOverlays = new Map<HTMLElement, HTMLElement>()
  private locked = false
  private permissionSignature = ""
  private placements: Array<{button: HTMLButtonElement, target: HTMLElement, position: "add-card" | "add-column"}> = []
  get active() { return documentLayoutMode() === "board" }
  groups() { return Array.from(document.body.children).filter(isBoardGroup) }
  columns() { return boardColumns() }
  cards(column: HTMLElement) { return Array.from(column.children).filter(isBoardCard) }

  containingCard(node: Node | null): HTMLElement | null {
    while(node && node !== document.body) { if(isBoardCard(node)) return node; node = node.parentNode }
    return null
  }
  containingColumn(node: Node | null): HTMLElement | null {
    while(node && node !== document.body) { if(isBoardColumn(node)) return node; node = node.parentNode }
    return null
  }
  editingScope(node: Node | null): HTMLElement | null {
    const card = this.containingCard(node)
    if(card) return card
    const column = this.containingColumn(node)
    let element = node instanceof Element ? node : node?.parentElement
    while(element && element.parentElement !== column) element = element.parentElement
    if(column && element instanceof HTMLElement && element.matches("h2:not([is])")) return element
    element = node instanceof Element ? node : node?.parentElement
    while(element && !isBoardGroup(element.parentElement)) element = element.parentElement
    return element instanceof HTMLElement && element.matches("h2:not([is])") ? element : null
  }
  allowsSelection(range = document.getSelection()?.rangeCount ? $.range : null) {
    if(!this.active) return true
    if(!range || !document.body.contains(range.startContainer) || !document.body.contains(range.endContainer)) return false
    if(!this.columns().length && !this.groups().length) return range.collapsed && range.startContainer === document.body
    const selected = range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1
      ? range.startContainer.childNodes[range.startOffset] : null
    if(isBoardGroup(selected) || isBoardColumn(selected) || isBoardCard(selected) || selected && this.editingScope(selected) === selected) return true
    const start = this.editingScope(range.startContainer)
    return Boolean(start && start === this.editingScope(range.endContainer))
  }
  constrainSelection() {
    if(!this.active || this.allowsSelection()) return
    // The breadcrumb selects BODY to expose document options and layouts.
    if($.selectedElement === document.body) return
    const selection = document.getSelection(), scope = this.editingScope(selection?.anchorNode ?? null)
    if(scope && selection) selection.collapse(selection.anchorNode, selection.anchorOffset)
    else {
      const first = this.columns()[0]?.firstElementChild
      if(first) $.move(first)
      else selection?.removeAllRanges()
    }
  }
  /** Do not let text deletion join adjacent cards or erase a column heading. */
  atBoundary(direction: "backward" | "forward") {
    if(!this.active || !$.isEmpty) return false
    const scope = this.editingScope($.anchor)
    return Boolean(scope && isCaretAtBoundary(scope, direction === "backward" ? "start" : "end"))
  }

  private createColumn() {
    const column = document.createElement("section"), heading = document.createElement("h2")
    column.className = "ww-board-column"
    column.append(heading)
    return column
  }
  private createCard(nodes: Node[] = [document.createElement("p")]) {
    const card = document.createElement("article")
    card.className = "ww-board-card"; card.append(...nodes)
    this.ensureCardContent(card)
    return card
  }
  private ensureCardContent(card: HTMLElement) {
    if(Array.from(card.childNodes).some(node => node instanceof Element || node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return null
    const paragraph = document.createElement("p"); card.append(paragraph)
    return paragraph
  }
  private ensureStyles() {
    if(!Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === boardStyles)) {
      const style = document.createElement("style"); style.textContent = boardStyles; document.head.append(style)
    }
  }
  ensureContent() {
    if(!this.active) return null
    for(const card of this.columns().flatMap(column => this.cards(column))) {
      const paragraph = this.ensureCardContent(card), selection = document.getSelection()
      if(paragraph && selection?.isCollapsed && selection.anchorNode === card) $.move(paragraph)
    }
    return null
  }
  conversionReason() {
    return getDocumentRoot() !== document.body ? "A custom document template owns this document's layout." : null
  }
  private plainWrapper(element: Element, name: string) {
    return Array.from(element.attributes).every(attribute => attribute.name === "class")
      && Array.from(element.classList).every(value => value === name || value.startsWith("◆"))
  }
  private unwrap(element: HTMLElement, name: string) {
    if(this.plainWrapper(element, name)) element.replaceWith(...element.childNodes)
    else {
      element.classList.remove(name)
      if(!element.classList.length) element.removeAttribute("class")
    }
  }
  /** Flatten only recognized board wrappers; preserve all authored nodes and attributes within them. */
  documentContent() {
    const content = (node: Node): Node[] => (isBoardGroup(node) && this.plainWrapper(node, "ww-board-group")
      || isBoardColumn(node) && this.plainWrapper(node, "ww-board-column") || isBoardCard(node) && this.plainWrapper(node, "ww-board-card"))
      ? Array.from(node.childNodes).flatMap(content) : [node]
    return Array.from(document.body.childNodes).flatMap(content)
  }
  convert(mode: "board" | "document", captureUndo = true) {
    if(this.editor.isEditingLocked || !this.editor.allows("edit", document.body)
      || mode === "board" && (documentLayoutMode() !== "document" || this.conversionReason())
      || mode === "document" && !this.active) return false
    const end = captureUndo ? this.editor.doc.beginUndoGroup() : () => {}
    try {
      if(mode === "board") {
        const content = Array.from(document.body.childNodes).filter(node => !(node instanceof Element && node.matches("style,script,link,meta,template")))
        this.ensureStyles()
        const column = this.createColumn()
        document.body.insertBefore(column, content[0] ?? null)
        column.append(this.createCard(content.length ? content : undefined))
        document.body.classList.add(boardClass)
        $.move(column.firstElementChild!)
      }
      else {
        const groups = this.groups()
        for(const column of this.columns()) {
          // Empty headings added by the layout have no authored attributes/content.
          for(const heading of column.querySelectorAll(":scope > h2")) {
            if(this.emptyHeading(heading)) heading.remove()
          }
          for(const card of this.cards(column)) this.unwrap(card, "ww-board-card")
          this.unwrap(column, "ww-board-column")
        }
        for(const group of groups) {
          for(const heading of group.querySelectorAll(":scope > h2")) {
            if(this.emptyHeading(heading)) heading.remove()
          }
          this.unwrap(group, "ww-board-group")
        }
        document.body.classList.remove(boardClass)
        if(!document.body.classList.length) document.body.removeAttribute("class")
      }
    }
    finally { end() }
    this.refresh(); this.editor.postSelectionPath()
    return true
  }
  private edit(run: () => HTMLElement | null) {
    if(!this.active || this.editor.isEditingLocked) return false
    const end = this.editor.doc.beginUndoGroup()
    let target: HTMLElement | null
    try { target = run() }
    finally { end() }
    if(!target) return false
    $.move(target)
    this.editor.features.selection.processSelection()
    target.scrollIntoView?.({block: "nearest", inline: "nearest"})
    this.refresh(); this.editor.postSelectionPath()
    return true
  }
  addColumn() {
    if(!this.editor.allows("insert", document.body)) return false
    return this.edit(() => {
      const column = this.createColumn(); document.body.append(column)
      return column.firstElementChild as HTMLElement
    })
  }
  private selectedColumn() {
    return this.containingColumn(this.editor.features.selection.captureSelectedElement ?? $.selectedElement ?? document.getSelection()?.anchorNode ?? null)
  }
  private neighboringGroup(column: HTMLElement, direction: "left" | "right") {
    if(!isBoardColumn(column)) return null
    const owner = isBoardGroup(column.parentElement) ? column.parentElement : column
    const neighbor = direction === "left" ? owner.previousElementSibling : owner.nextElementSibling
    return isBoardGroup(neighbor) ? neighbor : null
  }
  groupingState(node: Node | null) {
    const column = this.active ? this.containingColumn(node) : null
    if(!column) return undefined
    const allowed = !this.editor.isEditingLocked && this.editor.allows("move", column)
    const left = this.neighboringGroup(column, "left"), right = this.neighboringGroup(column, "right")
    return {grouped: isBoardGroup(column.parentElement),
      canCreate: allowed && this.editor.allows("insert", document.body),
      canUngroup: allowed && this.editor.allows("insert", document.body),
      canJoinLeft: Boolean(allowed && left && this.editor.allows("insert", left)),
      canJoinRight: Boolean(allowed && right && this.editor.allows("insert", right))}
  }
  private emptyHeading(heading: Element) {
    return heading.matches("h2:not([is])") && this.plainWrapper(heading as HTMLElement, "")
      && Array.from(heading.childNodes).every(node => node instanceof Text && !node.data.trim()
        || node instanceof HTMLBRElement && this.plainWrapper(node, ""))
  }
  private removeEmptyGroup(group: HTMLElement | null) {
    if(!isBoardGroup(group) || !this.plainWrapper(group, "ww-board-group") || !this.editor.allows("delete", group)) return
    if(Array.from(group.childNodes).every(node => node instanceof Text && !node.data.trim() || node instanceof Element && this.emptyHeading(node))) group.remove()
  }
  setGrouping(mode: "none" | "new" | "left" | "right", column = this.selectedColumn()) {
    if(!column || !isBoardColumn(column) || !["none", "new", "left", "right"].includes(mode)) return false
    const state = this.groupingState(column)!
    if(mode === "new" && !state.canCreate || mode === "none" && (!state.grouped || !state.canUngroup)
      || mode === "left" && !state.canJoinLeft || mode === "right" && !state.canJoinRight) return false
    return this.edit(() => {
      const parent = column.parentElement!, owner = isBoardGroup(parent) ? parent : column
      if(mode === "new") {
        const group = document.createElement("section"), heading = document.createElement("h2")
        group.className = "ww-board-group"; group.append(heading)
        owner.after(group); group.append(column); this.removeEmptyGroup(parent)
        return heading
      }
      if(mode === "none") parent.after(column)
      else {
        const group = this.neighboringGroup(column, mode)!
        if(mode === "right") group.insertBefore(column, Array.from(group.children).find(isBoardColumn) ?? null)
        else group.append(column)
      }
      this.removeEmptyGroup(parent)
      return column.firstElementChild as HTMLElement ?? column
    })
  }
  addCard(column = this.containingColumn(document.getSelection()?.anchorNode ?? null) ?? this.columns()[0]) {
    if(!isBoardColumn(column) || !this.editor.allows("insert", column)) return false
    return this.edit(() => { const card = this.createCard(); column.append(card); return card.firstElementChild as HTMLElement })
  }
  splitAtSelection(intoColumn = false) {
    const selection = document.getSelection()
    if(!this.active || this.editor.isEditingLocked || !selection?.rangeCount || !this.allowsSelection()
      || !this.editor.allowsSelection("edit")) return false
    const range = selection.getRangeAt(0).cloneRange(), scope = this.editingScope(range.startContainer)
    const column = this.containingColumn(scope)
    if(!scope || !column || !scope.contains(range.endContainer) || !this.editor.allows("insert", intoColumn ? column.parentElement : column)
      || atomicEditingContainer(range.startContainer, this.editor.schema) || atomicEditingContainer(range.endContainer, this.editor.schema)) return false
    return this.edit(() => {
      range.deleteContents()
      range.setEnd(scope, scope.childNodes.length)
      const trailing = range.extractContents()
      clearEditorMarkerClasses(trailing)
      const nextColumn = intoColumn ? this.createColumn() : column
      let target: HTMLElement
      if(scope === this.containingCard(scope)) {
        this.ensureCardContent(scope)
        const nextCard = this.createCard(trailing.childNodes.length ? Array.from(trailing.childNodes) : undefined)
        if(intoColumn) {
          nextColumn.append(nextCard, ...Array.from(column.childNodes).slice(Array.from(column.childNodes).indexOf(scope) + 1))
        }
        else scope.after(nextCard)
        target = nextCard.firstElementChild as HTMLElement ?? nextCard
      }
      else if(intoColumn) {
        const heading = nextColumn.firstElementChild as HTMLElement
        heading.append(trailing)
        nextColumn.append(...Array.from(column.childNodes).slice(Array.from(column.childNodes).indexOf(scope) + 1))
        target = heading
      }
      else {
        const paragraph = document.createElement("p"); paragraph.append(trailing)
        const nextCard = this.createCard([paragraph]); scope.after(nextCard); target = paragraph
      }
      if(intoColumn) column.after(nextColumn)
      return target
    })
  }
  joinBackward(acrossColumns = false) {
    const selection = document.getSelection()
    if(!this.active || this.editor.isEditingLocked || !selection?.rangeCount || !selection.isCollapsed || !this.allowsSelection()
      || atomicEditingContainer(selection.anchorNode, this.editor.schema)) return false
    const source = acrossColumns ? this.containingColumn(selection.anchorNode) : this.containingCard(selection.anchorNode)
    // Removing a wrapper with authored metadata would discard document content.
    if(!source || !this.editor.allows("delete", source) || !this.plainWrapper(source, acrossColumns ? "ww-board-column" : "ww-board-card")) return false
    const peers = acrossColumns ? this.columns() : this.cards(source.parentElement!)
    const previous = peers[peers.indexOf(source) - 1]
    if(!previous) return false
    const scope = this.editingScope(selection.anchorNode)!, offset = previous.childNodes.length, end = this.editor.doc.beginUndoGroup()
    try {
      const parent = source.parentElement
      previous.append(...Array.from(source.childNodes))
      source.remove()
      if(acrossColumns) this.removeEmptyGroup(parent)
      if(acrossColumns) $.move(scope)
      else $.move(previous, offset)
      this.editor.features.selection.processSelection()
    }
    finally { end() }
    previous.scrollIntoView?.({block: "nearest", inline: "nearest"})
    this.refresh(); this.editor.postSelectionPath()
    return true
  }
  removeColumn(column: HTMLElement) {
    if(!isBoardColumn(column) || !this.editor.allows("delete", column)) return false
    return this.edit(() => { const parent = column.parentElement; column.remove(); this.removeEmptyGroup(parent); return this.columns()[0]?.firstElementChild as HTMLElement ?? this.columns()[0] ?? document.body })
  }
  removeCard(card: HTMLElement) {
    if(!isBoardCard(card) || !document.body.contains(card) || !this.editor.allows("delete", card)) return false
    const column = card.parentElement!
    return this.edit(() => { card.remove(); return column.firstElementChild as HTMLElement ?? column })
  }
  moveCard(card: HTMLElement, direction: "up" | "down" | "left" | "right") {
    if(!isBoardCard(card) || !document.body.contains(card) || !this.editor.allows("move", card)
      || !["up", "down", "left", "right"].includes(direction)) return false
    const column = card.parentElement!, cards = this.cards(column), columns = this.columns()
    const neighbor = direction === "up" || direction === "down"
      ? cards[cards.indexOf(card) + (direction === "up" ? -1 : 1)]
      : columns[columns.indexOf(column) + (direction === "left" ? -1 : 1)]
    if(!neighbor) return false
    return this.edit(() => {
      if(direction === "up") neighbor.before(card)
      else if(direction === "down") neighbor.after(card)
      else neighbor.append(card)
      return card.firstElementChild as HTMLElement ?? card
    })
  }
  private validDrag() {
    const source = this.drag?.source
    return Boolean(this.active && !this.editor.isEditingLocked && source?.isConnected
      && this.editor.allows("move", source) && source.parentElement === this.drag?.parent && (isBoardColumn(source) || isBoardCard(source)))
  }
  private startDrag(event: DragEvent, source: HTMLElement) {
    event.stopPropagation()
    if(!this.isEnabled || !this.active || this.editor.isEditingLocked || !event.dataTransfer || event.defaultPrevented
      || !document.body.contains(source) || !this.editor.allows("move", source) || !isBoardColumn(source) && !isBoardCard(source)) {
      this.endDrag(); event.preventDefault(); return
    }
    const selection = this.pressedSelection ?? this.selectionBookmark()
    this.endDrag()
    this.drag = {source, parent: source.parentElement!, token: crypto.randomUUID(), selection}
    try {
      event.dataTransfer.setData(this.dragType, this.drag.token)
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setDragImage?.(source, 12, 12)
      source.classList.add("◆board-dragging")
    }
    catch { this.endDrag(); event.preventDefault() }
  }
  private selectionBookmark(): DragSelection {
    const selection = document.getSelection()
    return {anchor: selection?.anchorNode ?? null, focus: selection?.focusNode ?? null, anchorOffset: selection?.anchorOffset ?? 0, focusOffset: selection?.focusOffset ?? 0}
  }
  private endDrag() {
    if(this.drag) removeEditorMarker(this.drag.source, "◆board-dragging")
    for(const source of document.body.querySelectorAll(".◆board-dragging")) removeEditorMarker(source, "◆board-dragging")
    this.pressedSelection = null
    this.drag = null
    this.pressedHandle = false
    if(this.dropIndicator) this.dropIndicator.hidden = true
    this.schedule()
  }
  /** Resolve insertion against the current DOM, including empty columns. */
  private dragDestination(event: DragEvent) {
    if(!this.validDrag()) return null
    const source = this.drag!.source
    if(isBoardColumn(source)) {
      const group = this.groups().find(group => {
        const rect = group.getBoundingClientRect()
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      })
      const parent = group ?? document.body
      if(!this.editor.allows("insert", parent)) return null
      const peers = Array.from(parent.children).filter((node): node is HTMLElement => node !== source && (isBoardColumn(node) || isBoardGroup(node)))
      const before = peers.find(column => event.clientX < column.getBoundingClientRect().left + column.getBoundingClientRect().width / 2) ?? null
      const edge = before?.getBoundingClientRect() ?? peers.at(-1)?.getBoundingClientRect() ?? parent.getBoundingClientRect()
      return {parent, before, left: before ? edge.left - 8 : peers.length ? edge.right + 8 : edge.left + 16, top: edge.top, width: 3, height: Math.max(edge.height, 80)}
    }
    const column = this.columns().find(column => {
      const rect = column.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= Math.max(rect.bottom, window.innerHeight)
    })
    if(!column || !this.editor.allows("insert", column)) return null
    const cards = this.cards(column).filter(card => card !== source)
    const before = cards.find(card => event.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2) ?? null
    const rect = column.getBoundingClientRect()
    const last = cards.at(-1) ?? Array.from(column.children).find(element => element.matches("h2:not([is])"))
    const top = before ? before.getBoundingClientRect().top - 6 : last ? last.getBoundingClientRect().bottom + 6 : rect.top + 16
    return {parent: column, before, left: rect.left + 16, top, width: Math.max(rect.width - 32, 0), height: 3}
  }
  private dragOver(event: DragEvent) {
    if(!event.dataTransfer?.types.includes(this.dragType)) return
    event.preventDefault(); event.stopImmediatePropagation()
    const destination = this.dragDestination(event)
    event.dataTransfer.dropEffect = destination ? "move" : "none"
    if(!this.dropIndicator) return
    this.dropIndicator.hidden = !destination
    if(destination) Object.assign(this.dropIndicator.style, {
      left: `${destination.left}px`, top: `${destination.top}px`, width: `${destination.width}px`, height: `${destination.height}px`,
    })
    if(this.drag && !this.validDrag()) this.endDrag()
  }
  private drop(event: DragEvent) {
    if(!event.dataTransfer?.types.includes(this.dragType)) return
    event.preventDefault(); event.stopImmediatePropagation()
    try {
      const destination = this.dragDestination(event), source = this.drag?.source
      if(!destination || !source || this.drag!.token !== event.dataTransfer.getData(this.dragType)) return
      if(source.parentElement === destination.parent && (source.nextElementSibling === destination.before || !destination.before && source === destination.parent.lastElementChild)) return
      const selection = document.getSelection(), {anchor, focus, anchorOffset, focusOffset} = this.drag!.selection
      const end = this.editor.doc.beginUndoGroup()
      try {
        const previousParent = source.parentElement
        const parent = destination.parent as HTMLElement & {moveBefore?: (node: Node, child: Node | null) => void}
        if(parent.moveBefore) parent.moveBefore(source, destination.before)
        else parent.insertBefore(source, destination.before)
        if(isBoardColumn(source)) this.removeEmptyGroup(previousParent)
        if(anchor?.isConnected && focus?.isConnected && document.body.contains(anchor) && document.body.contains(focus)) {
          const length = (node: Node) => node instanceof CharacterData ? node.length : node.childNodes.length
          selection?.setBaseAndExtent(anchor, Math.min(anchorOffset, length(anchor)), focus, Math.min(focusOffset, length(focus)))
        }
        this.editor.features.selection.processSelection(false, {scrollIntoView: false})
        this.editor.postSelectionPath()
      }
      finally { end() }
    }
    finally { this.endDrag() }
  }
  private enterHeading() {
    const scope = this.editingScope(document.getSelection()?.anchorNode ?? null)
    if(scope && isBoardGroup(scope.parentElement)) {
      const column = Array.from(scope.parentElement.children).find(isBoardColumn)
      if(column) $.move(column.firstElementChild ?? column)
    }
    else this.addCard()
  }
  actions = {
    setBoardGrouping: ({mode}: {type: "setBoardGrouping", mode: "none" | "new" | "left" | "right"}) => this.setGrouping(mode),
    addBoardColumn: ({}: {type: "addBoardColumn"}) => this.addColumn(),
    addBoardCard: ({}: {type: "addBoardCard"}) => this.addCard(),
    removeBoardColumn: ({}: {type: "removeBoardColumn"}) => {
      const column = this.containingColumn(document.getSelection()?.anchorNode ?? null)
      return column ? this.removeColumn(column) : false
    },
    removeBoardCard: ({}: {type: "removeBoardCard"}) => {
      const card = this.containingCard(document.getSelection()?.anchorNode ?? null)
      return card ? this.removeCard(card) : false
    },
    moveBoardCard: ({direction}: {type: "moveBoardCard", direction: "up" | "down" | "left" | "right"}) => {
      const card = this.containingCard(document.getSelection()?.anchorNode ?? null)
      return card ? this.moveCard(card, direction) : false
    },
  }
  captureListeners: DocumentListenerMap = {
    pointerdown: event => {
      if(event.button !== 0 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || this.editor.isEditingLocked || !isBoardColumn(event.target instanceof Node ? event.target : null)) return
      const column = event.target as HTMLElement
      event.preventDefault(); event.stopImmediatePropagation()
      this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.selectElement(column))
    },
    scroll: () => { if(this.dropIndicator) this.dropIndicator.hidden = true; if(this.measuredTransforms) this.schedule() },
    dragover: event => this.dragOver(event),
    drop: event => this.drop(event),
    dragend: event => { if(event.dataTransfer?.types.includes(this.dragType)) this.endDrag() },
    pointerup: () => { this.pressedHandle = false; if(!this.drag) this.pressedSelection = null; this.schedule() },
    pointercancel: () => { this.pressedHandle = false; if(!this.drag) this.pressedSelection = null; this.schedule() },
    dragleave: event => { if(!event.relatedTarget && this.dropIndicator) this.dropIndicator.hidden = true },
    keydown: event => {
      if(!this.active || event.isComposing || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
      if(event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation(); this.splitAtSelection(event.shiftKey)
      }
      else if(event.key === "Backspace" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation(); this.joinBackward(event.shiftKey)
      }
      else if(event.key === "Enter" && this.editingScope(document.getSelection()?.anchorNode ?? null)?.matches("h2")) {
        event.preventDefault(); event.stopImmediatePropagation(); this.enterHeading()
      }
    },
    beforeinput: event => {
      if(!this.active || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
      if(!this.columns().length && !this.groups().length || !this.allowsSelection() || event.inputType.startsWith("delete") && this.atBoundary(event.inputType.toLowerCase().includes("backward") ? "backward" : "forward")) {
        event.preventDefault(); event.stopImmediatePropagation()
      }
      else if(event.inputType === "insertParagraph" && this.editingScope($.anchor)?.matches("h2")) {
        event.preventDefault(); event.stopImmediatePropagation(); this.enterHeading()
      }
      else if(event.inputType.startsWith("delete")) {
        event.preventDefault(); event.stopImmediatePropagation()
        this.editor.features.manipulation.delete(event.inputType.toLowerCase().includes("backward") ? "backward" : "forward")
      }
    },
  }
  passiveListeners: DocumentListenerMap = {selectionchange: () => this.schedule()}
  private schedule = () => {
    if(this.isEnabled && this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.refresh() })
  }
  transformOverlay(target: HTMLElement) { return this.transformOverlays.get(target) ?? null }

  private refreshAnchors() {
    for(const {button, target} of this.placements) {
      this.anchors.bind(button, target, undefined, "::after")
      button.hidden = !this.active || !target.isConnected || !this.editor.allows("insert", target)
    }
    for(const [target, overlay] of this.transformOverlays) {
      if(overlay.matches('[part~="transform-overlay-board-anchored"]')) this.anchors.bind(overlay, target)
      else this.anchors.release(overlay)
    }
    this.anchors.refresh()
  }

  private refreshTransforms() {
    this.measuredTransforms = false
    const selection = document.getSelection()
    const explicit = this.editor.features.selection.captureSelectedElement ?? $.selectedElement
    const owner = explicit ?? selection?.anchorNode ?? null
    const column = this.active ? this.containingColumn(owner) : null
    const card = this.active ? this.containingCard(owner) : null
    const hovered = this.active ? document.querySelector(".◆element-hovered") : null
    const hoverTarget = isBoardColumn(hovered) || isBoardCard(hovered) ? hovered : null
    const targets = (this.active && (this.drag || this.pressedHandle)
      ? Array.from(this.transformOverlays.keys()).filter(target => target.isConnected && (isBoardColumn(target) || isBoardCard(target)))
      : [hoverTarget ?? card ?? column].filter((target): target is HTMLElement => Boolean(target)))
      .filter(target => this.editor.allows("select", target))
    for(const [target, overlay] of this.transformOverlays) {
      if(!targets.includes(target)) { overlay.remove(); this.transformOverlays.delete(target) }
    }
    for(const target of targets) {
      let overlay = this.transformOverlays.get(target)
      const columns = this.columns(), column = this.containingColumn(target)!
      const label = isBoardColumn(target) ? `column ${columns.indexOf(column) + 1}`
        : `card ${this.cards(column).indexOf(target) + 1} in column ${columns.indexOf(column) + 1}`
      if(!overlay) {
        const role = isBoardColumn(target) ? "column" : "card"
        overlay = this.editor.features.transformation.createFlowOverlay(`◆board-transform-${role}`, role)
        this.transformOverlays.set(target, overlay)
        this.editor.addAppendix(overlay)
        if(isBoardColumn(target)) {
          const grouper = document.createElement("button")
          grouper.type = "button"; grouper.setAttribute("part", "transform-overlay-button transform-overlay-board-control transform-overlay-group")
          grouper.addEventListener("pointerdown", event => event.preventDefault())
          grouper.addEventListener("click", event => { this.setGrouping("new", target); event.stopPropagation() })
          overlay.append(grouper)
        }
        for(const handle of overlay.querySelectorAll<HTMLElement>('[data-transform-mode="move"]')) {
          handle.draggable = true
          handle.addEventListener("pointerdown", event => {
            if(event.button !== 0 || this.editor.isEditingLocked || !this.editor.allows("move", target)) return
            this.pressedHandle = true; this.pressedSelection = this.selectionBookmark()
            event.stopPropagation()
          })
          handle.addEventListener("dragstart", event => this.startDrag(event, target))
          handle.addEventListener("dragend", () => this.endDrag())
          handle.addEventListener("click", event => {
            if(target.isConnected && (isBoardColumn(target) || isBoardCard(target)) && !this.editor.isEditingLocked
              && this.editor.allows("select", target)) this.editor.features.selection.selectElement(target)
            event.stopPropagation()
          })
        }
        overlay.querySelector<HTMLElement>('[data-transform-mode="scale"]')!.addEventListener("pointerdown", event => {
          if(target.isConnected && (isBoardColumn(target) || isBoardCard(target)) && this.editor.allows("style", target)) this.editor.features.transformation.startFlowScale(event, target)
          event.stopPropagation()
        })
        const deleter = overlay.querySelector<HTMLButtonElement>('[part~="transform-overlay-delete"]')!
        deleter.addEventListener("pointerdown", event => event.preventDefault())
        deleter.addEventListener("click", event => {
          if(isBoardColumn(target)) this.removeColumn(target)
          else this.removeCard(target)
          event.stopPropagation()
        })
      }
      const measured = this.editor.features.transformation.boxTransformed(target)
      setPart(overlay, "transform-overlay-board-anchored", !measured)
      if(measured) {
        this.measuredTransforms = true
        Object.assign(overlay.style, this.editor.features.transformation.boxGeometry(target).styles)
      }
      else for(const property of ["left", "top", "width", "height", "transform"]) overlay.style.removeProperty(property)
      setPart(overlay, "transform-overlay-board-selected", explicit === target)
      setPart(overlay, "transform-overlay-board-hovered", target === hoverTarget)
      overlay.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
        const grouping = button.getAttribute("part")?.split(" ").includes("transform-overlay-group")
        const action = grouping ? "Create group for" : button.dataset.transformMode === "move" ? "Move" : button.dataset.transformMode === "scale" ? "Resize" : "Delete"
        const permission = button.dataset.transformMode === "move" ? "move" : button.dataset.transformMode === "scale" ? "style" : "delete"
        button.title = `${action} ${label}`; button.setAttribute("aria-label", button.title)
        button.disabled = this.editor.isEditingLocked
        button.hidden = grouping ? !this.groupingState(target)?.canCreate : !this.editor.allows(permission, target)
        setPart(button, "transform-overlay-board-control-selected", explicit === target)
      })
      for(const handle of overlay.querySelectorAll<HTMLElement>('[data-transform-mode="move"]')) {
        handle.draggable = !this.editor.isEditingLocked && this.editor.allows("move", target)
        handle.hidden = !this.editor.allows("move", target)
      }
      const resizeHandle = overlay.querySelector<HTMLElement>('[data-transform-mode="scale"]')
      if(resizeHandle) resizeHandle.hidden = !this.editor.allows("style", target)
    }
  }

  refresh() {
    if(!this.controls) return
    this.ensureContent()
    this.controls.hidden = !this.active
    if(this.drag && !this.validDrag()) this.endDrag()
    const columns = this.active ? this.columns() : [], groups = this.active ? this.groups() : [], allCards = columns.flatMap(column => this.cards(column))
    const locked = this.editor.isEditingLocked
    const permissions = [this.editor.allows("insert", document.body), ...columns.map(column => this.editor.allows("insert", column))]
    const permissionSignature = JSON.stringify(permissions)
    if(!this.drag && !this.pressedHandle && (this.active && !this.placements.length || !this.active && this.placements.length
      || groups.length !== this.groupsCache.length || groups.some((group, i) => group !== this.groupsCache[i]) || allCards.length !== this.cardsCache.length || allCards.some((item, i) => item !== this.cardsCache[i]) || locked !== this.locked || columns.length !== this.columnsCache.length || columns.some((column, i) => column !== this.columnsCache[i]) || permissionSignature !== this.permissionSignature)) {
      this.columnsCache = columns; this.groupsCache = groups; this.cardsCache = allCards; this.locked = locked
      this.permissionSignature = permissionSignature
      this.controls.replaceChildren(); this.placements = []
      const button = (label: string, text: string, target: HTMLElement, position: typeof this.placements[number]["position"], run: () => unknown) => {
        const button = document.createElement("button")
        button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.textContent = text; button.disabled = locked
        button.hidden = !this.editor.allows("insert", position === "add-column" ? document.body : target)
        button.setAttribute("part", `board-${position}`)
        button.addEventListener("pointerdown", event => event.preventDefault())
        button.addEventListener("click", () => { run() })
        this.controls!.append(button); this.placements.push({button, target, position})
      }
      columns.forEach((column, i) => {
        button(`Add card to column ${i + 1}`, "+ Add card", column, "add-card", () => this.addCard(column))
      })
      if(this.active) button("Add column", "+ Add column", document.body, "add-column", () => this.addColumn())
    }
    this.refreshTransforms()
    this.refreshAnchors()
    if(this.measuredTransforms) this.schedule()
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    if(this.active) this.ensureStyles()
    this.controls = document.createElement("div"); this.controls.setAttribute("part", "board-actions"); this.controls.contentEditable = "false"
    this.controls.setAttribute("role", "toolbar"); this.controls.setAttribute("aria-label", "Board actions")
    this.editor.addAppendix(this.controls)
    this.dropIndicator = document.createElement("div"); this.dropIndicator.setAttribute("part", "board-drop-indicator"); this.dropIndicator.hidden = true
    this.editor.addAppendix(this.dropIndicator)
    this.stylesheet = createStylesheet(`
      [part=board-drop-indicator] {position:fixed;z-index:3;pointer-events:none;border-radius:2px;background:#3977c7}
      [part=board-drop-indicator][hidden] {display:none}
      [part=board-actions] {position:fixed;inset:0;z-index:2;pointer-events:none}
      [part=board-actions][hidden], [part=board-actions] button[hidden] {display:none}
      [part=board-actions] button {position:fixed;pointer-events:auto;padding:1rem;border:1px dashed #9299a2;background:transparent;color:#707780;font:13px/1.2 system-ui;cursor:pointer;box-sizing:border-box;user-select:none;-webkit-user-select:none;transition:background-color .12s,border-color .12s,color .12s}
      [part~=board-add-card] {border-radius:.5rem}
      [part~=board-add-column] {border-radius:.75rem}
      [part=board-actions] button:hover:enabled {background:#7077800c;border-color:#626972;color:#4e555e}
      [part=board-actions] button:active:enabled {background:#70778020;border-color:#4e555e;color:#343b44}
      [part=board-actions] button:focus-visible {outline:2px solid #3977c7;outline-offset:2px}
      [part=board-actions] button:disabled {opacity:.4;cursor:default}
      @media print {[part=board-actions], [part=board-drop-indicator] {display:none}}
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    // Authored layout styles remain portable, but the strict editing CSP
    // blocks their <style> element. Use the bundled CSS for editing too.
    this.layoutStylesheet = createStylesheet(boardStyles + `
      body.ww-board > section.ww-board-group:not([is]) > h2:not([is]) {--ww-placeholder:"Group heading"}
      body.ww-board {padding-right:1.25rem}
      body.ww-board::after {content:"";box-sizing:border-box;flex:0 0 min(450px, calc(100vw - 2.5rem));width:min(450px, calc(100vw - 2.5rem));height:10rem;align-self:flex-start;border-radius:.75rem;pointer-events:none}
      ${boardColumnSelector()} {padding-bottom:1rem}
      ${boardColumnSelector("::after")} {content:"";box-sizing:border-box;flex:0 0 auto;width:100%;height:calc(1.5rem + 1lh + 6px);border-radius:.5rem;pointer-events:none}
      @media print {body.ww-board::after, ${boardColumnSelector("::after")} {display:none}}
    `)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.layoutStylesheet]
    this.observer = new MutationObserver(this.schedule); this.observer.observe(document.body, {subtree: true, childList: true, attributes: true})
    this.refresh()
  }
  disable() {
    const target = this.editor.features.transformation.target
    if(target && (isBoardColumn(target) || isBoardCard(target))) this.editor.features.transformation.clearTransform()
    this.endDrag(); this.dropIndicator?.remove(); this.dropIndicator = null
    super.disable(); this.observer?.disconnect(); this.observer = null
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null; this.controls?.remove(); this.controls = null
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null; this.columnsCache = []; this.groupsCache = []; this.cardsCache = []; this.placements = []
    if(this.layoutStylesheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== this.layoutStylesheet)
    this.layoutStylesheet = null
    this.anchors.destroy(); this.measuredTransforms = false
    for(const overlay of this.transformOverlays.values()) overlay.remove()
    this.transformOverlays.clear()
  }
}
