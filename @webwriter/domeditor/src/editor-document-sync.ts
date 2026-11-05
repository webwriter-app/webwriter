import * as Y from "yjs"
import type {SharedDOMDoc} from "./domdoc"
import {decodeSharedDOMAttribute, INTERNAL_NAMESPACE, INTERNAL_NODE_KIND} from "./domdoc-codec"
import type {ReadableElement, ReadableNode} from "./dom-readers"
import {hasClass} from "./dom-readers"
import {clearInlinePlacement} from "./utility"
import {boardLayoutRole, documentLayoutMode, emptyLayoutPlacementValues, slideLayoutRole} from "./document-layout"

export type DocumentDoctype = {name: string, publicId: string, systemId: string} | null
export type EditorDocumentUpdate = {
  type: "editor-frame-update"
  replicaId: string
  sequence: number
  reset: boolean
  update: Uint8Array
  doctype?: DocumentDoctype
  widgetDataDocumentId?: string
}

export function isEditorDocumentUpdate(value: unknown): value is EditorDocumentUpdate {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<EditorDocumentUpdate>
  return message.type === "editor-frame-update" && typeof message.replicaId === "string"
    && Number.isSafeInteger(message.sequence) && message.sequence! > 0 && typeof message.reset === "boolean"
    && message.update instanceof Uint8Array && (message.doctype === undefined || message.doctype === null
      || typeof message.doctype === "object" && [message.doctype.name, message.doctype.publicId, message.doctype.systemId].every(value => typeof value === "string"))
    && (message.widgetDataDocumentId === undefined || typeof message.widgetDataDocumentId === "string")
}

/** A one-way transport of the existing mirror, including remote and history
 * updates. Private review branches get their own baseline and never merge into
 * the committed document merely because the host displayed them. */
export function publishEditorDocument(shared: SharedDOMDoc, replicaId: string, post: (message: EditorDocumentUpdate) => void) {
  let sequence = 0
  let current: Y.Doc | null = null
  const update = (bytes: Uint8Array) => post({type: "editor-frame-update", replicaId, sequence: ++sequence, reset: false, update: bytes})
  const reset = () => {
    if(!current) return
    const doctype = shared.root.ownerDocument.doctype
    post({type: "editor-frame-update", replicaId, sequence: ++sequence, reset: true,
      update: Y.encodeStateAsUpdate(current), widgetDataDocumentId: shared.widgetData.documentId,
      doctype: doctype ? {name: doctype.name, publicId: doctype.publicId, systemId: doctype.systemId} : null})
  }
  shared.flushDOMChanges()
  const stop = shared.observeRenderedDoc(doc => {
    current?.off("update", update)
    current = doc
    current.on("update", update)
    reset()
  })
  const destroy = () => {
    stop()
    current?.off("update", update)
    current = null
    shared.doc.off("destroy", destroy)
  }
  shared.doc.on("destroy", destroy)
  return {
    flush() { shared.flushDOMChanges() },
    reset() { shared.flushDOMChanges(); reset() },
    destroy,
  }
}

/** Receive-only access to shared types. The element objects below are lazy
 * read views, not a second DOM tree; no DOM nodes, observers, undo managers,
 * awareness clients or websocket providers are created in the host. */
export class EditorDocumentReplica {
  readonly doc = new Y.Doc()
  readonly #nodes = new WeakMap<Y.XmlElement | Y.XmlText, ReadableNode>()
  readonly #children = new WeakMap<Y.XmlElement, {nodes: ReadableNode[], elements: ReadableElement[]}>()
  readonly #attributes = new WeakMap<Y.XmlElement, ReadableElement["attributes"]>()
  readonly doctype: DocumentDoctype
  readonly widgetDataDocumentId?: string
  readonly #document: {readonly body: ReadableElement, readonly documentElement: ReadableElement}

  constructor(message: EditorDocumentUpdate) {
    this.doctype = message.doctype ?? null
    this.widgetDataDocumentId = message.widgetDataDocumentId
    const replica = this
    this.#document = {get body() { return replica.body! }, get documentElement() { return replica.documentElement! }}
    this.doc.on("beforeObserverCalls", transaction => {
      for(const [type, keys] of transaction.changed) {
        if(type instanceof Y.XmlElement) {
          if(keys.has(null)) this.#children.delete(type)
          if([...keys].some(key => key !== null)) this.#attributes.delete(type)
          if(keys.has(INTERNAL_NODE_KIND) && type.parent instanceof Y.XmlElement) this.#children.delete(type.parent)
        }
        else if(type instanceof Y.Map && keys.has("language")) {
          const root = this.#scope("attributes")
          if(root) this.#attributes.delete(root)
        }
      }
    })
    try { this.apply(message.update) }
    catch(error) { this.doc.destroy(); throw error }
  }

