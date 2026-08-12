import * as Y from "yjs"
import {Awareness} from "y-protocols/awareness"
import {WebsocketProvider} from "y-websocket"
import {isComment, isDocument, isElement, isText} from "./utility"
import type {EditorStateSnapshot} from "./editor-state"

const INTERNAL_NODE_KIND = "__domeditor_node_kind"
const INTERNAL_NAMESPACE = "__domeditor_namespace"
const COMMENT_NODE_NAME = "domeditor-comment"
const COMMENT_NODE_KIND = "comment"
const INITIALIZED_KEY = "initialized"

const presenceColors = [
  "#e11d48",
  "#db2777",
  "#9333ea",
  "#4f46e5",
  "#2563eb",
  "#0284c7",
  "#0891b2",
  "#0d9488",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
]

export type YXmlNode = Y.XmlFragment | Y.XmlElement | Y.XmlText
export type YXmlContainer = Y.XmlFragment | Y.XmlElement
export type EditingMutation = MutationRecord | {
  type: "selection"
  anchorNode: Node
  anchorOffset?: number
  focusNode: Node
  focusOffset?: number
}
export type YDelta = Y.YXmlEvent["delta"][number]

export type CollaborationUser = {
  name?: string
  color?: string
}

export type RelativeSelection = {
  anchor: Y.RelativePosition
  focus: Y.RelativePosition
}

export type DOMSelection = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

export type SharedDOMDocOptions = {
  root?: HTMLElement
  ydoc?: Y.Doc
  awareness?: Awareness
  connect?: boolean
  user?: CollaborationUser
}

/** Returns a stable, readable default color for an awareness client. */
export function presenceColor(clientId: number) {
  return presenceColors[Math.abs(clientId) % presenceColors.length]
}

function longestOrderedSubset<T>(current: T[], desired: T[]) {
  const positions = new Map(current.map((value, index) => [value, index]))
  const values = desired.filter(value => positions.has(value))
  const tails: number[] = []
  const tailIndices: number[] = []
  const previous = new Array(values.length).fill(-1)

  values.forEach((value, valueIndex) => {
    const position = positions.get(value)!
    let low = 0
    let high = tails.length
    while(low < high) {
      const middle = (low + high) >> 1
      if(tails[middle] < position) low = middle + 1
      else high = middle
    }
    if(low > 0) previous[valueIndex] = tailIndices[low - 1]
    tails[low] = position
    tailIndices[low] = valueIndex
  })

  const retained = new Set<T>()
  let index = tailIndices.at(-1) ?? -1
  while(index >= 0) {
    retained.add(values[index])
    index = previous[index]
  }
  return retained
}

/**
 * Keeps one Y.XmlElement tree and one DOM body structurally synchronized.
 *
 * DOM mutation batches are reconciled in a single Yjs transaction. Remote
 * Yjs transactions, including UndoManager transactions, use the inverse
 * reconciler. Unchanged nodes stay paired, which keeps widget instances and
 * Yjs relative positions stable while still handling arbitrary direct DOM
 * changes (innerHTML, normalize(), node moves, attributes, and comments).
 */
export class SharedDOMDoc {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly provider?: WebsocketProvider
  readonly root: HTMLElement

  readonly #body: Y.XmlElement
  readonly #metadata: Y.Map<unknown>
  readonly #undoManager: Y.UndoManager
  readonly #observer: MutationObserver
  readonly #domOrigin = {source: "domeditor-dom"}
  readonly #initialOrigin = {source: "domeditor-initial"}
  readonly #remoteReactionOrigin = {source: "domeditor-remote-reaction"}
  readonly #nodes = new WeakMap<YXmlNode, Node>()
  readonly #xmlNodes = new WeakMap<Node, YXmlNode>()
  readonly #document: Document

  #relativeSelection: RelativeSelection | null = null
  #isWritingToDOM = false
  #isObserving = false

