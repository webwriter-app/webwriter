// import { SharedDOMDoc, EditingMutation } from "./domdoc"
import type { EditingMutation } from "./domdoc"
import { DependencyFeature } from "./features/dependencies"
import { HistoryFeature } from "./features/history"
import { ManipulationFeature } from "./features/manipulation"
import { MarkFeature } from "./features/mark"
import { PlaceholderFeature } from "./features/placeholder"
import { SelectionFeature } from "./features/selection"
import { SlashFeature } from "./features/slash"
import { TransformationFeature } from "./features/transformation"
import { Schema } from "./schema"
import { $, adoptStylesheet, createStylesheet, isElement } from "./utility"
import editorStyleString from "./editor.css?raw"

const editorStylesheet = createStylesheet(editorStyleString)

/** DOMEditor
 * Core (transactions, schema, communication)
 * Basic manipulation (insert, replace, delete, split, join, lift)
 * Text-specific functions (add mark, update mark, remove mark)
 * Selection (set selection, move selection, extend selection)
 * Transformation (scale, rotate, translate)
 * History and state (undo, redo, restore, save, load, reload)
 * Versioned elements with dependencies, including editor (add script/style/template, update script/style/template, remove script/style/template)
 * Live sessions including collaboration and analytics (start session, stop session)
 */

declare global {
  var SYNC_URL: string | undefined
}

type ActionKeyMap = {
  [F in keyof DOMEditor["features"]]: { // @ts-ignore
    [K in keyof DOMEditor["features"][F]["actions"]]: Parameters<DOMEditor["features"][F]["actions"][K]>[0]
  }
}
type ActionFlatMap = Exclude<ActionKeyMap[keyof ActionKeyMap], Record<string, never>>
type EditingAction = ActionFlatMap[keyof ActionFlatMap]

export class DOMEditor {
  
  // doc: SharedDOMDoc
  parser = new DOMParser()
  schema = new Schema()
  observer = new MutationObserver(m => this.handleMutations(m))
  
  features = {
    "dependency": new DependencyFeature(this),
    "slash": new SlashFeature(this),
    "history": new HistoryFeature(this),
    "manipulation": new ManipulationFeature(this),
    "transformation": new TransformationFeature(this),
    "selection": new SelectionFeature(this),
    "placeholder": new PlaceholderFeature(this),
    "mark": new MarkFeature(this),
  } as const

  ignoreAttrs = ["contenteditable", "spellcheck"]
  ignoreClasses = ["◆"]


  getActionHandler(key: string) {
    const allHandlers = Object.fromEntries(Object.keys(this.features).flatMap(fk => Object.entries((this.features as any)[fk].actions ?? {})))
    return allHandlers[key] as CallableFunction
  }

