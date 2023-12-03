import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, queryAsync } from "lit/decorators.js"
import { DirectEditorProps, EditorView } from "prosemirror-view"
import { localized } from "@lit/localize"
import { EditorState, Transaction } from "prosemirror-state"
import { pickObject, sameMembers } from "../../utility"
import { keyed } from "lit/directives/keyed.js"
import { headSerializer, toAttributes } from "../../model"
import {DOMSerializer} from "prosemirror-model"

type IProsemirrorEditor = 
  & Omit<DirectEditorProps, "attributes" | "editable">
  & Omit<EditorView, "update" | "dispatchEvent" | "updateRoot">
  & {
    pmAttributes: DirectEditorProps["attributes"]
    shouldBeEditable: DirectEditorProps["editable"]
    updateProps: EditorView["update"]
  }

type EditorIFrameElement = HTMLIFrameElement & {
  contentDocument: {body: HTMLElement}
  contentWindow: typeof globalThis
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
    this.requestUpdate("state", this.state)
  }

  private initialState: IProsemirrorEditor["state"]

  @property({attribute: false})
  plugins: IProsemirrorEditor["plugins"]

  @property({attribute: false})
  dispatchTransaction: IProsemirrorEditor["dispatchTransaction"]

  @property({state: true, attribute: false})
  private view: EditorView

  @property({type: String, attribute: false, hasChanged(value, oldValue) {
    return !sameMembers(value, oldValue)
}})
	contentScript: string

  @property({type: String, attribute: true})
	bundleID: string

	@property({type: String, attribute: false, hasChanged(value, oldValue) {
      return !sameMembers(value, oldValue)
  }})
	contentStyle: string

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

  updateProps = (...args: Parameters<typeof this.view.update>) => this.view?.update(...args)

  setProps = (...args: Parameters<typeof this.view.setProps>) => this.view?.setProps(...args)

  updateState = (...args: Parameters<typeof this.view.updateState>) => {
    this?.view.updateState(...args)
    this.dispatchEvent(new CustomEvent("update", {composed: true, bubbles: true, detail: {editorState: this.view.state}}))
  }

  someProp = (...args: Parameters<typeof this.view.someProp>) => this.view?.someProp(...args)

  hasFocus = (...args: Parameters<typeof this.view.hasFocus>) => this.view?.hasFocus(...args)

  focus = (...args: Parameters<typeof this.view.focus>) => this.view?.focus(...args)

  posAtCoords = (...args: Parameters<typeof this.view.posAtCoords>) => this?.view.posAtCoords(...args)

  coordsAtPos = (...args: Parameters<typeof this.view.coordsAtPos>) => this?.view.coordsAtPos(...args)

  domAtPos = (...args: Parameters<typeof this.view.domAtPos>) => this.view?.domAtPos(...args)

  nodeDOM = (...args: Parameters<typeof this.view.nodeDOM>) => this.view?.nodeDOM(...args)

  posAtDOM = (...args: Parameters<typeof this.view.posAtDOM>) => this.view?.posAtDOM(...args)

  endOfTextblock = (...args: Parameters<typeof this.view.endOfTextblock>) => this?.view.endOfTextblock(...args)

  pasteHTML = (...args: Parameters<typeof this.view.pasteHTML>) => this.view?.pasteHTML(...args)

  pasteText = (...args: Parameters<typeof this.view.pasteText>) => this.view?.pasteText(...args)

  destroy = (...args: Parameters<typeof this.view.destroy>) => this.view?.destroy(...args)

  dispatch = (...args: Parameters<typeof this.view.dispatch>) => this.view?.dispatch(...args)

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
      this.view = new EditorView({mount: this.body}, this.directProps)
    }
    else {
      this.view?.setProps(this.directProps)
    }
    if((this.state as any)?.head$ && (!previous.get("state")?.head$ || !previous.get("state")?.head$.doc.eq((this.state as any)?.head$.doc))) {
      this.renderHead()
    }
    
  }

  renderHead() {
    const headState = (this.state as any).head$ as EditorState
    const newHead = headSerializer.serializeNode(headState.doc)
    const editingElements = this.head.querySelectorAll("[data-ww-editing]")
    editingElements.forEach(el => newHead.appendChild(el))
    this.head.replaceWith(newHead)
    for(let attr of this.documentElement.getAttributeNames()) {
      this.documentElement.removeAttribute(attr)
    }
    for(let [key, value] of Object.entries(toAttributes(headState.doc.attrs.htmlAttrs ?? {}))) {
      this.documentElement.setAttribute(key, value as string)
    }
    for(let attr of this.body.getAttributeNames()) {
      if(!["contenteditable", "translate", "data-iframe-height", "data-placeholder", "class"].includes(attr)) {
        this.body.removeAttribute(attr)
      }
    }
    for(let [key, value] of Object.entries(toAttributes(this.state.doc))) {
      if(key === "class") {
        this.body.classList.add(...value.split(/ +/))
      }
      else {
        this.body.setAttribute(key, value as string)
      }
    }
    this.body.spellcheck = false
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

  static eventsToRedispatch = ["dragenter", "dragleave"]

  redispatch(e: Event) {
		return this.dispatchEvent(new (e as any).constructor(e.type, e))
	}

  async initializeIFrame() {
    console.log("initialize iframe")
    this.iframe = this.shadowRoot?.querySelector("iframe") as any
    const {contentScript} = this
    await this.importString(contentScript)
    this.document.documentElement.spellcheck = false
    this.window.console = console
    this.window.onerror = window.onerror
    this.window.onunhandledrejection = window.onunhandledrejection
    this.window.addEventListener("focus", () => this.dispatchEvent(new Event("focus", {bubbles: true, composed: true})))
    ProsemirrorEditor.eventsToRedispatch.map(name => this.window.addEventListener(name, (e: Event) => {
      if(e.type === "dragleave" && (e as DragEvent).offsetX > 0) {
        return
      }
      else {
        this.redispatch(e)
      }
    }))
    this.window.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    })
    window.addEventListener("dragenter", (e: any) => {
      this.document.documentElement.toggleAttribute("data-dragover", true)
    })
    window.addEventListener("dragleave", (e: any) => {
      const isBoundary = e.screenX === 0 && e.screenY === 0
      isBoundary && this.document.documentElement.toggleAttribute("data-dragover", false)
    })
    this.window.addEventListener("dragend", (e: any) => {
      this.document.documentElement.toggleAttribute("data-dragover", false)
    })
    this.window.addEventListener("drop", (e: any) => {
      this.document.documentElement.toggleAttribute("data-dragover", false)
      e.stopPropagation()
      e.preventDefault()
    })
    
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

  get documentElement() {
    return this.iframe?.contentDocument?.documentElement
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
        user-select: none;
      }
    `
  }

  @property({attribute: true, type: Boolean, reflect: true})
  loaded: boolean = false
  

  render() {
    return keyed(this.bundleID, html`<iframe part="iframe"></iframe>`)
  }
}