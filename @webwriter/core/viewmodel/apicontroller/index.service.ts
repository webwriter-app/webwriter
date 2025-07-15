const worker = self as unknown as ServiceWorkerGlobalScope

import * as esbuild from "esbuild-wasm"
import PathBrowserifyEsm from "path-browserify-esm" // @ts-ignore
import wasmURL from "esbuild-wasm/esbuild.wasm?url"
import {Generator, Provider, setFetch, fetch as jspmFetch} from "@jspm/generator"
import {ImportMap, IImportMap} from "@jspm/import-map"
import {BuildOptions} from "esbuild-wasm"
import { SemVer } from "semver"


SemVer.prototype.toString = function(this) {
  const prerelease = this.prerelease.length? `-${this.prerelease.join(".")}`: ""
  const build = this.build.length? `+${this.build.join(".")}`: ""
  return `${this.major}.${this.minor}.${this.patch}${prerelease}${build}`
}

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
    const response = await fetchOrFS(url)
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
const exactPkgRegEx = /^((?:@[^\/\\%@]+\/)?[^.\/\\%@][^\/\\%@]*)@([^\/]+)(\/.*)?$/

const filesystem: Provider = {
  async pkgToUrl(pkg, layer) {
    return `${API_URL}${pkg.name}@0.0.0-local/`
  },
  parseUrlPkg(url) {
    if(url.startsWith(API_URL)) {
      const path = url.slice(API_URL.length)
      const [_, name, version] = path.match(exactPkgRegEx) || []
      return {registry: "npm", name, version: "0.0.0-local"}
    }
    else {
      return null
    }
  },
  async resolveLatestTarget({registry, name}) {
    return {registry, name, version: "0.0.0-local"}
  }
}

async function getLocalHandle(id: string): Promise<FileSystemDirectoryHandle> {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  const tx = db.result.transaction("handles", "readwrite")
  const store = tx.objectStore("handles")
  const req = store.get(id)
  return new Promise(r => req.addEventListener("success", async () => {
    db.result.close()
    r(req.result.handle)
  }))
}


async function getAsset(id: string) {
  const scoped = id.startsWith("@")
  const parts = id.split("/")
  const name = (scoped? "@": "") + parts.slice(0, 2).join("/").split("@").at(scoped? 1: 0)!
  const version = parts[scoped? 1: 0].split("@").at(-1)!
  const semver = new SemVer(version)
  if(semver.prerelease.includes("local")) {
    const pkgId = parts.slice(0, scoped? 2: 1).join("/")
    const pathParts = parts.slice(scoped? 2: 1)
    const handle = await getLocalHandle(name)
    let directory = handle
    let file: File
    for(const [i, part] of pathParts.entries()) {
      if(i === pathParts.length - 1) {
        try {
          const fileHandle = await directory.getFileHandle(part)
          file = await fileHandle.getFile()
        }
        catch(err) {
          return new Response(null, {status: 404, statusText: "404: Local file not found"})
        }
      }
      else {
        try {
          directory = await directory.getDirectoryHandle(part)
        }
        catch(err) {
          return new Response(null, {status: 404, statusText: "404: Local directory not found"})
        }
      }
    }
    return new Response(file!, {headers: {"Access-Control-Allow-Origin": "*"}})
  }
  else {
    return fetch(new URL(id, CDN_URL))
  }
}

type Snippet = {html: string, label?: Record<string, string>}

async function getSnippet(id?: string) {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  if(!db.result.objectStoreNames.contains("snippets")) {
    return new Response(new Blob(["[]"], {type: "application/json"}))
  }
  const tx = db.result.transaction("snippets", "readonly")
  const store = tx.objectStore("snippets")
  const req = id? store.get(parseInt(id)): store.getAll()
  const snippet = await new Promise(r => req.addEventListener("success", async () => {
    db.result.close()
    r(req.result)
  }))
  return new Response(new Blob([JSON.stringify(snippet)], {type: "application/json"}))
}
async function postSnippet(snippet: Snippet) {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  const tx = db.result.transaction("snippets", "readwrite")
  const store = tx.objectStore("snippets")
  delete (snippet as any).id
  const req = store.add(snippet)
  const id: string = await new Promise((resolve, reject) => {
    req.addEventListener("success", async () => {
      db.result.close()
      resolve(String(req.result))
    })
    req.addEventListener("error", reject)
  })
  const url = actionToUrl({collection: "snippets", ids: [id], args: {}})
  return new Response(null, {headers: {"Content-Location": url.href}, status: 201})
}
async function putSnippet(id: string, snippet: Snippet) {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  const tx = db.result.transaction("snippets", "readwrite")
  const store = tx.objectStore("snippets")
  const req = store.put(snippet)
  await new Promise(r => req.addEventListener("success", async () => {
    db.result.close()
    r(String(req.result))
  }))
  return new Response(null, {status: 200})
}
async function deleteSnippet(id: string) {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  const tx = db.result.transaction("snippets", "readwrite")
  const store = tx.objectStore("snippets")
  const req = store.delete(parseInt(id))
  await new Promise(r => req.addEventListener("success", async () => {
    db.result.close()
    r(req.result)
  }))
  return new Response(null, {status: 204})
}