  #scope(name: "body" | "head" | "attributes"): Y.XmlElement | null {
    const mirror = this.doc.getMap("domeditor").get("document")
    const scope = mirror instanceof Y.Map ? mirror.get(name) : this.doc.getXmlElement(name === "head" ? "document-head" : name === "attributes" ? "document-attributes" : name)
    return scope instanceof Y.XmlElement ? scope : null
  }

  get body() { const node = this.#scope("body"); return node ? this.#view(node) as ReadableElement : null }
  get head() { const node = this.#scope("head"); return node ? this.#view(node) as ReadableElement : null }
  get documentElement() { const node = this.#scope("attributes"); return node ? this.#view(node) as ReadableElement : null }

  apply(update: Uint8Array) { Y.applyUpdate(this.doc, update, this) }
  destroy() { this.doc.destroy() }

  #readChildren(node: Y.XmlElement) {
    const cached = this.#children.get(node)
    if(cached) return cached
    const nodes = node.toArray().flatMap(child => child instanceof Y.XmlElement || child instanceof Y.XmlText ? [this.#view(child)] : [])
    const result = {nodes, elements: nodes.filter(child => child.nodeType === 1) as ReadableElement[]}
    this.#children.set(node, result)
    return result
  }

  hasAuthoredText() {
    const visit = (node: Y.XmlElement | Y.XmlText): boolean => {
      if(node instanceof Y.XmlText) return Boolean(node.toString().trim())
      if(node.hasAttribute(INTERNAL_NODE_KIND)) return false
      const namespace = node.getAttribute(INTERNAL_NAMESPACE)
      if(node.nodeName === "template" && (namespace === undefined || namespace === "http://www.w3.org/1999/xhtml")) return false
      if(node.nodeName === "nav" && slideLayoutRole(this.#view(node) as ReadableElement) === "navigation") return false
      // Walk siblings lazily: reading the first paragraph must not allocate
      // views or arrays for every other node of a large unsaved document.
      for(let child = node.firstChild; child; child = child.nextSibling) if(visit(child)) return true
      return false
    }
    const body = this.#scope("body")
    return body ? visit(body) : false
  }

  /** Non-mutating counterpart of the empty-layout check used by the chooser. */
  isPristineLayout() {
    const body = this.body
    if(!body || this.hasAuthoredText()) return false
    const mode = documentLayoutMode(body)
    const empty = (node: ReadableNode): boolean => {
      if(node.nodeType === 3) return !node.textContent?.trim()
      if(node.nodeType !== 1) return false
      const element = node as ReadableElement
      const attrs = Array.from(element.attributes)
      if(mode === "slides" && slideLayoutRole(element) === "navigation") return true
      const slideRole = slideLayoutRole(element)
      const boardRole = boardLayoutRole(element)
      const generatedClass = slideRole === "viewport" ? "ww-slides-viewport" : slideRole === "slide" ? "ww-slide"
        : boardRole === "column" ? "ww-board-column" : boardRole === "group" ? "ww-board-group" : boardRole === "card" ? "ww-board-card" : null
      if(generatedClass) {
        if(element.getAttribute("class") !== generatedClass || attrs.some(attr => attr.name !== "class" && !(mode === "slides" && element.localName === "section"
          && (attr.name === "tabindex" && attr.value === "-1" || attr.name === "id" && /^slide-[0-9a-f-]{36}$/i.test(attr.value))))) return false
        return Array.from(element.childNodes).every(empty)
      }
      if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(element.localName) || attrs.some(attr => attr.name !== "style")) return false
      const style = document.createElement("span").style
      style.cssText = element.getAttribute("style") ?? ""
      if(Array.from(style).some(name => !emptyLayoutPlacementValues[name]?.includes(style.getPropertyValue(name)) || style.getPropertyPriority(name))) return false
      return Array.from(element.childNodes).every(child => child.nodeType === 3 ? !child.textContent?.trim()
        : child.nodeType === 1 && (child as ReadableElement).localName === "br" && !(child as ReadableElement).attributes.length)
    }
    return Array.from(body.childNodes).every(empty)
  }

  #view(node: Y.XmlElement | Y.XmlText): ReadableNode {
    const replica = this
    const kind = node instanceof Y.XmlText ? 3 : node.getAttribute(INTERNAL_NODE_KIND) === "comment" ? 8
      : node.getAttribute(INTERNAL_NODE_KIND) === "processing-instruction" ? 7 : 1
    const cached = this.#nodes.get(node)
    if(cached?.nodeType === kind) return cached
    const parent = () => {
      if(node === this.#scope("body") || node === this.#scope("head")) return this.documentElement
      return node.parent instanceof Y.XmlElement ? this.#view(node.parent) as ReadableElement : null
    }
    const view: ReadableNode | ReadableElement = kind !== 1 ? {
      nodeType: kind, get parentElement() { return parent() },
      get textContent() { return node instanceof Y.XmlText ? node.toString() : node.toArray().map(child => child.toString()).join("") },
    } : {
      nodeType: 1,
      get localName() { return node === replica.#scope("attributes") ? "html" : node === replica.#scope("head") ? "head" : (node as Y.XmlElement).nodeName },
      get namespaceURI() { const value = (node as Y.XmlElement).getAttribute(INTERNAL_NAMESPACE); return value === "" ? null : value ?? "http://www.w3.org/1999/xhtml" },
      get parentElement() { return parent() },
      get ownerDocument() { return replica.#document },
      get id() { return Array.from(this.attributes).find(attr => attr.namespaceURI === null && attr.name === "id")?.value ?? "" },
      get attributes() {
        const cached = replica.#attributes.get(node as Y.XmlElement)
        if(cached) return cached
        const attrs = Object.entries((node as Y.XmlElement).getAttributes()).flatMap(([key, value]) => {
          const attr = key === "class" ? {name: "class", namespaceURI: null} : decodeSharedDOMAttribute(key)
          return attr ? [{...attr, value: String(value)}] : []
        })
        if(node === replica.#scope("attributes")) {
          const mirror = replica.doc.getMap("domeditor").get("document")
          const metadata = mirror instanceof Y.Map ? mirror.get("metadata") : replica.doc.getMap("head")
          const language = metadata instanceof Y.Map ? metadata.get("language") : null
          if(typeof language === "string" && language) attrs.push({name: "lang", namespaceURI: null, value: language})
        }
        replica.#attributes.set(node as Y.XmlElement, attrs)
        return attrs
      },
      getAttribute(name: string) { return Array.from(this.attributes).find(attr => attr.name === name)?.value ?? null },
      hasAttribute(name: string) { return this.getAttribute(name) !== null },
      get childNodes() {
        if(node === replica.#scope("attributes")) return [replica.head!, replica.body!].filter(Boolean)
        // Template content is a separate DOM tree and has no body-relative paths.
        if(this.localName === "template" && this.namespaceURI === "http://www.w3.org/1999/xhtml") return []
        return replica.#readChildren(node as Y.XmlElement).nodes
      },
      get children() {
        if(node === replica.#scope("attributes")) return [replica.head!, replica.body!].filter(Boolean)
        if(this.localName === "template" && this.namespaceURI === "http://www.w3.org/1999/xhtml") return []
        return replica.#readChildren(node as Y.XmlElement).elements
      },
      get textContent() { return Array.from(this.childNodes).filter(child => child.nodeType !== 8 && child.nodeType !== 7).map(child => child.textContent ?? "").join("") },
    } satisfies ReadableElement
    this.#nodes.set(node, view)
    return view
  }

  /** Compare authored content, excluding CRDT bookkeeping and browser empty
   * text placeholders. This is used only for small, unsaved fresh documents. */
  authoredSignature() {
    const visit = (node: Y.XmlElement | Y.XmlText): unknown => {
      if(node instanceof Y.XmlText) return [3, node.toString()]
      const view = this.#view(node)
      if(view.nodeType !== 1) return [view.nodeType, view.textContent]
      const element = view as ReadableElement
      const attrs = Array.from(element.attributes).filter(attr => attr.name !== "style" || attr.value !== "")
        .map(attr => [attr.namespaceURI, attr.name, attr.value]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      let children = node.toArray() as (Y.XmlElement | Y.XmlText)[]
      if(["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(element.localName)
        && children.every(child => child instanceof Y.XmlText ? !child.toString() : child.nodeName === "br" && !(this.#view(child) as ReadableElement).attributes.length)) children = []
      if(node === this.#scope("body") && documentLayoutMode(element) === "canvas" && children.length === 1) {
        const child = children[0]
        if(child instanceof Y.XmlElement && child.nodeName === "p") {
          const paragraph = this.#view(child) as ReadableElement
          if(Array.from(paragraph.childNodes).every(node => node.nodeType === 3 && !node.textContent
            || node.nodeType === 1 && (node as ReadableElement).localName === "br" && !(node as ReadableElement).attributes.length)
            && Array.from(paragraph.attributes).every(attr => attr.name === "style")) {
            const placeholder = document.createElement("p")
            placeholder.setAttribute("style", paragraph.getAttribute("style") ?? "")
            clearInlinePlacement(placeholder)
            if(!placeholder.attributes.length) children = []
          }
        }
      }
      return [element.namespaceURI, element.localName, attrs, children.map(visit)]
    }
    return JSON.stringify([this.#scope("attributes"), this.#scope("head"), this.#scope("body")].map(node => node ? visit(node) : null))
  }
}
