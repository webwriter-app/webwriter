export type WidgetLookup = (element: Element) => boolean

const widgetLookups = new WeakMap<Document, WidgetLookup>()
const editorOnlyKey = Symbol.for("webwriter.editor-only-nodes")
type ArtifactDocument = Document & {[editorOnlyKey]?: WeakSet<Element>}
const detailsStateDocuments = new WeakSet<Document>()

export function markEditorOnlyNode<T extends Element>(element: T): T {
  const doc = element.ownerDocument as ArtifactDocument
  ;(doc[editorOnlyKey] ??= new WeakSet()).add(element)
  return element
}

export function isEditorOnlyNode(node: Node): boolean {
  if(node.nodeType !== 1) return false
  const element = node as Element
  return (element.ownerDocument as ArtifactDocument)[editorOnlyKey]?.has(element) === true || element.classList.contains("◆editor-only") || element.hasAttribute("data-webwriter-editor-only")
}

export function isInsideEditorOnlyNode(element: Element | null | undefined): boolean {
  for(let node = element; node; node = node.parentElement) if(isEditorOnlyNode(node)) return true
  return false
}

/** Frame resources already have a browser CSP nonce. Use it to recover their
 * provenance after HTML parsing, without an extra class or attribute. */
export function registerFrameArtifacts(doc: Document, expectedNonce?: string) {
  const policy = doc.head?.firstElementChild
  if(policy?.localName !== "meta" || policy.getAttribute("http-equiv")?.toLowerCase() !== "content-security-policy") return
  const nonce = policy.getAttribute("content")?.match(/^default-src 'none'; script-src 'nonce-([^']+)' 'strict-dynamic'/)?.[1]
  if(!nonce || expectedNonce && nonce !== expectedNonce) return
  markEditorOnlyNode(policy)
  for(const element of doc.head.children) {
    if(element.matches('meta[name="webwriter-editor-bridge"], meta[name="webwriter-preview-bridge"]')
      || element.matches("script, link") && ((element as HTMLElement).nonce || element.getAttribute("nonce")) === nonce) markEditorOnlyNode(element)
  }
}

export function setEditorWidgetLookup(document: Document, lookup?: WidgetLookup) {
  if(lookup) widgetLookups.set(document, lookup)
  else widgetLookups.delete(document)
}

export function editorWidgetLookup(node: Node) {
  const owner = node.nodeType === 9 ? node as Document : node.ownerDocument
  return owner ? widgetLookups.get(owner) : undefined
}

export function widgetLookupForTags(tags: Iterable<string>): WidgetLookup {
  const names = new Set(Array.from(tags, tag => tag.toLowerCase()))
  return element => element.namespaceURI === "http://www.w3.org/1999/xhtml" && names.has(element.localName)
}
export const temporaryDetailsOpenMarker = "◆details-temporary-open"
export const temporaryDetailsClosedMarker = "◆details-temporary-closed"
const temporaryDetailsStates = new WeakMap<Element, boolean>()
export const isHTMLDetailsElement = (element: Element): boolean =>
  element.localName === "details" && element.namespaceURI === "http://www.w3.org/1999/xhtml"

/** The authored default, which may differ from a temporarily toggled live disclosure. */
export function authoredDetailsOpen(element: Element) {
  const temporary = temporaryDetailsStates.get(element)
  if(temporary !== undefined) return temporary
  if(element.classList.contains(temporaryDetailsOpenMarker)) return false
  if(element.classList.contains(temporaryDetailsClosedMarker)) return true
  return element.hasAttribute("open")
}

export function markTemporaryDetailsState(element: Element, authoredOpen: boolean) {
  clearLegacyTemporaryDetailsMarkers(element)
  if(element.hasAttribute("open") !== authoredOpen) {
    temporaryDetailsStates.set(element, authoredOpen)
    detailsStateDocuments.add(element.ownerDocument)
  }
  else temporaryDetailsStates.delete(element)
}

