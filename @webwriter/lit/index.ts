import {LitElement, adoptStyles, type PropertyDeclaration} from "lit"

export type LocalizedText = string | Record<string, string>

export interface OptionAvailability {
  hidden?: boolean
  disabled?: boolean
  disabledReason?: LocalizedText
}

export interface OptionGroupDeclaration {
  label?: LocalizedText
  description?: LocalizedText
  collapsible?: boolean
  collapsed?: boolean
  advanced?: boolean
}

interface BaseOptionDeclaration<TypeHint=any> extends PropertyDeclaration<TypeHint>, OptionAvailability {
  group?: string
  readOnly?: boolean
  unit?: string
  type?: TypeHint
  label?: LocalizedText
  placeholder?: LocalizedText
  description?: LocalizedText
}

export interface BooleanOptionDeclaration extends BaseOptionDeclaration<BooleanConstructor | "boolean"> {
  control?: "checkbox" | "switch"
}

interface InputOptionDeclaration<TypeHint=any> extends BaseOptionDeclaration<TypeHint> {
  pattern?: string
  minlength?: number
  maxlength?: number
  autocapitalize?: "none" | "characters" | "words" | "sentences"
  spellcheck?: "true" | "false"
  autocomplete?: HTMLInputElement["autocomplete"]
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url"
}

export interface StringOptionDeclaration extends InputOptionDeclaration<StringConstructor | "string"> {
  multiline?: boolean
}

export interface NumberOptionDeclaration extends InputOptionDeclaration<NumberConstructor | "number"> {
  control?: "input" | "range" | "duration"
  steps?: number[]
  min?: number
  max?: number
  step?: number
}

export interface DateOptionDeclaration extends InputOptionDeclaration<"date"> {
  min?: number
  max?: number
  step?: number
}
export interface DatetimeLocalOptionDeclaration extends InputOptionDeclaration<"datetime-local"> {
  min?: number
  max?: number
  step?: number
}
export interface EmailOptionDeclaration extends InputOptionDeclaration<"email"> {}
export interface PasswordOptionDeclaration extends InputOptionDeclaration<"password"> {}
export interface TelOptionDeclaration extends InputOptionDeclaration<"tel"> {}
export interface TimeOptionDeclaration extends InputOptionDeclaration<"time"> {}
export interface UrlOptionDeclaration extends InputOptionDeclaration<"url"> {}

export interface ObjectOptionDeclaration extends BaseOptionDeclaration<ObjectConstructor | "object" | ArrayConstructor | "array"> {
  
}

export interface ColorOptionDeclaration extends BaseOptionDeclaration<"color"> {
  swatches?: string[]
}

export type SelectOptionChoice = {
  value: string
  label?: LocalizedText
  description?: LocalizedText
  children?: never
} | {
  label?: LocalizedText
  children: SelectOptionChoice[]
  value?: never
}

export interface ReferenceOptionDeclaration extends BaseOptionDeclaration<"reference"> {
  selector?: string
  excludeSelf?: boolean
}

export interface SelectOptionDeclaration extends BaseOptionDeclaration<"select"> {
  control?: "select" | "radio" | "segmented" | "tree"
  multiple?: boolean
  options?: SelectOptionChoice[]
}

export type OptionDeclaration = 
| BooleanOptionDeclaration
| StringOptionDeclaration
| NumberOptionDeclaration
| DateOptionDeclaration
| DatetimeLocalOptionDeclaration
| EmailOptionDeclaration
| PasswordOptionDeclaration
| TelOptionDeclaration
| TimeOptionDeclaration
| UrlOptionDeclaration
| ObjectOptionDeclaration
| ColorOptionDeclaration
| SelectOptionDeclaration
| ReferenceOptionDeclaration

export interface ActionDeclaration extends OptionAvailability {
  /** Native chooser input; the action method receives transient File[]. */
  input?: {type: "file", accept?: string, multiple?: boolean}
  group?: string
  icon?: string
  intent?: "default" | "danger"
  confirm?: LocalizedText
  label?: LocalizedText
  placeholder?: LocalizedText
  description?: LocalizedText
}

