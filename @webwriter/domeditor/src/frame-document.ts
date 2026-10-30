import type {IImportMap} from "@jspm/import-map"
import {stripActiveContent} from "./active-content"
import {WEBWRITER_GENERATOR} from "./document-head"
import {ensureDefaultDocumentTheme} from "./document-themes"
import {frameImportMap, frameLocalPackageURL, framePackages} from "./frame-local-packages"
import {packageImportMapId} from "./package-dependencies"
import type {WebWriterPackage} from "./packages"
import {appendSerializedAssets, escapeHTMLAttribute, removeSerializedReaderScripts, restoreOriginalResourceURLs, scopedCustomElementRegistryScript, serializeDoctype} from "./serialization"
import {clearEditorArtifacts} from "./editor-artifacts"
import proofreadingWorkerURL from "./proofreading-worker.ts?worker&url"
import {editorFrameOrigin} from "./frame-origins"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "./local-package-worker"

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
  /** Render the document directly without the iframe's parent bridge. */
  standalone?: boolean
  /** Activity tracker for a complete learner document served over HTTP. */
  learnerEntryURL?: string
}

const defaultDocumentThemeHTML = () => {
  const root = document.implementation.createHTMLDocument()
  ensureDefaultDocumentTheme(root)
  return root.head.querySelector("style")!.outerHTML
}

/** Embed the local widget graph before sharing a preview with other browsers.
 * Keep the package metadata so the normal preview sanitizer and asset loader
 * can install the trusted bundles again with the learner's fresh nonce. */
