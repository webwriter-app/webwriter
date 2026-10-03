import {EditorFeature, type DocumentListenerMap} from "."
import {
  canonicalMarkName,
  excludedMarkNames,
  fontSizeOptions,
  hasStandardMarkShortcut,
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
  type RubyComponentState,
  type RubyState,
  type StyleMarkName,
  type StyleMarkValues,
} from "../marks"
import {$, cloneWithoutEditorMarkers, modifierKeyDown, textOffsetIn, textPointAtOffset} from "../utility"
import {SVG_NAMESPACE} from "../graphic"
import {isSectionElement} from "../sections"

export type MarkState = {
  /** Whether the current selection is a markable text range or caret. */
  canMark: boolean
  svgText?: boolean
  /** Marks found in the range, or effective for the next input at a caret. */
  marks: MarkName[]
  /** Marks a containing widget allows; absent when all marks are allowed. */
  allowedMarks?: MarkName[]
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

const svgStyleNames = ["font-weight", "font-style", "text-decoration-line", "font-family", "font-size", "fill", "background-color"]

const markerAttribute = "data-domeditor-mark-boundary"

/** Inline formatting derived from the live DOM, with transient caret marks for typing. */
export class MarkFeature extends EditorFeature {
  protected handlesCapturedElementInteractions = true
  /** SVG text uses its own inline vocabulary, while sharing mark commands and caret storage. */
  private svgTextRoot(node: Node | null): Element | null {
    let element = node instanceof Element ? node : node?.parentElement
    let root: Element | null = null
    while(element) {
      if(element.localName.includes("-") || element.hasAttribute("is") || element.getAttribute("contenteditable") === "false") return null
      if(!root) {
        if(element.namespaceURI !== SVG_NAMESPACE || !["text", "tspan", "textPath", "a"].includes(element.localName)) return null
        if(element.localName === "text") root = element
      }
      element = element.parentElement
    }
    return root?.isConnected ? root : null
  }

  get isSVGTextSelection() {
    const selection = document.getSelection()
    const range = this.editor.features.graphic.textEditingRange
    const root = this.svgTextRoot(range?.startContainer ?? selection?.anchorNode ?? null)
    return !!root && root === this.svgTextRoot(range?.endContainer ?? selection?.focusNode ?? null)
  }

  private svgContext(): MarkSelection | null {
    const selection = document.getSelection()
    // A focused label proxy can leave no native document range; its saved SVG
    // range remains authoritative for this input event.
    if(!selection || !this.isSVGTextSelection) return null
    const range = (this.editor.features.graphic.textEditingRange ?? selection.getRangeAt(0)).cloneRange()
    const block = this.svgTextRoot(range.startContainer)!
    const start = this.textOffset(block, range.startContainer, range.startOffset)
    const end = this.textOffset(block, range.endContainer, range.endOffset)
    if(start === null || end === null) return null
    if(Array.from(block.querySelectorAll("*")).some(element => range.intersectsNode(element) && !this.svgTextRoot(element))) return null
    const text = this.selectedText(range, block).filter(({node}) => this.svgTextRoot(node) === block)
    return {selection, range, block, start, end, backwards: this.isBackwards(selection), text}
  }

  private svgStyle(element: Element) {
    const style = document.createElement("span").style
    style.cssText = element.getAttribute("style") ?? ""
    return style
  }

  private writeSVGStyle(element: Element, property: string, value: string) {
    const style = this.svgStyle(element)
    if(value) style.setProperty(property, value)
    else style.removeProperty(property)
    if(style.cssText) element.setAttribute("style", style.cssText)
    else element.removeAttribute("style")
  }

  private svgProperty(element: Element, property: string) {
    const style = this.svgStyle(element)
    let value = style.getPropertyValue(property) || element.getAttribute(property) || ""
    if(property === "text-decoration-line" && !value) {
      value = (style.getPropertyValue("text-decoration") || element.getAttribute("text-decoration") || "")
        .split(/\s+/).filter(part => ["underline", "line-through", "overline", "none"].includes(part)).join(" ")
    }
    if(property === "font-size" && /^\d+(?:\.\d+)?$/.test(value)) value += "px"
    return value
  }

  private svgValues(node: Node) {
    const values: Record<string, string> = {}
    let link: Element | null = null
    for(let element = node instanceof Element ? node : node.parentElement; element?.namespaceURI === SVG_NAMESPACE; element = element.parentElement) {
      for(const property of svgStyleNames) {
        const value = this.svgProperty(element, property)
        if(value && !(property in values)) values[property] = value
      }
      if(!link && element.localName === "a") link = element
    }
    const marks = new Set<MarkName>()
    if(values["font-weight"] === "bold" || Number.parseFloat(values["font-weight"]) >= 600) marks.add("b")
    if(/^(italic|oblique)/.test(values["font-style"] ?? "")) marks.add("i")
    for(const [mark, line] of [["u", "underline"], ["s", "line-through"]] as const) {
      if(values["text-decoration-line"]?.split(/\s+/).includes(line)) marks.add(mark)
    }
    if(link) marks.add("a")
    const styles = Object.fromEntries(styleMarkNames.flatMap(property => {
      const value = values[property === "color" ? "fill" : property]
      return value ? [[property, value]] : []
    })) as StyleMarkValues
    const attributes: MarkAttributeValues = link ? {a: Object.fromEntries(markAttributeOptionsFor("a").filter(({name}) => name !== "download" || link!.hasAttribute(name)).map(({name}) => [name, link!.getAttribute(name) ?? (name === "href" ? link!.getAttributeNS("http://www.w3.org/1999/xlink", "href") : null) ?? ""]))} : {}
    return {marks, styles, attributes, link, values}
  }

  private svgState(context: MarkSelection) {
    this.clearStoredMarksIfSelectionChanged()
    const samples = context.range.collapsed ? [this.svgValues(context.range.startContainer)] : context.text.map(({node}) => this.svgValues(node))
    const first = samples[0]
    const marks = context.range.collapsed && this.storedMarks !== null ? [...this.storedMarks]
      : markNames.filter(mark => samples.length && samples.every(sample => sample.marks.has(mark)))
    const styles = context.range.collapsed && this.storedStyles !== null ? {...this.storedStyles}
      : Object.fromEntries(styleMarkNames.flatMap(property => first?.styles[property] && samples.every(sample => sample.styles[property] === first.styles[property]) ? [[property, first.styles[property]]] : []))
    const attributes = context.range.collapsed && this.storedAttributes !== null ? this.cloneAttributeValues(this.storedAttributes)
      : marks.includes("a") ? {a: Object.fromEntries(markAttributeOptionsFor("a").filter(({name}) => name !== "download" || samples.every(sample => sample.attributes.a?.download !== undefined)).map(({name}) => [name, first?.attributes.a?.[name] && samples.every(sample => sample.attributes.a?.[name] === first.attributes.a?.[name]) ? first.attributes.a[name] : ""]))} : {}
    return {canMark: true, svgText: true, marks, styles, attributes}
  }

  /** Move a property's declaration down one level without splitting positioned elements. */
  private pushSVGStyle(element: Element, property: string) {
    const value = this.svgProperty(element, property)
    if(!value) return
    for(const child of Array.from(element.childNodes)) {
      let target: Element
      if(child instanceof Text) {
        if(!child.length) continue
        target = document.createElementNS(SVG_NAMESPACE, "tspan")
        child.before(target)
        target.append(child)
      }
      else if(child instanceof Element && this.svgTextRoot(child)) target = child
      else continue
      if(!this.svgProperty(target, property)) this.writeSVGStyle(target, property, value)
    }
    this.writeSVGStyle(element, property, "")
    element.removeAttribute(property)
    if(property === "text-decoration-line") element.removeAttribute("text-decoration")
  }

  private stripSVGStyles(node: Text, root: Element, properties: string[]) {
    for(const property of properties) {
      let parent = node.parentElement
      const ancestors: Element[] = []
      while(parent && root.contains(parent)) { ancestors.unshift(parent); parent = parent.parentElement }
      for(const ancestor of ancestors) this.pushSVGStyle(ancestor, property)
      // Pushing a text parent's declaration creates a final run wrapper.
      const wrapper = node.parentElement!
      this.writeSVGStyle(wrapper, property, "")
      wrapper.removeAttribute(property)
      if(property === "text-decoration-line") wrapper.removeAttribute("text-decoration")
    }
  }

  /** Distribute an SVG link across its text runs, keeping positioned descendants intact. */
  private isolateSVGLink(node: Text) {
    const link = this.svgValues(node).link
    if(!link || !this.svgTextRoot(link)) return null
    if(link.childNodes.length === 1 && link.firstChild === node) return link
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    while(walker.nextNode()) if(this.svgTextRoot(walker.currentNode)) texts.push(walker.currentNode as Text)
    const attributes = markAttributeOptionsFor("a").map(({name}) => name)
    const shell = document.createElementNS(SVG_NAMESPACE, "tspan")
    for(const attribute of Array.from(link.attributes)) if(!attributes.includes(attribute.name) && attribute.name !== "xlink:href") shell.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
    shell.append(...Array.from(link.childNodes))
    link.replaceWith(shell)
    for(const text of texts) {
      const wrapper = document.createElementNS(SVG_NAMESPACE, "a")
      for(const name of attributes) if(link.hasAttribute(name)) wrapper.setAttribute(name, link.getAttribute(name)!)
      const href = link.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      if(href && !wrapper.hasAttribute("href")) wrapper.setAttribute("href", href)
      text.before(wrapper)
      wrapper.append(text)
    }
    return node.parentElement!
  }

  private editSVG(context: MarkSelection, styles: Record<string, string>, link?: Record<string, string> | null) {
    if(context.range.collapsed) return false
    for(const slice of [...context.text].reverse()) {
      let node = slice.node
      const current = this.svgValues(node).values
      const changes = Object.fromEntries(Object.entries(styles).filter(([property, value]) => (current[property] ?? "") !== value))
      if(!Object.keys(changes).length && link === undefined) continue
      if(slice.end < node.length) node.splitText(slice.end)
      if(slice.start) node = node.splitText(slice.start)
      this.stripSVGStyles(node, context.block, Object.keys(changes))
      if(link !== undefined) {
        const previous = this.isolateSVGLink(node)
        if(previous) {
          for(const {name} of markAttributeOptionsFor("a")) previous.removeAttribute(name)
          previous.removeAttributeNS("http://www.w3.org/1999/xlink", "href")
          const replacement = document.createElementNS(SVG_NAMESPACE, "tspan")
          for(const attribute of Array.from(previous.attributes)) replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
          replacement.append(...Array.from(previous.childNodes))
          previous.replaceWith(replacement)
        }
      }
      if(Object.values(changes).some(Boolean)) {
        const span = document.createElementNS(SVG_NAMESPACE, "tspan")
        for(const [property, value] of Object.entries(changes)) if(value) this.writeSVGStyle(span, property, value)
        node.before(span)
        span.append(node)
      }
      if(link) {
        const anchor = document.createElementNS(SVG_NAMESPACE, "a")
        for(const [name, value] of Object.entries(link)) if(value || name === "download") anchor.setAttribute(name, value)
        node.before(anchor)
        anchor.append(node)
      }
    }
    for(const element of Array.from(context.block.querySelectorAll("tspan")).reverse()) {
      if(Array.from(element.attributes).every(attribute => attribute.name === "class" && attribute.value.split(/\s+/).every(name => name.startsWith("◆")))) element.replaceWith(...Array.from(element.childNodes))
    }
    this.restoreSelection(context)
    this.editor.postMarkState()
    return context.text.length > 0
  }

  private setSVGMark(context: MarkSelection, mark: MarkName, enabled?: boolean) {
    if(!["b", "i", "u", "s", "a"].includes(mark)) return false
    const state = this.svgState(context)
    const next = enabled ?? !state.marks.includes(mark)
    if(context.range.collapsed) {
      const marks = new Set(state.marks)
      if(next) marks.add(mark)
      else marks.delete(mark)
      this.storeMarks(marks, context.selection)
      if(mark === "a" && !next) this.storeAttributes({}, context.selection)
      this.editor.postMarkState()
      return true
    }
    if(mark === "a") return this.editSVG(context, {}, next ? state.attributes.a ?? {} : null)
    const property = mark === "b" ? "font-weight" : mark === "i" ? "font-style" : "text-decoration-line"
    if(mark === "b" || mark === "i") return this.editSVG(context, {[property]: next ? mark === "b" ? "bold" : "italic" : "normal"})
    // Keep each run's other decoration when toggling a mixed selection.
    for(const slice of [...context.text].reverse()) {
      const marks = this.svgValues(slice.node).marks
      if(next) marks.add(mark)
      else marks.delete(mark)
      this.editSVG({...context, text: [slice]}, {[property]: [marks.has("u") ? "underline" : "", marks.has("s") ? "line-through" : ""].filter(Boolean).join(" ") || "none"})
    }
    return context.text.length > 0
  }

  private selectedSVGTextRoots() {
    const selection = document.getSelection()
    if(!selection?.rangeCount || selection.isCollapsed) return []
    const range = selection.getRangeAt(0)
    return Array.from(document.body.querySelectorAll("svg text")).filter(element => this.svgTextRoot(element) === element && range.intersectsNode(element))
  }

  private clearSelectedSVGText(roots: Element[]) {
    const selection = document.getSelection()!
    const original = selection.getRangeAt(0).cloneRange()
    const backwards = this.isBackwards(selection)
    let changed = false
    try {
      for(const root of roots) {
        const range = document.createRange()
        range.selectNodeContents(root)
        if(original.compareBoundaryPoints(Range.START_TO_START, range) > 0) range.setStart(original.startContainer, original.startOffset)
        if(original.compareBoundaryPoints(Range.END_TO_END, range) < 0) range.setEnd(original.endContainer, original.endOffset)
        if(range.collapsed) continue
        selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
        const context = this.svgContext()
        if(context) changed = this.clearSVG(context) || changed
      }
    }
    finally {
      selection.setBaseAndExtent(backwards ? original.endContainer : original.startContainer, backwards ? original.endOffset : original.startOffset,
        backwards ? original.startContainer : original.endContainer, backwards ? original.startOffset : original.endOffset)
    }
    return changed
  }

  private clearSVG(context: MarkSelection) {
    if(context.range.collapsed) {
      this.storeMarks(new Set(), context.selection)
      this.storeStyles({}, context.selection)
      this.storeAttributes({}, context.selection)
      this.editor.postMarkState()
      return true
    }
    return this.editSVG(context, Object.fromEntries(svgStyleNames.map(property => [property, ""])), null)
  }

  handleSVGTextInput(event: InputEvent) {
    const context = this.svgContext()
    if(context) this.handleSVGInput(event, context)
  }

  private handleSVGInput(event: InputEvent, context: MarkSelection) {
    if(event.defaultPrevented) return
    if(["deleteContentBackward", "deleteContentForward"].includes(event.inputType)) {
      event.preventDefault()
      const {range, block} = context
      if(range.collapsed) {
        const offset = context.start
        const backwards = event.inputType === "deleteContentBackward"
        const content = block.textContent ?? ""
        const length = backwards ? [...content.slice(0, offset)].at(-1)?.length ?? 0 : [...content.slice(offset)][0]?.length ?? 0
        range.setStart(...this.textPoint(block, backwards ? offset - length : offset))
        range.setEnd(...this.textPoint(block, backwards ? offset : offset + length))
      }
      range.deleteContents()
      context.selection.removeAllRanges()
      context.selection.addRange(range)
      this.clearStoredMarks()
      this.editor.postMarkState()
      return
    }
    if(!["insertText", "insertReplacementText", "insertFromPaste"].includes(event.inputType) || !event.data) return
    const state = this.svgState(context)
    event.preventDefault()
    const current = this.svgValues(context.range.startContainer)
    if(context.range.collapsed && context.range.startContainer instanceof Text
      && markNames.every(mark => state.marks.includes(mark) === current.marks.has(mark))
      && styleMarkNames.every(property => state.styles[property] === current.styles[property])
      && markAttributeOptionsFor("a").every(({name}) => (state.attributes.a?.[name] ?? "") === (current.attributes.a?.[name] ?? ""))) {
      const node = context.range.startContainer
      const offset = context.range.startOffset + event.data.length
      node.insertData(context.range.startOffset, event.data)
      context.selection.setBaseAndExtent(node, offset, node, offset)
      this.storeMarks(new Set(state.marks), context.selection)
      this.storeStyles(state.styles, context.selection)
      this.storeAttributes(state.attributes, context.selection)
      context.block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: event.inputType, data: event.data}))
      this.editor.postMarkState()
      return
    }
    context.range.deleteContents()
    const text = document.createTextNode(event.data)
    context.range.insertNode(text)
    context.selection.setBaseAndExtent(text, 0, text, text.length)
    const inserted = this.svgContext()!
    const styles: Record<string, string> = {
      "font-weight": state.marks.includes("b") ? "bold" : "normal",
      "font-style": state.marks.includes("i") ? "italic" : "normal",
      "text-decoration-line": [state.marks.includes("u") ? "underline" : "", state.marks.includes("s") ? "line-through" : ""].filter(Boolean).join(" ") || "none",
      ...Object.fromEntries(styleMarkNames.map(property => [property === "color" ? "fill" : property, state.styles[property] ?? ""])),
    }
    this.editSVG(inserted, styles, state.marks.includes("a") ? state.attributes.a ?? {} : null)
    context.selection.collapseToEnd()
    this.storeMarks(new Set(state.marks), context.selection)
    this.storeStyles(state.styles, context.selection)
    this.storeAttributes(state.attributes, context.selection)
    context.block.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: event.inputType, data: event.data}))
    this.editor.postMarkState()
  }

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
      value: string | null
    }) => this.setMarkAttribute(mark, attribute, value),
    createRuby: ({annotation, fallback}: {type: "createRuby", annotation: string, fallback: boolean}) =>
      this.createRuby(annotation, fallback),
    setRubyAnnotation: ({index, expected, value}: {
      type: "setRubyAnnotation", index: number, expected: string, value: string
    }) => this.setRubyComponent("rt", index, expected, value),
    addRubyAnnotation: ({value}: {type: "addRubyAnnotation", value: string}) => this.addRubyAnnotation(value),
    removeRubyAnnotation: ({index, expected}: {
      type: "removeRubyAnnotation", index: number, expected: string
    }) => this.removeRubyAnnotation(index, expected),
    addRubyFallback: ({}: {type: "addRubyFallback"}) => this.addRubyFallback(),
    setRubyFallback: ({index, expected, value}: {
      type: "setRubyFallback", index: number, expected: string, value: string
    }) => this.setRubyComponent("rp", index, expected, value),
    removeRubyFallback: ({}: {type: "removeRubyFallback"}) => this.removeRubyFallback(),
    removeRuby: ({}: {type: "removeRuby"}) => this.removeRuby(),
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
        attributeFilter: ["style", ...markAttributeNames, ...svgStyleNames],
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

  /** Marks allowed by the nearest widget whose editing config restricts them,
   * or undefined when every mark is allowed. */
  allowedMarksAt(node: Node | null): MarkName[] | undefined {
    let element = node instanceof Element ? node : node?.parentElement ?? null
    while(element && element !== document.body) {
      const marks = this.editor.schema.get(element)?.marks
      if(marks) return markNames.filter(mark => marks.includes(mark))
      element = element.parentElement
    }
  }

  /** Whether a widget around the selection allows `mark` (`span` for styles). */
  private isMarkAllowed(mark: MarkName) {
    const allowed = this.allowedMarksAt(document.getSelection()?.anchorNode ?? null)
    return !allowed || allowed.includes(mark)
  }

  /** Reads the current selection and its ancestors afresh on every call. */
  getState(): MarkState {
    const state = this.getUnrestrictedState()
    const allowed = this.svgContext() || this.editor.features.math.activeMath
      ? undefined
      : this.allowedMarksAt(document.getSelection()?.anchorNode ?? null)
    if(!allowed) return state
    return {...state, canMark: state.canMark && allowed.length > 0, allowedMarks: allowed}
  }

  private getUnrestrictedState(): MarkState {
    const svg = this.svgContext()
    if(svg) return this.svgState(svg)
    if(this.editor.features.math.activeMath) {
      const {canMark, marks} = this.editor.features.math.getFormatting()
      return {canMark, marks}
    }
    this.clearStoredMarksIfSelectionChanged()
    const caret = this.getCaret()
    if(caret) {
      const marks = this.storedMarks ?? this.marksAt(caret.range.startContainer, caret.block)
      return {canMark: true, marks: markNames.filter(mark => marks.has(mark))}
    }

    const context = this.getSelection()
    if(!context) return {canMark: this.editor.features.math.selectedFormulas.length > 0 || this.selectedSVGTextRoots().length > 0, marks: []}

    const marks = new Set<MarkName>()
    for(const {node} of context.text) {
      this.marksAt(node, context.block).forEach(mark => marks.add(mark))
    }
    return {canMark: true, marks: markNames.filter(mark => marks.has(mark))}
  }

  /** Inline span style values shared by the entire selection, or effective at a caret. */
  getStyleState(): StyleMarkValues {
    const svg = this.svgContext()
    if(svg) return this.svgState(svg).styles
    if(this.editor.features.math.activeMath) {
      const {styles} = this.editor.features.math.getFormatting()
      return Object.fromEntries(styleMarkNames.flatMap(property => styles[property] ? [[property, styles[property]]] : []))
    }
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
    const svg = this.svgContext()
    if(svg) return this.svgState(svg).attributes
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
      result[mark] = Object.fromEntries(options.filter(option => option.name !== "download" || elements.every(element => element.hasAttribute("download"))).map(option => {
        const values = elements.map(element => element.getAttribute(option.name) ?? "")
        const value = values.every(candidate => candidate === values[0]) ? values[0] : ""
        return [option.name, value]
      }))
    }
    return result
  }

  /** Structured state for the ruby element resolved from the current live selection. */
  getRubyState(): RubyState {
    const ruby = this.selectedRuby()
    const context = this.getSelection()
    if(!ruby) return {
      active: false,
      canCreate: !!context && !this.selectionContainsRuby(context),
      base: context?.range.toString() ?? "",
      annotations: [],
      fallbacks: [],
    }

    const component = (node: ChildNode, index: number): RubyComponentState => ({
      index,
      text: node.textContent ?? "",
      hasMarkup: node instanceof Element && node.children.length > 0,
    })
    const children = Array.from(ruby.childNodes)
    const annotations = children.flatMap((node, index) =>
      node instanceof HTMLElement && node.localName === "rt" ? [component(node, index)] : [],
    )
    const fallbacks = children.flatMap((node, index) =>
      node instanceof HTMLElement && node.localName === "rp" ? [component(node, index)] : [],
    )
    const base = children
      .filter(node => !(node instanceof HTMLElement) || node.localName !== "rt" && node.localName !== "rp")
      .map(node => node instanceof Element || node instanceof Text ? node.textContent ?? "" : "")
      .join("")
    return {active: true, canCreate: false, base, annotations, fallbacks}
  }

  /** Wraps the selected phrasing DOM as one ruby base and appends its first annotation. */
  createRuby(annotation = "", fallback = false): boolean {
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.createRuby(annotation, fallback))
    if(typeof annotation !== "string" || typeof fallback !== "boolean") return false
    const context = this.getSelection()
    if(!context || this.selectionContainsRuby(context)) return false

    const ruby = document.createElement("ruby")
    const rt = document.createElement("rt")
    rt.textContent = annotation
    const boundaryAncestors = new Set<Element>()
    for(const point of [context.range.startContainer, context.range.endContainer]) {
      let ancestor = point instanceof Element ? point : point.parentElement
      while(ancestor && ancestor !== context.block) {
        boundaryAncestors.add(ancestor)
        ancestor = ancestor.parentElement
      }
    }
    ruby.append(context.range.extractContents())
    if(fallback) {
      const open = document.createElement("rp")
      open.textContent = "("
      ruby.append(open)
    }
    ruby.append(rt)
    if(fallback) {
      const close = document.createElement("rp")
      close.textContent = ")"
      ruby.append(close)
    }
    context.range.insertNode(ruby)
    boundaryAncestors.forEach(element => {
      if(element.isConnected && !element.textContent && !element.children.length) element.remove()
    })
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  /** Replaces the text of one guarded direct rt/rp child, leaving all other ruby DOM untouched. */
  setRubyComponent(type: "rt" | "rp", index: number, expected: string, value: string) {
    if(!Number.isInteger(index) || index < 0 || typeof expected !== "string" || typeof value !== "string") return false
    const ruby = this.selectedRuby()
    if(!ruby) return false
    const component = ruby.childNodes.item(index)
    if(!(component instanceof HTMLElement)
      || component.parentElement !== ruby
      || component.localName !== type
      || component.textContent !== expected
      || component.textContent === value && component.children.length === 0) return false

    const selectionWasInside = this.selectionInside(component)
    component.replaceChildren(document.createTextNode(value))
    if(selectionWasInside) this.selectRubyBase(ruby)
    this.editor.postMarkState()
    return true
  }

  addRubyAnnotation(value = "") {
    if(typeof value !== "string") return false
    const ruby = this.selectedRuby()
    if(!ruby) return false
    const annotation = document.createElement("rt")
    annotation.textContent = value
    const children = Array.from(ruby.children)
    const lastAnnotation = [...children].reverse().find(element => element.localName === "rt")
    const closingFallback = lastAnnotation
      ? children.slice(children.indexOf(lastAnnotation) + 1).find(element => element.localName === "rp")
      : undefined
    ruby.insertBefore(annotation, closingFallback ?? null)
    this.editor.postMarkState()
    return true
  }

  removeRubyAnnotation(index: number, expected: string) {
    if(!Number.isInteger(index) || index < 0 || typeof expected !== "string") return false
    const ruby = this.selectedRuby()
    if(!ruby) return false
    const annotation = ruby.childNodes.item(index)
    if(!(annotation instanceof HTMLElement)
      || annotation.parentElement !== ruby
      || annotation.localName !== "rt"
      || annotation.textContent !== expected) return false
    if(Array.from(ruby.children).filter(element => element.localName === "rt").length === 1) {
      return this.removeRuby()
    }
    const selectionWasInside = this.selectionInside(annotation)
    annotation.remove()
    if(selectionWasInside) this.selectRubyBase(ruby)
    this.editor.postMarkState()
    return true
  }

  addRubyFallback() {
    const ruby = this.selectedRuby()
    if(!ruby || Array.from(ruby.children).some(element => element.localName === "rp")) return false
    const annotations = Array.from(ruby.children).filter(element => element.localName === "rt")
    if(!annotations.length) return false
    const open = document.createElement("rp")
    const close = document.createElement("rp")
    open.textContent = "("
    close.textContent = ")"
    ruby.insertBefore(open, annotations[0])
    annotations.at(-1)!.after(close)
    this.editor.postMarkState()
    return true
  }

  removeRubyFallback() {
    const ruby = this.selectedRuby()
    if(!ruby) return false
    const fallbacks = Array.from(ruby.children).filter(element => element.localName === "rp")
    if(!fallbacks.length) return false
    const selectionWasInside = fallbacks.some(element => this.selectionInside(element))
    fallbacks.forEach(element => element.remove())
    if(selectionWasInside) this.selectRubyBase(ruby)
    this.editor.postMarkState()
    return true
  }

  /** Removes ruby semantics while preserving the authored base subtree exactly. */
  removeRuby() {
    const ruby = this.selectedRuby()
    if(!ruby?.parentNode) return false
    const base = Array.from(ruby.childNodes).filter(node =>
      !(node instanceof HTMLElement) || node.localName !== "rt" && node.localName !== "rp",
    )
    const parent = ruby.parentNode
    const offset = Array.prototype.indexOf.call(parent.childNodes, ruby) as number
    ruby.replaceWith(...base)
    const selection = document.getSelection()
    if(selection) {
      if(base.length) {
        this.selectNodes(base)
      }
      else {
        const range = document.createRange()
        range.setStart(parent, offset)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    this.editor.postMarkState()
    return true
  }

  addMark(mark: MarkName): boolean {
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, mark, true)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(mark, true)
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.addMark(mark))
    this.assertMark(mark)
    if(!this.isMarkAllowed(mark)) return false
    if(mark === "ruby") return this.createRuby("", false)
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
      if(mark === "bdo") wrapper.setAttribute("dir", "ltr")
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

  removeMark(mark: MarkName): boolean {
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, mark, false)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(mark, false)
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.removeMark(mark))
    this.assertMark(mark)
    if(mark === "ruby") return this.removeRuby()
    const caret = this.getCaret()
    if(caret) return this.setStoredMark(mark, false, caret)
    if(!this.getState().marks.includes(mark)) return false
    return this.removeMatching(element => this.semanticMarkName(element) === mark)
  }

  toggleMark(mark: MarkName) {
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, mark)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(mark)
    this.assertMark(mark)
    if(mark === "ruby") return this.selectedRuby() ? this.removeRuby() : this.isMarkAllowed(mark) && this.createRuby("", false)
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
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, mark)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(mark)
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
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, primary, marks.length > 0)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(primary, marks.length > 0)
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
    const svg = this.svgContext()
    if(svg) return this.setSVGMark(svg, primary, true)
    if(this.editor.features.math.activeMath) return this.editor.features.math.formatMark(primary, true)
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

  /** Sets or removes one supported element-specific attribute on active mark wrappers.
   * An empty download value enables downloads without a filename; null removes it. */
  setMarkAttribute(mark: MarkName, attribute: string, value: string | null): boolean {
    const svg = this.svgContext()
    if(svg) {
      if(mark !== "a" || !isMarkAttributeName(mark, attribute)) return false
      const state = this.svgState(svg)
      if(!state.marks.includes("a")) return false
      const attributes = {...state.attributes.a}
      if(value !== null && (value || attribute === "download")) attributes[attribute] = value
      else delete attributes[attribute]
      if(svg.range.collapsed) {
        this.storeAttributes({a: attributes}, svg.selection)
        this.editor.postMarkState()
        return true
      }
      for(const slice of [...svg.text].reverse()) {
        const current = this.svgValues(slice.node).attributes.a ?? {}
        const next = {...current}
        if(value !== null && (value || attribute === "download")) next[attribute] = value
        else delete next[attribute]
        this.editSVG({...svg, text: [slice]}, {}, next)
      }
      return svg.text.length > 0
    }
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.setMarkAttribute(mark, attribute, value))
    this.assertMark(mark)
    if(!isMarkAttributeName(mark, attribute)) {
      throw new TypeError(`Unsupported attribute '${attribute}' for mark '${mark}'`)
    }
    const option = markAttributeOptionsFor(mark).find(candidate => candidate.name === attribute)
    if(value && option?.options && !option.options.some(candidate => candidate.value === value)) {
      throw new TypeError(`Unsupported value '${value}' for ${mark} ${attribute}`)
    }

    const caret = this.getCaret()
    if(caret) {
      const element = this.markElementAt(caret.range.startContainer, caret.block, mark)
      if(element) {
        if((attribute === "download" ? element.getAttribute(attribute) : element.getAttribute(attribute) ?? "") === value) return false
        this.applyMarkAttribute(element, attribute, value)
      }
      else {
        const marks = this.effectiveCaretMarks(caret)
        if(!marks.has(mark)) return false
        const attributes = this.effectiveCaretAttributes(caret)
        const markAttributes = {...(attributes[mark] ?? {})}
        if(value !== null && (value || attribute === "download")) markAttributes[attribute] = value
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
    if(elements.every(element => (attribute === "download" ? element.getAttribute(attribute) : element.getAttribute(attribute) ?? "") === value)) return false
    elements.forEach(element => this.applyMarkAttribute(element, attribute, value))
    context.block.normalize()
    this.restoreSelection(context)
    this.editor.postMarkState()
    return true
  }

  /** Sets one inline CSS property on span marks, or removes it for the default option. */
  setStyleMark(property: StyleMarkName, value: string): boolean {
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.setStyleMark(property, value))
    this.assertStyleMark(property)
    const normalizedValue = this.normalizeStyleValue(property, value)
    if(normalizedValue && !this.isMarkAllowed("span")) return false
    const svg = this.svgContext()
    if(svg) {
      if(svg.range.collapsed) {
        const styles = {...this.svgState(svg).styles}
        if(normalizedValue) styles[property] = normalizedValue
        else delete styles[property]
        this.storeStyles(styles, svg.selection)
        this.editor.postMarkState()
        return true
      }
      return this.editSVG(svg, {[property === "color" ? "fill" : property]: normalizedValue})
    }
    if(this.editor.features.math.activeMath) return this.editor.features.math.setFormatting(property, normalizedValue)
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
    const svg = this.svgContext()
    if(svg) return this.clearSVG(svg)
    const svgRoots = this.selectedSVGTextRoots()
    const removedSVG = svgRoots.length ? this.clearSelectedSVGText(svgRoots) : false
    const graphics = svgRoots.map(root => root.closest("svg")!).filter((root, index, all) => all.indexOf(root) === index && !all.some(parent => parent !== root && parent.contains(root)))
    const formulas = [...this.editor.features.math.selectedFormulas, ...graphics]
      .sort((first, second) => first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
    const removedMath = this.editor.features.math.clearFormatting() || removedSVG
    if(this.editor.features.math.activeMath) return removedMath
    if(formulas.length) {
      const selection = document.getSelection()!
      const original = selection.getRangeAt(0).cloneRange()
      const backwards = $.isBackwards
      const rest = original.cloneRange()
      const ranges: Range[] = []
      for(const formula of formulas) {
        if(!formula.contains(rest.startContainer)) {
          const before = rest.cloneRange()
          before.setEndBefore(formula)
          if(!before.collapsed) ranges.push(before)
        }
        if(formula.contains(rest.endContainer)) {
          rest.collapse(false)
          break
        }
        rest.setStartAfter(formula)
      }
      if(!rest.collapsed) ranges.push(rest)
      let changed = removedMath
      try {
        for(const range of ranges.reverse()) {
          selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
          changed = this.removeMarks() || changed
        }
      }
      finally {
        selection.setBaseAndExtent(
          backwards ? original.endContainer : original.startContainer,
          backwards ? original.endOffset : original.startOffset,
          backwards ? original.startContainer : original.endContainer,
          backwards ? original.startOffset : original.endOffset,
        )
      }
      return changed
    }
    const removedRuby = this.selectedRuby() ? this.removeRuby() : false
    const caret = this.getCaret()
    if(caret) {
      if(!this.effectiveCaretMarks(caret).size && !Object.keys(this.effectiveCaretStyles(caret)).length) return removedRuby || removedMath
      this.storeMarks(new Set(), caret.selection)
      this.storeStyles({}, caret.selection)
      this.editor.postMarkState()
      return true
    }
    if(!this.getState().marks.length && !Object.keys(this.getStyleState()).length) return removedRuby || removedMath
    return this.removeMatching(element => canonicalMarkName(element.localName) !== null) || removedRuby || removedMath
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
    if(enabled && !this.isMarkAllowed(mark)) return false
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
    if(marks.has("bdo") && !this.storedAttributes?.bdo?.dir) {
      this.storedAttributes = {
        ...(this.storedAttributes ?? {}),
        bdo: {...(this.storedAttributes?.bdo ?? {}), dir: "ltr"},
      }
    }
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
    const range = this.editor.features.graphic.textEditingRange
    if(range) {
      this.storedSelection = {anchorNode: range.startContainer, anchorOffset: range.startOffset, focusNode: range.endContainer, focusOffset: range.endOffset}
      return
    }
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
    const range = this.editor.features.graphic.textEditingRange
    if(range && range.startContainer === this.storedSelection.anchorNode && range.startOffset === this.storedSelection.anchorOffset
      && range.endContainer === this.storedSelection.focusNode && range.endOffset === this.storedSelection.focusOffset) return
    const selection = document.getSelection()
    if(selection?.anchorNode === this.storedSelection.anchorNode
      && selection.anchorOffset === this.storedSelection.anchorOffset
      && selection.focusNode === this.storedSelection.focusNode
      && selection.focusOffset === this.storedSelection.focusOffset) return
    this.clearStoredMarks()
  }

  /** Applies the explicit collapsed-caret mark set to the next typed text. */
  private handleBeforeInput(event: InputEvent) {
    const svg = this.svgContext()
    if(svg) return this.handleSVGInput(event, svg)
    if(this.editor.features.selection.isCaptureSelection) return
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
        if(value || attribute === "download") this.setMarkAttribute(mark, attribute, value)
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

  private removeMatching(matches: (element: Element) => boolean): boolean {
    if(document.getSelection()?.rangeCount && $.excludedFlowElements.length) return this.acrossFlowRanges(() => this.removeMatching(matches))
    const context = this.getSelection()
    if(!context) return false
    const originalElements = new Set(context.block.querySelectorAll("*"))
    const originalContainers = new Set<Element>()
    context.text.forEach(slice => {
      for(let element = slice.node.parentElement; element && element !== context.block; element = element.parentElement) {
        originalContainers.add(element)
      }
    })
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
    originalContainers.forEach(element => {
      if(element.isConnected && isMarkElement(element) && !this.hasContent(element)) element.remove()
    })
    Array.from(context.block.querySelectorAll("*")).reverse().forEach(element => {
      if(!originalElements.has(element) && isMarkElement(element) && !this.hasContent(element)) element.remove()
    })
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

    const before = cloneWithoutEditorMarkers(parent, false) as Element
    while(parent.firstChild && parent.firstChild !== boundary) before.append(parent.firstChild)

    const after = cloneWithoutEditorMarkers(parent, false) as Element
    while(boundary.nextSibling) after.append(boundary.nextSibling)

    if(preserveParent) {
      const selectedParent = cloneWithoutEditorMarkers(parent, false) as Element
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

    const before = cloneWithoutEditorMarkers(parent, false) as Element
    while(parent.firstChild && parent.firstChild !== boundary) before.append(parent.firstChild)

    const after = cloneWithoutEditorMarkers(parent, false) as Element
    while(boundary.nextSibling) after.append(boundary.nextSibling)

    const selected = cloneWithoutEditorMarkers(parent, false) as Element
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

  private rubyAt(node: Node | null) {
    let element = node instanceof Element ? node : node?.parentElement
    while(element && element !== document.body) {
      if(element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.localName === "ruby") return element
      element = element.parentElement
    }
    return null
  }

  /** Resolves only one ruby element; selections spanning separate ruby runs are deliberately ambiguous. */
  private selectedRuby() {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return null
    if(selection.anchorNode === selection.focusNode && selection.anchorNode instanceof Element
      && Math.abs(selection.anchorOffset - selection.focusOffset) === 1) {
      const index = Math.min(selection.anchorOffset, selection.focusOffset)
      const selected = selection.anchorNode.childNodes.item(index)
      if(selected instanceof HTMLElement && selected.localName === "ruby") return selected
    }
    const anchor = this.rubyAt(selection.anchorNode)
    const focus = this.rubyAt(selection.focusNode)
    return anchor && anchor === focus ? anchor : null
  }

  private selectionContainsRuby(context: MarkSelection) {
    if(context.text.some(({node}) => this.rubyAt(node) !== null)) return true
    const walker = document.createTreeWalker(context.block, NodeFilter.SHOW_ELEMENT)
    while(walker.nextNode()) {
      const element = walker.currentNode as Element
      if(element.namespaceURI === "http://www.w3.org/1999/xhtml"
        && element.localName === "ruby"
        && context.range.intersectsNode(element)) return true
    }
    return false
  }

  private selectionInside(element: Element) {
    const selection = document.getSelection()
    return !!selection?.anchorNode && element.contains(selection.anchorNode)
      || !!selection?.focusNode && element.contains(selection.focusNode)
  }

  private selectRubyBase(ruby: Element) {
    const base = Array.from(ruby.childNodes).filter(node =>
      !(node instanceof HTMLElement) || node.localName !== "rt" && node.localName !== "rp",
    )
    const selection = document.getSelection()
    if(!selection) return
    if(base.length) {
      this.selectNodes(base)
    }
    else {
      const range = document.createRange()
      range.selectNodeContents(ruby)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  private selectNodes(nodes: Node[]) {
    const textNodes: Text[] = []
    for(const node of nodes) {
      if(node instanceof Text) {
        textNodes.push(node)
        continue
      }
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      while(walker.nextNode()) textNodes.push(walker.currentNode as Text)
    }
    const selection = document.getSelection()
    if(!selection) return
    if(textNodes.length) {
      const last = textNodes.at(-1)!
      selection.setBaseAndExtent(textNodes[0], 0, last, last.length)
      return
    }
    const range = document.createRange()
    range.setStartBefore(nodes[0])
    range.setEndAfter(nodes.at(-1)!)
    selection.removeAllRanges()
    selection.addRange(range)
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
        options.filter(option => option.name !== "download" || element.hasAttribute("download")).map(option => [option.name, element.getAttribute(option.name) ?? ""]),
      )
    }
    return attributes
  }

  private cloneAttributeValues(attributes: MarkAttributeValues) {
    return Object.fromEntries(
      Object.entries(attributes).map(([mark, values]) => [mark, {...values}]),
    ) as MarkAttributeValues
  }

  private applyMarkAttribute(element: Element, attribute: string, value: string | null) {
    if(value !== null && (value || attribute === "download")) element.setAttribute(attribute, value)
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

  /** Apply a formatting command to the native range's independent flow runs.
   * Keep excluded nodes connected and restore the live enclosing selection. */
  private acrossFlowRanges(command: () => boolean): boolean {
    const selection = document.getSelection()!
    const original = selection.getRangeAt(0).cloneRange()
    const backwards = $.isBackwards
    const ranges = $.flowRanges
    let changed = false
    try {
      for(const range of ranges.reverse()) {
        selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
        changed = command() || changed
      }
    }
    finally {
      selection.setBaseAndExtent(
        backwards ? original.endContainer : original.startContainer,
        backwards ? original.endOffset : original.startOffset,
        backwards ? original.startContainer : original.endContainer,
        backwards ? original.startOffset : original.endOffset,
      )
    }
    return changed
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

    // Inspect the selected live elements directly. Cloning can invoke custom
    // element constructors, while a mark command only needs to reject blocks,
    // replaced content, SVG/MathML, and empty atomic phrasing elements.
    const walker = document.createTreeWalker(startBlock, NodeFilter.SHOW_ELEMENT)
    while(walker.nextNode()) {
      const element = walker.currentNode as Element
      if(!$.includesNode(element) || !range.intersectsNode(element)) continue
      if(element.namespaceURI !== "http://www.w3.org/1999/xhtml"
        || !this.editor.schema.isPhrasing(element)
        || !element.textContent
          && canonicalMarkName(element.localName) === null
          && !this.editor.schema.findValidContentTypes(element).includes("#text")) return null
    }

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
      if(this.editor.schema.isBlock(current) && !isSectionElement(current)) break
      current = current.parentElement
    }
    return current instanceof Element && this.editor.schema.isBlock(current) && !isSectionElement(current)? current: null
  }

  private selectedText(range: Range, block: Element) {
    const slices: TextSlice[] = []
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    while(walker.nextNode()) {
      const node = walker.currentNode as Text
      if(block.namespaceURI !== SVG_NAMESPACE && !$.includesNode(node) || !range.intersectsNode(node)) continue

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
    return textOffsetIn(block, node, offset)
  }

  private textPoint(block: Element, offset: number): [Node, number] {
    return textPointAtOffset(block, offset)
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
    if(event.defaultPrevented || this.editor.features.selection.isCaptureSelection && !this.isSVGTextSelection) return
    // Option can transform event.key into a symbol on macOS. Prefer the
    // physical letter code so the displayed Option+Shift shortcut still
    // works, then fall back for synthetic and older keyboard events.
    const key = /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3).toLowerCase()
      : event.key.toLowerCase()
    const option = primaryMarkOptions.find(candidate => candidate.shortcutKey === key)
    const standard = Boolean(option && hasStandardMarkShortcut(option)
      && modifierKeyDown(event) && !event.altKey && !event.shiftKey)
    const legacy = Boolean(option && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey)
    if(!option || excludedMarkNames.includes(option.name) || !standard && !legacy || !this.getState().canMark) return

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
