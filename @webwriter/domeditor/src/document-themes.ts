import baseSource from "../../core/model/schemas/resource/themes/base.css?raw"
import holidaySource from "../../core/model/schemas/resource/themes/holiday.css?raw"
import picoSource from "../../core/model/schemas/resource/themes/pico.css?raw"
import sakuraSource from "../../core/model/schemas/resource/themes/sakura.css?raw"
import simpleSource from "../../core/model/schemas/resource/themes/simple.css?raw"
import waterSource from "../../core/model/schemas/resource/themes/water.css?raw"
import floatSource from "./document-floats.css?raw"

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

/** All bundled themes share a low-priority layer in editing and exports. */
export const editingDocumentThemeSource = (theme: DocumentTheme) => theme.source
