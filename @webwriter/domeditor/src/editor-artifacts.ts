/** Marks a widget whose `contenteditable` attribute the editor set. */
export const widgetEditableMarker = "◆widget-editable"
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
    if(name.toLowerCase() === "contenteditable" && element?.classList.contains(widgetEditableMarker)
      && (current === "" || mutation.oldValue === "" && current === null)) return false
    if(name === "class") return authoredClassValue(mutation.oldValue) !== authoredClassValue(current)
    return mutation.oldValue !== current
  }
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.some(node => !(
    node.nodeType === Node.ELEMENT_NODE && ((node as Element).classList.contains("◆editor-only")
      || (node as Element).hasAttribute("data-webwriter-editor-only"))
  ))
}

/** Returns authored class names, omitting transient editor markers.
 * Set `canonical` when comparing class values independent of authored order. */
export function authoredClassValue(value: string | null, canonical = false) {
  const names = (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆"))
  if(canonical) names.sort()
  return names.join(" ")
}

/** Whether the editor set this attribute to tell a widget that it is being
 * edited. It is never authored content, so collaboration, history and
 * serialization ignore it. */
export function isEditorOwnedAttribute(element: Element, name: string) {
  return name.toLowerCase() === "contenteditable" && element.classList.contains(widgetEditableMarker)
    && element.getAttribute("contenteditable") === ""
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
export function clearEditorOwnedAttributes(root: Node) {
  return visitAuthoredElements(root, element => {
    if(isEditorOwnedAttribute(element, "contenteditable")) element.removeAttribute("contenteditable")
  })
}

function clearElementEditorMarkers(element: Element) {
  if(isHTMLDetailsElement(element)) restoreAuthoredDetailsState(element)
  if(isEditorOwnedAttribute(element, "contenteditable")) element.removeAttribute("contenteditable")
  const markers = Array.from(element.classList).filter(name => name.startsWith("◆"))
  if(markers.length) element.classList.remove(...markers)
  if(!element.classList.length) element.removeAttribute("class")
}

/** Removes transient editor marker classes from a node and all descendants,
 * including inert template contents, while preserving authored classes. */
export function clearEditorMarkerClasses(root: Node) {
  return visitAuthoredElements(root, clearElementEditorMarkers)
}

/** Clean a detached snapshot for serialization or preview. Remove editor UI
 * subtrees before clearing markers so the widget runtime attribute contract
 * remains distinguishable from authored contenteditable attributes. */
export function clearEditorArtifacts(root: Node, ignoredAttributes: Iterable<string> = []) {
  const attributes = Array.from(ignoredAttributes)
  return visitAuthoredElements(root, element => {
    if(element !== root && (element.classList.contains("◆editor-only") || element.hasAttribute("data-webwriter-editor-only"))) {
      element.remove()
      return false
    }
    attributes.forEach(attribute => element.removeAttribute(attribute))
    clearElementEditorMarkers(element)
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
