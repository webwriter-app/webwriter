import { DocumentListenerMap, EditorFeature } from "."
import { $, closestAlignment, fixedClientX, clearInlinePlacement, editingFlowRoot, figureSelectionTarget, findContainingBlock, findScrollingAncestor, findStackingContainer, flowSibling, getDescendantsInStackingOrder, getStaticCoords, isElement, modifierKeyDown, removeEditorMarker, renderedParentElement, roundByDPR, roundTo, setPart } from "../utility"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {SVG_NAMESPACE, standaloneGraphicShape} from "../graphic"
import {boardLayoutRole, documentLayoutMode, isSlide, slideLayoutRole} from "../document-layout"
import {alignmentFromStyles, floatSideFromStyles, type FloatSide} from "../element-styles"
import {isWebsiteType, mediaCropInsets} from "../media"
import {captionIconSource} from "../caption-icon"
import {mathRoot} from "../math"
import {captionedFigureContent} from "../figure-layout.js"
import {canvasGridSize, isCanvasStartingView} from "../canvas-viewer.js"
import {createAnchorPositioner, cssZoomFactor, isWidgetShadowInteraction} from "../utility"
import {isAuthoredMutation} from "../editor-artifacts"
import {popupElementRole} from "../element-names"
import groupIcon from "@tabler/icons/outline/layers-union.svg?raw"
import ungroupIcon from "@tabler/icons/outline/layers-off.svg?raw"

type TransformElement = HTMLElement | SVGSVGElement | MathMLElement
// Membership is authored data, scoped to siblings so it never crosses slides.
const spatialGroupAttribute = "data-ww-group"
const spatialGroupRotation = "data-ww-group-rotation"
type Mode = "move" | "scale" | "rotate" | "anchor" | "crop"
const cropDirections = ["up-left", "down-right"] as const
const pixelSize = (value: string) => value.endsWith("px") && Number.isFinite(parseFloat(value)) ? parseFloat(value) : undefined
type StyleValue = {value: string, priority: string}
type GestureStyles = {target: TransformElement, initial: CSSStyleDeclaration, written: Map<string, StyleValue>}
type GroupMember = GestureStyles & {
  parent: Element | null, rect: DOMRect, matrix: DOMMatrix, transform: DOMMatrix,
  size: {width: number, height: number, cssWidth: number, cssHeight: number},
  groupRotation: string | null,
}
type GroupGesture = {members: GroupMember[], center: {x: number, y: number}, angle: number, persistent: boolean,
  clickedMember?: TransformElement}
type MovementPreview = {
  offset: {x: number, y: number}, area: DOMRect, origin: {x: number, y: number},
  zoom: number, boxes: DOMRect[], guides: Partial<Record<"x" | "y", {value: number, kind: string}>>
}
export type BoxGeometry = {
  rect: DOMRect, width: number, height: number, matrix: DOMMatrix
  styles: {width: string, height: string, left: string, top: string, transform: string}
  corners: {x: number, y: number}[]
}
type Gesture = {
  target: TransformElement
  parent: Element | null
  mode: Mode
  handle: HTMLElement
  pointerId?: number
  x: number
  y: number
  rect: DOMRect
  width: number
  height: number
  cssWidth: number
  cssHeight: number
  matrix: DOMMatrix
  parentMatrix: DOMMatrix
  rotate: number
  rotationAngle?: number
  scale: number[]
  initial: CSSStyleDeclaration
  written: Map<string, StyleValue>
  moved: boolean
  captured: boolean
  image?: GestureStyles & {parent: Element | null}
  figureImage?: {cssWidth: number, cssHeight: number, width: number, height: number,
    picture?: GestureStyles & {cssWidth: number, cssHeight: number}}
  canvas?: {initial: string | null, written: string | null, x: number, y: number, width: number, height: number}
  crop?: {target: HTMLImageElement | HTMLVideoElement, parent: Element | null, width: number, height: number, matrix: DOMMatrix, insets: number[], edges: number[], sourceStyle: CSSStyleDeclaration}
  endUndoGroup: () => void
  group?: GroupGesture
  fullWidth?: {initial: boolean, written: boolean, threshold: number | null}
  resizeCentered?: boolean
  resizeMode?: string
  selectionPathPending?: boolean
  markStatePending?: boolean
}

/** Selection-owned spatial controls in the shadow appendix.
 *
 * Move: the document mover and borders use the element's native node drag.
 * Canvas and slide items retain spatial positioning. Ctrl/Cmd previews a flow
 * gap; Shift constrains spatial movement to one axis; Alt disables snapping.
 *
 * Resize: text containers and block formulas resize horizontally and grow with content.
 * Document elements expose the bottom corner opposite their alignment; centered
 * elements resize symmetrically along the horizontal axis. Freeform
 * corners set max-inline/block-size; midpoints constrain one logical axis.
 * Quizzes inside board cards keep the card's width and resize vertically.
 * Existing dimensions and intrinsic content can keep the element smaller.
 * Images use an explicit aspect ratio to stretch within their maximum dimensions.
 * Iframes also set height so their viewport can grow vertically.
 * Canvas and slide items also set dimensions so they can grow with the handles.
 * Top/left handles keep the opposite edge fixed by adjusting offsets.
 * Ctrl/Cmd resizes about the center;
 * Shift preserves image proportions and stretches other elements with CSS scale
 * instead of reflowing content; Alt unsnaps.
 * SVG canvases crop their viewport by default; Alt resizes their contents.
 * Native images and videos expose opposite crop corners that adjust CSS insets.
 * Rotate (absolute targets): drag about the center, snapping to 5 degrees
 * (Shift: 45 degrees; Alt: no snapping).
 *
 * Anchor: drag to relocate the element in the DOM without changing its
 * positioning mode. Ctrl/Cmd-click cycles absolute/relative/sticky;
 * Shift-click switches to fixed. Stacking and positioning controls operate
 * on the current DOM. Escape, pointer cancellation and teardown cancel a drag.
 */