  /** Merges adjacent text nodes in the elements surrounding the given nodes
   * and the current selection. The explicit nodes cover command operations
   * whose original selection may have been replaced or moved. */
  normalizeSurroundingElements(...nodes: (Node | null | undefined)[]) {
    const selection = document.getSelection()
    const savedSelection = selection?.anchorNode instanceof Text && selection.focusNode instanceof Text
      ? {
          anchor: this.saveTextPoint(selection.anchorNode, selection.anchorOffset),
          focus: this.saveTextPoint(selection.focusNode, selection.focusOffset),
        }
      : null
    const elements = new Set<Element>()
    for(const node of [
      ...nodes,
      selection?.anchorNode,
      selection?.focusNode,
    ]) {
      if(!node) continue
      const element = isElement(node)? node: node.parentElement
      element && elements.add(element)
    }
    elements.forEach(element => element.normalize())
    if(selection && savedSelection) {
      const anchor = this.restoreTextPoint(savedSelection.anchor)
      const focus = this.restoreTextPoint(savedSelection.focus)
      if(anchor && focus) {
        selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1])
      }
    }
  }

  private saveTextPoint(node: Node, offset: number) {
    if(!(node instanceof Text) || !node.parentElement) {
      return {node, offset}
    }
    const range = document.createRange()
    range.selectNodeContents(node.parentElement)
    range.setEnd(node, offset)
    return {element: node.parentElement, textOffset: range.toString().length}
  }

  private restoreTextPoint(point: {node: Node, offset: number} | {element: Element, textOffset: number}): [Node, number] | null {
    if("element" in point) {
      if(!point.element.isConnected) return null
      let remaining = point.textOffset
      let lastText: Text | null = null
      const find = (node: Node): [Node, number] | null => {
        if(node instanceof Text) {
          lastText = node
          if(remaining <= node.length) return [node, remaining]
          remaining -= node.length
          return null
        }
        for(const child of Array.from(node.childNodes)) {
          const found = find(child)
          if(found) return found
        }
        return null
      }
      const found = find(point.element)
      if(found) return found
      const fallback = lastText as Text | null
      return fallback === null? [point.element, 0]: [fallback, fallback.length]
    }
    if(!point.node.isConnected) return null
    const maxOffset = point.node instanceof Text? point.node.length: point.node.childNodes.length
    return [point.node, Math.min(point.offset, maxOffset)]
  }

  constructor() {
    // this.schema.checkAndCorrect()
    adoptStylesheet(document, editorStylesheet)
    document.designMode = "on"
    document.body.spellcheck = false
    if("SYNC_URL" in window && SYNC_URL) {
      const syncUrl = new URL(SYNC_URL)
      // this.doc = new SharedDOMDoc(syncUrl.origin, syncUrl.searchParams.get("session")!, this.ignoreAttrs)
    }
    else {
      // this.doc = new SharedDOMDoc(undefined, undefined, this.ignoreAttrs, this.ignoreClasses)
    }
    Object.values(this.features).forEach(feat => feat.enable())
    document.addEventListener("input", ev => {
      this.normalizeSurroundingElements(ev.target instanceof Node? ev.target: undefined)
    })
    this.observer.observe(document, {attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, childList: true, subtree: true})
    document.addEventListener("selectionchange", () => {
      const selection = document.getSelection()
      if(!selection?.anchorNode) {
        return
      }
      this.handleMutations([{
        type: "selection",
        anchorNode: selection.anchorNode,
        anchorOffset: selection?.anchorOffset,
        focusNode: selection.focusNode ?? selection.anchorNode,
        focusOffset: selection?.focusOffset ?? selection?.anchorOffset
      }])
    })
    document.addEventListener("copy", this.#onCopy)
    window.addEventListener("message", ev => {
      if("type" in ev.data) {
        const handle = this.getActionHandler(ev.data.type)
        if(!handle) {
          throw TypeError(`No handler registered for message '${ev.data.type}'`)
        }
        else {
          const result = handle(ev.data)
          if(result && typeof result.then === "function") {
            Promise.resolve(result).then(
              () => this.normalizeSurroundingElements(),
              () => this.normalizeSurroundingElements(),
            )
          }
          else {
            this.normalizeSurroundingElements()
          }
        }
      }
    })
  }

  startTransform(el: HTMLElement) {
    this.features.transformation.startTransform(el)
  }

  isCorrecting = false

  handleMutations(mutations: EditingMutation[]) {
    let filteredMutations = mutations.map(m => {
      if(m.type === "selection" || m.type === "characterData") {
        return m
      }
      
      const isInternalClassChange = m.type === "attributes" && m.attributeName?.startsWith("◆")
      const isInternalElementChange = isElement(m.target) && m.target.matches(".◆editor-only")
      const isBuiltinEditingAttributeChange = m.type === "attributes" && this.ignoreAttrs.includes(m.attributeName!)
      
      if(isInternalClassChange || isInternalElementChange || isBuiltinEditingAttributeChange) {
        return null
      }
      else {
        const addedNodes = Array.from(m.addedNodes).filter(node => !isElement(node) || !node.matches(".◆editor-only"))
        const removedNodes = Array.from(m.removedNodes).filter(node => !isElement(node) || !node.matches(".◆editor-only"))
        const {type, target, nextSibling, previousSibling} = m
        return addedNodes.length || removedNodes.length? {
          type, addedNodes, removedNodes, target, previousSibling, nextSibling
        }: null
      }
    }).filter(m => m) as EditingMutation[]
    if(!this.isCorrecting) {
      const possiblyInvalidNodes = Array.from(new Set(filteredMutations.flatMap(mut => {
        if(mut.type === "childList") {
          return [mut.target, ...mut.addedNodes]
        }
        else if(mut.type === "attributes") {
          return [mut.target]
        }
        else if(mut.type === "characterData") {
          return [mut.target]
        }
      }))).filter(node => node && node.isConnected)
      if(possiblyInvalidNodes.length) {
        return
        this.isCorrecting = true
        console.log(`Correcting ${possiblyInvalidNodes.map(node => node?.nodeName.toLowerCase()).join(", ")}`)
        possiblyInvalidNodes.forEach(node => this.schema.checkAndCorrect(node))
        setTimeout(() => this.isCorrecting = false, 0)
      }
    }
    // filteredMutations.length && this.doc.readDomMutation(filteredMutations)
  }

  postAction(action: EditingAction) {
    postMessage(action)
  }

  get appendix() {
    const shadowRoot = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = shadowRoot.querySelector("slot") ?? document.createElement("slot")
    shadowRoot.appendChild(slot)
    return shadowRoot
  }

  addAppendix(el: Element) {
    this.appendix.append(el)
  }

  toHTML(innerBody=false) {
    const root = document.cloneNode(true) as Document
    this.clearEditingArtifacts(root)
    return innerBody? root.body.innerHTML: root.documentElement.outerHTML
  }

  #onCopy = (ev: ClipboardEvent) => {
    ev.preventDefault()
    const fragment = $.copy()
    this.clearEditingArtifacts(fragment)
    const serializer = new XMLSerializer()
    const html = serializer.serializeToString(fragment)
    console.log("TEXTCONTENT", fragment.textContent)
    ev.clipboardData?.setData("text/html", html)
    ev.clipboardData?.setData("text/plain", fragment.textContent)
  }
  
  clearEditingArtifacts(node: Document | DocumentFragment = document) {
    if(node instanceof Document) {
      node.body.removeAttribute("contenteditable")
      node.body.removeAttribute("spellcheck")
    }
    node.querySelectorAll(".◆").forEach(el => {
      el.outerHTML
      if(el.classList.contains("◆editor-only")) {
        el.remove()
      }
      else {
        const classes = Array.from(el.classList)
        el.classList.remove(...classes.filter(cls => cls.startsWith("◆")))
        if(!el.classList.length) {
          el.removeAttribute("class")
        }
      }
    })
  }


}

// RUN ////////////////////////////////////////////////////////////////////////
document.body.innerHTML = "<p>hello world</p><p>How are you?</p><p>I am great</p><ul><li>test</li></ul>"
const editor = new DOMEditor()
/* @ts-ignore */
window.editor = editor