export function clearTemporaryDetailsState(element: Element) {
  temporaryDetailsStates.delete(element)
  clearLegacyTemporaryDetailsMarkers(element)
}

export function hasTemporaryDetailsState(element: Element) {
  return temporaryDetailsStates.has(element) || element.classList.contains(temporaryDetailsOpenMarker)
    || element.classList.contains(temporaryDetailsClosedMarker)
}

function clearLegacyTemporaryDetailsMarkers(element: Element) {
  if(element.classList.contains(temporaryDetailsOpenMarker) || element.classList.contains(temporaryDetailsClosedMarker)) {
    removeEditorMarker(element, temporaryDetailsOpenMarker, temporaryDetailsClosedMarker)
  }
}

/** Copies runtime node and disclosure provenance alongside a structural DOM clone. */
export function copyEditorArtifactState(source: Node, clone: Node, deep = true) {
  const doc = (source.nodeType === 9 ? source : source.ownerDocument) as ArtifactDocument | null
  if(!doc || !doc[editorOnlyKey] && !detailsStateDocuments.has(doc)) return clone
  const copy = (from: Node, to: Node): void => {
    if(from.nodeType === 1 && to.nodeType === 1 && (from.ownerDocument as ArtifactDocument)[editorOnlyKey]?.has(from as Element)) markEditorOnlyNode(to as Element)
    if(isHTMLDetailsElement(from as Element) && isHTMLDetailsElement(to as Element)) {
      const baseline = temporaryDetailsStates.get(from as Element)
      if(baseline !== undefined) {
        temporaryDetailsStates.set(to as Element, baseline)
        detailsStateDocuments.add((to as Element).ownerDocument)
      }
    }
    if(!deep) return
    if(from.nodeType === Node.ELEMENT_NODE && (from as Element).localName === "template" && "content" in from) {
      const fromChildren = Array.from((from as HTMLTemplateElement).content.childNodes)
      const toChildren = Array.from((to as HTMLTemplateElement).content.childNodes)
      fromChildren.forEach((child, index) => { if(toChildren[index]) copy(child, toChildren[index]!) })
      return
    }
    const fromChildren = Array.from(from.childNodes), toChildren = Array.from(to.childNodes)
    fromChildren.forEach((child, index) => { if(toChildren[index]) copy(child, toChildren[index]!) })
  }
  copy(source, clone)
  return clone
}

export function restoreAuthoredDetailsState(element: Element) {
  if(!hasTemporaryDetailsState(element)) return
  const authoredOpen = authoredDetailsOpen(element)
  if(authoredOpen) element.setAttribute("open", "")
  else element.removeAttribute("open")
  clearTemporaryDetailsState(element)
}

/** Whether a DOM mutation changes authored document content. */
export function isAuthoredMutation(mutation: MutationRecord) {
  const element = mutation.target.nodeType === Node.ELEMENT_NODE
    ? mutation.target as Element : mutation.target.parentElement
  // Editor UI can live in the observed document in older integrations. Its
  // subtree is presentation state rather than authored content.
  if(isInsideEditorOnlyNode(element)) return false
  if(mutation.type === "characterData") return mutation.oldValue !== mutation.target.nodeValue
  if(mutation.type === "attributes") {
    const name = mutation.attributeName!
    if(name === "open" && element && isHTMLDetailsElement(element) && hasTemporaryDetailsState(element)) return false
    const current = mutation.attributeNamespace
      ? element?.getAttributeNS(mutation.attributeNamespace, name) ?? null
      : element?.getAttribute(name) ?? null
    const contentEditableChanged = isAuthoredContentEditableMutation(mutation)
    if(contentEditableChanged !== undefined) return contentEditableChanged
    if(name === "class") return authoredClassValue(mutation.oldValue) !== authoredClassValue(current)
    return mutation.oldValue !== current
  }
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.some(node => !isEditorOnlyNode(node))
}

