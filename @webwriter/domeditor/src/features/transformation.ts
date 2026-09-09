import { DocumentListenerMap, EditorFeature } from "."
import { $, findContainingBlock, findScrollingAncestor, findStackingContainer, getDescendantsInStackingOrder, getStaticCoords, isElement, modifierKeyDown, roundByDPR, roundTo, setPart } from "../utility"
import {getDocumentRoot, isDocumentRoot} from "../document-template"

type TransformElement = HTMLElement | SVGSVGElement
type Mode = "move" | "scale" | "rotate" | "anchor"
type StyleValue = {value: string, priority: string}
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
  endUndoGroup: () => void
}

/** Selection-owned spatial controls in the shadow appendix.
 *
 * Move: drag at least 8 CSS pixels to detach a static element into absolute
 * positioning. Relative, sticky and fixed elements retain their mode.
 * Ctrl/Cmd previews a gap and returns the element to normal flow on release.
 * Shift constrains movement to one axis; Alt disables snapping.
 *
 * Resize: corners set width/height. Top/left handles keep the
 * opposite edge fixed by adjusting offsets. Ctrl/Cmd resizes about the center;
 * Shift stretches with CSS scale instead of reflowing content; Alt unsnaps.
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
  #gesture: Gesture | null = null
  #floatValues = ["none", "left", "right"] as const
  #observer: MutationObserver | null = null
  #frame: number | null = null
  #drop: {element: Element, placement: "before" | "after", parent: Node} | null = null
  #suppressClick = false
  readonly #cancelGesture = () => this.#finish(true)

  #createScaler(direction: string) {
    const point = document.createElement("button")
    point.id = `◆transform-overlay-scale-${direction}`
    point.classList.add("◆transform-overlay-scale")
    point.setAttribute("part", `transform-overlay-scale transform-overlay-scale-${direction}`)
    point.dataset.transformMode = "scale"
    point.title = `Resize ${direction}`
    return point
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
  set #float(value: "none" | "left" | "right") {
    if(!this.target || this.editor.isEditingLocked) return
    this.target.style.float = value === "none"? "": value
    this.arranger?.setAttribute("data-float", value)
    this.arranger?.toggleAttribute("data-open", false)
    this.updateInfo()
  }

  get #float() {
    return this.arranger?.getAttribute("data-float") as "none" | "left" | "right" ?? "none"
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

  /** Creates the float menu (none/left/right) of the arranger. */
  #createArrangerMenu() {
    const floatNone = document.createElement("button")
    floatNone.id = `◆transform-overlay-float-none`
    floatNone.setAttribute("part", "transform-overlay-button transform-overlay-float-none")
    floatNone.addEventListener("click", ev => {this.#float = "none"; ev.stopPropagation()})
    floatNone.classList.add("◆transform-overlay-button")
    
    const floatLeft = document.createElement("button")
    floatLeft.id = `◆transform-overlay-float-left`
    floatLeft.setAttribute("part", "transform-overlay-button transform-overlay-float-left")
    floatLeft.addEventListener("click", ev => {this.#float = "left"; ev.stopPropagation()})
    floatLeft.classList.add("◆transform-overlay-button")
    
    const floatRight = document.createElement("button") 
    floatRight.id = `◆transform-overlay-float-right`
    floatRight.setAttribute("part", "transform-overlay-button transform-overlay-float-right")
    floatRight.addEventListener("click", ev => {this.#float = "right"; ev.stopPropagation()})
    floatRight.classList.add("◆transform-overlay-button")
    
    const menu = document.createElement("div")
    menu.id = "◆transform-overlay-arranger-menu"
    menu.setAttribute("part", "transform-overlay-arranger-menu transform-overlay-arranger-menu-hidden")
    menu.append(floatNone, floatLeft, floatRight)
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
    const control = (name: string, title: string, mode?: Mode) => {
      const button = document.createElement("button")
      button.id = `◆transform-overlay-${name}`
      button.classList.add("◆transform-overlay-button")
      button.setAttribute("part", `transform-overlay-button transform-overlay-${name}`)
      button.title = title
      if(mode) button.dataset.transformMode = mode
      return button
    }
    const mover = control("mover", "Move", "move")
    const rotator = control("rotator", "Rotate", "rotate")
    const anchor = control("anchor", "Position anchor: drag to relocate; Ctrl/Cmd-click to cycle position; Shift-click for fixed", "anchor")
    const sticky = control("anchor-sticky", "Toggle sticky positioning")
    sticky.addEventListener("click", event => { this.toggleSticky(); event.stopPropagation() })
    anchor.addEventListener("click", event => {
      if(this.#suppressClick) return
      if(event.shiftKey) this.#setPosition("fixed")
      else if(modifierKeyDown(event) && this.target) {
        const position = getComputedStyle(this.target).position
        this.#setPosition(position === "absolute" ? "relative" : position === "relative" ? "sticky" : "absolute")
      }
      event.stopPropagation()
    })
    overlay.append(
      ...["up-left", "up-right", "down-left", "down-right"].map(dir => this.#createScaler(dir)),
      mover, rotator, anchor, sticky, this.#createArranger(), this.#createOrderer(),
    )
    overlay.querySelectorAll("button").forEach(button => {
      button.type = "button"
      const label = button.title || ({
        restorer: "Reset transformations", arranger: "Float", orderer: "Stacking order",
        "float-none": "No float", "float-left": "Float left", "float-right": "Float right",
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

  #canTransform(element: Element): element is TransformElement {
    return (element instanceof HTMLElement || element instanceof SVGSVGElement)
      && element !== document.documentElement && element !== document.head
      && !isDocumentRoot(element) && getDocumentRoot().contains(element)
  }

  /** Called at the selection feature's invariant boundary, including capture
   * changes that do not dispatch a native selectionchange. */
  syncSelection(element: Element | null) {
    if(!this.isEnabled) return
    if(this.#gesture) return
    if(element && this.#canTransform(element)) this.startTransform(element)
    else this.clearTransform()
  }

  startTransform(element: Element) {
    if(!this.#canTransform(element) || this.editor.isEditingLocked) return
    if(this.#target !== element) {
      this.clearTransform()
      this.#target = element
    }
    if(!element.classList.contains("◆transform-target")) element.classList.add("◆transform-target")
    this.overlay.removeAttribute("visibility")
    this.updateInfo()
    this.#scheduleFrame()
  }

  #syncControlParts() {
    const overlay = this.overlay
    const position = this.target ? getComputedStyle(this.target).position || "static" : "static"
    setPart(overlay, "transform-overlay-hidden", overlay.hasAttribute("visibility"))
    setPart(overlay, "transform-overlay-narrow", this.isNarrow)
    const hidden = (name: string, hide: boolean) => {
      const control = overlay.querySelector<HTMLElement>(`#◆transform-overlay-${name}`)!
      setPart(control, `transform-overlay-${name}-hidden`, hide)
      control.hidden = hide
    }
    hidden("rotator", position !== "absolute")
    hidden("orderer", position !== "absolute")
    hidden("arranger", true)
    hidden("anchor", position === "static")
    hidden("anchor-sticky", !["relative", "sticky"].includes(position))
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
    const angle = this.#angle(style.rotate)
    const scale = this.#scale(style.scale)
    const own = new DOMMatrix().rotate(angle).scale(scale[0], scale[1])
      .multiply(new DOMMatrix(style.transform && style.transform !== "none" ? style.transform : undefined))
    own.e = own.f = 0
    return this.#matrix(element.parentElement).multiply(own)
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
    const width = parseFloat(style.width) || element.getBoundingClientRect().width
    const height = parseFloat(style.height) || element.getBoundingClientRect().height
    const extra = (properties: string[]) => properties.reduce((sum, property) => sum + (parseFloat(style.getPropertyValue(property)) || 0), 0)
    return {
      cssWidth: width, cssHeight: height,
      width: width + (style.boxSizing === "border-box" ? 0 : extra(["padding-left", "padding-right", "border-left-width", "border-right-width"])),
      height: height + (style.boxSizing === "border-box" ? 0 : extra(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"])),
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

  updateInfo() {
    const target = this.target
    if(!target) { if(this.#target) this.clearTransform(); return }
    const rect = target.getBoundingClientRect()
    const {width, height} = this.#size(target)
    const matrix = this.#matrix(target)
    const overlay = this.overlay
    Object.assign(overlay.style, {
      width: `${width}px`, height: `${height}px`,
      left: `${rect.left + rect.width / 2 - width / 2}px`,
      top: `${rect.top + rect.height / 2 - height / 2}px`,
      transform: `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, 0, 0)`,
    })
    overlay.classList.toggle("◆transform-overlay-narrow", rect.width < 120)
    const centerY = rect.top + rect.height / 2
    const controlRadius = 8 * (Math.abs(matrix.b) + Math.abs(matrix.d))
    const rotateTop = centerY + matrix.d * (-height / 2 - 34) - controlRadius
    const ordererTop = centerY + matrix.b * (width / 2 + 3) + matrix.d * (-height / 2 - 22) - controlRadius
    setPart(overlay, "transform-overlay-at-top", Math.min(rotateTop, ordererTop) < 0)
    overlay.classList.toggle("◆transform-overlay-changed", ["rotate", "scale", "width", "height", "position", "top", "left", "float", "z-index"].some(key => target.style.getPropertyValue(key)))
    const style = getComputedStyle(target)
    this.arranger.setAttribute("data-float", style.float || "none")
    this.orderer.setAttribute("data-z-order", style.zIndex === "auto" ? "0" : style.zIndex || "0")
    this.#syncControlParts()
    this.#updateContextMarkers()
  }

  #scheduleFrame() {
    if(this.#frame !== null || !this.isEnabled || !this.target) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null
      if(this.#gesture && !this.#validGesture()) return
      this.updateInfo()
      this.#scheduleFrame()
    })
  }

  #updateContextMarkers() {
    const target = this.target
    const position = target ? getComputedStyle(target).position || "static" : "static"
    const block = target && this.#gesture && ["absolute", "relative", "sticky"].includes(position)
      ? findContainingBlock(target as HTMLElement, position as "absolute" | "relative" | "sticky") : null
    const scroller = target && this.#gesture && position === "sticky" ? findScrollingAncestor(target.parentElement as HTMLElement) : null
    for(const [marker, current] of [["◆transform-containing-block", block], ["◆transform-scrolling-ancestor", scroller]] as const) {
      document.querySelectorAll(`.${marker}`).forEach(element => { if(element !== current) this.#removeMarkerClass(element, marker) })
      if(current instanceof Element && !current.classList.contains(marker)) current.classList.add(marker)
    }
  }

  getRoundingFunc(event: MouseEvent) {
    return event.altKey ? roundByDPR : this.#gesture?.mode === "rotate"
      ? (n: number) => roundTo(n, event.shiftKey ? 45 : 5)
      : (n: number) => roundTo(n, 10)
  }

  #begin(event: MouseEvent, mode: Mode, handle: HTMLElement) {
    const target = this.target
    if(!target || this.#gesture || this.editor.isEditingLocked || event.button !== 0) return false
    if(mode === "rotate" && getComputedStyle(target).position !== "absolute") return false
    const matrix = this.#matrix(target)
    if(!matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) return false
    const initial = document.createElement("div").style
    initial.cssText = target.style.cssText
    const style = getComputedStyle(target)
    this.#gesture = {
      target, parent: target.parentElement, mode, handle,
      pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
      x: event.clientX, y: event.clientY, rect: target.getBoundingClientRect(), ...this.#size(target),
      matrix, parentMatrix: this.#matrix(target.parentElement), rotate: this.#angle(style.rotate), scale: this.#scale(style.scale),
      initial, written: new Map(), moved: false,
      captured: this.editor.features.selection.captureSelectedElement === target,
      endUndoGroup: this.editor.doc.beginUndoGroup(),
    }
    this.#suppressClick = false
    event.preventDefault()
    if(event instanceof PointerEvent) {
      try { handle.setPointerCapture?.(event.pointerId) }
      catch { this.#finish(true); return false }
    }
    return true
  }

  #validGesture() {
    const gesture = this.#gesture
    if(!gesture) return false
    if(this.editor.isEditingLocked || gesture.target !== this.target || gesture.parent !== gesture.target.parentElement
      || [...gesture.written].some(([key, last]) => gesture.target.style.getPropertyValue(key) !== last.value
        || gesture.target.style.getPropertyPriority(key) !== last.priority)) {
      this.#finish(true)
      return false
    }
    return true
  }

  #write(property: string, value: string, priority = "") {
    const gesture = this.#gesture
    const target = gesture?.target ?? this.target
    if(!target) return
    if(value) target.style.setProperty(property, value, priority)
    else target.style.removeProperty(property)
    gesture?.written.set(property, {value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property)})
  }

  #resetWritten() {
    const gesture = this.#gesture!
    for(const property of gesture.written.keys()) this.#write(property, gesture.initial.getPropertyValue(property), gesture.initial.getPropertyPriority(property))
  }

  /** Adjust offsets by the measured viewport displacement. Measuring after a
   * mode/size change accounts for margins, borders, scrollers and CSS origins. */
  #offsetBy(dx: number, dy: number) {
    const target = this.target!
    if(Math.abs(dx) < .01 && Math.abs(dy) < .01) return
    const delta = this.#vector(this.#matrix(target.parentElement).inverse(), dx, dy)
    if(getComputedStyle(target).position === "static") this.#write("position", "relative")
    const style = getComputedStyle(target)
    const left = parseFloat(style.left) || -(parseFloat(style.right) || 0)
    const top = parseFloat(style.top) || -(parseFloat(style.bottom) || 0)
    this.#write("right", "auto")
    this.#write("bottom", "auto")
    this.#write("left", `${left + delta.x}px`)
    this.#write("top", `${top + delta.y}px`)
  }

  #setPosition(position: string) {
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

  handleMoveStart(event: MouseEvent) { this.#begin(event, "move", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-mover")!) }
  handleScaleStart(event: MouseEvent) {
    const handle = event.composedPath()[0] ?? event.target
    if(handle instanceof HTMLElement && handle.dataset.transformMode === "scale") this.#begin(event, "scale", handle)
  }
  handleRotateStart(event: MouseEvent) { this.#begin(event, "rotate", this.overlay.querySelector<HTMLElement>("#◆transform-overlay-rotator")!) }

  handleMoveDrag(event: MouseEvent) {
    if(!this.#validGesture()) return
    const gesture = this.#gesture!
    if(gesture.mode !== "move" && gesture.mode !== "anchor") return
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if(!gesture.moved && Math.hypot(dx, dy) < 8) return
    gesture.moved = true
    document.body.classList.add("◆transform-moving")
    if(gesture.mode === "anchor" || modifierKeyDown(event)) {
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
  }

  handleScaleDrag(event: MouseEvent) {
    if(!this.#validGesture() || this.#gesture!.mode !== "scale") return
    const gesture = this.#gesture!
    const delta = this.#vector(gesture.matrix.inverse(), event.clientX - gesture.x, event.clientY - gesture.y)
    if(!gesture.moved && Math.hypot(delta.x, delta.y) < 1) return
    gesture.moved = true
    this.#resetWritten()
    const direction = gesture.handle.id.replace("◆transform-overlay-scale-", "")
    const x = direction.includes("left") ? -1 : direction.includes("right") ? 1 : 0
    const y = direction.includes("up") ? -1 : direction.includes("down") ? 1 : 0
    document.body.classList.add(`◆transform-scaling-${x && y ? x === y ? "nwse" : "nesw" : x ? "ew" : "ns"}`)
    const symmetric = modifierKeyDown(event)
    const round = this.getRoundingFunc(event)
    const dw = x ? Math.max(1 - gesture.width, round(x * delta.x * (symmetric ? 2 : 1))) : 0
    const dh = y ? Math.max(1 - gesture.height, round(y * delta.y * (symmetric ? 2 : 1))) : 0
    const target = gesture.target
    if(getComputedStyle(target).display === "inline" && target instanceof HTMLElement) this.#write("display", "inline-block")
    if(event.shiftKey) {
      this.#write("scale", `${gesture.scale[0] * (gesture.width + dw) / gesture.width} ${gesture.scale[1] * (gesture.height + dh) / gesture.height}`)
    }
    else {
      if(x) this.#write("width", `${Math.max(0, gesture.cssWidth + dw)}px`)
      if(y) this.#write("height", `${Math.max(0, gesture.cssHeight + dh)}px`)
    }
    const shift = this.#vector(gesture.matrix, symmetric ? 0 : x * dw / 2, symmetric ? 0 : y * dh / 2)
    const rect = this.targetRect
    this.#offsetBy(gesture.rect.left + gesture.rect.width / 2 + shift.x - (rect.left + rect.width / 2),
      gesture.rect.top + gesture.rect.height / 2 + shift.y - (rect.top + rect.height / 2))
    this.updateInfo()
  }

  handleRotateDrag(event: MouseEvent) {
    if(!this.#validGesture() || this.#gesture!.mode !== "rotate") return
    const gesture = this.#gesture!
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
    this.#write("rotate", `${angle}deg`)
    const rect = this.targetRect
    this.#offsetBy(cx - (rect.left + rect.width / 2), cy - (rect.top + rect.height / 2))
    this.updateInfo()
  }

  handleMoveEnd(_event?: MouseEvent) { this.#finish(false) }
  handleScaleEnd(_event?: MouseEvent) { this.#finish(false) }
  handleRotateEnd(_event?: MouseEvent) { this.#finish(false) }

  #previewDrop(event: MouseEvent) {
    this.#clearDrop()
    const target = this.target!
    const hit = document.elementsFromPoint(event.clientX, event.clientY).find(element =>
      getDocumentRoot().contains(element) && !target.contains(element) && !element.contains(target))
    if(!hit) return
    // Widgets are atomic, including their authored light-DOM contents.
    let element = hit
    for(let parent = hit.parentElement; parent && !isDocumentRoot(parent); parent = parent.parentElement) {
      if(parent.localName.includes("-") || parent.hasAttribute("is")) element = parent
    }
    if(isDocumentRoot(element) || !element.parentNode || element.contains(target)) return
    const rect = element.getBoundingClientRect()
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    this.#drop = {element, placement, parent: element.parentNode}
    element.classList.add(`◆drop-caret-${placement}`)
    this.editor.features.selection.showDropCaret(placement)
  }

  #clearDrop() {
    if(this.#drop) this.#removeMarkerClass(this.#drop.element, `◆drop-caret-${this.#drop.placement}`)
    this.#drop = null
    this.editor.features.selection.clearDropCaret()
  }

  #finish(cancel: boolean) {
    const gesture = this.#gesture
    if(!gesture) return
    const valid = gesture.target === this.target && gesture.parent === gesture.target.parentElement
    const target = gesture.target
    if(cancel || !valid) {
      // Revert only properties still owned by this gesture. Concurrent changes
      // to other properties, or to these same properties, remain authoritative.
      for(const [key, last] of gesture.written) {
        if(target.style.getPropertyValue(key) === last.value && target.style.getPropertyPriority(key) === last.priority) {
          const value = gesture.initial.getPropertyValue(key)
          if(value) target.style.setProperty(key, value, gesture.initial.getPropertyPriority(key))
          else target.style.removeProperty(key)
        }
      }
    }
    else if(gesture.moved && this.#drop) {
      const {element, placement, parent} = this.#drop
      if(getDocumentRoot().contains(element) && element.parentNode === parent && !target.contains(element) && !element.contains(target)) {
        if(gesture.mode === "move") {
          for(const key of ["left", "top", "right", "bottom"]) this.#write(key, "auto")
          this.#write("position", "static")
        }
        element[placement](target)
      }
    }
    this.#gesture = null
    this.#suppressClick = gesture.moved
    if(!target.style.length) target.removeAttribute("style")
    if(gesture.pointerId !== undefined && gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId)
    document.body.classList.remove("◆transform-moving", "◆transform-rotating", "◆transform-scaling-ew", "◆transform-scaling-ns", "◆transform-scaling-nwse", "◆transform-scaling-nesw")
    this.#clearDrop()
    gesture.endUndoGroup()
    if(valid) {
      if(gesture.captured) this.editor.features.selection.captureElement(target, {preserveNativeSelection: true})
      else { $.selectElement(target); this.editor.features.selection.processSelection() }
    }
    this.updateInfo()
  }

  restore() {
    if(!this.target || this.editor.isEditingLocked) return
    for(const property of ["width", "height", "rotate", "scale", "float", "position", "top", "left", "right", "bottom", "z-index"]) this.target.style.removeProperty(property)
    if(!this.target.style.length) this.target.removeAttribute("style")
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

  #removeMarkerClass(element: Element, marker: string) {
    element.classList.remove(marker)
    if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) element.classList.remove("◆")
    if(!element.classList.length) element.removeAttribute("class")
  }

  clearTransform() {
    this.#finish(true)
    if(this.#target) this.#removeMarkerClass(this.#target, "◆transform-target")
    this.#target = null
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#clearDrop()
    this.#updateContextMarkers()
    const overlay = document.body.shadowRoot?.querySelector<HTMLElement>("#◆transform-overlay")
    if(overlay) {
      overlay.setAttribute("visibility", "hidden")
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
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || !this.overlay.contains(handle)) return
      if(this.editor.isEditingLocked) { event.preventDefault(); event.stopImmediatePropagation(); return }
      if(handle.dataset.transformMode) {
        this.#begin(event, handle.dataset.transformMode as Mode, handle)
        event.stopImmediatePropagation()
      }
      else event.preventDefault() // Keep authored selection while using menus.
    },
    pointermove: event => {
      if(!this.#gesture || this.#gesture.pointerId !== event.pointerId) return
      event.preventDefault()
      if(this.#gesture.mode === "scale") this.handleScaleDrag(event)
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
      if(this.#suppressClick && event.composedPath().some(node => node === this.overlay)) {
        this.#suppressClick = false
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
  }
}
