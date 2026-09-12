import type {WidgetEditingConfig, WidgetSchemaDefinition} from "./schema"
import {stripActiveContent} from "./active-content"

export const NPM_SEARCH_ENDPOINT = "https://registry.npmjs.org/-/v1/search"
export const NPM_REGISTRY_ENDPOINT = "https://registry.npmjs.org"
export const JSDELIVR_NPM_ENDPOINT = "https://cdn.jsdelivr.net/npm"
export const SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL = `${JSDELIVR_NPM_ENDPOINT}/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js`
export const JSDELIVR_PACKAGE_FILES_ENDPOINT = "https://data.jsdelivr.com/v1/package"
export const WEBWRITER_PACKAGE_QUERY = "scope:webwriter keywords:webwriter-widget"
/** Storage key for the standalone editor's serialized installed packages. */
export const INSTALLED_PACKAGES_STORAGE_KEY = "webwriter_domeditor_installedPackages"

export type LocalizedText = string | Record<string, string>

export type PackageExportTarget = string | {
  default?: PackageExportTarget
  import?: PackageExportTarget
  browser?: PackageExportTarget
  source?: PackageExportTarget
  [condition: string]: PackageExportTarget | undefined
}

export const webWriterPackageExportTypes = [
  {value: "widget", label: "Widget"},
  {value: "test", label: "Test"},
  {value: "migration", label: "Migration"},
  {value: "snippet", label: "Snippet"},
  {value: "theme", label: "Theme"},
  {value: "icon", label: "Package icon"},
  {value: "editing-config", label: "Editing config"},
  {value: "custom-elements", label: "Custom elements"},
  {value: "other", label: "Other"},
] as const

export type WebWriterPackageExportType = typeof webWriterPackageExportTypes[number]["value"]

export type WebWriterPackageExportDescriptor = {
  type: WebWriterPackageExportType
  name: string
  source: string
}

const exportNameWithoutExtension = (value: string) => value.replace(/\.\*$/, "").replace(/\.(?:html?|m?js|css|ts|json)$/i, "")

/** Presents package export keys as the fields used by the Develop toolbox. */
export function describePackageExport(exportName: string, target: PackageExportTarget): WebWriterPackageExportDescriptor {
  let type: WebWriterPackageExportType = "other"
  let name = exportName
  if(exportName === "./migrate.js") [type, name] = ["migration", "migrate"]
  else if(exportName === "./icon") [type, name] = ["icon", "icon"]
  else if(exportName === "./editing-config.json") [type, name] = ["editing-config", "editing-config"]
  else if(exportName === "./custom-elements.json") [type, name] = ["custom-elements", "custom-elements"]
  else if(exportName.startsWith("./widgets/")) [type, name] = ["widget", exportNameWithoutExtension(exportName.slice(10))]
  else if(exportName.startsWith("./tests/")) [type, name] = ["test", exportNameWithoutExtension(exportName.slice(8))]
  else if(exportName.startsWith("./snippets/")) [type, name] = ["snippet", exportNameWithoutExtension(exportName.slice(11))]
  else if(exportName.startsWith("./themes/")) [type, name] = ["theme", exportNameWithoutExtension(exportName.slice(9))]

  const source = typeof target === "string"
    ? target
    : resolvePackageExport(target.source) ?? resolvePackageExport(target) ?? ""
  return {type, name, source}
}

