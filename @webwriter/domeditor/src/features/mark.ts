import {EditorFeature, type DocumentListenerMap} from "."
import {
  canonicalMarkName,
  fontSizeOptions,
  isMarkElement,
  isMarkAttributeName,
  isStyleMarkName,
  markAttributeNames,
  markAttributeOptionsFor,
  markNames,
  mergedMarkGroupFor,
  primaryMarkOptions,
  styleMarkNames,
  type MarkAttributeValues,
  type MarkName,
  type StyleMarkName,
  type StyleMarkValues,
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
  private observer: MutationObserver | null = null
  private stateRefreshQueued = false
  /** `null` inherits the live DOM marks; a Set is an explicit typing state. */
  private storedMarks: Set<MarkName> | null = null
  /** `null` inherits inline styles; an object is an explicit typing state. */
  private storedStyles: StyleMarkValues | null = null
  /** Element-specific attributes to apply to the next typed mark at a caret. */
  private storedAttributes: MarkAttributeValues | null = null
  private storedSelection: StoredSelection | null = null

  actions = {
    addMark: ({mark}: {type: "addMark", mark: MarkName}) => this.addMark(mark),
    removeMark: ({mark}: {type: "removeMark", mark: MarkName}) => this.removeMark(mark),
    toggleMark: ({mark}: {type: "toggleMark", mark: MarkName}) => this.toggleMark(mark),
    toggleMarkGroup: ({mark}: {type: "toggleMarkGroup", mark: MarkName}) => this.toggleMarkGroup(mark),
    setMarkGroup: ({primary, marks}: {type: "setMarkGroup", primary: MarkName, marks: MarkName[]}) =>
      this.setMarkGroup(primary, marks),
    setMarkType: ({primary, mark}: {type: "setMarkType", primary: MarkName, mark: MarkName}) =>
      this.setMarkType(primary, mark),
    setMarkAttribute: ({mark, attribute, value}: {
      type: "setMarkAttribute"
      mark: MarkName
      attribute: string
      value: string
    }) => this.setMarkAttribute(mark, attribute, value),
    setStyleMark: ({property, value}: {type: "setStyleMark", property: StyleMarkName, value: string}) =>
      this.setStyleMark(property, value),
    increaseFontSize: ({}: {type: "increaseFontSize"}) => this.adjustFontSize(1),
    decreaseFontSize: ({}: {type: "decreaseFontSize"}) => this.adjustFontSize(-1),
    removeMarks: ({}: {type: "removeMarks"}) => this.removeMarks(),
  } as const

  activeListeners: DocumentListenerMap = {
    beforeinput: event => this.handleBeforeInput(event),
    keydown: event => this.handleShortcut(event),
    selectionchange: () => this.clearStoredMarksIfSelectionChanged(),
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver ?? MutationObserver
    const observer = new FrameMutationObserver(() => this.queueStateRefresh())
    try {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["style", ...markAttributeNames],
        childList: true,
        characterData: true,
        subtree: true,
      })
      this.observer = observer
    }
    catch {
      observer.disconnect()
    }
  }

  disable() {
    if(!this.isEnabled) return
    this.observer?.disconnect()
    this.observer = null
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

  /** Inline span style values shared by the entire selection, or effective at a caret. */
  getStyleState(): StyleMarkValues {
    this.clearStoredMarksIfSelectionChanged()
    const caret = this.getCaret()
    if(caret) return {...(this.storedStyles ?? this.stylesAt(caret.range.startContainer, caret.block))}

    const context = this.getSelection()
    if(!context) return {}
    const styles: StyleMarkValues = {}
    for(const property of styleMarkNames) {
      const values = context.text.map(({node}) => this.stylesAt(node, context.block)[property] ?? "")
      if(values.length && values[0] && values.every(value => value === values[0])) styles[property] = values[0]
    }
    return styles
  }

  /** Element-specific attribute values shared by the selected runs. */
  getAttributeState(): MarkAttributeValues {
    this.clearStoredMarksIfSelectionChanged()
    const caret = this.getCaret()
    if(caret) {
      const stored = this.storedAttributes
      const attributes = this.attributesAt(caret.range.startContainer, caret.block)
      return this.cloneAttributeValues(stored ?? attributes)
    }

    const context = this.getSelection()
    if(!context) return {}
    const result: MarkAttributeValues = {}
    for(const mark of markNames) {
      const options = markAttributeOptionsFor(mark)
      if(!options.length) continue
      const elements = this.markElementsForSelection(context, mark)
      if(!elements.length) continue
      result[mark] = Object.fromEntries(options.map(option => {
        const values = elements.map(element => element.getAttribute(option.name) ?? "")
        const value = values.every(candidate => candidate === values[0]) ? values[0] : ""
        return [option.name, value]
      }))
    }
    return result
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
    return this.removeMatching(element => this.semanticMarkName(element) === mark)
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

  /** Toggles all exact tag variants represented by one merged drawer control. */
  toggleMarkGroup(mark: MarkName) {
    this.assertMark(mark)
    const group = mergedMarkGroupFor(mark)
    if(!group || group.primary !== mark) throw new TypeError(`'${mark}' is not a primary merged mark`)

    const caret = this.getCaret()
    if(caret) {
      const marks = this.effectiveCaretMarks(caret)
      const active = group.members.some(member => marks.has(member))
      group.members.forEach(member => marks.delete(member))
      if(!active) marks.add(group.primary)
      this.storeMarks(marks, caret.selection)
      this.editor.postMarkState()
      return true
    }

    const state = this.getState()
    if(!state.canMark) return false
    return group.members.some(member => state.marks.includes(member))
      ? this.removeMatching(element => this.elementIsGroupMember(element, group.members))
      : this.addMark(group.primary)
  }

  /** Sets all exact mark tags represented by one drawer group. */
  setMarkGroup(primary: MarkName, marks: MarkName[]) {
    this.assertMark(primary)
    const group = mergedMarkGroupFor(primary)
    if(!group || group.primary !== primary) {
      throw new TypeError(`'${primary}' is not a primary merged mark`)
    }
    const selected = [...new Set(marks)]
    selected.forEach(mark => {
      this.assertMark(mark)
      if(!group.members.includes(mark)) {
        throw new TypeError(`'${mark}' is not a variant of '${primary}'`)
      }
    })

    const caret = this.getCaret()
    if(caret) {
      const current = this.effectiveCaretMarks(caret)
      const next = new Set([...current].filter(mark => !group.members.includes(mark)))
      selected.forEach(mark => next.add(mark))
      if(next.size === current.size && [...next].every(mark => current.has(mark))) return false
      this.storeMarks(next, caret.selection)
      this.editor.postMarkState()
      return true
    }

    const state = this.getState()
    if(!state.canMark) return false
    const active = group.members.filter(mark => state.marks.includes(mark))
    if(active.length === selected.length && active.every(mark => selected.includes(mark))) return false
    if(active.length) this.removeMatching(element => this.elementIsGroupMember(element, group.members))
    selected.forEach(mark => this.addMark(mark))
    return true
  }

  /** Replaces a merged mark's exact HTML tag while preserving the selected text. */
  setMarkType(primary: MarkName, mark: MarkName) {
    this.assertMark(primary)
    this.assertMark(mark)
    const group = mergedMarkGroupFor(primary)
    if(!group || group.primary !== primary || !group.members.includes(mark)) {
      throw new TypeError(`'${mark}' is not a variant of '${primary}'`)
    }

    const caret = this.getCaret()
    if(caret) {
      const marks = this.effectiveCaretMarks(caret)
      if(marks.has(mark) && !group.members.some(member => member !== mark && marks.has(member))) return false
      group.members.forEach(member => marks.delete(member))
      marks.add(mark)
      this.storeMarks(marks, caret.selection)
      this.editor.postMarkState()
      return true
    }

    const state = this.getState()
    if(!state.canMark) return false
    const activeMembers = group.members.filter(member => state.marks.includes(member))
    if(activeMembers.length === 1 && activeMembers[0] === mark) return false
    if(activeMembers.length) {
      this.removeMatching(element => this.elementIsGroupMember(element, group.members))
    }
    return this.addMark(mark)
  }

  /** Sets or removes one supported element-specific attribute on active mark wrappers. */
  setMarkAttribute(mark: MarkName, attribute: string, value: string) {
    this.assertMark(mark)
    if(!isMarkAttributeName(mark, attribute)) {
      throw new TypeError(`Unsupported attribute '${attribute}' for mark '${mark}'`)
    }

    const caret = this.getCaret()
    if(caret) {
      const element = this.markElementAt(caret.range.startContainer, caret.block, mark)
      if(element) {
        if((element.getAttribute(attribute) ?? "") === value) return false
        this.applyMarkAttribute(element, attribute, value)
      }
      else {
        const marks = this.effectiveCaretMarks(caret)
        if(!marks.has(mark)) return false
        const attributes = this.effectiveCaretAttributes(caret)
        const markAttributes = {...(attributes[mark] ?? {})}
        if(value) markAttributes[attribute] = value
        else delete markAttributes[attribute]
        if(Object.keys(markAttributes).length) attributes[mark] = markAttributes
        else delete attributes[mark]
        this.storeAttributes(attributes, caret.selection)
      }
      this.editor.postMarkState()
      return true
    }

    const context = this.getSelection()
    if(!context) return false
    const elements = this.markElementsForSelection(context, mark)
    if(!elements.length) return false
    if(elements.every(element => (element.getAttribute(attribute) ?? "") === value)) return false
    elements.forEach(element => this.applyMarkAttribute(element, attribute, value))
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  /** Sets one inline CSS property on span marks, or removes it for the default option. */
  setStyleMark(property: StyleMarkName, value: string) {
    this.assertStyleMark(property)
    const normalizedValue = this.normalizeStyleValue(property, value)
    const caret = this.getCaret()
    if(caret) return this.setStoredStyle(property, normalizedValue, caret)

    const context = this.getSelection()
    if(!context) return false
    const currentValues = context.text.map(({node}) => this.stylesAt(node, context.block)[property] ?? "")
    if(currentValues.every(current => current === normalizedValue)) return false

    const boundary = document.createElement("span")
    boundary.setAttribute(markerAttribute, "")
    boundary.append(context.range.extractContents())
    context.range.insertNode(boundary)

    // Generated style spans are split at both selection boundaries. This
    // keeps their other style properties while isolating the changed run.
    while(true) {
      let target = boundary.parentElement
      while(target && target !== context.block && !this.isStyleMarkSpan(target)) {
        target = target.parentElement
      }
      if(!target || target === context.block) break

      while(boundary.parentElement && boundary.parentElement !== target) {
        this.promoteBoundary(boundary, true)
      }
      if(boundary.parentElement === target) this.promoteStyleBoundary(boundary)
    }

    const styledDescendants = Array.from(boundary.querySelectorAll<HTMLElement>("span[style]")).reverse()
    for(const span of styledDescendants) {
      span.style.removeProperty(property)
      this.removeEmptyStyleSpan(span)
    }

    if(normalizedValue) this.applyStyleToBoundary(boundary, property, normalizedValue)
    boundary.replaceWith(...Array.from(boundary.childNodes))
    context.block.normalize()
    this.mergeStyleSpans(context.block)
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  adjustFontSize(direction: -1 | 1) {
    const state = this.getState()
    if(!state.canMark) return false
    const current = Number.parseFloat(this.getStyleState()["font-size"] ?? "") || this.computedFontSize() || 16
    const sizes = fontSizeOptions.flatMap(option => {
      const size = Number.parseFloat(option.value)
      return Number.isFinite(size)? [size]: []
    })
    const size = direction > 0
      ? sizes.find(candidate => candidate > current)
      : [...sizes].reverse().find(candidate => candidate < current)
    return size === undefined? false: this.setStyleMark("font-size", `${size}px`)
  }

  /** Removes every supported mark (including strong/em aliases) in one pass. */
  removeMarks() {
    const caret = this.getCaret()
    if(caret) {
      if(!this.effectiveCaretMarks(caret).size && !Object.keys(this.effectiveCaretStyles(caret)).length) return false
      this.storeMarks(new Set(), caret.selection)
      this.storeStyles({}, caret.selection)
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

  private effectiveCaretStyles(caret: MarkCaret) {
    this.clearStoredMarksIfSelectionChanged()
    return {...(this.storedStyles ?? this.stylesAt(caret.range.startContainer, caret.block))}
  }

  private effectiveCaretAttributes(caret: MarkCaret) {
    this.clearStoredMarksIfSelectionChanged()
    return this.cloneAttributeValues(
      this.storedAttributes ?? this.attributesAt(caret.range.startContainer, caret.block),
    )
  }

  private setStoredMark(mark: MarkName, enabled: boolean, caret: MarkCaret) {
    const marks = this.effectiveCaretMarks(caret)
    if(marks.has(mark) === enabled) return false
    enabled? marks.add(mark): marks.delete(mark)
    this.storeMarks(marks, caret.selection)
    this.editor.postMarkState()
    return true
  }

  private setStoredStyle(property: StyleMarkName, value: string, caret: MarkCaret) {
    const styles = this.effectiveCaretStyles(caret)
    if((styles[property] ?? "") === value) return false
    if(value) styles[property] = value
    else delete styles[property]
    this.storeStyles(styles, caret.selection)
    this.editor.postMarkState()
    return true
  }

  private storeMarks(marks: Set<MarkName>, selection: Selection) {
    if(!selection.anchorNode || !selection.focusNode) return
    this.storedMarks = marks
    if(this.storedAttributes) {
      for(const mark of Object.keys(this.storedAttributes) as MarkName[]) {
        if(!marks.has(mark)) delete this.storedAttributes[mark]
      }
    }
    this.storeSelection(selection)
  }

  private storeStyles(styles: StyleMarkValues, selection: Selection) {
    if(!selection.anchorNode || !selection.focusNode) return
    this.storedStyles = {...styles}
    this.storeSelection(selection)
  }

  private storeAttributes(attributes: MarkAttributeValues, selection: Selection) {
    if(!selection.anchorNode || !selection.focusNode) return
    this.storedAttributes = this.cloneAttributeValues(attributes)
    this.storeSelection(selection)
  }

  private storeSelection(selection: Selection) {
    if(!selection.anchorNode || !selection.focusNode) return
    this.storedSelection = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    }
  }

  private clearStoredMarks() {
    this.storedMarks = null
    this.storedStyles = null
    this.storedAttributes = null
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
      || this.storedMarks === null && this.storedStyles === null && this.storedAttributes === null
      || !["insertText", "insertReplacementText"].includes(event.inputType)
      || !event.data) return

    const caret = this.getCaret()
    if(!caret) return
    const desired = new Set(this.storedMarks ?? this.marksAt(caret.range.startContainer, caret.block))
    const desiredStyles = {...(this.storedStyles ?? this.stylesAt(caret.range.startContainer, caret.block))}
    const desiredAttributes = this.cloneAttributeValues(
      this.storedAttributes ?? this.attributesAt(caret.range.startContainer, caret.block),
    )
    event.preventDefault()

    const text = document.createTextNode(event.data)
    caret.range.insertNode(text)
    caret.selection.setBaseAndExtent(text, 0, text, text.length)

    const unwanted = new Set(this.getState().marks.filter(mark => !desired.has(mark)))
    if(unwanted.size) {
      this.removeMatching(element => {
        const mark = this.semanticMarkName(element)
        return mark !== null && unwanted.has(mark)
      })
    }
    for(const mark of markNames) {
      if(desired.has(mark) && !this.getState().marks.includes(mark)) this.addMark(mark)
    }
    for(const property of styleMarkNames) {
      this.setStyleMark(property, desiredStyles[property] ?? "")
    }
    for(const [mark, attributes] of Object.entries(desiredAttributes) as [MarkName, Record<string, string>][]) {
      for(const [attribute, value] of Object.entries(attributes)) {
        if(value) this.setMarkAttribute(mark, attribute, value)
      }
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

  /** Splits a generated style span while retaining its other properties on the selection. */
  private promoteStyleBoundary(boundary: Element) {
    const parent = boundary.parentElement
    const grandparent = parent?.parentNode
    if(!parent || !grandparent) return

    const before = parent.cloneNode(false) as Element
    while(parent.firstChild && parent.firstChild !== boundary) before.append(parent.firstChild)

    const after = parent.cloneNode(false) as Element
    while(boundary.nextSibling) after.append(boundary.nextSibling)

    const selected = parent.cloneNode(false) as Element
    selected.append(...Array.from(boundary.childNodes))
    boundary.append(selected)

    if(this.hasContent(before)) grandparent.insertBefore(before, parent)
    grandparent.insertBefore(boundary, parent)
    if(this.hasContent(after)) grandparent.insertBefore(after, parent)
    parent.remove()
  }

  private applyStyleToBoundary(boundary: Element, property: StyleMarkName, value: string) {
    let wrapper: HTMLSpanElement | null = null
    for(const node of Array.from(boundary.childNodes)) {
      if(node instanceof HTMLElement && this.isStyleMarkSpan(node)) {
        node.style.setProperty(property, value)
        wrapper = null
        continue
      }
      if(!wrapper) {
        wrapper = document.createElement("span")
        wrapper.style.setProperty(property, value)
        boundary.insertBefore(wrapper, node)
      }
      wrapper.append(node)
    }
  }

  private removeEmptyStyleSpan(span: HTMLElement) {
    if(span.style.length) return
    span.removeAttribute("style")
    if(!Array.from(span.attributes).some(attribute =>
      attribute.name !== "class"
      || attribute.value.split(/\s+/).some(name => name && !name.startsWith("◆")),
    )) span.replaceWith(...Array.from(span.childNodes))
  }

  /** Merges adjacent span runs with the same style set after range splitting. */
  private mergeStyleSpans(root: Element) {
    for(const child of Array.from(root.children)) this.mergeStyleSpans(child)
    let node: ChildNode | null = root.firstChild
    while(node) {
      const next: ChildNode | null = node.nextSibling
      if(node instanceof HTMLElement
        && next instanceof HTMLElement
        && node.localName === "span"
        && this.elementsEquivalent(node, next)) {
        node.append(...Array.from(next.childNodes))
        next.remove()
        continue
      }
      node = next
    }
  }

  private hasContent(element: Element) {
    return element.textContent!.length > 0 || element.children.length > 0
  }

  private mergeEquivalentSiblings(wrapper: Element) {
    if(!wrapper.isConnected) return
    let merged = wrapper
    const previous = merged.previousSibling
    if(previous instanceof Element && this.elementsEquivalent(previous, merged)) {
      previous.append(...Array.from(merged.childNodes))
      merged.remove()
      merged = previous
    }
    const next = merged.nextSibling
    if(next instanceof Element && this.elementsEquivalent(merged, next)) {
      merged.append(...Array.from(next.childNodes))
      next.remove()
    }
  }

  private elementsEquivalent(a: Element, b: Element) {
    if(a.localName !== b.localName) return false
    const aAttributes = this.normalizedAttributes(a)
    const bAttributes = this.normalizedAttributes(b)
    return aAttributes.length === bAttributes.length
      && aAttributes.every(([name, value], index) =>
        bAttributes[index]?.[0] === name && bAttributes[index]?.[1] === value,
      )
  }

  private normalizedAttributes(element: Element): [string, string][] {
    return Array.from(element.attributes).flatMap(attribute => {
      if(attribute.name === "class") {
        const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).sort()
        return classes.length? [["class", classes.join(" ")] as [string, string]]: []
      }
      if(attribute.name === "style" && element instanceof HTMLElement) {
        const declarations: string[] = []
        for(let index = 0; index < element.style.length; index++) {
          const property = element.style.item(index)
          declarations.push(`${property}:${element.style.getPropertyValue(property).trim()}!${element.style.getPropertyPriority(property)}`)
        }
        return declarations.length? [["style", declarations.sort().join(";")] as [string, string]]: []
      }
      return [[attribute.name, attribute.value] as [string, string]]
    }).sort(([a], [b]) => a.localeCompare(b))
  }

  private isStyleMarkSpan(element: Element) {
    return element instanceof HTMLElement
      && element.localName === "span"
      && element.hasAttribute("style")
      && element.style.length > 0
      && Array.from({length: element.style.length}, (_, index) => element.style.item(index))
        .every(isStyleMarkName)
      && Array.from(element.attributes).every(attribute => attribute.name === "style" || (
        attribute.name === "class"
        && attribute.value.split(/\s+/).every(name => !name || name.startsWith("◆"))
      ))
  }

  /** Style-only spans belong to the dedicated style controls, not the semantic Span group. */
  private semanticMarkName(element: Element) {
    const mark = canonicalMarkName(element.localName)
    return mark === "span" && this.isStyleMarkSpan(element) ? null : mark
  }

  private elementIsGroupMember(element: Element, members: readonly MarkName[]) {
    const mark = this.semanticMarkName(element)
    return mark !== null && members.includes(mark)
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
      const mark = this.semanticMarkName(element)
      if(mark) marks.add(mark)
      if(element === block) break
      element = element.parentElement
    }
    return marks
  }

  private markElementAt(node: Node, block: Element, mark: MarkName) {
    let element = node instanceof Element? node: node.parentElement
    while(element && element !== block.parentElement) {
      if(this.semanticMarkName(element) === mark) return element
      if(element === block) break
      element = element.parentElement
    }
    return null
  }

  private markElementsForSelection(context: MarkSelection, mark: MarkName) {
    const elements = new Set<Element>()
    for(const {node} of context.text) {
      const element = this.markElementAt(node, context.block, mark)
      if(element) elements.add(element)
    }
    return [...elements]
  }

  private attributesAt(node: Node, block: Element) {
    const attributes: MarkAttributeValues = {}
    for(const mark of markNames) {
      const options = markAttributeOptionsFor(mark)
      if(!options.length) continue
      const element = this.markElementAt(node, block, mark)
      if(!element) continue
      attributes[mark] = Object.fromEntries(
        options.map(option => [option.name, element.getAttribute(option.name) ?? ""]),
      )
    }
    return attributes
  }

  private cloneAttributeValues(attributes: MarkAttributeValues) {
    return Object.fromEntries(
      Object.entries(attributes).map(([mark, values]) => [mark, {...values}]),
    ) as MarkAttributeValues
  }

  private applyMarkAttribute(element: Element, attribute: string, value: string) {
    if(value) element.setAttribute(attribute, value)
    else element.removeAttribute(attribute)
  }

  private stylesAt(node: Node, block: Element) {
    const styles: StyleMarkValues = {}
    let element = node instanceof Element? node: node.parentElement
    while(element && element !== block.parentElement) {
      if(this.isStyleMarkSpan(element)) {
        for(const property of styleMarkNames) {
          if(styles[property] !== undefined) continue
          const value = (element as HTMLElement).style.getPropertyValue(property).trim()
          if(value) styles[property] = value
        }
      }
      if(element === block) break
      element = element.parentElement
    }
    return styles
  }

  private computedFontSize() {
    const selection = document.getSelection()
    const node = selection?.rangeCount? selection.getRangeAt(0).startContainer: null
    const element = node instanceof Element? node: node?.parentElement
    if(!element) return 0
    return Number.parseFloat(getComputedStyle(element).fontSize) || 0
  }

  private normalizeStyleValue(property: StyleMarkName, value: string) {
    if(!value.trim()) return ""
    const span = document.createElement("span")
    span.style.setProperty(property, value)
    return span.style.getPropertyValue(property).trim()
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
    if(selectedChild instanceof Element && !isMarkElement(selectedChild)) return null
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
    const group = mergedMarkGroupFor(option.name)
    if(group?.primary === option.name) this.toggleMarkGroup(option.name)
    else this.toggleMark(option.name)
  }

  private assertMark(mark: string): asserts mark is MarkName {
    if(canonicalMarkName(mark) !== mark) throw new TypeError(`Unsupported mark '${mark}'`)
  }

  private assertStyleMark(property: string): asserts property is StyleMarkName {
    if(!isStyleMarkName(property)) throw new TypeError(`Unsupported style mark '${property}'`)
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
