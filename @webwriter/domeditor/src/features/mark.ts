import {EditorFeature, type DocumentListenerMap} from "."
import {
  canonicalMarkName,
  markNames,
  markTagNames,
  primaryMarkOptions,
  type MarkName,
} from "../marks"
import {$} from "../utility"

export type MarkState = {
  /** Whether the current selection is a markable text range or caret. */
  canMark: boolean
  /** Marks found in the range, or effective for the next input at a caret. */
  marks: MarkName[]
}

type TextSlice = {
  node: Text
  start: number
  end: number
}

type MarkSelection = {
  selection: Selection
  range: Range
  block: Element
  start: number
  end: number
  backwards: boolean
  text: TextSlice[]
}

type MarkCaret = {
  selection: Selection
  range: Range
  block: Element
}

type StoredSelection = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

const markerAttribute = "data-domeditor-mark-boundary"

/** Inline formatting derived from the live DOM, with transient caret marks for typing. */
export class MarkFeature extends EditorFeature {
  private readonly observer = new MutationObserver(() => this.queueStateRefresh())
  private stateRefreshQueued = false
  /** `null` inherits the live DOM marks; a Set is an explicit typing state. */
  private storedMarks: Set<MarkName> | null = null
  private storedSelection: StoredSelection | null = null

  actions = {
    addMark: ({mark}: {type: "addMark", mark: MarkName}) => this.addMark(mark),
    removeMark: ({mark}: {type: "removeMark", mark: MarkName}) => this.removeMark(mark),
    toggleMark: ({mark}: {type: "toggleMark", mark: MarkName}) => this.toggleMark(mark),
    removeMarks: ({}: {type: "removeMarks"}) => this.removeMarks(),
  } as const

  activeListeners: DocumentListenerMap = {
    beforeinput: event => this.handleBeforeInput(event),
    keydown: event => this.handleShortcut(event),
    selectionchange: () => this.clearStoredMarksIfSelectionChanged(),
  }

  enable() {
    super.enable()
    this.observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }

  disable() {
    this.observer.disconnect()
    this.stateRefreshQueued = false
    this.clearStoredMarks()
    super.disable()
  }

  /** Reads the current selection and its ancestors afresh on every call. */
  getState(): MarkState {
    this.clearStoredMarksIfSelectionChanged()
    const caret = this.getCaret()
    if(caret) {
      const marks = this.storedMarks ?? this.marksAt(caret.range.startContainer, caret.block)
      return {canMark: true, marks: markNames.filter(mark => marks.has(mark))}
    }

    const context = this.getSelection()
    if(!context) return {canMark: false, marks: []}

    const marks = new Set<MarkName>()
    for(const {node} of context.text) {
      this.marksAt(node, context.block).forEach(mark => marks.add(mark))
    }
    return {canMark: true, marks: markNames.filter(mark => marks.has(mark))}
  }

