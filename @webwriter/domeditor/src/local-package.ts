import {widgetDefinitionErrors} from "./schema"
import {
  editingConfigKey,
  localizedText,
  mergeEditingConfig,
  PACKAGE_DOCUMENTATION_MAX_BYTES,
  PackageDocumentationTooLargeError,
  packageContents,
  packageDocumentationExcerpt,
  packageEditingConfigOptions,
  packageNameLabel,
  personLabel,
  repositoryUrl,
  resolvePackageExport,
  type PackageContents,
  type PackageEditingConfig,
  type PackageDocumentationReadOptions,
  type PackageDocumentationResult,
  type PackageMember,
  type WebWriterPackage,
  type WebWriterPackageManifest,
} from "./packages"

export type LocalPackageFile = {text(): Promise<string>, size?: number}
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
  | "unknown-editing-option"
  | "invalid-editing-option"
  | "unmatched-editing-config"
  | "invalid-widget"
  | "undefined-widget"
  | "unreflected-property"

export type LocalPackageWarning = {
  code: LocalPackageWarningCode
  path?: string
  message: string
}

export type LocalPackageLoadResult = {
  package: WebWriterPackage
  warnings: LocalPackageWarning[]
}

export type LocalPackageDocumentationReadOptions = PackageDocumentationReadOptions & {
  packageName: string
  version: string
  localRevision?: number
}

export class LocalPackageError extends Error {
  constructor(public readonly code: "missing-manifest" | "invalid-manifest" | "manifest-read-failed", message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "LocalPackageError"
  }
}

const isPermissionError = (error: unknown) => Boolean(error && typeof error === "object" && "name" in error
  && ((error as {name?: unknown}).name === "NotAllowedError" || (error as {name?: unknown}).name === "SecurityError"))

const isMissingFileError = (error: unknown) => Boolean(error && typeof error === "object" && "name" in error
  && (error as {name?: unknown}).name === "NotFoundError")
  || error instanceof Error && /^Missing\s/.test(error.message)

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

const localReadmeCandidates = ["README.md", "readme.md", "README.markdown", "readme.markdown", "README.txt"]

const localAbortReason = (signal: AbortSignal | undefined) => signal?.reason
  ?? new DOMException("The operation was aborted", "AbortError")

