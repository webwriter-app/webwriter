import {build} from "esbuild"
import {spawnSync} from "node:child_process"
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs"
import {createRequire} from "node:module"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const bindings = Object.entries(manifest.exports)
  .filter(([subpath, target]) => subpath !== "." && typeof target === "object")
  .map(([, target]) => target.source.replace(/^\.\//, ""))

function declarations() {
  const tsc = join(dirname(createRequire(join(root, "package.json")).resolve("typescript/package.json")), "bin/tsc")
  const scratch = mkdtempSync(join(tmpdir(), "webwriter-graphic-declarations-"))
  try {
    const {status} = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--declaration", "--emitDeclarationOnly", "--rootDir", ".", "--outDir", scratch], {cwd: root, stdio: "inherit"})
    if(status !== 0) process.exit(status ?? 1)
    const wanted = new Set()
    const visit = file => {
      if(wanted.has(file)) return
      wanted.add(file)
      const text = readFileSync(join(scratch, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      for(const [, specifier] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']*)["']/g)) {
        const target = join(dirname(file), specifier).replace(/\.js$/, "")
        visit(existsSync(join(scratch, `${target}.d.ts`)) ? `${target}.d.ts` : `${target}/index.d.ts`)
      }
    }
    for(const target of Object.values(manifest.exports)) visit(target.types.replace(/^\.\//, ""))
    for(const file of readdirSync(root)) if(file.endsWith(".d.ts") && !wanted.has(file)) rmSync(join(root, file))
    for(const file of wanted) {
      mkdirSync(dirname(join(root, file)), {recursive: true})
      copyFileSync(join(scratch, file), join(root, file))
    }
    return wanted.size
  }
  finally {rmSync(scratch, {recursive: true, force: true})}
}

const shared = {absWorkingDir: root, target: "es2022", format: "esm", logLevel: "warning"}
await build({...shared, entryPoints: ["index.ts"], bundle: true, outfile: "index.js"})
await build({...shared, entryPoints: bindings, outdir: ".", outbase: "."})
console.log(`built index.js and ${bindings.length} modules`)
console.log(`wrote ${declarations()} declaration files`)
