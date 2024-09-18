const worker = self as unknown as ServiceWorkerGlobalScope

import * as esbuild from "esbuild-wasm"
import PathBrowserifyEsm from "path-browserify-esm" // @ts-ignore
import wasmURL from "esbuild-wasm/esbuild.wasm?url"
import {Generator} from "@jspm/generator"
import {ImportMap, IImportMap} from "@jspm/import-map"
import {BuildOptions} from "esbuild-wasm"
import { PackageConfig } from "@jspm/generator/lib/install/package"
import {parseUrlPkg, pkgToUrl} from "@jspm/generator/lib/providers/jsdelivr"

const commaSeparatedArrays = [
  'conditions',
  'dropLabels',
  'mainFields',
  'resolveExtensions',
  'target',
]

function parseOptionsAsShellArgs(input: string, mode: "build" | "transform" = "build"): Record<string, any> {
  type Arg = { text_: string, line_: number, column_: number, length_: number }
  const args: Arg[] = []
  const n = input.length
  let line = 0
  let lineStart = 0
  let i = 0

  while (i < n) {
    const argStart = i
    const argLine = line
    const argColumn = i - lineStart
    let arg = ''
    let c = input[i]

    // Skip over whitespace
    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      if (c === '\n') {
        line++
        lineStart = i
      }
      continue
    }

    // Scan a single argument
    while (i < n) {
      c = input[i]
      if (c === ' ' || c === '\t' || c === '\n') break
      i++

      // Handle unquoted backslashes
      if (c === '\\' && i < n) {
        c = input[i++]
        if (c === '\n') {
          line++
          lineStart = i
        } else {
          arg += c
        }
      }

      // Handle single quotes
      else if (c === '\'') {
        const openLine = line
        const openColumn = i - lineStart - 1
        while (true) {
          if (i === n) throw Error([input, '\'', openLine, openColumn, line, i - lineStart].join(" "))
          c = input[i++]
          if (c === '\'') break
          if (c === '\\' && i < n && input[i] !== '\'') {
            c = input[i++]
            if (c === '\n') {
              line++
              lineStart = i
              continue
            }
          }
          if (c === '\n') {
            line++
            lineStart = i
          }
          arg += c
        }
      }

      // Handle double quotes
      else if (c === '"') {
        const openLine = line
        const openColumn = i - lineStart - 1
        while (true) {
          if (i === n) throw Error([input, '"', openLine, openColumn, line, i - lineStart].join(" "))
          c = input[i++]
          if (c === '"') break
          if (c === '\\' && i < n) {
            c = input[i++]
            if (c === '\n') {
              line++
              lineStart = i
              continue
            }
          }
          if (c === '\n') {
            line++
            lineStart = i
          }
          arg += c
        }
      }

      // Handle other unquoted characters
      else {
        arg += c
      }
    }

    args.push({
      text_: arg,
      line_: argLine,
      column_: argColumn,
      length_: i - argStart,
    })
  }
  const entryPoints: (string | { in: string, out: string })[] = []
  const output: Record<string, any> = Object.create(null)

  const kebabCaseToCamelCase = (text: string, arg: Omit<Arg, 'text_'>): string => {
    if (text !== text.toLowerCase())
      throw Error([input, 'Invalid CLI-style flag: ' + JSON.stringify('--' + text), arg.line_, arg.column_, text.length + 2].join(" "))
    return text.replace(/-(\w)/g, (_, x) => x.toUpperCase())
  }

  // Convert CLI-style options to JS-style options
  for (const { text_: text, ...arg } of args) {
    const equals = text.indexOf('=')

    if (text.startsWith('--')) {
      const colon = text.indexOf(':')

      // Array element
      if (colon >= 0 && equals < 0) {
        const key = kebabCaseToCamelCase(text.slice(2, colon), arg)
        const value = text.slice(colon + 1)
        if (!(key in output) || !Array.isArray(output[key])) {
          output[key] = []
        }
        output[key].push(value)
      }

      // Map element
      else if (colon >= 0 && colon < equals) {
        const key1 = kebabCaseToCamelCase(text.slice(2, colon), arg)
        const key2 = text.slice(colon + 1, equals)
        const value = text.slice(equals + 1)
        if (!(key1 in output) || typeof output[key1] !== 'object' || Array.isArray(output[key1])) {
          output[key1] = Object.create(null)
        }
        output[key1][key2] = value
      }

      // Key value
      else if (equals >= 0) {
        const value = text.slice(equals + 1)
        output[kebabCaseToCamelCase(text.slice(2, equals), arg)] =
          value === 'true' ? true : value === 'false' ? false : value
      }

      // Bare boolean
      else {
        output[kebabCaseToCamelCase(text.slice(2), arg)] = true
      }
    }

    // Invalid flag
    else if (text.startsWith('-') || mode === "transform") {
      throw Error([input, 'All CLI-style flags must start with "--"', arg.line_, arg.column_, arg.length_].join(" "))
    }

    // Entry point
    else {
      // Assign now to set "entryPoints" here in the property iteration order
      output['entryPoints'] = entryPoints
      entryPoints.push(equals < 0 ? text : { in: text.slice(equals + 1), out: text.slice(0, equals) })
    }
  }

  if (entryPoints.length) output['entryPoints'] = entryPoints
  return output
}

