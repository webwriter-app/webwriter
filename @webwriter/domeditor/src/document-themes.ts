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

export const documentTheme = (value: string) => documentThemes.find(theme => theme.value === value)