async function getPackages(ids: string[]) {
  const pkgIds = ids.map(id => id.startsWith("@")? id.split("/").slice(0, 2).join("/"): id.split("/")[0])
  let _ids = pkgIds.map(name => `${name}/package.json`)
  if(!_ids.length) {
    _ids = (await getMergedPackageIDs()).map(id => `${id}/package.json`)
  }
  const pkgs = (await Promise.allSettled(_ids.map(async id => {
    const resp = await getAsset(id)
    const json = await resp.json()
    const isLocal = new SemVer(id.split("/")[1].split("@").at(-1)!).prerelease.includes("local")
    const version = new SemVer(json.version)
    if(isLocal) {
      version.prerelease = [...version.prerelease, "local"]
    }
    return {...json, version: String(version)}  
  })))
    .filter(result => result.status === "fulfilled")
    .map(result => result.value)
    
  return new Response(new Blob([JSON.stringify(pkgs)], {type: "application/json"}))
}

async function getImportmap(ids: string[] | Record<string, any>[]) {
  let localIds: string[] = []
  let _ids: string[] = []
  let assets: Record<string, string> = {}
  let pkgs: Record<string, any>[] = []
  const forPackage = typeof ids[0] === "object"
  if(!forPackage) {
    // _ids = [...ids] as string[]
    pkgs = (ids as string[]).map(id => {
      const [idPart, path] = [id.split("/").slice(0, 2).join("/"), id.split("/").slice(2).join("/")]
      const [_, rawName, version] = idPart.split("@")
      const name = "@" + rawName
      return {id, name, version, path}
    })
    _ids = Array.from(new Set(pkgs
      .filter(pkg => !(new SemVer(pkg.version).prerelease.includes("local")))
      .map(pkg => pkg.id)
    ))
    localIds = Array.from(new Set(pkgs
      .filter(pkg => new SemVer(pkg.version).prerelease.includes("local"))
      .map(pkg => pkg.name + "@0.0.0-local/" + pkg.path)
    ))
  }
  else {
    // const pkgIds = ids.map(id => id.startsWith("@")? id.slice(1).split("/").slice(0, 2).join("/"): id.split("/")[0])
    // const pkgs = await Promise.all(pkgIds.map(id => getAsset(`${id}/package.json`).then(resp => resp.json()))) as any[]
    pkgs = ids as Record<string, any>[]
    assets = Object.fromEntries(pkgs.flatMap(pkg => {
      const version = new SemVer(pkg.version)
      const isLocal = version.prerelease.includes("local")
      const pkgId = `${pkg.name}@${pkg.version}`
      return Object.keys(pkg.exports)
        .filter(k => k.startsWith("./") && (k.endsWith(".html") || k.endsWith(".css") || k.endsWith(".*")) && !k.startsWith("./tests/"))
        .map(k => [
          pkgId + (k.endsWith(".*")? k.slice(1, -2) + ".css": k.slice(1)),
          new URL(pkgId + (pkg.exports[k]?.default ?? pkg.exports[k]).slice(1), isLocal? API_URL: CDN_URL).href.replace(".*", ".css")
        ])
    }))
    _ids = Array.from(new Set(pkgs
      .filter(pkg => !(new SemVer(pkg.version).prerelease.includes("local")))
      .flatMap(pkg => Object.keys(pkg.exports)
        .filter(k => k.startsWith("./") && k.endsWith(".*") && !k.startsWith("./tests/"))
        .map(k => pkg.name + "@" + pkg.version + k.slice(1, -2) + ".js")
      )
    ))
    localIds = Array.from(new Set(pkgs
      .filter(pkg => (new SemVer(pkg.version).prerelease.includes("local")))
      .flatMap(pkg => Object.keys(pkg.exports)
        .filter(k => k.startsWith("./") && k.endsWith(".*") && !k.startsWith("./tests/"))
        .map(k => pkg.name + "@0.0.0-local" + k.slice(1, -2) + ".js")
      )
    ))
  }
  const resolutions = Object.fromEntries(pkgs.map(pkg => [pkg.name, pkg.version]))
  const generator = new Generator({cache: false, defaultProvider: "jsdelivr", resolutions})
  let allLinked = false
  do {
    try {
      await generator.install(_ids)
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
  let map = new ImportMap({mapUrl: "https://localhost:5173"})
  for(const [key, value] of Object.entries(generator.map.imports)) {
    const name = key.split("/").slice(0, 2).join("/")
    map.set(!name.slice(1).includes("@")? key.replace(name, name + "@" + resolutions[name]): key, value)
  }
  if(localIds.length) {
    const localGenerator = new Generator({cache: false, inputMap: map, customProviders: {filesystem}, defaultProvider: "filesystem", resolutions})
    let allLinkedLocal = false
    do {
      try {
        await localGenerator.install(localIds)
        allLinkedLocal = true
      }
      catch(err: any) {
        const regexMatch = /Module not found (https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)) imported from /g.exec(err.message)
        const notFoundMatch = /Unable to analyze (https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)) imported from/g.exec(err.message)
        if((err.code === "MODULE_NOT_FOUND" || err.message.startsWith("Module not found ")) && regexMatch) {
          const fullPath = regexMatch[1].slice(API_URL.length)
          const id = fullPath.split("/").slice(0, 2).join("/")
          const pkgName = "@" + id.slice(1).split("@")[0]
          const path = "./" + fullPath.split("/").slice(2).join("/")
          const pkg = pkgs.find(pkg => pkg.name === pkgName)!
          const name = Object.keys(pkg.exports).find(k => {
            const exportedPath =  pkg.exports[k]?.default ?? pkg.exports[k]
            if(exportedPath.endsWith(".*")) {
              return exportedPath.slice(0, -2) === path.slice(0, path.lastIndexOf("."))
            }
            else {
              return exportedPath === path
            }
          })!
          let fullId = id + name.slice(1)
          fullId = fullId.endsWith(".*")? fullId.slice(0, -2) + path.slice(path.lastIndexOf(".")): fullId
          console.warn(`Excluding faulty package ${fullId}: ${err.message}`)
          localIds = localIds.filter(lid => lid !== fullId)
          // allLinkedLocal = true
        }
        else if(err?.cause?.name === "NotFoundError" && notFoundMatch) {
          const faultyPkgID = (new URL(notFoundMatch[1])).pathname.split("/").slice(3, 5).join("/")
          localIds = localIds.filter(id => !id.startsWith(faultyPkgID))
          allLinkedLocal = true
        }
        else {
          console.error(err)
          return new Response(null, {status: 500})
        }
      }
    } while(localIds.length && !allLinkedLocal)
    // map = new ImportMap({mapUrl: "https://localhost:5173"})
    for(const [key, value] of Object.entries(localGenerator.map.imports)) {
      const name = key.split("/").slice(0, 2).join("/") 
      map.set(!name.slice(1).includes("@")? key.replace(name, name + "@" + resolutions[name]): key, value)
    }
  }
  Object.entries(assets).forEach(([id, url]) => {
    map.set(id, url)
  })
  return new Response(new Blob([JSON.stringify(map.toJSON())], {type: "application/json"}))
}