function parseEsbuildOptions(input: BuildOptions | string, mode: "build" | "transform"="build"): BuildOptions {
  if(!(typeof input === "string")) {
    return input
  }
  const trimmed = input.trimStart()
  const isJSON = /^{|^\/[*/]/.test(trimmed)
  let options: Record<string, any>
  
  const toRegExp = (key: string): void => {
    if (options[key] !== undefined) {
      try {
        options[key] = new RegExp(options[key] + '')
      } catch (err: any) {
        key = key.replace(/[A-Z]/g, x => '-' + x.toLowerCase())
        throw new Error(`Invalid regular expression for "--${key}=": ${err?.message}`)
      }
    }
  }

  const toNumber = (key: string): void => {
    if (options[key] !== undefined) {
      try {
        options[key] = +options[key]
      } catch (err: any) {
        key = key.replace(/[A-Z]/g, x => '-' + x.toLowerCase())
        throw new Error(`Invalid number for "--${key}=": ${err?.message}`)
      }
    }
  }

  options = parseOptionsAsShellArgs(input, mode)

  // These need to be numbers, not strings or booleans
  toNumber('logLimit')
  toNumber('lineLimit')

  // These need to be regular expressions, not strings or booleans
  toRegExp('mangleProps')
  toRegExp('reserveProps')

  // These need to be arrays, not comma-separated strings or booleans
  for (const key of commaSeparatedArrays) {
    if (options[key] !== undefined) {
      options[key] = (options[key] + '').split(',')
    }
  }

  // Map entries for "supported" must be booleans, not strings (but map
  // entries for other maps such as "define" or "banner" must be strings,
  // so only do this for "supported")
  const supported = options['supported']
  if (typeof supported === 'object' && supported !== null) {
    for (const key in supported) {
      if (supported[key] === 'true') supported[key] = true
      else if (supported[key] === 'false') supported[key] = false
    }
  }

  // Parsing this makes it more readable when printing it as JSON
  let tsconfigRaw = options['tsconfigRaw']
  if (tsconfigRaw !== undefined) {
    try {
      tsconfigRaw = JSON.parse(tsconfigRaw)
    } catch {
    }
  }

  return options
}

export class Barrier {
  private readonly resolvers: Array<() => void> = []
  private paused: boolean = true

  constructor(paused: boolean = true) {
    this.paused = paused
  }

  /** Pauses this barrier causing operations to wait. */
  public pause(): void {
    this.paused = true
  }

  /** Resumes this barrier causing all operations to run. */
  public resume(): void {
    this.paused = false
    this.dispatch()
  }

  /** Waits until this barrier enters a resumed state. */
  public wait(): Promise<void> {
    return this.paused ? new Promise((resolve) => this.resolvers.push(resolve)) : Promise.resolve(void 0)
  }

  private async dispatch(): Promise<void> {
    while (!this.paused && this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!
      resolve()
    }
  }
}

export const Path = PathBrowserifyEsm

export interface Resolver {
  resolve(path: string): Promise<string> | string
}

export interface CompilerOptions extends esbuild.InitializeOptions {}

export class Compiler {
  private readonly barrier: Barrier
  constructor(private readonly options: CompilerOptions = {wasmURL}) {
    this.barrier = new Barrier(true)
    // compilerStart = performance.now()
    esbuild.initialize({ ...this.options, worker: false }).then(() => this.barrier.resume())
  }

  public async compile(options: esbuild.BuildOptions = {}, importMap: ImportMap) {
    await this.barrier.wait()
    // console.log(`Compiler ready after ${((performance.now() - compilerStart) / 1000).toFixed(2)}s`)
    const result = await esbuild.build({
      plugins: [
        {
          name: '@webwriter/esbuild-importmap-resolve',
          setup: (build) => {
            build.onResolve({ filter: /.*/ }, (args) => this.onResolveCallback(args, importMap))
            build.onLoad({ filter: /.*/ }, (args) => this.onLoadCallback(args, options))
          },
        },
      ],
      
      bundle: true,
      outdir: ".",
      ...options,
      write: false,
    })
    return result
  }

  private onResolveCallback(args: esbuild.OnResolveArgs, importMap: ImportMap) {
    if (args.kind === 'entry-point') {
      return { path: "/" + importMap.resolve(args.path) }
    }
    if (args.kind === 'import-statement') {
      let url = importMap.resolve(args.path, args.resolveDir.slice(1) + "/")
      return { path: "/" + url}
    }
    throw Error('not resolvable')
  }

  static defaultLoader = {
    ".js": "js",
    ".cjs": "js",
    ".mjs": "js",
    ".jsx": "jsx",
    ".ts": "ts",
    ".mts": "ts",
    ".cts": "ts",
    ".tsx": "tsx",
    ".json": "json",
    ".css": "file",
    ".html": "file",
    ".txt": "txt"
  }

  getLoader(ext: string, loader?: esbuild.BuildOptions["loader"]) {
    return {...Compiler.defaultLoader, ...loader}[ext] ?? "default"
  }

  private async onLoadCallback(args: esbuild.OnLoadArgs, options: esbuild.BuildOptions): Promise<esbuild.OnLoadResult> {
    options.loader
    const url = args.path.slice(1)
    const extname = Path.extname(args.path)
    const response = await fetch(url)
    if(!response.ok) {
      throw Error(`Could not fetch ${url}`)
    }
    const contents = await response.text()
    const loader = this.getLoader(extname, options?.loader) as any
    return { contents, loader }
  }
}

async function hashFromIdentifiers(identifiers: string | string[]) {
  const ids = Array.isArray(identifiers)? identifiers: [identifiers]
  const idsData = (new TextEncoder()).encode(ids.join("~"))
  const hashData = await worker.crypto.subtle.digest("SHA-256", idsData)
  return Array.from(new Uint8Array(hashData)).map(b => b.toString(16).padStart(2, "0")).join("")
}

const extensions: any = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html"
}
const compiler = new Compiler({wasmURL})
const CDN_URL = "https://cdn.jsdelivr.net/npm/"
const API_URL = "https://api.webwriter.app/ww/v1/"

