import type {LocalizedText} from "./index"

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

const fileExtension = /^\.[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/i
const mediaType = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i

/** File conversions accept literal extensions and concrete MIME types. */
export function isWidgetFileFormat(value: unknown): value is string {
  return typeof value === "string" && (fileExtension.test(value) || mediaType.test(value))
}

export function matchesWidgetFileFormat(file: File, format: string) {
  const key = format.toLowerCase()
  return key.startsWith(".") ? file.name.toLowerCase().endsWith(key)
    : file.type.split(";", 1)[0].trim().toLowerCase() === key
}

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
  buttonGroup?: string
  icon?: string
  intent?: "default" | "danger"
  confirm?: string
  input?: WidgetFileInput
  busy?: boolean
  error?: string
}

export type UnknownRecord = Record<string, unknown>
export const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === "object" && !Array.isArray(value)
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

export const compatibleControl = (type: WidgetOptionType, control: unknown, multiple: unknown): control is WidgetOptionControl =>
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
    ...(typeof decl.buttonGroup === "string" ? {buttonGroup: decl.buttonGroup} : {}),
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

export function localizedText(value: LocalizedText | undefined, locale: string) {
  if(typeof value === "string") return value
  if(!value) return
  const normalizedLocale = locale.toLowerCase()
  const exactKey = Object.keys(value).find(key => key.toLowerCase() === normalizedLocale)
  const language = normalizedLocale.split("-")[0]
  const languageKey = Object.keys(value).find(key => key.toLowerCase() === language)
  return exactKey && value[exactKey] || languageKey && value[languageKey] || value._
}

/** An instance map, including an empty map, takes precedence over its class map. */
export function widgetDeclarations(widget: Element, kind: "options" | "actions" | "permissions" | "optionGroups" | "convertFrom" | "convertTo") {
  const read = (name: string) => {
    try {
      const own = (widget as unknown as UnknownRecord)[name]
      if(isRecord(own)) return own
      const inherited = (widget.constructor as unknown as UnknownRecord)[name]
      return isRecord(inherited) ? inherited : {}
    }
    catch { return {} }
  }
  return kind === "options" ? {...read("dynamicOptions"), ...read(kind)} : read(kind)
}

export function widgetOptionDeclaration(widget: Element, name: string, declaration: unknown) {
  if(!isRecord(declaration) || typeof declaration.attribute === "string" || declaration.attribute === false) return declaration
  let properties: unknown
  try { properties = (widget.constructor as unknown as UnknownRecord).elementProperties }
  catch { return declaration }
  const property = properties instanceof Map ? properties.get(name) : undefined
  if(!isRecord(property)) return declaration
  if(typeof property.attribute === "string" || property.attribute === false) return {...declaration, attribute: property.attribute}
  return property.state === true ? {...declaration, attribute: false} : declaration
}

export function readWidgetOption(widget: Element, name: string, raw: unknown, locale: string) {
  const declaration = widgetOptionDeclaration(widget, name, raw)
  let value: unknown = null
  try { value = (widget as unknown as UnknownRecord)[name] }
  catch { /* A failing widget getter leaves the field empty. */ }
  const option = widgetOptionState(name, declaration, value, locale)
  if(value !== undefined || option.attribute === null) return option
  const attribute = widget.getAttribute(option.attribute)
  const parsed = option.type === "boolean" ? attribute !== null
    : option.type === "number" && attribute !== null ? Number(attribute) : attribute
  return {...option, value: widgetOptionValue(parsed)}
}

export function validWidgetOptionValue(option: WidgetOptionState, value: WidgetOptionValue, widget: Element): boolean {
  if(value === null || value === "") return true
  if(option.type === "boolean") return typeof value === "boolean"
  if(option.type === "number") return typeof value === "number" && Number.isFinite(value)
    && (option.control !== "duration" || value >= 0)
    && (option.min === undefined || value >= option.min) && (option.max === undefined || value <= option.max)
    && (!option.steps?.length || option.steps.includes(value))
    && (option.control !== "duration" || !option.step || option.step <= 0
      || Math.abs((value - (option.min ?? 0)) / option.step - Math.round((value - (option.min ?? 0)) / option.step)) < 1e-7)
  if(option.type === "reference") return typeof value === "string" && Boolean(option.choices?.some(choice => choice.value === value))
  if(option.type === "select") {
    let retained: unknown = null
    if(option.control === "tree") {
      try { retained = (widget as unknown as UnknownRecord)[option.name] }
      catch { return false }
    }
    const valid = (item: unknown) => typeof item === "string" && (option.control === "tree"
      ? Boolean(option.choices?.some(choice => choice.value === item)) || Array.isArray(retained) && retained.includes(item)
      : !option.choices?.length || option.choices.some(choice => choice.value === item))
    return option.multiple ? Array.isArray(value) && value.every(valid) : valid(value)
  }
  return true
}

/** Project candidates from the current scope without assigning authored IDs. */
export function widgetReferenceOption(widget: Element, option: WidgetOptionState, root: ParentNode, isWidget: (element: Element) => boolean, identityRoot = root) {
  if(option.type !== "reference") return option
  const ids = new Map<string, number>()
  identityRoot.querySelectorAll("[id]").forEach(element => {
    if(element.id) ids.set(element.id, (ids.get(element.id) ?? 0) + 1)
  })
  try {
    const choices = Array.from(root.querySelectorAll(option.selector ?? "*")).flatMap(element => {
      if(!isWidget(element) || !element.id || ids.get(element.id) !== 1 || option.excludeSelf !== false && element === widget) return []
      const title = element.getAttribute("aria-label") || element.getAttribute("title") || element.localName
      return [{value: element.id, label: `${title} #${element.id}`}]
    })
    return {...option, choices, ...(typeof option.value === "string" && option.value && !choices.some(choice => choice.value === option.value)
      ? {referenceMissing: true} : {})}
  }
  catch {
    return {...option, choices: [], disabled: true, disabledReason: "Invalid reference selector"}
  }
}

export function widgetActionRows(actions: WidgetActionState[]) {
  const rows: WidgetActionState[][] = []
  for(const action of actions) {
    const row = rows.at(-1)
    if(action.buttonGroup && row?.[0].buttonGroup === action.buttonGroup) row.push(action)
    else rows.push([action])
  }
  return rows
}

export function widgetConversionMethod(widget: Element, declaration: unknown) {
  try {
    const method = typeof declaration === "string" ? (widget as unknown as UnknownRecord)[declaration] : declaration
    return typeof method === "function" ? method : undefined
  }
  catch { return undefined }
}
