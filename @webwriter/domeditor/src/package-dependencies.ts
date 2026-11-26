import {markEditorOnlyNode} from "./editor-artifacts"
import {isWidgetDataContainer} from "./active-content"
import type {IImportMap} from "@jspm/import-map"
import {describePackageExport, packageCdnUrl, packageUpdateKind, packageVersionMajor, packageWidgetSchemaDefinitions, parsePackageWidgetReference, resolvePackageExport, type WebWriterPackage, type WebWriterPackageRegistry} from "./packages"
import {canonicalNpmUrl, fetchWithin, JSDELIVR_DATA_ENDPOINT, JSDELIVR_NPM_ENDPOINT, NPM_FILE_MIRRORS, NPM_FILE_TIMEOUT_MS, npmPublishedVersions} from "./npm-files"
import {parseLocalPackageRoute} from "./local-package-worker"
export {runtimeDocumentBaseURL} from "./document-base-url"

/** Runtime assets and their exact browser resolutions for one installed set. */
export type PackageDependencyPlan = {
  entries: string[]
  map: IImportMap | null
}

export const packageImportMapId = "webwriter-package-importmap"

class DeprecatedDocumentPackageError extends Error {}

export class UnavailableDocumentPackagesError extends AggregateError {
  constructor(errors: unknown[], readonly warnings: string[], readonly openWithoutWidgets: () => WebWriterPackage[]) {
    super(errors, warnings.join(" "))
  }
}

