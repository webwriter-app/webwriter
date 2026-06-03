import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { isElement, isDocument, isComment, isText } from "./utility"

/**
 * Support types of changes:
 * 1. Initial : Full parsing of DOM into Y.Doc with Y.XMLFragment 
 * 2. Mutation: Scoped updating of Y.XMLFragment
 * 3. External: Scoped updating of DOM
 * 
 * Support sessions
*/

export type YXmlNode = Y.XmlFragment | Y.XmlElement | Y.XmlText
export type YXmlContainer = Y.XmlFragment | Y.XmlElement
export type EditingMutation = MutationRecord | {type: "selection", anchorNode: Node, anchorOffset?: number, focusNode: Node, focusOffset?: number}
export type YDelta = Y.YXmlEvent["delta"][number]

export class SharedDOMDoc {
  #ydoc: Y.Doc = new Y.Doc()
  #provider: WebsocketProvider
  #undoManager: Y.UndoManager
  #nodes: WeakMap<YXmlNode, Node> = new WeakMap()
  #xmlNodes: WeakMap<Node, YXmlNode> = new WeakMap()
  #selection: {
    anchor: Y.RelativePosition,
    focus: Y.RelativePosition
  }
  #isWritingToDom = false
  #isInUndoRedo = false

  constructor(readonly serverUrl?: string, readonly sessionId?: string, readonly ignoreAttrs?: string[], readonly ignoreClasses?: string[]) {
    this.#undoManager = new Y.UndoManager(this.#ydoc)
    if(this.sessionId && this.serverUrl) {
      let initialUpdate = false
      this.#ydoc.once("update", (...args) => {
        initialUpdate = true
        this.#isWritingToDom = true
        const fragment = this.yxmlToDomNode(this.body)
        document.body.replaceWith(fragment)
        document.body.contentEditable = "true"
        document.body.spellcheck = false
        this.startObserve()
      })
      this.#provider = new WebsocketProvider(this.serverUrl, this.sessionId, this.#ydoc)

      this.#provider.once("sync", () => {
        if(!initialUpdate) {
          this.domToYxmlNode(document, this.#ydoc)
          this.startObserve()
        }
      })
    }
    else {
      this.domToYxmlNode(document, this.#ydoc)
      this.startObserve()
    }
  }

  startObserve() {
    this.body.observeDeep(events => events.forEach(ev => {
      if(!ev.transaction.local || this.#isInUndoRedo) {
        this.writeYxmlDelta(ev.target, ev.delta)
      }
    }))
  }

  get selection() {
    const {type: anchorNode, index: anchorOffset} = Y.createAbsolutePositionFromRelativePosition(this.#selection.anchor, this.#ydoc) ?? {}
    const {type: focusNode, index: focusOffset} = Y.createAbsolutePositionFromRelativePosition(this.#selection.focus, this.#ydoc) ?? {}
    return {anchorNode: anchorNode as YXmlNode, anchorOffset, focusNode: focusNode as YXmlNode, focusOffset}
  }

  get domSelection() {
    const sel = this.selection

    return sel.anchorNode? {anchorNode: this.#nodes.get(sel.anchorNode)!, anchorOffset: sel.anchorOffset ?? 0, focusNode: this.#nodes.get(sel.focusNode)!, focusOffset: sel.focusOffset ?? 0}: null
  }

  setSelection(anchorNode: YXmlNode, anchorOffset: number = 0, focusNode=anchorNode, focusOffset=anchorOffset) {
    this.#selection = {
      anchor: Y.createRelativePositionFromTypeIndex(anchorNode, anchorOffset),
      focus: Y.createRelativePositionFromTypeIndex(focusNode, focusOffset),
    }
  }

  writeSelection() {
    const sel = this.domSelection
    sel && document.getSelection()?.setBaseAndExtent(
      ...Object.values(this.domSelection) as [Node, number, Node, number]
    )
  }

  get doc() {
    return this.#ydoc
  }

  get head() {
    return this.#ydoc.getMap("head")
  }

  get #htmlFragment() {
    return this.#ydoc.getXmlFragment("html")
  }

  get body() {
    return this.#htmlFragment.firstChild as Y.XmlElement
  }
  
  #addNodePairToDoc(node: Node, yxml: YXmlNode) {
    this.#nodes.set(yxml, node)
    this.#xmlNodes.set(node, yxml)
  }

  domToYxmlNode(node: Document, doc?: Y.Doc): Y.XmlFragment;
  domToYxmlNode(node: Element, doc?: Y.Doc): Y.XmlElement;
  domToYxmlNode(node: Text, doc?: Y.Doc): Y.XmlText;
  domToYxmlNode(node: Node, doc?: Y.Doc): YXmlNode | null;
  domToYxmlNode(node: Node = document, doc?: Y.Doc): YXmlNode | null {
    if(isElement(node)) {
      if(node.classList.contains("◆editor-only")) {
        return null
      }
      const el = new Y.XmlElement(node.tagName.toLowerCase())
      // el.doc = this.#ydoc
      for (let i = 0, n = node.attributes.length; i < n; i++) {
        if(this.ignoreAttrs?.includes(node.attributes[i].name)) {
          continue
        }
        else if(node.attributes[i].nodeName === "CLASS") {
          const classes = Array.from(node.classList).filter(k => !this.ignoreClasses?.some(ignore => k.startsWith(ignore)))
          el.setAttribute("class", classes.join(" "))
        }
        else {
          el.setAttribute(node.attributes[i].nodeName, node.attributes[i].nodeValue!)
        }
      }
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = this.domToYxmlNode(node.childNodes[i], doc) as Y.XmlElement | Y.XmlText
        child && el.unshift([child])
      }
      // doc && this.#addNodePairToDoc(node, el)
      return el
    }
    // else if(isComment(node)) {}
    else if(isText(node)) {
      const text = new Y.XmlText(node.textContent)
      // text.doc = doc ?? null
      // doc && this.#addNodePairToDoc(node, text)
      return text
    }
    else if(isDocument(node)) {
      const fragment = this.#htmlFragment
      fragment.unshift([this.domToYxmlNode(node.body, doc)!])
      // doc && this.#addNodePairToDoc(node, fragment)
      return fragment
    }
    else {
      return null
    }
  }

  #getDOM(node: YXmlNode) {
    return this.#resolvePathInDOM(this.#getPathInYxml(node))
  }

  #getYxml(node: Node, position: "before" | "at" | "after" = "at") {
    const path = this.#getPathInDOM(node)
    if(position !== "at") {
      path[path.length - 1] = position === "after"
        ? path[path.length - 1] + 1
        : path[path.length - 1] - 1 
    }
    return this.#resolvePathInYxml(path)
  }

  #getPathInDOM(node: Node) {
    let path = [], n = node, parent = n.parentElement
    while(parent && parent.nodeName !== "HTML") {
      const i = Array.from(parent.childNodes).indexOf(n as ChildNode)
      path.unshift(i)
      n = parent
      parent = n.parentElement
    }
    return path
  }

  #getPathInYxml(node: YXmlNode) {
    let path = [], n = node, parent = n.parent as Y.XmlElement | Y.XmlFragment
    while(parent) {
      const i = parent.toArray().indexOf(n as any)
      path.unshift(i)
      n = parent
      parent = n.parent as Y.XmlElement | Y.XmlFragment
    }
    return path
  }

  #resolvePathInDOM(path: number[]) {
    let node = document.body as Node
    for(const i of path) {
      node = node.childNodes.item(i)
    }
    return node
  }

  #resolvePathInYxml(path: number[]) {
    let node = this.body as Y.XmlElement
    for(const i of path) {
      node = node.toArray().at(i) as any
    }
    return node as YXmlNode
  }

  yxmlToDomNode(node: Y.XmlFragment, addToDoc?: boolean): DocumentFragment;
  yxmlToDomNode(node: Y.XmlElement, addToDoc?: boolean): Element;
  yxmlToDomNode(node: Y.XmlText, addToDoc?: boolean): Text;
  yxmlToDomNode(node: YXmlNode = this.body, addToDoc=false): Node | null {
    if(node instanceof Y.XmlElement) {
      const el = document.createElement(node.nodeName)
      const attrs = node.getAttributes()
      Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]))
      const children = node.toArray().map(child => this.yxmlToDomNode(child as any, addToDoc))
      el.append(...children)
      // addToDoc && this.#addNodePairToDoc(el, node)
      return el
    }
    // else if(isComment(node)) {}
    else if(node instanceof Y.XmlText) {
      const text = new Text(node.toString())
      // addToDoc && this.#addNodePairToDoc(text, node)
      return text
    }
    else if(node instanceof Y.XmlFragment) {
      const fragment = document.createDocumentFragment()
      const children = node.toArray().map(child => this.yxmlToDomNode(child as any, addToDoc))
      fragment.append(...children)
      // addToDoc && this.#addNodePairToDoc(fragment, node)
      return fragment
    }
    else {
      return null
    }
  }

  readDomMutation(mut: EditingMutation | EditingMutation[]) {
    if(this.#isWritingToDom) {
      return
    }
    else if(Array.isArray(mut)) {
      mut.forEach(mut => this.readDomMutation(mut))
    }
    else if(mut.type === "selection") {
      const anchorNode = this.#getYxml(mut.anchorNode)
      const focusNode = this.#getYxml(mut.focusNode)
      const {anchorOffset, focusOffset} = mut
      if(!anchorNode || !focusNode) {
        throw TypeError("Unknown selection nodes")
      }
      this.setSelection(anchorNode, anchorOffset, focusNode, focusOffset)
    }
    else if(mut.type === "characterData") {
      const yxml = this.#getYxml(mut.target) as Y.XmlText
      const text = mut.target.textContent

        this.#ydoc.transact(() => {
          yxml.delete(0, yxml.toString().length)
          text !== null && yxml.insert(0, text)
        })
    }
    else if(mut.type === "attributes") {
      const {target, attributeName} = mut
      const yxml = this.#getYxml(mut.target) as Y.XmlElement
      const value = (target as Element).getAttribute(attributeName!)
      this.#ydoc.transact(() => {
        value
          ? yxml.setAttribute(attributeName!, value)
          : yxml.removeAttribute(attributeName!)
      })
    }
    else {
      const {target, addedNodes, removedNodes, previousSibling, nextSibling} = mut
      const yxml = this.#getYxml(mut.target) as YXmlContainer
      console.log(yxml)
      const children = yxml.toArray()
      let removeCount = removedNodes.length
      let removeIndex
      if(previousSibling) {
        const yxmlChild = this.#getYxml(previousSibling, "after")!
        removeIndex = children.indexOf(yxmlChild as any)
      }
      else if(nextSibling) {
        const yxmlChild = this.#getYxml(nextSibling, "before")
        const i = children.indexOf(yxmlChild as any)
        removeIndex = i - removeCount
      }
      else {
        removeIndex = 0
      }
      this.#ydoc.transact(() => {
        yxml.delete(removeIndex, removeCount);
        (addedNodes as NodeListOf<Element | Text>).forEach(node => {
          const yxmlChild = this.domToYxmlNode(node, this.#ydoc) as Y.XmlElement | Y.XmlText
          const i = Array.from(target.childNodes).indexOf(node)
          yxml.insert(i, [yxmlChild!])
        })
      })
    }
  }

  writeYxmlDelta(target: YXmlNode, deltas: YDelta[]) {
    this.#isWritingToDom = true
    try {
      if(target instanceof Y.XmlElement) {
        const dom = this.#getDOM(target) as Element
      }
      else if(target instanceof Y.XmlText) {
        const dom = this.#getDOM(target) as Text
        dom.textContent = target.toString()
        // this.writeSelection()
      }
      else if(target instanceof Y.XmlFragment) {

      }
    } finally {setTimeout(() => this.#isWritingToDom = false, 0)}
  }

  undo() {
    this.#isInUndoRedo = true
    try {this.#undoManager.undo()} finally {this.#isInUndoRedo = false}
  }

  redo() {
    this.#isInUndoRedo = true
    try {this.#undoManager.redo()} finally {this.#isInUndoRedo = false}
  }
}