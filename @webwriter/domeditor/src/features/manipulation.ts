import { DocumentListenerMap, EditorFeature } from "."
import { $, focusedWidgetHost, markWidgetsEditable, modifierKeyDown, getContainer, getIndexBefore, getSidesOfPoint, htmlToFragment, isElement } from "../utility"
import {isMarkElement} from "../marks"
import type {ElementStyleDeclaration, ElementStyleMutation, ElementStyleState} from "../editor-bridge"

/** Unit by which a collapsed selection is extended before deleting. */
type Granularity = "character" | "word" | "line" | "block"

function isCaretAtBoundary(element: Element, boundary: "start" | "end") {
  const selection = document.getSelection()
  if(!selection?.isCollapsed || !selection.anchorNode) {
    return false
  }
  let node: Node | null = selection.anchorNode
  let offset = selection.anchorOffset
  while(node && node !== element) {
    if(!element.contains(node)) {
      return false
    }
    const parent = node.parentNode
    if(!parent) {
      return false
    }
    const index = Array.from(parent.childNodes).indexOf(node)
    if(boundary === "start") {
      if(offset !== 0 || Array.from(parent.childNodes).slice(0, index).some(sibling => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    else {
      const length = node instanceof Text? node.length: node.childNodes.length
      if(offset !== length || Array.from(parent.childNodes).slice(index + 1).some(sibling => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    node = parent
    offset = boundary === "start"? index: index + 1
  }
  return node === element && offset === (boundary === "start"? 0: element.childNodes.length)
}

/** Editing feature implementing content manipulation: inserting, deleting,
 * wrapping and lifting nodes, clipboard interaction (copy/cut/paste), and
 * setting attributes or styles on the selected elements. All operations work
 * on the current selection (see `EditingSelection`/`$`). */
export class ManipulationFeature extends EditorFeature {

  /** The single connected authored element targeted by element-style commands.
   * Resolve this immediately before every read or mutation: retained selection
   * endpoints may have been replaced by native, widget, or remote DOM edits.
   * With no authored selection, BODY is the document-wide styling target. */
  get styleTarget(): Element {
    const body = document.body
    const inAuthoredBody = (element: Element | null | undefined): element is Element => Boolean(
      element?.isConnected && (element === body || body.contains(element)),
    )

    const selectedTable = this.editor.features.table.hasCellSelection
      ? this.editor.features.table.selectedTable
      : null
    if(inAuthoredBody(selectedTable)) return selectedTable

    const captured = this.editor.features.selection.captureSelectedElement
    if(inAuthoredBody(captured)) return captured

    const focusedWidget = focusedWidgetHost()
    if(inAuthoredBody(focusedWidget)) return focusedWidget

    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode || selection.rangeCount === 0) return body
    const selectedElement = $.selectedElement
    if(inAuthoredBody(selectedElement)) return selectedElement
    const inBody = (node: Node) => node === body || body.contains(node)
    const range = selection.getRangeAt(0)
    if(!inBody(selection.anchorNode) || !inBody(selection.focusNode)) {
      // A live selection outside authored content is equivalent to having no
      // document selection for element styling.
      return body
    }

    const common = range.commonAncestorContainer
    if(common === document || common === document.documentElement) return body
    const container = getContainer(common)
    return inAuthoredBody(container)? container: body
  }

  private inlineStyleOf(element: Element | null): CSSStyleDeclaration | null {
    const style = (element as (Element & {style?: CSSStyleDeclaration}) | null)?.style
    return style && typeof style.setProperty === "function"? style: null
  }

  /** Returns authored declarations and the requested computed values without
   * retaining or exposing a live CSSStyleDeclaration across the editor bridge. */
  getStyleState(properties: string[] = []): ElementStyleState {
    const target = this.styleTarget
    const style = this.inlineStyleOf(target)
    if(!target || !style) {
      return {
        target: null,
        inline: {},
        computed: {},
        context: {display: "", parentDisplay: ""},
      }
    }

    const inline: Record<string, ElementStyleDeclaration> = {}
    for(let index = 0; index < style.length; index++) {
      const name = style.item(index)
      inline[name] = {
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name) === "important"? "important": "",
      }
    }
    const requested = Array.from(new Set(properties.filter(name => typeof name === "string" && name.trim())))
    const computedStyle = getComputedStyle(target)
    const computed = Object.fromEntries(requested.map(name => [name, computedStyle.getPropertyValue(name)]))
    const parentDisplay = target.parentElement? getComputedStyle(target.parentElement).display: ""
    return {
      target: {localName: target.localName, namespaceURI: target.namespaceURI},
      inline,
      computed,
      context: {display: computedStyle.display, parentDisplay},
    }
  }

  /** Materializes the virtual insertion point used for an empty document or
   * an element gap as a real schema-conformant text block. Returns the block
   * when one was created and null for an ordinary editing selection. */
  ensureTextBlock() {
    return $.isGapSelection || $.isEmptyDocumentSelection
      ? this.insertTextBlockAtSelection() ?? null
      : null
  }

  /** Runs a command and normalizes both the command's original surroundings
   * and the surroundings of the resulting selection. */
  private withNormalization<T>(command: () => T) {
    const selection = document.getSelection()
    const originalNodes = [selection?.anchorNode, selection?.focusNode]
    try {
      return command()
    }
    finally {
      this.editor.normalizeSurroundingElements(...originalNodes)
    }
  }

  /** Inserts a new element at an empty-document or gap selection, choosing
   * the default node when allowed and otherwise the first schema-conformant
   * element. */
  private insertTextBlockAtSelection() {
    const container = getContainer($.range.startContainer)
    const index = Math.max(0, getIndexBefore($.range) + 1)
    const validTypes = this.editor.schema.findValidTypesToInsert()
    const candidateTypes = [
      this.editor.schema.defaultNodeKey,
      ...validTypes.filter(type => type !== this.editor.schema.defaultNodeKey),
    ].filter(type => !type.startsWith("#") && validTypes.includes(type))
    const type = candidateTypes.find(type => {
      const element = this.editor.schema.create(type)
      return this.editor.schema.canInsert(container, element, index)
    })
    if(!type) {
      return
    }
    const element = this.editor.schema.create(type)
    return this.withNormalization(() => {
      $.replace(element)
      $.move(element)
      return element
    })
  }

  /** Replaces the current selection with nodes and leaves the caret at the
   * end of the inserted content without splitting its containing block. */
  private insertAtSelection(...nodes: Node[]) {
    if(!nodes.length) return
    return this.withNormalization(() => {
      $.replace(...nodes)
      const last = nodes.at(-1)!
      if(last instanceof Text || isElement(last) && this.editor.schema.findValidContentTypes(last).includes("#text")) {
        $.move(last, -1)
      }
      else if(last.parentNode) {
        $.move(last.parentNode, Array.from(last.parentNode.childNodes).indexOf(last as ChildNode) + 1)
      }
    })
  }

  /** Inserts clipboard content at a virtual body/gap position. Inline-only
   * content is placed in a text block; block content remains at the gap. */
  private insertClipboardFragment(fragment: DocumentFragment) {
    const nodes = Array.from(fragment.childNodes)
    if(!nodes.length) return
    const isVirtualSelection = $.isGapSelection || $.isEmptyDocumentSelection
    if(!isVirtualSelection) {
      this.insert(fragment)
      return
    }
    const isInlineContent = nodes.every(node => this.editor.schema.isPhrasing(node))
    if(isInlineContent && !this.ensureTextBlock()) {
      return
    }
    this.insertAtSelection(...nodes)
  }

  private firstTextDescendant(node: Node): Text | null {
    if(node instanceof Text) return node
    for(const child of Array.from(node.childNodes)) {
      const text = this.firstTextDescendant(child)
      if(text) return text
    }
    return null
  }

  /** Places the caret at a node's logical text start, descending through mark
   * wrappers so typing retains the formatting at a split or join boundary. */
  private moveToStart(node: Node) {
    const text = this.firstTextDescendant(node)
    $.move(text ?? node, 0)
  }

  /** Promotes a DOM point through nested mark wrappers to an offset in the
   * containing non-mark element, splitting text and marks only when the point
   * is actually inside them. */
  private splitTextLikePoint(container: Element, range = $.range) {
    let pointNode: Node = range.startContainer
    let pointOffset = range.startOffset

    if(pointNode instanceof Text) {
      const parent = pointNode.parentElement
      if(!parent) throw new TypeError("Cannot split a detached text selection")
      const index = Array.from(parent.childNodes).indexOf(pointNode)
      if(pointOffset === 0) {
        pointOffset = index
      }
      else if(pointOffset === pointNode.length) {
        pointOffset = index + 1
      }
      else {
        const right = pointNode.splitText(pointOffset)
        pointOffset = Array.from(parent.childNodes).indexOf(right)
      }
      pointNode = parent
    }

    while(pointNode !== container) {
      if(!isElement(pointNode) || !isMarkElement(pointNode)) {
        throw new TypeError("A text-like split may only cross mark elements")
      }
      const parent = pointNode.parentElement
      if(!parent) throw new TypeError("Cannot split a detached mark selection")
      const index = Array.from(parent.childNodes).indexOf(pointNode)
      if(pointOffset === 0) {
        pointOffset = index
      }
      else if(pointOffset === pointNode.childNodes.length) {
        pointOffset = index + 1
      }
      else {
        const right = pointNode.cloneNode(false) as Element
        right.append(...Array.from(pointNode.childNodes).slice(pointOffset))
        pointNode.after(right)
        pointOffset = Array.from(parent.childNodes).indexOf(right)
      }
      pointNode = parent
    }
    return pointOffset
  }

  /** Clones a root and maps a range into the clone so schema-sensitive
   * commands can be tried without changing the authored document. */
  private cloneRangeIn(root: Element, range: Range) {
    const pathFromRoot = (node: Node) => {
      const path: number[] = []
      while(node !== root) {
        const parent = node.parentNode
        if(!parent) return null
        const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
        if(index < 0) return null
        path.push(index)
        node = parent
      }
      return path.reverse()
    }
    const startPath = pathFromRoot(range.startContainer)
    const endPath = pathFromRoot(range.endContainer)
    if(!startPath || !endPath) return null

    const clonedRoot = root.cloneNode(true) as Element
    const resolve = (path: number[]) => path.reduce<Node | null>(
      (node, index) => node?.childNodes.item(index) ?? null,
      clonedRoot,
    )
    const start = resolve(startPath)
    const end = resolve(endPath)
    if(!start || !end) return null

    const clonedRange = document.createRange()
    try {
      clonedRange.setStart(start, range.startOffset)
      clonedRange.setEnd(end, range.endOffset)
    }
    catch {
      return null
    }
    return {root: clonedRoot, range: clonedRange}
  }

  /** Applies the structural part of a split to any range, returning every
   * element whose content model may have changed. */
  private splitRange(range: Range, splitDepth: number, strict: boolean) {
    let container = getContainer(range.startContainer)
    let offset = this.splitTextLikePoint(container, range)
    let target: Element | null = null
    const affected = new Set<Element>()
    const splittingSummary = container.matches("summary")
    if(splittingSummary) splitDepth = 0

    for(let depth = 0; depth <= splitDepth; depth++) {
      if(container.nodeName === "BODY" || container.nodeName === "HTML") break
      const parent = container.parentElement
      if(!parent) break
      const schema = this.editor.schema.get(container)
      const next = (splittingSummary || strict && schema.inseperable
        ? this.editor.schema.create()
        : container.cloneNode(false)) as Element
      container.after(next)
      const moving = Array.from(container.childNodes).slice(offset)
      this.editor.features.list.prepareSplitContinuation(container, next, moving)
      next.append(...moving)
      affected.add(container)
      affected.add(next)
      affected.add(parent)
      target ??= next

      offset = Array.from(parent.childNodes).indexOf(next)
      container = parent
    }

    return {affected, target}
  }

  /** Checks both split halves and their changed parents against the schema by
   * executing the exact operation on a detached clone. */
  private canSplitAtSelection(splitDepth: number, strict: boolean) {
    const simulation = this.cloneRangeIn(document.body, $.range)
    if(!simulation) return false
    try {
      simulation.range.deleteContents()
      const {affected, target} = this.splitRange(simulation.range, splitDepth, strict)
      return Boolean(target)
        && Array.from(affected).every(element => this.editor.schema.isContentValid(element))
    }
    catch {
      return false
    }
  }

  /** Returns the requested schema-valid split depth. A parent split falls
   * back to splitting only the current element. */
  private allowedSplitDepth(splitDepth: number, strict: boolean) {
    if(this.canSplitAtSelection(splitDepth, strict)) return splitDepth
    if(splitDepth > 0 && this.canSplitAtSelection(0, strict)) return 0
    return null
  }

  /** Whether replacing the current selection with a node leaves its immediate
   * content model valid. Transparent mark content resolves through its parent. */
  private canInsertAtSelection(node: Node) {
    const container = getContainer($.range.startContainer)
    const simulation = this.cloneRangeIn(container, $.range)
    if(!simulation) return false
    try {
      simulation.range.deleteContents()
      const inserted = node.cloneNode(true)
      simulation.range.insertNode(inserted)
      return Boolean(inserted.parentElement)
        && this.editor.schema.isContentValid(inserted.parentElement!)
    }
    catch {
      return false
    }
  }

  /** Inserts a break only when it is valid at the current selection. */
  private insertBreak(type: "br" | "wbr") {
    this.ensureTextBlock()
    const element = document.createElement(type)
    if(this.canInsertAtSelection(element)) this.insertAtSelection(element)
  }

  /** Splits the logical block at the current caret and, for a deeper split,
   * promotes the split through its ancestors. The first right-hand block is
   * retained as the editing target. */
  private splitAtSelection(splitDepth: number, strict: boolean) {
    const {target} = this.splitRange($.range, splitDepth, strict)

    if(target) {
      this.moveToStart(target)
      const details = target.closest("details") as HTMLDetailsElement | null
      if(details && !target.matches("summary")) details.open = true
    }
  }

  /** Action handlers, addressable by action type through the editor. */
  actions = {
    insert: ({html, strict}: {type: "insert", html: string, strict?: boolean}) => {
      const frag = htmlToFragment(html)
      this.insert(frag, 0, strict)
    },
    delete: ({direction}: {type: "delete", direction?: "forward" | "backward"}) => {
      this.delete(direction)
    },
    wrap: ({wrapper}: {type: "wrap", wrapper: string}) => {
      this.wrap(htmlToFragment(wrapper))
    },
    lift: ({}: {type: "lift"}) => {
      this.lift()
    },
    copy: ({}: {type: "copy"}) => {
      return this.copy()
    },
    cut: ({}: {type: "cut"}) => {
      return this.cut()
    },
    paste: ({}: {type: "paste"}) => {
      return this.paste()
    },
    setAttributes: ({attrs}: {type: "setAttributes", attrs: Record<string, string>}) => {
      this.setAttributes(attrs)
    },
    getStyleState: ({properties}: {type: "getStyleState", properties?: string[]}) => {
      if(properties !== undefined && (!Array.isArray(properties) || properties.some(name => typeof name !== "string"))) {
        throw new TypeError("Style-state property names must be strings")
      }
      return this.getStyleState(properties)
    },
    setStyle: ({styles}: {type: "setStyle", styles: Record<string, ElementStyleMutation>}) => {
      this.setStyle(styles)
    },

  } as const

  /** Keyboard and input behavior: Enter splits the containing block
   * (Alt: <br>, Alt+Shift: <wbr>, modifier: split the parent), Backspace and
   * Delete remove by granularity (plain: character, Alt: word, modifier:
   * block, Alt+modifier: line), Tab wraps into the previous element and
   * Shift+Tab lifts. */
  activeListeners: DocumentListenerMap = {
    "beforeinput": ev => {
      const summary = $.anchorContainer?.closest("summary")
      if(ev.inputType === "insertParagraph" && summary?.parentElement?.matches("details")) {
        ev.preventDefault()
        this.insert()
        return
      }
      if(ev.inputType === "insertLineBreak") {
        ev.preventDefault()
        this.insertBreak("br")
        return
      }

      const isVirtualSelection = $.isGapSelection || $.isEmptyDocumentSelection
      if(!isVirtualSelection) return

      if(ev.inputType === "insertParagraph") {
        ev.preventDefault()
        this.insert()
      }
      else if(["insertText", "insertReplacementText"].includes(ev.inputType) && ev.data !== null) {
        const target = this.ensureTextBlock()
        if(target) {
          ev.preventDefault()
          this.insertAtSelection(document.createTextNode(ev.data))
        }
      }
      else if(["insertFromPaste", "insertFromDrop"].includes(ev.inputType)) {
        const fragment = this.#dataTransferToFragment(ev.dataTransfer)
        if(fragment) {
          ev.preventDefault()
          this.insertClipboardFragment(fragment)
        }
        else {
          this.ensureTextBlock()
        }
      }
      else if(ev.inputType.startsWith("insert")) {
        this.ensureTextBlock()
      }
    },
    "compositionstart": () => {
      this.ensureTextBlock()
    },
    "paste": ev => {
      if(!$.isGapSelection && !$.isEmptyDocumentSelection) return
      const fragment = this.#dataTransferToFragment(ev.clipboardData)
      if(fragment) {
        ev.preventDefault()
        this.insertClipboardFragment(fragment)
      }
      else {
        this.ensureTextBlock()
      }
    },
    "keydown": ev => {
      if(this.editor.features.transformation.target) {
        return
      }
      const isAltGraph = ev.getModifierState("AltGraph")
      const isPrintable = ev.key.length === 1 && !ev.metaKey && (!ev.ctrlKey || isAltGraph)
      if(!ev.defaultPrevented && isPrintable) {
        this.ensureTextBlock()
      }
      if(ev.key === "Enter") {
        ev.preventDefault()
        if(ev.altKey && ev.shiftKey) {
          this.insertBreak("wbr")
        }
        else if(ev.altKey) {
          this.insertBreak("br")
        }
        else if(modifierKeyDown(ev)) {
          this.insert(undefined, 1)
        }
        else {
          this.insert(undefined, 0)
        }
      }

      else if(ev.key === "Backspace") {
        ev.preventDefault()
        if(ev.altKey && modifierKeyDown(ev)) {
          this.delete("backward", "line")
        }
        else if(ev.altKey) {
          this.delete("backward", "word")
        }
        else if(modifierKeyDown(ev)) {
          this.delete("backward", "block")
        }
        else {
          this.delete("backward", "character")
        }
      }

      else if(ev.key === "Delete") {
        ev.preventDefault()
        if(ev.altKey && modifierKeyDown(ev)) {
          this.delete("forward", "line")
        }
        else if(ev.altKey) {
          this.delete("forward", "word")
        }
        else if(modifierKeyDown(ev)) {
          this.delete("forward", "block")
        }
        else {
          this.delete("forward", "character")
        }
      }

      else if(ev.key === "Tab") {
        ev.preventDefault()
        if(ev.shiftKey) {
          this.lift(1)
        }
        else {
          this.wrap()
        }
      }
    }
  }

  /** Inserts `node` at the selection, replacing the selected content. Without
   * `node`, splits the containing block at the caret (Enter behavior).
   * `splitDepth` is the number of additional ancestor levels to split (0 means
   * one split); <body> and <html> are never split. Splitting continues the
   * container as a clone — with `strict`, inseperable containers (e.g.
   * headings) continue as a new default node (<p>) instead. */
  insert(node?: Node, splitDepth=0, strict=false) {
    if(!node && this.ensureTextBlock()) {
      return
    }
    if(!node) {
      const allowedDepth = this.allowedSplitDepth(splitDepth, strict)
      if(allowedDepth === null) return
      return this.withNormalization(() => {
        $.delete()
        this.splitAtSelection(allowedDepth, strict)
      })
    }
    const insertedWidget = this.insertedWidget(node)
    if(node) markWidgetsEditable(node)
    if(insertedWidget && !this.editor.schema.isPhrasing(insertedWidget)
      && !this.canInsertAtSelection(insertedWidget)) {
      return this.withNormalization(() => this.insertBlockWidget(insertedWidget))
    }
    return this.withNormalization(() => {
      if(true) {
        $.replace(node)
        let locus = $.commonAncestor
        for(let i = 0; i <= splitDepth; i++) {
          $.start instanceof Text && $.start.splitText($.startOffset)
          let container = getContainer(locus)
          if(container.nodeName === "BODY" || container.nodeName === "HTML") {continue}
          const [,right] = getSidesOfPoint($.range)
          const schema = this.editor.schema.get(container)
          const next = (strict && schema.inseperable? this.editor.schema.create(): container.cloneNode()) as Element
          container.after(next)
          next.append(...right)
          node? $.move(node, -1): $.move(next, 0)
        }
        if(insertedWidget?.isConnected) {
          $.selectElement(insertedWidget)
          this.editor.features.selection.processSelection()
        }
        return
      }
    }/*
      else if(node) {
        this.#smartInsert(node)
      }*/)
  }

  /** Deletes content at the selection. A selection in an empty container
   * removes that container (the caret moves to the previous node). A collapsed
   * selection is first extended by `granularity` in `direction` ("block"
   * extends to the container start; the others use `Selection.modify`). A
   * caret in the gap between two elements merges them: backward moves the
   * following element's content into the preceding element, forward the
   * reverse. At the document boundaries, Backspace/Delete move the caret to
   * the end/start of the adjacent block. */
  delete(direction?: "forward" | "backward", granularity:Granularity="character", strict=false) {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.deleteSelection()
    return this.withNormalization(() => {
      if($.isGapSelection && direction === "backward" && !$.elementAfter && $.elementBefore) {
        $.move($.elementBefore, -1)
        return
      }
      if($.isGapSelection && direction === "forward" && !$.elementBefore && $.elementAfter) {
        $.move($.elementAfter)
        return
      }
      const container = $.anchorContainer
      if(direction === "backward" && container?.textContent && isCaretAtBoundary(container, "start") && container.previousElementSibling && !container.previousElementSibling.textContent) {
        container.previousElementSibling.remove()
        return
      }
      if(direction === "forward" && container?.textContent && isCaretAtBoundary(container, "end") && container.nextElementSibling && !container.nextElementSibling.textContent) {
        container.nextElementSibling.remove()
        return
      }
      const commonContainer = getContainer($.commonAncestor)
      if(!commonContainer.textContent && !["HTML", "BODY"].includes(commonContainer.nodeName)) {
        const emptyContainer = commonContainer
        const previous = emptyContainer.previousSibling
        const next = emptyContainer.nextSibling
        $.delete()
        emptyContainer.remove()
        if(direction === "forward" && next) {
          $.move(next)
        }
        else if(previous) {
          $.move(previous, -1)
        }
        else if(next) {
          $.move(next)
        }
        else {
          $.move(document.body)
        }
        return
      }
      else if($.isEmpty && !$.isGapSelection) {
        granularity === "block"? $.extend($.anchorContainer!, 0): $.extendBy(granularity, direction)
        $.delete()
      }
      else {
        $.delete()
      }
      if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "backward") {
        const {elementBefore, elementAfter} = $
        if(!elementBefore.textContent) {
          elementBefore.remove()
          $.selectGap(elementAfter, "before")
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementBefore.append(...elementAfter.childNodes)
          if(joinTarget) this.moveToStart(joinTarget)
          elementBefore.normalize()
          elementAfter.remove()
        }
      }
      else if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "forward") {
        const {elementBefore, elementAfter} = $
        if(!elementAfter.textContent) {
          elementAfter.remove()
          $.selectGap(elementBefore)
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementAfter.prepend(...elementBefore.childNodes)
          if(joinTarget) this.moveToStart(joinTarget)
          elementAfter.normalize()
          elementBefore.remove()
        }
      }
    })
  }

  /** Wraps the selection. Given a `wrapping` element (or a fragment, whose
   * first element is used), it wraps a copy of the selected content, replaces
   * the selection and is returned. Without an argument (Tab behavior), the
   * anchor's container element is moved into the adjacent element (preferring
   * the previous one), which is returned — or undefined if there is none.
   * No schema validation is performed. */
  wrap(wrapping?: DocumentFragment | Element, strict=false) {
    return this.withNormalization(() => {
      if(wrapping) {
        const wrapper = wrapping instanceof DocumentFragment? wrapping.firstElementChild!: wrapping
        wrapper.append($.slice)
        $.replace(wrapper)
        return wrapper
      }
      else {
        const wrapper = $.elementBefore ?? $.elementAfter
        if(!wrapper) {
          return
        }
        if($.anchorContainer) wrapper.append($.anchorContainer)
        return wrapper
      }
    })
  }

  /** Lifts the selected element (or the element containing the caret) out of
   * its container, `depth` levels up, splitting the container around it when
   * it has siblings. Schema-validated: does nothing when no valid lift target
   * exists (see Schema.getLiftTarget). */
  lift(depth=1, strict=false) {
    return this.withNormalization(() => {
      const node = $.selectedElement ?? $.anchorContainer
      if(!node) {
        return
      }
      for(let i = 0; i < depth; i++) {
        const target = this.editor.schema.getLiftTarget(node)
        if(!target) {
          return
        }
        const [liftDepth, replacement] = target
        let toReplace = node.parentElement!
        for(let j = 1; j < liftDepth && toReplace.parentElement; j++) {
          toReplace = toReplace.parentElement
        }
        toReplace.replaceWith(...replacement)
      }
      $.selectElement(node)
    })
  }

  /** Writes the selected content to the clipboard as text/html and text/plain.
   * Currently requires the selection to contain an element — plain text
   * selections throw. */
  async copy() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.copy()
    const item = this.#fragmentToClipboardItem($.copy())
    navigator.clipboard.write([item])
  }

  /** Like copy(), but also removes the selected content from the document.
   * Currently the content is removed even if writing to the clipboard fails
   * (e.g. for plain text selections). */
  async cut() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.cut()
    return this.withNormalization(() => {
      const item = this.#fragmentToClipboardItem($.cut())
      return navigator.clipboard.write([item])
    })
  }

  /** Inserts the clipboard's HTML or plain-text content at the selection.
   * Inline content at an empty document or gap is wrapped in a text block. */
  async paste() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.paste()
    const fragment = await this.#clipboardToFragment()
    this.insertClipboardFragment(fragment)
  }

  /** Sets the given attributes on every element in the selection (see
   * `EditingSelection.nodesBetween`); a null value removes the attribute. */
  setAttributes(attrs: Record<string, string | null>) {
    return this.withNormalization(() => {
      $.nodesBetween.filter(isElement).forEach(n => Object.keys(attrs).forEach(k => attrs[k]? n.setAttribute(k, attrs[k]): n.removeAttribute(k)))
    })
  }

  /** Assigns inline style properties on the single live style target, merging
   * with existing declarations. Null or an empty string clears a property. */
  setStyle(styles: Record<string, ElementStyleMutation>) {
    return this.withNormalization(() => {
      const targetStyle = this.inlineStyleOf(this.styleTarget)
      if(!targetStyle) return
      Object.entries(styles).forEach(([name, mutation]) => {
        if(!name || name !== name.trim() || name.includes(";")) {
          throw new TypeError(`Invalid CSS property name '${name}'`)
        }
        if(mutation === null || mutation === "") {
          targetStyle.removeProperty(name)
          return
        }
        const declaration = typeof mutation === "string"
          ? {value: mutation, priority: "" as const}
          : mutation
        if(!declaration || typeof declaration.value !== "string"
          || declaration.priority !== "" && declaration.priority !== "important") {
          throw new TypeError(`Invalid CSS declaration for '${name}'`)
        }
        targetStyle.setProperty(name, declaration.value, declaration.priority)
      })
    })
  }

  /** Replaces the selection's container with `el`, moving the children over
   * and selecting `el`. Refuses to replace <html> or <body>. */
  #replaceParent(el: Element) {
    const parent = getContainer($.commonAncestor)
    if(parent?.tagName === "HTML" || parent?.tagName === "BODY") {
      throw TypeError("Cannot replace <html> or <body>")
    }
    el.append(...Array.from(parent?.childNodes ?? []))
    parent?.replaceWith(el)
    $.selectElement(el)
  }

  /** Converts a fragment into a ClipboardItem with a text/html (outer HTML) and a text/plain (inner text) flavor. Expects the fragment to contain an element. */
  #fragmentToClipboardItem(fragment: DocumentFragment) {
    return new ClipboardItem({
      "text/plain": fragment.textContent,
      "text/html": fragment.firstElementChild? fragment.firstElementChild!.outerHTML: fragment.textContent
    })
  }

  /** Parses HTML preferentially and otherwise preserves clipboard text as a
   * text node, so text containing markup characters is never interpreted as
   * HTML. */
  #clipboardContentToFragment(html: string, text: string) {
    if(html) {
      return htmlToFragment(html)
    }
    const fragment = document.createDocumentFragment()
    if(text) fragment.append(document.createTextNode(text))
    return fragment
  }

  /** Reads clipboard data available synchronously on paste/beforeinput. */
  #dataTransferToFragment(data: DataTransfer | null) {
    if(!data) return null
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    return html || text? this.#clipboardContentToFragment(html, text): null
  }

  /** Reads the first available HTML or plain-text item from the async
   * clipboard API. */
  async #clipboardToFragment() {
    const items = await navigator.clipboard.read()
    const htmlItem = items.find(item => item.types.includes("text/html"))
    const textItem = items.find(item => item.types.includes("text/plain"))
    const html = htmlItem? await (await htmlItem.getType("text/html")).text(): ""
    const text = !html && textItem? await (await textItem.getType("text/plain")).text(): ""
    return this.#clipboardContentToFragment(html, text)
  }

  /** Schema-aware insertion (currently unused by insert()): depending on what the schema allows, replaces the parent, splits the container, inserts in place or wraps the insertee. */
  #smartInsert(node: Node) {
    const container = $.commonAncestor instanceof Element? $.commonAncestor: $.commonAncestor.parentElement
    const siblings = Array.from(container?.childNodes ?? [])
    const insertee = node instanceof DocumentFragment
      ? node.firstElementChild
      : node as Element
    if(!insertee) {
      throw TypeError("Invalid fragment: Must have a root element")
    }
    if(!container) {
      throw Error("Invalid selection")
    }
    const inserteeType = this.editor.schema.get(insertee)
    const index = 0
    
    const isVoid = !inserteeType.content
    const isValidContainer = this.editor.schema.canWrap(insertee, siblings) && this.editor.schema.canReplace(container, insertee)
    const isValidInPlace = this.editor.schema.canInsert(container, insertee, index, index + 1)
    const isValidSplitter = this.editor.schema.canSplit(container, insertee)
    console.log(isVoid, isValidContainer, isValidInPlace, isValidSplitter)
    if($.isEmpty) {
      if(!isVoid && isValidContainer) {
        this.#replaceParent(insertee)
      }
      else if(!isValidInPlace && !isValidContainer && isValidSplitter) {
        this.insert(insertee, 1)
      }
      else if(isValidInPlace) {
        this.insert(node) 
      }
    }
    else {
      if(isVoid && isValidInPlace) {
        this.insert(node)
      }
      else if(!isValidInPlace && isValidSplitter) {
        this.insert(insertee, 1)
      }
      else if(isValidInPlace) {
        const wrapped = this.wrap(insertee)
        this.editor.schema.fixInvalidContent(wrapped!)
      }
    }
  }

  private insertedWidget(node: Node) {
    const element = node instanceof DocumentFragment && node.childNodes.length === 1
      ? node.firstChild
      : node
    if(!isElement(element)) return null
    const schemaGroups = this.editor.schema.get(element).group ?? []
    return element.localName.includes("-") || element.hasAttribute("is") || schemaGroups.includes("widget")
      ? element
      : null
  }

  /** Inserts a block widget beside the surrounding text block. A native range
   * insertion would otherwise put it inside e.g. a paragraph, whose content
   * model only permits phrasing content. */
  private insertBlockWidget(widget: Element) {
    $.delete()
    const block = getContainer($.range.startContainer)
    if(block === document.body || this.editor.schema.isPhrasing(widget)
      || this.canInsertAtSelection(widget)) {
      $.replace(widget)
    }
    else {
      const parent = block.parentElement
      if(!parent) return
      const offset = this.splitTextLikePoint(block, $.range)
      const right = block.cloneNode(false) as Element
      right.append(...Array.from(block.childNodes).slice(offset))
      block.normalize()
      right.normalize()

      if(block.childNodes.length) block.after(widget)
      else block.replaceWith(widget)
      if(right.childNodes.length) widget.after(right)
    }
    $.selectElement(widget)
    this.editor.features.selection.processSelection()
  }
}
