import {createHash} from "node:crypto"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {transform} from "esbuild"

export const documentThemeSourcesId = "virtual:document-theme-sources"
const originalId = `${documentThemeSourcesId}-original`
const themeNames = ["base", "water", "simple", "sakura", "pico", "holiday"]
const themeDirectory = new URL("../../core/model/schemas/resource/themes/", import.meta.url)
const floatsFile = new URL("../src/document-floats.css", import.meta.url)
const typographyFile = new URL("../src/document-theme-options.css", import.meta.url)

const layeredSource = source => `@layer webwriter-theme {\n${source.replace(/^@charset\s+[^;]+;\s*/i, "")}\n}`
// Base and Pico share a trailing chevron. Keep it beside the first line
// and reserve its space without changing the summary's inline text flow.
const disclosureLayout = `@layer webwriter-theme {
  details > summary {
    position: relative;
    min-block-size: 1lh;
    padding-inline-end: calc(var(--ww-summary-chevron-inline-inset, 0px) + 1rem + var(--pico-spacing, var(--spacing, 1rem)) * 0.5);
    overflow-wrap: anywhere;
  }
  details > summary[role="button"] {
    --ww-summary-chevron-inline-inset: var(--pico-form-element-spacing-horizontal, var(--form-element-spacing-horizontal));
    --ww-summary-chevron-block-inset: var(--pico-form-element-spacing-vertical, var(--form-element-spacing-vertical));
  }
  details > summary::after {
    position: absolute;
    inset-inline-end: var(--ww-summary-chevron-inline-inset, 0px);
    inset-block-start: var(--ww-summary-chevron-block-inset, 0px);
    margin-inline-start: 0;
  }
}`
// Keep authored marker positions effective even when a theme uses list-style on li.
const listMarkerInheritance = `@layer webwriter-theme {
  :is(ul, ol, menu) > li { list-style-position: inherit; }
}`

async function minifyCSS(source) {
  // Keep the UTF-8 hotspot class available for replacement in editing mode.
  const {code} = await transform(source, {loader: "css", minify: true, charset: "utf8", legalComments: "inline"})
  return code.trimEnd()
}

export async function loadDocumentThemeSources(addWatchFile, minify = true) {
  const read = url => {
    addWatchFile(fileURLToPath(url))
    return readFile(url, "utf8")
  }
  const [floats, typography] = await Promise.all([read(floatsFile), read(typographyFile)])
  const originalTypographyCSS = typography.trimEnd()
  const shared = `${floats}\n${listMarkerInheritance}`
  const [styles, sharedCSS, disclosureCSS, documentTypographyCSS] = await Promise.all([
    Promise.all(themeNames.map(async name => {
      const css = await read(new URL(`${name}.css`, themeDirectory))
      const core = name === "base" ? css : layeredSource(css)
      const disclosure = name === "base" || name === "pico"
      const original = [core, ...(disclosure ? [disclosureLayout] : []), shared, originalTypographyCSS].join("\n")
      const originalFingerprint = createHash("sha256").update(original.replace(/\r\n?/g, "\n")).digest("hex").slice(0, 32)
      return [name, {source: minify ? await minifyCSS(core) : original, disclosure, originalFingerprint}]
    })),
    minify ? minifyCSS(shared) : "",
    minify ? minifyCSS(disclosureLayout) : "",
    minify ? minifyCSS(originalTypographyCSS) : originalTypographyCSS,
  ])
  return `export default ${JSON.stringify(Object.fromEntries(styles))}
export const sharedCSS = ${JSON.stringify(sharedCSS)}
export const disclosureCSS = ${JSON.stringify(disclosureCSS)}
export const documentTypographyCSS = ${JSON.stringify(documentTypographyCSS)}
export const originalTypographyCSS = ${JSON.stringify(originalTypographyCSS)}`
}

export function documentThemesPlugin() {
  return {
    name: "document-theme-sources",
    resolveId(id) { if(id === documentThemeSourcesId || id === originalId) return `\0${id}` },
    load(id) {
      if(id === `\0${documentThemeSourcesId}` || id === `\0${originalId}`) {
        return loadDocumentThemeSources(file => this.addWatchFile(file), id !== `\0${originalId}`)
      }
    },
  }
}