/** Compare the authored values on either side of a widget runtime change. */
export function isAuthoredContentEditableMutation(mutation: MutationRecord, isWidget?: WidgetLookup) {
  if(mutation.attributeName !== "contenteditable" || mutation.attributeNamespace !== null) return
  const element = mutation.target as Element
  const current = element.getAttributeNS(null, "contenteditable")
  if((current === "" || mutation.oldValue === "") && (isWidget ?? editorWidgetLookup(element))?.(element)) {
    return (mutation.oldValue || null) !== (current || null)
  }
  return mutation.oldValue !== current
}

/** Returns authored class names, omitting transient editor markers.
 * Set `canonical` when comparing class values independent of authored order. */
export function authoredClassValue(value: string | null, canonical = false) {
  const names = (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆"))
  if(canonical) names.sort()
  return names.join(" ")
}

/** The empty value on an installed widget is runtime state. Collaboration,
 * history and serialization preserve explicit authored values. */
export function isEditorOwnedAttribute(element: Element, name: string, isWidget?: WidgetLookup) {
  return name === "contenteditable" && element.getAttributeNS(null, name) === ""
    && ((isWidget ?? editorWidgetLookup(element))?.(element) ?? false)
}

/** Visit authored elements, including inert template contents but never
 * widget shadow DOM. Returning false skips a removed element's subtree. */
function visitAuthoredElements(root: Node, visitElement: (element: Element) => void | false) {
  const visit = (node: Node) => {
    if(node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      if(visitElement(element) === false) return
      if(element.localName === "template" && "content" in element) {
        Array.from((element as HTMLTemplateElement).content.childNodes).forEach(visit)
      }
    }
    Array.from(node.childNodes).forEach(visit)
  }
  visit(root)
  return root
}

/** Removes editor-owned attributes from a node and all descendants,
 * including inert template contents. */
export function clearEditorOwnedAttributes(root: Node, isWidget = editorWidgetLookup(root)) {
  return visitAuthoredElements(root, element => {
    if(isEditorOwnedAttribute(element, "contenteditable", isWidget)) element.removeAttributeNS(null, "contenteditable")
  })
}

function clearElementEditorMarkers(element: Element, isWidget?: WidgetLookup) {
  if(isHTMLDetailsElement(element)) restoreAuthoredDetailsState(element)
  if(isEditorOwnedAttribute(element, "contenteditable", isWidget)) element.removeAttributeNS(null, "contenteditable")
  const markers = Array.from(element.classList).filter(name => name.startsWith("◆"))
  if(markers.length) element.classList.remove(...markers)
  if(!element.classList.length) element.removeAttribute("class")
}

/** Removes transient editor marker classes from a node and all descendants,
 * including inert template contents, while preserving authored classes. */
export function clearEditorMarkerClasses(root: Node, isWidget = editorWidgetLookup(root)) {
  return visitAuthoredElements(root, element => clearElementEditorMarkers(element, isWidget))
}

/** Clean a detached snapshot for serialization or preview. */
export function clearEditorArtifacts(root: Node, ignoredAttributes: Iterable<string> = [], isWidget = editorWidgetLookup(root)) {
  const attributes = Array.from(ignoredAttributes)
  return visitAuthoredElements(root, element => {
    if(element !== root && isEditorOnlyNode(element)) {
      element.remove()
      return false
    }
    attributes.forEach(attribute => element.removeAttribute(attribute))
    clearElementEditorMarkers(element, isWidget)
  })
}

/** Removes selected transient marker classes while retaining authored classes.
 * The umbrella marker is removed when no other editor marker remains. */
export function removeEditorMarker(element: Element, ...markers: string[]) {
  const removed = new Set(markers.filter(marker => element.classList.contains(marker)))
  if(element.classList.contains("◆") && !Array.from(element.classList)
    .some(name => name !== "◆" && name.startsWith("◆") && !removed.has(name))) removed.add("◆")
  if(removed.size) element.classList.remove(...removed)
  if(!element.classList.length && element.hasAttribute("class")) element.removeAttribute("class")
  return element
}
