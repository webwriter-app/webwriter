export type FilterType = "blur" | "brightness" | "contrast" | "drop-shadow" | "grayscale" | "hue-rotate" | "invert" | "opacity" | "saturate" | "sepia"
type FilterParameter = {label: string, unit: string, value: number, min?: number, max?: number}
export type FilterDefinition = {type: FilterType, label: string, parameters: readonly FilterParameter[]}
export type FilterPreset = {type: FilterType, values: number[], color: string}

const amount = (value: number, max?: number): FilterParameter => ({label: "Amount", unit: "%", value, min: 0, max})
export const filterTypes: readonly FilterDefinition[] = [
  {type: "blur", label: "Blur", parameters: [{label: "Radius", unit: "px", value: 2, min: 0}]},
  {type: "brightness", label: "Brightness", parameters: [amount(100)]},
  {type: "contrast", label: "Contrast", parameters: [amount(100)]},
  {type: "drop-shadow", label: "Drop shadow", parameters: [
    {label: "Horizontal offset", unit: "px", value: 2},
    {label: "Vertical offset", unit: "px", value: 2},
    {label: "Blur radius", unit: "px", value: 4, min: 0},
  ]},
  {type: "grayscale", label: "Grayscale", parameters: [amount(100, 100)]},
  {type: "hue-rotate", label: "Hue rotation", parameters: [{label: "Angle", unit: "deg", value: 90}]},
  {type: "invert", label: "Invert", parameters: [amount(100, 100)]},
  {type: "opacity", label: "Opacity", parameters: [amount(100, 100)]},
  {type: "saturate", label: "Saturation", parameters: [amount(200)]},
  {type: "sepia", label: "Sepia", parameters: [amount(100, 100)]},
]

export const newFilterPreset = (type: FilterType = "blur"): FilterPreset => ({
  type, values: filterTypes.find(filter => filter.type === type)!.parameters.map(parameter => parameter.value), color: "#000000",
})

export function filterPresetValue(preset: FilterPreset): string | null {
  const definition = filterTypes.find(filter => filter.type === preset?.type)
  if(!definition || !Array.isArray(preset.values) || preset.values.length !== definition.parameters.length
    || !preset.values.every((value, index) => typeof value === "number" && Number.isFinite(value)
      && (definition.parameters[index].min === undefined || value >= definition.parameters[index].min!)
      && (definition.parameters[index].max === undefined || value <= definition.parameters[index].max!))) return null
  const values = preset.values.map((value, index) => `${definition.parameters[index].unit === "%" ? value / 100 : value}${definition.parameters[index].unit === "%" ? "" : definition.parameters[index].unit}`)
  if(preset.type === "drop-shadow") {
    if(typeof preset.color !== "string" || !/^#[\da-f]{6}$/i.test(preset.color)) return null
    values.push(preset.color)
  }
  return `${preset.type}(${values.join(" ")})`
}

export function filterPresetLabel(preset: FilterPreset): string {
  const definition = filterTypes.find(filter => filter.type === preset.type)!
  const parameters = preset.values.map((value, index) => `${value}${definition.parameters[index].unit}`)
  if(preset.type === "drop-shadow") parameters.push(preset.color)
  return `${definition.label} (${parameters.join(", ")})`
}

export const filterPresetsStorageKey = "webwriter.filter-presets.v1"
export const filterPresetsChangeEvent = "filter-presets-change"

export function loadFilterPresets(): FilterPreset[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(filterPresetsStorageKey) ?? "[]")
    if(!Array.isArray(stored)) return []
    const seen = new Set<string>()
    return stored.filter((preset): preset is FilterPreset => {
      const value = filterPresetValue(preset)
      if(!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
  }
  catch { return [] }
}

export function saveFilterPreset(preset: FilterPreset): void {
  const value = filterPresetValue(preset)
  if(!value) throw new Error("Choose valid filter settings.")
  const presets = loadFilterPresets()
  if(!presets.some(saved => filterPresetValue(saved) === value)) presets.push(preset)
  localStorage.setItem(filterPresetsStorageKey, JSON.stringify(presets))
  window.dispatchEvent(new Event(filterPresetsChangeEvent))
}
