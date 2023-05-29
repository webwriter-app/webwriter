import { LitElement, html, css } from "lit"
import { customElement, property, queryAll, queryAsync } from "lit/decorators.js"
import { DirectEditorProps, EditorView } from "prosemirror-view"
import { localized, msg } from "@lit/localize"
import pmCSS from "prosemirror-view/style/prosemirror.css?raw"
import { Transaction } from "prosemirror-state"
import { pickObject, sameMembers } from "../../utility"
import { keyed } from "lit/directives/keyed.js"

type IProsemirrorEditor = 
  & Omit<DirectEditorProps, "attributes" | "editable">
  & Omit<EditorView, "update" | "dispatchEvent">
  & {
    pmAttributes: DirectEditorProps["attributes"]
    shouldBeEditable: DirectEditorProps["editable"]
    updateProps: EditorView["update"]
  }

type EditorIFrameElement = HTMLIFrameElement & {
  contentDocument: {body: HTMLElement}
  contentWindow: {view: EditorView, eval: typeof eval, URL: typeof URL, Blob: typeof Blob, console: typeof console}
}

@localized()
@customElement("pm-editor")
export class ProsemirrorEditor extends LitElement implements IProsemirrorEditor {

  @property({attribute: false})
  handleDOMEvents: IProsemirrorEditor["handleDOMEvents"]

  @property({attribute: false})
  handleKeyDown: IProsemirrorEditor["handleKeyDown"]

  @property({attribute: false})
  handleKeyPress: IProsemirrorEditor["handleKeyPress"]

  @property({attribute: false})
  handleTextInput: IProsemirrorEditor["handleTextInput"]

  @property({attribute: false})
  handleClickOn: IProsemirrorEditor["handleClickOn"]

  @property({attribute: false})
  handleClick: IProsemirrorEditor["handleClick"]

  @property({attribute: false})
  handleDoubleClickOn: IProsemirrorEditor["handleDoubleClickOn"]

  @property({attribute: false})
  handleDoubleClick: IProsemirrorEditor["handleDoubleClick"]

  @property({attribute: false})
  handleTripleClickOn: IProsemirrorEditor["handleTripleClickOn"]

  @property({attribute: false})
  handleTripleClick: IProsemirrorEditor["handleTripleClick"]

  @property({attribute: false})
  handlePaste: IProsemirrorEditor["handlePaste"]

  @property({attribute: false})
  handleDrop: IProsemirrorEditor["handleDrop"]

  @property({attribute: false})
  handleScrollToSelection: IProsemirrorEditor["handleScrollToSelection"]

  @property({attribute: false})
  createSelectionBetween: IProsemirrorEditor["createSelectionBetween"]

  @property({attribute: false})
  domParser: IProsemirrorEditor["domParser"]

  @property({attribute: false})
  transformPastedHTML: IProsemirrorEditor["transformPastedHTML"]

  @property({attribute: false})
  clipboardParser: IProsemirrorEditor["clipboardParser"]

  @property({attribute: false})
  transformPastedText: IProsemirrorEditor["transformPastedText"]

  @property({attribute: false})
  clipboardTextParser: IProsemirrorEditor["clipboardTextParser"]

  @property({attribute: false})
  transformPasted: IProsemirrorEditor["transformPasted"]

  @property({attribute: false})
  transformCopied: IProsemirrorEditor["transformCopied"]

  @property({attribute: false})
  nodeViews: IProsemirrorEditor["nodeViews"]

  @property({attribute: false})
  markViews: IProsemirrorEditor["markViews"]

  @property({attribute: false})
  clipboardSerializer: IProsemirrorEditor["clipboardSerializer"]

  @property({attribute: false})
  clipboardTextSerializer: IProsemirrorEditor["clipboardTextSerializer"]

  @property({attribute: false})
  decorations: IProsemirrorEditor["decorations"]

  @property({attribute: false})
  shouldBeEditable: IProsemirrorEditor["shouldBeEditable"]

  @property({attribute: false})
  pmAttributes: IProsemirrorEditor["pmAttributes"]

