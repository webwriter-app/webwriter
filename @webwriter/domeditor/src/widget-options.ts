import {validateGroupingRules, type WidgetGroupingRules} from "./widget-grouping.js"
import {localizedText, type LocalizedText} from "./packages"

/** JSON-compatible option value, as shown and edited by the options panel. */
export type WidgetOptionValue = string | number | boolean | null | WidgetOptionValue[] | {[key: string]: WidgetOptionValue}

export const widgetOptionTypes = [
  "boolean", "string", "number", "date", "datetime-local", "email", "password", "tel", "time", "url",
  "object", "array", "color", "select", "reference",
] as const

export type WidgetOptionType = typeof widgetOptionTypes[number]
export const widgetOptionControls = ["input", "range", "duration", "checkbox", "switch", "select", "radio", "segmented", "tree"] as const
export type WidgetOptionControl = typeof widgetOptionControls[number]

/** Hierarchy is presentation; only leaf values are stored. */
export type WidgetOptionTreeNode = {
  label: string
  description?: string
  value?: string
  children?: WidgetOptionTreeNode[]
}

export type WidgetFileInput = {type: "file", accept?: string, multiple?: boolean}

/** Durations use numeric seconds, independent of the displayed time fields. */
export function formatWidgetDuration(value: number): string {
  if(!Number.isFinite(value) || value < 0) return ""
  const [whole, fraction = ""] = value.toFixed(9).split(".")
  const seconds = Number(whole)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const suffix = fraction.replace(/0+$/, "")
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(seconds % 60).padStart(2, "0")}${suffix ? `.${suffix}` : ""}`
}

export function parseWidgetDuration(text: string): number | undefined {
  const parts = text.trim().split(":")
  if(parts.length > 3 || !parts.every((part, index) => (index === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) return undefined
  const numbers = parts.map(Number)
  if(numbers.slice(1).some(value => value >= 60)) return undefined
  const value = numbers.reduce((total, part) => total * 60 + part, 0)
  return Number.isFinite(value) ? value : undefined
}

type Availability = {
  hidden?: boolean
  disabled?: boolean
  readOnly?: boolean
  disabledReason?: string
}

export type WidgetOptionGroupState = {
  name: string
  label: string
  description?: string
  collapsible?: boolean
  collapsed?: boolean
  advanced?: boolean
}

declare global {
  interface DocumentEventMap { optionschange: Event }
}

/** One option of the selected widget, normalized from a `LitElementWw`
 * `OptionDeclaration`. */
export type WidgetOptionState = Availability & {
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
  group?: string
  control?: WidgetOptionControl
  unit?: string
  steps?: number[]
  choices?: {value: string, label: string, description?: string}[]
  tree?: WidgetOptionTreeNode[]
  selector?: string
  excludeSelf?: boolean
  referenceMissing?: boolean
}

export type WidgetActionState = Omit<Availability, "readOnly"> & {
  name: string
  label: string
  description?: string
  group?: string
  icon?: string
  intent?: "default" | "danger"
  confirm?: string
  input?: WidgetFileInput
  busy?: boolean
  error?: string
}

/** Options and actions of the widget at the selection. */
export type WidgetOptionsState = {
  /** BODY-relative child-node path of the widget. */
  path: number[]
  localName: string
  options: WidgetOptionState[]
  actions: WidgetActionState[]
  groups?: WidgetOptionGroupState[]
  data?: {type: "application/json" | "application/xml", value: string}
  sharing?: {widgetId: string, mode: "individual" | "all" | "group", grouping: WidgetGroupingRules | null, error?: string}
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

const availability = (decl: UnknownRecord, locale: string) => ({
  ...(decl.hidden === true ? {hidden: true} : {}),
  ...(decl.disabled === true ? {disabled: true} : {}),
  ...(text(decl.disabledReason, locale) ? {disabledReason: text(decl.disabledReason, locale)} : {}),
})

export function widgetOptionGroupState(name: string, declaration: unknown, locale: string): WidgetOptionGroupState {
  const decl = isRecord(declaration) ? declaration : {}
  return {name, label: text(decl.label, locale) ?? titleCase(name),
    ...(text(decl.description, locale) ? {description: text(decl.description, locale)} : {}),
    ...(decl.collapsible === true ? {collapsible: true} : {}),
    ...(decl.collapsed === true ? {collapsed: true} : {}),
    ...(decl.advanced === true ? {advanced: true} : {}),
  }
}

const compatibleControl = (type: WidgetOptionType, control: unknown, multiple: unknown): control is WidgetOptionControl =>
  type === "boolean" ? control === "checkbox" || control === "switch"
  : type === "number" ? control === "input" || control === "range" || control === "duration"
  : type === "select" ? control === "select" || multiple === true && control === "tree" || !multiple && (control === "radio" || control === "segmented") : false

function optionTree(entries: unknown[], locale: string) {
  const values = new Set<string>()
  let remaining = 1000
  const visit = (entries: unknown[], depth = 0): WidgetOptionTreeNode[] => depth > 8 ? [] : entries.slice(0, Math.max(0, remaining)).flatMap((entry): WidgetOptionTreeNode[] => {
    if(remaining-- <= 0 || !isRecord(entry)) return []
    const label = text(entry.label, locale) ?? optionalString(entry.value) ?? "Group"
    const description = text(entry.description, locale)
    const common = {label, ...(description ? {description} : {})}
    if(Array.isArray(entry.children)) {
      const children = visit(entry.children, depth + 1)
      return children.length ? [{...common, children}] : []
    }
    if(typeof entry.value !== "string" || values.has(entry.value)) return []
    values.add(entry.value)
    return [{...common, value: entry.value}]
  })
  return visit(entries)
}

export function widgetTreeLeaves(nodes: WidgetOptionTreeNode[]): {value: string, label: string, description?: string}[] {
  return nodes.flatMap(node => node.children ? widgetTreeLeaves(node.children)
    : typeof node.value === "string" ? [{value: node.value, label: node.label, ...(node.description ? {description: node.description} : {})}] : [])
}

/** Normalizes one untrusted option declaration for the options panel. */
export function widgetOptionState(name: string, declaration: unknown, value: unknown, locale: string): WidgetOptionState {
  const decl = isRecord(declaration) ? declaration : {}
  const type = widgetOptionType(decl.type)
  const tree = type === "select" && decl.multiple === true && decl.control === "tree"
    ? optionTree(Array.isArray(decl.options) ? decl.options : [], locale) : undefined
  const choices = tree ? widgetTreeLeaves(tree) : Array.isArray(decl.options)
    ? decl.options.flatMap(choice => isRecord(choice) && typeof choice.value === "string" ? [{
        value: choice.value,
        label: text(choice.label, locale) ?? choice.value,
        ...(text(choice.description, locale) ? {description: text(choice.description, locale)} : {}),
      }] : [])
    : undefined
  const state: WidgetOptionState = {
    ...availability(decl, locale),
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
    tree,
    selector: type === "reference" ? optionalString(decl.selector) : undefined,
    excludeSelf: type === "reference" && typeof decl.excludeSelf === "boolean" ? decl.excludeSelf : undefined,
    group: optionalString(decl.group),
    control: compatibleControl(type, decl.control, decl.multiple) ? decl.control : undefined,
    unit: optionalString(decl.unit),
    steps: type === "number" && Array.isArray(decl.steps)
      ? [...new Set(decl.steps.filter((step): step is number => optionalNumber(step) !== undefined))].sort((a, b) => a - b) : undefined,
    readOnly: decl.readOnly === true || undefined,
  }
  return Object.fromEntries(Object.entries(state).filter(([, item]) => item !== undefined)) as WidgetOptionState
}

export function widgetActionState(name: string, declaration: unknown, locale: string): WidgetActionState {
  const decl = isRecord(declaration) ? declaration : {}
  const description = text(decl.description, locale)
  return {name, label: text(decl.label, locale) ?? titleCase(name), ...(description ? {description} : {}),
    ...availability(decl, locale),
    ...(typeof decl.group === "string" ? {group: decl.group} : {}),
    ...(typeof decl.icon === "string" ? {icon: decl.icon} : {}),
    ...(decl.intent === "default" || decl.intent === "danger" ? {intent: decl.intent} : {}),
    ...(text(decl.confirm, locale) ? {confirm: text(decl.confirm, locale)} : {}),
    ...(isRecord(decl.input) && decl.input.type === "file" ? {input: {
      type: "file" as const,
      ...(typeof decl.input.accept === "string" ? {accept: decl.input.accept} : {}),
      ...(decl.input.multiple === true ? {multiple: true} : {}),
    }} : {}),
  }
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

function isOptionTree(value: unknown, depth = 0, budget = {remaining: 1000}): boolean {
  return depth <= 8 && Array.isArray(value) && value.every(node => {
    if(--budget.remaining < 0 || !isRecord(node) || typeof node.label !== "string"
      || node.description !== undefined && typeof node.description !== "string") return false
    return node.children !== undefined ? node.value === undefined && isOptionTree(node.children, depth + 1, budget)
      : typeof node.value === "string"
  })
}

export function isWidgetOptionsState(value: unknown): value is WidgetOptionsState {
  if(!isRecord(value)) return false
  if(value.data !== undefined && (!isRecord(value.data)
    || !["application/json", "application/xml"].includes(value.data.type as string)
    || typeof value.data.value !== "string")) return false
  if(value.sharing !== undefined) {
    const sharing = value.sharing
    if(!isRecord(sharing) || typeof sharing.widgetId !== "string"
      || !["individual", "all", "group"].includes(sharing.mode as string)
      || sharing.error !== undefined && typeof sharing.error !== "string") return false
    try { if(sharing.grouping !== null) validateGroupingRules(sharing.grouping) }
    catch { return false }
  }
  const strings = (record: UnknownRecord, keys: string[]) => keys.every(key => record[key] === undefined || typeof record[key] === "string")
  const booleans = (record: UnknownRecord, keys: string[]) => keys.every(key => record[key] === undefined || typeof record[key] === "boolean")
  const available = (record: UnknownRecord) => strings(record, ["group", "disabledReason"]) && booleans(record, ["hidden", "disabled"])
  return (value.groups === undefined || Array.isArray(value.groups) && value.groups.every(group => isRecord(group)
      && typeof group.name === "string" && typeof group.label === "string" && strings(group, ["description"])
      && booleans(group, ["collapsible", "collapsed", "advanced"])))
    && Array.isArray(value.path) && value.path.every(index => Number.isInteger(index) && index >= 0)
    && typeof value.localName === "string"
    && Array.isArray(value.options) && value.options.every(option => isRecord(option)
      && typeof option.name === "string" && typeof option.label === "string"
      && widgetOptionTypes.includes(option.type as WidgetOptionType)
      && (option.attribute === null || typeof option.attribute === "string")
      && isOptionValue(option.value)
      && available(option) && booleans(option, ["readOnly", "excludeSelf", "referenceMissing"]) && strings(option, ["unit", "selector"])
      && (option.tree === undefined || option.type === "select" && option.multiple === true && option.control === "tree" && isOptionTree(option.tree))
      && (option.control === undefined || compatibleControl(option.type as WidgetOptionType, option.control, option.multiple))
      && (option.steps === undefined || option.type === "number" && Array.isArray(option.steps)
        && option.steps.every(step => typeof step === "number" && Number.isFinite(step)))
      && ["description", "placeholder", "pattern"].every(key => option[key] === undefined || typeof option[key] === "string")
      && ["min", "max", "step", "minlength", "maxlength"].every(key => option[key] === undefined
        || typeof option[key] === "number" && Number.isFinite(option[key]))
      && ["multiline", "multiple"].every(key => option[key] === undefined || typeof option[key] === "boolean")
      && (option.swatches === undefined || Array.isArray(option.swatches) && option.swatches.every(swatch => typeof swatch === "string"))
      && (option.choices === undefined || Array.isArray(option.choices) && option.choices.every(choice => isRecord(choice)
        && typeof choice.value === "string" && typeof choice.label === "string" && strings(choice, ["description"]))))
    && Array.isArray(value.actions) && value.actions.every(action => isRecord(action)
      && typeof action.name === "string" && typeof action.label === "string" && available(action)
      && strings(action, ["icon", "confirm", "error"]) && booleans(action, ["busy"])
      && (action.input === undefined || isRecord(action.input) && action.input.type === "file"
        && strings(action.input, ["accept"]) && booleans(action.input, ["multiple"]))
      && (action.intent === undefined || action.intent === "default" || action.intent === "danger")
      && (action.description === undefined || typeof action.description === "string"))
}
