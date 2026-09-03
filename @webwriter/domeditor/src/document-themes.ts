import baseSource from "../../core/model/schemas/resource/themes/base.css?raw"
import holidaySource from "../../core/model/schemas/resource/themes/holiday.css?raw"
import picoSource from "../../core/model/schemas/resource/themes/pico.css?raw"
import sakuraSource from "../../core/model/schemas/resource/themes/sakura.css?raw"
import simpleSource from "../../core/model/schemas/resource/themes/simple.css?raw"
import waterSource from "../../core/model/schemas/resource/themes/water.css?raw"

export const documentThemes = [
  {value: "base", label: "Base", source: baseSource},
  {value: "water", label: "Water", source: waterSource},
  {value: "simple", label: "Simple", source: simpleSource},
  {value: "sakura", label: "Sakura", source: sakuraSource},
  {value: "pico", label: "Pico", source: picoSource},
  {value: "holiday", label: "Holiday", source: holidaySource},
] as const

export type DocumentThemeName = typeof documentThemes[number]["value"]
export type DocumentTheme = typeof documentThemes[number]

export const defaultDocumentTheme = documentThemes[0]

export const documentTheme = (value: string) => documentThemes.find(theme => theme.value === value)

/** Keeps trusted theme presentation below authored and editor CSS. Older
 * bundled themes predate cascade layers, while the default already owns its
 * layer so it can be embedded directly in authored documents. */
export const editingDocumentThemeSource = (theme: DocumentTheme) =>
  theme.value === defaultDocumentTheme.value
    ? theme.source
    : `@layer webwriter-theme {\n${theme.source.replace(/^@charset\s+[^;]+;\s*/i, "")}\n}`