  @property({attribute: false})
  scrollThreshold: IProsemirrorEditor["scrollThreshold"]
  
  @property({attribute: false})
  scrollMargin: IProsemirrorEditor["scrollMargin"]

  @property({attribute: false})
  get state(): IProsemirrorEditor["state"] {
    return this.view?.state
  }

  set state(state) {
    this.view? this.view.updateState(state): this.initialState = state 
  }

  private initialState: IProsemirrorEditor["state"]

  @property({attribute: false})
  plugins: IProsemirrorEditor["plugins"]

  @property({attribute: false})
  dispatchTransaction: IProsemirrorEditor["dispatchTransaction"]

  @property({state: true})
  private view: EditorView

  @property({type: String, attribute: false, hasChanged(value, oldValue) {
    return !sameMembers(value, oldValue)
}})
	contentScript: string | string[]

  @property({type: String, attribute: false})
	bundleID: string

	@property({type: String, attribute: false, hasChanged(value, oldValue) {
      return !sameMembers(value, oldValue)
  }})
	contentStyle: string | string[]

  @property({type: String, attribute: true})
  placeholder: string

  get editable(): boolean {
    return this?.view.editable as any
  }

  get dom() {
    return this.view.dom
  }

  get dragging() {
    return this.view.dragging
  }

  get composing() {
    return this.view.composing
  }

  get props() {
    return this.view.props
  }

  get root() {
    return this.view.root
  }

  get isDestroyed() {
    return this.view.isDestroyed
  }

  updateProps = (...args: Parameters<typeof this.view.update>) => this.view.update(...args)

  setProps = (...args: Parameters<typeof this.view.setProps>) => this.view.setProps(...args)

  updateState = (...args: Parameters<typeof this.view.updateState>) => {
    const [state] = args
    this.dispatchEvent(new CustomEvent("update", {composed: true, bubbles: true, detail: {editorState: state}}))
    this.view.updateState(...args)
  }

  someProp = (...args: Parameters<typeof this.view.someProp>) => this.view.someProp(...args)

  hasFocus = (...args: Parameters<typeof this.view.hasFocus>) => this.view.hasFocus(...args)

  focus = (...args: Parameters<typeof this.view.focus>) => this.view.focus(...args)

  posAtCoords = (...args: Parameters<typeof this.view.posAtCoords>) => this.view.posAtCoords(...args)

  coordsAtPos = (...args: Parameters<typeof this.view.coordsAtPos>) => this.view.coordsAtPos(...args)

  domAtPos = (...args: Parameters<typeof this.view.domAtPos>) => this.view.domAtPos(...args)

  nodeDOM = (...args: Parameters<typeof this.view.nodeDOM>) => this.view.nodeDOM(...args)

  posAtDOM = (...args: Parameters<typeof this.view.posAtDOM>) => this.view.posAtDOM(...args)

  endOfTextblock = (...args: Parameters<typeof this.view.endOfTextblock>) => this.view.endOfTextblock(...args)

  pasteHTML = (...args: Parameters<typeof this.view.pasteHTML>) => this.view.pasteHTML(...args)

  pasteText = (...args: Parameters<typeof this.view.pasteText>) => this.view.pasteText(...args)

  destroy = (...args: Parameters<typeof this.view.destroy>) => this.view.destroy(...args)

  dispatch = (...args: Parameters<typeof this.view.dispatch>) => this.view.dispatch(...args)

  /*
  shouldUpdate(changed: Map<string, any>) {
		return !(
			changed.has("editorState") &&
			this.editorState &&
			changed.get("editorState")?.doc &&
			this.editorState.doc.eq(changed.get("editorState")?.doc)
		)
	}
  */

  /*
  shouldUpdate(changed: Map<string, any>) {
    return !(changed.has("state") && !this.view?.state.doc.eq(this.state.doc))
  }*/

  constructor() {
    super()
  }

