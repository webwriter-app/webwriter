import canvasViewerSource from "./canvas-viewer.js?raw"
import {documentLayoutMode} from "./document-layout"
import {SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL, type WebWriterPackage} from "./packages"

export const originalURLAttribute = (name: string) => `data-webwriter-original-${name}`

export const restorableResourceAttributes = ["src", "srcset", "poster", "data", "href", "style", "integrity"] as const

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
  root.querySelectorAll<HTMLStyleElement>(`style[${originalURLAttribute("text")}]`).forEach(style => {
    style.textContent = style.getAttribute(originalURLAttribute("text"))
    style.removeAttribute(originalURLAttribute("text"))
  })
  root.querySelectorAll<HTMLTemplateElement>("template").forEach(template => restoreOriginalResourceURLs(template.content))
}

export function serializeDoctype(doctype: DocumentType | null) {
  if(!doctype) return ""
  const publicId = doctype.publicId ? ` PUBLIC \"${doctype.publicId}\"` : ""
  const systemId = doctype.systemId
    ? `${doctype.publicId ? "" : " SYSTEM"} \"${doctype.systemId}\"`
    : ""
  return `<!DOCTYPE ${doctype.name}${publicId}${systemId}>`
}

/** Adds the widget and template resources required by a detached document. */
export function appendSerializedAssets(root: Document, packages: WebWriterPackage[]) {
  const resourceKey = (url: string) => {
    try { return new URL(url, root.baseURI).href }
    catch { return url }
  }
  const head = root.head ?? root.documentElement.insertBefore(root.createElement("head"), root.body)
  // Replace an earlier export's runtime, including after a template change.
  root.querySelectorAll('script[id="webwriter-canvas-viewer"]').forEach(script => script.remove())
  if(documentLayoutMode(root.body) === "canvas") {
    const script = root.createElement("script")
    script.id = "webwriter-canvas-viewer"
    script.type = "module"
    script.textContent = `${canvasViewerSource}\nmountCanvasReader()\n`
    head.append(script)
  }
  const tags = new Set<string>()
  const collectTags = (node: Document | DocumentFragment) => {
    node.querySelectorAll("*").forEach(element => {
      tags.add(element.localName)
      if(element.localName === "template" && element.namespaceURI === "http://www.w3.org/1999/xhtml") {
        collectTags((element as HTMLTemplateElement).content)
      }
    })
  }
  collectTags(root)
  const known = new Set<string>()
  const required = new Set<string>()
  for(const pkg of packages) {
    const widgets = pkg.members.filter(member => member.kind === "widget" && member.tagName)
    for(const url of [...pkg.scripts, ...pkg.styles]) {
      const key = resourceKey(url)
      known.add(key)
      const owners = widgets.filter(member => [member.scriptUrl, member.styleUrl]
        .some(value => value && resourceKey(value) === key))
      // Older metadata may only describe assets at the package level.
      if((owners.length ? owners : widgets).some(member => tags.has(member.tagName!))) required.add(key)
    }
  }
  const assets = [
    ...packages.flatMap(pkg => pkg.styles.map(url => ({url, isScript: false}))),
    ...packages.flatMap(pkg => pkg.scripts.map(url => ({url, isScript: true}))),
  ].filter(asset => required.has(resourceKey(asset.url)))
  const needsPolyfill = assets.some(asset => asset.isScript)
  root.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel~='stylesheet'][href]").forEach(element => {
    const key = resourceKey(element.localName === "script" ? (element as HTMLScriptElement).src : (element as HTMLLinkElement).href)
    if(known.has(key) && !required.has(key)
      || packages.length && key === SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL && !needsPolyfill) element.remove()
  })
  const existing = new Set([...root.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel~='stylesheet'][href]")]
    .map(element => resourceKey(element.localName === "script" ? (element as HTMLScriptElement).src : (element as HTMLLinkElement).href)))
  if(needsPolyfill
    && !existing.has(SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL)) {
    const polyfill = root.createElement("script")
    polyfill.src = SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL
    head.prepend(polyfill)
    existing.add(SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL)
  }
  for(const {url, isScript} of assets) {
    const key = resourceKey(url)
    if(!key || existing.has(key)) continue
    const clone = root.createElement(isScript ? "script" : "link") as HTMLScriptElement | HTMLLinkElement
    if(isScript) {
      clone.type = "module"
      clone.setAttribute("src", url)
    }
    else {
      ;(clone as HTMLLinkElement).rel = "stylesheet"
      clone.setAttribute("href", url)
    }
    head.append(clone)
    existing.add(key)
  }
}