function unwrapUnsupportedWidgets(root: ParentNode, supportedTags: Set<string>, unavailableTags: Set<string>) {
  for(const element of root.querySelectorAll("*")) {
    if(element.namespaceURI !== "http://www.w3.org/1999/xhtml") continue
    const tag = element.localName
    if(tag === "template") unwrapUnsupportedWidgets((element as HTMLTemplateElement).content, supportedTags, unavailableTags)
    if(!tag.includes("-") || supportedTags.has(tag)) continue
    if(!(unavailableTags.has(tag) || /^(?:webwriter|ww)-/.test(tag) || element.classList.contains("ww-widget"))) continue
    for(const child of Array.from(element.children)) {
      if(isWidgetDataContainer(child)) child.remove()
    }
    element.replaceWith(...element.childNodes)
  }
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  !!value && typeof value === "object" && !Array.isArray(value)
  && Object.values(value).every(item => typeof item === "string")

export function isPackageImportMap(value: unknown): value is IImportMap {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const map = value as IImportMap
  return (map.imports === undefined || isStringRecord(map.imports))
    && (map.integrity === undefined || isStringRecord(map.integrity))
    && (map.scopes === undefined || !!map.scopes && typeof map.scopes === "object" && !Array.isArray(map.scopes)
      && Object.values(map.scopes).every(isStringRecord))
}

/** Whether a map resolves anything. Sets of fully bundled packages link to an empty map. */
export const hasImportMapEntries = (map: IImportMap | null | undefined): map is IImportMap =>
  !!map && (Object.keys(map.imports ?? {}).length > 0 || Object.keys(map.scopes ?? {}).length > 0)

/** Every widget script. All are linked into one import map; fully bundled scripts contribute no mappings. */
export function packageModuleEntries(packages: WebWriterPackage[]) {
  return [...new Set(packages.flatMap(pkg => pkg.scripts))]
}

/** Resolve the pinned packages for a preview, or compatible packages for editing.
 * When editing, retire saved widget resources so the frame and subsequent exports
 * get those resources from the resolved packages. */
export async function loadDocumentPackages(
  source: Document,
  registry?: WebWriterPackageRegistry,
  installed: WebWriterPackage[] = [],
  {forEditing = false}: {forEditing?: boolean} = {},
): Promise<WebWriterPackage[]> {
  const restored = forEditing ? source : source.cloneNode(true) as Document
  const packageProvider = npmFileProvider(JSDELIVR_NPM_ENDPOINT)
  const {restoreOriginalResourceURLs} = await import("./serialization")
  restoreOriginalResourceURLs(restored)

  const scripts: HTMLScriptElement[] = []
  const styles: HTMLLinkElement[] = []
  const collectAssets = (root: ParentNode) => {
    root.querySelectorAll<HTMLScriptElement>('script[type="module"][src]').forEach(script => scripts.push(script))
    if(forEditing) root.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]').forEach(link => styles.push(link))
    root.querySelectorAll<HTMLTemplateElement>("template").forEach(template => collectAssets(template.content))
  }
  collectAssets(restored)

  const references = new Map<string, {name: string, version: string, scripts: Array<{url: string, script: HTMLScriptElement}>}>()
  const packageURL = (raw: string) => {
    try { return canonicalNpmUrl(new URL(raw, restored.baseURI).href) }
    catch { return "" }
  }
  const packagePath = (url: string) => url.startsWith(`${JSDELIVR_NPM_ENDPOINT}/`)
    ? url.slice(JSDELIVR_NPM_ENDPOINT.length + 1).replace(exactPackagePath, "$1$3")
    : url
  for(const script of scripts) {
    const url = packageURL(script.getAttribute("src")!)
    const ref = packageProvider.parseUrlPkg(url)
    if(!ref || !ref.name.startsWith("@webwriter/")) continue
    const version = ref.version.replace(/%2b/gi, "+")
    if(packageVersionMajor(version) === undefined) continue
    const reference = references.get(ref.name) ?? {name: ref.name, version, scripts: []}
    if(reference.version !== version) {
      if(!forEditing || packageVersionMajor(reference.version) !== packageVersionMajor(version)) {
        throw new Error(`Document references conflicting versions of ${ref.name}: ${reference.version} and ${version}`)
      }
      if(packageUpdateKind(reference.version, version)) reference.version = version
    }
    reference.scripts.push({url, script})
    references.set(ref.name, reference)
  }

  if(!references.size) return []
  const activeRegistry = registry ?? new (await import("./packages")).WebWriterPackageRegistry()
  const required = [...references.values()]
  const published = new Map<string, Awaited<ReturnType<WebWriterPackageRegistry["publishedPackageManifest"]>>>()
  const pending = required.map(async({name, version: pinned, scripts: authored}) => {
    if(forEditing) {
      const local = installed.find(pkg => {
        if(!pkg.developerSource || pkg.name !== name
          || (pkg.version !== pinned && packageUpdateKind(pinned, pkg.version) !== "compatible")) return false
        // The offline export names package files by their npm paths. A local
        // build must provide the same entries through the local package worker.
        const paths = new Set(pkg.scripts.flatMap(script => {
          const entry = parseLocalPackageRoute(script)
          return entry?.kind === "route" ? [packagePath(packageCdnUrl(name, pinned, entry.route.path))] : []
        }))
        return authored.every(({url}) => paths.has(packagePath(url)))
      })
      if(local) return local
    }
    let version = pinned
    const existing = installed.find(pkg => pkg.name === name && !pkg.developerSource && (forEditing || pkg.version === pinned))
    if(forEditing) {
      if(existing && packageUpdateKind(version, existing.version) === "compatible") version = existing.version
      // Use the current candidate if the compatible-version lookup fails.
      version = await activeRegistry.latestCompatibleVersion(name, version).catch(() => version)
    }
    const installedScripts = new Set(existing?.scripts.map(canonicalNpmUrl) ?? [])
    const reuse = existing?.version === version && (version === pinned
      ? authored.every(({url}) => installedScripts.has(url))
      : existing.manifest && authored.every(({url}) => existing.scripts.some(script => packagePath(canonicalNpmUrl(script)) === packagePath(url))))
    if(forEditing && !reuse) {
      const release = await activeRegistry.publishedPackageManifest(name, version)
      published.set(name, release)
      const {deprecated} = release
      if(deprecated) throw new DeprecatedDocumentPackageError(`${name}@${version} is deprecated. ${deprecated}`)
    }
    const pkg = reuse ? existing : await activeRegistry.getPackage({name, version})
    const order = authored.map(({url}) => forEditing ? packagePath(url) : url)
    const position = (url: string) => {
      const canonical = canonicalNpmUrl(url)
      const index = order.indexOf(forEditing ? packagePath(canonical) : canonical)
      return index === -1 ? Infinity : index
    }
    return {...pkg, scripts: [...pkg.scripts].sort((a, b) => position(a) - position(b))}
  })
  if(!forEditing) return Promise.all(pending)
  const results = await Promise.allSettled(pending)
  const packages = results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
  const failures = results.flatMap((result, index) => result.status === "rejected"
    ? [{reference: required[index], reason: result.reason}] : [])
  const retirePackageAssets = (unavailableNames: string[] = []) => {
    const managedStyles = new Set(packages.flatMap(pkg => pkg.styles.map(url => packagePath(canonicalNpmUrl(url)))))
    const retiredNames = [...packages.filter(pkg => pkg.scripts.length).map(pkg => pkg.name), ...unavailableNames]
    for(const name of retiredNames) {
      for(const {url, script} of references.get(name)?.scripts ?? []) {
        managedStyles.add(packagePath(url).replace(/\.(?:m?js)$/, ".css"))
        script.remove()
      }
    }
    for(const link of styles) {
      const url = packageURL(link.getAttribute("href")!)
      const ref = packageProvider.parseUrlPkg(url)
      if(ref && references.has(ref.name) && managedStyles.has(packagePath(url))) link.remove()
    }
  }
  if(failures.length) {
    const warnings = failures.map(({reference: {name, version}, reason}) => reason instanceof DeprecatedDocumentPackageError
      ? reason.message : `WebWriter could not load ${name}@${version}.`)
    throw new UnavailableDocumentPackagesError(failures.map(failure => failure.reason), warnings, () => {
      const unavailableNames = failures.map(({reference}) => reference.name)
      const supportedTags = new Set(packageWidgetSchemaDefinitions([
        ...installed.filter(pkg => !references.has(pkg.name)), ...packages,
      ]).map(widget => widget.tagName))
      const unavailableTags = new Set(packageWidgetSchemaDefinitions(
        installed.filter(pkg => unavailableNames.includes(pkg.name)),
      ).map(widget => widget.tagName))
      for(const {reference: {name, scripts}} of failures) {
        const manifest = published.get(name)
        for(const [exportName, target] of Object.entries(manifest?.exports ?? {})) {
          const source = resolvePackageExport(target)
          if(!source) continue
          const descriptor = describePackageExport(exportName, source)
          if(descriptor.type === "widget" && parsePackageWidgetReference(`${name}/widgets/${descriptor.name}`)) unavailableTags.add(descriptor.name)
        }
        for(const {url} of scripts) {
          const file = new URL(url).pathname.split("/").at(-1)?.replace(/\.(?:m?js)$/, "")
          const tag = parsePackageWidgetReference(`${name}/widgets/${file}`)?.tag
          if(tag) unavailableTags.add(tag)
        }
      }
      retirePackageAssets(unavailableNames)
      unwrapUnsupportedWidgets(restored, supportedTags, unavailableTags)
      return packages
    })
  }
  retirePackageAssets()
  return packages
}

