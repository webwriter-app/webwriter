import {ModuleCore, warnOnce, type CoreOptions} from "./base.js"
import {followLanguage, Messages, type MessagesOption} from "./messages.js"
import {settingsMessages, type SettingsMessages} from "./messages/settings/index.js"
import type {LocalizedText, OptionDeclaration} from "./options.js"
import {can, requestPermissions} from "./permissions.js"
import {transaction} from "./transaction.js"

export {settingsMessages, type SettingsMessages} from "./messages/settings/index.js"

// ── Declarations ──────────────────────────────────────────────────────────

/** What a setting can hold. A selection of several choices is a list of their values. */
export type SettingValue = string | number | boolean | readonly string[]

/**
 * A text of a setting: fixed, a map by language, or a function that is asked
 * with the widget whenever the text is shown. The function is for a widget
 * that keeps its texts in its own catalog; type the parameter by what is read:
 * `(widget: {msg: MsgFn}) => widget.msg("Speed")`.
 */
export type SettingText = LocalizedText | ((widget: never) => LocalizedText | undefined)

/** One choice of a `select` setting, or a branch of choices. A leaf without a label shows its value. */
export type SettingChoice = {
  readonly value?: string
  readonly label?: SettingText
  readonly description?: SettingText
  readonly children?: readonly SettingChoice[]
}

/** A choice as the editor takes it, with its texts answered for the widget. */
type PlainChoice = {value?: string; label?: LocalizedText; description?: LocalizedText; children?: readonly PlainChoice[]}

const TEXTS = ["label", "description", "placeholder"] as const
const computes = (choice: SettingChoice): boolean => typeof choice.label === "function" || typeof choice.description === "function" || !!choice.children?.some(computes)

/** The value types of the editor's option declaration that a setting can hold: all but objects and arrays. */
export type SettingType = Exclude<NonNullable<OptionDeclaration["type"]>, ObjectConstructor | ArrayConstructor | "object" | "array">

/** The fields of a setting that this module reads. */
export type SettingFields = {
  /** Default `String`. */
  readonly type?: SettingType
  /** The value while the attribute is absent. Never written to the document. */
  readonly default?: SettingValue
  readonly label?: SettingText
  readonly description?: SettingText
  readonly placeholder?: SettingText
  readonly group?: string
  /** Limits of a number. A value outside is moved to the nearest limit. */
  readonly min?: number
  readonly max?: number
  readonly step?: number
  /** The only values a number may take. Another value is moved to the nearest one. */
  readonly steps?: readonly number[]
  /** The choices of a `select`. With `multiple`, the value is a list of them. */
  readonly options?: readonly SettingChoice[]
  readonly multiple?: boolean
  /** The editor's control. `"duration"` makes a number a time in seconds, shown as `m:ss`. */
  readonly control?: "checkbox" | "switch" | "select" | "radio" | "segmented" | "input" | "range" | "duration" | "tree"
  readonly unit?: string
  readonly multiline?: boolean
  /** Limits of a text. A text that does not fit is refused. */
  readonly pattern?: string
  readonly minlength?: number
  readonly maxlength?: number
  /** Suggested colors of a `color` setting. */
  readonly swatches?: readonly string[]
  /**
   * Default: the name in kebab case, with `no-` in front for a boolean that
   * defaults to true. Such a boolean is always stored by the presence of
   * its attribute meaning false, also under a name given here.
   */
  readonly attribute?: string
  /**
   * Turns the setting off: return true, or the reason as text. It receives
   * the widget; type the parameter by what is read, `(widget: {population: number}) => …`.
   */
  readonly disabled?: (widget: never) => boolean | LocalizedText | null | undefined
}

/**
 * One setting. `type`, `default`, `attribute` and `disabled` are read by this
 * module. The other named fields are also used to validate the value and to
 * set up a bound control. Every field except `default` and `disabled`, also
 * one this module does not know, is passed to the editor's option declaration
 * as it is. A text that is a function is passed as its answer for the widget.
 */
export type SettingDeclaration = SettingFields & {readonly [passedThrough: string]: unknown}

/** The settings of a widget: one declaration per name. */
export type SettingsDeclarations = Readonly<Record<string, SettingDeclaration>>

type Leaf<C> = C extends {children: readonly (infer Child)[]} ? Leaf<Child> : C extends {value: infer Value extends string} ? Value : never
type Choice<D> = D extends {options: readonly (infer C)[]} ? ([Leaf<C>] extends [never] ? string : Leaf<C>) : string
type Plain<D> = D extends {type: BooleanConstructor | "boolean"}
  ? boolean
  : D extends {type: NumberConstructor | "number"}
    ? D extends {steps: readonly (infer Step extends number)[]}
      ? Step
      : number
    : D extends {type: "select"; multiple: true}
      ? readonly Choice<D>[]
      : D extends {type: "select"}
        ? Choice<D>
        : string

