import {EditorFeature} from "."
import type {FloatSide} from "../element-styles"
import {$} from "../utility"
import {createFigureLayout} from "../figure-layout.js"
import {createLayoutPrint} from "../document-layout-print.js"
import {slideLayoutRole} from "../document-layout"

/** Document arrangement uses native floats, sibling moves and freeform stacking. */
export class LayoutFeature extends EditorFeature {
  private figures: ReturnType<typeof createFigureLayout> | null = null
  private print: ReturnType<typeof createLayoutPrint> | null = null
  enable() {
    if(this.isEnabled) return
    super.enable()
    this.figures = createFigureLayout(document)
    this.print = createLayoutPrint(document)
  }
  disable() {
    this.figures?.destroy()
    this.figures = null
    this.print?.destroy()
    this.print = null
    super.disable()
  }
  refresh() { this.figures?.refresh() }
  getState() { return null }

  private stackingOrder(target: Element) {
    const parent = target.parentElement
    if(!target.isConnected || !parent || !(this.editor.features.canvas.active && parent === document.body
      || this.editor.features.slides.active && slideLayoutRole(parent) === "slide")) return []
    return Array.from(parent.children).filter((element): element is HTMLElement | SVGSVGElement =>
      (element instanceof HTMLElement || element instanceof SVGSVGElement)
      && !element.matches("style,script,link,meta,template") && slideLayoutRole(element) !== "navigation")
      // Equal indices (including auto) paint in DOM order; stable sort keeps it.
      .sort((a, b) => (Number.parseInt(getComputedStyle(a).zIndex) || 0) - (Number.parseInt(getComputedStyle(b).zIndex) || 0))
  }

  getPlacementState(target: Element) {
    const items = this.stackingOrder(target), index = items.findIndex(item => item === target)
    return index < 0 ? undefined : {canMoveUp: index < items.length - 1, canMoveDown: index > 0}
  }

  movePlacement(direction: "front" | "up" | "down" | "back", topLevel = false) {
    const manipulation = this.editor.features.manipulation
    const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
    return target ? this.placeElement(target, direction) : false
  }

  placeElement(target: Element, direction: "front" | "up" | "down" | "back") {
    if(this.editor.isEditingLocked || !["front", "up", "down", "back"].includes(direction)) return false
    const items = this.stackingOrder(target), index = items.findIndex(item => item === target)
    if(index < 0) return false
    const destination = direction === "front" ? items.length - 1 : direction === "back" ? 0
      : Math.max(0, Math.min(items.length - 1, index + (direction === "up" ? 1 : -1)))
    items.splice(destination, 0, ...items.splice(index, 1))
    const end = this.editor.doc.beginUndoGroup()
    try {
      items.forEach((item, index) => {
        const value = String(index + 1)
        if(item.style.zIndex !== value) item.style.setProperty("z-index", value, item.style.getPropertyPriority("z-index"))
      })
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
    setFloat: ({side, alignment, topLevel}: {type: "setFloat", side: FloatSide, alignment?: "left" | "center" | "right", topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
      return target ? manipulation.setFloat(target, side, alignment) : false
    },
    moveFloat: ({direction, topLevel}: {type: "moveFloat", direction: "up" | "down", topLevel?: boolean}) => this.moveFloat(direction, topLevel),
    movePlacement: ({direction, topLevel}: {type: "movePlacement", direction: "front" | "up" | "down" | "back", topLevel?: boolean}) => this.movePlacement(direction, topLevel),
  }
}
