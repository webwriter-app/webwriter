import {
  mergeEditingConfig,
  resolvePackageExport,
  type PackageEditingConfig,
  type PackageMember,
  type WebWriterPackage,
  type WebWriterPackageManifest,
} from "./packages"

export type LocalPackageFile = {text(): Promise<string>}
export type LocalPackageDirectory = {
  getFileHandle(name: string): Promise<{getFile(): Promise<LocalPackageFile>}>
  getDirectoryHandle?: (name: string) => Promise<LocalPackageDirectory>
}

export type LocalResourceUrlBuilder = (path: string) => string

export type LocalPackageWarningCode =
  | "missing-bundle"
  | "missing-export"
  | "editing-config-unavailable"
  | "invalid-editing-config"

export type LocalPackageWarning = {
  code: LocalPackageWarningCode
  path?: string
  message: string
}

export type LocalPackageLoadResult = {
  package: WebWriterPackage
  warnings: LocalPackageWarning[]
}

export class LocalPackageError extends Error {
  constructor(public readonly code: "missing-manifest" | "invalid-manifest" | "manifest-read-failed", message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "LocalPackageError"
  }
}

const isPermissionError = (error: unknown) => Boolean(error && typeof error === "object" && "name" in error
  && ((error as {name?: unknown}).name === "NotAllowedError" || (error as {name?: unknown}).name === "SecurityError"))

/** Files whose metadata is sufficient for the polling fallback to notice a
 * manifest update, a first build, or a rebuilt package member. */
export function localPackageWatchPaths(manifest: WebWriterPackageManifest | undefined) {
  const paths = ["package.json"]
  for(const target of Object.values(manifest?.exports ?? {})) {
    const resolved = resolvePackageExport(target)
    if(!resolved) continue
    if(resolved.endsWith(".*")) {
      paths.push(resolved.slice(0, -1) + "js", resolved.slice(0, -1) + "css")
    }
    else paths.push(resolved)
  }
  return [...new Set(paths.flatMap(path => {
    try { return [normalizePath(path)] }
    catch { return [] }
  }))]
}

type LocalPackageOptions = {
  urlFor: LocalResourceUrlBuilder
  locale?: string
}

const extensionPattern = /\.(?:html?|m?js|css|ts)$/i
const scopedPackageNamePattern = /^@[^/\s]+\/[^/\s]+$/
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
/** Normalizes a package-relative path and rejects traversal or URL-like paths. */
export function normalizeLocalPackagePath(value: string) {
  if(typeof value !== "string" || !value) throw new TypeError("The package path must be a non-empty string")
  const path = value.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "")
  if(path.startsWith("/") || /^[A-Za-z]:/.test(path)) throw new TypeError(`Invalid absolute package path '${value}'`)
  const parts = path.split("/").filter(Boolean)
  if(!parts.length || parts.some(part => part === "." || part === "..")) {
    throw new TypeError(`Invalid package path '${value}'`)
  }
  return parts.join("/")
}

