import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {build} from "esbuild-wasm"

const directory = fileURLToPath(new URL(".", import.meta.url))
const entryPoints = Object.fromEntries(["hello", "quiz"].flatMap(name => {
  const sources = name === "hello" ? ["hello.jsx", "hello.js"] : ["ww-quiz.jsx", "ww-quiz.js"]
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