export async function bundleLocalPreviewPackages(source: Document, packages: WebWriterPackage[], importMap: IImportMap | null, baseURL: string) {
  const isLocalURL = (value: string) => new URL(value, baseURL).pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)
  const localAssets = new Set(packages.flatMap(pkg => [...pkg.scripts, ...pkg.styles]
    .filter(url => pkg.developerSource || isLocalURL(url))))
  const isLocal = (value: string) => localAssets.has(value) || isLocalURL(value)
  const root = source.cloneNode(true) as Document
  appendSerializedAssets(root, packages, importMap)
  const resources = new Set([...root.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel~="stylesheet"][href]')]
    .map(element => element.getAttribute(element.localName === "script" ? "src" : "href")!))
  const entries = [...new Set(packages.flatMap(pkg => [...pkg.scripts, ...pkg.styles]))]
    .filter(url => isLocal(url) && resources.has(url))
  if(!entries.length) return {packages, importMap}
  const {bundleOfflineModules} = await import("./offline-module-bundler")
  const {js, css} = await bundleOfflineModules(entries.map(url => new URL(url, baseURL).href), importMap ?? {}, baseURL)
  const scriptURL = `data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`
  const styleURL = css ? `data:text/css;charset=utf-8,${encodeURIComponent(css)}` : undefined
  const resourcePath = (value: string) => {
    const url = new URL(value, baseURL)
    return url.pathname + url.search
  }
  const bundledStyles = new Set(packages.flatMap(pkg => pkg.styles).filter(url => entries.includes(url)).map(resourcePath))
  // Preview CSS survives sanitization. Retire the host-only links before the
  // portable package styles are installed, including links on the frame origin.
  source.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]').forEach(link => {
    const url = link.getAttribute("href")!
    if(isLocal(url) && bundledStyles.has(resourcePath(url))) link.remove()
  })
  const rewrite = (url: string | undefined, bundledURL: string | undefined) =>
    url && isLocal(url) ? entries.includes(url) ? bundledURL : undefined : url
  return {
    importMap,
    packages: packages.map(pkg => {
      const bundled = [...pkg.scripts, ...pkg.styles].some(url => entries.includes(url))
      return {
        ...pkg,
        scripts: [...new Set(pkg.scripts.flatMap(url => rewrite(url, scriptURL) ?? []))],
        styles: [...new Set([
          ...pkg.styles.flatMap(url => rewrite(url, styleURL) ?? []),
          ...(bundled && styleURL ? [styleURL] : []),
        ])],
        members: pkg.members.map(member => ({...member,
          scriptUrl: rewrite(member.scriptUrl, scriptURL), styleUrl: rewrite(member.styleUrl, styleURL),
        })),
      }
    }),
  }
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
  const packageStyles = hasWidgetScripts ? "* data: blob: 'unsafe-inline'" : `'nonce-${nonce}' https://fonts.bunny.net data:`
  // Module workers also fetch their imports under worker-src in Chromium.
  // Permit the trusted frame origin for those HTTP development modules.
  const entryURL = new URL(options.entryURL, /^[a-z]+:/i.test(options.entryURL) ? options.hostOrigin : editorFrameOrigin())
  const workerSource = new URL(proofreadingWorkerURL, entryURL).origin
  const testShell = new URL(`${import.meta.env.BASE_URL}frame-shell.html`, `${entryURL.origin}/`).href
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation} 'wasm-unsafe-eval'; style-src 'none'; style-src-elem ${packageStyles}; style-src-attr 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src * data: blob:; media-src * data: blob:; frame-src https: blob: data: ${testShell}; worker-src blob: https: ${workerSource}; object-src 'none'; base-uri 'none'; form-action 'none'`
  const csp = `<meta class="◆ ◆editor-only" http-equiv="Content-Security-Policy" content="${escapeHTMLAttribute(policy)}">`
  const bridge = `<meta class="◆ ◆editor-only" name="webwriter-editor-bridge" data-nonce="${nonce}" data-host-origin="${escapeHTMLAttribute(options.hostOrigin)}">`
  // Happy DOM deliberately disables external script execution but reports
  // each attempted iframe load as an uncaught exception. Keep virtual test
  // frames inert; browser builds retain the executable script types.
  const editorScriptType = !options.executeScripts ? "application/json" : "module"
  const registryScript = hasWidgetScripts ? scopedCustomElementRegistryScript(document, true) : null
  if(registryScript) {
    registryScript.setAttribute("nonce", nonce)
    if(!options.executeScripts) registryScript.type = "application/json"
  }
  const scopedRegistry = registryScript?.outerHTML ?? ""
  const bootstrapScripts = `<script class="◆ ◆editor-only" nonce="${nonce}">globalThis.litIssuedWarnings ??= new Set(); globalThis.litIssuedWarnings.add("dev-mode");</script>${scopedRegistry}<script class="◆ ◆editor-only" nonce="${nonce}" type="${editorScriptType}" src="${escapeHTMLAttribute(options.entryURL)}"></script>`
  const bootstrap = `${csp}${bridge}${bootstrapScripts}`
  if(documentHTML === null) {
    return `<!-- frame ${options.revision} --><!DOCTYPE html><html lang="${escapeHTMLAttribute(options.language)}"><head>${bootstrap}<meta name="generator" content="${escapeHTMLAttribute(WEBWRITER_GENERATOR)}">${defaultDocumentThemeHTML()}</head><body></body></html>`
  }

  const parsed = new DOMParser().parseFromString(documentHTML, "text/html")
  restoreOriginalResourceURLs(parsed)
  // The iframe receives its trusted resolution through load-widgets.
  parsed.getElementById(packageImportMapId)?.remove()
  // Saved exports carry the standalone adapter. Replace it with the nonce-bearing
  // editor bootstrap copy below so the frame has exactly one runtime instance.
  parsed.querySelectorAll('script[id="webwriter-scoped-registry"]').forEach(script => script.remove())
  // Export readers run only in published documents. Editing features provide
  // their behavior here; saved inline copies have no nonce under this CSP.
  removeSerializedReaderScripts(parsed)
  // A CSP-blocked external module poisons the realm's module map for that URL,
  // including a later nonce-bearing load of the same installed widget. Parse
  // authored modules without src so the parser marks them already started,
  // then restore their attributes before the editor module initializes.
  const authoredModules = (options.executeScripts ? [...parsed.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')] : [])
    .filter(script => script.namespaceURI === "http://www.w3.org/1999/xhtml")
  const moduleAttributes = authoredModules.map(script => [script.getAttribute("src"), script.getAttribute("class")])
  authoredModules.forEach(script => {
    script.removeAttribute("src")
    script.classList.add("◆pending-module")
  })
  const restoreModules = moduleAttributes.length ? `<script class="◆ ◆editor-only" nonce="${nonce}" type="${editorScriptType}">
