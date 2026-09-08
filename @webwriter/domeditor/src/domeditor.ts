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
import {isFormElementType} from "./form"
import { DialogFeature } from "./features/dialog"
import { TemplateFeature } from "./features/template"
import { Schema } from "./schema"
import { $, adoptStylesheet, createStylesheet, focusedWidgetHost, getContainer, isAppendixInteraction, isElement, isFormControlInteraction, isWidgetShadowInteraction, plainTextFromDOM } from "./utility"
import {canonicalMarkName, isMarkElement, normalizeMarkElements} from "./marks"
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
import {getDocumentRoot} from "./document-template"
import {stripActiveContent} from "./active-content"
import {elementAttributeState} from "./element-attributes"
import {parse as parseModule} from "es-module-lexer/js"
import {tokenize as tokenizeCSS, TokenType} from "@csstools/css-tokenizer"

const editorStylesheet = createStylesheet(editorStyleString)
const appendixStylesheet = createStylesheet(`
  :host(.◆editing-locked) > :not(slot):not(.◆ai-review-toolbar) {
    display: none !important;
  }

  .◆ai-review-toolbar {
    box-sizing: border-box;
    display: flex;
    position: fixed;
    z-index: 2147483647;
    pointer-events: auto;
    user-select: auto;
    -webkit-user-select: auto;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    max-width: 46rem;
    margin-inline: auto;
    padding: 0.75rem;
    border: 1px solid #c4b5fd;
    border-radius: 0.75rem;
    color: #2e1065;
    background: rgb(250 245 255 / 97%);
    box-shadow: 0 1rem 2.5rem rgb(46 16 101 / 24%);
    font: 14px/1.35 system-ui, sans-serif;
  }

  .◆ai-review-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .◆ai-review-copy span {
    overflow: hidden;
    color: #6b21a8;
    font-size: 0.82em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .◆ai-review-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.5rem;
  }

  .◆ai-review-actions button {
    min-height: 2.25rem;
    padding: 0.35rem 0.8rem;
    border: 1px solid #7c3aed;
    border-radius: 0.45rem;
    color: #5b21b6;
    background: #fff;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .◆ai-review-actions button[data-action="accept"] {
    color: #fff;
    background: #7c3aed;
  }

  .◆ai-review-actions button:focus-visible {
    outline: 3px solid #a78bfa;
    outline-offset: 2px;
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

type HostDocumentState = {
  designMode: string
  inert: boolean
}

type DocumentEditorSession = {
  state: HostDocumentState
  hadEditorStylesheet: boolean
  initialAppendix: ShadowRoot | null
  hadAppendixStylesheet: boolean
  hadDefaultSlot: boolean
  createdDefaultSlot: HTMLSlotElement | null
}

const documentEditorSessions = new WeakMap<Document, DocumentEditorSession>()

const isWidgetElement = (element: Element) => element.namespaceURI === "http://www.w3.org/1999/xhtml"
  && (element.localName.includes("-") || element.hasAttribute("is"))

type FeatureActions<F extends keyof DOMEditor["features"]> = NonNullable<DOMEditor["features"][F]["actions"]>
type FeatureAction<F extends keyof DOMEditor["features"]> = {
  [K in keyof FeatureActions<F>]: FeatureActions<F>[K] extends (...args: infer Parameters) => unknown
    ? Parameters[0]
    : never
}[keyof FeatureActions<F>]
export type EditingAction = {
  [F in keyof DOMEditor["features"]]: FeatureAction<F>
}[keyof DOMEditor["features"]]

/** Orchestrates the one live editor for the current browser document. Feature
 * listeners, authored selection, and the BODY shadow appendix are document-
 * global, so a second active instance is rejected until the first is destroyed. */
export class DOMEditor {
  
  doc: SharedDOMDoc
  parser = new DOMParser()
  schema = new Schema()
  readonly #originalDocumentState = {
    designMode: document.designMode,
    inert: document.body.inert,
  }
  readonly #initialAppendix = document.body.shadowRoot
  readonly #hadEditorStylesheet = document.adoptedStyleSheets.includes(editorStylesheet)
  readonly #hadAppendixStylesheet = this.#initialAppendix?.adoptedStyleSheets.includes(appendixStylesheet) ?? false
  readonly #hadDefaultSlot = Boolean(this.#initialAppendix && Array.from(this.#initialAppendix.children).some(element => (
    element.localName === "slot" && !element.hasAttribute("name")
  )))
  readonly #appendixElements = new Set<WeakRef<Element>>()
  #createdDefaultSlot: HTMLSlotElement | null = null
  #documentSession: DocumentEditorSession | null = null
  #bodySchemaObserver: MutationObserver | null = null
  #destroyed = false
  
  features = {
    "dependency": new DependencyFeature(this),
    "state": new StateFeature(this),
    "head": new HeadFeature(this),
    "template": new TemplateFeature(this),
    "insertion": new InsertionFeature(this),
    "history": new HistoryFeature(this),
    "list": new ListFeature(this),
    "table": new TableFeature(this),
    "manipulation": new ManipulationFeature(this),
    "transformation": new TransformationFeature(this),
    "graphic": new GraphicFeature(this),
    "dialog": new DialogFeature(this),
    "selection": new SelectionFeature(this),
    "placeholder": new PlaceholderFeature(this),
    "mark": new MarkFeature(this),
    "comment": new CommentFeature(this),
    "collaboration": new CollaborationFeature(this),
    "media": new MediaFeature(this),
  } as const

  ignoreAttrs: string[] = []
  ignoreClasses = ["◆"]

  readonly #editingLocks = new Set<unknown>()
  readonly #blockedEditingEventTypes = [
    "beforeinput", "keydown", "paste", "cut", "drop", "compositionstart",
  ] as const
  #editingState: {
    designMode: string
    bodyInert: boolean
    slotInert: boolean
  } | null = null
  readonly #bridgeNonce: string
  readonly #bridgeOrigin: string

  readonly #blockEditingInteraction = (event: Event) => {
    const path = event.composedPath()
    if(!this.#editingLocks.size || !path.includes(document.body) || isAppendixInteraction(event)) return
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
   * in BODY's shadow appendix available. Multiple features may hold locks. */
  lockEditing(owner: unknown) {
    if(this.#editingLocks.has(owner)) return
    if(this.#editingLocks.size === 0) {
      const slot = this.defaultAppendixSlot
      this.#editingState = {
        designMode: document.designMode,
        bodyInert: document.body.inert,
        slotInert: slot.inert,
      }
      this.#blockedEditingEventTypes.forEach(type => {
        document.addEventListener(type, this.#blockEditingInteraction, true)
      })
      document.designMode = "off"
      document.body.inert = false
      slot.inert = true
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
    this.defaultAppendixSlot.inert = state.slotInert
    document.body.inert = state.bodyInert
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
      isElement(element) && elements.add(element)
    }
    elements.forEach(element => {
      element.normalize()
      normalizeMarkElements(element)
      element.normalize()
    })
    if(this.#ensureDocumentContent()) return
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

  private cleanupUnregisteredAppendix() {
    this.#appendixElements.forEach(reference => reference.deref()?.remove())
    this.#appendixElements.clear()
    const appendix = document.body.shadowRoot
    if(appendix && !this.#hadAppendixStylesheet) {
      appendix.adoptedStyleSheets = appendix.adoptedStyleSheets.filter(sheet => sheet !== appendixStylesheet)
    }
    if(this.#initialAppendix && !this.#hadDefaultSlot && this.#createdDefaultSlot?.parentNode === this.#initialAppendix) {
      this.#createdDefaultSlot.remove()
    }
  }

  private registerDocumentSession() {
    if(documentEditorSessions.has(document)) {
      throw new Error("Only one DOMEditor can be active in a document")
    }
    const session = {
      state: {...this.#originalDocumentState},
      hadEditorStylesheet: this.#hadEditorStylesheet,
      initialAppendix: this.#initialAppendix,
      hadAppendixStylesheet: this.#hadAppendixStylesheet,
      hadDefaultSlot: this.#hadDefaultSlot,
      createdDefaultSlot: this.#createdDefaultSlot,
    }
    documentEditorSessions.set(document, session)
    this.#documentSession = session
  }

  private releaseDocumentSession() {
    const session = this.#documentSession
    this.#documentSession = null
    if(!session || documentEditorSessions.get(document) !== session) return
    documentEditorSessions.delete(document)
    document.body.inert = session.state.inert
    document.designMode = session.state.designMode
    if(!session.hadEditorStylesheet) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== editorStylesheet)
    }
    const appendix = document.body.shadowRoot
    if(appendix && !session.hadAppendixStylesheet) {
      appendix.adoptedStyleSheets = appendix.adoptedStyleSheets.filter(sheet => sheet !== appendixStylesheet)
    }
    // A ShadowRoot cannot be detached. Keep its default slot when the editor
    // created the root, otherwise authored light-DOM children would disappear.
    // For a pre-existing appendix, remove only the slot this editor added.
    if(session.initialAppendix && !session.hadDefaultSlot
      && session.createdDefaultSlot?.parentNode === session.initialAppendix) {
      session.createdDefaultSlot.remove()
    }
  }

  constructor(options: DOMEditorOptions = {}) {
    this.#bridgeNonce = options.bridgeNonce ?? globalThis.crypto?.randomUUID?.() ?? `bridge-${Date.now()}-${Math.random()}`
    this.#bridgeOrigin = options.bridgeOrigin && options.bridgeOrigin !== "null"
      ? options.bridgeOrigin
      : window.location.origin
    let syncUrl: URL | undefined
    if(options.syncUrl) {
      try {
        syncUrl = new URL(options.syncUrl)
        if(syncUrl.protocol !== "ws:" && syncUrl.protocol !== "wss:") {
          throw new TypeError("The collaboration URL must use ws: or wss:")
        }
      }
      catch(error) {
        this.cleanupUnregisteredAppendix()
        throw error
      }
    }
    const initialState = options.initialState
    const initialYDoc = initialState?.update?.length ? new Y.Doc() : undefined
    if(initialYDoc) {
      try {
        Y.applyUpdate(initialYDoc, Uint8Array.from(initialState!.update))
      }
      catch(error) {
        this.cleanupUnregisteredAppendix()
        throw new TypeError("The initial editor state contains an invalid Yjs update", {cause: error})
      }
    }
    try {
      this.registerDocumentSession()
    }
    catch(error) {
      initialYDoc?.destroy()
      this.cleanupUnregisteredAppendix()
      throw error
    }
    try {
      adoptStylesheet(document, editorStylesheet)
      document.designMode = "on"
      const DocumentMutationObserver = document.defaultView?.MutationObserver ?? MutationObserver
      this.#bodySchemaObserver = new DocumentMutationObserver(this.#handleBodySchemaChanges)
      this.#bodySchemaObserver.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable", "is"],
      })
      this.#enableWidgetEditing(document.body)
      if(!initialYDoc) this.#ensureDocumentContent()
      if(syncUrl) {
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
      this.#ensureDocumentContent()
      this.#enableWidgetEditing(document.body)
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
    catch(error) {
      try {
        this.destroy()
      }
      catch {
        // Preserve the initialization failure after best-effort teardown.
      }
      throw error
    }
  }

  #handleInput = (ev: Event) => {
    if(isAppendixInteraction(ev) || isWidgetShadowInteraction(ev) || isFormControlInteraction(ev)) return
    this.normalizeSurroundingElements(ev.target instanceof Node ? ev.target : undefined)
  }

  #handleBodySchemaChanges = (mutations: MutationRecord[]) => {
    for(const mutation of mutations) {
      if(!document.body.contains(mutation.target)) continue
      if(mutation.type === "attributes") this.#enableWidgetEditing(mutation.target, false)
      else mutation.addedNodes.forEach(node => {
        if(document.body.contains(node)) this.#enableWidgetEditing(node)
      })
    }
    this.#ensureDocumentContent()
  }

  /** Covers prepared fragments and arbitrary live DOM insertions without
   * entering widget shadow roots or changing their ordinary light-DOM content. */
  #enableWidgetEditing(node: Node, descendants=true) {
    if(node instanceof Element && isWidgetElement(node) && node.getAttribute("contenteditable") !== "true") {
      node.setAttribute("contenteditable", "true")
    }
    if(descendants) node.childNodes.forEach(child => this.#enableWidgetEditing(child))
  }

  /** Restores the schema's required default flow child after the body's last
   * authored node is removed. A selection left at BODY or in removed content
   * becomes a normal collapsed selection in the new paragraph. */
  #ensureDocumentContent() {
    if(document.body.childNodes.length || this.schema.isContentValid(document.body)) return null
    const selection = document.getSelection()
    const moveSelection = !selection?.anchorNode || !selection.focusNode
      || selection.anchorNode === document.body || selection.focusNode === document.body
      || !selection.anchorNode.isConnected || !selection.focusNode.isConnected
    const content = this.schema.fillByRule(document.body)
    document.body.replaceChildren(...content)
    const defaultBlock = document.body.firstElementChild
    if(moveSelection && defaultBlock) $.move(defaultBlock)
    return defaultBlock
  }

  destroy() {
    if(this.#destroyed) return
    this.#destroyed = true
    let teardownError: unknown
    const attempt = (callback: () => void) => {
      try {
        callback()
      }
      catch(error) {
        teardownError ??= error
      }
    }
    for(const owner of Array.from(this.#editingLocks)) attempt(() => this.unlockEditing(owner))
    Object.values(this.features).forEach(feature => attempt(() => feature.disable()))
    document.removeEventListener("input", this.#handleInput)
    document.removeEventListener("selectionchange", this.handleSelectionChange)
    document.removeEventListener("copy", this.#onCopy)
    window.removeEventListener("message", this.handleMessage)
    this.#bodySchemaObserver?.disconnect()
    this.#bodySchemaObserver = null
    if(this.doc) attempt(() => this.doc.destroy())
    this.#appendixElements.forEach(reference => reference.deref()?.remove())
    this.#appendixElements.clear()
    this.releaseDocumentSession()
    if(teardownError) throw teardownError
  }

  private handleSelectionChange = (event: Event) => {
    if(isAppendixInteraction(event) || isWidgetShadowInteraction(event) || isFormControlInteraction(event)
      || this.features.media.isPlaceholderInteraction) return
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
    if(!this.features.state.allowsActionDuringHTMLSelectionEdit(ev.data.type)) {
      const error = new Error("Apply or discard the pending HTML change before editing the document")
      if(requestId) {
        this.postExecutionEvent(executeFailureEvent, {
          requestId,
          error: this.serializeError(error),
        })
        return
      }
      throw error
    }
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
        // Reading the HTML selection does not change it. Reposting the same
        // selection here makes the host start another HTML-source read before
        // this response arrives, so every valid response becomes stale.
        if(ev.data.type !== "beginHTMLSelectionEdit") this.postSelectionPath()
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
    this.postHostMessage({type: event.type, detail: event.detail})
  }

  /** Sends an authenticated message to the configured host window. */
  postHostMessage(message: object) {
    const target = window.parent === window? window: window.parent
    target.postMessage({...message, bridgeNonce: this.#bridgeNonce}, this.#bridgeOrigin)
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
    const root = getDocumentRoot()
    const target = this.features.manipulation.styleTarget
    const selectedSection = this.features.selection.selectedSectionElement
    if(target !== document.body && target !== root && target !== selectedSection) return target
    const selectedElement = $.selectedElement
    if(selectedElement && selectedElement !== selectedSection) return selectedElement
    const anchor = document.getSelection()?.anchorNode
    const rawContainer = anchor instanceof Element ? anchor : anchor?.parentElement
    return rawContainer && root.contains(rawContainer) ? rawContainer : root
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

  /** Returns an exact, explicitly selected authored element. Text selections
   * deliberately have no generic attribute target. */
  private selectedAttributeElement() {
    const selectedSection = this.features.selection.selectedSectionElement
    if(selectedSection) return selectedSection
    if(this.features.table.hasCellSelection) return this.features.table.selectionFocusCell
    const selected = this.features.selection.captureSelectedElement ?? ($.isElementSelection ? $.selectedElement : null)
    if(!selected) return null
    const root = getDocumentRoot()
    if(selected === document.body || selected === root && root === document.body) return document.documentElement
    return selected === root || root.contains(selected) ? selected : null
  }

  /** Sends the current element path to the host application through the bridge. */
  postSelectionPath(inserted = false) {
    const body = document.body
    const root = getDocumentRoot(body)
    const focusedWidget = focusedWidgetHost()
    const selected = this.selectedElementForPath()
    const element = selected === body
      ? root
      : selected && (selected === root || root.contains(selected)) ? selected : root
    const elements: Element[] = []
    let current: Element | null = element
    while(current && current !== root) {
      elements.unshift(current)
      current = current.parentElement
    }
    elements.unshift(root)

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
      if(currentElement !== root && isSectionElement(currentElement)) {
        pendingSections.push(sectionPathItem(currentElement))
        return
      }
      if(currentElement !== root && (isMarkElement(currentElement) || isLineBreakElement(currentElement) || isTableInternal)) return
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
    const headingGroup = this.features.manipulation.getHeadingGroupState()
    const figure = this.features.manipulation.getFigureState()
    const media = this.features.media.getState()
    const dialog = this.features.dialog.getState()
    const table = this.features.table.getState()
    const graphic = this.features.graphic.getState()
    const selectedSection = this.features.selection.selectedSectionElement
    const attributeElement = this.selectedAttributeElement()
    const elementState = attributeElement
      ? elementAttributeState(
        attributeElement,
        attributeElement === document.documentElement ? null : this.pathToElement(attributeElement),
      )
      : null
    const canSection = this.features.manipulation.canSectionSelection()
    const detail: SelectionChangeDetail = {
      path,
      ...(canSection && path.at(-1)?.path.join(".") === this.pathToElement(root).join(".") ? {canSection: true} : {}),
      ...(inserted ? {inserted: true} : {}),
      ...($.isElementSelection && !selectedSection ? {nodeSelected: true} : {}),
      ...(this.features.selection.isCaptureSelection ? {capture: true} : {}),
      ...(selectedSection ? {section: {
        path: this.pathToElement(selectedSection),
        type: selectedSection.localName as SelectionPathSection["type"],
      }} : {}),
      ...(gap ? {gap} : {}),
      ...(list.type ? {list} : {}),
      ...(headingGroup ? {headingGroup} : {}),
      ...(figure ? {figure} : {}),
      ...(media ? {media} : {}),
      ...(dialog ? {dialog} : {}),
      ...(table ? {table} : {}),
      ...(graphic ? {graphic} : {}),
      ...(elementState ? {element: elementState} : {}),
    }
    this.postBridgeEvent(selectionChangeEvent, detail)
  }

  /** Sends mark availability and active marks as a DOM-derived bridge event. */
  postMarkState() {
    if(this.features.selection.selectedSectionElement) {
      this.postBridgeEvent(markStateChangeEvent, {
        canMark: false,
        marks: [],
        styles: {},
        attributes: {},
        ruby: {active: false, canCreate: false, base: "", annotations: [], fallbacks: []},
      })
      return
    }
    this.postBridgeEvent(markStateChangeEvent, {
      ...this.features.mark.getState(),
      styles: this.features.mark.getStyleState(),
      attributes: this.features.mark.getAttributeState(),
      ruby: this.features.mark.getRubyState(),
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
    this.postHostMessage(action)
  }

  get appendix() {
    const shadowRoot = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    if(!this.#destroyed) {
      adoptStylesheet(shadowRoot, appendixStylesheet)
      this.ensureDefaultAppendixSlot(shadowRoot)
    }
    return shadowRoot
  }

  private ensureDefaultAppendixSlot(shadowRoot: ShadowRoot) {
    const slot = Array.from(shadowRoot.children).find(element => (
      element.localName === "slot" && !element.hasAttribute("name")
    )) as HTMLSlotElement | undefined
    if(slot) return slot
    const created = document.createElement("slot")
    this.#createdDefaultSlot = created
    if(this.#documentSession && !this.#documentSession.createdDefaultSlot) {
      this.#documentSession.createdDefaultSlot = created
    }
    shadowRoot.append(created)
    return created
  }

  private get defaultAppendixSlot() {
    return this.ensureDefaultAppendixSlot(this.appendix)
  }

  addAppendix(el: Element) {
    if(this.#destroyed) return
    this.#appendixElements.forEach(reference => {
      const element = reference.deref()
      if(!element || element === el) this.#appendixElements.delete(reference)
    })
    this.#appendixElements.add(new WeakRef(el))
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
    if(!innerBody) this.features.dependency.appendSerializedAssets(root)
    if(innerBody) return root.body.innerHTML
    return `${serializeDoctype(root.doctype)}${root.documentElement.outerHTML}`
  }

  /** Serializes the authored document. Offline mode embeds declared resources
   * and fails explicitly when dependencies cannot be made self-contained. */
  async serializeHTML(offline=false) {
    const root = this.cleanDocumentClone()
    this.features.dependency.appendSerializedAssets(root)
    if(offline) await this.inlineExternalResources(root)
    return `${serializeDoctype(root.doctype)}${root.documentElement.outerHTML}`
  }

  private async inlineExternalResources(root: Document | DocumentFragment) {
    const jobs: Promise<void>[] = []
    const resources: Array<[string, string]> = [
      ["img[src], audio[src], video[src], source[src], track[src], input[type='image'][src]", "src"],
      ["video[poster]", "poster"],
      ["object[data]", "data"],
    ]
    // A downloaded HTML frame can still fetch its own scripts and resources.
    // Do not present that document as a self-contained offline export.
    if(root.querySelector("iframe[src], iframe[srcdoc]")) {
      throw new Error("Offline export cannot embed an iframe's resource dependencies. Use HTML format for this document.")
    }
    for(const [selector, attribute] of resources) {
      root.querySelectorAll<HTMLElement>(selector).forEach(element => {
        jobs.push(this.inlineResourceAttribute(element, attribute))
      })
    }
    root.querySelectorAll<HTMLElement>("img[srcset], source[srcset]").forEach(element => {
      jobs.push(this.inlineSrcset(element))
    })
    root.querySelectorAll<HTMLScriptElement>("script").forEach(script => {
      jobs.push(this.inlineScript(script))
    })
    root.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]").forEach(link => {
      jobs.push(this.inlineStylesheet(link))
    })
    root.querySelectorAll<HTMLElement>("[style]").forEach(element => {
      jobs.push(this.inlineStyleAttribute(element))
    })
    root.querySelectorAll<HTMLStyleElement>("style").forEach(style => {
      jobs.push(this.inlineStyleElement(style))
    })
    root.querySelectorAll<HTMLTemplateElement>("template").forEach(template => {
      jobs.push(this.inlineExternalResources(template.content))
    })
    await Promise.all(jobs)
  }

  private resolvedResourceURL(value: string, base = document.baseURI) {
    return new URL(value, base).href
  }

  private async fetchResource(value: string, base = document.baseURI) {
    const response = await fetch(this.resolvedResourceURL(value, base))
    if(!response.ok) throw new Error(`Could not fetch ${value}: ${response.status} ${response.statusText}`)
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

  private async resourceDataURL(value: string, base = document.baseURI) {
    if(value.startsWith("#") || /^data:/i.test(value)) return value
    const url = new URL(value, base)
    const fragment = url.hash
    url.hash = ""
    return await this.blobDataURL(await (await this.fetchResource(url.href)).blob()) + fragment
  }

  private async inlineResourceAttribute(element: HTMLElement, attribute: string) {
    const original = element.getAttribute(attribute)
    if(!original || /^data:/i.test(original)) return
    try {
      const data = await this.resourceDataURL(original)
      element.setAttribute(originalURLAttribute(attribute), original)
      element.setAttribute(attribute, data)
    }
    catch(error) {
      throw new Error(`Could not inline ${original} for offline export: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async inlineSrcset(element: HTMLElement) {
    const original = element.getAttribute("srcset")
    if(!original) return
    // URLs may contain commas (notably data URLs). A candidate URL ends at
    // whitespace; only trailing commas or commas after descriptors separate it.
    const inlined: string[] = []
    let offset = 0
    while(offset < original.length) {
      while(/[\t\n\f\r ,]/.test(original[offset] ?? "") && offset < original.length) offset++
      const start = offset
      while(offset < original.length && !/[\t\n\f\r ]/.test(original[offset])) offset++
      let url = original.slice(start, offset)
      if(!url) break
      let descriptors = ""
      if(url.endsWith(",")) url = url.replace(/,+$/, "")
      else {
        const descriptorStart = offset
        let parentheses = 0
        while(offset < original.length) {
          const character = original[offset]
          if(character === "," && !parentheses) break
          if(character === "(") parentheses++
          if(character === ")") parentheses = Math.max(0, parentheses - 1)
          offset++
        }
        descriptors = original.slice(descriptorStart, offset).trim()
        offset++
      }
      inlined.push(`${await this.resourceDataURL(url)}${descriptors ? ` ${descriptors}` : ""}`)
    }
    element.setAttribute(originalURLAttribute("srcset"), original)
    element.setAttribute("srcset", inlined.join(", "))
  }

  private async inlineScript(script: HTMLScriptElement) {
    const original = script.getAttribute("src")
    try {
      const source = original ? await (await this.fetchResource(original)).text() : script.textContent ?? ""
      const type = script.type.trim().toLowerCase()
      if(!type || type === "module" || /^(?:text|application)\/(?:java|ecma)script$/.test(type)) {
        const [imports] = parseModule(source)
        if(imports.length) throw new Error("Offline export cannot bundle this module dependency graph. Use HTML format for this document.")
      }
      if(!original) return
      script.setAttribute(originalURLAttribute("src"), original)
      // Keep external script semantics and avoid HTML raw-text terminators in
      // JavaScript strings being interpreted as markup on reopening.
      script.src = await this.blobDataURL(new Blob([source], {type: "text/javascript"}))
      script.textContent = ""
    }
    catch(error) {
      throw new Error(`Could not inline ${original || "inline script"} for offline export: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async inlineStylesheet(link: HTMLLinkElement) {
    const original = link.getAttribute("href")
    if(!original) return
    try {
      const response = await this.fetchResource(original)
      const base = response.url || this.resolvedResourceURL(original)
      const css = await this.inlineCSS(await response.text(), base, new Set([base]))
      link.setAttribute(originalURLAttribute("href"), original)
      link.href = await this.blobDataURL(new Blob([css], {type: "text/css"}))
      // The embedded stylesheet has different bytes after its URLs are changed.
      if(link.hasAttribute("integrity")) {
        link.setAttribute(originalURLAttribute("integrity"), link.getAttribute("integrity")!)
        link.removeAttribute("integrity")
      }
    }
    catch(error) {
      throw new Error(`Could not inline stylesheet ${original} for offline export: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async inlineStyleAttribute(element: HTMLElement) {
    const original = element.getAttribute("style")
    if(!original) return
    const rewritten = await this.inlineCSS(original, document.baseURI)
    if(rewritten === original) return
    element.setAttribute(originalURLAttribute("style"), original)
    element.setAttribute("style", rewritten)
  }

  private async inlineStyleElement(style: HTMLStyleElement) {
    const original = style.textContent ?? ""
    const rewritten = await this.inlineCSS(original, document.baseURI)
    if(rewritten === original) return
    style.setAttribute(originalURLAttribute("text"), original)
    style.textContent = rewritten
  }

  private async inlineCSS(css: string, base: string, ancestors = new Set<string>()): Promise<string> {
    // Tokenization handles escapes, comments, quoted parentheses and modern
    // @import qualifiers without normalizing any unrelated authored CSS.
    const tokens = tokenizeCSS({css}).filter(token => ![TokenType.Whitespace, TokenType.Comment, TokenType.EOF].includes(token[0]))
    const replacements: Array<Promise<{start: number, end: number, value: string}>> = []
    const functions: string[] = []
    for(let index = 0; index < tokens.length; index++) {
      let token = tokens[index]
      let end = token[3] + 1
      const previous = tokens[index - 1]
      const isImport = previous?.[0] === TokenType.AtKeyword && previous[4].value.toLowerCase() === "import"
      let value: string | undefined
      if(token[0] === TokenType.URL) value = token[4].value
      else if(token[0] === TokenType.Function && token[4].value.toLowerCase() === "url") {
        const argument = tokens[index + 1]
        const close = tokens[index + 2]
        if(argument?.[0] === TokenType.String && close?.[0] === TokenType.CloseParen) {
          value = argument[4].value
          end = close[3] + 1
          index += 2
        }
      }
      else if(token[0] === TokenType.String && (isImport || /^(?:-webkit-)?image-set$/.test(functions.at(-1) ?? ""))) {
        value = token[4].value
      }
      if(value !== undefined) {
        const start = token[2]
        const url = value
        replacements.push((async () => {
          if(!isImport) return {start, end, value: `url("${await this.resourceDataURL(url, base)}")`}
          const href = this.resolvedResourceURL(url, base)
          let imported = ""
          if(!ancestors.has(href)) {
            const response = await this.fetchResource(href)
            const redirected = response.url || href
            if(!ancestors.has(redirected)) {
              imported = await this.inlineCSS(await response.text(), redirected, new Set([...ancestors, href, redirected]))
            }
          }
          const data = await this.blobDataURL(new Blob([imported], {type: "text/css"}))
          return {start, end, value: `url("${data}")`}
        })())
      }
      else if(token[0] === TokenType.Function) functions.push(token[4].value.toLowerCase())
      else if(token[0] === TokenType.OpenParen) functions.push("")
      else if(token[0] === TokenType.CloseParen) functions.pop()
    }
    const resolved = await Promise.all(replacements)
    let result = css
    resolved.reverse().forEach(({start, end, value}) => { result = result.slice(0, start) + value + result.slice(end) })
    return result
  }

  /** Produces the two clipboard flavors from one cleaned selection clone so
   * native and programmatic copy cannot diverge or leak editing markers. */
  serializeClipboardFragment(fragment: DocumentFragment, innerText?: string) {
    this.clearEditingArtifacts(fragment)
    const text = innerText ?? plainTextFromDOM(fragment, element => this.schema.isBlock(element))
    const container = document.createElement("div")
    container.append(fragment)
    const html = container.innerHTML
    return {html, text}
  }

  #onCopy = (ev: ClipboardEvent) => {
    if(isAppendixInteraction(ev) || isWidgetShadowInteraction(ev) || isFormControlInteraction(ev) || !ev.clipboardData || $.isEmpty) return
    ev.preventDefault()
    const {html, text} = this.serializeClipboardFragment($.copy(), $.selectedElement instanceof HTMLElement ? $.selectedElement.innerText : undefined)
    ev.clipboardData.setData("text/html", html)
    ev.clipboardData.setData("text/plain", text)
  }
  
  clearEditingArtifacts(node: Document | DocumentFragment = document) {
    const clean = (root: ParentNode) => Array.from(root.childNodes).forEach(child => {
      if(!(child instanceof Element)) return
      if(child.hasAttribute("data-webwriter-editor-only") || child.classList.contains("◆editor-only")) {
        child.remove()
        return
      }
      this.ignoreAttrs.forEach(attribute => child.removeAttribute(attribute))
      if(isWidgetElement(child)) child.removeAttribute("contenteditable")
      const markers = Array.from(child.classList).filter(name => name.startsWith("◆"))
      if(markers.length) child.classList.remove(...markers)
      if(!child.classList.length) child.removeAttribute("class")
      if(child instanceof HTMLTemplateElement) clean(child.content)
      clean(child)
    })
    clean(node)
  }

  /** Sanitizes detached authored HTML and repairs it with the active schema
   * before any part of it enters the live document. Transfers additionally
   * strip styling and section wrappers and canonize aliases; explicit HTML
   * edits retain authored structure and styles. */
  prepareHTMLFragment(fragment: DocumentFragment, transfer=false) {
    this.clearEditingArtifacts(fragment)
    const removedUnsafeItems = stripActiveContent(fragment, {
      allowIframes: true,
      ...(transfer ? {removeAttribute: (attribute: Attr) => ["style", "class"].includes(attribute.name.toLowerCase())} : {}),
    })
    if(transfer) this.canonizeTransferredContent(fragment)
    // Keep template contents inert until insertion, after sanitization and
    // structural repair have finished.
    const stagingBody = fragment.ownerDocument.createElement("body")
    stagingBody.append(fragment)
    this.schema.checkAndCorrect(stagingBody, true)
    const prepared = stagingBody.ownerDocument.createDocumentFragment()
    prepared.append(...Array.from(stagingBody.childNodes))
    this.#enableWidgetEditing(prepared)
    return {fragment: prepared, removedUnsafeItems}
  }

  /** Canonical aliases apply only to incoming content, never to live DOM.
   * Widget contents remain atomic; sanitization still visits their children. */
  private canonizeTransferredContent(root: ParentNode) {
    Array.from(root.children).forEach(element => {
      if(element.namespaceURI !== "http://www.w3.org/1999/xhtml"
        || element.localName.includes("-") || element.hasAttribute("is")) return
      const name = canonicalMarkName(element.localName)
        ?? (element.localName === "strike" ? "s" : element.localName)
      if(name !== element.localName) {
        const replacement = document.createElement(name)
        Array.from(element.attributes).forEach(attribute => replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value))
        replacement.append(...Array.from(element.childNodes))
        element.replaceWith(replacement)
        element = replacement
      }
      if(element.localName === "img" && element.parentElement?.localName !== "picture") {
        const picture = document.createElement("picture")
        element.replaceWith(picture)
        picture.append(element)
      }
      // Read live control properties before changing detached content.
      const value = element.localName === "input"
        ? (element as HTMLInputElement).value
        : element.localName === "textarea" ? (element as HTMLTextAreaElement).value
        : null
      if(element instanceof HTMLTemplateElement) this.canonizeTransferredContent(element.content)
      this.canonizeTransferredContent(element)
      if(isFormElementType(element.localName)) {
        if(value !== null) element.replaceWith(element.ownerDocument.createTextNode(value))
        else {
          // Preserve labels and rich fallback content; value-only controls
          // still contribute their authored value as text.
          if(!element.textContent && element.hasAttribute("value")) {
            element.append(element.ownerDocument.createTextNode(element.getAttribute("value")!))
          }
          element.replaceWith(...Array.from(element.childNodes))
        }
      }
      // Captions lose their figure context when section wrappers are removed.
      // Unwrap them too so schema repair does not recreate a figure around them.
      else if(isSectionElement(element) || element.localName === "figcaption") {
        element.replaceWith(...Array.from(element.childNodes))
      }
    })
  }

  parseHTMLFragment(html: string, transfer=false) {
    const template = document.createElement("template")
    template.innerHTML = html
    return this.prepareHTMLFragment(template.content, transfer)
  }


}
