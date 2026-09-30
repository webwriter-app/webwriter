import * as Y from "yjs"
import {messageSync, WebsocketProvider} from "y-websocket"

export type WidgetDataMode = "individual" | "all" | "group"
export type WidgetDataRequest = {document: string, widget: string, mode: WidgetDataMode, format: "json" | "xml"}
export type WidgetDataConnection = {
  doc: Y.Doc
  ready?: Promise<void>
  /** Release the connection, not necessarily its persisted document. */
  destroy?: () => void
}
export type WidgetDataOptions = {
  /** Override the persistence identity; defaults to the authored HTML document's ID. */
  documentId?: string
  /** Offline identity only. Network identities are resolved by the server. */
  userId?: string
  resolve?: (request: WidgetDataRequest) => WidgetDataConnection | Promise<WidgetDataConnection>
}

type Value = null | boolean | number | string | Value[] | {[key: string]: Value}
const object = (value: unknown): value is {[key: string]: Value} =>
  value !== null && typeof value === "object" && !Array.isArray(value)
function equal(left: unknown, right: unknown): boolean {
  if(left === right) return true
  if(Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equal(value, right[index]))
  if(object(left) && object(right)) return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]))
  return false
}
const mirrorValue = (value: Value): Value | Y.Map<unknown> => {
  if(!object(value)) return value
  const map = new Y.Map<unknown>()
  for(const [key, child] of Object.entries(value)) map.set(key, mirrorValue(child))
  return map
}
const readValue = (value: unknown): Value => value instanceof Y.Map
  ? Object.fromEntries([...value.entries()].map(([key, child]) => [key, readValue(child)])) : value as Value

/** Diff against the last delivered snapshot, so unrelated remote edits are not assignments. */
function reconcile(map: Y.Map<unknown>, before: {[key: string]: Value}, after: {[key: string]: Value}) {
  for(const key of Object.keys(before)) if(!Object.hasOwn(after, key)) map.delete(key)
  for(const [key, value] of Object.entries(after)) {
    if(Object.hasOwn(before, key) && equal(before[key], value)) continue
    const current = map.get(key)
    if(object(value) && object(before[key]) && current instanceof Y.Map) reconcile(current, before[key], value)
    else map.set(key, mirrorValue(value))
  }
}

type Binding = {
  block: HTMLScriptElement
  widget: Element
  key: string
  mode: WidgetDataMode
  format: string
  defaults: string
  before: Value
  connection?: WidgetDataConnection
  undo?: Y.UndoManager
  observe?: () => void
  flush?: () => void
  ready: boolean
  disposed: boolean
  queued?: boolean
}

