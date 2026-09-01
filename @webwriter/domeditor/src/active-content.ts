const unsafeElementSelector = "script, style, iframe, object, embed, base, meta[http-equiv='refresh'], link[rel='import'], link[rel~='stylesheet']"
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"])
const unsafeURL = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll(/[\u0000-\u0020]+/g, "")
  return normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:text/html")
    || normalized.startsWith("data:image/svg+xml")
}
const unsafeStyle = /(?:expression\s*\(|javascript\s*:|data\s*:\s*text\/html)/i

export type ActiveContentStripOptions = {
  removeAttribute?: (attribute: Attr) => boolean
  removeClass?: (className: string) => boolean
}

/** Removes executable elements and active attributes from detached content.
 * Returns the number of elements and attributes removed. Template contents
 * are traversed explicitly because they are not descendants in the DOM tree. */
export function stripActiveContent(root: ParentNode, options: ActiveContentStripOptions = {}) {
  let removed = 0
  root.querySelectorAll(unsafeElementSelector).forEach(element => {
    element.remove()
    removed++
  })
  root.querySelectorAll<Element>("*").forEach(element => {
    for(const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if(name.startsWith("on") || name === "srcdoc"
        || URL_ATTRIBUTES.has(name) && unsafeURL(attribute.value)
        || name === "style" && unsafeStyle.test(attribute.value)
        || options.removeAttribute?.(attribute)) {
        element.removeAttribute(attribute.name)
        removed++
      }
      else if(name === "class" && options.removeClass) {
        const classes = attribute.value.split(/\s+/).filter(Boolean)
        const retained = classes.filter(className => !options.removeClass!(className))
        if(retained.length !== classes.length) {
          if(retained.length) element.setAttribute("class", retained.join(" "))
          else element.removeAttribute("class")
        }
      }
    }
    if(element.localName === "template") {
      const content = (element as HTMLTemplateElement).content
      if(content?.nodeType === 11) removed += stripActiveContent(content, options)
    }
  })
  return removed
}