async function getAsset(id: string) {
  return fetch(new URL(id, CDN_URL))
}

async function getPackages(ids: string[]) {
  const pkgIds = ids.map(id => id.startsWith("@")? id.split("/").slice(0, 2).join("/"): id.split("/")[0])
  let _ids = pkgIds.map(name => `${name}/package.json`)
  if(!_ids.length) {
    const resp = await search("keywords:webwriter-widget")
    if(resp instanceof Error) {
      throw resp
    }
    _ids = resp.objects.map(obj => obj.package).map(({name, version}) => `${name}@${version}/package.json`)
  }
  const pkgs = (await Promise.allSettled(_ids.map(id => getAsset(id).then(resp => resp.json())))).filter(result => result.status === "fulfilled").map(result => result.value)
  return new Response(new Blob([JSON.stringify(pkgs)], {type: "application/json"}))
}

async function getImportmap(ids: string[] | Record<string, any>[]) {
  let _ids = [] as string[]; let assets = {} as Record<string, string>
  const forPackage = typeof ids[0] === "object"
  if(!forPackage) {
    _ids = [...ids] as string[]
  }
  else {
    // const pkgIds = ids.map(id => id.startsWith("@")? id.slice(1).split("/").slice(0, 2).join("/"): id.split("/")[0])
    // const pkgs = await Promise.all(pkgIds.map(id => getAsset(`${id}/package.json`).then(resp => resp.json()))) as any[]
    const pkgs = ids as Record<string, any>[]
    assets = Object.fromEntries(pkgs.flatMap(pkg => {
      return Object.keys(pkg.exports)
        .filter(k => k.startsWith("./") && (k.endsWith(".html") || k.endsWith(".css") || k.endsWith(".*")))
        .map(k => [
          pkg.name + (k.endsWith(".*")? k.slice(1, -2) + ".css": k.slice(1)),
          new URL(pkg.name + (pkg.exports[k]?.default ?? pkg.exports[k]).slice(1), CDN_URL).href.replace(".*", ".css")
        ])
    }))
    _ids = pkgs.flatMap(pkg => Object.keys(pkg.exports).filter(k => k.startsWith("./")).map(k => pkg.name + k.slice(1))).filter(id => id.endsWith(".*")).map(id => id.slice(0, -2) + ".js")
  }
  const generator = new Generator({cache: false, defaultProvider: "jsdelivr"})
  let allLinked = false
  do {
    try {
      await generator.link(_ids)
      Object.entries(assets).forEach(([id, url]) => {
        generator.map.set(id, url)
      })
      allLinked = true
    }
    catch(err: any) {
      const regexMatch = / imported from /g.exec(err.message)
      if(err.code === "MODULE_NOT_FOUND" && regexMatch) {
        console.warn(`Excluding faulty package ${regexMatch[1]}: ${err.message}`)
        _ids = _ids.filter(id => id !== regexMatch[1])
      }
      else {
        console.error(err)
        return new Response(null, {status: 500})
      }
    }
  } while(_ids.length && !allLinked)
  return new Response(new Blob([JSON.stringify(generator.map.toJSON())], {type: "application/json"}))
}

