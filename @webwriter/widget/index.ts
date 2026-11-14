import type {LocalizedText} from "./options"

export type * from "./options"

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

export type WidgetSnapshot = Readonly<{
  editable: boolean
  lang: string
  standalone: string | null
  attributes: Readonly<Record<string, string | null>>
  data: string | null
  dataType: string | undefined
  dataBlock: HTMLScriptElement | null
  dataSlot: string | null
  dataMode: WidgetDataMode
  dataReady: boolean
  dataError: Error | null
}>

type WidgetRuntimeCallbacks = {
  attributes?: () => readonly string[]
  language?: () => string
  editable?: () => boolean
  update?: (name?: string, previous?: unknown) => void
  dataChanged?: (value: string | null, context: WidgetDataContext) => void
  dataPending?: (context: WidgetDataContext) => void
  dataError?: (error: Error, context: WidgetDataContext) => void
}

type ContextFollowers = {runtimes: Set<WidgetRuntime>, observer: MutationObserver}
const contextFollowers = new WeakMap<Document, ContextFollowers>()
const dataEvents = ["datapending", "datachange", "dataerror", "datarelease"] as const
export const widgetRuntimeAttributes: readonly string[] = ["contenteditable", "lang", "shared", "id", "standalone"]

export function widgetLanguage(host: HTMLElement) {
  return host.closest("[lang]")?.getAttribute("lang") ?? ""
}

/** Observes an authored custom element. Snapshots are read-only views of its DOM. */
export class WidgetRuntime {
  constructor(readonly host: HTMLElement, private readonly callbacks: WidgetRuntimeCallbacks = {}) {}

  #observedDocument?: Document
  #language?: string
  #editable?: boolean
  #listeners = new Set<() => void>()
  #snapshot?: WidgetSnapshot

  get lang() { return this.callbacks.language?.() ?? widgetLanguage(this.host) }
  get editable() { return this.callbacks.editable?.() ?? this.host.isContentEditable }

  get standalone() { return this.host.getAttribute("standalone") }
  set standalone(value: string | null) {
    if(value === null) this.host.removeAttribute("standalone")
    else this.host.setAttribute("standalone", value)
  }

  /** The same snapshot object is returned until an observed value changes. */
  readonly getSnapshot = (): WidgetSnapshot => {
    const dataBlock = this.dataBlock
    const previous = this.#snapshot
    const attributes = Object.fromEntries((this.callbacks.attributes?.() ?? []).map(name => [name, this.host.getAttribute(name)]))
    const sameAttributes = previous && Object.keys(attributes).length === Object.keys(previous.attributes).length
      && Object.entries(attributes).every(([name, value]) => previous.attributes[name] === value)
    const next = {
      editable: this.editable,
      lang: this.lang,
      standalone: this.standalone,
      attributes: sameAttributes ? previous.attributes : Object.freeze(attributes),
      data: dataBlock?.textContent ?? null,
      dataType: this.#typeOf(dataBlock),
      dataBlock,
      dataSlot: dataBlock?.getAttribute("slot") ?? null,
      dataMode: this.#mode,
      dataReady: this.#isDataReady(dataBlock),
      dataError: this.#error,
    }
    if(previous && Object.entries(next).every(([key, value]) => previous[key as keyof WidgetSnapshot] === value)) return previous
    return this.#snapshot = Object.freeze(next)
  }

