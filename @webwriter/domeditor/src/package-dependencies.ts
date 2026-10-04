import type {IImportMap} from "@jspm/import-map"
import type {WebWriterPackage} from "./packages"
import {canonicalNpmUrl, fetchWithin, JSDELIVR_DATA_ENDPOINT, JSDELIVR_NPM_ENDPOINT, NPM_FILE_MIRRORS, NPM_FILE_TIMEOUT_MS, NPM_REGISTRY_ENDPOINT} from "./npm-files"

/** Runtime assets and their exact browser resolutions for one installed set. */
export type PackageDependencyPlan = {
  entries: string[]
  map: IImportMap | null
}

export const packageImportMapId = "webwriter-package-importmap"

/** srcdoc may report about:srcdoc as its base in some browser contexts. */
export function runtimeDocumentBaseURL(root: Document = document) {
  const candidates = [root.baseURI]
  try { candidates.push(root.defaultView?.parent?.location.href ?? "") }
  catch { /* A standalone cross-origin document has no accessible parent. */ }
  for(const candidate of candidates) {
    try {
      if(/^https?:$/.test(new URL(candidate).protocol)) return candidate
    }
    catch { /* Try the next document context. */ }
  }
  throw new Error("Could not resolve the document's HTTP base URL")
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

/** Whether an npm file host answers at all, probed with a small published file. */
async function npmHostAvailable(base: string) {
  try {
    const response = await fetchWithin(globalThis.fetch.bind(globalThis), `${base}/@webcomponents/scoped-custom-element-registry@0.0.10/package.json`, {}, NPM_FILE_TIMEOUT_MS)
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
      const response = await fetchWithin(globalThis.fetch.bind(globalThis), `${NPM_REGISTRY_ENDPOINT}/${name.replace("/", "%2f")}`, {headers: {accept: "application/vnd.npm.install-v1+json"}}, NPM_FILE_TIMEOUT_MS)
      if(response.status === 404) return []
      if(!response.ok) throw new Error(`The versions of ${name} could not be read (${response.status})`)
      return Object.keys((await response.json() as {versions?: Record<string, unknown>}).versions ?? {})
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
    const version = range.bestMatch(await publishedVersions(name, versionCache), unstable)
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
  if(editorOnly) script.classList.add("◆", "◆editor-only")
  script.textContent = JSON.stringify(map).replaceAll("<", "\\u003c")
  return script
}
