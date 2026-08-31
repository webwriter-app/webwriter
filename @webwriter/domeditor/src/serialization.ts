export const originalURLAttribute = (name: string) => `data-webwriter-original-${name}`

export const restorableResourceAttributes = ["src", "srcset", "poster", "data"] as const

/** Restores authored resource URLs from a document produced by an offline save. */
export function restoreOriginalResourceURLs(root: ParentNode) {
  for(const name of restorableResourceAttributes) {
    const marker = originalURLAttribute(name)
    const selector = `[${marker}]`
    const rootElement = root.nodeType === Node.ELEMENT_NODE ? root as Element : null
    const elements = rootElement?.matches(selector)
      ? [rootElement, ...rootElement.querySelectorAll<HTMLElement>(selector)]
      : Array.from(root.querySelectorAll<HTMLElement>(selector))
    elements.forEach(element => {
      const original = element.getAttribute(marker)
      if(original === null) return
      if(element instanceof HTMLScriptElement && name === "src") element.textContent = ""
      element.setAttribute(name, original)
      element.removeAttribute(marker)
    })
  }
}

export function serializeDoctype(doctype: DocumentType | null) {
  if(!doctype) return ""
  const publicId = doctype.publicId ? ` PUBLIC \"${doctype.publicId}\"` : ""
  const systemId = doctype.systemId
    ? `${doctype.publicId ? "" : " SYSTEM"} \"${doctype.systemId}\"`
    : ""
  return `<!DOCTYPE ${doctype.name}${publicId}${systemId}>`
}
