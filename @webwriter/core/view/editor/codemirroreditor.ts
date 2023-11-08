import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, query, queryAsync } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { EditorSelection, EditorState, Extension, Transaction, TransactionSpec } from "@codemirror/state"
import {EditorView, EditorViewConfig, PluginValue, ViewPlugin} from "@codemirror/view"

type ICodemirrorEditor = EditorView & {
  initialState: EditorState,
  doc: string | Text,
  selection: EditorSelection | {anchor: number, head?: number}
  extensions?: Extension
  root: DocumentOrShadowRoot,
  // dispatchTransactions: (trs: readonly Transaction[], view: EditorView) => void,
  // dispatch: (tr: Transaction, view: EditorView) => void
}

@localized()
@customElement("cm-editor")
export class CodemirrorEditor extends LitElement implements ICodemirrorEditor {

  view: EditorView
  initialState: EditorState
  initialRoot: DocumentOrShadowRoot = this.shadowRoot!
  
  @property({attribute: false})
  dispatchTransactions: (trs: readonly Transaction[], view: EditorView) => void

  @property({attribute: false})
  extensions: Extension = []

  @property({attribute: false})
  get state(): ICodemirrorEditor["state"] {
    return this.view?.state
  }

  set state(state) {
    this.view? this.view.setState(state): this.initialState = state 
    this.requestUpdate("state", this.state)
  }

  setState(state: EditorState) {
    this.state = state
  }

  @property({attribute: false})
  get root(): ICodemirrorEditor["root"] {
    return this.view?.root
  }

  set root(root) {
    this.view? this.view.setRoot(root as Document | ShadowRoot): this.initialRoot = root
    this.requestUpdate("root")
  }

  setRoot(root: DocumentOrShadowRoot) {
    this.root = root
  }

  @property({attribute: false})
  get viewport() {
    return this.view.viewport
  }

  @property({attribute: false})
  get visibleRanges() {
    return this.view.visibleRanges
  }

  @property({attribute: false})
  get inView() {
    return this.view.inView
  }

  @property({attribute: false})
  get composing() {
    return this.view.composing
  }

  @property({attribute: false})
  get compositionStarted() {
    return this.view.compositionStarted
  }

  @property({attribute: false})
  get dom() {
    return this.view.dom
  }

  @property({attribute: false})
  get scrollDOM() {
    return this.view.scrollDOM
  }

  @property({attribute: false})
  get contentDOM() {
    return this.view.contentDOM
  }

  @property({attribute: false})
  get themeClasses() {
    return this.view.themeClasses
  }

  @property({attribute: false})
  get documentTop() {
    return this.view.documentTop
  }

  @property({attribute: false})
  get documentPadding() {
    return this.view.documentPadding
  }

  @property({attribute: false})
  get scaleX() {
    return this.view.scaleX
  }

  @property({attribute: false})
  get scaleY() {
    return this.view.scaleY
  }

  @property({attribute: false})
  get contentHeight() {
    return this.view.contentHeight
  }

  @property({attribute: false})
  get defaultCharacterWidth() {
    return this.view.defaultCharacterWidth
  }

  @property({attribute: false})
  get defaultLineHeight() {
    return this.view.defaultLineHeight
  }

  @property({attribute: false})
  get textDirection() {
    return this.view.textDirection
  }

  @property({attribute: false})
  get lineWrapping() {
    return this.view.lineWrapping
  }

  @property({attribute: false})
  get hasFocus() {
    return this.view.hasFocus
  }

  //@ts-expect-error: How to fix this?
  dispatch = (...args: Parameters<typeof this.view.dispatch>) => {
    return this.view.dispatch(...args)
  }

  updateView = (...args: Parameters<typeof this.view.update>) => {
    return this.view.update(...args)
  }

  requestMeasure = <T>(request?: {read: (view: EditorView) => T, write?: (measure: T, view: EditorView) => void, key?: any}) => {
    return this.view.requestMeasure<T>(request)
  }

  plugin = <T extends PluginValue>(plugin: ViewPlugin<T>): T | null => {
    return this.view.plugin<T>(plugin)
  }

  elementAtHeight = (...args: Parameters<typeof this.view.elementAtHeight>) => {
    return this.view.elementAtHeight(...args)
  }

  lineBlockAtHeight = (...args: Parameters<typeof this.view.lineBlockAtHeight>) => {
    return this.view.lineBlockAtHeight(...args)
  }

  lineBlockAt = (...args: Parameters<typeof this.view.lineBlockAt>) => {
    return this.view.lineBlockAt(...args)
  }

  moveByChar = (...args: Parameters<typeof this.view.moveByChar>) => {
    return this.view.moveByChar(...args)
  }

  moveByGroup = (...args: Parameters<typeof this.view.moveByGroup>) => {
    return this.view.moveByGroup(...args)
  }

  moveToLineBoundary = (...args: Parameters<typeof this.view.moveToLineBoundary>) => {
    return this.view.moveToLineBoundary(...args)
  }

  moveVertically = (...args: Parameters<typeof this.view.moveVertically>) => {
    return this.view.moveVertically(...args)
  }

  domAtPos = (...args: Parameters<typeof this.view.domAtPos>) => {
    return this.view.domAtPos(...args)
  }

  posAtDOM = (...args: Parameters<typeof this.view.posAtDOM>) => {
    return this.view.posAtDOM(...args)
  }

  // @ts-expect-error: How to fix this?
  posAtCoords = (...args: Parameters<typeof this.view.posAtCoords>) => {
    return this.view.posAtCoords(...args)
  }

  coordsAtPos = (...args: Parameters<typeof this.view.coordsAtPos>) => {
    return this.view.coordsAtPos(...args)
  }

  coordsForChar = (...args: Parameters<typeof this.view.coordsForChar>) => {
    return this.view.coordsForChar(...args)
  }

  textDirectionAt = (...args: Parameters<typeof this.view.textDirectionAt>) => {
    return this.view.textDirectionAt(...args)
  }

  bidiSpans = (...args: Parameters<typeof this.view.bidiSpans>) => {
    return this.view.bidiSpans(...args)
  }

  focus = (...args: Parameters<typeof this.view.focus>) => {
    return this.view.focus(...args)
  }

  destroy = (...args: Parameters<typeof this.view.destroy>) => {
    return this.view.destroy(...args)
  }

  emitChange = () => this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

  get value() {
    return this.state.doc.toString()
  }

  firstUpdated() {
    this.view = new EditorView({doc: this.initialState.doc, selection: this.initialState.selection, dispatchTransactions: this.dispatchTransactions, parent: this.shadowRoot!, extensions: [this.extensions, EditorView.updateListener.of(v => v.docChanged && this.emitChange())]})
    EditorState.create()
    // this.transferContent()
    this.addEventListener("click", this.focus)
    this.focus()
    /*
    const observer = new MutationObserver(mutations => {
      if(mutations.some(mutation => mutation.type === "childList")) {
        this.transferContent()
      }
    })
    observer.observe(this, {childList: true})*/
  }

  private transferContent() {
    const insert = this.textContent!.trim()
    const tr = this.state.update({changes: {from: 0, to: this.state.doc.length, insert}})
    this.dispatch(tr)
  }

  static styles = css`
    * {
      outline: none !important;
    }
  `
  
}