/** MIME type essences browsers execute as classic scripts. */
const javaScriptMimeTypes = new Set([
  "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript",
  "text/ecmascript", "text/javascript", "text/javascript1.0", "text/javascript1.1", "text/javascript1.2",
  "text/javascript1.3", "text/javascript1.4", "text/javascript1.5", "text/jscript", "text/livescript",
  "text/x-ecmascript", "text/x-javascript",
])

/** Whether a script `type` is an inert data block type, such as `application/json`. WebWriter keeps such `<script>` children of a widget as its data containers. */
export function isDataBlockType(type: string) {
  const essence = type.split(";")[0].trim().toLowerCase()
  return /^[^\s/]+\/[^\s/]+$/.test(essence) && !javaScriptMimeTypes.has(essence)
}

export type WidgetDataMode = "individual" | "all" | "group" | "local"
export type WidgetDataContext = {block: HTMLScriptElement | null, mode: WidgetDataMode}

type ContextFollowers = {widgets: Set<LitElementWw>, observer: MutationObserver}
const contextFollowers = new WeakMap<Document, ContextFollowers>()
const registries = new WeakMap<typeof LitElementWw, CustomElementRegistry>()

/** Optional WebWriter conveniences for Lit widgets. The authored DOM remains
 * authoritative; only registry, readiness, and notification state are retained. */
export class LitElementWw extends LitElement {
  static scopedElements: Record<string, CustomElementConstructor> = {}
  static readonly options: Record<string, OptionDeclaration> = {}
  static readonly actions: Record<string, ActionDeclaration> = {}
  static readonly optionGroups: Record<string, OptionGroupDeclaration> = {}
  static readonly dataType: string | undefined = undefined

  /** Per-instance editor declarations, including empty maps, override static maps. */
  declare readonly options?: Record<string, OptionDeclaration>
  declare readonly actions?: Record<string, ActionDeclaration>
  declare readonly optionGroups?: Record<string, OptionGroupDeclaration>
  protected localize?: {getLocale: () => string, setLocale: (locale: string) => Promise<void>}

  /** One native registry per concrete widget class, shared by its instances. */
  get registry() {
    const constructor = this.constructor as typeof LitElementWw
    let registry = registries.get(constructor)
    if(!registry) {
      registry = new CustomElementRegistry()
      for(const [name, element] of Object.entries(constructor.scopedElements)) registry.define(name, element)
      registries.set(constructor, registry)
    }
    return registry
  }

  protected createRenderRoot() {
    const constructor = this.constructor as typeof LitElementWw
    const registry = this.registry
    const root = this.shadowRoot ?? this.attachShadow({...constructor.shadowRootOptions, customElementRegistry: registry})
    adoptStyles(root, constructor.elementStyles)
    this.renderOptions.renderBefore ??= root.firstChild
    const customElementRegistry = (root as ShadowRoot & {customElementRegistry: CustomElementRegistry}).customElementRegistry
    this.renderOptions.creationScope = {
      importNode: (node, deep) => this.ownerDocument.importNode(node, {customElementRegistry, selfOnly: !deep}),
    }
    return root
  }

  get editable() { return this.isContentEditable }

  /** Includes explicit lang="", which stops inheritance. Inherited values are
   * never reflected onto the widget. Setting null removes an authored value. */
  get lang(): string { return this.closest("[lang]")?.getAttribute("lang") ?? "" }
  set lang(value: string | null) {
    if(value === null || value === undefined) this.removeAttribute("lang")
    else this.setAttribute("lang", value)
  }

  static get observedAttributes() {
    return [...new Set([...super.observedAttributes, "contenteditable", "lang", "shared", "id"])]
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    super.attributeChangedCallback(name, oldValue, value)
    if(oldValue === value) return
    if(name === "lang" || name === "contenteditable") this.#contextChanged()
    if(name === "shared" || name === "id") {
      this.#readyBlock = null
      if(this.isConnected) this.#syncData()
    }
  }

