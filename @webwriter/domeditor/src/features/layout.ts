import {EditorFeature} from "."
import {floatSideFromStyles, type FloatSide} from "../element-styles"
import {$} from "../utility"
import {createFigureLayout} from "../figure-layout.js"
import {createLayoutPrint} from "../document-layout-print.js"
import {slideLayoutRole} from "../document-layout"

type PlacementDirection = "front" | "up" | "down" | "back"
type PlacementItem = {element: HTMLElement | SVGSVGElement, z: number, order: number}

/** Document arrangement uses native floats, sibling moves and freeform stacking. */
export class LayoutFeature extends EditorFeature {
  private figures: ReturnType<typeof createFigureLayout> | null = null
  private print: ReturnType<typeof createLayoutPrint> | null = null
  private columnMutationObserver: MutationObserver | null = null
  private columnResizeObserver: ResizeObserver | null = null
  private columnFloats = new Set<Element>()
  private columnFrame: number | null = null
  enable() {
    if(this.isEnabled) return
    super.enable()
    this.figures = createFigureLayout(document)
    this.print = createLayoutPrint(document)
    this.columnMutationObserver = new MutationObserver(() => this.syncColumnWidth())
    this.columnMutationObserver.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "width"]})
    if(typeof ResizeObserver !== "undefined") {
      this.columnResizeObserver = new ResizeObserver(() => this.scheduleColumnWidth())
      this.columnResizeObserver.observe(document.documentElement)
    }
    this.syncColumnWidth()
  }
  disable() {
    if(this.columnFrame !== null) cancelAnimationFrame(this.columnFrame)
    this.columnFrame = null
    this.columnMutationObserver?.disconnect()
    this.columnMutationObserver = null
    this.columnResizeObserver?.disconnect()
    this.columnResizeObserver = null
    this.columnFloats.clear()
    this.figures?.destroy()
    this.figures = null
    this.print?.destroy()
    this.print = null
    super.disable()
  }
  refresh() { this.figures?.refresh(); this.syncColumnWidth() }
  getState() { return null }

  private scheduleColumnWidth() {
    if(this.columnFrame !== null) return
    this.columnFrame = requestAnimationFrame(() => {
      this.columnFrame = null
      if(this.isEnabled) this.syncColumnWidth()
    })
  }

  /** The authored width tokens follow the widest current float. They remain in
   * saved HTML, where the theme can still adapt them to the reader's viewport. */
  private syncColumnWidth() {
    const body = document.body
    if(!body || !this.isEnabled) return
    const candidates = Array.from(body.querySelectorAll<HTMLElement | SVGElement>(
      '.ww-float-left, .ww-float-right, [style*="float: left"], [style*="float:left"], [style*="float: right"], [style*="float:right"]'))
      .filter(element => floatSideFromStyles(getComputedStyle(element).float, element.style, element.classList) !== "none")
    const next = new Set<Element>(candidates)
    for(const element of this.columnFloats) if(!next.has(element)) this.columnResizeObserver?.unobserve(element)
    for(const element of candidates) if(!this.columnFloats.has(element)) this.columnResizeObserver?.observe(element)
    this.columnFloats = next
    const set = (name: string, value: string | null) => {
      if(value === null) {
        if(body.style.getPropertyValue(name)) body.style.removeProperty(name)
      }
      else if(body.style.getPropertyValue(name) !== value) body.style.setProperty(name, value)
    }
    if(!candidates.length) {
      set("--ww-two-column-default-width", null)
      set("--ww-two-column-explicit-width", null)
    }
    else if(document.documentElement.clientWidth >= 720) {
      const explicit = candidates.filter(element => ["--ww-float-size", "inline-size", "width", "max-inline-size", "max-width"]
        .some(name => element.style.getPropertyValue(name) && element.style.getPropertyValue(name) !== "var(--ww-float-width)"))
      const width = Math.max(0, ...explicit.map(element => element.getBoundingClientRect().width))
      set("--ww-two-column-default-width", explicit.length === candidates.length ? "0px" : null)
      set("--ww-two-column-explicit-width", width ? `${Math.round(width * 100) / 100}px` : null)
    }
    if(!body.style.length) body.removeAttribute("style")
  }

  private placement(target: Element) {
    const parent = target.parentElement
    if(!target.isConnected || !parent || !(target instanceof HTMLElement || target instanceof SVGSVGElement)
      || target.matches("style,script,link,meta,template") || slideLayoutRole(target) === "navigation"
      || !(this.editor.features.canvas.active && parent === document.body
        || this.editor.features.slides.active && slideLayoutRole(parent) === "slide")) return
    const selected: PlacementItem = {element: target, z: Number.parseInt(getComputedStyle(target).zIndex) || 0, order: -1}
    const items: PlacementItem[] = []
    let first: PlacementItem | undefined, last: PlacementItem | undefined
    let before: PlacementItem | undefined, after: PlacementItem | undefined
    // Read each peer once. Equal indices (including auto) paint in DOM order.
    for(const element of parent.children) {
      if(!(element instanceof HTMLElement || element instanceof SVGSVGElement)
        || element.matches("style,script,link,meta,template") || slideLayoutRole(element) === "navigation") continue
      const item = element === target ? selected : {element, z: Number.parseInt(getComputedStyle(element).zIndex) || 0, order: items.length}
      if(item === selected) selected.order = items.length
      items.push(item)
      if(!first || item.z < first.z) first = item
      if(!last || item.z >= last.z) last = item
      if(item === selected) continue
      if(item.z < selected.z || item.z === selected.z && selected.order < 0) {
        if(!before || item.z >= before.z) before = item
      }
      else if(!after || item.z < after.z) after = item
    }
    return {selected, items, first: first!, last: last!, before, after}
  }

  getPlacementState(target: Element) {
    const placement = this.placement(target)
    return placement ? {canMoveUp: Boolean(placement.after), canMoveDown: Boolean(placement.before)} : undefined
  }

  movePlacement(direction: PlacementDirection, topLevel = false) {
    const manipulation = this.editor.features.manipulation
    const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
    return target ? this.placeElement(target, direction) : false
  }

  placeElement(target: Element, direction: PlacementDirection, cycle = false) {
    if(this.editor.isEditingLocked || !["front", "up", "down", "back"].includes(direction)) return false
    const placement = this.placement(target)
    if(!placement) return false
    const {selected, items, first, last, before, after} = placement
    if(cycle && direction === "up" && !after) direction = "back"
    else if(cycle && direction === "down" && !before) direction = "front"
    const neighbor = direction === "front" || direction === "up" ? after : before
    if(!neighbor) return true
    // Keep generated values within the interoperable signed 32-bit range.
    const fits = (changes: Map<PlacementItem, number>) => [...changes.values()].every(z => z >= -(2 ** 31) && z <= 2 ** 31 - 1)
    let changes: Map<PlacementItem, number>
    if(direction === "front" || direction === "back") {
      changes = new Map([[selected, direction === "front" ? last.z + 1 : first.z - 1]])
    }
    else if(!items.some(item => item !== selected && item.z === selected.z || item !== neighbor && item.z === neighbor.z)) {
      changes = new Map([[selected, neighbor.z], [neighbor, selected.z]])
    }
    else {
      // Swapping duplicate indices can reorder unrelated peers. Repair the
      // shorter adjoining run, using only the already-read values.
      const ordered = [...items].sort((a, b) => a.z - b.z || a.order - b.order)
      const lower = direction === "up" ? selected : neighbor, upper = direction === "up" ? neighbor : selected
      const index = ordered.indexOf(lower)
      const shift = (forward: boolean) => {
        let z = forward ? upper.z + (lower.order < upper.order ? 1 : 0) : lower.z - (upper.order > lower.order ? 1 : 0)
        let previous = forward ? lower : upper
        const result = new Map([[previous, z]])
        for(let i = forward ? index + 2 : index - 1; i >= 0 && i < ordered.length; i += forward ? 1 : -1) {
          const item = ordered[i]
          if(forward ? item.z > z || item.z === z && item.order > previous.order
            : item.z < z || item.z === z && item.order < previous.order) break
          z += forward ? (item.order < previous.order ? 1 : 0) : (item.order > previous.order ? -1 : 0)
          result.set(item, z)
          previous = item
        }
        return result
      }
      const forward = shift(true), backward = shift(false)
      changes = fits(forward) && (!fits(backward) || forward.size <= backward.size) ? forward : backward
    }
    if(!fits(changes)) {
      // Compact only when a generated index would leave that range.
      const ordered = [...items].sort((a, b) => a.z - b.z || a.order - b.order)
      const index = ordered.indexOf(selected)
      const destination = direction === "front" ? ordered.length - 1 : direction === "back" ? 0 : index + (direction === "up" ? 1 : -1)
      ordered.splice(destination, 0, ...ordered.splice(index, 1))
      changes = new Map(ordered.map((item, index) => [item, index + 1]))
    }
    const end = this.editor.doc.beginUndoGroup()
    try {
      for(const [{element}, z] of changes) {
        const value = String(z)
        if(element.style.zIndex !== value) element.style.setProperty("z-index", value, element.style.getPropertyPriority("z-index"))
      }
    }
    finally { end() }
    return true
  }

  moveFloat(direction: "up" | "down", topLevel = false) {
    const manipulation = this.editor.features.manipulation, element = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
    if(!element || this.editor.isEditingLocked || !["up", "down"].includes(direction)
      || manipulation.floatContainer(element) !== element) return false
    const sibling = direction === "up" ? element.previousElementSibling : element.nextElementSibling
    if(!sibling) return false
    const parent = element.parentElement as Element & {moveBefore?: (node: Node, child: Node | null) => void}
    const selection = document.getSelection()
    const anchor = selection?.anchorNode, focus = selection?.focusNode
    const anchorOffset = selection?.anchorOffset ?? 0, focusOffset = selection?.focusOffset ?? 0
    const inside = anchor && focus && element.contains(anchor) && element.contains(focus)
    const captured = this.editor.features.selection.captureSelectedElement === element
    const end = this.editor.doc.beginUndoGroup()
    try {
      if(parent.moveBefore) parent.moveBefore(element, direction === "up" ? sibling : sibling.nextSibling)
      else if(direction === "up") sibling.before(element)
      else sibling.after(element)
      if(!element.isConnected) return false
      if(captured) this.editor.features.selection.captureElement(element)
      else if(inside && element.contains(anchor) && element.contains(focus)) {
        const length = (node: Node) => node instanceof CharacterData ? node.length : node.childNodes.length
        $.selectRange(anchor, Math.min(anchorOffset, length(anchor)), focus, Math.min(focusOffset, length(focus)))
        this.editor.features.selection.processSelection()
      }
      else this.editor.features.selection.selectElement(element)
      return true
    }
    finally { end() }
  }

  actions = {
    setFloatSticky: ({enabled, topLevel}: {type: "setFloatSticky", enabled: boolean, topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
      if(!target || this.editor.isEditingLocked || this.editor.features.canvas.active || this.editor.features.slides.active
        || typeof enabled !== "boolean") return false
      const style = (target as HTMLElement).style ?? getComputedStyle(target)
      const authoredSide = floatSideFromStyles(getComputedStyle(target).float, style, target.classList)
      if(authoredSide === "none") return false
      const end = this.editor.doc.beginUndoGroup()
      try {
        if(enabled && !target.matches(".ww-float-left, .ww-float-right")
          && !manipulation.setFloat(target, authoredSide)) return false
        if(enabled) for(const element of document.body.querySelectorAll(".ww-float-sticky")) {
          element.classList.remove("ww-float-sticky")
          if(!element.classList.length) element.removeAttribute("class")
        }
        target.classList.toggle("ww-float-sticky", enabled)
      }
      finally { end() }
      return true
    },
    setFloat: ({side, alignment, topLevel}: {type: "setFloat", side: FloatSide, alignment?: "left" | "center" | "right", topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
      if(!target) return false
      const end = this.editor.doc.beginUndoGroup()
      try {
        if(!manipulation.setFloat(target, side, alignment)) return false
        if(side === "none") return true
        const desired = side === "left" || side === "far-left" ? "far-left" : "far-right"
        for(const element of document.body.querySelectorAll<HTMLElement | SVGSVGElement>(
          '.ww-float-left, .ww-float-right, [style*="float: left"], [style*="float:left"], [style*="float: right"], [style*="float:right"]')) {
          if(element === target || manipulation.floatContainer(element) !== element) continue
          const current = floatSideFromStyles(getComputedStyle(element).float, element.style, element.classList)
          if(current !== "none" && current !== desired) manipulation.setFloat(element, desired)
        }
        return true
      }
      finally { end() }
    },
    moveFloat: ({direction, topLevel}: {type: "moveFloat", direction: "up" | "down", topLevel?: boolean}) => this.moveFloat(direction, topLevel),
    movePlacement: ({direction, topLevel}: {type: "movePlacement", direction: PlacementDirection, topLevel?: boolean}) => this.movePlacement(direction, topLevel),
  }
}
