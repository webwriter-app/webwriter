import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {readFile} from "node:fs/promises"
import {build} from "esbuild-wasm"
import {compileVue} from "./compile.mjs"

const directory = fileURLToPath(new URL(".", import.meta.url))
const entryPoints = Object.fromEntries(["hello", "quiz"].flatMap(name => {
  const source = name === "hello" ? "hello.js" : "ww-quiz.js"
  return existsSync(new URL(source, import.meta.url)) ? [[`ww-${name}`, source]] : []
}))

await build({
  absWorkingDir: directory,
  entryPoints,
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  define: {"process.env.NODE_ENV": '"production"'},
  plugins: [{
    name: "vue-sfc",
    setup(build) {
      build.onLoad({filter: /\.vue$/}, async ({path}) => ({
        contents: compileVue(await readFile(path, "utf8"), path),
        loader: "js",
      }))
    },
  }],
})