async function getBundle(ids: string[], importMap: ImportMap, options?: esbuild.BuildOptions) {
  const jsIds = ids.filter(id => id.endsWith(".js") || id.endsWith(".mjs"))
  const cssIds = ids.filter(id => id.endsWith(".css"))
  if(jsIds.length && cssIds.length) {
    return new Response(null, {status: 400, statusText: "Can't bundle .css and .js/.mjs files together, request those bundles separately"})
  }
  else if(jsIds.length) {
    const opts = {...parseEsbuildOptions(ids.join(" ")), ...options}
    let result: esbuild.BuildResult
    try {
      result = await compiler.compile({target: "es2022", format: "esm", conditions: ["source"], ...opts}, importMap)
    }
    catch(err: any) {
      console.error(err)
      return new Response(null, {status: 500})
    }
    const js = result.outputFiles?.find(file => file.path.endsWith("js"))?.contents
    if(result.errors.length || !js) {
      return new Response(new Blob([JSON.stringify(result.errors)], {type: "application/json"}), {status: 400, statusText: "Error while bundling"})
    }
    else {
      return new Response(new Blob([js], {type: "text/javascript"}))
    }
  }
  else if(cssIds.length) {
    const cssSources = await Promise.all(cssIds.map(async id => {
      const url = importMap.resolve(id)
      const response = await fetch(url)
      return response.text()
    }))
    const css = cssSources.join("\n")
    return new Response(new Blob([css], {type: "text/css"}))
  }
  else {
    return new Response(null, {status: 400, statusText: "Provide IDs to bundle as query parameters"})
  }
}

type Action<T extends "importmaps" | "bundles" | "packages" | "assets" = "importmaps" | "bundles" | "packages" | "assets"> = {
  collection: T,
  ids: string[],
  args: Record<string, string>
}

function urlToAction(url: URL) {
  const suffix = url.pathname.slice("/ww/v1/".length)
  let collection: Action["collection"]
  if(suffix.startsWith("_importmaps")) {
    collection = "importmaps"
  }
  else if(suffix.startsWith("_bundles")) {
    collection = "bundles"
  }
  else if(suffix.startsWith("_packages")) {
    collection = "packages"
  }
  else if(suffix.startsWith("_")) {
    throw Error(`Unsupported collection type ${suffix}`)
  }
  else {
    collection = "assets"

  }
  const ids = [
    suffix.slice(collection === "assets"? 0: `_${collection}/`.length),
    ...url.searchParams.getAll("id")
  ].filter(id => id)
  if(collection === "assets" && ids.length > 1) {
    throw Error(`Cannot fetch multiple assets in one request`)
  }
  url.searchParams.delete("id")
  const args = Object.fromEntries(url.searchParams.entries())
  return {collection, ids, args}
}

