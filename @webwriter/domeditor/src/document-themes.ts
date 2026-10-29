import baseSource from "../../core/model/schemas/resource/themes/base.css?raw"
import holidaySource from "../../core/model/schemas/resource/themes/holiday.css?raw"
import picoSource from "../../core/model/schemas/resource/themes/pico.css?raw"
import sakuraSource from "../../core/model/schemas/resource/themes/sakura.css?raw"
import simpleSource from "../../core/model/schemas/resource/themes/simple.css?raw"
import waterSource from "../../core/model/schemas/resource/themes/water.css?raw"
import floatSource from "./document-floats.css?raw"
import type {WidgetSchemaDefinition} from "./schema"

const layeredSource = (source: string) => `@layer webwriter-theme {\n${source.replace(/^@charset\s+[^;]+;\s*/i, "")}\n}`

export const documentThemes = [
  {value: "base", label: "Base", source: baseSource + "\n" + floatSource},
  {value: "water", label: "Water", source: layeredSource(waterSource) + "\n" + floatSource},
  {value: "simple", label: "Simple", source: layeredSource(simpleSource) + "\n" + floatSource},
  {value: "sakura", label: "Sakura", source: layeredSource(sakuraSource) + "\n" + floatSource},
  {value: "pico", label: "Pico", source: layeredSource(picoSource) + "\n" + floatSource},
  {value: "holiday", label: "Holiday", source: layeredSource(holidaySource) + "\n" + floatSource},
] as const

export type DocumentThemeName = typeof documentThemes[number]["value"]
export type DocumentTheme = typeof documentThemes[number]

export const defaultDocumentTheme = documentThemes[0]

export const documentTheme = (value: string) => documentThemes.find(theme => theme.value === value)

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
export const editingDocumentThemeSource = (theme: DocumentTheme) => theme.source

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
