// Keep existing widget instances and focus when the other preview changes its light DOM.
export function reconcileExampleContent(container: ParentNode, next: Node[]) {
  const previous = [...container.childNodes]
  next.forEach((node, index) => {
    const current = previous[index]
    if(!current) {
      container.append(node)
      return
    }
    if(current.isEqualNode(node)) return
    if(current.nodeType !== node.nodeType || current.nodeName !== node.nodeName
      || (current as Element).namespaceURI !== (node as Element).namespaceURI) {
      container.replaceChild(node, current)
      return
    }
    if(current.nodeType !== Node.ELEMENT_NODE) {
      current.nodeValue = node.nodeValue
      return
    }
    const element = current as Element, nextElement = node as Element
    for(const {namespaceURI, localName} of [...element.attributes]) {
      if(!nextElement.hasAttributeNS(namespaceURI, localName)) element.removeAttributeNS(namespaceURI, localName)
    }
    for(const {name, namespaceURI, localName, value} of nextElement.attributes) {
      if(element.getAttributeNS(namespaceURI, localName) === value) continue
      if(namespaceURI) element.setAttributeNS(namespaceURI, name, value)
      else element.setAttribute(name, value)
    }
    if(element.localName === "template" && element.namespaceURI === "http://www.w3.org/1999/xhtml") element.innerHTML = nextElement.innerHTML
    else reconcileExampleContent(element, [...node.childNodes])
  })
  previous.slice(next.length).forEach(node => container.removeChild(node))
}
