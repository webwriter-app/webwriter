import {SharedDOMDoc, type EditingMutation} from "./domdoc"
import {CollaborationFeature} from "./features/collaboration"
import { DependencyFeature } from "./features/dependencies"
import { HistoryFeature } from "./features/history"
import { ManipulationFeature } from "./features/manipulation"
import { MarkFeature } from "./features/mark"
import { CommentFeature } from "./features/comment"
import { PlaceholderFeature } from "./features/placeholder"
import { SelectionFeature } from "./features/selection"
import { InsertionFeature } from "./features/insertion"
import { ListFeature } from "./features/list"
import { TransformationFeature } from "./features/transformation"
import { StateFeature } from "./features/state"
import { MediaFeature } from "./features/media"
import { TableFeature } from "./features/table"
import { GraphicFeature } from "./features/graphic"
import { HeadFeature } from "./features/head"
import { FormFeature } from "./features/form"
import { Schema } from "./schema"
import { $, adoptStylesheet, createStylesheet, focusedWidgetHost, getContainer, isElement, isFormControlInteraction, isWidgetShadowInteraction, plainTextFromDOM } from "./utility"
import {isMarkElement, normalizeMarkElements} from "./marks"
import {
  executeCompleteEvent,
  executeFailureEvent,
  markStateChangeEvent,
  commentStateChangeEvent,
  selectionChangeEvent,
  presenceChangeEvent,
  documentHeadStateChangeEvent,
  historyStateChangeEvent,
  type PresenceUser,
  type SelectionChangeDetail,
  type SelectionGap,
  type SelectionPathItem,
  type SelectionPathSection,
  type SerializedError,
  type VersionHistoryState,
} from "./editor-bridge"
import { getElementPresentation, isLineBreakElement } from "./element-names"
import type {EditorStateSnapshot} from "./editor-state"
import editorStyleString from "./editor.css?raw"
import * as Y from "yjs"
import {originalURLAttribute, serializeDoctype} from "./serialization"
import type {DocumentHeadState} from "./document-head"
import {getSectionOption, isSectionElement} from "./sections"

const editorStylesheet = createStylesheet(editorStyleString)
const appendixStylesheet = createStylesheet(`
  :host(.◆editing-locked) > :not(slot) {
    display: none !important;
  }

  .◆comment-bauble {
    position: fixed;
    z-index: 2147483645;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.45rem;
    border: 1px solid #d5ad32;
    border-radius: 999px;
    color: #5c4610;
    background: #fff8c5;
    box-shadow: 0 2px 8px rgb(38 49 61 / 22%);
    font: 600 0.75rem/1 system-ui, sans-serif;
    cursor: pointer;
  }

  .◆comment-bauble:hover,
  .◆comment-bauble:focus-visible {
    border-color: #a77c00;
    background: #fff1a3;
    outline: none;
  }

  .◆comment-thread-pane {
    box-sizing: border-box;
    position: fixed;
    z-index: 2147483646;
    top: 1rem;
    right: 1rem;
    bottom: 1rem;
    width: min(24rem, calc(100vw - 2rem));
    overflow: hidden;
    border: 1px solid #c8d0da;
    border-radius: 0.7rem;
    color: #26313d;
    background: #f8fafc;
    box-shadow: 0 12px 38px rgb(15 23 42 / 25%);
    font: 0.8rem/1.4 system-ui, sans-serif;
  }

  .◆comment-pane-header {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 3rem;
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid #dce2e9;
    background: #ffffff;
  }

  .◆comment-pane-header h2,
  .◆comment-new-thread h3 {
    margin: 0;
    font: 650 0.9rem/1.3 system-ui, sans-serif;
  }

  .◆comment-thread-list {
    box-sizing: border-box;
    height: calc(100% - 3rem);
    overflow-y: auto;
    padding: 0.75rem;
  }

  .◆comment-thread {
    box-sizing: border-box;
    margin: 0 0 0.75rem;
    padding: 0.6rem;
    border: 1px solid #d9dfe6;
    border-radius: 0.55rem;
    background: #ffffff;
  }

  .◆comment-card {
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem;
    border-left: 3px solid #e1bd46;
    background: #fffdf3;
  }

  .◆comment-card + .◆comment-card {
    margin-top: 0.5rem;
    border-left-color: #c8d0da;
    background: #f8fafc;
  }

  .◆comment-card header {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .◆comment-card header span,
  .◆comment-card time {
    color: #697787;
    font-size: 0.68rem;
  }

  .◆comment-card textarea,
  .◆comment-composer textarea,
  .◆comment-new-thread textarea {
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
    padding: 0.45rem 0.5rem;
    border: 1px solid #c8d0da;
    border-radius: 0.35rem;
    color: inherit;
    background: #ffffff;
    font: inherit;
  }

  .◆comment-card textarea:focus,
  .◆comment-composer textarea:focus,
  .◆comment-new-thread textarea:focus {
    border-color: #a77c00;
    outline: 1px solid #a77c00;
  }

  .◆comment-composer {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid #e3e7ec;
  }

  .◆comment-pane-button {
    justify-self: end;
    padding: 0.35rem 0.55rem;
    border: 1px solid #b7c0ca;
    border-radius: 0.35rem;
    color: #26313d;
    background: #ffffff;
    font: 600 0.72rem/1.2 system-ui, sans-serif;
    cursor: pointer;
  }

  .◆comment-pane-button:hover,
  .◆comment-pane-button:focus-visible {
    border-color: #8d99a6;
    background: #eef2f6;
    outline: none;
  }

  .◆comment-pane-close {
    width: 2rem;
    height: 2rem;
    overflow: hidden;
    padding: 0;
    border-radius: 999px;
    font-size: 0;
  }

  .◆comment-pane-close::after {
    content: "×";
    font-size: 1.2rem;
  }

  .◆comment-remove {
    color: #9f2727;
  }

  .◆comment-new-thread {
    display: grid;
    gap: 0.5rem;
    border-style: dashed;
    background: #fffdf3;
  }
`)
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