/** Builds the documented export key for a toolbox type/name pair. */
export function webWriterPackageExportName(type: WebWriterPackageExportType, name: string) {
  const trimmed = name.trim().replace(/^\.\//, "")
  if(type === "migration") return "./migrate.js"
  if(type === "icon") return "./icon"
  if(type === "editing-config") return "./editing-config.json"
  if(type === "custom-elements") return "./custom-elements.json"
  if(type === "widget") return `./widgets/${exportNameWithoutExtension(trimmed)}.*`
  if(type === "test") return `./tests/${exportNameWithoutExtension(trimmed)}.*`
  if(type === "snippet") return `./snippets/${exportNameWithoutExtension(trimmed)}.html`
  if(type === "theme") return `./themes/${exportNameWithoutExtension(trimmed)}.html`
  return name.trim().startsWith(".") ? name.trim() : `./${name.trim()}`
}

/** Changes the source condition without discarding build/default conditions. */
export function withPackageExportSource(target: PackageExportTarget, source: string): PackageExportTarget {
  return typeof target === "string" ? source : {...target, source}
}

export type PackageEditingConfigEntry = WidgetEditingConfig & {
  label?: LocalizedText
  description?: LocalizedText
  uninsertable?: boolean
  [key: string]: unknown
}

export type PackageEditingConfig = Record<string, PackageEditingConfigEntry>

export type WebWriterPackageManifest = {
  name: string
  version: string
  description?: string
  keywords?: string[]
  author?: PersonMetadata
  contributors?: PersonMetadata[]
  license?: string
  homepage?: string
  repository?: string | {url?: string}
  exports?: Record<string, PackageExportTarget>
  customElements?: string
  editingConfig?: PackageEditingConfig
}

export type PersonMetadata = string | {
  name?: string
  username?: string
  email?: string
  url?: string
}

export type PackageMember = {
  id: string
  packageName: string
  packageVersion: string
  exportName: string
  kind: "widget" | "snippet"
  label: string
  description?: string
  insertable: boolean
  iconUrl?: string
  tagName?: string
  htmlUrl?: string
  scriptUrl?: string
  styleUrl?: string
  editingConfig?: PackageEditingConfigEntry
}

export type PackageInsertionItem = {
  section: "Packages"
  name: string
  packageName: string
  kind: "widget" | "snippet"
  description?: string
  iconUrl?: string
  tag?: string
  htmlUrl?: string
}

export type WebWriterPackage = {
  name: string
  version: string
  label: string
  description?: string
  iconUrl?: string
  authors: string[]
  license?: string
  keywords: string[]
  links: {
    npm?: string
    homepage?: string
    repository?: string
    bugs?: string
  }
  members: PackageMember[]
  scripts: string[]
  styles: string[]
  editingConfig?: PackageEditingConfig
  manifest?: WebWriterPackageManifest
}

export const PACKAGE_DOCUMENTATION_MAX_BYTES = 1_000_000
export const PACKAGE_DOCUMENTATION_MAX_LINES = 200
export const PACKAGE_DOCUMENTATION_MAX_CHARS = 20_000

export class PackageDocumentationTooLargeError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = "PackageDocumentationTooLargeError"
  }
}

export type PackageDocumentationReadOptions = {
  /** One-based line number at which the returned excerpt starts. */
  startLine?: number
  /** Number of lines to return, capped by PACKAGE_DOCUMENTATION_MAX_LINES. */
  lineCount?: number
  signal?: AbortSignal
}

export type PackageDocumentationUnavailableReason =
  | "not-found"
  | "too-large"
  | "fetch-failed"
  | "read-failed"

export type PackageDocumentationResult = {
  source: "published" | "local"
  packageName: string
  version: string
  localRevision?: number
  status: "available"
  path: string
  markdown: string
  startLine: number
  endLine: number
  totalLines: number
  nextStartLine?: number
} | {
  source: "published" | "local"
  packageName: string
  version: string
  localRevision?: number
  status: "unavailable"
  reason: PackageDocumentationUnavailableReason
  message: string
  path?: string
}

/** Validates pagination and returns a bounded, one-based line excerpt. */
export function packageDocumentationExcerpt(markdown: string, options: PackageDocumentationReadOptions = {}) {
  const lines = markdown.split(/\r\n?|\n/)
  const startLine = options.startLine === undefined ? 1 : options.startLine
  const lineCount = options.lineCount === undefined ? PACKAGE_DOCUMENTATION_MAX_LINES : options.lineCount
  if(!Number.isSafeInteger(startLine) || startLine < 1) throw new TypeError("Documentation startLine must be a positive integer")
  if(!Number.isSafeInteger(lineCount) || lineCount < 1) throw new TypeError("Documentation lineCount must be a positive integer")
  if(startLine > lines.length) throw new RangeError(`Documentation startLine must be at most ${lines.length}`)
  const boundedLineCount = Math.min(lineCount, PACKAGE_DOCUMENTATION_MAX_LINES)
  const endLine = Math.min(lines.length, startLine + boundedLineCount - 1)
  const excerpt = lines.slice(startLine - 1, endLine).join("\n")
  if(excerpt.length > PACKAGE_DOCUMENTATION_MAX_CHARS) {
    throw new PackageDocumentationTooLargeError(
      `The requested documentation excerpt exceeds the ${PACKAGE_DOCUMENTATION_MAX_CHARS}-character limit. Request a smaller line range.`,
    )
  }
  return {
    markdown: excerpt,
    startLine,
    endLine,
    totalLines: lines.length,
    ...(endLine < lines.length ? {nextStartLine: endLine + 1} : {}),
  }
}

