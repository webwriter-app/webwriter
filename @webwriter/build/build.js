#!/usr/bin/env node

import * as esbuild from "esbuild"
import {ts} from "@custom-elements-manifest/analyzer"
import * as fs from "fs"
import * as path from "path"
import * as process from "process"
import {confirm, localize} from "./localize.js"
import {document} from "./document.js"
import 'dotenv/config'
import esbuildPluginInlineImport from "esbuild-plugin-inline-import"
import { inlineWorkerPlugin } from "@aidenlx/esbuild-plugin-inline-worker"

const packageNameOf = specifier => specifier.split("/").slice(0, specifier.startsWith("@")? 2: 1).join("/")
const isJavaScript = file => /\.[mc]?js$/.test(file)

// The manifest of the package containing a file inside `node_modules`
const manifests = new Map()
function owningManifest(file) {
  const root = file.match(/^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1]
  if(!root) return undefined
  if(!manifests.has(root)) {
    try { manifests.set(root, JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))) }
    catch { manifests.set(root, {}) }
  }
  return manifests.get(root)
}

// Why the browser cannot load a dependency module as published on the CDN, where the import map resolves bare imports like esbuild does, but relative imports are fetched as plain URLs
function cdnProblem(file, input) {
  if(input.format === "cjs") return "is CommonJS"
  if(!/\.m?js$/.test(file)) return "is not a JavaScript module"
  const manifest = owningManifest(file)
  const declared = {...manifest?.dependencies, ...manifest?.peerDependencies, ...manifest?.optionalDependencies}
  for(const {path: target, kind, original} of input.imports) {
    if(kind.startsWith("require")) return `calls require("${original}")`
    if(original === undefined || /^[a-z][a-z0-9+.-]*:/i.test(original)) continue
    if(/^\.{0,2}\//.test(original)) {
      if(path.resolve(path.dirname(file), original) !== path.resolve(target)) return `imports "${original}", which only a bundler resolves`
    }
    else if(packageNameOf(original) !== manifest?.name && !(packageNameOf(original) in declared)) return `imports "${packageNameOf(original)}" without declaring it`
  }
}

// For each declared dependency, from the complete module graph: how many modules the browser loads for it from the CDN at startup (up to other declared dependencies, which are analysed on their own), the first module the browser cannot load as published, the declared dependencies it reaches and those it `require`s, and whether it is imported from its package root
async function analyzeDependencies(config, deps, assetExtensions) {
  const analysis = new Map(deps.map(dep => [dep, {modules: new Set(), problem: undefined, reaches: new Set(), requires: new Set(), rootImported: false, seen: new Set()}]))
  let metafile
  try { ({metafile} = await esbuild.build({...config, write: false, metafile: true, logLevel: "silent"})) }
  catch { return analysis } // The actual build reports the errors
  const {inputs} = metafile
  const dependencyOf = file => deps.find(dep => owningManifest(file)?.name === dep)
  const problems = new Map()
  const problemOf = file => {
    if(!problems.has(file)) problems.set(file, file.includes("node_modules") && inputs[file]? cdnProblem(file, inputs[file]): undefined)
    return problems.get(file)
  }
  for(const [file, input] of Object.entries(inputs)) for(const {path: target, kind, original} of input.imports) {
    const dep = original && deps.find(dep => original === dep || original.startsWith(dep + "/"))
    if(!dep || kind.startsWith("require") || dependencyOf(file) === dep || assetExtensions.includes(path.posix.extname(original.slice(dep.length)))) continue
    const entry = analysis.get(dep)
    entry.rootImported ||= original === dep
    // Everything the dependency reaches counts towards problems, modules loaded at startup towards its size
    const stack = [[target, kind !== "dynamic-import"]]
    while(stack.length) {
      const [current, atStartup] = stack.pop()
      if(entry.seen.has(current + atStartup)) continue
      entry.seen.add(current + atStartup)
      const owner = dependencyOf(current)
      if(owner && owner !== dep) { entry.reaches.add(owner); continue }
      entry.problem ??= problemOf(current) && `${current} ${problemOf(current)}`
      if(atStartup && isJavaScript(current)) entry.modules.add(current)
      for(const next of inputs[current]?.imports ?? []) {
        if(!inputs[next.path]) continue
        const nextOwner = dependencyOf(next.path)
        if(next.kind.startsWith("require") && nextOwner && nextOwner !== dep) entry.requires.add(nextOwner)
        stack.push([next.path, atStartup && next.kind !== "dynamic-import"])
      }
    }
  }
  return analysis
}

