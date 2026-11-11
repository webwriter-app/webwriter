import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {readFile} from "node:fs/promises"
import {build} from "esbuild-wasm"
import {compile} from "svelte/compiler"

const directory = fileURLToPath(new URL(".", import.meta.url))
const sources = new Map([
  ["hello", ["hello.svelte", "hello.js"]],
  ["quiz", ["ww-quiz.svelte", "ww-quiz.js"]],
  ["ghost-disco", ["ww-ghost-disco.svelte", "ww-ghost-disco.js"]],
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
  plugins: [{
    name: "svelte-custom-elements",
    setup(build) {
      build.onLoad({filter: /\.svelte$/}, async ({path}) => {
        const source = await readFile(path, "utf8")
        const result = compile(source, {filename: path, generate: "client", customElement: true})
        return {contents: result.js.code, loader: "js"}
      })
    },
  }],
})
