import type {IImportMap} from "@jspm/import-map"
import {stripActiveContent} from "./active-content"
import {WEBWRITER_GENERATOR} from "./document-head"
import {defaultDocumentTheme, documentTheme} from "./document-themes"
import {frameImportMap, frameLocalPackageURL, framePackages} from "./frame-local-packages"
import {packageImportMapId} from "./package-dependencies"
import {SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL, type WebWriterPackage} from "./packages"
import {appendSerializedAssets, escapeHTMLAttribute, restoreOriginalResourceURLs, serializeDoctype} from "./serialization"
import {clearEditorArtifacts} from "./editor-artifacts"
import proofreadingWorkerURL from "./proofreading-worker.ts?worker&url"
import {editorFrameOrigin} from "./frame-origins"

type FrameDocumentOptions = {
  bridgeNonce: string
  hostOrigin: string
  packages: WebWriterPackage[]
  entryURL: string
  executeScripts: boolean
}

export type EditorFrameOptions = FrameDocumentOptions & {
  revision: number
  language: string
}

export type PreviewFrameOptions = FrameDocumentOptions & {
  frameOrigin: string
  importMap: IImportMap | null
}

const ensureDefaultDocumentTheme = (root: Document) => {
  const hasTheme = Array.from(root.head.querySelectorAll<HTMLStyleElement>("style[data-ww-theme]"))
    .some(style => documentTheme(style.getAttribute("data-ww-theme") ?? ""))
  if(hasTheme) return
  const style = root.createElement("style")
  style.setAttribute("data-ww-theme", defaultDocumentTheme.value)
  style.setAttribute("blocking", "render")
  style.textContent = defaultDocumentTheme.source
  root.head.append(style)
}

const defaultDocumentThemeHTML = () => {
  const root = document.implementation.createHTMLDocument()
  ensureDefaultDocumentTheme(root)
  return root.head.querySelector("style")!.outerHTML
}

