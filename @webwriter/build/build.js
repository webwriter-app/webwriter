#!/usr/bin/env node

import * as esbuild from "esbuild"
import * as fs from "fs"
import * as path from "path"
import * as process from "process"
import {localize} from "./localize.js"
import {document} from "./document.js"
import 'dotenv/config'
import esbuildPluginInlineImport from "esbuild-plugin-inline-import"
import { inlineWorkerPlugin } from "@aidenlx/esbuild-plugin-inline-worker"

const scriptExtensions = [".js", ".mjs", ".cjs"]

// Plugin to only resolve internal dependencies and non-ES-Module files
// Disabled for now - CJS cross-compatibility issues
const widgetPlugin = pkg => ({
  name: "esbuild-plugin-webwriter-widget",
  setup(build) {
    const deps = Object.keys(pkg?.dependencies ?? {})
    build.onResolve({filter: /.*$/}, args => {
      const isDependency = deps.some(dep => args.path.startsWith(dep))
      const isScript = scriptExtensions.some(ext => args.path.endsWith(ext))
      const isBare = !args.path.split("/").at(-1)?.includes(".")
      const isLocal = !args.path.split("/").at(-1)?.includes(".")
      return {external: isDependency && (isScript || isBare)}
    })
  }
})

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
      // widgetPlugin(pkg)
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

  const config = {...baseConfig, plugins: [
    ...baseConfig.plugins,
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