/** Whether an npm file host answers at all, probed with a small published file. */
async function npmHostAvailable(base: string) {
  try {
    const response = await fetchWithin(globalThis.fetch.bind(globalThis), `${base}/lit@3.3.2/package.json`, {}, NPM_FILE_TIMEOUT_MS)
    return response.ok
  }
  catch { return false }
}

type PublishedVersionCache = Map<string, Promise<string[]>>

/** Published versions of an npm package, from jsDelivr's data API or else the npm registry. */
function publishedVersions(name: string, cache: PublishedVersionCache) {
  let request = cache.get(name)
  if(!request) {
    request = (async() => {
      try {
        const response = await fetchWithin(globalThis.fetch.bind(globalThis), `${JSDELIVR_DATA_ENDPOINT}/packages/npm/${name}`, {}, NPM_FILE_TIMEOUT_MS)
        if(response.ok) {
          const data = await response.json() as {versions?: unknown}
          if(Array.isArray(data.versions)) return data.versions
            .map(entry => typeof entry === "string" ? entry : (entry as {version?: unknown})?.version)
            .filter((version): version is string => typeof version === "string")
        }
      }
      catch { /* Use the registry below. */ }
      return npmPublishedVersions(name, globalThis.fetch.bind(globalThis))
    })()
    cache.set(name, request)
    request.catch(() => cache.delete(name))
  }
  return request
}

type SemverRange = {bestMatch(versions: string[], unstable?: boolean): {toString(): string} | null}
/** Node built-ins do not exist in the browser. The generator skips them, instead of installing jspm.io polyfills. */
const nodeBuiltins = (("assert assert/strict async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel "
  + "dns dns/promises domain events fs fs/promises http http2 https inspector inspector/promises module net os path path/posix path/win32 "
  + "perf_hooks process punycode querystring readline readline/promises repl stream stream/consumers stream/promises stream/web "
  + "string_decoder sys timers timers/promises tls trace_events tty url util util/types v8 vm wasi worker_threads zlib").split(" "))
  .flatMap(name => [name, `node:${name}`])
const exactPackagePath = /^((?:@[^/\\%@]+\/)?[^./\\%@][^/\\%@]*)@([^/]+)(\/.*)?$/

/** JSPM generator provider for published npm files at `<base>/<name>@<version>/`. Unlike the
 * generator's built-in providers, it resolves version ranges without jspm.io. */
