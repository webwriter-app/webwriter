import {localizedText, type LocalizedText} from "./packages"

/** JSON-compatible option value, as shown and edited by the options panel. */
export type WidgetOptionValue = string | number | boolean | null | WidgetOptionValue[] | {[key: string]: WidgetOptionValue}

export const widgetOptionTypes = [
  "boolean", "string", "number", "date", "datetime-local", "email", "password", "tel", "time", "url",
  "object", "array", "color", "select",
] as const

export type WidgetOptionType = typeof widgetOptionTypes[number]

/** One option of the selected widget, normalized from a `LitElementWw`
 * `OptionDeclaration`. */
export type WidgetOptionState = {
  name: string
  type: WidgetOptionType
  label: string
  description?: string
  placeholder?: string
  /** Reflected attribute, or null when the option is a property only. */
  attribute: string | null
  value: WidgetOptionValue
  multiline?: boolean
  min?: number
  max?: number
  step?: number
  pattern?: string
  minlength?: number
  maxlength?: number
  swatches?: string[]
  multiple?: boolean
  choices?: {value: string, label: string, description?: string}[]
}

export type WidgetActionState = {
  name: string
  label: string
  description?: string
}

/** Options and actions of the widget at the selection. */
export type WidgetOptionsState = {
  /** BODY-relative child-node path of the widget. */
  path: number[]
  localName: string
  options: WidgetOptionState[]
  actions: WidgetActionState[]
}

type UnknownRecord = Record<string, unknown>
const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === "object" && !Array.isArray(value)
const optionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined
const optionalString = (value: unknown) => typeof value === "string" ? value : undefined
const text = (value: unknown, locale: string) => {
  if(typeof value === "string") return value
  if(!isRecord(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  return localizedText(Object.fromEntries(entries) as LocalizedText, locale)
}

const titleCase = (name: string) => name
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replaceAll(/[-_]+/g, " ")
  .replace(/^\w/, letter => letter.toUpperCase())

/** Maps a declared type (a constructor or a type string) to an option type. */
export function widgetOptionType(type: unknown): WidgetOptionType {
  if(type === Boolean) return "boolean"
  if(type === Number) return "number"
  if(type === Array) return "array"
  if(type === Object) return "object"
  if(type === String || type === undefined) return "string"
  return widgetOptionTypes.includes(type as WidgetOptionType) ? type as WidgetOptionType : "string"
}

/** Lit's default attribute name for a property: its lowercased name. */
export function widgetOptionAttribute(name: string, declaration: UnknownRecord) {
  if(declaration.attribute === false) return null
  if(typeof declaration.attribute === "string") return declaration.attribute
  return name.toLowerCase()
}

/** Copies a value into plain JSON data, dropping anything that is not. */
export function widgetOptionValue(value: unknown, depth = 0): WidgetOptionValue {
  if(value === null || value === undefined || depth > 8) return null
  if(typeof value === "string" || typeof value === "boolean") return value
  if(typeof value === "number") return Number.isFinite(value) ? value : null
  if(Array.isArray(value)) return value.slice(0, 1000).map(item => widgetOptionValue(item, depth + 1))
  if(isRecord(value) && Object.getPrototypeOf(value) === Object.prototype || isRecord(value) && Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(Object.entries(value).slice(0, 1000).map(([key, item]) => [key, widgetOptionValue(item, depth + 1)]))
  }
  return null
}

/** Normalizes one untrusted option declaration for the options panel. */
export function widgetOptionState(name: string, declaration: unknown, value: unknown, locale: string): WidgetOptionState {
  const decl = isRecord(declaration) ? declaration : {}
  const type = widgetOptionType(decl.type)
  const choices = Array.isArray(decl.options)
    ? decl.options.flatMap(choice => isRecord(choice) && typeof choice.value === "string" ? [{
        value: choice.value,
        label: text(choice.label, locale) ?? choice.value,
        ...(text(choice.description, locale) ? {description: text(choice.description, locale)} : {}),
      }] : [])
    : undefined
  const state: WidgetOptionState = {
    name,
    type,
    label: text(decl.label, locale) ?? titleCase(name),
    attribute: widgetOptionAttribute(name, decl),
    value: widgetOptionValue(value),
    description: text(decl.description, locale),
    placeholder: text(decl.placeholder, locale),
    multiline: decl.multiline === true || undefined,
    min: optionalNumber(decl.min),
    max: optionalNumber(decl.max),
    step: optionalNumber(decl.step),
    pattern: optionalString(decl.pattern),
    minlength: optionalNumber(decl.minlength),
    maxlength: optionalNumber(decl.maxlength),
    swatches: Array.isArray(decl.swatches) ? decl.swatches.filter((swatch): swatch is string => typeof swatch === "string") : undefined,
    multiple: decl.multiple === true || undefined,
    choices,
  }
  return Object.fromEntries(Object.entries(state).filter(([, item]) => item !== undefined)) as WidgetOptionState
}

export function widgetActionState(name: string, declaration: unknown, locale: string): WidgetActionState {
  const decl = isRecord(declaration) ? declaration : {}
  const description = text(decl.description, locale)
  return {name, label: text(decl.label, locale) ?? titleCase(name), ...(description ? {description} : {})}
}

/** The attribute value Lit's default converters read back as `value`, or
 * null to remove the attribute. */
export function widgetOptionAttributeValue(type: WidgetOptionType, value: WidgetOptionValue, multiple = false) {
  if(type === "boolean") return value === true ? "" : null
  if(value === null || value === "") return null
  if(type === "object" || type === "array" || type === "select" && multiple) return JSON.stringify(value)
  return String(value)
}

const isOptionValue = (value: unknown, depth = 0): boolean => {
  if(value === null || ["string", "boolean"].includes(typeof value)) return true
  if(typeof value === "number") return Number.isFinite(value)
  if(depth > 8) return false
  if(Array.isArray(value)) return value.every(item => isOptionValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every(item => isOptionValue(item, depth + 1))
}

export function isWidgetOptionsState(value: unknown): value is WidgetOptionsState {
  if(!isRecord(value)) return false
  return Array.isArray(value.path) && value.path.every(index => Number.isInteger(index) && index >= 0)
    && typeof value.localName === "string"
    && Array.isArray(value.options) && value.options.every(option => isRecord(option)
      && typeof option.name === "string" && typeof option.label === "string"
      && widgetOptionTypes.includes(option.type as WidgetOptionType)
      && (option.attribute === null || typeof option.attribute === "string")
      && isOptionValue(option.value)
      && ["description", "placeholder", "pattern"].every(key => option[key] === undefined || typeof option[key] === "string")
      && ["min", "max", "step", "minlength", "maxlength"].every(key => option[key] === undefined
        || typeof option[key] === "number" && Number.isFinite(option[key]))
      && ["multiline", "multiple"].every(key => option[key] === undefined || typeof option[key] === "boolean")
      && (option.swatches === undefined || Array.isArray(option.swatches) && option.swatches.every(swatch => typeof swatch === "string"))
      && (option.choices === undefined || Array.isArray(option.choices) && option.choices.every(choice => isRecord(choice)
        && typeof choice.value === "string" && typeof choice.label === "string")))
    && Array.isArray(value.actions) && value.actions.every(action => isRecord(action)
      && typeof action.name === "string" && typeof action.label === "string"
      && (action.description === undefined || typeof action.description === "string"))
}