/** A format adapter for a single authored data block. XML children are atomic sequences. */
function parse(block: HTMLScriptElement, text: string): Value {
  if(block.type === "application/json") {
    return text.trim() ? JSON.parse(text, (_key, value) => {
      if(typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Widget JSON numbers must be finite")
      return value
    }) : {}
  }
  const Parser = block.ownerDocument.defaultView?.DOMParser ?? DOMParser
  const xml = new Parser().parseFromString(text, "application/xml")
  if(xml.getElementsByTagNameNS("http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror").length) throw new TypeError("Widget data must contain valid XML")
  const encode = (node: Node): Value => {
    if(node.nodeType === 10) {
      const doctype = node as DocumentType
      return {kind: 10, name: doctype.name, publicId: doctype.publicId, systemId: doctype.systemId}
    }
    if(node.nodeType !== 1) return {kind: node.nodeType, text: node.nodeValue ?? "", name: node.nodeName}
    const element = node as Element
    return {
      name: element.tagName, namespace: element.namespaceURI,
      attributes: Object.fromEntries([...element.attributes].map(attr => [attr.name, {namespace: attr.namespaceURI, value: attr.value}])),
      children: [...element.childNodes].map(encode),
    }
  }
  return {
    root: encode(xml.documentElement),
    before: [...xml.childNodes].slice(0, [...xml.childNodes].indexOf(xml.documentElement)).map(encode),
    after: [...xml.childNodes].slice([...xml.childNodes].indexOf(xml.documentElement) + 1).map(encode),
  }
}

function serialize(block: HTMLScriptElement, value: Value): string {
  if(block.type === "application/json") return JSON.stringify(value, (_key, child) => object(child)
    ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child).replace(/</g, "\\u003c")
  const Parser = block.ownerDocument.defaultView?.DOMParser ?? DOMParser
  const xml = new Parser().parseFromString("<data/>", "application/xml")
  xml.documentElement.remove()
  const decode = (value: Value): Node => {
    const node = value as Record<string, any>
    if(node.kind === 3) return xml.createTextNode(node.text)
    if(node.kind === 4) return xml.createCDATASection(node.text)
    if(node.kind === 8) return xml.createComment(node.text)
    if(node.kind === 7) return xml.createProcessingInstruction(node.name, node.text)
    if(node.kind === 10) return xml.implementation.createDocumentType(node.name, node.publicId, node.systemId)
    const element = xml.createElementNS(node.namespace, node.name)
    for(const [name, attribute] of Object.entries(node.attributes as Record<string, {namespace: string | null, value: string}>)) {
      element.setAttributeNS(attribute.namespace, name, attribute.value)
    }
    element.append(...node.children.map(decode))
    return element
  }
  const state = value as {root: Value, before: Value[], after: Value[]}
  xml.append(...state.before.map(decode), decode(state.root), ...state.after.map(decode))
  const Serializer = block.ownerDocument.defaultView?.XMLSerializer ?? XMLSerializer
  const text = new Serializer().serializeToString(xml)
  if(/<\/script[\s/>]/i.test(text)) throw new TypeError("XML data blocks cannot contain a closing script tag")
  return text
}

export const widgetDataHistoryTime = "widget-data-history-time"
export function stampUndo(manager: Y.UndoManager) {
  const stamp = ({stackItem}: {stackItem: {meta: Map<unknown, unknown>}}) => stackItem.meta.set(widgetDataHistoryTime, performance.now())
  manager.on("stack-item-added", stamp)
  manager.on("stack-item-updated", stamp)
}

/** Routes authored data blocks to scoped Yjs mirrors. No widget networking or UI. */
export class WidgetDataBindings {
  readonly #bindings = new Map<HTMLScriptElement, Binding>()
  readonly #defaults = new WeakMap<HTMLScriptElement, {format: string, text: string}>()
  readonly #local = new Map<string, WidgetDataConnection>()
  readonly #origin = {}
  #busy = false
  #destroyed = false
  #grouping = false
  readonly #captureTimeouts = new WeakMap<Y.UndoManager, number>()
  readonly #fallbackDocumentId: string

  constructor(
    readonly root: HTMLElement,
    readonly supports: (widget: Element) => boolean,
    readonly options: WidgetDataOptions = {},
    readonly serverUrl?: string,
    readonly sessionId?: string,
  ) {
    this.options = {...options}
    this.#fallbackDocumentId = sessionId ?? crypto.randomUUID()
  }

  get documentId() {
    return this.options.documentId
      ?? (this.root === this.root.ownerDocument.body ? this.root.ownerDocument.documentElement.id || undefined : undefined)
      ?? this.#fallbackDocumentId
  }

  isBlock(node: Node): node is HTMLScriptElement {
    return node.nodeType === 1 && (node as Element).namespaceURI === "http://www.w3.org/1999/xhtml"
      && (node as Element).localName === "script" && (node as Element).getAttribute("slot") === "data"
      && ["application/json", "application/xml"].includes((node as Element).getAttribute("type") ?? "")
      && !(node as Element).hasAttribute("src") && Boolean(node.parentElement && this.supports(node.parentElement))
  }

  defaults(block: HTMLScriptElement) {
    const defaults = this.#defaults.get(block)
    return defaults?.format === block.type ? defaults.text : block.textContent ?? ""
  }

  sync() {
    if(this.#busy || this.#destroyed) return
    this.#busy = true
    try {
      const blocks = new Set([...this.root.querySelectorAll<HTMLScriptElement>('script[slot="data"]')].filter(block => this.isBlock(block)))
      for(const [block, binding] of this.#bindings) {
        if(!blocks.has(block)) {
          // Removing the opt-in must not put participant data back in the public DOM mirror.
          if(this.root.contains(block) && block.type === binding.format) block.textContent = binding.defaults
          this.#dispose(binding); this.#bindings.delete(block)
        }
      }
      const ids = new Map([...this.#bindings.values()].map(binding => [binding.widget.id, binding.widget]))
      for(const block of blocks) {
        const widget = block.parentElement!
        // Only one direct data block per widget, and copied widgets receive a fresh authored identity.
        if(widget.querySelector(':scope > script[slot="data"]') !== block) continue
        if(ids.has(widget.id) && ids.get(widget.id) !== widget) {
          const source = [...this.#bindings.values()].find(binding => binding.widget.id === widget.id && binding.format === block.type)
          if(source) {
            this.#defaults.set(block, {format: block.type, text: source.defaults})
            block.textContent = source.defaults
          }
          widget.id = `ww${crypto.randomUUID()}`
        }
        else if(!widget.id) widget.id = `ww${crypto.randomUUID()}`
        ids.set(widget.id, widget)
        const shared = widget.getAttribute("shared")
        if(shared !== null && shared !== "" && shared !== "group") {
          const previous = this.#bindings.get(block)
          if(previous) { block.textContent = previous.defaults; this.#dispose(previous); this.#bindings.delete(block) }
          this.#error(block, new TypeError("Unknown widget sharing mode")); continue
        }
        const mode: WidgetDataMode = shared === null ? "individual" : shared === "group" ? "group" : "all"
        const key = `${this.documentId}:${widget.id}:${mode}:${block.type}`
        let binding = this.#bindings.get(block)
        if(binding && binding.key !== key) {
          this.#dispose(binding); this.#bindings.delete(block); binding = undefined
          // Switching scopes never publishes the previous participant's snapshot.
          block.textContent = this.defaults(block)
        }
        if(!binding) {
          const defaults = this.defaults(block)
          try {
            const before = parse(block, defaults)
            const portable = serialize(block, before)
            binding = {block, widget, key, mode, format: block.type, defaults: block.type === "application/json" ? portable : defaults, before, ready: false, disposed: false}
            this.#defaults.set(block, {format: block.type, text: binding.defaults})
            this.#bindings.set(block, binding)
            const request: WidgetDataRequest = {document: this.documentId, widget: widget.id, mode, format: block.type === "application/json" ? "json" : "xml"}
            const connection = this.options.resolve?.(request) ?? (this.serverUrl && this.sessionId ? this.#network(request, binding) : this.#offline(request))
            if(connection instanceof Promise) void connection.then(value => this.#connect(binding!, value)).catch(error => { if(!binding!.disposed) this.#error(block, error) })
            else this.#connect(binding, connection)
          }
          catch(error) { this.#error(block, error) }
        }
        else if(binding.ready) this.#commit(binding)
      }
    }
    finally { this.#busy = false }
  }

  #connect(binding: Binding, connection: WidgetDataConnection) {
    if(binding.disposed || this.#destroyed) { connection.destroy?.(); return }
    binding.connection = connection
    const ready = () => {
      if(binding.disposed || this.#destroyed) return
      const data = connection.doc.getMap("data")
      if(!data.has("value")) connection.doc.transact(() => data.set("value", mirrorValue(binding.before)), this.#origin)
      binding.undo = new Y.UndoManager(data, {trackedOrigins: new Set([this.#origin])})
      stampUndo(binding.undo)
      if(this.#grouping) this.#group(binding.undo)
      binding.observe = () => {
        // Notify outside the Yjs transaction, so widget callbacks start their own operations.
        if(binding.queued) return
        binding.queued = true
        queueMicrotask(() => { binding.queued = false; if(!binding.disposed) this.#render(binding) })
      }
      binding.flush = () => { if(!this.#busy && binding.ready) this.#commit(binding) }
      connection.doc.on("beforeTransaction", binding.flush)
      data.observeDeep(binding.observe)
      binding.ready = true
      this.#render(binding, false)
    }
    if(connection.ready) void connection.ready.then(ready).catch(error => this.#error(binding.block, error))
    else ready()
  }

  #commit(binding: Binding) {
    if(binding.disposed || binding.block.type !== binding.format || !this.root.contains(binding.widget)) return
    try {
      const after = parse(binding.block, binding.block.textContent ?? "")
      if(equal(after, binding.before)) return
      // Validate that the accepted snapshot can be represented in an HTML data block.
      serialize(binding.block, after)
      const before = binding.before
      binding.before = after
      const doc = binding.connection!.doc
      doc.transact(() => {
        const data = doc.getMap("data"), current = data.get("value")
        if(object(before) && object(after) && current instanceof Y.Map) reconcile(current, before, after)
        else data.set("value", mirrorValue(after))
      }, this.#origin)
    }
    catch(error) { this.#error(binding.block, error) }
  }

  #render(binding: Binding, captureWrites = true) {
    if(binding.block.type !== binding.format || !this.root.contains(binding.widget)) return
    try {
      // Capture writes made since the last snapshot before replacing its DOM representation.
      if(captureWrites) this.#commit(binding)
      const value = readValue(binding.connection!.doc.getMap("data").get("value"))
      const text = serialize(binding.block, value)
      binding.before = value
      if(binding.block.textContent !== text) binding.block.textContent = text
      const Event = binding.block.ownerDocument.defaultView?.CustomEvent ?? CustomEvent
      binding.block.dispatchEvent(new Event("datachange", {bubbles: true, detail: {mode: binding.mode}}))
    }
    catch(error) { this.#error(binding.block, error) }
  }

  #error(block: HTMLScriptElement, error: unknown) {
    const Event = block.ownerDocument.defaultView?.CustomEvent ?? CustomEvent
    block.dispatchEvent(new Event("dataerror", {bubbles: true, detail: {message: error instanceof Error ? error.message : String(error)}}))
  }

  async #network(request: WidgetDataRequest, binding: Binding): Promise<WidgetDataConnection> {
    const endpoint = new URL("/api/widget-data/resolve", this.serverUrl!.replace(/^ws/, "http"))
    const resolveScope = async () => {
      const response = await fetch(endpoint, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)})
      if(!response.ok) throw new Error(`Widget data scope could not be resolved (${response.status})`)
      const result = await response.json()
      if(typeof result.room !== "string" || !result.room.startsWith("widget-data-") || typeof result.token !== "string") throw new TypeError("Invalid widget data connection")
      return result as {room: string, token: string}
    }
    const {room, token} = await resolveScope()
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(this.serverUrl!, room, doc, {params: {token}, disableBc: true, connect: false})
    const ready = new Promise<void>(resolve => provider.on("sync", (synced: boolean) => { if(synced) resolve() }))
    const handler = provider.messageHandlers[messageSync]
    provider.messageHandlers[messageSync] = (...args) => { if(binding.ready) this.#commit(binding); handler(...args) }
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const reconnect = async () => {
      if(stopped || binding.disposed) return
      try {
        const scope = await resolveScope()
        if(stopped || binding.disposed) return
        if(scope.room !== room) {
          // A changed server assignment must never receive the previous scope's CRDT updates.
          this.#dispose(binding)
          this.#bindings.delete(binding.block)
          binding.block.textContent = binding.defaults
          this.sync()
          return
        }
        provider.params.token = scope.token
        provider.connect()
      }
      catch(error) {
        if(stopped || binding.disposed) return
        this.#error(binding.block, error)
        retry = setTimeout(reconnect, 2500)
      }
    }
    provider.on("connection-close", () => {
      if(stopped || binding.disposed) return
      // Renew capabilities and reauthorize before the provider's automatic retry.
      provider.shouldConnect = false
      retry = setTimeout(reconnect, 100)
    })
    provider.connect()
    return {doc, ready, destroy: () => { stopped = true; clearTimeout(retry); provider.destroy(); doc.destroy() }}
  }

  #offline(request: WidgetDataRequest): WidgetDataConnection {
    // Group membership requires an authoritative resolver, even when offline.
    if(request.mode === "group") throw new Error("Group widget data requires a server scope resolver")
    const key = JSON.stringify([request.document, request.widget, request.format, request.mode, request.mode === "individual" ? this.options.userId ?? "local-development" : "all"])
    const existing = this.#local.get(key)
    if(existing) return existing
    const doc = new Y.Doc()
    let storage: Storage | undefined
    try { storage = this.root.ownerDocument.defaultView?.localStorage }
    catch { /* Storage access itself may be forbidden in a sandboxed frame. */ }
    const storageKey = `webwriter-widget-data:${key}`
    try {
      const stored = storage?.getItem(storageKey)
      if(stored) Y.applyUpdate(doc, Uint8Array.from(JSON.parse(stored)))
    }
    catch { /* Opaque origins and unavailable storage still support in-memory editing. */ }
    doc.on("update", () => {
      try { storage?.setItem(storageKey, JSON.stringify([...Y.encodeStateAsUpdate(doc)])) }
      catch { /* Storage quota does not prevent live editing. */ }
    })
    const connection = {doc}
    this.#local.set(key, connection)
    return connection
  }

  history(kind: "undo" | "redo") {
    return [...this.#bindings.values()].flatMap(binding => binding.undo ? [binding.undo] : [])
      .filter(manager => (kind === "undo" ? manager.undoStack : manager.redoStack).length)
      .sort((a, b) => Number((kind === "undo" ? b.undoStack : b.redoStack).at(-1)?.meta.get(widgetDataHistoryTime) ?? 0)
        - Number((kind === "undo" ? a.undoStack : a.redoStack).at(-1)?.meta.get(widgetDataHistoryTime) ?? 0))[0]
  }

  stopCapturing() { for(const binding of this.#bindings.values()) binding.undo?.stopCapturing() }

  #group(manager: Y.UndoManager) {
    this.#captureTimeouts.set(manager, manager.captureTimeout)
    manager.captureTimeout = Infinity
  }

  startUndoGroup() {
    this.#grouping = true
    for(const binding of this.#bindings.values()) if(binding.undo) this.#group(binding.undo)
  }

  endUndoGroup() {
    this.#grouping = false
    for(const binding of this.#bindings.values()) {
      if(binding.undo) binding.undo.captureTimeout = this.#captureTimeouts.get(binding.undo) ?? binding.undo.captureTimeout
    }
  }

  /** Normal exports contain authored defaults; participant snapshots are explicit. */
  writeDefaults(clone: ParentNode, current = false) {
    for(const binding of this.#bindings.values()) {
      clone.querySelectorAll('[id]').forEach(widget => {
        if(widget.id !== binding.widget.id) return
        const block = widget.querySelector(':scope > script[slot="data"]')
        if(block) block.textContent = current && binding.ready
          ? serialize(binding.block, readValue(binding.connection!.doc.getMap("data").get("value"))) : binding.defaults
      })
    }
  }

  #dispose(binding: Binding) {
    binding.disposed = true
    if(binding.observe) binding.connection?.doc.getMap("data").unobserveDeep(binding.observe)
    if(binding.flush) binding.connection?.doc.off("beforeTransaction", binding.flush)
    binding.undo?.destroy()
    binding.connection?.destroy?.()
  }

  destroy() {
    this.#destroyed = true
    for(const binding of this.#bindings.values()) {
      if(this.root.contains(binding.block)) binding.block.textContent = binding.defaults
      this.#dispose(binding)
    }
    this.#bindings.clear()
    for(const connection of this.#local.values()) connection.doc.destroy()
    this.#local.clear()
  }
}