// Adds the declared dependencies that must be prebuilt along with `prebuilt`: shared ones that reach a prebuilt one would load their own copy from the CDN, and a shared one that a prebuilt dependency `require`s would be bundled a second time
function closePrebuilt(prebuilt, analysis) {
  for(let changed = true; changed;) {
    changed = false
    for(const [dep, {reaches}] of analysis) {
      const via = !prebuilt.has(dep) && [...reaches].find(other => prebuilt.has(other))
      if(via) { prebuilt.set(dep, `imports ${via}, which is prebuilt`); changed = true }
    }
    for(const dep of [...prebuilt.keys()]) for(const required of analysis.get(dep).requires) if(!prebuilt.has(required)) {
      prebuilt.set(required, `required by ${dep}, which is prebuilt`)
      changed = true
    }
  }
  return prebuilt
}

// Confirms a proposal on the command line. Without a terminal and without `--yes`, it applies to the current build only (undefined).
async function confirmProposal(question, yes) {
  if(yes) return true
  if(!process.stdin.isTTY) {
    console.log(`Applying this for this build only. Confirm interactively or pass --yes to save it in package.json.`)
    return undefined
  }
  return confirm(question)
}

function savePackageField(pkg, field, value) {
  const source = fs.readFileSync("./package.json", "utf8")
  const indent = source.match(/^[ \t]+(?=")/m)?.[0] ?? 2
  pkg[field] = value
  fs.writeFileSync("./package.json", JSON.stringify({...JSON.parse(source), [field]: value}, undefined, indent) + (source.endsWith("\n")? "\n": ""), "utf8")
}

function declaredDependencies(pkg, field) {
  const declared = pkg[field]
  if(declared !== undefined && (!Array.isArray(declared) || declared.some(dep => typeof dep !== "string"))) {
    console.error(`"${field}" in package.json must be an array of dependency names`)
    process.exit(1)
  }
  return declared
}

// Which declared dependencies are prebuilt into the package instead of shared through the import map. `prebuiltDependencies` in package.json declares them; without it (or with an explicit threshold), they are proposed from the analysis, confirmed on the command line and saved there. Sizes are judged as if root imports were cherry-picked (`estimated`), since the developer is warned to do so.
async function choosePrebuilt(pkg, analysis, estimated, {threshold, thresholdGiven, yes}) {
  const required = closePrebuilt(new Map([...analysis].filter(([, {problem}]) => problem).map(([dep, {problem}]) => [dep, problem])), analysis)
  const declared = declaredDependencies(pkg, "prebuiltDependencies")
  if(declared !== undefined && !thresholdGiven) {
    for(const dep of declared) if(!analysis.has(dep)) console.warn(`Ignoring "${dep}" in "prebuiltDependencies": it is not in "dependencies" or "peerDependencies"`)
    const prebuilt = closePrebuilt(new Map(declared.filter(dep => analysis.has(dep)).map(dep => [dep, "declared"])), analysis)
    for(const [dep, reason] of [...required, ...prebuilt]) if(!declared.includes(dep)) {
      console.warn(`Prebuilding ${dep}, which is missing from "prebuiltDependencies": ${reason}`)
      prebuilt.set(dep, reason)
    }
    return prebuilt
  }
  const proposal = closePrebuilt(new Map([...required, ...[...analysis]
    .filter(([dep]) => !required.has(dep) && estimated.get(dep).modules.size >= threshold)
    .map(([dep, {modules, rootImported}]) => [dep, `loads ${estimated.get(dep).modules.size} modules from the CDN (threshold ${threshold})${rootImported? "; it is imported from its package root, so importing only the parts used may load fewer": ""}`])]), analysis)
  if(!proposal.size) return proposal
  const width = Math.max(...[...proposal.keys()].map(dep => dep.length))
  console.log(`\nThese dependencies can be prebuilt into this package instead of being shared with other packages through the import map:`)
  for(const [dep, reason] of proposal) console.log(`  ${dep.padEnd(width)}  ${required.has(dep)? "required, ": ""}${reason}`)
  const accepted = await confirmProposal(`Prebuild them and save them as "prebuiltDependencies" in package.json?`, yes)
  if(accepted === undefined) return proposal
  if(!accepted && required.size) console.log(`Saving only the dependencies that must be prebuilt.`)
  const prebuilt = accepted? proposal: required
  savePackageField(pkg, "prebuiltDependencies", [...prebuilt.keys()].sort())
  return prebuilt
}

// Where each name exported from a dependency's package root is defined, as a package subpath the browser can import: from the Custom Elements Manifest of web-component libraries (e.g. SlButton in @shoelace-style/shoelace/dist/components/button/button.js), and from the root module's `export {…} from` re-exports (e.g. debounce in lodash-es/debounce.js)
const cherryPickMaps = new Map()
async function cherryPickMap(dep, resolveDir, build) {
  // Lookups bypass `sharedDependenciesPlugin`, which would report the package as external
  const resolve = specifier => build.resolve(specifier, {kind: "import-statement", resolveDir, pluginData: {webwriterLookup: true}})
  const root = await resolve(dep)
  if(root.errors.length || root.external || !path.isAbsolute(root.path)) return undefined
  if(cherryPickMaps.has(root.path)) return cherryPickMaps.get(root.path)
  const packageDir = root.path.match(/^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1]
  const candidates = new Map()
  const customElements = packageDir && owningManifest(root.path)?.customElements
  if(typeof customElements === "string") {
    try {
      const manifestPath = path.join(packageDir, customElements)
      for(const module of JSON.parse(fs.readFileSync(manifestPath, "utf8")).modules ?? []) for(const exported of module.exports ?? []) {
        const name = exported.kind === "js" && exported.declaration?.name
        const file = [path.join(path.dirname(manifestPath), module.path), path.join(packageDir, module.path)].find(file => fs.existsSync(file))
        if(name && file && !candidates.has(name)) candidates.set(name, {file, name: exported.name})
      }
    }
    catch { /* Without a readable manifest, only re-exports are mapped. */ }
  }
  const source = ts.createSourceFile(root.path, fs.readFileSync(root.path, "utf8"), ts.ScriptTarget.Latest, true)
  for(const statement of source.statements) {
    if(!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith(".")
      || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue
    for(const specifier of statement.exportClause.elements) {
      const exported = specifier.name.text, imported = (specifier.propertyName ?? specifier.name).text
      if(!specifier.isTypeOnly && ts.isIdentifier(specifier.name) && (!specifier.propertyName || ts.isIdentifier(specifier.propertyName))
        && exported !== "default" && !candidates.has(exported)) {
        candidates.set(exported, {file: path.resolve(path.dirname(root.path), statement.moduleSpecifier.text), name: imported})
      }
    }
  }
  const map = new Map()
  if(packageDir) for(const [name, {file, name: imported}] of candidates) {
    const specifier = `${dep}/${path.relative(packageDir, file).split(path.sep).join("/")}`
    const resolved = await resolve(specifier)
    if(!resolved.errors.length && path.resolve(resolved.path) === path.resolve(file)) map.set(name, {specifier, name: imported})
  }
  cherryPickMaps.set(root.path, map)
  return map
}

// Plugin that records the package's own named imports from dependency roots in `report`: per dependency, the module defining each imported name (see `cherryPickMap`) and where the imports are. Imports of the dependencies in `treeShaken` are rewritten to those modules, which tree-shakes shared dependencies: the browser only loads what is imported. Built outputs do so for dependencies declaring `"sideEffects": false`; the other dependencies are only rewritten to estimate what changing their imports would save.
const rootImportsPlugin = (deps, report, treeShaken) => ({
  name: "esbuild-plugin-webwriter-root-imports",
  setup(build) {
    const loaders = {".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx"}
    build.onLoad({filter: /\.[mc]?[jt]sx?$/}, async args => {
      if(args.namespace !== "file" || /node_modules|\.d\.[mc]?ts$/.test(args.path)) return
      const source = await fs.promises.readFile(args.path, "utf8")
      if(!deps.some(dep => source.includes(dep))) return
      let contents = "", last = 0
      const parsed = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true)
      for(const statement of parsed.statements) {
        const importing = ts.isImportDeclaration(statement), exporting = ts.isExportDeclaration(statement)
        if(!importing && !exporting || statement.attributes || statement.assertClause) continue
        const bindings = importing ? statement.importClause?.namedBindings : statement.exportClause
        if(importing && (statement.importClause?.isTypeOnly || statement.importClause?.name)
          || exporting && statement.isTypeOnly || !bindings || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
          || bindings.elements.some(part => !ts.isIdentifier(part.name) || part.propertyName && !ts.isIdentifier(part.propertyName))
          || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const dep = statement.moduleSpecifier.text, keyword = importing ? "import" : "export"
        if(!deps.includes(dep)) continue
        const map = await cherryPickMap(dep, path.dirname(args.path), build)
        const parts = bindings.elements.filter(part => !part.isTypeOnly).map(part => {
          const imported = (part.propertyName ?? part.name).text, local = part.name.text
          return {imported, local, target: map?.get(imported)}
        })
        const entry = report.get(dep) ?? report.set(dep, {names: new Map(), locations: new Set()}).get(dep)
        for(const part of parts) entry.names.set(part.imported, part.target)
        entry.locations.add(`${path.relative(".", args.path).split(path.sep).join("/")}:${source.slice(0, statement.getStart(parsed)).split("\n").length}`)
        if(!treeShaken.has(dep) || !parts.some(part => part.target)) continue
        const rest = parts.filter(part => !part.target)
        contents += source.slice(last, statement.getStart(parsed)) + [
          ...parts.filter(part => part.target).map(({target, local}) => `${keyword} {${target.name} as ${local}} from ${JSON.stringify(target.specifier)};`),
          ...(rest.length? [`${keyword} {${rest.map(({imported, local}) => imported === local? imported: `${imported} as ${local}`).join(", ")}} from ${JSON.stringify(dep)};`]: []),
        ].join(" ")
        last = statement.end
      }
      if(last) return {contents: contents + source.slice(last), loader: loaders[path.extname(args.path)]}
    })
  }
})

// Reports tree-shaken root imports and warns about the other named imports from dependency roots when importing each name from the module defining it would at least halve the modules loaded, with the imports to use instead
function warnCherryPickable(report, analysis, estimated, treeShaken) {
  for(const [dep, {names, locations}] of report) {
    const before = analysis.get(dep).modules.size, after = estimated.get(dep).modules.size
    const separate = [...names].filter(([, target]) => target), rest = [...names].filter(([, target]) => !target).map(([name]) => name)
    if(treeShaken.has(dep)) {
      if(separate.length) console.log(`Tree-shaking imports from the root of ${dep}, which declares "sideEffects": false: ${separate.length} names from their own modules${rest.length? `, ${rest.join(", ")} from the root`: ""}.`)
      continue
    }
    if(!separate.length || after > before / 2) continue
    console.warn([
      `\n${dep} is imported from its package root, which loads ${before} modules from the CDN. Importing each name from the module defining it would load ${after}${rest.length? ` (the root is still needed for ${rest.join(", ")})`: ""}:`,
      ...separate.map(([name, {specifier, name: exported}]) => `  import ${exported === "default"? name: exported === name? `{${name}}`: `{${exported} as ${name}}`} from "${specifier}"`),
      `Imported from the root in ${[...locations].slice(0, 5).join(", ")}${locations.size > 5? ` and ${locations.size - 5} more`: ""}.`,
      `Unlike its root, these modules do not load the rest of the package, e.g. registrations of components that are not imported. ${dep} does not declare "sideEffects": false, so the build does not change the imports itself.`,
    ].join("\n"))
  }
}

// Whether a dependency may have side effects on import, i.e. does not declare `"sideEffects": false`
function hasSideEffects(dep) {
  for(let dir = path.resolve("."); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "node_modules", dep, "package.json")
    if(fs.existsSync(file)) {
      try { return JSON.parse(fs.readFileSync(file, "utf8")).sideEffects !== false }
      catch { return true }
    }
    if(path.dirname(dir) === dir) return true
  }
}

// Plugin to leave JavaScript imports of shared dependencies to the browser's import map, bundling everything else (internal code, prebuilt and undeclared packages, dependency assets such as CSS, `require` calls)
const sharedDependenciesPlugin = (shared, assetExtensions) => ({
  name: "esbuild-plugin-webwriter-shared-dependencies",
  setup(build) {
    build.onResolve({filter: /^[^./]/}, args => {
      const dep = packageNameOf(args.path)
      if(args.pluginData?.webwriterLookup) return
      if(shared.includes(dep) && !args.kind.startsWith("require") && !assetExtensions.includes(path.posix.extname(args.path.slice(dep.length)))) return {external: true}
    })
  }
})

// Chunks shared by the package's entries go next to them, e.g. to `dist/chunks` for `dist/widgets/...` and `dist/tests/...`
function chunkNames(entryPoints) {
  const dirs = entryPoints.map(({out}) => path.resolve(path.dirname(out)))
  let common = dirs[0] ?? path.resolve("dist")
  for(const dir of dirs) while(!(dir + path.sep).startsWith(common + path.sep)) common = path.dirname(common)
  if(["widgets", "tests"].includes(path.basename(common))) common = path.dirname(common)
  return path.relative(".", path.join(common, "chunks", "[name]-[hash]")).split(path.sep).join("/")
}

const wasmPlugin = {
  name: 'wasm',
  setup(build) {
    build.onResolve({ filter: /\.wasm$/ }, args => {
      if (args.namespace === 'wasm-stub') {
        return {
          path: args.path,
          namespace: 'wasm-binary',
        }
      }
      if (args.resolveDir === '') {
        return
      }
      return {
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: 'wasm-stub',
      }
    })
    build.onLoad({ filter: /.*/, namespace: 'wasm-stub' }, async (args) => ({
      contents: `import wasm from ${JSON.stringify(args.path)}
        export default (imports) =>
          WebAssembly.instantiate(wasm, imports).then(
            result => result.instance.exports)`,
    }))
    build.onLoad({ filter: /.*/, namespace: 'wasm-binary' }, async (args) => ({
      contents: await fs.promises.readFile(args.path),
      loader: 'binary',
    }))
  },
}



async function main() {
  const isDev = process.argv[2] === "dev"
  const isPreview = process.argv[2] === "preview"
  const isLocalize = process.argv[2] === "localize"
  const isDocument = process.argv[2] === "document"
  const force = process.argv.slice(2).includes("-y") || process.argv.slice(2).includes("--yes")
  if(isLocalize) {
    try {
      console.log("\nLocalizing...")
      await localize(force)
      return
    }
    catch(err) {
      console.error(err?.message ?? String(err))
      return
    }
  }
  else if(isDocument) {
    try {
      console.log("\nDocumenting...")
      await document()
      return
    }
    catch(err) {
      console.error(err?.message ?? String(err))
      return
    }
  }

  // Tell NPM that the `dist` folder can be published
  if(!fs.existsSync("./.npmignore")) {
    fs.writeFileSync("./.npmignore", "!dist", "utf8")
  }


  // Build with WebWriter's default options for building. Builds every `package.exports` entry of the form `"./widgets/my-widget.*": {"source": "./src/my-widget.ts", "default": "./dist/my-widget.*"} -> this should build `my-widget.js` and `my-widget.css` from the specified source into the dist directory.
  const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"))
  const buildableKeys = Object.keys(pkg?.exports ?? {}).filter(k => k.startsWith("./widgets/"))
  const testKeys = Object.keys(pkg?.exports ?? {}).filter(k => k.startsWith("./tests/"))

  const baseConfig = {
    write: true,
    bundle: true,
    plugins: [
      esbuildPluginInlineImport(),
      // wasmPlugin()
    ],
    entryPoints: buildableKeys.map(k => ({out: pkg.exports[k].default.replace(".*", "").replace(".js", ""), in: pkg.exports[k].source})),
    outdir: ".",
    target: "es2022",
    format: "esm",
    logLevel: "info",
    loader: {
      ".json": "json",
      ".jsonld": "json",
      ".htm": "text",
      ".html": "text",
      ".xml": "text",
      ".csv": "text",
      ".apng": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".jfif": "dataurl",
      ".pjpeg": "dataurl",
      ".pjp": "dataurl",
      ".png": "dataurl",
      ".svg": "dataurl",
      ".tif": "dataurl",
      ".tiff": "dataurl",
      ".wav": "dataurl",
      ".wave": "dataurl",
      ".mp3": "dataurl",
      ".aac": "dataurl",
      ".aacp": "dataurl",
      ".oga": "dataurl",
      ".flac": "dataurl",
      ".weba": "dataurl",
      ".mp4": "dataurl",
      ".webm": "dataurl",
      ".avif": "dataurl",
      ".gif": "dataurl",
      ".mov": "dataurl",
      ".avi": "dataurl",
      ".ogv": "dataurl",
      ".mkv": "dataurl",
      ".opus": "dataurl",
      ".mpeg": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
      ".ttf": "dataurl",
      ".otf": "dataurl",
      ".pdf": "dataurl",
      ".wasm": "dataurl"
    }
  }

  // Widgets load their dependencies through the editor's import map. Shared dependencies stay imports and are loaded from the CDN as published; prebuilt ones are bundled into this package, with code used by several of its widgets split into chunks once. Workers and the standalone preview have no import map, so they stay fully bundled.
  const args = process.argv.slice(2)
  const thresholdArg = args.find(arg => arg === "--prebuild-threshold" || arg.startsWith("--prebuild-threshold="))
  const thresholdValue = thresholdArg?.includes("=")? thresholdArg.slice(thresholdArg.indexOf("=") + 1): thresholdArg && args[args.indexOf(thresholdArg) + 1]
  const threshold = thresholdArg? Number(thresholdValue): 200
  if(!(threshold >= 0)) {
    console.error(`--prebuild-threshold expects a number of modules, got "${thresholdValue}"`)
    process.exit(1)
  }
  let packageConfig = {}
  if(!isPreview) {
    const deps = Object.keys({...pkg?.dependencies, ...pkg?.peerDependencies})
    const assetExtensions = [".css", ...Object.keys(baseConfig.loader)]
    const entryPoints = [...testKeys, ...buildableKeys].map(k => ({out: pkg.exports[k].default.replace(".*", "").replace(".js", ""), in: pkg.exports[k].source}))
    const report = new Map()
    const treeShaken = new Set(deps.filter(dep => !hasSideEffects(dep)))
    const analyze = rewritten => analyzeDependencies({...baseConfig, entryPoints, plugins: [...baseConfig.plugins, rootImportsPlugin(deps, report, rewritten), inlineWorkerPlugin({buildOptions: () => baseConfig})]}, deps, assetExtensions)
    const analysis = await analyze(treeShaken)
    const estimated = [...report].some(([dep, {names}]) => !treeShaken.has(dep) && [...names.values()].some(Boolean))? await analyze(new Set(deps)): analysis
    warnCherryPickable(report, analysis, estimated, treeShaken)
    const prebuilt = await choosePrebuilt(pkg, analysis, estimated, {threshold, thresholdGiven: !!thresholdArg, yes: force})
    packageConfig = {splitting: true, chunkNames: chunkNames(entryPoints), plugins: [rootImportsPlugin(deps, new Map(), treeShaken), sharedDependenciesPlugin(deps.filter(dep => !prebuilt.has(dep)), assetExtensions)]}
  }
  const config = {...baseConfig, ...packageConfig, plugins: [
    ...baseConfig.plugins,
    ...(packageConfig.plugins ?? []),
    inlineWorkerPlugin({watch: isDev, buildOptions: () => baseConfig})
  ]}

  if(isDev) {
    const devConfig = {
      ...config,
      sourcemap: "inline",
      entryPoints: [...testKeys, ...buildableKeys].map(k => ({out: pkg.exports[k].default.replace(".*", "").replace(".js", ""), in: pkg.exports[k].source})),
    }
    let ctx = await esbuild.context(devConfig)
    await ctx.watch()
  }
  else if(isPreview) {
    const rawKey = process.argv[3]
    const key = `./widgets/${rawKey}.*`
    const path = pkg.exports[key].default.replace(".*", "")
    const contents = `
      <base href="/">
      <script src="https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry"></script>
      <script defer src="${path + ".js"}" type="module"></script>
      <link rel="stylesheet" href="${path + ".css"}" type="text/css">
      <${rawKey}></${rawKey}>
    `
    fs.writeFileSync("./dist/index.html", contents, "utf8")
    let ctx = await esbuild.context(config)
    await ctx.serve({servedir: "."})
  }
  else {
    await esbuild.build(config)
  }

} main()