  /** Subscribe to host updates and return an unsubscribe function. */
  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  #publish(name?: string, previous?: unknown) {
    this.callbacks.update?.(name, previous)
    this.#listeners.forEach(listener => listener())
  }

  attributeChanged(name: string, oldValue: string | null, value: string | null) {
    if(oldValue === value) return
    if(name === "lang" || name === "contenteditable") {
      this.contextChanged()
      if(this.callbacks.attributes?.().includes(name)) this.#publish(name, oldValue)
    }
    else if(name === "shared" || name === "id") {
      this.#readyBlock = null
      if(this.host.isConnected) this.#syncData()
      else if(this.callbacks.attributes?.().includes(name)) this.#publish(name, oldValue)
    }
    else this.#publish(name, oldValue)
  }

  contextChanged() {
    const language = this.lang, editable = this.editable
    if(language !== this.#language) {
      const before = this.#language
      this.#language = language
      this.#publish("lang", before)
    }
    if(editable !== this.#editable) {
      const before = this.#editable
      this.#editable = editable
      this.#publish("editable", before)
    }
  }

  get dataBlock(): HTMLScriptElement | null {
    const blocks = Array.from(this.host.children).filter((child): child is HTMLScriptElement =>
      child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.localName === "script"
      && isDataBlockType((child as HTMLScriptElement).type) && !child.hasAttribute("src"))
    return blocks.find(block => this.#scoped(block)) ?? blocks[0] ?? null
  }

  #scoped(block: HTMLScriptElement | null) {
    return !!block && block.getAttribute("slot") === "data"
      && ["application/json", "application/xml"].includes(block.type)
  }

  #scope(block: HTMLScriptElement | null) {
    return JSON.stringify([this.host.ownerDocument.documentElement.id, this.host.id, this.host.getAttribute("shared"),
      block?.type, block?.getAttribute("slot"),
      ...Array.from(this.host.childNodes).filter(node => node.nodeType === 7 && node.nodeName === "ww-grouping").map(node => node.nodeValue)])
  }

  get data() { return this.dataBlock?.textContent ?? null }
  set data(value: string | null) { this.setData(this.dataType ?? "text/plain", value ?? "") }
  get dataType() { return this.#typeOf(this.dataBlock) }

  #typeOf(block: HTMLScriptElement | null) {
    return block?.type ?? (this.host.constructor as {dataType?: string}).dataType
  }

  #block: HTMLScriptElement | null | undefined
  #bindingScope?: string
  #readyBlock: HTMLScriptElement | null = null
  #readyScope?: string
  #managed = false
  #lastText: string | null | undefined
  #mode: WidgetDataMode = "local"
  #syncing = false
  #contentObserver?: MutationObserver
  #error: Error | null = null

  /** False while the current participant scope is loading or unavailable. */
  get dataReady() { return this.#isDataReady(this.dataBlock) }

  #isDataReady(block: HTMLScriptElement | null) {
    if(!this.host.isConnected) return false
    if(!this.#scoped(block)) return true
    const scope = this.#scope(block)
    return block === this.#block && this.#bindingScope === scope
      && (!this.#managed || block === this.#readyBlock && this.#readyScope === scope)
  }

  #context(block = this.dataBlock): WidgetDataContext { return {block, mode: this.#mode} }

  #syncData() {
    if(!this.host.isConnected || this.#syncing) return
    this.#syncing = true
    try {
      const block = this.dataBlock, scope = this.#scope(block)
      if(block !== this.#block || scope !== this.#bindingScope) {
        this.#block = block
        this.#bindingScope = scope
        this.#readyBlock = null
        this.#error = null
        this.#managed = false
        this.#mode = "local"
        if(this.#scoped(block)) {
          const Request = this.host.ownerDocument.defaultView?.CustomEvent ?? CustomEvent
          // Cancellation acknowledges ownership; an unhandled request means a
          // standalone document using ordinary local authored data.
          const request = new Request("datarequest", {bubbles: true, cancelable: true})
          if(!block!.dispatchEvent(request)) this.#managed = true
        }
        if(!this.#managed) this.#acceptData("local")
      }
      else if(!this.#managed && this.data !== this.#lastText) this.#acceptData("local")
      this.#publish("data")
    }
    finally { this.#syncing = false }
  }

  #acceptData(mode: WidgetDataMode) {
    this.#mode = mode
    this.#readyBlock = this.dataBlock
    this.#readyScope = this.#scope(this.#readyBlock)
    this.#lastText = this.data
    this.#error = null
    this.callbacks.dataChanged?.(this.data, this.#context())
    this.#publish("data")
  }

  #dataEvent = (event: Event) => {
    const block = this.dataBlock
    if(!this.host.isConnected || !block || event.target !== block || !this.#scoped(block)) return
    if(event.type === "datarelease") {
      this.#block = undefined
      this.#syncData()
      return
    }
    const detail = (event as CustomEvent<{mode?: WidgetDataMode, message?: string}>).detail
    this.#managed = true
    this.#block = block
    this.#bindingScope = this.#scope(block)
    if(detail?.mode) this.#mode = detail.mode
    else if(this.#mode === "local") this.#mode = !this.host.hasAttribute("shared") ? "individual" : this.host.getAttribute("shared") === "group" ? "group" : "all"
    if(event.type === "datachange") this.#acceptData(this.#mode)
    else {
      if(event.type === "datapending") {
        this.#readyBlock = null
        this.#error = null
        this.callbacks.dataPending?.(this.#context(block))
      }
      else {
        this.#error = new Error(detail?.message ?? "Widget data is unavailable")
        this.callbacks.dataError?.(this.#error, this.#context(block))
      }
      this.#publish("data")
    }
  }

  /** Updates a data block in place, preserving its identity and attributes.
   * A managed block cannot be written until its current scope is ready. */
  setData(type: string, value: string, attrs: LocalizedText = {}) {
    if(!isDataBlockType(type)) throw new TypeError(`'${type}' is not a data block type`)
    if(Object.keys(attrs).some(name => name.toLowerCase() === "src")) throw new TypeError("Data blocks cannot have src")
    this.#syncData()
    const old = this.dataBlock
    if(old && this.#managed && !this.dataReady) throw new DOMException("Wait for the current data scope to become ready", "InvalidStateError")
    const text = type === "application/json" ? value.replace(/</g, "\\u003c") : value
    if(/<\/script[\s/>]/i.test(text)) throw new TypeError("Data blocks cannot contain a closing script tag")
    const block = old ?? this.host.ownerDocument.createElement("script")
    for(const [name, value] of Object.entries(attrs)) block.setAttribute(name, value)
    block.type = type
    block.textContent = text
    if(!old) this.host.append(block)
    this.#publish("data")
  }

  connect() {
    const {host} = this
    if(this.#observedDocument) return
    const doc = this.#observedDocument = host.ownerDocument
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver
    let followers = contextFollowers.get(doc)
    if(!followers) {
      const runtimes = new Set<WidgetRuntime>()
      const observer = new Observer(() => runtimes.forEach(runtime => runtime.contextChanged()))
      observer.observe(doc.documentElement, {attributes: true, attributeFilter: ["lang", "contenteditable"], subtree: true})
      followers = {runtimes, observer}
      contextFollowers.set(doc, followers)
    }
    followers.runtimes.add(this)
    this.#language = undefined
    this.contextChanged()
    // Listen to native DOM events on hosts that also expose framework events.
    const events = doc.defaultView?.EventTarget.prototype ?? EventTarget.prototype
    for(const type of dataEvents) events.addEventListener.call(host, type, this.#dataEvent)
    this.#contentObserver = new Observer(() => this.#syncData())
    this.#contentObserver.observe(host, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["type", "src", "slot"]})
    this.#block = undefined
    this.#syncData()
  }

  disconnect() {
    const doc = this.#observedDocument
    if(!doc) return
    this.#observedDocument = undefined
    this.#contentObserver?.disconnect()
    this.#contentObserver = undefined
    const events = doc.defaultView?.EventTarget.prototype ?? EventTarget.prototype
    for(const type of dataEvents) events.removeEventListener.call(this.host, type, this.#dataEvent)
    this.#readyBlock = null
    const followers = contextFollowers.get(doc)
    followers?.runtimes.delete(this)
    if(followers && !followers.runtimes.size) {
      followers.observer.disconnect()
      contextFollowers.delete(doc)
    }
  }
}

type Lifecycle = {
  connectedCallback?(): void
  disconnectedCallback?(): void
  attributeChangedCallback?(name: string, oldValue: string | null, value: string | null): void
}
type WidgetElementConstructor = (new (...args: any[]) => HTMLElement & Lifecycle) & {observedAttributes?: readonly string[]}
export type WidgetHost = HTMLElement & {readonly widgetRuntime: WidgetRuntime}

/** Add the runtime to a custom-element class before registering it. */
export function withWidgetRuntime<T extends WidgetElementConstructor>(Base: T) {
  return class WidgetElement extends Base {
    static readonly widgetAttributes: readonly string[] = []
    static get observedAttributes(): string[] {
      return [...new Set([...(super.observedAttributes ?? []), ...widgetRuntimeAttributes, ...this.widgetAttributes])]
    }

    readonly widgetRuntime = new WidgetRuntime(this, {
      attributes: () => (this.constructor as typeof WidgetElement).widgetAttributes,
    })

    connectedCallback() {
      this.widgetRuntime.connect()
      super.connectedCallback?.()
    }

    disconnectedCallback() {
      this.widgetRuntime.disconnect()
      super.disconnectedCallback?.()
    }

    attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
      if(Base.observedAttributes?.includes(name)) super.attributeChangedCallback?.(name, oldValue, value)
      this.widgetRuntime.attributeChanged(name, oldValue, value)
    }
  }
}
