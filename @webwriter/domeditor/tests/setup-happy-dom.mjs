import {Document, Node, Range, PropertySymbol} from "happy-dom"

// Happy DOM 20.8.3 stores MutationObserver delivery callbacks only through an
// unretained WeakRef. Keep each registered callback alive for the lifetime of
// its mutation listener in tests; the WeakMap key still releases it with the
// listener. This is test-runtime compatibility code and does not affect the
// browser build.
const marker = Symbol.for("webwriter.happy-dom.observe-mutations-patched")
if(!Node.prototype[marker]) {
  const observeMutations = Node.prototype[PropertySymbol.observeMutations]
  const retainedCallbacks = new WeakMap()
  const patchedObserveMutations = function(listener) {
    const callback = listener?.callback?.deref?.()
    if(callback) retainedCallbacks.set(listener, callback)
    return observeMutations.call(this, listener)
  }
  Node.prototype[PropertySymbol.observeMutations] = patchedObserveMutations
  Node.prototype[marker] = true
}

// Happy DOM 20.8.3 uses the window registry even for inert documents, and
// importNode clones in the source document before adopting the result. Native
// browsers instead create unupgraded elements in the target document. Model
// that boundary here; production code uses the native APIs unchanged.
const inertMarker = Symbol.for("webwriter.happy-dom.inert-documents-patched")
if(!Document.prototype[inertMarker]) {
  const createElementNS = Document.prototype.createElementNS
  Document.prototype.createElementNS = function(...args) {
    if(this.defaultView) return createElementNS.apply(this, args)
    const registry = this[PropertySymbol.window].customElements
    const definitions = registry[PropertySymbol.registry]
    registry[PropertySymbol.registry] = new Map()
    try {
      const element = createElementNS.apply(this, args)
      element[PropertySymbol.ownerDocument] = this
      if(element.localName === "template") element.content[PropertySymbol.ownerDocument] = this
      return element
    }
    finally { registry[PropertySymbol.registry] = definitions }
  }

  for(const name of ["createTextNode", "createComment", "createDocumentFragment", "createProcessingInstruction"]) {
    const create = Document.prototype[name]
    Document.prototype[name] = function(...args) {
      const node = create.apply(this, args)
      node[PropertySymbol.ownerDocument] = this
      return node
    }
  }

  const importNode = Document.prototype.importNode
  Document.prototype.importNode = function(node, deep = false) {
    if(this.defaultView) return importNode.call(this, node, deep)
    let clone
    switch(node.nodeType) {
      case Node.ELEMENT_NODE:
        clone = this.createElementNS(node.namespaceURI, node.prefix ? `${node.prefix}:${node.localName}` : node.localName)
        for(const attr of node.attributes) clone.setAttributeNS(attr.namespaceURI, attr.name, attr.value)
        if(node.localName === "input") { clone.value = node.value; clone.checked = node.checked }
        if(node.localName === "textarea") clone.value = node.value
        if(node.localName === "option") clone.selected = node.selected
        if(deep && node.localName === "template" && node.content) {
          for(const child of node.content.childNodes) clone.content.append(this.importNode(child, true))
        }
        break
      case Node.TEXT_NODE: clone = this.createTextNode(node.data); break
      case Node.COMMENT_NODE: clone = this.createComment(node.data); break
      case Node.DOCUMENT_FRAGMENT_NODE: clone = this.createDocumentFragment(); break
      case Node.PROCESSING_INSTRUCTION_NODE: clone = this.createProcessingInstruction(node.target, node.data); break
      case Node.DOCUMENT_TYPE_NODE: clone = this.implementation.createDocumentType(node.name, node.publicId, node.systemId); break
      default: return importNode.call(this, node, deep)
    }
    clone[PropertySymbol.ownerDocument] = this
    if(deep) for(const child of node.childNodes) clone.appendChild(this.importNode(child, true))
    return clone
  }

  // Ranges created for an inert document (including cloneContents' internal
  // subranges) otherwise keep window.document as their owner and collapse
  // when their second boundary is set.
  const createRange = Document.prototype.createRange
  Document.prototype.createRange = function() {
    const range = createRange.call(this)
    range[PropertySymbol.ownerDocument] = this
    range[PropertySymbol.start] = {node: this, offset: 0}
    range[PropertySymbol.end] = {node: this, offset: 0}
    return range
  }
  const cloneContents = Range.prototype.cloneContents
  Range.prototype.cloneContents = function() {
    this[PropertySymbol.ownerDocument] = this.startContainer.ownerDocument ?? this.startContainer
    return cloneContents.call(this)
  }
  const cloneRange = Range.prototype.cloneRange
  Range.prototype.cloneRange = function() {
    const range = cloneRange.call(this)
    range[PropertySymbol.ownerDocument] = this[PropertySymbol.ownerDocument]
    return range
  }
  Document.prototype[inertMarker] = true
}
