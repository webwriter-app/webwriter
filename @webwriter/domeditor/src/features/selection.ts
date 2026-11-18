import {batchPresentationStates, clearPresentationState, deferPresentationPaint, flushPresentationStyles, hasPresentationState, presentationStateElements, setPresentationState, setPresentationStates} from "../presentation-state.js"
import { DocumentListenerMap, EditorFeature } from "."
import {$, fixedClientX, figureSelectionTarget, isOutOfFlow, editingFlowRoot, uiMotionDisabled, atomicEditingContainer, caretRect, isAppendixInteraction, isCaretAtBoundary, isEmptyParagraph, isFormControlInteraction, isWidgetShadowInteraction, focusEditorWindow, focusedWidgetHost, getContainer, isAtomicEditingElement, isContentfulWidget, isElement, modifierKeyDown, setPart, textOffsetIn, textPointAtOffset, widgetHostForScrollEvent, widgetHostForShadowInteraction} from "../utility"
import {mediaContainerForNode} from "../media"
import {SVG_NAMESPACE, graphicContainerForNode, standaloneGraphicShape} from "../graphic"
import {isSectionElement} from "../sections"
import {popupContentAncestor, popupContentForToggle, popupDisplayToggle, popupElementRole} from "../element-names"
import {isMarkElement} from "../marks"
import {boardLayoutRole, isSlide, slideLayoutRole} from "../document-layout"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {inlineMathRoot, mathOutsidePoint, mathRoot} from "../math"
import {isAuthoredMutation} from "../editor-artifacts"
import {isTextFieldInteraction} from "../utility"
import {createAnchorPositioner} from "../utility"
import {childNodesInRange, nodeAtPath} from "../utility"
import {isParagraphContent, renderedClientRect, renderedParentElement, widgetSlotContentFromCoords} from "../utility"
import {textKeyboardRequestEvent, type ElementSelectionType} from "../editor-bridge"
import {elementAttributeTargetId} from "../element-attributes"
import type {BoxGeometry} from "./transformation"
import type {Transaction} from "yjs"

type SelectionKind = "none" | "capture" | "section" | "virtual" | "cell" | "gap" | "element" | "text" | "empty"

const selectionPresentationStates = ["gap-before-selected", "gap-after-selected", "element-selected",
  "element-capture-selected", "text-selected", "empty-selected", "empty-root-selected", "caption-placeholder", "caption-editing",
  "gap-caret-visible", "gap-caret-host", "touch-caret-visible", "node-selection-active", "node-caret-host", "atomic-range-selected", "atomic-range-active", "empty-range-selected", "flow-excluded",
  "math-boundary-caret", "math-caret-inside-left", "math-caret-inside-right", "math-caret-outside-left", "math-caret-outside-right",
  "popup-boundary-caret", "popup-caret-inside-left", "popup-caret-inside-right", "popup-caret-outside-left", "popup-caret-outside-right"]
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
    if(Array.from(parent.childNodes).slice(0, index).some(previous => !isOutOfFlow(previous) && (previous.nodeType === Node.ELEMENT_NODE || previous.textContent))) {
      return false
    }
    node = parent
    offset = index
  }
  return node === element && offset === 0
}

const nativeCaretAtomicElements = "img, hr, br, input, textarea, select, button, video, audio, iframe, embed, object, canvas, svg, math, table, meter, progress"

/** Whether Chromium can place a caret in or beside this rendered content. */
function holdsNativeCaret(node: Node) {
  const element = isElement(node) ? node : node.parentElement
  if(!element || element.closest("[inert]") || ["hidden", "collapse"].includes(getComputedStyle(element).visibility)) return false
  if(isElement(node)) return node.getClientRects().length > 0
  const range = document.createRange()
  range.selectNodeContents(node)
  return range.getClientRects().length > 0
}

function containsNativeCaretPosition(element: Element) {
  if(element.matches(nativeCaretAtomicElements) || !(element as HTMLElement).isContentEditable) return holdsNativeCaret(element)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for(let node = walker.nextNode(); node; node = walker.nextNode()) {
    if((node.nodeType === Node.TEXT_NODE || isElement(node) && node.matches(nativeCaretAtomicElements)) && holdsNativeCaret(node)) return true
  }
  return false
}

/** Adds the elements whose caret color Chromium may use at a boundary: it
 * paints a caret at the nearest caret position, and takes its color from
 * the element holding it. Collects siblings outward from the boundary up to
 * the first that holds a position, plus one more as a margin. Returns false
 * when the container holds none, so the caret may be painted outside it. */
function addNativeCaretHosts(container: Node, offset: number, hosts: Set<Element>): boolean {
  if(!isElement(container)) {
    const parent = container.parentNode
    if(container.parentElement && container.nodeType === Node.TEXT_NODE && holdsNativeCaret(container)) {
      hosts.add(container.parentElement)
      return true
    }
    return parent ? addNativeCaretHosts(parent, Array.from(parent.childNodes).indexOf(container as ChildNode) + (offset > 0 ? 1 : 0), hosts) : false
  }
  const nodes = container.childNodes
  let found = false
  for(const step of [-1, 1]) {
    let margin = false
    for(let index = step < 0 ? offset - 1 : offset; index >= 0 && index < nodes.length; index += step) {
      const node = nodes[index]
      if(isElement(node)) {
        if(getComputedStyle(node).display === "none") continue
        hosts.add(node)
        if(margin) break
        margin = containsNativeCaretPosition(node)
        found ||= margin
      }
      else if(!margin && node.nodeType === Node.TEXT_NODE && holdsNativeCaret(node)) {
        hosts.add(container)
        found = true
        break
      }
    }
  }
  return found
}

/** The elements whose caret color decides the native caret Chromium paints
 * for a selection: around each range boundary, or BODY when the boundaries
 * do not narrow it down. */
export function nativeCaretHosts(selection: Selection) {
  const hosts = new Set<Element>()
  let found = selection.rangeCount > 0
  for(let index = 0; found && index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index)
    found = addNativeCaretHosts(range.startContainer, range.startOffset, hosts)
      && (range.collapsed || addNativeCaretHosts(range.endContainer, range.endOffset, hosts))
  }
  return found ? Array.from(hosts) : [document.body]
}

/** Editing feature that visualizes the current selection. It classifies every
 * selection change into an editing-relevant kind (element, text, gap, empty)
 * and applies the corresponding selection presentation state, manages the
 * selection and hover overlays in BODY's shadow tree, mirrors modifier key
 * state onto the body, and implements
 * pointer-based selection (drag selection, modifier-click element selection). */
export class SelectionFeature extends EditorFeature {
  readonly readerPermission = "select" as const
  // Window capture precedes document feature handlers, even after re-enabling.
  protected captureListenerTarget = window

