// @ts-strict
import {SafeParseReturnType, ZodSchema, z} from "zod"
import SPDX_LICENSE_MAP from "spdx-license-list"
import {valid as semverValid, validRange as semverValidRange} from "semver"

import {ContentExpression, DataType} from ".."
import { filterObject } from "../../../utility"

const SPDX_LICENSES = Object.keys(SPDX_LICENSE_MAP)
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
const spdxLicensePattern = new RegExp(`^(${SPDX_LICENSES.map(x => x.replaceAll(".", "\.")).join("|")})$`)
const nodePlatformPattern = new RegExp(`^(${NODE_PLATFORMS.join("|")})$`)
const nodeArchPattern = new RegExp(`^(${NODE_ARCHS.join("|")})$`)
const npmPersonPattern = /^\s*(?<name>.*?)\s*(?:<(?<email>.+)>)?\s*(?:\((?<url>.+)\))?\s*$/
const mimePattern = /#?(?<supertype>[\w!#$%&'*.^`|~-]+)(?:\/(?<subtype>[\w!#$%&'*.^`|~-]+)(?:\+(?<suffix>[\w!#$%&'*.^`|~-]+))?(?:;(?<pkey>[\w!#$%&'*.^`|~-]+)=(?<pval>[\w!#$%&'*.^`|~-]+))?)?/
const semverPattern = /(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*))*))?(?:\+(?<buildmetadata>[0-9a-zA-Z\-]+(?:\.[0-9a-zA-Z\-]+)*))?/
const npmNamePattern = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/
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


const SemVerObjectSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number(),
  prerelease: z.string().optional(),
  buildmetadata: z.string().optional()
})

const SemVerSchema = z.string()
  .transform((x, ctx) => {
    const match = x.match(semverPattern)
    if(match) {
      const {major, minor, patch, prerelease, buildmetadata} = match.groups ?? {}
      return {major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch), prerelease, buildmetadata}
    }
    else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid SemVer`
      })
      return z.NEVER
    }
  })
  .pipe(SemVerObjectSchema)
  .or(SemVerObjectSchema)

export class SemVer extends DataType(SemVerSchema) {
  serialize() {
    const {major, minor, patch, prerelease, buildmetadata} = this
    return `${major}.${minor}.${patch}${prerelease? `-${prerelease}`: ""}${buildmetadata? `+${buildmetadata}`: ""}`
  }

  toString() {
    return this.serialize()
  }

  increment(key: "major" | "minor" | "patch", decrement=false) {
    return new SemVer({
      ...this,
      [key]: Math.max(0, this[key] + (decrement? -1: 1))
    })
  }
}

export type SemVerRange = z.infer<typeof SemVerRange>
export const SemVerRange = z.string()
  .refine(x => semverValidRange(x), {message: "Invalid NPM version range"})



const LicenseObjectSchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  url: z.string().url().optional(),
  osiApproved: z.boolean().optional()
})

const LicenseSchema = (z
  .string()
  .transform((key, ctx) => {
    if(!(key in SPDX_LICENSE_MAP)) {
      // ctx.addIssue({code: z.ZodIssueCode.custom, message: "Not a valid SPDX license identifier"})
      return {key} as {key: string}
    }
    else {
      return {...SPDX_LICENSE_MAP[key], key}
    }
  })
  .pipe(LicenseObjectSchema))
  .or(LicenseObjectSchema)



export class License extends DataType(LicenseSchema) {
  serialize() {
    return this.key
  }

  toString() {
    return this.serialize()
  }
}

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

const MIME_NAME_ENCODING = {
  "~": "_".repeat(16),
  "|": "_".repeat(15),
  "`": "_".repeat(14),
  "^": "_".repeat(13),
  "*": "_".repeat(12),
  "'": "_".repeat(11),
  "&": "_".repeat(10),
  "%": "_".repeat(9),
  "$": "_".repeat(8),
  "#": "_".repeat(7),
  "!": "_".repeat(6),
  ";": "_".repeat(5),
  "/": "_".repeat(4),
  ".": "_".repeat(3),
  "+": "_".repeat(2),
  "-": "_".repeat(1),
}


