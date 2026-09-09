import { DocumentListenerMap, EditorFeature } from "."
import {$, atomicEditingContainer, caretRect, isAppendixInteraction, focusedWidgetHost, getContainer, isAtomicEditingElement, isElement, modifierKeyDown, setPart, widgetHostForScrollEvent, widgetHostForShadowInteraction} from "../utility"
import {mediaContainerForNode} from "../media"
import {graphicContainerForNode} from "../graphic"
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
  #drag: {anchor: Range, focus: Range, x: number, y: number, nativeClick: boolean, moved: boolean, target: Element, pointerId?: number} | null = null
  #selectionMarkers = new Set<Element>()
  #atomicOverlays = new Map<Element, HTMLElement>()
  #atomicOverlayFrame: number | null = null

  #clearAtomicOverlays() {
    if(this.#atomicOverlayFrame !== null) cancelAnimationFrame(this.#atomicOverlayFrame)
    this.#atomicOverlayFrame = null
    this.#atomicOverlays.forEach(overlay => overlay.remove())
    this.#atomicOverlays.clear()
  }

  /** Measure live boxes while selected, including scrolling, resizing and
   * widget-driven layout changes that do not mutate the authored DOM. */
  readonly #positionAtomicOverlays = () => {
    this.#atomicOverlayFrame = null
    this.#atomicOverlays.forEach((overlay, element) => {
      if(!document.body.contains(element)) {
        overlay.remove()
        this.#atomicOverlays.delete(element)
        return
      }
      const rect = element.getBoundingClientRect()
      overlay.style.left = `${rect.left}px`
      overlay.style.top = `${rect.top}px`
      overlay.style.width = `${rect.width}px`
      overlay.style.height = `${rect.height}px`
    })
    if(this.#atomicOverlays.size) {
      this.#atomicOverlayFrame = requestAnimationFrame(this.#positionAtomicOverlays)
    }
  }

  #showAtomicOverlays(selection: Selection) {
    if(selection.isCollapsed || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    const visit = (element: Element) => {
      if(!range.intersectsNode(element)) return
      const children = element.children
      const isTable = element.localName === "table"
      if(isTable || isAtomicEditingElement(element)) {
        const parent = element.parentNode!
        const index = Array.from(parent.childNodes).indexOf(element)
        // Touching an edge or selecting a control's internal text is not a
        // selection of that host. Fully selected tables also use one overlay
        // instead of highlighting their atomic descendants twice.
        if(range.comparePoint(parent, index) === 0 && range.comparePoint(parent, index + 1) === 0) {
          this.#markSelection(element, "◆atomic-range-selected")
          const overlay = document.createElement("div")
          overlay.classList.add("◆", "◆editor-only")
          overlay.setAttribute("part", "atomic-selection-overlay")
          overlay.setAttribute("aria-hidden", "true")
          overlay.contentEditable = "false"
          this.editor.addAppendix(overlay)
          this.#atomicOverlays.set(element, overlay)
          return
        }
        // A partial table range can still fully select atomic cell contents.
        if(!isTable) return
      }
      Array.from(children).forEach(visit)
    }
    Array.from(getDocumentRoot().children).forEach(visit)
    this.#positionAtomicOverlays()
  }

  /** Whether the current widget node selection also captures interactions in
   * that widget's shadow tree. Capture survives shadow-tree focus changes and
   * is released by the next ordinary editor selection interaction. */
  get isCaptureSelection() {
    return this.captureSelectedElement !== null
  }

  /** The connected authored element that currently owns capture. */
  get captureSelectedElement() {
    return this.#capturedElement && document.body.contains(this.#capturedElement) ? this.#capturedElement : null
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
   * interactions available to a focused feature such as SVG graphics.
   * Focused appendix controls can preserve their native text selection. */
  captureElement(element: Element, {preserveNativeSelection = false} = {}) {
    if(!element.isConnected || element === document.body || !document.body.contains(element)) return
    this.clearSelectedSection()
    this.#capturedElement = element
    if(!preserveNativeSelection) $.selectElement(element, false)
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

  /** Finds an element immediately beside the live caret or the edge of its
   * containing block, ignoring invisible formatting nodes between siblings. */
  #adjacentNavigationElement(direction: "backward" | "forward", fromBlockBoundary = false) {
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
          return adjacent
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
      let adjacent = this.#adjacentNavigationElement(direction)
      if(adjacent && !isAtomicEditingElement(adjacent)) adjacent = null
      const block = this.#selectionBlock()
      if(!adjacent && block && (vertical || this.#isCaretAtBlockBoundary(block, direction))) {
        adjacent = this.#adjacentNavigationElement(direction, true)
      }
      if(!adjacent || !isAtomicEditingElement(adjacent)) return false
      $.selectElement(adjacent)
    }
    this.processSelection()
    return true
  }

  /** Visible editing edge of a disclosure. Closed disclosures expose only
   * their summary; custom elements remain atomic and are never traversed. */
  #disclosureEdge(node: Node, direction: "backward" | "forward"): Node | null {
    if(node instanceof Text) return node.textContent?.trim() ? node : null
    if(!isElement(node) || node.matches("br, [hidden], .◆editor-only") || getComputedStyle(node).display === "none") return null
    if(Boolean(isAtomicEditingElement(node))) return node
    if(node.matches("details:not([open])")) {
      const summary = node.querySelector(":scope > summary")
      return summary ? this.#disclosureEdge(summary, direction) : node
    }
    const children = Array.from(node.childNodes)
    if(direction === "forward") children.reverse()
    for(const child of children) {
      const edge = this.#disclosureEdge(child, direction)
      if(edge) return edge
    }
    return node
  }

  #atDisclosureEdge(scope: Element, direction: "backward" | "forward", vertical: boolean) {
    const edge = this.#disclosureEdge(scope, direction)
    const end = direction === "forward"
    const offset = edge ? end ? edge instanceof Text ? edge.length : edge.childNodes.length : 0 : 0
    if(edge === $.anchor && offset === $.anchorOffset) return true
    if(this.#isCaretAtBlockBoundary(scope, direction)) return true
    if(!vertical || !$.anchor || !scope.contains($.anchor)) return false
    if(!edge || typeof Range.prototype.getBoundingClientRect !== "function") return false
    const boundary = caretRect(edge, offset)
    const caret = caretRect($.anchor, $.anchorOffset)
    return caret.height > 0 && boundary.height > 0
      && Math.abs((end ? caret.bottom : caret.top) - (end ? boundary.bottom : boundary.top)) < 2
  }

  #navigateDisclosureGap(direction: "backward" | "forward", vertical: boolean) {
    const selected = $.selectedElement
    if(selected?.matches("details")) {
      $.selectGap(selected, direction === "backward" ? "before" : "after")
      this.processSelection()
      return true
    }
    if(!$.isEmpty || !$.anchor || !getDocumentRoot().contains($.anchor)) return false
    const adjacent = this.#adjacentNavigationElement(direction)
    if($.detailsGap) {
      const outer = getContainer($.anchor).closest("details")
      if(outer?.open && this.#atDisclosureEdge(outer, direction, false)) {
        $.selectGap(outer, direction === "backward" ? "before" : "after")
        this.processSelection()
        return true
      }
      if(!adjacent) return this.#isCaretAtBlockBoundary(getDocumentRoot(), direction)
      const edge = this.#disclosureEdge(adjacent, direction === "forward" ? "backward" : "forward")
      if(!edge) return false
      if(isAtomicEditingElement(edge)) $.selectElement(edge)
      else $.move(edge, direction === "forward" ? 0 : -1)
    }
    else {
      const details = getContainer($.anchor).closest("details")
      const scope = details?.open ? details : details?.querySelector(":scope > summary")
      if(details && scope && this.#atDisclosureEdge(scope, direction, vertical)) {
        $.selectGap(details, direction === "backward" ? "before" : "after")
      }
      else {
        const block = this.#selectionBlock()
        const neighbor = adjacent ?? (block && this.#atDisclosureEdge(block, direction, vertical)
          ? this.#adjacentNavigationElement(direction, true) : null)
        if(!neighbor?.matches("details")) return false
        $.selectGap(neighbor, direction === "forward" ? "before" : "after")
      }
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

  /** Media, SVG interiors and uncaptured shadow endpoints are atomic. Move only
   * the affected endpoints to their host boundaries, preserving outer ranges. */
  #constrainSelectionToAtomicContent() {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const atomic = (node: Node) => node.getRootNode() instanceof ShadowRoot
      ? atomicEditingContainer(node) : mediaContainerForNode(node) ?? (graphicContainerForNode(node) ? atomicEditingContainer(node) : null)
    const anchor = atomic(selection.anchorNode)
    const focus = atomic(selection.focusNode)
    if(!anchor && !focus) return
    if(anchor && anchor === focus && !this.isInDragSelection) {
      $.selectElement(anchor)
      return
    }
    const backward = $.isBackwards
    const outside = (element: Element | null, node: Node, offset: number, after: boolean): [Node, number] => {
      if(!element?.parentNode) return [node, offset]
      return [element.parentNode, Array.from(element.parentNode.childNodes).indexOf(element) + (after ? 1 : 0)]
    }
    selection.setBaseAndExtent(...outside(anchor, selection.anchorNode, selection.anchorOffset, backward),
      ...outside(focus, selection.focusNode, selection.focusOffset, !backward))
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
    window.addEventListener("focus", this.#handleWindowFocus)
    window.addEventListener("blur", this.#endDrag)
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    this.processSelection()
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    window.removeEventListener("focus", this.#handleWindowFocus)
    window.removeEventListener("blur", this.#endDrag)
    this.#endDrag()
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.#clearElementHover()
    this.#clearStyleTargetHover()
    this.editor.features.transformation.clearTransform()
    this.#clearSelections()
    this.selectionCaret?.remove()
    this.editor.features.manipulation.endNodeDrag(false)
    this.hoverCaret?.remove()
    this.emptyDocumentCaret?.remove()
    ;[document.documentElement, document.body].forEach(element => {
      element.classList.remove("◆key-mod-down", "◆key-alt-down", "◆key-shift-down")
      if(!Array.from(element.classList).some(marker => marker !== "◆" && marker.startsWith("◆"))) {
        element.classList.remove("◆")
      }
      if(!element.classList.length) element.removeAttribute("class")
    })
    super.disable()
  }

  readonly #handleWindowFocus = () => {
    if(!this.editor.features.media.isPlaceholderInteraction) this.processSelection()
  }

  /** Pointer capture keeps the whole editor drag in the outer document, even
   * when crossing a widget, native media controls, or a child frame. */
  readonly #endDrag = () => {
    const pointerId = this.#drag?.pointerId
    const target = this.#drag?.target
    this.#drag = null
    this.dragAnchor = null
    this.isInDragSelection = false
    document.body.classList.remove("◆selection-dragging")
    if(pointerId !== undefined && target?.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }

  readonly #finishDrag = (event: PointerEvent) => {
    if(this.#drag?.pointerId !== undefined && this.#drag.pointerId !== event.pointerId) return
    const drag = this.#drag
    if(event.type === "pointerup" && drag && !drag.nativeClick && !drag.moved) {
      // Chromium can replace a prevented gap click below SUMMARY while
      // resolving native focus. Keep the position chosen by hit testing;
      // live Ranges track intervening DOM edits without retaining stale offsets.
      const root = getDocumentRoot()
      if(root.contains(drag.anchor.startContainer) && root.contains(drag.focus.startContainer)) {
        document.body.focus({preventScroll: true})
        document.getSelection()?.setBaseAndExtent(drag.anchor.startContainer, drag.anchor.startOffset,
          drag.focus.startContainer, drag.focus.startOffset)
      }
    }
    const dragging = this.isInDragSelection
    this.#endDrag()
    if(dragging) this.processSelection()
  }

  #beginDrag(event: PointerEvent, nativeClick: boolean) {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const anchor = document.createRange()
    anchor.setStart(selection.anchorNode, selection.anchorOffset)
    anchor.collapse(true)
    const focus = document.createRange()
    focus.setStart(selection.focusNode, selection.focusOffset)
    focus.collapse(true)
    const target = event.target instanceof Element ? event.target : document.body
    this.#drag = {anchor, focus, x: event.clientX + window.scrollX, y: event.clientY + window.scrollY,
      nativeClick, moved: false, target, pointerId: event.pointerId}
    this.dragAnchor = {node: selection.anchorNode, offset: selection.anchorOffset}
    this.isInDragSelection = true
    // Keep the original click target and native mouse default, while keeping
    // subsequent moves in this document even if the first move enters a frame.
    if(event.pointerId !== undefined) {
      try { target.setPointerCapture(event.pointerId) } catch { /* Synthetic or already cancelled pointer. */ }
    }
  }

  readonly #extendDrag = (event: PointerEvent) => {
    if(!this.isInDragSelection) return
    const drag = this.#drag
    if(!drag || drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return
    // Live Ranges track inserts/removals at the saved endpoints. Revalidate
    // their current roots before using them after a concurrent DOM mutation.
    const root = getDocumentRoot()
    if(!root.contains(drag.anchor.startContainer) || !root.contains(drag.focus.startContainer)) {
      this.#endDrag()
      this.processSelection()
      return
    }
    const atOrigin = Math.abs(event.clientX + window.scrollX - drag.x) <= 2
      && Math.abs(event.clientY + window.scrollY - drag.y) <= 2
    if(!drag.moved && atOrigin) return
    if(!drag.moved) {
      drag.moved = true
      document.body.classList.add("◆", "◆selection-dragging")
    }
    const point = atOrigin
      ? {node: drag.focus.startContainer, offset: drag.focus.startOffset}
      : $.pointFromCoords(Math.max(0, Math.min(event.clientX, window.innerWidth - 1)),
        Math.max(0, Math.min(event.clientY, window.innerHeight - 1)), event.target)
    if(!point) return
    document.getSelection()?.setBaseAndExtent(drag.anchor.startContainer, drag.anchor.startOffset, point.node, point.offset)
    this.processSelection(true)
  }

  captureListeners: DocumentListenerMap = {
    pointerdown: event => this.#handleWidgetShadowInteraction(event),
    pointermove: event => {
      if(this.isInDragSelection) event.preventDefault()
      if(widgetHostForShadowInteraction(event) || isAppendixInteraction(event)) this.#extendDrag(event)
    },
    pointerup: this.#finishDrag,
    pointercancel: this.#finishDrag,
    lostpointercapture: this.#finishDrag,
    // Native clicks establish editing focus and paint the blinking text caret.
    // Only structural gaps and an actual drag override the browser selection.
    mousedown: event => {
      const drag = this.#drag
      if(!drag) return
      if(!drag.nativeClick) event.preventDefault()
      else queueMicrotask(() => {
        // Save the browser's actual click endpoints after its default action
        // (including bidi affinity and Shift-click direction).
        const selection = document.getSelection()
        const root = getDocumentRoot()
        if(this.#drag !== drag || drag.moved || !selection?.anchorNode || !selection.focusNode
          || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return
        drag.anchor.setStart(selection.anchorNode, selection.anchorOffset)
        drag.anchor.collapse(true)
        drag.focus.setStart(selection.focusNode, selection.focusOffset)
        drag.focus.collapse(true)
        this.dragAnchor = {node: selection.anchorNode, offset: selection.anchorOffset}
      })
    },
    selectstart: event => { if(this.#drag && (!this.#drag.nativeClick || this.#drag.moved)) event.preventDefault() },
    click: event => this.#handleModifierClick(event),
    focusin: event => {
      this.#handleWidgetShadowInteraction(event)
      if(!isAppendixInteraction(event) && !this.editor.features.media.isPlaceholderInteraction) this.processSelection()
    },
    keydown: event => { this.#handleKeyState(event); this.#handleWidgetShadowInteraction(event) },
    keyup: event => this.#handleKeyState(event),
    beforeinput: event => this.#handleWidgetShadowInteraction(event),
    input: event => this.#handleWidgetShadowInteraction(event),
    change: event => this.#handleWidgetShadowInteraction(event),
    wheel: event => this.#handleWidgetWheel(event),
    scroll: event => this.#handleWidgetScroll(event),
  }

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
    this.#endDrag()
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

  /** Creates the shared selection caret in BODY's shadow tree. */
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

  /** The shared node, capture, gap, and drag text caret, or null before first use. */
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
    caret.style.removeProperty("left")
    caret.style.removeProperty("top")
    caret.style.removeProperty("height")
    ;["node", "capture", "gap", "text"].forEach(state => {
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
  #showSelectionCaret(state: "node" | "capture" | "gap" | "text") {
    const caret = this.selectionCaret ?? this.#createSelectionCaret()
    caret.classList.add(`◆selection-caret-${state}`)
    setPart(caret, `selection-caret-${state}`)
    setPart(caret, "selection-caret-hidden", false)
    if(state === "gap") setPart(caret, "gap-caret")
    caret.removeAttribute("visibility")
    return caret
  }

  /** Drag hover owns a collapsed document selection, even if a widget or a
   * table previously owned editing focus. Existing caret rendering follows it. */
  selectDropRange(range: Range) {
    if(focusedWidgetHost() && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.#endDrag()
    this.editor.features.table.clearCellSelection(false)
    $.move(range.startContainer, range.startOffset)
    this.processSelection()
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

  /** Retains marker owners so removal also cleans disconnected content. */
  #markSelection(element: Element, ...markers: string[]) {
    element.classList.add("◆", ...markers)
    this.#selectionMarkers.add(element)
  }

  /** Clears the previous presentation, including markers on removed nodes. */
  #clearSelections() {
    this.#clearAtomicOverlays()
    const markers = ["◆gap-before-selected", "◆gap-after-selected", "◆element-selected",
      "◆element-capture-selected", "◆text-selected", "◆empty-selected",
      "◆gap-caret-visible", "◆node-selection-active", "◆atomic-range-selected"]
    const elements = new Set([...this.#selectionMarkers,
      ...document.querySelectorAll(markers.map(marker => `.${marker}`).join(","))])
    elements.forEach(element => {
      element.classList.remove(...markers)
      if(!Array.from(element.classList).some(marker => marker !== "◆" && marker.startsWith("◆"))) {
        element.classList.remove("◆")
      }
      if(!element.classList.length) element.removeAttribute("class")
    })
    this.#selectionMarkers.clear()
    this.#hideSelectionCaret()
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
    if($.isElementSelection && !inDragSelection) return "element"
    const anchorContainer = getContainer(selection.anchorNode)
    if(anchorContainer && $.isTextSelection) return "text"
    if(anchorContainer && $.isEmptySelection) return "empty"
    return "text"
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
    // Gap arrows extend above their zero-height DOM point. Reveal them
    // immediately; smooth scrolling may be cancelled by native focus scrolls.
    const behavior = kind === "gap" ? "instant" as const : "smooth" as const
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
      target.scrollBy({left, top, behavior})
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
    if(left || top) window.scrollBy({left, top, behavior})
  }

  /** Normalizes and re-applies exactly one selection kind for the current
   * document Selection. This is the invariant boundary used by native
   * selectionchange events and every editor-driven refresh. */
  processSelection(inDragSelection=this.isInDragSelection) {
    const focusedWidget = focusedWidgetHost()
    if(focusedWidget && !this.isInDragSelection) this.#capturedElement = focusedWidget
    const capturedElement = this.captureSelectedElement
    let sel: Selection | null
    if(capturedElement) {
      if(!this.editor.features.media.isPlaceholderInteraction) this.#normalizeNativeSelection()
      this.editor.features.list.clearSelectionPresentation()
      sel = document.getSelection()
    }
    else {
      this.#releaseCaptureSelection()
      this.#constrainSelectionToBody()
      this.#constrainSelectionToAtomicContent()
      sel = document.getSelection()
      const root = getDocumentRoot()
      const isInRoot = (node: Node | null) => node === root || Boolean(node && root.contains(node))
      if(!sel?.rangeCount || sel.isCollapsed && (!isInRoot(sel.anchorNode) || !isInRoot(sel.focusNode))) {
        $.selectDocumentStart()
        sel = document.getSelection()
      }
      if(!inDragSelection) this.#normalizeNativeSelection()
      sel = document.getSelection()
      this.editor.features.list.clearSelectionPresentation()
    }
    const kind = this.#selectionKind(inDragSelection, capturedElement)
    this.#clearSelections()
    this.editor.features.transformation.syncSelection(kind === "capture" ? capturedElement
      : kind === "section" ? this.selectedSectionElement
        : kind === "element" ? $.selectedElement ?? null : null)
    this.editor.features.manipulation.refreshNodeDragTarget(kind === "element" ? $.selectedElement ?? null : null)
    this.#scrollSelectionIntoView(kind, sel, capturedElement)
    if(kind === "cell") return
    if(kind === "virtual") {
      this.editor.features.list.refreshSelectionPresentation()
      return
    }
    if(kind === "capture" && capturedElement) {
      document.body.classList.add("◆", "◆node-selection-active")
      this.#markSelection(capturedElement, "◆element-selected", "◆element-capture-selected")
      this.#showSelectionCaret("capture")
      return
    }
    if(kind === "section") {
      const section = this.selectedSectionElement
      if(!section) return
      document.body.classList.add("◆", "◆node-selection-active")
      this.#markSelection(section, "◆element-selected")
      this.#showSelectionCaret("node")
      return
    }
    if(!sel?.anchorNode || !sel.focusNode) return
    if(kind === "text" || kind === "element") this.#showAtomicOverlays(sel)
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
        const structuralGap = $.detailsGap ?? $.dividerGap
        const placement = structuralGap?.placement ?? (!before || nestedListAfter ? "before": "after")
        const element = structuralGap?.element ?? (placement === "after" ? before : after)
        if(!element) {
          return
        }
        const gapCaret = this.#showSelectionCaret("gap")
        if(element) this.#markSelection(element, `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        document.body.classList.add("◆gap-caret-visible")
      }
      
    }
    else if(kind === "element") {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      if(isElement(element)) {
        document.body.classList.add("◆", "◆node-selection-active")
        this.#markSelection(element, "◆element-selected")
        this.#showSelectionCaret("node")
      }
    }
    else if(kind === "text") {
      const element = getContainer($.commonAncestor)
      if(isElement(element)) this.#markSelection(element, "◆text-selected")
    }
    else if(kind === "empty") {
      const element = getContainer($.commonAncestor)
      if(!element) return
      this.#markSelection(element, "◆empty-selected")
      if(element === getDocumentRoot() && !this.emptyDocumentCaret) {
        this.#createEmptyDocumentCaret()
      }
    }
    // Native text carets can disappear while another app owns the drag.
    // Reuse the shared appendix caret at the collapsed selection's geometry.
    if(document.body.classList.contains("◆drop-selection-active")
      && (kind === "text" || kind === "empty") && !$.isEmptyDocumentSelection) {
      const rect = caretRect(sel.focusNode, sel.focusOffset)
      const caret = this.#showSelectionCaret("text")
      caret.style.left = `${rect.left}px`
      caret.style.top = `${rect.top}px`
      caret.style.height = `${rect.height}px`
    }
  }

  /** Observing behavior: re-apply markers on every selection change, extend
   * the drag selection on pointer moves, and mirror modifier key state onto
   * the body (`◆key-mod/alt/shift-down`). */
  passiveListeners: DocumentListenerMap = {
    "pointermove": event => this.#extendDrag(event),
    "selectionchange": () => {
      if(this.editor.features.media.isPlaceholderInteraction) return
      this.clearSelectedSection()
      this.processSelection(this.isInDragSelection)
    },

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
        && (this.#navigateDisclosureGap(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown")
          || this.#navigateAtomicSelection(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown"))) {
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
      if(ev.defaultPrevented || (isElement(ev.target) && ev.target.closest(".◆editor-only")) || this.hasDoubleClicked || ev.button !== 0) {
        return
      }
      this.#endDrag()
      this.clearSelectedSection()
      const media = ev.target instanceof Node ? mediaContainerForNode(ev.target) : null
      const divider = ev.target instanceof Element && ev.target.localName === "hr" ? ev.target : null
      if(media || divider) {
        ev.preventDefault()
        this.#releaseCaptureSelection()
        $.selectElement((media ?? divider)!)
        this.processSelection()
        return
      }
      this.#releaseCaptureSelection()
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
        const point = $.selectCoords(ev.clientX, ev.clientY, ev.shiftKey, ev.target)
        const nativeClick = (!point || !$.isGapSelection && !point.overrideNative)
          && !atomicEditingContainer(ev.target instanceof Node ? ev.target : null)
        if(!nativeClick) ev.preventDefault()
        this.#beginDrag(ev, nativeClick)
        this.processSelection(true)
      }
    },
    "click": ev => {
      this.hasDoubleClicked = false
      if(this.editor.features.list.isDetailsToggleInteraction(ev) || ev.button === 2 || $.isElementSelection) {
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
