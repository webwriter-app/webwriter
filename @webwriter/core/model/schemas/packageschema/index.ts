import {z} from "zod"

import { Person, License, SemVer, SemVerRange } from "../datatypes";
import { filterObject } from "../../../utility";

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
  uninsertable: z.boolean().optional()
})

export type SnippetEditingSettings = z.infer<typeof SnippetEditingSettings>
export const SnippetEditingSettings = z.object({
  label: z.record(z.string()).optional()
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


export type MemberSettings = {name: string} & ((SnippetEditingSettings | ThemeEditingSettings) & {source: string} | WidgetEditingSettings)


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
    exports: Json.optional(),
    imports: z.record(z.string().startsWith("#"), z.record(z.string())).optional(),
    editingConfig: EditingConfig.optional(),
    // customElements: CustomElementsManifest.optional()
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

  static coreKeys = Object.keys(this.coreObjectSchema.shape) as unknown as keyof typeof this.coreObjectSchema.shape

  constructor(pkg: Package | z.input<typeof Package.objectSchema> & Record<string, any>, editingState?: Partial<Pick<Package, "watching" | "localPath" | "installed" | "latest" | "members">>) {
    return pkg instanceof Package
      ? Object.assign(pkg, editingState)
      : Object.assign(Package.schema.parse(pkg), editingState)
  }

  watching?: boolean = false
  localPath?: string
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
    return `${this.name}@${this.version}${this.localPath? "-local": ""}`
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
    return filterObject(this.members, k => k.startsWith("./widgets/"))
  }

  get snippets() {
    return filterObject(this.members, k => k.startsWith("./snippets/"))
  }

  get themes() {
    return filterObject(this.members, k => k.startsWith("./themes/"))
  }

  get packageEditingSettings(): EditingSettings | undefined {
    return (this?.editingConfig as any ?? {})["."]
  }

  extend(extraProperties: Partial<Package>) {
    return Object.assign(new Package(this), extraProperties)
  }
}