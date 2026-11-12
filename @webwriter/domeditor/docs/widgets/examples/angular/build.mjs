import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {build} from "esbuild-wasm"

const directory = fileURLToPath(new URL(".", import.meta.url))
const sources = new Map([
  ["hello", ["hello.ts"]],
  ["quiz", ["ww-quiz.ts"]],
  ["ghost-disco", ["ww-ghost-disco.ts", "ww-ghost-disco.js"]],
])
const target = process.argv[2]
const names = target ? [target] : ["hello", "quiz"]
const entryPoints = Object.fromEntries(names.flatMap(name => {
  const candidates = sources.get(name)
  if(!candidates) throw new Error(`Unknown widget target: ${name}`)
  const source = candidates.find(source => existsSync(new URL(source, import.meta.url)))
  if(!source && target) throw new Error(`Missing source for widget target: ${name}`)
  return source ? [[`ww-${name}`, source]] : []
}))

await build({
  absWorkingDir: directory,
  entryPoints,
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  tsconfigRaw: {compilerOptions: {experimentalDecorators: true, useDefineForClassFields: false}},
})
