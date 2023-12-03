import {z} from "zod"

import { CustomElementManifest } from "./customelementsmanifest";
import {ContentExpression} from ".."
import { Person, License, SemVer, SemVerRange } from "../datatypes";

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

export type EditingConfig = z.infer<typeof EditingConfig>
export const EditingConfig = z.object({
  content: z
    .record(z.string(), ContentExpression)
    .or(ContentExpression.transform(arg => ({"": arg})))
    .default({})
    .optional(),
})

export type FileURL = z.infer<typeof EditingConfig>
export const FileURL = z.string().url().startsWith("file")

export type CustomElementName = z.infer<typeof CustomElementName>
export const CustomElementName = z
  .string()
  .regex(customElementNamePattern)
  .refine(x => !RESERVED_CUSTOM_ELEMENT_NAMES.includes(x))


export interface Package extends z.infer<typeof Package.objectSchema> {}
export class Package {

  static objectSchema = z.object({
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
    watching: z.boolean().optional().default(false),
    localPath: z.string().optional(),
    installed: z.boolean().optional(),
    latest: SemVer.schema.optional(),
    importError: z.string().optional(),
    customElements: CustomElementManifest.optional()
  })
  .catchall(Json)

  static schema = this.objectSchema.transform(x => Object.assign(Object.create(this.prototype), x))

  static fromID(id: string) {
    const i = id.lastIndexOf("@")
    return new Package({name: id.slice(0, i), version: id.slice(i + 1)})
  }

  constructor(pkg: Package | z.input<typeof Package.objectSchema> & Record<string, any>) {
    return pkg instanceof Package
      ? pkg
      : Package.schema.parse(pkg)
  }

  static optionKeys = [
    "id",
    "installed",
    "outdated",
    "imported",
    "watching",
    "reloadCount",
    "localPath",
    "importError",
    "jsSize",
    "cssSize"
  ]

  toString() {
    return this.id
  }

  toJSON() {
    const keys = Object.getOwnPropertyNames(this).filter(k => !Package.optionKeys.includes(k))
    return Object.fromEntries(keys.map(key => {
      const value = (this as any)[key]
        return [key, value]
    }))
  }

  get id() {
    return `${this.name}@${this.version}`
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

  extend(extraProperties: Partial<Package>) {
    return new Package({...this, ...extraProperties})
  }
}