export const NPM_SEARCH_ENDPOINT = "https://registry.npmjs.org/-/v1/search"
export const NPM_REGISTRY_ENDPOINT = "https://registry.npmjs.org"
export const JSDELIVR_NPM_ENDPOINT = "https://cdn.jsdelivr.net/npm"
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

export type PackageEditingConfigEntry = {
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
  manifest?: WebWriterPackageManifest
}

export const packageMemberAction = (member: Pick<PackageMember, "id">) => `package-member:${member.id}`
export const packageAction = (pkg: Pick<WebWriterPackage, "name">) => `package:${pkg.name}`
export const packageToggleAction = (pkg: Pick<WebWriterPackage, "name">) => `package-toggle:${pkg.name}`

export function packageInsertionItems(packages: WebWriterPackage[]): PackageInsertionItem[] {
  return packages.flatMap(pkg => pkg.members)
    .filter(member => member.insertable)
    .map(member => ({
      section: "Packages",
      name: member.label,
      packageName: member.packageName,
      kind: member.kind,
      description: member.description,
      iconUrl: member.iconUrl,
      ...(member.tagName ? {tag: member.tagName} : {}),
      ...(member.htmlUrl ? {htmlUrl: member.htmlUrl} : {}),
    }))
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

const configKey = (exportName: string) => exportName
  .replace(/\.\*$/, "")
  .replace(extensionPattern, "")

const normalizePath = (value: string) => value.replace(/^\.\//, "")

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
  const safePath = normalizePath(path).split("/").map(encodeURIComponent).join("/")
  return `${JSDELIVR_NPM_ENDPOINT}/${name}@${encodeURIComponent(version)}/${safePath}`
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
    label: titleCase(summary.name.split("/").at(-1) ?? summary.name),
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

  async fetchSnippet(member: PackageMember) {
    if(member.kind !== "snippet" || !member.htmlUrl) throw new TypeError("The package member is not a snippet")
    let request = this.snippetCache.get(member.htmlUrl)
    if(!request) {
      request = this.fetcher(member.htmlUrl).then(response => {
        if(!response.ok) throw new Error(`Snippet download failed (${response.status})`)
        return response.text()
      })
      this.snippetCache.set(member.htmlUrl, request)
      request.catch(() => this.snippetCache.delete(member.htmlUrl!))
    }
    return request
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
    let externalEditingConfig: PackageEditingConfig | undefined
    if(editingConfigPath) {
      try {
        const configResponse = await this.fetcher(packageCdnUrl(manifest.name, manifest.version, editingConfigPath))
        if(configResponse.ok) externalEditingConfig = await configResponse.json() as PackageEditingConfig
      }
      catch {
        // Inline config and export-derived labels remain usable offline.
      }
    }
    const editingConfig = mergeEditingConfig(externalEditingConfig, manifest.editingConfig)
    const members = Object.entries(exports).flatMap(([exportName, exportTarget]) => {
      const target = resolvePackageExport(exportTarget)
      if(!target) return []
      const member = packageMember(manifest, exportName, target, editingConfig, iconUrl, this.locale)
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
      label: localized(globalConfig.label, this.locale) ?? summary.label ?? titleCase(manifest.name.split("/").at(-1) ?? manifest.name),
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
      styles: [...new Set(members.flatMap(member => member.styleUrl ? [member.styleUrl] : []))],
      manifest,
    } satisfies WebWriterPackage
  }
}
