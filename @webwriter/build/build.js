#!/usr/bin/env node

import * as esbuild from "esbuild"
import * as fs from "fs"

const scriptExtensions = [".js", ".mjs", ".cjs"]

// Plugin to only resolve internal dependencies and non-ES-Module files
const widgetPlugin = pkg => ({
  name: "esbuild-plugin-webwriter-widget",
  setup(build) {
    const deps = Object.keys(pkg?.dependencies ?? {})
    build.onResolve({filter: /.*$/}, args => {
      const isDependency = deps.some(dep => args.path.startsWith(dep))
      const isScript = scriptExtensions.some(ext => args.path.endsWith(ext))
      const isBare = !args.path.split("/").at(-1)?.includes(".")
      return {external: isDependency && (isScript || isBare)}
    })
  }
}) 

// Tell NPM that the `dist` folder can be published
if(!fs.existsSync("./.npmignore")) {
  fs.writeFileSync("./.npmignore", "!dist", "utf8")
}


// Build with WebWriter's default options for building. Builds every `package.exports` entry of the form `"./my-widget.*": {"source": "./src/my-widget.ts", "default": "./dist/my-widget.*"} -> this should build `my-widget.js` and `my-widget.css` from the specified source into the dist directory.
const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"))
const widgetKeys = Object.keys(pkg?.exports ?? {}).filter(k => k.startsWith("./widgets/"))
await esbuild.build({
  write: true,
  bundle: true,
  plugins: [widgetPlugin(pkg)],
  entryPoints: widgetKeys.map(k => ({out: pkg.exports[k].default.replace(".*", ""), in: pkg.exports[k].source})),
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
  }
})