  get directProps(): DirectEditorProps {
    return {
      ...pickObject(this, ["handleDOMEvents", "handleKeyDown", "handleKeyPress", "handleTextInput", "handleClickOn", "handleClick", "handleDoubleClickOn", "handleDoubleClick", "handleTripleClickOn", "handleTripleClick", "handlePaste", "handleDrop", "handleScrollToSelection", "createSelectionBetween", "domParser", "transformPastedHTML", "clipboardParser", "transformPastedText", "clipboardTextParser", "transformPasted", "transformCopied", "nodeViews", "markViews", "clipboardSerializer", "clipboardTextSerializer", "decorations", "scrollThreshold", "scrollMargin"]),
      editable: this.shouldBeEditable,
      state: this.state ?? this.initialState,
      attributes: {
        "data-iframe-height": "",
        "data-placeholder": this.placeholder ?? "",
        ...this.pmAttributes
      },
      dispatchTransaction: (tr: Transaction) => {
        const editorState = this.view.state.apply(tr)
        this.updateState(editorState)
      }
    }
  }

  async updated(previous: Map<string, any>) {
    if(previous.has("bundleID")) {
      await this.initializeIFrame()
      this.view?.destroy()
      this.view = new EditorView(this.body, this.directProps)
    }
    else {
      console.log(previous)
      this.view?.setProps(this.directProps)
    }
  }

  getUpdatedProps(previous: Map<string, any> = new Map()) {
    const changedEntries = [...previous.keys()].map(k => [k, (this as any)[k]])
    const changedProps = Object.fromEntries(changedEntries) as DirectEditorProps
    return {
      ...changedProps, 
      editable: this.shouldBeEditable,
      state: this.state ?? this.initialState,
      attributes: {
        "data-iframe-height": "",
        "data-placeholder": this.placeholder ?? "",
        ...this.pmAttributes
      },
      dispatchTransaction: (tr: Transaction) => {
        const editorState = this.view.state.apply(tr)
        this.updateState(editorState)
      }
    
    }
  }

  async initializeIFrame() {
    const {contentStyle, contentScript} = this
    this.iframe = this.shadowRoot?.querySelector("iframe") as any
    this.importCSSString(pmCSS)
    const css = Array.isArray(contentStyle)? contentStyle: [contentStyle]
    const js = Array.isArray(contentScript)? contentScript: [contentScript]
    css.forEach(x => this.importCSSString(x))
    await Promise.all(js.map(x => this.importString(x)))
    this.childNodes.forEach(node => {
      this.head.appendChild(this.removeChild(node))
    })
    this.document.documentElement.spellcheck = false
    this.window.console = console
    this.window.onerror = window.onerror
    this.window.onunhandledrejection = window.onunhandledrejection
    this.loaded = true
  }

  iframe: EditorIFrameElement

  @queryAsync("iframe")
  iframeReady: Promise<any>

  get document() {
    return this.iframe?.contentDocument
  }

  get head() {
    return this.iframe?.contentDocument?.head
  }

  get body() {
    return this.iframe?.contentDocument?.body
  }

  get window() {
    return this.iframe?.contentWindow
  }

  async import(moduleSpecifier: string) {
    await this.iframeReady
    return this.iframe.contentWindow.eval(`import("${moduleSpecifier}")`)
  }

  async importString(str: string) {
    await this.iframeReady
    const url = this.window.URL.createObjectURL(new this.window.Blob([str], {type: "text/javascript"}))
    this.import(url)
  }

  async importCSS(src: string) {
    await this.iframeReady
    const link = this.document.createElement("link")
    link.rel = "stylesheet"
    link.type = "text/css"
    link.href = src
    this.document.head.appendChild(link)
  }

  async importCSSString(str: string) {
    await this.iframeReady
    const url = this.window.URL.createObjectURL(new this.window.Blob([str], {type: "text/css"}))
    this.importCSS(url)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
  }

  static get styles() {
    return css`
      :host {
        display: contents;
      }

      iframe {
        border: none;
        display: block;
        width: 100%;
      }
    `
  }

  @property({attribute: true, type: Boolean, reflect: true})
  loaded: boolean = false
  

  render() {
    console.log(this.bundleID)
    return keyed(this.bundleID, html`<iframe part="iframe"></iframe>`)
  }
}