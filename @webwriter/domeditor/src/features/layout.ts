import {EditorFeature} from "."
import {floatSideFromStyles, type FloatSide} from "../element-styles"
import {$} from "../utility"

/** Document arrangement uses native floats on the live selected element. */
export class LayoutFeature extends EditorFeature {
  refresh() {}
  getState() { return null }

  moveFloat(direction: "up" | "down", topLevel = false) {
    const manipulation = this.editor.features.manipulation, element = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
    if(!element || this.editor.isEditingLocked || !["up", "down"].includes(direction)
      || manipulation.floatContainer(element) !== element) return false
    const style = (element as HTMLElement | SVGElement).style
    if(!style || floatSideFromStyles(getComputedStyle(element).float, style, element.classList) === "none") return false
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
    setFloat: ({side, topLevel}: {type: "setFloat", side: FloatSide, topLevel?: boolean}) => {
      const manipulation = this.editor.features.manipulation
      const target = topLevel ? manipulation.topLevelStyleTarget : manipulation.styleTarget
      return target ? manipulation.setFloat(target, side) : false
    },
    moveFloat: ({direction, topLevel}: {type: "moveFloat", direction: "up" | "down", topLevel?: boolean}) => this.moveFloat(direction, topLevel),
  }
}
