import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {build} from "esbuild-wasm"

const directory = fileURLToPath(new URL(".", import.meta.url))
const target = process.argv[2]
const names = target ? [target] : ["hello", "quiz"]
const entryPoints = Object.fromEntries(names.flatMap(name => {
  const sources = name === "hello" ? ["hello.jsx", "hello.js"] : [`ww-${name}.jsx`, `ww-${name}.js`]
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
  jsx: "automatic",
  define: {"process.env.NODE_ENV": '"production"'},
})
