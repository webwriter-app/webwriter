import { DocumentListenerMap, EditorFeature } from "."
import {$, focusedWidgetHost, getContainer, isElement, modifierKeyDown, setPart, widgetHostForShadowInteraction} from "../utility"
import {mediaContainerForNode} from "../media"

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
    const index = Array.from(parent.childNodes).indexOf(node)
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
 * and applies the corresponding `◆…-selected` marker classes, manages the gap
 * caret element, mirrors modifier key state onto the body, and implements
 * pointer-based selection (drag selection, modifier-click element selection). */
export class SelectionFeature extends EditorFeature {

  #sharedRefreshQueued = false

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
    document.addEventListener("pointerdown", this.#handleWidgetShadowInteraction, {capture: true})
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    this.processSelection()
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    document.removeEventListener("pointerdown", this.#handleWidgetShadowInteraction, {capture: true})
    this.#clearElementHover()
    super.disable()
  }

  /** Keeps widget shadow trees atomic without cancelling their own controls.
   * Regular feature listeners ignore these events, so they cannot start or
   * extend an editor drag selection. Selecting the host before pointerdown's
   * native action leaves that action free to establish the widget's own focus
   * and shadow-tree caret; subsequent widget input is left untouched. */
  readonly #handleWidgetShadowInteraction = (event: Event) => {
    const widget = widgetHostForShadowInteraction(event)
    if(!widget) return
    this.isInDragSelection = false
    if(!($.isElementSelection && $.selectedElement === widget)) {
      $.selectElement(widget, false)
    }
    this.processSelection()
  }

  /** Selects the element addressed by a child-node path from BODY. */
  actions = {
    selectNode: ({path}: {type: "selectNode", path: number[]}) => {
      const node = this.#elementAtPath(path)
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
    return document.querySelector(":not(.◆gap-caret).◆gap-before-selected, :not(.◆gap-caret).◆gap-after-selected")
  }

  /** Creates the gap caret element and adds it to the editor appendix. */
  #createGapCaret() {
    const node = document.createElement("div")
    node.classList.add("◆gap-caret")
    node.setAttribute("part", "gap-caret gap-caret-hidden")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  /** The gap caret element (shown in gaps between elements), or null if it
   * has not been created yet. */
  get gapCaret() {
    return this.editor.appendix.querySelector(".◆gap-caret")
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
   * the document, dropping emptied class attributes, and hides the gap caret. */
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
    this.gapCaret?.setAttribute("visibility", "hidden")
    document.body.classList.remove("◆gap-caret-visible")
    if(this.gapCaret) {
      setPart(this.gapCaret, "gap-caret-hidden")
      ;["gap-before-selected", "gap-after-selected", "drop-caret-before", "drop-caret-after"].forEach(state => setPart(this.gapCaret!, `gap-caret-${state}`, false))
    }
    document.querySelectorAll(".◆element-selected").forEach(el => {
      el.classList.remove("◆element-selected")
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
    if(focusedWidget) {
      this.#clearSelections()
      focusedWidget.classList.add("◆", "◆element-selected")
      return
    }
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
        const gapCaret = this.gapCaret ?? this.#createGapCaret()
        element?.classList?.add("◆", `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        setPart(gapCaret, "gap-caret-hidden", false)
        document.body.classList.add("◆gap-caret-visible")
        gapCaret.removeAttribute("visibility")
      }
      
    }
    else if($.isElementSelection && !inDragSelection) {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      if(isElement(element)) {
        element.classList.add("◆", "◆element-selected")
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
      if(ev.key.toLowerCase() === "a" && modifierKeyDown(ev)) {
        ev.preventDefault()
        $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
        this.processSelection()
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
