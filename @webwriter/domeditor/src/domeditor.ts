// import { SharedDOMDoc, EditingMutation } from "./domdoc"
import type { EditingMutation } from "./domdoc"
import { DependencyFeature } from "./features/dependencies"
import { HistoryFeature } from "./features/history"
import { ManipulationFeature } from "./features/manipulation"
import { MarkFeature } from "./features/mark"
import { PlaceholderFeature } from "./features/placeholder"
import { SelectionFeature } from "./features/selection"
import { TransformationFeature } from "./features/transformation"
import { Schema } from "./schema"
import { $, isElement } from "./utility"

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

  constructor() {
    // this.schema.checkAndCorrect()
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
        } else handle(ev.data)
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

  get #appendix() {
    let el = document.querySelector("#◆editor-appendix")
    if(!el) {
      el = document.createElement("div")
      el.id = "◆editor-appendix"
      el.classList.add("◆", "◆editor-only")
      el.setAttribute("contenteditable", "false")
      document.body.append(el)
    }
    return el
  }

  addAppendix(el: Element) {
    this.#appendix.append(el)
  }

  toHTML(innerBody=false) {
    const root = document.cloneNode(true) as Document
    this.clearEditingArtifacts()
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