import { DocumentListenerMap, EditorFeature } from "."
import {$, focusedWidgetHost, getContainer, isAtomicEditingElement, isElement, modifierKeyDown, setPart, widgetHostForShadowInteraction} from "../utility"
import {mediaContainerForNode} from "../media"

function arrowDirection(key: string) {
  return key === "ArrowUp" || key === "ArrowLeft"
    ? "backward" as const
    : key === "ArrowDown" || key === "ArrowRight"
      ? "forward" as const
      : null
}

function isCaretAtStartOf(element: Element) {
  const selection = document.getSelection()
  if(!selection?.isCollapsed || !selection.rangeCount) {
    return false
  }
  let node: Node | null = selection.anchorNode
  let offset = selection.anchorOffset
  while(node && node !== element) {
    if(offset !== 0 || !element.contains(node)) {
      return false
    }
    const parent = node.parentNode
    if(!parent) {
      return false
    }
    const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
    if(Array.from(parent.childNodes).slice(0, index).some(previous => previous.nodeType === Node.ELEMENT_NODE || previous.textContent)) {
      return false
    }
    node = parent
    offset = index
  }
  return node === element && offset === 0
}

/** Editing feature that visualizes the current selection. It classifies every
 * selection change into an editing-relevant kind (element, text, gap, empty)
 * and applies the corresponding `◆…-selected` marker classes, manages the
 * selection and hover overlays in BODY's shadow tree, mirrors modifier key
 * state onto the body, and implements
 * pointer-based selection (drag selection, modifier-click element selection). */
export class SelectionFeature extends EditorFeature {

  #sharedRefreshQueued = false
  #capturedWidget: Element | null = null

  /** Whether the current widget node selection also captures interactions in
   * that widget's shadow tree. Capture survives shadow-tree focus changes and
   * is released by the next ordinary editor selection interaction. */
  get isCaptureSelection() {
    const widget = this.#capturedWidget
    if(!widget?.isConnected) return false
    return focusedWidgetHost() === widget || $.selectedElement === widget
  }

