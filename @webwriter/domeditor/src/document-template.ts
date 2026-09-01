/** The sole top-level element acting as the document template, if present.
 * Formatting whitespace and comments beside it do not create another element
 * child, so ordinary parsed/pretty-printed HTML retains the same meaning. */
export function getDocumentTemplate(body: HTMLElement = document.body): Element | null {
  if(body.children.length !== 1) return null
  const candidate = body.firstElementChild
  const roles = candidate?.getAttribute("role")?.toLowerCase().split(/\s+/) ?? []
  const isWidget = candidate?.localName.includes("-") || candidate?.hasAttribute("is")
  return candidate && isWidget && roles.includes("document") ? candidate : null
}

/** The authored element that behaves as the editing root. */
export function getDocumentRoot(body: HTMLElement = document.body): Element {
  return getDocumentTemplate(body) ?? body
}

/** Whether an element is the current body-equivalent editing root. */
export function isDocumentRoot(element: Element | null | undefined): boolean {
  if(!element?.isConnected) return false
  const body = element.ownerDocument.body
  return Boolean(body) && element === getDocumentRoot(body)
}