async function getBundle(ids: string[], importMap: ImportMap, options?: esbuild.BuildOptions) {
  const jsIds = ids.filter(id => id.endsWith(".js") || id.endsWith(".mjs"))
  const cssIds = ids.filter(id => id.endsWith(".css"))
  if(jsIds.length && cssIds.length) {
    return new Response(null, {status: 400, statusText: "Can't bundle .css and .js/.mjs files together, request those bundles separately"})
  }
  else if(jsIds.length) {
    const stdin = {contents: ids.map(id => `import "${id}"`).join(";")}
    const opts = {stdin, ...options}
    let result: esbuild.BuildResult
    try {
      result = await compiler.compile({target: "es2022", format: "esm", conditions: ["source"], bundle: true, ...opts}, importMap)
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
      const response = await fetchOrFS(url)
      return response.text()
    }))
    const css = cssSources.join("\n")
    return new Response(new Blob([css], {type: "text/css"}))
  }
  else {
    return new Response(null, {status: 400, statusText: "Provide IDs to bundle as query parameters"})
  }
}

type Action<T extends "importmaps" | "bundles" | "packages" | "assets" | "snippets" = "importmaps" | "bundles" | "packages" | "assets" | "snippets"> = {
  collection: T,
  method?: "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH",
  content?: any,
  ids: string[],
  args: Record<string, string>
}