/**
 * The property types of a settings declaration. A setting without a default
 * may be undefined, except a boolean and a list. Declarations that are passed
 * to the Lit mixin as a literal give choices as unions.
 */
export type SettingValues<S> = {
  -readonly [Name in keyof S]: S[Name] extends {default: SettingValue} | {type: BooleanConstructor | "boolean"} | {type: "select"; multiple: true}
    ? Plain<S[Name]>
    : Plain<S[Name]> | undefined
}

// ── Module text ───────────────────────────────────────────────────────────

// ── One setting: pure functions, shared with the bindings ─────────────────

/** How a setting is stored and validated. */
export type SettingKind = "boolean" | "number" | "string" | "list"

/** The kind of a declaration: `list` is a `select` with `multiple`, `string` everything that is not a boolean or a number. */
export function settingKind(declaration: SettingDeclaration): SettingKind {
  const {type} = declaration
  if(type === Boolean || type === "boolean") return "boolean"
  if(type === Number || type === "number") return "number"
  return type === "select" && declaration.multiple === true ? "list" : "string"
}

const NO_CHOICES: readonly string[] = Object.freeze([])

/** The value while the attribute is absent: `default`, or false for a boolean, an empty list for a list and no value otherwise. */
export function settingDefault(declaration: SettingDeclaration): SettingValue | undefined {
  const kind = settingKind(declaration)
  if(declaration.default === undefined) return kind === "boolean" ? false : kind === "list" ? NO_CHOICES : undefined
  return accept(declaration, declaration.default)?.value ?? declaration.default
}

/** A boolean that defaults to true is stored by the presence of a negative attribute. */
const negative = (declaration: SettingDeclaration) => settingKind(declaration) === "boolean" && declaration.default === true

/** The attribute of a setting: `attribute`, or the name in kebab case, with `no-` in front for a boolean that defaults to true. */
export function settingAttribute(name: string, declaration: SettingDeclaration): string {
  const kebab = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return declaration.attribute ?? (negative(declaration) ? `no-${kebab}` : kebab)
}

/** The leaves of the declared choices, in their order, through every branch. */
export function settingChoices(declaration: SettingDeclaration): SettingChoice[] {
  const leaves = (choices: readonly SettingChoice[]): SettingChoice[] =>
    choices.flatMap(choice => (choice.children ? leaves(choice.children) : choice.value === undefined ? [] : [choice]))
  return leaves(declaration.options ?? [])
}

/** Whether two values of a setting are the same. Lists are compared item by item. */
export function sameSetting(a: SettingValue | undefined, b: SettingValue | undefined): boolean {
  if(typeof a !== "object" || typeof b !== "object") return a === b
  return a.length === b.length && a.every((item, index) => item === b[index])
}

// What the native control of each type accepts. Another text would be shown as nothing.
const DATE = String.raw`\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`
const TIME = String.raw`([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?`
const FORMATS: Readonly<Record<string, RegExp>> = {
  date: new RegExp(`^${DATE}$`),
  time: new RegExp(`^${TIME}$`),
  "datetime-local": new RegExp(`^${DATE}T${TIME}$`),
  color: /^#[0-9a-f]{6}$/,
}

function fitsText(declaration: SettingDeclaration, text: string): boolean {
  const {type, pattern, minlength, maxlength} = declaration
  if(typeof type === "string" && FORMATS[type] && !FORMATS[type].test(text)) return false
  if(minlength !== undefined && text.length < minlength) return false
  if(maxlength !== undefined && text.length > maxlength) return false
  if(type === "select") {
    const listed = settingChoices(declaration)
    if(listed.length && !listed.some(choice => choice.value === text)) return false
  }
  if(pattern === undefined) return true
  try {
    // As the `pattern` attribute: the whole text has to match.
    return new RegExp(`^(?:${pattern})$`, "v").test(text)
  } catch {
    return true // A pattern that does not compile limits nothing, as in the browser.
  }
}

function limitNumber(declaration: SettingDeclaration, number: number): number {
  const {steps, control} = declaration
  const min = declaration.min ?? (control === "duration" ? 0 : -Infinity)
  const limited = Math.min(Math.max(number, min), declaration.max ?? Infinity)
  if(!steps?.length) return limited
  return steps.reduce((nearest, step) => (Math.abs(step - limited) < Math.abs(nearest - limited) ? step : nearest))
}

/** The value a setting takes for an input, or null if the input is refused. An empty input gives the default. */
function accept(declaration: SettingDeclaration, value: unknown): {value: SettingValue | undefined} | null {
  switch(settingKind(declaration)) {
    case "boolean":
      return typeof value === "boolean" ? {value} : null
    case "number": {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
      return Number.isFinite(number) ? {value: limitNumber(declaration, number)} : null
    }
    case "list": {
      if(!Array.isArray(value) || !value.every(item => typeof item === "string")) return null
      const listed = settingChoices(declaration).map(choice => choice.value!)
      if(listed.length && !value.every(item => listed.includes(item))) return null
      // One order for one selection, so that it compares and serializes the same however it was made.
      const chosen = listed.length ? listed.filter(item => value.includes(item)) : [...new Set<string>(value)]
      return {value: Object.freeze(chosen)}
    }
    default: {
      if(typeof value !== "string" && typeof value !== "number") return null
      const text = declaration.type === "color" ? String(value).toLowerCase() : String(value)
      return fitsText(declaration, text) ? {value: text} : null
    }
  }
}