  constructor(
    readonly serverUrl?: string,
    readonly sessionId?: string,
    readonly ignoreAttrs: string[] = [],
    readonly ignoreClasses: string[] = [],
    options: SharedDOMDocOptions = {},
  ) {
    this.root = options.root ?? document.body
    this.#document = this.root.ownerDocument
    this.doc = options.ydoc ?? new Y.Doc()
    this.#body = this.doc.getXmlElement("body")
    this.#metadata = this.doc.getMap("domeditor")
    this.awareness = options.awareness ?? new Awareness(this.doc as any)

    if((this.awareness as any).doc !== this.doc) {
      throw new TypeError("Awareness and SharedDOMDoc must use the same Y.Doc")
    }

    this.#addNodePair(this.root, this.#body)
    this.#body.observeDeep(this.#handleYChanges)

    const hasSharedDOM = this.#metadata.get(INITIALIZED_KEY) === true ||
      this.#body.length > 0 || Object.keys(this.#body.getAttributes()).length > 0
    if(hasSharedDOM) {
      if(this.#metadata.get(INITIALIZED_KEY) !== true) {
        this.doc.transact(() => this.#metadata.set(INITIALIZED_KEY, true), this.#initialOrigin)
      }
      this.#writeYToDOM()
    }
    else {
      this.doc.transact(() => {
        this.#metadata.set(INITIALIZED_KEY, true)
        this.#reconcileYElement(this.root, this.#body)
      }, this.#initialOrigin)
    }

    this.#undoManager = new Y.UndoManager(this.#body, {
      trackedOrigins: new Set([this.#domOrigin]),
    })

    this.#observer = new MutationObserver(this.#handleDOMChanges)
    this.startObserve()

    const defaultUser: CollaborationUser = {
      name: `User ${this.doc.clientID.toString(36).toUpperCase()}`,
      color: presenceColor(this.doc.clientID),
      ...options.user,
    }
    this.setUser(defaultUser)

    if(this.serverUrl && this.sessionId) {
      this.provider = new WebsocketProvider(this.serverUrl, this.sessionId, this.doc as any, {
        awareness: this.awareness,
        connect: options.connect ?? true,
      })
    }
  }

  get body() {
    return this.#body
  }

  /** Kept as a shared map for document-head metadata used by callers. */
  get head() {
    return this.doc.getMap("head")
  }

  get selection() {
    return this.#absoluteSelection(this.#relativeSelection)
  }

  get domSelection() {
    return this.#domSelection(this.#relativeSelection)
  }

  /** Serializes the shared tree and its stable relative selection so another
   * iframe realm can resume the same CRDT document without duplicating it. */
  snapshot(): EditorStateSnapshot {
    this.syncFromDOM()
    this.updateLocalSelection()
    const selection = this.#relativeSelection
    return {
      update: Array.from(Y.encodeStateAsUpdate(this.doc)),
      ...(selection ? {
        selection: {
          anchor: Y.relativePositionToJSON(selection.anchor),
          focus: Y.relativePositionToJSON(selection.focus),
        },
      } : {}),
    }
  }

  /** Restores a selection serialized by snapshot() after the shared DOM has
   * been reconstructed in a new document. */
  restoreSelection(selection: EditorStateSnapshot["selection"]) {
    if(!selection) return
    try {
      this.#relativeSelection = {
        anchor: Y.createRelativePositionFromJSON(selection.anchor),
        focus: Y.createRelativePositionFromJSON(selection.focus),
      }
      this.awareness.setLocalStateField("selection", this.#relativeSelection)
      this.writeSelection()
    }
    catch {
      this.clearSelection()
    }
  }

  get isWritingToDOM() {
    return this.#isWritingToDOM
  }

  startObserve() {
    if(this.#isObserving) return
    this.#observer.observe(this.root, {
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true,
    })
    this.#isObserving = true
  }

  stopObserve() {
    this.#observer.disconnect()
    this.#isObserving = false
  }

  setUser(user: CollaborationUser) {
    const previous = this.awareness.getLocalState()?.user as CollaborationUser | undefined
    this.awareness.setLocalStateField("user", {...previous, ...user})
  }

  setSelection(anchorNode: YXmlNode, anchorOffset = 0, focusNode = anchorNode, focusOffset = anchorOffset) {
    const selection = {
      anchor: Y.createRelativePositionFromTypeIndex(anchorNode, anchorOffset),
      focus: Y.createRelativePositionFromTypeIndex(focusNode, focusOffset),
    }
    this.#relativeSelection = selection
    this.awareness.setLocalStateField("selection", selection)
  }

  clearSelection() {
    this.#relativeSelection = null
    this.awareness.setLocalStateField("selection", null)
  }

  updateLocalSelection(selection: Selection | null = this.#document.getSelection()) {
    if(!selection?.anchorNode || !selection.focusNode) {
      this.clearSelection()
      return
    }
    const anchor = this.relativePositionFromDOMPoint(selection.anchorNode, selection.anchorOffset)
    const focus = this.relativePositionFromDOMPoint(selection.focusNode, selection.focusOffset)
    if(!anchor || !focus) {
      this.clearSelection()
      return
    }
    this.#relativeSelection = {anchor, focus}
    this.awareness.setLocalStateField("selection", this.#relativeSelection)
  }

  relativePositionFromDOMPoint(node: Node, offset = 0) {
    if(node !== this.root && !this.root.contains(node)) return null
    const yNode = this.#xmlNodes.get(node)
    if(!yNode) return null

    if(yNode instanceof Y.XmlText) {
      return Y.createRelativePositionFromTypeIndex(yNode, Math.min(offset, yNode.length))
    }
    if(yNode instanceof Y.XmlElement || yNode instanceof Y.XmlFragment) {
      const children = Array.from(node.childNodes)
      const yOffset = children.slice(0, offset).filter(child => this.#isSyncableNode(child)).length
      return Y.createRelativePositionFromTypeIndex(yNode, Math.min(yOffset, yNode.length))
    }
    return null
  }

  domPointFromRelativePosition(position: Y.RelativePosition) {
    let absolute: Y.AbsolutePosition | null
    try {
      absolute = Y.createAbsolutePositionFromRelativePosition(position, this.doc)
    }
    catch {
      return null
    }
    if(!absolute) return null
    const node = this.#nodes.get(absolute.type as YXmlNode)
    if(!node || (node !== this.root && !this.root.contains(node))) return null

    if(node instanceof Text) {
      return {node, offset: Math.min(absolute.index, node.length)}
    }
    const yContainer = absolute.type as YXmlContainer
    const yChildren = yContainer.toArray()
    const nextYChild = yChildren[absolute.index] as YXmlNode | undefined
    if(nextYChild) {
      const nextDOMChild = this.#nodes.get(nextYChild)
      if(nextDOMChild?.parentNode === node) {
        return {node, offset: Array.from(node.childNodes).indexOf(nextDOMChild as ChildNode)}
      }
    }
    const syncableChildren = Array.from(node.childNodes).filter(child => this.#isSyncableNode(child))
    const previous = syncableChildren[absolute.index - 1]
    const offset = previous
      ? Array.from(node.childNodes).indexOf(previous as ChildNode) + 1
      : 0
    return {node, offset}
  }

  domSelectionForClient(clientId: number) {
    const state = this.awareness.getStates().get(clientId)
    return this.#domSelection(this.#readRelativeSelection(state?.selection))
  }

  writeSelection(selection: RelativeSelection | null = this.#relativeSelection) {
    const domSelection = this.#domSelection(selection)
    const selectionAPI = this.#document.getSelection()
    if(!domSelection || !selectionAPI) return
    try {
      selectionAPI.setBaseAndExtent(
        domSelection.anchorNode,
        domSelection.anchorOffset,
        domSelection.focusNode,
        domSelection.focusOffset,
      )
    }
    catch {
      // A concurrently deleted selection endpoint can become unresolvable
      // between resolving the relative position and applying it to the DOM.
    }
  }

  /** Reconciles the current DOM immediately; MutationObserver normally calls this. */
  syncFromDOM(origin: unknown = this.#domOrigin) {
    if(this.#isWritingToDOM) return
    this.doc.transact(() => this.#reconcileYElement(this.root, this.#body), origin)
    const selection = this.#document.getSelection()
    if(selection?.anchorNode && selection.focusNode &&
      (selection.anchorNode === this.root || this.root.contains(selection.anchorNode)) &&
      (selection.focusNode === this.root || this.root.contains(selection.focusNode))) {
      this.updateLocalSelection(selection)
    }
  }

  readDomMutation(mutation: EditingMutation | EditingMutation[]) {
    const mutations = Array.isArray(mutation) ? mutation : [mutation]
    const hasDOMMutation = mutations.some(item => item.type !== "selection")
    if(hasDOMMutation) this.syncFromDOM()
    const selectionMutation = [...mutations].reverse().find(item => item.type === "selection")
    if(selectionMutation?.type === "selection") {
      const anchor = this.relativePositionFromDOMPoint(selectionMutation.anchorNode, selectionMutation.anchorOffset)
      const focus = this.relativePositionFromDOMPoint(selectionMutation.focusNode, selectionMutation.focusOffset)
      if(anchor && focus) {
        this.#relativeSelection = {anchor, focus}
        this.awareness.setLocalStateField("selection", this.#relativeSelection)
      }
    }
  }

  domToYxmlNode(node: Document): Y.XmlElement
  domToYxmlNode(node: Element): Y.XmlElement
  domToYxmlNode(node: Text): Y.XmlText
  domToYxmlNode(node: Comment): Y.XmlElement
  domToYxmlNode(node: Node): YXmlNode | null
  domToYxmlNode(node: Node = this.root): YXmlNode | null {
    if(isDocument(node)) return this.#createYNode(node.body, false) as Y.XmlElement
    return this.#createYNode(node, false)
  }

  yxmlToDomNode(node: Y.XmlFragment): DocumentFragment
  yxmlToDomNode(node: Y.XmlElement): Element | Comment
  yxmlToDomNode(node: Y.XmlText): Text
  yxmlToDomNode(node: YXmlNode = this.#body): Node | null {
    if(node === this.#body) {
      const body = this.#document.createElement("body")
      this.#copyYAttributesToDOM(this.#body, body)
      body.append(...node.toArray().flatMap(child => {
        const domNode = this.#createDOMNode(child as YXmlNode, false)
        return domNode ? [domNode] : []
      }))
      return body
    }
    return this.#createDOMNode(node, false)
  }

  stopCapturing() {
    this.#undoManager.stopCapturing()
  }

  undo() {
    this.#undoManager.undo()
  }

  redo() {
    this.#undoManager.redo()
  }

  destroy() {
    this.stopObserve()
    this.#body.unobserveDeep(this.#handleYChanges)
    this.#undoManager.destroy()
    this.provider?.destroy()
    this.doc.destroy()
  }

  readonly #handleDOMChanges = (mutations: MutationRecord[]) => {
    if(this.#isWritingToDOM || !mutations.some(mutation => this.#isRelevantMutation(mutation))) return
    this.syncFromDOM()
  }

  readonly #handleYChanges = (events: Y.YEvent<YXmlNode>[], transaction: Y.Transaction) => {
    if(transaction.origin === this.#domOrigin ||
      transaction.origin === this.#initialOrigin ||
      transaction.origin === this.#remoteReactionOrigin) return
    if(events.length) this.#writeYToDOM()
  }

  #writeYToDOM() {
    if(this.#isWritingToDOM) return
    this.#isWritingToDOM = true
    try {
      this.#reconcileDOMElement(this.#body, this.root)
      this.writeSelection()
      // Drop MutationRecords caused by applying the shared tree. A custom
      // element may have synchronously changed its own light DOM while being
      // connected; reconcile once in the other direction to capture that.
      this.#observer?.takeRecords()
    }
    finally {
      this.#isWritingToDOM = false
    }
    this.syncFromDOM(this.#remoteReactionOrigin)
  }

  #absoluteSelection(selection: RelativeSelection | null) {
    if(!selection) return null
    const anchor = Y.createAbsolutePositionFromRelativePosition(selection.anchor, this.doc)
    const focus = Y.createAbsolutePositionFromRelativePosition(selection.focus, this.doc)
    if(!anchor || !focus) return null
    return {
      anchorNode: anchor.type as YXmlNode,
      anchorOffset: anchor.index,
      focusNode: focus.type as YXmlNode,
      focusOffset: focus.index,
    }
  }

  #domSelection(selection: RelativeSelection | null): DOMSelection | null {
    if(!selection) return null
    const anchor = this.domPointFromRelativePosition(selection.anchor)
    const focus = this.domPointFromRelativePosition(selection.focus)
    return anchor && focus ? {
      anchorNode: anchor.node,
      anchorOffset: anchor.offset,
      focusNode: focus.node,
      focusOffset: focus.offset,
    } : null
  }

  #readRelativeSelection(value: unknown): RelativeSelection | null {
    if(!value || typeof value !== "object") return null
    const selection = value as Partial<RelativeSelection>
    return selection.anchor && selection.focus
      ? {anchor: selection.anchor, focus: selection.focus}
      : null
  }

  #isRelevantMutation(mutation: MutationRecord) {
    if(this.#isInsideIgnoredElement(mutation.target)) return false
    if(mutation.type === "attributes") {
      const name = mutation.attributeName?.toLowerCase()
      if(!name || this.#isIgnoredAttribute(name)) return false
      if(name === "class" && isElement(mutation.target)) {
        return this.#filteredClassValue(mutation.oldValue ?? "") !== this.#filteredClassValue(mutation.target.getAttribute("class") ?? "")
      }
      return true
    }
    if(mutation.type === "childList") {
      return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
        .some(node => this.#isSyncableNode(node))
    }
    return mutation.type === "characterData"
  }

  #isIgnoredAttribute(name: string) {
    return this.ignoreAttrs.some(ignored => ignored.toLowerCase() === name.toLowerCase())
  }

  #isIgnoredClass(name: string) {
    return this.ignoreClasses.some(ignored => name.startsWith(ignored))
  }

  #filteredClassValue(value: string) {
    return value.split(/\s+/).filter(name => name && !this.#isIgnoredClass(name)).join(" ")
  }

  #isInsideIgnoredElement(node: Node) {
    const element = isElement(node) ? node : node.parentElement
    return Boolean(element?.closest(".◆editor-only"))
  }

  #isSyncableNode(node: Node) {
    return (isElement(node) || isText(node) || isComment(node)) && !this.#isInsideIgnoredElement(node)
  }

  #isYComment(node: YXmlNode): node is Y.XmlElement {
    return node instanceof Y.XmlElement && node.getAttribute(INTERNAL_NODE_KIND) === COMMENT_NODE_KIND
  }

  #isCompatiblePair(domNode: Node, yNode: YXmlNode) {
    if(isText(domNode)) return yNode instanceof Y.XmlText
    if(isComment(domNode)) return this.#isYComment(yNode)
    if(!isElement(domNode) || !(yNode instanceof Y.XmlElement) || this.#isYComment(yNode)) return false
    const namespace = yNode.getAttribute(INTERNAL_NAMESPACE) || this.#document.documentElement.namespaceURI
    return domNode.localName === yNode.nodeName && domNode.namespaceURI === namespace
  }

  #addNodePair(node: Node, yNode: YXmlNode) {
    this.#nodes.set(yNode, node)
    this.#xmlNodes.set(node, yNode)
  }

  #createYNode(node: Node, addPair = true): YXmlNode | null {
    if(isText(node)) {
      const yText = new Y.XmlText(node.data)
      if(addPair) this.#addNodePair(node, yText)
      return yText
    }
    if(isComment(node)) {
      const yComment = new Y.XmlElement(COMMENT_NODE_NAME)
      yComment.setAttribute(INTERNAL_NODE_KIND, COMMENT_NODE_KIND)
      const yText = new Y.XmlText(node.data)
      yComment.insert(0, [yText])
      if(addPair) this.#addNodePair(node, yComment)
      return yComment
    }
    if(!isElement(node) || this.#isInsideIgnoredElement(node)) return null

    const yElement = new Y.XmlElement(node.localName)
    if(node.namespaceURI && node.namespaceURI !== this.#document.documentElement.namespaceURI) {
      yElement.setAttribute(INTERNAL_NAMESPACE, node.namespaceURI)
    }
    for(const attribute of Array.from(node.attributes)) {
      if(this.#isIgnoredAttribute(attribute.name)) continue
      if(attribute.name.toLowerCase() === "class") {
        const className = this.#filteredClassValue(attribute.value)
        if(className) yElement.setAttribute("class", className)
      }
      else {
        yElement.setAttribute(attribute.name, attribute.value)
      }
    }
    const children = Array.from(node.childNodes).flatMap(child => {
      const yChild = this.#createYNode(child, addPair)
      return yChild ? [yChild as Y.XmlElement | Y.XmlText] : []
    })
    if(children.length) yElement.insert(0, children)
    if(addPair) this.#addNodePair(node, yElement)
    return yElement
  }

  #createDOMNode(yNode: YXmlNode, addPair = true): Node | null {
    if(yNode instanceof Y.XmlText) {
      const text = this.#document.createTextNode(yNode.toString())
      if(addPair) this.#addNodePair(text, yNode)
      return text
    }
    if(!(yNode instanceof Y.XmlElement)) return null
    if(this.#isYComment(yNode)) {
      const comment = this.#document.createComment(yNode.toArray().map(child => child.toString()).join(""))
      if(addPair) this.#addNodePair(comment, yNode)
      return comment
    }

    const namespace = yNode.getAttribute(INTERNAL_NAMESPACE)
    const element = namespace
      ? this.#document.createElementNS(namespace, yNode.nodeName)
      : this.#document.createElement(yNode.nodeName)
    this.#copyYAttributesToDOM(yNode, element)
    element.append(...yNode.toArray().flatMap(child => {
      const domChild = this.#createDOMNode(child as YXmlNode, addPair)
      return domChild ? [domChild] : []
    }))
    if(addPair) this.#addNodePair(element, yNode)
    return element
  }

  #copyDOMAttributesToY(element: Element, yElement: Y.XmlElement) {
    const desired = new Map<string, string>()
    for(const attribute of Array.from(element.attributes)) {
      if(this.#isIgnoredAttribute(attribute.name)) continue
      if(attribute.name.toLowerCase() === "class") {
        const className = this.#filteredClassValue(attribute.value)
        if(className) desired.set("class", className)
      }
      else {
        desired.set(attribute.name, attribute.value)
      }
    }

    const current = yElement.getAttributes()
    for(const name of Object.keys(current)) {
      if(name === INTERNAL_NODE_KIND || name === INTERNAL_NAMESPACE) continue
      if(!desired.has(name)) yElement.removeAttribute(name)
    }
    desired.forEach((value, name) => {
      if(yElement.getAttribute(name) !== value) yElement.setAttribute(name, value)
    })
  }

  #copyYAttributesToDOM(yElement: Y.XmlElement, element: Element) {
    const shared = yElement.getAttributes()
    const sharedClassNames = String(shared.class ?? "").split(/\s+/).filter(Boolean)
    const internalClassNames = Array.from(element.classList).filter(name => this.#isIgnoredClass(name))
    const classNames = Array.from(new Set([...sharedClassNames, ...internalClassNames]))

    for(const attribute of Array.from(element.attributes)) {
      const name = attribute.name
      if(this.#isIgnoredAttribute(name) || name.toLowerCase() === "class") continue
      if(!(name in shared)) element.removeAttribute(name)
    }
    for(const [name, value] of Object.entries(shared)) {
      if(name === INTERNAL_NODE_KIND || name === INTERNAL_NAMESPACE || name === "class") continue
      if(element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value))
    }
    if(classNames.length) element.setAttribute("class", classNames.join(" "))
    else element.removeAttribute("class")
  }

  #reconcileYText(domText: Text, yText: Y.XmlText) {
    this.#addNodePair(domText, yText)
    this.#updateYText(yText, domText.data)
  }

