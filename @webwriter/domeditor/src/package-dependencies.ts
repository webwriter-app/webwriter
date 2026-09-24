import type {IImportMap} from "@jspm/import-map"
import type {WebWriterPackage} from "./packages"

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

export function packageModuleEntries(packages: WebWriterPackage[]) {
  return [...new Set(packages
    .filter(pkg => pkg.editingConfig?.["."]?.moduleResolution === "import-map")
    .flatMap(pkg => pkg.scripts))]
}

/** Link opt-in ESM entries as one graph so compatible dependencies share URLs.
 * Existing bundled packages never pay the generator's fetch/trace cost. */
export async function resolvePackageDependencies(
  packages: WebWriterPackage[],
  baseUrl: string,
  inputMap?: IImportMap,
): Promise<PackageDependencyPlan> {
  const entries = packageModuleEntries(packages)
  if(!entries.length) return {entries: [], map: null}
  const {Generator} = await import("@jspm/generator")
  const generator = new Generator({
    mapUrl: baseUrl,
    defaultProvider: "jspm.io",
    env: ["browser", "production", "module"],
    ...(inputMap ? {inputMap, inputMapFallbacks: "semver-compatible" as const} : {}),
  })
  await generator.link(entries)
  // Absolute addresses survive export to a different origin or to a file URL.
  const map = generator.getMap()
  const absolute = (url: string) => new URL(url, baseUrl).href
  return {
    entries,
    map: {
      ...(map.imports ? {imports: Object.fromEntries(Object.entries(map.imports).map(([key, url]) => [key, absolute(url)]))} : {}),
      ...(map.scopes ? {scopes: Object.fromEntries(Object.entries(map.scopes).map(([scope, imports]) => [
        absolute(scope),
        Object.fromEntries(Object.entries(imports).map(([key, url]) => [key, absolute(url)])),
      ]))} : {}),
      ...(map.integrity ? {integrity: Object.fromEntries(Object.entries(map.integrity).map(([url, hash]) => [absolute(url), hash]))} : {}),
    },
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
