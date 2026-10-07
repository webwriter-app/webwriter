import {createRelativePositionFromJSON, relativePositionToJSON} from "yjs"
import {mediaElementSelector, isMediaType, mediaDefaultHTML} from "../media"
import {MATH_NAMESPACE} from "../math"
import {SVG_NAMESPACE, isGraphicShapeType} from "../graphic"
import {isSlide, slideLayoutRole} from "../document-layout"
import { DocumentListenerMap, EditorFeature } from "."
import { $, isAppendixInteraction, isWidgetShadowInteraction, isFormControlInteraction, isAtomicEditingElement, atomicEditingContainer, isOutOfFlow, flowSibling, clearEditorMarkerClasses, cloneRangeContents, cloneRangeIn, cloneWithoutEditorMarkers, captureRangeIdentity, getInertDocument, focusedWidgetHost, modifierKeyDown, getContainer, getIndexBefore, getSelectionAnchorBlock, getSelectionFocusBlock, getSidesOfPoint, isContentfulWidget, isElement, isOnApple } from "../utility"
import {isMarkElement} from "../marks"
import {
  isBlockFormatTag,
  type BlockFormatTag,
  type ElementStyleDeclaration,
  type ElementStyleMutation,
  type ElementStyleState,
  type FigureSelectionState,
  type HeadingGroupSelectionState,
  type RibbonDropPosition,
} from "../editor-bridge"
import {floatSideFromStyles, type FloatSide, paragraphStylePropertyNameSet} from "../element-styles"
import {isSectionElement, isSectionName, type SectionName} from "../sections"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {elementDragType, insertionMenuItems, ribbonInsertionDragType, ribbonInsertionAction, ribbonElementInsertionAction} from "../components/insertion-menu"
import {createTable} from "../table"
import {
  elementAttributeEditability,
  isUnsafeElementAttributeValue,
  sanitizeAuthoredClass,
} from "../element-attributes"

/** Unit by which a collapsed selection is extended before deleting. */
type Granularity = "character" | "word" | "line" | "block"

type FloatDropZone = {container: Element, parent: Element, side: "left" | "right", center: number, rect: DOMRect, allowed?: boolean}
type FloatDropTargets = {source: Element, key: Element | string, zones: FloatDropZone[], scrollX: number, scrollY: number, currentScrollX: number, currentScrollY: number}

type FloatPreviewMeasurements = {
  geometry: Map<Element, Partial<Record<"left" | "right", {rect: DOMRect, clears: boolean}>>>
  clearance: Map<Element, Map<Element, {left: number, right: number}>>
}

type ValidatedStyleEntry = {
  name: string
  value: string | null
  priority: "" | "important"
}

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
    const parent: Node | null = node.parentNode
    if(!parent) {
      return false
    }
    const siblings = Array.from(parent.childNodes) as ChildNode[]
    const index = siblings.indexOf(node as ChildNode)
    if(boundary === "start") {
      if(offset !== 0 || siblings.slice(0, index).some((sibling: ChildNode) => !isOutOfFlow(sibling) && (sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent))) {
        return false
      }
    }
    else {
      const length = node instanceof Text? node.length: node.childNodes.length
      if(offset !== length || siblings.slice(index + 1).some((sibling: ChildNode) => !isOutOfFlow(sibling) && (sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent))) {
        return false
      }
    }
    node = parent
    offset = boundary === "start"? index: index + 1
  }
  return node === element && Array.from(element.childNodes)
    .slice(boundary === "start" ? 0 : offset, boundary === "start" ? offset : undefined)
    .every(sibling => isOutOfFlow(sibling) || sibling.nodeType !== Node.ELEMENT_NODE && !sibling.textContent)
}

/** Editing feature implementing content manipulation: inserting, deleting,
 * wrapping and lifting nodes, clipboard interaction (copy/cut/paste), and
 * setting attributes or styles on the selected elements. All operations work
 * on the current selection (see `EditingSelection`/`$`). */
export class ManipulationFeature extends EditorFeature {

  private dragTarget: Element | null = null
  private dragSurface: HTMLDivElement | null = null
  private dragFrame: number | null = null
  private dragResizeObserver: ResizeObserver | null = null
  private dragMutationObserver: MutationObserver | null = null
  private readonly dragGeometryCleanup: (() => void)[] = []
  private nodeDrag: {element: Element, token: string} | null = null
  private originalDropSelection: Range | null = null
  private floatDropPreviewOwner: "transfer" | "transformation" | "insertion" | null = null
  private floatDropPreview: {container: Element, side: "left" | "right", rect: DOMRect} | null = null
  private floatDropHit: {container: Element, side: "left" | "right", rect: DOMRect} | null = null
  private floatDropTargets: FloatDropTargets | null = null
  private floatDropTargetsObserver: MutationObserver | null = null
  private floatDropTargetsResizeObserver: ResizeObserver | null = null
  private floatDropTargetsFrame: number | null = null
  private readonly floatDropTargetsCleanup: (() => void)[] = []
  private insertionHovered = false
  private insertionPreviewSource: Element | undefined
  private commandPlacement = false
  private ribbonDropInsertion = false
  private insertionPreviewObserver: MutationObserver | null = null
  private insertionPreviewResizeObserver: ResizeObserver | null = null
  private insertionPreviewTarget: Element | null = null
  private readonly dragType = "application/x-webwriter-node"

  /** A native draggable surface lives in the appendix, leaving authored
   * attributes (including an author's own draggable value) untouched. */
  refreshNodeDragTarget(element: Element | null) {
    if(this.nodeDrag) return
    if(!this.isEnabled || element === document.body || element === getDocumentRoot()
      || this.editor.features.canvas.active || this.editor.features.slides.active
      || isContentfulWidget(element, this.editor.schema)
      || !element?.isConnected || !getDocumentRoot().contains(element)) element = null
    if(element === this.dragTarget) {
      this.scheduleNodeDragPosition()
      return
    }
    this.clearNodeDragSurface()
    if(!element) return
    this.dragTarget = element
    const surface = document.createElement("div")
    surface.classList.add("◆", "◆editor-only")
    surface.setAttribute("part", "node-drag-surface")
    // Native dragging uses the border while text and table cells stay reachable.
    if(!isAtomicEditingElement(element, this.editor.schema)) {
      surface.style.clipPath = "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 4px 4px, 4px calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 4px, 4px 4px)"
    }
    surface.setAttribute("aria-hidden", "true")
    surface.contentEditable = "false"
    surface.draggable = true
    let captureOnClick = false
    surface.addEventListener("pointerdown", event => {
      captureOnClick = event.button === 0 && element === $.selectedElement
        && (Boolean(this.insertedWidget(element)) || element.namespaceURI === SVG_NAMESPACE && element.localName === "svg")
    })
    surface.addEventListener("click", event => {
      // The native mouse default can collapse the outer range before click.
      // Keep native dragging available and promote only a press on this live
      // widget or graphic surface that ended as a click rather than a drag.
      if(!captureOnClick || event.button !== 0 || this.nodeDrag || this.dragSurface !== surface
        || !getDocumentRoot().contains(element)) return
      captureOnClick = false
      this.editor.features.selection.captureElement(element)
      this.editor.postSelectionPath()
    })
    surface.addEventListener("pointercancel", () => { captureOnClick = false })
    surface.addEventListener("dragstart", event => { captureOnClick = false; this.startNodeDrag(event, element) })
    surface.addEventListener("dragend", () => this.endNodeDrag())
    surface.addEventListener("dragover", event => this.dragOver(event))
    surface.addEventListener("dragleave", event => this.dragLeave(event))
    surface.addEventListener("drop", event => this.drop(event))
    this.editor.addAppendix(surface)
    this.dragSurface = surface
    this.observeNodeDragGeometry(element)
    this.scheduleNodeDragPosition()
  }

  private observeNodeDragGeometry(element: Element) {
    const invalidate = () => this.scheduleNodeDragPosition()
    const view = document.defaultView
    const FrameMutationObserver = view?.MutationObserver
    if(FrameMutationObserver) {
      this.dragMutationObserver = new FrameMutationObserver(invalidate)
      this.dragMutationObserver.observe(document.body, {
        attributes: true, characterData: true, childList: true, subtree: true,
      })
    }
    const FrameResizeObserver = view?.ResizeObserver
    if(FrameResizeObserver) {
      this.dragResizeObserver = new FrameResizeObserver(invalidate)
      this.dragResizeObserver.observe(element)
      this.dragResizeObserver.observe(document.body)
      this.dragResizeObserver.observe(document.documentElement)
    }
    const add = (target: EventTarget | null | undefined, type: string, options?: AddEventListenerOptions | boolean) => {
      if(!target) return
      target.addEventListener(type, invalidate, options)
      this.dragGeometryCleanup.push(() => target.removeEventListener(type, invalidate, options))
    }
    add(view, "resize")
    add(document, "scroll", true)
    add(view?.visualViewport, "resize")
    add(view?.visualViewport, "scroll")
    add(document, "load", true)
    add(document, "transitionrun", true)
    add(document, "animationstart", true)
    add(document.fonts, "loadingdone")
  }

  private scheduleNodeDragPosition() {
    const element = this.dragTarget
    const surface = this.dragSurface
    if(!element || !surface || this.dragFrame !== null) return
    this.dragFrame = requestAnimationFrame(() => {
      this.dragFrame = null
      if(element !== this.dragTarget || surface !== this.dragSurface) return
      if(!element.isConnected || !getDocumentRoot().contains(element)) {
        if(this.nodeDrag) surface.style.display = "none"
        else this.endNodeDrag()
        return
      }
      const rect = element.getBoundingClientRect()
      Object.assign(surface.style, {
        left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
      })
      if(this.hasActiveNodeDragAnimation(element)) this.scheduleNodeDragPosition()
    })
  }

  private hasActiveNodeDragAnimation(element: Element) {
    for(let current: Element | null = element; current; current = current.parentElement) {
      if(current.getAnimations?.().some(animation => animation.playState === "running" || animation.pending)) return true
    }
    return false
  }

  private clearNodeDragSurface() {
    if(this.dragFrame !== null) cancelAnimationFrame(this.dragFrame)
    this.dragFrame = null
    this.dragResizeObserver?.disconnect()
    this.dragResizeObserver = null
    this.dragMutationObserver?.disconnect()
    this.dragMutationObserver = null
    this.dragGeometryCleanup.splice(0).forEach(cleanup => cleanup())
    this.dragSurface?.remove()
    this.dragSurface = null
    this.dragTarget = null
  }

  endNodeDrag(refresh=true) {
    this.clearDropSelection(refresh)
    this.nodeDrag = null
    this.clearFloatDropTargets()
    this.clearNodeDragSurface()
    if(refresh && this.isEnabled && !this.editor.features.selection.isCaptureSelection) this.refreshNodeDragTarget($.selectedElement ?? null)
  }

  private insertionGeneration = 0

  disable() {
    this.insertionGeneration++
    this.hoverInsertion(false)
    this.endNodeDrag(false)
    super.disable()
  }

  startNodeDrag(event: DragEvent, element: Element) {
    if(!this.isEnabled || event.defaultPrevented || !event.dataTransfer || element !== ($.selectedElement ?? this.editor.features.math.selectedMath)
      || !getDocumentRoot().contains(element) || element === getDocumentRoot()) {
      event.preventDefault()
      return
    }
    const fragment = getInertDocument(element).createDocumentFragment()
    fragment.append(cloneWithoutEditorMarkers(element, true, {inert: true}))
    const {html, text} = this.editor.serializeClipboardFragment(fragment, element instanceof HTMLElement ? element.innerText : undefined)
    const token = crypto.randomUUID()
    event.dataTransfer.setData("text/html", html)
    event.dataTransfer.setData("text/plain", text)
    event.dataTransfer.setData(this.dragType, token)
    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setDragImage?.(element, 0, 0)
    // Keep the source hit-testable: Chromium cancels native dragging if its
    // pointer-events becomes none during dragstart. Its own drop listeners
    // already handle hovering back over the source surface.
    this.nodeDrag = {element, token}
    this.prepareFloatDropTargets(element)
  }

  private acceptsDrop(event: DragEvent) {
    return !this.editor.isEditingLocked && !event.defaultPrevented
      && Boolean(event.dataTransfer && Array.from(event.dataTransfer.types)
        .some(type => ["text/html", "text/plain", this.dragType, elementDragType, ribbonInsertionDragType].includes(type)))
  }

  private ribbonDragTag(data: DataTransfer) {
    const action = data.getData(ribbonInsertionDragType)
    const tag = (action.startsWith("element:") ? action.slice("element:".length) : "")
      || data.getData(elementDragType) || Array.from(data.types).find(type => type.startsWith(`${elementDragType}-`))?.slice(elementDragType.length + 1)
    return insertionMenuItems.some(item => item.tag === tag) ? tag : null
  }

  private ribbonDropTarget(event: DragEvent) {
    if(this.editor.features.canvas.active) return document.body
    if(this.editor.features.slides.active) {
      const direct = event.target instanceof Node ? this.editor.features.slides.containingSlide(event.target) : null
      return direct ?? (document.elementsFromPoint?.(event.clientX, event.clientY) ?? [])
        .map(element => this.editor.features.slides.containingSlide(element)).find(Boolean) ?? null
    }
    return null
  }

  private ribbonSurfaceDrag(event: DragEvent) {
    return event.dataTransfer && Array.from(event.dataTransfer.types)
      .some(type => type === elementDragType || type === ribbonInsertionDragType)
  }

  private ribbonElement(tag: string): Element {
    if(tag === "table") return createTable(2, 2)
    if(tag === "ul" || tag === "ol") {
      const list = document.createElement(tag)
      const item = document.createElement("li")
      item.append(document.createElement("p"))
      list.append(item)
      return list
    }
    if(tag === "details") {
      const details = document.createElement("details")
      details.append(document.createElement("summary"))
      return details
    }
    if(isMediaType(tag)) {
      const template = document.createElement("template")
      template.innerHTML = mediaDefaultHTML(tag)
      return template.content.firstElementChild!
    }
    const element = this.editor.schema.create(tag) as Element
    if(tag === "math") element.append(this.editor.schema.create("math|mrow"))
    if(element instanceof SVGSVGElement) {
      element.setAttribute("viewBox", "0 0 1600 900")
      element.setAttribute("width", "100%")
    }
    return element
  }

  private dragOver(event: DragEvent) {
    if(!this.acceptsDrop(event)) return
    const ribbonTag = event.dataTransfer && this.ribbonDragTag(event.dataTransfer)
    const ribbonInsertion = event.dataTransfer && Array.from(event.dataTransfer.types).includes(ribbonInsertionDragType)
    if((ribbonTag || ribbonInsertion) && (this.editor.features.canvas.active || this.editor.features.slides.active)) {
      event.preventDefault()
      event.dataTransfer!.dropEffect = this.ribbonDropTarget(event) ? "copy" : "none"
      this.clearDropSelection(true)
      return
    }
    event.preventDefault()
    const source = this.nodeDrag?.element ?? (ribbonTag ? this.ribbonElement(ribbonTag) : ribbonInsertion ? this.insertionPreviewSource ?? document.createElement("div") : null)
    const floatContainer = source && this.floatDropTarget(event, source)
    const beginSelection = () => {
      if(!document.body.classList.contains("◆drop-selection-active")) {
        const selection = document.getSelection()
        this.originalDropSelection = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
      }
      document.body.classList.add("◆drop-selection-active")
    }
    if(floatContainer) {
      beginSelection()
      this.editor.features.selection.clearDropCaret(true)
      this.showFloatDropPreview(floatContainer, this.floatSide(floatContainer, event.clientX), "transfer",
        this.nodeDrag?.element ?? (ribbonTag ? source! : this.insertionPreviewSource))
    }
    else {
      const range = this.dropRange(event, ribbonTag || ribbonInsertion ? null : this.nodeDrag?.element ?? null)
      if(!range) {
        event.dataTransfer!.dropEffect = "none"
        this.clearDropSelection(true)
        return
      }
      beginSelection()
      this.editor.features.selection.selectDropRange(range)
      this.clearFloatDropPreview("transfer")
    }
    event.dataTransfer!.dropEffect = this.nodeDrag && !event.ctrlKey && !event.altKey ? "move" : "copy"
  }

  private dragLeave(event: DragEvent) {
    if(event.relatedTarget instanceof Node && (getDocumentRoot().contains(event.relatedTarget)
      || this.editor.appendix.contains(event.relatedTarget))) return
    if(event.target === document || event.target === document.body || event.target === document.documentElement
      || event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
      this.clearDropSelection(true)
    }
  }

