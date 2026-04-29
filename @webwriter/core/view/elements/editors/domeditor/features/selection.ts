import { DocumentListenerMap, EditorFeature } from "."
import {$, getContainer, isElement, modifierKeyDown} from "../utility"

export class SelectionFeature extends EditorFeature {

  enable() {
    $.selectDocumentStart()
    super.enable()
  }
  
  isInDragSelection = false

  dragAnchor: {node: Node, offset: number} | null = null

  static get gapAnchor() {
    return document.querySelector(":not(.◆gap-caret).◆gap-before-selected, :not(.◆gap-caret).◆gap-after-selected")
  }

  #createGapCaret() {
    const node = document.createElement("div")
    node.classList.add("◆", "◆editor-only",  "◆gap-caret")
    node.contentEditable = "false"
    this.editor.addAppendix(node)
    return node
  }

  get gapCaret() {
    return document.body.querySelector(".◆gap-caret")
  }

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
    document.querySelector(".◆gap-caret")?.setAttribute("visibility", "hidden")
    document.querySelectorAll(".◆element-selected").forEach(el => {
      el.classList.remove("◆element-selected")
      if(!Array.from(el.classList).some(k => k !== "◆" && k.startsWith("◆"))) {
        el.classList.remove("◆")
      }
      if(el.classList.length === 0) {
        el.removeAttribute("class")
      }
    })
  }

  processSelection(inDragSelection=false) {
    const sel = document.getSelection()!
    this.#clearSelections()
    if($.isGapSelection) {
      const children = sel.anchorNode!.childNodes
      if(children.length) {
        const i = sel.anchorOffset
        const placement = i > 0? "after": "before"
        const offset = placement === "after"? -1: 0
        const element = children.item(i + offset) as Element
        const gapCaret = this.gapCaret ?? this.#createGapCaret()
        element?.classList?.add("◆", `◆gap-${placement}-selected`)
        gapCaret.classList.add(`◆gap-${placement}-selected`)
        gapCaret.removeAttribute("visibility")
      }
      
    }
    else if($.isElementSelection && !inDragSelection) {
      const element = sel.anchorNode!.childNodes.item(Math.min(sel.anchorOffset, sel.focusOffset)) as Element
      element.classList.add("◆", "◆element-selected")
    }
  }

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

  hasDoubleClicked = false
  
  activeListeners: DocumentListenerMap = {
    "keydown": ev => {
      if(ev.key === "ArrowUp" && ev.altKey) {

      } 
      else if(ev.key === "ArrowUp" && modifierKeyDown(ev)) {

      }
      else if(ev.key === "ArrowUp") {
        
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
      if(isElement(ev.target) && ev.target.closest(".◆editor-only") || this.hasDoubleClicked || ev.button === 2) {
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
        $.selectCoords(ev.x, ev.y)
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