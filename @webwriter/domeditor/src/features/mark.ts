import {EditorFeature, type DocumentListenerMap} from "."
import {
  canonicalMarkName,
  markNames,
  markTagNames,
  primaryMarkOptions,
  type MarkName,
} from "../marks"

export type MarkState = {
  /** Whether the current selection consists exclusively of editable text. */
  canMark: boolean
  /** Canonical mark names which occur anywhere in the selected text. */
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

const markerAttribute = "data-domeditor-mark-boundary"

/** Inline formatting whose state and mutations are derived from the live DOM. */
export class MarkFeature extends EditorFeature {
  private readonly observer = new MutationObserver(() => this.queueStateRefresh())
  private stateRefreshQueued = false

  actions = {
    addMark: ({mark}: {type: "addMark", mark: MarkName}) => this.addMark(mark),
    removeMark: ({mark}: {type: "removeMark", mark: MarkName}) => this.removeMark(mark),
    toggleMark: ({mark}: {type: "toggleMark", mark: MarkName}) => this.toggleMark(mark),
    removeMarks: ({}: {type: "removeMarks"}) => this.removeMarks(),
  } as const

  activeListeners: DocumentListenerMap = {
    keydown: event => this.handleShortcut(event),
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
    super.disable()
  }

  /** Reads the current selection and its ancestors afresh on every call. */
  getState(): MarkState {
    const context = this.getSelection()
    if(!context) return {canMark: false, marks: []}

    const marks = new Set<MarkName>()
    for(const {node} of context.text) {
      let element = node.parentElement
      while(element && element !== context.block.parentElement) {
        const mark = canonicalMarkName(element.localName)
        if(mark) marks.add(mark)
        if(element === context.block) break
        element = element.parentElement
      }
    }
    return {canMark: true, marks: markNames.filter(mark => marks.has(mark))}
  }

  addMark(mark: MarkName) {
    this.assertMark(mark)
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
    if(!this.getState().marks.includes(mark)) return false
    const tags: readonly string[] = markTagNames(mark)
    return this.removeMatching(element => tags.includes(element.localName))
  }

  toggleMark(mark: MarkName) {
    this.assertMark(mark)
    const state = this.getState()
    if(!state.canMark) return false
    return state.marks.includes(mark)? this.removeMark(mark): this.addMark(mark)
  }

  /** Removes every supported mark (including strong/em aliases) in one pass. */
  removeMarks() {
    if(!this.getState().marks.length) return false
    return this.removeMatching(element => canonicalMarkName(element.localName) !== null)
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
