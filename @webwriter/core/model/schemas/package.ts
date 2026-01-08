import {z} from "zod"

import { License } from "./license"
import {SemVer, SemVerRange} from "./semver"
import { filterObject } from "#utility";
import { ISCED2011, ISCEDF2013 } from "./isced";
import { Locale } from "./locale";

export * from "./customelementsmanifest"

const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'vm',
  'zlib',
  'freelist',
  'v8',
  'process',
  'inspector',
  'async_hooks',
  'http2',
  'perf_hooks',
  'trace_events',
  'worker_threads',
  'node:test',
  'wasi',
  'diagnostics_channel'
]
const NODE_PLATFORMS = [
  'aix',
  'darwin',
  'freebsd',
  'linux',
  'openbsd',
  'sunos',
  'win32'
]
const NODE_ARCHS = [
  'arm',
  'arm64',
  'ia32',
  'mips',
  'mipsel',
  'ppc',
  'ppc64',
  's390',
  's390x',
  'x64'
]

const RESERVED_CUSTOM_ELEMENT_NAMES = [
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph"
]

const nonUrlSafePattern = /(?!\{|\}|\||\\|\^|~|\[|\]|\`)/
const nonNpmBlacklistPattern = /^(?!node_modules|favicon\.ico).+$/
const nonNodeBuiltinPattern = new RegExp(`^(?!${NODE_BUILTINS.join("|")}).*$`)
const nodePlatformPattern = new RegExp(`^(${NODE_PLATFORMS.join("|")})$`)
const nodeArchPattern = new RegExp(`^(${NODE_ARCHS.join("|")})$`)
const customElementNamePattern = /^[a-z][\w\d]*\-[\-.0-9_a-z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u10000-\uEFFFF]*$/

export type NpmName = z.infer<typeof NpmName>
export const NpmName = z.string()
  .min(1, {message: "Cannot be empty"})
  .max(214, {message: "Cannot be longer than 214 characters"})
  .regex(/(?![A-Z])/g, {message: "Cannot have uppercase characters"})
  .regex(nonUrlSafePattern, {message: "Cannot contain non-url-safe characters"})
  .regex(/^(?!\.|_)/g, {message: "Cannot start with . or _"})
  .regex(/(?!\s)/g, {message: "Cannot contain spaces"})
  .regex(/(?!(\)|\()|\'|\!\*)/g, {message: "Cannot contain these characters: )('!*"})
  .regex(nonNpmBlacklistPattern, {message: "Cannot be 'node_modules' or 'favicon.ico'"})
  .regex(nonNodeBuiltinPattern, {message: "Cannot be a builtin node module name"})

export type NodePlatform = z.infer<typeof NodePlatform>
export const NodePlatform = z.string().regex(nodePlatformPattern, {message: "Is not a valid node platform (process.platform)"})

export type NodeArch = z.infer<typeof NodeArch>
export const NodeArch = z.string().regex(nodeArchPattern, {message: "Is not a valid node platform (process.arch)"})

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]);
type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[] | undefined
export const Json: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, Json.array(), z.record(Json)])
);

type Funding = z.infer<typeof Funding>
const Funding = z.object({
  type: z.string(),
  url: z.string().url()
})

type IssueTracker = z.infer<typeof IssueTracker>
const IssueTracker = z.object({
  url: z.string().url(),
  email: z.string().email().optional()
})
.or(z.object({
  url: z.string().url().optional(),
  email: z.string().email()
}))

type Repository = z.infer<typeof Repository>
const Repository = z.object({
  url: z.string().url().or(z.string()),
  type: z.string()
})
.or(z.string())

const npmPersonPattern = /^\s*(?<name>.*?)(?:<(?<email>.+)>)?\s*(?:\((?<url>.+)\))?\s*$/
export interface Person extends z.infer<typeof Person["objectSchema"]> {}
export class Person {

  static objectSchema = z.object({
    name: z.string().trim().optional(),
    email: z.string().trim().optional(),
    url: z.string().trim().optional()
  })

  static schema = z.string()
    .regex(npmPersonPattern)
    .transform(str => {
      const groups = npmPersonPattern.exec(str)?.groups ?? {}
      let {name, email, url} = groups
      name = name?.trim()
      email = email?.trim()
      url = url?.trim()
      const person = {...(name && {name}), ...(email && {email}), ...(url && {url})} as z.infer<typeof Person.objectSchema>
      return new Person(person)
    })
    .or(Person.objectSchema.transform(x => new Person(x))
      
    )

  constructor(person: string | z.infer<typeof Person.objectSchema>) {
    return typeof person === "string"
      ? Person.schema.parse(person)
      : Object.assign(this, person)
  }


  toString() {
    const name = this.name ?? ""
    const email = this.email != null? ` <${this.email}>`: ""
    const url = this.url != null? ` (${this.url})`: ""
    return `${name}${email}${url}`
  }

  toJSON() {
    return this.toString()
  }

  extend(extraProperties: Partial<Person>) {
    return new Person({...this, ...extraProperties})
  }
}

type WidgetExportKey = `./widgets/${string}`
const WidgetExportKey = z.string().startsWith("./widgets/")
type SnippetExportKey = `./snippets/${string}`
const SnippetExportKey = z.string().startsWith("./snippets/")
type ThemeExportKey = `./themes/${string}`
const ThemeExportKey = z.string().startsWith("./themes/")
type PackageExportKey = "."
const PackageExportKey = z.literal(".")
type ExportKey = WidgetExportKey | SnippetExportKey | ThemeExportKey | PackageExportKey
const ExportKey = WidgetExportKey.or(SnippetExportKey).or(ThemeExportKey).or(PackageExportKey)
type CSSCustomPropertyName = `--${string}`
const CSSCustomPropertyName = z.string().startsWith("--")

export type WidgetEditingSettings = z.infer<typeof WidgetEditingSettings>
export const WidgetEditingSettings = z.object({
  group: z.string().optional(),
  inline: z.boolean().optional(),
  selectable: z.boolean().optional(),
  draggable: z.boolean().optional(),
  code: z.boolean().optional(),
  whitespace: z.enum(["pre", "normal"]).optional(),
  definingAsContext: z.boolean().optional(),
  definingForContent: z.boolean().optional(),
  defining: z.boolean().optional(),
  isolating: z.boolean().optional(),
  content: z.string().optional(), // TODO: Validate content expressions in pkg
  marks: z.string().optional(),
  parts: z.array(z.string()).optional(),
  cssCustomProperties: z.record(CSSCustomPropertyName, z.string()).optional(),
  label: z.record(z.string()).optional(),
  uninsertable: z.boolean().optional(),
  propagateEvents: z.array(z.string()).optional(),
  warningIgnorePattern: z.string().optional(),
  errorIgnorePattern: z.string().optional(),
})

export type SnippetEditingSettings = z.infer<typeof SnippetEditingSettings>
export const SnippetEditingSettings = z.object({
  label: z.record(z.string()).optional(),
  type: z.enum(["example"]).optional()
})

export type ThemeEditingSettings = z.infer<typeof ThemeEditingSettings>
export const ThemeEditingSettings = z.object({
  label: z.record(z.string()).optional()
})

export type PackageEditingSettings = z.infer<typeof PackageEditingSettings>
export const PackageEditingSettings = z.object({
  label: z.record(z.string()).optional(),
  description: z.record(z.string()).optional(),
  manual: z.record(z.string()).optional(),

})

type ExportSuffixes = typeof EXPORT_SUFFIXES
const EXPORT_SUFFIXES = {
  "widgets": "*",
  "snippets": "html",
  "themes": "css"
} as const

type WebWriterExports<
  Type extends "widgets" | "snippets" | "themes",
  Name extends string
> = {
  [Property in `./${Type}/${Name}.*`]: `./${Type}/${Name}.${ExportSuffixes[Type]}` | {default: `./${Type}/${Name}.${ExportSuffixes[Type]}`, [key: string]: string}
}

type ModuleExports = Record<string, string | Record<string, string>>

type PackageExports = WebWriterExports<"widgets" | "snippets" | "themes", string> & ModuleExports
const PackageExports = z.any().superRefine((val, ctx) => {
  if(!["string", "object"].includes(typeof val) || Array.isArray(val)) {
    ctx.addIssue({code: z.ZodIssueCode.invalid_type, expected: "object", received: Array.isArray(val)? "array": typeof val, fatal: true, message: `Invalid type for package.exports. Expected 'object' but received ${Array.isArray(val)? "array": typeof val}`})
    return z.NEVER
  }
  for(const [key, value] of Object.entries(val)) {
    let path: string
    if(typeof value === "string") {
      path = value
    }
    else if(typeof value === "object" && value && "default" in value && (typeof value.default === "string" || value.default === null)) {
      if(value.default === null) {
        continue
      }
      path = value.default
    }
    else {
      ctx.addIssue({code: z.ZodIssueCode.invalid_type, expected: "object", received: Array.isArray(val)? "array": typeof val, fatal: true, message: `Invalid export value package.exports["${key}"]: ${JSON.stringify(value ?? null)}`})
      return z.NEVER
    }
    if(["./widgets/", "./snippets/", "./themes/"].some(prefix => key.startsWith(prefix))) {
      const type = key.split("/")[1] as keyof ExportSuffixes
      const suffix = EXPORT_SUFFIXES[type]
      if(!path.endsWith(suffix)) {
        ctx.addIssue({code: z.ZodIssueCode.invalid_type, expected: "object", received: Array.isArray(val)? "array": typeof val, fatal: true, message: `Invalid ending for type ${type} in '${path}'. Should be '${suffix}'`})
        return z.NEVER
      }
    }
  }
  return val as PackageExports
});


export type EditingSettings = WidgetEditingSettings | SnippetEditingSettings | ThemeEditingSettings

export type EditingConfig = z.infer<typeof EditingConfig>
export const EditingConfig = z.record(ExportKey, WidgetEditingSettings.or(ThemeEditingSettings.or(SnippetEditingSettings))).and(z.object({".": PackageEditingSettings.optional()}))

export type FileURL = z.infer<typeof FileURL>
export const FileURL = z.string().url().startsWith("file")

export type CustomElementName = z.infer<typeof CustomElementName>
export const CustomElementName = z
  .string()
  .regex(customElementNamePattern)
  .refine(x => !RESERVED_CUSTOM_ELEMENT_NAMES.includes(x))


export type WebWriterPackageName = z.infer<typeof WebWriterPackageName>
export const WebWriterPackageName = z.string()
  .startsWith("@", {message: "Must be a scoped name (starting with '@')"})
  .pipe(NpmName)


export type MemberSettings = {name: string, path: string, url?: string, legacy: boolean} & ((SnippetEditingSettings | ThemeEditingSettings) & {source: string} | WidgetEditingSettings)


export interface Package extends z.infer<typeof Package.objectSchema> {}
export class Package {

  static coreObjectSchema = z.object({
    name: NpmName,
    version: SemVer.schema,
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    homepage: z.string().url().optional(),
    bugs: IssueTracker.optional(),
    license: License.schema.optional(),
    author: Person.schema.optional(),
    contributors: Person.schema.array().optional(),
    funding: Funding.or(Funding.array()).optional(),
    files: z.array(z.string()).optional(),
    main: z.string().optional(),
    browser: z.string().optional(),
    bin: z.record(z.string()).optional(),
    man: z.array(z.string()).optional(),
    directories: z.record(z.string()).optional(),
    repository: Repository.optional(),
    scripts: z.record(z.string()).optional(),
    dependencies: z.record(NpmName, z.string()).optional(),
    devDependencies: z.record(NpmName, z.string()).optional(),
    peerDependencies: z.record(NpmName, z.string()).optional(),
    bundleDependencies: z.record(NpmName, z.string()).optional(),
    optionalDependencies: z.record(NpmName, z.string()).optional(),
    engines: z.record(z.string(), SemVerRange.schema).optional(),
    peerDependenciesMeta: z.record(NpmName, z.object({optional: z.boolean()})).optional(),
    overrides: z.record(NpmName, z.string()).optional(),
    os: NodePlatform.array().optional(),
    arch: NodeArch.array().optional(),
    private: z.boolean().optional(),
    config: z.record(Json).optional(),
    publishConfig: z.record(Json).optional(),
    workspaces: z.string().array().optional(),
    type: z.literal("commonjs").or(z.literal("module")).optional(),
    exports: PackageExports.optional(),
    imports: z.record(z.string().startsWith("#"), z.record(z.string())).optional(),
    editingConfig: EditingConfig.optional(),
    lastLoaded: z.number().optional(),
    trusted: z.boolean().optional()
  })

  static objectSchema = this.coreObjectSchema
    .catchall(Json)
    .transform(obj => {
      const coreShape = this.coreObjectSchema.shape
      const core = filterObject(obj, key => key in coreShape)
      const rest = filterObject(obj, key => !(key in coreShape))
      return {...core, _: rest} as unknown as z.infer<typeof this.coreObjectSchema> & {_: Json}
    })

  static schema = this.objectSchema.transform(x => Object.assign(Object.create(this.prototype), x))

  static fromID(id: string) {
    const i = id.lastIndexOf("@")
    return new Package({name: id.slice(0, i), version: id.slice(i + 1)})
  }

  static fromElement(el: HTMLElement) {
    if(!el.tagName.includes("-")) {
      return undefined
    }
    const versionCls = Array.from(el.classList).find(cls => cls.startsWith("ww-v"))
    const pkgCls = Array.from(el.classList).find(cls => cls.startsWith("ww-pkg-"))
    const name = pkgCls?.slice("ww-pkg-".length)
    if(!name || !versionCls) {
      return undefined
    }
    const version = new SemVer(versionCls.slice("ww-v".length))
    return new Package({name, version})
  }

  static coreKeys = Object.keys(this.coreObjectSchema.shape) as unknown as keyof typeof this.coreObjectSchema.shape

  constructor(pkg: Package | z.input<typeof Package.objectSchema> & Record<string, any>, editingState?: Partial<Pick<Package, "watching" | "localPath" | "installed" | "latest" | "members" | "lastLoaded" | "trusted">>) {
    return pkg instanceof Package
      ? Object.assign(pkg, editingState)
      : Object.assign(Package.schema.parse(pkg), editingState)
  }

  watching?: boolean = false
  trusted?: boolean = false
  localPath?: string
  lastLoaded?: number
  installed?: boolean
  latest?: SemVer
  members: Record<string, MemberSettings> = {}

  toString() {
    return this.id
  }

  toJSON() {
    const keys = Object.getOwnPropertyNames(this).filter(k => Package.coreKeys.includes(k))
    return Object.fromEntries(keys.map(key => {
      const value = (this as any)[key]
        return [key, value]
    }))
  }

  get id() {
    return `${this.name}@${this.version}`
  }

  get isSnippet() {
    return this.version.prerelease.includes("snippet")
  }

  get nameParts() {
    const [scope, name] = this.name.startsWith("@")? this.name.slice(1).split("/"): [undefined, this.name]
    return {scope, name}
  }

  get outdated() {
    return !!(this.latest && this.version.compare(this.latest) === -1)
  }

  get status() {
    if(this.localPath) {
      return "local"
    }
    else if(this.installed) {
      return "installed"
    }
    else if(this.installed && this.outdated) {
      return "outdated"
    }
    else {
      return "available"
    }
  }

  get widgets() {
    return filterObject(this.members, k => k.split("/").at(-2) === "widgets")
  }

  get snippets() {
    return filterObject(this.members, k => k.split("/").at(-2) === "snippets")
  }

  get themes() {
    return filterObject(this.members, k => k.split("/").at(-2) === "themes")
  }

  get iconPath() {
    return this.exports?.["./icon"]
  }

  get programmes() {
    const result = [] as ISCED2011[]
    this.keywords?.forEach(kw => {try {result.push(new ISCED2011(kw))} catch (err) {}})
    return result.sort((a, b) => {
      if (a.level < b.level) return -1;
      if (a.level > b.level) return 1;
      else return 0;
    })
  }

  get coversSecondaryEducation() {
    const programmes = this.programmes
    return programmes.find(pg => pg.level === "2") && programmes.find(pg => pg.level === "3")
  }

  get coversHigherEducation() {
    const programmes = this.programmes
    return programmes.find(pg => pg.level === "5") && programmes.find(pg => pg.level === "6") && programmes.find(pg => pg.level === "7") && programmes.find(pg => pg.level === "8")
  }

  get minProgramme() {
    return this.programmes.at(0)
  }

  get maxProgramme() {
    return this.programmes.at(-1)
  }

  get broadFieldCodes() {
    const allFields = [] as ISCEDF2013[]
    this.keywords?.forEach(kw => {try {allFields.push(new ISCEDF2013(kw))} catch {}})
    const result = Array.from(new Set(allFields.map(field => field.broad)))
    return result.sort()
  }

  get locales() {
    return this.keywords?.filter(kw => kw.startsWith("widget-lang-")).map(kw => {
      try {return new Locale(kw.slice("widget-lang-".length))} catch {return undefined as never}
    }).filter(locale => locale) ?? []
  }

  get widgetTypes() {
    return this.keywords?.filter(kw => ["widget-presentational", "widget-practical", "widget-simulational", "widget-conceptual", "widget-informational", "widget-contextual"].includes(kw)).map(kw => kw.slice("widget-".length)) as ("presentational" | "practical" | "simulational" | "conceptual" | "informational" | "contextual")[]
  }

  get widgetOnlineStatus(): "never" | "edit" | "use" | "always" {
    if(this.keywords?.includes("widget-online")) {
      return "always"
    }
    else if(this.keywords?.includes("widget-online-edit")) {
      return "edit"
    }
    else if(this.keywords?.includes("widget-online-use")) {
      return "use"
    }
    else {
      return "never"
    }
  }

  private isStandardKeyword(kw: string) {
    let isProgramme = false; try {new ISCED2011(kw); isProgramme = true} catch {}
    let isField = false; try {new ISCEDF2013(kw); isField = true} catch {}
    const isWidgetType = ["widget-presentational", "widget-practical", "widget-simulational", "widget-conceptual", "widget-informational", "widget-contextual"].includes(kw)
    const isWidgetLang = kw.startsWith("widget-lang-")
    const isWidgetOnlineStatus = ["widget-online", "widget-online-edit", "widget-online-use"].includes(kw)
    const isWebWriterMarker = kw === "webwriter-widget"
    const isAIKeyword = kw === "ww-ai-tested"
    return isProgramme || isField || isWidgetType || isWidgetLang || isWidgetOnlineStatus || isWebWriterMarker || isAIKeyword
  }

  get nonstandardKeywords() {
    return this.keywords?.filter(kw => !this.isStandardKeyword(kw))
  }

  get packageEditingSettings(): EditingSettings | undefined {
    return (this?.editingConfig as any ?? {})["."]
  }

  extend(extraProperties: Partial<Package>) {
    return Object.assign(new Package(this), extraProperties)
  }
}