  addMark(mark: MarkName) {
    this.assertMark(mark)
    const caret = this.getCaret()
    if(caret) return this.setStoredMark(mark, true, caret)
    if(this.getState().marks.includes(mark)) return false
    const context = this.getSelection()
    if(!context) return false

    const wrappers: Element[] = []
    for(const slice of [...context.text].reverse()) {
      let selected = slice.node
      if(slice.end < selected.length) selected.splitText(slice.end)
      if(slice.start > 0) selected = selected.splitText(slice.start)

      const wrapper = document.createElement(mark)
      selected.parentNode!.insertBefore(wrapper, selected)
      wrapper.append(selected)
      wrappers.push(wrapper)
    }
    wrappers.forEach(wrapper => this.mergeEquivalentSiblings(wrapper))
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  removeMark(mark: MarkName) {
    this.assertMark(mark)
    const caret = this.getCaret()
    if(caret) return this.setStoredMark(mark, false, caret)
    if(!this.getState().marks.includes(mark)) return false
    const tags: readonly string[] = markTagNames(mark)
    return this.removeMatching(element => tags.includes(element.localName))
  }

  toggleMark(mark: MarkName) {
    this.assertMark(mark)
    const caret = this.getCaret()
    if(caret) {
      const marks = this.effectiveCaretMarks(caret)
      return this.setStoredMark(mark, !marks.has(mark), caret)
    }
    const state = this.getState()
    if(!state.canMark) return false
    return state.marks.includes(mark)? this.removeMark(mark): this.addMark(mark)
  }

  /** Removes every supported mark (including strong/em aliases) in one pass. */
  removeMarks() {
    const caret = this.getCaret()
    if(caret) {
      if(!this.effectiveCaretMarks(caret).size) return false
      this.storeMarks(new Set(), caret.selection)
      this.editor.postMarkState()
      return true
    }
    if(!this.getState().marks.length) return false
    return this.removeMatching(element => canonicalMarkName(element.localName) !== null)
  }

  private effectiveCaretMarks(caret: MarkCaret) {
    this.clearStoredMarksIfSelectionChanged()
    return new Set(this.storedMarks ?? this.marksAt(caret.range.startContainer, caret.block))
  }

  private setStoredMark(mark: MarkName, enabled: boolean, caret: MarkCaret) {
    const marks = this.effectiveCaretMarks(caret)
    if(marks.has(mark) === enabled) return false
    enabled? marks.add(mark): marks.delete(mark)
    this.storeMarks(marks, caret.selection)
    this.editor.postMarkState()
    return true
  }

  private storeMarks(marks: Set<MarkName>, selection: Selection) {
    if(!selection.anchorNode || !selection.focusNode) return
    this.storedMarks = marks
    this.storedSelection = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    }
  }

  private clearStoredMarks() {
    this.storedMarks = null
    this.storedSelection = null
  }

  private clearStoredMarksIfSelectionChanged() {
    if(!this.storedSelection) return
    const selection = document.getSelection()
    if(selection?.anchorNode === this.storedSelection.anchorNode
      && selection.anchorOffset === this.storedSelection.anchorOffset
      && selection.focusNode === this.storedSelection.focusNode
      && selection.focusOffset === this.storedSelection.focusOffset) return
    this.clearStoredMarks()
  }

