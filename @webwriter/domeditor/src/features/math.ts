import {EditorFeature, type DocumentListenerMap} from "."
import {$, cloneWithoutEditorMarkers, clearEditorMarkerClasses, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {MATH_NAMESPACE, mathArity, mathBoundaryPoint, mathCommandAliases, mathElement, mathOutsidePoint, mathRoot, mathRowNames, mathStructureOptions, mathTokenNames, mathTokenType, type MathSelectionState} from "../math"

type Point = [Node, number]
const indexOf = (node: Node) => Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode)
const isMath = (node: Node): node is Element => node instanceof Element && node.namespaceURI === MATH_NAMESPACE
const isRow = (node: Node): node is Element => isMath(node) && mathRowNames.has(node.localName)
const isToken = (node: Node): node is Element => isMath(node) && mathTokenNames.has(node.localName)
const plainToken = (node: Node): node is Element => isToken(node) && Array.from(node.childNodes).every(child => child.nodeType === Node.TEXT_NODE)
const before = (node: Node): Point => [node.parentNode!, indexOf(node)]
const after = (node: Node): Point => [node.parentNode!, indexOf(node) + 1]

/** Edits the authored MathML tree in place. The Selection is the formula caret;
 * only transient command text and presentation are kept outside the DOM. */
export class MathFeature extends EditorFeature {
  private overlay: HTMLDivElement | null = null
  private observer: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private observedRoot: Element | null = null
  private readonly handleResize = () => this.scheduleRefresh()
  private marked = new Set<Element>()
  private frame: number | null = null
  private commandText: string | null = null
  private commandRange: Range | null = null
  private drag: {root: Element, pointerId: number} | null = null

