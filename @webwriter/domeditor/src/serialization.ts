import appIconSource from "../../../static/assets/app-icon-transparent.svg?raw"
import canvasViewerSource from "./canvas-viewer.js?raw"
import documentViewerSource from "./document-viewer.js?raw"
import {documentLayoutMode} from "./document-layout"
import {getDocumentRoot} from "./document-template"
import {creativeCommonsLicenses} from "./document-head"
import {SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL, type WebWriterPackage} from "./packages"
import type {IImportMap} from "@jspm/import-map"
import {hasImportMapEntries, packageImportMapId, packageImportMapScript, packageModuleEntries} from "./package-dependencies"

export const originalURLAttribute = (name: string) => `data-webwriter-original-${name.replace(":", "-")}`
export const originalPackageEntriesAttribute = "data-webwriter-original-package-entries"
export const offlinePackageStyleAttribute = "data-webwriter-offline-package-style"

export const restorableResourceAttributes = ["src", "srcset", "poster", "data", "href", "xlink:href", "style", "integrity"] as const

/** Restores authored resource URLs from a document produced by an offline save. */
export function restoreOriginalResourceURLs(root: ParentNode) {
  root.querySelectorAll(`style[${offlinePackageStyleAttribute}]`).forEach(style => style.remove())
  root.querySelectorAll<HTMLScriptElement>(`script[${originalPackageEntriesAttribute}]`).forEach(bundle => {
    try {
      const entries: unknown = JSON.parse(bundle.getAttribute(originalPackageEntriesAttribute) ?? "")
      if(!Array.isArray(entries) || !entries.every(entry => typeof entry === "string")) return
      bundle.replaceWith(...entries.map(src => {
        const script = bundle.ownerDocument.createElement("script")
        script.type = "module"
        script.src = src
        return script
      }))
    }
    catch { /* Malformed authored metadata is left untouched. */ }
  })
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
      if(name === "xlink:href") element.setAttributeNS("http://www.w3.org/1999/xlink", name, original)
      else element.setAttribute(name, original)
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
export function appendSerializedAssets(root: Document, packages: WebWriterPackage[], importMap?: IImportMap | null) {
  const resourceKey = (url: string) => {
    try { return new URL(url, root.baseURI).href }
    catch { return url }
  }
  const head = root.head ?? root.documentElement.insertBefore(root.createElement("head"), root.body)
  root.querySelectorAll(`script#${packageImportMapId}`).forEach(script => script.remove())
  // Replace an earlier export's runtime, including after a template change.
  root.querySelectorAll('script[id="webwriter-canvas-viewer"]').forEach(script => script.remove())
  root.querySelectorAll('script[id="webwriter-document-viewer"]').forEach(script => script.remove())
  if(getDocumentRoot(root.body) === root.body && documentLayoutMode(root.body) === "document") {
    const script = root.createElement("script")
    script.id = "webwriter-document-viewer"
    script.type = "module"
    script.textContent = `${documentViewerSource}\nmountDocumentReader(${JSON.stringify(creativeCommonsLicenses)}, ${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(appIconSource)}`)})\n`
    head.append(script)
  }
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
  const moduleEntries = new Set(packageModuleEntries(packages).map(resourceKey))
  if(hasImportMapEntries(importMap) && assets.some(asset => asset.isScript && moduleEntries.has(resourceKey(asset.url)))) {
    head.prepend(packageImportMapScript(root, importMap))
  }
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
