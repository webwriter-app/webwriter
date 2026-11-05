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
      // Blink rebuilds the computed property's name list for indexed reads.
      // Standard property names are fixed for this browser; custom properties
      // are already excluded by SnapDOM. Cache names, never computed values.
      const styleLoop = "else for(let h=0;h<t.length;h++)s(t[h]);"
      if(!code.includes(styleLoop)) throw new Error("Update the pinned SnapDOM computed-style loop patch")
      const scoped = code.replace(styleLoop, "else for(let h of snapdomStyleNames(t))s(h);")
        .replace(/\b(\w+)\.body\.(appendChild|removeChild)\(/g, "snapdomMount($1, $1.body).$2(")
        .replace(/\b(\w+)\.documentElement\.appendChild\(/g, "snapdomMount($1, $1.documentElement).appendChild(")
        .replace(/\((\w+)\.body\|\|\1\.documentElement\)\.appendChild\(/g, "snapdomMount($1, $1.body || $1.documentElement).appendChild(")
        .replaceAll('document.querySelectorAll("#snapdom-sandbox")', 'snapdomMount(document, document).querySelectorAll("#snapdom-sandbox")')
      const source = `/*! ${notice.trim()} */
const snapdomDetached = document.createDocumentFragment()
let snapdomComputedNames
function snapdomStyleNames(style) {
  if(!snapdomComputedNames) {
    snapdomComputedNames = []
    for(let index = 0, count = style.length; index < count; index++) {
      const name = style[index]
      if(!name.startsWith('--')) snapdomComputedNames.push(name)
    }
  }
  return snapdomComputedNames
}
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