function urlToAction(url: URL, method?: Action["method"], content?: any) {
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
  else if(suffix.startsWith("_snippets")) {
    collection = "snippets"
    // POST   https://api.webwriter.app/ww/v1/_snippets/
    // GET    https://api.webwriter.app/ww/v1/_snippets/<id>
    // PUT    https://api.webwriter.app/ww/v1/_snippets/<id>
    // DELETE https://api.webwriter.app/ww/v1/_snippets/<id>
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
  return {collection, method, ids, args, content}
}

function actionToUrl<T extends Action["collection"]>(action: Action<T>) {
  const url = new URL(action.collection === "assets"? "": `_${action.collection}`, API_URL)
  action.ids.forEach(id => url.searchParams.append("id", id))
  Object.keys(action.args).forEach(key => url.searchParams.append(key, action.args[key]))
  return url
}

async function respond<T extends Action["collection"]>(action: Action<T>) {
  const pkgsResponse = await getPackages(action.ids)
  let pkgs: any[]
  if(action.collection === "packages") {
    return pkgsResponse
  }
  else {
    pkgs = await pkgsResponse.json()
  }
  const versionedIds = action.collection === "snippets"? action.ids: action.ids.map((id, i) => {
    const bare = !(id.startsWith("@")? id.slice(1).split("/")[1]: id.split("/")[0]).includes("@")
    if(!bare) {
      return id
    }
    else {
      return id.replace(pkgs[i].name!, pkgs[i].name! + "@" + pkgs[i].version!)
    }
  })
  const url = actionToUrl({...action, ids: versionedIds})
  const cachedResponse = await caches.match(url)
  const idsContainLocal = versionedIds.some(v => {
    try {
      let ver = new SemVer(v.slice(1).split("/").at(1)?.split("@").at(1)!)
      return ver.prerelease.includes("local")
    }
    catch {
      return false
    }
  })
  if(cachedResponse && !idsContainLocal) {
    return cachedResponse
  }
  const cache = await caches.open("ww/v1")
  
  if(action.collection === "assets") {
    return getAsset(action.ids[0])
  }
  else if(action.collection === "importmaps") {
    const mapResponse = await getImportmap(action.args.pkg === "true"? pkgs: action.ids)
    if(!versionedIds.some(id => id.split("/")[0].split("@")[1].endsWith("-local"))) {
      cache.put(url, mapResponse.clone()) 
    }
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
    const options = {minify: action.args.minify === "true"}
    const bundleResponse = await getBundle(ids, importMap, options)
    cache.put(url, bundleResponse.clone())
    return bundleResponse
  }
  else if(action.collection === "snippets") {
    if(!action.method) {
      return getSnippet(action.ids[0])
    }
    else if(action.method === "POST" && !action.ids.length) {
      return postSnippet(action.content)
    }
    else if(action.method === "PUT" && action.ids.length === 1) {
      return putSnippet(action.ids[0], action.content)
    }
    else if(action.method === "DELETE" && action.ids.length === 1) {
      return deleteSnippet(action.ids[0])
    }
    else {
      throw Error(`Unsupported request: ${JSON.stringify(action)}`)
    }
  }
  else {
    throw Error(`Unknown collection "${action.collection}"`)
  }
}

async function getFetchResponse(url: string | URL, method?: Action["method"], request?: Request) {
  const _url = new URL(url)
  let content: any = undefined
  try {
    content = await request?.json()
  }
  catch(err: any) {}
  let action
  try {
    action = urlToAction(_url, method, content)
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
  let method = e.request.method === "GET"? undefined: e.request.method
  const shouldIntercept = url.hostname === "api.webwriter.app" && url.pathname.startsWith("/ww/v1/")
  if(shouldIntercept) {
    try {
      const response = getFetchResponse(url, method as any, e.request) as any
      e.respondWith(response)
    }
    catch(err: any) {
      console.error(err)
      e.respondWith(new Response(null, {status: 500}))
    }
  }
})

worker.addEventListener("error", function(e) {
  console.error(e.filename, e.lineno, e.colno, e.message);
});

const bundleserviceFetch = (req: RequestInfo | URL, ...args: any[]) => {
  const url = new URL(req instanceof Request? req.url: req)
  const shouldIntercept = url.hostname === "api.webwriter.app" && url.pathname.startsWith("/ww/v1/")
  if(shouldIntercept) {
    return getFetchResponse(url)
  }
  else {
    return fetch(req, ...args)
  }
}

type FetchImpl = typeof globalThis.fetch & {
  text: (url: URL | string, ...args: any[]) => Promise<string | null>,
  arrayBuffer: (url: URL | string, ...args: any[]) => Promise<ArrayBuffer | null>,
}
const fetchOrFS: FetchImpl = Object.assign(bundleserviceFetch, {
  text: (url: URL | string, ...args: any[]) => bundleserviceFetch(url, ...args).then(r => r.text()),
  arrayBuffer: (url: URL | string, ...args: any[]) => bundleserviceFetch(url, ...args).then(r => r.arrayBuffer())
})

setFetch(fetchOrFS)

async function getMergedPackageIDs(regs=["https://registry.npmjs.com/-/v1/search"], lists=["https://webwriter.app/webwriter-package-ids.json"], orgs=[]) {
  const results = await Promise.allSettled([
    ...lists.map(getListPackageIDs),
    ...orgs.map(getOrganizationPackageIDs),
    ...regs.map(getRegistryPackageIDs),
  ])
  const ids = results.filter(r => r.status === "fulfilled").flatMap(r => r.value)
  return Object.values(Object.fromEntries(ids.map(id => [id.slice(1).split("@").at(0), id])))
}

async function getRegistryPackageIDs(reg="https://registry.npmjs.com/-/v1/search") {
  const {objects} = await search("keyword:webwriter-widget", undefined, reg)
  return objects.map(obj => obj.package).map(({name, version}) => `${name}@${version}`)
}

async function getOrganizationPackageIDs(org="https://api.github.com/orgs/webwriter-app") {
  const nextPattern = /(?<=<)([\S]*)(?=>; rel="Next")/i;
  let nextURL: URL | undefined = new URL(`${org}/packages?per_page=100`)
  let objects: any[] = []
  do {
    const result: Response = await fetch(nextURL)
    if(result.ok) {
      const body = await result.json()
      const link: string | undefined = result.headers.get("link")?.match(nextPattern)![0]
      objects = objects.concat(body)
      nextURL = link? new URL(link): undefined
    }
    else {
      throw new Error(`${result.status} ${result.statusText}`)
    }
  } while(nextURL)
  return objects.filter(obj => obj.package_type === "npm" && obj.keywords?.includes("webwriter-widget")).map(({name, version}) => `${name}@${version}`)
}

async function getListPackageIDs(list="https://webwriter.app/webwriter-package-ids.json") {
  const result: Response = await fetch(list)
  if(result.ok) {
    return result.json()
  }
  else {
    throw new Error(`${result.status} ${result.statusText}`)
  }
}

/** API api.webwriter.app/bundle/
 * GET ·/[Package ID]/[Widget Path] {Accept: [TYPE]}  -> widget content/style
 * GET ·/_bundle?w=[Package ID]/[Widget Path]&w=... {Accept: [TYPE]} -> bundle
 * GET ·/[Package ID]/package.json -> package
 * GET ·/_packages?p=[Package ID]&p=... -> packages
 */

/** Search using npm's registry API (https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md). Uses the registry API since the CLI doesn't support search qualifiers such as tags. */
async function search(text: string, params?: {size?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint="https://registry.npmjs.com/-/v1/search") {
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
      throw new Error(`${result.status} ${result.statusText}`)
    }
  } while(from < total)
  return {objects, total, time}
}

/*
if(path.endsWith(".css")) {
  return null
}
else if(path.endsWith(".html")) {
  throw new Error(`Exported snippet not found at '${path}'. Check that your package.json is correct. https://webwriter.app/docs/quickstart/`)
}
else if(path.endsWith(".js")) {
  throw new Error(`Exported widget bundle not found at '${path}'. Check that your package.json is correct and that you bundled your widget, for example with '@webwriter/build'. https://webwriter.app/docs/quickstart/`)
}
*/