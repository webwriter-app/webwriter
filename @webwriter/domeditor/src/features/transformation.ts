import { DocumentListenerMap, EditorFeature } from "."
import { DOMEditor } from "../domeditor"
import { $, angleOnCircle, distanceBetweenPoints, findContainingBlock, findScrollingAncestor, findStackingContainer, getDescendantsInStackingOrder, getStaticCoords, getZPos, intersectionPoint, isElement, midpoint, modifierKeyDown, rotatePoint, roundByDPR, roundTo } from "../utility"

/**
 * On border click, overlay transform
 * On click outside of overlay, close overlay
 * Features:
 *** Anchor/element:
 *     DRAG: Reposition anchor in document (DOM placement)
 *     CTRL/CMD+CLICK: Cycle absolute/relative/sticky 
 *     ALT: No snapping
 *     SHIFT: Switch to fixed
 *** Translate: 
 *      If static:
 *        DRAG: Set position:absolute (snap) & set top/left of cursor
 *      If relative/absolute: 
 *        DRAG: highlight containing block & set top/left
 *      If fixed:
 *        DRAG: set top/left
 *      If sticky:
 *        DRAG: highlight container and scroller & set top/left
 *      CTRL/CMD: Place statically
 *      ALT: No snapping
 *      SHIFT: Set top OR left
 *** Scale: 
 *     If scaled via bottom or right scaler:
 *       DRAG: set width/height (or scale)
 *     If scaled via top or left scaler:
 *       DRAG: set width/height (or scale) and reposition offset
 *     CTRL/CMD: Scale symmetrically
 *     ALT: No snapping
 *     SHIFT: Stretch via scale()
 *** Rotate:
 *     DRAG: set transform:rotate() with x deg from the el center 
 *     CTRL/CMD: -
 *     ALT: No snapping
 *     SHIFT: 45° steps
 *
 * 
 * TODO ------------------
 * - Translate: Place statically (if mouse over gap, show gap drop caret)
 * - Scale: Stretch, rounding/jiggle issue
 * - Anchor: Switch to sticky
*/

/** Editing feature for spatially transforming elements: an overlay with drag
 * handles for moving, scaling and rotating the transform target, plus
 * controls for float, z-order and positioning mode. Started with a modifier
 * double click on a selected element (see activeListeners); the target is
 * marked with `◆transform-target`. */
export class TransformationFeature extends EditorFeature {

  /** The transform interaction currently in progress. */
  #mode: "move" | "scale" | "rotate" | undefined

  #floatValues = ["none", "left", "right"] as const

  /** The target's style attribute before the current interaction. */
  #prevStyle: string | null