export const packageMemberAction = (member: Pick<PackageMember, "id">) => `package-member:${member.id}`
export const packageAction = (pkg: Pick<WebWriterPackage, "name">) => `package:${pkg.name}`
export const packageToggleAction = (pkg: Pick<WebWriterPackage, "name">) => `package-toggle:${pkg.name}`

export function packageInsertionItems(packages: WebWriterPackage[]): PackageInsertionItem[] {
  return packages.flatMap(pkg => pkg.members
    .filter(member => member.insertable)
    .map(member => ({
      section: "Packages" as const,
      name: member.label,
      packageName: member.packageName,
      kind: member.kind,
      description: member.description,
      iconUrl: member.iconUrl ?? pkg.iconUrl,
      ...(member.tagName ? {tag: member.tagName} : {}),
      ...(member.htmlUrl ? {htmlUrl: member.htmlUrl} : {}),
    })))
}

/** Resolves the installed widget tags and the editing settings that contribute
 * their node groups and nested-content models to the document schema. */
export function packageWidgetSchemaDefinitions(packages: WebWriterPackage[]): WidgetSchemaDefinition[] {
  const definitions = packages.flatMap(pkg => pkg.members.flatMap(member => {
    if(member.kind !== "widget" || !member.tagName) return []
    const editingConfig = member.editingConfig
      ?? pkg.editingConfig?.[configKey(member.exportName)]
      ?? pkg.manifest?.editingConfig?.[configKey(member.exportName)]
      ?? {}
    return [{tagName: member.tagName, editingConfig}]
  }))
  return [...new Map(definitions.map(definition => [definition.tagName, definition])).values()]
}

declare global {
  /** Installed package members resolved by the editor iframe's widget loader. */
  var DOMEDITOR_PACKAGE_ITEMS: PackageInsertionItem[] | undefined
}

type NpmSearchPackage = {
  name: string
  version: string
  description?: string
  keywords?: string[]
  publisher?: PersonMetadata
  maintainers?: PersonMetadata[]
  license?: string
  links?: WebWriterPackage["links"]
}

type NpmSearchResponse = {
  objects?: Array<{package?: NpmSearchPackage}>
}

const extensionPattern = /\.(?:html?|m?js|css|ts)$/i