  #sharedRefreshQueued = false
  #capturedElement: Element | null = null
  #captureClick: {element: Element, pointerId?: number, x: number, y: number, released: boolean, cancelled: boolean,
    requested?: {preserveNativeSelection?: boolean}} | null = null
  #modifierClick = false
  #touchSelection = false
  #touchTap: {pointerId: number, x: number, y: number, target: Node, fromCanvasSlot?: boolean, box?: boolean} | null = null
  #selectedSection: Element | null = null
  #atomicExtension: {range: Range, backwards: boolean} | null = null
  #drag: {anchor: Range, focus: Range, lastFocus: Range, scope: Element | null, x: number, y: number, nativeClick: boolean, moved: boolean, target: Element, pointerId?: number, pointerType: string,
    fromGap: boolean, slotSurface?: Element, textAcrossWidgets?: boolean, unit?: {kind: "word" | "paragraph", range: Range}} | null = null
  #lastContentPointerClick: {content: Element, x: number, y: number, time: number, count: number} | null = null
  #settingDragSelection = false
  #dragScrollFrame: number | null = null
  #dragScrollPointer: PointerEvent | null = null
  #boxDrag: {root: HTMLElement, x: number, y: number, pointerId?: number, pointerType: string, overlay: HTMLElement, elements: Element[], previews: Map<Element, HTMLElement>} | null = null
  #selectionMarkers = new Set<Element>()
  #atomicOverlays = new Map<Element, HTMLElement>()
  #atomicOverlayFrame: number | null = null
  #atomicAnchors = createAnchorPositioner()
  #transformCaretTarget: Element | null = null
  #revealSelectionFrame: number | null = null
  #lastScrollSelection: {element: Element} | {range: Range, backwards: boolean} | null = null
  #hoverFrame: number | null = null
  #nativeHoverTarget: Element | null = null
  #focusedContentfulShadow: Element | null = null
  #blurringWidget: Element | null = null
  #hoverOwner: Element | null = null
  #floatObserver: MutationObserver | null = null
  #floatCandidates: {root: Element, elements: Element[], expires: number} | null = null
  readonly #invalidateFloatCandidates = () => { this.#floatCandidates = null; this.#outOfFlowContent = null }

  readonly #handlePresentationChanges = (records: MutationRecord[]) => {
    if(records.some(isAuthoredMutation)) {
      flushPresentationStyles(document)
      // Text edits cannot change which elements float.
      if(records.some(record => record.type !== "characterData" && isAuthoredMutation(record))) this.#invalidateFloatCandidates()
      this.#refreshGapCaretInlinePosition()
      // Geometry changes leave native anchor bindings intact. Refresh the
      // rules if a mutation could change anchor names or remove a marker.
      if(this.#atomicOverlays.size && this.editor.features.transformation.isResizingOrRotatingGroup
        && records.some(record => isAuthoredMutation(record) && (record.attributeName !== "style"
          || !this.#atomicOverlays.has(record.target as Element) || record.oldValue?.includes("anchor-name")
          || (record.target as HTMLElement).style?.getPropertyValue("anchor-name")))) {
        this.#atomicAnchors.refresh()
      }
      if(this.#atomicOverlays.size || this.#boxDrag?.previews.size) this.#positionAtomicOverlays()
    }
  }

  #hasRunningAuthoredAnimation() {
    return Boolean(document.getAnimations?.().some(animation =>
      animation.playState === "running" && (animation.effect as KeyframeEffect | null)?.target?.getRootNode() === document))
  }

  /** Selects at least every element that a style rule with one of the given
   * declarations, or one of the given other sources, can match. Callers test
   * the matches, so a nested or scoped rule may ignore its context. Null when
   * a rule cannot be read or widened that way, so every element must be tested. */
  #styleSourceSelector(declares: (style: CSSStyleDeclaration) => boolean, sources: string[]) {
    const selectors = [...sources]
    // Without its parent rule, `&` can be any element and a leading
    // combinator any relation. Negating `&` or naming the scope root cannot
    // be widened like that.
    const widen = (selector: string) => {
      if(selector.includes(":scope") || selector.includes("&") && selector.includes(":not(")) return null
      const parts: string[] = []
      let depth = 0, start = 0
      for(let index = 0; index <= selector.length; index++) {
        const character = selector[index]
        if(character === "(" || character === "[") depth++
        else if(character === ")" || character === "]") depth--
        else if(character === undefined || character === "," && depth === 0) {
          parts.push(selector.slice(start, index).trim().replace(/^[>+~]\s*/, "").replaceAll("&", "*"))
          start = index + 1
        }
      }
      return parts.every(Boolean) ? parts.join(", ") : null
    }
    const visit = (rules: CSSRuleList, relative: boolean): boolean => {
      for(const rule of Array.from(rules) as (CSSRule & {selectorText?: string, style?: CSSStyleDeclaration, cssRules?: CSSRuleList, styleSheet?: CSSStyleSheet | null})[]) {
        if(rule.styleSheet && !sheet(rule.styleSheet)) return false
        const styled = typeof rule.selectorText === "string"
        if(styled && rule.style && declares(rule.style)) {
          const selector = relative ? widen(rule.selectorText!) : rule.selectorText!
          if(!selector) return false
          selectors.push(selector)
        }
        if(rule.cssRules?.length && !visit(rule.cssRules, relative || styled || rule.constructor.name === "CSSScopeRule")) return false
      }
      return true
    }
    const sheet = (value: CSSStyleSheet) => {
      try { return visit(value.cssRules, false) }
      catch { return false }
    }
    return [...Array.from(document.styleSheets), ...document.adoptedStyleSheets].every(sheet) ? selectors.join(", ") : null
  }

  #outOfFlowContent: {root: Element, present: boolean, expires: number} | null = null

  /** Whether arrow keys can meet floated, positioned or popup content in a
   * flow. Asked on every arrow key, so the answer is kept like the float
   * candidates: until an authored change, a resize, or a short expiry that
   * covers CSSOM edits. */
  #hasOutOfFlowContent(root: Element) {
    this.#handlePresentationChanges(this.#floatObserver?.takeRecords() ?? [])
    const now = performance.now()
    if(!this.#outOfFlowContent || this.#outOfFlowContent.root !== root || this.#outOfFlowContent.expires <= now || this.#hasRunningAuthoredAnimation()) {
      const floats = (style: CSSStyleDeclaration) => !["", "none"].includes(style.getPropertyValue("float").trim())
      const selector = this.#styleSourceSelector(style => floats(style) || ["absolute", "fixed"].includes(style.getPropertyValue("position").trim()),
        ['[style*="float"]', '[style*="position"]', "[align]", "[popover]", "dialog"])
      let sources: Element[] | null = null
      if(selector) {
        try { sources = Array.from(root.querySelectorAll(selector)) }
        catch { sources = null }
      }
      this.#outOfFlowContent = {root, present: isOutOfFlow(root) || (sources ?? Array.from(root.querySelectorAll("*"))).some(isOutOfFlow), expires: now + 250}
    }
    return this.#outOfFlowContent.present
  }

  #currentFloatCandidates() {
    this.#handlePresentationChanges(this.#floatObserver?.takeRecords() ?? [])
    const root = getDocumentRoot()
    const floats = (style: CSSStyleDeclaration) => !["", "none"].includes(style.getPropertyValue("float").trim())
    // CSSOM edits have no mutation event. Periodically rediscover candidates;
    // running authored animations can change float membership every frame.
    const now = performance.now()
    if(!this.#floatCandidates || this.#floatCandidates.root !== root || this.#floatCandidates.expires <= now || this.#hasRunningAuthoredAnimation()) {
      // Computing every element's style is proportional to the document.
      // Test only elements that some float declaration can match.
      let sources: Element[] | null = null
      const selector = this.#styleSourceSelector(floats, ['[style*="float"]', "[align]"])
      if(selector) {
        try { sources = Array.from(root.querySelectorAll(selector)) }
        catch { sources = null }
      }
      const elements = (sources ?? Array.from(root.querySelectorAll("*"))).filter(element =>
        !atomicEditingContainer(element.parentElement, this.editor.schema)
        && ["left", "right"].includes(getComputedStyle(element).float))
      this.#floatCandidates = {root, elements, expires: now + 250}
    }
    return this.#floatCandidates.elements
  }

  #clearAtomicOverlays() {
    if(this.#atomicOverlayFrame !== null) cancelAnimationFrame(this.#atomicOverlayFrame)
    this.#atomicOverlayFrame = null
    this.#atomicOverlays.forEach(overlay => {
      this.#atomicAnchors.release(overlay)
      overlay.remove()
    })
    this.#atomicOverlays.clear()
    this.#atomicAnchors.refresh()
  }

  /** Ordinary element boxes follow CSS anchors. Contents hosts, transformed
   * layout items and cropped media use their measured geometry. */
  #positionAtomicOverlays(boxes?: ReadonlyMap<Element, BoxGeometry>, matrices = new WeakMap<Element, DOMMatrix>()) {
    if(this.#atomicOverlayFrame !== null) cancelAnimationFrame(this.#atomicOverlayFrame)
    this.#atomicOverlayFrame = null
    const transformation = this.editor.features.transformation
    if(!boxes && !this.#boxDrag && transformation.isResizingOrRotatingGroup
      && transformation.hasStableGroupSelection(Array.from(this.#atomicOverlays.keys()))) {
      transformation.refreshGeometry()
      return
    }
    let measured = false
    const spatialSelection = $.isMultiElementSelection && (this.editor.features.canvas.active || this.editor.features.slides.active)
    const updates: (() => void)[] = []
    // Measure every outline before changing styles or anchor markers. A
    // group rotation otherwise invalidates layout before each sibling read.
    for(const overlays of [this.#atomicOverlays, this.#boxDrag?.previews]) overlays?.forEach((overlay, element) => {
      if(!document.body.contains(element)) {
        updates.push(() => {
          this.#atomicAnchors.release(overlay)
          overlay.remove()
          overlays.delete(element)
        })
        return
      }
      if(overlay.matches('[part~="empty-text-selection-overlay"]')) {
        const style = getComputedStyle(element)
        const fontSize = parseFloat(style.fontSize) || 16
        const width = Math.max(4, fontSize / 2)
        const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2
        const left = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0)
        const right = (parseFloat(style.borderRightWidth) || 0) + (parseFloat(style.paddingRight) || 0)
        const top = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0)
        const bottom = (parseFloat(style.borderBottomWidth) || 0) + (parseFloat(style.paddingBottom) || 0)
        const inline = style.direction === "rtl" ? `anchor(right) - ${right + width}px` : `anchor(left) + ${left}px`
        updates.push(() => {
          this.#atomicAnchors.bind(overlay, element, `left:calc(${inline}) !important;top:calc(anchor(top) + ${top}px);width:${width}px;min-width:4px;height:max(${lineHeight}px, calc(anchor-size(height) - ${top + bottom}px));position-visibility:anchors-visible;`)
        })
        return
      }
      if(getComputedStyle(element).display === "contents") {
        measured = true
        const rect = renderedClientRect(element)
        const left = `${fixedClientX(rect.left)}px`
        updates.push(() => {
          this.#atomicAnchors.release(overlay)
          Object.assign(overlay.style, {transform: "", left, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
        })
        return
      }
      const media = this.editor.features.media.cropTargetFor(element)
      const crop = media ? getComputedStyle(media).getPropertyValue("object-view-box") : "none"
      const cropped = Boolean(media && crop && crop !== "none") && element instanceof HTMLElement
      const transformed = transformation.boxTransformed(element, matrices)
      const box = overlays === this.#atomicOverlays ? boxes?.get(element) : undefined
      if(spatialSelection && overlays === this.#atomicOverlays && transformed
        && (element instanceof HTMLElement || element instanceof SVGSVGElement || mathRoot(element) === element)) {
        measured = true
        const {styles} = box ?? transformation.boxGeometry(element as HTMLElement | SVGSVGElement | MathMLElement, true, matrices)
        const left = `${fixedClientX(parseFloat(styles.left))}px`
        updates.push(() => {
          this.#atomicAnchors.release(overlay)
          Object.assign(overlay.style, {...styles, left})
        })
        return
      }
      if(!cropped && !transformed) {
        updates.push(() => {
          for(const property of ["transform", "left", "top", "width", "height"]) overlay.style.removeProperty(property)
          this.#atomicAnchors.bind(overlay, element)
        })
        return
      }
      measured = true
      const rect = cropped ? (box ?? transformation.boxGeometry(element, true, matrices)).rect : element.getBoundingClientRect()
      const left = `${fixedClientX(rect.left)}px`
      updates.push(() => {
        this.#atomicAnchors.release(overlay)
        Object.assign(overlay.style, {transform: "", left, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
      })
    })
    updates.forEach(update => update())
    if(!boxes) this.#atomicAnchors.refresh()
    if(measured && !boxes) {
      this.#atomicOverlayFrame = requestAnimationFrame(() => this.#positionAtomicOverlays())
    }
  }

  positionGroupOutlines(boxes: ReadonlyMap<Element, BoxGeometry>, matrices: WeakMap<Element, DOMMatrix>) {
    if(this.#atomicOverlays.size === boxes.size && Array.from(this.#atomicOverlays.keys()).every(element => boxes.has(element))) {
      this.#positionAtomicOverlays(boxes, matrices)
    }
  }

  #showRangeOverlays(selection: Selection) {
    if(selection.isCollapsed || !selection.rangeCount) return
    if((this.editor.features.canvas.active || this.editor.features.slides.active) && $.selectedElement) return
    const range = selection.getRangeAt(0)
    const showOverlay = (element: Element, empty = false) => {
      const overlay = document.createElement("div")
      overlay.classList.add("◆", "◆editor-only")
      overlay.setAttribute("part", empty ? "empty-text-selection-overlay" : "atomic-selection-overlay")
      overlay.setAttribute("aria-hidden", "true")
      overlay.contentEditable = "false"
      this.editor.addAppendix(overlay)
      this.#atomicOverlays.set(element, overlay)
    }
    // Only the children between the range's boundaries can intersect it.
    // Testing each child of the document root takes time proportional to the
    // document for every selection refresh.
    const visitChildren = (parent: Element) => {
      for(const child of childNodesInRange(parent, range)) if(isElement(child)) visit(child)
    }
    const visit = (element: Element) => {
      if(!$.includesNode(element)) return
      const isTable = element.localName === "table"
      const isDetails = element.localName === "details"
      const isFormula = element.localName === "math" && mathRoot(element) === element
      const isContentful = isContentfulWidget(element, this.editor.schema)
      if(isTable || isDetails || isFormula || isContentful || isAtomicEditingElement(element, this.editor.schema)) {
        const parent = element.parentNode!
        const index = Array.from(parent.childNodes).indexOf(element)
        // Touching an edge or selecting a control's internal text is not a
        // selection of that host. Fully selected containers use one overlay
        // instead of highlighting their descendants twice.
        const wholeNode = range.comparePoint(parent, index) === 0 && range.comparePoint(parent, index + 1) === 0
        const wholeFormulaContents = isFormula && range.comparePoint(element, 0) === 0
          && range.comparePoint(element, element.childNodes.length) === 0
        if(wholeNode || wholeFormulaContents) {
          this.#markSelection(element, "atomic-range-selected")
          if($.selectedElement === element && standaloneGraphicShape(element)) return
          showOverlay(element)
          return
        }
        // Partial ranges can still fully select atomic descendants.
        if(!isTable && !isDetails && !isContentful) return
      }
      if(!isContentful && this.editor.schema.isBlock(element) && !element.textContent?.trim()
        && Array.from(element.childNodes).every(isParagraphContent)) {
        this.#markSelection(element, "empty-range-selected")
        showOverlay(element, true)
        return
      }
      visitChildren(element)
    }
    visitChildren(getDocumentRoot())
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

  /** Return input to a widget's public focus entry point, preserving a live
   * shadow-control selection when the widget already has native focus. */
  focusCapturedWidget() {
    const widget = this.captureSelectedWidget
    if(!(widget instanceof HTMLElement)) return false
    const focused = document.activeElement === widget
    if(!focused && widget.focus === HTMLElement.prototype.focus) return false
    window.focus()
    if(!focused) widget.focus({preventScroll: true})
    return true
  }

  #releaseCaptureSelection() {
    this.#capturedElement = null
  }

  /** The connected section explicitly selected through the breadcrumb. This
   * state is deliberately separate from the native Selection so ordinary
   * editing never acquires a section wrapper as its target. */
  get selectedSectionElement() {
    return this.#selectedSection?.isConnected && isSectionElement(this.#selectedSection) && !slideLayoutRole(this.#selectedSection) && !boardLayoutRole(this.#selectedSection)
      ? this.#selectedSection
      : null
  }

  #selectedSectionRange: Range | null = null

  clearSelectedSection(expected?: Element) {
    if(expected && this.#selectedSection !== expected) return
    this.#selectedSection = null
    this.#selectedSectionRange = null
  }

  replaceSelectedSection(previous: Element, replacement: Element) {
    if(this.#selectedSection === previous && isSectionElement(replacement)) {
      this.#selectedSection = replacement
    }
  }

  selectSectionElement(section: Element) {
    if(!this.editor.allows("select", section) || !section.isConnected || !getDocumentRoot().contains(section) || !isSectionElement(section) || slideLayoutRole(section) || boardLayoutRole(section)) return false
    this.#releaseCaptureSelection()
    this.#selectedSection = section
    this.processSelection()
    const selection = document.getSelection()
    this.#selectedSectionRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    this.editor.postMarkState()
    this.editor.postSelectionPath()
    return true
  }

  /** Capture-selects an authored element while keeping its internal pointer
   * interactions available to a focused feature such as SVG graphics.
   * Focused appendix controls can preserve their native text selection. */
  captureElement(element: Element, {preserveNativeSelection = false} = {}) {
    if(!this.editor.allows("select", element) || !element.isConnected || element === document.body || !document.body.contains(element)) return
    if(this.#captureClick?.element === element) {
      this.#captureClick.requested = {preserveNativeSelection}
      return
    }
    if(element.matches("caption, figcaption, details > summary")) {
      this.selectElement(element)
      return
    }
    this.clearSelectedSection()
    this.#capturedElement = element
    if(!preserveNativeSelection) {
      if(element.localName.includes("-") || element.hasAttribute("is")) {
        // Capture owns the widget independently of the native range. Spanning
        // the host can also select its light or rendered shadow text.
        this.#collapseBeforeCapturedWidget(element)
      }
      else $.selectElement(element, false)
    }
    this.processSelection()
  }

  #collapseBeforeCapturedWidget(widget: Element) {
    const parent = widget.parentNode
    if(parent) document.getSelection()?.setPosition(parent, Array.from(parent.childNodes).indexOf(widget))
  }

  private suppressSelectionScroll = false

  /** Drop insertion keeps its pointer coordinates while creation commands
   * establish their usual caret or capture selection. */
  withoutSelectionScroll<T>(command: () => T): T {
    const previous = this.suppressSelectionScroll
    this.suppressSelectionScroll = true
    try { return command() }
    finally { this.suppressSelectionScroll = previous }
  }

  selectElement(element: Element) {
    if(!this.editor.allows("select", element) || !element.isConnected || element === document.body || !document.body.contains(element) || slideLayoutRole(element)) return
    const focused = document.activeElement === document.body ? this.editor.appendix.activeElement : null
    if(focused instanceof HTMLElement) focused.blur()
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.editor.features.table.clearCellSelection(false)
    $.selectElement(element)
    this.processSelection()
  }

  #selectionBlock(node = $.anchor) {
    const root = getDocumentRoot()
    while(node && node !== root) {
      if(node instanceof Element && !isSectionElement(node) && this.editor.schema.isBlock(node)) return node
      node = node.parentElement
    }
    return null
  }

  /** Whether the caret is at the requested edge of its text block. Editor-only
   * helpers, comments, formatting whitespace, and a browser placeholder BR do
   * not count as content beyond the caret. */
  #isCaretAtBlockBoundary(block: Element, direction: "backward" | "forward", extend = false) {
    const selection = document.getSelection()
    if(!selection || !extend && !selection.isCollapsed || !selection.focusNode || !block.contains(selection.focusNode)) return false
    const remainder = document.createRange()
    if(direction === "backward") {
      remainder.setStart(block, 0)
      remainder.setEnd(selection.focusNode, selection.focusOffset)
    }
    else {
      remainder.setStart(selection.focusNode, selection.focusOffset)
      remainder.setEnd(block, block.childNodes.length)
    }
    const hasEditingContent = (node: Node): boolean => {
      if(!remainder.intersectsNode(node)) return false
      if(node instanceof Text) {
        const start = remainder.startContainer === node ? remainder.startOffset : 0
        const end = remainder.endContainer === node ? remainder.endOffset : node.length
        return Boolean(node.data.slice(start, end).trim())
      }
      if(!(node instanceof Element || node instanceof DocumentFragment)) return false
      if(node instanceof Element) {
        if(isOutOfFlow(node) || node.matches(".◆editor-only, br")) return false
        if(!node.childNodes.length || isAtomicEditingElement(node, this.editor.schema)) return true
      }
      return Array.from(node.childNodes).some(child => hasEditingContent(child))
    }
    return !Array.from(block.childNodes).some(hasEditingContent)
  }

  /** Finds an element immediately beside the live caret or the edge of its
   * containing block, ignoring invisible formatting nodes between siblings. */
  #adjacentNavigationElement(direction: "backward" | "forward", fromBlockBoundary = false, extend = false) {
    const selection = document.getSelection()
    if(!selection || !extend && !selection.isCollapsed || !selection.focusNode
      || !selection.anchorNode || !getDocumentRoot().contains(selection.anchorNode)) return null
    let node: Node = selection.focusNode
    let offset = selection.focusOffset
    if(fromBlockBoundary) {
      const block = this.#selectionBlock(selection.focusNode)
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
          if(isOutOfFlow(adjacent) || adjacent.matches(".◆editor-only")) continue
          return adjacent
        }
      }

      if(node === document.body || node === $.flowRoot) return null
      const parent = node.parentNode
      if(!parent) return null
      const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
      node = parent
      offset = direction === "backward" ? index : index + 1
    }
    return null
  }

  /** A Popup wrapper is only a container for its two authored parts. Native
   * editing sometimes places a caret between them; move it into the toggle
   * or outside the wrapper before any command can insert there. */
  normalizePopupSelection(): boolean {
    const selection = document.getSelection()
    if(!selection?.anchorNode) return true
    if(!selection.isCollapsed) {
      const range = selection.rangeCount === 1 ? selection.getRangeAt(0) : null
      const child = range && range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1
        ? range.startContainer.childNodes.item(range.startOffset) : null
      if(isElement(child) && ["toggle", "content"].includes(popupElementRole(child) ?? "")) return true
      if(isElement(child) && popupElementRole(child) === "toggle") return false
      const part = (node: Node) => {
        const element = isElement(node) ? node : node.parentElement
        const candidate = element?.closest("button[popovertarget], [popover]")
        return candidate && ["toggle", "content"].includes(popupElementRole(candidate) ?? "") ? candidate : null
      }
      if(range) {
        const start = part(range.startContainer), end = part(range.endContainer)
        if(start || end) return start !== null && start === end
      }
      return true
    }
    const node = selection.anchorNode
    const wrapper = (isElement(node) ? node : node.parentElement)?.closest("span.ww-popup")
    if(!wrapper || popupElementRole(wrapper) !== "popup") return true
    const toggle = Array.from(wrapper.children).find(element => popupElementRole(element) === "toggle")
    const content = toggle && popupContentForToggle(toggle)
    if(!toggle || !content) return false
    if(toggle.contains(node) || content.contains(node)) return true
    let position = selection.anchorOffset
    if(node !== wrapper) {
      const child = Array.from(wrapper.childNodes).findIndex(child => child === node || child.contains(node))
      if(child < 0) return false
      position = child + (node instanceof Text && selection.anchorOffset === node.length ? 1 : 0)
    }
    const toggleIndex = Array.from(wrapper.childNodes).indexOf(toggle)
    const contentIndex = Array.from(wrapper.childNodes).indexOf(content)
    if(position > Math.max(toggleIndex, contentIndex) && wrapper.parentNode) {
      $.move(wrapper.parentNode, Array.from(wrapper.parentNode.childNodes).indexOf(wrapper) + 1)
      return true
    }
    const end = position > toggleIndex
    const point = textPointAtOffset(toggle, end ? toggle.textContent?.length ?? 0 : 0, [toggle, end ? toggle.childNodes.length : 0])
    $.move(point[0], point[1])
    return true
  }

  /** Resolve the four text positions at an inline Popup's toggle. */
  #popupCaretBoundary(selection: Selection, node: Node | null = selection.focusNode, offset = selection.focusOffset): {wrapper: Element, toggle: Element, inside: boolean, start: boolean} | null {
    if(!selection.isCollapsed || !node) return null
    const toggle = (isElement(node) ? node : node.parentElement)?.closest("button[popovertarget]")
    if(toggle && popupElementRole(toggle) === "toggle") {
      const wrapper = toggle.closest("span.ww-popup")
      const textOffset = textOffsetIn(toggle, node, offset)
      if(!wrapper || textOffset === null) return null
      if(textOffset === 0) return {wrapper, toggle, inside: true, start: true}
      if(textOffset === (toggle.textContent?.length ?? 0)) return {wrapper, toggle, inside: true, start: false}
      return null
    }
    let container: Node, position: number
    if(node instanceof Text) {
      if(offset !== 0 && offset !== node.length) return null
      if(!node.parentNode) return null
      container = node.parentNode
      position = Array.from(container.childNodes).indexOf(node) + (offset === node.length ? 1 : 0)
    }
    else if(isElement(node)) { container = node; position = offset }
    else return null
    const edgePopup = (candidate: Node, direction: "start" | "end"): Element | null => {
      if(!isElement(candidate)) return null
      if(popupElementRole(candidate) === "popup" && candidate.localName === "span") return candidate
      if(!isMarkElement(candidate) || Boolean(isAtomicEditingElement(candidate, this.editor.schema))) return null
      const children = Array.from(candidate.childNodes)
      if(direction === "end") children.reverse()
      for(const child of children) {
        if(child.nodeType === Node.COMMENT_NODE || child instanceof Text && !child.data.trim() || isOutOfFlow(child)) continue
        return edgePopup(child, direction)
      }
      return null
    }
    const adjacent = (direction: "before" | "after") => {
      const step = direction === "before" ? -1 : 1
      for(let i = direction === "before" ? position - 1 : position; i >= 0 && i < container.childNodes.length; i += step) {
        const candidate = container.childNodes.item(i)
        if(candidate.nodeType === Node.COMMENT_NODE || candidate instanceof Text && !candidate.data.trim() || isOutOfFlow(candidate)) continue
        return edgePopup(candidate, direction === "before" ? "end" : "start")
      }
      return null
    }
    const before = adjacent("before")
    if(before) {
      const toggle = Array.from(before.children).find(element => popupElementRole(element) === "toggle")
      if(toggle) return {wrapper: before, toggle, inside: false, start: false}
    }
    const after = adjacent("after")
    const nextToggle = after && Array.from(after.children).find(element => popupElementRole(element) === "toggle")
    return after && nextToggle ? {wrapper: after, toggle: nextToggle, inside: false, start: true} : null
  }

  /** Browser typing at an outer inline boundary can otherwise land in the
   * adjacent button even though the live Range remains in the paragraph. */
  isOutsidePopupBoundary() {
    return Boolean(this.outsidePopupBoundary())
  }

  outsidePopupBoundary(direction?: "backward" | "forward") {
    const selection = document.getSelection()
    const boundary = selection && this.#popupCaretBoundary(selection)
    return boundary && !boundary.inside && (!direction || boundary.start === (direction === "backward"))
      ? {wrapper: boundary.wrapper, start: boundary.start} : null
  }

  /** Use neighboring text as the outer caret when it exists, avoiding a
   * second stop at the same painted position in the paragraph. */
  #popupOutsidePoint(wrapper: Element, start: boolean): [Node, number] {
    const parent = wrapper.parentNode!
    const index = Array.from(parent.childNodes).indexOf(wrapper) + (start ? 0 : 1)
    let sibling = start ? wrapper.previousSibling : wrapper.nextSibling
    while(sibling && (sibling.nodeType === Node.COMMENT_NODE || sibling instanceof Text && !sibling.length)) {
      sibling = start ? sibling.previousSibling : sibling.nextSibling
    }
    return sibling instanceof Text ? [sibling, start ? sibling.length : 0] : [parent, index]
  }

  selectOutsidePopupBoundary(wrapper: Element, start: boolean) {
    if(!wrapper.isConnected || !wrapper.parentNode) return
    const point = this.#popupOutsidePoint(wrapper, start)
    $.move(point[0], point[1])
    this.processSelection()
  }

  /** Cross only the toggle's two edges; the bubble is never a stop in the
   * paragraph's horizontal navigation. */
  #navigatePopupBoundary(direction: "backward" | "forward") {
    const selection = document.getSelection()
    const selected = selection && $.selectedElement
    if(selected && popupElementRole(selected) === "toggle") {
      const start = direction === "backward"
      const point = textPointAtOffset(selected, start ? 0 : selected.textContent?.length ?? 0,
        [selected, start ? 0 : selected.childNodes.length])
      $.move(point[0], point[1])
      this.processSelection()
      return true
    }
    if(selection?.isCollapsed && selection.focusNode instanceof Text) {
      const text = selection.focusNode
      const edge = direction === "forward" ? text.length : 0
      if(selection.focusOffset + (direction === "forward" ? 1 : -1) === edge) {
        const approaching = this.#popupCaretBoundary(selection, text, edge)
        if(approaching && !approaching.inside && approaching.start === (direction === "forward")) {
          $.move(text, edge)
          this.processSelection()
          return true
        }
      }
    }
    const boundary = selection && this.#popupCaretBoundary(selection)
    if(!boundary || !boundary.wrapper.parentNode) return false
    const {wrapper, toggle, inside, start} = boundary
    if(inside ? direction === "backward" ? !start : start
      : direction === "backward" ? start : !start) return false
    if(inside) {
      const point = this.#popupOutsidePoint(wrapper, start)
      $.move(point[0], point[1])
    }
    else {
      const point = textPointAtOffset(toggle, start ? 0 : toggle.textContent?.length ?? 0,
        [toggle, start ? 0 : toggle.childNodes.length])
      $.move(point[0], point[1])
    }
    this.processSelection()
    return true
  }

  /** Keep the outer block gap distinct from a Popup's inline text boundary. */
  #navigatePopupParagraphGap(direction: "backward" | "forward") {
    const selection = document.getSelection()
    const boundary = selection && this.#popupCaretBoundary(selection)
    if(!boundary || boundary.inside || boundary.start !== (direction === "backward")) return false
    const paragraph = boundary.wrapper.closest("p")
    if(!paragraph || !isCaretAtBoundary(paragraph, direction === "backward" ? "start" : "end")) return false
    $.selectGap(paragraph, direction === "backward" ? "before" : "after")
    this.processSelection()
    return true
  }

  /** Selects an adjacent atomic node, extends across it with a fixed anchor,
   * or collapses a node selection into the requested boundary. */
  #navigateAtomicSelection(direction: "backward" | "forward", vertical = false, extend = false) {
    const navigable = (element: Node | null): element is Element => element instanceof Element
      && (Boolean(isAtomicEditingElement(element, this.editor.schema)) || element.matches('figure, table:has(> caption), math[display="block"]'))
    const container = $.anchor ? getContainer($.anchor) : null
    const owner = container?.closest("figure, table:has(> caption)")
    const caption = container?.closest("figcaption, caption")
    const captionEdge = caption && owner && (caption.localName === "caption"
      ? (getComputedStyle(caption).captionSide === "bottom") === (direction === "forward")
      : caption === (direction === "backward" ? owner.firstElementChild : owner.lastElementChild))
    if(!extend && $.isEmpty && owner && !isOutOfFlow(owner)
      && this.#atDisclosureEdge(captionEdge ? caption! : owner, direction, vertical)) {
      $.selectGap(owner, direction === "backward" ? "before" : "after")
      this.processSelection()
      return true
    }
    const selectedElement = $.selectedElement
    if(!extend && selectedElement && navigable(selectedElement)) {
      $.selectGap(selectedElement, direction === "backward" ? "before" : "after")
    }
    else {
      const atomicEdge = (element: Element | null) => element && extend
        ? this.#disclosureEdge(element, direction === "forward" ? "backward" : "forward") : element
      let adjacent = atomicEdge(this.#adjacentNavigationElement(direction, false, extend))
      if(adjacent && !navigable(adjacent)) adjacent = null
      const block = this.#selectionBlock(extend ? $.focus : $.anchor)
      if(!adjacent && block && (vertical || this.#isCaretAtBlockBoundary(block, direction, extend))) {
        adjacent = atomicEdge(this.#adjacentNavigationElement(direction, true, extend))
      }
      if(!adjacent || !navigable(adjacent)) return false
      if(extend) {
        const parent = adjacent.parentNode!
        const index = Array.from(parent.childNodes).indexOf(adjacent)
        // Native extension can synchronously focus the editing surface and
        // refresh selection. Install both endpoints before normalizing it.
        const settingRanges = $.isSettingRanges
        $.isSettingRanges = true
        try {
          $.extend(parent, index + (direction === "forward" ? 1 : 0))
          this.#atomicExtension = {range: $.range.cloneRange(), backwards: $.isBackwards}
        }
        finally { $.isSettingRanges = settingRanges }
      }
      else $.selectElement(adjacent)
    }
    this.processSelection()
    return true
  }

  /** Deletion first selects an adjacent opaque widget so its contents cannot
   * be removed or merged into a neighboring block by the same keypress. */
  selectAdjacentContentlessWidget(direction: "backward" | "forward") {
    if(this.isCaptureSelection) return false
    const adjacent = this.#adjacentNavigationElement(direction)
    if(!(adjacent instanceof HTMLElement) || !(adjacent.localName.includes("-") || adjacent.hasAttribute("is"))
      || isContentfulWidget(adjacent, this.editor.schema)) return false
    this.selectElement(adjacent)
    return true
  }

  /** Stop outside a formula before entering its own caret navigation. */
  #navigateMathBoundary(direction: "backward" | "forward") {
    if(!$.isEmpty || mathRoot($.anchor)) return false
    const adjacent = this.#adjacentNavigationElement(direction)
    if(!adjacent || mathRoot(adjacent) !== adjacent || adjacent.getAttribute("display") === "block") return false
    const point = mathOutsidePoint(adjacent, direction === "backward")!
    const index = Array.from(adjacent.parentNode!.childNodes).indexOf(adjacent)
    if($.anchor === point.node && $.anchorOffset === point.offset
      || $.anchor === adjacent.parentNode && $.anchorOffset === index + (direction === "backward" ? 1 : 0)) {
      this.editor.features.math.enter(adjacent, direction === "backward")
    }
    else $.move(point.node, point.offset)
    this.processSelection()
    return true
  }

  /** Visible editing edge of a disclosure. Closed disclosures expose only
   * their summary; custom elements remain atomic and are never traversed. */
  #disclosureEdge(node: Node, direction: "backward" | "forward"): Node | null {
    if(node instanceof Text) return node.textContent?.trim() ? node : null
    if(!isElement(node) || isOutOfFlow(node) || node.matches("br, [hidden], .◆editor-only") || getComputedStyle(node).display === "none") return null
    if(Boolean(isAtomicEditingElement(node, this.editor.schema)) || node.matches('math[display="block"]')) return node
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

  #navigateContainerGap(direction: "backward" | "forward", vertical: boolean) {
    const selected = $.selectedElement
    if(selected && (selected.matches("ul, ol, dl, menu, details, table") || isContentfulWidget(selected, this.editor.schema))) {
      $.selectGap(selected, direction === "backward" ? "before" : "after")
      this.processSelection()
      return true
    }
    if(!$.isEmpty || !$.anchor || !getDocumentRoot().contains($.anchor)) return false
    let widget = isElement($.anchor) ? $.anchor : $.anchor.parentElement
    while(widget && !isContentfulWidget(widget, this.editor.schema)) widget = widget.parentElement
    if(widget && (!this.editor.schema.get(widget).inseperable || !isContentfulWidget(widget.parentElement, this.editor.schema))
      && this.#atDisclosureEdge(widget, direction, vertical)) {
      $.selectGap(widget, direction === "backward" ? "before" : "after")
      this.processSelection()
      return true
    }
    const adjacent = this.#adjacentNavigationElement(direction)
    // A divider gap inside a cell still addresses the divider. Let atomic
    // navigation select it before considering a jump out of the table.
    if(adjacent && $.dividerGap?.element === adjacent) return false
    if($.listGap || $.detailsGap || $.captionedGap?.element.matches("table") || $.blockGap && isContentfulWidget($.blockGap.element, this.editor.schema)) {
      const outer = getContainer($.anchor).closest("ul, ol, dl, menu, details, table")
      if(outer && (!outer.matches("details") || outer.hasAttribute("open")) && this.#atDisclosureEdge(outer, direction, false)) {
        $.selectGap(outer, direction === "backward" ? "before" : "after")
        this.processSelection()
        return true
      }
      if(!adjacent) return this.#isCaretAtBlockBoundary(getDocumentRoot(), direction)
      const edge = this.#disclosureEdge(adjacent, direction === "forward" ? "backward" : "forward")
      if(!edge) return false
      if(isAtomicEditingElement(edge, this.editor.schema)) $.selectElement(edge)
      else $.move(edge, direction === "forward" ? 0 : -1)
    }
    else {
      const container = getContainer($.anchor).closest("ul, ol, dl, menu, details, table")
      const scope = container?.matches("details:not([open])") ? container.querySelector(":scope > summary") : container
      if(container && scope && this.#atDisclosureEdge(scope, direction, vertical)) {
        $.selectGap(container, direction === "backward" ? "before" : "after")
      }
      else {
        const block = this.#selectionBlock()
        if(isEmptyParagraph(block)) return false
        const neighbor = adjacent ?? (block && this.#atDisclosureEdge(block, direction, vertical)
          ? this.#adjacentNavigationElement(direction, true) : null)
        if(!neighbor || !(neighbor.matches("ul, ol, dl, menu, details, table") || isContentfulWidget(neighbor, this.editor.schema))) return false
        $.selectGap(neighbor, direction === "forward" ? "before" : "after")
      }
    }
    this.processSelection()
    return true
  }

  /** Expose block edges to vertical navigation without manufacturing DOM
   * nodes. The browser retains line navigation until the first or last line. */
  #navigateBlockGap(direction: "backward" | "forward") {
    if(!$.isEmpty || !$.anchor || !getDocumentRoot().contains($.anchor)) return false
    if($.isGapSelection) {
      if(direction === "backward") return false
      const adjacent = this.#adjacentNavigationElement(direction)
      if(!adjacent || isAtomicEditingElement(adjacent, this.editor.schema)) return false
      const edge = this.#disclosureEdge(adjacent, direction === "forward" ? "backward" : "forward")
      if(!edge) return false
      $.move(edge, direction === "forward" ? 0 : -1)
      this.processSelection()
      return true
    }
    let block = this.#selectionBlock()
    if(!block) {
      let element = isElement($.anchor) ? $.anchor : $.anchor.parentElement
      while(element && element !== getDocumentRoot() && !isSectionElement(element)) element = element.parentElement
      if(element !== getDocumentRoot()) block = element
    }
    if(!block || isEmptyParagraph(block) || !block.parentElement || block.parentElement.matches("table, thead, tbody, tfoot, tr, colgroup")
      || block.closest("ul, ol, dl, menu, details, figure")
      || !this.#atDisclosureEdge(block, direction, true)) return false
    $.selectGap(block, direction === "backward" ? "before" : "after")
    this.processSelection()
    return true
  }

  /** ArrowUp from a structural gap enters the preceding text block.
   * Native line navigation can skip that block when BODY hosts a shadow slot. */
  #navigateTextFromGap() {
    if(!$.isGapSelection || !$.isEmpty) return false
    const adjacent = this.#adjacentNavigationElement("backward")
    if(!adjacent || Boolean(isAtomicEditingElement(adjacent, this.editor.schema))) return false
    const nearest = this.#disclosureEdge(adjacent, "backward")
    if(!(nearest instanceof Text)) return false
    const block = this.#selectionBlock(nearest)
    if(!block || !adjacent.contains(block)) return false
    const start = this.#disclosureEdge(block, "forward")
    if(!(start instanceof Text)) return false
    $.move(start, 0)
    this.processSelection()
    return true
  }

  readonly #handleSharedChange = (transaction: Transaction) => {
    if(this.#sharedRefreshQueued) return
    const transformed = this.editor.features.transformation.stableSingleTransformTarget()
    // The transform frame updates the outline. The authored style observers
    // publish toolbar state, and syncFromDOM mirrors the native selection.
    if(transformed && this.editor.doc.isLocalStyleOnlySync(transaction, transformed)) return
    if(this.editor.features.table.keepsSelectionDuringResize(transaction)) return
    this.queueSelectionRefresh()
  }

  /** Coalesces a DOM command's final selection with its shared change. */
  queueSelectionRefresh() {
    if(this.#sharedRefreshQueued) return
    this.#sharedRefreshQueued = true
    queueMicrotask(() => {
      this.#sharedRefreshQueued = false
      if(!this.isEnabled) return
      this.processSelection(undefined, {scrollIntoView: false, refreshGraphic: false})
      this.editor.features.graphic.refresh()
      // Shared DOM changes can clamp a detached selection without firing a
      // native selectionchange event, so refresh the host breadcrumb as well.
      this.editor.queueSelectionState({path: true})
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
    if(this.editor.features.mark.isSVGTextSelection) return
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const atomic = (node: Node) => node.getRootNode() instanceof ShadowRoot
      ? atomicEditingContainer(node, this.editor.schema) : mediaContainerForNode(node) ?? (graphicContainerForNode(node) ? atomicEditingContainer(node, this.editor.schema) : null)
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
      // A native paragraph selection can end at the following media's start.
      // Move that boundary before the host rather than selecting its contents.
      if(node === element && offset === 0 && !selection.isCollapsed) after = false
      return [element.parentNode, Array.from(element.parentNode.childNodes).indexOf(element) + (after ? 1 : 0)]
    }
    selection.setBaseAndExtent(...outside(anchor, selection.anchorNode, selection.anchorOffset, backward),
      ...outside(focus, selection.focusNode, selection.focusOffset, !backward))
  }

  /** Enables the feature and places the selection at the document start. */
  /** A native range can cross independent flows, but its active endpoint
   * must stay in the flow where the interaction began. */
  #constrainSelectionToFlow() {
    const selection = document.getSelection()
    const drag = this.#drag
    if(selection && drag?.scope) {
      if(drag.scope.contains(drag.anchor.startContainer) && drag.scope.contains(drag.lastFocus.startContainer)
        && (!drag.scope.contains(selection.anchorNode) || !drag.scope.contains(selection.focusNode))) {
        selection.setBaseAndExtent(drag.anchor.startContainer, drag.anchor.startOffset, drag.lastFocus.startContainer, drag.lastFocus.startOffset)
      }
    }
    if(!selection?.anchorNode || !selection.focusNode || selection.isCollapsed || $.selectedElement || $.isMultiElementSelection) return
    if(this.#layoutSelectionItem(selection.anchorNode, selection.focusNode)) return
    const flow = editingFlowRoot(selection.anchorNode)
    if(editingFlowRoot(selection.focusNode) === flow) return
    const backwards = $.isBackwards
    if(flow.contains(selection.focusNode)) {
      let foreign = editingFlowRoot(selection.focusNode)
      while(foreign.parentElement && editingFlowRoot(foreign.parentElement) !== flow) {
        foreign = editingFlowRoot(foreign.parentElement)
      }
      if(popupElementRole(foreign) === "content") foreign = popupDisplayToggle(foreign)?.closest(".ww-popup") ?? foreign
      const parent = foreign.parentNode!
      const index = Array.from(parent.childNodes).indexOf(foreign)
      selection.extend(parent, index + (backwards ? 0 : 1))
    }
    else selection.extend(flow, backwards ? 0 : flow.childNodes.length)
  }

  enable() {
    if(this.isEnabled) return
    const first = document.body.firstElementChild
    if(first?.localName === this.editor.schema.defaultNodeKey
      && document.body.childNodes.length === 1 && !first.childNodes.length) $.move(first)
    else if(!this.editor.options.reader) $.selectDocumentStart()
    super.enable()
    this.#selectionMarkers = new Set(presentationStateElements(document, ...selectionPresentationStates))
    this.#floatObserver = new MutationObserver(this.#handlePresentationChanges)
    this.#floatObserver.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true,
    })
    window.addEventListener("resize", this.#invalidateFloatCandidates)
    window.addEventListener("resize", this.#refreshGapCaretInlinePosition)
    document.addEventListener("load", this.#invalidateFloatCandidates, true)
    document.addEventListener("pointerover", this.#trackNativeHover, {capture: true, passive: true})
    document.addEventListener("pointerout", this.#trackNativeHover, {capture: true, passive: true})
    this.#ensureHoverCaret()
    window.addEventListener("focus", this.#handleWindowFocus)
    window.addEventListener("blur", this.#handleWindowBlur)
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    this.processSelection()
  }

  disable() {
    this.#captureClick = null
    if(!this.isEnabled) return
    this.editor.features.widget.syncLegacyOptions(null)
    this.#floatObserver?.disconnect()
    this.#floatObserver = null
    this.#invalidateFloatCandidates()
    window.removeEventListener("resize", this.#invalidateFloatCandidates)
    window.removeEventListener("resize", this.#refreshGapCaretInlinePosition)
    document.removeEventListener("load", this.#invalidateFloatCandidates, true)
    document.removeEventListener("pointerover", this.#trackNativeHover, true)
    document.removeEventListener("pointerout", this.#trackNativeHover, true)
    this.#nativeBodyHover = null
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    window.removeEventListener("focus", this.#handleWindowFocus)
    window.removeEventListener("blur", this.#handleWindowBlur)
    this.#endDrag()
    this.#focusedContentfulShadow = null
    this.#modifierClick = false
    this.#touchSelection = false
    this.#atomicExtension = null
    $.clearLayoutRanges()
    this.#releaseCaptureSelection()
    if(this.#revealSelectionFrame !== null) cancelAnimationFrame(this.#revealSelectionFrame)
    this.#revealSelectionFrame = null
    this.#lastScrollSelection = null
    this.clearSelectedSection()
    this.#clearElementHover()
    this.#clearStyleTargetHover()
    this.#nativeHoverTarget = null
    this.#clearHoverGeometry()
    this.editor.features.transformation.clearTransform()
    this.#clearSelections()
    this.selectionCaret?.remove()
    this.editor.features.manipulation.endNodeDrag(false)
    this.hoverCaret?.remove()
    this.emptyDocumentCaret?.remove()
    this.#clearKeyState()
    super.disable()
  }

  readonly #handleWindowFocus = () => {
    this.#clearKeyState()
    if(!this.editor.features.media.isPlaceholderInteraction) this.processSelection(undefined, {scrollIntoView: false})
  }

  readonly #handleWindowBlur = () => {
    // Modifier releases in another window may never deliver a keyup here.
    this.#clearKeyState()
    this.#endDrag()
  }

  #clearKeyState() {
    ;[document.documentElement, document.body].forEach(element => {
      clearPresentationState(element, "key-mod-down")
    })
  }

  #pointerHovered = new Set<Element>()
  #nativeBodyHover: Element | null = null

  /** The hover outline is shown and hidden through parts of the outline
   * itself. A BODY:has(:hover)::part() rule cannot narrow what it affects, so
   * every hover change would restyle the whole document. */
  readonly #trackNativeHover = (event: PointerEvent) => {
    const target = event.type === "pointerout" ? event.relatedTarget : event.target
    this.#nativeBodyHover = target instanceof Element && target !== document.body && document.body.contains(target) ? target : null
    this.#syncHoverParts()
  }

  #syncHoverParts() {
    const caret = this.hoverCaret
    if(!caret) return
    const native = this.#nativeBodyHover?.isConnected ? this.#nativeBodyHover : null
    const captured = presentationStateElements(document, "element-capture-selected")
    const quiet = (element: Element) => element.matches("summary, figcaption") || captured.includes(element)
    let suppressed = [...this.#pointerHovered, ...presentationStateElements(document, "element-hovered", "style-target-hovered")].some(quiet)
    for(let element = native; element && element !== document.body && !suppressed; element = element.parentElement) suppressed = quiet(element)
    setPart(caret, "hover-caret-native", Boolean(native) || this.#pointerHovered.size > 0)
    setPart(caret, "hover-caret-suppressed", suppressed)
  }

  #updatePointerHover(target: Element | null) {
    const hovered = new Set<Element>()
    // The state stands in for :hover while a pressed pointer keeps native
    // hover on its starting element. Rewriting its rules restyles every
    // element they can match, so leave a natively hovered chain to :hover.
    let nativelyHovered = false
    try { nativelyHovered = Boolean(target?.matches(":hover")) } catch { nativelyHovered = false }
    for(let element = nativelyHovered ? null : target; element && element !== document.body && document.body.contains(element); element = element.parentElement) {
      hovered.add(element)
    }
    batchPresentationStates(document, () => {
      for(const element of this.#pointerHovered) {
        if(!hovered.has(element)) clearPresentationState(element, "pointer-hovered")
      }
      for(const element of hovered) setPresentationState(element, "pointer-hovered")
    })
    this.#pointerHovered = hovered
    this.#syncHoverParts()
    if(this.#drag) {
      this.#nativeHoverTarget = target
      this.#refreshHoverGeometry()
    }
  }

  /** Pointer capture keeps the whole editor drag in the outer document, even
   * when crossing a widget, native media controls, or a child frame. */
  readonly #endDrag = () => {
    if(this.#dragScrollFrame !== null) cancelAnimationFrame(this.#dragScrollFrame)
    this.#dragScrollFrame = null
    this.#dragScrollPointer = null
    this.#touchTap = null
    const wasDragging = this.isInDragSelection
    const pointerId = this.#boxDrag?.pointerId ?? this.#drag?.pointerId
    const target = this.#boxDrag ? document.body : this.#drag?.target
    this.#boxDrag?.overlay.remove()
    if(this.#boxDrag?.previews.size) {
      this.#boxDrag.previews.forEach(overlay => { this.#atomicAnchors.release(overlay); overlay.remove() })
      this.#atomicAnchors.refresh()
    }
    this.#boxDrag = null
    if(!this.#atomicOverlays.size && this.#atomicOverlayFrame !== null) {
      cancelAnimationFrame(this.#atomicOverlayFrame)
      this.#atomicOverlayFrame = null
    }
    this.#drag = null
    this.dragAnchor = null
    this.isInDragSelection = false
    this.#updatePointerHover(null)
    if(wasDragging) {
      this.editor.postSelectionPath()
      this.editor.postMarkState()
      this.editor.postCommentState()
      queueMicrotask(() => this.editor.features.media.refreshPlaceholder())
    }
    if(pointerId !== undefined && target?.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }

  #applyDragRange(anchor: Range, focus: Range, extend = false) {
    const selection = document.getSelection()
    if(!selection) return
    this.#settingDragSelection = true
    try {
      if(extend) {
        if(selection.anchorNode !== anchor.startContainer || selection.anchorOffset !== anchor.startOffset) selection.setPosition(anchor.startContainer, anchor.startOffset)
        selection.extend(focus.startContainer, focus.startOffset)
      }
      else selection.setBaseAndExtent(anchor.startContainer, anchor.startOffset, focus.startContainer, focus.startOffset)
    }
    finally { this.#settingDragSelection = false }
  }

  readonly #finishDrag = (event: PointerEvent) => {
    const tap = this.#touchTap
    if(tap) {
      if(tap.pointerId !== event.pointerId) return
      this.#touchTap = null
      if(event.type !== "pointerup" || event.defaultPrevented || !tap.target.isConnected || this.editor.isEditingLocked
        || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) return
      if(tap.box) this.beginBoxSelection(event)
      else this.#handlePointerDown(event, tap.fromCanvasSlot)
    }
    if(this.#boxDrag) {
      if(this.#boxDrag.pointerId !== undefined && this.#boxDrag.pointerId !== event.pointerId) return
      if(event.type === "pointerup") {
        this.#extendBoxSelection(event)
        const elements = this.#boxDrag?.elements
        if(elements) {
          this.#settingDragSelection = true
          try {
            if(elements.length) $.selectElements(elements)
            else $.selectRange(this.#boxDrag!.root, 0)
          }
          finally { this.#settingDragSelection = false }
        }
      }
      this.#endDrag()
      this.processSelection(false, {scrollIntoView: false})
      return
    }
    if(this.#drag?.pointerId !== undefined && this.#drag.pointerId !== event.pointerId) return
    const drag = this.#drag
    if(event.type === "pointerup" && drag && !drag.nativeClick && (!drag.moved && !drag.unit || drag.fromGap)) {
      // Native focus can replace a prevented gap press or its final range
      // with a paragraph caret. Restore the endpoints chosen by hit testing;
      // live Ranges track intervening DOM edits without retaining stale offsets.
      const root = getDocumentRoot()
      if(root.contains(drag.anchor.startContainer) && root.contains(drag.focus.startContainer)) {
        document.body.focus({preventScroll: true})
        const focus = drag.moved ? drag.lastFocus : drag.focus
        this.#applyDragRange(drag.anchor, focus, drag.fromGap)
      }
    }
    if(drag?.fromGap && drag.moved && document.getSelection()?.rangeCount && !document.getSelection()!.isCollapsed) {
      this.#atomicExtension = {range: document.getSelection()!.getRangeAt(0).cloneRange(), backwards: $.isBackwards}
    }
    const dragging = this.isInDragSelection
    if(drag?.scope) this.#constrainSelectionToFlow()
    const slotted = drag?.slotSurface?.isConnected
      ? widgetSlotContentFromCoords(event.clientX, event.clientY, drag.slotSurface, this.editor.schema) : null
    const clickContent = slotted?.element ?? (drag?.scope && popupElementRole(drag.scope) === "content"
      && document.getSelection()?.focusNode instanceof Text && drag.scope.contains(document.getSelection()!.focusNode) ? drag.scope : null)
      ?? (drag?.textAcrossWidgets && document.getSelection()?.focusNode instanceof Text ? getContainer(document.getSelection()!.focusNode!) : null)
    if(event.type === "pointerup" && drag && clickContent && !drag.moved) {
      const last = this.#lastContentPointerClick
      const count = last?.content === clickContent && performance.now() - last.time < 600
        && Math.abs(event.clientX - last.x) < 8 && Math.abs(event.clientY - last.y) < 8 ? last.count + 1 : 1
      this.#lastContentPointerClick = {content: clickContent, x: event.clientX, y: event.clientY, time: performance.now(), count}
      if(count >= 2) this.#selectContentClickGranularity(event, count >= 3 ? "paragraph" : "word", drag.slotSurface)
    }
    else if(event.type === "pointerup") this.#lastContentPointerClick = null
    this.#endDrag()
    if(dragging) this.processSelection(undefined, {scrollIntoView: false})
    if(event.type === "pointerup" && drag && !drag.moved
      && this.editor.options.touchKeyboard && this.editor.features.manipulation.canTypeWithTextKeyboard) {
      this.editor.postHostMessage({type: textKeyboardRequestEvent, pointerType: drag.pointerType})
    }
  }

  #beginDrag(event: PointerEvent, nativeClick: boolean, textAcrossWidgets = false) {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) {
      this.#endDrag()
      return
    }
    const flow = editingFlowRoot(selection.focusNode)
    const fromGap = !nativeClick && $.isGapSelection
    // A popup bubble is its own editing flow even in the document layout.
    const popupScope = popupElementRole(flow) === "content" && flow.contains(selection.anchorNode) ? flow : null
    const scope = popupScope ?? this.#layoutSelectionItem(selection.focusNode, selection.focusNode)
    if(scope && !scope.contains(selection.anchorNode)) selection.collapse(selection.focusNode, selection.focusOffset)
    const anchor = document.createRange()
    anchor.setStart(selection.anchorNode, selection.anchorOffset)
    anchor.collapse(true)
    const focus = document.createRange()
    focus.setStart(selection.focusNode, selection.focusOffset)
    focus.collapse(true)
    const target = document.body
    const origin = event.composedPath()[0]
    const slotSurface = origin instanceof Element && widgetSlotContentFromCoords(event.clientX, event.clientY, origin, this.editor.schema) ? origin : undefined
    this.#drag = {anchor, focus, lastFocus: focus.cloneRange(), scope, x: event.clientX + window.scrollX, y: event.clientY + window.scrollY,
      nativeClick, fromGap, moved: false, target, slotSurface, textAcrossWidgets, pointerId: event.pointerId, pointerType: event.pointerType}
    this.dragAnchor = {node: selection.anchorNode, offset: selection.anchorOffset}
    this.isInDragSelection = true
    this.editor.features.media.refreshPlaceholder()
    this.editor.postSelectionPath()
    // BODY capture suppresses descendant :hover; retain the native hover path
    // and hit-test subsequent moves independently of the captured event target.
    this.#updatePointerHover(event.target instanceof Element ? event.target : null)
    // Capture on BODY so native mouse selection can cross paragraph boundaries;
    // capturing the clicked paragraph makes Chromium clamp the range to it.
    // The original click still establishes native editing focus.
    if(event.pointerId !== undefined) {
      try { target.setPointerCapture(event.pointerId) } catch { /* Synthetic or already cancelled pointer. */ }
    }
  }

  readonly #extendDrag = (event: PointerEvent) => {
    if(this.#boxDrag) { this.#extendBoxSelection(event); return }
    if(!this.isInDragSelection) return
    const drag = this.#drag
    if(!drag || drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return
    // Live Ranges track inserts/removals at the saved endpoints. Revalidate
    // their current roots before using them after a concurrent DOM mutation.
    const root = drag.scope ?? getDocumentRoot()
    if(!root.isConnected || drag.scope && popupElementRole(drag.scope) !== "content"
      && this.#layoutSelectionItem(drag.scope, drag.scope) !== drag.scope
      || !root.contains(drag.anchor.startContainer) || !root.contains(drag.focus.startContainer)) {
      this.#endDrag()
      this.processSelection()
      return
    }
    const atOrigin = Math.abs(event.clientX + window.scrollX - drag.x) <= 2
      && Math.abs(event.clientY + window.scrollY - drag.y) <= 2
    if(!drag.moved && atOrigin) return
    if(!drag.moved) {
      drag.moved = true
    }
    this.#scheduleDragScroll(event)
    let x = Math.max(0, Math.min(event.clientX, window.innerWidth - 1))
    let y = Math.max(0, Math.min(event.clientY, window.innerHeight - 1))
    if(drag.scope instanceof HTMLElement || drag.scope instanceof SVGSVGElement) {
      const {rect, width, height, matrix} = this.editor.features.transformation.boxGeometry(drag.scope)
      if(matrix.is2D && Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) > 1e-8 && width > 2 && height > 2) {
        const center = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
        const local = matrix.inverse().transformPoint({x: x - center.x, y: y - center.y})
        const clamped = matrix.transformPoint({x: Math.max(1 - width / 2, Math.min(local.x, width / 2 - 1)),
          y: Math.max(1 - height / 2, Math.min(local.y, height / 2 - 1))})
        x = center.x + clamped.x; y = center.y + clamped.y
      }
    }
    const point = atOrigin
      ? {node: drag.focus.startContainer, offset: drag.focus.startOffset}
      : (drag.textAcrossWidgets ? this.#authoredTextPoint(x, y, event.target) : null)
        ?? $.pointFromCoords(x, y, event.target, this.editor.schema, editingFlowRoot(drag.anchor.startContainer), drag.scope ?? undefined, drag.anchor)
    if(!point || !root.contains(point.node)) return
    drag.lastFocus.setStart(point.node, point.offset)
    drag.lastFocus.collapse(true)
    if(drag.unit) {
      const origin = drag.unit.range
      const unit = this.#positionedTextUnit(root, point.node, point.offset, drag.unit.kind)
      if(!unit || !root.contains(origin.startContainer) || !root.contains(origin.endContainer)) return
      const before = origin.comparePoint(point.node, point.offset) < 0
      document.getSelection()?.setBaseAndExtent(
        before ? origin.endContainer : origin.startContainer, before ? origin.endOffset : origin.startOffset,
        before ? unit.startContainer : unit.endContainer, before ? unit.startOffset : unit.endOffset,
      )
    }
    else if(drag.fromGap) {
      this.#applyDragRange(drag.anchor, drag.lastFocus, true)
    }
    else document.getSelection()?.setBaseAndExtent(drag.anchor.startContainer, drag.anchor.startOffset, point.node, point.offset)
    this.processSelection(true)
  }

  #scheduleDragScroll(event: PointerEvent) {
    this.#dragScrollPointer = event
    if(this.#dragScrollFrame !== null || this.editor.features.canvas.active || this.editor.features.slides.active) return
    const delta = (value: number, end: number) => value < 32 ? -Math.min(16, (32 - value) / 2)
      : value > end - 32 ? Math.min(16, (value - end + 32) / 2) : 0
    if(!delta(event.clientX, window.innerWidth) && !delta(event.clientY, window.innerHeight)) return
    this.#dragScrollFrame = requestAnimationFrame(() => {
      this.#dragScrollFrame = null
      const pointer = this.#dragScrollPointer
      if(!pointer || !this.#drag?.moved || !this.isInDragSelection) return
      const left = delta(pointer.clientX, window.innerWidth), top = delta(pointer.clientY, window.innerHeight)
      if(!left && !top) return
      const x = window.scrollX, y = window.scrollY
      window.scrollBy({left, top, behavior: "instant"})
      if(window.scrollX !== x || window.scrollY !== y) this.#extendDrag(pointer)
    })
  }

  #positionedTextUnit(scope: Element, node: Node, offset: number, kind: "word" | "paragraph") {
    const block = getContainer(node)
    if(!block || !scope.contains(block) || editingFlowRoot(block) !== scope) return
    const range = document.createRange()
    if(kind === "paragraph") {
      const first = textPointAtOffset(block, 0, undefined, "forward")
      const last = textPointAtOffset(block, block.textContent?.length ?? 0)
      range.setStart(...first)
      range.setEnd(...last)
    }
    else {
      const position = textOffsetIn(block, node, offset)
      if(position === null) return
      const segments = new Intl.Segmenter(undefined, {granularity: "word"}).segment(block.textContent ?? "")
      const unit = segments.containing(position) ?? segments.containing(position - 1)
      if(!unit) return
      range.setStart(...textPointAtOffset(block, unit.index, undefined, "forward"))
      range.setEnd(...textPointAtOffset(block, unit.index + unit.segment.length))
    }
    return range
  }

  cancelTouchDrag() {
    this.#touchTap = null
    if(this.#drag?.pointerType === "touch" || this.#boxDrag?.pointerType === "touch") this.#endDrag()
  }

  /** Wait for a tap before changing selection. Native panning cancels the
   * pointer stream; movement also cancels taps in non-scrolling containers. */
  #deferTouchSelection(event: PointerEvent, options: {fromCanvasSlot?: boolean, box?: boolean} = {}) {
    if(event.pointerType !== "touch" || event.type !== "pointerdown") return false
    this.#endDrag()
    if(event.target instanceof Node) {
      this.#touchTap = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: event.target, ...options}
    }
    // Suppress compatibility mouse selection without cancelling touchstart
    // or touchmove, which the browser needs for scrolling and momentum.
    event.preventDefault()
    return true
  }

  /** Canvas and slide backgrounds select whole items rather than nearby text. */
  beginBoxSelection(event: PointerEvent) {
    const root = this.editor.features.canvas.editingRoot
    if(event.button !== 0 || this.editor.isEditingLocked || !root) return
    if(this.#deferTouchSelection(event, {box: true})) return
    this.#endDrag()
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.editor.features.table.clearCellSelection(false)
    this.#clearSelections()
    this.editor.features.transformation.clearTransform()
    this.editor.features.manipulation.refreshNodeDragTarget(null)
    if(focusedWidgetHost() && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    event.preventDefault()
    const overlay = document.createElement("div")
    overlay.classList.add("◆", "◆editor-only")
    overlay.setAttribute("part", "selection-box")
    overlay.setAttribute("aria-hidden", "true")
    overlay.setAttribute("popover", "manual")
    this.editor.addAppendix(overlay)
    // The top layer clears authored stacking contexts (including open dialogs).
    // It remains inside the document iframe, below the surrounding editor UI.
    overlay.showPopover?.()
    this.#boxDrag = {root, x: event.clientX + window.scrollX, y: event.clientY + window.scrollY,
      pointerId: event.pointerId, pointerType: event.pointerType, overlay, elements: [], previews: new Map()}
    this.isInDragSelection = true
    this.editor.features.media.refreshPlaceholder()
    this.editor.postSelectionPath()
    if(event.pointerId !== undefined) {
      try { document.body.setPointerCapture(event.pointerId) } catch { /* Synthetic pointer. */ }
    }
    this.#extendBoxSelection(event)
  }

  #extendBoxSelection(event: PointerEvent) {
    const drag = this.#boxDrag
    if(!drag || drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return
    if(!drag.root.isConnected || this.editor.features.canvas.editingRoot !== drag.root || this.editor.isEditingLocked) {
      this.#endDrag()
      return
    }
    const x = drag.x - window.scrollX, y = drag.y - window.scrollY
    const left = Math.min(x, event.clientX), top = Math.min(y, event.clientY)
    const right = Math.max(x, event.clientX), bottom = Math.max(y, event.clientY)
    Object.assign(drag.overlay.style, {left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`})
    const hits = this.editor.features.canvas.items(drag.root).filter(element => {
      const geometry = element instanceof HTMLElement || element instanceof SVGSVGElement
        ? this.editor.features.transformation.boxGeometry(element) : null
      const rect = geometry?.rect ?? element.getBoundingClientRect()
      const corners = geometry?.corners ?? [{x: rect.left, y: rect.top}, {x: rect.right, y: rect.bottom}]
      // Matrix arithmetic can put a touching corner a fraction of a pixel outside.
      const epsilon = 1e-6
      return rect.width > 0 && rect.height > 0 && corners.every(point => point.x >= left - epsilon && point.x <= right + epsilon && point.y >= top - epsilon && point.y <= bottom + epsilon)
    })
    const selected = new Set<Element>()
    for(const hit of hits) if(!selected.has(hit)) {
      for(const peer of this.editor.features.transformation.groupSelectionPeers(hit)) selected.add(peer)
    }
    const elements = [...selected]
    drag.elements = elements
    for(const [element, overlay] of drag.previews) if(!elements.includes(element)) {
      this.#atomicAnchors.release(overlay)
      overlay.remove()
      drag.previews.delete(element)
    }
    for(const element of elements) if(!drag.previews.has(element)) {
      const overlay = document.createElement("div")
      overlay.classList.add("◆", "◆editor-only")
      overlay.setAttribute("part", "atomic-selection-overlay multi-selection-overlay box-selection-preview")
      overlay.setAttribute("aria-hidden", "true")
      this.editor.addAppendix(overlay)
      drag.previews.set(element, overlay)
    }
    this.#positionAtomicOverlays()
  }

  /** Native caret hit testing snaps blank space to nearby text. Require an
   * actual character box before allowing repeated word/paragraph selection. */
  #textHit(event: Pick<MouseEvent, "clientX" | "clientY" | "target">) {
    const range = document.createRange()
    const hits = (text: Text, offset: number) => {
      if(offset < 0 || offset >= text.length || !getDocumentRoot().contains(text)) return false
      range.setStart(text, offset)
      range.setEnd(text, offset + 1)
      return Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0
        && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom)
    }
    const point = document.caretPositionFromPoint?.(event.clientX, event.clientY)
    if(point?.offsetNode instanceof Text) {
      const node = point.offsetNode
      const offset = [point.offset - 1, point.offset].find(offset => hits(node, offset))
      if(offset !== undefined) return {node, offset}
    }
    const nativeRange = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    if(nativeRange?.startContainer instanceof Text) {
      const node = nativeRange.startContainer
      const offset = [nativeRange.startOffset - 1, nativeRange.startOffset].find(offset => hits(node, offset))
      if(offset !== undefined) return {node, offset}
    }
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    if(!target || !getDocumentRoot().contains(target)) return null
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
    for(let text = walker.nextNode(); text; text = walker.nextNode()) {
      if(!(text instanceof Text)) continue
      range.selectNodeContents(text)
      if(!Array.from(range.getClientRects()).some(rect => event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom)) continue
      for(let offset = 0; offset < text.length; offset++) if(hits(text, offset)) return {node: text, offset}
    }
    return null
  }

  /** Resolve authored text and empty text containers through open slot trees.
   * Native document hit tests can report a host boundary instead. */
  #authoredTextPoint(x: number, y: number, pointerTarget: EventTarget | null) {
    let target = document.elementFromPoint?.(x, y) ?? (pointerTarget instanceof Element ? pointerTarget : null)
    const visited = new Set<Element>()
    while(target?.shadowRoot && !visited.has(target)) {
      visited.add(target)
      const inner = target.shadowRoot.elementFromPoint?.(x, y)
      if(!inner || inner === target) break
      target = inner
    }
    if(target && target.getRootNode() !== document) target = widgetSlotContentFromCoords(x, y, target, this.editor.schema)?.element ?? null
    if(!target || atomicEditingContainer(target, this.editor.schema)) return null
    const container = getContainer(target)
    if(container && this.editor.schema.isBlock(container) && !container.textContent?.trim()
      && Array.from(container.childNodes).every(isParagraphContent)) {
      const rect = container.getBoundingClientRect()
      if(rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return {node: container, offset: 0}
    }
    const hit = this.#textHit({clientX: x, clientY: y, target})
    if(!hit || atomicEditingContainer(hit.node, this.editor.schema)) return null
    const native = document.caretPositionFromPoint?.(x, y)
    if(native?.offsetNode === hit.node && (native.offset === hit.offset || native.offset === hit.offset + 1)) return {node: hit.node, offset: native.offset}
    const nativeRange = document.caretRangeFromPoint?.(x, y)
    if(nativeRange?.startContainer === hit.node && (nativeRange.startOffset === hit.offset || nativeRange.startOffset === hit.offset + 1)) return {node: hit.node, offset: nativeRange.startOffset}
    const range = document.createRange()
    range.setStart(hit.node, hit.offset)
    range.setEnd(hit.node, hit.offset + 1)
    const rect = Array.from(range.getClientRects()).find(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    const rtl = getComputedStyle(hit.node.parentElement!).direction === "rtl"
    return {node: hit.node, offset: hit.offset + Number(Boolean(rect && (rtl ? x < rect.left + rect.width / 2 : x > rect.left + rect.width / 2)))}
  }

  /** Captured popup and slot-padding clicks cannot always use native repeated
   * clicks. Select text directly without first selecting the enclosing widget. */
  #selectContentClickGranularity(event: MouseEvent, granularity: "word" | "paragraph", surface = event.composedPath()[0]) {
    if(event.button !== 0) return
    const selection = document.getSelection()
    const slotted = widgetSlotContentFromCoords(event.clientX, event.clientY, surface, this.editor.schema)
    if(slotted && !atomicEditingContainer(slotted.element, this.editor.schema)
      && (!selection?.focusNode || !slotted.element.contains(selection.focusNode) || $.isGapSelection)) {
      const [node, offset] = textPointAtOffset(slotted.element, event.clientY <= slotted.rect.top ? 0 : slotted.element.textContent?.length ?? 0)
      $.move(node, offset)
    }
    const content = slotted?.element ?? popupContentAncestor(selection?.focusNode ?? null)
      ?? (this.#drag?.textAcrossWidgets && selection?.focusNode ? getContainer(selection.focusNode) : null)
    if(!selection?.focusNode || !content || !content.isConnected || !selection.isCollapsed && granularity === "word") return
    if(granularity === "word") {
      const text = selection.focusNode
      if(!(text instanceof Text)) return
      const offset = selection.focusOffset
      const words = Array.from(new Intl.Segmenter(undefined, {granularity: "word"}).segment(text.data))
        .filter(segment => segment.isWordLike)
      const word = words.find(segment => segment.index <= offset && offset < segment.index + segment.segment.length)
        ?? words.find(segment => segment.index >= offset) ?? words.at(-1)
      if(!word) return
      $.selectRange(text, word.index, text, word.index + word.segment.length)
    }
    else {
      const block = getContainer(selection.focusNode)
      if(!content.contains(block)) return
      $.selectRange(block, 0, block, block.childNodes.length)
    }
    this.#constrainSelectionToFlow()
    this.processSelection(false, {scrollIntoView: false})
  }

  #handlePointerDown(ev: PointerEvent, fromCanvasSlot = false) {
    if(ev.pointerType === "touch" && ev.isPrimary === false) return
    if(this.#handleModifierClick(ev)) return
    if(ev.defaultPrevented || (isElement(ev.target) && ev.target.closest(".◆editor-only"))
      || ev.button !== 0) return
    const origin = ev.composedPath()[0] ?? ev.target
    if(fromCanvasSlot) {
      const item = this.editor.features.canvas.itemAtPoint(ev.clientX, ev.clientY)
      if(item && this.editor.features.transformation.handleGroupedPointer(ev, item)) return
    }
    if(this.editor.features.slides.active && (origin === document.body || origin === document.documentElement
      || origin instanceof Element && (isSlide(origin) || origin.matches("body > .ww-slides-viewport")))) {
      ev.preventDefault()
      return
    }
    if(this.#deferTouchSelection(ev, {fromCanvasSlot})) return
    this.#endDrag()
    this.clearSelectedSection()
    this.#touchSelection = ev.pointerType === "touch"
    if(ev.pointerType === "touch") document.body.focus({preventScroll: true})
    const graphic = graphicContainerForNode(ev.target instanceof Node ? ev.target : null)
    // The graphic feature enters capture on a selected canvas/shape. Native
    // caret hit testing must not replace that node selection with an outer gap.
    if(graphic && $.selectedElement === graphic && !modifierKeyDown(ev)) return
    const media = ev.target instanceof Node ? mediaContainerForNode(ev.target) : null
    const divider = ev.target instanceof Element && ev.target.localName === "hr" ? ev.target : null
    if(media) {
      // Touch targeting may retain nearby media while the tap is in its
      // margin. Let the shared coordinate hit test resolve that outer gap.
      const target = figureSelectionTarget(media), rect = target.getBoundingClientRect()
      const outside = !isOutOfFlow(target) && rect.height > 0 && (ev.clientY < rect.top || ev.clientY > rect.bottom)
      if(!outside) {
        if(this.captureSelectedElement !== media) this.captureElement(media)
        this.editor.postSelectionPath()
        return
      }
    }
    if(divider) {
      ev.preventDefault()
      this.#releaseCaptureSelection()
      const target = figureSelectionTarget(divider)
      const rect = target.getBoundingClientRect()
      if(target.localName === "figure" && !isOutOfFlow(target) && rect.height > 0 && (ev.clientY < rect.top || ev.clientY > rect.bottom)) {
        $.selectGap(target, ev.clientY < rect.top ? "before" : "after")
      }
      else $.selectElement(target)
      this.processSelection()
      return
    }
    this.#releaseCaptureSelection()
    const widgetGap = $.widgetGapFromCoords(ev.clientX, ev.clientY, origin, this.editor.schema)
    if(widgetGap) {
      ev.preventDefault()
      this.isInDragSelection = true
      ev.shiftKey ? $.extend(widgetGap.node, widgetGap.offset) : $.selectRange(widgetGap.node, widgetGap.offset)
      this.#beginDrag(ev, false, true)
      this.processSelection(true)
      return
    }
    // Native ranges can stop at a slot or event boundary. Track actual authored
    // glyph endpoints so a range can cross titles, body content and widgets.
    const authoredOrigin = origin instanceof Node && origin.getRootNode() === document ? origin
      : widgetSlotContentFromCoords(ev.clientX, ev.clientY, origin, this.editor.schema)?.element ?? null
    if(ev.pointerType !== "touch" && !this.editor.features.canvas.active && !this.editor.features.slides.active
      && authoredOrigin && !mathRoot(authoredOrigin) && !atomicEditingContainer(authoredOrigin, this.editor.schema)
      && editingFlowRoot(authoredOrigin) === getDocumentRoot()) {
      for(let element = isElement(authoredOrigin) ? authoredOrigin : authoredOrigin.parentElement;
        element && element !== getDocumentRoot(); element = element.parentElement) {
        if(isContentfulWidget(element, this.editor.schema)) {
          this.#clearSelections()
          this.editor.features.transformation.clearTransform()
          focusEditorWindow()
          const point = this.#authoredTextPoint(ev.clientX, ev.clientY, ev.target)
          if(point) {
            ev.preventDefault()
            ev.shiftKey ? $.extend(point.node, point.offset) : $.selectRange(point.node, point.offset)
            this.#beginDrag(ev, false, true)
            this.processSelection(true)
          }
          return
        }
      }
    }
    const canvasItem = this.editor.features.canvas.editingRoot
      ? this.editor.features.canvas.itemAtPoint(ev.clientX, ev.clientY) : null
    if($.isEmptyDocumentSelection && editingFlowRoot(ev.target instanceof Node ? ev.target : null) === getDocumentRoot()
      && !canvasItem) {
      if(Array.from(getDocumentRoot().children).some(isOutOfFlow)) ev.preventDefault()
      // Browsers focus an empty design-mode body on pointerdown but do not
      // consistently create a DOM selection for it. Restore the editing
      // position explicitly; pointerup restores it after the browser's
      // default focus action has completed.
      $.selectDocumentStart()
      this.processSelection()
      return
    }
    const clickedItem = this.#layoutSelectionItem(canvasItem ?? (ev.target instanceof Node ? ev.target : null),
      canvasItem ?? (ev.target instanceof Node ? ev.target : null))
    const popupFlow = editingFlowRoot(origin instanceof Node ? origin : null)
    const popupDrag = popupElementRole(popupFlow) === "content"
    const extend = ev.shiftKey && (!clickedItem || clickedItem === this.#layoutSelectionItem($.anchor, $.anchor))
      && (!popupDrag || popupFlow.contains($.anchor))
    this.isInDragSelection = true
    const point = $.selectCoords(ev.clientX, ev.clientY, extend, ev.target, this.editor.schema)
    const surfaceHit = fromCanvasSlot || Boolean(canvasItem && (ev.target === document.body || ev.target === document.documentElement))
    // Native selection races the scoped pointer drag and can expose the body
    // selection briefly, closing the bubble between pointer moves.
    const nativeClick = ev.pointerType !== "touch" && !surfaceHit && (!point || !$.isGapSelection && !point.overrideNative)
      && !popupDrag && !atomicEditingContainer(ev.target instanceof Node ? ev.target : null, this.editor.schema)
    if(!nativeClick) ev.preventDefault()
    this.#beginDrag(ev, nativeClick)
    this.processSelection(true)
  }

  captureListeners: DocumentListenerMap = {
    resize: event => {
      // Docking the host keyboard shrinks the iframe after the tap has placed
      // the caret. Reuse input's post-layout reveal against the new viewport.
      if(this.editor.touchKeyboardActive && this.editor.features.manipulation.canTypeWithTextKeyboard) this.#scheduleSelectionReveal(event)
    },
    blur: event => {
      const widget = event.composedPath()[0]
      if(!(widget instanceof HTMLElement) || widget !== this.captureSelectedWidget
        || !(widget.localName.includes("-") || widget.hasAttribute("is"))) return
      const next = event.relatedTarget
      if(next instanceof Node && (widget === next || widget.contains(next) || widget.shadowRoot?.contains(next))) return
      this.#blurringWidget = widget
      this.#releaseCaptureSelection()
      // Establish the ordinary node selection before the widget's blur handler
      // runs, so a selection it deliberately sets afterward remains authoritative.
      $.selectElement(widget, false)
      queueMicrotask(() => {
        if(this.#blurringWidget !== widget) return
        this.#blurringWidget = null
        if(this.isEnabled && !focusedWidgetHost() && !document.body.shadowRoot?.activeElement) {
          this.processSelection(undefined, {scrollIntoView: false})
          this.editor.doc.updateLocalSelection()
          this.editor.postMarkState()
          this.editor.postCommentState()
          this.editor.postSelectionPath()
        }
      })
    },
    contextmenu: event => {
      if(this.#touchTap || this.#drag || this.#boxDrag) this.#endDrag()
      if(isAppendixInteraction(event) && !isTextFieldInteraction(event)) event.preventDefault()
    },
    // A second contact belongs to a native or layout-specific pinch.
    touchstart: event => {
      if(event.touches.length > 1) this.cancelTouchDrag()
    },
    pointerdown: event => {
      if(event.pointerType === "touch" && event.isPrimary === false) {
        if(this.#captureClick) this.#captureClick.cancelled = true
        this.cancelTouchDrag(); return
      }
      this.#handleKeyState(event)
      if(this.#handleModifierClick(event)) return
      const origin = event.composedPath()[0]
      const node = origin instanceof Node ? origin : null
      const candidate = widgetHostForShadowInteraction(event, this.editor.schema)
        ?? (node ? mediaContainerForNode(node) ?? graphicContainerForNode(node) ?? mathRoot(node) : null)
      this.#captureClick = !event.defaultPrevented && candidate && !isAppendixInteraction(event)
        ? {element: candidate, pointerId: event.pointerId, x: event.clientX, y: event.clientY, released: false, cancelled: event.button !== 0} : null
      const edge = event.composedPath().find(node => node instanceof Element && node.classList.contains("◆capture-edge"))
      const captured = this.captureSelectedElement
      if(edge instanceof Element && edge.parentElement === this.selectionCaret && captured
        && event.button === 0 && !event.defaultPrevented) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.#endDrag()
        this.selectElement(captured)
        return
      }
      this.#handleWidgetShadowInteraction(event)
      if(this.editor.features.canvas.active && origin === document.body.shadowRoot?.querySelector("slot:not([name])")
        && this.editor.features.canvas.itemAtPoint(event.clientX, event.clientY)) this.#handlePointerDown(event, true)
    },
    pointermove: event => {
      const capture = this.#captureClick
      if(capture && !capture.released && capture.pointerId === event.pointerId
        && Math.hypot(event.clientX - capture.x, event.clientY - capture.y) > 8) capture.cancelled = true
      const tap = this.#touchTap
      if(tap && tap.pointerId === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) this.#touchTap = null
      this.#handleKeyState(event)
      const drag = this.#boxDrag ?? this.#drag
      if(drag && drag.pointerId === event.pointerId && !(event.buttons & 1)) this.#finishDrag(event)
      if(this.#drag && this.#drag.pointerId === event.pointerId) {
        this.#updatePointerHover(document.elementFromPoint(event.clientX, event.clientY))
      }
      else {
        this.#nativeHoverTarget = event.target instanceof Element ? event.target : null
        this.#refreshHoverGeometry()
      }
      if(this.isInDragSelection) event.preventDefault()
      if(widgetHostForShadowInteraction(event, this.editor.schema) || isAppendixInteraction(event)) this.#extendDrag(event)
    },
    pointerover: event => {
      this.#invalidateFloatCandidates()
      if(this.#drag && this.#drag.pointerId === event.pointerId) return
      this.#nativeHoverTarget = event.target instanceof Element ? event.target : null
      this.#refreshHoverGeometry()
    },
    pointerout: event => {
      this.#invalidateFloatCandidates()
      if(this.#drag && this.#drag.pointerId === event.pointerId) return
      this.#nativeHoverTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null
      this.#refreshHoverGeometry()
    },
    pointerup: event => {
      const capture = this.#captureClick
      if(capture && capture.pointerId === event.pointerId) {
        capture.released = true
        if(Math.hypot(event.clientX - capture.x, event.clientY - capture.y) > 8) capture.cancelled = true
      }
      if(!this.#handleModifierClick(event)) this.#finishDrag(event)
    },
    pointercancel: event => {
      const capture = this.#captureClick
      if(capture && capture.pointerId === event.pointerId) {
        capture.cancelled = true
        capture.released = true
      }
      this.#modifierClick = false; this.#finishDrag(event)
    },
    lostpointercapture: event => {
      this.#finishDrag(event)
    },
    dragstart: () => { if(this.#captureClick) this.#captureClick.cancelled = true },
    dragend: () => {
      if(this.#captureClick) { this.#captureClick.cancelled = true; this.#captureClick.released = true }
    },
    // Native clicks establish editing focus and paint the blinking text caret.
    // Only structural gaps and an actual drag override the browser selection.
    mousedown: event => {
      if(this.#handleModifierClick(event)) return
      const drag = this.#drag
      if(this.#boxDrag) { event.preventDefault(); return }
      if(!drag) return
      // MOUSEDOWN carries the click count (POINTERDOWN does not). Release
      // editor capture before the native default starts word/paragraph
      // selection, so subsequent moves retain the browser's granularity.
      const hit = event.detail >= 2 && (drag.nativeClick || drag.scope && popupElementRole(drag.scope) === "content")
        ? this.#textHit(event) : null
      if(hit) {
        // Native paragraph selection can end inside the next canvas item.
        // Clamping that range resets the browser to character granularity.
        // Extend the scoped drag in whole units instead.
        if(drag.scope && this.editor.features.canvas.active && !event.shiftKey && popupElementRole(drag.scope) !== "content") {
          const kind = event.detail === 2 ? "word" : "paragraph"
          const range = this.#positionedTextUnit(drag.scope, hit.node, hit.offset, kind)
          if(range) {
            event.preventDefault()
            drag.nativeClick = false
            drag.unit = {kind, range}
            drag.lastFocus.setStart(range.endContainer, range.endOffset)
            drag.lastFocus.collapse(true)
            document.getSelection()?.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
            this.processSelection(true, {scrollIntoView: false})
            return
          }
        }
        this.#endDrag()
        return
      }
      if(!drag.nativeClick) event.preventDefault()
      else queueMicrotask(() => {
        // Save the browser's actual click endpoints after its default action
        // (including bidi affinity and Shift-click direction).
        const selection = document.getSelection()
        const root = getDocumentRoot()
        if(this.#drag !== drag || drag.moved || !selection?.anchorNode || !selection.focusNode
          || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return
        if(drag.scope && (!drag.scope.contains(selection.anchorNode) || !drag.scope.contains(selection.focusNode))) {
          this.#constrainSelectionToFlow()
          return
        }
        drag.anchor.setStart(selection.anchorNode, selection.anchorOffset)
        drag.anchor.collapse(true)
        drag.focus.setStart(selection.focusNode, selection.focusOffset)
        drag.focus.collapse(true)
        drag.lastFocus = drag.focus.cloneRange()
        this.dragAnchor = {node: selection.anchorNode, offset: selection.anchorOffset}
      })
    },
    selectstart: event => { if(this.#boxDrag || this.#drag && (!this.#drag.nativeClick || this.#drag.moved)) event.preventDefault() },
    click: event => {
      if(this.#handleModifierClick(event)) return
      const capture = this.#captureClick
      if(capture) {
        const widget = widgetHostForShadowInteraction(event, this.editor.schema)
        const origin = event.composedPath()[0]
        const sameTarget = widget === capture.element || origin instanceof Node && capture.element.contains(origin)
        if(event.button !== 0 || event.defaultPrevented || capture.cancelled
          || !capture.element.isConnected || !sameTarget) return
        this.#captureClick = null
        if(capture.requested) this.captureElement(capture.element, capture.requested)
        else this.#handleWidgetShadowInteraction(event)
      }
      else this.#handleWidgetShadowInteraction(event)
      if(event.detail >= 3) this.#selectContentClickGranularity(event, "paragraph")
    },
    mouseup: event => { this.#handleModifierClick(event) },
    dblclick: event => {
      if(this.#handleModifierClick(event)) return
      this.#selectContentClickGranularity(event, "word")
    },
    focusin: event => {
      this.#invalidateFloatCandidates()
      const widget = widgetHostForShadowInteraction(event, this.editor.schema)
      if(this.#captureClick && widget && widget !== this.#captureClick.element) this.#captureClick = null
      if(widget === this.#blurringWidget) this.#blurringWidget = null
      this.#focusedContentfulShadow = widget && isContentfulWidget(widget, this.editor.schema) ? widget : null
      this.#handleWidgetShadowInteraction(event)
      if(!isAppendixInteraction(event) && !this.editor.features.media.isPlaceholderInteraction
        && !this.editor.features.slides.isSelectingForNavigation) {
        this.processSelection(undefined, {scrollIntoView: false})
      }
    },
    focusout: event => {
      const widget = widgetHostForShadowInteraction(event, this.editor.schema)
      if(!widget || !isContentfulWidget(widget, this.editor.schema)) return
      queueMicrotask(() => {
        if(this.#focusedContentfulShadow === widget && focusedWidgetHost() !== widget) this.#focusedContentfulShadow = null
        if(this.isEnabled) this.processSelection(undefined, {scrollIntoView: false})
      })
    },
    keydown: event => {
      if(this.#captureClick && (event.key === "Tab" || this.#captureClick.released && !this.editor.features.manipulation.hasNodeDrag)) this.#captureClick = null
      if(event.key === "Escape" && this.#touchTap) this.#endDrag()
      this.#handleKeyState(event)
      if(!isAppendixInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
        && ["toggle", "content"].includes(popupElementRole($.selectedElement ?? document.body) ?? "")
        && (event.key === "Enter" || event.key.length === 1 && !modifierKeyDown(event))) event.preventDefault()
      if(!isAppendixInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
        && (event.key.length === 1 || ["Enter", "Backspace", "Delete"].includes(event.key))
        && !this.normalizePopupSelection()) event.preventDefault()
      const isPrintable = event.key?.length === 1 && !event.metaKey && (!event.ctrlKey || event.getModifierState("AltGraph"))
      if(isPrintable || ["Enter", "Backspace", "Delete"].includes(event.key)) this.#preventCapturedDocumentInput(event)
      if(event.key === "Escape" && this.#boxDrag) {
        event.preventDefault()
        this.#endDrag()
        this.processSelection(false, {scrollIntoView: false})
      }
      this.#handleWidgetShadowInteraction(event)
    },
    keyup: event => this.#handleKeyState(event),
    beforeinput: event => {
      if(!isAppendixInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
        && event.inputType.startsWith("insert")
        && ["toggle", "content"].includes(popupElementRole($.selectedElement ?? document.body) ?? "")) event.preventDefault()
      if(!isAppendixInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
        && (event.inputType.startsWith("insert") || event.inputType.startsWith("delete"))
        && !this.normalizePopupSelection()) event.preventDefault()
      if(event.inputType.startsWith("insert") || event.inputType.startsWith("delete")) this.#preventCapturedDocumentInput(event)
      this.#handleWidgetShadowInteraction(event)
    },
    input: event => this.#handleWidgetShadowInteraction(event),
    change: event => this.#handleWidgetShadowInteraction(event),
    wheel: event => this.#handleWidgetWheel(event),
    scroll: event => {
      this.#handleWidgetScroll(event)
      if(!isWidgetShadowInteraction(event, this.editor.schema) && !isAppendixInteraction(event)) {
        this.#touchTap = null
        this.#refreshGapCaretInlinePosition()
      }
    },
  }

  /** Capture owns editing input, including native editing defaults. Only an
   * internal selection or a control may edit while the outer document is captured. */
  #preventCapturedDocumentInput(event: Event) {
    const captured = this.captureSelectedElement
    if(!captured || isAppendixInteraction(event) || isFormControlInteraction(event)
      || isWidgetShadowInteraction(event, this.editor.schema) || this.editor.features.graphic.textEditingRange) return
    if(captured instanceof HTMLMediaElement && captured.controls && event instanceof KeyboardEvent
      && (event.key === " " || event.key === "Enter") && event.composedPath().includes(captured)) return
    const selection = document.getSelection()
    if(selection?.anchorNode && selection.focusNode
      && captured.contains(selection.anchorNode) && captured.contains(selection.focusNode)) return
    event.preventDefault()
  }

  /** Mirrors the physical modifier state onto BODY without depending on the
   * regular feature listeners, which intentionally ignore widget events. */
  readonly #handleKeyState = (event: KeyboardEvent | MouseEvent) => {
    const active = modifierKeyDown(event)
    batchPresentationStates(document, () => {
      setPresentationState(document.documentElement, "key-mod-down", active)
      setPresentationState(document.body, "key-mod-down", active)
    })
  }

  /** Modifier-click owns the entire activation sequence at the document
   * boundary, including inside the element that currently owns capture. */
  readonly #handleModifierClick = (event: MouseEvent) => {
    if(event.type === "pointerdown") this.#modifierClick = false
    if(this.editor.features.graphic.isPOIInteraction) return false
    if(event.button !== 0 || (!this.#modifierClick && !modifierKeyDown(event)) || isAppendixInteraction(event)) return false
    const widget = widgetHostForShadowInteraction(event, this.editor.schema)
    event.preventDefault()
    event.stopImmediatePropagation()
    if(event.type === "pointerdown") {
      this.#captureClick = null
      this.#modifierClick = true
      this.#endDrag()
      this.clearSelectedSection()
      this.#releaseCaptureSelection()
      this.editor.features.table.finishResize()
      this.editor.features.table.clearCellSelection(false)
      if(this.editor.features.table.selectCellAtPoint(widget ?? event.target, event.clientX, event.clientY)) return true
      const target = this.#modifierSelectionTarget(widget ?? event.target)
      if(target && (this.editor.features.canvas.active || this.editor.features.slides.active)) {
        const elements = $.selectedElements
        const peers = this.editor.features.transformation.groupSelectionPeers(target)
        $.selectElements(peers.every(peer => elements.includes(peer))
          ? elements.filter(element => !peers.includes(element)) : [...elements, ...peers])
      }
      else if(target) $.selectElement(target)
      this.processSelection(undefined, {scrollIntoView: !isContentfulWidget(widget, this.editor.schema)})
      this.editor.postSelectionPath()
    }
    if(event.type === "click") this.#modifierClick = false
    return true
  }

  /** Routes wheel input over an inactive widget to the document or canvas instead
   * of letting the widget consume it (for example, to zoom a map).
   * Contentful and capture-selected widgets retain their native wheel behavior. */
  readonly #handleWidgetWheel = (event: WheelEvent) => {
    const widget = widgetHostForShadowInteraction(event, this.editor.schema)
    if(!widget || isContentfulWidget(widget, this.editor.schema) || widget === this.captureSelectedWidget) return
    if(this.editor.features.canvas.handleWheel(event, true)) return
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
    const widget = widgetHostForScrollEvent(event, this.editor.schema)
    if(widget && !isContentfulWidget(widget, this.editor.schema) && widget !== this.captureSelectedWidget) event.stopPropagation()
  }

  /** Keeps widget shadow trees atomic without cancelling their own controls.
   * Regular feature listeners ignore these events, so they cannot start or
   * extend an editor drag selection. Widgets capture the host while
   * leaving their native focus, caret, input, and event handling untouched. */
  readonly #handleWidgetShadowInteraction = (event: Event) => {
    const widget = widgetHostForShadowInteraction(event, this.editor.schema)
    if(!widget) {
      const origin = event.composedPath()[0]
      const authoredOrigin = event instanceof MouseEvent
        ? widgetSlotContentFromCoords(event.clientX, event.clientY, origin, this.editor.schema)?.element ?? origin : origin
      const captured = this.captureSelectedWidget
      if(event.type === "pointerdown" && captured && (captured.localName.includes("-") || captured.hasAttribute("is"))
        && authoredOrigin instanceof Node && captured.contains(authoredOrigin)) {
        this.#releaseCaptureSelection()
        this.#clearSelections()
        this.editor.features.transformation.clearTransform()
      }
      return
    }
    if(widget === this.captureSelectedWidget) return
    if(event instanceof PointerEvent && event.type === "pointerdown"
      && this.editor.features.transformation.handleGroupedPointer(event, widget, false)) return
    if(event.type === "pointerdown") { this.#endDrag(); return }
    if(this.#captureClick?.element === widget) return
    this.clearSelectedSection()
    this.#endDrag()
    this.#capturedElement = widget
    // Native controls establish focus/carets before the completed click.
    // Capture must preserve that selection instead of moving it on press.
    if(event.type === "click" && document.activeElement !== widget) this.#collapseBeforeCapturedWidget(widget)
    this.processSelection(undefined, {scrollIntoView: !isContentfulWidget(widget, this.editor.schema)})
    this.editor.postSelectionPath()
  }

  /** Returns a phrase-aware target for modifier-click node selection.
   * Phrasing elements plus BR/WBR always bubble to their container so node
   * selection stays on a structural element. */
  #modifierSelectionTarget(target: EventTarget | null) {
    if(!(target instanceof Node)) return null
    const origin = atomicEditingContainer(target, this.editor.schema) ?? (isElement(target) ? target : target.parentElement)
    const popupPart = !atomicEditingContainer(target, this.editor.schema)
      ? origin?.closest("button[popovertarget], [popover]") : null
    if(popupPart && ["toggle", "content"].includes(popupElementRole(popupPart) ?? "")) return popupPart
    const figure = origin?.closest("figure")
    if(figure && !isDocumentRoot(figure)) return figure
    let targetElement = atomicEditingContainer(target, this.editor.schema) ?? getContainer(target)
    const summary = targetElement.closest("details > summary")
    if(summary) return summary.parentElement
    const table = targetElement.closest("table")
    if(table) return figureSelectionTarget(table)
    while(targetElement && !isContentfulWidget(targetElement, this.editor.schema)
      && (targetElement.matches("br, wbr") || this.editor.schema.isPhrasing(targetElement))) {
      const parent = targetElement.parentElement
      if(!parent) break
      targetElement = parent
    }
    return isDocumentRoot(targetElement) || targetElement === document.body || targetElement === document.documentElement
      || slideLayoutRole(targetElement)
      ? null : figureSelectionTarget(targetElement)
  }

  /** Selects the element addressed by a child-node path from BODY. */
  actions = {
    selectElementTypes: ({selectionTypes}: {type: "selectElementTypes", selectionTypes: ElementSelectionType[]}) => {
      const elements = [...new Set(selectionTypes.flatMap(type => this.editor.features.manipulation.selectedElementsOfType(type)))]
        .filter(element => this.editor.allows("select", element))
      if(!elements.length) return
      if(elements.length === 1) {
        if(isSectionElement(elements[0]) && !popupElementRole(elements[0])) this.selectSectionElement(elements[0])
        else this.selectElement(elements[0])
        return
      }
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      this.editor.features.table.clearCellSelection(false)
      $.selectElements(elements)
      this.processSelection()
    },
    selectNode: ({path}: {type: "selectNode", path: number[]}) => {
      const node = this.#elementAtPath(path)
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      if(slideLayoutRole(node) === "slide") {
        this.editor.features.slides.cancelNavigation()
      }
      $.selectElement(node)
      this.processSelection()
    },
    toggleNodeSelection: ({path, targetId}: {type: "toggleNodeSelection", path: number[], targetId: string}) => {
      const node = nodeAtPath(document.body, path)
      const root = getDocumentRoot()
      if(this.editor.isEditingLocked || !isElement(node) || node === root || !root.contains(node)
        || elementAttributeTargetId(node) !== targetId || !this.editor.allows("select", node)) return
      const elements = $.selectedElements
      if(!elements.includes(node)) {
        this.editor.features.table.clearCellSelection(false)
        this.actions.selectNode({type: "selectNode", path})
        return
      }
      this.#releaseCaptureSelection()
      if(elements.length > 1) $.selectElements(elements.filter(element => element !== node))
      else if(node.matches("figure, table") || isAtomicEditingElement(node, this.editor.schema)) $.selectGap(node)
      else $.move(node)
      this.processSelection(undefined, {scrollIntoView: false})
    },
    selectSection: ({path}: {type: "selectSection", path: number[]}) => {
      const section = this.#rawElementAtPath(path)
      if(!isSectionElement(section)) throw new TypeError("A section path must resolve to a section element")
      this.selectSectionElement(section)
    },
    hoverNode: ({path}: {type: "hoverNode", path: number[] | null}) => {
      this.#clearElementHover()
      this.#clearStyleTargetHover()
      if(path === null) return

      const pathElement = this.#elementAtPath(path)
      if(inlineMathRoot(pathElement) || slideLayoutRole(pathElement)) return
      const element = figureSelectionTarget(pathElement.closest("table") ?? pathElement)
      setPresentationState(element, "element-hovered")
      this.#refreshHoverGeometry()
    },
    hoverSection: ({path}: {type: "hoverSection", path: number[] | null}) => {
      this.#clearElementHover()
      this.#clearStyleTargetHover()
      if(path === null) return

      const section = this.#rawElementAtPath(path)
      if(!isSectionElement(section)) throw new TypeError("A section path must resolve to a section element")
      if(slideLayoutRole(section)) return
      setPresentationState(section, "element-hovered")
      this.#refreshHoverGeometry()
    },
    hoverStyleTarget: ({hovered, topLevel}: {type: "hoverStyleTarget", hovered: boolean, topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      this.showStyleTargetHover(!hovered ? null : topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget)
    },
  } as const

  showStyleTargetHover(target: Element | null) {
    this.#clearStyleTargetHover()
    if(!target || !document.body.contains(target) || slideLayoutRole(target)) return
    this.#clearElementHover()
    setPresentationState(target, "style-target-hovered")
    this.#refreshHoverGeometry()
  }

  #snippetHoverTarget: Element | null = null

  showSnippetHover(target: Element | null) {
    this.#clearElementHover()
    this.#clearStyleTargetHover()
    if(!target?.isConnected || !document.body.contains(target)) return
    this.#snippetHoverTarget = target
    setPresentationStates(target, "element-hovered", "snippet-hovered")
    this.#refreshHoverGeometry()
  }

  /** Resolves a BODY-relative child-node path to an element. */
  #elementAtPath(path: number[]) {
    const element = this.#rawElementAtPath(path)
    return popupElementRole(element) ? element : getContainer(element)
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
    return (presentationStateElements(document, "gap-before-selected", "gap-after-selected")[0] ?? null)
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

  #clearHoverGeometry(releaseAnchor = true) {
    if(this.#hoverFrame !== null) cancelAnimationFrame(this.#hoverFrame)
    this.#hoverFrame = null
    if(this.#hoverOwner && !this.#hoverOwner.isConnected) clearPresentationState(this.#hoverOwner, "element-hovered", "style-target-hovered", "snippet-hovered")
    this.#hoverOwner = null
    const caret = this.hoverCaret
    if(!caret) return
    if(releaseAnchor) this.#atomicAnchors.release(caret)
    for(const property of ["left", "top", "width", "height", "transform", "transform-origin", "position-anchor", "position-area", "translate"]) caret.style.removeProperty(property)
    caret.replaceChildren()
    setPart(caret, "hover-caret-floats", false)
    setPart(caret, "hover-caret-transformed", false)
    setPart(caret, "hover-caret-selected-root", false)
    setPart(caret, "hover-caret-board", false)
  }

  /** Resolve native and explicit hover against the live DOM. Freeform items
   * track transforms; document contours exclude overlapping floats. */
  #refreshHoverGeometry = () => {
    if(this.#hoverFrame !== null) cancelAnimationFrame(this.#hoverFrame)
    this.#hoverFrame = null
    this.#syncHoverParts()
    const explicit = (presentationStateElements(document, "element-hovered", "style-target-hovered")[0] ?? null)
    const freeform = this.editor.features.canvas.active || this.editor.features.slides.active
    const native = this.#nativeHoverTarget
    const candidate = explicit ?? (freeform ? this.#layoutSelectionItem(native, native)
      : atomicEditingContainer(native, this.editor.schema) ?? (native ? mediaContainerForNode(native) ?? graphicContainerForNode(native) : null) ?? this.#modifierSelectionTarget(native))
    const target = candidate ? figureSelectionTarget(candidate) : null
    const boardHover = explicit && boardLayoutRole(explicit) ? explicit : null
    const wasBoardHover = this.hoverCaret?.matches('[part~="hover-caret-board"]')
    if(boardHover || wasBoardHover) this.editor.features.board.refresh()
    if(!this.isEnabled || !this.editor.allows("select", target)
      || !(target instanceof HTMLElement || target instanceof SVGSVGElement) || !getDocumentRoot().contains(target) || isDocumentRoot(target) || slideLayoutRole(target)) {
      this.#clearHoverGeometry()
      return
    }
    if(boardLayoutRole(target)) {
      this.#clearHoverGeometry()
      setPart(this.#ensureHoverCaret(), "hover-caret-board", true)
      return
    }
    if(this.#hoverOwner && this.#hoverOwner !== target && !this.#hoverOwner.isConnected) clearPresentationState(this.#hoverOwner, "element-hovered", "style-target-hovered", "snippet-hovered")
    this.#hoverOwner = target
    const caret = this.#ensureHoverCaret()
    if(!freeform && getComputedStyle(target).display !== "contents") {
      const rect = target.getBoundingClientRect()
      const floats = this.floatExclusions(target, rect)
      if(!floats.length) {
        this.#clearHoverGeometry(false)
        this.#hoverOwner = target
        this.#atomicAnchors.bind(caret, target)
        this.#hoverFrame = requestAnimationFrame(this.#refreshHoverGeometry)
        return
      }
      this.#atomicAnchors.release(caret)
      for(const [property, value] of Object.entries({left: `${fixedClientX(rect.left)}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: "none"})) caret.style.setProperty(property, value, "important")
      this.#floatOutline(caret, rect, floats, "hover")
    }
    else {
      this.#atomicAnchors.release(caret)
      caret.replaceChildren()
      setPart(caret, "hover-caret-floats", false)
      const {styles} = this.editor.features.transformation.boxGeometry(target)
      for(const [property, value] of Object.entries({...styles, left: `${fixedClientX(parseFloat(styles.left))}px`})) caret.style.setProperty(property, value, "important")
    }
    caret.style.setProperty("position-anchor", "auto", "important")
    caret.style.setProperty("position-area", "none", "important")
    caret.style.setProperty("translate", "none", "important")
    caret.style.setProperty("transform-origin", "center", "important")
    setPart(caret, "hover-caret-transformed")
    setPart(caret, "hover-caret-selected-root", hasPresentationState(target, "element-selected")
      && this.#layoutSelectionItem(target, target) === target)
    this.#hoverFrame = requestAnimationFrame(this.#refreshHoverGeometry)
  }

  /** Float boxes shared by hover, selection outlines, and their controls.
   * Optional geometry expresses viewport exclusions in the overlay's axes. */
  floatExclusions(target: Element, rect = target.getBoundingClientRect(), geometry?: Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height" | "transform">) {
    if(this.editor.features.canvas.active || this.editor.features.slides.active || ["left", "right"].includes(getComputedStyle(target).float)) return []
    const floats = this.#currentFloatCandidates().filter(element => element.isConnected && element !== target && !element.contains(target) && !target.contains(element)
      && ["left", "right"].includes(getComputedStyle(element).float)).flatMap(element => {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element)
      return box.width > 0 && box.height > 0 ? [{left: box.left - Math.max(0, parseFloat(style.marginLeft) || 0), right: box.right + Math.max(0, parseFloat(style.marginRight) || 0),
        top: box.top - Math.max(0, parseFloat(style.marginTop) || 0), bottom: box.bottom + Math.max(0, parseFloat(style.marginBottom) || 0)}] : []
    }).filter(box => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top)
    if(!geometry || !floats.length) return floats
    const width = parseFloat(geometry.width), height = parseFloat(geometry.height)
    const center = {x: parseFloat(geometry.left) + width / 2, y: parseFloat(geometry.top) + height / 2}
    const inverse = new DOMMatrix(geometry.transform || undefined).inverse()
    return floats.map(box => {
      const points = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]
        .map(([x, y]) => ({x: inverse.a * (x - center.x) + inverse.c * (y - center.y), y: inverse.b * (x - center.x) + inverse.d * (y - center.y)}))
      return {left: Math.min(...points.map(point => point.x)) + width / 2, right: Math.max(...points.map(point => point.x)) + width / 2,
        top: Math.min(...points.map(point => point.y)) + height / 2, bottom: Math.max(...points.map(point => point.y)) + height / 2}
    })
  }

  /** Native boxes include the space occupied by floats. Draw their contour
   * in the appendix, masking those boxes and their margins. */
  #floatOutline(caret: HTMLElement, rect: DOMRect, floats: {left: number, right: number, top: number, bottom: number}[], kind: "hover" | "selection") {
    const rectangle = (left: number, top: number, right: number, bottom: number) => `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`
    // Carry edge-touching cutouts beyond the outline's offset as well.
    const holes = floats.map(box => rectangle(box.left <= rect.left ? -4 : box.left - rect.left,
      box.top <= rect.top ? -4 : box.top - rect.top,
      box.right >= rect.right ? rect.width + 4 : box.right - rect.left,
      box.bottom >= rect.bottom ? rect.height + 4 : box.bottom - rect.top))
    const contour = [rectangle(-2, -2, rect.width + 2, rect.height + 2), ...holes].join(" ")
    const viewBox = `-4 -4 ${rect.width + 8} ${rect.height + 8}`
    const svg = caret.querySelector(`[part~="${kind}-float-outline"]`) ?? document.createElementNS("http://www.w3.org/2000/svg", "svg")
    if(svg.getAttribute("viewBox") === viewBox && svg.lastElementChild?.getAttribute("d") === contour) return
    svg.setAttribute("part", `${kind}-float-outline`)
    svg.setAttribute("viewBox", viewBox)
    const mask = document.createElementNS(svg.namespaceURI!, "mask")
    mask.id = `◆${kind}-float-mask`
    mask.setAttribute("maskUnits", "userSpaceOnUse")
    mask.setAttribute("stroke", "none")
    for(const [name, value] of Object.entries({x: -4, y: -4, width: rect.width + 8, height: rect.height + 8})) mask.setAttribute(name, String(value))
    const background = document.createElementNS(svg.namespaceURI!, "rect")
    for(const [name, value] of Object.entries({x: -4, y: -4, width: rect.width + 8, height: rect.height + 8, fill: "white"})) background.setAttribute(name, String(value))
    mask.append(background)
    for(const points of holes) {
      const hole = document.createElementNS(svg.namespaceURI!, "path")
      hole.setAttribute("d", points)
      hole.setAttribute("fill", "black")
      mask.append(hole)
    }
    const path = document.createElementNS(svg.namespaceURI!, "path")
    path.setAttribute("d", contour)
    path.setAttribute("mask", `url(#${mask.id})`)
    svg.replaceChildren(mask, path)
    if(svg.parentElement !== caret) caret.append(svg)
    setPart(caret, `${kind}-caret-floats`)
  }

  /** Creates the shared selection caret in BODY's shadow tree. */
  #createSelectionCaret() {
    const node = document.createElement("div")
    node.classList.add("◆", "◆editor-only", "◆selection-caret")
    node.setAttribute("part", "selection-caret selection-caret-hidden")
    node.setAttribute("aria-hidden", "true")
    node.setAttribute("visibility", "hidden")
    node.contentEditable = "false"
    for(const side of ["top", "right", "bottom", "left"]) {
      const edge = document.createElement("span")
      edge.classList.add("◆capture-edge")
      edge.setAttribute("part", `selection-capture-edge selection-capture-edge-${side}`)
      node.append(edge)
    }
    this.editor.addAppendix(node)
    return node
  }

  /** The shared node, capture, gap, and text caret, or null before first use. */
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
    this.#clearSelectionFloatOutline()
    this.#releaseTransformCaretAnchor(caret)
    if(caret.getAttribute("visibility") !== "hidden") caret.setAttribute("visibility", "hidden")
    setPart(caret, "selection-caret-hidden")
    caret.style.removeProperty("left")
    caret.style.removeProperty("top")
    caret.style.removeProperty("height")
    caret.style.removeProperty("font-size")
    caret.style.removeProperty("--gap-caret-block-offset")
    caret.style.removeProperty("--gap-caret-inline-position")
    caret.style.removeProperty("--math-caret-top")
    caret.style.removeProperty("--math-caret-height")
    caret.style.removeProperty("--popup-caret-top")
    caret.style.removeProperty("--popup-caret-height")
    caret.style.removeProperty("color")
    for(const property of ["width", "position-area", "position-anchor", "translate", "transform", "transform-origin"]) caret.style.removeProperty(property)
    ;["node", "capture", "gap", "text"].forEach(state => setPart(caret, `selection-caret-${state}`, false))
    setPart(caret, "gap-caret", false)
    ;["gap-before-selected", "gap-after-selected", "drop-caret-before", "drop-caret-after"]
      .forEach(state => setPart(caret, `gap-caret-${state}`, false))
  }

  /** Shows the shared caret using one of its selection presentations. */
  #showSelectionCaret(state: "node" | "capture" | "gap" | "text") {
    const caret = this.selectionCaret ?? this.#createSelectionCaret()
    setPart(caret, `selection-caret-${state}`)
    setPart(caret, "selection-caret-hidden", false)
    if(state === "gap") setPart(caret, "gap-caret")
    caret.removeAttribute("visibility")
    if(state === "node" || state === "capture") {
      this.editor.features.transformation.updateInfo()
      const selected = this.captureSelectedElement ?? this.selectedSectionElement ?? $.selectedElement
      if(selected?.isConnected && !this.#transformCaretTarget && !caret.style.width
        && !getComputedStyle(selected).getPropertyValue("anchor-name").split(",").some(name => name.trim() === "--selection-anchor")) {
        const outlineTarget = this.captureSelectedElement ? figureSelectionTarget(selected) : selected
        // Transformation.updateInfo positions a masked outline when native
        // float boxes interrupt the selected element's border box. Keep that
        // geometry instead of replacing it with an anchored rectangular box.
        if(!this.floatExclusions(outlineTarget).length) this.anchorTransformCaret(selected)
      }
    }
    return caret
  }

  /** Reuse transform geometry, including the figure around captured content,
   * without changing the media or widget that owns capture. */
  positionTransformCaret(element: Element, geometry: Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height" | "transform">, floats = this.floatExclusions(element, element.getBoundingClientRect(), geometry)) {
    const caret = this.selectionCaret
    const captured = this.captureSelectedElement
    const owner = captured ?? this.selectedSectionElement ?? this.editor.features.transformation.stableSingleTransformTarget() ?? $.selectedElement
    const outlineOwner = captured ? figureSelectionTarget(captured) : owner
    if(owner !== element && outlineOwner !== element || !element.isConnected || !caret
      || !caret.matches('[part~="selection-caret-node"]') && !caret.matches('[part~="selection-caret-capture"]')) return
    this.#releaseTransformCaretAnchor(caret)
    if(outlineOwner !== element && outlineOwner instanceof HTMLElement) {
      const box = this.editor.features.transformation.boxGeometry(outlineOwner)
      geometry = {...box.styles, left: `${fixedClientX(parseFloat(box.styles.left))}px`}
      floats = this.floatExclusions(outlineOwner, box.rect, geometry)
    }
    for(const property of ["left", "top", "width", "height", "transform"] as const) {
      caret.style.setProperty(property, geometry[property], "important")
    }
    caret.style.setProperty("position-anchor", "auto", "important")
    caret.style.setProperty("position-area", "none", "important")
    caret.style.setProperty("translate", "none", "important")
    caret.style.setProperty("transform-origin", "center", "important")
    if(floats.length) this.#floatOutline(caret, new DOMRect(0, 0, parseFloat(geometry.width), parseFloat(geometry.height)), floats, "selection")
    else this.#clearSelectionFloatOutline()
    const outline = caret.querySelector('[part~="selection-float-outline"]')
    if(outline) setPart(outline, "selection-float-outline-capture", caret.matches('[part~="selection-caret-capture"]'))
  }

  #clearSelectionFloatOutline() {
    const caret = this.selectionCaret
    if(!caret) return
    caret.querySelector('[part~="selection-float-outline"]')?.remove()
    setPart(caret, "selection-caret-floats", false)
    for(const property of Array.from(caret.style)) if(property.startsWith("--selection-flow-")) caret.style.removeProperty(property)
  }

  /** Return to native anchor geometry when transform controls stop tracking. */
  clearTransformCaret() {
    const caret = this.selectionCaret
    this.#clearSelectionFloatOutline()
    if(!caret) return
    this.#releaseTransformCaretAnchor(caret)
    for(const property of ["left", "top", "width", "height", "transform", "transform-origin", "position-anchor", "position-area", "translate"]) {
      caret.style.removeProperty(property)
    }
  }

  /** Return the shared caret to live CSS anchor geometry for its current
   * outline owner, including a figure that wraps a captured element. */
  anchorTransformCaret(element: Element) {
    const caret = this.selectionCaret
    if(!caret) { this.clearTransformCaret(); return }
    const captured = this.captureSelectedElement
    const owner = captured ?? this.selectedSectionElement ?? $.selectedElement
    const target = captured ? figureSelectionTarget(captured) : element
    if(!target.isConnected || owner !== element && target !== element
      || !caret.matches('[part~="selection-caret-node"]') && !caret.matches('[part~="selection-caret-capture"]')) {
      this.clearTransformCaret()
      return
    }
    if(getComputedStyle(target).display === "contents" && target instanceof HTMLElement) {
      const {styles} = this.editor.features.transformation.boxGeometry(target)
      this.positionTransformCaret(element, {...styles, left: `${fixedClientX(parseFloat(styles.left))}px`}, [])
      return
    }
    if(this.#transformCaretTarget === target) return
    this.clearTransformCaret()
    setPart(caret, "selection-caret-anchored")
    this.#atomicAnchors.bind(caret, target)
    this.#atomicAnchors.refresh()
    this.#transformCaretTarget = target
  }

  #releaseTransformCaretAnchor(caret: HTMLElement) {
    this.#atomicAnchors.release(caret)
    setPart(caret, "selection-caret-anchored", false)
    this.#transformCaretTarget = null
  }

  /** Places a collapsed document selection, even if a widget or a table
   * previously owned editing focus. Existing caret rendering follows it. */
  selectDropRange(range: Range, {scrollIntoView = true} = {}) {
    if(focusedWidgetHost()) focusEditorWindow()
    this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.#endDrag()
    this.editor.features.table.clearCellSelection(false)
    $.move(range.startContainer, range.startOffset)
    this.processSelection(undefined, {scrollIntoView})
  }

  /** Reuses the shared caret to preview a transformation drop gap. */
  showDropCaret(placement: "before" | "after") {
    const caret = this.#showSelectionCaret("gap")

    setPart(caret, "gap-caret-drop-caret-before", false)
    setPart(caret, "gap-caret-drop-caret-after", false)

    setPart(caret, `gap-caret-drop-caret-${placement}`)
  }

  /** Clears the drop presentation, restoring the underlying selection mode. */
  clearDropCaret() {
    const caret = this.selectionCaret
    if(!caret) return

    setPart(caret, "gap-caret-drop-caret-before", false)
    setPart(caret, "gap-caret-drop-caret-after", false)
    const hasGapSelection = caret.matches('[part~="gap-caret-gap-before-selected"]')
      || caret.matches('[part~="gap-caret-gap-after-selected"]')
    if(!hasGapSelection) {
      setPart(caret, "selection-caret-gap", false)
      setPart(caret, "gap-caret", false)
    }
    const hasSelectionPresentation = ["node", "capture"].some(state =>
      caret.matches(`[part~="selection-caret-${state}"]`),
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
    if(this.#snippetHoverTarget) clearPresentationState(this.#snippetHoverTarget, "element-hovered", "snippet-hovered")
    this.#snippetHoverTarget = null
    this.#clearHoverState("element-hovered")
  }

  #clearStyleTargetHover() {
    this.#clearHoverState("style-target-hovered")
  }

  #clearHoverState(state: "element-hovered" | "style-target-hovered") {
    batchPresentationStates(document, () => {
      for(const element of presentationStateElements(document, state)) {
        clearPresentationState(element, state)
        if(state === "element-hovered") clearPresentationState(element, "snippet-hovered")
      }
    })
    this.#refreshHoverGeometry()
  }

  /** Creates the virtual caret for a document with no in-flow content.
   * Chromium keeps a valid BODY@0 selection in that state but does not paint
   * its native caret consistently. The visual element stays in the shadow
   * appendix and is positioned at the selected root’s content edge. */
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
    return this.editor.appendix.querySelector<HTMLElement>(".◆empty-document-caret")
  }

  /** Gap insertion belongs to the rendered parent's content column, even when the
   * adjacent block is empty or changes width after layout. Only the vertical
   * position uses that block's CSS anchor; horizontal placement is independent. */
  readonly #refreshGapCaretInlinePosition = () => {
    const caret = this.gapCaret
    const element = Array.from(this.#selectionMarkers).find(element =>
      element.isConnected && (hasPresentationState(element, "gap-before-selected") || hasPresentationState(element, "gap-after-selected")))
    if(!caret || !element) return
    caret.style.setProperty("--gap-caret-inline-position", this.gapCaretInlinePosition(element))
  }

  gapCaretInlinePosition(element: Element) {
    let parent = renderedParentElement(element)
    while(parent && getComputedStyle(parent).display === "contents") parent = renderedParentElement(parent)
    if(!parent) return `${fixedClientX(element.getBoundingClientRect().left)}px`
    const style = getComputedStyle(parent), rect = parent.getBoundingClientRect()
    const left = rect.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0)
    const right = rect.right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0)
    const themedColumn = parent.matches("body:not(.ww-canvas, .ww-slides), body:not(.ww-canvas, .ww-slides) > :is(main, article, section)")
      && getComputedStyle(document.body).getPropertyValue("--ww-float-width")
    const maximum = themedColumn ? style.getPropertyValue("--ww-prose-max").trim() || "45rem" : `${right - left}px`
    return `calc(${fixedClientX(left)}px + max(0px, (${right - left}px - ${maximum}) / 2))`
  }

  /** The elements whose caret color the native caret of the current selection
   * can take; none without a selection, which paints no caret. */
  get nativeCaretHosts(): Element[] {
    const selection = document.getSelection()
    return selection?.rangeCount ? nativeCaretHosts(selection) : []
  }

  /** States where the native caret of the current selection is hidden: in
   * the given elements and wherever Chromium could paint it. A rule for every
   * element would restyle the whole document on each change of the state. */
  #markNativeCaretHosts(marker: "gap-caret-host" | "node-caret-host", ...elements: Element[]) {
    const selection = document.getSelection()
    const hosts = new Set([...elements, ...selection ? nativeCaretHosts(selection) : [document.body]])
    batchPresentationStates(document, () => hosts.forEach(host => this.#markSelection(host, marker)))
  }

  /** A node selection keeps a native range around the node. */
  #markNodeSelection(...elements: Element[]) {
    this.#markSelection(document.body, "node-selection-active")
    this.#markNativeCaretHosts("node-caret-host", ...elements)
  }

  /** Retains marker owners so removal also cleans disconnected content. */
  #markSelection(element: Element, ...markers: string[]) {
    setPresentationStates(element, ...markers)
    this.#selectionMarkers.add(element)
    // BODY states the presence of an atomic range for its descendants. A
    // :has() rule with a descendant subject would restyle the whole document
    // whenever any :has() argument on BODY changes, such as native hover.
    if(markers.includes("atomic-range-selected") && element !== document.body) {
      setPresentationState(document.body, "atomic-range-active")
      this.#selectionMarkers.add(document.body)
    }
  }

  /** Clears the previous presentation, including markers on removed nodes. */
  #clearSelections(retainedElement: Element | null = null, retainedKind?: "node" | "capture" | "text" | "empty") {
    this.#clearAtomicOverlays()
    this.#handlePresentationChanges(this.#floatObserver?.takeRecords() ?? [])
    const retainedMarker = retainedKind === "text" ? "text-selected"
      : retainedKind === "empty" ? "empty-selected" : "element-selected"
    batchPresentationStates(document, () => this.#selectionMarkers.forEach(element => {
      const removed = selectionPresentationStates.filter(marker => !(
        element === retainedElement && (marker === retainedMarker || marker === "element-capture-selected" && retainedKind === "capture"
          || marker === "empty-root-selected" && retainedKind === "empty")
        || element === document.body && retainedElement && (retainedKind === "node" || retainedKind === "capture") && marker === "node-selection-active"
      ))
      clearPresentationState(element, ...removed)
    }))
    this.#selectionMarkers.clear()
    if(retainedElement) this.#selectionMarkers.add(retainedElement)
    if(hasPresentationState(document.body, "node-selection-active")) this.#selectionMarkers.add(document.body)
    if(!retainedKind || !this.selectionCaret?.matches(`[part~="selection-caret-${retainedKind}"]`)) this.#hideSelectionCaret()
  }

  /** Replaces malformed or newly entered element selections with one
   * canonical forward range, preserving explicit Shift-arrow extensions.
   * This resets browser selection direction/state
   * left over from a preceding text selection, regardless of who changed the
   * document Selection. */
  #normalizeNativeSelection() {
    if(this.editor.features.mark.isSVGTextSelection || $.isMultiElementSelection) return
    let selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    // An explicit extension owns its anchor, even when it spans exactly one
    // node. Live Range boundaries follow concurrent DOM mutations.
    const extended = this.#atomicExtension
    const range = selection.rangeCount === 1 ? selection.getRangeAt(0) : null
    if(extended && range && extended.backwards === $.isBackwards
      && extended.range.startContainer === range.startContainer && extended.range.startOffset === range.startOffset
      && extended.range.endContainer === range.endContainer && extended.range.endOffset === range.endOffset) return
    this.#atomicExtension = null
    if(selection.isCollapsed) {
      const summary = $.summaryAtLeadingBoundary(selection.anchorNode, selection.anchorOffset)
        ?? $.widgetFieldAtLeadingBoundary(selection.anchorNode, selection.anchorOffset, this.editor.schema)
      if(summary) $.move(summary)
    }
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
    // in-place Range mutation. Ordinary node selections use the forward parent
    // range [index, index + 1]. Chromium reports "none" for ranges around
    // non-text SVG content even after setBaseAndExtent; rewriting that valid
    // range would trigger selectionchange indefinitely.
    const hasCanonicalDirection = selection.direction !== "backward"
    if(!hasCanonicalEndpoints || !hasCanonicalDirection) {
      selection.setBaseAndExtent(parent, index, parent, index + 1)
    }
  }

  /** Classifies the normalized live selection exactly once so only one
   * presentation branch can be applied during this refresh. */
  #selectionKind(inDragSelection: boolean, capturedElement: Element | null): SelectionKind {
    if(this.editor.features.mark.isSVGTextSelection) return "text"
    if(inDragSelection && (capturedElement || this.selectedSectionElement || $.isElementSelection || $.isMultiElementSelection)) return "text"
    if(capturedElement) return "capture"
    if(this.selectedSectionElement) return "section"
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return "none"
    if(this.editor.features.table.hasCellSelection) return "cell"
    if(this.editor.features.list.isVirtualSelection) return "virtual"
    if(inlineMathRoot(selection.anchorNode) && inlineMathRoot(selection.anchorNode) === inlineMathRoot(selection.focusNode)) return "text"
    if($.isGapSelection) return "gap"
    if($.isElementSelection && !inDragSelection) return "element"
    const anchorContainer = getContainer(selection.anchorNode)
    if(anchorContainer && $.isTextSelection) return "text"
    if(anchorContainer && selection.isCollapsed && $.isEmptySelection) return "empty"
    return "text"
  }

  /** A slide/canvas item's controls also frame selections inside its content.
   * Resolve both endpoints against the live DOM without changing their kind. */
  #layoutSelectionItem(anchor: Node | null, focus: Node | null) {
    const canvas = this.editor.features.canvas.active, slides = this.editor.features.slides.active
    if(!canvas && !slides) return null
    const itemFor = (node: Node | null) => {
      let element = isElement(node) ? node : node?.parentElement
      while(element && element !== document.body) {
        const parent = element.parentElement
        if(canvas && parent === document.body || slides && parent && slideLayoutRole(parent) === "slide") {
          return !slideLayoutRole(element) && !element.matches("style,script,link,meta,template") ? element : null
        }
        element = parent
      }
      return null
    }
    const item = itemFor(anchor)
    return item?.isConnected && item === itemFor(focus) ? item : null
  }

  /** Reveals a changed logical selection once. Live range snapshots follow DOM
   * mutations so refreshes and edits around an unchanged caret do not scroll.
   * Node and capture selections of the same element share one scroll target. */
  #scrollSelectionIntoView(kind: SelectionKind, selection: Selection | null, capturedElement: Element | null) {
    if(this.isInDragSelection) return
    const selectedElement = kind === "capture" ? capturedElement
      : kind === "section" ? this.selectedSectionElement
        : kind === "element" ? $.selectedElement
          : kind === "cell" ? this.editor.features.table.selectionFocusCell
            : null
    const previous = this.#lastScrollSelection
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const backwards = Boolean(range && $.isBackwards)
    if(selectedElement ? previous && "element" in previous && previous.element === selectedElement
      : range && previous && "range" in previous && previous.backwards === backwards
        && previous.range.startContainer === range.startContainer && previous.range.startOffset === range.startOffset
        && previous.range.endContainer === range.endContainer && previous.range.endOffset === range.endOffset) return
    this.#lastScrollSelection = selectedElement ? {element: selectedElement}
      : range ? {range: range.cloneRange(), backwards} : null
    if(this.suppressSelectionScroll) return
    if(selectedElement) {
      if(this.editor.features.canvas.active) {
        this.editor.features.canvas.reveal(selectedElement.getBoundingClientRect())
        return
      }
      selectedElement.scrollIntoView({behavior: uiMotionDisabled(selectedElement) ? "instant" : "smooth", block: "nearest", inline: "nearest"})
      return
    }
    if(!selection?.focusNode || !["virtual", "gap", "text", "empty"].includes(kind)) return
    // Deselecting the last canvas item leaves a fallback caret in BODY.
    // BODY is outside the camera's transformed slot, so revealing its page
    // origin would pan the camera again on every deselection.
    if(this.editor.features.canvas.active && selection.focusNode === document.body) return

    const rect = caretRect(selection.focusNode, selection.focusOffset)
    const margin = 1.25 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
    const focusElement = selection.focusNode instanceof Element
      ? selection.focusNode : selection.focusNode.parentElement ?? document.body
    const behavior = uiMotionDisabled(focusElement) ? "instant" : "smooth"
    let predicted = {
      left: rect.left,
      right: rect.right > rect.left ? rect.right : rect.left + 1,
      top: rect.top - margin,
      bottom: (rect.bottom > rect.top ? rect.bottom : rect.top + 1) + margin,
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
    if(this.editor.features.canvas.active) this.editor.features.canvas.reveal(predicted)
    else if(left || top) window.scrollBy({left, top, behavior})
  }

  /** Reveal the selected content before measuring its selection UI. A summary
   * stays visible while closed, and selecting a disclosure itself need only
   * reveal its ancestors. */
  #revealDetails(node: Node | null) {
    if(!node || !document.body.contains(node)) return
    let details = (isElement(node) ? node : node.parentElement)?.closest("details")
    while(details) {
      if(!details.open && !details.querySelector(":scope > summary")?.contains(node)) details.open = true
      details = details.parentElement?.closest("details")
    }
  }

  /** Explicit restoration must reveal even an unchanged, manually scrolled caret. */
  revealSelection() {
    if(focusedWidgetHost()) focusEditorWindow()
    // Undoing a shape edit restores the same SVG range. Keep its capture so
    // the active drawing tool and shape selection can continue editing it.
    const captured = this.captureSelectedElement
    if(captured?.namespaceURI !== SVG_NAMESPACE || captured.localName !== "svg"
      || $.selectedElement !== figureSelectionTarget(captured)) this.#releaseCaptureSelection()
    this.clearSelectedSection()
    this.#endDrag()
    this.editor.features.table.clearCellSelection(false)
    this.#lastScrollSelection = null
    this.processSelection(false)
  }

  /** Normalizes and re-applies exactly one selection kind for the current
   * document Selection. This is the invariant boundary used by native
   * selectionchange events and every editor-driven refresh. Passive refreshes
   * preserve the last interaction's scroll target without revealing it again. */
  processSelection(inDragSelection=this.isInDragSelection, options: {scrollIntoView?: boolean, refreshGraphic?: boolean} = {}) {
    // The previous presentation is cleared before the current one is marked.
    // Caret, cursor and selection paint that both share stays installed, so a
    // layout read in between does not restyle the document for it twice.
    deferPresentationPaint(document, () => this.#processSelection(inDragSelection, options))
  }

  #processSelection(inDragSelection: boolean, {scrollIntoView = true, refreshGraphic = true}: {scrollIntoView?: boolean, refreshGraphic?: boolean}) {
    if(this.#boxDrag || this.#settingDragSelection || $.isSettingRanges) return
    const drag = this.#drag, live = document.getSelection(), root = getDocumentRoot()
    // Native focus/selection defaults may collapse a gap-origin drag into
    // the last paragraph. Its original gap and measured focus remain live.
    if(drag?.fromGap && drag.moved && live && root.contains(drag.anchor.startContainer) && root.contains(drag.lastFocus.startContainer)
      && (live.anchorNode !== drag.anchor.startContainer || live.anchorOffset !== drag.anchor.startOffset
        || live.focusNode !== drag.lastFocus.startContainer || live.focusOffset !== drag.lastFocus.startOffset)) {
      this.#applyDragRange(drag.anchor, drag.lastFocus, true)
    }
    // A native shadow control may already have focus while its pointer is
    // held. Leave its caret and the previous editor selection untouched until
    // the click completes; focus alone must not promote a press to capture.
    if(this.#captureClick && this.captureSelectedElement !== this.#captureClick.element
      && focusedWidgetHost() === this.#captureClick.element) return
    flushPresentationStyles(document)
    if(!this.editor.allowsSelection("select")) {
      this.editor.features.widget.syncLegacyOptions(null)
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      this.#clearSelections()
      this.#clearElementHover()
      this.editor.features.transformation.clearTransform()
      this.editor.features.manipulation.refreshNodeDragTarget(null)
      return
    }
    // Appendix inputs and SVG label ranges own their text selection. Clamping
    // them into BODY disrupts typing and clears the graphic's capture outline.
    const selection = document.getSelection()
    if(isAppendixInteraction() && selection?.anchorNode && !document.body.contains(selection.anchorNode)) return
    if(this.editor.features.math.isComposingPower || this.editor.features.graphic.isTextInputFocused
      || this.editor.features.graphic.textEditingRange) return
    // Shadow controls own capture and their native selection. Focus on a
    // contentful host with a range in its authored children stays ordinary
    // document editing, including when those children are slotted.
    const shadowOwner = focusedWidgetHost() === this.#blurringWidget ? null : focusedWidgetHost()
    const nativeRange = document.getSelection()
    // Actual private focus wins over an old document caret in slotted light
    // DOM. Moving that stale range would blur the newly focused control.
    const authoredFocus = !shadowOwner?.shadowRoot?.activeElement && nativeRange?.anchorNode && nativeRange.focusNode
      && shadowOwner?.contains(nativeRange.anchorNode) && shadowOwner.contains(nativeRange.focusNode)
      && ($.isTextSelection || $.isEmptySelection || $.isGapSelection)
    const shadowFocused = shadowOwner && !authoredFocus && (shadowOwner.shadowRoot?.activeElement
      || this.#focusedContentfulShadow === shadowOwner)
    const capturedWidget = this.#capturedElement
    if(!shadowFocused && capturedWidget && isContentfulWidget(capturedWidget, this.editor.schema)
      && nativeRange?.anchorNode && nativeRange.focusNode
      && (!shadowOwner && $.selectedElement === capturedWidget
        || capturedWidget.contains(nativeRange.anchorNode) && capturedWidget.contains(nativeRange.focusNode)
          && ($.isTextSelection || $.isEmptySelection || $.isGapSelection))) this.#releaseCaptureSelection()
    // Chromium can clear its native range when focusing an SVG-only document.
    // Keep capture or ordinary node selection until actual new endpoints exist.
    if(!document.getSelection()?.rangeCount) {
      const captured = this.captureSelectedElement
      const retained = captured?.namespaceURI === SVG_NAMESPACE && captured.localName === "svg" ? captured
        : Array.from(this.#selectionMarkers).find(element => element.isConnected
          && hasPresentationState(element, "element-selected") && standaloneGraphicShape(element))
      if(retained) $.selectElement(retained, false)
    }
    if($.isMultiElementSelection && !inDragSelection) {
      const elements = $.selectedElements
      // The outline observer already follows authored geometry. Keep the
      // existing presentation when a group drag syncs the same live selection.
      if(!this.#capturedElement && this.editor.features.transformation.hasStableGroupSelection(elements)
        && this.#atomicOverlays.size === elements.length && elements.every(element =>
          this.#atomicOverlays.get(element)?.isConnected && hasPresentationState(element, "element-selected")
          && hasPresentationState(element, "atomic-range-selected"))) {
        this.editor.doc.updateLocalSelection()
        return
      }
      this.editor.features.widget.syncLegacyOptions(null)
      this.editor.doc.updateLocalSelection()
      this.#releaseCaptureSelection()
      this.#clearSelections()
      this.editor.features.list.clearSelectionPresentation()
      this.editor.features.canvas.syncSelection(null)
      this.editor.features.transformation.syncGroupSelection(elements)
      this.editor.features.board.refresh()
      this.editor.features.manipulation.refreshNodeDragTarget(null)
      for(const element of elements) {
        this.#revealDetails(element.parentNode)
        this.#markSelection(element, "element-selected", "atomic-range-selected")
        const overlay = document.createElement("div")
        overlay.classList.add("◆", "◆editor-only")
        overlay.setAttribute("part", "atomic-selection-overlay multi-selection-overlay")
        overlay.setAttribute("aria-hidden", "true")
        this.editor.addAppendix(overlay)
        this.#atomicOverlays.set(element, overlay)
      }
      this.#markNodeSelection(...elements)
      this.#positionAtomicOverlays()
      if(refreshGraphic) this.editor.features.graphic.refresh()
      this.editor.features.layout.refresh()
      return
    }
    const focused = focusedWidgetHost()
    const focusedWidget = focused === this.#blurringWidget || focused === this.#captureClick?.element ? null : focused
    const capturedChild = this.captureSelectedElement
    // A pointer can select authored media before the browser blurs the
    // widget's shadow control. Keep that selection through the focus change.
    if(focusedWidget && !this.isInDragSelection
      && !(capturedChild && capturedChild !== focusedWidget && focusedWidget.contains(capturedChild))) {
      this.#capturedElement = !isContentfulWidget(focusedWidget, this.editor.schema)
        || shadowFocused ? focusedWidget : null
    }
    const formula = this.editor.features.math.activeMath
    if(this.#capturedElement?.localName === "math" && (this.#capturedElement !== formula || inlineMathRoot(formula))) this.#releaseCaptureSelection()
    if(formula && inlineMathRoot(formula) && !focusedWidget) this.#releaseCaptureSelection()
    if(formula && formula !== this.#captureClick?.element && this.editor.features.math.selectedMath !== formula && !inlineMathRoot(formula) && !this.captureSelectedElement) this.#capturedElement = formula
    // SVG capture follows the live document selection. A native caret move
    // outside the graphic may arrive without an ordinary editor pointer event.
    // Media source controls own their shadow selection while configuring an
    // embedded image; that selection does not leave the captured graphic.
    const nativeSelection = document.getSelection()
    if(!this.editor.features.media.isPlaceholderInteraction
      && this.#capturedElement?.namespaceURI === SVG_NAMESPACE && this.#capturedElement.localName === "svg"
      && $.selectedElement !== figureSelectionTarget(this.#capturedElement)
      && (!nativeSelection?.anchorNode || !nativeSelection.focusNode
        || !this.#capturedElement.contains(nativeSelection.anchorNode) || !this.#capturedElement.contains(nativeSelection.focusNode))) {
      this.#releaseCaptureSelection()
    }
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
      this.#constrainSelectionToFlow()
      this.#constrainSelectionToAtomicContent()
      this.normalizePopupSelection()
      sel = document.getSelection()
      const root = getDocumentRoot()
      const isInRoot = (node: Node | null) => node === root || Boolean(node && root.contains(node))
      if(!sel?.rangeCount || sel.isCollapsed && (!isInRoot(sel.anchorNode) || !isInRoot(sel.focusNode))) {
        if(!this.editor.features.slides.active) $.selectDocumentStart()
        sel = document.getSelection()
      }
      if(!inDragSelection) this.#normalizeNativeSelection()
      this.editor.features.slides.constrainSelection()
      this.editor.features.board.constrainSelection()
      sel = document.getSelection()
      if(sel?.isCollapsed && sel.anchorNode && $.isGapSelection) {
        const paragraph = $.emptyParagraphAtBoundary(sel.anchorNode, sel.anchorOffset)
        if(paragraph) $.move(paragraph)
      }
      sel = document.getSelection()
      this.editor.features.list.clearSelectionPresentation()
    }
    const kind = this.#selectionKind(inDragSelection, capturedElement)
    const selectedElement = kind === "capture" ? capturedElement
      : kind === "section" ? this.selectedSectionElement
        : kind === "element" ? $.selectedElement ?? null : null
    if(selectedElement) this.#revealDetails(selectedElement.parentNode)
    else {
      const range = sel?.rangeCount === 1 ? sel.getRangeAt(0) : null
      const selectedChild = range && range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1
        ? range.startContainer.childNodes.item(range.startOffset) : null
      // A native range around SUMMARY has endpoints in DETAILS, but only
      // selects the summary's visible content. Reveal its ancestors instead.
      if(isElement(selectedChild) && selectedChild.matches("details > summary")) this.#revealDetails(selectedChild)
      else {
        this.#revealDetails(sel?.anchorNode ?? null)
        this.#revealDetails(sel?.focusNode ?? null)
      }
    }
    // Geometry refreshes read layout below. Keep an unchanged node's anchor
    // and outline installed while those reads flush styles during a gesture.
    const textElement = (kind === "text" || kind === "empty") && sel?.rangeCount
      ? getContainer(sel.getRangeAt(0).commonAncestorContainer) : null
    const presentationElement = selectedElement ?? (isElement(textElement) ? textElement : null)
    const retainedKind = kind === "text" || kind === "empty" ? kind : kind === "capture" ? "capture" : "node"
    const marker = kind === "text" ? "text-selected" : kind === "empty" ? "empty-selected" : "element-selected"
    const hadPopupBoundaryCaret = hasPresentationState(document.body, "popup-boundary-caret")
    const hadTouchCaret = hasPresentationState(document.body, "touch-caret-visible")
    const retained = presentationElement && this.#selectionMarkers.has(presentationElement)
      && presentationElement.isConnected && hasPresentationState(presentationElement, marker) ? presentationElement : null
    this.#clearSelections(retained, retained ? retainedKind : undefined)
    if(hadPopupBoundaryCaret && (kind !== "text" || !sel?.isCollapsed)) this.#hideSelectionCaret()
    if(hadTouchCaret && (!this.#touchSelection || !sel?.isCollapsed)) this.#hideSelectionCaret()
    this.editor.features.widget.syncLegacyOptions(selectedElement ?? (sel?.rangeCount === 1 ? sel.getRangeAt(0).commonAncestorContainer : null))
    if(sel?.rangeCount && !sel.isCollapsed) {
      $.excludedFlowElements.forEach(element => this.#markSelection(element, "flow-excluded"))
    }
    const selectionOwner = selectedElement ?? (kind === "cell" ? this.editor.features.table.selectedTable : null)
    const layoutItem = this.#layoutSelectionItem(selectionOwner ?? sel?.anchorNode ?? null, selectionOwner ?? sel?.focusNode ?? null)
    // Canvas may remove a previously focused empty paragraph before the
    // selected SVG. Preserve the explicit SVG node selection if that removal
    // leaves the native Range on the following sibling in this browser.
    const selectedCapturedSvg = capturedElement?.namespaceURI === SVG_NAMESPACE && capturedElement.localName === "svg"
      && $.selectedElement === figureSelectionTarget(capturedElement)
    if(!inDragSelection) this.editor.features.canvas.syncSelection(layoutItem ?? selectedElement)
    if(selectedCapturedSvg && capturedElement.isConnected && $.selectedElement !== figureSelectionTarget(capturedElement)) {
      $.selectElement(figureSelectionTarget(capturedElement), false)
    }
    const transformTarget = inDragSelection ? null : layoutItem ?? selectedElement
    // Node presentation measures the frame after installing its caret and
    // markers. Text and cell selections still update their layout item here.
    this.editor.features.transformation.syncSelection(
      transformTarget && !boardLayoutRole(transformTarget) && !slideLayoutRole(transformTarget) ? transformTarget : null,
      Boolean(layoutItem && layoutItem !== selectedElement), !selectedElement,
    )
    this.editor.features.board.refresh()
    this.editor.features.manipulation.refreshNodeDragTarget(inDragSelection ? null
      : this.editor.features.math.selectedMath ?? (kind === "element" ? $.selectedElement ?? null : null))
    if(refreshGraphic) this.editor.features.graphic.refresh()
    this.editor.features.layout.refresh()
    if(scrollIntoView && !inDragSelection && !isContentfulWidget(focusedWidget, this.editor.schema)) {
      this.#scrollSelectionIntoView(kind, sel, capturedElement)
    }
    let captionPlaceholder = false
    if(!this.editor.isEditingLocked) {
      const origin = selectedElement ?? sel?.anchorNode
      const figure = (isElement(origin) ? origin : origin?.parentElement)?.closest("figure")
      const anchorContainer = sel?.anchorNode ? getContainer(sel.anchorNode) : null
      const editingCaption = !selectedElement && sel?.anchorNode && sel.focusNode
        && isElement(anchorContainer) ? anchorContainer.closest("figcaption, caption") : null
      const caption = editingCaption?.contains(sel?.focusNode ?? null) ? editingCaption
        : figure && (selectedElement || sel?.focusNode && figure.contains(sel.focusNode))
          ? figure.querySelector(":scope > figcaption") : null
      if(caption && !caption.textContent?.trim()
        && !Array.from(caption.querySelectorAll("*")).some(element =>
          Boolean(isAtomicEditingElement(element, this.editor.schema)) || element.matches("math, table, canvas"))) {
        this.#markSelection(caption, "caption-placeholder")
        if(caption === editingCaption) {
          this.#markSelection(caption, "caption-editing")
          captionPlaceholder = true
        }
      }
    }
    if(kind === "cell") return
    if(kind === "virtual") {
      this.editor.features.list.refreshSelectionPresentation()
      return
    }
    if(kind === "capture" && capturedElement) {
      this.#markNodeSelection(capturedElement)
      this.#markSelection(capturedElement, "element-selected", "element-capture-selected")
      this.#showSelectionCaret("capture")
      if(capturedElement.localName === "math" && sel) this.#showRangeOverlays(sel)
      return
    }
    if(kind === "section") {
      const section = this.selectedSectionElement
      if(!section) return
      this.#markNodeSelection(section)
      this.#markSelection(section, "element-selected")
      this.#showSelectionCaret("node")
      return
    }
    if(!sel?.anchorNode || !sel.focusNode) return
    if((kind === "text" || kind === "element") && !this.editor.features.mark.isSVGTextSelection) this.#showRangeOverlays(sel)
    if(kind === "gap" && !captionPlaceholder) {
      const children = sel.anchorNode!.childNodes
      if(children.length) {
        const i = sel.anchorOffset
        const before = Array.from(children).slice(0, i).reverse().find((node): node is Element => isElement(node) && !isOutOfFlow(node))
        const after = Array.from(children).slice(i).find((node): node is Element => isElement(node) && !isOutOfFlow(node))
        const nestedListAfter = isElement(sel.anchorNode)
          && sel.anchorNode.matches("li, dt, dd")
          && isElement(children.item(i))
          && (children.item(i) as Element).matches("ul, ol, dl, menu")
        const structuralGap = $.mathBoundary ?? $.listGap ?? $.detailsGap ?? $.dividerGap ?? $.styledParagraphGap ?? $.captionedGap ?? $.blockGap
        const placement = structuralGap?.placement ?? (!before || nestedListAfter ? "before": "after")
        const element = structuralGap?.element ?? (placement === "after" ? before : after)
        if(!element) {
          return
        }
        const gapCaret = this.#showSelectionCaret("gap")
        this.#markSelection(element, `gap-${placement}-selected`)
        this.#refreshGapCaretInlinePosition()
        // Include the trailing margin in the insertion position. The gap
        // marker previews the theme's spacing even on its current last block.
        gapCaret.style.setProperty("--gap-caret-block-offset", placement === "after"
          ? `${parseFloat(getComputedStyle(element).marginBottom) || 0}px` : "0px")

        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        this.#markSelection(document.body, "gap-caret-visible")
        // Chromium paints at the nearest caret position; iPad Safari takes
        // the color from the editable root instead (HTML in designMode).
        this.#markNativeCaretHosts("gap-caret-host", document.documentElement, document.body)
      }

    }
    else if(kind === "element") {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      if(isElement(element)) {
        this.#markNodeSelection(element)
        this.#markSelection(element, "element-selected")
        this.#showSelectionCaret("node")
      }
    }
    else if(kind === "text") {
      const element = getContainer($.commonAncestor)
      if(isElement(element)) this.#markSelection(element, "text-selected")
    }
    else if(kind === "empty") {
      const element = getContainer($.commonAncestor)
      if(!element) return
      this.#markSelection(element, "empty-selected")
      // Only these roots name the empty-document caret's anchor. A separate
      // state keeps the positions of other empty blocks out of those rules:
      // once BODY has matched any positional rule, each insertion beside an
      // active `p:nth-child()` path restyles every paragraph.
      if(element === document.body || element.matches('body > [role~="document"]')) this.#markSelection(element, "empty-root-selected")
      else clearPresentationState(element, "empty-root-selected")
      if(element.matches("li")) this.editor.features.list.refreshSelectionPresentation()
      if(element === getDocumentRoot()) {
        const caret = this.emptyDocumentCaret ?? this.#createEmptyDocumentCaret()
        const style = getComputedStyle(element)
        const rtl = style.direction === "rtl"
        const inlineOffset = (parseFloat(rtl ? style.borderRightWidth : style.borderLeftWidth) || 0)
          + (parseFloat(rtl ? style.paddingRight : style.paddingLeft) || 0)
        const topOffset = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0)
        caret.style.setProperty("--empty-caret-left", rtl ? `calc(anchor(right) - ${inlineOffset}px)` : `calc(anchor(left) + ${inlineOffset}px)`)
        caret.style.setProperty("--empty-caret-top", `calc(anchor(top) + ${topOffset}px)`)
      }
    }
    if(kind === "text" && sel.isCollapsed) {
      const popup = this.#popupCaretBoundary(sel)
      if(hadPopupBoundaryCaret && !popup) this.#hideSelectionCaret()
      if(popup) {
        const left = getComputedStyle(popup.toggle).direction === "rtl" ? !popup.start : popup.start
        this.#markSelection(popup.wrapper, `popup-caret-${popup.inside ? "inside" : "outside"}-${left ? "left" : "right"}`)
        this.#markSelection(document.body, "popup-boundary-caret")
        const caret = this.#showSelectionCaret("text")
        const point = popup.inside ? [sel.focusNode, sel.focusOffset] as const
          : textPointAtOffset(popup.toggle, popup.start ? 0 : popup.toggle.textContent?.length ?? 0,
            [popup.toggle, popup.start ? 0 : popup.toggle.childNodes.length])
        const textRect = caretRect(point[0], point[1])
        const wrapperRect = popup.wrapper.getBoundingClientRect()
        if(textRect.height > 0) {
          caret.style.setProperty("--popup-caret-top", `calc(anchor(top) + ${textRect.top - wrapperRect.top}px)`)
          caret.style.setProperty("--popup-caret-height", `${textRect.height}px`)
        }
        caret.style.color = getComputedStyle(popup.inside ? popup.toggle : popup.wrapper.parentElement ?? document.body).color
      }
      const inside = inlineMathRoot(sel.focusNode)
      const boundary = $.mathBoundary
      const outside = boundary && inlineMathRoot(boundary.element)
      const formula = inside ?? outside
      const atInnerEdge = inside && sel.focusNode === inside && (sel.focusOffset === 0 || sel.focusOffset === inside.childNodes.length)
      if(!popup && formula && (atInnerEdge && inside!.childNodes.length > 0 || outside)) {
        const start = inside ? sel.focusOffset === 0 : boundary!.placement === "before"
        const left = getComputedStyle(formula).direction === "rtl" ? !start : start
        this.#markSelection(formula, `math-caret-${inside ? "inside" : "outside"}-${left ? "left" : "right"}`)
        this.#markSelection(document.body, "math-boundary-caret")
        const caret = this.#showSelectionCaret("text")
        caret.style.fontSize = getComputedStyle(inside ?? formula.parentElement ?? formula).fontSize
        const rect = this.editor.features.math.structuralTextRect(formula, start ? 0 : formula.childNodes.length, !inside)
        if(rect) {
          caret.style.setProperty("--math-caret-top", `calc(anchor(top) + ${rect.top - formula.getBoundingClientRect().top}px)`)
          caret.style.setProperty("--math-caret-height", `${rect.height}px`)
        }
      }
    }
    // Native text carets can disappear after prevented touch gestures or
    // while another app owns the drag.
    // Reuse the shared appendix caret at the collapsed selection's geometry.
    const touchCaret = this.#touchSelection && sel.isCollapsed && Boolean(document.activeElement?.contains(sel.focusNode))
      && !hasPresentationState(document.body, "math-boundary-caret") && !hasPresentationState(document.body, "popup-boundary-caret")
    if(touchCaret && (kind === "text" || kind === "empty") && !$.isEmptyDocumentSelection) {
      this.#markSelection(document.body, "touch-caret-visible")
      const rect = caretRect(sel.focusNode, sel.focusOffset)
      const caret = this.#showSelectionCaret("text")
      caret.style.left = `${fixedClientX(rect.left)}px`
      caret.style.top = `${rect.top}px`
      caret.style.height = `${rect.height}px`
    }
  }

  /** Observing behavior: re-apply markers on every selection change, extend
   * the drag selection on pointer moves, and mirror modifier key state onto
   * the body and root presentation. */
  passiveListeners: DocumentListenerMap = {
    "visibilitychange": () => {
      if(document.visibilityState === "hidden") this.#handleWindowBlur()
    },
    "pointermove": event => this.#extendDrag(event),
    "selectionchange": () => {
      if(this.#boxDrag || this.editor.features.media.isPlaceholderInteraction || this.#settingDragSelection || $.isSettingRanges
        || this.editor.features.slides.isSelectingForNavigation) return
      if(this.editor.features.table.keepsNativeSelectionDuringResize()) return
      const selection = document.getSelection()
      const current = selection?.rangeCount ? selection.getRangeAt(0) : null
      const previous = this.#selectedSectionRange
      // Programmatic selection queues a native event. Keep the explicit
      // wrapper until the actual range changes, including after insertion.
      if(!current || !previous || current.startContainer !== previous.startContainer || current.startOffset !== previous.startOffset
        || current.endContainer !== previous.endContainer || current.endOffset !== previous.endOffset) this.clearSelectedSection()
      this.processSelection(this.isInDragSelection, {scrollIntoView: false})
    },

  }

  /** Read the final selection after native defaults and other feature handlers.
   * Local input can move the caret visually without changing its live Range. */
  #scheduleSelectionReveal(event: Event) {
    if(this.editor.features.canvas.active && (event instanceof KeyboardEvent ? event.key === "Backspace"
      : event instanceof InputEvent && event.inputType.startsWith("delete") && event.inputType.endsWith("Backward"))) {
      if(this.#revealSelectionFrame !== null) cancelAnimationFrame(this.#revealSelectionFrame)
      this.#revealSelectionFrame = null
      return
    }
    if(this.#revealSelectionFrame !== null) return
    this.#revealSelectionFrame = requestAnimationFrame(() => {
      this.#revealSelectionFrame = null
      const selection = document.getSelection()
      if(this.isCaptureSelection || focusedWidgetHost() || !selection?.focusNode
        || !getDocumentRoot().contains(selection.focusNode)) return
      if(this.#lastScrollSelection && "range" in this.#lastScrollSelection) this.#lastScrollSelection = null
      this.#scrollSelectionIntoView(this.#selectionKind(this.isInDragSelection, null), selection, null)
    })
  }

  /** Pointer behavior: 
   * pointerdown starts a mouse/pen drag; touch selects only on a completed tap,
   * native double/triple clicks select and drag by word/paragraph,
   * pointerup ends the drag selection. */
  activeListeners: DocumentListenerMap = {
    "beforeinput": event => this.#scheduleSelectionReveal(event),
    "input": event => this.#scheduleSelectionReveal(event),
    "mousedown": ev => {
      if(this.captureSelectedElement && ev.target instanceof Node && this.captureSelectedElement.contains(ev.target)) return
      if(ev.detail >= 2 && !this.#textHit(ev)) ev.preventDefault()
    },
    "keydown": ev => {
      const direction = arrowDirection(ev.key)
      // Captured widgets and interactive authored elements own their keyboard
      // events. The shared listener router normally enforces this guard; keep
      // it here as the direct-call invariant as well.
      if(this.isCaptureSelection) return
      if(direction || ["Enter", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown", "Tab"].includes(ev.key)) {
        this.#scheduleSelectionReveal(ev)
      }
      this.#releaseCaptureSelection()
      this.clearSelectedSection()
      if(ev.key.toLowerCase() === "a" && modifierKeyDown(ev)) {
        ev.preventDefault()
        const flow = editingFlowRoot($.selectedElement ?? $.anchor)
        const root = popupElementRole(flow) === "content" ? flow : this.editor.features.canvas.editingRoot ?? getDocumentRoot()
        $.selectRange(root, 0, root, root.childNodes.length)
        this.processSelection()
      }
      else if(direction && !ev.defaultPrevented && !ev.altKey && !modifierKeyDown(ev) && !ev.shiftKey
        && ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && this.#navigatePopupBoundary(direction)
          || (ev.key === "ArrowUp" || ev.key === "ArrowDown") && this.#navigatePopupParagraphGap(direction)
          || this.#navigateMathBoundary(direction)
          || this.#navigateContainerGap(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown")
          || this.#navigateAtomicSelection(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown")
          || (ev.key === "ArrowUp" || ev.key === "ArrowDown") && this.#navigateBlockGap(direction)
          || ev.key === "ArrowUp" && this.#navigateTextFromGap())) {
        ev.preventDefault()
      }
      else if(direction && ev.shiftKey && !ev.defaultPrevented && !ev.altKey && !ev.ctrlKey && !ev.metaKey
        && this.#navigateAtomicSelection(direction, ev.key === "ArrowUp" || ev.key === "ArrowDown", true)) {
        ev.preventDefault()
      }
      else if(direction && !ev.defaultPrevented && !ev.altKey && !modifierKeyDown(ev) && !$.isElementSelection
        && this.#hasOutOfFlowContent($.flowRoot)) {
        ev.preventDefault()
        const granularity = ev.key === "ArrowUp" || ev.key === "ArrowDown" ? "line" : "character"
        ev.shiftKey ? $.extendBy(granularity, direction) : $.moveBy(granularity, direction)
        this.processSelection()
      }
      else if(ev.key === "ArrowUp" && ev.altKey) {
        if(!ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.isComposing || ev.defaultPrevented) return
        if(!document.getSelection()?.rangeCount || $.isElementSelection || $.isMultiElementSelection) return
        const node = $.commonAncestor
        const target = atomicEditingContainer(node, this.editor.schema) ?? getContainer(node)
        const root = getDocumentRoot()
        if(!isElement(target) || target === root || !root.contains(target)
          || target.matches("caption, figcaption, details > summary")) return
        ev.preventDefault()
        this.selectElement(target)
      } 
      else if(ev.key === "ArrowUp" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowUp") {
        const firstRootElement = Array.from(getDocumentRoot().children).find(element => !isOutOfFlow(element))
        if(!ev.shiftKey && firstRootElement && !isEmptyParagraph(firstRootElement) && isCaretAtStartOf(firstRootElement)) {
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
    "pointerdown": ev => this.#handlePointerDown(ev),
    "pointerup": event => {
      if(event.pointerType === "touch" && event.isPrimary === false) return
      this.isInDragSelection = false
      if(getDocumentRoot().childNodes.length === 0) {
        $.selectDocumentStart()
        this.processSelection()
      }
    }
  }
}
