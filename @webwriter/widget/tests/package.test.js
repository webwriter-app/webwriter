// The package as a consumer's bundler sees it: what each subpath export pulls in.
import {test} from "node:test"
import assert from "node:assert/strict"
import {build} from "esbuild"
import {existsSync, readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const subpaths = Object.keys(manifest.exports).filter(subpath => subpath !== ".").map(subpath => subpath.slice(2))
/** The modules a widget chooses between. The others are what they are built on. */
const features = ["drag", "viewport", "help", "scene", "settings", "shortcuts", "playback", "data", "localize", "exercise"]
const featureOf = file => features.find(name => file === `${name}.js` || file.startsWith(`${name}/`) || file.startsWith(`messages/${name}/`))
const isCatalog = file => /^messages\/[a-z]+\/(?!index\.js$|catalogs\.js$)[^/]+\.js$/.test(file)

/** Everything the module of a subpath reaches, as a bundler follows it: files, external packages and how each catalog is imported. */
async function graph(subpath) {
  const {metafile} = await build({
    absWorkingDir: root, entryPoints: [manifest.exports[`./${subpath}`].default], bundle: true, write: false, metafile: true,
    format: "esm", outdir: "out", external: ["pixi.js"], logLevel: "silent",
  })
  const files = Object.keys(metafile.inputs)
  const imports = Object.values(metafile.inputs).flatMap(input => input.imports)
  return {files, external: [...new Set(imports.filter(each => each.external).map(each => each.path))], imports}
}

test("every export has its source, its declarations and its built module", () => {
  assert.deepEqual(manifest.exports["."], {source: "./index.ts", types: "./index.d.ts", default: "./index.js"})
  for(const [subpath, target] of Object.entries(manifest.exports)) {
    // The order is the order of precedence: `source` for development tools, then `types`, then `default`.
    assert.deepEqual(Object.keys(target), ["source", "types", "default"], subpath)
    assert.equal(target.types, target.source.replace(/\.ts$/, ".d.ts"), subpath)
    assert.equal(target.default, target.source.replace(/\.ts$/, ".js"), subpath)
    for(const file of Object.values(target)) assert.ok(existsSync(join(root, file)), `${subpath}: ${file} is missing, run the build`)
  }
  assert.equal(manifest.sideEffects, false)
})

test("the declarations reach only declarations that are there, and no catalog", () => {
  const seen = new Set()
  const visit = file => {
    if(seen.has(file)) return
    seen.add(file)
    assert.ok(existsSync(join(root, file)), `${file} is missing, run the build`)
    const code = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    for(const [, specifier] of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']*)["']/g)) {
      const target = join(dirname(file), specifier).replace(/\.js$/, "")
      visit(existsSync(join(root, `${target}.d.ts`)) ? `${target}.d.ts` : `${target}/index.d.ts`)
    }
  }
  for(const target of Object.values(manifest.exports)) visit(target.types.slice(2))
  assert.ok(seen.size > 0)
  assert.equal([...seen].some(file => /^messages\/[a-z]+\/(?!index\.d\.ts$)[^/]+\.d\.ts$/.test(file)), false, "a catalog is declared")
})

test("a module does not pull in another module, and only scene/pixi imports pixi.js", async () => {
  for(const subpath of subpaths) {
    const {files, external} = await graph(subpath)
    const own = subpath.split("/")[0]
    const foreign = files.filter(file => featureOf(file) && featureOf(file) !== own)
    assert.deepEqual(foreign, [], `${subpath} reaches ${foreign.join(", ")}`)
    assert.deepEqual(external, subpath === "scene/pixi" ? ["pixi.js"] : [], subpath)
    assert.equal(files.some(file => file.includes("node_modules")), false, `${subpath} bundles a dependency`)
  }
})

test("a catalog is reached only by a dynamic import of its own file", async () => {
  let catalogs = 0
  for(const subpath of subpaths) {
    const {imports} = await graph(subpath)
    for(const {path, kind} of imports.filter(each => isCatalog(each.path))) {
      assert.equal(kind, "dynamic-import", `${subpath} imports ${path} statically`)
      catalogs++
    }
  }
  assert.ok(catalogs > 0)
})

test("the built modules name every relative import with its file, so that they load without a bundler", () => {
  const seen = new Set()
  const visit = file => {
    if(seen.has(file)) return
    seen.add(file)
    const code = readFileSync(join(root, file), "utf8")
    for(const [, specifier] of code.matchAll(/^\s*(?:import|export)\b[^"'`]*?\bfrom\s*["']([^"']+)["']/gm)) follow(file, specifier)
    for(const [, specifier] of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) follow(file, specifier)
  }
  const follow = (file, specifier) => {
    if(!specifier.startsWith(".")) return
    const target = join(dirname(file), specifier)
    assert.ok(specifier.endsWith(".js") && existsSync(join(root, target)), `${file} imports "${specifier}"`)
    visit(target)
  }
  for(const target of Object.values(manifest.exports)) visit(target.default.slice(2))
  assert.ok(seen.has("messages/drag/de.js"))
})