  /** Creates the invisible 1px element used as an empty drag image. */
  #createEmptyDrag() {
    const el = document.createElement("div")
    el.id = "◆transform-overlay-empty-drag"
    Object.assign(el.style, {
      position: "fixed",
      right: 0,
      bottom: 0,
      width: "1px",
      height: "1px",
      background: "transparent",
      pointerEvents: "none",
      userSelect: "none"
    })
    return el
  }

  /** The empty drag image element (hides the browser's drag ghost). */
  get emptyDrag() {
    return this.overlay.querySelector("#◆transform-overlay-empty-drag")!
  }

  /** Creates the feature and adds the position anchor to the editor
   * appendix. */
  constructor(editor: DOMEditor) {
    super(editor)
    editor.addAppendix(this.#createAnchor())
  }

  /** Creates one of the eight draggable scale handles. */
  #createScaler(direction: string) {
    const point = document.createElement("div")
    point.id = `◆transform-overlay-scale-${direction}`
    point.classList.add("◆transform-overlay-scale")
    point.draggable = true
    point.addEventListener("dragstart", ev => this.handleScaleStart(ev), {passive: true})
    point.addEventListener("drag", ev => this.handleScaleDrag(ev), {passive: true})
    point.addEventListener("dragend", ev => this.handleScaleEnd(ev), {passive: true})
    return point
  }

  /** Creates the button that resets all transform styles (see restore()). */
  #createRestorer() {
    const restorer = document.createElement("button")
    restorer.id = `◆transform-overlay-restorer`
    restorer.classList.add("◆transform-overlay-button")
    restorer.addEventListener("click", ev => {this.restore(); ev.stopImmediatePropagation()})
    return restorer
  }

  /** Creates the arranger control: opens the float menu, or (when the
   * overlay is narrow) cycles the float value directly. */
  #createArranger() {
    const arranger = document.createElement("button")
    arranger.id = `◆transform-overlay-arranger`
    arranger.classList.add("◆transform-overlay-button")
    arranger.addEventListener("click", ev => {
      if(!this.isNarrow) {
        arranger.toggleAttribute("data-open")
      }
      else {
        const list = this.#floatValues
        const i = (list.indexOf(this.#float) + 1) % list.length
        this.#float = list[i]
      }
      ev.stopPropagation()
    })
    arranger.addEventListener("blur", (ev) => isElement(ev.relatedTarget) && ev.relatedTarget.parentElement?.parentElement !== arranger && arranger.toggleAttribute("data-open", false), {passive: true})
    const menu = this.#createArrangerMenu()
    arranger.append(menu)
    return arranger
  }

  /** The target's float value, mirrored on the arranger's data-float
   * attribute. */
  set #float(value: "none" | "left" | "right") {
    this.target.style.float = value === "none"? "": value
    this.arranger?.setAttribute("data-float", value)
    this.arranger?.toggleAttribute("data-open", false)
  }

  get #float() {
    return this.arranger?.getAttribute("data-float") as "none" | "left" | "right" ?? "none"
  }

  /** Toggles the target between absolute and relative positioning, clearing
   * its position offsets. */
  toggleAbsoluteRelative() {
    this.target.style.left = this.target.style.right = this.target.style.top = this.target.style.bottom = ""
    this.target.style.position = this.target.style.position === "absolute"? "relative": "absolute"
    this.updateInfo()
  }

  /** Toggles the target between relative and sticky positioning. */
  toggleSticky() {
    this.target.style.position = this.target.style.position === "relative"? "sticky": "relative"
    this.updateInfo()
  }

  /** Creates the float menu (none/left/right) of the arranger. */
  #createArrangerMenu() {
    const floatNone = document.createElement("button")
    floatNone.id = `◆transform-overlay-float-none`
    floatNone.addEventListener("click", ev => {this.#float = "none"; ev.stopPropagation()})
    floatNone.classList.add("◆transform-overlay-button")
    
    const floatLeft = document.createElement("button")
    floatLeft.id = `◆transform-overlay-float-left`
    floatLeft.addEventListener("click", ev => {this.#float = "left"; ev.stopPropagation()})
    floatLeft.classList.add("◆transform-overlay-button")
    
    const floatRight = document.createElement("button") 
    floatRight.id = `◆transform-overlay-float-right`
    floatRight.addEventListener("click", ev => {this.#float = "right"; ev.stopPropagation()})
    floatRight.classList.add("◆transform-overlay-button")
    
    const menu = document.createElement("div")
    menu.id = "◆transform-overlay-arranger-menu"
    menu.append(floatNone, floatLeft, floatRight)
    return menu
  }

  /** Creates the orderer control: opens the z-order menu, or (when the
   * overlay is narrow) cycles/steps the target's z-position directly. */
  #createOrderer() {
    const orderer = document.createElement("button")
    orderer.id = `◆transform-overlay-orderer`
    orderer.classList.add("◆transform-overlay-button")
    orderer.addEventListener("click", ev => {
      if(!this.isNarrow) {
        orderer.toggleAttribute("data-open")
      }
      else if(ev.altKey) {
        this.moveZ(this.target, false)
      }
      else {
        this.moveZ(this.target, true, false, true)
      }
      ev.stopPropagation()
    })
    orderer.addEventListener("blur", (ev) => isElement(ev.relatedTarget) && ev.relatedTarget.parentElement?.parentElement !== orderer && orderer.toggleAttribute("data-open", false), {passive: true})
    const menu = this.#createOrdererMenu()
    orderer.append(menu)
    return orderer
  }

  /** Creates the z-order menu of the orderer (move forward/backward, with
   * Shift to the front/back). */
  #createOrdererMenu() {
    const zBack = document.createElement("button")
    zBack.id = `◆transform-overlay-z-back`
    zBack.addEventListener("click", ev => {
      this.moveZ(this.target, true, true)
      ev.stopPropagation()
    })
    zBack.classList.add("◆transform-overlay-button")
    
    const zForward = document.createElement("button")
    zForward.id = `◆transform-overlay-z-forward`
    zForward.addEventListener("click", ev => {
      this.moveZ(this.target, true, ev.shiftKey)
      ev.stopPropagation()
    })
    zForward.classList.add("◆transform-overlay-button")
    
    const zBackward = document.createElement("button")
    zBackward.id = `◆transform-overlay-z-backward`
    zBackward.addEventListener("click", ev => {
      this.moveZ(this.target, false, ev.shiftKey)
      ev.stopPropagation()
    })
    zBackward.classList.add("◆transform-overlay-button")

    const zFront = document.createElement("button")
    zFront.id = `◆transform-overlay-z-front`
    zFront.addEventListener("click", ev => {
      this.moveZ(this.target, true, true)
      ev.stopPropagation()
    })
    zFront.classList.add("◆transform-overlay-button")
    
    const menu = document.createElement("div")
    menu.id = "◆transform-overlay-orderer-menu"
    menu.append(zForward, zBackward)
    return menu
  }

  /** Creates the draggable rotation handle. */
  #createRotator() {
    const rotator = document.createElement("div")
    rotator.id = `◆transform-overlay-rotator`
    rotator.classList.add("◆transform-overlay-button")
    rotator.draggable = true
    rotator.addEventListener("dragstart", ev => this.handleRotateStart(ev), {passive: true})
    rotator.addEventListener("drag", ev => this.handleRotateDrag(ev), {passive: true})
    rotator.addEventListener("dragend", ev => this.handleRotateEnd(ev), {passive: true})
    return rotator
  }

  /** Creates the position anchor: shows the target's static position for
   * relative/sticky targets; clicking it toggles absolute/relative. */
  #createAnchor() {
    const anchor = document.createElement("div")
    anchor.id = `◆transform-overlay-anchor`
    // anchor.draggable = true
    anchor.contentEditable = "false"
    anchor.setAttribute("visibility", "hidden")
    anchor.addEventListener("click", ev => {this.toggleAbsoluteRelative(); ev.stopPropagation()})

    const sticky = document.createElement("button")
    sticky.classList.add("◆transform-overlay-button")
    sticky.id = `◆transform-overlay-anchor-sticky`
    sticky.addEventListener("click", ev => {this.toggleSticky(); ev.stopPropagation()})
    anchor.appendChild(sticky)

    return anchor
  }
  
  /** Creates the transform overlay with all its controls (scalers, rotator,
   * arranger, orderer); dragging the overlay itself moves the target. */
  #createOverlay() {
    const overlay = document.createElement("div")
    overlay.id = "◆transform-overlay"
    overlay.contentEditable = "false"
    overlay.draggable = true
    overlay.addEventListener("dragstart", ev => this.handleMoveStart(ev), {passive: true})
    overlay.addEventListener("drag", ev => this.handleMoveDrag(ev), {passive: true})
    overlay.addEventListener("dragend", ev => this.handleMoveEnd(ev), {passive: true})
    const scalePoints = ["up-left", "up-up", "up-right", "left-left", "right-right", "down-left", "down-down", "down-right"].map(dir => this.#createScaler(dir))
    overlay.append(
      ...scalePoints,
      this.#createRotator(),
      this.#createArranger(),
      this.#createOrderer(),
      // this.#createRestorer(),
      this.#createEmptyDrag(),
    )
    return overlay
  }

  /** Snapping strategies for the drag interactions. */
  #roundingFuncs = {
    identity: (x: number) => x,
    granular: roundByDPR,
    snap05: (x: number) => roundTo(x, 5),
    snap10: (x: number) => roundTo(x, 10),
    snap45: (x: number) => roundTo(x, 45)
  }

  /** Suppresses the browser's drag ghost and payload for a drag event. */
  #clearDataTransfer(ev: Event & {dataTransfer: DataTransfer | null}) {
    if(!ev.dataTransfer) {return}
    ev.dataTransfer.setDragImage(this.emptyDrag, 0, 0)
    ev.dataTransfer.clearData()
    ev.dataTransfer.effectAllowed = "none"
  }

  /** The snapping function for the current mode and modifiers: Alt disables
   * snapping (device pixel rounding); rotating snaps to 5° (Shift: 45°),
   * moving and scaling snap to 10px. */
  getRoundingFunc(ev: DragEvent) {
    if(this.#mode === "rotate" && ev.altKey) {
      return this.#roundingFuncs.granular
    }
    else if(this.#mode === "rotate" && ev.shiftKey) {
      return this.#roundingFuncs.snap45
    }
    else if(this.#mode === "rotate") {
      return this.#roundingFuncs.snap05
    }
    else if(this.#mode === "move" && ev.altKey) {
      return this.#roundingFuncs.granular
    }
    else if(this.#mode === "move") {
      return this.#roundingFuncs.snap10
    }
    else if(this.#mode === "scale" && ev.altKey) {
      return this.#roundingFuncs.granular
    }
    else if(this.#mode === "scale") {
      return this.#roundingFuncs.snap10
    }
    else {
      return this.#roundingFuncs.identity
    }
  }

  /** Begins a scale interaction: records the target's size, center and scale,
   * and sets the resize cursor for the dragged handle's direction. */
  handleScaleStart(ev: DragEvent) {
    this.#clearDataTransfer(ev)
    this.#mode = "scale"
    const el = ev.target as HTMLElement
    const [sx, sy] = el.style.scale.trim().split(/\s+/)
    this.#sx = (sx?.includes("%")? parseInt(sx)/100: parseInt(sx)) || 1
    this.#sy = (sy?.includes("%")? parseInt(sy)/100: parseInt(sy)) || 1
    const rect = this.targetRect
    this.#w = parseInt(this.targetComputedStyle.width)
    this.#h = parseInt(this.targetComputedStyle.height)
    const [cx, cy] = [rect.x + rect.width/2, rect.y + rect.height/2]
    this.#cx = cx
    this.#cy = cy
    const direction = el.id.split("-").slice(-2).join("-")
    if(direction === "up-left") {
      document.body.classList.add("◆transform-scaling-nwse")
    }
    else if(direction === "up-up") {
      document.body.classList.add("◆transform-scaling-ns")
    }
    else if(direction === "up-right") {
      document.body.classList.add("◆transform-scaling-nesw")
    }
    else if(direction === "left-left") {
      document.body.classList.add("◆transform-scaling-ew")
    }
    else if(direction === "right-right") {
      document.body.classList.add("◆transform-scaling-ew")
    }
    else if(direction === "down-left") {
      document.body.classList.add("◆transform-scaling-nesw")
    }
    else if(direction === "down-down") {
      document.body.classList.add("◆transform-scaling-ns")
    }
    else if(direction === "down-right") {
      document.body.classList.add("◆transform-scaling-nwse")
    }
    this.#prevStyle = this.target.getAttribute("style")
  }

  /** The scale handle diagonally/axially opposite to the given one (the
   * fixed point of an asymmetric scale). */
  getOppositeScaler(el: HTMLElement) {
    const direction = el.id.split("-").slice(-2).join("-")
    let reverse: string
    if(direction === "up-left") {
      reverse = "down-right"
    }
    else if(direction === "up-up") {
      reverse = "down-down"
    }
    else if(direction === "up-right") {
      reverse = "down-left"
    }
    else if(direction === "left-left") {
      reverse = "right-right"
    }
    else if(direction === "right-right") {
      reverse = "left-left"
    }
    else if(direction === "down-left") {
      reverse = "up-right"
    }
    else if(direction === "down-down") {
      reverse = "up-up"
    }
    else if(direction === "down-right") {
      reverse = "up-left"
    }
    const id = `◆transform-overlay-scale-${reverse!}`
    return this.overlay.querySelector(`[id="${id}"]`)!
  }

  /** Viewport coordinates of the given overlay corner, taking the current
   * rotation into account (measured from the corner scale handles). */
  getRotatedCorner(corner: "nw" | "ne" | "sw" | "se" = "nw") {
    if(corner == "nw") {
      const el = this.overlay.querySelector("#◆transform-overlay-scale-up-left")!
      const {x, y} = el.getBoundingClientRect()
      return [x + 2.5, y + 2.5]
    }
    else if(corner == "ne") {
      const el = this.overlay.querySelector("#◆transform-overlay-scale-up-right")!
      const {x, y} = el.getBoundingClientRect()
      return [x + 5, y + 1]
    }
    else if(corner == "sw") {
      const el = this.overlay.querySelector("#◆transform-overlay-scale-down-left")!
      const {x, y} = el.getBoundingClientRect()
      return [x + 5, y + 1]
    }
    else if(corner == "se") {
      const el = this.overlay.querySelector("#◆transform-overlay-scale-down-right")!
      const {x, y} = el.getBoundingClientRect()
      return [x + 5, y + 1]
    }
    else {
      throw TypeError(`Invalid corner '${corner}'`)
    }
  }

  /** Debugging helper: renders colored dots at the given viewport
   * coordinates. */
  #helperDots(...coords: [number, number][]) {
    document.querySelectorAll(".◆helper-dot").forEach(el => el.remove())
    coords.forEach(([x, y], i) => {
      const colors = ["purple", "red", "orange"]
      const el = document.createElement("div")
      el.contentEditable = "false"
      el.classList.add("◆helper-dot")
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.position = "fixed"
      el.style.width = "3px"
      el.style.height = "3px"
      el.style.marginLeft = "-1px"
      el.style.marginTop = "-1px"
      el.style.borderRadius = "100%"
      el.style.zIndex = "2147483647"
      el.style.background = colors.at(i) ?? "red"
      this.editor.addAppendix(el)
    })
  }

  /** Scales the target while dragging a handle: computes the new box from
   * the fixed point and the cursor (in the rotated coordinate system) and
   * sets width/height/left/top. Modifier scales symmetrically around the
   * center, Shift stretches via scale() instead. */
  handleScaleDrag(ev: DragEvent) {
    if(ev.view !== window || !ev.buttons || ev.pageY < 0) {return}
    const el = ev.target as HTMLElement
    const dir = Array.from(new Set(el.id.split("-").slice(-2))).join("-")
    const round = this.#roundingFuncs.identity || this.getRoundingFunc(ev)
    let w: string | undefined = undefined, h: string | undefined = undefined
    if(ev.shiftKey) {
      w = h = ""
    }
    else {
      const symmetrical = modifierKeyDown(ev)
      const deg = this.#deg || 0
      const [cx, cy] = [this.#cx!, this.#cy!]
      let ax: number, ay: number, x: number, y: number
      if(dir === "up-left") {
        [ax, ay] = symmetrical
          ? rotatePoint(ev.x - (ev.x - cx)*2, ev.y - (ev.y - cy)*2, cx, cy, -deg)
          : [cx + this.#w/2, cy + this.#h/2];
        [x, y] = [ev.x, ev.y]
      }
      else if(dir === "up") {
        const [_, h] = rotatePoint(ev.x, ev.y, cx, cy, -deg);
        const [ex, ey] = [cx - this.#w/2, cy - (h - cy)];
        [ax, ay] = symmetrical
          ? [ex, ey]
          : [cx - this.#w/2, cy + this.#h/2];
        [x, y] = rotatePoint(cx + this.#w/2, h, cx, cy, deg)
      }
      else if(dir === "up-right") {
        [ax, ay] = symmetrical
          ? rotatePoint(ev.x - (ev.x - cx)*2, ev.y - (ev.y - cy)*2, cx, cy, -deg)
          : [cx - this.#w/2, cy + this.#h/2];
        [x, y] = [ev.x, ev.y]
      }
      else if(dir === "right") {
        const [w] = rotatePoint(ev.x, ev.y, cx, cy, -deg);
        const [ex, ey] = [cx - (w - cx), cy - this.#h/2];
        [ax, ay] = symmetrical
          ? [ex, ey]
          : [cx - this.#w/2, cy - this.#h/2];
        [x, y] = rotatePoint(w, cy + this.#h/2, cx, cy, deg)
      }
      else if(dir === "down-right") {
        [ax, ay] = symmetrical
          ? rotatePoint(ev.x - (ev.x - cx)*2, ev.y - (ev.y - cy)*2, cx, cy, -deg)
          : [cx - this.#w/2, cy - this.#h/2];
        [x, y] = [ev.x, ev.y]
      }
      else if(dir === "down") {        
        const [_, h] = rotatePoint(ev.x, ev.y, cx, cy, -deg);
        const [ex, ey] = [cx - this.#w/2, cy - (h - cy)];
        [ax, ay] = symmetrical
          ? [ex, ey]
          : [cx - this.#w/2, cy - this.#h/2];
        [x, y] = rotatePoint(cx + this.#w/2, h, cx, cy, deg)
      }
      else if(dir === "down-left") {
        [ax, ay] = symmetrical
          ? rotatePoint(ev.x - (ev.x - cx)*2, ev.y - (ev.y - cy)*2, cx, cy, -deg)
          : [cx + this.#w/2, cy - this.#h/2];
        [x, y] = [ev.x, ev.y]
      }
      else if(dir === "left") {        
        const [w] = rotatePoint(ev.x, ev.y, cx, cy, -deg);
        const [ex, ey] = [cx - (w - cx), cy - this.#h/2];
        [ax, ay] = symmetrical
          ? [ex, ey]
          : [cx + this.#w/2, cy - this.#h/2];
        [x, y] = rotatePoint(w, cy + this.#h/2, cx, cy, deg)
      }
      else {
        throw TypeError("Invalid direction")
      }

      const [ax2, ay2] = rotatePoint(ax, ay, cx, cy, deg)
      const [cx2, cy2] = midpoint(ax2, ay2, x, y)
      const [px, py] = rotatePoint(ax2, ay2, cx2, cy2, -deg)
      const [qx, qy] = rotatePoint(x, y, cx2, cy2, -deg)
      const [newWidth, newHeight] = [
        Math.abs(qx - px),
        Math.abs(qy - py)
      ]

      const {left, top} = this.targetOriginRect
      this.target.style.left = `${Math.min(px, qx) - left}px`
      this.target.style.top = `${Math.min(py, qy) - top}px`
      if(dir.includes("left") || dir.includes("right")) {
        this.target.style.width = `${newWidth}px`
      }
      if(dir.includes("up") || dir.includes("down")) {
        this.target.style.height = `${newHeight}px`
      }
      this.updateInfo()
    }
  }

  /** Ends the scale interaction and resets the resize cursor. */
  handleScaleEnd(ev: DragEvent) {
    this.#mode = undefined
    document.body.classList.remove("◆transform-scaling-ew", "◆transform-scaling-ns", "◆transform-scaling-nesw", "◆transform-scaling-nwse")
  }

  /** Begins a move interaction: positions static targets absolutely and
   * records the grab offset. */
  handleMoveStart(ev: DragEvent) {
    this.#clearDataTransfer(ev)
    if(!this.#mode) {
      const pos = getComputedStyle(this.target).position
      this.target.style.position = pos === "static"? "absolute": pos
      const {left, top} = this.targetOriginRect
      const rect = this.targetRect
      this.#dx = ev.x - rect.left
      this.#dy = ev.y - rect.top
      this.#mx = (rect.left + rect.width/2) - left
      this.#my = (rect.top + rect.height/2) - top
      this.#mode = "move"
      this.#prevStyle = this.target.getAttribute("style")
      document.body.classList.add("◆transform-moving")
      this.updateInfo()
    }
  }

  /** Moves the target while dragging: sets left/top relative to its
   * containing block (Shift constrains to one axis). Unless Alt is held,
   * hovering near a static element's edges shows a drop caret for placing
   * the target statically before/after it. */
  handleMoveDrag(ev: DragEvent) {
    if(ev.view !== window || !ev.buttons || ev.pageY < 0) {return}
    if(this.#mode !== "move") {return}
    const round = this.getRoundingFunc(ev)
    const {left, top} = this.targetOriginRect
    const x = ev.x - left - (this.#dx || 0)
    const y = ev.y - top - (this.#dy || 0)
    if(!ev.altKey) {
      const bgEl = document.elementsFromPoint(ev.x, ev.y).find(el => el !== this.target)

      if(bgEl && bgEl !== document.documentElement && bgEl !== document.body && bgEl !== this.target && getComputedStyle(bgEl).position === "static") {
        const {top, left, bottom} = bgEl.getBoundingClientRect()
        const beforeLeft = left - 10
        const beforeTop = top - 10
        const beforeRight = beforeLeft + 60
        const beforeBottom = beforeTop + 30
        const afterLeft = left - 10
        const afterTop = bottom - 10
        const afterRight = afterLeft + 60
        const afterBottom = afterTop + 30

        const inBeforeDropZone = (beforeLeft <= ev.x && ev.x <= beforeRight) && (beforeTop <= ev.y && ev.y <= beforeBottom) && Math.abs(ev.y - beforeTop) <= Math.abs(ev.y - afterBottom)
        const inAfterDropZone = (afterLeft <= ev.x && ev.x <= afterRight) && (afterTop <= ev.y && ev.y <= afterBottom) && Math.abs(ev.y - beforeTop) > Math.abs(ev.y - afterBottom)
        const pos = inBeforeDropZone || inAfterDropZone
          ? inBeforeDropZone? "before": "after"
          : undefined
        if(pos) {
          document.body.querySelectorAll(":is(.◆drop-caret-before, .◆drop-caret-after)").forEach(el => {
            if(el !== bgEl) {
              el.classList.remove("◆drop-caret-before", "◆drop-caret-after")
            }
            else {
              el.classList.remove(`◆drop-caret-${pos === "before"? "after": "before"}`)
            }
          })
          this.editor.features.selection.gapCaret!.classList.remove("◆drop-caret-before", "◆drop-caret-before")
          bgEl.classList.add("◆", `◆drop-caret-${pos}`)
          this.editor.features.selection.gapCaret!.classList.add(`◆drop-caret-${pos}`)
        }
        else {
          document.body.querySelectorAll(":is(.◆drop-caret-before, .◆drop-caret-after)").forEach(el => {
            el.classList.remove("◆drop-caret-before", "◆drop-caret-after")
            if(Array.from(el.classList).filter(k => k.startsWith("◆")).length === 1 && el.classList.item(0) === "◆") {
              el.classList.remove("◆")
            }
          })
          this.editor.features.selection.gapCaret!.classList.remove("◆drop-caret-before", "◆drop-caret-before")
        }
      }
      else {
        document.body.querySelectorAll(":is(.◆drop-caret-before, .◆drop-caret-after)").forEach(el => {
          el.classList.remove("◆drop-caret-before", "◆drop-caret-after")
          if(Array.from(el.classList).filter(k => k.startsWith("◆")).length === 1 && el.classList.item(0) === "◆") {
            el.classList.remove("◆")
          }
        })
        this.editor.features.selection.gapCaret!.classList.remove("◆drop-caret-before", "◆drop-caret-before")
      }
    }
    
    if(ev.shiftKey) {
      const cx = this.#mx!
      const cy = this.#my!
      const x1 = ev.x
      const y1 = ev.y
      const x2 = distanceBetweenPoints(cx, cy, ev.x, ev.y)
      const y2 = cy
      let deg = angleOnCircle(cx, cy, x1, y1, x2, y2)
      deg = (deg < 0? 360 + deg: deg) % 360
      const vertical = (45 <= deg) && (deg <= 135) || (225 <= deg) && (deg <= 315)
      this.target.setAttribute("style", this.#prevStyle!)
      if(vertical) {
        this.target.style.bottom = ""
        this.target.style.top = `${round(y)}px`
      }
      else {
        this.target.style.right = ""
        this.target.style.left = `${round(x)}px`
      }
    }
    else {
      this.target.style.right = ""
      this.target.style.left = `${round(x)}px`
      this.target.style.bottom = ""
      this.target.style.top = `${round(y)}px`
    }
    this.updateInfo()
  }

  /** Ends the move interaction; if a drop caret is active, places the target
   * statically at that position (clearing its transform styles). */
  handleMoveEnd(ev: DragEvent) {
    if(this.#mode === "move") {
      this.#mode = undefined
      document.body.classList.remove("◆transform-moving")
      const dropEls = document.body.querySelectorAll(":is(.◆drop-caret-before, .◆drop-caret-after)")
      const dropEl = dropEls.item(0)
      if(dropEl) {
        const pos = dropEl.matches(".◆drop-caret-before")? "before": "after"
        this.target.style.position = this.target.style.rotate = this.target.style.width = this.target.style.height = this.target.style.left = this.target.style.top = ""
        dropEl[pos](this.target)
        this.updateInfo(0)
      }
      dropEls.forEach(el => {
        el.classList.remove("◆drop-caret-before", "◆drop-caret-after")
        if(Array.from(el.classList).filter(k => k.startsWith("◆")).length === 1 && el.classList.item(0) === "◆") {
          el.classList.remove("◆")
        }
      })
      this.editor.features.selection.gapCaret!.classList.remove("◆drop-caret-before", "◆drop-caret-before")
    }
  }

  /** Begins a rotate interaction: records the target's center. */
  handleRotateStart(ev: DragEvent) {
    this.#clearDataTransfer(ev)
    this.#mode = "rotate"
    document.body.classList.add("◆transform-rotating")
    const rect = this.targetRect
    this.#cx = roundByDPR(rect.left + rect.width * 0.5)
    this.#cy = roundByDPR(rect.top + rect.height * 0.5)
  }

  #cx?: number
  #cy?: number
  #dx?: number
  #dy?: number
  #sx?: number
  #sy?: number
  #w: number
  #h: number
  #mx?: number
  #my?: number
  #deg: number

  /** Rotates the target while dragging: sets `rotate` to the angle between
   * the cursor and the target center (snapped, see getRoundingFunc). */
  handleRotateDrag(ev: DragEvent) {
    if(ev.view !== window) {return}
    if(!ev.buttons) {return}
    const round = this.getRoundingFunc(ev)
    const cx = this.#cx!
    const cy = this.#cy!
    const x1 = cx!
    const y1 = roundByDPR(cy - ev.y)
    const x2 = roundByDPR(ev.x)
    const y2 = roundByDPR(ev.y)
    this.#deg = round(angleOnCircle(cx, cy, x1, y1, x2, y2))
    if(this.#deg !== 0) {
      this.target.style.rotate = `${this.#deg}deg`
      this.overlay.style.rotate = `${this.#deg}deg`
    }
    else {
      this.target.style.rotate = ""
      this.overlay.style.rotate = ""
    }
    this.updateInfo()
  }

  /** Ends the rotate interaction. */
  handleRotateEnd(ev: DragEvent) {
    document.body.classList.remove("◆transform-rotating")
    this.#mode = undefined
    this.#cx = 0
    this.#cy = 0
  }

  /** Resets all transform-related styles of the target (size, rotation,
   * scale, float, positioning). */
  restore() {
    Object.assign(this.target.style, {
      width: "",
      height: "",
      rotate: "",
      scale: "",
      float: "",
      position: "",
      top: "",
      left: ""
    })
    this.overlay.style.rotate = ""
    this.overlay.classList.remove("◆transform-overlay-changed")
  }

  /** The transform overlay element, created lazily and added to the editor
   * appendix on first access. */
  get overlay() {
    const existing = this.editor.appendix.querySelector("#◆transform-overlay")
    if(!existing) {
      const overlay = this.#createOverlay()
      this.editor.addAppendix(overlay)
      return overlay
    }
    else {
      return existing
    }
  }

  /** The element currently being transformed (marked `◆transform-target`). */
  get target() {
    return document.querySelector(".◆transform-target") as HTMLElement
  }

  /** The target's bounding rectangle. */
  get targetRect() {
    return this.target?.getBoundingClientRect()
  }

  /** The rectangle the target's offsets are relative to, depending on its
   * positioning: the viewport for static/fixed, the static position for
   * relative, the containing block for absolute, the scrolling ancestor for
   * sticky. */
  get targetOriginRect(): DOMRect {
    const position = this.targetComputedStyle.position
    if(position === "static") {
      return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    } else if(position === "relative") {
      const [x, y] = getStaticCoords(this.target)
      const {width, height} = this.targetComputedStyle
      return new DOMRect(x, y, parseInt(width), parseInt(height))
    } else if(position === "absolute") {
      if(this.#containingBlock === window) {
        return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
      } else {
        return (this.#containingBlock as HTMLElement).getBoundingClientRect()
      }
    } else if(position === "fixed") {
      return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    } else if(position === "sticky") {
      return (this.#scrollingAncestor as HTMLElement).getBoundingClientRect()
    } else {
      throw Error("Invalid position")
    }
  }

  /** The arranger (float) control of the overlay. */
  get arranger() {
    return this.overlay.querySelector("#◆transform-overlay-arranger") as HTMLElement
  }

  /** The orderer (z-order) control of the overlay. */
  get orderer() {
    return this.overlay.querySelector("#◆transform-overlay-orderer") as HTMLElement
  }

  /** The position anchor element. */
  get anchor() {
    return this.editor.appendix.querySelector("#◆transform-overlay-anchor") as HTMLElement
  }

  /** The target's computed style. */
  get targetComputedStyle() {
    return getComputedStyle(this.target)
  }

  /** Whether the overlay is in its narrow layout (target < 120px wide),
   * where the arranger/orderer act directly instead of opening menus. */
  get isNarrow() {
    return this.overlay.classList.contains("◆transform-overlay-narrow")
  }

  #containingBlock: HTMLElement | Window
  #scrollingAncestor: HTMLElement | undefined
  #stackingContainer: HTMLElement

  /** Changes the element's paint order within its stacking container: one
   * step (or with `toFrontOrBack` all the way) forward or backward, with
   * `cycle` wrapping around. Renumbers the z-indexes of all non-editor
   * elements in the container sequentially. */
  moveZ(el: HTMLElement, forward=true, toFrontOrBack=false, cycle=false) {
    const stackingContainer = findStackingContainer(el)
    let descendants: (HTMLElement | undefined)[] = getDescendantsInStackingOrder(stackingContainer)
    const n = descendants.length
    const i = descendants.indexOf(el)
    const d = forward? (toFrontOrBack? n: 1): (toFrontOrBack? -n: -1)
    const j = cycle? Math.max(0, i + d) % n: Math.min(Math.max(0, forward? i + d + 1: i + d), n)
    descendants[i] = undefined
    descendants.splice(j, 0, el)
    descendants = descendants.filter(node => node)
    descendants.forEach((node,i) => node!.style.zIndex = String(i + 1))
    this.updateInfo()
  }

  /** Synchronizes the overlay with the target: sizes and rotates the overlay
   * to match, marks the target's containing block, scrolling ancestor and
   * stacking container, updates the control states (float, position,
   * z-order, changed/narrow markers) and positions the anchor for
   * relative/sticky targets. */
  updateInfo(deg?: number) {
    const {target, targetRect} = this
    if(target) {
      const elStyle = getComputedStyle(target)
      this.overlay.style.width = elStyle.width
      this.overlay.style.height = elStyle.height
      this.#containingBlock = findContainingBlock(target, (elStyle.position || "static") as "static" | "relative" | "sticky" | "absolute" | "fixed")
      if(this.#containingBlock instanceof Element) {
        this.#containingBlock.classList.add("◆", "◆transform-containing-block")
      }
      this.#scrollingAncestor = findScrollingAncestor(target)
      if(this.#scrollingAncestor) {
        this.#scrollingAncestor.classList.add("◆", "◆transform-scrolling-ancestor")
      }

      this.#stackingContainer = findStackingContainer(target)
      this.#stackingContainer.classList.add("◆", "◆transform-stacking-container")
      this.orderer.setAttribute("data-z-order", String(getZPos(this.target) + 1))

      if(targetRect.width < 120) {
        this.overlay.classList.add("◆transform-overlay-narrow")
      } else {
        this.overlay.classList.remove("◆transform-overlay-narrow")
      }

      if(["rotate", "scale", "width", "height", "position", "top", "left"].some(k => target.style.getPropertyValue(k))) {
        this.overlay.classList.add("◆transform-overlay-changed")
      } else {
        this.overlay.classList.remove("◆transform-overlay-changed")
      }
      this.#deg = deg ?? parseInt(elStyle.rotate || "0")
      if(this.#deg !== 0) {
        this.overlay.style.rotate = `${this.#deg}deg`
      } else {
        this.overlay.style.rotate = ""
      }

      this.arranger?.setAttribute("data-float", elStyle.float)
      this.arranger?.setAttribute("data-position", elStyle.position)
      this.orderer?.setAttribute("data-position", elStyle.position)
      this.anchor?.setAttribute("data-position", elStyle.position)
      if(elStyle.position === "relative" || elStyle.position === "sticky") {
        this.anchor!.style.width = elStyle.width
        this.anchor!.style.height = elStyle.height
        const [x, y] = getStaticCoords(this.target) // @ts-ignore
        this.anchor.style.positionAnchor = "none"
        this.anchor.style.top = `${x}px`
        this.anchor.style.left = `${y}px`
      } else if(elStyle.position === "absolute") { // @ts-ignore
        this.anchor.style.positionAnchor = this.anchor.style.top = this.anchor.style.left = this.anchor.style.width = this.anchor.style.height = ""
        this.anchor.removeAttribute("visibility")
      }
      else { // @ts-ignore
        this.anchor.style.positionAnchor = this.anchor.style.top = this.anchor.style.left = this.anchor.style.width = this.anchor.style.height = ""
        this.anchor.setAttribute("visibility", "hidden")
      }
    }
    else {
      this.overlay.classList.remove("◆transform-overlay-changed")
    }
  }

  /** Starts transforming the element: marks it as the transform target and
   * shows the overlay and anchor. The document root, head and body are
   * refused. */
  startTransform(element: HTMLElement) {
    if(element === document.documentElement || element === document.head || element === document.body) {return}
    element.classList.add("◆", "◆transform-target")
    this.overlay.removeAttribute("visibility")
    this.anchor?.removeAttribute("visibility")
    this.updateInfo()
  }

  /** Ends the transform: removes all transform marker classes from the
   * document, hides the overlay and anchor, and closes the menus. */
  clearTransform() {
    document.querySelectorAll(".◆transform-target")
      .forEach(el => el.classList.remove("◆transform-target"))
    document.querySelectorAll(".◆transform-containing-block")
      .forEach(el => el.classList.remove("◆transform-containing-block"))
    document.querySelectorAll(".◆transform-scrolling-ancestor")
      .forEach(el => el.classList.remove("◆transform-scrolling-ancestor"))
    document.querySelectorAll(".◆transform-stacking-container")
      .forEach(el => el.classList.remove("◆transform-stacking-container"))
    this.overlay.setAttribute("visibility", "hidden")
    this.anchor?.setAttribute("visibility", "hidden")
    this.overlay.classList.remove("◆transform-overlay-changed")
    this.overlay.style.rotate = ""
    this.arranger?.toggleAttribute("data-open", false)
    this.orderer?.toggleAttribute("data-open", false)
  }

  /** Keyboard/clipboard behavior while a target is active: Delete/Backspace
   * removes the target; copy/cut put the target's cleaned HTML (without
   * editor artifacts) on the clipboard, cut also removes it. */
  passiveListeners: DocumentListenerMap = {
    "keydown": ev => {
      if((ev.key === "Delete" || ev.key === "Backspace") && this.target) {
        this.target.remove()
        this.clearTransform()
        ev.stopImmediatePropagation()
      }
    },
    "copy": ev => {
      if(!this.target) {return}
      const copy = this.target.cloneNode(true) as HTMLElement
      const fragment = document.createDocumentFragment()
      fragment.append(copy)
      this.editor.clearEditingArtifacts(fragment)
      const item = new ClipboardItem({"text/html": copy.outerHTML, "text/plain": copy.innerText})
      navigator.clipboard.write([item])
    },
    "cut": ev => {
      if(!this.target) {return}
      const copy = this.target.cloneNode(true) as HTMLElement
      const fragment = document.createDocumentFragment()
      fragment.append(copy)
      this.editor.clearEditingArtifacts(fragment)
      const item = new ClipboardItem({"text/html": copy.outerHTML, "text/plain": copy.innerText})
      navigator.clipboard.write([item])
      this.target.remove()
    }
  }

  /** Pointer behavior: a click outside the overlay ends the transform; a
   * modifier double click on a selected element starts one. */
  activeListeners: DocumentListenerMap = {
    "click": ev => {
      if(isElement(ev.target) && ev.target.id !== "◆transform-overlay") {
        this.clearTransform()
      }
      /*if(isElement(ev.target) && modifierKeyDown(ev)) {
        this.startTransform(ev.target as HTMLElement)
        ev.stopImmediatePropagation()
      }
      if(isElement(ev.target) && ev.target.classList.contains("◆element-selected")) {
        const {offsetX: x, offsetY: y} = ev
        const isOnTop = y <= 5
        const isOnLeft = x <= 5
        const isOnRight = x >= ev.target.clientWidth - 5
        const isOnBottom = y >= ev.target.clientHeight - 5
        if(isOnTop || isOnLeft || isOnRight || isOnBottom) {
          this.startTransform(ev.target as HTMLElement)
          ev.stopImmediatePropagation()
        }
      }*/
    },
    "dblclick": ev => {
      if(modifierKeyDown(ev) && isElement(ev.target) && ev.target.classList.contains("◆element-selected")){
        this.startTransform(ev.target as HTMLElement)
        ev.stopImmediatePropagation()
      }
    }
  }
}