  #releaseCaptureSelection() {
    this.#capturedWidget = null
  }

  #selectionBlock() {
    let node = $.anchor
    while(node && node !== document.body) {
      if(node instanceof Element && this.editor.schema.isBlock(node)) return node
      node = node.parentElement
    }
    return null
  }

  /** Whether the caret is at the requested edge of its text block. Editor-only
   * helpers, comments, formatting whitespace, and a browser placeholder BR do
   * not count as content beyond the caret. */
  #isCaretAtBlockBoundary(block: Element, direction: "backward" | "forward") {
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode || !block.contains(selection.anchorNode)) return false
    const remainder = document.createRange()
    if(direction === "backward") {
      remainder.setStart(block, 0)
      remainder.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    else {
      remainder.setStart(selection.anchorNode, selection.anchorOffset)
      remainder.setEnd(block, block.childNodes.length)
    }
    const hasEditingContent = (node: Node): boolean => {
      if(node instanceof Text) return Boolean(node.textContent?.trim())
      if(!(node instanceof Element || node instanceof DocumentFragment)) return false
      if(node instanceof Element) {
        if(node.matches(".◆editor-only, br")) return false
        if(!node.childNodes.length || isAtomicEditingElement(node)) return true
      }
      return Array.from(node.childNodes).some(hasEditingContent)
    }
    return !hasEditingContent(remainder.cloneContents())
  }

  /** Finds an atomic node immediately beside the live caret or the edge of its
   * containing block, ignoring invisible formatting nodes between siblings. */
  #adjacentAtomicElement(direction: "backward" | "forward", fromBlockBoundary = false) {
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode) return null
    let node: Node = selection.anchorNode
    let offset = selection.anchorOffset
    if(fromBlockBoundary) {
      const block = this.#selectionBlock()
      const parent = block?.parentNode
      if(!block || !parent) return null
      const index = Array.from(parent.childNodes).indexOf(block)
      node = parent
      offset = direction === "backward" ? index : index + 1
    }

    while(node === document.body || document.body.contains(node)) {
      if(node instanceof Text) {
        const isAtBoundary = direction === "backward" ? offset === 0 : offset === node.length
        if(!isAtBoundary) return null
      }
      else {
        const step = direction === "backward" ? -1 : 1
        for(let index = direction === "backward" ? offset - 1 : offset;
          0 <= index && index < node.childNodes.length; index += step) {
          const adjacent = node.childNodes.item(index)
          if(!(adjacent instanceof Element)) {
            if(adjacent instanceof Text && adjacent.textContent?.trim()) return null
            continue
          }
          if(adjacent.matches(".◆editor-only")) continue
          return isAtomicEditingElement(adjacent) ? adjacent : null
        }
      }

      if(node === document.body) return null
      const parent = node.parentNode
      if(!parent) return null
      const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
      node = parent
      offset = direction === "backward" ? index : index + 1
    }
    return null
  }

  /** Selects an adjacent atomic node, or collapses an atomic node selection
   * into the boundary in the requested direction. */
  #navigateAtomicSelection(direction: "backward" | "forward", vertical = false) {
    const selectedElement = $.selectedElement
    if(selectedElement && isAtomicEditingElement(selectedElement)) {
      $.selectGap(selectedElement, direction === "backward" ? "before" : "after")
    }
    else {
      let adjacent = this.#adjacentAtomicElement(direction)
      const block = this.#selectionBlock()
      if(!adjacent && block && (vertical || this.#isCaretAtBlockBoundary(block, direction))) {
        adjacent = this.#adjacentAtomicElement(direction, true)
      }
      if(!adjacent) return false
      $.selectElement(adjacent)
    }
    this.processSelection()
    return true
  }

  readonly #handleSharedChange = () => {
    if(this.#sharedRefreshQueued) return
    this.#sharedRefreshQueued = true
    queueMicrotask(() => {
      this.#sharedRefreshQueued = false
      if(!this.isEnabled) return
      this.processSelection()
      // Shared DOM changes can clamp a detached selection without firing a
      // native selectionchange event, so refresh the host breadcrumb as well.
      this.editor.postSelectionPath()
    })
  }

  /** Clamps collapsed selection endpoints outside the editable body to the nearest body boundary. */
  #constrainSelectionToBody() {
    const selection = document.getSelection()
    // Non-collapsed ranges can be browser-generated document-wide selections
    // (e.g. Select all), whose endpoints may temporarily be outside BODY.
    // Rewriting those endpoints can collapse the range into the gap before
    // the first element.
    if(!selection?.isCollapsed || !selection.anchorNode || !selection.focusNode) {
      return
    }
    const body = document.body
    const bodyRange = document.createRange()
    bodyRange.selectNodeContents(body)
    const clamp = (node: Node, offset: number): [Node, number] => {
      if(node === body || body.contains(node)) {
        return [node, offset]
      }
      let relation: number
      try {
        relation = bodyRange.comparePoint(node, offset)
      }
      catch {
        relation = -1
      }
      return relation < 0? [body, 0]: [body, body.childNodes.length]
    }
    const anchor = clamp(selection.anchorNode, selection.anchorOffset)
    const focus = clamp(selection.focusNode, selection.focusOffset)
    if(anchor[0] !== selection.anchorNode || anchor[1] !== selection.anchorOffset || focus[0] !== selection.focusNode || focus[1] !== selection.focusOffset) {
      selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1])
    }
  }

  /** Media are atomic editing nodes. Any caret or range endpoint that lands
   * inside one is promoted to a node selection of the outer media element. */
  #constrainSelectionToMedia() {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const media = mediaContainerForNode(selection.anchorNode) ?? mediaContainerForNode(selection.focusNode)
    if(!media) return
    if($.isElementSelection && $.selectedElement === media) return
    $.selectElement(media)
  }

  /** Enables the feature and places the selection at the document start. */
  enable() {
    if(this.isEnabled) return
    $.selectDocumentStart()
    super.enable()
    this.#ensureHoverCaret()
    this.#widgetInteractionEvents.forEach(type => {
      document.addEventListener(type, this.#handleWidgetShadowInteraction, {capture: true})
    })
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    this.processSelection()
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    this.#widgetInteractionEvents.forEach(type => {
      document.removeEventListener(type, this.#handleWidgetShadowInteraction, {capture: true})
    })
    this.#releaseCaptureSelection()
    this.#clearElementHover()
    super.disable()
  }

  readonly #widgetInteractionEvents = ["pointerdown", "focusin", "keydown", "beforeinput", "input", "change"] as const

  /** Keeps widget shadow trees atomic without cancelling their own controls.
   * Regular feature listeners ignore these events, so they cannot start or
   * extend an editor drag selection. The first interaction node-selects and
   * captures the host while leaving the widget's native focus, caret, input,
   * and event handling untouched. */
  readonly #handleWidgetShadowInteraction = (event: Event) => {
    const widget = widgetHostForShadowInteraction(event)
    if(!widget) return
    this.isInDragSelection = false
    if(this.#capturedWidget === widget && this.isCaptureSelection) return
    this.#capturedWidget = widget
    // Pointerdown happens before the widget establishes its own focus/caret,
    // so it is safe to establish the outer atomic node range here. Later
    // focus, keyboard, and input events must not rewrite shadow selection.
    if(event.type === "pointerdown" && !($.isElementSelection && $.selectedElement === widget)) {
      $.selectElement(widget, false)
    }
    this.processSelection()
    this.editor.postSelectionPath()
  }

  /** Selects the element addressed by a child-node path from BODY. */
  actions = {
    selectNode: ({path}: {type: "selectNode", path: number[]}) => {
      const node = this.#elementAtPath(path)
      this.#releaseCaptureSelection()
      $.selectElement(node)
      this.processSelection()
    },
    hoverNode: ({path}: {type: "hoverNode", path: number[] | null}) => {
      this.#clearElementHover()
      if(path === null) return

      const element = this.#elementAtPath(path)
      element.classList.add("◆", "◆element-hovered")
    },
  } as const

  /** Resolves a BODY-relative child-node path to an element. */
  #elementAtPath(path: number[]) {
    let node: Node = document.body
    for(const index of path) {
      const child = node.childNodes.item(index)
      if(!child) {
        throw new RangeError(`Cannot select missing node at path [${path.join(", ")}]`)
      }
      node = child
    }
    if(!isElement(node)) {
      throw new TypeError("A breadcrumb path must resolve to an element")
    }
    return getContainer(node)
  }

  /** Whether a pointer-driven drag selection is in progress. */
  isInDragSelection = false

  dragAnchor: {node: Node, offset: number} | null = null

  /** The element marked as the anchor of the current gap selection (the
   * element the gap caret is attached to), or null. */
  static get gapAnchor() {
    return document.querySelector(".◆gap-before-selected, .◆gap-after-selected")
  }

  /** Creates the shared ordinary/breadcrumb hover outline in BODY's shadow tree. */
  #createHoverCaret() {
    const node = document.createElement("div")
    node.classList.add("◆", "◆editor-only", "◆hover-caret")
    node.setAttribute("part", "hover-caret")
    node.setAttribute("aria-hidden", "true")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  /** The shared native and breadcrumb hover outline. */
  get hoverCaret() {
    return this.editor.appendix.querySelector<HTMLElement>(".◆hover-caret")
  }

  #ensureHoverCaret() {
    return this.hoverCaret ?? this.#createHoverCaret()
  }

  /** Creates the shared non-text selection caret in BODY's shadow tree. */
  #createSelectionCaret() {
    const node = document.createElement("div")
    node.classList.add("◆", "◆editor-only", "◆selection-caret")
    node.setAttribute("part", "selection-caret selection-caret-hidden")
    node.setAttribute("aria-hidden", "true")
    node.setAttribute("visibility", "hidden")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  /** The shared node, capture, and gap caret, or null before first use. */
  get selectionCaret() {
    return this.editor.appendix.querySelector<HTMLElement>(".◆selection-caret")
  }

  /** Compatibility alias used by the transformation feature for drop gaps. */
  get gapCaret() {
    return this.selectionCaret
  }

  /** Hides the shared caret and removes every selection/drop presentation. */
  #hideSelectionCaret() {
    const caret = this.selectionCaret
    if(!caret) return
    caret.setAttribute("visibility", "hidden")
    setPart(caret, "selection-caret-hidden")
    ;["node", "capture", "gap"].forEach(state => {
      caret.classList.remove(`◆selection-caret-${state}`)
      setPart(caret, `selection-caret-${state}`, false)
    })
    caret.classList.remove(
      "◆gap-before-selected",
      "◆gap-after-selected",
      "◆drop-caret-before",
      "◆drop-caret-after",
    )
    setPart(caret, "gap-caret", false)
    ;["gap-before-selected", "gap-after-selected", "drop-caret-before", "drop-caret-after"]
      .forEach(state => setPart(caret, `gap-caret-${state}`, false))
  }

  /** Shows the shared caret using one of its selection presentations. */
  #showSelectionCaret(state: "node" | "capture" | "gap") {
    const caret = this.selectionCaret ?? this.#createSelectionCaret()
    caret.classList.add(`◆selection-caret-${state}`)
    setPart(caret, `selection-caret-${state}`)
    setPart(caret, "selection-caret-hidden", false)
    if(state === "gap") setPart(caret, "gap-caret")
    caret.removeAttribute("visibility")
    return caret
  }

  /** Reuses the shared caret to preview a transformation drop gap. */
  showDropCaret(placement: "before" | "after") {
    const caret = this.#showSelectionCaret("gap")
    caret.classList.remove("◆drop-caret-before", "◆drop-caret-after")
    setPart(caret, "gap-caret-drop-caret-before", false)
    setPart(caret, "gap-caret-drop-caret-after", false)
    caret.classList.add(`◆drop-caret-${placement}`)
    setPart(caret, `gap-caret-drop-caret-${placement}`)
  }

  /** Clears the drop presentation, restoring the underlying selection mode. */
  clearDropCaret() {
    const caret = this.selectionCaret
    if(!caret) return
    caret.classList.remove("◆drop-caret-before", "◆drop-caret-after", "◆selection-caret-gap")
    setPart(caret, "gap-caret-drop-caret-before", false)
    setPart(caret, "gap-caret-drop-caret-after", false)
    setPart(caret, "selection-caret-gap", false)
    setPart(caret, "gap-caret", false)
    const hasSelectionPresentation = ["node", "capture"].some(state =>
      caret.classList.contains(`◆selection-caret-${state}`),
    )
    if(!hasSelectionPresentation) {
      caret.setAttribute("visibility", "hidden")
      setPart(caret, "selection-caret-hidden")
    }
  }

  #clearElementHover() {
    const hoveredElements = Array.from(document.querySelectorAll(".◆element-hovered"))
    if(document.body.classList.contains("◆element-hovered")) {
      hoveredElements.unshift(document.body)
    }
    hoveredElements.forEach(el => {
      el.classList.remove("◆element-hovered")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
  }

  /** Creates the virtual caret used only for a completely empty document.
   * Chromium keeps a valid BODY@0 selection in that state but does not paint
   * its native caret consistently. The visual element stays in the shadow
   * appendix and is positioned from the BODY selection marker. */
  #createEmptyDocumentCaret() {
    const node = document.createElement("div")
    node.classList.add("◆", "◆editor-only", "◆empty-document-caret")
    node.setAttribute("part", "empty-document-caret")
    node.setAttribute("aria-hidden", "true")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  /** The shadow-DOM visual caret for an empty document, if created. */
  get emptyDocumentCaret() {
    return this.editor.appendix.querySelector(".◆empty-document-caret")
  }

  /** Removes all selection marker classes (gap, element, text, empty) from
   * the document, dropping emptied class attributes, and hides the shared
   * non-text caret. */
  #clearSelections() {
    document.querySelectorAll(".◆gap-before-selected, .◆gap-after-selected").forEach(el => {
      el.classList.remove("◆gap-before-selected", "◆gap-after-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    this.#hideSelectionCaret()
    document.body.classList.remove("◆gap-caret-visible")
    document.querySelectorAll(".◆element-selected, .◆element-capture-selected").forEach(el => {
      el.classList.remove("◆element-selected", "◆element-capture-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    document.querySelectorAll(".◆text-selected").forEach(el => {
      el.classList.remove("◆text-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    document.querySelectorAll(".◆empty-selected").forEach(el => {
      el.classList.remove("◆empty-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
  }

  /** Re-applies the selection markers for the current selection: the gap
   * anchor and caret for gap selections (`◆gap-before/after-selected`), the
   * selected element (`◆element-selected`, skipped during drag selections),
   * the text container (`◆text-selected`) or the empty container
   * (`◆empty-selected`). Previous markers are cleared first. */
  processSelection(inDragSelection=false) {
    const focusedWidget = focusedWidgetHost()
    if(focusedWidget) this.#capturedWidget = focusedWidget
    const capturedWidget = this.isCaptureSelection ? this.#capturedWidget : null
    if(capturedWidget) {
      this.#clearSelections()
      capturedWidget.classList.add("◆", "◆element-selected", "◆element-capture-selected")
      this.#showSelectionCaret("capture")
      return
    }
    this.#releaseCaptureSelection()
    this.#constrainSelectionToBody()
    this.#constrainSelectionToMedia()
    let sel = document.getSelection()
    const isInBody = (node: Node | null) => node === document.body || Boolean(node && document.body.contains(node))
    if(sel?.isCollapsed && (!isInBody(sel.anchorNode) || !isInBody(sel.focusNode))) {
      $.selectDocumentStart()
      sel = document.getSelection()
    }
    this.#clearSelections()
    if(!sel?.anchorNode || !sel.focusNode) return
    const anchorContainer = getContainer(sel.anchorNode)
    // A collapsed point directly in a semantic list represents the next
    // prospective item. ListFeature paints a text caret and marker for that
    // point; treating it as an ordinary element gap would paint a second,
    // arrow-shaped caret and suppress the editor's caret color.
    const isVirtualListSelection = this.editor.features.list.isVirtualSelection
    if(isVirtualListSelection) {
      // Deliberately leave this selection to ListFeature.
    }
    else if($.isGapSelection) {
      const children = sel.anchorNode!.childNodes
      if(children.length) {
        const i = sel.anchorOffset
        const firstBodyElement = document.body.firstElementChild
        const firstBodyElementIndex = firstBodyElement? Array.from(children).indexOf(firstBodyElement): -1
        const isBeforeFirstBodyElement = sel.anchorNode === document.body && firstBodyElementIndex >= 0 && i <= firstBodyElementIndex &&
          Array.from(children).slice(i, firstBodyElementIndex).every(node => node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
        const nestedListAfter = isElement(sel.anchorNode)
          && sel.anchorNode.matches("li, dt, dd")
          && isElement(children.item(i))
          && (children.item(i) as Element).matches("ul, ol, dl, menu")
        const placement = i === 0 || isBeforeFirstBodyElement || nestedListAfter ? "before": "after"
        const offset = placement === "after"? -1: 0
        const element = isBeforeFirstBodyElement? firstBodyElement: children.item(i + offset) as Element
        const gapCaret = this.#showSelectionCaret("gap")
        element?.classList?.add("◆", `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        document.body.classList.add("◆gap-caret-visible")
      }
      
    }
    else if($.isElementSelection && !inDragSelection) {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      if(isElement(element)) {
        element.classList.add("◆", "◆element-selected")
        this.#showSelectionCaret("node")
      }
    }
    else if(anchorContainer && $.isTextSelection) {
      const element = getContainer($.commonAncestor)
      element?.classList.add("◆", "◆text-selected")
    }
    else if(anchorContainer && $.isEmptySelection) {
      const element = getContainer($.commonAncestor)
      if(!element) return
      element.classList.add("◆", "◆empty-selected")
      if(element === document.body && !this.emptyDocumentCaret) {
        this.#createEmptyDocumentCaret()
      }
    }
  }

  /** Observing behavior: re-apply markers on every selection change, extend
   * the drag selection on pointer moves, and mirror modifier key state onto
   * the body (`◆key-mod/alt/shift-down`). */
  passiveListeners: DocumentListenerMap = {
    "selectionchange": () => this.processSelection(this.isInDragSelection),
    "pointermove": ev => {
      // Pointer coordinates are viewport-relative. Comparing page coordinates
      // with BODY dimensions breaks as soon as BODY has margins (and for a
      // one-line document its offsetHeight can be smaller than pageY).
      const inViewportX = 0 <= ev.clientX && ev.clientX <= window.innerWidth
      const inViewportY = 0 <= ev.clientY && ev.clientY <= window.innerHeight
      if(this.isInDragSelection && inViewportX && inViewportY) {
        $.selectCoords(ev.x, ev.y, true)
      }
    },
    "keydown": ev => {
      if(modifierKeyDown(ev)) {
        document.body.classList.add("◆","◆key-mod-down")
      }
      if(ev.altKey) {
        document.body.classList.add("◆", "◆key-alt-down")
      }
      if(ev.shiftKey) {
        document.body.classList.add("◆", "◆key-shift-down")
      }
    },
    "keyup": ev => {
      if(!modifierKeyDown(ev)) {
        document.body.classList.remove("◆key-mod-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(!ev.altKey) {
        document.body.classList.remove("◆key-alt-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(!ev.shiftKey) {
        document.body.classList.remove("◆key-shift-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(document.body.classList.length === 0) {
        document.body.removeAttribute("class")
      }
    }
  }

  /** Whether the last click was part of a double click (suppresses the
   * subsequent pointerdown handling). */
  hasDoubleClicked = false

  /** Pointer behavior: 
   * pointerdown starts a drag selection at the pointer (modifier-click selects the whole element instead), 
   * double/triple click select the word/line, 
   * pointerup ends the drag selection. */
  activeListeners: DocumentListenerMap = {
    "keydown": ev => {
      const direction = arrowDirection(ev.key)
      // Arrow keys belong to the widget while it has captured interaction.
      // This guard also preserves capture for synthetic/document-level events.
      if(direction && this.isCaptureSelection) return
      this.#releaseCaptureSelection()
      if(ev.key.toLowerCase() === "a" && modifierKeyDown(ev)) {
        ev.preventDefault()
        $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
        this.processSelection()
      }
      else if(direction && !ev.defaultPrevented && !ev.altKey && !modifierKeyDown(ev) && !ev.shiftKey
        && this.#navigateAtomicSelection(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
        ev.preventDefault()
      }
      else if(ev.key === "ArrowUp" && ev.altKey) {

      } 
      else if(ev.key === "ArrowUp" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowUp") {
        const firstBodyElement = document.body.firstElementChild
        if(!ev.shiftKey && firstBodyElement && isCaretAtStartOf(firstBodyElement)) {
          ev.preventDefault()
          $.selectGap(firstBodyElement, "before")
          this.processSelection()
        }
      }
      else if(ev.key === "ArrowDown" && ev.altKey) {

      } 
      else if(ev.key === "ArrowDown" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowDown") {
        
      }
      else if(ev.key === "ArrowLeft" && ev.altKey) {

      } 
      else if(ev.key === "ArrowLeft" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowLeft") {
        
      }
      else if(ev.key === "ArrowRight" && ev.altKey) {

      } 
      else if(ev.key === "ArrowRight" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowRight") {
        
      }
    },
    "pointerdown": ev => {
      if((isElement(ev.target) && ev.target.closest(".◆editor-only")) || this.hasDoubleClicked || ev.button === 2) {
        return
      }
      this.#releaseCaptureSelection()
      const media = ev.target instanceof Node ? mediaContainerForNode(ev.target) : null
      if(media) {
        ev.preventDefault()
        $.selectElement(media)
        this.processSelection()
        return
      }
      if($.isEmptyDocumentSelection) {
        // Browsers focus an empty design-mode body on pointerdown but do not
        // consistently create a DOM selection for it. Restore the editing
        // position explicitly; pointerup restores it after the browser's
        // default focus action has completed.
        $.selectDocumentStart()
        this.processSelection()
        return
      }
      if(modifierKeyDown(ev)) {
        ev.preventDefault()
        $.selectElement(getContainer(ev.target as Node))
        this.processSelection(this.isInDragSelection)
      }
      else {
        this.isInDragSelection = true
        ev.preventDefault()
        $.selectCoords(ev.x, ev.y, ev.shiftKey)
        this.processSelection(this.isInDragSelection)
      }
    },
    "click": ev => {
      this.hasDoubleClicked = false
      if(ev.button === 2 || $.isElementSelection) {
        return
      }
      else if(ev.detail === 2) {
        this.hasDoubleClicked = true
        $.moveBy("word", "backward")
        $.extendBy("word")
      }
      else if(ev.detail >= 3) {
        this.hasDoubleClicked = true
        $.moveBy("line", "backward")
        $.extendBy("line")
      }
    },
    "pointerup": ev => {
      this.isInDragSelection = false
      if(document.body.childNodes.length === 0) {
        $.selectDocumentStart()
        this.processSelection()
      }
    }
  }
}
