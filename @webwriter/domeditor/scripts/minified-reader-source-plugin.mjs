import {resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {build} from "esbuild"

const id = "virtual:reader-runtime-sources"
const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const entries = {
  figure: {contents: 'import {createFigureLayout} from "./src/figure-layout.js"; createFigureLayout(document)'},
  print: {contents: 'import {createLayoutPrint} from "./src/document-layout-print.js"; createLayoutPrint(document)'},
  document: {globalName: "documentReader", contents: `
    import {mountDocumentReader} from "./src/document-viewer.js"
    import {createAnchorPositioner} from "./src/anchor-positioning.js"
    export const mount = (licenses, icon, formatReferences, translations) =>
      mountDocumentReader(licenses, icon, formatReferences, translations, createAnchorPositioner)
  `},
  attribution: {globalName: "attributionReader", contents: `
    import {mountAttributionReader} from "./src/attribution.js"
    import {createAnchorPositioner} from "./src/anchor-positioning.js"
    export const mount = licenses => mountAttributionReader(licenses, createAnchorPositioner)
  `},
  canvas: {globalName: "canvasReader", contents: 'export {mountCanvasReader as mount} from "./src/canvas-viewer.js"'},
  imageMap: {file: "./src/image-map-reader-runtime.ts"},
  scopedRegistry: {file: "./src/scoped-custom-element-registry.js"},
}

/** Embed self-contained scripts in exported HTML without resolving imports there. */
export function minifiedReaderSourcePlugin() {
  return {
    name: "reader-runtime-sources",
    resolveId(source) { if(source === id) return `\0${id}` },
    async load(source) {
      if(source !== `\0${id}`) return
      const scripts = await Promise.all(Object.entries(entries).map(async ([name, {file, contents, globalName}]) => {
        const entry = file ? {entryPoints: [file]} : {stdin: {contents, resolveDir: projectRoot, sourcefile: `${name}-reader.js`}}
        const result = await build({...entry, absWorkingDir: projectRoot, bundle: true, write: false, metafile: true,
          platform: "browser", format: "iife", globalName, minify: true, charset: "utf8", legalComments: "inline"})
        for(const input of Object.keys(result.metafile.inputs)) {
          if(input !== entry.stdin?.sourcefile) this.addWatchFile(resolve(projectRoot, input))
        }
        return [name, result.outputFiles[0].text]
      }))
      return `export default ${JSON.stringify(Object.fromEntries(scripts))}`
    },
  }
}