  #observedDocument?: Document
  #language?: string
  #editable?: boolean

  #contextChanged = () => {
    const language = this.lang, editable = this.editable
    if(language !== this.#language) {
      const before = this.#language
      this.#language = language
      this.requestUpdate("lang", before)
      if(this.isConnected && this.localize) {
        const failed = (error: unknown) => {
          this.dispatchEvent(new CustomEvent("localizationerror", {detail: {error}}))
          this.requestUpdate()
        }
        try { void Promise.resolve(this.localize.setLocale(language)).then(() => this.requestUpdate(), failed) }
        catch(error) { failed(error) }
      }
    }
    if(editable !== this.#editable) {
      const before = this.#editable
      this.#editable = editable
      this.requestUpdate("editable", before)
    }
  }

  /** Retained for widgets that explicitly request an inherited-language refresh. */
  languageChanged() { this.#contextChanged() }

  #dataContainer(): HTMLScriptElement | null {
    const blocks = Array.from(this.children).filter((child): child is HTMLScriptElement =>
      child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.localName === "script"
      && isDataBlockType((child as HTMLScriptElement).type) && !child.hasAttribute("src"))
    return blocks.find(block => this.#scoped(block)) ?? blocks[0] ?? null
  }

  #scoped(block: HTMLScriptElement | null) {
    return !!block && block.getAttribute("slot") === "data"
      && ["application/json", "application/xml"].includes(block.type)
  }

  #scope() {
    return JSON.stringify([this.ownerDocument.documentElement.id, this.id, this.getAttribute("shared"),
      ...Array.from(this.childNodes).filter(node => node.nodeType === 7 && node.nodeName === "ww-grouping").map(node => node.nodeValue)])
  }

  get data() { return this.#dataContainer()?.textContent ?? null }
  set data(value: string | null) { this.setData(this.dataType ?? "text/plain", value ?? "") }
  get dataType() { return this.#dataContainer()?.type ?? (this.constructor as typeof LitElementWw).dataType }

  #block: HTMLScriptElement | null | undefined
  #bindingScope?: string
  #readyBlock: HTMLScriptElement | null = null
  #readyScope?: string
  #managed = false
  #lastText: string | null | undefined
  #mode: WidgetDataMode = "local"
  #syncing = false
  #contentObserver = new MutationObserver(() => this.#syncData())

  /** False while the current participant scope is loading or unavailable. */
  get dataReady() {
    const block = this.#dataContainer()
    return this.isConnected && (!this.#scoped(block) || block === this.#block && this.#bindingScope === this.#scope()
      && (!this.#managed || block === this.#readyBlock && this.#readyScope === this.#scope()))
  }

  /** Implement these hooks to update the widget's presentation. Do not write
   * snapshots back from a notification; write in response to user interactions. */
  protected dataPending(context: WidgetDataContext): void {}
  protected dataChanged(value: string | null, context: WidgetDataContext): void {}
  protected dataError(error: Error, context: WidgetDataContext): void {}

  #context(block = this.#dataContainer()): WidgetDataContext { return {block, mode: this.#mode} }

  #syncData() {
    if(!this.isConnected || this.#syncing) return
    this.#syncing = true
    try {
      const block = this.#dataContainer(), scope = this.#scope()
      if(block !== this.#block || scope !== this.#bindingScope) {
        this.#block = block
        this.#bindingScope = scope
        this.#readyBlock = null
        this.#managed = false
        this.#mode = "local"
        if(this.#scoped(block)) {
          const Request = this.ownerDocument.defaultView?.CustomEvent ?? CustomEvent
          // Cancellation acknowledges ownership; an unhandled request means a
          // standalone document using ordinary local authored data.
          const request = new Request("datarequest", {bubbles: true, cancelable: true})
          this.#managed = !block!.dispatchEvent(request)
        }
        if(!this.#managed) this.#acceptData("local")
      }
      else if(!this.#managed && this.data !== this.#lastText) this.#acceptData("local")
      this.requestUpdate("data")
    }
    finally { this.#syncing = false }
  }

  #acceptData(mode: WidgetDataMode) {
    this.#mode = mode
    this.#readyBlock = this.#dataContainer()
    this.#readyScope = this.#scope()
    this.#lastText = this.data
    this.dataChanged(this.data, this.#context())
    this.requestUpdate("data")
  }

  #dataEvent = (event: Event) => {
    const block = this.#dataContainer()
    if(!this.isConnected || !block || event.target !== block || !this.#scoped(block)) return
    const detail = (event as CustomEvent<{mode?: WidgetDataMode, message?: string}>).detail
    this.#managed = true
    this.#block = block
    this.#bindingScope = this.#scope()
    if(detail?.mode) this.#mode = detail.mode
    else if(this.#mode === "local") this.#mode = !this.hasAttribute("shared") ? "individual" : this.getAttribute("shared") === "group" ? "group" : "all"
    if(event.type === "datachange") this.#acceptData(this.#mode)
    else {
      if(event.type === "datapending") {
        this.#readyBlock = null
        this.dataPending(this.#context(block))
      }
      else this.dataError(new Error(detail?.message ?? "Widget data is unavailable"), this.#context(block))
      this.requestUpdate("data")
    }
  }

  /** Updates a data block in place, preserving its identity and attributes.
   * A managed block cannot be written until its current scope is ready. */
  setData(type: string, value: string, attrs: LocalizedText = {}) {
    if(!isDataBlockType(type)) throw new TypeError(`'${type}' is not a data block type`)
    if(Object.keys(attrs).some(name => name.toLowerCase() === "src")) throw new TypeError("Data blocks cannot have src")
    this.#syncData()
    const old = this.#dataContainer()
    if(old && this.#managed && !this.dataReady) throw new DOMException("Wait for the current data scope to become ready", "InvalidStateError")
    const text = type === "application/json" ? value.replace(/</g, "\\u003c") : value
    if(/<\/script[\s/>]/i.test(text)) throw new TypeError("Data blocks cannot contain a closing script tag")
    const block = old ?? this.ownerDocument.createElement("script")
    for(const [name, value] of Object.entries(attrs)) block.setAttribute(name, value)
    block.type = type
    block.textContent = text
    if(!old) this.append(block)
    this.requestUpdate("data")
  }

  #slotChanged = () => this.requestUpdate()

  connectedCallback() {
    super.connectedCallback()
    this.#observedDocument = this.ownerDocument
    let followers = contextFollowers.get(this.ownerDocument)
    if(!followers) {
      const widgets = new Set<LitElementWw>()
      const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver
      const observer = new Observer(() => widgets.forEach(widget => widget.#contextChanged()))
      observer.observe(this.ownerDocument.documentElement, {attributes: true, attributeFilter: ["lang", "contenteditable"], subtree: true})
      followers = {widgets, observer}
      contextFollowers.set(this.ownerDocument, followers)
    }
    followers.widgets.add(this)
    this.#language = undefined
    this.#contextChanged()
    for(const type of ["datapending", "datachange", "dataerror"]) this.addEventListener(type, this.#dataEvent)
    this.#contentObserver.observe(this, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["type", "src", "slot"]})
    this.renderRoot.addEventListener("slotchange", this.#slotChanged)
    this.#block = undefined
    this.#syncData()
  }

  disconnectedCallback() {
    this.#contentObserver.disconnect()
    for(const type of ["datapending", "datachange", "dataerror"]) this.removeEventListener(type, this.#dataEvent)
    this.renderRoot?.removeEventListener("slotchange", this.#slotChanged)
    this.#readyBlock = null
    if(this.#observedDocument) {
      const followers = contextFollowers.get(this.#observedDocument)
      followers?.widgets.delete(this)
      if(!followers?.widgets.size) {
        followers?.observer.disconnect()
        contextFollowers.delete(this.#observedDocument)
      }
    }
    this.#observedDocument = undefined
    super.disconnectedCallback()
  }
}