const createNpmFileProvider = (base: string, versionCache: PublishedVersionCache) => ({
  pkgToUrl: ({name, version}: {name: string, version: string}) => `${base}/${name}@${version}/` as `${string}/`,
  parseUrlPkg(url: string) {
    if(!url.startsWith(`${base}/`)) return undefined
    const [, name, version] = url.slice(base.length + 1).match(exactPackagePath) ?? []
    return name && version ? {registry: "npm", name, version} : undefined
  },
  async resolveLatestTarget({registry, name, range, unstable}: {registry: string, name: string, range: SemverRange, unstable: boolean}, _layer: string, parentUrl?: string) {
    let version = range.bestMatch(await publishedVersions(name, versionCache), unstable)
    if(!version) {
      const registryVersions = await npmPublishedVersions(name, globalThis.fetch.bind(globalThis)).catch(() => [])
      if(registryVersions.length) {
        versionCache.set(name, Promise.resolve(registryVersions))
        version = range.bestMatch(registryVersions, unstable)
      }
    }
    if(!version) throw new Error(`No published version of ${name} matches ${String(range)}${parentUrl ? `, imported from ${parentUrl}` : ""}`)
    return {registry, name, version: version.toString()}
  },
})

/** A standalone provider keeps requests together only for its own linking pass. */
export const npmFileProvider = (base: string) => createNpmFileProvider(base, new Map())

const mapUrls = (map: IImportMap, rewrite: (url: string) => string): IImportMap => ({
  ...(map.imports ? {imports: Object.fromEntries(Object.entries(map.imports).map(([key, url]) => [key, rewrite(url)]))} : {}),
  ...(map.scopes ? {scopes: Object.fromEntries(Object.entries(map.scopes).map(([scope, imports]) => [
    rewrite(scope),
    Object.fromEntries(Object.entries(imports).map(([key, url]) => [key, rewrite(url)])),
  ]))} : {}),
  ...(map.integrity ? {integrity: Object.fromEntries(Object.entries(map.integrity).map(([url, hash]) => [rewrite(url), hash]))} : {}),
})

/** Links all widget entries as one graph so compatible dependencies share URLs. Files are resolved on
 * jsDelivr; when jsDelivr is unreachable, on the first reachable mirror, with the result mapped back to
 * jsDelivr URLs. An entry that cannot be linked on its own is left out of the map instead of blocking
 * the others, since fully bundled scripts load without mappings. */
export async function resolvePackageDependencies(
  packages: WebWriterPackage[],
  baseUrl: string,
  inputMap?: IImportMap,
): Promise<PackageDependencyPlan> {
  const entries = packageModuleEntries(packages)
  if(!entries.length) return {entries: [], map: null}
  const {Generator} = await import("@jspm/generator")
  // Keep metadata warm while this installed set is linked, then let a later
  // catalog refresh see newly published range-compatible versions.
  const versionCache: PublishedVersionCache = new Map()
  const link = async(host: string, linked: string[]) => {
    const toHost = (url: string) => host === JSDELIVR_NPM_ENDPOINT || !url.startsWith(`${JSDELIVR_NPM_ENDPOINT}/`)
      ? url : `${host}/${url.slice(JSDELIVR_NPM_ENDPOINT.length + 1)}`
    const generator = new Generator({
      mapUrl: baseUrl,
      defaultProvider: "webwriter-npm",
      customProviders: {"webwriter-npm": createNpmFileProvider(host, versionCache)} as never,
      env: ["browser", "production", "module"],
      ignore: nodeBuiltins,
      ...(inputMap ? {inputMap: mapUrls(inputMap, toHost), inputMapFallbacks: "semver-compatible" as const} : {}),
    })
    await generator.link(linked.map(toHost))
    // Absolute addresses survive export to a different origin or to a file URL.
    return mapUrls(generator.getMap(), url => canonicalNpmUrl(new URL(url, baseUrl).href))
  }
  try {
    return {entries, map: await link(JSDELIVR_NPM_ENDPOINT, entries)}
  }
  catch(error) {
    let host: string = JSDELIVR_NPM_ENDPOINT
    if(!await npmHostAvailable(JSDELIVR_NPM_ENDPOINT)) {
      for(const mirror of NPM_FILE_MIRRORS) if(await npmHostAvailable(mirror)) { host = mirror; break }
      if(host === JSDELIVR_NPM_ENDPOINT) throw error
      try { return {entries, map: await link(host, entries)} }
      catch { /* Isolate the failing entries below. */ }
    }
    const linkable: string[] = []
    for(const entry of entries) {
      try {
        await link(host, [entry])
        linkable.push(entry)
      }
      catch(entryError) {
        console.warn(`Widget script ${entry} was not linked into the import map`, entryError)
      }
    }
    return {entries, map: linkable.length ? await link(host, linkable) : {}}
  }
}

export function packageImportMapScript(root: Document, map: IImportMap, editorOnly = false) {
  const script = root.createElement("script")
  script.id = packageImportMapId
  script.type = "importmap"
  if(editorOnly) markEditorOnlyNode(script)
  script.textContent = JSON.stringify(map).replaceAll("<", "\\u003c")
  return script
}
