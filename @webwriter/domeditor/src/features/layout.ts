import {EditorFeature} from "."
import {floatSideFromStyles, type FloatSide} from "../element-styles"
import {$} from "../utility"
import {createFigureLayout} from "../figure-layout.js"
import {createLayoutPrint} from "../document-layout-print.js"
import {slideLayoutRole} from "../document-layout"
import {isAuthoredMutation} from "../editor-artifacts"

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
    this.columnMutationObserver = new MutationObserver(records => {
      if(records.some(isAuthoredMutation)) this.syncColumnWidth()
    })
    this.columnMutationObserver.observe(document.body, {subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["style", "class", "width"]})
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

  /** Wide placement is limited to blocks in the document's main flow. */
  canSetFullWidth(target: Element) {
    const parent = target.parentElement
    if(!target.isConnected || this.editor.isEditingLocked || !this.editor.allows("style", target) || this.editor.features.canvas.active || this.editor.features.slides.active
      || document.body.classList.contains("ww-board") || !(target instanceof HTMLElement || target instanceof SVGSVGElement)
      || !(parent === document.body || parent?.parentElement === document.body && parent.matches("main, article, section"))) return false
    if(target.querySelector('.ww-float-left, .ww-float-right, [style*="float: left"], [style*="float:left"], [style*="float: right"], [style*="float:right"]')) return false
    if(parent !== document.body) {
      const parentStyle = getComputedStyle(parent!)
      if(!["block", "flow-root"].includes(parentStyle.display) || (parentStyle.overflowX || parentStyle.overflow || "visible") !== "visible"
        || (parentStyle.overflowY || parentStyle.overflow || "visible") !== "visible" || parentStyle.float && parentStyle.float !== "none"
        || /(?:paint|strict|content)/.test(parentStyle.contain)) return false
      if((parentStyle.display === "flow-root" || /layout/.test(parentStyle.contain))
        && Array.from(document.body.querySelectorAll('.ww-float-left, .ww-float-right, [style*="float: left"], [style*="float:left"], [style*="float: right"], [style*="float:right"]'))
          .some(element => !parent!.contains(element))) return false
    }
    const style = getComputedStyle(target)
    return floatSideFromStyles(style.float, target.style, target.classList) === "none"
      && !["inline", "inline-block", "contents", "none"].includes(style.display)
      && !["absolute", "fixed"].includes(style.position)
  }

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
    const floats = Array.from(body.querySelectorAll<HTMLElement | SVGElement>(
      '.ww-float-left, .ww-float-right, [style*="float: left"], [style*="float:left"], [style*="float: right"], [style*="float:right"]'))
      .map(element => ({element, side: floatSideFromStyles(getComputedStyle(element).float, element.style, element.classList)}))
      .filter(({side}) => side !== "none")
    const candidates = floats.map(({element}) => element)
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
      for(const side of ["left", "right"]) {
        set(`--ww-${side}-column-default-width`, null)
        set(`--ww-${side}-column-explicit-width`, null)
      }
    }
    else if(document.documentElement.clientWidth >= 720) {
      const explicit = candidates.filter(element => ["--ww-float-size", "inline-size", "width", "max-inline-size", "max-width"]
        .some(name => {
          const value = element.style.getPropertyValue(name)
          // Percentages depend on the containing column; feeding their current
          // pixel width back into that column causes it to grow on every pass.
          return value && !value.includes("%") && value !== "var(--ww-float-width)" && value !== "none" && value !== "auto"
        }))
      // Measure authored sizes independently of the current lane cap. Otherwise
      // a float narrowed by a second lane can never grow again after resizing.
      const widths = new Map<Element, number>()
      const measurements = document.createElement("div")
      const parents = new Map<Element, number | null>()
      const number = (value: string) => Number.parseFloat(value) || 0
      const probes = explicit.flatMap(element => {
        const parent = element.parentElement
        if(!parent) return []
        let width = parents.get(parent)
        if(width === undefined) {
          const parentStyle = getComputedStyle(parent)
          const rect = parent.getBoundingClientRect()
          width = rect.width > 0 ? Math.max(0, rect.width - number(parentStyle.paddingLeft) - number(parentStyle.paddingRight)
            - number(parentStyle.borderLeftWidth) - number(parentStyle.borderRightWidth)) : null
          parents.set(parent, width)
        }
        if(width === null) return []
        const measure = document.createElement("div"), probe = document.createElement("div"), style = element.style
        measure.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;inset:0 auto auto 0"
        measure.style.width = `${width}px`
        probe.style.cssText = style.cssText
        probe.style.setProperty("box-sizing", getComputedStyle(element).boxSizing)
        probe.style.setProperty("float", "none")
        probe.style.setProperty("position", "static")
        const size = style.getPropertyValue("--ww-float-size") || style.getPropertyValue("inline-size") || style.width
        probe.style.setProperty("inline-size", size && size !== "auto" ? size : "max-content")
        const maximum = style.getPropertyValue("max-inline-size") || style.maxWidth
        if(maximum) probe.style.setProperty("max-inline-size", maximum)
        measure.append(probe)
        measurements.append(measure)
        return [{element, probe}]
      })
      if(probes.length) {
        this.editor.addAppendix(measurements)
        try {
          for(const {element, probe} of probes) widths.set(element, probe.getBoundingClientRect().width || element.getBoundingClientRect().width)
        }
        finally { measurements.remove() }
      }
      for(const element of explicit) if(!widths.has(element)) widths.set(element, element.getBoundingClientRect().width)
      const width = Math.max(0, ...explicit.map(element => widths.get(element) ?? 0))
      set("--ww-two-column-default-width", explicit.length === candidates.length ? "0px" : null)
      set("--ww-two-column-explicit-width", width ? `${Math.round(width * 100) / 100}px` : null)
      for(const side of ["left", "right"] as const) {
        const items = floats.filter(float => float.side === `far-${side}`).map(({element}) => element)
        const sized = items.filter(element => explicit.includes(element))
        const sideWidth = Math.max(0, ...sized.map(element => widths.get(element) ?? 0))
        set(`--ww-${side}-column-default-width`, items.length ? sized.length === items.length ? "0px" : "var(--ww-prose-max, 45rem)" : null)
        set(`--ww-${side}-column-explicit-width`, items.length ? `${Math.round(sideWidth * 100) / 100}px` : null)
      }
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
    setFullWidth: ({enabled, topLevel}: {type: "setFullWidth", enabled: boolean, topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
      if(!target || !target.isConnected || !document.body.contains(target) || this.editor.isEditingLocked
        || !this.editor.allows("style", target) || typeof enabled !== "boolean" || enabled && !this.canSetFullWidth(target)) return false
      const end = this.editor.doc.beginUndoGroup()
      try {
        target.classList.toggle("ww-full-width", enabled)
        const style = (target as HTMLElement | SVGSVGElement).style
        if(style.getPropertyValue("--ww-full-width-size")) style.removeProperty("--ww-full-width-size")
        if(!target.classList.length) target.removeAttribute("class")
      }
      finally { end() }
      return true
    },
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
        return true
      }
      finally { end() }
    },
    moveFloat: ({direction, topLevel}: {type: "moveFloat", direction: "up" | "down", topLevel?: boolean}) => this.moveFloat(direction, topLevel),
    movePlacement: ({direction, topLevel}: {type: "movePlacement", direction: PlacementDirection, topLevel?: boolean}) => this.movePlacement(direction, topLevel),
  }
}
