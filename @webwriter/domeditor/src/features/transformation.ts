import { DocumentListenerMap, EditorFeature } from "."
import { $, atomicEditingContainer, fixedClientX, clearInlinePlacement, editingFlowRoot, findContainingBlock, findScrollingAncestor, findStackingContainer, getDescendantsInStackingOrder, getStaticCoords, isElement, modifierKeyDown, removeEditorMarker, renderedParentElement, roundByDPR, roundTo, setPart } from "../utility"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {standaloneGraphicShape} from "../graphic"
import {boardLayoutRole, isSlide} from "../document-layout"
import {alignmentFromStyles, floatSideFromStyles, type FloatSide} from "../element-styles"
import {mediaCropInsets} from "../media"
import {captionIconSource} from "../ribbon-icons"
import {mathRoot} from "../math"
import {captionedFigureContent} from "../figure-layout.js"
import type {RelativePosition} from "yjs"

type TransformElement = HTMLElement | SVGSVGElement | MathMLElement
type Mode = "move" | "scale" | "rotate" | "anchor" | "crop"
const cropDirections = ["up-left", "down-right"] as const
type StyleValue = {value: string, priority: string}
type GestureStyles = {target: TransformElement, initial: CSSStyleDeclaration, written: Map<string, StyleValue>}
type GroupMember = GestureStyles & {parent: Element | null, rect: DOMRect, matrix: DOMMatrix, transform: DOMMatrix}
type BoxGeometry = {
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
  scale: number[]
  initial: CSSStyleDeclaration
  written: Map<string, StyleValue>
  moved: boolean
  captured: boolean
  image?: GestureStyles & {parent: Element | null}
  canvas?: {initial: string | null, written: string | null, x: number, y: number, width: number, height: number}
  crop?: {target: HTMLImageElement | HTMLVideoElement, parent: Element | null, width: number, height: number, matrix: DOMMatrix, insets: number[], edges: number[], sourceStyle: CSSStyleDeclaration}
  endUndoGroup: () => void
  group?: {members: GroupMember[], transform: DOMMatrix}
  textSelection?: {range: Range, backwards: boolean, start: RelativePosition | null, end: RelativePosition | null}
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
  protected handlesAppendixInteractions = true
  protected handlesCapturedElementInteractions = true
  #target: TransformElement | null = null
  #group: TransformElement[] = []
  #gesture: Gesture | null = null
  #floatValues: readonly FloatSide[] = ["none", "far-left", "far-right"]
  #observer: MutationObserver | null = null
  #frame: number | null = null
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
    point.title = `Resize ${direction}`
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
      mover, caption, deleter, rotator, anchor, sticky, this.#createArranger(), this.#createOrderer(),
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

  freeformControlContainer(element: Element) {
    return !this.#group.length && this.target === element && this.#isFreeformItem(element) ? this.overlay : null
  }

  #canTransform(element: Element): element is TransformElement {
    return (element instanceof HTMLElement || element instanceof SVGSVGElement
      || mathRoot(element) === element && element.getAttribute("display") === "block")
      && element !== document.documentElement && element !== document.head
      && !isDocumentRoot(element) && getDocumentRoot().contains(element)
  }

  /** Called at the selection feature's invariant boundary, including capture
   * changes that do not dispatch a native selectionchange. */
  syncSelection(element: Element | null, within = false) {
    if(!this.isEnabled) return
    if(this.#gesture) return
    if(element && this.#canTransform(element)) this.startTransform(element)
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

  startTransform(element: Element) {
    if(!this.#canTransform(element) || this.editor.isEditingLocked) return
    if(this.#target !== element || this.#group.length) {
      this.clearTransform()
      this.#target = element
    }
    if(!element.classList.contains("◆transform-target")) element.classList.add("◆transform-target")
    this.overlay.removeAttribute("visibility")
    this.updateInfo()
    this.#scheduleFrame()
  }

  #isFreeformItem(target: Element) {
    return this.editor.features.canvas.active && target.parentElement === document.body
      || this.editor.features.slides.active && isSlide(target.parentElement)
  }

  #isTextContainer(target: Element) {
    return target instanceof HTMLElement && target.matches("p:not([is]), h1:not([is]), h2:not([is]), h3:not([is]), h4:not([is]), h5:not([is]), h6:not([is])")
      || mathRoot(target) === target && target.getAttribute("display") === "block"
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
    const position = this.target ? getComputedStyle(this.target).position || "static" : "static"
    const freeform = Boolean(this.target && this.#isFreeformItem(this.target))
    const text = Boolean(this.target && !freeform && this.#isTextContainer(this.target))
    const corner = this.target && this.#resizeAlignment(this.target) === "right" ? "down-left" : "down-right"
    setPart(overlay, "transform-overlay-freeform", freeform)
    setPart(overlay, "transform-overlay-capture-selected", freeform && this.editor.features.selection.captureSelectedElement === this.target)
    for(const midpoint of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-midpoint")) {
      const hide = !freeform || this.#group.length > 0
      midpoint.hidden = hide
      setPart(midpoint, "transform-overlay-scale-hidden", hide)
    }
    for(const scaler of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-scale:not(.◆transform-overlay-midpoint)")) {
      const hide = this.#group.length > 0 || !freeform && scaler.dataset.resizeDirection !== corner
      scaler.hidden = hide
      setPart(scaler, "transform-overlay-scale-hidden", hide)
      setPart(scaler, "transform-overlay-scale-text", text)
    }
    for(const edge of overlay.querySelectorAll<HTMLElement>(".◆transform-overlay-edge")) {
      edge.dataset.transformMode = "move"
      edge.draggable = !this.editor.features.canvas.active && !this.editor.features.slides.active
      edge.title = "Move"
      setPart(edge, "transform-overlay-edge-move", true)
    }
    setPart(overlay, "transform-overlay-hidden", overlay.hasAttribute("visibility"))
    setPart(overlay, "transform-overlay-narrow", this.isNarrow)
    const hidden = (name: string, hide: boolean) => {
      const control = overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!
      setPart(control, `transform-overlay-${name}-hidden`, hide)
      control.hidden = hide
    }
    hidden("rotator", !freeform || (this.#group.length ? !this.#group.every(element => getComputedStyle(element).position === "absolute") : position !== "absolute"))
    hidden("orderer", true)
    hidden("mover", freeform)
    const captionPosition = this.editor.features.manipulation.getCaptionPosition()
    const captionAlignment = this.editor.features.manipulation.getCaptionAlignment() ?? "left"
    const caption = overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-caption")!
    hidden("caption", freeform || !this.target || captionPosition === null)
    caption.style.setProperty("--icon", `url("data:image/svg+xml,${encodeURIComponent(captionIconSource(captionPosition ?? "none", captionAlignment, true))}")`)
    caption.title = captionPosition === "none" ? "Add caption" : `Caption ${captionPosition}, align ${captionAlignment}: cycle position`
    caption.setAttribute("aria-label", caption.title)
    overlay.querySelector<HTMLButtonElement>("#◆transform-overlay-mover")!.draggable =
      !this.editor.features.canvas.active && !this.editor.features.slides.active
    hidden("delete", false)
    setPart(overlay.querySelector("#◆transform-overlay-delete")!, "transform-overlay-delete-freeform", freeform)
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
  #matrix(element: Element | null): DOMMatrix {
    if(!element) return new DOMMatrix()
    const style = getComputedStyle(element)
    const angle = this.#angle(style.getPropertyValue("rotate"))
    const scale = this.#scale(style.getPropertyValue("scale"))
    const zoom = parseFloat(style.getPropertyValue("zoom")) || 1
    const own = new DOMMatrix().scale(zoom).rotate(angle).scale(scale[0], scale[1])
      .multiply(new DOMMatrix(style.transform && style.transform !== "none" ? style.transform : undefined))
    own.e = own.f = 0
    return this.#matrix(renderedParentElement(element)).multiply(own)
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

  #size(element: TransformElement) {
    const style = getComputedStyle(element)
    const extra = (properties: string[]) => properties.reduce((sum, property) => sum + (parseFloat(style.getPropertyValue(property)) || 0), 0)
    const paddingWidth = style.boxSizing === "border-box" ? 0 : extra(["padding-left", "padding-right", "border-left-width", "border-right-width"])
    const paddingHeight = style.boxSizing === "border-box" ? 0 : extra(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"])
    const pixelSize = (value: string) => value.endsWith("px") && Number.isFinite(parseFloat(value)) ? parseFloat(value) : undefined
    let cssWidth = pixelSize(style.width), cssHeight = pixelSize(style.height)
    if(cssWidth === undefined || cssHeight === undefined) {
      // Inline widget hosts can retain percentages or auto in computed style.
      // The live rect is already a border box; transformed hosts need their
      // local layout dimensions so the overlay does not apply scale twice.
      const rect = element.getBoundingClientRect()
      const matrix = this.#matrix(element)
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

  /** Border-box geometry shared by transform, selection and hover overlays. */
  boxGeometry(element: TransformElement, cropped = true): BoxGeometry {
    if(element.localName === "figure" && Array.from(element.classList).some(name => name.startsWith("◆figure-flow-"))) {
      const content = captionedFigureContent(element)
      if(content && this.#canTransform(content)) return this.boxGeometry(content, cropped)
    }
    let rect = element.getBoundingClientRect()
    let {width, height} = this.#size(element)
    let matrix = this.#matrix(element)
    const media = cropped ? this.editor.features.media.cropTargetFor(element) : null
    const insets = media && this.#mediaCropInsets(media)
    if(media && insets?.some(value => value)) {
      const source = this.boxGeometry(media, false)
      if(element.localName === "figure") {
        const visible = this.boxGeometry(media)
        const caption = element.querySelector<HTMLElement>(":scope > figcaption")
        const inverse = matrix.inverse()
        const local = (point: {x: number, y: number}) => this.#vector(inverse, point.x - rect.left - rect.width / 2, point.y - rect.top - rect.height / 2)
        const mediaPoints = visible.corners.map(local)
        const points = [...mediaPoints, ...(caption ? this.boxGeometry(caption, false).corners.map(local) : [])]
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

  updateInfo() {
    const target = this.target
    if(!target) { if(this.#target) this.clearTransform(); return }
    if(this.#group.length) {
      if(!this.#validGroupSelection()) { this.clearTransform(); return }
      const gesture = this.#gesture
      const rect = gesture?.group ? gesture.rect : this.#groupRect()
      const matrix = gesture?.group?.transform ?? new DOMMatrix()
      const center = matrix.transformPoint({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2})
      Object.assign(this.overlay.style, {width: `${rect.width}px`, height: `${rect.height}px`,
        left: `${fixedClientX(center.x - rect.width / 2)}px`, top: `${center.y - rect.height / 2}px`,
        transform: `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, 0, 0)`})
      this.overlay.querySelector<HTMLElement>('[part="transform-overlay-crop-frame"]')!.hidden = true
      this.#positionFlowControls(rect.width, rect.height, [])
      this.overlay.classList.toggle("◆transform-overlay-narrow", rect.width < 120)
      setPart(this.overlay, "transform-overlay-at-top", center.y - (Math.abs(matrix.b) * rect.width + Math.abs(matrix.d) * rect.height) / 2 < 50)
      this.#syncControlParts()
      return
    }
    const {rect, width, height, matrix, styles} = this.boxGeometry(target)
    const overlay = this.overlay
    Object.assign(overlay.style, {...styles, left: `${fixedClientX(parseFloat(styles.left))}px`})
    this.#positionCropControls(target, width, height, rect, matrix)
    const floats = this.editor.features.selection.floatExclusions(target, rect, styles)
    this.#positionFlowControls(width, height, floats)
    this.editor.features.selection.positionTransformCaret(target, overlay.style, floats)
    overlay.classList.toggle("◆transform-overlay-narrow", rect.width < 120)
    const centerY = rect.top + rect.height / 2
    const controlRadius = 8 * (Math.abs(matrix.b) + Math.abs(matrix.d))
    const rotateTop = centerY + matrix.d * (-height / 2 - 34) - controlRadius
    const ordererTop = centerY + matrix.b * (width / 2 + 3) + matrix.d * (-height / 2 - 22) - controlRadius
    const freeform = this.#isFreeformItem(target)
    // Copyright and Delete share the top row at opposite corners.
    const cornerControlsTop = freeform
      ? centerY - Math.abs(matrix.b) * (width / 2 + 3) + matrix.d * (-height / 2 - 34) - controlRadius
      : Infinity
    setPart(overlay, "transform-overlay-at-top", Math.min(rotateTop, ordererTop, cornerControlsTop) < 0)
    const transformedContent = captionedFigureContent(target)
    overlay.classList.toggle("◆transform-overlay-changed", ["rotate", "scale", "width", "height", "max-width", "max-height", "position", "top", "left", "float", "z-index"].some(key => target.style.getPropertyValue(key))
      || Boolean(transformedContent && ["rotate", "scale", "translate", "transform"].some(key => (transformedContent as TransformElement).style?.getPropertyValue(key))))
    const style = getComputedStyle(target)
    const position = (style.position || "static") as "static" | "relative" | "absolute" | "fixed" | "sticky"
    const block = findContainingBlock(target as HTMLElement, position)
    const corner = block instanceof Element ? block.getBoundingClientRect()
      : {left: position === "fixed" ? 0 : -window.scrollX, top: position === "fixed" ? 0 : -window.scrollY}
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
    this.arranger.setAttribute("data-float", floatSideFromStyles(style.float || "none", target.style, target.classList))
    this.orderer.setAttribute("data-z-order", style.zIndex === "auto" ? "0" : style.zIndex || "0")
    this.#syncControlParts()
    this.#updateContextMarkers()
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
      for(const box of floats.filter(box => box.top <= y && box.bottom >= y)) {
        spans = spans.flatMap(part => box.right <= part.left || box.left >= part.right ? [part]
          : [...(box.left > part.left ? [{left: part.left, right: box.left}] : []), ...(box.right < part.right ? [{left: box.right, right: part.right}] : [])])
      }
      return spans.sort((a, b) => (b.right - b.left) - (a.right - a.left))[0] ?? {left: 0, right: 0}
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

  #scheduleFrame() {
    if(this.#frame !== null || !this.isEnabled || !this.target) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null
      if(this.#gesture && !this.#validGesture()) return
      this.updateInfo()
      this.editor.features.graphic.refresh()
      this.#scheduleFrame()
    })
  }

  #updateContextMarkers() {
    const target = this.target && this.#isFreeformItem(this.target) ? this.target : null
    const position = target ? getComputedStyle(target).position || "static" : "static"
    const block = target && this.#gesture && ["absolute", "relative", "sticky"].includes(position)
      ? findContainingBlock(target as HTMLElement, position as "absolute" | "relative" | "sticky") : null
    const scroller = target && this.#gesture && position === "sticky" ? findScrollingAncestor(target.parentElement as HTMLElement) : null
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

  #validGroupSelection() {
    const selected = $.selectedElements
    return this.#group.length > 1 && selected.length === this.#group.length
      && this.#group.every((element, i) => element === selected[i] && this.#canTransform(element) && this.#isFreeformItem(element))
  }

  #groupRect() {
    const rects = this.#group.map(element => this.boxGeometry(element).rect)
    const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top))
    return new DOMRect(left, top, Math.max(...rects.map(rect => rect.right)) - left, Math.max(...rects.map(rect => rect.bottom)) - top)
  }

  #beginGroup(event: MouseEvent, mode: Mode, handle: HTMLElement) {
    if(!this.#validGroupSelection() || !["move", "rotate"].includes(mode)
      || mode === "rotate" && !this.#group.every(element => getComputedStyle(element).position === "absolute")) return false
    const rect = this.#groupRect()
    const members = this.#group.map(target => {
      const initial = document.createElement("div").style
      initial.cssText = target.style.cssText
      const transform = getComputedStyle(target).transform
      return {target, parent: target.parentElement, rect: target.getBoundingClientRect(), initial, written: new Map<string, StyleValue>(),
        matrix: this.#matrix(target), transform: new DOMMatrix(transform && transform !== "none" ? transform : undefined)}
    })
    if(rect.width <= 0 || rect.height <= 0 || members.some(({matrix}) => !matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8)) return false
    event.preventDefault()
    document.body.focus({preventScroll: true})
    if(!this.#validGroupSelection()) return false
    const first = members[0]
    this.#gesture = {...first, mode, handle, pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
      x: event.clientX, y: event.clientY, rect, width: rect.width, height: rect.height, cssWidth: rect.width, cssHeight: rect.height,
      matrix: new DOMMatrix(), parentMatrix: this.#matrix(renderedParentElement(first.target)), rotate: 0, scale: [1, 1],
      moved: false, captured: false, group: {members, transform: new DOMMatrix()}, endUndoGroup: this.editor.doc.beginUndoGroup()}
    this.#suppressClick = null
    if(event instanceof PointerEvent) {
      try { handle.setPointerCapture?.(event.pointerId) }
      catch { this.#finish(true); return false }
    }
    return true
  }

  #dragGroup(event: MouseEvent) {
    const gesture = this.#gesture!, group = gesture.group!
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if(!gesture.moved && Math.hypot(dx, dy) < (gesture.mode === "move" ? 8 : 1)) return
    gesture.moved = true
    this.#resetWritten()
    const round = this.getRoundingFunc(event)
    const cx = gesture.rect.left + gesture.width / 2, cy = gesture.rect.top + gesture.height / 2
    let transform = new DOMMatrix()
    if(gesture.mode === "move") {
      const delta = this.#vector(gesture.parentMatrix.inverse(), dx, dy)
      if(event.shiftKey) {
        if(Math.abs(dx) >= Math.abs(dy)) delta.y = 0
        else delta.x = 0
      }
      const offset = this.#vector(gesture.parentMatrix, round(delta.x), round(delta.y))
      transform = transform.translate(offset.x, offset.y)
      document.body.classList.add("◆transform-moving")
    }
    else {
      const degrees = (Math.atan2(event.clientY - cy, event.clientX - cx) - Math.atan2(gesture.y - cy, gesture.x - cx)) * 180 / Math.PI
      transform = transform.translate(cx, cy).rotate(round(degrees)).translate(-cx, -cy)
      document.body.classList.add("◆transform-rotating")
    }
    group.transform = transform
    const linear = new DOMMatrix([transform.a, transform.b, transform.c, transform.d, 0, 0])
    for(const member of group.members) {
      if(gesture.mode !== "move") {
        // Post-compose in the element's own axes. Individual CSS transforms,
        // ancestor zoom and authored origins are included in its live matrix.
        const local = member.matrix.inverse().multiply(linear).multiply(member.matrix)
        this.#write("transform", member.transform.multiply(local).toString(), "", member)
      }
      const center = transform.transformPoint({x: member.rect.left + member.rect.width / 2, y: member.rect.top + member.rect.height / 2})
      const current = member.target.getBoundingClientRect()
      this.#offsetBy(center.x - current.left - current.width / 2, center.y - current.top - current.height / 2, member)
    }
    this.updateInfo()
    if(gesture.mode === "move") this.#schedulePan(event)
  }

  #schedulePan(event: MouseEvent) {
    this.#panEvent = event
    if(this.editor.features.canvas.active && this.#panFrame === null) {
      this.#panFrame = requestAnimationFrame(() => {
        this.#panFrame = null
        const pointer = this.#panEvent
        if(pointer && this.#validGesture() && this.editor.features.canvas.panAtEdge({x: pointer.clientX, y: pointer.clientY})) this.handleMoveDrag(pointer)
      })
    }
  }

  #begin(event: MouseEvent, mode: Mode, handle: HTMLElement) {
    const target = this.target
    if(!target || this.#gesture || this.editor.isEditingLocked || event.button !== 0) return false
    if(this.#group.length) return this.#beginGroup(event, mode, handle)
    if(mode === "crop" && !cropDirections.some(direction => direction === handle.dataset.cropDirection)) return false
    if(mode === "rotate" && (!this.#isFreeformItem(target) || getComputedStyle(target).position !== "absolute")) return false
    const matrix = this.#matrix(target)
    if(!matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) return false
    const media = mode === "crop" ? this.editor.features.media.cropTargetFor(target) : null
    const insets = media && this.editor.features.media.canCrop(media) ? [0, 0, 0, 0] : null
    const sourceStyle = document.createElement("div").style
    sourceStyle.cssText = media?.style.cssText ?? ""
    const cropBox = media ? this.boxGeometry(media, false) : null
    if(mode === "crop" && (!media || !insets || !cropBox || cropBox.width <= 0 || cropBox.height <= 0
      || !cropBox.matrix.is2D || Math.abs(cropBox.matrix.a * cropBox.matrix.d - cropBox.matrix.b * cropBox.matrix.c) < 1e-8)) return false
    const selection = document.getSelection()
    const textSelection: Gesture["textSelection"] = mode === "move" && this.#isFreeformItem(target) && selection?.rangeCount === 1
      && !this.editor.features.selection.isCaptureSelection && !this.editor.features.table.hasCellSelection
      && $.isTextSelection && target.contains(selection.anchorNode) && target.contains(selection.focusNode)
      && !atomicEditingContainer(selection.anchorNode, this.editor.schema) && !atomicEditingContainer(selection.focusNode, this.editor.schema)
      ? {range: selection.getRangeAt(0).cloneRange(), backwards: $.isBackwards, start: null, end: null} : undefined
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
    const image = rotationTarget ?? (mode === "scale" && target.localName === "picture" ? this.editor.features.media.cropTargetFor(target) : null)
    const imageStyle = document.createElement("div").style
    imageStyle.cssText = image?.style.cssText ?? ""
    const endUndoGroup = this.editor.doc.beginUndoGroup()
    if(textSelection) {
      const {range} = textSelection
      textSelection.start = this.editor.doc.relativePositionFromDOMPoint(range.startContainer, range.startOffset)
      textSelection.end = this.editor.doc.relativePositionFromDOMPoint(range.endContainer, range.endOffset)
    }
    this.#gesture = {
      target, parent: target.parentElement, mode, handle,
      pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
      x: event.clientX, y: event.clientY, rect: (rotationTarget ?? target).getBoundingClientRect(), ...this.#size(target),
      matrix, parentMatrix: this.#matrix(renderedParentElement(rotationTarget ?? target)), rotate: this.#angle(getComputedStyle(rotationTarget ?? target).getPropertyValue("rotate")), scale: this.#scale(style.getPropertyValue("scale")),
      initial, written: new Map(), moved: false, textSelection,
      image: image && this.#canTransform(image) ? {target: image, parent: image.parentElement, initial: imageStyle, written: new Map()} : undefined,
      canvas: mode === "scale" ? this.#canvasViewport(target) : undefined,
      crop: media && insets && cropBox ? {target: media, parent: media.parentElement, width: cropBox.width, height: cropBox.height,
        matrix: cropBox.matrix, insets, edges: [...insets], sourceStyle} : undefined,
      captured: this.editor.features.selection.captureSelectedElement === target,
      endUndoGroup,
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
    // Activating a canvas move raises the item even without displacement.
    if(mode === "move" && this.editor.features.canvas.active && target.parentElement === document.body) {
      this.moveZ(target, true, true)
    }
    return true
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
    if(value === null) gesture.target.removeAttribute("viewBox")
    else gesture.target.setAttribute("viewBox", value)
    gesture.canvas!.written = value
  }

  #validGesture() {
    const gesture = this.#gesture
    if(!gesture) return false
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
      || gesture.image && ((gesture.mode === "rotate" ? captionedFigureContent(gesture.target) !== gesture.image.target
        : this.editor.features.media.cropTargetFor(gesture.target) !== gesture.image.target) || gesture.image.parent !== gesture.image.target.parentElement
        || [...gesture.image.written].some(([key, last]) => gesture.image!.target.style.getPropertyValue(key) !== last.value
          || gesture.image!.target.style.getPropertyPriority(key) !== last.priority))
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
    if(value) target.style.setProperty(property, value, priority)
    else target.style.removeProperty(property)
    gesture?.written.set(property, {value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property)})
  }

  #resetWritten() {
    const gesture = this.#gesture!
    for(const styles of gesture.group?.members ?? [gesture, gesture.image]) if(styles) {
      for(const property of styles.written.keys()) this.#write(property, styles.initial.getPropertyValue(property), styles.initial.getPropertyPriority(property), styles)
    }
  }

  /** Adjust offsets by the measured viewport displacement. Measuring after a
   * mode/size change accounts for margins, borders, scrollers and CSS origins. */
  #offsetBy(dx: number, dy: number, styles: GestureStyles | null = this.#gesture) {
    if(!this.editor.features.canvas.active && !this.editor.features.slides.active) return
    const target = styles?.target ?? this.target!
    if(Math.abs(dx) < .01 && Math.abs(dy) < .01) return
    const delta = this.#vector(this.#matrix(renderedParentElement(target)).inverse(), dx, dy)
    const write = (property: string, value: string) => this.#write(property, value, "", styles)
    if(getComputedStyle(target).position === "static") write("position", "relative")
    const style = getComputedStyle(target)
    const x = parseFloat(style.left), y = parseFloat(style.top)
    const left = Number.isFinite(x) ? x : -(parseFloat(style.right) || 0)
    const top = Number.isFinite(y) ? y : -(parseFloat(style.bottom) || 0)
    write("right", "auto")
    write("bottom", "auto")
    write("left", `${left + delta.x}px`)
    write("top", `${top + delta.y}px`)
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

  handleMoveDrag(event: MouseEvent) {
    if(!this.#validGesture()) return
    const gesture = this.#gesture!
    if(gesture.mode !== "move" && gesture.mode !== "anchor") return
    if(gesture.group) { this.#dragGroup(event); return }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if(!gesture.moved && Math.hypot(dx, dy) < 8) return
    gesture.moved = true
    document.body.classList.add("◆transform-moving")
    if(gesture.mode === "anchor" || modifierKeyDown(event) || !this.editor.features.canvas.active && !this.editor.features.slides.active) {
      if(this.#panFrame !== null) cancelAnimationFrame(this.#panFrame)
      this.#panFrame = null
      this.#panEvent = null
      this.#resetWritten()
      this.#previewDrop(event)
      this.updateInfo()
      return
    }
    this.#clearDrop()
    this.#resetWritten()
    const position = getComputedStyle(gesture.target).position || "static"
    if(position === "static") this.#setPosition("absolute")
    const round = this.getRoundingFunc(event)
    const delta = this.#vector(gesture.parentMatrix.inverse(), dx, dy)
    if(event.shiftKey) {
      if(Math.abs(dx) >= Math.abs(dy)) delta.y = 0
      else delta.x = 0
    }
    const viewportDelta = this.#vector(gesture.parentMatrix, round(delta.x), round(delta.y))
    const current = this.targetRect
    this.#offsetBy(gesture.rect.left + viewportDelta.x - current.left, gesture.rect.top + viewportDelta.y - current.top)
    this.updateInfo()
    this.#schedulePan(event)
  }

  handleScaleDrag(event: MouseEvent) {
    if(!this.#validGesture() || this.#gesture!.mode !== "scale") return
    const gesture = this.#gesture!
    if(gesture.group) { this.#dragGroup(event); return }
    const target = gesture.target
    const text = !this.#isFreeformItem(target) && this.#isTextContainer(target)
    const image = Boolean(gesture.image || target instanceof HTMLImageElement && !target.hasAttribute("is"))
    const direction = gesture.handle.dataset.resizeDirection ?? gesture.handle.id.replace("◆transform-overlay-scale-", "")
    if(text && !direction.includes("left") && !direction.includes("right")) return
    const delta = this.#vector(gesture.matrix.inverse(), event.clientX - gesture.x, event.clientY - gesture.y)
    if(!gesture.moved && (text ? Math.abs(delta.x) : Math.hypot(delta.x, delta.y)) < 1) return
    gesture.moved = true
    this.#resetWritten()
    const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
    const y = text ? 0 : direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
    document.body.classList.add(`◆transform-scaling-${x && y ? x === y ? "nwse" : "nesw" : x ? "ew" : "ns"}`)
    const symmetric = modifierKeyDown(event)
    const centered = !this.#isFreeformItem(target) && this.#resizeAlignment(target) === "center"
    const round = this.getRoundingFunc(event)
    let dw = x ? Math.max(1 - gesture.width, round(x * delta.x * (symmetric || centered ? 2 : 1))) : 0
    let dh = y ? Math.max(1 - gesture.height, round(y * delta.y * (symmetric ? 2 : 1))) : 0
    if(image && event.shiftKey) {
      const change = x && (!y || Math.abs(dw / gesture.width) >= Math.abs(dh / gesture.height)) ? dw / gesture.width : dh / gesture.height
      dw = gesture.cssWidth * change
      dh = gesture.cssHeight * change
    }
    const crop = gesture.canvas && !event.altKey
    if(gesture.canvas) this.#writeCanvasViewBox(gesture.canvas.initial)
    const style = getComputedStyle(target)
    if(style.display === "inline" && target instanceof HTMLElement) this.#write("display", "inline-block")
    let actualDW = dw, actualDH = dh
    if(event.shiftKey && !crop && !text && !image) {
      this.#write("scale", `${gesture.scale[0] * (gesture.width + dw) / gesture.width} ${gesture.scale[1] * (gesture.height + dh) / gesture.height}`)
    }
    else {
      if(text) {
        this.#write("height", "auto")
        this.#write("min-height", mathRoot(target) === target ? "" : "0px")
        this.#write("max-height", "none")
      }
      if(image) {
        const width = Math.max(1, gesture.cssWidth + dw), height = Math.max(1, gesture.cssHeight + dh)
        this.#write("width", "100%")
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
      else if(this.#isFreeformItem(target) || standaloneGraphicShape(target)) {
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
        if(floatSideFromStyles(getComputedStyle(target).float, target.style, target.classList) !== "none") {
          this.#write("--ww-float-size", `min(100%, var(--ww-float-width), ${width}px)`)
        }
        this.#write("max-width", `${width}px`)
      }
      if(y) this.#write("max-height", `${Math.max(0, gesture.cssHeight + dh)}px`)
      // Maximums may not change the used size (for example, an image's natural
      // size can be smaller). Keep the anchor tied to the actual rendered box.
      const size = this.#size(target)
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
    if(this.#isFreeformItem(target) && (getComputedStyle(target).position || "static") !== "static") {
      const shift = this.#vector(gesture.matrix, symmetric ? 0 : x * actualDW / 2, text ? actualDH / 2 : symmetric ? 0 : y * actualDH / 2)
      const rect = this.targetRect
      this.#offsetBy(gesture.rect.left + gesture.rect.width / 2 + shift.x - (rect.left + rect.width / 2),
        gesture.rect.top + gesture.rect.height / 2 + shift.y - (rect.top + rect.height / 2))
    }
    this.updateInfo()
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
    gesture.moved = true
    document.body.classList.add("◆transform-rotating")
    this.#resetWritten()
    const cx = gesture.rect.left + gesture.rect.width / 2, cy = gesture.rect.top + gesture.rect.height / 2
    const inverse = gesture.parentMatrix.inverse()
    const start = this.#vector(inverse, gesture.x - cx, gesture.y - cy)
    const end = this.#vector(inverse, event.clientX - cx, event.clientY - cy)
    const degrees = (Math.atan2(end.y, end.x) - Math.atan2(start.y, start.x)) * 180 / Math.PI
    const angle = this.getRoundingFunc(event)(gesture.rotate + degrees)
    this.#write("rotate", `${angle}deg`, "", gesture.image ?? gesture)
    this.editor.features.layout.refresh()
    const rect = (gesture.image?.target ?? gesture.target).getBoundingClientRect()
    this.#offsetBy(cx - (rect.left + rect.width / 2), cy - (rect.top + rect.height / 2))
    this.updateInfo()
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
    if(this.#drop) removeEditorMarker(this.#drop.element, `◆drop-caret-${this.#drop.placement}`)
    this.#drop = null
    this.#normalDropRange = null
    this.editor.features.manipulation.clearFloatDropPreview("transformation", keepFloatPreview)
    this.editor.features.selection.clearDropCaret()
  }

  #finish(cancel: boolean) {
    if(this.#panFrame !== null) cancelAnimationFrame(this.#panFrame)
    this.#panFrame = null
    this.#panEvent = null
    const gesture = this.#gesture
    if(!gesture) return
    const valid = gesture.group ? this.#validGroupSelection() : gesture.target === this.target && gesture.parent === gesture.target.parentElement
    const target = gesture.target
    if(cancel || !valid) {
      if(gesture.canvas && target.getAttribute("viewBox") === gesture.canvas.written) this.#writeCanvasViewBox(gesture.canvas.initial)
      // Revert only properties still owned by this gesture. Concurrent changes
      // to other properties, or to these same properties, remain authoritative.
      for(const styles of gesture.group?.members ?? [gesture, gesture.image]) if(styles) {
        for(const [key, last] of styles.written) {
          if(styles.target.style.getPropertyValue(key) === last.value && styles.target.style.getPropertyPriority(key) === last.priority) {
            const value = styles.initial.getPropertyValue(key)
            if(value) styles.target.style.setProperty(key, value, styles.initial.getPropertyPriority(key))
            else styles.target.style.removeProperty(key)
          }
        }
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
    this.#gesture = null
    if(gesture.mode === "rotate" && gesture.image) this.editor.features.layout.refresh()
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
    if(gesture.crop && !gesture.crop.target.style.length) gesture.crop.target.removeAttribute("style")
    if(gesture.pointerId !== undefined && gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId)
    document.body.classList.remove("◆transform-moving", "◆transform-rotating", "◆transform-scaling-ew", "◆transform-scaling-ns", "◆transform-scaling-nwse", "◆transform-scaling-nesw")
    document.body.classList.remove(...cropDirections.map(direction => `◆transform-cropping-${direction}`))
    this.#clearDrop()
    this.editor.features.manipulation.clearFloatDropTargets()
    const textSelection = gesture.textSelection
    if(valid && gesture.moved && textSelection && !this.editor.isEditingLocked && !this.editor.features.selection.isCaptureSelection && $.selectedElement === target
      && target.contains(textSelection.range.startContainer) && target.contains(textSelection.range.endContainer)) {
      // A border click selects the box; a drag lets typing continue in its
      // text selection. Relative positions follow local and remote text edits.
      this.editor.doc.syncFromDOM()
      const start = textSelection.start && this.editor.doc.domPointFromRelativePosition(textSelection.start)
      const end = textSelection.end && this.editor.doc.domPointFromRelativePosition(textSelection.end)
      if(start && end && target.contains(start.node) && target.contains(end.node)) {
        const [anchor, focus] = textSelection.backwards ? [end, start] : [start, end]
        $.selectRange(anchor.node, anchor.offset, focus.node, focus.offset)
      }
    }
    gesture.endUndoGroup()
    if(valid) {
      if(gesture.captured && !cancel && !gesture.moved && (gesture.mode === "move" || gesture.mode === "scale")) {
        this.editor.features.selection.selectElement(target)
      }
      else if(gesture.captured) this.editor.features.selection.captureElement(target, {
        preserveNativeSelection: gesture.mode !== "move" && gesture.mode !== "anchor",
      })
      else this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    }
    this.updateInfo()
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
    this.#suppressClick = null
    this.editor.features.selection.clearTransformCaret()
    const targets = new Set([...this.#group, ...(this.#target ? [this.#target] : []), ...document.querySelectorAll(".◆transform-target")])
    for(const target of targets) removeEditorMarker(target, "◆transform-target")
    this.#target = null
    this.#group = []
    this.#positionFlowControls(0, 0, [])
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#clearDrop()
    this.#updateContextMarkers()
    const overlay = document.body.shadowRoot?.querySelector<HTMLElement>("#◆transform-overlay")
    if(overlay) {
      if(overlay.getAttribute("visibility") !== "hidden") overlay.setAttribute("visibility", "hidden")
      setPart(overlay, "transform-overlay-content-selected", false)
      overlay.querySelectorAll("[data-open]").forEach(control => control.removeAttribute("data-open"))
      this.#syncControlParts()
    }
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    window.addEventListener("blur", this.#cancelGesture)
    if(!this.#observer) {
      this.#observer = new MutationObserver(() => { if(this.#target && !this.target) this.clearTransform() })
      this.#observer.observe(document.body, {childList: true, subtree: true})
    }
  }

  disable() {
    super.disable()
    window.removeEventListener("blur", this.#cancelGesture)
    this.#observer?.disconnect()
    this.#observer = null
    this.clearTransform()
    document.body.shadowRoot?.querySelector("#◆transform-overlay")?.remove()
  }

  captureListeners: DocumentListenerMap = {
    pointerdown: event => {
      const origin = event.composedPath()[0]
      if(!this.#group.length || event.defaultPrevented || event.button !== 0 || event.detail >= 2
        || modifierKeyDown(event) || event.shiftKey || !(origin instanceof Node)
        || !getDocumentRoot().contains(origin) || !this.#group.some(element => element.contains(origin))) return
      if(this.#begin(event, "move", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-scale-right")!)) event.stopImmediatePropagation()
    },
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
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || !this.overlay.contains(handle)) return
      if(this.editor.isEditingLocked) { event.preventDefault(); event.stopImmediatePropagation(); return }
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
      if(this.#gesture.mode === "scale") this.handleScaleDrag(event)
      else if(this.#gesture.mode === "crop") this.handleCropDrag(event)
      else if(this.#gesture.mode === "rotate") this.handleRotateDrag(event)
      else this.handleMoveDrag(event)
    },
    pointerup: event => {
      if(!this.#gesture || this.#gesture.pointerId !== event.pointerId) return
      if(this.#validGesture()) this.#finish(false)
    },
    pointercancel: event => { if(this.#gesture?.pointerId === event.pointerId) this.#finish(true) },
    lostpointercapture: event => { if(this.#gesture?.pointerId === event.pointerId) this.#finish(true) },
    click: event => {
      const suppressClick = this.#suppressClick
      this.#suppressClick = null
      if(suppressClick && event.composedPath().includes(suppressClick)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      const handle = event.composedPath()[0]
      if(handle instanceof HTMLElement && handle.dataset.transformMode === "move" && handle.draggable && this.overlay.contains(handle)) {
        const target = this.target
        if(target && !this.#gesture && !this.editor.isEditingLocked) this.editor.features.selection.selectElement(target)
        event.stopPropagation()
      }
      if(handle instanceof HTMLElement && handle.id === "◆transform-overlay-delete" && this.overlay.contains(handle)) {
        const target = this.target
        if(target && !this.#gesture && !this.editor.isEditingLocked) {
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
