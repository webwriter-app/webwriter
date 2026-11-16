// Builds the package: every .ts gets its .js beside it, and every module an
// export names gets its .d.ts, with the declarations those import.
//
// index.js stays one bundle of index.ts. Every other module is written as it
// is, one ES module per source file with its relative imports unchanged, so
// that a bundler or a browser loads only the modules a widget imports and a
// catalog of module text only when it is asked for.
import {build} from "esbuild"
import {spawnSync} from "node:child_process"
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs"
import {createRequire} from "node:module"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const skipped = new Set(["node_modules", "scripts", "tests"])
const walk = dir => readdirSync(join(root, dir), {withFileTypes: true}).flatMap(entry => {
  const path = dir ? `${dir}/${entry.name}` : entry.name
  if(entry.isDirectory()) return skipped.has(path) ? [] : walk(path)
  return [path]
})
const run = (...args) => {
  const {status} = spawnSync(process.execPath, args, {cwd: root, stdio: "inherit"})
  if(status !== 0) process.exit(status ?? 1)
}

/**
 * Writes the declaration files. The compiler declares every module of the
 * program, the catalogs too, and nothing reaches those but a dynamic import.
 * So it writes to a scratch folder, and only the declarations that the
 * `types` target of an export reaches by its imports are copied beside their
 * sources. A declaration from an earlier build that nothing reaches is removed.
 */
function declarations() {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const tsc = join(dirname(createRequire(join(root, "package.json")).resolve("typescript/package.json")), "bin/tsc")
  const scratch = mkdtempSync(join(tmpdir(), "webwriter-widget-declarations-"))
  try {
    run(tsc, "-p", "tsconfig.json", "--declaration", "--emitDeclarationOnly", "--noEmit", "false", "--rootDir", ".", "--outDir", scratch)
    const wanted = new Set()
    const visit = file => {
      if(wanted.has(file)) return
      wanted.add(file)
      // Comments are documentation: a doc comment may show an import.
      const text = readFileSync(join(scratch, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      for(const [, specifier] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\s+)["'](\.[^"']*)["']/g)) {
        const target = join(dirname(file), specifier).replace(/\.js$/, "")
        visit(existsSync(join(scratch, `${target}.d.ts`)) ? `${target}.d.ts` : `${target}/index.d.ts`)
      }
    }
    for(const target of Object.values(manifest.exports)) visit(target.types.replace(/^\.\//, ""))
    for(const file of files) if(file.endsWith(".d.ts") && !wanted.has(file)) rmSync(join(root, file))
    for(const file of wanted) {
      mkdirSync(dirname(join(root, file)), {recursive: true})
      copyFileSync(join(scratch, file), join(root, file))
    }
    return wanted.size
  }
  finally {rmSync(scratch, {recursive: true, force: true})}
}

run("scripts/messages.mjs", "tables")

const files = walk("")
// options.ts holds types only and is part of index.js.
const sources = files.filter(file => file.endsWith(".ts") && !file.endsWith(".d.ts") && file !== "index.ts" && file !== "options.ts")
// A built file whose source is gone, such as a catalog that was removed.
for(const file of files) if(file.endsWith(".js") && !existsSync(join(root, file.replace(/\.js$/, ".ts")))) rmSync(join(root, file))

// utf8: a catalog in another script stays as written, not as \u escapes of twice the size.
const shared = {absWorkingDir: root, target: "es2022", format: "esm", charset: "utf8", logLevel: "warning"}
await build({...shared, entryPoints: ["index.ts"], bundle: true, outfile: "index.js"})
await build({...shared, entryPoints: sources, outdir: ".", outbase: "."})
console.log(`built index.js and ${sources.length} modules`)
console.log(`wrote ${declarations()} declaration files`)

run("scripts/messages.mjs", "check")
