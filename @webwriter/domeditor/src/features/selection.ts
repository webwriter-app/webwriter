import { DocumentListenerMap, EditorFeature } from "."
import {$, caretRect, focusedWidgetHost, getContainer, isAtomicEditingElement, isElement, modifierKeyDown, setPart, widgetHostForScrollEvent, widgetHostForShadowInteraction} from "../utility"
import {mediaContainerForNode} from "../media"
import {isSectionElement} from "../sections"
import {getDocumentRoot, isDocumentRoot} from "../document-template"

type SelectionKind = "none" | "capture" | "section" | "virtual" | "cell" | "gap" | "element" | "text" | "empty"

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
  #capturedElement: Element | null = null
  #selectedSection: Element | null = null

  /** Whether the current widget node selection also captures interactions in
   * that widget's shadow tree. Capture survives shadow-tree focus changes and
   * is released by the next ordinary editor selection interaction. */
  get isCaptureSelection() {
    return this.captureSelectedElement !== null
  }

  /** The connected authored element that currently owns capture. */
  get captureSelectedElement() {
    return this.#capturedElement?.isConnected ? this.#capturedElement : null
  }

  /** The connected widget whose interaction is currently captured. Native
   * shadow-control actions may project their selection to an outer gap, so
   * capture ownership cannot be inferred from focus or Selection alone. */
  get captureSelectedWidget() {
    return this.captureSelectedElement
  }

  #releaseCaptureSelection() {
    this.#capturedElement = null
  }

  /** The connected section explicitly selected through the breadcrumb. This
   * state is deliberately separate from the native Selection so ordinary
   * editing never acquires a section wrapper as its target. */
  get selectedSectionElement() {
    return this.#selectedSection?.isConnected && isSectionElement(this.#selectedSection)
      ? this.#selectedSection
      : null
  }

  clearSelectedSection(expected?: Element) {
    if(expected && this.#selectedSection !== expected) return
    this.#selectedSection = null
  }

  replaceSelectedSection(previous: Element, replacement: Element) {
    if(this.#selectedSection === previous && isSectionElement(replacement)) {
      this.#selectedSection = replacement
    }
  }

  /** Capture-selects an authored element while keeping its internal pointer
   * interactions available to a focused feature such as SVG graphics. */
  captureElement(element: Element) {
    if(!element.isConnected || element === document.body || !document.body.contains(element)) return
    this.clearSelectedSection()
    this.#capturedElement = element
    $.selectElement(element, false)
    this.processSelection()
  }

  #selectionBlock() {
    const root = getDocumentRoot()
    let node = $.anchor
    while(node && node !== root) {
      if(node instanceof Element && !isSectionElement(node) && this.editor.schema.isBlock(node)) return node
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
      this.editor.features.graphic.refresh()
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
    const root = getDocumentRoot()
    const rootRange = document.createRange()
    rootRange.selectNodeContents(root)
    const clamp = (node: Node, offset: number): [Node, number] => {
      if(node === root || root.contains(node)) {
        return [node, offset]
      }
      let relation: number
      try {
        relation = rootRange.comparePoint(node, offset)
      }
      catch {
        relation = -1
      }
      return relation < 0? [root, 0]: [root, root.childNodes.length]
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
    const first = document.body.firstElementChild
    if(first?.localName === this.editor.schema.defaultNodeKey
      && document.body.childNodes.length === 1 && !first.childNodes.length) $.move(first)
    else $.selectDocumentStart()
    super.enable()
    this.#ensureHoverCaret()
    document.addEventListener("click", this.#handleModifierClick, {capture: true})
    document.addEventListener("keydown", this.#handleKeyState, {capture: true})
    document.addEventListener("keyup", this.#handleKeyState, {capture: true})
    this.#widgetInteractionEvents.forEach(type => {
      document.addEventListener(type, this.#handleWidgetShadowInteraction, {capture: true})
    })
    document.addEventListener("wheel", this.#handleWidgetWheel, {capture: true, passive: false})
    document.addEventListener("scroll", this.#handleWidgetScroll, {capture: true})
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    this.processSelection()
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    document.removeEventListener("click", this.#handleModifierClick, {capture: true})
    document.removeEventListener("keydown", this.#handleKeyState, {capture: true})
    document.removeEventListener("keyup", this.#handleKeyState, {capture: true})
    this.#widgetInteractionEvents.forEach(type => {
      document.removeEventListener(type, this.#handleWidgetShadowInteraction, {capture: true})
    })
    document.removeEventListener("wheel", this.#handleWidgetWheel, {capture: true})
    document.removeEventListener("scroll", this.#handleWidgetScroll, {capture: true})
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.#clearElementHover()
    this.#clearStyleTargetHover()
    this.#clearSelections()
    this.isInDragSelection = false
    this.dragAnchor = null
    ;[document.documentElement, document.body].forEach(element => {
      element.classList.remove("◆key-mod-down", "◆key-alt-down", "◆key-shift-down")
      if(!Array.from(element.classList).some(marker => marker !== "◆" && marker.startsWith("◆"))) {
        element.classList.remove("◆")
      }
      if(!element.classList.length) element.removeAttribute("class")
    })
    super.disable()
  }

  readonly #widgetInteractionEvents = ["pointerdown", "focusin", "keydown", "beforeinput", "input", "change"] as const

  /** Mirrors the physical modifier state onto BODY without depending on the
   * regular feature listeners, which intentionally ignore widget events. */
  readonly #handleKeyState = (event: KeyboardEvent) => {
    const states = [
      ["◆key-mod-down", modifierKeyDown(event)],
      ["◆key-alt-down", event.altKey],
      ["◆key-shift-down", event.shiftKey],
    ] as const
    ;[document.documentElement, document.body].forEach(element => {
      states.forEach(([marker, active]) => element.classList.toggle(marker, active))
      if(states.some(([, active]) => active)) element.classList.add("◆")
      else if(!Array.from(element.classList).some(marker => marker !== "◆" && marker.startsWith("◆"))) {
        element.classList.remove("◆")
      }
      if(!element.classList.length) element.removeAttribute("class")
    })
    if(!document.body.classList.length) document.body.removeAttribute("class")
  }

  /** Cancels native modifier-click actions (navigation, activation, focus)
   * during capture, except inside the widget that currently owns capture. */
  readonly #handleModifierClick = (event: MouseEvent) => {
    const widget = widgetHostForShadowInteraction(event)
    if(event.button === 0 && modifierKeyDown(event)
      && (!widget || widget !== this.captureSelectedWidget)) {
      event.preventDefault()
    }
  }

  /** Routes wheel input over an inactive widget to the editor document instead
   * of letting the widget consume it (for example, to zoom a map).
   * Capture-selected widgets retain their native wheel behavior. */
  readonly #handleWidgetWheel = (event: WheelEvent) => {
    const widget = widgetHostForShadowInteraction(event)
    if(!widget || widget === this.captureSelectedWidget) return
    event.stopPropagation()
    // Preserve browser page zoom while still keeping the event out of the
    // widget. Regular wheel scrolling has to be redirected explicitly because
    // stopping propagation does not retarget the wheel's default action.
    if(event.ctrlKey) return
    event.preventDefault()
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? window.innerHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? parseFloat(getComputedStyle(document.documentElement).lineHeight) || 16
        : 1
    window.scrollBy({left: event.deltaX * unit, top: event.deltaY * unit, behavior: "instant"})
  }

  /** Keeps inactive widgets from observing scrolls on their own surface or in
   * their shadow tree. Document capture listeners still receive the event so
   * editor overlays can follow layout changes. */
  readonly #handleWidgetScroll = (event: Event) => {
    const widget = widgetHostForScrollEvent(event)
    if(widget && widget !== this.captureSelectedWidget) event.stopPropagation()
  }

  /** Keeps widget shadow trees atomic without cancelling their own controls.
   * Regular feature listeners ignore these events, so they cannot start or
   * extend an editor drag selection. The first interaction node-selects and
   * captures the host while leaving the widget's native focus, caret, input,
   * and event handling untouched. */
  readonly #handleWidgetShadowInteraction = (event: Event) => {
    const widget = widgetHostForShadowInteraction(event)
    if(!widget) return
    if(widget === this.captureSelectedWidget) return
    this.clearSelectedSection()
    this.isInDragSelection = false
    if(event instanceof MouseEvent && event.type === "pointerdown"
      && event.button === 0 && modifierKeyDown(event)) {
      event.preventDefault()
      const selectCapture = this.captureSelectedWidget !== widget
        && widget.classList.contains("◆element-selected")
        && $.isElementSelection
        && $.selectedElement === widget
      if(selectCapture) {
        this.#capturedElement = widget
        $.selectElement(widget, false)
      }
      else {
        this.#releaseCaptureSelection()
        $.selectElement(widget)
      }
      this.processSelection()
      this.editor.postSelectionPath()
      return
    }
    this.#capturedElement = widget
    // Pointerdown happens before the widget establishes its own focus/caret,
    // so it is safe to establish the outer atomic node range here. Later
    // focus, keyboard, and input events must not rewrite shadow selection.
    if(event.type === "pointerdown" && !($.isElementSelection && $.selectedElement === widget)) {
      $.selectElement(widget, false)
    }
    this.processSelection()
    this.editor.postSelectionPath()
  }

  /** Returns a phrase-aware target for modifier-click node selection.
   * Phrasing elements plus BR/WBR always bubble to their container so node
   * selection stays on a structural element. */
  #modifierSelectionTarget(target: EventTarget | null) {
    if(!(target instanceof Node)) return null
    let targetElement = getContainer(target)
    const table = targetElement.closest("table")
    if(table) return table
    while(targetElement && (targetElement.matches("br, wbr") || this.editor.schema.isPhrasing(targetElement))) {
      const parent = targetElement.parentElement
      if(!parent) break
      targetElement = parent
    }
    return isDocumentRoot(targetElement) ? targetElement : targetElement === document.body ? null : targetElement
  }

  /** Selects the element addressed by a child-node path from BODY. */
  actions = {
    selectNode: ({path}: {type: "selectNode", path: number[]}) => {
      const node = this.#elementAtPath(path)
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      $.selectElement(node)
      this.processSelection()
    },
    selectSection: ({path}: {type: "selectSection", path: number[]}) => {
      const section = this.#rawElementAtPath(path)
      if(!isSectionElement(section)) throw new TypeError("A section path must resolve to a section element")
      this.#releaseCaptureSelection()
      this.#selectedSection = section
      this.processSelection()
      this.editor.postMarkState()
      this.editor.postSelectionPath()
    },
    hoverNode: ({path}: {type: "hoverNode", path: number[] | null}) => {
      this.#clearElementHover()
      this.#clearStyleTargetHover()
      if(path === null) return

      const pathElement = this.#elementAtPath(path)
      const element = pathElement.closest("table") ?? pathElement
      element.classList.add("◆", "◆element-hovered")
    },
    hoverSection: ({path}: {type: "hoverSection", path: number[] | null}) => {
      this.#clearElementHover()
      this.#clearStyleTargetHover()
      if(path === null) return

      const section = this.#rawElementAtPath(path)
      if(!isSectionElement(section)) throw new TypeError("A section path must resolve to a section element")
      section.classList.add("◆", "◆element-hovered")
    },
    hoverStyleTarget: ({hovered}: {type: "hoverStyleTarget", hovered: boolean}) => {
      this.#clearStyleTargetHover()
      if(!hovered) return

      this.#clearElementHover()
      this.editor.features.manipulation.styleTarget.classList.add("◆", "◆style-target-hovered")
    },
  } as const

  /** Resolves a BODY-relative child-node path to an element. */
  #elementAtPath(path: number[]) {
    return getContainer(this.#rawElementAtPath(path))
  }

  #rawElementAtPath(path: number[]) {
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
    return node
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
    caret.classList.remove("◆drop-caret-before", "◆drop-caret-after")
    setPart(caret, "gap-caret-drop-caret-before", false)
    setPart(caret, "gap-caret-drop-caret-after", false)
    const hasGapSelection = caret.classList.contains("◆gap-before-selected")
      || caret.classList.contains("◆gap-after-selected")
    if(!hasGapSelection) {
      caret.classList.remove("◆selection-caret-gap")
      setPart(caret, "selection-caret-gap", false)
      setPart(caret, "gap-caret", false)
    }
    const hasSelectionPresentation = ["node", "capture"].some(state =>
      caret.classList.contains(`◆selection-caret-${state}`),
    ) || hasGapSelection
    if(!hasSelectionPresentation) {
      caret.setAttribute("visibility", "hidden")
      setPart(caret, "selection-caret-hidden")
    }
    else {
      caret.removeAttribute("visibility")
      setPart(caret, "selection-caret-hidden", false)
    }
  }

  #clearElementHover() {
    this.#clearHoverMarker("◆element-hovered")
  }

  #clearStyleTargetHover() {
    this.#clearHoverMarker("◆style-target-hovered")
  }

  #clearHoverMarker(marker: "◆element-hovered" | "◆style-target-hovered") {
    const hoveredElements = Array.from(document.querySelectorAll(`.${marker}`))
    if(document.body.classList.contains(marker)) {
      hoveredElements.unshift(document.body)
    }
    hoveredElements.forEach(el => {
      el.classList.remove(marker)
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
    document.body.classList.remove("◆gap-caret-visible", "◆node-selection-active")
    if(!Array.from(document.body.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
      document.body.classList.remove("◆")
    }
    if(document.body.classList.length === 0) {
      document.body.removeAttribute("class")
    }
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

  /** Replaces malformed or newly entered element selections with one
   * canonical forward range. This resets browser selection direction/state
   * left over from a preceding text selection, regardless of who changed the
   * document Selection. */
  #normalizeNativeSelection() {
    let selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    if(selection.rangeCount !== 1) {
      selection.setBaseAndExtent(
        selection.anchorNode,
        selection.anchorOffset,
        selection.focusNode,
        selection.focusOffset,
      )
      selection = document.getSelection()
      if(!selection?.anchorNode || !selection.focusNode) return
    }
    const element = $.selectedElement ?? null
    if(!element) return
    const parent = element.parentNode
    if(!parent) return
    const index = Array.from(parent.childNodes).indexOf(element)
    if(index < 0) return
    const hasCanonicalEndpoints = selection.anchorNode === parent
      && selection.anchorOffset === index
      && selection.focusNode === parent
      && selection.focusOffset === index + 1
    // Selection.direction is separate browser state that can survive an
    // in-place Range mutation. A node selection is always represented by the
    // forward parent range [index, index + 1].
    const hasCanonicalDirection = selection.direction === undefined || selection.direction === "forward"
    if(!hasCanonicalEndpoints || !hasCanonicalDirection) {
      selection.setBaseAndExtent(parent, index, parent, index + 1)
    }
  }

  /** Classifies the normalized live selection exactly once so only one
   * presentation branch can be applied during this refresh. */
  #selectionKind(inDragSelection: boolean, capturedElement: Element | null): SelectionKind {
    if(capturedElement) return "capture"
    if(this.selectedSectionElement) return "section"
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return "none"
    if(this.editor.features.table.hasCellSelection) return "cell"
    if(this.editor.features.list.isVirtualSelection) return "virtual"
    if($.isGapSelection) return "gap"
    if($.isElementSelection) return inDragSelection ? "none" : "element"
    const anchorContainer = getContainer(selection.anchorNode)
    if(anchorContainer && $.isTextSelection) return "text"
    if(anchorContainer && $.isEmptySelection) return "empty"
    return "none"
  }

  /** Smoothly reveals the selection's logical focus. Node-like selections
   * reveal their authored element. Caret-like selections scroll each nested
   * scrolling box and then the viewport by only the distance needed to expose
   * the focus caret. */
  #scrollSelectionIntoView(kind: SelectionKind, selection: Selection | null, capturedElement: Element | null) {
    const selectedElement = kind === "capture" ? capturedElement
      : kind === "section" ? this.selectedSectionElement
        : kind === "element" ? $.selectedElement
          : kind === "cell" ? this.editor.features.table.selectionFocusCell
            : null
    if(selectedElement) {
      selectedElement.scrollIntoView({behavior: "smooth", block: "nearest", inline: "nearest"})
      return
    }
    if(!selection?.focusNode || !["virtual", "gap", "text", "empty"].includes(kind)) return

    const rect = caretRect(selection.focusNode, selection.focusOffset)
    let predicted = {
      left: rect.left,
      right: rect.right > rect.left ? rect.right : rect.left + 1,
      top: rect.top,
      bottom: rect.bottom > rect.top ? rect.bottom : rect.top + 1,
    }
    const nearestDelta = (start: number, end: number, visibleStart: number, visibleEnd: number) => {
      if(start < visibleStart && end > visibleEnd) {
        const startDelta = start - visibleStart
        const endDelta = end - visibleEnd
        return Math.abs(startDelta) <= Math.abs(endDelta) ? startDelta : endDelta
      }
      if(start < visibleStart) return start - visibleStart
      if(end > visibleEnd) return end - visibleEnd
      return 0
    }
    const scroll = (target: Element, left: number, top: number) => {
      const maxLeft = Math.max(0, target.scrollWidth - target.clientWidth)
      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight)
      const rtl = getComputedStyle(target).direction === "rtl"
      const minScrollLeft = rtl ? -maxLeft : 0
      const maxScrollLeft = rtl ? 0 : maxLeft
      const nextScrollLeft = Math.max(minScrollLeft, Math.min(target.scrollLeft + left, maxScrollLeft))
      left = nextScrollLeft - target.scrollLeft
      top = Math.max(-target.scrollTop, Math.min(top, maxTop - target.scrollTop))
      if(!left && !top) return
      target.scrollBy({left, top, behavior: "smooth"})
      predicted = {
        left: predicted.left - left,
        right: predicted.right - left,
        top: predicted.top - top,
        bottom: predicted.bottom - top,
      }
    }

    let ancestor = selection.focusNode instanceof Element
      ? selection.focusNode
      : selection.focusNode.parentElement
    while(ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor)
      const canScrollX = ancestor.scrollWidth > ancestor.clientWidth
        && style.overflowX !== "visible" && style.overflowX !== "clip"
      const canScrollY = ancestor.scrollHeight > ancestor.clientHeight
        && style.overflowY !== "visible" && style.overflowY !== "clip"
      if(canScrollX || canScrollY) {
        const viewport = ancestor.getBoundingClientRect()
        const visibleLeft = viewport.left + ancestor.clientLeft
        const visibleTop = viewport.top + ancestor.clientTop
        const left = canScrollX
          ? nearestDelta(predicted.left, predicted.right, visibleLeft, visibleLeft + ancestor.clientWidth)
          : 0
        const top = canScrollY
          ? nearestDelta(predicted.top, predicted.bottom, visibleTop, visibleTop + ancestor.clientHeight)
          : 0
        scroll(ancestor, left, top)
      }
      ancestor = ancestor.parentElement
    }

    const left = nearestDelta(predicted.left, predicted.right, 0, window.innerWidth)
    const top = nearestDelta(predicted.top, predicted.bottom, 0, window.innerHeight)
    if(left || top) window.scrollBy({left, top, behavior: "smooth"})
  }

  /** Normalizes and re-applies exactly one selection kind for the current
   * document Selection. This is the invariant boundary used by native
   * selectionchange events and every editor-driven refresh. */
  processSelection(inDragSelection=false) {
    const focusedWidget = focusedWidgetHost()
    if(focusedWidget) this.#capturedElement = focusedWidget
    const capturedElement = this.captureSelectedElement
    let sel: Selection | null
    if(capturedElement) {
      this.#normalizeNativeSelection()
      this.editor.features.list.clearSelectionPresentation()
      sel = document.getSelection()
    }
    else {
      this.#releaseCaptureSelection()
      this.#constrainSelectionToBody()
      this.#constrainSelectionToMedia()
      sel = document.getSelection()
      const root = getDocumentRoot()
      const isInRoot = (node: Node | null) => node === root || Boolean(node && root.contains(node))
      if(sel?.isCollapsed && (!isInRoot(sel.anchorNode) || !isInRoot(sel.focusNode))) {
        $.selectDocumentStart()
        sel = document.getSelection()
      }
      this.#normalizeNativeSelection()
      sel = document.getSelection()
      this.editor.features.list.clearSelectionPresentation()
    }
    const kind = this.#selectionKind(inDragSelection, capturedElement)
    this.#clearSelections()
    this.#scrollSelectionIntoView(kind, sel, capturedElement)
    if(kind === "cell") return
    if(kind === "virtual") {
      this.editor.features.list.refreshSelectionPresentation()
      return
    }
    if(kind === "capture" && capturedElement) {
      document.body.classList.add("◆", "◆node-selection-active")
      capturedElement.classList.add("◆", "◆element-selected", "◆element-capture-selected")
      this.#showSelectionCaret("capture")
      return
    }
    if(kind === "section") {
      const section = this.selectedSectionElement
      if(!section) return
      document.body.classList.add("◆", "◆node-selection-active")
      section.classList.add("◆", "◆element-selected")
      this.#showSelectionCaret("node")
      return
    }
    if(!sel?.anchorNode || !sel.focusNode) return
    if(kind === "gap") {
      const children = sel.anchorNode!.childNodes
      if(children.length) {
        const i = sel.anchorOffset
        const before = Array.from(children).slice(0, i).reverse().find(isElement)
        const after = Array.from(children).slice(i).find(isElement)
        const nestedListAfter = isElement(sel.anchorNode)
          && sel.anchorNode.matches("li, dt, dd")
          && isElement(children.item(i))
          && (children.item(i) as Element).matches("ul, ol, dl, menu")
        const placement = !before || nestedListAfter ? "before": "after"
        const element = placement === "after" ? before : after
        const gapCaret = this.#showSelectionCaret("gap")
        element?.classList?.add("◆", `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        document.body.classList.add("◆gap-caret-visible")
      }
      
    }
    else if(kind === "element") {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      if(isElement(element)) {
        document.body.classList.add("◆", "◆node-selection-active")
        element.classList.add("◆", "◆element-selected")
        this.#showSelectionCaret("node")
      }
    }
    else if(kind === "text") {
      const element = getContainer($.commonAncestor)
      element?.classList.add("◆", "◆text-selected")
    }
    else if(kind === "empty") {
      const element = getContainer($.commonAncestor)
      if(!element) return
      element.classList.add("◆", "◆empty-selected")
      if(isDocumentRoot(element) && !this.emptyDocumentCaret) {
        this.#createEmptyDocumentCaret()
      }
    }
  }

  /** Observing behavior: re-apply markers on every selection change, extend
   * the drag selection on pointer moves, and mirror modifier key state onto
   * the body (`◆key-mod/alt/shift-down`). */
  passiveListeners: DocumentListenerMap = {
    "selectionchange": () => {
      if(this.editor.features.media.isPlaceholderInteraction) return
      this.clearSelectedSection()
      this.processSelection(this.isInDragSelection)
    },
    "pointermove": ev => {
      // Pointer coordinates are viewport-relative. Comparing page coordinates
      // with BODY dimensions breaks as soon as BODY has margins (and for a
      // one-line document its offsetHeight can be smaller than pageY).
      const inViewportX = 0 <= ev.clientX && ev.clientX <= window.innerWidth
      const inViewportY = 0 <= ev.clientY && ev.clientY <= window.innerHeight
      if(this.isInDragSelection && inViewportX && inViewportY) {
        $.selectCoords(ev.clientX, ev.clientY, true, ev.target)
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
      // Captured widgets and interactive authored elements own their keyboard
      // events. The shared listener router normally enforces this guard; keep
      // it here as the direct-call invariant as well.
      if(this.isCaptureSelection) return
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      if(ev.key.toLowerCase() === "a" && modifierKeyDown(ev)) {
        ev.preventDefault()
        const root = getDocumentRoot()
        $.selectRange(root, 0, root, root.childNodes.length)
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
        const firstRootElement = getDocumentRoot().firstElementChild
        if(!ev.shiftKey && firstRootElement && isCaretAtStartOf(firstRootElement)) {
          ev.preventDefault()
          $.selectGap(firstRootElement, "before")
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
      this.clearSelectedSection()
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
        const target = this.#modifierSelectionTarget(ev.target)
        if(target) {
          $.selectElement(target)
        }
        this.processSelection(this.isInDragSelection)
      }
      else {
        this.isInDragSelection = true
        ev.preventDefault()
        $.selectCoords(ev.clientX, ev.clientY, ev.shiftKey, ev.target)
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
      if(getDocumentRoot().childNodes.length === 0) {
        $.selectDocumentStart()
        this.processSelection()
      }
    }
  }
}