const isReset = (value: unknown) => value === null || value === undefined || value === ""

/**
 * The value a setting takes for any input: a number is moved inside `min` and
 * `max` and onto `steps`, and `fallback` is returned for a value of the wrong
 * type, outside the listed choices or against the limits of a text. `null`,
 * `undefined` and `""` reset to the default, as in the editor.
 */
export function normalizeSetting(declaration: SettingDeclaration, value: unknown, fallback: SettingValue | undefined = settingDefault(declaration)): SettingValue | undefined {
  if(isReset(value)) return settingDefault(declaration)
  const accepted = accept(declaration, value)
  return accepted ? accepted.value : fallback
}

/**
 * The value for an attribute as it is in the document. A value that does not
 * fit gives the default, and a list keeps the items that are listed. The
 * attribute itself is never corrected.
 */
export function parseSetting(declaration: SettingDeclaration, attribute: string | null): SettingValue | undefined {
  const kind = settingKind(declaration)
  if(kind === "boolean") return (attribute !== null) !== negative(declaration)
  if(kind !== "list" || isReset(attribute)) return normalizeSetting(declaration, attribute)
  let items: unknown
  try {
    items = JSON.parse(attribute!)
  } catch {
    return settingDefault(declaration)
  }
  if(!Array.isArray(items)) return settingDefault(declaration)
  const listed = settingChoices(declaration).map(choice => choice.value)
  return normalizeSetting(
    declaration,
    items.filter(item => typeof item === "string" && (!listed.length || listed.includes(item))),
  )
}

/** The attribute value, or null for "no attribute": the default is never written. A list is written as JSON. */
export function serializeSetting(declaration: SettingDeclaration, value: unknown): string | null {
  const normalized = normalizeSetting(declaration, value)
  if(normalized === undefined || sameSetting(normalized, settingDefault(declaration))) return null
  if(typeof normalized === "boolean") return ""
  return typeof normalized === "object" ? JSON.stringify(normalized) : String(normalized)
}

/** Picks the text for a language: the exact tag, then the language, then `_`. */
export function localized(text: LocalizedText | undefined, locale: string): string | undefined {
  if(typeof text !== "object") return text
  const keys = Object.keys(text)
  const find = (tag: string) => keys.find(key => key.toLowerCase() === tag)
  const key = find(locale.toLowerCase()) ?? find(locale.toLowerCase().split("-")[0]) ?? "_"
  return text[key] ?? text._
}

/** Seconds as `m:ss` or `h:mm:ss`, with a fraction if there is one: the form the editor's duration control shows. */
export function formatDuration(seconds: number): string {
  if(!Number.isFinite(seconds) || seconds < 0) return ""
  const [whole, fraction = ""] = seconds.toFixed(3).split(".")
  const total = Number(whole)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const rest = fraction.replace(/0+$/, "")
  const head = hours ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes)
  return `${head}:${String(total % 60).padStart(2, "0")}${rest ? `.${rest}` : ""}`
}

