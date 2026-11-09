import appIconSource from "../../../static/assets/app-icon-transparent.svg?raw"
import canvasSnapdomSource from "virtual:canvas-snapdom-source"
import {attributionAttributes} from "./attribution.js"
import listMarkerStyleSource from "./document-list-markers.css?raw"
import referenceFormatterSource from "virtual:reference-formatter-source"
import {collectReferences} from "./document-viewer.js"
import {documentLayoutMode} from "./document-layout"
import {getDocumentRoot} from "./document-template"
import {creativeCommonsLicenses} from "./document-head"
import {siteTranslations} from "./site-translations"
import distributionReaderSources from "virtual:distribution-reader-sources"
import readerRuntimeSources from "virtual:reader-runtime-sources"
import {readDistributionConfigs, visitSerializableElements} from "./distribution-dom"
import {packageWidgetSchemaDefinitions, type WebWriterPackage} from "./packages"
import type {IImportMap} from "@jspm/import-map"
import {hasImportMapEntries, packageImportMapId, packageImportMapScript, packageModuleEntries} from "./package-dependencies"
import {originalURLAttribute, originalPackageEntriesAttribute, offlinePackageStyleAttribute, escapeHTMLAttribute, serializeDoctype, type HTMLDocumentParts} from "./serialization-primitives"
import {documentWidgetStyleSource} from "./document-themes"
export {originalURLAttribute, originalPackageEntriesAttribute, offlinePackageStyleAttribute, escapeHTMLAttribute, serializeDoctype} from "./serialization-primitives"
import {scopedCustomElementRegistryScript} from "./scoped-custom-element-registry-script"
export {scopedCustomElementRegistryScript} from "./scoped-custom-element-registry-script"

const legacyScopedRegistryPolyfillURL = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"

const serializedReaderScriptIds = [
  "webwriter-figure-layout", "webwriter-attribution-reader", "webwriter-image-map-popovers",
  "webwriter-canvas-viewer", "webwriter-document-viewer", "webwriter-layout-print",
  "webwriter-distribution-reader",
]

/** Retire generated export runtimes before rebuilding them or editing a saved document. */
export function removeSerializedReaderScripts(root: ParentNode) {
  root.querySelectorAll(serializedReaderScriptIds.map(id => `script[id="${id}"]`).join(", "))
    .forEach(script => script.remove())
}

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

