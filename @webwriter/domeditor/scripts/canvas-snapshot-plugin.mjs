import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {transform} from "esbuild"

const moduleId = "virtual:canvas-snapdom"
const sourceId = "virtual:canvas-snapdom-source"

/** SnapDOM normally mounts its measurement nodes in the document being
 * captured. Keep those nodes in the canvas appendix, outside the authored DOM.
 * The package is pinned because these insertion points are in its built code. */
export function canvasSnapshotPlugin() {
  const entry = fileURLToPath(import.meta.resolve("@zumer/snapdom"))
  const license = fileURLToPath(new URL("../LICENSE", import.meta.resolve("@zumer/snapdom")))
  return {
    name: "canvas-snapshot",
    resolveId(id) { if(id === moduleId || id === sourceId) return `\0${id}` },
    async load(id) {
      if(id !== `\0${moduleId}` && id !== `\0${sourceId}`) return
      this.addWatchFile(entry)
      this.addWatchFile(license)
      const [code, notice] = await Promise.all([readFile(entry, "utf8"), readFile(license, "utf8")])
      const scoped = code
        .replace(/\b(\w+)\.body\.(appendChild|removeChild)\(/g, "snapdomMount($1, $1.body).$2(")
        .replace(/\b(\w+)\.documentElement\.appendChild\(/g, "snapdomMount($1, $1.documentElement).appendChild(")
        .replace(/\((\w+)\.body\|\|\1\.documentElement\)\.appendChild\(/g, "snapdomMount($1, $1.body || $1.documentElement).appendChild(")
        .replaceAll('document.querySelectorAll("#snapdom-sandbox")', 'snapdomMount(document, document).querySelectorAll("#snapdom-sandbox")')
      const source = `/*! ${notice.trim()} */
const snapdomDetached = document.createDocumentFragment()
function snapdomMount(doc, fallback) {
  if(doc !== document) return fallback
  return doc.body?.shadowRoot?.querySelector('[part="canvas-minimap-measurements"]') ?? snapdomDetached
}
${scoped}`
      if(id === `\0${moduleId}`) return source
      const {code: inline} = await transform(source, {format: "iife", globalName: "canvasSnapdom", minify: true, legalComments: "inline"})
      return `export default ${JSON.stringify(`function loadCanvasSnapdom() { ${inline}\nreturn canvasSnapdom.snapdom }\n`)}`
    },
  }
}