const MediaTypeSchema = z.string().transform((arg, ctx) => {
  if(!arg.startsWith("_") && !arg.startsWith("#")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `MediaType must start with '#' or '_'`
    })
    return z.NEVER
  }
  const value = arg.startsWith("_")
    ? Object.entries(MIME_NAME_ENCODING).reduce((acc, [k, v]) => acc.replaceAll(v, k), arg)
    : arg
  const match = value.match(mimePattern)
  if(match) {
    const {supertype, subtype, suffix, pkey, pvalue} = match.groups ?? {}
    return {supertype, subtype, suffix, ...(pkey? {[pkey]: pvalue}: null)}
  }
  else {
    return z.NEVER
  }
})

export class MediaType extends DataType(MediaTypeSchema) {
  serialize(format: "expr" | "node" = "expr") {
    if(format === "expr") {
      const [paramKey, paramValue] = Object.entries(this).find(([k]) => k !== "supertype" && k !== "subtype" && k !== "suffix") ?? []
      const paramStr = paramKey? `;${paramKey}=${paramValue}`: ""
      return `#${this?.supertype}/${this?.subtype}` + paramStr
    }
    else {
      return `_${this?.supertype}____${this.subtype.replaceAll("-", "_")}`
    }
  }

  toString() {
    return this.serialize()
  }
}

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
  url: z.string().url(),
  type: z.string()
})
.or(z.string())


const PersonObjectSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional()
})

const PersonSchema = (z.string()
  .regex(npmPersonPattern)
  .transform(str => {
    const groups = npmPersonPattern.exec(str)?.groups ?? {}
    const {name, email, url} = groups
    return {name, ...(email && {email}), ...(url && {url})} as z.infer<typeof PersonObjectSchema>
  })
  .refine(arg => PersonObjectSchema.parse(arg)))
  .or(PersonObjectSchema)

export class Person extends DataType(PersonSchema) {
  serialize() {
    const email = this.email != null? ` <${this.email}>`: ""
    const url = this.url != null? ` (${this.url})`: ""
    return `${this.name}${email}${url}`
  }

  toString() {
    return this.serialize()
  }

  extend(extraProperties: Partial<Person>) {
    return new Person({...this, ...extraProperties})
  }
}

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

const PackageSchema = z.object({
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
  dependencies: z.record(NpmName, SemVerRange.or(FileURL)).optional(),
  devDependencies: z.record(NpmName, SemVerRange.or(FileURL)).optional(),
  peerDependencies: z.record(NpmName, SemVerRange.or(FileURL)).optional(),
  bundleDependencies: z.record(NpmName, SemVerRange).or(FileURL).optional(),
  optionalDependencies: z.record(NpmName, SemVerRange.or(FileURL)).optional(),
  engines: z.record(z.string(), SemVerRange).optional(),
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
  installed: z.boolean().optional().default(false),
  outdated: z.boolean().optional().default(false),
  imported: z.boolean().optional().default(false),
  watching: z.boolean().optional().default(false),
  reloadCount: z.number().optional().default(0),
  localPath: z.string().optional(),
  importError: z.string().optional(),
  jsSize: z.number().optional(),
  cssSize: z.number().optional()
})
.catchall(Json)

export class Package extends DataType(PackageSchema) {

  static optionKeys = [
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

  serialize(format:"json"|"object"="json") {
    const keys = Object.getOwnPropertyNames(this).filter(k => !Package.optionKeys.includes(k))
    const result = Object.fromEntries(keys.map(key => {
      const value = (this as any)[key]
        return [key, value]
    }))
    if(format === "json") {
      return JSON.stringify(result, undefined, 4)
    }
    else {
      return result
    }

  }



  toString() {
    return this.serialize() as string
  }

  extend(extraProperties: Partial<Package>) {
    return new Package({...this, ...extraProperties})
  }
}