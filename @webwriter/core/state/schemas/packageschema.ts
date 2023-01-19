// @ts-strict
import {z} from "zod"
import SPDX_LICENSE_MAP from "spdx-license-list"
import {valid as semverValid, validRange as semverValidRange} from "semver"

const SPDX_LICENSES = Object.values(SPDX_LICENSE_MAP).map(x => x.name)
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

const nonUrlSafePattern = /(?!\{|\}|\||\\|\^|~|\[|\]|\`)/g
const npmBlacklistPattern = /^(node_modules|favicon\.ico)$/g
const nodeBuiltinsPattern = new RegExp(`^(${NODE_BUILTINS.join("|")})$`, "g")
const spdxLicensePattern = new RegExp(`^(${SPDX_LICENSES.map(x => x.replaceAll(".", "\.")).join("|")})$`, "g")
const nodePlatformPattern = new RegExp(`^(${NODE_PLATFORMS.join("|")})$`, "g")
const nodeArchPattern = new RegExp(`^(${NODE_ARCHS.join("|")})$`, "g")
const npmPersonPattern = new RegExp(`^\s*(?<name>.+)\s*(?:<(?<email>.+)>)?\s*(?:\((?<url>.+)\))?\s*$`, "g")

export type NpmName = z.infer<typeof NpmName>
export const NpmName = z.string()
  .min(1, {message: "Cannot be empty"})
  .max(214, {message: "Cannot be longer than 214 characters"})
  .regex(/(?![A-Z])/g, {message: "Cannot have uppercase characters"})
  .regex(nonUrlSafePattern, {message: "Cannot contain non-url-safe characters"})
  .regex(/^(?!\.|_)/g, {message: "Cannot start with . or _"})
  .regex(/(?!\s)/g, {message: "Cannot contain spaces"})
  .regex(/(?!(\)|\()|\'|\!\*)/g, {message: "Cannot contain these characters: )('!*"})
  .regex(npmBlacklistPattern, {message: "Cannot be 'node_modules' or 'favicon.ico'"})
  .regex(nodeBuiltinsPattern, {message: "Cannot be a builtin node module name"})

export type SemVer = z.infer<typeof SemVer>
export const SemVer = z.string()
  .refine(x => semverValid(x), {message: "Invalid SemVer"})

export type SemVerRange = z.infer<typeof SemVerRange>
export const SemVerRange = z.string()
  .refine(x => semverValidRange(x), {message: "Invalid NPM version range"})

export type SpdxLicense = z.infer<typeof SpdxLicense>
export const SpdxLicense = z.string().regex(spdxLicensePattern, {message: "Is not a valid spdx license identifier"})

export type NodePlatform = z.infer<typeof NodePlatform>
export const NodePlatform = z.string().regex(nodePlatformPattern, {message: "Is not a valid node platform (process.platform)"})

export type NodeArch = z.infer<typeof NodeArch>
export const NodeArch = z.string().regex(nodeArchPattern, {message: "Is not a valid node platform (process.arch)"})

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const Json: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, Json.array(), z.record(Json)])
);

const PersonSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  url: z.string().url().optional()
})

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

export type Person = z.infer<typeof Person>
export const Person = z.string()
  .regex(npmPersonPattern)
  .transform(str => {
    const {name, email, url} = npmPersonPattern.exec(str)?.groups ?? {}
    return {name, ...(email && {email}), ...(url && {url})} as z.infer<typeof PersonSchema>
  })
  .refine(PersonSchema.parse)
  .or(PersonSchema)

const PackageSchema = z.object({
  name: NpmName,
  version: SemVer,
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  homepage: z.string().url().optional(),
  bugs: IssueTracker.optional(),
  license: SpdxLicense.optional(),
  author: Person.optional(),
  contributors: Person.array().optional(),
  funding: Funding.or(Funding.array()).optional(),
  files: z.array(z.string()).optional(),
  main: z.string().optional(),
  browser: z.string().optional(),
  bin: z.record(z.string()).optional(),
  man: z.array(z.string()).optional(),
  directories: z.record(z.string()).optional(),
  repository: Repository.optional(),
  scripts: z.record(z.string()).optional(),
  dependencies: z.record(NpmName, SemVerRange).optional(),
  devDependencies: z.record(NpmName, SemVerRange).optional(),
  peerDependencies: z.record(NpmName, SemVerRange).optional(),
  bundleDependencies: z.record(NpmName, SemVerRange).optional(),
  optionalDependencies: z.record(NpmName, SemVerRange).optional(),
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
  exports: z
    .string()
    .or(z.string().array())
    .or(z.string().array())
    .optional(),
  imports: z.record(z.string().startsWith("#"), z.record(z.string())).optional()
})
.and(z.record(Json))

export type Package = z.infer<typeof PackageSchema>
export const Package = Object.assign(PackageSchema, {
  serialize(pkg: Package, format: "json" = "json") {
    return JSON.stringify(pkg)
  }
})