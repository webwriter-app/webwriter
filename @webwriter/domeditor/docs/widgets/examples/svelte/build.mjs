import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {readFile} from "node:fs/promises"
import {build} from "esbuild-wasm"
import {compile} from "svelte/compiler"

const directory = fileURLToPath(new URL(".", import.meta.url))
const entryPoints = Object.fromEntries(["hello", "quiz"].flatMap(name => {
  const sources = name === "hello" ? ["hello.svelte", "hello.js"] : ["ww-quiz.svelte", "ww-quiz.js"]
  const source = sources.find(source => existsSync(new URL(source, import.meta.url)))
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