const normalizePath = normalizeLocalPackagePath
const configKey = (value: string) => value.replace(/\.\*$/, "").replace(extensionPattern, "")
const titleCase = (value: string) => value
  .replace(/^\.\/(?:widgets|snippets)\//, "")
  .replace(/\.\*$/, "")
  .replace(extensionPattern, "")
  .replaceAll(/[-_]+/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())

const localized = (value: string | Record<string, string> | undefined, locale: string) => {
  if(typeof value === "string") return value
  if(!value) return
  const normalized = locale.toLowerCase()
  const exact = Object.keys(value).find(key => key.toLowerCase() === normalized)
  const language = normalized.split("-")[0]
  const languageKey = Object.keys(value).find(key => key.toLowerCase() === language)
  return (exact && value[exact]) || (languageKey && value[languageKey]) || value._
}

const personLabel = (person: WebWriterPackageManifest["author"]) => {
  if(typeof person === "string") return person.trim() || undefined
  return person?.name?.trim() || person?.username?.trim() || person?.email?.trim()
}

const isManifest = (value: unknown): value is WebWriterPackageManifest => {
  if(!value || typeof value !== "object") return false
  const manifest = value as Partial<WebWriterPackageManifest>
  const validExportTarget = (target: unknown): boolean => {
    if(typeof target === "string") {
      try { normalizePath(target); return true }
      catch { return false }
    }
    if(!target || typeof target !== "object" || Array.isArray(target)) return false
    const entries = Object.entries(target)
    return entries.length > 0 && entries.every(([, nested]) => validExportTarget(nested))
  }
  const validExports = manifest.exports === undefined || (
    typeof manifest.exports === "object" && manifest.exports !== null && !Array.isArray(manifest.exports)
    && Object.entries(manifest.exports).every(([name, target]) => name.startsWith(".") && validExportTarget(target))
  )
  return typeof manifest.name === "string" && manifest.name.length > 0
    && typeof manifest.version === "string" && manifest.version.length > 0
    && validExports
    && (manifest.keywords === undefined || Array.isArray(manifest.keywords) && manifest.keywords.every(keyword => typeof keyword === "string"))
    && (manifest.contributors === undefined || Array.isArray(manifest.contributors))
    && (manifest.editingConfig === undefined || typeof manifest.editingConfig === "object" && manifest.editingConfig !== null && !Array.isArray(manifest.editingConfig))
}

async function readFile(directory: LocalPackageDirectory, path: string) {
  const parts = normalizePath(path).split("/").filter(Boolean)
  if(!parts.length) throw new Error("The package path is empty")
  let current: LocalPackageDirectory = directory
  for(const part of parts.slice(0, -1)) {
    if(current.getDirectoryHandle) {
      try { current = await current.getDirectoryHandle(part) }
      catch { current = await current.getFileHandle(part) as unknown as LocalPackageDirectory }
    }
    else current = await current.getFileHandle(part) as unknown as LocalPackageDirectory
  }
  return (await current.getFileHandle(parts.at(-1)!)).getFile()
}

async function fileExists(directory: LocalPackageDirectory, path: string) {
  try {
    await readFile(directory, path)
    return true
  }
  catch {
    return false
  }
}

function memberFor(
  manifest: WebWriterPackageManifest,
  exportName: string,
  target: string,
  editingConfig: PackageEditingConfig,
  iconUrl: string | undefined,
  urlFor: LocalResourceUrlBuilder,
  locale: string,
): PackageMember | null {
  const isWidget = exportName.startsWith("./widgets/")
  const isSnippet = exportName.startsWith("./snippets/")
  if(!isWidget && !isSnippet) return null
  const key = configKey(exportName)
  const config = editingConfig[key] ?? {}
  const base = {
    id: `${manifest.name}@${manifest.version}:${key}`,
    packageName: manifest.name,
    packageVersion: manifest.version,
    exportName,
    label: localized(config.label, locale) ?? titleCase(key),
    description: localized(config.description, locale),
    insertable: config.uninsertable !== true,
    iconUrl,
    editingConfig: config,
  }
  if(isSnippet) return {...base, kind: "snippet", htmlUrl: urlFor(normalizePath(target))}
  const wildcard = target.endsWith(".*")
  const scriptPath = wildcard ? target.slice(0, -1) + "js" : target
  const stylePath = wildcard ? target.slice(0, -1) + "css" : undefined
  const tagName = key.split("/").at(-1)!.replace(extensionPattern, "")
  return {
    ...base,
    kind: "widget",
    tagName,
    scriptUrl: /\.(?:m?js|ts)$/i.test(scriptPath) || wildcard ? urlFor(normalizePath(scriptPath)) : undefined,
    styleUrl: stylePath ? urlFor(normalizePath(stylePath)) : undefined,
  }
}

/** Loads a package from a local directory without depending on browser globals. */
export async function loadLocalPackage(directory: LocalPackageDirectory, options: LocalPackageOptions): Promise<LocalPackageLoadResult> {
  let manifestText: string
  try {
    manifestText = await (await readFile(directory, "package.json")).text()
  }
  catch(error) {
    if(isPermissionError(error)) {
      throw new LocalPackageError(
        "manifest-read-failed",
        "Permission to read this package folder was denied. Select the folder again to grant access.",
        {cause: error},
      )
    }
    throw new LocalPackageError("missing-manifest", "The local package has no readable package.json", {cause: error})
  }
  let manifest: WebWriterPackageManifest
  try {
    const parsed: unknown = JSON.parse(manifestText)
    if(!isManifest(parsed)) throw new Error("name, version, and exports are invalid")
    if(!scopedPackageNamePattern.test(parsed.name)) throw new Error("name must be a scoped package name")
    if(!semverPattern.test(parsed.version)) throw new Error("version must be a SemVer version")
    manifest = parsed
  }
  catch(error) {
    throw new LocalPackageError("invalid-manifest", "The local package.json is malformed or missing name/version", {cause: error})
  }

  const locale = options.locale ?? "en"
  const warnings: LocalPackageWarning[] = []
  const exports = manifest.exports ?? {}
  const resolve = (name: string) => resolvePackageExport(exports[name])
  const iconPath = resolve("./icon")
  const iconUrl = iconPath ? options.urlFor(normalizePath(iconPath)) : undefined
  let externalConfig: PackageEditingConfig | undefined
  const configPath = resolve("./editing-config.json")
  if(configPath) {
    try {
      const configText = await (await readFile(directory, configPath)).text()
      const parsed: unknown = JSON.parse(configText)
      if(parsed && typeof parsed === "object" && !Array.isArray(parsed)) externalConfig = parsed as PackageEditingConfig
      else warnings.push({code: "invalid-editing-config", path: configPath, message: "The editing-config.json is not an object; inline config was used."})
    }
    catch(error) {
      warnings.push({code: "editing-config-unavailable", path: configPath, message: `Optional editing config could not be read: ${error instanceof Error ? error.message : String(error)}`})
    }
  }
  const editingConfig = mergeEditingConfig(externalConfig, manifest.editingConfig)
  const members: PackageMember[] = []
  for(const [exportName, targetValue] of Object.entries(exports)) {
    const target = resolvePackageExport(targetValue)
    if(!target) continue
    const member = memberFor(manifest, exportName, target, editingConfig, iconUrl, options.urlFor, locale)
    if(!member) continue
    const requiredPaths = member.kind === "widget"
      ? [member.scriptUrl && normalizePath(target.endsWith(".*") ? target.slice(0, -1) + "js" : target)].filter(Boolean) as string[]
      : [normalizePath(target)]
    const available = await Promise.all(requiredPaths.map(path => fileExists(directory, path)))
    if(available.some(found => !found)) {
      warnings.push({code: "missing-export", path: target, message: `Configured package export is missing: ${target}`})
      continue
    }
    if(member.kind === "widget" && member.styleUrl && target.endsWith(".*")) {
      const stylePath = normalizePath(target.slice(0, -1) + "css")
      if(!await fileExists(directory, stylePath)) member.styleUrl = undefined
    }
    members.push(member)
  }
  if(!members.length) warnings.push({code: "missing-bundle", message: "The package does not contain a usable widget or snippet bundle yet."})
  const globalConfig = editingConfig["."] ?? {}
  const authors = [manifest.author, ...(manifest.contributors ?? [])].map(personLabel).filter((value): value is string => Boolean(value))
  const pkg: WebWriterPackage = {
    name: manifest.name,
    version: manifest.version,
    label: localized(globalConfig.label, locale) ?? titleCase(manifest.name.split("/").at(-1) ?? manifest.name),
    description: localized(globalConfig.description, locale) ?? manifest.description,
    iconUrl,
    authors: [...new Set(authors)],
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    links: {homepage: manifest.homepage, repository: typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url},
    members,
    scripts: [...new Set(members.flatMap(member => member.scriptUrl ? [member.scriptUrl] : []))],
    styles: [...new Set(members.flatMap(member => member.styleUrl ? [member.styleUrl] : []))],
    editingConfig,
    manifest: {...manifest},
  }
  return {package: pkg, warnings}
}