const titleCase = (value: string) => value
  .replace(/^\.\/(?:widgets|snippets)\//, "")
  .replace(/\.\*$/, "")
  .replace(extensionPattern, "")
  .replaceAll(/[-_]+/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())

export const packageNameLabel = (name: string) => titleCase(name.split("/").at(-1) ?? name)

const configKey = (exportName: string) => exportName
  .replace(/\.\*$/, "")
  .replace(extensionPattern, "")

const normalizePath = (value: string) => value.replace(/^\.\//, "")

const packagePath = (path: string) => {
  const normalized = normalizePath(path)
  const segments = normalized.split("/")
  if(!normalized || segments.some(segment => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new TypeError("Package asset paths cannot contain traversal segments")
  }
  return segments
}

const packageListingPath = (path: string) => path.replace(/^\/|^\.\//, "")

/** Resolves the browser-facing target of a conditional package export. */
export function resolvePackageExport(target: PackageExportTarget | undefined): string | undefined {
  if(typeof target === "string") return target
  if(!target || typeof target !== "object") return
  for(const condition of ["browser", "import", "default"]) {
    const resolved = resolvePackageExport(target[condition])
    if(resolved) return resolved
  }
}

/** Builds a pinned jsDelivr URL while retaining the slash in scoped names. */
export function packageCdnUrl(name: string, version: string, path: string) {
  const safePath = packagePath(path).map(encodeURIComponent).join("/")
  return `${JSDELIVR_NPM_ENDPOINT}/${name}@${encodeURIComponent(version)}/${safePath}`
}

const packageManifestUrl = (name: string, version: string) =>
  `${NPM_REGISTRY_ENDPOINT}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`

const readmePathCandidates = (files?: Set<string>) => {
  const listed = [...(files ?? [])]
    .map(packageListingPath)
    .filter(path => path.split("/").length === 1 && /^readme(?:\.md|\.markdown|\.txt)$/i.test(path))
    .sort((left, right) => {
      const rank = (path: string) => path.toLowerCase() === "readme.md" ? 0 : 1
      return rank(left) - rank(right) || left.localeCompare(right)
    })
  return [...new Set([...listed, "README.md", "readme.md", "README.markdown", "readme.markdown", "README.txt"])]
}

const abortReason = (signal: AbortSignal | undefined) => signal?.reason
  ?? new DOMException("The operation was aborted", "AbortError")

const throwIfAborted = (signal: AbortSignal | undefined) => {
  if(signal?.aborted) throw abortReason(signal)
}

const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength

async function boundedResponseText(response: Response, maximumBytes: number, signal?: AbortSignal) {
  throwIfAborted(signal)
  if(!response.body) {
    const text = await response.text()
    throwIfAborted(signal)
    if(textByteLength(text) > maximumBytes) throw new PackageDocumentationTooLargeError(`Package documentation exceeds the ${maximumBytes}-byte limit.`)
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const onAbort = () => { void reader.cancel(abortReason(signal)) }
  signal?.addEventListener("abort", onAbort, {once: true})
  try {
    while(true) {
      throwIfAborted(signal)
      const next = await reader.read()
      if(next.done) break
      size += next.value.byteLength
      if(size > maximumBytes) throw new PackageDocumentationTooLargeError(`Package documentation exceeds the ${maximumBytes}-byte limit.`)
      chunks.push(next.value)
    }
  }
  catch(error) {
    try { await reader.cancel(error) }
    catch {
      // The response may already be cancelled by the abort handler.
    }
    throw error
  }
  finally {
    signal?.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
  throwIfAborted(signal)
  const bytes = new Uint8Array(size)
  let offset = 0
  chunks.forEach(chunk => {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  })
  return new TextDecoder().decode(bytes)
}

/** Removes active content before a package-provided snippet enters authored DOM. */
export function sanitizePackageSnippet(html: string, maximumLength = 50_000_000) {
  if(html.length > maximumLength) throw new RangeError("The package snippet is too large to insert safely")
  const template = document.createElement("template")
  template.innerHTML = html
  stripActiveContent(template.content, {allowIframes: true, unwrapUnsupportedElements: true})
  return template.innerHTML
}

function localized(value: LocalizedText | undefined, locale: string) {
  if(typeof value === "string") return value
  if(!value) return
  const normalizedLocale = locale.toLowerCase()
  const exactKey = Object.keys(value).find(key => key.toLowerCase() === normalizedLocale)
  const language = normalizedLocale.split("-")[0]
  const languageKey = Object.keys(value).find(key => key.toLowerCase() === language)
  return exactKey && value[exactKey] || languageKey && value[languageKey] || value._
}

function personLabel(person: PersonMetadata | undefined) {
  if(typeof person === "string") return person.trim() || undefined
  if(!person) return
  return person.name?.trim() || person.username?.trim() || person.email?.trim()
}

function repositoryUrl(repository: WebWriterPackageManifest["repository"]) {
  if(typeof repository === "string") return repository
  return repository?.url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Deeply merges editing config, with inline values taking precedence. */
export function mergeEditingConfig(
  external: PackageEditingConfig | undefined,
  inline: PackageEditingConfig | undefined,
): PackageEditingConfig {
  const merge = (base: unknown, override: unknown): unknown => {
    if(!isRecord(base) || !isRecord(override)) return override ?? base
    const result: Record<string, unknown> = {...base}
    Object.entries(override).forEach(([key, value]) => {
      result[key] = key in result ? merge(result[key], value) : value
    })
    return result
  }
  return merge(external ?? {}, inline ?? {}) as PackageEditingConfig
}

function packageMember(
  manifest: WebWriterPackageManifest,
  exportName: string,
  target: string,
  editingConfig: PackageEditingConfig,
  iconUrl: string | undefined,
  locale: string,
): PackageMember | null {
  const isWidget = exportName.startsWith("./widgets/")
  const isSnippet = exportName.startsWith("./snippets/")
  if(!isWidget && !isSnippet) return null

  const key = configKey(exportName)
  const config = editingConfig[key] ?? {}
  const identifier = key.split("/").at(-1)!
  const label = localized(config.label, locale) ?? titleCase(identifier)
  const base = {
    id: `${manifest.name}@${manifest.version}:${key}`,
    packageName: manifest.name,
    packageVersion: manifest.version,
    exportName,
    label,
    description: localized(config.description, locale),
    insertable: config.uninsertable !== true,
    iconUrl,
    editingConfig: config,
  }

  if(isSnippet) {
    return {
      ...base,
      kind: "snippet",
      htmlUrl: packageCdnUrl(manifest.name, manifest.version, target),
    }
  }

  const wildcard = target.endsWith(".*")
  const scriptPath = wildcard ? target.slice(0, -1) + "js" : target
  const stylePath = wildcard ? target.slice(0, -1) + "css" : undefined
  const tagName = identifier.replace(/\.\*$/, "").replace(extensionPattern, "")
  return {
    ...base,
    kind: "widget",
    tagName,
    scriptUrl: /\.(?:m?js|ts)$/i.test(scriptPath) || wildcard
      ? packageCdnUrl(manifest.name, manifest.version, scriptPath)
      : undefined,
    styleUrl: stylePath ? packageCdnUrl(manifest.name, manifest.version, stylePath) : undefined,
  }
}

function summaryPackage(summary: NpmSearchPackage): WebWriterPackage {
  const authors = [summary.publisher, ...(summary.maintainers ?? [])]
    .map(personLabel)
    .filter((value): value is string => Boolean(value))
  return {
    name: summary.name,
    version: summary.version,
    label: packageNameLabel(summary.name),
    description: summary.description,
    authors: [...new Set(authors)],
    license: summary.license,
    keywords: summary.keywords ?? [],
    links: {...summary.links},
    members: [],
    scripts: [],
    styles: [],
  }
}

export class WebWriterPackageRegistry {
  private readonly packageCache = new Map<string, Promise<WebWriterPackage>>()
  private readonly snippetCache = new Map<string, Promise<string>>()
  private readonly documentationCache = new Map<string, {path: string, markdown: string}>()

  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly locale = globalThis.document?.documentElement.lang || globalThis.navigator?.language || "en",
  ) {}

  /** Discovers the current public WebWriter package list through npm search. */
  async search() {
    const url = new URL(NPM_SEARCH_ENDPOINT)
    url.searchParams.set("text", WEBWRITER_PACKAGE_QUERY)
    url.searchParams.set("size", "250")
    const response = await this.fetcher(url)
    if(!response.ok) throw new Error(`npm package search failed (${response.status})`)
    const result = await response.json() as NpmSearchResponse
    const summaries = (result.objects ?? [])
      .flatMap(object => object.package ? [object.package] : [])
      .filter(pkg => pkg.name.startsWith("@webwriter/") && pkg.keywords?.includes("webwriter-widget"))
      .map(summaryPackage)

    return Promise.all(summaries.map(async summary => {
      try {
        return await this.getPackage(summary)
      }
      catch {
        return summary
      }
    }))
  }

  getPackage(summary: Pick<WebWriterPackage, "name" | "version"> & Partial<WebWriterPackage>) {
    const key = `${summary.name}@${summary.version}`
    let request = this.packageCache.get(key)
    if(!request) {
      request = this.fetchPackage(summary)
      this.packageCache.set(key, request)
      request.catch(() => this.packageCache.delete(key))
    }
    return request
  }

  /** Reads a bounded excerpt from the exact published package version. */
  async readPackageReadme(
    summary: Pick<WebWriterPackage, "name" | "version">,
    options: PackageDocumentationReadOptions = {},
  ): Promise<PackageDocumentationResult> {
    const packageName = summary.name
    const version = summary.version
    if(typeof packageName !== "string" || !packageName || typeof version !== "string" || !version) {
      throw new TypeError("A package name and exact version are required")
    }
    throwIfAborted(options.signal)
    const key = `${packageName}@${version}`
    let documentation = this.documentationCache.get(key)
    try {
      if(!documentation) {
        documentation = await this.fetchPackageReadme(packageName, version, options.signal) ?? undefined
        if(documentation) this.documentationCache.set(key, documentation)
      }
      if(!documentation) return {
        source: "published",
        packageName,
        version,
        status: "unavailable",
        reason: "not-found",
        message: "This published package does not contain a README file.",
      }
      return {
        source: "published",
        packageName,
        version,
        status: "available",
        path: documentation.path,
        ...packageDocumentationExcerpt(documentation.markdown, options),
      }
    }
    catch(error) {
      if(options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error
      if(error instanceof TypeError || error instanceof RangeError && !(error instanceof PackageDocumentationTooLargeError)) throw error
      const tooLarge = error instanceof PackageDocumentationTooLargeError
      return {
        source: "published",
        packageName,
        version,
        status: "unavailable",
        reason: tooLarge ? "too-large" : "fetch-failed",
        message: tooLarge
          ? error.message
          : `Package documentation could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async fetchSnippet(member: PackageMember) {
    if(member.kind !== "snippet" || !member.htmlUrl) throw new TypeError("The package member is not a snippet")
    let request = this.snippetCache.get(member.htmlUrl)
    if(!request) {
      request = this.fetcher(member.htmlUrl).then(response => {
        if(!response.ok) throw new Error(`Snippet download failed (${response.status})`)
        return response.text().then(html => sanitizePackageSnippet(html))
      })
      this.snippetCache.set(member.htmlUrl, request)
      request.catch(() => this.snippetCache.delete(member.htmlUrl!))
    }
    return request
  }

  private async fetchPackageFiles(name: string, version: string, signal?: AbortSignal) {
    const packageName = name.split("/").map((segment, index) => index === 0 ? segment : encodeURIComponent(segment)).join("/")
    try {
      const url = JSDELIVR_PACKAGE_FILES_ENDPOINT + "/npm/" + packageName + "@" + encodeURIComponent(version) + "/flat"
      const response = signal ? await this.fetcher(url, {signal}) : await this.fetcher(url)
      if(!response.ok) return
      const result = JSON.parse(await boundedResponseText(response, PACKAGE_DOCUMENTATION_MAX_BYTES, signal)) as unknown
      if(!isRecord(result) || !Array.isArray(result.files) || !result.files.every(file => (
        isRecord(file) && typeof file.name === "string"
      ))) return
      return new Set(result.files.map(file => packageListingPath((file as {name: string}).name)))
    }
    catch(error) {
      if(signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error
      // The listing is advisory. Keep inferred assets when it is unavailable.
    }
  }

  private async fetchPackageReadme(name: string, version: string, signal?: AbortSignal) {
    const response = signal
      ? await this.fetcher(packageManifestUrl(name, version), {signal})
      : await this.fetcher(packageManifestUrl(name, version))
    if(response.status === 404) return null
    if(!response.ok) throw new Error(`Package metadata failed (${response.status})`)
    const manifest = JSON.parse(await boundedResponseText(response, PACKAGE_DOCUMENTATION_MAX_BYTES, signal)) as WebWriterPackageManifest & {
      readme?: unknown
      readmeFilename?: unknown
    }
    if(typeof manifest.readme === "string" && manifest.readme) {
      const metadataPath = typeof manifest.readmeFilename === "string"
        ? packageListingPath(manifest.readmeFilename).trim()
        : ""
      const path = /^(?:readme(?:\.md|\.markdown|\.txt))$/i.test(metadataPath) ? metadataPath : "README.md"
      return {
        path,
        markdown: manifest.readme,
      }
    }

    const files = await this.fetchPackageFiles(name, version, signal)
    for(const path of readmePathCandidates(files)) {
      throwIfAborted(signal)
      const readmeResponse = signal
        ? await this.fetcher(packageCdnUrl(name, version, path), {signal})
        : await this.fetcher(packageCdnUrl(name, version, path))
      if(readmeResponse.status === 404) continue
      if(!readmeResponse.ok) throw new Error(`Package documentation failed (${readmeResponse.status})`)
      return {path, markdown: await boundedResponseText(readmeResponse, PACKAGE_DOCUMENTATION_MAX_BYTES, signal)}
    }
    return null
  }

  private async fetchPackage(summary: Pick<WebWriterPackage, "name" | "version"> & Partial<WebWriterPackage>) {
    const manifestUrl = `${NPM_REGISTRY_ENDPOINT}/${encodeURIComponent(summary.name)}/${encodeURIComponent(summary.version)}`
    const response = await this.fetcher(manifestUrl)
    if(!response.ok) throw new Error(`Package metadata failed (${response.status})`)
    const manifest = await response.json() as WebWriterPackageManifest
    const exports = manifest.exports ?? {}

    const resolveNamedExport = (name: string) => resolvePackageExport(exports[name])
    const iconPath = resolveNamedExport("./icon")
    const iconUrl = iconPath ? packageCdnUrl(manifest.name, manifest.version, iconPath) : undefined
    const editingConfigPath = resolveNamedExport("./editing-config.json")
    const externalEditingConfigRequest = (async() => {
      if(!editingConfigPath) return
      try {
        const configResponse = await this.fetcher(packageCdnUrl(manifest.name, manifest.version, editingConfigPath))
        if(configResponse.ok) return await configResponse.json() as PackageEditingConfig
      }
      catch {
        // Inline config and export-derived labels remain usable offline.
      }
    })()
    const hasWildcardWidget = Object.entries(exports).some(([exportName, exportTarget]) => (
      exportName.startsWith("./widgets/") && resolvePackageExport(exportTarget)?.endsWith(".*")
    ))
    const packageFilesRequest = hasWildcardWidget
      ? this.fetchPackageFiles(manifest.name, manifest.version)
      : Promise.resolve<Set<string> | undefined>(undefined)
    const [externalEditingConfig, packageFiles] = await Promise.all([
      externalEditingConfigRequest,
      packageFilesRequest,
    ])
    const editingConfig = mergeEditingConfig(externalEditingConfig, manifest.editingConfig)
    const inferredStylePaths = new Map<string, string>()
    const members = Object.entries(exports).flatMap(([exportName, exportTarget]) => {
      const target = resolvePackageExport(exportTarget)
      if(!target) return []
      const member = packageMember(manifest, exportName, target, editingConfig, iconUrl, this.locale)
      if(member?.kind === "widget" && member.styleUrl && target.endsWith(".*")) {
        inferredStylePaths.set(member.styleUrl, packageListingPath(target.slice(0, -1) + "css"))
      }
      return member ? [member] : []
    })
    const globalConfig = editingConfig["."] ?? {}
    const manifestAuthors = [manifest.author, ...(manifest.contributors ?? [])]
      .map(personLabel)
      .filter((value): value is string => Boolean(value))
    const fallbackAuthors = summary.authors ?? []

    return {
      name: manifest.name,
      version: manifest.version,
      label: localized(globalConfig.label, this.locale) ?? summary.label ?? packageNameLabel(manifest.name),
      description: localized(globalConfig.description, this.locale) ?? manifest.description ?? summary.description,
      iconUrl,
      authors: [...new Set(manifestAuthors.length ? manifestAuthors : fallbackAuthors)],
      license: manifest.license ?? summary.license,
      keywords: manifest.keywords ?? summary.keywords ?? [],
      links: {
        ...summary.links,
        homepage: manifest.homepage ?? summary.links?.homepage,
        repository: repositoryUrl(manifest.repository) ?? summary.links?.repository,
        npm: summary.links?.npm ?? `https://www.npmjs.com/package/${manifest.name}`,
      },
      members,
      scripts: [...new Set(members.flatMap(member => member.scriptUrl ? [member.scriptUrl] : []))],
      styles: [...new Set(members.flatMap(member => member.styleUrl ? [member.styleUrl] : []))]
        .filter(style => !packageFiles || !inferredStylePaths.has(style) || packageFiles.has(inferredStylePaths.get(style)!)),
      editingConfig,
      manifest: {...manifest},
    } satisfies WebWriterPackage
  }
}
