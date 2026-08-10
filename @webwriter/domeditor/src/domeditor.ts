import {SharedDOMDoc, type EditingMutation} from "./domdoc"
import {CollaborationFeature} from "./features/collaboration"
import { DependencyFeature } from "./features/dependencies"
import { HistoryFeature } from "./features/history"
import { ManipulationFeature } from "./features/manipulation"
import { MarkFeature } from "./features/mark"
import { PlaceholderFeature } from "./features/placeholder"
import { SelectionFeature } from "./features/selection"
import { InsertionFeature } from "./features/insertion"
import { TransformationFeature } from "./features/transformation"
import { Schema } from "./schema"
import { $, adoptStylesheet, createStylesheet, isElement } from "./utility"
import {
  executeCompleteEvent,
  executeFailureEvent,
  markStateChangeEvent,
  selectionChangeEvent,
  presenceChangeEvent,
  type PresenceUser,
  type SelectionChangeDetail,
  type SelectionGap,
  type SelectionPathItem,
  type SerializedError,
} from "./editor-bridge"
import { getElementPresentation } from "./element-names"
import editorStyleString from "./editor.css?raw"

const editorStylesheet = createStylesheet(editorStyleString)
const featuresDisabledByDefault = new Set(["placeholder"])

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

type FeatureActions<F extends keyof DOMEditor["features"]> = NonNullable<DOMEditor["features"][F]["actions"]>
type FeatureAction<F extends keyof DOMEditor["features"]> = {
  [K in keyof FeatureActions<F>]: FeatureActions<F>[K] extends (...args: infer Parameters) => unknown
    ? Parameters[0]
    : never
}[keyof FeatureActions<F>]
export type EditingAction = {
  [F in keyof DOMEditor["features"]]: FeatureAction<F>
}[keyof DOMEditor["features"]]

export class DOMEditor {
  
  doc: SharedDOMDoc
  parser = new DOMParser()
  schema = new Schema()
  