  actions = {
    insertMath: ({structure}: {type: "insertMath", structure?: string}) => this.insert(structure),
    editMath: ({command}: {type: "editMath", command: string}) => this.execute(command),
  } as const

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.observer = new MutationObserver(() => this.scheduleRefresh())
    this.observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true})
    this.resizeObserver = new ResizeObserver(this.handleResize)
    window.addEventListener("resize", this.handleResize)
  }

  disable() {
    const captured = this.editor.features.selection.captureSelectedElement
    super.disable()
    if(captured?.localName === "math" || Array.from(this.marked).some(element => element.classList.contains("◆element-capture-selected"))) {
      this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    }
    this.observer?.disconnect()
    this.observer = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.observedRoot = null
    window.removeEventListener("resize", this.handleResize)
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.clearPresentation()
    this.dismissCommand()
    this.drag = null
  }

  private accepts(event: Event) {
    return !event.defaultPrevented && !isAppendixInteraction(event) && !isFormControlInteraction(event)
      && !isWidgetShadowInteraction(event, this.editor.schema)
      && (!this.editor.features.selection.isCaptureSelection || this.editor.features.selection.captureSelectedElement === this.activeMath)
  }

  // Capture before generic document commands can split or unwrap MathML.
  captureListeners: DocumentListenerMap = {
    click: event => {
      if(event.button !== 0 || event.detail !== 2 || event.ctrlKey || event.metaKey
        || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema)
        || !(event.target instanceof Node)) return
      const root = mathRoot(event.target)
      if(!root || mathBoundaryPoint(root, event.clientX, event.clientY)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.drag = null
      this.dismissCommand()
      $.selectElement(root)
      this.changed()
    },
    keydown: event => { if(this.accepts(event)) this.keydown(event) },
    beforeinput: event => {
      if(!this.accepts(event)) return
      const boundary = $.mathBoundary
      if(boundary && boundary.element.getAttribute("display") !== "block"
        && ["insertText", "insertReplacementText"].includes(event.inputType) && event.data) {
        // Chromium canonicalizes a native insertion at MATH's outer edge to
        // its first/last token. Insert at the live Range to keep prose outside.
        event.preventDefault()
        event.stopImmediatePropagation()
        const text = document.createTextNode(event.data)
        $.range.insertNode(text)
        $.move(text, text.length)
        this.changed()
        return
      }
      if(!this.activeMath) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if(event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        event.inputType === "historyUndo" ? this.editor.doc.undo() : this.editor.doc.redo()
        this.changed()
      }
      else if(event.inputType === "insertText" || event.inputType === "insertReplacementText") this.execute(`text:${event.data ?? ""}`)
      else if(event.inputType.startsWith("delete")) this.execute(`delete:${event.inputType.includes("Forward") ? "forward" : "backward"}`)
      else if(event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") this.execute("exit")
    },
    paste: event => {
      if(!this.accepts(event) || !this.activeMath) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const html = event.clipboardData?.getData("text/html")
      if(html) {
        const fragment = this.editor.parseHTMLFragment(html).fragment
        const math = fragment.firstElementChild
        if(math?.namespaceURI === MATH_NAMESPACE && math.localName === "math" && fragment.children.length === 1) {
          const range = this.editRange()
          if(range && this.insertNodes(range, Array.from(math.childNodes))) this.changed()
          return
        }
      }
      this.execute(`text:${event.clipboardData?.getData("text/plain") ?? ""}`)
    },
    copy: event => this.clipboard(event, false),
    cut: event => this.clipboard(event, true),
  }

  activeListeners: DocumentListenerMap = {
    pointerdown: event => this.pointerdown(event),
    pointermove: event => {
      if(!this.drag || event.pointerId !== this.drag.pointerId) return
      if(!this.drag.root.isConnected || !document.getSelection()?.anchorNode?.isConnected) { this.drag = null; return }
      event.preventDefault()
      const root = this.drag.root
      const rect = root.getBoundingClientRect()
      const outside = root.getAttribute("display") !== "block" && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom || Boolean(mathBoundaryPoint(root, event.clientX, event.clientY)))
      if(outside) {
        const point = $.pointFromCoords(event.clientX, event.clientY, event.target, this.editor.schema, $.flowRoot)
        if(point) document.getSelection()?.extend(point.node, point.offset)
      }
      else document.getSelection()?.extend(...this.nearestPoint(root, event.clientX, event.clientY))
      this.refresh()
    },
    pointerup: () => { if(this.drag) { this.drag = null; this.changed() } },
    pointercancel: () => { this.drag = null },
    selectionchange: () => this.scheduleRefresh(),
    scroll: () => this.scheduleRefresh(),
  }

  get activeMath() {
    if(!this.isEnabled) return null
    const selection = document.getSelection()
    const selected = this.selectedMath
    if(selected?.localName === "math") return mathRoot(selected)
    const root = mathRoot(selection?.anchorNode ?? null)
    return root && mathRoot(selection?.focusNode ?? null) === root ? root : null
  }

  getState(): MathSelectionState | undefined {
    const math = this.activeMath
    return math ? {active: true, display: math.getAttribute("display") === "block" ? "block" : "inline"} : undefined
  }

  get selectedMath() {
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if(!range || range.startContainer !== range.endContainer || range.endOffset !== range.startOffset + 1) return null
    const node = range.startContainer.childNodes.item(range.startOffset)
    return node instanceof Element && node === mathRoot(node) ? node : null
  }

  /** Resolve placement from live HTML ancestors; widget contents remain atomic. */
  private textBlockAt(node: Node | null): Element | null {
    let element = node instanceof Element ? node : node?.parentElement
    let block: Element | null = null
    while(element && element !== document.body) {
      if(element.localName.includes("-") || element.hasAttribute("is")) return null
      if(!block && element.namespaceURI === document.body.namespaceURI
        && this.editor.features.manipulation.isTextBlock(element)) block = element
      element = element.parentElement
    }
    return block
  }

  adaptToPlacement(math: Element, container: Node) {
    math.setAttribute("display", this.textBlockAt(container) ? "inline" : "block")
  }

  private setDisplay(math: Element, display: "inline" | "block") {
    const block = this.textBlockAt(math.parentNode)
    const selection = document.getSelection()!
    const selected = this.selectedMath === math
    const anchor = selection.anchorNode, focus = selection.focusNode
    const anchorOffset = selection.anchorOffset, focusOffset = selection.focusOffset
    if(display === "block" && block) {
      // Split only the ancestor path around the formula, moving authored nodes
      // so comments, custom elements, and their identity survive conversion.
      const parent = block.parentElement
      if(!parent || !this.editor.schema.canInsert(parent, math, indexOf(block) + 1)) return false
      while(math.parentElement !== parent) {
        const wrapper = math.parentElement!
        const right = cloneWithoutEditorMarkers(wrapper, false) as Element
        while(math.nextSibling) right.append(math.nextSibling)
        wrapper.after(math)
        for(const node of [...Array.from(wrapper.childNodes), ...Array.from(right.childNodes)]) {
          if(node instanceof Text && !node.length) node.remove()
        }
        if(right.hasChildNodes()) math.after(right)
        if(!wrapper.hasChildNodes()) wrapper.remove()
      }
    }
    else if(display === "inline" && !block) {
      const paragraph = document.createElement("p")
      if(!math.parentElement || !this.editor.schema.canInsert(math.parentElement, paragraph, indexOf(math))) return false
      math.before(paragraph)
      paragraph.append(math)
    }
    math.setAttribute("display", display)
    if(selected) $.selectElement(math)
    else if(anchor && focus && math.contains(anchor) && math.contains(focus)) {
      selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
    }
    return true
  }

  insert(structure?: string) {
    if(structure === "sqrt") structure = "root"
    if(structure !== undefined && !mathStructureOptions.some(option => option.command === `structure:${structure}`)) return false
    if(this.activeMath) return false
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.isCollapsed || !selection.anchorNode
      || !document.body.contains(selection.anchorNode)) return false
    let container = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement
    while(container && container !== document.body) {
      if(container.localName.includes("-") || container.hasAttribute("is") || container.namespaceURI !== document.body.namespaceURI) return false
      container = container.parentElement
    }
    this.editor.features.manipulation.ensureTextBlock()
    if(!this.textBlockAt(selection.anchorNode)) return false
    const math = mathElement("math", mathElement("mrow"))
    selection.getRangeAt(0).insertNode(math)
    $.move(math.firstChild!, 0)
    if(structure) this.insertStructure(selection.getRangeAt(0).cloneRange(), structure)
    this.changed(true)
    return true
  }

  execute(command: string): boolean {
    const math = this.activeMath
    if(!math) return false
    this.marked.add(math)
    if(command === "exit") {
      this.dismissCommand()
      const point = mathOutsidePoint(math, true)!
      $.move(point.node, point.offset)
      this.changed()
      return true
    }
    if(command === "display:inline" || command === "display:block") {
      if(!this.setDisplay(math, command === "display:block" ? "block" : "inline")) return false
      this.changed()
      return true
    }
    if(this.selectedMath === math && (command === "delete:backward" || command === "delete:forward")) {
      const point = before(math)
      math.remove()
      $.move(...point)
      this.changed()
      return true
    }
    const range = this.editRange()
    if(!range) return false
    let result = false
    if(command.startsWith("text:")) result = this.typeText(range, command.slice(5))
    else if(command.startsWith("structure:")) result = this.insertStructure(range, command.slice(10))
    else if(command.startsWith("function:")) result = this.insertFunction(range, command.slice(9))
    else if(command === "delete:backward" || command === "delete:forward") result = this.delete(range, command.endsWith("backward"))
    else if(command.startsWith("move:")) result = this.move(command.slice(5), false)
    if(result) this.changed()
    return result
  }

  private editRange() {
    const math = this.activeMath
    const selection = document.getSelection()
    if(!math || !selection?.rangeCount) return null
    if(this.selectedMath === math) {
      $.move(math, math.childNodes.length)
    }
    let range = selection.getRangeAt(0).cloneRange()
    if(!math.contains(range.startContainer) || !math.contains(range.endContainer)) return null
    // Foreign and unfamiliar subtrees remain atomic. Never reinterpret them.
    for(const endpoint of [range.startContainer, range.endContainer]) {
      let element = endpoint instanceof Element ? endpoint : endpoint.parentElement
      while(element && element !== math) {
        if(element.namespaceURI !== MATH_NAMESPACE || element.localName.includes("-")
          || !(mathRowNames.has(element.localName) || mathTokenNames.has(element.localName)
            || mathArity[element.localName] || ["mtable", "mtr", "semantics"].includes(element.localName))) return null
        if(element.localName === "semantics" && !element.firstElementChild?.contains(endpoint)) return null
        if(mathArity[element.localName] && element.children.length !== mathArity[element.localName]) return null
        element = element.parentElement
      }
    }
    // Validate insertion feasibility before deleting selected text or splitting
    // a token. Unsupported commands must be mutation-free.
    const start = range.startContainer
    const token = start instanceof Text ? start.parentElement : plainToken(start) ? start : null
    if(token && (!plainToken(token) || token.childNodes.length > 1 || !token.parentElement
      || !(mathRowNames.has(token.parentElement.localName) || mathArity[token.parentElement.localName]
        || token.parentElement.localName === "semantics" && token.parentElement.firstElementChild === token))) return null
    if(!range.collapsed) range = this.siblingRange(range) ?? range
    return range
  }

  /** Native drags often use text endpoints even when they cover entire
   * expressions. Lift equivalent boundaries without changing any content. */
  private siblingRange(range: Range) {
    const common = range.commonAncestorContainer
    if(!isRow(common)) return null
    const lift = (node: Node, offset: number): Point | null => {
      while(node !== common) {
        const length = node instanceof Text ? node.length : node.childNodes.length
        if(offset !== 0 && offset !== length || !node.parentNode) return null
        const point = offset === 0 ? before(node) : after(node)
        node = point[0]
        offset = point[1]
      }
      return [node, offset]
    }
    const start = lift(range.startContainer, range.startOffset)
    const end = lift(range.endContainer, range.endOffset)
    if(!start || !end) return null
    const result = document.createRange()
    result.setStart(...start)
    result.setEnd(...end)
    return result
  }

  /** Only text within one token, or whole sibling expressions, may be removed.
   * Cross-slot selections are deliberately left intact. */
  private removeRange(range: Range): boolean {
    if(range.collapsed) return true
    if(range.startContainer === range.endContainer) {
      const container = range.startContainer
      if(container instanceof Text && container.parentElement && plainToken(container.parentElement)) {
        range.deleteContents()
        $.move(range.startContainer, range.startOffset)
        return true
      }
      if(isRow(container)) {
        range.deleteContents()
        $.move(container, range.startOffset)
        return true
      }
      if(isMath(container) && mathArity[container.localName] === container.children.length
        && range.endOffset === range.startOffset + 1 && container.childNodes[range.startOffset] instanceof Element) {
        const slot = mathElement("mrow")
        container.childNodes[range.startOffset].replaceWith(slot)
        range.setStart(slot, 0)
        range.collapse(true)
        $.move(slot, 0)
        return true
      }
    }
    return false
  }

  /** Finds an insertion boundary, adding a row only to the argument being
   * edited when a fixed-arity construct needs multiple children there. */
  private insertionPoint(range: Range): Point | null {
    let node = range.startContainer
    let offset = range.startOffset
    if(node instanceof Text) {
      const token = node.parentElement
      if(!token || !plainToken(token) || token.childNodes.length !== 1) return null
      if(offset > 0 && offset < node.length) {
        const tail = token.cloneNode(false) as Element
        tail.removeAttribute("id")
        tail.textContent = node.data.slice(offset)
        node.deleteData(offset, node.length - offset)
        this.rowFor(token)
        token.after(tail)
        return after(token)
      }
      this.rowFor(token)
      return offset === 0 ? before(token) : after(token)
    }
    if(plainToken(node)) {
      this.rowFor(node)
      return offset === 0 ? before(node) : after(node)
    }
    if(isRow(node)) return [node, offset]
    return null
  }

  private rowFor(element: Element) {
    const parent = element.parentElement
    if(parent && isMath(parent) && (mathArity[parent.localName] === parent.children.length
      || parent.localName === "semantics" && parent.firstElementChild === element)) {
      const row = mathElement("mrow")
      element.replaceWith(row)
      row.append(element)
    }
  }

  private insertNodes(range: Range, nodes: Node[]): boolean {
    if(!nodes.length || !this.removeRange(range)) return false
    const point = this.insertionPoint(range)
    if(!point || !isRow(point[0])) return false
    const [parent, offset] = point
    const reference = parent.childNodes[offset] ?? null
    nodes.forEach(node => parent.insertBefore(node, reference))
    $.move(...after(nodes.at(-1)!))
    return true
  }

  private typeText(range: Range, text: string): boolean {
    if(!text || !this.removeRange(range)) return false
    const node = range.startContainer
    const type = mathTokenType(text)
    if(node instanceof Text && node.parentElement && plainToken(node.parentElement)
      && (node.parentElement.localName === "mtext" || type === "mn" && node.parentElement.localName === type)) {
      node.insertData(range.startOffset, text)
      $.move(node, range.startOffset + text.length)
      return true
    }
    const tokens: Element[] = []
    for(const character of text) {
      const name = mathTokenType(character)
      const previous = tokens.at(-1)
      if(previous?.localName === name && ["mn", "mtext"].includes(name)) previous.textContent += character
      else tokens.push(mathElement(name, character === "-" ? "−" : character))
    }
    if(!this.insertNodes(range, tokens)) return false
    const last = tokens.at(-1)!
    $.move(last.firstChild!, last.textContent!.length)
    return true
  }

  private insertStructure(range: Range, name: string): boolean {
    if(name === "sqrt") name = "root"
    if(!mathStructureOptions.some(option => option.command === `structure:${name}`)) return false
    // Preserve selected nodes by moving them, retaining identity and attributes.
    let operand: Node[] = []
    if(!range.collapsed) {
      if(range.startContainer === range.endContainer && isRow(range.startContainer)) {
        operand = Array.from(range.startContainer.childNodes).slice(range.startOffset, range.endOffset)
        range.collapse(true)
      }
      else if(range.startContainer === range.endContainer && range.startContainer instanceof Text
        && range.startContainer.parentElement && plainToken(range.startContainer.parentElement)) {
        const token = range.startContainer.parentElement.cloneNode(false) as Element
        token.removeAttribute("id")
        token.textContent = range.toString()
        if(!this.removeRange(range)) return false
        operand = [token]
      }
      else return false
    }
    const point = this.insertionPoint(range)
    if(!point || !isRow(point[0])) return false
    const [parent, offset] = point
    const previous = parent.childNodes[offset - 1]
    if(!operand.length && ["frac", "square", "sup", "sub"].includes(name) && previous instanceof Element
      && previous.namespaceURI === MATH_NAMESPACE && previous.localName !== "mo") operand = [previous]
    const first = mathElement("mrow")
    const second = mathElement("mrow")
    let node: Element
    let target = first
    const operators: Record<string, string> = {sum: "∑", prod: "∏", int: "∫", bigcup: "⋃", bigcap: "⋂"}
    if(name === "frac" || name === "binom") {
      node = mathElement("mfrac", first, second)
      if(name === "binom") {
        node.setAttribute("linethickness", "0")
        node = mathElement("mrow", mathElement("mo", "("), node, mathElement("mo", ")"))
      }
      if(operand.length) target = second
    }
    else if(["sup", "sub", "square"].includes(name)) {
      node = mathElement(name === "sub" ? "msub" : "msup", first, second)
      target = operand.length ? second : first
      if(name === "square") second.append(mathElement("mn", "2"))
    }
    else if(name === "root") node = mathElement("mroot", first, second)
    else if(name === "abs" || name === "paren") node = mathElement("mrow", mathElement("mo", name === "abs" ? "|" : "("), first, mathElement("mo", name === "abs" ? "|" : ")"))
    else if(name === "matrix") {
      const table = mathElement("mtable",
        mathElement("mtr", mathElement("mtd", first), mathElement("mtd", second)),
        mathElement("mtr", mathElement("mtd", mathElement("mrow")), mathElement("mtd", mathElement("mrow"))))
      node = mathElement("mrow", mathElement("mo", "["), table, mathElement("mo", "]"))
    }
    else node = mathElement(name === "int" ? "msubsup" : "munderover", mathElement("mo", operators[name]), first, second)
    parent.insertBefore(node, operand[0]?.parentNode === parent ? operand[0] : parent.childNodes[offset] ?? null)
    first.append(...operand)
    if(name === "square" && operand.length) $.move(...after(node))
    else $.move(target, target.childNodes.length)
    return true
  }

  private insertFunction(range: Range, name: string) {
    if(!["sin", "cos", "tan", "ln", "log"].includes(name)) return false
    const identifier = mathElement("mi", name)
    identifier.setAttribute("mathvariant", "normal")
    const argument = mathElement("mrow")
    if(!this.insertNodes(range, [identifier, mathElement("mo", "\u2061"), mathElement("mrow", mathElement("mo", "("), argument, mathElement("mo", ")"))])) return false
    $.move(argument, 0)
    return true
  }

  private delete(range: Range, backward: boolean): boolean {
    if(!range.collapsed) return this.removeRange(range)
    const node = range.startContainer
    const offset = range.startOffset
    if(node instanceof Text && node.parentElement && plainToken(node.parentElement)) {
      const length = backward ? [...node.data.slice(0, offset)].at(-1)?.length ?? 0 : [...node.data.slice(offset)][0]?.length ?? 0
      if(length) {
        const start = backward ? offset - length : offset
        node.deleteData(start, length)
        if(!node.length && node.parentElement!.childNodes.length === 1) {
          const token = node.parentElement!
          const parent = token.parentElement!
          if(isRow(parent)) {
            const point = before(token)
            token.remove()
            $.move(...point)
          }
          else {
            const row = mathElement("mrow")
            token.replaceWith(row)
            $.move(row, 0)
          }
        }
        else $.move(node, start)
        return true
      }
    }
    // Navigating out of an empty argument never destroys its fixed-arity parent.
    if(isRow(node) && !node.childNodes.length) return this.move(backward ? "left" : "right", false)
    const point = this.insertionPoint(range)
    if(!point) return false
    const candidate = point[0].childNodes[point[1] + (backward ? -1 : 0)]
    if(!candidate) return this.move(backward ? "left" : "right", false)
    if(candidate instanceof Element) {
      if(plainToken(candidate) && candidate.firstChild instanceof Text && candidate.textContent) {
        $.move(candidate.firstChild, backward ? candidate.firstChild.length : 0)
        return this.delete(document.getSelection()!.getRangeAt(0), backward)
      }
      if(plainToken(candidate) && !candidate.textContent) {
        const next = before(candidate)
        candidate.remove()
        $.move(...next)
      }
      else $.selectElement(candidate)
      return true
    }
    return false
  }

  /** Derive visual caret stops afresh, traversing known containers and treating
   * everything else as one opaque expression. */
  private stops(root: Element, horizontalFocus?: Node): Point[] {
    const points: Point[] = []
    const visit = (element: Element, enter = false) => {
      if(plainToken(element) && element.childNodes.length === 1 && element.firstChild instanceof Text) {
        let offset = 0
        if(enter) points.push([element.firstChild, 0])
        for(const character of element.firstChild.data) { offset += character.length; points.push([element.firstChild, offset]) }
      }
      else if(isMath(element) && (mathRowNames.has(element.localName) || mathArity[element.localName]
        || ["mtable", "mtr", "semantics"].includes(element.localName))) {
        if(!element.children.length) points.push([element, 0])
        let children = element.localName === "semantics" ? Array.from(element.children).slice(0, 1) : Array.from(element.children)
        if(horizontalFocus) {
          // Follow the current visual lane. Stacked arguments remain reachable
          // with Up/Down and Tab, but are not horizontal neighbors.
          const active = children.find(child => child.contains(horizontalFocus))
          if(["mfrac", "mover", "munder", "munderover", "mtable"].includes(element.localName)) {
            children = children.length ? [active ?? children[0]] : []
          }
          else if(element.localName === "msubsup" && children.length === 3) {
            children = [children[0], active && active !== children[0] ? active : children[2]]
          }
          else if(element.localName === "mroot" && children.length === 2) children.reverse()
        }
        children.forEach((child, index) => {
          const transparent = isMath(child) && ["mrow", "mstyle"].includes(child.localName)
          if(isMath(child)) visit(child, Boolean(mathArity[element.localName]) || element.localName === "mtr" || enter && index === 0)
          if(isRow(element) && !transparent && !plainToken(child)) points.push(after(child))
        })
      }
    }
    points.push([root, 0])
    visit(root)
    return points
  }

  /** Enter at the same live stop used by Home/End and pointer hit testing. */
  enter(root: Element, atEnd = false) {
    if(mathRoot(root) !== root) return
    const points = this.stops(root)
    $.move(...(atEnd ? points.at(-1)! : points[0]))
  }

  private move(direction: string, extend: boolean): boolean {
    const root = this.activeMath
    const selection = document.getSelection()
    if(!root || !selection?.focusNode) return false
    const node = selection.focusNode
    const offset = selection.focusOffset
    let point: Point | undefined
    if(direction === "up" || direction === "down") {
      let element = node instanceof Element ? node : node.parentElement
      while(element && element !== root) {
        const parent = element.parentElement
        if(parent && isMath(parent) && mathArity[parent.localName]) {
          const children = Array.from(parent.children)
          const index = children.indexOf(element)
          if(children.length !== mathArity[parent.localName]) return false
          const order = ["msup", "mover", "mroot"].includes(parent.localName) ? [1, 0]
            : parent.localName === "msubsup" && index !== 0 ? [2, 1]
            : ["msubsup", "munderover"].includes(parent.localName) ? [2, 0, 1] : [0, 1]
          const target = children[order[order.indexOf(index) + (direction === "up" ? -1 : 1)]]
          if(target) { point = this.stops(target)[0]; break }
        }
        if(parent?.localName === "mtr" && element.localName === "mtd") {
          const row = direction === "up" ? parent.previousElementSibling : parent.nextElementSibling
          const cell = row?.children[Array.from(parent.children).indexOf(element)]
          if(cell?.localName === "mtd") { point = this.stops(cell)[0]; break }
        }
        element = parent
      }
    }
    else {
      const points = this.stops(root, direction === "left" || direction === "right" ? node : undefined)
      if(direction === "start") point = [root, 0]
      else if(direction === "end") point = points.at(-1)
      else if(direction === "left" || direction === "right") {
        let index = points.findIndex(([candidate, position]) => candidate === node && position === offset)
        if(index < 0 && node instanceof Element && offset === 0) {
          index = points.findIndex(([candidate, position]) => node.contains(candidate) && position === 0)
        }
        if(index >= 0) point = points[index + (direction === "left" ? -1 : 1)]
        else {
          const range = document.createRange()
          range.setStart(node, offset)
          range.collapse(true)
          point = direction === "left"
            ? points.filter(([candidate, position]) => range.comparePoint(candidate, position) < 0).at(-1)
            : points.find(([candidate, position]) => range.comparePoint(candidate, position) > 0)
        }
        if(!point) {
          const outside = mathOutsidePoint(root, direction !== "left")!
          point = [outside.node, outside.offset]
        }
      }
    }
    if(!point) return false
    if(extend) selection.extend(...point)
    else $.move(...point)
    return true
  }

  private keydown(event: KeyboardEvent) {
    const root = this.activeMath
    if(!root || event.isComposing) return
    this.marked.add(root)
    if((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      this.editor.features.history.activeListeners.keydown?.(event)
      if(event.defaultPrevented) { event.stopImmediatePropagation(); this.changed() }
      return
    }
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.getSelection()?.setBaseAndExtent(root, 0, root, root.childNodes.length)
      this.changed()
      return
    }
    if((event.metaKey || event.ctrlKey || event.altKey) && !event.getModifierState("AltGraph")
      && !["Backspace", "Delete", "Enter"].includes(event.key)) return
    const key = event.key === "Dead" && ["Backquote", "IntlBackslash"].includes(event.code) ? "^" : event.key
    const directions: Record<string, string> = {ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "start", End: "end"}
    const handled = key.length === 1 || key in directions || ["Backspace", "Delete", "Tab", "Enter", "Escape"].includes(key)
    if(!handled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(this.commandText !== null) {
      if(key === "Escape") this.dismissCommand()
      else if(key === "Backspace") this.commandText ? this.commandText = this.commandText.slice(0, -1) : this.dismissCommand()
      else if([" ", "Tab", "Enter"].includes(key)) {
        const command = mathCommandAliases[this.commandText]
        this.dismissCommand()
        if(command) this.execute(command)
      }
      else if(/^[a-zA-Z]$/.test(key)) this.commandText += key
      else this.dismissCommand()
      this.refresh()
      return
    }
    if(key === "\\") {
      this.commandText = ""
      this.commandRange = this.editRange()
      this.refresh()
    }
    else if(key in directions) { this.move(directions[key], event.shiftKey); this.changed() }
    else if(key === "Tab") { this.moveSlot(event.shiftKey); this.changed() }
    else if(key === "Enter" || key === "Escape") this.execute("exit")
    else if(key === "Backspace" || key === "Delete") this.execute(`delete:${key === "Backspace" ? "backward" : "forward"}`)
    else if(key === "^" || key === "_" || key === "/") this.execute(`structure:${key === "^" ? "sup" : key === "_" ? "sub" : "frac"}`)
    else this.execute(`text:${key}`)
  }

  private pointerdown(event: PointerEvent) {
    if(event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || !(event.target instanceof Node)) return
    const root = mathRoot(event.target)
    if(!root) return
    if(mathBoundaryPoint(root, event.clientX, event.clientY)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.dismissCommand()
    const nearest = this.nearestPoint(root, event.clientX, event.clientY)
    if(event.shiftKey && document.getSelection()?.rangeCount) document.getSelection()?.extend(...nearest)
    else $.move(...nearest)
    this.drag = {root, pointerId: event.pointerId}
    this.changed()
  }

  private nearestPoint(root: Element, x: number, y: number): Point {
    const points = this.stops(root)
    let nearest: Point = [root, 0]
    let distance = Infinity
    points.forEach(point => {
      // Once the pointer passes a script's edge, address the containing row,
      // rather than the visually nearby final character inside the script.
      let element = point[0] instanceof Element ? point[0] : point[0].parentElement
      while(element && element !== root) {
        const parent = element.parentElement
        if(parent && ["msub", "msup", "msubsup"].includes(parent.localName)
          && element !== parent.firstElementChild) {
          const bounds = element.getBoundingClientRect()
          const rtl = getComputedStyle(parent).direction === "rtl"
          if(bounds.width && (rtl ? x < bounds.left - 1 : x > bounds.right + 1)) return
        }
        element = parent
      }
      const rect = this.pointRect(point)
      const value = Math.abs(x - rect.left) + Math.abs(y - (rect.top + rect.height / 2)) * 2
      if(value < distance) { distance = value; nearest = point }
    })
    return nearest
  }

  private moveSlot(backward: boolean) {
    const root = this.activeMath
    const focus = document.getSelection()?.focusNode
    if(!root || !focus) return
    let element = focus instanceof Element ? focus : focus.parentElement
    while(element && element !== root) {
      const parent = element.parentElement
      if(parent && (mathArity[parent.localName] || parent.localName === "mtr")) {
        const next = backward ? element.previousElementSibling : element.nextElementSibling
        if(next) { $.move(...this.stops(next)[0]); return }
        if(parent.parentNode) { $.move(...(backward ? before(parent) : after(parent))); return }
      }
      element = parent
    }
    this.move(backward ? "left" : "right", false)
  }

  private clipboard(event: ClipboardEvent, cut: boolean) {
    if(!this.accepts(event) || !this.activeMath || !event.clipboardData) return
    if(this.selectedMath === this.activeMath) return
    const range = this.editRange()
    if(!range || range.collapsed) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const contents = range.cloneContents()
    const wrapper = mathElement("math")
    if(range.startContainer instanceof Text && range.startContainer === range.endContainer && range.startContainer.parentElement) {
      const token = range.startContainer.parentElement.cloneNode(false) as Element
      token.removeAttribute("id")
      token.textContent = range.toString()
      wrapper.append(token)
    }
    else wrapper.append(contents)
    clearEditorMarkerClasses(wrapper)
    event.clipboardData.setData("text/html", wrapper.outerHTML)
    event.clipboardData.setData("text/plain", range.toString())
    if(cut && this.removeRange(range)) this.changed()
  }

  private dismissCommand() { this.commandText = null; this.commandRange = null }

  private changed(inserted = false) {
    const root = this.activeMath
    if(root?.getAttribute("display") === "block" && this.editor.features.selection.captureSelectedElement !== root) {
      this.editor.features.selection.captureElement(root, {preserveNativeSelection: true})
    }
    else this.editor.features.selection.processSelection()
    this.refresh()
    this.editor.postSelectionPath(inserted)
  }

  private scheduleRefresh() {
    if(!this.isEnabled || this.frame !== null) return
    this.frame = requestAnimationFrame(() => { this.frame = null; this.refresh() })
  }

  private clearPresentation() {
    this.resizeObserver?.disconnect()
    this.observedRoot = null
    this.marked.forEach(element => {
      removeEditorMarker(element, "◆math-slot")
      removeEditorMarker(element, "◆math-editing")
      removeEditorMarker(element, "◆math-structural-caret")
    })
    this.marked.clear()
    this.overlay?.remove()
    this.overlay = null
  }

  private pointRect([node, offset]: Point): DOMRect {
    if(node instanceof Element) {
      const previous = node.childNodes[offset - 1]
      const next = node.childNodes[offset]
      const adjacent = previous instanceof Element && !Boolean(plainToken(previous)) ? previous
        : next instanceof Element && !Boolean(plainToken(next)) ? next : null
      if(adjacent) {
        const bounds = adjacent.getBoundingClientRect()
        // A row boundary after a script belongs to the base's baseline and
        // font size. A collapsed native Range can instead resolve into it.
        let baseline = adjacent
        while(["msub", "msup", "msubsup"].includes(baseline.localName) && baseline.firstElementChild) baseline = baseline.firstElementChild
        const vertical = baseline.getBoundingClientRect()
        const rtl = getComputedStyle(node).direction === "rtl"
        const end = adjacent === previous
        return new DOMRect(end !== rtl ? bounds.right : bounds.left, vertical.top, 0, vertical.height || 20)
      }
    }
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if(rect.height) return rect
    if(node instanceof Element) {
      const previous = node.childNodes[offset - 1]
      const next = node.childNodes[offset]
      const element = next instanceof Element ? next : previous instanceof Element ? previous : node
      const bounds = element.getBoundingClientRect()
      return new DOMRect(next || element === node ? bounds.left : bounds.right, bounds.top, 0, bounds.height || 20)
    }
    const bounds = node.parentElement!.getBoundingClientRect()
    return new DOMRect(offset ? bounds.right : bounds.left, bounds.top, 0, bounds.height)
  }

  refresh() {
    const root = this.activeMath
    const selection = document.getSelection()
    let removed = false
    // Only discard a formula that was being edited. Transparent empty rows
    // and tokens are empty; fractions, radicals, spaces, and unknown content
    // retain their authored meaning even before their arguments are filled.
    const empty = (node: Node): boolean => node instanceof Text ? !node.data.trim()
      : isMath(node) && (node.localName === "math" || node.localName === "mrow" || node.localName === "mstyle" || isToken(node))
        && Array.from(node.childNodes).every(empty)
    for(const previous of this.marked) {
      if(previous === root || mathRoot(previous) !== previous || previous.getAttribute("display") === "block"
        || !selection?.rangeCount || previous.contains(selection.anchorNode) || previous.contains(selection.focusNode)
        || selection.getRangeAt(0).intersectsNode(previous) || !empty(previous)) continue
      const parent = previous.parentNode!
      const index = indexOf(previous)
      const anchor = selection.anchorNode!, focus = selection.focusNode!
      const anchorOffset = selection.anchorOffset - (anchor === parent && selection.anchorOffset > index ? 1 : 0)
      const focusOffset = selection.focusOffset - (focus === parent && selection.focusOffset > index ? 1 : 0)
      previous.remove()
      selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
      removed = true
    }
    if(removed) this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    if(root ? this.editor.features.selection.captureSelectedElement !== (root.getAttribute("display") === "block" ? root : null)
      : Array.from(this.marked).some(element => element.classList.contains("◆element-capture-selected"))) {
      this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    }
    if(!root) { this.clearPresentation(); this.dismissCommand(); return }
    if(root !== this.observedRoot) {
      this.resizeObserver?.disconnect()
      this.resizeObserver?.observe(root)
      this.observedRoot = root
    }
    const markers = new Map<Element, string>([[root, "◆math-editing"]])
    this.stops(root).forEach(([node]) => {
      if(node !== root && isRow(node) && !node.childNodes.length) markers.set(node, "◆math-slot")
    })
    this.marked.forEach(element => {
      if(!markers.has(element)) {
        removeEditorMarker(element, "◆math-slot")
        removeEditorMarker(element, "◆math-editing")
        removeEditorMarker(element, "◆math-structural-caret")
      }
    })
    markers.forEach((marker, element) => { if(!element.classList.contains(marker)) element.classList.add(marker) })
    this.marked = new Set(markers.keys())
    if(!this.overlay) {
      this.overlay = document.createElement("div")
      this.overlay.className = "◆math-overlay"
      this.overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646"
      this.overlay.setAttribute("aria-hidden", "true")
      this.editor.addAppendix(this.overlay)
    }
    this.overlay.replaceChildren()
    const caretNode = selection?.isCollapsed ? selection.focusNode : null
    const previous = caretNode?.childNodes[selection!.focusOffset - 1]
    const structuralCaret = Boolean(caretNode && isRow(caretNode) && previous instanceof Element && !plainToken(previous)
      && !(caretNode === root && selection!.focusOffset === root.childNodes.length))
    if(structuralCaret && !root.classList.contains("◆math-structural-caret")) root.classList.add("◆math-structural-caret")
    else if(!structuralCaret) removeEditorMarker(root, "◆math-structural-caret")
    const outerRows = new Set<Element>([root])
    let outer = root
    while(outer.children.length === 1 && outer.firstElementChild?.localName === "mrow") {
      outer = outer.firstElementChild
      outerRows.add(outer)
    }
    markers.forEach((marker, element) => {
      if(marker !== "◆math-slot" || outerRows.has(element)) return
      const rect = element.getBoundingClientRect()
      const guide = document.createElement("span")
      guide.style.cssText = `position:absolute;box-sizing:border-box;border:1px dashed #94a3b8;left:${rect.left}px;top:${rect.top}px;width:${Math.max(10, rect.width)}px;height:${Math.max(18, rect.height)}px`
      this.overlay!.append(guide)
    })
    if(selection?.isCollapsed && selection.focusNode) {
      const rect = this.pointRect([selection.focusNode, selection.focusOffset])
      if(structuralCaret) {
        const caret = document.createElement("span")
        caret.style.cssText = `position:absolute;background:currentColor;width:1px;left:${rect.left}px;top:${rect.top}px;height:${rect.height}px;animation:var(--ww-ui-animation, blink 1s step-end 0s infinite)`
        this.overlay.append(caret)
      }
      if(this.commandText !== null) {
        if(!this.commandRange?.startContainer.isConnected || !root.contains(this.commandRange.startContainer)
          || this.commandRange.comparePoint(selection.focusNode, selection.focusOffset) !== 0) this.dismissCommand()
        else {
          const hint = document.createElement("span")
          hint.style.cssText = `position:absolute;background:white;color:#0f172a;border:1px solid #94a3b8;border-radius:4px;padding:4px 8px;font:14px system-ui;left:${rect.left}px;top:${rect.bottom + 5}px`
          const completions = Object.keys(mathCommandAliases).filter(name => name.startsWith(this.commandText!)).slice(0, 6)
          hint.textContent = `\\${this.commandText}  ${completions.join(" · ")} — Space to insert`
          this.overlay.append(hint)
        }
      }
    }
  }
}