/** Adds the widget and template resources required by a detached document. */
export function appendSerializedAssets(root: HTMLDocumentParts, packages: WebWriterPackage[], importMap?: IImportMap | null) {
  const {documentElement, body, baseURI} = root
  const owner = documentElement.ownerDocument
  const distribution = readDistributionConfigs(root)
  removeSerializedReaderScripts(documentElement)
  const permissions = new Set(distribution.flatMap(config => config.permissions))
  const resourceKey = (url: string) => {
    try { return new URL(url, baseURI).href }
    catch { return url }
  }
  const head = root.head ?? documentElement.insertBefore(owner.createElement("head"), body)
  if(body.querySelector("figure > figcaption")) {
    const script = owner.createElement("script")
    script.id = "webwriter-figure-layout"
    script.type = "module"
    script.textContent = readerRuntimeSources.figure.replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  if(body.querySelector(Object.values(attributionAttributes).map(name => `[${name}]`).join(","))) {
    const script = owner.createElement("script")
    script.id = "webwriter-attribution-reader"
    script.type = "module"
    script.textContent = `${readerRuntimeSources.attribution}attributionReader.mount(${JSON.stringify(creativeCommonsLicenses)});`
      .replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  documentElement.querySelectorAll('style[id="webwriter-list-marker-styles"]').forEach(style => style.remove())
  if(body.querySelector(':is(ul, ol, menu)[style*="--ww-list-marker-image:"]')) {
    const style = owner.createElement("style")
    style.id = "webwriter-list-marker-styles"
    style.textContent = listMarkerStyleSource
    head.append(style)
  }
  if(documentElement.querySelector("img[usemap]") && documentElement.querySelector("map area")) {
    const script = owner.createElement("script")
    script.id = "webwriter-image-map-popovers"
    script.type = "module"
    script.textContent = readerRuntimeSources.imageMap.replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  documentElement.querySelectorAll(`script#${packageImportMapId}`).forEach(script => script.remove())
  documentElement.querySelectorAll('script[id="webwriter-scoped-registry"]').forEach(script => script.remove())
  // Replace an earlier export's runtime, including after a template change.
  const layout = documentLayoutMode(body)
  if(layout === "board") {
    const script = owner.createElement("script")
    script.id = "webwriter-layout-print"
    script.type = "module"
    script.textContent = readerRuntimeSources.print.replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  if(getDocumentRoot(body) === body && layout === "document") {
    const script = owner.createElement("script")
    script.id = "webwriter-document-viewer"
    script.type = "module"
    const hasReferences = collectReferences(body).length > 0
    const locale = (documentElement.lang || "").toLowerCase().split(/[-_]/)[0]
    const translations = siteTranslations[locale] ?? {}
    script.textContent = `${hasReferences ? referenceFormatterSource : ""}${readerRuntimeSources.document}documentReader.mount(${JSON.stringify(creativeCommonsLicenses)},${JSON.stringify(`data:image/svg+xml,${encodeURIComponent(appIconSource)}`)},${hasReferences ? "referenceFormatter.formatReferences" : "null"},${JSON.stringify(translations)});`
      .replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  const canvas = layout === "canvas"
  if(canvas) {
    const script = owner.createElement("script")
    script.id = permissions.size ? "webwriter-layout-print" : "webwriter-canvas-viewer"
    script.type = "module"
    // Evaluate the initial camera before the browser paints authored content.
    script.setAttribute("blocking", "render")
    script.textContent = `${permissions.size ? "" : `${readerRuntimeSources.canvas}${canvasSnapdomSource}canvasReader.mount(loadCanvasSnapdom);`}${readerRuntimeSources.print}`
      .replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
  const tags = new Set<string>()
  visitSerializableElements(documentElement, distribution, element => tags.add(element.localName))
  documentElement.querySelectorAll('style[id="webwriter-widget-sizing"]').forEach(style => style.remove())
  const widgetSizing = documentWidgetStyleSource(packageWidgetSchemaDefinitions(packages))
  if(widgetSizing) {
    const style = owner.createElement("style")
    style.id = "webwriter-widget-sizing"
    style.textContent = widgetSizing
    head.append(style)
  }
  if(permissions.size) {
    const script = owner.createElement("script")
    script.id = "webwriter-distribution-reader"
    script.type = "module"
    const widgets = packageWidgetSchemaDefinitions(packages).filter(widget => tags.has(widget.tagName))
    const insert = permissions.has("insert")
      ? `if(distributionContext){${distributionReaderSources.insert}distributionAction.install(distributionContext);}`
      : ""
    script.textContent = `${distributionReaderSources.core}${canvas ? canvasSnapdomSource : ""}const distributionContext=distributionReader.mountDistributionReader(document,{widgets:${JSON.stringify(widgets)}${canvas ? ",loadCanvasSnapdom" : ""}});${insert}`
      .replace(/<\/script/gi, "<\\/script")
    head.append(script)
  }
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
    head.insertBefore(packageImportMapScript(owner, importMap), head.querySelector(":scope > script"))
  }
  const needsScopedRegistry = assets.some(asset => asset.isScript)
  const existingAssets = documentElement.querySelectorAll("script[src], link[rel~='stylesheet'][href]")
  const existing = new Set<string>()
  existingAssets.forEach(element => {
    const key = resourceKey(element.getAttribute(element.localName === "script" ? "src" : "href")!)
    if(known.has(key) && !required.has(key)
      || key === legacyScopedRegistryPolyfillURL) element.remove()
    else existing.add(key)
  })
  // Keep early metadata (especially charset) ahead of the inline runtime.
  if(needsScopedRegistry) head.insertBefore(scopedCustomElementRegistryScript(owner), head.querySelector(":scope > script"))
  for(const {url, isScript} of assets) {
    const key = resourceKey(url)
    if(!key || existing.has(key)) continue
    const clone = owner.createElement(isScript ? "script" : "link") as HTMLScriptElement | HTMLLinkElement
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