  features = {
    "dependency": new DependencyFeature(this),
    "insertion": new InsertionFeature(this),
    "history": new HistoryFeature(this),
    "manipulation": new ManipulationFeature(this),
    "transformation": new TransformationFeature(this),
    "selection": new SelectionFeature(this),
    "placeholder": new PlaceholderFeature(this),
    "mark": new MarkFeature(this),
    "collaboration": new CollaborationFeature(this),
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
    document.body.contentEditable = "true"
    document.designMode = "on"
    document.body.spellcheck = false
    if(globalThis.SYNC_URL) {
      const syncUrl = new URL(globalThis.SYNC_URL)
      const sessionId = syncUrl.searchParams.get("session") ?? syncUrl.pathname.split("/").filter(Boolean).at(-1)
      this.doc = new SharedDOMDoc(syncUrl.origin, sessionId, this.ignoreAttrs, this.ignoreClasses)
    }
    else {
      this.doc = new SharedDOMDoc(undefined, undefined, this.ignoreAttrs, this.ignoreClasses)
    }
    Object.entries(this.features)
      .filter(([key]) => !featuresDisabledByDefault.has(key))
      .forEach(([, feat]) => feat.enable())
    document.addEventListener("input", this.#handleInput)
    document.addEventListener("selectionchange", this.handleSelectionChange)
    this.doc.updateLocalSelection()
    this.postMarkState()
    this.postSelectionPath()
    document.addEventListener("copy", this.#onCopy)
    window.addEventListener("message", this.handleMessage)
  }

  #handleInput = (ev: Event) => {
    this.normalizeSurroundingElements(ev.target instanceof Node ? ev.target : undefined)
  }

  destroy() {
    Object.values(this.features).forEach(feature => feature.disable())
    document.removeEventListener("input", this.#handleInput)
    document.removeEventListener("selectionchange", this.handleSelectionChange)
    document.removeEventListener("copy", this.#onCopy)
    window.removeEventListener("message", this.handleMessage)
    this.doc.destroy()
  }

  private handleSelectionChange = () => {
    const selection = document.getSelection()
    if(!selection?.anchorNode) return

    this.doc.updateLocalSelection(selection)
    this.postMarkState()
    this.postSelectionPath()
  }

  private handleMessage = (ev: MessageEvent) => {
    if(!ev.data || typeof ev.data !== "object" || typeof ev.data.type !== "string") {
      return
    }

    // Responses are posted to the parent window. In a non-iframe environment
    // (for example, a unit test), they can arrive back at this listener too.
    if(ev.data.type === executeCompleteEvent || ev.data.type === executeFailureEvent || ev.data.type === presenceChangeEvent || ev.data.type === markStateChangeEvent) {
      return
    }
    if(ev.data.type === selectionChangeEvent) {
      return
    }

    const requestId = typeof ev.data.requestId === "string"? ev.data.requestId: undefined
    const handle = this.getActionHandler(ev.data.type)
    if(!handle) {
      const error = TypeError(`No handler registered for message '${ev.data.type}'`)
      if(requestId) {
        this.postExecutionEvent(executeFailureEvent, {
          requestId,
          error: this.serializeError(error),
        })
        return
      }
      throw error
    }

    let result: unknown
    try {
      result = handle(ev.data)
    }
    catch(error) {
      this.normalizeSurroundingElements()
      if(requestId) {
        this.postExecutionEvent(executeFailureEvent, {
          requestId,
          error: this.serializeError(error),
        })
      }
      else {
        throw error
      }
      return
    }

    Promise.resolve(result).then(
      value => {
        this.normalizeSurroundingElements()
        if(requestId) {
          this.postExecutionEvent(executeCompleteEvent, {requestId, result: value})
        }
      },
      error => {
        this.normalizeSurroundingElements()
        if(requestId) {
          this.postExecutionEvent(executeFailureEvent, {
            requestId,
            error: this.serializeError(error),
          })
        }
      },
    )
  }

  private serializeError(error: unknown): SerializedError {
    if(error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        ...(error.stack? {stack: error.stack}: {}),
      }
    }
    return {name: "Error", message: String(error)}
  }

  private postBridgeEvent<T extends object>(type: string, detail: T) {
    const event = new CustomEvent(type, {detail})
    window.dispatchEvent(event)
    const target = window.parent === window? window: window.parent
    target.postMessage({type: event.type, detail: event.detail}, "*")
  }

  private postExecutionEvent<T extends object>(type: string, detail: T) {
    this.postBridgeEvent(type, detail)
  }

  postPresence(users: PresenceUser[]) {
    this.postBridgeEvent(presenceChangeEvent, {users})
  }

  private selectedElementForPath() {
    const selectedElement = $.selectedElement
    if(selectedElement?.isConnected) return selectedElement

    const anchor = $.anchor
    if(anchor instanceof Text) return anchor.parentElement
    if(isElement(anchor)) return anchor
    return document.body
  }

  private pathToElement(element: Element) {
    const body = document.body
    if(element === body) return []

    const path: number[] = []
    let current: Element | null = element
    while(current && current !== body) {
      const parent: Element | null = current.parentElement
      if(!parent) return []
      path.unshift(Array.from(parent.childNodes).indexOf(current))
      current = parent
    }
    return current === body? path: []
  }

  /** Sends the current element path to the host application through the bridge. */
  postSelectionPath() {
    const body = document.body
    const selected = this.selectedElementForPath()
    const element = selected && (selected === body || body.contains(selected))? selected: body
    const elements: Element[] = []
    let current: Element | null = element
    while(current && current !== body) {
      elements.unshift(current)
      current = current.parentElement
    }
    elements.unshift(body)

    const path: SelectionPathItem[] = elements.map(currentElement => ({
      path: this.pathToElement(currentElement),
      ...getElementPresentation(currentElement),
    }))
    const gap: SelectionGap | undefined = $.isGapSelection && isElement($.anchor)
      ? {parentPath: this.pathToElement($.anchor), offset: $.anchorOffset}
      : undefined
    const detail: SelectionChangeDetail = {
      path,
      ...(gap ? {gap} : {}),
    }
    this.postBridgeEvent(selectionChangeEvent, detail)
  }

  /** Sends mark availability and active marks as a DOM-derived bridge event. */
  postMarkState() {
    this.postBridgeEvent(markStateChangeEvent, this.features.mark.getState())
  }

  startTransform(el: HTMLElement) {
    this.features.transformation.startTransform(el)
  }

  handleMutations(mutations: EditingMutation[]) {
    this.doc.readDomMutation(mutations)
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

  /** Adds a rule to the document's constructed editor stylesheet. */
  addMainDOMStyleRule(cssText: string) {
    const index = editorStylesheet.insertRule(cssText)
    const rule = editorStylesheet.cssRules[index]
    return () => {
      const currentIndex = Array.from(editorStylesheet.cssRules).indexOf(rule)
      if(currentIndex >= 0) editorStylesheet.deleteRule(currentIndex)
    }
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
    const documentNode = node.nodeType === Node.DOCUMENT_NODE? node as Document: null
    if(documentNode) {
      documentNode.body.removeAttribute("contenteditable")
      documentNode.body.removeAttribute("spellcheck")
    }
    const editingElements = Array.from(node.querySelectorAll(".◆"))
    if(documentNode?.body.classList.contains("◆")) {
      editingElements.unshift(documentNode.body)
    }
    editingElements.forEach(el => {
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
