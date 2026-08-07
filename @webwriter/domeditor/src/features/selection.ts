import { DocumentListenerMap, EditorFeature } from "."
import {$, getContainer, isElement, modifierKeyDown, setPart} from "../utility"

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
    const index = Array.from(parent.childNodes).indexOf(node)
    if(Array.from(parent.childNodes).slice(0, index).some(previous => previous.nodeType === Node.ELEMENT_NODE || previous.textContent)) {
      return false
    }
    node = parent
    offset = index
  }
  return node === element && offset === 0
}

/** Editing feature that visualizes the current selection. It classifies every
 * selection change into an editing-relevant kind (element, text, gap, empty)
 * and applies the corresponding `◆…-selected` marker classes, manages the gap
 * caret element, mirrors modifier key state onto the body, and implements
 * pointer-based selection (drag selection, modifier-click element
 * selection). */
export class SelectionFeature extends EditorFeature {

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
    const body = document.body
    const bodyRange = document.createRange()
    bodyRange.selectNodeContents(body)
    const clamp = (node: Node, offset: number): [Node, number] => {
      if(node === body || body.contains(node)) {
        return [node, offset]
      }
      let relation: number
      try {
        relation = bodyRange.comparePoint(node, offset)
      }
      catch {
        relation = -1
      }
      return relation < 0? [body, 0]: [body, body.childNodes.length]
    }
    const anchor = clamp(selection.anchorNode, selection.anchorOffset)
    const focus = clamp(selection.focusNode, selection.focusOffset)
    if(anchor[0] !== selection.anchorNode || anchor[1] !== selection.anchorOffset || focus[0] !== selection.focusNode || focus[1] !== selection.focusOffset) {
      selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1])
    }
  }

  /** Enables the feature and places the selection at the document start. */
  enable() {
    $.selectDocumentStart()
    super.enable()
  }

  /** Whether a pointer-driven drag selection is in progress. */
  isInDragSelection = false

  dragAnchor: {node: Node, offset: number} | null = null

  /** The element marked as the anchor of the current gap selection (the
   * element the gap caret is attached to), or null. */
  static get gapAnchor() {
    return document.querySelector(":not(.◆gap-caret).◆gap-before-selected, :not(.◆gap-caret).◆gap-after-selected")
  }

  /** Creates the gap caret element and adds it to the editor appendix. */
  #createGapCaret() {
    const node = document.createElement("div")
    node.classList.add("◆gap-caret")
    node.setAttribute("part", "gap-caret gap-caret-hidden")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  /** The gap caret element (shown in gaps between elements), or null if it
   * has not been created yet. */
  get gapCaret() {
    return this.editor.appendix.querySelector(".◆gap-caret")
  }

  /** Removes all selection marker classes (gap, element, text, empty) from
   * the document, dropping emptied class attributes, and hides the gap
   * caret. */
  #clearSelections() {
    document.querySelectorAll(".◆gap-before-selected, .◆gap-after-selected").forEach(el => {
      el.classList.remove("◆gap-before-selected", "◆gap-after-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    this.gapCaret?.setAttribute("visibility", "hidden")
    document.body.classList.remove("◆gap-caret-visible")
    if(this.gapCaret) {
      setPart(this.gapCaret, "gap-caret-hidden")
      ;["gap-before-selected", "gap-after-selected", "drop-caret-before", "drop-caret-after"].forEach(state => setPart(this.gapCaret!, `gap-caret-${state}`, false))
    }
    document.querySelectorAll(".◆element-selected").forEach(el => {
      el.classList.remove("◆element-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    document.querySelectorAll(".◆text-selected").forEach(el => {
      el.classList.remove("◆text-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
    document.querySelectorAll(".◆empty-selected").forEach(el => {
      el.classList.remove("◆empty-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
  }

  /** Re-applies the selection markers for the current selection: the gap
   * anchor and caret for gap selections (`◆gap-before/after-selected`), the
   * selected element (`◆element-selected`, skipped during drag selections),
   * the text container (`◆text-selected`) or the empty container
   * (`◆empty-selected`). Previous markers are cleared first. */
  processSelection(inDragSelection=false) {
    this.#constrainSelectionToBody()
    const sel = document.getSelection()!
    this.#clearSelections()
    if($.isGapSelection) {
      const children = sel.anchorNode!.childNodes
      if(children.length) {
        const i = sel.anchorOffset
        const firstBodyElement = document.body.firstElementChild
        const firstBodyElementIndex = firstBodyElement? Array.from(children).indexOf(firstBodyElement): -1
        const isBeforeFirstBodyElement = sel.anchorNode === document.body && firstBodyElementIndex >= 0 && i <= firstBodyElementIndex &&
          Array.from(children).slice(i, firstBodyElementIndex).every(node => node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
        const placement = i === 0 || isBeforeFirstBodyElement? "before": "after"
        const offset = placement === "after"? -1: 0
        const element = isBeforeFirstBodyElement? firstBodyElement: children.item(i + offset) as Element
        const gapCaret = this.gapCaret ?? this.#createGapCaret()
        element?.classList?.add("◆", `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        setPart(gapCaret, `gap-caret-gap-${placement}-selected`)
        setPart(gapCaret, "gap-caret-hidden", false)
        document.body.classList.add("◆gap-caret-visible")
        gapCaret.removeAttribute("visibility")
      }
      
    }
    else if($.isElementSelection && !inDragSelection) {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      element.classList.add("◆", "◆element-selected")
    }
    else if($.isTextSelection) {
      const element = getContainer($.commonAncestor)
      element.classList.add("◆", "◆text-selected")
    }
    else if($.isEmptySelection) {
      const element = getContainer($.commonAncestor)
      element.classList.add("◆", "◆empty-selected")
    }
  }

  /** Observing behavior: re-apply markers on every selection change, extend
   * the drag selection on pointer moves, and mirror modifier key state onto
   * the body (`◆key-mod/alt/shift-down`). */
  passiveListeners: DocumentListenerMap = {
    "selectionchange": () => this.processSelection(this.isInDragSelection),
    "pointermove": ev => {
      const inPageX = 0 <= ev.pageX && ev.pageX <= document.body.offsetWidth
      const inPageY = 0 <= ev.pageY && ev.pageY <= document.body.offsetHeight
      if(this.isInDragSelection && inPageX && inPageY) {
        $.selectCoords(ev.x, ev.y, true)
      }
    },
    "keydown": ev => {
      if(modifierKeyDown(ev)) {
        document.body.classList.add("◆","◆key-mod-down")
      }
      if(ev.altKey) {
        document.body.classList.add("◆", "◆key-alt-down")
      }
      if(ev.shiftKey) {
        document.body.classList.add("◆", "◆key-shift-down")
      }
    },
    "keyup": ev => {
      if(!modifierKeyDown(ev)) {
        document.body.classList.remove("◆key-mod-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(!ev.altKey) {
        document.body.classList.remove("◆key-alt-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(!ev.shiftKey) {
        document.body.classList.remove("◆key-shift-down")
        if(document.body.classList.length === 1) {
          document.body.classList.remove("◆")
        }
      }
      if(document.body.classList.length === 0) {
        document.body.removeAttribute("class")
      }
    }
  }

  /** Whether the last click was part of a double click (suppresses the
   * subsequent pointerdown handling). */
  hasDoubleClicked = false

  /** Pointer behavior: 
   * pointerdown starts a drag selection at the pointer (modifier-click selects the whole element instead), 
   * double/triple click select the word/line, 
   * pointerup ends the drag selection. */
  activeListeners: DocumentListenerMap = {
    "keydown": ev => {
      if(ev.key.toLowerCase() === "a" && modifierKeyDown(ev)) {
        ev.preventDefault()
        $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
        this.processSelection()
      }
      else if(ev.key === "ArrowUp" && ev.altKey) {

      } 
      else if(ev.key === "ArrowUp" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowUp") {
        const firstBodyElement = document.body.firstElementChild
        if(!ev.shiftKey && firstBodyElement && isCaretAtStartOf(firstBodyElement)) {
          ev.preventDefault()
          $.selectGap(firstBodyElement, "before")
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
    "pointerdown": ev => {
      if((isElement(ev.target) && ev.target.closest(".◆editor-only")) || this.hasDoubleClicked || ev.button === 2) {
        return
      }
      if(modifierKeyDown(ev)) {
        ev.preventDefault()
        $.selectElement(getContainer(ev.target as Node))
        this.processSelection(this.isInDragSelection)
      }
      else {
        this.isInDragSelection = true
        ev.preventDefault()
        $.selectCoords(ev.x, ev.y, ev.shiftKey)
        this.processSelection(this.isInDragSelection)
      }
    },
    "click": ev => {
      this.hasDoubleClicked = false
      if(ev.button === 2 || $.isElementSelection) {
        return
      }
      else if(ev.detail === 2) {
        this.hasDoubleClicked = true
        $.moveBy("word", "backward")
        $.extendBy("word")
      }
      else if(ev.detail >= 3) {
        this.hasDoubleClicked = true
        $.moveBy("line", "backward")
        $.extendBy("line")
      }
    },
    "pointerup": ev => {
      this.isInDragSelection = false
    }
  }
}