  private clearDropSelection(restore=false) {
    const active = document.body.classList.contains("◆drop-selection-active")
    document.body.classList.remove("◆drop-selection-active")
    if(active) this.editor.features.selection.clearDropCaret()
    this.clearFloatDropPreview("transfer")
    const range = this.originalDropSelection
    this.originalDropSelection = null
    if(restore && range && getDocumentRoot().contains(range.startContainer)
      && getDocumentRoot().contains(range.endContainer)) {
      $.selectRange(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
      this.editor.features.selection.processSelection()
    }
  }

  /** Float placement is authored through the document theme's classes. */
  setFloat(element: Element, side: FloatSide) {
    if(this.editor.isEditingLocked || this.editor.features.canvas.active || this.editor.features.slides.active
      || !["left", "right", "none", "far-left", "far-right"].includes(side) || element === getDocumentRoot()
      || !getDocumentRoot().contains(element) || atomicEditingContainer(element.parentElement, this.editor.schema)) return false
    const style = this.inlineStyleOf(element)
    if(!style) return false
    const desired = side === "far-left" ? "left" : side === "far-right" ? "right" : side
    // Remove only declarations generated by earlier float commands. Explicit
    // authored sizes and unrelated presentation remain on the live element.
    const legacy = ["margin-left", "margin-right"].some(name => style.getPropertyValue(name).includes("var(--ww-float-outset"))
    if(style.width === "var(--ww-float-width)") style.removeProperty("width")
    const maximum = style.maxWidth
    const capped = /^min\((?:50%|var\(--ww-float-width\)), ([\s\S]+)\)$/.exec(maximum)
    if(capped) style.setProperty("max-width", capped[1], style.getPropertyPriority("max-width"))
    else if(maximum === "var(--ww-float-width)" || legacy && maximum === "50%") style.removeProperty("max-width")
    if(legacy) {
      for(const property of ["margin-top", "margin-bottom"]) if(style.getPropertyValue(property) === "5px") style.removeProperty(property)
      for(const property of ["margin-left", "margin-right"]) {
        if(/var\(--ww-float-(?:outset|spacing)/.test(style.getPropertyValue(property))) style.removeProperty(property)
      }
    }
    for(const property of ["float", "--ww-float-outset", "--ww-float-spacing"]) style.removeProperty(property)
    const width = style.getPropertyValue("inline-size") || style.width
    const size = style.getPropertyValue("--ww-float-size")
    if(desired === "none" || size === "min(100%, var(--ww-float-width), var(--ww-float-width))") style.removeProperty("--ww-float-size")
    if(desired !== "none" && !style.getPropertyValue("--ww-float-size") && width && width !== "auto") {
      style.setProperty("--ww-float-size", `min(100%, var(--ww-float-width), ${width})`)
    }
    element.classList.remove("ww-float-left", "ww-float-right", "ww-float-none")
    if(desired !== "none") element.classList.add(`ww-float-${desired}`)
    else {
      const computed = getComputedStyle(element).float
      if(computed && computed !== "none") element.classList.add("ww-float-none")
    }
    if(!element.classList.length) element.removeAttribute("class")
    if(!style.length) element.removeAttribute("style")
    return true
  }

  /** A gap drop returns to ordinary flow without float spacing. */
  clearDropFloat(element: Element) {
    const classPlacement = element.matches(".ww-float-left, .ww-float-right")
    if(!this.setFloat(element, "none")) return
    const style = this.inlineStyleOf(element)!
    if(!classPlacement) {
      for(const property of Array.from(style)) if(property === "margin" || property.startsWith("margin-")) style.removeProperty(property)
    }
    if(!style.length) element.removeAttribute("style")
  }

  floatContainer(node: Node, element?: Element): Element | null {
    if(this.editor.features.canvas.active || this.editor.features.slides.active) return null
    let container = atomicEditingContainer(node, this.editor.schema) ?? (node instanceof Element ? node : node.parentElement)
    while(container && isMarkElement(container)) container = container.parentElement
    const root = getDocumentRoot()
    return container && container !== root && root.contains(container) && !element?.contains(container)
      && container.parentElement && !atomicEditingContainer(container.parentElement, this.editor.schema) ? container : null
  }

  floatSide(container: Element, x: number): "left" | "right" {
    if(this.floatDropHit?.container === container) return this.floatDropHit.side
    const rect = container.getBoundingClientRect()
    return x < rect.left + rect.width / 2 ? "left" : "right"
  }

  floatDropTarget(event: MouseEvent, source: Element, range?: Range) {
    this.floatDropHit = null
    if(this.editor.features.canvas.active || this.editor.features.slides.active || source.namespaceURI === MATH_NAMESPACE) return null
    const root = getDocumentRoot()
    const key = source.isConnected ? source : source.outerHTML
    const contains = (rect: DOMRect) => event.clientX >= rect.left && event.clientX < rect.right
      && event.clientY >= rect.top && event.clientY < rect.bottom
    const valid = (container: Element) => root.contains(container) && container.parentElement
      && this.floatContainer(container, source) === container
      && (source.parentElement === container.parentElement
        || this.editor.schema.canInsert(container.parentElement, source, Array.from(container.parentElement.childNodes).indexOf(container)))
    const preview = this.floatDropPreview
    if(this.floatDropTargets?.key !== key) this.prepareFloatDropTargets(source)
    const targets = this.floatDropTargets
    if(!targets) return null
    const dx = targets.scrollX - targets.currentScrollX, dy = targets.scrollY - targets.currentScrollY
    // Hover only checks stored rectangles. It never measures a template or
    // changes a measurement element's styles.
    const hits = targets.zones.filter(zone => event.clientX >= zone.rect.left + dx && event.clientX < zone.rect.right + dx
      && event.clientY >= zone.rect.top + dy && event.clientY < zone.rect.bottom + dy)
    const preferred = (zone: FloatDropZone) => preview?.container === zone.container ? preview.side
      : event.clientX < zone.center + dx ? "left" : "right"
    hits.sort((a, b) => b.rect.top - a.rect.top || Number(b.side === preferred(b)) - Number(a.side === preferred(a)))
    for(const zone of hits) {
      if(zone.container.parentElement !== zone.parent || !root.contains(zone.container)) continue
      zone.allowed ??= valid(zone.container) ? true : false
      if(!zone.allowed || event.type === "drop" && !valid(zone.container)) continue
      const rect = new DOMRect(zone.rect.left + dx, zone.rect.top + dy, zone.rect.width, zone.rect.height)
      this.floatDropHit = {container: zone.container, side: zone.side, rect}
      return zone.container
    }
    // An explicitly shown insertion preview can also cover a projected area
    // whose anchor has no current layout box. It is a fallback, never a latch
    // that masks newer anchors while moving down the page.
    if(preview && contains(preview.rect) && valid(preview.container)) {
      this.floatDropHit = preview
      return preview.container
    }
    return null
  }

  /** Capture projected geometry once at gesture start (or the first editor
   * entry of a ribbon drag). Rebuilds are scheduled outside pointer handlers. */
  prepareFloatDropTargets(source: Element) {
    this.clearFloatDropTargets()
    if(this.editor.features.canvas.active || this.editor.features.slides.active || source.namespaceURI === MATH_NAMESPACE) return
    const root = getDocumentRoot(), candidates: Element[] = []
    const pending = Array.from(root.children).reverse()
    while(pending.length) {
      const element = pending.pop()!
      if(source.contains(element)) continue
      if((!isSectionElement(element) || Array.from(element.childNodes).some(child => child instanceof Text && child.textContent?.trim()))
        && this.floatContainer(element, source) === element) candidates.push(element)
      const atomic = Boolean(isAtomicEditingElement(element, this.editor.schema))
      if(!atomic) for(let index = element.children.length - 1; index >= 0; index--) pending.push(element.children[index])
    }
    const measurement = document.createElement("div")
    measurement.style.cssText = "position:fixed;visibility:hidden;pointer-events:none"
    this.editor.addAppendix(measurement)
    const measurements: FloatPreviewMeasurements = {geometry: new Map(), clearance: new Map()}
    const zones: FloatDropZone[] = []
    const parentPermissions = new Map<Element, boolean>()
    try {
      for(const container of candidates) {
        const bounds = container.getBoundingClientRect()
        if(!container.parentElement || !bounds.width || !bounds.height) continue
        const parent = container.parentElement
        let allowed = source.parentElement === parent ? true : parentPermissions.get(parent)
        if(allowed === undefined) {
          allowed = this.editor.schema.canInsert(parent, source, Array.from(parent.childNodes).indexOf(container))
          // A simple group rule consumes the same nodes at every index; its
          // insertion permission is shared by all sibling anchors.
          const rule = this.editor.schema.get(parent).content
          if(rule && "group" in rule) parentPermissions.set(parent, allowed)
        }
        for(const side of ["left", "right"] as const) zones.push({container, parent: container.parentElement, side, center: bounds.left + bounds.width / 2,
          allowed, rect: this.floatPreviewRect(container, side, measurement, source, measurements)})
      }
    }
    finally { measurement.remove() }
    const scrollX = window.scrollX, scrollY = window.scrollY
    this.floatDropTargets = {source, key: source.isConnected ? source : source.outerHTML, zones, scrollX, scrollY, currentScrollX:scrollX, currentScrollY:scrollY}
    const schedule = () => {
      if(this.floatDropTargetsFrame !== null) return
      this.floatDropTargetsFrame = requestAnimationFrame(() => {
        this.floatDropTargetsFrame = null
        const current = this.floatDropTargets
        if(current) {
          this.floatDropPreview = null
          this.floatDropHit = null
          this.prepareFloatDropTargets(current.source)
        }
      })
    }
    const authoredClasses = (value: string | null) => (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
    this.floatDropTargetsObserver = new MutationObserver(records => {
      if(records.some(record => {
        if(record.type !== "attributes") return true
        const value = (record.target as Element).getAttribute(record.attributeName!)
        return record.attributeName === "class" ? authoredClasses(record.oldValue) !== authoredClasses(value) : record.oldValue !== value
      })) schedule()
    })
    this.floatDropTargetsObserver.observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeOldValue:true})
    let initialResize = true
    this.floatDropTargetsResizeObserver = new ResizeObserver(() => {
      if(initialResize) initialResize = false
      else schedule()
    })
    this.floatDropTargetsResizeObserver.observe(root)
    const add = (target: EventTarget | null | undefined, type: string, listener: EventListener, capture = false) => {
      if(!target) return
      target.addEventListener(type, listener, capture)
      this.floatDropTargetsCleanup.push(() => target.removeEventListener(type, listener, capture))
    }
    add(window, "resize", schedule)
    add(document, "load", schedule, true)
    add(document, "scroll", event => {
      const current = this.floatDropTargets
      if(event.target !== document) schedule()
      else if(current) { current.currentScrollX = window.scrollX; current.currentScrollY = window.scrollY }
    }, true)
    add(document.fonts, "loadingdone", schedule)
  }

  clearFloatDropTargets() {
    if(this.floatDropTargetsFrame !== null) cancelAnimationFrame(this.floatDropTargetsFrame)
    this.floatDropTargetsFrame = null
    this.floatDropTargetsObserver?.disconnect()
    this.floatDropTargetsObserver = null
    this.floatDropTargetsResizeObserver?.disconnect()
    this.floatDropTargetsResizeObserver = null
    for(const cleanup of this.floatDropTargetsCleanup.splice(0)) cleanup()
    this.floatDropTargets = null
    this.floatDropHit = null
  }

  placeFloat(element: Element, container: Element, side: "left" | "right" | "none", placement: "before" | "after" = "before") {
    if(this.editor.isEditingLocked || !container.isConnected || this.floatContainer(container, element) !== container) return false
    container[placement](element)
    this.setFloat(element, side)
    return true
  }

  /** A fixed appendix overlay shared by native transfer and transformation
   * drags. Ownership prevents selection cleanup in one path from flickering a
   * preview currently maintained by the other. */
  showFloatDropPreview(container: Element, side: "left" | "right", owner: "transfer" | "transformation" | "insertion", source?: Element) {
    if(!container.isConnected || !container.parentElement || !getDocumentRoot().contains(container)
      || this.editor.features.canvas.active || this.editor.features.slides.active) {
      this.clearFloatDropPreview(owner)
      return
    }
    const existing = this.editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")
    const overlay = existing ?? document.createElement("div")
    if(!existing) {
      overlay.id = "◆float-drop-preview"
      overlay.setAttribute("aria-hidden", "true")
      overlay.contentEditable = "false"
      this.editor.addAppendix(overlay)
    }
    this.floatDropPreviewOwner = owner
    overlay.setAttribute("part", `float-drop-preview float-drop-preview-${side}${owner === "insertion" ? " insertion-preview" : ""}`)
    overlay.hidden = false
    const rect = this.floatDropHit?.container === container && this.floatDropHit.side === side
      ? this.floatDropHit.rect : this.floatPreviewRect(container, side, overlay, source)
    this.floatDropPreview = {container, side, rect}
    Object.assign(overlay.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
  }

  private floatPreviewRect(container: Element, side: "left" | "right", overlay: HTMLElement, source?: Element,
    measurements: FloatPreviewMeasurements = {geometry: new Map(), clearance: new Map()}) {
    const rect = container.getBoundingClientRect(), parent = container.parentElement!
    const singleLane = document.documentElement.clientWidth >= 600 && document.documentElement.clientWidth < 1200
    const physicalSide = singleLane ? "right" : side
    const cached = measurements.geometry.get(parent)?.[side]
    if(cached) return new DOMRect(cached.rect.left, this.floatPreviewTop(container, physicalSide, source, cached.clears, measurements), cached.rect.width, cached.rect.height)
    const body = document.body.getBoundingClientRect(), bodyStyle = getComputedStyle(document.body)
    const parentRect = parent.getBoundingClientRect(), parentStyle = getComputedStyle(parent)
    const number = (value: string) => parseFloat(value) || 0
    const probe = overlay.appendChild(document.createElement("div"))
    probe.style.cssText = "visibility:hidden;position:fixed;height:0;box-sizing:border-box;pointer-events:none"
    const pixels = (value: string, fallback: number) => {
      probe.style.width = value
      return probe.getBoundingClientRect().width || number(getComputedStyle(probe).width) || fallback
    }
    try {
      const themed = Boolean(bodyStyle.getPropertyValue("--ww-float-width"))
      const wide = themed && document.documentElement.clientWidth >= 1200
      const lanes = themed && (wide || singleLane)
      const laneWidth = pixels("var(--ww-float-width)", 256), lane = laneWidth + pixels("var(--ww-float-gap)", 16)
      const currentLane = pixels("var(--ww-lane, 0px)", 0)
      const pageLeft = body.left + number(bodyStyle.paddingLeft) - (singleLane ? 0 : currentLane)
      const pageRight = body.right - number(bodyStyle.paddingRight) + currentLane
      let left = parentRect.left + number(parentStyle.borderLeftWidth) + number(parentStyle.paddingLeft)
      let right = parentRect.right - number(parentStyle.borderRightWidth) - number(parentStyle.paddingRight)
      if(themed && body.width > 0) {
        const columnLeft = pageLeft + (wide ? lane : 0), columnRight = pageRight - (lanes ? lane : 0)
        if(parent === document.body || parent.parentElement === document.body && parent.matches("main, article, section")) {
          left = columnLeft + number(parentStyle.paddingLeft) * Number(parent !== document.body)
          right = columnRight - number(parentStyle.paddingRight) * Number(parent !== document.body)
        }
        else if(right - left > columnRight - columnLeft) {
          const center = (left + right) / 2
          left = center - (columnRight - columnLeft) / 2
          right = center + (columnRight - columnLeft) / 2
        }
      }
      if(right <= left) { left = rect.left; right = rect.right }
      const available = Math.max(1, right - left)
      overlay.style.width = `${available}px`
      probe.style.position = "static"
      const inline = (source as HTMLElement | undefined)?.style
      const authoredWidth = inline?.getPropertyValue("inline-size") || inline?.width
      const preferred = inline?.getPropertyValue("--ww-float-size") || `min(100%, var(--ww-float-width, 256px), ${authoredWidth && authoredWidth !== "auto" ? authoredWidth : "var(--ww-float-width, 256px)"})`
      let width = pixels(preferred, Math.min(available, number(inline?.width ?? "") || source?.getBoundingClientRect().width || laneWidth))
      const maximum = inline?.getPropertyValue("max-inline-size") || inline?.maxWidth || "none"
      probe.style.maxWidth = maximum
      width = probe.getBoundingClientRect().width || Math.min(width, number(maximum) || Infinity)
      let height = 0
      if(source?.isConnected) {
        const initial = source.getBoundingClientRect()
        height = initial.height
        if(initial.width && !inline?.height && !inline?.getPropertyValue("block-size") && source.matches("picture, img, video, svg")) {
          const style = getComputedStyle(source), ratio = style.aspectRatio.split("/").map(number)
          const image = source instanceof HTMLImageElement && source.naturalWidth && source.naturalHeight ? source : null
          height = width * (ratio[0] && ratio[1] ? ratio[1] / ratio[0] : image ? image.naturalHeight / image.naturalWidth : initial.height / initial.width)
          height = Math.max(number(style.minHeight), Math.min(height, number(style.maxHeight) || Infinity))
        }
      }
      else if(source && insertionMenuItems.some(item => item.tag === source.localName)) {
        // Only built-in, resource-free insertion templates are measured here.
        // The shadow context shares the document's CSS without touching its DOM.
        const shadow = probe.attachShadow({mode:"open"})
        shadow.adoptedStyleSheets = document.adoptedStyleSheets
        const context = document.createElement("body")
        context.style.cssText = `display:flow-root!important;inline-size:${available}px!important;max-inline-size:none!important;min-block-size:0!important;margin:0!important;padding:0!important;border:0!important`
        const measured = source.cloneNode(true) as HTMLElement
        measured.style.cssText += `;float:${side};--ww-float-size:${width}px;inline-size:${width}px!important;margin:0!important`
        if(measured.matches("picture, img, video, iframe, embed, object")) measured.classList.add("◆media-empty")
        context.append(measured)
        shadow.append(context)
        height = measured.getBoundingClientRect().height
      }
      if(!height) height = width * 9 / 16
      const result = new DOMRect(lanes ? physicalSide === "left" ? left - lane : right + lane - width
        : themed ? (left + right - width) / 2 : side === "left" ? left : right - width,
        this.floatPreviewTop(container, physicalSide, source, lanes || !themed, measurements), width, height)
      // Siblings share the parent's width and the source's initial dimensions.
      // Resolve CSS lengths once per side/parent, rather than forcing layout for
      // every possible anchor in a long document.
      if(parentRect.width) {
        const geometry = measurements.geometry.get(parent) ?? {}
        geometry[side] = {rect: result, clears: lanes || !themed}
        measurements.geometry.set(parent, geometry)
      }
      return result
    }
    finally { probe.remove() }
  }

  private floatPreviewTop(container: Element, side: "left" | "right", source: Element | undefined, clears: boolean, measurements: FloatPreviewMeasurements) {
    const parent = container.parentElement!, rect = container.getBoundingClientRect()
    const number = (value: string) => parseFloat(value) || 0
    let top = rect.top + 5
    if(source?.parentElement === parent && source.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING
      && source.getBoundingClientRect().bottom <= rect.top
      && getComputedStyle(source).float === "none" && !isOutOfFlow(source)) {
      const style = getComputedStyle(source)
      top -= source.getBoundingClientRect().height + number(style.marginTop) + number(style.marginBottom)
    }
    if(clears) {
      let clearance = measurements.clearance.get(parent)
      if(!clearance) {
        clearance = new Map()
        const bottom = {left: -Infinity, right: -Infinity}
        for(const sibling of Array.from(parent.children)) {
          clearance.set(sibling, {...bottom})
          if(sibling === source) continue
          const style = getComputedStyle(sibling), float = style.float
          if(float === "left" || float === "right") bottom[float] = Math.max(bottom[float], sibling.getBoundingClientRect().bottom + number(style.marginBottom) + 5)
        }
        measurements.clearance.set(parent, clearance)
      }
      top = Math.max(top, clearance.get(container)?.[side] ?? -Infinity)
    }
    return top
  }

  clearFloatDropPreview(owner: "transfer" | "transformation" | "insertion", keep = false) {
    if(this.floatDropPreviewOwner !== owner) return
    if(!keep) { this.floatDropPreview = null; this.floatDropHit = null }
    const preview = this.editor.appendix.querySelector<HTMLElement>("#◆float-drop-preview")
    if(keep && preview) preview.hidden = true
    else {
      preview?.remove()
      this.floatDropPreviewOwner = null
    }
  }

  private floatInsertionContainer(element?: Element, allowEmpty = false) {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.isCollapsed || $.isGapSelection
      || this.editor.features.canvas.active || this.editor.features.slides.active) return null
    const container = this.floatContainer(selection.getRangeAt(0).startContainer, element)
    return container && !container.matches("details > summary") && (this.isTextBlock(container) || isSectionElement(container) && this.editor.schema.isBlock(container)
      && Array.from(container.childNodes).some(child => child instanceof Text || isElement(child) && isMarkElement(child)))
      && (allowEmpty || container.localName !== "p" || Boolean(container.textContent?.trim())) ? container : null
  }

  private insertFloat(node: Node, side: "left" | "right" = "right", allowEmpty = false, anyBlock = false) {
    if(this.ribbonDropInsertion) return false
    const nodes = node instanceof DocumentFragment ? Array.from(node.childNodes) : null
    const element = node instanceof DocumentFragment && (node.childNodes.length === 1 || anyBlock && node.children.length === 1
      && Array.from(node.childNodes).every(child => isElement(child) || child.nodeType === Node.COMMENT_NODE || child instanceof Text && !child.data.trim()))
      ? node.firstElementChild : node
    if(!isElement(element) || element.namespaceURI === MATH_NAMESPACE
      || !(element.matches(mediaElementSelector) || this.insertedWidget(element) && !isContentfulWidget(element, this.editor.schema)
        || anyBlock && !this.editor.schema.isPhrasing(element) && this.editor.schema.get(element).group?.includes("flow"))) return false
    const container = this.floatInsertionContainer(element, allowEmpty)
    if(!container) return false
    if(anyBlock && !element.matches(mediaElementSelector) && !this.insertedWidget(element)
      && !this.editor.schema.canInsert(container.parentElement!, element, Array.from(container.parentElement!.childNodes).indexOf(container))) return false
    if(!this.placeFloat(element, container, side)) return false
    if(nodes && anyBlock) container.before(...nodes)
    if(this.insertedWidget(element)) this.editor.features.selection.captureElement(element)
    else $.selectElement(element)
    this.editor.postSelectionPath(true)
    return true
  }

  private hoverInsertion(hovered: boolean, tag?: string) {
    this.insertionPreviewSource = hovered && tag && insertionMenuItems.some(item => item.tag === tag) ? this.ribbonElement(tag) : undefined
    this.insertionHovered = hovered && this.isEnabled && !this.editor.isEditingLocked
    if(this.insertionHovered && !this.insertionPreviewObserver) {
      this.insertionPreviewObserver = new MutationObserver(() => this.refreshInsertionPreview())
      this.insertionPreviewObserver.observe(document.body, {subtree: true, childList: true, attributes: true})
      this.insertionPreviewResizeObserver = new ResizeObserver(() => this.refreshInsertionPreview())
      this.insertionPreviewResizeObserver.observe(document.body)
    }
    if(!this.insertionHovered) {
      this.insertionPreviewObserver?.disconnect()
      this.insertionPreviewObserver = null
      this.insertionPreviewResizeObserver?.disconnect()
      this.insertionPreviewResizeObserver = null
      this.insertionPreviewTarget = null
    }
    this.refreshInsertionPreview()
  }

  private insertionReplacement() {
    let target = this.editor.features.selection.captureSelectedElement ?? $.selectedElement
    if(!target && document.getSelection()?.isCollapsed) {
      const paragraph = $.anchorContainer
      const empty = (node: Node): boolean => node instanceof Text ? !node.data.trim()
        : isElement(node) && !node.hasAttribute("is") && (node.localName === "br"
          || isMarkElement(node) && Array.from(node.childNodes).every(empty))
      if(paragraph?.localName === "p" && !paragraph.hasAttribute("is")
        && Array.from(paragraph.childNodes).every(empty)) target = paragraph
    }
    return target?.isConnected && getDocumentRoot().contains(target) && target !== getDocumentRoot() && target !== document.body ? target : null
  }

  private refreshInsertionPreview() {
    const active = this.insertionHovered && !this.editor.isEditingLocked && document.getSelection()?.rangeCount
    const target = active ? this.insertionReplacement() ?? ($.isDocumentSelection ? getDocumentRoot() : null) : null
    const gap = Boolean(active && !target)
    const measured = target
    if(measured !== this.insertionPreviewTarget) {
      if(this.insertionPreviewTarget) this.insertionPreviewResizeObserver?.unobserve(this.insertionPreviewTarget)
      if(measured) this.insertionPreviewResizeObserver?.observe(measured)
      this.insertionPreviewTarget = measured
    }
    if(document.body.classList.contains("◆insertion-gap-preview") !== gap) document.body.classList.toggle("◆insertion-gap-preview", gap)
    let overlay = this.editor.appendix.querySelector<HTMLElement>("#◆insertion-preview")
    if(target) {
      this.clearFloatDropPreview("insertion")
      if(!overlay) {
        overlay = document.createElement("div")
        overlay.id = "◆insertion-preview"
        overlay.setAttribute("part", "insertion-preview")
        overlay.setAttribute("aria-hidden", "true")
        this.editor.addAppendix(overlay)
      }
      const rect = target.getBoundingClientRect()
      Object.assign(overlay.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
    }
    else {
      overlay?.remove()
      this.clearFloatDropPreview("insertion")
    }
  }

  /** Element insertion replaces a selected host or an empty paragraph. */
  private replaceInsertionElement(node: Node) {
    const target = this.insertionReplacement()
    const nodes = node instanceof DocumentFragment ? Array.from(node.childNodes) : [node]
    if(target !== this.editor.features.selection.captureSelectedElement && target !== $.selectedElement
      && !nodes.some(isElement)) return false
    if(!target || !nodes.length || !target.parentElement
      || nodes.some(child => target.contains(child) || child.contains(target))) return false
    const children = Array.from(target.parentElement.childNodes)
    children.splice(children.indexOf(target), 1, ...nodes as ChildNode[])
    if(!this.editor.schema.isContentValid(target.parentElement, children)) return false
    const elements = nodes.filter(isElement)
    const replacement = elements.length === 1 && nodes.every(child => isElement(child)
      || child.nodeType === Node.COMMENT_NODE || child instanceof Text && !child.data.trim()) ? elements[0] : null
    const style = this.inlineStyleOf(target)
    const float = floatSideFromStyles(getComputedStyle(target).float, style ?? {getPropertyValue: () => ""}, target.classList)
    const floatSize = style?.getPropertyValue("--ww-float-size")
    const maximum = style?.getPropertyValue("max-width")
    const maximumPriority = style?.getPropertyPriority("max-width")
    this.withNormalization(() => {
      target.replaceWith(...nodes)
      if(replacement && float !== "none" && this.setFloat(replacement, float) && (floatSize || maximum)) {
        this.setElementStyles(replacement, {
          ...(floatSize ? {"--ww-float-size": floatSize} : {}),
          ...(maximum ? {"max-width": {value: maximum, priority: maximumPriority === "important" ? "important" as const : "" as const}} : {}),
        })
      }
      const last = nodes.at(-1)!
      const widget = nodes.length === 1 ? this.insertedWidget(last) : null
      if(widget) this.editor.features.selection.captureElement(widget)
      else if(nodes.length === 1 && isElement(last)) $.selectElement(last)
      else this.moveAfterInsertedNode(last)
    })
    this.editor.postSelectionPath(true)
    return true
  }

  private moveCommandInsertionOutsideFloat() {
    const root = getDocumentRoot()
    let target: Element | null = null
    for(let element = $.anchorContainer; element && element !== root; element = element.parentElement) {
      if(floatSideFromStyles(getComputedStyle(element).float, this.inlineStyleOf(element) ?? {getPropertyValue: () => ""}, element.classList) !== "none") target = element
    }
    if(target?.parentElement && root.contains(target)) $.move(target.parentElement, Array.from(target.parentElement.childNodes).indexOf(target) + 1)
  }

  dropRange(event: MouseEvent, source: Element | null) {
    if(source && !getDocumentRoot().contains(source)) return null
    const float = source && this.floatDropTarget(event, source)
    if(float) {
      const range = document.createRange()
      range.selectNodeContents(float)
      range.collapse(true)
      return range
    }
    if(source && event.target instanceof Node && source.contains(event.target)) return null
    // Overlays such as the selected element's drag surface cover authored
    // content, which native hit testing would otherwise resolve to the appendix.
    // Bound the hit test to the editing root so its geometry fallback also
    // resolves blank space when media leaves no native text caret to hit.
    const root = getDocumentRoot()
    const point = this.editor.hitTestBeneathAppendix(() => $.pointFromCoords(
      event.clientX, event.clientY, event.target, this.editor.schema, root, root,
    ))
    if(!point || !getDocumentRoot().contains(point.node)) return null
    const range = document.createRange()
    if(source?.contains(point.node)) return null
    range.setStart(point.node, point.offset)
    range.collapse(true)
    if(source && source.namespaceURI !== MATH_NAMESPACE && !this.editor.schema.isPhrasing(source)) {
      let block = getContainer(point.node)
      while(block !== getDocumentRoot() && this.editor.schema.isPhrasing(block) && block.parentElement) block = block.parentElement
      if(this.isTextBlock(block) && !this.editor.schema.canInsert(block, source, block.childNodes.length)) {
        const rect = block.getBoundingClientRect()
        if(event.clientY < rect.top + rect.height / 2) range.setStartBefore(block)
        else range.setStartAfter(block)
        range.collapse(true)
      }
    }
    return source?.contains(range.startContainer) ? null : range
  }

  private ribbonDropPosition(event: DragEvent): RibbonDropPosition | null {
    const target = this.ribbonDropTarget(event)
    if(this.editor.features.slides.active && !target) return null
    const tag = event.dataTransfer && this.ribbonDragTag(event.dataTransfer)
    const source = tag ? this.ribbonElement(tag) : this.insertionPreviewSource ?? document.createElement("div")
    const float = !target && this.floatDropTarget(event, source)
    const range = target ? null : float ? document.createRange() : this.dropRange(event, null)
    if(float && range) { range.setStartBefore(float); range.collapse(true) }
    if(!target && !range) return null
    this.editor.doc.syncFromDOM()
    const anchor = this.editor.doc.relativePositionFromDOMPoint(target ?? range!.startContainer, target ? 0 : range!.startOffset)
    if(!anchor) return null
    if(!target) return {anchor: relativePositionToJSON(anchor), layout: "document", ...(float ? {float: this.floatSide(float, event.clientX)} : {})}
    const point = target === document.body ? this.editor.features.canvas.clientPoint(event.clientX, event.clientY)
      : {x: event.clientX - target.getBoundingClientRect().left + target.scrollLeft,
        y: event.clientY - target.getBoundingClientRect().top + target.scrollTop}
    return {anchor: relativePositionToJSON(anchor), layout: target === document.body ? "canvas" : "slides", ...point}
  }

  private placeRibbonElements(elements: Element[], target: HTMLElement, point: {x: number, y: number}) {
    const placed = elements.map(element => {
      if(element.namespaceURI !== MATH_NAMESPACE) return element
      const paragraph = document.createElement("p")
      paragraph.append(element)
      return paragraph
    })
    let offset = 0
    for(const element of placed) {
      if(element instanceof HTMLElement || element instanceof SVGSVGElement) {
        const left = placed.length > 1 && element.style.position === "absolute" ? parseFloat(element.style.left) || 0 : 0
        const top = placed.length > 1 && element.style.position === "absolute" ? parseFloat(element.style.top) || 0 : offset
        Object.assign(element.style, {position: "absolute", left: `${point.x + left}px`, top: `${point.y + top}px`, right: "auto", bottom: "auto"})
        if(!element.style.width && !element.matches("p:not([is])")) element.style.width = "320px"
      }
      if(element.parentElement !== target) target.append(element)
      offset += element.getBoundingClientRect().height / (target === document.body ? this.editor.features.canvas.zoom : 1) + 24
    }
    const rects = placed.map(element => element.getBoundingClientRect())
    const center = {x: (Math.min(...rects.map(rect => rect.left)) + Math.max(...rects.map(rect => rect.right))) / 2,
      y: (Math.min(...rects.map(rect => rect.top)) + Math.max(...rects.map(rect => rect.bottom))) / 2}
    const local = target === document.body ? this.editor.features.canvas.clientPoint(center.x, center.y)
      : {x: center.x - target.getBoundingClientRect().left + target.scrollLeft,
        y: center.y - target.getBoundingClientRect().top + target.scrollTop}
    for(const element of placed) {
      if(element instanceof HTMLElement || element instanceof SVGSVGElement) {
        element.style.left = `${parseFloat(element.style.left) + point.x - local.x}px`
        element.style.top = `${parseFloat(element.style.top) + point.y - local.y}px`
      }
    }
    return placed
  }

  /** Drop placement changes the insertion point and geometry; the existing
   * commands retain ownership of their element-specific editing selection. */
  private insertAtRibbonDrop(position: RibbonDropPosition, insert: () => void) {
    if(!this.isEnabled || this.editor.isEditingLocked) return false
    let point: ReturnType<typeof this.editor.doc.domPointFromRelativePosition>
    try { point = this.editor.doc.domPointFromRelativePosition(createRelativePositionFromJSON(position.anchor as Parameters<typeof createRelativePositionFromJSON>[0])) }
    catch { return false }
    const layout = this.editor.features.canvas.active ? "canvas" : this.editor.features.slides.active ? "slides" : "document"
    if(!point || position.layout !== layout) return false
    const target = layout === "document" ? null : point.node
    if(target && (!(target instanceof HTMLElement) || !(layout === "canvas" ? target === document.body : isSlide(target))
      || !Number.isFinite(position.x) || !Number.isFinite(position.y))) return false
    const end = this.editor.doc.beginUndoGroup()
    return this.editor.features.selection.withoutSelectionScroll(() => {
      try {
        const floatTarget = position.float && point.node.childNodes[point.offset]
        const floatParent = floatTarget instanceof Element && this.floatContainer(floatTarget) === floatTarget ? floatTarget.parentElement : null
        const before = target ? Array.from(target.childNodes) : floatParent ? Array.from(floatParent.childNodes) : []
        const range = document.createRange()
        range.setStart(point.node, target ? target.childNodes.length : point.offset)
        range.collapse(true)
        this.editor.features.selection.selectDropRange(range, {scrollIntoView: false})
        const previousPlacement = this.commandPlacement
        this.commandPlacement = Boolean(position.float)
        this.ribbonDropInsertion = true
        try { insert() }
        finally { this.ribbonDropInsertion = false; this.commandPlacement = previousPlacement }
        if(floatParent && floatTarget instanceof Element && floatTarget.parentElement === floatParent) {
          const added = Array.from(floatParent.children).filter(element => !before.includes(element))
          if(added.length === 1) this.setFloat(added[0], position.float!)
        }
        this.editor.features.selection.processSelection()
        this.editor.features.math.refresh()
        if(target instanceof HTMLElement) {
          const added = Array.from(target.children).filter(element => !before.includes(element))
          if(!added.length) return false
          this.placeRibbonElements(added, target, {x: position.x!, y: position.y!})
          this.editor.features.selection.processSelection()
        }
        return true
      }
      finally { end() }
    })
  }

  private async insertRibbonDrop(html: string, position: RibbonDropPosition) {
    if(this.editor.isEditingLocked) return false
    const generation = this.insertionGeneration
    const migrated = this.editor.features.migration.needsMigration(html) ? await this.editor.features.migration.migrate(html) : html
    if(migrated === null || generation !== this.insertionGeneration || this.editor.isEditingLocked) return false
    return this.insertAtRibbonDrop(position, () => {
      if(position.layout === "document") this.insertHTML(migrated, false, false)
      else {
        // Freeform roots have no flow content model to repair. Keep saved
        // valid nesting and comments intact while applying import sanitization.
        const {fragment} = this.editor.parseHTMLFragment(migrated, false, false)
        this.insertClipboardFragment(fragment)
      }
    })
  }

  /** Create an independent text root before applying text formatting,
   * so a drop does not reformat the existing paragraph under its caret. */
  private insertRibbonTextRoot() {
    const paragraph = document.createElement("p")
    this.insert(paragraph)
    if(paragraph.isConnected) $.move(paragraph)
    return paragraph.isConnected
  }

  /** Converts the live selection before falling back to ordinary insertion.
   * Validate the exact split on an inert DOM first, so unsupported shapes
   * leave authored content untouched. A claimed but invalid conversion is
   * handled as a no-op rather than replacing the selection. */
  convertInsertion(tag: string) {
    const wrapping = tag === "details" || isSectionName(tag)
    if((!wrapping && !/^(p|h[1-6]|ul|ol|table)$/.test(tag))
      || this.ribbonDropInsertion || this.editor.features.canvas.active || this.editor.features.slides.active) return false
    const selection = document.getSelection()
    if(!selection?.rangeCount || this.editor.isEditingLocked) return false
    const range = selection.getRangeAt(0).cloneRange()
    const root = getDocumentRoot()
    if($.excludedFlowElements.length && !$.selectedElement && !this.editor.features.selection.captureSelectedElement) return true
    if(!root.contains(range.startContainer) || !root.contains(range.endContainer)
      || atomicEditingContainer(range.startContainer, this.editor.schema)
      || atomicEditingContainer(range.endContainer, this.editor.schema)) return true

    if(/^h[1-6]$/.test(tag) && (getContainer(range.startContainer).closest("li, dt, dd")
      || getContainer(range.endContainer).closest("li, dt, dd"))) return true
    const captured = this.editor.features.selection.captureSelectedElement
    if(range.collapsed && !captured && this.insertionReplacement()) return false
    if(captured) range.selectNode(captured)
    else if(range.collapsed) {
      let container = getContainer(range.startContainer)
      if(!wrapping && (!/^(p|h[1-6])$/.test(tag) || !container.matches("p, h1, h2, h3, h4, h5, h6"))) {
        container = container.closest("ul, ol, table") ?? container
      }
      if(container === root || container === document.body || !container.parentElement) return false
      range.selectNode(container)
    }
    // Never split a widget host through a text range. Whole hosts can be
    // wrapped in disclosures without touching their internals.
    for(const element of root.querySelectorAll("*")) {
      if(!isAtomicEditingElement(element, this.editor.schema) || !range.intersectsNode(element)) continue
      const nodeRange = document.createRange()
      nodeRange.selectNode(element)
      if(range.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0
        || range.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0) return true
    }
    const preview = cloneRangeContents(range)
    if(preview.childNodes.length === 1 && preview.firstElementChild?.localName === tag) return true
    if(!wrapping && Array.from(preview.childNodes).some(node => isElement(node)
      && !node.matches("p, h1, h2, h3, h4, h5, h6, ul, ol, table")
      && !this.isInlineClipboardNode(node))) return false

    const convert = (fragment: DocumentFragment) => {
      const owner = fragment.ownerDocument
      const output = owner.createDocumentFragment()
      const make = (name: string, source?: Element) => {
        const element = owner.createElement(name)
        if(source) this.copyAuthoredAttributes(source, element)
        return element
      }
      if(wrapping) {
        const wrapper = make(tag)
        if(tag === "details") {
          wrapper.append(make("summary"))
          wrapper.setAttribute("open", "")
        }
        wrapper.append(fragment)
        output.append(wrapper)
        return output
      }
      if(tag === "ul" || tag === "ol") {
        for(const child of Array.from(fragment.children)) this.editor.features.list.prepareItemContent(child)
      }
      // List items and table cells become text units. Keep their contents,
      // including nested lists, comments, and unfamiliar flow elements.
      const source = fragment.childNodes.length === 1 && isElement(fragment.firstChild) ? fragment.firstChild : undefined
      const units: Node[] = []
      for(const node of Array.from(fragment.childNodes)) {
        if(isElement(node) && node.matches("ul, ol")) {
          for(const child of Array.from(node.childNodes)) {
            if(isElement(child) && child.matches("li")) {
              const unit = make("div", child)
              unit.append(...Array.from(child.childNodes))
              units.push(unit)
            }
            else units.push(child)
          }
        }
        else if(isElement(node) && node.matches("table")) {
          const collect = (parent: Element) => {
            for(const child of Array.from(parent.childNodes)) {
              if(isElement(child) && child.matches("thead, tbody, tfoot, tr")) collect(child)
              else if(isElement(child) && child.matches("td, th, caption")) {
                const unit = make("div", child)
                unit.append(...Array.from(child.childNodes))
                units.push(unit)
              }
              else units.push(child)
            }
          }
          collect(node)
        }
        else units.push(node)
      }
      const wrapper = tag === "ul" || tag === "ol" || tag === "table" ? make(tag, source?.matches("ul, ol, table") ? source : undefined) : null
      const body = tag === "table" ? make("tbody") : wrapper
      if(wrapper && body !== wrapper) wrapper.append(body!)
      if(wrapper) output.append(wrapper)
      let inline: Element | null = null
      const hasBlocks = units.some(unit => isElement(unit) && !this.isInlineClipboardNode(unit))
      for(const unit of units) {
        if(!wrapper && isElement(unit) && unit.localName === "div") {
          let run: Element | null = null
          const children = Array.from(unit.childNodes)
          let first = true
          for(const child of children) {
            if(isElement(child) && child.matches("p, h1, h2, h3, h4, h5, h6")) {
              const text = make(tag, unit)
              if(!first) text.removeAttribute("id")
              first = false
              this.copyAuthoredAttributes(child, text)
              text.append(...Array.from(child.childNodes))
              output.append(text)
              run = null
            }
            else if((isElement(child) && !this.isInlineClipboardNode(child)) || child.nodeType === Node.COMMENT_NODE) {
              output.append(child)
              run = null
            }
            else {
              if(!run) {
                run = make(tag, unit)
                if(!first) run.removeAttribute("id")
                first = false
                output.append(run)
              }
              run.append(child)
            }
          }
          if(!children.length) output.append(make(tag, unit))
          continue
        }
        if(unit.nodeType === Node.COMMENT_NODE || hasBlocks && unit instanceof Text && !unit.data.trim()) {
          (body ?? output).append(unit)
          continue
        }
        const block = isElement(unit) && !this.isInlineClipboardNode(unit)
        let target: Element
        if(block || !inline) {
          target = make(wrapper ? tag === "table" ? "td" : "li" : tag, block && (!wrapper || unit.localName === "div") ? unit : undefined)
          if(tag === "table") {
            const row = make("tr")
            row.append(target)
            body!.append(row)
          }
          else (body ?? output).append(target)
          inline = block ? null : target
        }
        else target = inline
        if(block && unit.matches("p, h1, h2, h3, h4, h5, h6")) {
          if(wrapper) target.append(unit)
          else target.append(...Array.from(unit.childNodes))
        }
        else if(block && unit.localName === "div") {
          target.append(...Array.from(unit.childNodes))
        }
        else target.append(unit)
      }
      if(!wrapper && source?.matches("ul, ol, table") && output.firstElementChild) {
        const attributes = make(tag, source).attributes
        const target = output.firstElementChild
        for(const attribute of Array.from(attributes)) {
          if(!target.hasAttributeNS(attribute.namespaceURI, attribute.localName)) {
            target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
          }
        }
      }
      return output
    }
    const apply = (point: Range, editingRoot: Element) => {
      let context = point.commonAncestorContainer instanceof Element
        ? point.commonAncestorContainer : point.commonAncestorContainer.parentElement
      const marks: Element[] = []
      while(context && isMarkElement(context)) { marks.push(context); context = context.parentElement }
      const contents = point.extractContents()
      for(const mark of marks) {
        const wrapper = cloneWithoutEditorMarkers(mark, false) as Element
        wrapper.removeAttribute("id")
        wrapper.append(...Array.from(contents.childNodes))
        contents.append(wrapper)
      }
      const fragment = convert(contents)
      const nodes = Array.from(fragment.childNodes)
      if(!nodes.length) return null
      const block = getContainer(point.startContainer)
      const affected = new Set<Element>()
      if(block === editingRoot || isDocumentRoot(block)
        || point.startContainer === block && (!this.isTextBlock(block) || block.matches("li, td, th, dt, dd"))) {
        point.insertNode(fragment)
        affected.add(block)
      }
      else {
        const parent = block.parentElement
        if(!parent) return null
        const offset = this.splitTextLikePoint(block, point)
        const right = cloneWithoutEditorMarkers(block, false) as Element
        right.removeAttribute("id")
        right.append(...Array.from(block.childNodes).slice(offset))
        if(block.childNodes.length) block.after(...nodes)
        else block.replaceWith(...nodes)
        if(right.childNodes.length) nodes.at(-1)!.after(right)
        affected.add(parent)
      }
      for(const node of nodes) if(isElement(node)) {
        affected.add(node)
        if(node.parentElement) affected.add(node.parentElement)
        node.querySelectorAll("*").forEach(element => {
          if(!atomicEditingContainer(element, this.editor.schema)) affected.add(element)
        })
      }
      return {nodes, affected}
    }
    const simulation = this.cloneRangeIn(root, range)
    if(!simulation) return false
    try {
      const result = apply(simulation.range, simulation.root)
      if(!result || [...result.affected].some(element => {
        const unknown = this.editor.schema.get("#unknownelement")
        if(this.editor.schema.get(element) === unknown || Boolean(isAtomicEditingElement(element, this.editor.schema))) return false
        const children = Array.from(element.childNodes).filter(child => child.nodeType !== Node.COMMENT_NODE && !(child instanceof Text && !child.data.trim())).map(child => isElement(child)
          && this.editor.schema.get(child) === unknown ? document.createElement("span") : child)
        return !this.editor.schema.isContentValid(element, children)
      })) return true
    }
    catch { return true }
    this.hoverInsertion(false)
    this.withNormalization(() => {
      const result = apply(range, root)
      const first = result?.nodes.find(isElement)
      if(first) {
        if(captured) this.editor.features.selection.selectElement(first)
        if(tag === "details") $.move(first.firstElementChild!)
        else this.moveToStart(first)
        if(captured) this.editor.features.selection.processSelection()
      }
    })
    return true
  }

  private createRibbonElement(tag: string) {
    if(this.convertInsertion(tag)) return
    if(tag === "table") this.editor.features.table.actions.insertTable({type: "insertTable", rows: 2, columns: 2})
    else if(tag === "details" && this.commandPlacement) {
      const details = this.ribbonElement(tag)
      this.insert(details)
      if(details.isConnected) $.move(details.firstElementChild!)
    }
    else if(tag === "details") this.editor.features.list.actions.insertDetails({type: "insertDetails"})
    else if(tag === "svg") this.editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    else if(isMediaType(tag)) this.editor.features.media.actions.insertMedia({type: "insertMedia", media: tag})
    else if(tag === "math") {
      if((this.editor.features.canvas.active || this.editor.features.slides.active) && !this.insertRibbonTextRoot()) return
      this.editor.features.math.actions.insertMath({type: "insertMath"})
    }
    else if(tag === "ul" || tag === "ol") {
      this.editor.features.list.insertList(tag)
    }
    else if(isBlockFormatTag(tag)) {
      if(this.insertRibbonTextRoot()) this.actions.setBlockType({type: "setBlockType", tag})
    }
    else this.insertHTML(this.ribbonElement(tag).outerHTML)
  }

  private insertRibbonCommand(action: string, position: RibbonDropPosition) {
    if(!ribbonElementInsertionAction(action)) return false
    return this.insertAtRibbonDrop(position, () => {
      if(action.startsWith("element:")) this.createRibbonElement(action.slice("element:".length))
      else if(action.startsWith("insert-graphic-shape:")) {
        const shape = action.slice("insert-graphic-shape:".length)
        if(isGraphicShapeType(shape)) this.editor.features.graphic.actions.insertGraphic({type: "insertGraphic", shape})
      }
      else if(action.startsWith("insert-math:")) {
        if(position.layout !== "document" && !this.insertRibbonTextRoot()) return
        this.editor.features.math.actions.insertMath({type: "insertMath", structure: action.slice("insert-math:".length)})
      }
      else {
        const [, tag, style] = action.split(":")
        if(tag === "ul" || tag === "ol") {
          this.editor.features.list.insertList(tag)
          this.editor.features.list.actions.setListStyle({type: "setListStyle", listType: tag, style})
        }
      }
    })
  }

  private drop(event: DragEvent) {
    if(!this.acceptsDrop(event)) return
    event.preventDefault()
    let dropped = false
    try {
      const data = event.dataTransfer!
      if(Array.from(data.types).includes(ribbonInsertionDragType)) {
        const action = data.getData(ribbonInsertionDragType)
        const position = (ribbonInsertionAction(action) || ribbonElementInsertionAction(action))
          && this.ribbonDropPosition(event)
        if(!position) return
        if(ribbonElementInsertionAction(action)) dropped = this.insertRibbonCommand(action, position)
        else if(data.getData("text/html")) {
          // Already available content follows the same native transfer path as
          // elements. Only installation and remote snippet fetching need the host.
          void this.insertRibbonDrop(data.getData("text/html"), position).catch(error => console.error(error))
          dropped = true
        }
        else {
          this.editor.postHostMessage({type: "editor-ribbon-drop", action, position})
          dropped = true
        }
        return
      }
      const ribbonTag = this.ribbonDragTag(data)
      if(ribbonTag) {
        const position = this.ribbonDropPosition(event)
        if(position) dropped = this.insertAtRibbonDrop(position, () => this.createRibbonElement(ribbonTag))
        return
      }
      // Only this live drag session can bypass import processing. An external
      // application cannot grant trust merely by supplying our MIME type.
      const source = this.nodeDrag?.token === data.getData(this.dragType) ? this.nodeDrag.element : null
      const range = this.dropRange(event, source)
      if(!range) return
      if(source) {
        const inserted = event.ctrlKey || event.altKey ? cloneWithoutEditorMarkers(source, true) : source
        if(inserted.namespaceURI === MATH_NAMESPACE && inserted.localName === "math") this.editor.features.math.adaptToPlacement(inserted, range.startContainer)
        const container = this.floatDropHit?.container
        if(container) {
          const side = this.floatSide(container, event.clientX)
          this.placeFloat(inserted, container, side)
        }
        else {
          range.insertNode(inserted)
          this.clearDropFloat(inserted)
        }
        if(getDocumentRoot().contains(inserted)) $.selectElement(inserted)
      }
      else {
        const html = data.getData("text/html")
        if(html && this.editor.features.migration.needsMigration(html)) {
          $.move(range.startContainer, range.startOffset)
          void this.#insertMigratedClipboardContent(html, event)
          dropped = true
          return
        }
        const fragment = this.#dataTransferToFragment(data)
        if(!fragment?.childNodes.length) return
        $.move(range.startContainer, range.startOffset)
        this.insertDroppedFragment(fragment, event, range)
      }
      dropped = true
    }
    finally {
      this.endNodeDrag(!dropped)
      this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.processSelection())
    }
  }

  private insertDroppedFragment(fragment: DocumentFragment, event: MouseEvent, range: Range) {
    const element = fragment.childNodes.length === 1 ? fragment.firstChild : null
    const container = isElement(element) && element.namespaceURI !== MATH_NAMESPACE ? this.floatDropTarget(event, element, range) : null
    if(container && isElement(element) && this.placeFloat(element, container, this.floatSide(container, event.clientX))) $.selectElement(element)
    else {
      const elements = Array.from(fragment.children)
      this.insertClipboardFragment(fragment, false)
      for(const element of elements) if(element.isConnected) this.clearDropFloat(element)
    }
  }

  private activeFigure() {
    const selectedSection = this.editor.features.selection.selectedSectionElement
    if(selectedSection?.localName === "figure") return selectedSection as HTMLElement
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element) || isDocumentRoot(element)) return null
    return (element.matches("figure") ? element : element.closest("figure")) as HTMLElement | null
  }

  private directFigureCaption(figure: HTMLElement) {
    return Array.from(figure.children).find(child => child.localName === "figcaption") as HTMLElement | undefined
  }

  getFigureState(): FigureSelectionState | null {
    const figure = this.activeFigure()
    return figure ? {hasCaption: Boolean(this.directFigureCaption(figure))} : null
  }

  addFigureCaption(position: "before" | "after") {
    const figure = this.activeFigure()
    if(!figure || this.directFigureCaption(figure)) return false
    const caption = document.createElement("figcaption")
    position === "before" ? figure.prepend(caption) : figure.append(caption)
    this.editor.features.selection.clearSelectedSection(figure)
    $.move(caption)
    this.editor.features.selection.processSelection()
    return true
  }

  editFigureCaption() {
    const figure = this.activeFigure()
    if(!figure) return false
    const caption = this.directFigureCaption(figure)
    if(!caption) return false
    this.editor.features.selection.clearSelectedSection(figure)
    $.move(caption)
    this.editor.features.selection.processSelection()
    return true
  }

  private activeHeadingGroup() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element) || isDocumentRoot(element)) return null
    return (element.matches("hgroup") ? element : element.closest("hgroup")) as HTMLElement | null
  }

  getHeadingGroupState(): HeadingGroupSelectionState | null {
    const group = this.activeHeadingGroup()
    if(!group) return null
    const heading = Array.from(group.children).find(child => /^h[1-6]$/.test(child.localName)) ?? null
    const children = Array.from(group.children)
    const headingIndex = heading ? children.indexOf(heading) : -1
    return {
      heading: heading?.localName as HeadingGroupSelectionState["heading"] ?? null,
      beforeCount: children.filter((child, index) => child.localName === "p" && headingIndex >= 0 && index < headingIndex).length,
      afterCount: children.filter((child, index) => child.localName === "p" && (headingIndex < 0 || index > headingIndex)).length,
    }
  }

  private directHeading(group: HTMLElement) {
    return Array.from(group.children).find(child => /^h[1-6]$/.test(child.localName)) as HTMLElement | undefined
  }

  setHeadingGroupLevel(level: HeadingGroupSelectionState["heading"]) {
    if(!level) throw new TypeError("A heading group requires a heading level")
    const group = this.activeHeadingGroup()
    if(!group) return
    const heading = this.directHeading(group)
    if(!heading) {
      const created = document.createElement(level)
      group.prepend(created)
      $.move(created)
      return
    }
    if(heading.localName === level) return
    // Read the selection first: moving the children collapses live ranges
    // inside them to the old heading.
    const selection = document.getSelection()
    const saved = selection?.anchorNode && selection.focusNode
      && (heading.contains(selection.anchorNode) || heading.contains(selection.focusNode))
      ? {anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset, focusNode: selection.focusNode, focusOffset: selection.focusOffset}
      : null
    const replacement = document.createElement(level)
    this.copyAuthoredAttributes(heading, replacement)
    replacement.append(...Array.from(heading.childNodes))
    heading.replaceWith(replacement)
    if(selection && saved) {
      const anchorNode = saved.anchorNode === heading ? replacement : saved.anchorNode
      const focusNode = saved.focusNode === heading ? replacement : saved.focusNode
      const length = (node: Node) => node instanceof CharacterData ? node.length : node.childNodes.length
      if(anchorNode.isConnected && focusNode.isConnected) selection.setBaseAndExtent(
        anchorNode, Math.min(saved.anchorOffset, length(anchorNode)),
        focusNode, Math.min(saved.focusOffset, length(focusNode)),
      )
    }
  }

  addHeadingGroupText(position: "before" | "after") {
    const group = this.activeHeadingGroup()
    if(!group) return
    let heading = this.directHeading(group)
    if(!heading) {
      heading = document.createElement("h1")
      group.prepend(heading)
    }
    const paragraph = document.createElement("p")
    if(position === "before") heading.before(paragraph)
    else {
      const following = Array.from(group.children).filter(child => child.localName === "p" && child.compareDocumentPosition(heading!) & Node.DOCUMENT_POSITION_PRECEDING)
      const lastFollowing = following.at(-1)
      if(lastFollowing) lastFollowing.after(paragraph)
      else heading.after(paragraph)
    }
    $.move(paragraph)
  }

  /** Copies all authored attributes, excluding transient editor marker
   * classes, to a newly created replacement element. */
  private copyAuthoredAttributes(source: Element, target: Element) {
    Array.from(source.attributes).forEach(attribute => {
      if(attribute.name !== "class") {
        if(attribute.namespaceURI) target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
        else target.setAttribute(attribute.name, attribute.value)
        return
      }
      const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
      if(classes.length) target.setAttribute("class", classes.join(" "))
    })
  }

  /** Resolves the structural elements to which a section command applies.
   * Section wrappers themselves remain transparent here; explicitly selected
   * wrappers are handled by the toolbox-specific commands below. */
  private selectedSectionTargets() {
    const root = getDocumentRoot()
    const selected = $.selectedElement

    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode
      || !selection.anchorNode.isConnected || !selection.focusNode.isConnected) return []
    if(selected === root || selected === document.body) return []
    const nearestSection = (node: Node) => {
      let element = node instanceof Element ? node : node.parentElement
      while(element && element !== root) {
        if(isSectionElement(element)) return element
        element = element.parentElement
      }
      return null
    }
    const activeSection = nearestSection(selection.anchorNode)
    if(selected && selected !== root && selected !== document.body && !isSectionElement(selected)) {
      if(activeSection?.contains(selected)) {
        let directChild: Element = selected
        while(directChild.parentElement && directChild.parentElement !== activeSection) {
          directChild = directChild.parentElement
        }
        if(directChild.parentElement === activeSection && !isSectionElement(directChild)) return [directChild]
      }
      return [selected]
    }
    if(activeSection && activeSection.contains(selection.focusNode)) {
      const directChild = (node: Node) => {
        let child: Node = node
        while(child.parentNode && child.parentNode !== activeSection) child = child.parentNode
        return child.parentNode === activeSection ? child : null
      }
      const anchorChild = directChild(selection.anchorNode)
      const focusChild = directChild(selection.focusNode)
      if(anchorChild && focusChild) {
        const children = Array.from(activeSection.childNodes)
        const anchorIndex = children.indexOf(anchorChild as ChildNode)
        const focusIndex = children.indexOf(focusChild as ChildNode)
        const first = Math.min(anchorIndex, focusIndex)
        const last = Math.max(anchorIndex, focusIndex)
        const targets = children.slice(first, last + 1).filter((node): node is Element => (
          node instanceof Element && $.includesNode(node) && !isSectionElement(node) && !isMarkElement(node)
        ))
        if(targets.length) return targets
      }
    }
    if(selection.isCollapsed || $.isTextSelection || $.isEmptySelection) {
      const container = getContainer(selection.anchorNode)
      return container && container !== root && container !== document.body ? [container] : []
    }

    const range = selection.getRangeAt(0)
    let container = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    while(container && isMarkElement(container)) container = container.parentElement
    if(!container || container === root && !range.intersectsNode(root)) return []
    if(!isSectionElement(container) && container !== root && container !== document.body) return [container]

    const targets = Array.from(container.childNodes).flatMap(node => {
      if(!(node instanceof Element)) return []
      const flatten = (element: Element): Element[] => !$.includesNode(element) ? [] : isMarkElement(element) || isSectionElement(element)
        ? Array.from(element.children).flatMap(flatten)
        : [element]
      try {
        return range.intersectsNode(node) ? flatten(node) : []
      }
      catch {
        return []
      }
    })
    const parent = targets[0]?.parentElement
    return parent && targets.every(target => target.parentElement === parent) ? targets : []
  }

  canSectionSelection() {
    return this.editor.features.selection.selectedSectionElement !== null
      || this.selectedSectionTargets().length > 0
  }

  private assertSectionName(section: string): asserts section is SectionName {
    if(!isSectionName(section)) throw new TypeError(`Unsupported section type '${section}'`)
  }

  private sectionNodes(targets: Element[]) {
    const parent = targets[0]?.parentElement
    if(!parent || !targets.length || !targets.every(target => target.parentElement === parent)) return null
    const children = Array.from(parent.childNodes)
    const indexes = targets.map(target => children.indexOf(target)).sort((first, second) => first - second)
    if(indexes.some(index => index < 0)) return null
    const first = indexes[0]
    const last = indexes.at(-1)!
    if(targets.some(target => {
      const index = children.indexOf(target)
      return index < first || index > last
    })) return null
    return {parent, nodes: children.slice(first, last + 1).filter(node => $.includesNode(node)), first, last}
  }

  private canReplaceWithSection(parent: Element, first: number, last: number, section: Element) {
    const children = Array.from(parent.childNodes)
    const proposed = [...children]
    proposed.splice(first, last - first + 1, section, ...children.slice(first, last + 1).filter(node => !$.includesNode(node)))
    return this.editor.schema.isContentValid(section)
      && this.editor.schema.isContentValid(parent, proposed)
  }

  wrapTargetsInSection(targets: Element[], type: SectionName) {
    const context = this.sectionNodes(targets)
    if(!context) return null
    const section = getInertDocument(context.parent).createElement(type)
    context.nodes.forEach(node => section.append(cloneWithoutEditorMarkers(node, true, {inert: true})))
    if(!this.canReplaceWithSection(context.parent, context.first, context.last, section)) return null

    const liveSection = document.createElement(type)
    context.nodes[0].before(liveSection)
    liveSection.append(...context.nodes)
    return liveSection
  }

  private replaceSectionType(section: Element, type: SectionName) {
    if(section.localName === type) return section
    const parent = section.parentElement
    if(!parent) return null
    const replacement = getInertDocument(section).createElement(type)
    this.copyAuthoredAttributes(section, replacement)
    Array.from(section.childNodes).forEach(node => replacement.append(cloneWithoutEditorMarkers(node, true, {inert: true})))
    const index = Array.from(parent.childNodes).indexOf(section)
    if(index < 0 || !this.canReplaceWithSection(parent, index, index, replacement)) return null

    const liveReplacement = document.createElement(type)
    this.copyAuthoredAttributes(section, liveReplacement)
    liveReplacement.append(...Array.from(section.childNodes))
    section.replaceWith(liveReplacement)
    this.editor.features.selection.replaceSelectedSection(section, liveReplacement)
    return liveReplacement
  }

  private canUnwrapSection(section: Element) {
    const parent = section.parentElement
    if(!parent) return false
    const children = Array.from(parent.childNodes)
    const index = children.indexOf(section)
    if(index < 0) return false
    const proposed = [...children]
    proposed.splice(index, 1, ...Array.from(section.childNodes))
    return this.editor.schema.isContentValid(parent, proposed)
  }

  private unwrapSection(section: Element) {
    if(!isSectionElement(section) || !this.canUnwrapSection(section)) return false
    const wasSelected = this.editor.features.selection.selectedSectionElement === section
    this.editor.features.selection.clearSelectedSection(section)
    section.replaceWith(...Array.from(section.childNodes))
    if(wasSelected) {
      this.editor.features.selection.processSelection()
      this.editor.postMarkState()
    }
    return true
  }

  private directSectionForTargets(targets: Element[]) {
    const parent = targets[0]?.parentElement
    return parent && isSectionElement(parent) && targets.every(target => target.parentElement === parent)
      ? parent
      : null
  }

  /** Toggles the nearest section wrapper around the selected structural
   * elements. Adding defaults to SECTION; removing splits an existing wrapper
   * when only some of its direct children are targeted. */
  toggleSection(type: SectionName = "section") {
    this.assertSectionName(type)
    const explicitlySelected = this.editor.features.selection.selectedSectionElement
    if(explicitlySelected) return this.unwrapSection(explicitlySelected)
    const targets = this.selectedSectionTargets()
    if(!targets.length) return false
    const active = this.directSectionForTargets(targets)
    if(!active) return Boolean(this.wrapTargetsInSection(targets, type))

    const context = this.sectionNodes(targets)
    if(!context) return false
    const sectionChildren = Array.from(active.childNodes)
    const first = sectionChildren.indexOf(context.nodes[0])
    const last = sectionChildren.indexOf(context.nodes.at(-1)!)
    if(first < 0 || last < first) return false
    if(first === 0 && last === sectionChildren.length - 1) return this.unwrapSection(active)

    const parent = active.parentElement
    if(!parent) return false
    const replacements: ChildNode[] = []
    const left = sectionChildren.slice(0, first)
    const middle = sectionChildren.slice(first, last + 1)
    const right = sectionChildren.slice(last + 1)
    if(left.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false, {inert: true}) as Element
      wrapper.append(...left.map(node => cloneWithoutEditorMarkers(node, true, {inert: true})))
      replacements.push(wrapper)
    }
    replacements.push(...middle.map(node => cloneWithoutEditorMarkers(node, true, {inert: true}) as ChildNode))
    if(right.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false, {inert: true}) as Element
      wrapper.append(...right.map(node => cloneWithoutEditorMarkers(node, true, {inert: true})))
      replacements.push(wrapper)
    }
    const siblings = Array.from(parent.childNodes)
    const activeIndex = siblings.indexOf(active)
    const proposed = [...siblings]
    proposed.splice(activeIndex, 1, ...replacements)
    if(!this.editor.schema.isContentValid(parent, proposed)) return false

    const liveReplacements: ChildNode[] = []
    if(left.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...left)
      liveReplacements.push(wrapper)
    }
    liveReplacements.push(...middle)
    if(right.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...right)
      liveReplacements.push(wrapper)
    }
    active.replaceWith(...liveReplacements)
    return true
  }

  /** Applies a chosen type, converting the nearest active wrapper or adding a
   * new wrapper when the target is not sectioned yet. */
  setSectionType(type: SectionName) {
    this.assertSectionName(type)
    const explicitlySelected = this.editor.features.selection.selectedSectionElement
    if(explicitlySelected) return Boolean(this.replaceSectionType(explicitlySelected, type))
    const targets = this.selectedSectionTargets()
    if(!targets.length) return false
    const active = this.directSectionForTargets(targets)
    return active
      ? Boolean(this.replaceSectionType(active, type))
      : Boolean(this.wrapTargetsInSection(targets, type))
  }

  /** Adds another layer even when the target already has a section wrapper. */
  addSection(type: SectionName = "section") {
    this.assertSectionName(type)
    const selected = this.editor.features.selection.selectedSectionElement
    return Boolean(this.wrapTargetsInSection(selected ? [selected] : this.selectedSectionTargets(), type))
  }

  removeSection() {
    const selected = this.editor.features.selection.selectedSectionElement
      ?? this.directSectionForTargets(this.selectedSectionTargets())
    return selected ? this.unwrapSection(selected) : false
  }

  /** The single connected authored element targeted by element-style commands.
   * Resolve this immediately before every read or mutation: retained selection
   * endpoints may have been replaced by native, widget, or remote DOM edits.
   * With no authored selection, BODY is the document-wide styling target. */
  get styleTarget(): Element {
    const body = document.body
    const root = getDocumentRoot(body)
    const inAuthoredBody = (element: Element | null | undefined): element is Element => Boolean(
      element?.isConnected && (element === body || body.contains(element)),
    )

    const selectedTable = this.editor.features.table.hasCellSelection
      ? this.editor.features.table.selectedTable
      : null
    if(inAuthoredBody(selectedTable)) return selectedTable

    const captured = this.editor.features.selection.captureSelectedElement
    if(inAuthoredBody(captured)) return captured

    const selectedSection = this.editor.features.selection.selectedSectionElement
    if(inAuthoredBody(selectedSection)) return selectedSection

    const focusedWidget = focusedWidgetHost()
    if(inAuthoredBody(focusedWidget) && !isContentfulWidget(focusedWidget, this.editor.schema)) return focusedWidget

    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode || selection.rangeCount === 0) return root
    const selectedElement = $.selectedElement
    if(inAuthoredBody(selectedElement)) return selectedElement
    const inBody = (node: Node) => node === body || body.contains(node)
    const range = selection.getRangeAt(0)
    if(!inBody(selection.anchorNode) || !inBody(selection.focusNode)) {
      // A live selection outside authored content is equivalent to having no
      // document selection for element styling.
      return root
    }

    const common = range.commonAncestorContainer
    if(common === document || common === document.documentElement || common === body) return root
    const container = getContainer(common)
    return inAuthoredBody(container)? container: body
  }

  private inlineStyleOf(element: Element | null): CSSStyleDeclaration | null {
    const style = (element as (Element & {style?: CSSStyleDeclaration}) | null)?.style
    return style && typeof style.setProperty === "function"? style: null
  }

  /** Whether an element is an authored, text-bearing editing block. Contentful
   * widget ancestors expose their light DOM to ordinary paragraph formatting. */
  isTextBlock(element: Element): element is HTMLElement {
    const root = getDocumentRoot()
    if(element === root || element === document.body || isSectionElement(element)) return false
    for(let ancestor: Element | null = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
      if((ancestor.localName.includes("-") || ancestor.hasAttribute("is")
        || this.editor.schema.get(ancestor).group?.includes("widget"))
        && (ancestor === element || !isContentfulWidget(ancestor, this.editor.schema))) return false
    }
    return this.editor.schema.isBlock(element)
  }

  /** Resolves the deepest text blocks covered by the live selection. A
   * collapsed caret uses its nearest block; a structural range returns every
   * leaf block it intersects, never their common section/list container. */
  private selectedTextBlocks() {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return []

    const selected = $.selectedElement
    if(selected) return this.isTextBlock(selected) ? [selected] : []

    if(selection.isCollapsed) {
      const root = getDocumentRoot()
      let element: Element | null = getContainer(selection.anchorNode)
      while(element && element !== root) {
        if(this.isTextBlock(element)) return [element]
        element = element.parentElement
      }
      return []
    }

    const range = selection.getRangeAt(0)
    const candidates = Array.from(document.body.querySelectorAll("*"))
      .filter((element): element is HTMLElement => {
        if(!$.includesNode(element) || !this.isTextBlock(element)) return false
        try {
          return range.intersectsNode(element)
        }
        catch {
          return false
        }
      })
    return candidates.filter(candidate => !candidates.some(
      other => other !== candidate && candidate.contains(other),
    ))
  }

  /** Changes only the selected text blocks' element type, moving their live
   * children and retaining all authored attributes. Invalid replacements are
   * skipped independently so irregular surrounding DOM is never rebuilt. */
  private canReplaceTextBlock(block: Element, candidate: Element) {
    if(this.editor.schema.canReplace(block, candidate)) return true
    const parent = block.parentElement
    if(!parent) return false
    // An unfamiliar but valid sibling can make the whole parent unverifiable
    // to the installed schema. Neutralize only those unknown sibling types,
    // then require both the existing and proposed local content shapes to be
    // valid. This retains ordered/selector constraints such as UL and ADDRESS.
    const unknown = this.editor.schema.get("#unknownelement")
    const children = Array.from(parent.childNodes).map(node => (
      isElement(node) && this.editor.schema.get(node) === unknown
        ? document.createElement("span")
        : node
    ))
    const index = Array.from(parent.childNodes).indexOf(block)
    if(index < 0 || !this.editor.schema.isContentValid(parent, children)) return false
    const proposed = [...children]
    proposed[index] = candidate
    return this.editor.schema.isContentValid(parent, proposed)
  }

  setBlockType(tag: BlockFormatTag) {
    if(!isBlockFormatTag(tag)) throw new TypeError(`Unsupported block format '${tag}'`)
    this.ensureTextBlock()
    const blocks = this.selectedTextBlocks()
    const selection = document.getSelection()
    const saved = selection?.anchorNode && selection.focusNode ? {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    } : null
    const replacements = new Map<Node, Element>()

    const count = this.withNormalization(() => blocks.reduce((converted, block) => {
      if(block.localName === tag || !block.isConnected
        || /^h[1-6]$/.test(tag) && block.closest("li, dt, dd")) return converted
      const candidate = document.createElement(tag)
      this.copyAuthoredAttributes(block, candidate)
      if(!this.editor.schema.isContentValid(candidate, Array.from(block.childNodes))
        || !this.canReplaceTextBlock(block, candidate)) {
        return converted
      }

      const replacement = document.createElement(tag)
      this.copyAuthoredAttributes(block, replacement)
      replacement.append(...Array.from(block.childNodes))
      block.replaceWith(replacement)
      replacements.set(block, replacement)
      return converted + 1
    }, 0))

    if(saved && selection) {
      const anchorNode = replacements.get(saved.anchorNode) ?? saved.anchorNode
      const focusNode = replacements.get(saved.focusNode) ?? saved.focusNode
      if(anchorNode.isConnected && focusNode.isConnected) {
        const maximumOffset = (node: Node) => node.nodeType === Node.TEXT_NODE
          ? (node as Text).length
          : node.childNodes.length
        selection.setBaseAndExtent(
          anchorNode, Math.min(saved.anchorOffset, maximumOffset(anchorNode)),
          focusNode, Math.min(saved.focusOffset, maximumOffset(focusNode)),
        )
      }
    }
    return count
  }

  /** Returns authored declarations and the requested computed values without
   * retaining or exposing a live CSSStyleDeclaration across the editor bridge. */
  getStyleState(properties: string[] = [], target = this.styleTarget, includeSelection = true): ElementStyleState {
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
    // CSSOM may enumerate border sides rather than the aggregate control's
    // property. Read requested shorthand values from the same inline style.
    for(const name of requested) {
      const value = style.getPropertyValue(name)
      if(value) inline[name] = {value, priority: style.getPropertyPriority(name) === "important" ? "important" : ""}
    }
    const computedStyle = getComputedStyle(target)
    const computed = Object.fromEntries(requested.map(name => [name, computedStyle.getPropertyValue(name)]))
    const paragraphProperties = requested.filter(name => paragraphStylePropertyNameSet.has(name))
    const blocks = includeSelection && paragraphProperties.length ? this.selectedTextBlocks() : []
    paragraphProperties.forEach(name => {
      if(!blocks.length) return
      delete inline[name]
      const declarations = blocks.map(block => {
        const blockStyle = this.inlineStyleOf(block)
        return {
          value: blockStyle?.getPropertyValue(name) ?? "",
          priority: blockStyle?.getPropertyPriority(name) === "important" ? "important" as const : "" as const,
        }
      })
      const firstDeclaration = declarations[0]
      if(firstDeclaration.value && declarations.every(declaration => (
        declaration.value === firstDeclaration.value && declaration.priority === firstDeclaration.priority
      ))) inline[name] = firstDeclaration

      const values = blocks.map(block => getComputedStyle(block).getPropertyValue(name))
      computed[name] = values.every(value => value === values[0]) ? values[0] : ""
    })
    const parentDisplay = target.parentElement? getComputedStyle(target.parentElement).display: ""
    return {
      target: {localName: target.localName, namespaceURI: target.namespaceURI,
        ...(target.matches(".ww-float-left, .ww-float-right, .ww-float-none")
          ? {float: floatSideFromStyles(computedStyle.float, style, target.classList)} : {}),
        ...(isDocumentRoot(target) || target === document.body ? {documentRoot: true as const} : {})},
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
    if(selection?.isCollapsed && selection.anchorNode) {
      const summary = $.summaryAtLeadingBoundary(selection.anchorNode, selection.anchorOffset)
      if(summary) $.move(summary)
    }
    const originalNodes = [selection?.anchorNode, selection?.focusNode]
    return this.editor.features.canvas.preservePlacement(() => {
      try {
        return command()
      }
      finally {
        this.editor.normalizeSurroundingElements(...originalNodes)
      }
    })
  }

  /** Inserts a new element at an empty-document or gap selection, choosing
   * the default node when allowed and otherwise a schema-conformant text block. */
  private insertTextBlockAtSelection() {
    const container = getContainer($.range.startContainer)
    const index = Math.max(0, getIndexBefore($.range) + 1)
    const validTypes = this.editor.schema.findValidTypesToInsert()
    const candidateTypes = [
      this.editor.schema.defaultNodeKey,
      ...validTypes.filter(type => type !== this.editor.schema.defaultNodeKey),
    ].filter(type => !type.startsWith("#") && validTypes.includes(type))
    const type = candidateTypes.find(type => {
      if(!this.editor.schema.isBlock(type)) return false
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
    if(!this.editor.features.slides.allowsSelection()) return
    if(!nodes.length) return
    return this.withNormalization(() => {
      $.replace(...nodes)
      this.moveAfterInsertedNode(nodes.at(-1)!)
    })
  }

  private moveAfterInsertedNode(node: Node) {
    if(node.nodeType === Node.TEXT_NODE
      || isElement(node) && this.editor.schema.findValidContentTypes(node).includes("#text")) {
      $.move(node, -1)
    }
    else if(node.parentNode) {
      $.move(node.parentNode, Array.from(node.parentNode.childNodes).indexOf(node as ChildNode) + 1)
    }
  }

  private isInlineClipboardNode(node: Node) {
    if(node instanceof Element && node.namespaceURI === MATH_NAMESPACE && node.localName === "math") return node.getAttribute("display") !== "block"
    return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE
      || isElement(node) && this.editor.schema.isPhrasing(node)
  }

  /** Groups top-level inline runs beside block clipboard content into normal
   * text blocks. Formatting whitespace between source blocks is discarded. */
  private normalizeClipboardTopLevel(nodes: ChildNode[]): ChildNode[] {
    if(nodes.every(node => this.isInlineClipboardNode(node))) return nodes
    const normalized: ChildNode[] = []
    let textBlock: Element | null = null
    nodes.forEach(node => {
      if(this.isInlineClipboardNode(node)) {
        if(node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return
        if(!textBlock) textBlock = this.editor.schema.create(undefined, node.ownerDocument ?? document) as Element
        const activeTextBlock = textBlock
        activeTextBlock.append(node)
        if(!normalized.includes(activeTextBlock)) normalized.push(activeTextBlock)
      }
      else {
        textBlock = null
        normalized.push(node)
      }
    })
    return normalized
  }

  /** Inserts block nodes beside the current text block, retaining non-empty
   * left and right halves. If the surrounding content model cannot accept
   * that shape, their text is inserted instead of creating invalid DOM. */
  private insertBlocks(nodes: ChildNode[]) {
    const insertionBlock = getContainer($.range.startContainer)
    if(!this.editor.features.slides.allowsSelection()) return
    return this.withNormalization(() => {
      $.delete()
      const block = getContainer($.range.startContainer)
      if(isDocumentRoot(block) || this.editor.features.slides.active && isSlide(block)) {
        $.replace(...nodes)
        this.moveAfterInsertedNode(nodes.at(-1)!)
        return
      }
      const parent = block.parentElement
      if(!parent) return
      const blockIndex = Array.from(parent.childNodes).indexOf(block)
      const proposed = Array.from(parent.childNodes)
      proposed.splice(blockIndex + 1, 0, ...nodes, cloneWithoutEditorMarkers(block, false) as ChildNode)
      const containsWidget = nodes.some(node => Boolean(this.insertedWidget(node)))
      if(!containsWidget && !this.editor.schema.isContentValid(parent, proposed)) {
        const fallback = this.plainTextClipboardFragment(nodes.map(node => node.textContent ?? "").join("\n"))
        this.insertAtSelection(...Array.from(fallback.childNodes))
        return
      }

      const offset = this.splitTextLikePoint(block, $.range)
      const right = cloneWithoutEditorMarkers(block, false) as Element
      right.append(...Array.from(block.childNodes).slice(offset).filter(node => !isOutOfFlow(node)))
      block.normalize()
      right.normalize()

      if(block.childNodes.length) block.after(...nodes)
      else block.replaceWith(...nodes)
      const last = nodes.at(-1)!
      if(right.childNodes.length) {
        last.after(right)
        this.moveToStart(right)
      }
      else {
        this.moveAfterInsertedNode(last)
      }
    })
  }

  /** Inserts clipboard content at a virtual body/gap position. Inline-only
   * content is placed in a text block; block content remains at the gap. */
  private insertClipboardFragment(fragment: DocumentFragment, allowFloat = true, commandInsertion = false) {
    if(!this.editor.features.slides.allowsSelection()) return
    if(commandInsertion) {
      this.hoverInsertion(false)
      if(this.replaceInsertionElement(fragment)) return
      this.moveCommandInsertionOutsideFloat()
    }
    this.selectCapturedElementForInsertion()
    if(allowFloat && !commandInsertion && this.insertFloat(fragment)) return
    for(const math of Array.from(fragment.querySelectorAll("math"))) {
      if(math.namespaceURI !== MATH_NAMESPACE) continue
      let ancestor = math.parentElement
      while(ancestor && !ancestor.localName.includes("-") && !ancestor.hasAttribute("is")) ancestor = ancestor.parentElement
      if(ancestor) continue
      let top: Element = math
      while(top.parentElement) top = top.parentElement
      if(top !== math && this.isInlineClipboardNode(top)) {
        // An inline clipboard run will be inserted into a text block below.
        math.setAttribute("display", "inline")
      }
      else this.editor.features.math.adaptToPlacement(math, math.parentNode === fragment ? $.range.startContainer : math.parentNode!)
    }
    const nodes = this.normalizeClipboardTopLevel(Array.from(fragment.childNodes))
    if(!nodes.length) return
    const isVirtualSelection = $.isGapSelection || $.isEmptyDocumentSelection
    const isInlineContent = nodes.every(node => this.isInlineClipboardNode(node))
    const widget = nodes.length === 1 ? this.insertedWidget(nodes[0]) : null
    if(widget && !this.editor.schema.isPhrasing(widget)) {
      this.withNormalization(() => this.insertBlockWidget(widget))
      return
    }
    if(isVirtualSelection && isInlineContent && !this.ensureTextBlock()) return
    if(isVirtualSelection || isInlineContent) this.insertAtSelection(...nodes)
    else this.insertBlocks(nodes)
    if(widget) {
      this.editor.features.selection.captureElement(widget)
      this.editor.postSelectionPath(true)
    }
  }

  private firstTextDescendant(node: Node): Text | null {
    if(node instanceof Text) return node
    for(const child of Array.from(node.childNodes)) {
      if(isOutOfFlow(child)) continue
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
        const right = cloneWithoutEditorMarkers(pointNode, false) as Element
        right.append(...Array.from(pointNode.childNodes).slice(pointOffset).filter(node => !isOutOfFlow(node)))
        pointNode.after(right)
        pointOffset = Array.from(parent.childNodes).indexOf(right)
      }
      pointNode = parent
    }
    return pointOffset
  }

  /** Copies a validation range without initializing widgets in the scratch DOM. */
  private cloneRangeIn(root: Element, range: Range) {
    const simulation = cloneRangeIn(root, range)
    if(simulation) clearEditorMarkerClasses(simulation.root)
    return simulation
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
      if(isDocumentRoot(container) || this.editor.features.slides.active && container.matches("section.ww-slide") && container.parentElement?.matches(".ww-slides-viewport")
        || isOutOfFlow(container) && !(this.editor.features.canvas.active && container.parentElement?.matches("body.ww-canvas")
          || this.editor.features.slides.active && container.parentElement?.matches("section.ww-slide")) || container.nodeName === "HTML") break
      const parent = container.parentElement
      if(!parent) break
      const schema = this.editor.schema.get(container)
      const next = (splittingSummary || container.matches("h1, h2, h3, h4, h5, h6") || strict && schema.inseperable
        ? this.editor.schema.create(undefined, container.ownerDocument)
        : cloneWithoutEditorMarkers(container, false)) as Element
      container.after(next)
      const moving = Array.from(container.childNodes).slice(offset).filter(node => !isOutOfFlow(node))
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
    const simulation = this.cloneRangeIn(getDocumentRoot(), $.range)
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
      const inserted = cloneWithoutEditorMarkers(node, true, {inert: true})
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

  private freeformTextBreak(event: Event) {
    if(event.defaultPrevented || this.editor.isEditingLocked || this.editor.features.selection.isCaptureSelection
      || this.editor.features.mark.isSVGTextSelection || isAppendixInteraction(event)
      || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)
      || !($.isTextSelection || $.isEmptySelection)) return false
    const range = $.range
    if(!document.body.contains(range.startContainer) || !document.body.contains(range.endContainer)
      || atomicEditingContainer(range.startContainer, this.editor.schema)
      || atomicEditingContainer(range.endContainer, this.editor.schema)) return false
    for(let element: Element | null = getContainer(range.startContainer); element && element !== document.body; element = element.parentElement) {
      if(["left", "right"].includes(getComputedStyle(element).float)) return element.contains(range.endContainer)
    }
    const container = this.editor.features.canvas.active ? document.body
      : this.editor.features.slides.active ? this.editor.features.slides.containingSlide(range.startContainer) : null
    if(!container || !container.contains(range.startContainer) || !container.contains(range.endContainer)) return false
    let root: Element | null = getContainer(range.startContainer)
    while(root && root.parentElement !== container) root = root.parentElement
    return Boolean(root && !slideLayoutRole(root) && root.contains(range.endContainer))
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

  private get snippetTarget() {
    if(!document.getSelection()?.rangeCount) return null
    const root = getDocumentRoot()
    const selected = this.editor.features.selection.captureSelectedElement
      ?? this.editor.features.selection.selectedSectionElement ?? $.selectedElement
    const topLevel = (element: Element) => element === root || element === document.body || isSlide(element)
    const block = getSelectionAnchorBlock(this.editor.schema)
    const anchor = $.anchor instanceof Element ? $.anchor : $.anchor?.parentElement
    let container = selected ?? ($.isEmpty && $.anchor instanceof Element ? anchor
      : block instanceof Element && !topLevel(block) ? block : anchor)
    while(!selected && container && isMarkElement(container)) container = container.parentElement
    return container instanceof Element && container.isConnected && root.contains(container)
      && !topLevel(container) && !slideLayoutRole(container) && !$.isMultiElementSelection ? container : null
  }

  /** Action handlers, addressable by action type through the editor. */
  actions = {
    hoverInsertion: ({hovered, tag}: {type: "hoverInsertion", hovered: boolean, tag?: string}) => this.hoverInsertion(hovered, tag),
    insertElement: ({tag}: {type: "insertElement", tag: string}) => {
      if(this.editor.isEditingLocked || !insertionMenuItems.some(item => item.tag === tag)) return
      this.hoverInsertion(false)
      const previous = this.commandPlacement
      this.commandPlacement = true
      try { this.createRibbonElement(tag) }
      finally { this.commandPlacement = previous }
    },
    insertRibbonDrop: ({html, position}: {type: "insertRibbonDrop", html: string, position: RibbonDropPosition}) => this.insertRibbonDrop(html, position),
    insert: ({html, strict}: {type: "insert", html: string, strict?: boolean}) => (
      this.editor.features.migration.needsMigration(html)
        ? this.#insertMigratedHTML(html, strict)
        : this.insertHTML(html, strict)
    ),
    delete: ({direction}: {type: "delete", direction?: "forward" | "backward"}) => {
      this.delete(direction)
    },
    wrap: ({wrapper}: {type: "wrap", wrapper: string}) => {
      this.wrap(this.editor.parseHTMLFragment(wrapper).fragment)
    },
    lift: ({}: {type: "lift"}) => {
      this.lift()
    },
    copy: ({}: {type: "copy"}) => {
      return this.copy()
    },
    getSnippet: ({}: {type: "getSnippet"}) => {
      const container = this.snippetTarget
      if(!container) return null
      const fragment = document.createDocumentFragment()
      fragment.append(cloneWithoutEditorMarkers(container, true, {inert: true}))
      const {html, text} = this.editor.serializeClipboardFragment(fragment)
      return {html, label: text.trim().replace(/\s+/g, " ").slice(0, 80) || container.localName}
    },
    hoverSnippet: ({hovered}: {type: "hoverSnippet", hovered: boolean}) => {
      this.editor.features.selection.showSnippetHover(hovered ? this.snippetTarget : null)
    },
    cut: ({}: {type: "cut"}) => {
      return this.cut()
    },
    paste: ({}: {type: "paste"}) => {
      return this.paste()
    },
    setAttributes: ({attrs}: {type: "setAttributes", attrs: Record<string, string | null>}) => {
      this.setAttributes(attrs)
    },
    setElementAttribute: ({
      path,
      localName,
      namespaceURI,
      name,
      previousName,
      value,
    }: {
      type: "setElementAttribute"
      path: number[] | null
      localName: string
      namespaceURI: string | null
      name: string
      previousName?: string
      value: string | null
    }) => this.setElementAttribute(path, localName, namespaceURI, name, value, previousName),
    getStyleState: ({properties}: {type: "getStyleState", properties?: string[]}) => {
      if(properties !== undefined && (!Array.isArray(properties) || properties.some(name => typeof name !== "string"))) {
        throw new TypeError("Style-state property names must be strings")
      }
      return this.getStyleState(properties)
    },
    setStyle: ({styles}: {type: "setStyle", styles: Record<string, ElementStyleMutation>}) => {
      this.setStyle(styles)
    },
    setBlockStyle: ({styles}: {type: "setBlockStyle", styles: Record<string, ElementStyleMutation>}) => {
      this.setBlockStyle(styles)
    },
    setBlockType: ({tag}: {type: "setBlockType", tag: BlockFormatTag}) => {
      this.setBlockType(tag)
    },
    setHeadingGroupLevel: ({level}: {type: "setHeadingGroupLevel", level: HeadingGroupSelectionState["heading"]}) => {
      this.setHeadingGroupLevel(level)
    },
    addHeadingGroupText: ({position}: {type: "addHeadingGroupText", position: "before" | "after"}) => {
      if(position !== "before" && position !== "after") throw new TypeError("Unsupported heading-group text position")
      this.addHeadingGroupText(position)
    },
    addFigureCaption: ({position}: {type: "addFigureCaption", position: "before" | "after"}) => {
      if(position !== "before" && position !== "after") throw new TypeError("Unsupported figure-caption position")
      return this.addFigureCaption(position)
    },
    editFigureCaption: ({}: {type: "editFigureCaption"}) => this.editFigureCaption(),
    toggleSection: ({section = "section"}: {type: "toggleSection", section?: SectionName}) => {
      return this.toggleSection(section)
    },
    setSectionType: ({section}: {type: "setSectionType", section: SectionName}) => {
      return this.setSectionType(section)
    },
    addSection: ({section = "section"}: {type: "addSection", section?: SectionName}) => {
      return this.addSection(section)
    },
    removeSection: ({}: {type: "removeSection"}) => {
      return this.removeSection()
    },

  } as const

  /** Browser text replacement may otherwise insert a bare text node between
   * BODY children. Handle selections that cross editing blocks ourselves so
   * a root-level insertion point is materialized as a text block. */
  private replacesStructureWithText() {
    if($.isEmpty) return false
    const selected = $.selectedElement
    if(selected === getDocumentRoot() || selected === document.body) return true
    const common = getContainer($.range.commonAncestorContainer)
    return isDocumentRoot(common)
      || getSelectionAnchorBlock(this.editor.schema) !== getSelectionFocusBlock(this.editor.schema)
  }

  private replaceStructuredSelectionWithText(text: string) {
    return this.withNormalization(() => {
      $.delete()
      this.ensureTextBlock()
      if(text) this.insertAtSelection(document.createTextNode(text))
    })
  }

  /** Word/platform deletion conventions: Option deletes a word and Command
   * deletes to the line boundary on Apple platforms; Ctrl deletes a word on
   * other platforms. Block deletion remains available as an explicit action. */
  private deletionGranularity(event: KeyboardEvent): Granularity {
    if(isOnApple()) {
      if(event.metaKey) return "line"
      if(event.altKey) return "word"
    }
    else if(event.ctrlKey) return "word"
    return "character"
  }

  /** Applies a conservative two-em paragraph indent at a block boundary or
   * across a block selection. Existing non-em author values are left alone
   * rather than rewritten into editor-specific metadata. */
  private adjustSelectedBlockIndent(direction: -1 | 1) {
    const selection = document.getSelection()
    const blocks = this.selectedTextBlocks()
    if(!selection || !blocks.length) return false
    if(selection.isCollapsed && direction > 0 && !isCaretAtBoundary(blocks[0], "start")) return false

    let changed = false
    this.withNormalization(() => blocks.forEach(block => {
      const style = this.inlineStyleOf(block)
      if(!style) return
      const authored = style.getPropertyValue("margin-inline-start").trim()
      const zero = !authored || /^[-+]?0(?:[a-z%]+)?$/i.test(authored)
      const match = authored.match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))em$/i)
      if(!zero && !match) return
      const current = zero ? 0 : Number.parseFloat(match![1])
      const next = Math.max(0, current + direction * 2)
      if(next === current) return
      if(next === 0) style.removeProperty("margin-inline-start")
      else style.setProperty("margin-inline-start", `${next}em`)
      changed = true
    }))
    return changed
  }

  // Floated and freeform text roots retain their structure on Enter. Deliberate drags
  // can also target widget/control surfaces and the canvas's shadow slot.
  captureListeners: DocumentListenerMap = {
    "scroll": () => { if(this.insertionHovered) this.refreshInsertionPreview() },
    "keydown": event => {
      if(event.key !== "Enter" || event.isComposing || !this.freeformTextBreak(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.insertBreak(event.altKey && event.shiftKey ? "wbr" : "br")
    },
    "beforeinput": event => {
      if(event.inputType !== "insertParagraph" || !this.freeformTextBreak(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.insertBreak("br")
    },
    "dragover": event => {
      if(this.ribbonSurfaceDrag(event) || this.nodeDrag && (isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event))) this.dragOver(event)
    },
    "drop": event => {
      if(this.ribbonSurfaceDrag(event) || this.nodeDrag && (isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event))) this.drop(event)
    },
  }

  passiveListeners: DocumentListenerMap = {
    "selectionchange": () => { if(this.insertionHovered) this.refreshInsertionPreview() },
  }

  /** Keyboard and input behavior: Enter splits the containing block
   * (Shift/Alt: <br>, Alt+Shift: <wbr>, modifier: split the parent), deletion
   * follows platform word/line modifiers, and Tab adjusts paragraph indent
   * only where list/table handlers have not already supplied semantics. */
  activeListeners: DocumentListenerMap = {
    "dragstart": event => {
      const selected = $.selectedElement
      if(selected && event.target instanceof Node && selected.contains(event.target)) this.startNodeDrag(event, selected)
    },
    "dragend": () => this.endNodeDrag(),
    "dragover": event => this.dragOver(event),
    "dragleave": event => this.dragLeave(event),
    "drop": event => this.drop(event),
    "beforeinput": ev => {
      if(ev.defaultPrevented || this.editor.features.mark.isSVGTextSelection) return
      if(["insertFromPaste", "insertFromDrop"].includes(ev.inputType)) {
        ev.preventDefault()
        const html = ev.dataTransfer?.getData("text/html")
        if(html && this.editor.features.migration.needsMigration(html)) {
          void this.#insertMigratedClipboardContent(html)
          return
        }
        const fragment = this.#dataTransferToFragment(ev.dataTransfer)
        if(fragment) this.insertClipboardFragment(fragment)
        return
      }
      if($.isMultiElementSelection || $.excludedFlowElements.length) {
        if(ev.inputType.startsWith("delete")) {
          ev.preventDefault()
          this.delete()
          return
        }
        if(["insertText", "insertReplacementText", "insertCompositionText"].includes(ev.inputType) && ev.data !== null) {
          ev.preventDefault()
          this.insertAtSelection(document.createTextNode(ev.data))
          return
        }
      }
      const selected = $.selectedElement
      if(ev.inputType.startsWith("delete") && (selected === getDocumentRoot() || selected === document.body)) {
        ev.preventDefault()
        this.delete(ev.inputType.toLowerCase().includes("backward") ? "backward" : "forward")
        return
      }
      const summary = $.anchorContainer?.closest("summary")
      if(ev.inputType.startsWith("delete") && $.anchorContainer?.closest("details")) {
        ev.preventDefault()
        const granularity = ev.inputType.includes("Word") ? "word" : ev.inputType.includes("Line") ? "line" : "character"
        this.delete(ev.inputType.toLowerCase().includes("backward") ? "backward" : "forward", granularity)
        return
      }
      if(ev.inputType === "insertParagraph" && (summary?.parentElement?.matches("details")
        || $.anchorContainer?.matches("h1, h2, h3, h4, h5, h6"))) {
        ev.preventDefault()
        this.insert()
        return
      }
      if(ev.inputType === "insertLineBreak") {
        ev.preventDefault()
        this.insertBreak("br")
        return
      }

      if(["insertText", "insertReplacementText"].includes(ev.inputType)
        && ev.data !== null && this.replacesStructureWithText()) {
        ev.preventDefault()
        this.replaceStructuredSelectionWithText(ev.data)
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
      else if(ev.inputType.startsWith("insert")) {
        this.ensureTextBlock()
      }
    },
    "compositionstart": () => {
      this.ensureTextBlock()
    },
    "paste": ev => {
      if(ev.defaultPrevented) return
      const html = ev.clipboardData?.getData("text/html")
      if(html && this.editor.features.migration.needsMigration(html)) {
        ev.preventDefault()
        void this.#insertMigratedClipboardContent(html)
        return
      }
      const fragment = this.#dataTransferToFragment(ev.clipboardData)
      if(fragment) {
        ev.preventDefault()
        this.insertClipboardFragment(fragment)
      }
      else if($.isGapSelection || $.isEmptyDocumentSelection) {
        this.ensureTextBlock()
      }
    },
    "copy": ev => {
      if(!ev.clipboardData || !$.excludedFlowElements.length) return
      ev.preventDefault()
      const {html, text} = this.editor.serializeClipboardFragment($.copy())
      ev.clipboardData.setData("text/html", html)
      ev.clipboardData.setData("text/plain", text)
    },
    "cut": ev => {
      const selected = $.selectedElement
      if(!ev.clipboardData || selected !== getDocumentRoot() && selected !== document.body && !$.excludedFlowElements.length) return
      ev.preventDefault()
      const {html, text} = this.editor.serializeClipboardFragment($.copy())
      ev.clipboardData.setData("text/html", html)
      ev.clipboardData.setData("text/plain", text)
      $.delete()
    },
    "keydown": ev => {
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
        else if(ev.shiftKey && !modifierKeyDown(ev)) {
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
        this.delete("backward", this.deletionGranularity(ev))
      }

      else if(ev.key === "Delete") {
        ev.preventDefault()
        this.delete("forward", this.deletionGranularity(ev))
      }

      else if(ev.key === "Tab") {
        if(this.adjustSelectedBlockIndent(ev.shiftKey ? -1 : 1)) ev.preventDefault()
      }
    }
  }

  /** Inserts `node` at the selection, replacing the selected content. Without
   * `node`, splits the containing block at the caret (Enter behavior).
   * `splitDepth` is the number of additional ancestor levels to split (0 means
   * one split); <body> and <html> are never split. Splitting continues the
   * container as a clone. Headings continue as a new default node (<p>),
   * as do other inseperable containers when `strict` is set. */
  insert(node?: Node, splitDepth=0, strict=false, commandInsertion = this.commandPlacement) {
    if(!this.editor.features.slides.allowsSelection()) return
    if(node) {
      this.hoverInsertion(false)
      if(this.replaceInsertionElement(node)) return
      if(commandInsertion) this.moveCommandInsertionOutsideFloat()
      this.selectCapturedElementForInsertion()
    }
    if(node && !commandInsertion && this.insertFloat(node)) return
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
    if(node instanceof Element && node.namespaceURI === MATH_NAMESPACE && node.localName === "math") {
      const fragment = document.createDocumentFragment()
      fragment.append(node)
      return this.insertClipboardFragment(fragment)
    }
    const insertedWidget = this.insertedWidget(node)
    const insertedElement = isElement(node)
      ? node
      : node instanceof DocumentFragment && node.childNodes.length === 1 && isElement(node.firstChild)
        ? node.firstChild
        : null
    const emptyDefaultBlock = $.anchorContainer
    if(insertedElement && document.getSelection()?.isCollapsed
      && emptyDefaultBlock?.localName === this.editor.schema.defaultNodeKey
      && !emptyDefaultBlock.childNodes.length
      && this.editor.schema.get(insertedElement).group?.includes("flow")) {
      return this.withNormalization(() => {
        emptyDefaultBlock.replaceWith(insertedElement)
        if(insertedWidget) {
          this.editor.features.selection.captureElement(insertedWidget)
          this.editor.postSelectionPath(true)
        }
        else this.moveAfterInsertedNode(insertedElement)
      })
    }
    if(insertedWidget && !this.editor.schema.isPhrasing(insertedWidget)
      && !this.canInsertAtSelection(insertedWidget)) {
      return this.withNormalization(() => this.insertBlockWidget(insertedWidget))
    }
    if(insertedElement && !this.editor.schema.isPhrasing(insertedElement)
      && !this.canInsertAtSelection(insertedElement)) {
      return this.insertBlocks([insertedElement])
    }
    return this.withNormalization(() => {
      $.replace(node)
      let locus = $.commonAncestor
      for(let i = 0; i <= splitDepth; i++) {
        $.start instanceof Text && $.start.splitText($.startOffset)
        let container = getContainer(locus)
        if(isDocumentRoot(container) || this.editor.features.slides.active && isSlide(container) || isOutOfFlow(container) || container.nodeName === "HTML") {continue}
        const [,right] = getSidesOfPoint($.range)
        const schema = this.editor.schema.get(container)
        const next = (strict && schema.inseperable
          ? this.editor.schema.create()
          : cloneWithoutEditorMarkers(container, false)) as Element
        container.after(next)
        next.append(...right)
        node? $.move(node, -1): $.move(next, 0)
      }
      if(insertedWidget?.isConnected) {
        this.editor.features.selection.captureElement(insertedWidget)
        this.editor.postSelectionPath(true)
      }
    })
  }

  /** Capture is an editor selection while the native range stays collapsed
   * outside the widget. Promote it to a node range when insertion executes so
   * the existing placement paths replace the captured host. */
  private selectCapturedElementForInsertion() {
    const captured = this.editor.features.selection.captureSelectedElement
    if(captured) this.editor.features.selection.selectElement(captured)
  }

  /** Deletes content at the selection. A selection in an empty container
   * removes that container (the caret moves to the previous node). A collapsed
   * selection is first extended by `granularity` in `direction` ("block"
   * extends to the container start; the others use `Selection.modify`). A
   * caret in the gap between two elements merges them: backward moves the
   * following element's content into the preceding element, forward the
   * reverse. At the document boundaries, Backspace/Delete move the caret to
   * the end/start of the adjacent block. */
  delete(direction?: "forward" | "backward", granularity:Granularity="character") {
    if(!this.editor.features.slides.allowsSelection()) return
    if($.isMultiElementSelection) return this.withNormalization(() => $.delete())
    const selected = $.selectedElement
    if(selected && !slideLayoutRole(selected) && (this.editor.features.canvas.active && selected.parentElement === document.body
      || this.editor.features.slides.active && isSlide(selected.parentElement))) {
      return this.withNormalization(() => {
        const parent = selected.parentNode!
        const index = Array.from(parent.childNodes).indexOf(selected)
        selected.remove()
        $.move(parent, Math.min(index, parent.childNodes.length))
      })
    }
    const slide = this.editor.features.slides.active ? this.editor.features.slides.containingSlide($.range.startContainer) : null
    if(slide && direction && isCaretAtBoundary(slide, direction === "backward" ? "start" : "end")) return
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.deleteSelection()
    if(direction && this.editor.features.selection.selectAdjacentContentlessWidget(direction)) return
    const range = $.range
    const selectedSummary = range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1
      ? range.startContainer.childNodes.item(range.startOffset) : null
    if(isElement(selectedSummary) && selectedSummary.matches("details > summary")) {
      return this.withNormalization(() => {
        selectedSummary.replaceChildren()
        $.move(selectedSummary)
      })
    }
    const summary = $.anchorContainer?.closest("details > summary")
    if($.range.collapsed && direction) {
      if(summary && isCaretAtBoundary(summary, direction === "backward" ? "start" : "end")) return
      const block = $.anchorContainer
      if(!summary && direction === "backward" && block?.previousElementSibling?.matches("details > summary")
        && isCaretAtBoundary(block, "start")) return
      if($.isGapSelection && (direction === "backward" ? $.elementBefore : $.elementAfter)?.matches("details > summary")) return
    }
    return this.withNormalization(() => {
      if(summary && !summary.textContent && summary.contains($.range.endContainer)) {
        $.delete()
        $.move(summary)
        return
      }
      if($.isGapSelection && direction === "backward" && !$.elementAfter && $.elementBefore) {
        $.move($.elementBefore, -1)
        return
      }
      if($.isGapSelection && direction === "forward" && !$.elementBefore && $.elementAfter) {
        $.move($.elementAfter)
        return
      }
      const container = $.anchorContainer
      const previousElement = $.elementBefore
      const nextElement = $.elementAfter
      if(direction === "backward" && container?.textContent && isCaretAtBoundary(container, "start") && previousElement && !previousElement.textContent) {
        previousElement.remove()
        return
      }
      if(direction === "forward" && container?.textContent && isCaretAtBoundary(container, "end") && nextElement && !nextElement.textContent) {
        nextElement.remove()
        return
      }
      const commonContainer = getContainer($.commonAncestor)
      if(!commonContainer.textContent && commonContainer !== document.body
        && !commonContainer.matches("details, details > summary")
        && !isDocumentRoot(commonContainer) && !isOutOfFlow(commonContainer) && commonContainer.nodeName !== "HTML") {
        const emptyContainer = commonContainer
        const previous = isOutOfFlow(emptyContainer) ? null : flowSibling(emptyContainer, "previous")
        const next = isOutOfFlow(emptyContainer) ? null : flowSibling(emptyContainer, "next")
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
          $.move(getDocumentRoot())
        }
        return
      }
      else if($.isEmpty && !$.isGapSelection) {
        const before = $.range.cloneRange()
        granularity === "block"? $.extend($.anchorContainer!, 0): $.extendBy(granularity, direction)
        if(!this.editor.features.slides.allowsSelection()) {
          document.getSelection()?.setBaseAndExtent(before.startContainer, before.startOffset, before.endContainer, before.endOffset)
          return
        }
        $.delete()
      }
      else {
        $.delete()
      }
      if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "backward") {
        const {elementBefore, elementAfter} = $
        if(elementBefore.matches("summary") || elementAfter.matches("summary")) return
        if(!elementBefore.textContent) {
          elementBefore.remove()
          $.selectGap(elementAfter, "before")
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementBefore.append(...Array.from(elementAfter.childNodes).filter(node => !isOutOfFlow(node)))
          if(joinTarget) this.moveToStart(joinTarget)
          elementBefore.normalize()
          if(!elementAfter.childNodes.length) elementAfter.remove()
        }
      }
      else if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "forward") {
        const {elementBefore, elementAfter} = $
        if(elementBefore.matches("summary") || elementAfter.matches("summary")) return
        if(!elementAfter.textContent) {
          elementAfter.remove()
          $.selectGap(elementBefore)
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementAfter.prepend(...Array.from(elementBefore.childNodes).filter(node => !isOutOfFlow(node)))
          if(joinTarget) this.moveToStart(joinTarget)
          elementAfter.normalize()
          if(!elementBefore.childNodes.length) elementBefore.remove()
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
  wrap(wrapping?: DocumentFragment | Element) {
    return this.withNormalization(() => {
      if(wrapping) {
        const wrapper = wrapping instanceof DocumentFragment? wrapping.firstElementChild: wrapping
        if(!wrapper) return
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
  lift(depth=1) {
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
        if(toReplace === $.flowRoot || Array.from(toReplace.querySelectorAll("*")).some(element => !node.contains(element) && isOutOfFlow(element))) return
        toReplace.replaceWith(...replacement)
      }
      $.selectElement(node)
    })
  }

  /** Writes the complete selected fragment as text/html and text/plain.
   * Missing capabilities return false; permission and runtime failures reject
   * so the action bridge can report them to its caller. */
  async copy() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.copy()
    if(typeof ClipboardItem !== "function" || !navigator.clipboard?.write) return false
    const item = this.#fragmentToClipboardItem($.copy())
    await navigator.clipboard.write([item])
    return true
  }

  /** Writes a stable clone first and removes its captured live Range only
   * after the clipboard accepts it. A failed write never destroys content. */
  async cut() {
    if(!this.editor.features.slides.allowsSelection()) return false
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.cut()
    if(typeof ClipboardItem !== "function" || !navigator.clipboard?.write) return false
    const selection = document.getSelection()
    if(!selection?.rangeCount || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return false
    const captured = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    }
    const range = selection.getRangeAt(0).cloneRange()
    const identity = captureRangeIdentity(range)
    const copied = this.#clipboardData($.copy())
    const item = this.#clipboardItem(copied)
    await navigator.clipboard.write([item])
    const current = document.getSelection()
    if(current !== selection || current.anchorNode !== captured.anchorNode || current.anchorOffset !== captured.anchorOffset
      || current.focusNode !== captured.focusNode || current.focusOffset !== captured.focusOffset
      || !range.startContainer.isConnected || !range.endContainer.isConnected
      || [...identity].some(node => !node.isConnected || !document.body.contains(node))) return false
    const currentRange = current.getRangeAt(0)
    if([...identity].some(node => {
      try { return !currentRange.intersectsNode(node) }
      catch { return true }
    })) return false
    const currentData = this.#clipboardData($.copy())
    if(currentData.html !== copied.html || currentData.text !== copied.text) return false
    if(!this.editor.features.slides.allowsSelection()) return false
    return this.withNormalization(() => {
      $.delete()
      return true
    })
  }

  /** Inserts the clipboard's HTML or plain-text content at the selection.
   * Inline content at an empty document or gap is wrapped in a text block.
   * Missing capabilities return false; supported API failures reject. */
  async paste() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.paste()
    if(!navigator.clipboard?.read) return false
    const fragment = await this.#clipboardToFragment()
    this.insertClipboardFragment(fragment)
    return true
  }

  /** Sets the given attributes on every element in the selection (see
   * `EditingSelection.nodesBetween`); a null value removes the attribute. */
  setAttributes(attrs: Record<string, string | null>) {
    return this.withNormalization(() => {
      const elements = $.nodesBetween.filter(isElement)
      const entries = Object.entries(attrs)
      for(const element of elements) {
        for(const [name, value] of entries) {
          if(!elementAttributeEditability(name, element.localName, element.namespaceURI).editable) {
            throw new TypeError(`The ${name} attribute is not editable here`)
          }
          if(value !== null && isUnsafeElementAttributeValue(name, value)) {
            throw new TypeError(`The ${name} attribute contains an unsafe URL`)
          }
        }
      }
      elements.forEach(element => entries.forEach(([name, value]) => (
        value === null ? element.removeAttribute(name) : element.setAttribute(name, value)
      )))
    })
  }

  /** Sets one attribute on the live element addressed by the selection bridge.
   * The expected identity prevents a delayed UI event from mutating a node
   * that concurrently replaced the selected element. */
  private setElementAttribute(
    path: number[] | null,
    localName: string,
    namespaceURI: string | null,
    name: string,
    value: string | null,
    previousName?: string,
  ) {
    let node: Node = path === null ? document.documentElement : document.body
    for(const index of path ?? []) {
      const child = node.childNodes.item(index)
      if(!child) throw new RangeError(`Cannot edit a missing element at path [${path?.join(", ")}]`)
      node = child
    }
    if(!(node instanceof Element) || node.localName !== localName || node.namespaceURI !== namespaceURI) {
      throw new Error("The selected element changed before its attribute could be edited")
    }
    this.setAuthoredElementAttribute(node, name, value, previousName)
  }

  /** Also supports inert validation before a targeted proposal is previewed. */
  setAuthoredElementAttribute(node: Element, name: string, value: string | null, previousName?: string) {
    if(!name || name !== name.trim()) throw new TypeError("An attribute name cannot be empty or padded")
    if(!elementAttributeEditability(name, node.localName, node.namespaceURI).editable) {
      throw new TypeError(`The ${name} attribute is not editable here`)
    }
    if(previousName && !elementAttributeEditability(previousName, node.localName, node.namespaceURI).editable) {
      throw new TypeError(`The ${previousName} attribute is not editable here`)
    }
    if(value !== null && isUnsafeElementAttributeValue(name, value)) {
      throw new TypeError(`The ${name} attribute contains an unsafe URL`)
    }

    const setClass = (nextValue: string | null) => {
      const markers = Array.from(node.classList).filter(className => className.startsWith("◆"))
      const authored = nextValue === null ? [] : sanitizeAuthoredClass(nextValue).split(/\s+/).filter(Boolean)
      const classes = [...new Set([...authored, ...markers])]
      if(classes.length) node.setAttribute("class", classes.join(" "))
      else node.removeAttribute("class")
    }
    const set = (attributeName: string, nextValue: string | null) => {
      if(attributeName.toLowerCase() === "class") setClass(nextValue)
      else if(nextValue === null) node.removeAttribute(attributeName)
      else node.setAttribute(attributeName, nextValue)
    }

    // Set the new name before removing the old one so an invalid XML name
    // cannot turn a failed rename into data loss.
    set(name, value)
    if(previousName && previousName !== name) set(previousName, null)
  }

  private validatedStyleEntries(styles: Record<string, ElementStyleMutation>) {
    return Object.entries(styles).map(([name, mutation]) => {
      if(!name || name !== name.trim() || name.includes(";")) {
        throw new TypeError(`Invalid CSS property name '${name}'`)
      }
      if(mutation === null || mutation === "") {
        return {name, value: null, priority: "" as const}
      }
      const declaration = typeof mutation === "string"
        ? {value: mutation, priority: "" as const}
        : mutation
      if(!declaration || typeof declaration.value !== "string"
        || declaration.priority !== "" && declaration.priority !== "important") {
        throw new TypeError(`Invalid CSS declaration for '${name}'`)
      }
      return {name, value: declaration.value, priority: declaration.priority}
    })
  }

  private applyStyleEntries(
    target: Element,
    entries: ValidatedStyleEntry[],
  ) {
    const style = this.inlineStyleOf(target)
    if(!style) return false
    entries.forEach(({name, value, priority}) => {
      if(value === null) style.removeProperty(name)
      else style.setProperty(name, value, priority)
    })
    // Keep the authored float size in sync with width edits through the CSS controls.
    if(floatSideFromStyles(getComputedStyle(target).float, style, target.classList) !== "none"
      && entries.some(({name}) => name === "width" || name === "inline-size")
      && !entries.some(({name}) => name === "--ww-float-size")) {
      const width = style.getPropertyValue("inline-size") || style.getPropertyValue("width")
      style.setProperty("--ww-float-size", `min(100%, var(--ww-float-width), ${width && width !== "auto" ? width : "var(--ww-float-width)"})`)
    }
    if(entries.some(({name, value}) => value && ["border-width", "border-style", "border-color"].includes(name))) {
      // Resolve missing parts from the live inline declaration, including
      // shorthands and per-side overrides, within the same edit transaction.
      for(const [part, fallback] of [["width", "1px"], ["style", "solid"], ["color", "black"]]) {
        for(const side of ["top", "right", "bottom", "left"]) {
          const property = `border-${side}-${part}`
          if(!style.getPropertyValue(property)) style.setProperty(property, fallback)
        }
      }
    }
    return true
  }

  /** Assigns inline style properties on the single live style target, merging
   * with existing declarations. Null or an empty string clears a property. */
  setStyle(styles: Record<string, ElementStyleMutation>) {
    const target = this.styleTarget
    const entries = this.allowedElementStyles(target, this.validatedStyleEntries(styles))
    if(!entries.length) return false
    return this.withNormalization(() => this.applyStyleEntries(target, entries))
  }

  /** Targeted CSS commands never normalize surrounding authored structure or
   * substitute BODY for a disconnected selection. */
  validateElementStyles(styles: Record<string, ElementStyleMutation>) {
    if(!styles || typeof styles !== "object" || Array.isArray(styles)) throw new TypeError("Provide CSS declarations by property name")
    const entries = this.validatedStyleEntries(styles)
    for(const {name, value} of entries) {
      if(value !== null && typeof CSS?.supports === "function" && !CSS.supports(name, value)) {
        throw new TypeError(`Invalid value for ${name}`)
      }
    }
    return entries
  }

  private allowedElementStyles(target: Element, entries: ReturnType<ManipulationFeature["validatedStyleEntries"]>) {
    return isDocumentRoot(target) || target === document.body
      ? entries.filter(({name}) => name === "background" || name.startsWith("background-"))
      : entries
  }

  setElementStyles(target: Element, styles: Record<string, ElementStyleMutation>) {
    if(!target.isConnected || !getDocumentRoot().contains(target) || this.editor.isEditingLocked) return false
    const entries = this.allowedElementStyles(target, this.validateElementStyles(styles))
    if(!entries.length) return false
    const changed = this.applyStyleEntries(target, entries)
    if(!this.inlineStyleOf(target)?.length) target.removeAttribute("style")
    return changed
  }

  /** Applies paragraph declarations independently to every selected text
   * block instead of styling their structural common ancestor. */
  setBlockStyle(styles: Record<string, ElementStyleMutation>) {
    const entries = this.validatedStyleEntries(styles)
    this.ensureTextBlock()
    const blocks = this.selectedTextBlocks()
    return this.withNormalization(() => blocks.reduce(
      (count, block) => count + (this.applyStyleEntries(block, entries) ? 1 : 0),
      0,
    ))
  }

  /** Converts every selected sibling into one shared pair of clipboard
   * flavors after removing transient editing artifacts. */
  #fragmentToClipboardItem(fragment: DocumentFragment) {
    return this.#clipboardItem(this.#clipboardData(fragment))
  }

  #clipboardData(fragment: DocumentFragment) {
    const {html, text} = this.editor.serializeClipboardFragment(fragment, $.selectedElement instanceof HTMLElement ? $.selectedElement.innerText : undefined)
    return {html, text}
  }

  #clipboardItem({html, text}: {html: string, text: string}) {
    return new ClipboardItem({
      "text/plain": text,
      "text/html": html,
    })
  }

  private plainTextClipboardFragment(text: string) {
    const fragment = document.createDocumentFragment()
    const lines = text.replace(/\r\n?/g, "\n").split("\n")
    lines.forEach((line, index) => {
      if(index) fragment.append(document.createElement("br"))
      if(line) fragment.append(document.createTextNode(line))
    })
    return fragment
  }

  /** Parses HTML preferentially and otherwise preserves clipboard text as a
   * text node, so text containing markup characters is never interpreted as
   * HTML. */
  #clipboardContentToFragment(html: string, text: string) {
    const fragment = html
      ? this.editor.parseHTMLFragment(html, true).fragment
      : this.plainTextClipboardFragment(text)
    return fragment
  }

  /** Sanitizes, schema-corrects, and inserts arbitrary HTML through the same
   * structural placement path as HTML clipboard content. */
  insertHTML(html: string, strict=false, commandInsertion = true) {
    const {fragment} = this.editor.parseHTMLFragment(html)
    if(strict) this.insert(fragment, 0, true, commandInsertion)
    else this.insertClipboardFragment(fragment, true, commandInsertion)
  }

  /** Runs package migrations on `html`, then restores the selection captured
   * before they started. Returns null when that selection or the editor's
   * editability did not survive. */
  async #migrateAtSelection(html: string) {
    const generation = this.insertionGeneration
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const owned = this.editor.features.selection.captureSelectedElement ?? this.editor.features.selection.selectedSectionElement
    if(owned && range) range.selectNode(owned)
    const identity = range ? captureRangeIdentity(range) : new Set<Node>()
    const snapshot = range && !range.collapsed ? this.editor.serializeClipboardFragment(cloneRangeContents(range)).html : null
    const migrated = await this.editor.features.migration.migrate(html)
    const root = getDocumentRoot()
    if(!this.isEnabled || generation !== this.insertionGeneration || !range?.startContainer.isConnected || !range.endContainer.isConnected || this.editor.isEditingLocked
      || !root.contains(range.startContainer) || !root.contains(range.endContainer)
      || [...identity].some(node => !node.isConnected || !root.contains(node))) return null
    if(snapshot !== null && this.editor.serializeClipboardFragment(cloneRangeContents(range)).html !== snapshot) return null
    // Restore all editor selection ownership as well as the native Range.
    // A widget captured while the migration ran must not become its replacement target.
    this.editor.features.selection.selectDropRange(range, {scrollIntoView: false})
    $.selectRange(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
    return migrated
  }

  /** Lets package migrations update pasted or dropped widgets before insertion. */
  async #insertMigratedClipboardContent(html: string, dropEvent?: MouseEvent) {
    const migrated = await this.#migrateAtSelection(html)
    if(migrated === null) return false
    const fragment = this.#clipboardContentToFragment(migrated, "")
    if(dropEvent) this.insertDroppedFragment(fragment, dropEvent, $.range)
    else this.insertClipboardFragment(fragment)
    return true
  }

  async #insertMigratedHTML(html: string, strict?: boolean) {
    const migrated = await this.#migrateAtSelection(html)
    if(migrated !== null) this.insertHTML(migrated, strict)
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
    const html = htmlItem? await this.editor.features.migration.migrate(await (await htmlItem.getType("text/html")).text()): ""
    const text = !html && textItem? await (await textItem.getType("text/plain")).text(): ""
    return this.#clipboardContentToFragment(html, text)
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
    if(isDocumentRoot(block) || this.editor.features.slides.active && isSlide(block) || this.editor.schema.isPhrasing(widget)
      || this.canInsertAtSelection(widget)) {
      $.replace(widget)
    }
    else {
      const parent = block.parentElement
      if(!parent) return
      const offset = this.splitTextLikePoint(block, $.range)
      const right = cloneWithoutEditorMarkers(block, false) as Element
      right.append(...Array.from(block.childNodes).slice(offset).filter(node => !isOutOfFlow(node)))
      block.normalize()
      right.normalize()

      if(block.childNodes.length) block.after(widget)
      else block.replaceWith(widget)
      if(right.childNodes.length) widget.after(right)
    }
    this.editor.features.selection.captureElement(widget)
    this.editor.postSelectionPath(true)
  }
}