const localThrowIfAborted = (signal: AbortSignal | undefined) => {
  if(signal?.aborted) throw localAbortReason(signal)
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

/** Reads only conventional root README filenames from an already-granted
 * package directory. The filename is intentionally not caller-controlled. */
export async function readLocalPackageReadme(
  directory: LocalPackageDirectory,
  options: LocalPackageDocumentationReadOptions,
): Promise<PackageDocumentationResult> {
  localThrowIfAborted(options.signal)
  let lastError: unknown
  for(const path of localReadmeCandidates) {
    try {
      const file = await readFile(directory, path)
      if(typeof file.size === "number" && file.size > PACKAGE_DOCUMENTATION_MAX_BYTES) {
        return {
          source: "local",
          packageName: options.packageName,
          version: options.version,
          ...(options.localRevision === undefined ? {} : {localRevision: options.localRevision}),
          status: "unavailable",
          reason: "too-large",
          message: `Package documentation exceeds the ${PACKAGE_DOCUMENTATION_MAX_BYTES}-byte limit.`,
          path,
        }
      }
      const markdown = await file.text()
      localThrowIfAborted(options.signal)
      return {
        source: "local",
        packageName: options.packageName,
        version: options.version,
        ...(options.localRevision === undefined ? {} : {localRevision: options.localRevision}),
        status: "available",
        path,
        ...packageDocumentationExcerpt(markdown, options),
      }
    }
    catch(error) {
      if(options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error
      if(error instanceof PackageDocumentationTooLargeError) {
        return {
          source: "local",
          packageName: options.packageName,
          version: options.version,
          ...(options.localRevision === undefined ? {} : {localRevision: options.localRevision}),
          status: "unavailable",
          reason: "too-large",
          message: error.message,
          path,
        }
      }
      if(error instanceof TypeError || error instanceof RangeError) throw error
      if(isPermissionError(error)) {
        return {
          source: "local",
          packageName: options.packageName,
          version: options.version,
          ...(options.localRevision === undefined ? {} : {localRevision: options.localRevision}),
          status: "unavailable",
          reason: "read-failed",
          message: `Package documentation could not be read: ${error instanceof Error ? error.message : String(error)}`,
          path,
        }
      }
      if(!isMissingFileError(error)) lastError = error
    }
  }
  return {
    source: "local",
    packageName: options.packageName,
    version: options.version,
    ...(options.localRevision === undefined ? {} : {localRevision: options.localRevision}),
    status: "unavailable",
    reason: lastError ? "read-failed" : "not-found",
    message: lastError
      ? `Package documentation could not be read: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      : "This local package does not contain a conventional README file.",
  }
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

const isLocalizedText = (value: unknown) => typeof value === "string"
  || !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(text => typeof text === "string")

const optionChecks: Record<string, (value: unknown) => boolean> = {
  label: isLocalizedText,
  description: isLocalizedText,
  uninsertable: value => typeof value === "boolean",
  group: value => typeof value === "string",
  inline: value => typeof value === "boolean",
  content: value => typeof value === "string",
  isolating: value => typeof value === "boolean",
  marks: value => typeof value === "string",
  propagateEvents: value => Array.isArray(value) && value.every(type => typeof type === "string" && type.length > 0),
  moduleResolution: value => value === "import-map",
}

/** Checks the editing config against the options the editor reads and the
 * package's exports, so mistakes surface in the Develop toolbox instead of
 * being silently ignored. */
export function editingConfigWarnings(editingConfig: PackageEditingConfig, contents: PackageContents): LocalPackageWarning[] {
  const warnings: LocalPackageWarning[] = []
  const memberKeys = new Set(contents.members.map(({member}) => editingConfigKey(member.exportName)))
  for(const [key, entry] of Object.entries(editingConfig)) {
    if(key !== "." && !memberKeys.has(key)) {
      warnings.push({code: "unmatched-editing-config", path: key, message: `Editing config '${key}' matches no widget or snippet export.`})
    }
    if(!entry || typeof entry !== "object" || Array.isArray(entry)) {
      warnings.push({code: "invalid-editing-option", path: key, message: `Editing config '${key}' must be an object.`})
      continue
    }
    for(const [option, value] of Object.entries(entry)) {
      if(!(packageEditingConfigOptions as readonly string[]).includes(option)) {
        warnings.push({code: "unknown-editing-option", path: key, message: `Editing config '${key}' has an unknown option '${option}'.`})
      }
      else if(option === "moduleResolution" && key !== ".") {
        warnings.push({code: "invalid-editing-option", path: key, message: "moduleResolution is only read from the package key '.'."})
      }
      else if(!optionChecks[option](value)) {
        warnings.push({code: "invalid-editing-option", path: key, message: `Editing config '${key}' has an invalid value for '${option}'.`})
      }
    }
  }
  const widgets = contents.members.flatMap(({member}) => member.kind === "widget" && member.tagName
    ? [{tagName: member.tagName, editingConfig: member.editingConfig ?? {}}] : [])
  // Schema validation builds DOM nodes; it is skipped outside a browser.
  if(typeof document === "undefined") return warnings
  for(const {tagName, message} of widgetDefinitionErrors(widgets)) {
    warnings.push({code: "invalid-widget", path: tagName, message: `Widget '${tagName}': ${message}`})
  }
  return warnings
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
  const urlFor = (path: string) => options.urlFor(normalizePath(path))
  const contents = packageContents(manifest, editingConfig, urlFor, iconUrl, locale)
  warnings.push(...editingConfigWarnings(editingConfig, contents))
  const members: PackageMember[] = []
  for(const {member, requiredPaths, inferredStylePath} of contents.members) {
    const available = await Promise.all(requiredPaths.map(path => fileExists(directory, path)))
    const missing = requiredPaths.filter((_, index) => !available[index])
    if(missing.length) {
      missing.forEach(path => warnings.push({code: "missing-export", path, message: `Configured package export is missing: ${path}`}))
      continue
    }
    if(inferredStylePath && !await fileExists(directory, inferredStylePath)) member.styleUrl = undefined
    members.push(member)
  }
  if(!members.length) warnings.push({code: "missing-bundle", message: "The package does not contain a usable widget or snippet bundle yet."})
  const tests = await Promise.all(contents.tests.map(async test => ({
    name: test.name,
    scriptUrl: urlFor(test.scriptPath),
    ...(test.inferredStylePath && await fileExists(directory, test.inferredStylePath) ? {styleUrl: urlFor(test.inferredStylePath)} : {}),
  })))
  const globalConfig = editingConfig["."] ?? {}
  const authors = [manifest.author, ...(manifest.contributors ?? [])].map(personLabel).filter((value): value is string => Boolean(value))
  const pkg: WebWriterPackage = {
    name: manifest.name,
    version: manifest.version,
    label: localizedText(globalConfig.label, locale) ?? packageNameLabel(manifest.name),
    description: localizedText(globalConfig.description, locale) ?? manifest.description,
    iconUrl,
    authors: [...new Set(authors)],
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    links: {homepage: manifest.homepage, repository: repositoryUrl(manifest.repository)},
    members,
    scripts: [...new Set(members.flatMap(member => member.scriptUrl ? [member.scriptUrl] : []))],
    styles: [...new Set(members.flatMap(member => member.styleUrl ? [member.styleUrl] : []))],
    ...(contents.migrationPath && await fileExists(directory, contents.migrationPath) ? {migrationUrl: urlFor(contents.migrationPath)} : {}),
    ...(tests.length ? {tests} : {}),
    editingConfig,
    manifest: {...manifest},
  }
  return {package: pkg, warnings}
}