/** The seconds of `90`, `1:30` or `1:00:00`, with or without a fraction. Undefined for anything else. */
export function parseDuration(text: string): number | undefined {
  const parts = text.trim().split(":")
  const fits = (part: string, index: number) => (index === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(part)
  if(parts.length > 3 || !parts.every(fits)) return undefined
  const numbers = parts.map(Number)
  if(numbers.slice(1).some(number => number >= 60)) return undefined
  return numbers.reduce((total, part) => total * 60 + part, 0)
}

// ── Bound controls ────────────────────────────────────────────────────────

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const TEXT_ENTRY = /^(text|search|url|tel|email|password|number|date|time|datetime-local|textarea)$/
const PLAIN_TEXT = /^(text|search|url|tel|email|password|textarea)$/

const isControl = (element: Element | null | undefined): element is Control =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement

/** A duration is shown as `m:ss` in a text field. Every other control of a number shows the number. */
const showsDuration = (control: Control, declaration: SettingDeclaration) => declaration.control === "duration" && PLAIN_TEXT.test(control.type)
/** A slider over `steps` moves through their positions, because a range input has only even steps. */
const stepsThrough = (control: Control, declaration: SettingDeclaration) => control.type === "range" && !!declaration.steps?.length
/** One of several controls that share a setting and stand for one choice each. */
const isChoice = (control: Control, kind: SettingKind) => control.type === "radio" || (control.type === "checkbox" && kind !== "boolean")

function setAttribute(element: Element, name: string, value: string) {
  if(element.getAttribute(name) !== value) element.setAttribute(name, value)
}

/** What a control holds for its setting: `{value}`, where null resets, or undefined while it holds nothing usable. */
function read(control: Control, declaration: SettingDeclaration, current: SettingValue | undefined, commit: boolean): {value: unknown} | undefined {
  const kind = settingKind(declaration)
  if(control instanceof HTMLSelectElement && kind === "list") return {value: [...control.selectedOptions].map(option => option.value)}
  if(control.type === "checkbox") {
    const input = control as HTMLInputElement
    if(kind === "boolean") return {value: input.checked}
    if(kind !== "list") return input.checked ? {value: input.value} : {value: null}
    const others = (Array.isArray(current) ? current : []).filter(item => item !== input.value)
    return {value: input.checked ? [...others, input.value] : others}
  }
  if(control.type === "radio") return (control as HTMLInputElement).checked ? {value: control.value} : undefined
  if(kind === "list") return undefined
  if(kind !== "number") return {value: control.value}
  // A number field that is empty for a moment is being retyped. Left empty, it resets.
  if(control.value.trim() === "") return commit ? {value: null} : undefined
  if(stepsThrough(control, declaration)) return {value: declaration.steps![Number(control.value)]}
  const number = showsDuration(control, declaration) ? parseDuration(control.value) : Number(control.value)
  return number === undefined || Number.isNaN(number) ? undefined : {value: number}
}

/** Shows a value in a control. */
function write(control: Control, declaration: SettingDeclaration, value: SettingValue | undefined) {
  const kind = settingKind(declaration)
  const list = Array.isArray(value) ? (value as readonly string[]) : []
  if(control instanceof HTMLSelectElement && kind === "list") {
    for(const option of control.options) option.selected = list.includes(option.value)
  } else if(control.type === "checkbox" || control.type === "radio") {
    const input = control as HTMLInputElement
    input.checked = kind === "boolean" ? value === true : kind === "list" ? list.includes(input.value) : input.value === String(value ?? "")
  } else {
    let text = String(value ?? "")
    if(typeof value === "number" && stepsThrough(control, declaration)) text = String(declaration.steps!.indexOf(value))
    else if(typeof value === "number" && showsDuration(control, declaration)) text = formatDuration(value)
    if(control.value !== text) control.value = text
  }
}

/** The label text of a control that is written in the template, apart from the control itself. */
function hasLabel(control: Control): boolean {
  if(control.hasAttribute("aria-labelledby")) return true
  for(const label of control.labels ?? []) {
    const walker = label.ownerDocument.createTreeWalker(label, NodeFilter.SHOW_TEXT)
    for(let node = walker.nextNode(); node; node = walker.nextNode()) {
      if(!control.contains(node) && node.nodeValue?.trim()) return true
    }
  }
  return false
}

// ── The module ────────────────────────────────────────────────────────────

/** Options of `SettingsCore`. */
export type SettingsOptions = CoreOptions & {
  /** Default: the host class's `static settings`. */
  declarations?: SettingsDeclarations
  /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step of an entry open until then. */
  rendered?: () => Promise<unknown>
  /**
   * How long an entry in a bound control may rest before its undo step is
   * closed without a `change` event, in milliseconds. Default 5000.
   */
  entryTimeout?: number
  /**
   * How a boolean that is stored as a negative attribute is declared to the
   * editor. `"inverted"` (the default) generates the attribute with
   * `inverted: true`: the editor writes the negative attribute itself.
   * `"property"` generates `attribute: false`, so that the editor sets the
   * property and the widget reflects it, for an editor without `inverted`.
   */
  negativeBooleans?: "property" | "inverted"
  messages?: MessagesOption<SettingsMessages>
}

/** The state of `SettingsCore`. */
export type SettingsSnapshot = {
  readonly values: Readonly<Record<string, SettingValue | undefined>>
  /** The settings that are turned off, with the reason where one was given. */
  readonly disabled: Readonly<Record<string, LocalizedText | true>>
}

/** An option declaration of the editor: `OptionDeclaration` of this package. */
export type EditorOption = OptionDeclaration

/** One option as `editorOptions()` generates it: the declaration, whether it is turned off, and always its attribute. */
export type GeneratedOption = OptionDeclaration & {attribute: string | false}

type Entry = {control: Control; close: () => void; timer: ReturnType<typeof setTimeout> | undefined}

const UNSUPPORTED = new Set<unknown>([Object, Array, "object", "array"])

/**
 * Settings: each declared setting is one attribute on the host. The core reads
 * and writes that attribute, generates the editor's `options` from the
 * declarations and binds the form controls marked `data-ww-setting="name"` in
 * the shadow root. A binding adds the properties of its library on top; a
 * host without one calls `defineProperties()`.
 *
 * An element marked `data-ww-setting-label="name"` shows the label of the
 * setting in the widget's language while the template leaves it empty, and
 * `data-ww-setting-label="name=value"` the label of one choice.
 */
export class SettingsCore extends ModuleCore<SettingsSnapshot> {
  #options: SettingsOptions
  #messages: Messages<SettingsMessages>
  #snapshot: SettingsSnapshot = {values: {}, disabled: {}}
  #declared = ""
  /** The last attribute text and its value per setting, so that a list keeps its identity between reads. */
  #parsed = new Map<string, {text: string | null; value: SettingValue | undefined}>()
  /** What the module wrote onto template elements, by attribute. Anything else there belongs to the template. */
  #written = new WeakMap<Element, Map<string, string>>()
  /** The open undo step of an entry in a bound control. */
  #entry: Entry | null = null
  #swatches = new Map<string, HTMLDataListElement>()
  #checkedMarks = false

  constructor(host: HTMLElement, options: SettingsOptions = {}) {
    super(host, options)
    this.#options = options
    this.#messages = new Messages(host, settingsMessages, options.messages)
  }

  /** The declarations: the `declarations` option, or the host class's `static settings`. */
  get declarations(): SettingsDeclarations {
    return this.#options.declarations ?? (this.host.constructor as {settings?: SettingsDeclarations}).settings ?? {}
  }

  /** The widget's language: the nearest `lang`, through shadow roots. Empty if none is set. */
  get language(): string {
    return this.#messages.language
  }

  /** The current value, read from the attribute. */
  get(name: string): SettingValue | undefined {
    const declaration = this.declarations[name]
    if(!declaration) return undefined
    const text = this.host.getAttribute(settingAttribute(name, declaration))
    const known = this.#parsed.get(name)
    if(known && known.text === text) return known.value
    const value = parseSetting(declaration, text)
    this.#parsed.set(name, {text, value})
    return value
  }

  /**
   * Writes the attribute, as one undo step. Returns false for a value the
   * setting refuses, which changes nothing. A setting that is turned off by
   * `disabled` still takes a write from code.
   */
  set(name: string, value: unknown): boolean {
    const declaration = this.declarations[name]
    if(!declaration) return false
    const accepted = isReset(value) ? {value: settingDefault(declaration)} : accept(declaration, value)
    if(!accepted) return false
    if(sameSetting(accepted.value, this.get(name))) return true
    const attribute = settingAttribute(name, declaration)
    const text = serializeSetting(declaration, accepted.value)
    const {rendered} = this.#options
    void transaction(this.host, () => {
      if(text === null) this.host.removeAttribute(attribute)
      else this.host.setAttribute(attribute, text)
      // What the widget changes in answer to the setting reaches the document with its render.
      return rendered?.()
    })
    return true
  }

  /** True, or the reason, while the setting's `disabled` function turns it off. */
  disabledOf(name: string): LocalizedText | boolean {
    const disabled = this.declarations[name]?.disabled as ((widget: HTMLElement) => boolean | LocalizedText | null | undefined) | undefined
    return disabled?.(this.host) || false
  }

  /** The label of a setting, or of one of its choices, in the widget's language. Without a declared label it is the name or the value. */
  labelOf(name: string, choice?: string): string {
    const declaration = this.declarations[name]
    if(choice === undefined) return localized(this.#text(declaration?.label), this.language) ?? name
    const listed = declaration ? settingChoices(declaration).find(leaf => leaf.value === choice) : undefined
    return localized(this.#text(listed?.label), this.language) ?? choice
  }

  /** A text as the editor takes it: a function is asked with the widget. */
  #text(text: SettingText | undefined): LocalizedText | undefined {
    return typeof text === "function" ? (text as (widget: HTMLElement) => LocalizedText | undefined)(this.host) : text
  }

  /** The choices with their texts answered for the widget. The declared list itself where none is a function. */
  #choices(choices: readonly SettingChoice[]): readonly PlainChoice[] {
    if(!choices.some(computes)) return choices as readonly PlainChoice[]
    return choices.map(({label, description, children, ...rest}) => ({
      ...rest,
      ...(label === undefined ? {} : {label: this.#text(label)}),
      ...(description === undefined ? {} : {description: this.#text(description)}),
      ...(children ? {children: this.#choices(children)} : {}),
    }))
  }

  /** The texts and choices of a declaration that are functions, answered for the widget. Absent fields stay absent. */
  #computed(declaration: SettingDeclaration): Record<string, unknown> {
    const texts = TEXTS.filter(field => typeof declaration[field] === "function").map(field => [field, this.#text(declaration[field])])
    const choices = declaration.options?.some(computes) ? [["options", this.#choices(declaration.options)]] : []
    return Object.fromEntries([...texts, ...choices])
  }

  /**
   * The editor's option declarations (`options` on the widget). Each names
   * its attribute. A boolean that defaults to true is stored by its negative
   * attribute and declared with `inverted: true` (see the `negativeBooleans`
   * option for the other form).
   */
  editorOptions(): Record<string, GeneratedOption> {
    const property = this.#options.negativeBooleans === "property"
    const entries = Object.entries(this.declarations).map(([name, declaration]): [string, GeneratedOption] => {
      const {default: _default, disabled: _disabled, ...passed} = declaration
      const off = this.disabledOf(name)
      const attribute = settingAttribute(name, declaration)
      const stored = !negative(declaration) ? {attribute} : property ? {attribute: false as const} : {attribute, inverted: true}
      const turnedOff = !off ? {} : off === true ? {disabled: true} : {disabled: true, disabledReason: off}
      // A setting's fields are those of the option, read-only. Fields this module does not know are passed as they are.
      return [name, {...passed, ...this.#computed(declaration), ...stored, ...turnedOff} as GeneratedOption]
    })
    return Object.fromEntries(entries)
  }

  /**
   * Defines one accessor per setting on `target`, backed by the attribute.
   * For hosts whose library does not make the properties itself.
   */
  defineProperties(target: object = this.host): void {
    for(const name of Object.keys(this.declarations)) {
      Object.defineProperty(target, name, {get: () => this.get(name), set: (value: unknown) => void this.set(name, value), configurable: true, enumerable: true})
    }
  }

  getSnapshot(): SettingsSnapshot {
    return this.#snapshot
  }

  protected onConnect() {
    this.#lint()
    // The editor, undo and collaborators write the attributes from outside, and `disabled` may read any of them.
    const observer = new MutationObserver(() => this.#update())
    observer.observe(this.host, {attributes: true})
    this.cleanup(() => observer.disconnect())
    // Labels are picked by the language itself, the module's own texts by the catalog that answers for it.
    this.cleanup(followLanguage(this.host, () => this.#update()))
    this.cleanup(this.#messages.follow(() => this.#update()))
    this.listen(this.root, "input", event => this.#input(event, false))
    this.listen(this.root, "change", event => this.#input(event, true))
    // An entry that is left without a change event, such as a number that was typed and deleted again.
    this.listen(this.root, "focusout", event => {
      if(this.#entry && event.target === this.#entry.control) this.#commit(this.#entry.control)
    })
    this.cleanup(() => {
      this.#end()
      for(const list of this.#swatches.values()) list.remove()
      this.#swatches.clear()
      this.#parsed.clear()
      this.#checkedMarks = false
    })
    this.#declared = this.#signature()
    this.#update()
  }

  protected onRefresh() {
    this.#update()
  }

  /** Development warnings for declarations that cannot work. */
  #lint() {
    const {host} = this
    const owner = host.constructor
    const groups = (host as {optionGroups?: object}).optionGroups ?? (owner as {optionGroups?: object}).optionGroups ?? {}
    for(const [name, declaration] of Object.entries(this.declarations)) {
      const own = Object.getOwnPropertyDescriptor(host, name)
      // The module's own properties are accessors. A class field is a value.
      if(own && "value" in own) {
        warnOnce(
          owner,
          `setting-shadowed:${name}`,
          `<${host.localName}>: a class field named "${name}" shadows the setting of that name. Remove the field; the setting provides the property.`,
        )
      }
      if(UNSUPPORTED.has(declaration.type)) {
        warnOnce(
          owner,
          `setting-type:${name}`,
          `<${host.localName}>: the setting "${name}" is an object or an array. Structured content belongs in the data block or in child elements; the setting is treated as text.`,
        )
      }
      if(declaration.group !== undefined && !Object.hasOwn(groups, declaration.group)) {
        warnOnce(
          owner,
          `setting-group:${declaration.group}`,
          `<${host.localName}>: the setting "${name}" names the group "${declaration.group}", which is not declared in static optionGroups.`,
        )
      }
    }
  }

  /** What the editor would have to read again: the `disabled` results, the language and the texts that are functions. */
  #signature(): string {
    const declared = Object.entries(this.declarations)
    return JSON.stringify([this.language, declared.map(([name]) => this.disabledOf(name)), declared.map(([, declaration]) => this.#computed(declaration))])
  }

  #update() {
    const names = Object.keys(this.declarations)
    const values = Object.fromEntries(names.map(name => [name, this.get(name)]))
    const disabled = Object.fromEntries(names.map(name => [name, this.disabledOf(name)]).filter(([, off]) => off))
    const before = this.#snapshot
    const changed = !names.every(name => name in before.values && sameSetting(values[name], before.values[name])) || JSON.stringify(disabled) !== JSON.stringify(before.disabled)
    if(changed) this.#snapshot = {values, disabled}
    const declared = this.#signature()
    if(declared !== this.#declared) {
      this.#declared = declared
      this.host.dispatchEvent(new Event("optionschange", {bubbles: true}))
    }
    const {root} = this
    for(const element of root.querySelectorAll<HTMLElement>("[data-ww-setting-label]")) this.#caption(element)
    const controls = [...root.querySelectorAll("[data-ww-setting]")].filter(isControl)
    for(const control of controls) this.#show(control, false)
    this.#checkMarks(controls)
    if(changed) this.notify()
  }

  /** `data-ww-can` around a bound control is hidden by Permissions. Without it the control stays visible and only refuses. */
  #checkMarks(controls: Control[]) {
    if(this.#checkedMarks || !controls.some(control => control.closest("[data-ww-can]"))) return
    this.#checkedMarks = true
    if(requestPermissions(this.host)) return
    warnOnce(
      this.host.constructor,
      "setting-can",
      `<${this.host.localName}>: a bound control is marked data-ww-can, but the widget has no Permissions. The control refuses input a reader may not make, and stays visible. Add Permissions to hide it.`,
    )
  }

  /**
   * Sets an attribute on a template element where the template has none of
   * its own; null removes what the module wrote before.
   */
  #own(element: Element, attribute: string, value: string | null) {
    const mine = this.#written.get(element)?.get(attribute)
    const current = element.getAttribute(attribute)
    if(current !== null && current !== mine) return
    if(value === null) {
      if(current !== null) element.removeAttribute(attribute)
      this.#written.get(element)?.delete(attribute)
      return
    }
    setAttribute(element, attribute, value)
    const written = this.#written.get(element) ?? this.#written.set(element, new Map()).get(element)!
    written.set(attribute, value)
  }

  /** Fills an element marked `data-ww-setting-label` that the template left empty. */
  #caption(element: HTMLElement) {
    const [name, choice] = element.dataset.wwSettingLabel!.split("=", 2)
    if(!this.declarations[name]) return
    const mine = this.#written.get(element)?.get("text")
    if(element.childNodes.length && element.textContent !== mine) return
    const text = this.labelOf(name, choice)
    if(element.textContent !== text) element.textContent = text
    const written = this.#written.get(element) ?? this.#written.set(element, new Map()).get(element)!
    written.set("text", text)
  }

  /** Value, limits, name and enabled state of one bound control. */
  #show(control: Control, commit: boolean) {
    const name = control.dataset.wwSetting!
    const declaration = this.declarations[name]
    if(!declaration) {
      warnOnce(this.host.constructor, `setting-unknown:${name}`, `<${this.host.localName}>: data-ww-setting="${name}" names no declared setting.`)
      return
    }
    const kind = settingKind(declaration)
    this.#limit(control, declaration, kind)
    if(control instanceof HTMLSelectElement) this.#fill(control, declaration)
    if(control.type === "color") this.#suggest(control, name, declaration)
    // A field keeps what is being typed into it until the entry is committed.
    const typing = !commit && TEXT_ENTRY.test(control.type) && this.root.activeElement === control
    if(!typing) {
      write(control, declaration, this.get(name))
      control.setCustomValidity("")
    }
    const off = this.disabledOf(name)
    if(control.disabled !== !!off) control.disabled = !!off
    const reason = off && off !== true ? (localized(off, this.language) ?? null) : null
    this.#own(control, "aria-description", reason)
    this.#own(control, "title", reason)
    const label = hasLabel(control) ? null : isChoice(control, kind) ? this.labelOf(name, control.value) : this.labelOf(name)
    this.#own(control, "aria-label", label)
  }

  /** The limits of the declaration, as the attributes of the control that enforce them natively. */
  #limit(control: Control, declaration: SettingDeclaration, kind: SettingKind) {
    if(kind === "number" && (control.type === "number" || control.type === "range")) {
      const {steps} = declaration
      const through = stepsThrough(control, declaration)
      const limits = through ? {min: 0, max: steps!.length - 1, step: 1} : {min: declaration.min, max: declaration.max, step: declaration.step}
      for(const [limit, number] of Object.entries(limits)) {
        if(number !== undefined) setAttribute(control, limit, String(number))
      }
      // Without a step the browser would take whole numbers only.
      if(limits.step === undefined) this.#own(control, "step", "any")
      if(control.type !== "range") return
      const value = this.get(control.dataset.wwSetting!)
      const text =
        typeof value !== "number"
          ? null
          : declaration.control === "duration"
            ? formatDuration(value)
            : declaration.unit
              ? `${value} ${declaration.unit}`
              : through
                ? String(value)
                : null
      this.#own(control, "aria-valuetext", text)
    } else if(kind === "string" && PLAIN_TEXT.test(control.type)) {
      const {pattern, minlength, maxlength} = declaration
      if(pattern !== undefined && control.localName === "input") setAttribute(control, "pattern", pattern)
      if(minlength !== undefined) setAttribute(control, "minlength", String(minlength))
      if(maxlength !== undefined) setAttribute(control, "maxlength", String(maxlength))
    }
  }

  /** An empty `<select>` gets the declared choices, with one `<optgroup>` per branch, or the `steps` of a number. */
  #fill(select: HTMLSelectElement, declaration: SettingDeclaration) {
    if([...select.children].some(child => !child.hasAttribute("data-ww-choice"))) return
    const {language} = this
    const label = (choice: PlainChoice) => localized(choice.label, language) ?? choice.value ?? ""
    const unit = declaration.unit ? ` ${declaration.unit}` : ""
    const choices: readonly PlainChoice[] =
      settingKind(declaration) === "number" ? (declaration.steps ?? []).map(step => ({value: String(step), label: `${step}${unit}`})) : this.#choices(declaration.options ?? [])
    const leaves = (branch: PlainChoice): PlainChoice[] => (branch.children ? branch.children.flatMap(leaves) : branch.value === undefined ? [] : [branch])
    const wanted = JSON.stringify([language, choices])
    if(this.#written.get(select)?.get("choices") === wanted && select.options.length === choices.flatMap(leaves).length) return
    const document = select.ownerDocument
    const option = (choice: PlainChoice) => {
      const element = document.createElement("option")
      element.setAttribute("data-ww-choice", "")
      element.value = choice.value!
      element.textContent = label(choice)
      return element
    }
    select.replaceChildren(
      ...choices.flatMap(choice => {
        if(!choice.children) return choice.value === undefined ? [] : [option(choice)]
        const group = document.createElement("optgroup")
        group.setAttribute("data-ww-choice", "")
        group.label = label(choice)
        group.append(...leaves(choice).map(option))
        return [group]
      }),
    )
    const written = this.#written.get(select) ?? this.#written.set(select, new Map()).get(select)!
    written.set("choices", wanted)
  }

  /** The `swatches` of a color become the suggestions of its color field. */
  #suggest(control: Control, name: string, declaration: SettingDeclaration) {
    const colors = declaration.swatches ?? []
    const id = `ww-swatches-${name}`
    const current = control.getAttribute("list")
    // A list the template gave the field stays.
    if(current !== null && current !== this.#written.get(control)?.get("list")) return
    let list = this.#swatches.get(name)
    if(!colors.length) {
      list?.remove()
      this.#swatches.delete(name)
      this.#own(control, "list", null)
      return
    }
    if(!list) {
      list = control.ownerDocument.createElement("datalist")
      list.id = id
      list.setAttribute("data-ww-swatches", "")
      this.#swatches.set(name, list)
    }
    if([...list.options].map(option => option.value).join() !== colors.join()) {
      list.replaceChildren(
        ...colors.map(color => {
          const option = control.ownerDocument.createElement("option")
          option.value = color
          return option
        }),
      )
    }
    // A framework may clear what a module added to the shadow root.
    if(list.parentNode !== this.root) this.root.append(list)
    this.#own(control, "list", id)
  }

  #input(event: Event, commit: boolean) {
    const target = (event.target as Element).closest?.("[data-ww-setting]")
    if(!isControl(target)) return
    const name = target.dataset.wwSetting!
    const declaration = this.declarations[name]
    if(!declaration) return
    const permission = target.closest<HTMLElement>("[data-ww-can]")?.dataset.wwCan
    if(this.disabledOf(name) || (permission && !can(this.host, permission))) {
      // Refused: the control shows the stored value again, and an entry it had open ends.
      if(this.#entry?.control === target) this.#end()
      write(target, declaration, this.get(name))
      return
    }
    const entry = read(target, declaration, this.get(name), commit)
    if(entry) {
      // A slider drag or a typed number is many `input` events and one `change`: one undo step.
      this.#begin(target)
      const taken = this.set(name, entry.value)
      target.setCustomValidity(taken ? "" : this.#messages.current.invalid)
    } else if(settingKind(declaration) === "number" && target.value.trim() !== "" && showsDuration(target, declaration)) {
      target.setCustomValidity(this.#messages.current.invalidDuration)
    }
    if(commit) this.#commit(target)
  }

  /** Opens the undo step of an entry, or keeps the open one of the same control alive. */
  #begin(control: Control) {
    if(this.#entry && this.#entry.control !== control) this.#end()
    if(!this.#entry) {
      let close!: () => void
      void transaction(this.host, () => new Promise<void>(done => (close = done)))
      this.#entry = {control, close, timer: undefined}
    }
    clearTimeout(this.#entry.timer)
    this.#entry.timer = setTimeout(() => this.#end(), this.#options.entryTimeout ?? 5000)
  }

  /** Ends the entry and shows the value that was really stored, for example after it was limited. */
  #commit(control: Control) {
    this.#end()
    const name = control.dataset.wwSetting
    for(const other of this.root.querySelectorAll(`[data-ww-setting]`)) {
      if(isControl(other) && other.dataset.wwSetting === name) this.#show(other, true)
    }
  }

  #end() {
    const entry = this.#entry
    if(!entry) return
    this.#entry = null
    clearTimeout(entry.timer)
    const rendered = this.connected ? this.#options.rendered?.() : undefined
    if(rendered) void rendered.then(entry.close, entry.close)
    else entry.close()
  }
}