const attributes = ${JSON.stringify(moduleAttributes).replaceAll("<", "\\u003c")};
document.querySelectorAll("script.◆pending-module").forEach((script, index) => {
  const [src, className] = attributes[index];
  script.setAttribute("src", src);
  if(className === null) script.removeAttribute("class");
  else script.setAttribute("class", className);
});
</script>` : ""
  ensureDefaultDocumentTheme(parsed)
  parsed.head.insertAdjacentHTML("beforeend", `${restoreModules}${bridge}${bootstrapScripts}`)
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
  // Keep fragment links authored as fragments. The frame link handler resolves
  // them against its current URL, including previews hosted by frame-shell.
  clearEditorArtifacts(source)

  // Remove authored executable content before installing the trusted widget
  // and preview bridge scripts in the isolated frame.
  stripActiveContent(source, {allowStyles: true, allowIframes: true, allowLocalIframes: true})

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
  const packages = framePackages(options.packages, options.hostOrigin, frameOrigin)
  appendSerializedAssets(source,
    packages,
    frameImportMap(options.importMap, options.hostOrigin, frameOrigin))
  // These are bootstrap resources, not learner edits. Keep them out of later
  // document snapshots so a small interaction never resends widget bundles.
  const packageStyles = new Set(packages.flatMap(pkg => pkg.styles))
  source.head.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]').forEach(link => {
    if(packageStyles.has(link.getAttribute("href")!)) link.classList.add("◆", "◆editor-only")
  })
  if(source.head) {
    if(options.standalone) {
      // Match the preview shell's directory so relative document resources
      // keep working when the top-level learner page lives under /live/.
      const base = source.createElement("base")
      base.href = new URL(import.meta.env.BASE_URL, `${options.frameOrigin}/`).href
      source.head.prepend(base)
    }
    const scripts = Array.from(source.head.querySelectorAll("script"))
    scripts.forEach(script => script.classList.add("◆", "◆editor-only"))
    const policy = source.createElement("meta")
    // A live-session learner prepares this preview again with a fresh nonce.
    // Remove the earlier policy along with the other preview bootstrap nodes.
    policy.className = "◆ ◆editor-only"
    policy.httpEquiv = "Content-Security-Policy"
    const packageEvaluation = scripts.some(script => script.hasAttribute("src")) ? " 'unsafe-eval'" : ""
    policy.content = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation}; style-src * data: 'unsafe-inline'; img-src * data: blob:; font-src * data:; media-src * data: blob:; connect-src * data: blob:; frame-src https: blob: data:; worker-src blob: https:; object-src 'none'; base-uri ${options.standalone ? "'self'" : "'none'"}; form-action 'none'`
    source.head.prepend(policy)
    if(options.executeScripts && (!options.standalone || options.learnerEntryURL)) {
      if(!options.standalone) {
        const bridge = source.createElement("meta")
        bridge.className = "◆ ◆editor-only"
        bridge.name = "webwriter-preview-bridge"
        bridge.setAttribute("data-nonce", options.bridgeNonce)
        bridge.setAttribute("data-host-origin", options.hostOrigin)
        source.head.append(bridge)
      }
      const entry = source.createElement("script")
      if(options.standalone) entry.id = "webwriter-live-learner"
      entry.className = "◆ ◆editor-only"
      entry.type = "module"
      entry.src = options.standalone ? options.learnerEntryURL! : options.entryURL
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
