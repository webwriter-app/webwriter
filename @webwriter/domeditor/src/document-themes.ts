import themeSources, {disclosureCSS, documentTypographyCSS, sharedCSS} from "virtual:document-theme-sources"
import {toHexString} from "lib0/buffer"
import {digest} from "lib0/hash/sha256"
import type {WidgetSchemaDefinition} from "./schema"
import {legacyDocumentThemeFingerprints} from "./legacy-document-theme-fingerprints"

export type DocumentThemeName = keyof typeof legacyDocumentThemeFingerprints

const sharedThemeCSS = sharedCSS + documentTypographyCSS
export const documentThemes = (Object.keys(themeSources) as DocumentThemeName[]).map(value => {
  const {source, disclosure} = themeSources[value]
  return {
    value,
    label: value[0].toUpperCase() + value.slice(1),
    source: source + (disclosure ? disclosureCSS : "") + sharedThemeCSS,
  }
})

export type DocumentTheme = typeof documentThemes[number]

export const defaultDocumentTheme = documentThemes[0]

export const documentTheme = (value: string) => documentThemes.find(theme => theme.value === value)

const themeEncoder = new TextEncoder()
const legacyTablePictureRule = `/* Pictures in cells need the same sizing box in editing and reading mode. */
  :where(td, th) picture {
    display: block;
    width: 100%;
    height: auto;
  }`
const tablePictureRule = legacyTablePictureRule.replace("display: block", "display: inline-block")

/** Upgrade bundled CSS in a detached editing, preview or export document. */
export function upgradeBundledDocumentThemes(root: Pick<Document, "head">) {
  for(const style of root.head?.querySelectorAll("style[data-ww-theme]") ?? []) {
    const theme = documentTheme(style.getAttribute("data-ww-theme") ?? "")
    const source = style.textContent
    if(!theme || !source || source === theme.source) continue
    const fingerprint = toHexString(digest(themeEncoder.encode(source.replace(/\r\n?/g, "\n"))).subarray(0, 16))
    if(fingerprint === themeSources[theme.value].originalFingerprint
      || legacyDocumentThemeFingerprints[theme.value].includes(fingerprint)) style.textContent = theme.source
    // The table picture migration replaces only the generated rule, keeping
    // any other CSS in the stylesheet.
    else if(source.includes(legacyTablePictureRule)) style.textContent = source.replace(legacyTablePictureRule, tablePictureRule)
  }
}

/** The same default theme is used in the editor, example documents, and exports. */
export function ensureDefaultDocumentTheme(root: Document) {
  if([...root.head.querySelectorAll("style[data-ww-theme]")].some(style => documentTheme(style.getAttribute("data-ww-theme") ?? ""))) return
  const style = root.createElement("style")
  style.setAttribute("data-ww-theme", defaultDocumentTheme.value)
  style.setAttribute("blocking", "render")
  style.textContent = defaultDocumentTheme.source
  root.head.append(style)
}

/** All bundled themes share a low-priority layer in editing and exports. */
export const editingDocumentThemeSource = (theme: DocumentTheme) => theme.source.replaceAll(".◆hotspot-popup", ":state(ww-hotspot-popup)")

/** Default sizing and inherited text colors for installed widgets. Tag names
 * come from the widget schema so arbitrary custom elements remain supported. */
export function documentWidgetStyleSource(widgets: Iterable<Pick<WidgetSchemaDefinition, "tagName" | "editingConfig">>) {
  const definitions = [...new Map([...widgets].filter(widget => widget.tagName.includes("-"))
    .map(widget => [widget.tagName.toLowerCase(), widget])).values()]
  const tags = definitions.map(widget => widget.tagName.toLowerCase()).sort()
  if(!tags.length) return ""
  const escape = (tag: string) => globalThis.CSS?.escape
    ? globalThis.CSS.escape(tag)
    : Array.from(tag, (character, index) => /[a-zA-Z0-9_-]/.test(character) && !(index === 0 && /[0-9-]/.test(character))
      ? character : `\\${character.codePointAt(0)!.toString(16)} `).join("")
  const selector = tags.map(escape).join(", ")
  const blockTags = definitions.filter(widget => widget.editingConfig?.inline !== true).map(widget => escape(widget.tagName.toLowerCase()))
  const inlineTags = definitions.filter(widget => widget.editingConfig?.inline === true).map(widget => escape(widget.tagName.toLowerCase()))
  const layoutSelector = `body:not([class~="ww-canvas"]):not([class~="ww-slides"]):not([class~="ww-board"])`
  // Theme paragraph colors must not override a widget's slotted text color
  // (for example, white text inside a dark hint popup). Authored styles still win.
  return `@layer webwriter-theme {\n:is(${selector}) p {\n  color: inherit;\n}\n}\n${layoutSelector} :is(${selector}) {\n  box-sizing: border-box;\n  max-inline-size: min(100%, var(--ww-widget-max, var(--ww-prose-max, 45rem)));\n}${blockTags.length ? `\n${layoutSelector} :is(${blockTags.join(", ")}):not([hidden]) {\n  display: block;\n}` : ""}${inlineTags.length ? `\n${layoutSelector} :is(${inlineTags.join(", ")}):not([hidden]) {\n  display: inline-block;\n}` : ""}`
}