/** Build the isolated editing frame without normalizing authored HTML. */
export function editorFrameHTML(documentHTML: string | null, options: EditorFrameOptions) {
  // Keep authored script elements in the live DOM for serialization, but
  // give only the editor bootstrap and explicitly installed package assets
  // execution permission in this isolated editing frame. The nonce is
  // also passed through the authenticated bridge, so a document script
  // cannot learn or forge it before editor initialization.
  const nonce = escapeHTMLAttribute(options.bridgeNonce)
  // Installed widget bundles include shader and code compilers. They need
  // string evaluation, while authored scripts still require the secret nonce.
  const hasWidgetScripts = options.packages.some(pkg => pkg.scripts.length)
  const packageEvaluation = hasWidgetScripts ? " 'unsafe-eval'" : ""
  // Libraries such as CodeMirror create their own style elements inside
  // widget shadows. They cannot inherit the nonce on their module script.
  const packageStyles = hasWidgetScripts ? "* data: blob: 'unsafe-inline'" : `'nonce-${nonce}'`
  // Module workers also fetch their imports under worker-src in Chromium.
  // Permit the trusted frame origin for those HTTP development modules.
  const entryURL = new URL(options.entryURL, /^[a-z]+:/i.test(options.entryURL) ? options.hostOrigin : editorFrameOrigin())
  const workerSource = new URL(proofreadingWorkerURL, entryURL).origin
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation} 'wasm-unsafe-eval'; style-src 'none'; style-src-elem ${packageStyles}; style-src-attr 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src * data: blob:; media-src * data: blob:; frame-src https:; worker-src blob: https: ${workerSource}; object-src 'none'; base-uri 'none'; form-action 'none'`
  const csp = `<meta class="◆ ◆editor-only" http-equiv="Content-Security-Policy" content="${escapeHTMLAttribute(policy)}">`
  const bridge = `<meta class="◆ ◆editor-only" name="webwriter-editor-bridge" data-nonce="${nonce}" data-host-origin="${escapeHTMLAttribute(options.hostOrigin)}">`
  // Happy DOM deliberately disables external script execution but reports
  // each attempted iframe load as an uncaught exception. Keep virtual test
  // frames inert; browser builds retain the executable script types.
  const testScriptType = !options.executeScripts ? ' type="application/json"' : ""
  const editorScriptType = !options.executeScripts ? "application/json" : "module"
  const bootstrapScripts = `<script class="◆ ◆editor-only" nonce="${nonce}">globalThis.litIssuedWarnings ??= new Set(); globalThis.litIssuedWarnings.add("dev-mode");</script><script class="◆ ◆editor-only" nonce="${nonce}"${testScriptType} src="${escapeHTMLAttribute(SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL)}"></script><script class="◆ ◆editor-only" nonce="${nonce}" type="${editorScriptType}" src="${escapeHTMLAttribute(options.entryURL)}"></script>`
  const bootstrap = `${csp}${bridge}${bootstrapScripts}`
  if(documentHTML === null) {
    return `<!-- frame ${options.revision} --><!DOCTYPE html><html lang="${escapeHTMLAttribute(options.language)}"><head>${bootstrap}<meta name="generator" content="${escapeHTMLAttribute(WEBWRITER_GENERATOR)}">${defaultDocumentThemeHTML()}</head><body></body></html>`
  }

  const parsed = new DOMParser().parseFromString(documentHTML, "text/html")
  restoreOriginalResourceURLs(parsed)
  // The iframe receives its trusted resolution through load-widgets.
  parsed.getElementById(packageImportMapId)?.remove()
  ensureDefaultDocumentTheme(parsed)
  parsed.head.insertAdjacentHTML("beforeend", `${bridge}${bootstrapScripts}`)
  const cspElement = parsed.createElement("meta")
  cspElement.classList.add("◆", "◆editor-only")
  cspElement.httpEquiv = "Content-Security-Policy"
  cspElement.content = policy
  parsed.head.prepend(cspElement)
  return `<!-- frame ${options.revision} -->${serializeDoctype(parsed.doctype)}${parsed.documentElement.outerHTML}`
}


/** Prepare a detached document for the isolated preview frame. */
export function previewFrameHTML(source: Document, options: PreviewFrameOptions) {
  const nonce = crypto.randomUUID()
  // srcdoc inherits the host URL for relative links; explicitly retain
  // native carousel navigation inside the preview frame.
  if(source.body.classList.contains("ww-slides")) {
    source.querySelectorAll<HTMLAnchorElement>('body > nav.ww-slides-navigation a[href^="#"], body.ww-slides .ww-slide-directions a[href^="#"]').forEach(link => {
      link.setAttribute("href", `about:srcdoc${link.getAttribute("href")}`)
    })
  }
  clearEditorArtifacts(source)

  // Remove authored executable content before installing the trusted widget
  // and preview bridge scripts in the isolated frame.
  stripActiveContent(source, {allowStyles: true, allowIframes: true})

  // Use the same dependency selection as saving, after stripping authored code.
  if(options.executeScripts) {
    source.querySelectorAll<HTMLElement>("[src], [href]").forEach(element => {
      for(const name of ["src", "href"]) {
        const value = element.getAttribute(name)
        if(!value) continue
        const rewritten = frameLocalPackageURL(value, options.hostOrigin, options.frameOrigin)
        if(rewritten !== value) element.setAttribute(name, rewritten)
      }
    })
  }
  const frameOrigin = !options.executeScripts ? options.hostOrigin : options.frameOrigin
  appendSerializedAssets(source,
    framePackages(options.packages, options.hostOrigin, frameOrigin),
    frameImportMap(options.importMap, options.hostOrigin, frameOrigin))
  if(source.head) {
    const scripts = Array.from(source.head.querySelectorAll("script"))
    const policy = source.createElement("meta")
    policy.httpEquiv = "Content-Security-Policy"
    const packageEvaluation = scripts.some(script => script.hasAttribute("src")) ? " 'unsafe-eval'" : ""
    policy.content = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation}; style-src * data: 'unsafe-inline'; img-src * data: blob:; font-src * data:; media-src * data: blob:; connect-src * data: blob:; frame-src https:; worker-src blob: https:; object-src 'none'; base-uri 'none'; form-action 'none'`
    source.head.prepend(policy)
    if(options.executeScripts) {
      const bridge = source.createElement("meta")
      bridge.className = "◆ ◆editor-only"
      bridge.name = "webwriter-preview-bridge"
      bridge.setAttribute("data-nonce", options.bridgeNonce)
      bridge.setAttribute("data-host-origin", options.hostOrigin)
      source.head.append(bridge)
      const entry = source.createElement("script")
      entry.className = "◆ ◆editor-only"
      entry.type = "module"
      entry.src = options.entryURL
      source.head.append(entry)
    }
    if(!options.executeScripts) scripts.forEach(script => script.type = "application/json")
    // Set the serialized attribute after connecting the nodes to the cloned
    // document; a frame's nonce-hiding machinery can clear it on insertion.
    source.head.querySelectorAll("script").forEach(script => script.setAttribute("nonce", nonce))
  }

  // `designMode` is a document property rather than serialized markup. A
  // srcdoc that does not load editor-entry therefore starts in its default
  // "off" state; explicitly clearing it also documents that invariant for
  // DOM implementations that retain a cloned property.
  source.designMode = "off"
  return `${serializeDoctype(source.doctype)}${source.documentElement.outerHTML}`
}