export type DOMEditorOptions = {
  syncUrl?: string
  initialState?: EditorStateSnapshot
  bridgeNonce?: string
  bridgeOrigin?: string
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
    "state": new StateFeature(this),
    "head": new HeadFeature(this),
    "insertion": new InsertionFeature(this),
    "history": new HistoryFeature(this),
    "list": new ListFeature(this),
    "table": new TableFeature(this),
    "manipulation": new ManipulationFeature(this),
    "transformation": new TransformationFeature(this),
    "graphic": new GraphicFeature(this),
    "form": new FormFeature(this),
    "selection": new SelectionFeature(this),
    "placeholder": new PlaceholderFeature(this),
    "mark": new MarkFeature(this),
    "comment": new CommentFeature(this),
    "collaboration": new CollaborationFeature(this),
    "media": new MediaFeature(this),
  } as const

  ignoreAttrs = ["contenteditable", "spellcheck", "inert"]
  ignoreClasses = ["◆"]

  readonly #editingLocks = new Set<unknown>()
  readonly #blockedEditingEventTypes = [
    "beforeinput", "keydown", "paste", "cut", "drop", "compositionstart",
  ] as const
  #editingState: {designMode: string, contentEditable: string, inert: boolean} | null = null
  readonly #bridgeNonce: string
  readonly #bridgeOrigin: string

  readonly #blockEditingInteraction = (event: Event) => {
    if(!this.#editingLocks.size || !event.composedPath().includes(document.body)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  get isEditingLocked() {
    return this.#editingLocks.size > 0
  }

  hasEditingLock(owner: unknown) {
    return this.#editingLocks.has(owner)
  }

  /** Disables local authored-DOM interaction while keeping editor-owned UI
   * outside BODY available. Multiple features may hold independent locks. */
  lockEditing(owner: unknown) {
    if(this.#editingLocks.has(owner)) return
    if(this.#editingLocks.size === 0) {
      this.#editingState = {
        designMode: document.designMode,
        contentEditable: document.body.contentEditable,
        inert: document.body.inert,
      }
      this.#blockedEditingEventTypes.forEach(type => {
        document.addEventListener(type, this.#blockEditingInteraction, true)
      })
      document.designMode = "off"
      document.body.contentEditable = "false"
      document.body.inert = true
      document.body.classList.add("◆", "◆editing-locked")
      if(document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur()
      }
    }
    this.#editingLocks.add(owner)
  }

  unlockEditing(owner: unknown) {
    if(!this.#editingLocks.delete(owner) || this.#editingLocks.size > 0) return
    this.#blockedEditingEventTypes.forEach(type => {
      document.removeEventListener(type, this.#blockEditingInteraction, true)
    })
    const state = this.#editingState
    this.#editingState = null
    if(!state) return
    document.body.inert = state.inert
    document.body.contentEditable = state.contentEditable
    document.designMode = state.designMode
    document.body.classList.remove("◆editing-locked")
    if(!Array.from(document.body.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
      document.body.classList.remove("◆")
    }
    if(!document.body.classList.length) document.body.removeAttribute("class")
  }


  getActionHandler(key: string) {
    const allHandlers = Object.fromEntries(Object.keys(this.features).flatMap(fk => Object.entries((this.features as any)[fk].actions ?? {})))
    return allHandlers[key] as CallableFunction
  }

  /** Nonce for package assets explicitly trusted by the host editor. */
  get trustedScriptNonce() {
    return this.#bridgeNonce
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
      const element = getContainer(node)
      element && elements.add(element)
    }
    elements.forEach(element => {
      element.normalize()
      normalizeMarkElements(element)
      element.normalize()
    })
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
    const element = getContainer(node)
    range.selectNodeContents(element)
    range.setEnd(node, offset)
    return {element, textOffset: range.toString().length}
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

  constructor(options: DOMEditorOptions = {}) {
    this.#bridgeNonce = options.bridgeNonce ?? globalThis.crypto?.randomUUID?.() ?? `bridge-${Date.now()}-${Math.random()}`
    this.#bridgeOrigin = options.bridgeOrigin && options.bridgeOrigin !== "null"
      ? options.bridgeOrigin
      : window.location.origin
    // this.schema.checkAndCorrect()
    adoptStylesheet(document, editorStylesheet)
    document.body.contentEditable = "true"
    document.designMode = "on"
    document.body.spellcheck = false
    const initialState = options.initialState
    const initialYDoc = initialState?.update?.length ? new Y.Doc() : undefined
    if(initialYDoc) {
      Y.applyUpdate(initialYDoc, Uint8Array.from(initialState!.update))
    }
    if(options.syncUrl) {
      const syncUrl = new URL(options.syncUrl)
      const sessionId = syncUrl.searchParams.get("session") ?? syncUrl.pathname.split("/").filter(Boolean).at(-1)
      this.doc = new SharedDOMDoc(syncUrl.origin, sessionId, this.ignoreAttrs, this.ignoreClasses, {
        ...(initialYDoc ? {ydoc: initialYDoc} : {}),
      })
    }
    else {
      this.doc = new SharedDOMDoc(undefined, undefined, this.ignoreAttrs, this.ignoreClasses, {
        ...(initialYDoc ? {ydoc: initialYDoc} : {}),
      })
    }
    Object.entries(this.features)
      .filter(([key]) => !featuresDisabledByDefault.has(key))
      .forEach(([, feat]) => feat.enable())
    document.addEventListener("input", this.#handleInput)
    document.addEventListener("selectionchange", this.handleSelectionChange)
    if(initialState?.selection) this.doc.restoreSelection(initialState.selection)
    else this.doc.updateLocalSelection()
    this.postMarkState()
    this.postCommentState()
    this.postSelectionPath()
    document.addEventListener("copy", this.#onCopy)
    window.addEventListener("message", this.handleMessage)
  }

  #handleInput = (ev: Event) => {
    if(isWidgetShadowInteraction(ev) || isFormControlInteraction(ev)) return
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

  private handleSelectionChange = (event: Event) => {
    if(isWidgetShadowInteraction(event) || isFormControlInteraction(event)) return
    const selection = document.getSelection()
    if(!selection?.anchorNode) return

    this.doc.updateLocalSelection(selection)
    this.postMarkState()
    this.postCommentState()
    this.postSelectionPath()
  }

  private handleMessage = (ev: MessageEvent) => {
    if(!ev.data || typeof ev.data !== "object" || typeof ev.data.type !== "string") {
      return
    }
    if(window.parent !== window && ev.source !== window.parent) return
    if(window.parent !== window && ev.origin !== this.#bridgeOrigin
      && !(globalThis.navigator?.userAgent.includes("HappyDOM") && !ev.origin)) return
    if(ev.data.bridgeNonce !== this.#bridgeNonce) return

    // Responses are posted to the parent window. In a non-iframe environment
    // (for example, a unit test), they can arrive back at this listener too.
    if(ev.data.type === executeCompleteEvent || ev.data.type === executeFailureEvent || ev.data.type === presenceChangeEvent || ev.data.type === markStateChangeEvent || ev.data.type === commentStateChangeEvent || ev.data.type === documentHeadStateChangeEvent || ev.data.type === historyStateChangeEvent) {
      return
    }
    if(ev.data.type === selectionChangeEvent) {
      return
    }

    const requestId = typeof ev.data.requestId === "string"? ev.data.requestId: undefined
    if(!this.features.history.allowsActionDuringPreview(ev.data.type)) {
      const error = new Error("Close the version preview before editing the document")
      if(requestId) {
        this.postExecutionEvent(executeFailureEvent, {
          requestId,
          error: this.serializeError(error),
        })
        return
      }
      throw error
    }
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
        this.postSelectionPath()
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
    target.postMessage({type: event.type, detail: event.detail, bridgeNonce: this.#bridgeNonce}, this.#bridgeOrigin)
  }

  private postExecutionEvent<T extends object>(type: string, detail: T) {
    this.postBridgeEvent(type, detail)
  }

  postPresence(users: PresenceUser[]) {
    this.postBridgeEvent(presenceChangeEvent, {users})
  }

  postDocumentHeadState(state: DocumentHeadState) {
    this.postBridgeEvent(documentHeadStateChangeEvent, state)
  }

  postHistoryState(state: VersionHistoryState) {
    this.postBridgeEvent(historyStateChangeEvent, state)
  }

  private selectedElementForPath() {
    const target = this.features.manipulation.styleTarget
    const selectedSection = this.features.selection.selectedSectionElement
    if(target !== document.body && target !== selectedSection) return target
    const selectedElement = $.selectedElement
    if(selectedElement && selectedElement !== selectedSection) return selectedElement
    const anchor = document.getSelection()?.anchorNode
    const rawContainer = anchor instanceof Element ? anchor : anchor?.parentElement
    return rawContainer && document.body.contains(rawContainer) ? rawContainer : document.body
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
  postSelectionPath(inserted = false) {
    const body = document.body
    const focusedWidget = focusedWidgetHost()
    const selected = this.selectedElementForPath()
    const element = selected && (selected === body || body.contains(selected))? selected: body
    const elements: Element[] = []
    let current: Element | null = element
    while(current && current !== body) {
      elements.unshift(current)
      current = current.parentElement
    }
    elements.unshift(body)

    const sectionPathItem = (section: Element): SelectionPathSection => ({
      path: this.pathToElement(section),
      type: section.localName as SelectionPathSection["type"],
      name: getSectionOption(section.localName as SelectionPathSection["type"]).label,
      icon: getSectionOption(section.localName as SelectionPathSection["type"]).icon,
    })
    const path: SelectionPathItem[] = []
    let pendingSections: SelectionPathSection[] = []
    elements.forEach(currentElement => {
      const isTableInternal = currentElement.matches("caption, colgroup, col, thead, tbody, tfoot, tr, td, th")
      if(isSectionElement(currentElement)) {
        pendingSections.push(sectionPathItem(currentElement))
        return
      }
      if(isMarkElement(currentElement) || isLineBreakElement(currentElement) || isTableInternal) return
      const packageItem = globalThis.DOMEDITOR_PACKAGE_ITEMS?.find(item => (
        item.kind === "widget" && item.tag?.toLowerCase() === currentElement.localName
      ))
      path.push({
        path: this.pathToElement(currentElement),
        ...(packageItem
          ? {
              name: packageItem.name,
              icon: "Packages",
              ...(packageItem.iconUrl ? {iconUrl: packageItem.iconUrl} : {}),
            }
          : getElementPresentation(currentElement)),
        ...(pendingSections.length ? {sections: pendingSections} : {}),
      })
      pendingSections = []
    })
    if(pendingSections.length) {
      const owner = path.at(-1)
      if(owner) owner.sections = [...(owner.sections ?? []), ...pendingSections]
    }
    const gap: SelectionGap | undefined = !this.features.selection.isCaptureSelection
      && !focusedWidget && $.isGapSelection && isElement($.anchor)
      ? {parentPath: this.pathToElement($.anchor), offset: $.anchorOffset}
      : undefined
    const list = this.features.list.getState()
    const media = this.features.media.getState()
    const form = this.features.form.getState()
    const table = this.features.table.getState()
    const graphic = this.features.graphic.getState()
    const selectedSection = this.features.selection.selectedSectionElement
    const canSection = this.features.manipulation.canSectionSelection()
    const detail: SelectionChangeDetail = {
      path,
      ...(canSection && !path.at(-1)?.path.length ? {canSection: true} : {}),
      ...(inserted ? {inserted: true} : {}),
      ...($.isElementSelection && !selectedSection ? {nodeSelected: true} : {}),
      ...(this.features.selection.isCaptureSelection ? {capture: true} : {}),
      ...(selectedSection ? {section: {
        path: this.pathToElement(selectedSection),
        type: selectedSection.localName as SelectionPathSection["type"],
      }} : {}),
      ...(gap ? {gap} : {}),
      ...(list.type ? {list} : {}),
      ...(media ? {media} : {}),
      ...(form ? {form} : {}),
      ...(table ? {table} : {}),
      ...(graphic ? {graphic} : {}),
    }
    this.postBridgeEvent(selectionChangeEvent, detail)
  }

  /** Sends mark availability and active marks as a DOM-derived bridge event. */
  postMarkState() {
    if(this.features.selection.selectedSectionElement) {
      this.postBridgeEvent(markStateChangeEvent, {canMark: false, marks: [], styles: {}, attributes: {}})
      return
    }
    this.postBridgeEvent(markStateChangeEvent, {
      ...this.features.mark.getState(),
      styles: this.features.mark.getStyleState(),
      attributes: this.features.mark.getAttributeState(),
    })
  }

  /** Sends in-document comment availability and active comment state. */
  postCommentState() {
    this.postBridgeEvent(commentStateChangeEvent, this.features.comment.getState())
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
    adoptStylesheet(shadowRoot, appendixStylesheet)
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

  private cleanDocumentClone() {
    const root = document.cloneNode(true) as Document
    this.clearEditingArtifacts(root)
    return root
  }

  toHTML(innerBody=false) {
    const root = this.cleanDocumentClone()
    if(innerBody) return root.body.innerHTML
    return `${serializeDoctype(root.doctype)}${root.documentElement.outerHTML}`
  }

  /** Serializes the authored document. Offline mode embeds fetchable media and
   * external scripts while keeping their authored URLs as restoration metadata. */
  async serializeHTML(offline=false) {
    const root = this.cleanDocumentClone()
    if(offline) await this.inlineExternalResources(root)
    return `${serializeDoctype(root.doctype)}${root.documentElement.outerHTML}`
  }

  private async inlineExternalResources(root: Document) {
    const jobs: Promise<void>[] = []
    const resources: Array<[string, string]> = [
      ["img[src]", "src"],
      ["audio[src]", "src"],
      ["video[src]", "src"],
      ["source[src]", "src"],
      ["track[src]", "src"],
      ["iframe[src]", "src"],
      ["input[type='image'][src]", "src"],
      ["video[poster]", "poster"],
      ["object[data]", "data"],
    ]

    for(const [selector, attribute] of resources) {
      root.querySelectorAll<HTMLElement>(selector).forEach(element => {
        jobs.push(this.inlineResourceAttribute(element, attribute))
      })
    }
    root.querySelectorAll<HTMLElement>("img[srcset], source[srcset]").forEach(element => {
      jobs.push(this.inlineSrcset(element))
    })
    root.querySelectorAll<HTMLScriptElement>("script[src]").forEach(script => {
      jobs.push(this.inlineScript(script))
    })
    await Promise.all(jobs)
  }

  private resolvedResourceURL(value: string) {
    try {
      return new URL(value, document.baseURI).href
    }
    catch {
      return value
    }
  }

  private async fetchResource(value: string) {
    const response = await fetch(this.resolvedResourceURL(value))
    if(!response.ok && response.status !== 0) {
      throw new Error(`Could not fetch ${value}: ${response.status} ${response.statusText}`)
    }
    return response
  }

  private async blobDataURL(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ""
    const chunkSize = 0x8000
    for(let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`
  }

  private async inlineResourceAttribute(element: HTMLElement, attribute: string) {
    const original = element.getAttribute(attribute)
    if(!original || original.startsWith("data:")) return
    try {
      const response = await this.fetchResource(original)
      element.setAttribute(originalURLAttribute(attribute), original)
      element.setAttribute(attribute, await this.blobDataURL(await response.blob()))
    }
    catch {
      // Cross-origin resources without CORS permission remain external.
    }
  }

  private async inlineSrcset(element: HTMLElement) {
    const original = element.getAttribute("srcset")
    if(!original || original.trim().startsWith("data:")) return
    try {
      const candidates = original.split(",").map(candidate => candidate.trim()).filter(Boolean)
      const inlined = await Promise.all(candidates.map(async candidate => {
        const match = candidate.match(/^(\S+)(\s+.+)?$/)
        if(!match || match[1].startsWith("data:")) return candidate
        const response = await this.fetchResource(match[1])
        return `${await this.blobDataURL(await response.blob())}${match[2] ?? ""}`
      }))
      element.setAttribute(originalURLAttribute("srcset"), original)
      element.setAttribute("srcset", inlined.join(", "))
    }
    catch {
      // Keep the complete authored srcset if any candidate cannot be fetched.
    }
  }

  private async inlineScript(script: HTMLScriptElement) {
    const original = script.getAttribute("src")
    if(!original || original.startsWith("data:")) return
    try {
      const response = await this.fetchResource(original)
      const source = await response.text()
      script.setAttribute(originalURLAttribute("src"), original)
      script.removeAttribute("src")
      script.textContent = source
    }
    catch {
      // Cross-origin scripts without CORS permission remain external.
    }
  }

  /** Produces the two clipboard flavors from one cleaned selection clone so
   * native and programmatic copy cannot diverge or leak editing markers. */
  serializeClipboardFragment(fragment: DocumentFragment) {
    this.clearEditingArtifacts(fragment)
    const text = plainTextFromDOM(fragment, element => this.schema.isBlock(element))
    const container = document.createElement("div")
    container.append(fragment)
    const html = container.innerHTML
    return {html, text}
  }

  #onCopy = (ev: ClipboardEvent) => {
    if(isWidgetShadowInteraction(ev) || isFormControlInteraction(ev) || !ev.clipboardData || $.isEmpty) return
    ev.preventDefault()
    const {html, text} = this.serializeClipboardFragment($.copy())
    ev.clipboardData.setData("text/html", html)
    ev.clipboardData.setData("text/plain", text)
  }
  
  clearEditingArtifacts(node: Document | DocumentFragment = document) {
    const documentNode = node.nodeType === Node.DOCUMENT_NODE? node as Document: null
    if(documentNode) {
      documentNode.body.removeAttribute("contenteditable")
      documentNode.body.removeAttribute("spellcheck")
      documentNode.querySelectorAll("[data-webwriter-editor-only]").forEach(element => element.remove())
    }
    const editingElements = Array.from(node.querySelectorAll<HTMLElement>("[class]"))
      .filter(element => Array.from(element.classList).some(name => name.startsWith("◆")))
    editingElements.forEach(el => {
      if(Array.from(el.classList).some(name => name === "◆editor-only")) {
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