function actionToUrl<T extends Action["collection"]>(action: Action<T>) {
  const url = new URL(action.collection === "assets"? "": `_${action.collection}`, API_URL)
  action.ids.forEach(id => url.searchParams.append("id", id))
  Object.keys(action.args).forEach(key => url.searchParams.append(key, action.args[key]))
  return url
}

async function respond<T extends Action["collection"]>(action: Action<T>) {
  const pkgsResponse = await getPackages(action.ids)
  let pkgs: PackageConfig[]
  if(action.collection === "packages") {
    return pkgsResponse
  }
  else {
    pkgs = await pkgsResponse.json()
  }
  const versionedIds = action.ids.map((id, i) => id.replace(pkgs[i].name!, pkgs[i].name! + "@" + pkgs[i].version!))
  const url = actionToUrl({...action, ids: versionedIds})
  const cachedResponse = await caches.match(url)
  if(cachedResponse) {
    return cachedResponse
  }
  const cache = await caches.open("ww/v1")
  
  if(action.collection === "assets") {
    return getAsset(action.ids[0])
  }
  else if(action.collection === "importmaps") {
    const mapResponse = await getImportmap(action.args.pkg === "true"? pkgs: action.ids)
    cache.put(url, mapResponse.clone())
    return mapResponse
  }
  else if(action.collection === "bundles") {
    const mapResponse = await respond({collection: "importmaps", ids: action.ids, args: {pkg: "true"}})
    const map: IImportMap = await mapResponse.json()
    const importMap = new ImportMap({map, mapUrl: new URL("http://localhost"), rootUrl: null})
    let ids = action.ids
    if(action.args.pkg === "true") {
      ids = action.args.type === "css"
        ? Object.keys(importMap.imports).filter(k => k.endsWith(".css"))
        : Object.keys(importMap.imports).filter(k => k.endsWith(".js"))
    }
    const bundleResponse = await getBundle(ids, importMap)
    cache.put(url, bundleResponse.clone())
    return bundleResponse
  }
  else {
    throw Error(`Unknown collection "${action.collection}"`)
  }
}

async function getFetchResponse(e: FetchEvent) {
  const url = new URL(e.request.url)
  let action
  try {
    action = urlToAction(url)
  }
  catch(err: any) {
    return new Response(null, {status: 400, statusText: err?.message})
  }
  return respond(action)
}

worker.addEventListener("install", async () => {
  console.log("Installing service worker")
  worker.skipWaiting()
  await caches.delete("ww/v1")
})

worker.addEventListener("activate", async (e) => {
  console.log("Activating service worker")
  e.waitUntil(worker.clients.claim())
})

worker.addEventListener("fetch", e => {
  const url = new URL(e.request.url)
  const shouldIntercept = url.hostname === "api.webwriter.app" && url.pathname.startsWith("/ww/v1/")
  if(shouldIntercept) {
    try {
      e.respondWith(getFetchResponse(e) as any)
    }
    catch(err: any) {
      console.error(err)
      e.respondWith(new Response(null, {status: 500}))
    }
  }
})

/** API api.webwriter.app/bundle/
 * GET ·/[Package ID]/[Widget Path] {Accept: [TYPE]}  -> widget content/style
 * GET ·/_bundle?w=[Package ID]/[Widget Path]&w=... {Accept: [TYPE]} -> bundle
 * GET ·/[Package ID]/package.json -> package
 * GET ·/_packages?p=[Package ID]&p=... -> packages
 */

/** Search using npm's registry API (https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md). Uses the registry API since the CLI doesn't support search qualifiers such as tags. */
export async function search(text: string, params?: {size?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint="https://registry.npmjs.com/-/v1/search") {
  const allParams = {text, ...{size: 250, ...params}}
  const baseURL = new URL(searchEndpoint)
  Object.entries(allParams).forEach(([k, v]) => v? baseURL.searchParams.append(k, v.toString()): null)
  let from = 0
  let total = Number.POSITIVE_INFINITY
  let objects: any[] = []
  let time = undefined
  do {
    let url = new URL(baseURL.href)
    url.searchParams.set("from", String(from))
    const result = await fetch(baseURL)
    if(result.ok) {
      const body = await result.json()
      from += params?.size ?? 250
      total = body.total
      time = body.time
      objects = objects.concat(body.objects)
    }
    else {
      return new Error(`${result.status} ${result.statusText}`)
    }
  } while(from < total)
  return {objects, total, time}
}