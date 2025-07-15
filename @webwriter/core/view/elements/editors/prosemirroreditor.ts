import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, queryAsync } from "lit/decorators.js"
import { DirectEditorProps, EditorView } from "prosemirror-view"
import { localized } from "@lit/localize"
import { EditorState, Transaction } from "prosemirror-state"
import { emitCustomEvent, idle, pickObject, sameMembers } from "../../../model/utility"
import { keyed } from "lit/directives/keyed.js"
import { headEqual, headSerializer, SemVer, toAttributes } from "../../../model"
import {DOMSerializer} from "prosemirror-model"
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"
import redefineCustomElements from "redefine-custom-elements?raw"
import {ImportMap} from "@jspm/import-map"
import {Generator} from "@jspm/generator"
import { ifDefined } from "lit/directives/if-defined.js"
import hotkeys from "hotkeys-js"

const scopedCustomElementRegistryBlob = new Blob([scopedCustomElementRegistry], {type: "text/javascript"})

const scopedCustomElementRegistryUrl = URL.createObjectURL(scopedCustomElementRegistryBlob)

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
    try {
      this.view && !this.view.isDestroyed? this.view.updateState(state): this.initialState = state 
    }
    catch(err: any) {
      if(err.message !== "Cannot read properties of null (reading 'focusNode')" && err.message !== "Cannot read properties of null (reading 'extend')") {
        throw err
      }
    }
    this.requestUpdate("state", this.state)
  }

  private initialState: IProsemirrorEditor["state"]

  @property({attribute: false})
  plugins: IProsemirrorEditor["plugins"]

  @property({attribute: false})
  dispatchTransaction: IProsemirrorEditor["dispatchTransaction"]

  private view: EditorView

  @property({type: String, attribute: false})
	contentScript: string

  @property({type: String, attribute: false})
	bundleID: string

  @property({attribute: false})
	preloadedModules: string[] = []

	@property({type: String, attribute: false})
	contentStyle: string

  @property({type: String, attribute: true})
  placeholder: string

  @property({type: Object, attribute: false})
  windowListeners: Partial<Record<keyof WindowEventMap, any>> = {}

  
  @property({type: Array, attribute: false})
  preventedShortcuts: string[] = []

  get editable(): boolean {
    return this?.view.editable as any
  }

  get dom() {
    return this.view?.dom
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
    return this.view?.isDestroyed
  }

  updateProps = (...args: Parameters<typeof this.view.update>) => this.view?.update(...args)

  setProps = (...args: Parameters<typeof this.view.setProps>) => this.view?.setProps(...args)

  updateState = (...args: Parameters<typeof this.view.updateState>) => {
    this?.view.updateState(...args)
    // Fix for Firefox
    if(WEBWRITER_ENVIRONMENT.engine.name === "Gecko" && !this.view?.dom?.querySelector(":not(br)")) {
      (this.view as any).domObserver.stop();
      const p = this.document.createElement("p");
      this.body.appendChild(p);
      (this.view as any).domObserver.start()
    }
    this.dispatchEvent(new CustomEvent("update", {composed: true, bubbles: true, detail: {editorState: this.view.state}}))
  }

  someProp = (...args: Parameters<typeof this.view.someProp>) => this.view?.someProp(...args)

  hasFocus = (...args: Parameters<typeof this.view.hasFocus>) => !!this.document.querySelector(".ProseMirror")?.matches(".ProseMirror-focused")

  focus = (...args: Parameters<typeof this.view.focus>) => {
    this.iframe.focus()
    this.view?.focus(...args)
  }

  posAtCoords = (...args: Parameters<typeof this.view.posAtCoords>) => this.view?.posAtCoords(...args)

  coordsAtPos = (...args: Parameters<typeof this.view.coordsAtPos>) => this.view?.coordsAtPos(...args)

  domAtPos = (...args: Parameters<typeof this.view.domAtPos>) => this.view?.domAtPos(...args)

  nodeDOM = (...args: Parameters<typeof this.view.nodeDOM>) => this.view?.nodeDOM(...args)

  posAtDOM = (...args: Parameters<typeof this.view.posAtDOM>) => this.view?.posAtDOM(...args)

  endOfTextblock = (...args: Parameters<typeof this.view.endOfTextblock>) => this?.view.endOfTextblock(...args)

  pasteHTML = (...args: Parameters<typeof this.view.pasteHTML>) => this.view?.pasteHTML(...args)

  pasteText = (...args: Parameters<typeof this.view.pasteText>) => this.view?.pasteText(...args)

  destroy = (...args: Parameters<typeof this.view.destroy>) => this.view?.destroy(...args)

  dispatch = (...args: Parameters<typeof this.view.dispatch>) => this.view?.dispatch(...args)

  serializeForClipboard = (...args: Parameters<typeof this.view.serializeForClipboard>) => this.view?.serializeForClipboard(...args)

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
      ...pickObject(this, ["handleDOMEvents", "handleKeyDown", "handleKeyPress", "handleTextInput", "handleClickOn", "handleClick", "handleDoubleClickOn", "handleDoubleClick", "handleTripleClickOn", "handleTripleClick", "handlePaste", "handleDrop", "handleScrollToSelection", "createSelectionBetween", "domParser", "transformPastedHTML", "clipboardParser", "transformPastedText", "clipboardTextParser", "transformPasted", "transformCopied", "nodeViews", "markViews", "clipboardSerializer", "clipboardTextSerializer", "serializeForClipboard", "decorations", "scrollThreshold", "scrollMargin"]),
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

  firstInitialized = true

  async initialize() {
    if(this.url) {
      return this.initializePreviewFrame()
    }
    this.view?.destroy()
    await this.initializeIFrame()
    // Fix for Firefox
    if(WEBWRITER_ENVIRONMENT.engine.name === "Gecko" && !this.body.querySelector(":not(br)")) {
      const p = this.document.createElement("p")
      this.body.appendChild(p)
    }
    this.view = new EditorView({mount: this.body}, this.directProps)
    // this.focus()
    this.renderHead()
    emitCustomEvent(this, "ww-initialized", {first: this.firstInitialized})
    this.firstInitialized = false
  }

  async updated(previous: Map<string, any>) {
    if(!(this.view as any)?.docView) {
      return
    }
    if(!this.url) {
      try {
        this.view.setProps(this.directProps)
      }
      catch(err: any) {
        const ignoreMessages = ["Cannot read properties of null (reading 'focusNode')", "c is null", "Cannot read properties of null (reading 'extend')"] 
        if(!ignoreMessages.includes(err?.message)) {
          throw err
        }
      }
    }
    if(previous.get("state")?.head$ && !headEqual(previous.get("state")?.head$, (this.state as any).head$) && !this.url) {
      this.renderHead()
    }
    
  }

  renderHead() {
    const headState = (this.state as any).head$ as EditorState
    const newHead = headSerializer.serializeNode(headState.doc)
    if(!this.head) {
      return
    }
    const editingElements = this.head.querySelectorAll("[data-ww-editing]")
    editingElements.forEach(el => newHead.appendChild(el))
    this.head.replaceWith(newHead)
    for(let attr of this.documentElement.getAttributeNames()) {
      this.documentElement.removeAttribute(attr)
    }
    for(let [key, value] of Object.entries(toAttributes({}, headState.doc.attrs.htmlAttrs ?? {}))) {
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

  static eventsToRedispatch = ["dragenter", "dragleave"]

  redispatch(e: Event) {
		return this.dispatchEvent(new (e as any).constructor(e.type, e))
	}

  isFullscreen = false

  toggleFullscreen = (value?: boolean) => {
    this.isFullscreen = value ?? !this.isFullscreen
    this.dispatchEvent(new Event("fullscreenchange", {bubbles: true}))
  }

  @property({attribute: false})
  accessor importMap: ImportMap

  @property({attribute: true})
  accessor url: string

  createScript(src: string, defer=true, async=true) {
    const script = this.document.createElement("script")
    script.src = src
    script.defer = defer
    script.async = async
    script.type = "module"
    // script.setAttribute("blocking", "render")
    script.toggleAttribute("data-ww-editing")
    return script
  }

  createScriptInline(textContent: string) {
    const script = this.document.createElement("script")
    script.textContent = textContent
    script.type = "module"
    script.toggleAttribute("data-ww-editing")
    return script
  }

  createStyleInline(textContent: string) {
    const style = this.document.createElement("style")
    style.textContent = textContent
    style.toggleAttribute("data-ww-editing")
    return style
  }

  createStyleLink(href: string) {
    const link = this.document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("blocking", "render")
    link.toggleAttribute("data-ww-editing")
    return link
  }

  async initializePreviewFrame() {
    const iframe = this.shadowRoot?.querySelector("iframe")
    for(const el of Array.from(iframe?.contentDocument?.body.querySelectorAll("a") ?? [])) {
      el.target = "_blank"
    }
  }

  async initializeIFrame() {
    this.iframe = this.shadowRoot?.querySelector("iframe") as any
    
    // Scoped custom elements polyfill injection
    const scopedRegistryScript = this.createScript(scopedCustomElementRegistryUrl, false, false)
    this.head.append(scopedRegistryScript)
    
    // Dependency injection
    const importMap = !this.importMap? "": `<script type="importmap" data-ww-editing>${JSON.stringify(this.importMap.toJSON(), undefined, 2)}</script>`
    const scriptUrls = !this.importMap? []: Object.keys(this.importMap.imports)
      .filter(k => k.endsWith(".js"))
      .map(k => this.importMap.resolve(k))
    const styleUrls = !this.importMap? []: Object.keys(this.importMap.imports)
      .filter(k => k.endsWith(".css"))
      .map(k => this.importMap.resolve(k))
    const scripts = scriptUrls.map(url => this.createScript(url, false, false))
    const styles = styleUrls.map(url => this.createStyleLink(url))
    this.head.insertAdjacentHTML("beforeend", importMap)
    this.head.append(...scripts, ...styles)

    // Custom editor behavior
    this.window.console = console
    this.window.onerror = window.onerror
    this.window.onunhandledrejection = window.onunhandledrejection
    this.window.addEventListener("focus", () => this.dispatchEvent(new Event("focus", {bubbles: true, composed: true})))
    const toggleFullscreen = this.toggleFullscreen
    this.window.Element.prototype.requestFullscreen = async function(options) {
      this.classList.add("ww-fullscreen")
      toggleFullscreen(true)
    }
    this.document.exitFullscreen = async () => {
      this.document.querySelectorAll(".ww-fullscreen").forEach(el => el.classList.remove("ww-fullscreen"))
      toggleFullscreen(false)
    }
    Object.defineProperty(this.document, "fullscreenElement", {
      get() {
        return this.querySelector(".ww-fullscreen")
      }
    })
    const createElement = this.document.createElement
    this.document.createElement = function(tagName: string, options: ElementCreationOptions) {
      const el = createElement.call(this, tagName, options)
      if(tagName.includes("-") && tagName !== "comment-") {
        el.id = "ww-" + crypto.randomUUID()
      }
      return el
    }
    for(const [eventName, listener] of Object.entries(this.windowListeners)) {
      this.window.addEventListener(eventName, listener)
    }
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
      this.document?.documentElement.toggleAttribute("data-dragover", true)
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
    this.window.addEventListener("keydown", e => {
      const keyExpr = [e.ctrlKey? "ctrl": null, e.altKey? "alt": null, e.shiftKey? "shift": null, e.metaKey? "meta": null, e.key].filter(k => k).join("+")
      if(this.preventedShortcuts.includes(keyExpr)) {
        e.preventDefault()
      }
    })
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
  loaded: boolean = true

  get documentLang() {
    return this?.document?.documentElement?.lang
  }

  render() {
    return keyed(this.bundleID + String(this.url), html`<iframe part="iframe" src=${ifDefined(this.url)} @load=${() => this.initialize()} srcdoc=${ifDefined(!this.url? "": undefined)}></iframe>`)
  }
}