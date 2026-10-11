/** Marks a widget whose `contenteditable` attribute the editor set. */
export const widgetEditableMarker = "◆widget-editable"

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
  element.classList.remove(...markers)
  if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) element.classList.remove("◆")
  if(!element.classList.length) element.removeAttribute("class")
  return element
}