  /** Applies the explicit collapsed-caret mark set to the next typed text. */
  private handleBeforeInput(event: InputEvent) {
    this.clearStoredMarksIfSelectionChanged()
    if(event.defaultPrevented
      || this.storedMarks === null
      || !["insertText", "insertReplacementText"].includes(event.inputType)
      || !event.data) return

    const caret = this.getCaret()
    if(!caret) return
    const desired = new Set(this.storedMarks)
    event.preventDefault()

    const text = document.createTextNode(event.data)
    caret.range.insertNode(text)
    caret.selection.setBaseAndExtent(text, 0, text, text.length)

    const unwanted = new Set(this.getState().marks.filter(mark => !desired.has(mark)))
    if(unwanted.size) {
      this.removeMatching(element => {
        const mark = canonicalMarkName(element.localName)
        return mark !== null && unwanted.has(mark)
      })
    }
    for(const mark of markNames) {
      if(desired.has(mark) && !this.getState().marks.includes(mark)) this.addMark(mark)
    }

    document.getSelection()?.collapseToEnd()
    this.clearStoredMarks()
    caret.block.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: event.data,
      inputType: event.inputType,
    }))
    this.editor.postMarkState()
  }

  private removeMatching(matches: (element: Element) => boolean) {
    const context = this.getSelection()
    if(!context) return false

    const boundary = document.createElement("span")
    boundary.setAttribute(markerAttribute, "")
    boundary.append(context.range.extractContents())
    context.range.insertNode(boundary)

    // A partially selected ancestor has to be split around the selection.
    // Non-target inline ancestors are cloned into the selection so their
    // formatting is retained while the requested mark is lifted away.
    while(true) {
      let target = boundary.parentElement
      while(target && target !== context.block && !matches(target)) {
        target = target.parentElement
      }
      if(!target || target === context.block) break

      while(boundary.parentElement && boundary.parentElement !== target) {
        this.promoteBoundary(boundary, true)
      }
      if(boundary.parentElement === target) this.promoteBoundary(boundary, false)
    }

    const descendants = Array.from(boundary.querySelectorAll("*"))
      .filter(element => !element.hasAttribute(markerAttribute) && matches(element))
      .reverse()
    descendants.forEach(element => element.replaceWith(...Array.from(element.childNodes)))

    boundary.replaceWith(...Array.from(boundary.childNodes))
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  /** Moves the temporary selection boundary one parent upwards. */
  private promoteBoundary(boundary: Element, preserveParent: boolean) {
    const parent = boundary.parentElement
    const grandparent = parent?.parentNode
    if(!parent || !grandparent) return

    const before = parent.cloneNode(false) as Element
    while(parent.firstChild && parent.firstChild !== boundary) before.append(parent.firstChild)

    const after = parent.cloneNode(false) as Element
    while(boundary.nextSibling) after.append(boundary.nextSibling)

    if(preserveParent) {
      const selectedParent = parent.cloneNode(false) as Element
      selectedParent.append(...Array.from(boundary.childNodes))
      boundary.append(selectedParent)
    }

    if(this.hasContent(before)) grandparent.insertBefore(before, parent)
    grandparent.insertBefore(boundary, parent)
    if(this.hasContent(after)) grandparent.insertBefore(after, parent)
    parent.remove()
  }

  private hasContent(element: Element) {
    return element.textContent!.length > 0 || element.children.length > 0
  }

  private mergeEquivalentSiblings(wrapper: Element) {
    if(!wrapper.isConnected) return
    let merged = wrapper
    const previous = merged.previousElementSibling
    if(previous && this.elementsEquivalent(previous, merged)) {
      previous.append(...Array.from(merged.childNodes))
      merged.remove()
      merged = previous
    }
    const next = merged.nextElementSibling
    if(next && this.elementsEquivalent(merged, next)) {
      merged.append(...Array.from(next.childNodes))
      next.remove()
    }
  }

  private elementsEquivalent(a: Element, b: Element) {
    if(a.localName !== b.localName || a.attributes.length !== b.attributes.length) return false
    return Array.from(a.attributes).every(attribute => b.getAttribute(attribute.name) === attribute.value)
  }

  private getCaret(): MarkCaret | null {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode || !selection.isCollapsed) return null
    if($.isGapSelection || $.isEmptyDocumentSelection) return null

    const range = selection.getRangeAt(0).cloneRange()
    const block = this.closestBlock(range.startContainer)
    if(!block || !document.body.contains(block) || !this.isEditableHTMLContext(range.startContainer, block)) return null

    if(range.startContainer instanceof Element
      && !this.editor.schema.findValidContentTypes(range.startContainer).includes("#text")) return null

    return {selection, range, block}
  }

  private isEditableHTMLContext(node: Node, block: Element) {
    let element = node instanceof Element? node: node.parentElement
    while(element) {
      if(element.namespaceURI !== "http://www.w3.org/1999/xhtml"
        || element.getAttribute("contenteditable") === "false") return false
      if(element === block) return true
      element = element.parentElement
    }
    return false
  }

  private marksAt(node: Node, block: Element) {
    const marks = new Set<MarkName>()
    let element = node instanceof Element? node: node.parentElement
    while(element && element !== block.parentElement) {
      const mark = canonicalMarkName(element.localName)
      if(mark) marks.add(mark)
      if(element === block) break
      element = element.parentElement
    }
    return marks
  }

  private getSelection(): MarkSelection | null {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode || selection.isCollapsed) return null

    const range = selection.getRangeAt(0).cloneRange()
    const selectedChildIndex = selection.anchorNode === selection.focusNode && selection.anchorNode instanceof Element
      ? Math.min(selection.anchorOffset, selection.focusOffset)
      : -1
    const selectedChild = selectedChildIndex >= 0 && Math.abs(selection.anchorOffset - selection.focusOffset) === 1
      ? selection.anchorNode.childNodes.item(selectedChildIndex)
      : null
    if(selectedChild instanceof Element) return null
    const startBlock = this.closestBlock(range.startContainer)
    const endBlock = this.closestBlock(range.endContainer)
    if(!startBlock || startBlock !== endBlock || !document.body.contains(startBlock)) return null

    const text = this.selectedText(range, startBlock)
    if(!text.length || !text.some(slice => slice.end > slice.start)) return null

    // Cloning gives an exact, side-effect-free view of selected element
    // content. A mark command cannot safely consume blocks, replaced content,
    // SVG/MathML, or empty atomic phrasing elements such as images and breaks.
    const fragment = range.cloneContents()
    const selectedElements = Array.from(fragment.querySelectorAll("*"))
    if(selectedElements.some(element =>
      element.namespaceURI !== "http://www.w3.org/1999/xhtml"
      || !this.editor.schema.isPhrasing(element)
      || !element.textContent
        && canonicalMarkName(element.localName) === null
        && !this.editor.schema.findValidContentTypes(element).includes("#text"),
    )) return null

    const start = this.textOffset(startBlock, range.startContainer, range.startOffset)
    const end = this.textOffset(startBlock, range.endContainer, range.endOffset)
    if(start === null || end === null || start === end) return null

    return {
      selection,
      range,
      block: startBlock,
      start: Math.min(start, end),
      end: Math.max(start, end),
      backwards: this.isBackwards(selection),
      text,
    }
  }

  private closestBlock(node: Node) {
    let current: Node | null = node
    while(current && current !== document.body) {
      if(!(current instanceof Element) && !(current instanceof Text)) return null
      if(this.editor.schema.isBlock(current)) break
      current = current.parentElement
    }
    return current instanceof Element && this.editor.schema.isBlock(current)? current: null
  }

  private selectedText(range: Range, block: Element) {
    const slices: TextSlice[] = []
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    while(walker.nextNode()) {
      const node = walker.currentNode as Text
      if(!range.intersectsNode(node)) continue

      const startRelation = range.comparePoint(node, 0)
      const endRelation = range.comparePoint(node, node.length)
      if(startRelation > 0 || endRelation < 0) continue
      if(startRelation < 0 && range.startContainer !== node) continue
      if(endRelation > 0 && range.endContainer !== node) continue

      const start = range.startContainer === node? range.startOffset: 0
      const end = range.endContainer === node? range.endOffset: node.length
      if(start < end) slices.push({node, start, end})
    }
    return slices
  }

  private textOffset(block: Element, node: Node, offset: number) {
    try {
      const prefix = document.createRange()
      prefix.selectNodeContents(block)
      prefix.setEnd(node, offset)
      return prefix.toString().length
    }
    catch {
      return null
    }
  }

  private textPoint(block: Element, offset: number): [Node, number] {
    let remaining = offset
    let lastText: Text | null = null
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    while(walker.nextNode()) {
      const text = walker.currentNode as Text
      lastText = text
      if(remaining <= text.length) return [text, remaining]
      remaining -= text.length
    }
    return lastText? [lastText, lastText.length]: [block, 0]
  }

  private restoreSelection(context: MarkSelection) {
    const start = this.textPoint(context.block, context.start)
    const end = this.textPoint(context.block, context.end)
    const [anchor, focus] = context.backwards? [end, start]: [start, end]
    context.selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1])
  }

  private isBackwards(selection: Selection) {
    if(selection.anchorNode === selection.focusNode) return selection.anchorOffset > selection.focusOffset
    return !!selection.anchorNode && !!selection.focusNode
      && selection.anchorNode.compareDocumentPosition(selection.focusNode) === Node.DOCUMENT_POSITION_PRECEDING
  }

  private handleShortcut(event: KeyboardEvent) {
    if(event.defaultPrevented || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
    // Option can transform event.key into a symbol on macOS. Prefer the
    // physical letter code so the displayed Option+Shift shortcut still
    // works, then fall back for synthetic and older keyboard events.
    const key = /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3).toLowerCase()
      : event.key.toLowerCase()
    const option = primaryMarkOptions.find(candidate => candidate.shortcutKey === key)
    if(!option || !this.getState().canMark) return

    event.preventDefault()
    event.stopImmediatePropagation()
    this.toggleMark(option.name)
  }

  private assertMark(mark: string): asserts mark is MarkName {
    if(canonicalMarkName(mark) !== mark) throw new TypeError(`Unsupported mark '${mark}'`)
  }

  private queueStateRefresh() {
    if(this.stateRefreshQueued) return
    this.stateRefreshQueued = true
    queueMicrotask(() => {
      this.stateRefreshQueued = false
      if(this.isEnabled) {
        this.editor.postMarkState()
        // Keep the established selection-path event as the final bridge
        // update for a DOM mutation while still refreshing mark state.
        this.editor.postSelectionPath()
      }
    })
  }

}
