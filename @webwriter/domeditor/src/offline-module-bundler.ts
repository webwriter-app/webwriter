import type {IImportMap} from "@jspm/import-map"
import {fetchNpmFile} from "./npm-files"

let esbuildReady: Promise<void> | null = null

const globPattern = (glob: string) => new RegExp("^" + glob
  .replace(/^\.\//, "")
  .replace(/^(?![^/]*\/)/, "**/") // A pattern without a slash matches the file name at any depth
  .replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*\*\/|\*\*|\*|\?/g, token => ({"**/": "(?:.*/)?", "**": ".*", "*": "[^/]*", "?": "[^/]"})[token]!) + "$")

/** Whether a module may have side effects according to its package's `sideEffects` field: `false` for none,
 * or patterns (relative to the package) of the files that do. Undefined when the package does not declare it. */
export function packageFileSideEffects(sideEffects: unknown, subpath: string) {
  if(sideEffects === false) return false
  if(Array.isArray(sideEffects)) return sideEffects.some(pattern => typeof pattern === "string" && globPattern(pattern).test(subpath))
  return undefined
}

const packageManifests = new Map<string, Promise<{sideEffects?: unknown} | undefined>>()

/** The `sideEffects` of a module in a published package, found from the `<name>@<version>/` segment of its URL
 * (as on jsDelivr), so that esbuild can drop the unused modules of packages that declare none. */
async function moduleSideEffects(url: string) {
  const [, root, subpath] = new URL(url).href.match(/^(.*?\/(?:@[^/@]+\/)?[^/@]+@[^/]+\/)([^?#]*)/) ?? []
  if(!root) return undefined
  let manifest = packageManifests.get(root)
  if(!manifest) {
    manifest = fetchNpmFile(`${root}package.json`).then(response => response.ok ? response.json() : undefined).catch(() => undefined)
    packageManifests.set(root, manifest)
  }
  return packageFileSideEffects((await manifest)?.sideEffects, subpath)
}

/** Resolve the generated map's exact and prefix entries in the importing
 * module's scope. The JSPM map utility cannot load in an about:srcdoc realm. */
export function resolveOfflineModule(specifier: string, importer: string, map: IImportMap, baseUrl: string) {
  const isURL = /^(?:[a-z][a-z\d+.-]*:|\/|\.\.?\/)/i.test(specifier)
  const name = isURL ? new URL(specifier, importer).href : specifier
  const find = (mappings: Record<string, string>) => {
    const normalized = Object.entries(mappings).map(([key, address]) => [
      /^(?:[a-z][a-z\d+.-]*:|\/|\.\.?\/)/i.test(key) ? new URL(key, baseUrl).href : key,
      address,
    ] as const)
    const exact = normalized.find(([key]) => key === name)
    if(exact) return new URL(exact[1], baseUrl).href
    const prefix = normalized.filter(([key]) => key.endsWith("/") && name.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length)[0]
    return prefix ? new URL(prefix[1] + name.slice(prefix[0].length), baseUrl).href : undefined
  }
  const scopes = Object.entries(map.scopes ?? {}).map(([scope, mappings]) => [new URL(scope, baseUrl).href, mappings] as const)
    .filter(([scope]) => importer.startsWith(scope)).sort((a, b) => b[0].length - a[0].length)
  for(const [, mappings] of scopes) {
    const address = find(mappings)
    if(address) return address
  }
  const address = find(map.imports ?? {})
  if(address) return address
  if(isURL) return name
  throw new Error(`Offline export cannot resolve module '${specifier}' imported from ${importer}`)
}

/** Loaded only for an offline export containing an ESM dependency graph. Modules of packages declaring
 * `"sideEffects": false` are left out when none of their exports are used, as bundlers do. */
export async function bundleOfflineModules(entries: string[], map: IImportMap, baseUrl: string) {
  // srcdoc documents can report about:srcdoc as their base URL. The entry
  // module still provides an absolute HTTP base for the portable import map.
  const resolutionBase = /^https?:$/.test(new URL(baseUrl).protocol) ? baseUrl : entries[0]
  const [esbuild, wasm] = await Promise.all([
    import("esbuild-wasm"),
    import("esbuild-wasm/esbuild.wasm?url"),
  ])
  esbuildReady ??= esbuild.initialize({wasmURL: new URL(wasm.default, resolutionBase).href, worker: true}).catch(error => {
    esbuildReady = null
    throw error
  })
  await esbuildReady
  const result = await esbuild.build({
    stdin: {
      contents: entries.map(url => `import ${JSON.stringify(url)};`).join("\n"),
      sourcefile: "webwriter-offline-entry.js",
      resolveDir: "/",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outdir: "/webwriter-offline",
    plugins: [{
      name: "resolved-http-modules",
      setup(build) {
        build.onResolve({filter: /.*/}, async args => {
          const parent = /^https?:/.test(args.importer) ? args.importer : resolutionBase
          const url = resolveOfflineModule(args.path, parent, map, resolutionBase)
          if(!/^https?:$/.test(new URL(url).protocol)) throw new Error(`Offline export cannot bundle module URL: ${url}`)
          // Widget entries always run: loading them registers their elements.
          return {path: url, namespace: "webwriter-http", sideEffects: entries.includes(url) ? undefined : await moduleSideEffects(url)}
        })
        build.onLoad({filter: /.*/, namespace: "webwriter-http"}, async args => {
          const response = await fetch(args.path)
          if(!response.ok) throw new Error(`Could not fetch ${args.path}: ${response.status} ${response.statusText}`)
          const path = new URL(response.url || args.path).pathname.toLowerCase()
          const loader = path.endsWith(".css") ? "css"
            : path.endsWith(".json") ? "json"
              : /\.(?:png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf|ico)$/.test(path) ? "dataurl"
                : "js"
          return {contents: new Uint8Array(await response.arrayBuffer()), loader}
        })
      },
    }],
  })
  const js = result.outputFiles.find(file => file.path.endsWith(".js"))?.text
  if(!js) throw new Error("Offline export produced no JavaScript module")
  return {js, css: result.outputFiles.find(file => file.path.endsWith(".css"))?.text}
}