  #updateYText(yText: Y.XmlText, desired: string) {
    const current = yText.toString()
    if(current === desired) return

    let prefix = 0
    while(prefix < current.length && prefix < desired.length && current[prefix] === desired[prefix]) prefix++
    let suffix = 0
    while(
      suffix < current.length - prefix && suffix < desired.length - prefix &&
      current[current.length - suffix - 1] === desired[desired.length - suffix - 1]
    ) suffix++
    const deleteLength = current.length - prefix - suffix
    const insert = desired.slice(prefix, desired.length - suffix)
    if(deleteLength) yText.delete(prefix, deleteLength)
    if(insert) yText.insert(prefix, insert)
  }

  #reconcileYComment(domComment: Comment, yComment: Y.XmlElement) {
    this.#addNodePair(domComment, yComment)
    let yText = yComment.firstChild
    if(!(yText instanceof Y.XmlText)) {
      if(yComment.length) yComment.delete(0, yComment.length)
      yText = new Y.XmlText(domComment.data)
      yComment.insert(0, [yText])
    }
    else {
      this.#updateYText(yText, domComment.data)
    }
  }

  #reconcileYElement(domElement: Element, yElement: Y.XmlElement) {
    this.#addNodePair(domElement, yElement)
    this.#copyDOMAttributesToY(domElement, yElement)

    const domChildren = Array.from(domElement.childNodes).filter(child => this.#isSyncableNode(child))
    const currentYChildren = yElement.toArray() as YXmlNode[]
    const desiredExisting = domChildren.flatMap(child => {
      const mapped = this.#xmlNodes.get(child)
      return mapped && currentYChildren.includes(mapped) && this.#isCompatiblePair(child, mapped) ? [mapped] : []
    })
    const retained = longestOrderedSubset(currentYChildren, desiredExisting)
    const desiredYChildren = domChildren.map(child => {
      const mapped = this.#xmlNodes.get(child)
      if(mapped && retained.has(mapped) && this.#isCompatiblePair(child, mapped)) return mapped
      return this.#createYNode(child)!
    })

    for(let index = currentYChildren.length - 1; index >= 0; index--) {
      if(!retained.has(currentYChildren[index])) yElement.delete(index, 1)
    }
    desiredYChildren.forEach((yChild, index) => {
      if(yElement.toArray()[index] !== yChild) {
        yElement.insert(index, [yChild as Y.XmlElement | Y.XmlText])
      }
    })

    domChildren.forEach((domChild, index) => {
      const yChild = desiredYChildren[index]
      if(isText(domChild) && yChild instanceof Y.XmlText) this.#reconcileYText(domChild, yChild)
      else if(isComment(domChild) && this.#isYComment(yChild)) this.#reconcileYComment(domChild, yChild)
      else if(isElement(domChild) && yChild instanceof Y.XmlElement) this.#reconcileYElement(domChild, yChild)
    })
  }

  #reconcileDOMText(yText: Y.XmlText, domText: Text) {
    this.#addNodePair(domText, yText)
    const value = yText.toString()
    if(domText.data !== value) domText.data = value
  }

  #reconcileDOMComment(yComment: Y.XmlElement, domComment: Comment) {
    this.#addNodePair(domComment, yComment)
    const value = yComment.toArray().map(child => child.toString()).join("")
    if(domComment.data !== value) domComment.data = value
  }

  #reconcileDOMElement(yElement: Y.XmlElement, domElement: Element) {
    this.#addNodePair(domElement, yElement)
    this.#copyYAttributesToDOM(yElement, domElement)

    const yChildren = yElement.toArray() as YXmlNode[]
    const desiredDOMChildren = yChildren.map(yChild => {
      const mapped = this.#nodes.get(yChild)
      if(mapped && mapped.parentNode === domElement && this.#isCompatiblePair(mapped, yChild)) return mapped
      return this.#createDOMNode(yChild)!
    })

    desiredDOMChildren.forEach((desiredChild, index) => {
      const current = Array.from(domElement.childNodes).filter(child => this.#isSyncableNode(child))[index]
      if(current !== desiredChild) domElement.insertBefore(desiredChild, current ?? null)
    })
    const desiredSet = new Set(desiredDOMChildren)
    Array.from(domElement.childNodes)
      .filter(child => this.#isSyncableNode(child) && !desiredSet.has(child))
      .forEach(child => child.remove())

    yChildren.forEach((yChild, index) => {
      const domChild = desiredDOMChildren[index]
      if(yChild instanceof Y.XmlText && isText(domChild)) this.#reconcileDOMText(yChild, domChild)
      else if(this.#isYComment(yChild) && isComment(domChild)) this.#reconcileDOMComment(yChild, domChild)
      else if(yChild instanceof Y.XmlElement && isElement(domChild)) this.#reconcileDOMElement(yChild, domChild)
    })
  }
}