export class TransformationFeature extends EditorFeature {
  readonly readerPermission = "select" as const
  protected handlesAppendixInteractions = true
  protected handlesCapturedElementInteractions = true
  #target: TransformElement | null = null
  #group: TransformElement[] = []
  #groupContext: HTMLButtonElement | null = null
  #groupPress: Element | null = null
  #gesture: Gesture | null = null
  #settlingGesture: Gesture | null = null
  #floatAnchorLine: SVGLineElement | null = null
  #movementOverlay: SVGSVGElement | null = null
  #movementPeers: {root: HTMLElement, boxes: {item: HTMLElement | SVGSVGElement, rect: DOMRect}[],
    horizontal: {value: number, kind: string}[], vertical: {value: number, kind: string}[]} | null = null
  #floatValues: readonly FloatSide[] = ["none", "far-left", "far-right"]
  #observer: MutationObserver | null = null
  #anchors = createAnchorPositioner()
  #anchored = false
  #resizeObserver: ResizeObserver | null = null
  #observedElements: Element[] = []
  readonly refreshGeometry = () => {
    if(!this.target) return
    if(!this.#coalescesGeometry && !this.#settlingGesture) this.updateInfo()
    this.#scheduleFrame()
  }
  readonly #animationStarted = (event: Event) => {
    const origin = event.target
    if(origin instanceof Node && this.#observedElements.some(element => element.contains(origin))) this.#scheduleFrame()
  }
  readonly #refreshViewportControls = () => {
    this.#movementPeers = null
    if(this.#floatAnchorLine?.style.display === "") this.refreshGeometry()
    else if(this.#coalescesGeometry || this.#group.length || this.#groupContext) this.#scheduleFrame()
    // The anchored frame follows scrolling natively. Its upright control stems
    // still switch sides together when their top row crosses the viewport edge.
    if(this.#anchored && this.target) setPart(this.overlay, "transform-overlay-at-top", this.target.getBoundingClientRect().top < 42)
  }
  #frame: number | null = null
  #geometryFrameDirty = false
  #pendingPointer: PointerEvent | null = null
  #lastPointer: MouseEvent | null = null
  #panFrame: number | null = null
  #panEvent: MouseEvent | null = null
  #drop: {element: Element, placement: "before" | "after", parent: Node, float?: "left" | "right"} | null = null
  #normalDropRange: Range | null = null
  #suppressClick: HTMLElement | null = null
  readonly #cancelGesture = () => this.#finish(true)

  #createScaler(direction: string, edge = false, prefix = "◆transform-overlay") {
    const point = document.createElement(edge ? "div" : "button")
    const part = edge ? "transform-overlay-edge" : "transform-overlay-scale"
    point.id = `${prefix}-scale-${direction}`
    point.classList.add(`◆${part}`)
    point.setAttribute("part", `${part} ${part}-${direction}`)
    point.dataset.transformMode = "scale"
    point.dataset.resizeDirection = direction
    if(!edge) point.title = `Resize ${direction}`
    if(edge) point.setAttribute("aria-hidden", "true")
    return point
  }

  #createControl(name: string, title: string, mode?: Mode, prefix = "◆transform-overlay") {
    const button = document.createElement("button")
    button.id = `${prefix}-${name}`
    button.type = "button"
    button.classList.add("◆transform-overlay-button")
    button.setAttribute("part", `transform-overlay-button transform-overlay-${name}`)
    button.title = title
    button.setAttribute("aria-label", title)
    if(mode) button.dataset.transformMode = mode
    return button
  }

  /** Board context controls share document affordances and resize gestures. */
  createFlowOverlay(prefix: string, role: "card" | "column") {
    const overlay = document.createElement("div")
    overlay.id = prefix
    overlay.setAttribute("part", "transform-overlay transform-overlay-board")
    overlay.contentEditable = "false"
    const edges = ["up", "right", "down", "left"].map(direction => {
      const edge = this.#createScaler(direction, true, prefix)
      edge.dataset.transformMode = "move"
      edge.draggable = true
      setPart(edge, "transform-overlay-edge-move", true)
      return edge
    })
    const scaler = this.#createScaler(role === "card" ? "down-down" : "right-right", false, prefix)
    setPart(scaler, `transform-overlay-board-resize-${role}`, true)
    overlay.append(...edges, scaler,
      this.#createControl("mover", "Move", "move", prefix), this.#createControl("delete", "Delete", undefined, prefix))
    overlay.querySelectorAll("button").forEach(button => setPart(button, "transform-overlay-board-control", true))
    overlay.querySelector<HTMLButtonElement>("[data-transform-mode=scale]")!.type = "button"
    return overlay
  }

  startFlowScale(event: MouseEvent, target: HTMLElement) {
    if(!this.isEnabled || this.#gesture || event.button !== 0 || this.editor.isEditingLocked || !this.#canTransform(target)) return
    this.startTransform(target)
    // The board owns its persistent context controls; the shared gesture
    // machinery only needs its target and the originating resize handle.
    this.overlay.setAttribute("visibility", "hidden")
    this.handleScaleStart(event)
    this.#syncControlParts()
  }

  /** Creates the arranger control: opens the float menu, or (when the
   * overlay is narrow) cycles the float value directly. */
  #createArranger() {
    const arranger = document.createElement("button")
    arranger.id = `◆transform-overlay-arranger`
    arranger.classList.add("◆transform-overlay-button")
    arranger.setAttribute("part", "transform-overlay-button transform-overlay-arranger transform-overlay-arranger-hidden")
    arranger.addEventListener("click", ev => {
      if(!this.isNarrow) {
        arranger.toggleAttribute("data-open")
        this.#syncControlParts()
      }
      else {
        const list = this.#floatValues
        const i = (list.indexOf(this.#float) + 1) % list.length
        this.#float = list[i]
      }
      ev.stopPropagation()
    })
    arranger.addEventListener("blur", (ev) => {
      if(isElement(ev.relatedTarget) && !arranger.contains(ev.relatedTarget)) {
        arranger.toggleAttribute("data-open", false)
        this.#syncControlParts()
      }
    }, {passive: true})
    const menu = this.#createArrangerMenu()
    arranger.append(menu)
    return arranger
  }

  /** The target's float value, mirrored on the arranger's data-float
   * attribute. */
  set #float(value: FloatSide) {
    const target = this.target
    if(!target || this.editor.isEditingLocked) return
    this.editor.features.manipulation.setFloat(target, value)
    this.arranger?.setAttribute("data-float", value)
    this.arranger?.toggleAttribute("data-open", false)
    this.updateInfo()
  }

  get #float() {
    return this.arranger?.getAttribute("data-float") as FloatSide ?? "none"
  }

  /** Explicit position controls use the live computed position. */
  toggleAbsoluteRelative() {
    const target = this.target
    if(!target || this.editor.isEditingLocked) return
    const position = getComputedStyle(target).position
    this.#setPosition(position === "absolute" ? "relative" : "absolute")
  }

  toggleSticky() {
    if(!this.target || this.editor.isEditingLocked) return
    this.#setPosition(getComputedStyle(this.target).position === "sticky" ? "relative" : "sticky")
  }

  /** Creates the float menu of the arranger. */
  #createArrangerMenu() {
    const buttons = this.#floatValues.map(side => {
      const button = document.createElement("button")
      button.id = `◆transform-overlay-float-${side}`
      button.setAttribute("part", `transform-overlay-button transform-overlay-float-${side}`)
      button.addEventListener("click", ev => {this.#float = side; ev.stopPropagation()})
      button.classList.add("◆transform-overlay-button")
      return button
    })
    
    const menu = document.createElement("div")
    menu.id = "◆transform-overlay-arranger-menu"
    menu.setAttribute("part", "transform-overlay-arranger-menu transform-overlay-arranger-menu-hidden")
    menu.append(...buttons)
    return menu
  }

  /** Creates the orderer control: opens the z-order menu, or (when the
   * overlay is narrow) cycles/steps the target's z-position directly. */
  #createOrderer() {
    const orderer = document.createElement("button")
    orderer.id = `◆transform-overlay-orderer`
    orderer.classList.add("◆transform-overlay-button")
    orderer.setAttribute("part", "transform-overlay-button transform-overlay-orderer transform-overlay-orderer-hidden transform-overlay-orderer-closed")
    orderer.addEventListener("click", ev => {
      if(!this.isNarrow) {
        orderer.toggleAttribute("data-open")
        this.#syncControlParts()
      }
      else if(ev.altKey) {
        this.moveZ(this.target, false)
      }
      else {
        this.moveZ(this.target, true, false, true)
      }
      ev.stopPropagation()
    })
    orderer.addEventListener("blur", (ev) => {
      if(isElement(ev.relatedTarget) && !orderer.contains(ev.relatedTarget)) {
        orderer.toggleAttribute("data-open", false)
        this.#syncControlParts()
      }
    }, {passive: true})
    const menu = this.#createOrdererMenu()
    orderer.append(menu)
    return orderer
  }

  /** Creates the z-order menu of the orderer (move forward/backward, with
   * Shift to the front/back). */
  #createOrdererMenu() {
    const zBack = document.createElement("button")
    zBack.id = `◆transform-overlay-z-back`
    zBack.setAttribute("part", "transform-overlay-button transform-overlay-z-back")
    zBack.addEventListener("click", ev => {
      this.moveZ(this.target, false, true)
      ev.stopPropagation()
    })
    zBack.classList.add("◆transform-overlay-button")
    
    const zForward = document.createElement("button")
    zForward.id = `◆transform-overlay-z-forward`
    zForward.setAttribute("part", "transform-overlay-button transform-overlay-z-forward")
    zForward.addEventListener("click", ev => {
      this.moveZ(this.target, true, ev.shiftKey)
      ev.stopPropagation()
    })
    zForward.classList.add("◆transform-overlay-button")
    
    const zBackward = document.createElement("button")
    zBackward.id = `◆transform-overlay-z-backward`
    zBackward.setAttribute("part", "transform-overlay-button transform-overlay-z-backward")
    zBackward.addEventListener("click", ev => {
      this.moveZ(this.target, false, ev.shiftKey)
      ev.stopPropagation()
    })
    zBackward.classList.add("◆transform-overlay-button")

    const zFront = document.createElement("button")
    zFront.id = `◆transform-overlay-z-front`
    zFront.setAttribute("part", "transform-overlay-button transform-overlay-z-front")
    zFront.addEventListener("click", ev => {
      this.moveZ(this.target, true, true)
      ev.stopPropagation()
    })
    zFront.classList.add("◆transform-overlay-button")
    
    const menu = document.createElement("div")
    menu.id = "◆transform-overlay-orderer-menu"
    menu.setAttribute("part", "transform-overlay-orderer-menu transform-overlay-orderer-menu-hidden")
    menu.append(zBack, zBackward, zForward, zFront)
    return menu
  }

  #createOverlay() {
    const overlay = document.createElement("div")
    overlay.id = "◆transform-overlay"
    overlay.setAttribute("part", "transform-overlay transform-overlay-hidden")
    overlay.setAttribute("visibility", "hidden")
    overlay.contentEditable = "false"
    const floatAnchor = document.createElementNS(SVG_NAMESPACE, "svg")
    floatAnchor.setAttribute("part", "transform-overlay-float-anchor")
    floatAnchor.setAttribute("aria-hidden", "true")
    this.#floatAnchorLine = document.createElementNS(SVG_NAMESPACE, "line")
    this.#floatAnchorLine.setAttribute("vector-effect", "non-scaling-stroke")
    this.#floatAnchorLine.style.display = "none"
    floatAnchor.append(this.#floatAnchorLine)
    overlay.append(floatAnchor)
    const control = (name: string, title: string, mode?: Mode) => this.#createControl(name, title, mode)
    const mover = control("mover", "Move", "move")
    const caption = control("caption", "Add caption or cycle caption position")
    caption.addEventListener("click", event => {
      event.stopPropagation()
      const target = this.target
      if(!target || this.editor.isEditingLocked || caption.hidden) return
      this.editor.features.manipulation.cycleCaption()
    })
    const deleter = control("delete", "Delete")
    const grouper = control("group", "Group")
    setPart(grouper, "transform-overlay-group-freeform", true)
    const rotator = control("rotator", "Rotate", "rotate")
    const anchor = control("anchor", "Position anchor: drag to relocate; Ctrl/Cmd-click to cycle position; Shift-click for fixed", "anchor")
    const sticky = control("anchor-sticky", "Toggle sticky positioning")
    sticky.addEventListener("click", event => { this.toggleSticky(); event.stopPropagation() })
    anchor.addEventListener("click", event => {
      if(this.#suppressClick === anchor) return
      if(event.shiftKey) this.#setPosition("fixed")
      else if(modifierKeyDown(event) && this.target) {
        const position = getComputedStyle(this.target).position
        this.#setPosition(position === "absolute" ? "relative" : position === "relative" ? "sticky" : "absolute")
      }
      event.stopPropagation()
    })
    overlay.append(
      ...["up", "right", "down", "left"].map(dir => this.#createScaler(dir, true)),
      ...["up-left", "up-right", "down-left", "down-right"].map(dir => this.#createScaler(dir)),
      ...["up", "right", "down", "left"].map(dir => {
        const point = this.#createScaler(`${dir}-${dir}`)
        point.classList.add("◆transform-overlay-midpoint")
        point.title = `Resize ${dir}`
        return point
      }),
      mover, caption, deleter, grouper, rotator, anchor, sticky, this.#createArranger(), this.#createOrderer(),
    )
    const cropFrame = document.createElement("div")
    cropFrame.setAttribute("part", "transform-overlay-crop-frame")
    cropFrame.classList.add("◆transform-overlay-crop-frame")
    const preview = document.createElement("canvas")
    preview.setAttribute("part", "transform-overlay-crop-preview")
    preview.hidden = true
    cropFrame.append(preview)
    for(const side of ["top", "right", "bottom", "left"]) {
      const mask = document.createElement("div")
      mask.setAttribute("part", "transform-overlay-crop-mask")
      mask.dataset.cropMask = side
      mask.hidden = true
      cropFrame.append(mask)
    }
    for(const direction of cropDirections) {
      const handle = control(`crop-${direction}`, `Crop ${direction}`, "crop")
      handle.dataset.cropDirection = direction
      handle.setAttribute("part", `transform-overlay-crop transform-overlay-crop-${direction}`)
      cropFrame.append(handle)
    }
    overlay.append(cropFrame)
    overlay.querySelectorAll("button").forEach(button => {
      button.type = "button"
      const label = button.title || ({
        restorer: "Reset transformations", arranger: "Float", orderer: "Stacking order",
        "float-none": "No float",
        "float-far-left": "Float left", "float-far-right": "Float right",
        "z-back": "Send to back", "z-backward": "Send backward", "z-forward": "Bring forward", "z-front": "Bring to front",
      } as Record<string, string>)[button.id.replace("◆transform-overlay-", "")]
      if(label) { button.title = label; button.setAttribute("aria-label", label) }
    })
    return overlay
  }

  get overlay() {
    const existing = this.editor.appendix.querySelector<HTMLElement>("#◆transform-overlay")
    if(existing) return existing
    const overlay = this.#createOverlay()
    this.editor.addAppendix(overlay)
    return overlay
  }

  get target() {
    return this.#target && this.#canTransform(this.#target) ? this.#target : null
  }
  get targetRect() { return this.target!.getBoundingClientRect() }
  get targetComputedStyle() { return getComputedStyle(this.target!) }
  get arranger() { return this.overlay.querySelector<HTMLElement>("#◆transform-overlay-arranger")! }
  get orderer() { return this.overlay.querySelector<HTMLElement>("#◆transform-overlay-orderer")! }
  get anchor() { return this.overlay.querySelector<HTMLElement>("#◆transform-overlay-anchor")! }
  get isNarrow() { return this.overlay.classList.contains("◆transform-overlay-narrow") }

  controlContainer(element: Element) {
    return !this.#group.length && this.target
      && (this.target === element || figureSelectionTarget(this.target) === element) ? this.overlay : null
  }

  #canTransform(element: Element): element is TransformElement {
    return (element instanceof HTMLElement || element instanceof SVGSVGElement
      || mathRoot(element) === element && element.getAttribute("display") === "block")
      && !["toggle", "content"].includes(popupElementRole(element) ?? "")
      && element !== document.documentElement && element !== document.head
      && !(this.editor.features.canvas.active && isCanvasStartingView(element))
      && !isDocumentRoot(element) && getDocumentRoot().contains(element) && this.editor.allows("select", element)
  }

  /** Called at the selection feature's invariant boundary, including capture
   * changes that do not dispatch a native selectionchange. */
  syncSelection(element: Element | null, within = false, measure = true) {
    if(!this.isEnabled) return
    if(this.#gesture) return
    if(element && this.#canTransform(element)) this.startTransform(element, measure)
    else this.clearTransform()
    setPart(this.overlay, "transform-overlay-content-selected", Boolean(this.target && within
      && !$.isElementSelection && !this.editor.features.selection.isCaptureSelection))
  }

  /** Independent live ranges remain the selection; no authored group wrapper. */
  syncGroupSelection(elements: Element[]) {
    if(!this.isEnabled || this.#gesture) return
    if(this.editor.isEditingLocked || elements.length < 2
      || !elements.every((element): element is TransformElement => this.#canTransform(element) && this.#isFreeformItem(element))) {
      this.clearTransform()
      return
    }
    if(elements.length !== this.#group.length || elements.some((element, i) => element !== this.#group[i])) {
      this.clearTransform()
      this.#group = elements
      this.#target = elements[0]
    }
    for(const element of this.#group) element.classList.add("◆transform-target")
    this.overlay.removeAttribute("visibility")
    setPart(this.overlay, "transform-overlay-content-selected", false)
    this.updateInfo()
    this.#scheduleFrame()
  }

  startTransform(element: Element, measure = true) {
    if(!this.#canTransform(element) || this.editor.isEditingLocked) return
    if(this.#target !== element || this.#group.length) {
      this.clearTransform()
      this.#target = element
    }
    if(!element.classList.contains("◆transform-target")) element.classList.add("◆transform-target")
    this.overlay.removeAttribute("visibility")
    if(measure) this.updateInfo()
    this.#scheduleFrame()
  }

  #isFreeformItem(target: Element) {
    return this.editor.features.canvas.active && target.parentElement === document.body
      || this.editor.features.slides.active && isSlide(target.parentElement)
  }

  #isGroupItem(element: Element) {
    return element.isConnected && this.#isFreeformItem(element) && !isCanvasStartingView(element)
      && !slideLayoutRole(element) && !element.matches("style,script,link,meta,template")
  }

  #groupMembers(element: Element): Element[] {
    const id = element.getAttribute(spatialGroupAttribute)
    if(!id || !this.#isGroupItem(element)) return []
    return Array.from(element.parentElement!.children).filter(peer =>
      peer.getAttribute(spatialGroupAttribute) === id && this.#isGroupItem(peer))
  }

  groupSelectionPeers(element: Element) {
    const members = this.#groupMembers(element)
    return members.length > 1 && members.every(member => this.#canTransform(member)) ? members : [element]
  }

  /** A pasted group belongs to the pasted elements, even on the same slide. */
  preparePastedGroups(elements: Element[]) {
    const groups = new Map<string, Element[]>()
    for(const element of elements) {
      const id = element.getAttribute(spatialGroupAttribute)
      if(id) {
        const members = groups.get(id) ?? []
        members.push(element)
        groups.set(id, members)
      }
    }
    for(const members of groups.values()) {
      if(members.length < 2) {
        members[0].removeAttribute(spatialGroupAttribute)
        members[0].removeAttribute(spatialGroupRotation)
      }
      else {
        const id = crypto.randomUUID()
        for(const member of members) member.setAttribute(spatialGroupAttribute, id)
      }
    }
  }

  /** A press on a group member first selects its peers. On a selected group,
   * the same press can start a move; releasing without a drag drills in. */
  handleGroupedPointer(event: PointerEvent, origin: Node, canDrag = true) {
    if(!this.isEnabled || this.#gesture || event.defaultPrevented || event.button !== 0
      || !this.editor.features.canvas.active && !this.editor.features.slides.active
      || modifierKeyDown(event) || event.shiftKey || event.pointerType === "touch" && !event.isPrimary) return false
    let item = origin instanceof Element ? origin : origin.parentElement
    while(item && !this.#isGroupItem(item)) item = item.parentElement
    if(!item || !this.#canTransform(item)) return false
    const members = this.#groupMembers(item)
    if(members.length < 2 || !members.every(member => this.#canTransform(member))) return false
    const selected = $.selectedElements
    const target = item
    const inside = (node: Node | null) => Boolean(node && target.contains(node))
    if(!$.isMultiElementSelection && (inside($.selectedElement ?? null)
      || inside(this.editor.features.selection.captureSelectedElement)
      || inside($.anchor) && inside($.focus))) return false

    const wasSelected = this.#isCompleteGroup(selected) && selected.includes(item)
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#groupPress = item
    if(wasSelected && canDrag && this.#validGroupSelection()
      && this.#begin(event, "move", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!)) {
      this.#gesture!.group!.clickedMember = item
      return true
    }
    if(!wasSelected) this.#selectGroup(members)
    else {
      const selection = this.editor.features.selection
      selection.withoutSelectionScroll(() => selection.selectElement(item))
      this.editor.postSelectionPath()
    }
    return true
  }

  #selectGroup(members: Element[]) {
    this.editor.features.table.clearCellSelection(false)
    $.selectElements(members)
    this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    this.editor.postSelectionPath()
  }

  #isCompleteGroup(elements: Element[]) {
    if(elements.length < 2) return false
    const members = this.#groupMembers(elements[0])
    if(members.length !== elements.length) return false
    const selected = new Set(elements)
    return members.every(member => selected.has(member))
  }

  #groupingTargets(elements: Element[]) {
    const parent = elements[0]?.parentElement
    if(!parent || !elements.every(element => this.#isGroupItem(element) && element.parentElement === parent)) return []
    const ids = new Set(elements.map(element => element.getAttribute(spatialGroupAttribute)).filter(Boolean))
    if(!ids.size) return elements
    return [...new Set([...elements, ...Array.from(parent.children).filter(peer =>
      ids.has(peer.getAttribute(spatialGroupAttribute)) && this.#isGroupItem(peer))])]
  }

  groupingState(elements: Element[]) {
    const targets = this.#groupingTargets(elements)
    if(!targets.length) return
    const editable = !this.editor.isEditingLocked && targets.every(target => this.#canTransform(target) && this.editor.allows("style", target))
    const ids = new Set<string>()
    const grouped = targets.some(target => {
      const id = target.getAttribute(spatialGroupAttribute)
      if(!id) return false
      if(ids.has(id)) return true
      ids.add(id)
      return false
    })
    return {
      canGroup: editable && elements.length > 1 && !this.#isCompleteGroup(elements),
      canUngroup: editable && grouped,
    }
  }

  setSpatialGrouping(mode: "group" | "ungroup") {
    if(!this.isEnabled || this.#gesture || !["group", "ungroup"].includes(mode)) return false
    const single = this.editor.features.manipulation.topLevelStyleTarget
    const elements = $.isMultiElementSelection ? $.selectedElements : single ? [single] : []
    const state = this.groupingState(elements)
    if(mode === "group" ? !state?.canGroup : !state?.canUngroup) return false
    const targets = this.#groupingTargets(elements)
    const id = mode === "group" ? crypto.randomUUID() : null
    const end = this.editor.doc.beginUndoGroup()
    try {
      for(const target of targets) {
        if(id) target.setAttribute(spatialGroupAttribute, id)
        else target.removeAttribute(spatialGroupAttribute)
        target.removeAttribute(spatialGroupRotation)
      }
      if(id) $.selectElements(targets)
    }
    finally { end() }
    this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    this.editor.postSelectionPath()
    return true
  }

  actions = {
    setSpatialGrouping: ({mode}: {type: "setSpatialGrouping", mode: "group" | "ungroup"}) => this.setSpatialGrouping(mode),
  }

  #isTextContainer(target: Element) {
    return target instanceof HTMLElement && target.matches("p:not([is]), h1:not([is]), h2:not([is]), h3:not([is]), h4:not([is]), h5:not([is]), h6:not([is])")
      || mathRoot(target) === target && target.getAttribute("display") === "block"
  }

  #isBoardCardQuiz(target: Element) {
    // The quiz uses inline-size containment; a width cap can squeeze its
    // question to single-character lines inside a fixed-width board card.
    return target.localName === "webwriter-quiz" && Boolean(this.editor.features.board.containingCard(target))
  }

  #resizeAlignment(target: TransformElement) {
    if(this.#isFreeformItem(target)) return "left"
    const style = getComputedStyle(target)
    const authoredFloat = floatSideFromStyles(style.float, target.style, target.classList)
    const float = style.getPropertyValue("--ww-responsive-float").trim() === "none" ? "none"
      : authoredFloat !== "none" && style.float === "right" ? "far-right" : authoredFloat
    if(float !== "none") return float === "far-right" ? "right" : "left"
    // Typed OM retains auto margins; getComputedStyle resolves them to pixels.
    const margins = target.computedStyleMap?.()
    const marginLeft = margins?.get("margin-left")?.toString() ?? (target.style.marginLeft === "auto" ? "auto" : style.marginLeft)
    const marginRight = margins?.get("margin-right")?.toString() ?? (target.style.marginRight === "auto" ? "auto" : style.marginRight)
    if(marginLeft === "auto" || marginRight === "auto") return alignmentFromStyles({marginLeft, marginRight})
    if(margins || target.style.marginLeft || target.style.marginRight) return "left"
    const left = parseFloat(marginLeft) || 0, right = parseFloat(marginRight) || 0
    return left > 0 && Math.abs(left - right) < .5 ? "center" : left > right ? "right" : "left"
  }

  #syncControlParts() {
    const overlay = this.overlay
    const allows = (permission: "move" | "delete" | "style" | "edit") => this.#group.length
      ? this.#group.every(element => this.editor.allows(permission, element)) : this.editor.allows(permission, this.target)
    const position = this.target ? getComputedStyle(this.target).position || "static" : "static"
    const freeform = Boolean(this.target && this.#isFreeformItem(this.target))
    const text = Boolean(this.target && !freeform && this.#isTextContainer(this.target))
    const boardQuiz = Boolean(this.target && this.#isBoardCardQuiz(this.target))
    const persistent = this.#isCompleteGroup(this.#group)
    const hideGroupResize = this.#group.length > 0 && !persistent
    const corner = this.target && this.#resizeAlignment(this.target) === "right" ? "down-left" : "down-right"
    setPart(overlay, "transform-overlay-freeform", freeform)
    setPart(overlay, "transform-overlay-capture-selected", freeform && this.editor.features.selection.captureSelectedElement === this.target)
    for(const midpoint of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-midpoint")) {
      const hide = !allows("style") || hideGroupResize || !freeform && !(boardQuiz && midpoint.dataset.resizeDirection === "down-down")
      midpoint.hidden = hide
      setPart(midpoint, "transform-overlay-scale-hidden", hide)
    }
    for(const scaler of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not(.◆transform-overlay-midpoint)")) {
      const hide = !allows("style") || hideGroupResize || !freeform && (boardQuiz || scaler.dataset.resizeDirection !== corner)
      scaler.hidden = hide
      setPart(scaler, "transform-overlay-scale-hidden", hide)
      setPart(scaler, "transform-overlay-scale-text", text)
    }
    for(const edge of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-edge")) {
      edge.dataset.transformMode = "move"
      edge.style.pointerEvents = allows("move") ? "" : "none"
      edge.draggable = allows("move") && !this.editor.features.canvas.active && !this.editor.features.slides.active
      setPart(edge, "transform-overlay-edge-move", true)
    }
    setPart(overlay, "transform-overlay-hidden", overlay.hasAttribute("visibility"))
    setPart(overlay, "transform-overlay-narrow", this.isNarrow)
    const hidden = (name: string, hide: boolean) => {
      const control = overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!
      setPart(control, `transform-overlay-${name}-hidden`, hide)
      control.hidden = hide
    }
    hidden("rotator", !allows("style") || !freeform || (this.#group.length
      ? !persistent && !this.#group.every(element => getComputedStyle(element).position === "absolute" && !isCanvasStartingView(element))
      : position !== "absolute" || Boolean(this.target && isCanvasStartingView(this.target))))
    hidden("orderer", true)
    hidden("mover", freeform || !allows("move"))
    const captionPosition = this.editor.features.manipulation.getCaptionPosition()
    const captionAlignment = this.editor.features.manipulation.getCaptionAlignment() ?? "left"
    const caption = overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!
    hidden("caption", !allows("edit") || freeform || !this.target || captionPosition === null)
    caption.style.setProperty("--icon", `url("data:image/svg+xml,${encodeURIComponent(captionIconSource(captionPosition ?? "none", captionAlignment, true))}")`)
    caption.title = captionPosition === "none" ? "Add caption" : `Caption ${captionPosition}, align ${captionAlignment}: cycle position`
    caption.setAttribute("aria-label", caption.title)
    overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!.draggable =
      !this.editor.features.canvas.active && !this.editor.features.slides.active
    hidden("delete", !allows("delete"))
    setPart(overlay.querySelector("#◆transform-overlay-delete")!, "transform-overlay-delete-freeform", freeform)
    const grouping = this.#group.length > 1 ? this.groupingState(this.#group) : undefined
    const grouper = overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-group")!
    hidden("group", !(persistent ? grouping?.canUngroup : grouping?.canGroup))
    if(!grouper.hidden) {
      grouper.dataset.groupingAction = persistent ? "ungroup" : "group"
      grouper.title = persistent ? "Ungroup" : "Group"
      grouper.setAttribute("aria-label", grouper.title)
      grouper.style.setProperty("--ww-spatial-group-icon", `url("data:image/svg+xml,${encodeURIComponent(persistent ? ungroupIcon : groupIcon)}")`)
    }
    hidden("arranger", true)
    hidden("anchor", true)
    hidden("anchor-sticky", true)
    for(const name of ["arranger", "orderer"]) {
      const control = name === "arranger" ? this.arranger : this.orderer
      const open = !control.hidden && control.hasAttribute("data-open")
      hidden(`${name}-menu`, !open)
      control.setAttribute("aria-expanded", String(open))
      setPart(control, `transform-overlay-${name}-open`, open)
      setPart(control, `transform-overlay-${name}-closed`, !open)
    }
    setPart(this.orderer, "transform-overlay-orderer-narrow", this.isNarrow)
    for(const value of this.#floatValues) {
      setPart(this.arranger, `transform-overlay-arranger-float-${value}`, this.#float === value)
      hidden(`float-${value}`, this.#float === value)
    }
    setPart(overlay.querySelector("#◆transform-overlay-anchor-sticky")!, "transform-overlay-anchor-sticky-active", position === "sticky")
  }

  /** The linear part of the actual CSS transform, including ancestors.
   * Translation and transform-origin are already reflected in the live rect. */
  #matrix(element: Element | null, matrices?: WeakMap<Element, DOMMatrix>): DOMMatrix {
    if(!element) return new DOMMatrix()
    const cached = matrices?.get(element)
    if(cached) return cached
    const style = getComputedStyle(element)
    const angle = this.#angle(style.getPropertyValue("rotate"))
    const scale = this.#scale(style.getPropertyValue("scale"))
    const zoom = cssZoomFactor(style)
    const own = new DOMMatrix().scale(zoom).rotate(angle).scale(scale[0], scale[1])
      .multiply(new DOMMatrix(style.transform && style.transform !== "none" ? style.transform : undefined))
    own.e = own.f = 0
    const matrix = this.#matrix(renderedParentElement(element), matrices).multiply(own)
    matrices?.set(element, matrix)
    return matrix
  }

  /** Whether an appendix frame needs local dimensions and a transform matrix
   * instead of the anchor's ordinary viewport-aligned border box. */
  boxTransformed(element: Element, matrices?: WeakMap<Element, DOMMatrix>) {
    for(let current: Element | null = element; current; current = renderedParentElement(current)) {
      if(current.getAnimations?.().some(animation => (animation.playState === "running" || animation.pending)
        && (animation.effect as KeyframeEffect | null)?.getKeyframes?.().some(frame =>
          ["transform", "rotate", "scale", "zoom"].some(property => property in frame)))) return true
    }
    const matrix = this.#matrix(element, matrices)
    return !matrix.is2D || matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1
  }

  #angle(value: string) {
    const angle = (value || "0").trim().split(/\s+/).at(-1) ?? "0"
    const n = parseFloat(angle) || 0
    return angle.endsWith("grad") ? n * .9 : angle.endsWith("rad") ? n * 180 / Math.PI : angle.endsWith("turn") ? n * 360 : n
  }

  #scale(value: string) {
    const values = (value || "1").trim().split(/\s+/).map(value => {
      const number = parseFloat(value)
      return Number.isFinite(number) ? number / (value.endsWith("%") ? 100 : 1) : 1
    })
    return [values[0], values[1] ?? values[0]]
  }

  #size(element: TransformElement, matrices?: WeakMap<Element, DOMMatrix>, rect?: DOMRect) {
    const style = getComputedStyle(element)
    const extra = (properties: string[]) => properties.reduce((sum, property) => sum + (parseFloat(style.getPropertyValue(property)) || 0), 0)
    const paddingWidth = style.boxSizing === "border-box" ? 0 : extra(["padding-left", "padding-right", "border-left-width", "border-right-width"])
    const paddingHeight = style.boxSizing === "border-box" ? 0 : extra(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"])
    let cssWidth = pixelSize(style.width), cssHeight = pixelSize(style.height)
    if(cssWidth === undefined || cssHeight === undefined) {
      // Inline widget hosts can retain percentages or auto in computed style.
      // The live rect is already a border box; transformed hosts need their
      // local layout dimensions so the overlay does not apply scale twice.
      rect ??= element.getBoundingClientRect()
      const matrix = this.#matrix(element, matrices)
      const transformed = matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1
      const width = transformed && element instanceof HTMLElement ? element.offsetWidth || rect.width : rect.width
      const height = transformed && element instanceof HTMLElement ? element.offsetHeight || rect.height : rect.height
      cssWidth ??= Math.max(0, width - paddingWidth)
      cssHeight ??= Math.max(0, height - paddingHeight)
    }
    return {
      cssWidth, cssHeight,
      width: cssWidth + paddingWidth,
      height: cssHeight + paddingHeight,
    }
  }

  #vector(matrix: DOMMatrix, x: number, y: number) {
    return {x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y}
  }

  get targetOriginRect(): DOMRect {
    const target = this.target
    if(!target) return new DOMRect()
    const position = (getComputedStyle(target).position || "static") as "static" | "relative" | "absolute" | "fixed" | "sticky"
    if(position === "relative" || position === "sticky") {
      const [top, left] = getStaticCoords(target as HTMLElement)
      return new DOMRect(left, top, 0, 0)
    }
    const block = findContainingBlock(target as HTMLElement, position)
    if(block === window) return new DOMRect(position === "fixed" ? 0 : -window.scrollX, position === "fixed" ? 0 : -window.scrollY, window.innerWidth, window.innerHeight)
    const element = block as HTMLElement
    const rect = element.getBoundingClientRect()
    return new DOMRect(rect.left + element.clientLeft - element.scrollLeft, rect.top + element.clientTop - element.scrollTop, element.clientWidth, element.clientHeight)
  }

  #mediaCropInsets(media: HTMLImageElement | HTMLVideoElement) {
    const crop = this.#gesture?.crop
    return crop?.target === media ? crop.edges : null
  }

  /** Border-box geometry shared by transform, selection and hover overlays.
   * Matrices may be shared only within one synchronous batch of layout reads. */
  boxGeometry(element: TransformElement, cropped = true, matrices = new WeakMap<Element, DOMMatrix>(), measuredRect?: DOMRect): BoxGeometry {
    if(element.localName === "figure" && Array.from(element.classList).some(name => name.startsWith("◆figure-flow-"))) {
      const content = captionedFigureContent(element)
      if(content && this.#canTransform(content)) return this.boxGeometry(content, cropped, matrices)
    }
    let rect = measuredRect ?? element.getBoundingClientRect()
    let {width, height} = this.#size(element, matrices, rect)
    let matrix = this.#matrix(element, matrices)
    if(element instanceof HTMLElement && !element.hasAttribute("is") && isWebsiteType(element.localName)) {
      // Keep the embed's own zoom in the frame dimensions so it does not
      // scale the outline or handles. Pointer gestures still use the full matrix.
      const zoom = cssZoomFactor(getComputedStyle(element))
      width *= zoom
      height *= zoom
      matrix = matrix.scale(1 / zoom)
    }
    const media = cropped ? this.editor.features.media.cropTargetFor(element) : null
    const insets = media && this.#mediaCropInsets(media)
    if(media && insets?.some(value => value)) {
      const source = this.boxGeometry(media, false, matrices)
      if(element.localName === "figure") {
        const visible = this.boxGeometry(media, true, matrices)
        const caption = element.querySelector<HTMLElement>(":scope > figcaption")
        const inverse = matrix.inverse()
        const local = (point: {x: number, y: number}) => this.#vector(inverse, point.x - rect.left - rect.width / 2, point.y - rect.top - rect.height / 2)
        const mediaPoints = visible.corners.map(local)
        const points = [...mediaPoints, ...(caption ? this.boxGeometry(caption, false, matrices).corners.map(local) : [])]
        const left = Math.min(...mediaPoints.map(point => point.x)), right = Math.max(...mediaPoints.map(point => point.x))
        const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y))
        width = right - left
        height = bottom - top
        const shift = this.#vector(matrix, (left + right) / 2, (top + bottom) / 2)
        const w = Math.abs(matrix.a) * width + Math.abs(matrix.c) * height, h = Math.abs(matrix.b) * width + Math.abs(matrix.d) * height
        rect = new DOMRect(rect.left + rect.width / 2 + shift.x - w / 2, rect.top + rect.height / 2 + shift.y - h / 2, w, h)
      }
      else {
        matrix = source.matrix
        width = source.width * (1 - (insets[1] + insets[3]) / 100)
        height = source.height * (1 - (insets[0] + insets[2]) / 100)
        const shift = this.#vector(source.matrix, source.width * (insets[3] - insets[1]) / 200, source.height * (insets[0] - insets[2]) / 200)
        const cx = source.rect.left + source.rect.width / 2 + shift.x, cy = source.rect.top + source.rect.height / 2 + shift.y
        const w = Math.abs(source.matrix.a) * width + Math.abs(source.matrix.c) * height
        const h = Math.abs(source.matrix.b) * width + Math.abs(source.matrix.d) * height
        rect = new DOMRect(cx - w / 2, cy - h / 2, w, h)
      }
    }
    const corners = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => {
      const point = this.#vector(matrix, x, y)
      return {x: rect.left + rect.width / 2 + point.x, y: rect.top + rect.height / 2 + point.y}
    })
    const styles = {
      width: `${width}px`, height: `${height}px`,
      left: `${rect.left + rect.width / 2 - width / 2}px`,
      top: `${rect.top + rect.height / 2 - height / 2}px`,
      transform: `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, 0, 0)`,
    }
    return {rect, width, height, matrix, styles, corners}
  }

  updateInfo(measuredRect?: DOMRect) {
    const target = this.target
    if(!target) { if(this.#target) this.clearTransform(); return }
    if(this.#group.length) {
      this.#clearGroupContext()
      this.#anchors.release(this.overlay); this.#anchored = false
      if(!this.#validGroupSelection()) { this.clearTransform(); return }
      this.#observeGeometry(this.#group)
      const angle = this.#gesture?.group?.angle ?? (this.#isCompleteGroup(this.#group) ? this.#groupAngle(this.#group) : 0)
      const {width, height, center, matrix} = this.#positionGroupFrame(this.overlay, this.#group, angle, this.isResizingOrRotatingGroup)
      this.overlay.querySelector<HTMLElement>('[part="transform-overlay-crop-frame"]')!.hidden = true
      this.#positionFlowControls(width, height, [])
      this.overlay.classList.toggle("◆transform-overlay-narrow", width < 120)
      setPart(this.overlay, "transform-overlay-at-top", center.y - (Math.abs(matrix.b) * width + Math.abs(matrix.d) * height) / 2 < 50)
      if(!this.#gesture) this.#syncControlParts()
      return
    }
    const members = this.#groupMembers(target).filter((element): element is TransformElement => this.#canTransform(element))
    this.#updateGroupContext(members)
    this.#observeGeometry(members.length > 1 ? members : [target])
    const matrices = new WeakMap<Element, DOMMatrix>()
    const {rect, width, height, matrix, styles, corners} = this.boxGeometry(target, true, matrices, measuredRect)
    const overlay = this.overlay
    // A custom element can paint an out-of-flow shadow child while its host
    // has no box. Its own controls own that geometry; do not draw at BODY@0.
    if(rect.width <= 0 || rect.height <= 0) {
      overlay.setAttribute("visibility", "hidden")
      this.#floatAnchorLine!.style.display = "none"
      this.editor.features.selection.clearTransformCaret()
      this.#syncControlParts()
      return
    }
    const floats = this.editor.features.selection.floatExclusions(target, rect, styles)
    const media = this.editor.features.media.cropTargetFor(target)
    const crop = media ? getComputedStyle(media).getPropertyValue("object-view-box") : "none"
    const flowResize = this.#gesture?.mode === "scale" && this.#isTextContainer(target)
    const anchored = !this.#isFreeformItem(target) && !floats.length && !captionedFigureContent(target) && (!crop || crop === "none")
      && (flowResize ? matrix.isIdentity : !this.#gesture && !this.boxTransformed(target, matrices))
    const style = getComputedStyle(target)
    const {float, zIndex} = style
    const position = (style.position || "static") as "static" | "relative" | "absolute" | "fixed" | "sticky"
    const block = findContainingBlock(target as HTMLElement, position)
    const corner = block instanceof Element ? block.getBoundingClientRect()
      : {left: position === "fixed" ? 0 : -window.scrollX, top: position === "fixed" ? 0 : -window.scrollY}
    const freeform = this.#isFreeformItem(target)
    const contextBlock = this.#gesture && freeform && ["absolute", "relative", "sticky"].includes(position) ? block : null
    const scroller = this.#gesture && freeform && position === "sticky" ? findScrollingAncestor(target.parentElement as HTMLElement) ?? null : null
    const fixedLeft = anchored ? styles.left : `${fixedClientX(parseFloat(styles.left))}px`
    const wasAnchored = this.#anchored
    this.#positionFloatAnchor(target, float, corners[0], matrix)
    this.#anchored = anchored
    overlay.removeAttribute("visibility")
    this.#positionCropControls(target, width, height, rect, matrix)
    this.#positionFlowControls(width, height, floats)
    if(this.#anchored) {
      for(const property of ["left", "top", "width", "height", "transform"]) overlay.style.removeProperty(property)
      this.#anchors.bind(overlay, target)
      if(!wasAnchored || !this.#gesture) this.#anchors.refresh()
      this.editor.features.selection.anchorTransformCaret(target)
    }
    else {
      this.#anchors.release(overlay)
      Object.assign(overlay.style, {...styles, left: fixedLeft})
      this.editor.features.selection.positionTransformCaret(target, overlay.style, floats)
    }
    overlay.classList.toggle("◆transform-overlay-narrow", rect.width < 120)
    const centerY = rect.top + rect.height / 2
    const controlRadius = 8 * (Math.abs(matrix.b) + Math.abs(matrix.d))
    const rotateTop = centerY + matrix.d * (-height / 2 - 34) - controlRadius
    const ordererTop = centerY + matrix.b * (width / 2 + 3) + matrix.d * (-height / 2 - 22) - controlRadius
    // Copyright and Delete share the top row at opposite corners.
    const cornerControlsTop = freeform
      ? centerY - Math.abs(matrix.b) * (width / 2 + 3) + matrix.d * (-height / 2 - 34) - controlRadius
      : Infinity
    setPart(overlay, "transform-overlay-at-top", Math.min(rotateTop, ordererTop, cornerControlsTop) < 0)
    const transformedContent = captionedFigureContent(target)
    overlay.classList.toggle("◆transform-overlay-changed", ["rotate", "scale", "width", "height", "max-width", "max-height", "position", "top", "left", "float", "z-index"].some(key => target.style.getPropertyValue(key))
      || Boolean(transformedContent && ["rotate", "scale", "translate", "transform"].some(key => (transformedContent as TransformElement).style?.getPropertyValue(key))))
    // Controls stay in the transformed overlay, but sit upright at the live
    // containing block's corner, with the sticky toggle just below the anchor.
    if(matrix.is2D && Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) >= 1e-8) {
      const inverse = matrix.inverse()
      for(const [name, offset] of [["anchor", 0], ["anchor-sticky", 22]] as const) {
        const point = this.#vector(inverse, corner.left - rect.left - rect.width / 2, corner.top + offset - rect.top - rect.height / 2)
        Object.assign(overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!.style, {
          left: `${width / 2 + point.x}px`, top: `${height / 2 + point.y}px`,
          transform: `matrix(${inverse.a}, ${inverse.b}, ${inverse.c}, ${inverse.d}, 0, 0)`,
        })
      }
    }
    this.arranger.setAttribute("data-float", floatSideFromStyles(float || "none", target.style, target.classList))
    this.orderer.setAttribute("data-z-order", zIndex === "auto" ? "0" : zIndex || "0")
    if(!this.#gesture) this.#syncControlParts()
    this.#updateContextMarkers(contextBlock, scroller)
  }

  #positionFloatAnchor(target: TransformElement, side: string, start: {x: number, y: number}, matrix: DOMMatrix) {
    const line = this.#floatAnchorLine!
    const parent = renderedParentElement(target)
    if((side !== "left" && side !== "right") || documentLayoutMode() !== "document" || !parent
      || !matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) {
      line.style.display = "none"
      return
    }

    // A float can be pushed down by earlier floats or pinned during scroll.
    // Locate its insertion point from the surrounding in-flow content.
    const adjacent = (direction: "next" | "previous") => {
      for(let node = flowSibling(target, direction); node; node = flowSibling(node, direction)) {
        if(node instanceof Element) {
          const rect = node.getBoundingClientRect()
          if(rect.width && rect.height) return {rect, block: !getComputedStyle(node).display.startsWith("inline")}
        }
        else if(node instanceof Text && node.data.trim()) {
          const range = document.createRange()
          range.selectNodeContents(node)
          const rect = Array.from(range.getClientRects?.() ?? []).at(direction === "next" ? 0 : -1)
          if(rect) return {rect, block: false}
        }
      }
    }
    const next = adjacent("next")
    const previous = next ? undefined : adjacent("previous")
    const anchor = next ?? previous
    const edge = side === "left" ? "right" : "left"
    const parentRect = parent.getBoundingClientRect()
    const parentStyle = getComputedStyle(parent)
    const inset = (edge: string) => (parseFloat(parentStyle.getPropertyValue(`padding-${edge}`)) || 0)
      + (parseFloat(parentStyle.getPropertyValue(`border-${edge}-width`)) || 0)
    const x = anchor?.block ? anchor.rect[edge] : parentRect[edge] + (side === "left" ? -1 : 1) * inset(edge)
    const y = next?.rect.top ?? previous?.rect.bottom ?? parentRect.top + inset("top")
    const end = this.#vector(matrix.inverse(), x - start.x, y - start.y)
    line.setAttribute("x2", String(end.x))
    line.setAttribute("y2", String(end.y))
    line.style.removeProperty("display")
  }

  #positionCropControls(target: TransformElement, width: number, height: number, rect: DOMRect, matrix: DOMMatrix) {
    const frame = this.overlay.querySelector<HTMLElement>(".◆transform-overlay-crop-frame")!
    const preview = frame.querySelector("canvas")!
    const media = this.editor.features.media.cropTargetFor(target)
    const cropping = this.#gesture?.crop?.target === media
    preview.hidden = !cropping
    if(!cropping && preview.width) { preview.width = 0; preview.height = 0 }
    const insets = media && (this.#mediaCropInsets(media) ?? [0, 0, 0, 0])
    frame.hidden = !media || !insets || !this.editor.features.media.canCrop(media)
    if(!media || !insets || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) return
    const box = this.boxGeometry(media, false)
    if(box.width <= 0 || box.height <= 0) { frame.hidden = true; return }
    const inverse = matrix.inverse()
    const center = this.#vector(inverse, box.rect.left + box.rect.width / 2 - rect.left - rect.width / 2,
      box.rect.top + box.rect.height / 2 - rect.top - rect.height / 2)
    const relative = inverse.multiply(box.matrix)
    Object.assign(frame.style, {width: `${box.width}px`, height: `${box.height}px`,
      left: `${width / 2 + center.x - box.width / 2}px`, top: `${height / 2 + center.y - box.height / 2}px`,
      transform: `matrix(${relative.a}, ${relative.b}, ${relative.c}, ${relative.d}, 0, 0)`})
    const [top, right, bottom, left] = insets
    const viewport = cropping && media ? this.editor.features.media.cropViewport(media) : null
    const sourceLeft = viewport ? (viewport.x - viewport.left * viewport.sx) / box.width * 100 : 0
    const sourceTop = viewport ? (viewport.y - viewport.top * viewport.sy) / box.height * 100 : 0
    const sourceWidth = viewport ? viewport.width * viewport.sx / box.width * 100 : 100
    const sourceHeight = viewport ? viewport.height * viewport.sy / box.height * 100 : 100
    const minLeft = Math.min(0, sourceLeft), minTop = Math.min(0, sourceTop)
    const maxRight = Math.max(100, sourceLeft + sourceWidth), maxBottom = Math.max(100, sourceTop + sourceHeight)
    if(viewport && media) {
      Object.assign(preview.style, {left: `${sourceLeft}%`, top: `${sourceTop}%`, width: `${sourceWidth}%`, height: `${sourceHeight}%`})
      const pixelWidth = Math.max(1, Math.ceil(viewport.width * viewport.sx * devicePixelRatio))
      const pixelHeight = Math.max(1, Math.ceil(viewport.height * viewport.sy * devicePixelRatio))
      if(preview.width !== pixelWidth || preview.height !== pixelHeight) { preview.width = pixelWidth; preview.height = pixelHeight }
      const context = preview.getContext("2d")
      if(context) {
        context.clearRect(0, 0, preview.width, preview.height)
        // A video may not have a decoded frame yet. Keep the live authored
        // surface visible until drawing the full source becomes possible.
        if(media instanceof HTMLImageElement ? media.complete && media.naturalWidth > 0
          : media.readyState >= 2 && media.videoWidth > 0 && media.videoHeight > 0) {
          context.drawImage(media, 0, 0, preview.width, preview.height)
        }
      }
    }
    const masks = {
      top: {left: `${minLeft}%`, top: `${minTop}%`, width: `${maxRight - minLeft}%`, height: `${top - minTop}%`},
      bottom: {left: `${minLeft}%`, top: `${100 - bottom}%`, width: `${maxRight - minLeft}%`, height: `${maxBottom - 100 + bottom}%`},
      left: {left: `${minLeft}%`, top: `${top}%`, width: `${left - minLeft}%`, height: `${100 - top - bottom}%`},
      right: {left: `${100 - right}%`, top: `${top}%`, width: `${maxRight - 100 + right}%`, height: `${100 - top - bottom}%`},
    }
    for(const mask of frame.querySelectorAll<HTMLElement>("[data-crop-mask]")) {
      mask.hidden = this.#gesture?.crop?.target !== media
      Object.assign(mask.style, masks[mask.dataset.cropMask as keyof typeof masks])
    }
    for(const handle of frame.querySelectorAll<HTMLElement>("[data-crop-direction]")) {
      const direction = handle.dataset.cropDirection!
      const left = insets[3], right = 100 - insets[1], top = insets[0], bottom = 100 - insets[2]
      handle.style.left = `${direction.includes("left") ? left : direction.includes("right") ? right : (left + right) / 2}%`
      handle.style.top = `${direction.includes("up") ? top : direction.includes("down") ? bottom : (top + bottom) / 2}%`
    }
  }

  /** Place controls on the text spans at the contour's top and bottom. The
   * authored border box remains the source of truth for resize gestures. */
  #positionFlowControls(width: number, height: number, floats: {left: number, right: number, top: number, bottom: number}[]) {
    const overlay = this.overlay
    const frames = [overlay, this.editor.features.selection.selectionCaret].filter((frame): frame is HTMLElement => Boolean(frame))
    if(!floats.length) {
      for(const frame of frames) for(const property of Array.from(frame.style)) if(property.startsWith("--selection-flow-")) frame.style.removeProperty(property)
      return
    }
    const span = (y: number) => {
      let spans = [{left: 0, right: width}]
      // Overlay geometry is rounded to CSS pixels; an edge that visually
      // coincides with a float can differ by a fraction of a pixel.
      for(const box of floats.filter(box => box.top <= y + 1 && box.bottom >= y - 1)) {
        spans = spans.flatMap(part => box.right <= part.left || box.left >= part.right ? [part]
          : [...(box.left > part.left ? [{left: part.left, right: box.left}] : []), ...(box.right < part.right ? [{left: box.right, right: part.right}] : [])])
      }
      const outside = Math.min(0, ...floats.filter(box => box.top <= y + 1 && box.bottom >= y - 1).map(box => box.left)) - 12
      return spans.sort((a, b) => (b.right - b.left) - (a.right - a.left))[0] ?? {left: outside, right: outside}
    }
    const top = span(0), bottom = span(height)
    const bounds = {"top-left": top.left, "top-right": top.right, "bottom-left": bottom.left, "bottom-right": bottom.right,
      left: Math.min(top.left, bottom.left), right: Math.max(top.right, bottom.right),
      "handle-delete-right": top.right < width ? 0 : -10,
      "handle-top-left": top.left > 0 ? -4 : -7, "handle-top-right": top.right < width ? -4 : -7,
      "handle-bottom-left": bottom.left > 0 ? -4 : -7, "handle-bottom-right": bottom.right < width ? -4 : -7,
      "handle-left": Math.min(top.left, bottom.left) > 0 ? -4 : -7, "handle-right": Math.max(top.right, bottom.right) < width ? -4 : -7}
    for(const frame of frames) for(const [property, value] of Object.entries(bounds)) frame.style.setProperty(`--selection-flow-${property}`, `${value}px`)
  }

  #scheduleFrame(invalidate = true) {
    if(invalidate) this.#geometryFrameDirty = true
    if(this.#frame !== null || !this.isEnabled || !this.target || this.#anchored && !this.#gesture) return
    this.#frame = requestAnimationFrame(() => {
      if(this.#gesture && !this.#validGesture()) { this.#frame = null; return }
      // Discover existing animations before pointer handling can write styles
      // and force a synchronous style/layout update.
      const coalesced = this.#coalescesGeometry
      const animating = coalesced && Boolean(document.getAnimations?.().some(animation =>
        (animation.effect as KeyframeEffect | null)?.target?.getRootNode() === document))
      const anchoredResize = this.#anchored && this.#gesture?.mode === "scale"
      if(anchoredResize && (this.#geometryFrameDirty || animating)) {
        // The CSS anchor follows the upcoming size change. Read control
        // geometry before writing widths so the browser can lay them out normally.
        this.#geometryFrameDirty = animating
        this.updateInfo()
        this.editor.features.graphic.refresh()
      }
      // Keep this frame registered while applying input so its style writes
      // and geometry refresh share one animation frame.
      const preview = this.#flushPointer()
      this.#frame = null
      // A paused gesture still needs live validation. Only remeasure
      // after an invalidation or while authored animation can move its boxes.
      if((!anchoredResize || !this.#anchored) && (!coalesced || this.#geometryFrameDirty || animating)) {
        this.#geometryFrameDirty = animating
        this.updateInfo(preview?.rect)
        if(preview?.movement) this.#showMovementOverlay(preview.movement, preview.left)
        this.editor.features.graphic.refresh()
      }
      if(this.#gesture || this.#observedElements.some(element => element.getAnimations?.().some(animation => animation.playState === "running"))) this.#scheduleFrame(false)
    })
  }

  #flushPointer() {
    const event = this.#pendingPointer
    this.#pendingPointer = null
    if(!event || !this.#gesture || this.#gesture.pointerId !== event.pointerId) return
    this.#lastPointer = event
    let preview: {rect?: DOMRect, movement?: MovementPreview, left?: number} | undefined
    if(this.#gesture.mode === "scale") {
      const rect = this.handleScaleDrag(event)
      if(rect) preview = {rect}
    }
    else if(this.#gesture.mode === "crop") this.handleCropDrag(event)
    else if(this.#gesture.mode === "rotate") this.handleRotateDrag(event)
    else preview = this.handleMoveDrag(event, true)
    const target = this.canvasPlacementTarget
    // Route these synchronous placement edits through the existing local
    // figure invalidation. Unrelated pending mutations still refresh broadly.
    if(target && !target.matches("figure, :has(figure)")) this.editor.features.layout.refreshFigureLayout(target)
    return preview
  }

  #updateContextMarkers(block: Element | Window | null = null, scroller: Element | null = null) {
    for(const [marker, current] of [["◆transform-containing-block", block], ["◆transform-scrolling-ancestor", scroller]] as const) {
      document.querySelectorAll(`.${marker}`).forEach(element => { if(element !== current) removeEditorMarker(element, marker) })
      if(current instanceof Element && !current.classList.contains(marker)) current.classList.add(marker)
    }
  }

  getRoundingFunc(event: MouseEvent) {
    return event.altKey ? roundByDPR : this.#gesture?.mode === "rotate"
      ? (n: number) => roundTo(n, event.shiftKey ? 45 : 5)
      : (n: number) => roundTo(n, 10)
  }

  hasStableGroupSelection(selected: Element[]) {
    const group = (this.#gesture ?? this.#settlingGesture)?.group
    return Boolean(group && !this.editor.isEditingLocked && this.#validGroupSelection(selected)
      && group.members.every(member => member.target.parentElement === member.parent))
  }

  get isResizingOrRotatingGroup() {
    const gesture = this.#gesture
    return Boolean(gesture?.group && (gesture.mode === "scale" || gesture.mode === "rotate"))
  }

  get canvasPlacementTarget() {
    const gesture = this.#gesture
    if(!this.editor.features.canvas.active || !gesture || gesture.group || !gesture.target.isConnected
      || gesture.mode !== "rotate" && !this.#isSpatialMove(gesture)) return null
    const {target, initial, written} = gesture
    const properties = new Set([...Array.from(initial), ...Array.from(target.style), ...written.keys()])
    // A widget or remote peer can edit this same element during a drag.
    // Only defer work while its inline styles still match our own writes.
    for(const property of properties) {
      if(property === "z-index") continue // The move can raise its target at pickup.
      const last = written.get(property)
      if(target.style.getPropertyValue(property) !== (last?.value ?? initial.getPropertyValue(property))
        || target.style.getPropertyPriority(property) !== (last?.priority ?? initial.getPropertyPriority(property))) return null
    }
    return target
  }

  #isSpatialMove(gesture: Gesture) {
    return gesture.mode === "move" && this.#isFreeformItem(gesture.target)
  }

  get #coalescesGeometry() {
    const gesture = this.#gesture
    return Boolean(gesture && (gesture.group ? this.isResizingOrRotatingGroup
      : gesture.mode === "scale" || gesture.mode === "rotate" || this.#isSpatialMove(gesture)))
  }

  stableSingleTransformTarget() {
    const gesture = this.#gesture ?? this.#settlingGesture
    if(!gesture || gesture.group || gesture.captured || gesture.mode !== "scale" && gesture.mode !== "rotate" && !this.#isSpatialMove(gesture)
      || this.#drop || this.#normalDropRange || this.editor.isEditingLocked) return null
    const {target, parent} = gesture
    if(!target.isConnected || target.parentElement !== parent || !target.classList.contains("◆element-selected")
      || this.editor.features.selection.isCaptureSelection || this.editor.features.selection.selectedSectionElement
      || this.editor.features.table.hasCellSelection) return null
    const ranges = $.ranges
    const range = ranges[0]
    return ranges.length === 1 && range.startContainer === parent && range.endContainer === parent
      && range.endOffset === range.startOffset + 1 && parent.childNodes[range.startOffset] === target ? target : null
  }

  /** Publish the toolbar state once after the gesture and its observers,
   * or immediately if the selection moves elsewhere. */
  deferTransformSelectionState(state: "selectionPathPending" | "markStatePending") {
    const gesture = this.#gesture ?? this.#settlingGesture
    if(!gesture) return false
    if(gesture.group) {
      if(gesture.mode !== "scale" && gesture.mode !== "rotate" || this.editor.features.selection.isCaptureSelection
        || this.editor.features.selection.selectedSectionElement || this.editor.features.table.hasCellSelection
        || !this.hasStableGroupSelection($.selectedElements)) return false
    }
    else if(!this.stableSingleTransformTarget()) return false
    gesture[state] = true
    return true
  }

  #validGroupSelection(selected = $.selectedElements) {
    const group = this.#gesture?.group
    return this.#group.length > 1 && selected.length === this.#group.length
      && this.#group.every((element, i) => element === selected[i] && this.#canTransform(element) && this.#isFreeformItem(element))
      && (!group?.persistent || this.#isCompleteGroup(this.#group)
        && group.members.every(member => member.target.getAttribute(spatialGroupRotation) === member.groupRotation))
  }

  #groupRect(rects = Array.from(this.#groupBoxes(this.#group).values(), box => box.rect)) {
    const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top))
    return new DOMRect(left, top, Math.max(...rects.map(rect => rect.right)) - left, Math.max(...rects.map(rect => rect.bottom)) - top)
  }

  #groupAngle(elements: Element[]) {
    const value = elements[0].getAttribute(spatialGroupRotation)
    const angle = Number(value)
    return Number.isFinite(angle) && elements.every(element => element.getAttribute(spatialGroupRotation) === value) ? angle % 360 : 0
  }

  #groupGeometry(boxes: Iterable<BoxGeometry>, angle: number) {
    const matrix = new DOMMatrix().rotate(angle)
    const inverse = matrix.inverse()
    const corners = Array.from(boxes).flatMap(box => box.corners.map(point => inverse.transformPoint(point)))
    const left = Math.min(...corners.map(point => point.x)), right = Math.max(...corners.map(point => point.x))
    const top = Math.min(...corners.map(point => point.y)), bottom = Math.max(...corners.map(point => point.y))
    const center = matrix.transformPoint({x: (left + right) / 2, y: (top + bottom) / 2})
    return {width: right - left, height: bottom - top, center, matrix}
  }

  #groupBoxes(elements: TransformElement[], matrices = new WeakMap<Element, DOMMatrix>()) {
    return new Map(elements.map(element => [element, this.boxGeometry(element, true, matrices)]))
  }

  #positionGroupFrame(frame: HTMLElement, elements: TransformElement[], angle: number, positionOutlines = false) {
    const matrices = new WeakMap<Element, DOMMatrix>()
    const boxes = this.#groupBoxes(elements, matrices)
    const geometry = this.#groupGeometry(boxes.values(), angle)
    if(positionOutlines) this.editor.features.selection.positionGroupOutlines(boxes, matrices)
    const {width, height, center} = geometry
    Object.assign(frame.style, {left: `${fixedClientX(center.x - width / 2)}px`, top: `${center.y - height / 2}px`,
      width: `${width}px`, height: `${height}px`, transform: `rotate(${angle}deg)`})
    return geometry
  }

  #clearGroupContext() {
    this.#groupContext?.remove()
    this.#groupContext = null
  }

  #updateGroupContext(members: TransformElement[]) {
    if(members.length < 2) { this.#clearGroupContext(); return }
    if(!this.#groupContext) {
      this.#groupContext = document.createElement("button")
      this.#groupContext.type = "button"
      this.#groupContext.setAttribute("part", "transform-overlay transform-overlay-group-context")
      this.#groupContext.setAttribute("aria-label", "Select group")
      for(const direction of ["up", "right", "down", "left"]) {
        const edge = document.createElement("span")
        edge.setAttribute("part", `transform-overlay-edge transform-overlay-edge-${direction} transform-overlay-group-context-edge`)
        this.#groupContext.append(edge)
      }
      this.editor.addAppendix(this.#groupContext)
    }
    this.#groupContext.disabled = this.editor.isEditingLocked || !this.#isCompleteGroup(members)
    for(const edge of this.#groupContext.children) setPart(edge, "transform-overlay-group-context-edge-disabled", this.#groupContext.disabled)
    this.#positionGroupFrame(this.#groupContext, members, this.#groupAngle(members))
  }

  #observeGeometry(elements: Element[]) {
    if(this.#observedElements.length === elements.length && elements.every((element, i) => this.#observedElements[i] === element)) return
    this.#resizeObserver?.disconnect()
    for(const element of elements) this.#resizeObserver?.observe(element)
    this.#resizeObserver?.observe(document.body)
    this.#observedElements = elements
  }

  #beginGroup(event: MouseEvent, mode: Mode, handle: HTMLElement) {
    const persistent = this.#isCompleteGroup(this.#group)
    if(!this.#validGroupSelection() || !["move", "rotate", "scale"].includes(mode) || mode === "scale" && !persistent
      || mode === "rotate" && !persistent && !this.#group.every(element => getComputedStyle(element).position === "absolute" && !isCanvasStartingView(element))) return false
    const boxes = this.#groupBoxes(this.#group)
    const rect = this.#groupRect(Array.from(boxes.values(), box => box.rect))
    const angle = persistent ? this.#groupAngle(this.#group) : 0
    const {width, height, center, matrix} = this.#groupGeometry(boxes.values(), angle)
    const members = this.#group.map(target => {
      const initial = document.createElement("div").style
      initial.cssText = target.style.cssText
      const transform = getComputedStyle(target).transform
      return {target, parent: target.parentElement, rect: target.getBoundingClientRect(), initial, written: new Map<string, StyleValue>(),
        matrix: this.#matrix(target), transform: new DOMMatrix(transform && transform !== "none" ? transform : undefined),
        size: this.#size(target), groupRotation: target.getAttribute(spatialGroupRotation)}
    })
    if(width <= 0 || height <= 0 || members.some(({matrix}) => !matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8)) return false
    event.preventDefault()
    document.body.focus({preventScroll: true})
    if(!this.#validGroupSelection()) return false
    const first = members[0]
    this.#gesture = {...first, mode, handle, pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
      x: event.clientX, y: event.clientY, rect, width, height, cssWidth: width, cssHeight: height,
      matrix, parentMatrix: this.#matrix(renderedParentElement(first.target)), rotate: angle, scale: [1, 1],
      moved: false, captured: false, group: {members, center, angle, persistent}, endUndoGroup: this.editor.doc.beginUndoGroup()}
    this.editor.features.canvas.setMinimapRefreshPaused(true)
    this.#suppressClick = null
    if(event instanceof PointerEvent) {
      try { handle.setPointerCapture?.(event.pointerId) }
      catch { this.#finish(true); return false }
    }
    if(this.#coalescesGeometry) this.#scheduleFrame()
    return true
  }

  #dragGroup(event: MouseEvent) {
    const gesture = this.#gesture!, group = gesture.group!
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if(!gesture.moved && Math.hypot(dx, dy) < (gesture.mode === "move" ? 8 : 1)) return
    gesture.moved = true
    this.#resetWritten()
    const round = this.getRoundingFunc(event)
    const {x: cx, y: cy} = group.center
    let transform = new DOMMatrix()
    let movement: MovementPreview | undefined
    let resize: {x: number, y: number, inverse: DOMMatrix} | undefined
    if(gesture.mode === "move") {
      movement = this.#snapMovement(event, dx, dy)
      transform = transform.translate(movement.offset.x, movement.offset.y)
      document.body.classList.add("◆transform-moving")
    }
    else if(gesture.mode === "rotate") {
      const degrees = (Math.atan2(event.clientY - cy, event.clientX - cx) - Math.atan2(gesture.y - cy, gesture.x - cx)) * 180 / Math.PI
      const delta = round(degrees)
      group.angle = (gesture.rotate + delta) % 360
      transform = transform.translate(cx, cy).rotate(delta).translate(-cx, -cy)
      document.body.classList.add("◆transform-rotating")
    }
    else {
      const direction = gesture.handle.dataset.resizeDirection ?? ""
      const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
      const y = direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
      const centered = modifierKeyDown(event)
      const factor = centered ? 2 : 1
      const inverse = gesture.matrix.inverse()
      const local = this.#vector(inverse, dx, dy)
      const minX = Math.min(1, 1 / gesture.width), minY = Math.min(1, 1 / gesture.height)
      let sx = Math.max(minX, 1 + (x ? round(local.x * x * factor) / gesture.width : 0))
      let sy = Math.max(minY, 1 + (y ? round(local.y * y * factor) / gesture.height : 0))
      if(event.shiftKey) sx = sy = Math.max(minX, minY, Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy)
      const anchor = this.#vector(gesture.matrix, centered ? 0 : x * gesture.width / 2, centered ? 0 : y * gesture.height / 2)
      const ax = cx - anchor.x, ay = cy - anchor.y
      transform = transform.translate(ax, ay).multiply(gesture.matrix).scale(sx, sy).multiply(inverse).translate(-ax, -ay)
      resize = {x: sx, y: sy, inverse}
      document.body.classList.add(`◆transform-scaling-${x && y ? x === y ? "nwse" : "nesw" : x ? "ew" : "ns"}`)
    }
    const linear = new DOMMatrix([transform.a, transform.b, transform.c, transform.d, 0, 0])
    // Apply each member's size or transform before measuring any of the new
    // boxes. Keep the live measurements for CSS constraints and transform
    // origins, but don't force layout again for each member's style writes.
    for(const member of group.members) {
      if(resize) {
        // Resize each member in its own axes. CSS layout can reflow content
        // while the member's authored rotation, scale and padding stay intact.
        const axes = resize.inverse.multiply(member.matrix)
        const widthFactor = Math.hypot(resize.x * axes.a, resize.y * axes.b) / Math.hypot(axes.a, axes.b)
        const heightFactor = Math.hypot(resize.x * axes.c, resize.y * axes.d) / Math.hypot(axes.c, axes.d)
        const {width, height, cssWidth, cssHeight} = member.size
        this.#resizeDimension(member, "width", cssWidth, width * (widthFactor - 1))
        this.#resizeDimension(member, "height", cssHeight, height * (heightFactor - 1))
      }
      else if(gesture.mode === "rotate") {
        // Post-compose in the element's own axes. Individual CSS transforms,
        // ancestor zoom and authored origins are included in its live matrix.
        const local = member.matrix.inverse().multiply(linear).multiply(member.matrix)
        this.#write("transform", member.transform.multiply(local).toString(), "", member)
      }
    }
    const matrices = new WeakMap<Element, DOMMatrix>()
    const offsets = group.members.flatMap(member => {
      const center = transform.transformPoint({x: member.rect.left + member.rect.width / 2, y: member.rect.top + member.rect.height / 2})
      const current = member.target.getBoundingClientRect()
      const dx = center.x - current.left - current.width / 2, dy = center.y - current.top - current.height / 2
      if(Math.abs(dx) < .01 && Math.abs(dy) < .01) return []
      const delta = this.#vector(this.#matrix(renderedParentElement(member.target), matrices).inverse(), dx, dy)
      return [{member, delta, needsPosition: getComputedStyle(member.target).position === "static"}]
    })
    // Used insets depend on positioning mode and can resolve against the new
    // size. Read them before writing any of the placement corrections.
    for(const {member, needsPosition} of offsets) if(needsPosition) this.#write("position", "relative", "", member)
    const positions = offsets.map(({member, delta}) => ({member, offset: this.#readOffset(member.target, delta)}))
    for(const {member, offset} of positions) {
      this.#writeOffset(offset, member)
    }
    if(movement) {
      this.#showMovementOverlay(movement)
      this.updateInfo()
      this.#schedulePan(event)
    }
    else this.#scheduleFrame()
  }

  #resizeDimension(styles: GestureStyles, property: "width" | "height", size: number, delta: number) {
    if(property === "width" && delta < 0) {
      delta = Math.max(delta, (pixelSize(getComputedStyle(styles.target).minWidth) ?? 0) - size)
    }
    if(Math.abs(delta) < .01) {
      for(const key of [property, `max-${property}`]) if(styles.written.has(key)) {
        this.#write(key, styles.initial.getPropertyValue(key), styles.initial.getPropertyPriority(key), styles)
      }
      return
    }
    const value = `${Math.max(1, size + delta)}px`
    this.#write(property, value, styles.initial.getPropertyPriority(property), styles)
    this.#write(`max-${property}`, value, styles.initial.getPropertyPriority(`max-${property}`), styles)
  }

  #schedulePan(event: MouseEvent) {
    this.#panEvent = event
    if(this.editor.features.canvas.active && this.#panFrame === null) {
      this.#panFrame = requestAnimationFrame(() => {
        this.#panFrame = null
        const pointer = this.#panEvent
        if(pointer && !this.#pendingPointer && this.#validGesture()
          && this.editor.features.canvas.panAtEdge({x: pointer.clientX, y: pointer.clientY})) this.handleMoveDrag(pointer)
      })
    }
  }

  #begin(event: MouseEvent, mode: Mode, handle: HTMLElement) {
    const target = this.target
    if(!(this.#group.length ? this.#group : target ? [target] : []).every(element => this.editor.allows(mode === "move" ? "move" : "style", element))) return false
    if(!target || this.#gesture || this.editor.isEditingLocked || event.button !== 0 || mode === "scale" && handle.hidden) return false
    if(this.#group.length) return this.#beginGroup(event, mode, handle)
    if(mode === "crop" && !cropDirections.some(direction => direction === handle.dataset.cropDirection)) return false
    if(mode === "rotate" && (!this.#isFreeformItem(target) || getComputedStyle(target).position !== "absolute" || isCanvasStartingView(target))) return false
    const matrix = this.#matrix(target)
    if(!matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) return false
    const media = mode === "crop" ? this.editor.features.media.cropTargetFor(target) : null
    const insets = media && this.editor.features.media.canCrop(media) ? [0, 0, 0, 0] : null
    const sourceStyle = document.createElement("div").style
    sourceStyle.cssText = media?.style.cssText ?? ""
    const cropBox = media ? this.boxGeometry(media, false) : null
    if(mode === "crop" && (!media || !insets || !cropBox || cropBox.width <= 0 || cropBox.height <= 0
      || !cropBox.matrix.is2D || Math.abs(cropBox.matrix.a * cropBox.matrix.d - cropBox.matrix.b * cropBox.matrix.c) < 1e-8)) return false
    if(this.#isFreeformItem(target)) {
      document.body.focus({preventScroll: true})
      this.editor.features.selection.selectElement(target)
      if(this.target !== target || !target.isConnected || !this.#isFreeformItem(target) || $.selectedElement !== target) return false
    }
    const initial = document.createElement("div").style
    initial.cssText = target.style.cssText
    const style = getComputedStyle(target)
    const content = captionedFigureContent(target)
    const rotationTarget = mode === "rotate" && content && this.#canTransform(content) ? content : null
    if(mode === "rotate" && target.matches("figure:not([is])") && target.querySelector(":scope > figcaption") && !rotationTarget) return false
    const figureImage = mode === "scale" ? this.#canvasFigureImage(target) : null
    const picture = figureImage?.parentElement instanceof HTMLPictureElement ? figureImage.parentElement : null
    if(figureImage && (!this.#canTransform(figureImage) || !this.editor.allows("style", figureImage))
      || picture && !this.editor.allows("style", picture)) return false
    const pictureStyle = picture ? document.createElement("div").style : null
    if(pictureStyle && picture) pictureStyle.cssText = picture.style.cssText
    const image = rotationTarget ?? figureImage ?? (mode === "scale" && target.localName === "picture" ? this.editor.features.media.transformMediaFor(target) : null)
    const imageStyle = document.createElement("div").style
    imageStyle.cssText = image?.style.cssText ?? ""
    const endUndoGroup = this.editor.doc.beginUndoGroup()
    this.#gesture = {
      target, parent: target.parentElement, mode, handle,
      pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
      x: event.clientX, y: event.clientY, rect: (rotationTarget ?? target).getBoundingClientRect(), ...this.#size(target),
      matrix, parentMatrix: this.#matrix(renderedParentElement(rotationTarget ?? target)), rotate: this.#angle(getComputedStyle(rotationTarget ?? target).getPropertyValue("rotate")), scale: this.#scale(style.getPropertyValue("scale")),
      initial, written: new Map(), moved: false,
      image: image && this.#canTransform(image) ? {target: image, parent: image.parentElement, initial: imageStyle, written: new Map()} : undefined,
      figureImage: figureImage ? {...this.#size(figureImage),
        picture: picture && pictureStyle ? {target: picture, initial: pictureStyle, written: new Map(), ...this.#size(picture)} : undefined} : undefined,
      canvas: mode === "scale" ? this.#canvasViewport(target) : undefined,
      crop: media && insets && cropBox ? {target: media, parent: media.parentElement, width: cropBox.width, height: cropBox.height,
        matrix: cropBox.matrix, insets, edges: [...insets], sourceStyle} : undefined,
      captured: this.editor.features.selection.captureSelectedElement === target,
      endUndoGroup,
    }
    if(mode === "scale") this.#gesture.resizeCentered = !this.#isFreeformItem(target) && this.#resizeAlignment(target) === "center"
    if(mode === "scale" && this.editor.features.layout.canSetFullWidth(target)
      && (target.classList.contains("ww-full-width") || document.documentElement.clientWidth >= 720 && this.editor.features.manipulation.floatColumnSide())) {
      const parent = target.parentElement!, parentStyle = getComputedStyle(parent)
      const threshold = parent.getBoundingClientRect().width - (parseFloat(parentStyle.borderLeftWidth) || 0)
        - (parseFloat(parentStyle.borderRightWidth) || 0) - (parseFloat(parentStyle.paddingLeft) || 0) - (parseFloat(parentStyle.paddingRight) || 0)
      const inColumns = document.documentElement.clientWidth >= 720 && this.editor.features.manipulation.floatColumnSide()
      if(threshold > 0) this.#gesture.fullWidth = {initial: target.classList.contains("ww-full-width"), written: target.classList.contains("ww-full-width"), threshold: inColumns ? threshold : null}
    }
    this.#suppressClick = null
    if(mode === "crop") {
      document.body.classList.add(`◆transform-cropping-${handle.dataset.cropDirection}`)
      this.updateInfo()
    }
    event.preventDefault()
    if(event instanceof PointerEvent) {
      try { handle.setPointerCapture?.(event.pointerId) }
      catch { this.#finish(true); return false }
    }
    // Activating a canvas or slide move raises the item even without displacement.
    if(mode === "move" && this.#isFreeformItem(target)) {
      this.moveZ(target, true, true)
    }
    if(this.#coalescesGeometry) this.editor.features.canvas.setMinimapRefreshPaused(true)
    this.updateInfo()
    this.#scheduleFrame()
    return true
  }

  #canvasFigureImage(target: Element) {
    if(!this.editor.features.canvas.active || target.parentElement !== document.body
      || !target.matches("figure:not([is]):has(> figcaption)")) return null
    const image = this.editor.features.media.transformMediaFor(target)
    return image instanceof HTMLImageElement ? image : null
  }

  #canvasViewport(target: TransformElement) {
    if(!(target instanceof SVGSVGElement) || standaloneGraphicShape(target)) return
    const {cssWidth: width, cssHeight: height} = this.#size(target)
    if(width <= 0 || height <= 0) return
    const initial = target.getAttribute("viewBox")
    const values = initial?.trim().split(/[\s,]+/).map(Number)
    let [x, y, w, h] = values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? values : [0, 0, width, height]
    const aspect = target.getAttribute("preserveAspectRatio") || "xMidYMid meet"
    if(!aspect.includes("none")) {
      const scale = Math[aspect.includes("slice") ? "max" : "min"](width / w, height / h)
      const align = (axis: string) => aspect.includes(`${axis}Min`) ? 0 : aspect.includes(`${axis}Max`) ? 1 : .5
      x -= (width / scale - w) * align("x")
      y -= (height / scale - h) * align("Y")
      w = width / scale
      h = height / scale
    }
    return {initial, written: initial, x, y, width: w, height: h}
  }

  #writeCanvasViewBox(value: string | null) {
    const gesture = this.#gesture!
    if(gesture.target.getAttribute("viewBox") !== value) {
      if(value === null) gesture.target.removeAttribute("viewBox")
      else gesture.target.setAttribute("viewBox", value)
    }
    gesture.canvas!.written = value
  }

  #validGesture() {
    const gesture = this.#gesture
    if(!gesture) return false
    const picture = gesture.figureImage?.picture
    const properties = gesture.mode === "move" || gesture.mode === "anchor"
      ? ["position", "left", "right", "top", "bottom"]
      : gesture.mode === "rotate" ? ["position", "left", "right", "top", "bottom", "rotate"]
      : ["position", "left", "right", "top", "bottom", "width", "height", "max-width", "max-height", "scale", "aspect-ratio"]
    // Input can wait for a frame before the first write. A newer authored
    // placement or size must invalidate that input even when written is empty.
    if((gesture.group?.members ?? [gesture, gesture.image, picture]).some(styles => styles && properties.some(key =>
      !styles.written.has(key) && (styles.target.style.getPropertyValue(key) !== styles.initial.getPropertyValue(key)
        || styles.target.style.getPropertyPriority(key) !== styles.initial.getPropertyPriority(key))))) {
      this.#finish(true)
      return false
    }
    if(!(gesture.group?.members ?? [gesture, gesture.image, picture]).every(styles => !styles
      || this.editor.allows(gesture.mode === "move" ? "move" : "style", styles.target))) {
      this.#finish(true)
      return false
    }
    if(gesture.group && (!this.#validGroupSelection() || gesture.group.members.some(member =>
      member.parent !== member.target.parentElement || [...member.written].some(([key, last]) =>
        member.target.style.getPropertyValue(key) !== last.value || member.target.style.getPropertyPriority(key) !== last.priority)))) {
      this.#finish(true)
      return false
    }
    if(gesture.crop && (this.editor.features.media.cropTargetFor(gesture.target) !== gesture.crop.target || gesture.crop.parent !== gesture.crop.target.parentElement
      || gesture.crop.target.style.getPropertyValue("object-view-box") !== gesture.crop.sourceStyle.getPropertyValue("object-view-box")
      || gesture.crop.target.style.getPropertyPriority("object-view-box") !== gesture.crop.sourceStyle.getPropertyPriority("object-view-box")
      || ([[gesture.crop.target, gesture.crop.sourceStyle], [gesture.target, gesture.initial]] as const).some(([element, initial]) =>
        ["width", "height", "max-width", "max-height", "object-fit", "object-position", "clip-path"].some(property =>
          element.style.getPropertyValue(property) !== initial.getPropertyValue(property)
          || element.style.getPropertyPriority(property) !== initial.getPropertyPriority(property))))
      || gesture.canvas && gesture.target.getAttribute("viewBox") !== gesture.canvas.written
      || picture && [...picture.written].some(([key, last]) => picture.target.style.getPropertyValue(key) !== last.value
        || picture.target.style.getPropertyPriority(key) !== last.priority)
      || gesture.image && ((gesture.mode === "rotate" ? captionedFigureContent(gesture.target) !== gesture.image.target
        : gesture.figureImage ? this.#canvasFigureImage(gesture.target) !== gesture.image.target
        : this.editor.features.media.transformMediaFor(gesture.target) !== gesture.image.target) || gesture.image.parent !== gesture.image.target.parentElement
        || [...gesture.image.written].some(([key, last]) => gesture.image!.target.style.getPropertyValue(key) !== last.value
          || gesture.image!.target.style.getPropertyPriority(key) !== last.priority))
      || gesture.fullWidth && gesture.target.classList.contains("ww-full-width") !== gesture.fullWidth.written
      || this.editor.isEditingLocked || gesture.target !== this.target || gesture.parent !== gesture.target.parentElement
      || [...gesture.written].some(([key, last]) => gesture.target.style.getPropertyValue(key) !== last.value
        || gesture.target.style.getPropertyPriority(key) !== last.priority)) {
      this.#finish(true)
      return false
    }
    return true
  }

  #write(property: string, value: string, priority = "", gesture: GestureStyles | null = this.#gesture) {
    const target = gesture?.target ?? this.target
    if(!target) return
    if(target.style.getPropertyValue(property) !== value || target.style.getPropertyPriority(property) !== priority) {
      if(value) target.style.setProperty(property, value, priority)
      else target.style.removeProperty(property)
    }
    gesture?.written.set(property, {value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property)})
  }

  #resetWritten() {
    const gesture = this.#gesture!
    for(const styles of gesture.group?.members ?? [gesture, gesture.image, gesture.figureImage?.picture]) if(styles) {
      for(const property of styles.written.keys()) this.#write(property, styles.initial.getPropertyValue(property), styles.initial.getPropertyPriority(property), styles)
    }
  }

  /** Adjust offsets by the measured viewport displacement. Measuring after a
   * mode/size change accounts for margins, borders, scrollers and CSS origins. */
  #offsetBy(dx: number, dy: number, styles: GestureStyles | null = this.#gesture) {
    if(!this.editor.features.canvas.active && !this.editor.features.slides.active) return false
    const target = styles?.target ?? this.target!
    if(Math.abs(dx) < .01 && Math.abs(dy) < .01) return false
    const delta = this.#vector(this.#matrix(renderedParentElement(target)).inverse(), dx, dy)
    if(getComputedStyle(target).position === "static") this.#write("position", "relative", "", styles)
    this.#writeOffset(this.#readOffset(target, delta), styles)
    return true
  }

  #readOffset(target: TransformElement, delta: {x: number, y: number}) {
    const style = getComputedStyle(target)
    const x = parseFloat(style.left), y = parseFloat(style.top)
    const left = Number.isFinite(x) ? x : -(parseFloat(style.right) || 0)
    const top = Number.isFinite(y) ? y : -(parseFloat(style.bottom) || 0)
    return {left: left + delta.x, top: top + delta.y}
  }

  #writeOffset({left, top}: {left: number, top: number}, styles: GestureStyles | null) {
    this.#write("right", "auto", "", styles)
    this.#write("bottom", "auto", "", styles)
    this.#write("left", `${left}px`, "", styles)
    this.#write("top", `${top}px`, "", styles)
  }

  #setPosition(position: string) {
    if(!this.editor.features.canvas.active && !this.editor.features.slides.active) return
    if(!this.target || this.editor.isEditingLocked) return
    const rect = this.targetRect
    const size = this.#size(this.target)
    this.#write("position", position)
    if(position === "absolute" || position === "fixed") {
      this.#write("width", `${size.cssWidth}px`)
      this.#write("height", `${size.cssHeight}px`)
    }
    this.#write("left", "0px")
    this.#write("top", "0px")
    this.#write("right", "auto")
    this.#write("bottom", "auto")
    const current = this.targetRect
    this.#offsetBy(rect.left - current.left, rect.top - current.top)
    this.updateInfo()
  }

  /** Fits a shape's viewport without moving its geometry on screen. Measuring
   * the new screen matrix also accounts for CSS rotation and transform origins. */
  fitGraphicBounds(graphic: SVGSVGElement, bounds: {x: number, y: number, width: number, height: number}, screen: DOMMatrixInit) {
    if(this.target !== graphic || this.#gesture || this.editor.isEditingLocked) return
    const before = DOMMatrix.fromMatrix(screen)
    const local = this.#matrix(graphic).inverse().multiply(before)
    const width = bounds.width * Math.hypot(local.a, local.b)
    const height = bounds.height * Math.hypot(local.c, local.d)
    if(![width, height].every(value => Number.isFinite(value) && value > 0)) return
    const values = [bounds.x, bounds.y, bounds.width, bounds.height].map(value => String(Math.round(value * 100) / 100))
    if(graphic.getAttribute("viewBox") === values.join(" ")) return
    graphic.setAttribute("viewBox", values.join(" "))
    this.#write("width", `${width}px`)
    this.#write("height", `${height}px`)
    this.#write("max-width", "none")
    this.#write("max-height", "none")
    const after = graphic.getScreenCTM?.()
    if(after) this.#offsetBy(before.e - after.e, before.f - after.f)
    this.updateInfo()
  }

  handleMoveStart(event: MouseEvent) {
    this.#begin(event, "move", this.anchor)
    if(this.#gesture && !this.#gesture.group && this.target) this.editor.features.manipulation.prepareFloatDropTargets(this.target)
  }
  handleScaleStart(event: MouseEvent) {
    const handle = event.composedPath()[0] ?? event.target
    if(handle instanceof HTMLElement && handle.dataset.transformMode === "scale") this.#begin(event, "scale", handle)
  }
  handleRotateStart(event: MouseEvent) { this.#begin(event, "rotate", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!) }

  handleMoveDrag(event: MouseEvent, deferOverlay = false) {
    if(!this.#validGesture()) return
    const gesture = this.#gesture!
    if(gesture.mode !== "move" && gesture.mode !== "anchor") return
    if(gesture.group) { this.#dragGroup(event); return }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if(!gesture.moved && Math.hypot(dx, dy) < 8) return
    const overlayLeft = fixedClientX(0)
    gesture.moved = true
    document.body.classList.add("◆transform-moving")
    if(gesture.mode === "anchor" || modifierKeyDown(event) || !this.editor.features.canvas.active && !this.editor.features.slides.active) {
      if(this.#panFrame !== null) cancelAnimationFrame(this.#panFrame)
      this.#panFrame = null
      this.#panEvent = null
      this.#clearMovementOverlay()
      this.#resetWritten()
      this.#previewDrop(event)
      this.updateInfo()
      return
    }
    this.#clearDrop()
    const position = getComputedStyle(gesture.target).position || "static"
    if(position === "static") this.#setPosition("absolute")
    const current = this.targetRect
    const movement = this.#snapMovement(event, dx, dy, current)
    const moved = this.#offsetBy(gesture.rect.left + movement.offset.x - current.left, gesture.rect.top + movement.offset.y - current.top)
    this.editor.features.layout.refreshFigureLayout(gesture.target)
    if(!deferOverlay) this.#showMovementOverlay(movement, overlayLeft)
    this.#scheduleFrame()
    this.#schedulePan(event)
    if(deferOverlay) return {rect: moved ? undefined : current, movement, left: overlayLeft}
  }

  /** Snap the live visual box, rather than the distance from an off-grid start.
   * All calculations use client coordinates, including camera pan and zoom. */
  #snapMovement(event: MouseEvent, dx: number, dy: number, current?: DOMRect): MovementPreview {
    const gesture = this.#gesture!, root = gesture.target.parentElement!
    const canvas = this.editor.features.canvas
    const slides = this.editor.features.slides
    const zoom = canvas.active ? canvas.zoom : slides.zoom
    const world = canvas.active ? canvas.clientPoint(0, 0) : slides.clientPoint(root, 0, 0)
    const origin = {x: -world.x * zoom, y: -world.y * zoom}
    const area = canvas.active ? new DOMRect(0, 0, window.innerWidth, window.innerHeight) : root.getBoundingClientRect()
    const selected = new Set(gesture.group?.members.map(member => member.target) ?? [gesture.target])
    // Keep peer geometry for a gesture; authored changes and viewport movement
    // invalidate it so collaborative edits still use the live DOM.
    const pending = this.#observer?.takeRecords() ?? []
    if(pending.some(record => isAuthoredMutation(record) && !Array.from(selected).some(item => item === record.target || item === record.target.parentElement))) this.#movementPeers = null
    const anchors = (start: number, size: number) => [start, start + size / 2, start + size]
    if(this.#movementPeers?.root !== root || this.#movementPeers.boxes.some(({item}) => !item.isConnected || item.parentElement !== root)) {
      const boxes = canvas.items(root).map(item => ({item, rect: item.getBoundingClientRect()}))
        .filter(({rect}) => rect.width > 0 && rect.height > 0)
      const horizontal: {value: number, kind: string}[] = [], vertical: {value: number, kind: string}[] = []
      for(const {item, rect} of boxes) if(!selected.has(item) && !isCanvasStartingView(item)) {
        for(const value of anchors(rect.left, rect.width)) horizontal.push({value, kind: "object"})
        for(const value of anchors(rect.top, rect.height)) vertical.push({value, kind: "object"})
      }
      this.#movementPeers = {root, boxes, horizontal, vertical}
    }
    const boxes = this.#movementPeers.boxes
    const candidates = (axis: "x" | "y") => {
      const start = axis === "x" ? "left" : "top", size = axis === "x" ? "width" : "height"
      const targets = axis === "x" ? this.#movementPeers!.horizontal : this.#movementPeers!.vertical
      return canvas.active ? targets : [...targets, ...anchors(area[start], area[size]).map(value => ({value, kind: "canvas"}))]
    }
    const locked = event.shiftKey ? Math.abs(dx) >= Math.abs(dy) ? "y" : "x" : null
    const offset = {x: dx, y: dy}
    const guides: Partial<Record<"x" | "y", {value: number, kind: string}>> = {}
    for(const axis of ["x", "y"] as const) {
      if(locked === axis) { offset[axis] = 0; continue }
      if(event.altKey) { offset[axis] = roundByDPR(offset[axis]); continue }
      const start = axis === "x" ? gesture.rect.left : gesture.rect.top
      const size = axis === "x" ? gesture.rect.width : gesture.rect.height
      const value = start + offset[axis]
      const snap = closestAlignment(anchors(value, size), candidates(axis), 6)
      offset[axis] += snap?.delta ?? origin[axis] + roundTo((value - origin[axis]) / zoom, canvasGridSize) * zoom - value
      if(snap) guides[axis] = snap.target
    }
    let mask: DOMRect[] = []
    if(!canvas.active) {
      const base = current ?? this.#groupRect()
      mask = boxes.map(({item, rect}) => {
        if(!selected.has(item)) return rect
        const box = gesture.group ? rect : base
        return new DOMRect(box.left + gesture.rect.left + offset.x - base.left,
          box.top + gesture.rect.top + offset.y - base.top, box.width, box.height)
      })
    }
    return {offset, area, origin, zoom, boxes: mask, guides}
  }

  #showMovementOverlay({area, origin, zoom, boxes, guides}: MovementPreview, left = fixedClientX(0)) {
    if(!this.#movementOverlay) {
      this.#movementOverlay = document.createElementNS(SVG_NAMESPACE, "svg")
      this.#movementOverlay.setAttribute("part", "transform-movement-overlay")
      this.#movementOverlay.setAttribute("aria-hidden", "true")
      Object.assign(this.#movementOverlay.style, {position: "fixed", top: "0", pointerEvents: "none", zIndex: "0", overflow: "hidden"})
      this.editor.addAppendix(this.#movementOverlay)
    }
    const overlay = this.#movementOverlay
    if(overlay.style.left !== `${left}px`) overlay.style.left = `${left}px`
    if(overlay.getAttribute("width") !== String(window.innerWidth)) overlay.setAttribute("width", String(window.innerWidth))
    if(overlay.getAttribute("height") !== String(window.innerHeight)) overlay.setAttribute("height", String(window.innerHeight))
    const svg = (name: string, attributes: Record<string, string | number>, parent: Element = overlay, selector = name) => {
      const element = parent.querySelector(`:scope > ${selector}`) ?? document.createElementNS(SVG_NAMESPACE, name)
      for(const [key, value] of Object.entries(attributes)) if(element.getAttribute(key) !== String(value)) element.setAttribute(key, String(value))
      if(element.parentNode !== parent) parent.append(element)
      return element
    }
    if(!this.editor.features.canvas.active) {
      const step = canvasGridSize * zoom
      const defs = svg("defs", {})
      const pattern = svg("pattern", {id: "◆transform-grid-pattern", patternUnits: "userSpaceOnUse", x: origin.x - step / 2, y: origin.y - step / 2, width: step, height: step}, defs)
      svg("circle", {cx: step / 2, cy: step / 2, r: zoom, fill: "#ccd7e3"}, pattern)
      const mask = svg("mask", {id: "◆transform-grid-mask", maskUnits: "userSpaceOnUse", x: area.left, y: area.top, width: area.width, height: area.height}, defs)
      svg("rect", {x: area.left, y: area.top, width: area.width, height: area.height, fill: "white"}, mask)
      // Keep dots behind content, including unfamiliar and custom element hosts.
      svg("path", {d: boxes.map(rect => `M ${rect.left} ${rect.top} h ${rect.width} v ${rect.height} h ${-rect.width} Z`).join(" "), fill: "black"}, mask)
      svg("rect", {part: "transform-grid", x: area.left, y: area.top, width: area.width, height: area.height, fill: "url(#◆transform-grid-pattern)", mask: "url(#◆transform-grid-mask)"})
    }
    for(const axis of ["x", "y"] as const) {
      const guide = guides[axis]
      const selector = `line[part~="transform-guide-${axis}"]`
      if(!guide) {
        const line = overlay.querySelector<SVGLineElement>(selector)
        if(line && line.style.display !== "none") line.style.display = "none"
        continue
      }
      const line = svg("line", {part: `transform-guide transform-guide-${axis} transform-guide-${guide.kind}`,
        x1: axis === "x" ? guide.value : area.left, y1: axis === "y" ? guide.value : area.top,
        x2: axis === "x" ? guide.value : area.right, y2: axis === "y" ? guide.value : area.bottom,
        stroke: guide.kind === "canvas" ? "#f59e0b" : "#38bdf8", "stroke-width": 1, "stroke-dasharray": "4 3"}, overlay, selector) as SVGLineElement
      if(line.style.display) line.style.display = ""
    }
  }

  #clearMovementOverlay() {
    this.#movementPeers = null
    this.#movementOverlay?.remove()
    this.#movementOverlay = null
  }

  handleScaleDrag(event: MouseEvent): DOMRect | void {
    if(!this.#validGesture() || this.#gesture!.mode !== "scale") return
    const gesture = this.#gesture!
    if(gesture.group) { this.#dragGroup(event); return }
    const target = gesture.target
    const freeform = this.#isFreeformItem(target)
    const text = !freeform && this.#isTextContainer(target)
    const image = Boolean(gesture.image || target instanceof HTMLImageElement && !target.hasAttribute("is"))
    const direction = gesture.handle.dataset.resizeDirection ?? gesture.handle.id.replace("◆transform-overlay-scale-", "")
    if(text && !direction.includes("left") && !direction.includes("right")) return
    const delta = this.#vector(gesture.matrix.inverse(), event.clientX - gesture.x, event.clientY - gesture.y)
    if(!gesture.moved && (text ? Math.abs(delta.x) : Math.hypot(delta.x, delta.y)) < 1) return
    gesture.moved = true
    const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
    const y = text ? 0 : direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
    const symmetric = modifierKeyDown(event)
    const centered = gesture.resizeCentered ?? false
    const round = this.getRoundingFunc(event)
    const size = gesture.figureImage ?? gesture
    const style = getComputedStyle(target)
    const {display, float, minWidth} = style
    const minimum = pixelSize(minWidth)
    // Use CSS widths here, since min-width follows box-sizing and the
    // pointer delta is in the element's untransformed coordinate system.
    const minDelta = (minimum ?? 0) - gesture.cssWidth
    const figureImage = gesture.figureImage, picture = figureImage?.picture
    const minDW = figureImage && gesture.image
      ? Math.max(minDelta, (pixelSize(getComputedStyle(gesture.image.target).minWidth) ?? 0) - figureImage.cssWidth,
        picture ? (pixelSize(getComputedStyle(picture.target).minWidth) ?? 0) - picture.cssWidth : -Infinity)
      : minDelta
    let dw = x ? Math.max(1 - size.width, round(x * delta.x * (symmetric || centered ? 2 : 1))) : 0
    let dh = y ? Math.max(1 - size.height, round(y * delta.y * (symmetric ? 2 : 1))) : 0
    const proportional = image && event.shiftKey && size.width > 0 && size.height > 0
    if(proportional) {
      const requested = x && (!y || Math.abs(dw / size.width) >= Math.abs(dh / size.height)) ? dw / size.width : dh / size.height
      const change = size.cssWidth > 0 ? Math.max(requested, minDW / size.cssWidth) : requested
      dw = size.cssWidth * change
      dh = size.cssHeight * change
    }
    else if(x) dw = Math.max(dw, minDW)
    const crop = gesture.canvas && !event.altKey
    const scaleInsteadOfResize = event.shiftKey && !crop && !text && !image
    document.body.classList.add(`◆transform-scaling-${x && y ? x === y ? "nwse" : "nesw" : x ? "ew" : "ns"}`)
    const popup = target.closest("[popover]")
    const insidePopup = Boolean(popup && popup !== target && popupElementRole(popup) === "content")
    const resizeMode = `${Boolean(crop)}:${scaleInsteadOfResize}:${floatSideFromStyles(float, target.style, target.classList)}:${insidePopup}`
    if(gesture.resizeMode !== undefined && gesture.resizeMode !== resizeMode) this.#resetWritten()
    gesture.resizeMode = resizeMode
    if(gesture.canvas && !crop) this.#writeCanvasViewBox(gesture.canvas.initial)
    if(display === "inline" && target instanceof HTMLElement) this.#write("display", "inline-block")
    const resizeBox = () => {
      if(text) {
        this.#write("height", "auto")
        this.#write("min-height", mathRoot(target) === target ? "" : "0px")
        this.#write("max-height", "none")
      }
      if(image) {
        const width = Math.max(1, gesture.cssWidth + dw), height = Math.max(1, gesture.cssHeight + dh)
        this.#write("width", insidePopup ? `${width}px` : "100%")
        this.#write("height", "auto")
        this.#write("aspect-ratio", `${width} / ${height}`)
        this.#write("max-width", `${width}px`)
        this.#write("max-height", `${height}px`)
        const styles = gesture.image ?? gesture
        this.#write("object-fit", "fill", "", styles)
        if(gesture.image) {
          for(const property of ["width", "height", "max-width", "max-height"]) this.#write(property, "100%", "", styles)
        }
      }
      else if(gesture.canvas) {
        this.#write("width", `${Math.max(1, gesture.cssWidth + dw)}px`)
        this.#write("height", `${Math.max(1, gesture.cssHeight + dh)}px`)
      }
      else if(freeform || standaloneGraphicShape(target)) {
        if(x) this.#write("width", `${Math.max(1, gesture.cssWidth + dw)}px`)
        if(y) this.#write("height", `${Math.max(1, gesture.cssHeight + dh)}px`)
      }
      else if(target instanceof HTMLIFrameElement && y) this.#write("height", `${Math.max(1, gesture.cssHeight + dh)}px`)
      else if(boardLayoutRole(target) === "column" && x) {
        this.#write("width", `${Math.max(1, gesture.cssWidth + dw)}px`)
        this.#write("flex-basis", `${Math.max(1, gesture.cssWidth + dw)}px`)
      }
      else if(boardLayoutRole(target) === "card" && y) this.#write("height", `${Math.max(1, gesture.cssHeight + dh)}px`)
      if(x) {
        const width = Math.max(0, gesture.cssWidth + dw)
        if(gesture.fullWidth) {
          const full = gesture.fullWidth.threshold === null ? gesture.fullWidth.initial : width > gesture.fullWidth.threshold + .5
          target.classList.toggle("ww-full-width", full)
          gesture.fullWidth.written = full
          this.#write("--ww-full-width-size", full ? `${width}px` : "")
        }
        if(floatSideFromStyles(gesture.fullWidth ? style.float : float, target.style, target.classList) !== "none") {
          this.#write("--ww-float-size", `${width}px`)
        }
        if(!image && !gesture.canvas && insidePopup) {
          this.#write("width", `${width}px`)
        }
        this.#write("max-width", `${width}px`)
      }
      if(y) this.#write("max-height", `${Math.max(0, gesture.cssHeight + dh)}px`)
    }
    if(figureImage && gesture.image) {
      // Resize the media in layout so the caption can wrap at its own font size.
      this.#resizeDimension(gesture.image, "width", size.cssWidth, dw)
      this.#resizeDimension(gesture.image, "height", size.cssHeight, dh)
      if(picture) {
        this.#resizeDimension(picture, "width", picture.cssWidth, dw)
        this.#resizeDimension(picture, "height", picture.cssHeight, dh)
      }
      this.#resizeDimension(gesture, "width", gesture.cssWidth, dw)
      this.#write("height", "auto")
      this.#write("max-height", "none")
    }
    else if(scaleInsteadOfResize) {
      this.#write("scale", `${gesture.scale[0] * (gesture.width + dw) / gesture.width} ${gesture.scale[1] * (gesture.height + dh) / gesture.height}`)
    }
    else {
      resizeBox()
      if(minWidth && minWidth !== "auto" && minimum === undefined && (x || proportional)) {
        // The browser resolves percentages and intrinsic widths against the
        // actual layout. Read back the floor only when it exceeds our cap.
        const usedWidth = pixelSize(style.width)
        if(usedWidth !== undefined && usedWidth > Math.max(1, gesture.cssWidth + dw) + .02) {
          const correction = usedWidth - gesture.cssWidth - dw
          dw += correction
          if(proportional && size.cssWidth > 0) dh += size.cssHeight * correction / size.cssWidth
          resizeBox()
        }
      }
    }
    this.editor.features.layout.refreshFigureLayout(target)
    const keepAnchor = freeform && (style.position || "static") !== "static"
    // Use the final layout size to position spatial items and SVG viewports.
    let rect: DOMRect | undefined
    let actualDW = dw, actualDH = dh
    if((keepAnchor || crop) && !scaleInsteadOfResize) {
      if(keepAnchor && !crop) rect = this.targetRect
      const size = this.#size(target, undefined, rect)
      actualDW = size.width - gesture.width
      actualDH = size.height - gesture.height
    }
    if(crop) {
      const viewport = gesture.canvas!
      const dx = actualDW * viewport.width / gesture.cssWidth
      const dy = actualDH * viewport.height / gesture.cssHeight
      this.#writeCanvasViewBox([
        viewport.x - (symmetric ? dx / 2 : x < 0 ? dx : 0),
        viewport.y - (symmetric ? dy / 2 : y < 0 ? dy : 0),
        viewport.width + dx, viewport.height + dy,
      ].join(" "))
      this.#write("overflow", "hidden")
    }
    // Only spatial items compensate offsets. Document resizing keeps authored
    // positioning and insets intact, including when fitting an SVG viewport.
    if(keepAnchor) {
      const shift = this.#vector(gesture.matrix, symmetric ? 0 : x * actualDW / 2, text ? actualDH / 2 : symmetric ? 0 : y * actualDH / 2)
      const box = rect ?? this.targetRect
      if(this.#offsetBy(gesture.rect.left + gesture.rect.width / 2 + shift.x - (box.left + box.width / 2),
        gesture.rect.top + gesture.rect.height / 2 + shift.y - (box.top + box.height / 2))) {
        rect = undefined
        this.editor.features.layout.refreshFigureLayout(target)
      }
    }
    this.#scheduleFrame()
    return rect
  }

  handleCropDrag(event: MouseEvent) {
    if(!this.#validGesture() || this.#gesture!.mode !== "crop") return
    const gesture = this.#gesture!, crop = gesture.crop!
    const delta = this.#vector(crop.matrix.inverse(), event.clientX - gesture.x, event.clientY - gesture.y)
    if(!gesture.moved && Math.hypot(delta.x, delta.y) < 1) return
    gesture.moved = true
    const direction = gesture.handle.dataset.cropDirection!
    const edges = [...crop.insets]
    const viewport = this.editor.features.media.cropViewport(crop.target)
    if(!viewport) { this.#finish(true); return }
    const limits = [
      (viewport.y - viewport.top * viewport.sy) / crop.height * 100,
      (crop.width - viewport.x - (viewport.width - viewport.left) * viewport.sx) / crop.width * 100,
      (crop.height - viewport.y - (viewport.height - viewport.top) * viewport.sy) / crop.height * 100,
      (viewport.x - viewport.left * viewport.sx) / crop.width * 100,
    ]
    const change = (index: number, delta: number) => {
      const value = Math.round((crop.insets[index] + delta) * 100) / 100
      edges[index] = Math.max(Math.min(0, limits[index]), Math.min(99.9 - edges[(index + 2) % 4], value))
    }
    if(direction.includes("up")) change(0, delta.y / crop.height * 100)
    if(direction.includes("right")) change(1, -delta.x / crop.width * 100)
    if(direction.includes("down")) change(2, -delta.y / crop.height * 100)
    if(direction.includes("left")) change(3, delta.x / crop.width * 100)
    crop.edges = edges
    this.updateInfo()
  }

  handleRotateDrag(event: MouseEvent) {
    if(!this.#validGesture() || this.#gesture!.mode !== "rotate") return
    const gesture = this.#gesture!
    if(gesture.group) { this.#dragGroup(event); return }
    if(Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 1 && !gesture.moved) return
    if(!gesture.moved) {
      gesture.moved = true
      document.body.classList.add("◆transform-rotating")
    }
    const cx = gesture.rect.left + gesture.rect.width / 2, cy = gesture.rect.top + gesture.rect.height / 2
    const inverse = gesture.parentMatrix.inverse()
    const start = this.#vector(inverse, gesture.x - cx, gesture.y - cy)
    const end = this.#vector(inverse, event.clientX - cx, event.clientY - cy)
    const degrees = (Math.atan2(end.y, end.x) - Math.atan2(start.y, start.x)) * 180 / Math.PI
    const angle = this.getRoundingFunc(event)(gesture.rotate + degrees)
    if(angle === (gesture.rotationAngle ?? gesture.rotate)) return
    gesture.rotationAngle = angle
    this.#write("rotate", `${angle}deg`, "", gesture.image ?? gesture)
    // Caption flow can reposition the rotated content before we re-center it.
    this.editor.features.layout.refreshFigureLayout(gesture.target)
    const rect = (gesture.image?.target ?? gesture.target).getBoundingClientRect()
    if(this.#offsetBy(cx - (rect.left + rect.width / 2), cy - (rect.top + rect.height / 2))) {
      this.editor.features.layout.refreshFigureLayout(gesture.target)
    }
    this.#scheduleFrame()
  }

  handleMoveEnd(_event?: MouseEvent) { this.#finish(false) }
  handleScaleEnd(_event?: MouseEvent) { this.#finish(false) }
  handleRotateEnd(_event?: MouseEvent) { this.#finish(false) }

  #previewDrop(event: MouseEvent) {
    this.#clearDrop(true)
    const target = this.target!
    const manipulation = this.editor.features.manipulation
    const floatElement = manipulation.floatDropTarget(event, target)
    if(floatElement) {
      const float = manipulation.floatSide(floatElement, event.clientX)
      this.#drop = {element: floatElement, placement: "before", parent: floatElement.parentElement!, float}
      manipulation.showFloatDropPreview(floatElement, float, "transformation", target)
      return
    }
    const hit = document.elementsFromPoint?.(event.clientX, event.clientY).find(element =>
      getDocumentRoot().contains(element) && editingFlowRoot(element) === getDocumentRoot() && !target.contains(element) && !element.contains(target))
    if(!hit) {
      const range = manipulation.dropRange(event, target)
      if(range) {
        this.#normalDropRange = range
        this.editor.features.selection.selectDropRange(range)
      }
      return
    }
    // Widgets are atomic, including their authored light-DOM contents.
    let element = hit
    for(let parent = hit.parentElement; parent && !isDocumentRoot(parent); parent = parent.parentElement) {
      if(parent.localName.includes("-") || parent.hasAttribute("is")) element = parent
    }
    if(isDocumentRoot(element) || !element.parentNode || element.contains(target)) return
    const container = this.editor.features.manipulation.floatContainer(element, target)
    if(container) element = container
    const rect = element.getBoundingClientRect()
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    this.#drop = {element, placement, parent: element.parentNode!}
    element.classList.add(`◆drop-caret-${placement}`)
    this.editor.features.selection.showDropCaret(placement)
  }

  #clearDrop(keepFloatPreview = false) {
    const hadDrop = this.#drop || this.#normalDropRange
    if(this.#drop) removeEditorMarker(this.#drop.element, `◆drop-caret-${this.#drop.placement}`)
    this.#drop = null
    this.#normalDropRange = null
    this.editor.features.manipulation.clearFloatDropPreview("transformation", keepFloatPreview)
    if(hadDrop) this.editor.features.selection.clearDropCaret()
  }

  #finish(cancel: boolean) {
    if(!cancel) this.#flushPointer()
    this.#pendingPointer = null
    this.#lastPointer = null
    this.#clearMovementOverlay()
    if(this.#panFrame !== null) cancelAnimationFrame(this.#panFrame)
    this.#panFrame = null
    this.#panEvent = null
    const gesture = this.#gesture
    if(!gesture) return
    const valid = gesture.group ? this.#validGroupSelection() : gesture.target === this.target && gesture.parent === gesture.target.parentElement
    const settling = valid && this.isEnabled && (gesture.group
      ? this.isResizingOrRotatingGroup && this.hasStableGroupSelection($.selectedElements)
      : this.stableSingleTransformTarget()) ? gesture : null
    const target = gesture.target
    if(cancel || !valid) {
      if(gesture.fullWidth && target.classList.contains("ww-full-width") === gesture.fullWidth.written) {
        target.classList.toggle("ww-full-width", gesture.fullWidth.initial)
        if(!target.classList.length) target.removeAttribute("class")
      }
      if(gesture.canvas && target.getAttribute("viewBox") === gesture.canvas.written) this.#writeCanvasViewBox(gesture.canvas.initial)
      // Revert only properties still owned by this gesture. Concurrent changes
      // to other properties, or to these same properties, remain authoritative.
      for(const styles of gesture.group?.members ?? [gesture, gesture.image, gesture.figureImage?.picture]) if(styles) {
        for(const [key, last] of styles.written) {
          if(styles.target.style.getPropertyValue(key) === last.value && styles.target.style.getPropertyPriority(key) === last.priority) {
            const value = styles.initial.getPropertyValue(key)
            if(value) styles.target.style.setProperty(key, value, styles.initial.getPropertyPriority(key))
            else styles.target.style.removeProperty(key)
          }
        }
      }
    }
    else if(gesture.moved && gesture.mode === "rotate" && gesture.group?.persistent && gesture.group.angle !== gesture.rotate) {
      for(const {target} of gesture.group.members) {
        if(gesture.group.angle) target.setAttribute(spatialGroupRotation, String(gesture.group.angle))
        else target.removeAttribute(spatialGroupRotation)
      }
    }
    else if(gesture.moved && gesture.crop) {
      const crop = gesture.crop
      const value = this.editor.features.media.cropValueFor(crop.target, crop.edges)
      if(value) this.editor.features.manipulation.setElementStyles(crop.target, {"object-view-box": {value, priority: crop.sourceStyle.getPropertyPriority("object-view-box") as "" | "important"}})
    }
    else if(gesture.moved && this.#drop) {
      const {element, placement, parent, float} = this.#drop
      if(getDocumentRoot().contains(element) && editingFlowRoot(element) === getDocumentRoot() && element.parentNode === parent && !target.contains(element) && !element.contains(target)
        && (float === undefined || this.editor.features.manipulation.floatContainer(element, target) === element
          && (target.parentElement === parent || this.editor.schema.canInsert(parent, target, Array.from(parent.childNodes).indexOf(element))))) {
        if(gesture.mode === "move" && float === undefined) {
          this.editor.features.manipulation.clearDropFloat(target)
          clearInlinePlacement(target)
        }
        if(float) {
          this.editor.features.manipulation.placeFloat(target, element, float, placement)
        }
        else {
          element[placement](target)
          if(gesture.mode !== "move") this.editor.features.manipulation.clearDropFloat(target)
        }
      }
    }
    else if(gesture.moved && this.#normalDropRange && getDocumentRoot().contains(this.#normalDropRange.startContainer)
      && !target.contains(this.#normalDropRange.startContainer)) {
      if(gesture.mode === "move") {
        this.editor.features.manipulation.clearDropFloat(target)
        clearInlinePlacement(target)
      }
      this.#normalDropRange.insertNode(target)
      if(gesture.mode !== "move") this.editor.features.manipulation.clearDropFloat(target)
    }
    if(settling) this.#settlingGesture = settling
    this.#gesture = null
    this.editor.features.media.flushCanvasTransformRefresh()
    this.#geometryFrameDirty = false
    if(gesture.group || gesture.mode === "scale" || gesture.mode === "move" || gesture.mode === "rotate") this.editor.features.canvas.setMinimapRefreshPaused(false)
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    if(gesture.mode === "rotate" && gesture.image && gesture.rotationAngle !== undefined) this.editor.features.layout.refreshFigureLayout(gesture.target)
    if(gesture.crop) {
      const preview = this.overlay.querySelector<HTMLCanvasElement>("[part='transform-overlay-crop-preview']")!
      preview.hidden = true
      preview.width = 0
      preview.height = 0
    }
    this.#suppressClick = gesture.moved ? gesture.handle : null
    for(const member of gesture.group?.members ?? []) if(!member.target.style.length) member.target.removeAttribute("style")
    if(!target.style.length) target.removeAttribute("style")
    if(gesture.image && !gesture.image.target.style.length) gesture.image.target.removeAttribute("style")
    const picture = gesture.figureImage?.picture?.target
    if(picture && !picture.style.length) picture.removeAttribute("style")
    if(gesture.crop && !gesture.crop.target.style.length) gesture.crop.target.removeAttribute("style")
    if(gesture.pointerId !== undefined && gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId)
    document.body.classList.remove("◆transform-moving", "◆transform-rotating", "◆transform-scaling-ew", "◆transform-scaling-ns", "◆transform-scaling-nwse", "◆transform-scaling-nesw")
    document.body.classList.remove(...cropDirections.map(direction => `◆transform-cropping-${direction}`))
    this.#clearDrop()
    this.editor.features.manipulation.clearFloatDropTargets()
    gesture.endUndoGroup()
    const stableTextTransform = valid && (gesture.mode === "scale" || gesture.mode === "move" && !this.#drop && !this.#normalDropRange)
      && !gesture.group && !gesture.captured
      && target instanceof HTMLElement && target.matches("p:not([is]), h1:not([is]), h2:not([is]), h3:not([is]), h4:not([is]), h5:not([is]), h6:not([is])")
      && $.selectedElement === target && !this.editor.features.selection.captureSelectedElement
    if(valid) {
      const clicked = gesture.group?.clickedMember
      if(!cancel && !gesture.moved && clicked) {
        this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.selectElement(clicked))
        this.editor.postSelectionPath()
      }
      else if(settling && gesture.mode === "scale" && boardLayoutRole(target)) {
        // Board context controls have their own refresh on pointer release.
        this.clearTransform()
        settling.selectionPathPending = true
      }
      else if(stableTextTransform || settling && gesture.mode === "rotate" && !gesture.group) {
        this.updateInfo()
        if(this.editor.features.board.active) this.editor.features.board.refresh()
      }
      else if(gesture.captured && !cancel && !gesture.moved && (gesture.mode === "move" || gesture.mode === "scale")) {
        this.editor.features.selection.selectElement(target)
      }
      else if(gesture.captured) this.editor.features.selection.captureElement(target, {
        preserveNativeSelection: gesture.mode !== "move" && gesture.mode !== "anchor",
      })
      else this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    }
    // Selection processing refreshes the valid target synchronously.
    if(!valid) this.updateInfo()
    if(settling) {
      if(settling.group) this.updateInfo()
      // DOM observers queue mark and selection updates of their own. Let
      // those microtasks join this refresh before publishing to the host.
      queueMicrotask(() => queueMicrotask(() => {
        if(this.#settlingGesture !== settling) return
        this.#settlingGesture = null
        if(!this.isEnabled) return
        if(settling.markStatePending) this.editor.postMarkState()
        if(settling.selectionPathPending) this.editor.postSelectionPath()
      }))
    }
    else if(this.isEnabled) {
      if(gesture.markStatePending) this.editor.postMarkState()
      if(gesture.selectionPathPending) this.editor.postSelectionPath()
    }
    if(this.target?.getAnimations?.().some(animation => animation.playState === "running")) this.#scheduleFrame()
  }

  restore() {
    if(!this.target || this.editor.isEditingLocked) return
    const content = captionedFigureContent(this.target) as TransformElement | null
    if(content?.style) {
      for(const property of ["transform", "translate", "rotate", "scale"]) content.style.removeProperty(property)
      if(!content.style.length) content.removeAttribute("style")
    }
    clearInlinePlacement(this.target)
    this.editor.features.layout.refresh()
    this.updateInfo()
  }

  /** Change only paint-order peers in the same stacking context. Descendants
   * inside nested contexts and widget internals are never renumbered. */
  moveZ(element: TransformElement | null, forward=true, toFrontOrBack=false, cycle=false) {
    if(!element || !this.#canTransform(element) || this.editor.isEditingLocked) return
    if(this.#isFreeformItem(element)) {
      const direction = toFrontOrBack ? forward ? "front" : "back"
        : forward ? "up" : "down"
      this.editor.features.layout.placeElement(element, direction, cycle && !toFrontOrBack)
      this.updateInfo()
      return
    }
    const container = findStackingContainer(element as HTMLElement)
    const peers = getDescendantsInStackingOrder(container).filter(candidate => {
      if(isDocumentRoot(candidate)) return false
      if(candidate !== element && (element.contains(candidate) || candidate.contains(element))) return false
      if(candidate !== element && findStackingContainer(candidate) !== container) return false
      for(let parent = candidate.parentElement; parent && parent !== container; parent = parent.parentElement) {
        if(parent.localName.includes("-") || parent.hasAttribute("is")) return false
      }
      const style = getComputedStyle(candidate)
      const parentDisplay = candidate.parentElement && getComputedStyle(candidate.parentElement).display
      return style.position && style.position !== "static" || parentDisplay?.includes("flex") || parentDisplay?.includes("grid")
    })
    const index = peers.indexOf(element as HTMLElement)
    if(index < 0 || peers.length < 2) return
    const destination = toFrontOrBack ? forward ? peers.length - 1 : 0
      : cycle ? (index + (forward ? 1 : -1) + peers.length) % peers.length
        : Math.max(0, Math.min(peers.length - 1, index + (forward ? 1 : -1)))
    if(index === destination) return
    peers.splice(index, 1)
    peers.splice(destination, 0, element as HTMLElement)
    // Prefer a target-only index; integer ties need the smallest affected run
    // shifted to create room, while keeping every other peer's relative order.
    const z = (node: Element) => parseInt(getComputedStyle(node).zIndex) || 0
    const before = peers[destination - 1], after = peers[destination + 1]
    let value = before ? z(before) + 1 : z(after) - 1
    if(after && before && value >= z(after)) {
      for(let i = destination + 1; i < peers.length && z(peers[i]) <= value; i++) peers[i].style.zIndex = String(++value)
      value = z(before) + 1
    }
    element.style.zIndex = String(value)
    this.updateInfo()
  }

  getOppositeScaler(element: HTMLElement) {
    const direction = element.id.replace("◆transform-overlay-scale-", "").split("-").map(part => ({up: "down", down: "up", left: "right", right: "left"})[part]).join("-")
    return this.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
  }

  clearTransform() {
    this.#finish(true)
    const frame = document.body.shadowRoot?.querySelector<HTMLElement>("#◆transform-overlay")
    if(frame) this.#anchors.release(frame)
    this.#anchored = false
    this.#resizeObserver?.disconnect(); this.#observedElements = []
    this.#suppressClick = null
    this.editor.features.selection.clearTransformCaret()
    const targets = new Set([...this.#group, ...(this.#target ? [this.#target] : []), ...document.querySelectorAll(".◆transform-target")])
    for(const target of targets) removeEditorMarker(target, "◆transform-target")
    this.#target = null
    this.#group = []
    this.#clearGroupContext()
    this.#positionFlowControls(0, 0, [])
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#clearDrop()
    this.#updateContextMarkers()
    const overlay = document.body.shadowRoot?.querySelector<HTMLElement>("#◆transform-overlay")
    if(overlay) {
      if(overlay.getAttribute("visibility") !== "hidden") overlay.setAttribute("visibility", "hidden")
      this.#floatAnchorLine!.style.display = "none"
      setPart(overlay, "transform-overlay-content-selected", false)
      overlay.querySelectorAll("[data-open]").forEach(control => control.removeAttribute("data-open"))
      this.#syncControlParts()
    }
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    window.addEventListener("blur", this.#cancelGesture)
    window.addEventListener("resize", this.refreshGeometry)
    document.addEventListener("animationstart", this.#animationStarted)
    document.addEventListener("transitionrun", this.#animationStarted)
    this.#resizeObserver = new ResizeObserver(this.refreshGeometry)
    this.#observedElements = []
    if(!this.#observer) {
      this.#observer = new MutationObserver(records => {
        if(records.some(record => isAuthoredMutation(record) && !this.#gesture?.group?.members.some(member => member.target === record.target)
          && record.target !== this.#gesture?.target)) this.#movementPeers = null
        if(this.#target && !this.target) this.clearTransform()
        else if(records.some(isAuthoredMutation)) this.refreshGeometry()
      })
      this.#observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true})
    }
  }

  disable() {
    super.disable()
    window.removeEventListener("blur", this.#cancelGesture)
    window.removeEventListener("resize", this.refreshGeometry)
    document.removeEventListener("animationstart", this.#animationStarted)
    document.removeEventListener("transitionrun", this.#animationStarted)
    this.#resizeObserver?.disconnect(); this.#resizeObserver = null
    this.#observer?.disconnect()
    this.#observer = null
    this.#groupPress = null
    this.clearTransform()
    this.#anchors.destroy()
    document.body.shadowRoot?.querySelector("#◆transform-overlay")?.remove()
    this.#floatAnchorLine = null
  }

  captureListeners: DocumentListenerMap = {
    scroll: this.#refreshViewportControls,
    pointerdown: event => {
      const origin = event.composedPath()[0]
      this.#groupPress = null
      if(!(origin instanceof Node) || !getDocumentRoot().contains(origin) || isWidgetShadowInteraction(event, this.editor.schema)) return
      if(this.handleGroupedPointer(event, origin)) return
      if(!this.#group.length || event.defaultPrevented || event.button !== 0 || event.detail >= 2
        || modifierKeyDown(event) || event.shiftKey || !this.#group.some(element => element.contains(origin))) return
      if(this.#begin(event, "move", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!)) event.stopImmediatePropagation()
    },
    mousedown: event => {
      if(this.#groupPress && event.composedPath().includes(this.#groupPress)) event.preventDefault()
    },
    click: event => {
      const member = this.#groupPress
      this.#groupPress = null
      if(member && event.composedPath().includes(member)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    pointercancel: () => { this.#groupPress = null },
    keydown: event => {
      if(event.key === "Escape" && this.#gesture) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.#finish(true)
      }
    },
  }

  activeListeners: DocumentListenerMap = {
    pointerdown: event => {
      // A cancelled gesture may never emit a click. A fresh press starts a
      // separate interaction, even when it uses the same overlay control.
      this.#suppressClick = null
      if(this.#groupContext && event.composedPath().includes(this.#groupContext)) {
        if(event.button === 0) event.preventDefault()
        return
      }
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || !this.overlay.contains(handle)) return
      if(this.editor.isEditingLocked) { event.preventDefault(); event.stopImmediatePropagation(); return }
      if(!this.#group.length && this.overlay.getAttribute("part")?.split(/\s+/).includes("transform-overlay-content-selected")) {
        const target = this.target
        if(target) this.editor.features.selection.selectElement(target)
      }
      if(handle.dataset.transformMode === "move" && handle.draggable) {
        // Leave the native default available so the button can start a node drag.
        event.stopImmediatePropagation()
        return
      }
      if(handle.dataset.transformMode) {
        this.#begin(event, handle.dataset.transformMode as Mode, handle)
        event.stopImmediatePropagation()
      }
      else event.preventDefault() // Keep authored selection while using menus.
    },
    dragstart: event => {
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || handle.dataset.transformMode !== "move"
        || !handle.draggable || !this.overlay.contains(handle)) return
      const target = this.target
      if(!this.isEnabled || this.editor.isEditingLocked || !target) { event.preventDefault(); return }
      this.editor.features.selection.selectElement(target)
      this.editor.features.manipulation.startNodeDrag(event, target)
    },
    dragend: event => {
      const handle = event.composedPath()[0]
      if(handle instanceof HTMLElement && handle.dataset.transformMode === "move" && handle.draggable && this.overlay.contains(handle)) {
        this.editor.features.manipulation.endNodeDrag()
      }
    },
    pointermove: event => {
      if(!this.#gesture || this.#gesture.pointerId !== event.pointerId) return
      event.preventDefault()
      this.#pendingPointer = event
      this.#scheduleFrame(false)
    },
    pointerup: event => {
      if(!this.#gesture || this.#gesture.pointerId !== event.pointerId) return
      const last = this.#pendingPointer ?? this.#lastPointer
      // Some devices deliver a terminal position without a final pointermove.
      if(last && (event.clientX !== last.clientX || event.clientY !== last.clientY || event.altKey !== last.altKey
        || event.ctrlKey !== last.ctrlKey || event.metaKey !== last.metaKey || event.shiftKey !== last.shiftKey)) this.#pendingPointer = event
      if(this.#validGesture()) this.#finish(false)
    },
    pointercancel: event => { if(this.#gesture?.pointerId === event.pointerId) this.#finish(true) },
    lostpointercapture: event => {
      const gesture = this.#gesture
      if(!gesture || gesture.pointerId !== event.pointerId) return
      // A fast release can lose capture before pointerup reaches this listener.
      // Keep the last move when the pointer is already released; capture loss
      // while a button is held still cancels, as do invalidated DOM targets.
      const releasedMove = event.buttons === 0 && gesture.mode === "move" && this.#isFreeformItem(gesture.target)
      if(releasedMove && this.#validGesture()) this.#finish(false)
      else this.#finish(true)
    },
    click: event => {
      const suppressClick = this.#suppressClick
      this.#suppressClick = null
      if(suppressClick && event.composedPath().includes(suppressClick)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if(this.#groupContext && event.composedPath().includes(this.#groupContext)) {
        const target = this.target
        if(target && !this.#gesture && !this.editor.isEditingLocked) {
          const members = this.groupSelectionPeers(target)
          if(members.length > 1) this.#selectGroup(members)
        }
        event.stopPropagation()
        return
      }
      const handle = event.composedPath()[0]
      if(handle instanceof HTMLButtonElement && handle.id === "◆transform-overlay-group" && this.overlay.contains(handle)) {
        const mode = handle.dataset.groupingAction
        if(!handle.hidden && $.isMultiElementSelection && (mode === "group" || mode === "ungroup")) this.setSpatialGrouping(mode)
        event.stopPropagation()
        return
      }
      if(handle instanceof HTMLElement && handle.dataset.transformMode === "move" && handle.draggable && this.overlay.contains(handle)) {
        const target = this.target
        if(target && !this.#gesture && !this.editor.isEditingLocked) this.editor.features.selection.selectElement(target)
        event.stopPropagation()
      }
      if(handle instanceof HTMLElement && handle.id === "◆transform-overlay-delete" && this.overlay.contains(handle)) {
        const target = this.target
        if(target && !this.#gesture && !this.editor.isEditingLocked && this.editor.allowsSelection("delete")) {
          if(this.#group.length) {
            if(this.#validGroupSelection()) {
              const end = this.editor.doc.beginUndoGroup()
              try { $.delete() }
              finally { end() }
              this.clearTransform()
              this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
            }
            event.stopPropagation()
            return
          }
          this.editor.features.selection.selectElement(target)
          if(this.target === target && $.selectedElement === target) {
            $.delete()
            this.clearTransform()
            this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
          }
        }
        event.stopPropagation()
      }
    },
  }
}
