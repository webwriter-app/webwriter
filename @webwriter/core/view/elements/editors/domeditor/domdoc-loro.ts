import { isElement, isDocument, isComment, isText } from "./utility"
import {LoroDoc} from "loro-crdt"
import {schema} from "loro-mirror"

const doc = new LoroDoc()

export class SharedDOMDoc {


  doc = new LoroDoc()

  get head() {
    return doc.getMap("head")
  }

  get body() {
    return doc.getTree("body")
  }

}
/*

get #docIsEmpty() {
  return this.#ydoc.getXmlFragment("document").length < 2
}

#updateYxmlChildren(dom: Node, yxml: Y.XmlElement) {
  let yxmlChildren = yxml.toArray()
  const domChildren = Array.from(dom.childNodes)

  const toRemove = yxmlChildren.filter(yxmlChild => {
      if(yxmlChild instanceof Y.XmlHook) {
      throw TypeError("Cannot write Y.XmlHook to DOM")
    }
    const domChild = this.#nodes.get(yxmlChild)
    return !domChildren.includes(domChild as ChildNode)
  })
  const indicesToRemove = toRemove.map(yxmlChild => yxmlChildren.indexOf(yxmlChild)).reverse()
  indicesToRemove.forEach(i => yxml.delete(i))

  domChildren.forEach(domChild => this.readDOM(domChild))
}

readDOM(root: Node | Node[] = document, overwrite=false) {this.#ydoc.transact(() => {
  if(Array.isArray(root)) {
    root.forEach(node => this.readDOM(node, overwrite))
  }
  else if(this.#docIsEmpty || isDocument(root) && !this.#xmlNodes.has(root) || overwrite) {
    const yxml = this.domToYxmlFragment(document)
    yxml.doc = this.#ydoc
  }
  else if(isDocument(root) && this.#xmlNodes.has(root)) {
    this.readDOM(root.documentElement)
  }
  else if(isElement(root) && this.#xmlNodes.has(root)) {
    const yxml = this.#xmlNodes.get(root) as Y.XmlElement
    const domAttrs = root.getAttributeNames()
    const yxmlAttrs = Object.keys(yxml.getAttributes())
    const attrsToSet = domAttrs.filter(k => yxml.getAttribute(k) !== root.getAttribute(k))
    const attrsToRemove = yxmlAttrs.filter(k => !domAttrs.includes(k))
    if(attrsToSet.length || attrsToRemove.length) {
      attrsToSet.forEach(k => yxml.setAttribute(k, root.getAttribute(k)!))
      attrsToRemove.forEach(k => yxml.removeAttribute(k))
    }
    this.#updateYxmlChildren(root, yxml)
  }
  else if(isElement(root) && !this.#xmlNodes.has(root)) {
    const yxml = new Y.XmlElement(root.tagName.toLowerCase())
    const parent = root.parentElement!
    const parentYxml = this.#xmlNodes.get(parent) as Y.XmlElement
    const attrs = root.getAttributeNames()
    attrs.forEach(k => yxml.setAttribute(k, root.getAttribute(k)!))  
    parentYxml.push([yxml])
    this.#updateYxmlChildren(root, yxml)

  }
  else if(isText(root) && this.#xmlNodes.has(root)) {
    const yxml = this.#xmlNodes.get(root) as Y.XmlText
    if(yxml.toString() !== root.textContent) {
      yxml.delete(0, yxml.length)
      yxml.insert(0, root.textContent)
    }
  }
  else if(isText(root) && !this.#xmlNodes.has(root)) {
    const parent = root.parentElement!
    const parentYxml = this.#xmlNodes.get(parent) as Y.XmlElement
    const yText = new Y.XmlText(root.textContent)
    parentYxml.push([yText])
  }
})}

writeDOM(root: YXmlNode | YXmlNode[] = this.document, overwrite=false) {
  if(Array.isArray(root)) {
    root.forEach(node => this.writeDOM(node, overwrite))
  }
  else if(overwrite) {
    document.replaceChild(this.documentElement.toDOM() as Element, document.documentElement)
  }
  else if(root instanceof Y.XmlElement && this.#nodes.has(root)) {
    const node = this.#nodes.get(root) as Element
    const domAttrs = node.getAttributeNames()
    const yxmlAttrs = Object.keys(root.getAttributes())
    const toSet = yxmlAttrs.filter(k => node.getAttribute(k) !== root.getAttribute(k))
    const toRemove = domAttrs.filter(k => !yxmlAttrs.includes(k))
    toSet.forEach(k => node.setAttribute(k, root.getAttribute(k)!))
    toRemove.forEach(k => node.removeAttribute(k))
    
    for(const node of root.createTreeWalker(yxml => !!yxml)) {
      if(node instanceof Y.XmlHook) {
        throw TypeError("Cannot write Y.XmlHook to DOM")
      }
      this.writeDOM(node)
    }
  }
  else if(root instanceof Y.XmlElement && !this.#nodes.has(root)) {
    const yxmlParent = root.parent as YXmlNode
    const yxmlPrevious = root.prevSibling
    const domParent = this.#nodes.get(yxmlParent) as Element
    const domPrevious = yxmlPrevious && this.#nodes.get(yxmlPrevious) as Element
    const domEl = document.createElement(root.nodeName)
    const yxmlAttrs = root.getAttributes()
    const toSet = Object.keys(yxmlAttrs)
    toSet.forEach(k => domEl.setAttribute(k, yxmlAttrs[k]))
    if(!domPrevious) {
      domParent.insertAdjacentElement("afterbegin", domEl)
    }
    else {
      domParent.insertAdjacentElement("afterend", domPrevious)
    }

    for(const node of root.createTreeWalker(yxml => !!yxml)) {
      if(node instanceof Y.XmlHook) {
        throw TypeError("Cannot write Y.XmlHook to DOM")
      }
      this.writeDOM(node)
    }
  }
  else if(root instanceof Y.XmlText && this.#nodes.has(root)) {
    const node = this.#nodes.get(root) as Text
    node.textContent = root.toString()
  }
  else if(root instanceof Y.XmlText && !this.#nodes.has(root)) {
    const yxmlParent = root.parent as Y.XmlElement
    const domParent = this.#nodes.get(yxmlParent) as Element
    const siblingsArray = yxmlParent.toArray()
    const index = siblingsArray.indexOf(root)
    insertChild(domParent, new Text(root.toString()), index)
  }
  else if(root instanceof Y.XmlFragment && this.#nodes.has(root)) {
    for(const node of root.createTreeWalker(yxml => !!yxml)) {
      if(node instanceof Y.XmlHook) {
        throw TypeError("Cannot write Y.XmlHook to DOM")
      }
      this.writeDOM(node)
    }
  }
  else if(root instanceof Y.XmlFragment && !this.#nodes.has(root)) {
    for(const node of root.createTreeWalker(yxml => !!yxml)) {
      if(node instanceof Y.XmlHook) {
        throw TypeError("Cannot write Y.XmlHook to DOM")
      }
      this.writeDOM(node)
    }
  }
  else {
    throw TypeError("Cannot write unknown XML node type")
  }
}*/
