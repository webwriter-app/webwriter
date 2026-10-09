import {EditorFeature, type DocumentListenerMap} from "."
import {$, createStylesheet, isAppendixInteraction, isCaretAtBoundary, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {boardClass, boardStyles, documentLayoutMode, isBoardCard, isBoardColumn} from "../document-layout"

type DragSelection = {anchor: Node | null, focus: Node | null, anchorOffset: number, focusOffset: number}

/** Authored sections and articles own the board; editing controls stay in the appendix. */
export class BoardFeature extends EditorFeature {
  private controls: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private frame: number | null = null
  private columnsCache: HTMLElement[] = []
  private cardsCache: HTMLElement[] = []
  private pressedHandle = false
  private pressedSelection: DragSelection | null = null
  private drag: {source: HTMLElement, parent: HTMLElement, token: string, selection: DragSelection} | null = null
  private dropIndicator: HTMLElement | null = null
  private readonly dragType = "application/x-webwriter-board"
  private selectedCard: HTMLElement | null = null
  private locked = false
  private placements: Array<{button: HTMLButtonElement, target: HTMLElement, position: "add-card" | "remove-column" | "add-column" | "card" | "drag-column" | "drag-card", index?: number}> = []
  get active() { return documentLayoutMode() === "board" }
  columns() { return Array.from(document.body.children).filter(isBoardColumn) }
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
    return column && element instanceof HTMLElement && element.matches("h2:not([is])") ? element : null
  }
  allowsSelection(range = document.getSelection()?.rangeCount ? $.range : null) {
    if(!this.active) return true
    if(!range || !document.body.contains(range.startContainer) || !document.body.contains(range.endContainer)) return false
    const start = this.editingScope(range.startContainer)
    return Boolean(start && start === this.editingScope(range.endContainer))
  }
  constrainSelection() {
    if(!this.active || this.allowsSelection()) return
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
    return card
  }
  private ensureStyles() {
    if(!Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === boardStyles)) {
      const style = document.createElement("style"); style.textContent = boardStyles; document.head.append(style)
    }
  }
  ensureContent() {
    if(!this.active) return null
    if(!this.columns().length && !document.body.children.length) document.body.append(this.createColumn())
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
    return Array.from(document.body.childNodes).flatMap(node => isBoardColumn(node) && this.plainWrapper(node, "ww-board-column")
      ? Array.from(node.childNodes).flatMap(child => isBoardCard(child) && this.plainWrapper(child, "ww-board-card") ? Array.from(child.childNodes) : [child]) : [node])
  }
  convert(mode: "board" | "document", captureUndo = true) {
    if(this.editor.isEditingLocked || mode === "board" && (documentLayoutMode() !== "document" || this.conversionReason())
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
        for(const column of this.columns()) {
          // Empty headings added by the layout have no authored attributes/content.
          for(const heading of column.querySelectorAll(":scope > h2")) {
            if(!heading.childNodes.length && !heading.attributes.length) heading.remove()
          }
          for(const card of this.cards(column)) this.unwrap(card, "ww-board-card")
          this.unwrap(column, "ww-board-column")
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
    return this.edit(() => {
      const column = this.createColumn(); document.body.append(column)
      return column.firstElementChild as HTMLElement
    })
  }
  addCard(column = this.containingColumn(document.getSelection()?.anchorNode ?? null) ?? this.columns()[0]) {
    if(!isBoardColumn(column) || column.parentElement !== document.body) return false
    return this.edit(() => { const card = this.createCard(); column.append(card); return card.firstElementChild as HTMLElement })
  }
  removeColumn(column: HTMLElement) {
    if(!isBoardColumn(column) || column.parentElement !== document.body || this.columns().length <= 1) return false
    return this.edit(() => { column.remove(); return this.columns()[0].firstElementChild as HTMLElement ?? this.columns()[0] })
  }
  removeCard(card: HTMLElement) {
    if(!isBoardCard(card) || !document.body.contains(card)) return false
    const column = card.parentElement!
    return this.edit(() => { card.remove(); return column.firstElementChild as HTMLElement ?? column })
  }
  moveCard(card: HTMLElement, direction: "up" | "down" | "left" | "right") {
    if(!isBoardCard(card) || !document.body.contains(card) || !["up", "down", "left", "right"].includes(direction)) return false
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
      && source.parentElement === this.drag?.parent && (isBoardColumn(source) || isBoardCard(source)))
  }
  private startDrag(event: DragEvent, source: HTMLElement) {
    event.stopPropagation()
    if(!this.isEnabled || !this.active || this.editor.isEditingLocked || !event.dataTransfer || event.defaultPrevented
      || !document.body.contains(source) || !isBoardColumn(source) && !isBoardCard(source)) {
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
      const columns = this.columns().filter(column => column !== source)
      if(!columns.length) return null
      const before = columns.find(column => event.clientX < column.getBoundingClientRect().left + column.getBoundingClientRect().width / 2) ?? null
      const edge = before?.getBoundingClientRect() ?? columns.at(-1)!.getBoundingClientRect()
      return {parent: document.body, before, left: before ? edge.left - 8 : edge.right + 8, top: edge.top, width: 3, height: Math.max(edge.height, 80)}
    }
    const column = this.columns().find(column => {
      const rect = column.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= Math.max(rect.bottom, window.innerHeight)
    })
    if(!column) return null
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
        const parent = destination.parent as HTMLElement & {moveBefore?: (node: Node, child: Node | null) => void}
        if(parent.moveBefore) parent.moveBefore(source, destination.before)
        else parent.insertBefore(source, destination.before)
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
  actions = {
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
    scroll: () => { if(this.dropIndicator) this.dropIndicator.hidden = true; this.schedule() },
    dragover: event => this.dragOver(event),
    drop: event => this.drop(event),
    dragend: event => { if(event.dataTransfer?.types.includes(this.dragType)) this.endDrag() },
    pointerup: () => { this.pressedHandle = false; if(!this.drag) this.pressedSelection = null; this.schedule() },
    pointercancel: () => { this.pressedHandle = false; if(!this.drag) this.pressedSelection = null; this.schedule() },
    dragleave: event => { if(!event.relatedTarget && this.dropIndicator) this.dropIndicator.hidden = true },
    keydown: event => {
      if(!this.active || event.isComposing || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
      if(event.key === "Enter" && this.editingScope(document.getSelection()?.anchorNode ?? null)?.matches("h2")) {
        event.preventDefault(); event.stopImmediatePropagation(); this.addCard()
      }
    },
    beforeinput: event => {
      if(!this.active || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
      if(!this.allowsSelection() || event.inputType.startsWith("delete") && this.atBoundary(event.inputType.toLowerCase().includes("backward") ? "backward" : "forward")) {
        event.preventDefault(); event.stopImmediatePropagation()
      }
      else if(event.inputType === "insertParagraph" && this.editingScope($.anchor)?.matches("h2")) {
        event.preventDefault(); event.stopImmediatePropagation(); this.addCard()
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
  private refresh() {
    if(!this.controls) return
    this.controls.hidden = !this.active
    if(this.drag && !this.validDrag()) this.endDrag()
    const columns = this.active ? this.columns() : [], allCards = columns.flatMap(column => this.cards(column)), card = this.active ? this.containingCard(document.getSelection()?.anchorNode ?? null) : null
    const locked = this.editor.isEditingLocked
    if(!this.drag && !this.pressedHandle && (allCards.length !== this.cardsCache.length || allCards.some((item, i) => item !== this.cardsCache[i]) || card !== this.selectedCard || locked !== this.locked || columns.length !== this.columnsCache.length || columns.some((column, i) => column !== this.columnsCache[i]))) {
      this.columnsCache = columns; this.cardsCache = allCards; this.selectedCard = card; this.locked = locked
      this.controls.replaceChildren(); this.placements = []; this.resizeObserver?.disconnect()
      const button = (label: string, text: string, target: HTMLElement, position: typeof this.placements[number]["position"], run: () => unknown, index?: number) => {
        const button = document.createElement("button")
        button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.textContent = text; button.disabled = locked
        button.addEventListener("pointerdown", event => { if(!button.draggable) event.preventDefault() })
        button.addEventListener("click", () => { run() })
        this.controls!.append(button); this.placements.push({button, target, position, index})
        return button
      }
      const handle = (target: HTMLElement, label: string, position: "drag-card" | "drag-column") => {
        const grip = button(label, "⠿", target, position, () => {})
        grip.addEventListener("pointerdown", event => { if(event.button === 0 && !locked) { this.pressedHandle = true; this.pressedSelection = this.selectionBookmark() } })
        grip.draggable = !locked; grip.style.cursor = "grab"
        grip.addEventListener("dragstart", event => this.startDrag(event, target))
        grip.addEventListener("dragend", () => this.endDrag())
        this.resizeObserver?.observe(target)
      }
      columns.forEach((column, i) => {
        handle(column, `Drag column ${i + 1}`, "drag-column")
        this.cards(column).forEach((card, j) => handle(card, `Drag card ${j + 1} in column ${i + 1}`, "drag-card"))
        this.resizeObserver?.observe(column)
        button(`Add card to column ${i + 1}`, "+ Add card", column, "add-card", () => this.addCard(column))
        const remove = button(`Remove column ${i + 1}`, "×", column, "remove-column", () => this.removeColumn(column))
        remove.disabled ||= columns.length <= 1
      })
      if(columns.length) button("Add column", "+ Add column", columns.at(-1)!, "add-column", () => this.addColumn())
      if(card) {
        this.resizeObserver?.observe(card)
        for(const [i, direction] of (["up", "down", "left", "right"] as const).entries()) {
          button(`Move card ${direction}`, {up: "↑", down: "↓", left: "←", right: "→"}[direction], card, "card", () => this.moveCard(card, direction), i)
        }
        button("Remove card", "×", card, "card", () => this.removeCard(card), 4)
      }
    }
    for(const {button, target, position, index} of this.placements) {
      const rect = target.getBoundingClientRect()
      button.hidden = !target.isConnected || rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight
      button.style.left = `${position === "add-column" ? rect.right + 16 : position === "drag-column" ? rect.right - 64 : position === "drag-card" ? rect.left - 12 : position === "remove-column" ? rect.right - 36 : position === "card" ? rect.right - 150 + (index ?? 0) * 28 : rect.left + 16}px`
      button.style.top = `${position === "add-card" ? rect.bottom - 44 : position === "card" ? rect.top - 14 : position === "drag-card" ? rect.top + 8 : rect.top + 14}px`
    }
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
      [part=board-actions] button {position:fixed;pointer-events:auto;height:28px;padding:2px 7px;border:1px solid #c6d3e1;border-radius:6px;background:#fff;color:#34465b;font:13px/1.2 system-ui;cursor:pointer;box-sizing:border-box}
      [part=board-actions] button:hover {background:#e7eff8}
      [part=board-actions] button:focus-visible {outline:2px solid #3977c7;outline-offset:2px}
      [part=board-actions] button:disabled {opacity:.4;cursor:default}
      @media print {[part=board-actions], [part=board-drop-indicator] {display:none}}
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    this.resizeObserver = new ResizeObserver(this.schedule)
    this.observer = new MutationObserver(this.schedule); this.observer.observe(document.body, {subtree: true, childList: true, attributes: true})
    window.addEventListener("resize", this.schedule)
    this.refresh()
  }
  disable() {
    this.endDrag(); this.dropIndicator?.remove(); this.dropIndicator = null
    super.disable(); this.observer?.disconnect(); this.observer = null; this.resizeObserver?.disconnect(); this.resizeObserver = null
    window.removeEventListener("resize", this.schedule)
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null; this.controls?.remove(); this.controls = null
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null; this.columnsCache = []; this.cardsCache = []; this.selectedCard = null; this.placements = []
  }
}
