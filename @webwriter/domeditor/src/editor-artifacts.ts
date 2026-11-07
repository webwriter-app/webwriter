export type WidgetLookup = (element: Element) => boolean

const widgetLookups = new WeakMap<Document, WidgetLookup>()

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
export const isHTMLDetailsElement = (element: Element): boolean =>
  element.localName === "details" && element.namespaceURI === "http://www.w3.org/1999/xhtml"

/** The authored default, which may differ from a temporarily toggled live disclosure. */
export function authoredDetailsOpen(element: Element) {
  if(element.classList.contains(temporaryDetailsOpenMarker)) return false
  if(element.classList.contains(temporaryDetailsClosedMarker)) return true
  return element.hasAttribute("open")
}

export function markTemporaryDetailsState(element: Element, authoredOpen: boolean) {
  removeEditorMarker(element, temporaryDetailsOpenMarker, temporaryDetailsClosedMarker)
  if(element.hasAttribute("open") !== authoredOpen) {
    element.classList.add(element.hasAttribute("open") ? temporaryDetailsOpenMarker : temporaryDetailsClosedMarker)
  }
}

export function clearTemporaryDetailsState(element: Element) {
  removeEditorMarker(element, temporaryDetailsOpenMarker, temporaryDetailsClosedMarker)
}

export function restoreAuthoredDetailsState(element: Element) {
  if(element.classList.contains(temporaryDetailsOpenMarker)) element.removeAttribute("open")
  else if(element.classList.contains(temporaryDetailsClosedMarker)) element.setAttribute("open", "")
  clearTemporaryDetailsState(element)
}

/** Whether a DOM mutation changes authored document content. */
export function isAuthoredMutation(mutation: MutationRecord) {
  const element = mutation.target.nodeType === Node.ELEMENT_NODE
    ? mutation.target as Element : mutation.target.parentElement
  // Editor UI can live in the observed document in older integrations. Its
  // subtree is presentation state rather than authored content.
  if(element?.closest(".◆editor-only, [data-webwriter-editor-only]")) return false
  if(mutation.type === "characterData") return mutation.oldValue !== mutation.target.nodeValue
  if(mutation.type === "attributes") {
    const name = mutation.attributeName!
    if(name === "open" && element && isHTMLDetailsElement(element)
      && (element.classList.contains(temporaryDetailsOpenMarker) || element.classList.contains(temporaryDetailsClosedMarker))) return false
    const current = mutation.attributeNamespace
      ? element?.getAttributeNS(mutation.attributeNamespace, name) ?? null
      : element?.getAttribute(name) ?? null
    const contentEditableChanged = isAuthoredContentEditableMutation(mutation)
    if(contentEditableChanged !== undefined) return contentEditableChanged
    if(name === "class") return authoredClassValue(mutation.oldValue) !== authoredClassValue(current)
    return mutation.oldValue !== current
  }
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.some(node => !(
    node.nodeType === Node.ELEMENT_NODE && ((node as Element).classList.contains("◆editor-only")
      || (node as Element).hasAttribute("data-webwriter-editor-only"))
  ))
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
    if(element !== root && (element.classList.contains("◆editor-only") || element.hasAttribute("data-webwriter-editor-only"))) {
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
