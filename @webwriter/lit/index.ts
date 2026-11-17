import {LitElement, adoptStyles, type PropertyDeclaration} from "lit"
import {SignalWatcher} from "@lit-labs/signals"
import type * as WidgetOptions from "@webwriter/widget"
import {WidgetRuntime, hasComputedDeclarations, resolveDeclarations, widgetLanguage, widgetRuntimeAttributes, type WidgetDataContext,
  type Declared, type LocalizedText, type ActionDeclaration, type OptionGroupDeclaration, type PermissionDeclaration,
  type ConvertFromDeclarations, type ConvertToDeclarations} from "@webwriter/widget"

export {isDataBlockType, resolveDeclarations, type Declared, type DeclaredFlag, type DeclaredText, type WidgetDataContext, type WidgetDataMode, type LocalizedText,
  type OptionAvailability, type OptionGroupDeclaration, type PermissionDeclaration, type SelectOptionChoice, type ActionDeclaration,
  type ConvertFromDeclarations, type ConvertToDeclarations, type FileExtensionKey, type MediaTypeKey, type FileFormatKey,
  type ElementImportHandler, type FileImportHandler, type FileImportResult, type ElementExportHandler, type FileExportHandler} from "@webwriter/widget"

export * from "@lit-labs/signals"
export {isNumber, isString, isBoolean, isSeries, isTable, hasShape, effectAccepts, type Table, type Series, type SignalShape, type SignalShapes,
  type SignalValue, type SignalDeclaration, type EffectDeclaration, type ReadableSignal} from "@webwriter/widget"

export {WidgetDrawer, type WidgetStorageDestination} from "./widget-drawer"
export {renderWidgetOptionField, renderWidgetOptions} from "./widget-option-controls"
export {widgetOptionControlStyles} from "./widget-option-controls.styles"
export * from "./widget-options"
export {BrowserWidgetResultStorage, HttpWidgetResultStorage, WidgetResultConflict, widgetResultEndpoint} from "./widget-result-storage"
export type {WidgetResult, WidgetResultStorage, WidgetResultType, StoredWidgetResult} from "./widget-result-storage"

/** Lit options also accept Lit reactive property configuration. */
type LitOption<T extends {type?: unknown}> = T & Omit<PropertyDeclaration<NonNullable<T["type"]>>, "type" | "attribute">

export interface BooleanOptionDeclaration extends LitOption<WidgetOptions.BooleanOptionDeclaration> {}
export interface StringOptionDeclaration extends LitOption<WidgetOptions.StringOptionDeclaration> {}
export interface NumberOptionDeclaration extends LitOption<WidgetOptions.NumberOptionDeclaration> {}
export interface DateOptionDeclaration extends LitOption<WidgetOptions.DateOptionDeclaration> {}
export interface DatetimeLocalOptionDeclaration extends LitOption<WidgetOptions.DatetimeLocalOptionDeclaration> {}
export interface EmailOptionDeclaration extends LitOption<WidgetOptions.EmailOptionDeclaration> {}
export interface PasswordOptionDeclaration extends LitOption<WidgetOptions.PasswordOptionDeclaration> {}
export interface TelOptionDeclaration extends LitOption<WidgetOptions.TelOptionDeclaration> {}
export interface TimeOptionDeclaration extends LitOption<WidgetOptions.TimeOptionDeclaration> {}
export interface UrlOptionDeclaration extends LitOption<WidgetOptions.UrlOptionDeclaration> {}
export interface ObjectOptionDeclaration extends LitOption<WidgetOptions.ObjectOptionDeclaration> {}
export interface ColorOptionDeclaration extends LitOption<WidgetOptions.ColorOptionDeclaration> {}
export interface ReferenceOptionDeclaration extends LitOption<WidgetOptions.ReferenceOptionDeclaration> {}
export interface SelectOptionDeclaration extends LitOption<WidgetOptions.SelectOptionDeclaration> {}

export type OptionDeclaration =
| BooleanOptionDeclaration
| StringOptionDeclaration
| NumberOptionDeclaration
| DateOptionDeclaration
| DatetimeLocalOptionDeclaration
| EmailOptionDeclaration
| PasswordOptionDeclaration
| TelOptionDeclaration
| TimeOptionDeclaration
| UrlOptionDeclaration
| ObjectOptionDeclaration
| ColorOptionDeclaration
| SelectOptionDeclaration
| ReferenceOptionDeclaration

const registries = new WeakMap<typeof LitElementWw, CustomElementRegistry>()
// Declaration merging permits both getters and fields in widget subclasses
// without installing accessors that can intercept existing instance writes.
export interface LitElementWw {
  get options(): Record<string, OptionDeclaration> | undefined
  get actions(): Record<string, ActionDeclaration> | undefined
  /** Per-instance editor declarations, including empty maps, override static maps. */
  get permissions(): Record<string, PermissionDeclaration> | undefined
  /** The signals this widget publishes by name. Publish read-only `computed` signals and keep each instance stable. */
  get signals(): Record<string, WidgetOptions.ReadableSignal<any>> | undefined
  /** Per-instance effect declarations override the static map. */
  get effects(): Record<string, WidgetOptions.EffectDeclaration> | undefined
  get optionGroups(): Record<string, OptionGroupDeclaration> | undefined
  /** Per-instance conversions into the widget. They take precedence over the static map. */
  get convertFrom(): ConvertFromDeclarations<this> | undefined
  /** Per-instance conversions out of the widget. They take precedence over the static map. */
  get convertTo(): ConvertToDeclarations<this> | undefined
}

const warnedDeclarations = new WeakMap<Function, Set<string>>()

function warnForDeclarationClashes(widget: LitElementWw) {
  // Lit exposes this set in its development build. Local widget previews can
  // also use the published build of Lit.
  const location = widget.ownerDocument.defaultView?.location
  if(!("litIssuedWarnings" in globalThis) && !["localhost", "127.0.0.1", "[::1]"].includes(location?.hostname ?? "")) return
  const owner = widget.constructor
  let warned = warnedDeclarations.get(owner)
  if(!warned) warnedDeclarations.set(owner, warned = new Set())
  const own = widget as unknown as Record<string, unknown>
  const isMap = (value: unknown) => {
    if(!value || typeof value !== "object") return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  }
  for(const name of ["permissions", "options", "actions", "data", "localize"]) {
    if(warned.has(name)) continue
    let valid: boolean
    try {
      const value = own[name]
      valid = name === "data" ? !Object.hasOwn(widget, name)
        : value === undefined || (name === "localize"
          ? typeof (value as {getLocale?: unknown} | null)?.getLocale === "function"
            && typeof (value as {setLocale?: unknown} | null)?.setLocale === "function"
          : isMap(value) && Object.values(value as object).every(isMap))
    }
    catch { valid = false }
    if(!valid) {
      warned.add(name)
      console.warn(`<${widget.localName}> uses "${name}" for a value that conflicts with the WebWriter widget API.`)
    }
  }
}

/** Optional WebWriter conveniences for Lit widgets. The authored DOM remains
 * authoritative; only registry, readiness, and notification state are retained. */
export class LitElementWw extends SignalWatcher(LitElement) {
  // Wider than CustomElementConstructor: component libraries type properties such as
  // `autocorrect` differently from the DOM library, and their classes have to fit here.
  static scopedElements: Record<string, new (...parameters: any[]) => Element> = {}
  // A text of a static declaration may be a function of the widget, for a text from the widget's own catalog.
  static readonly options: Record<string, Declared<OptionDeclaration>> = {}
  static readonly actions: Record<string, Declared<ActionDeclaration>> = {}
  declare static readonly permissions?: Record<string, Declared<PermissionDeclaration>>
  /** What the widget says about each published signal, by name: its value shape, label and description. */
  declare static readonly signals?: Record<string, WidgetOptions.SignalDeclaration>
  /** The effect attributes the widget can receive, each with the shapes it accepts. */
  declare static readonly effects?: Record<string, WidgetOptions.EffectDeclaration>
  static readonly optionGroups: Record<string, Declared<OptionGroupDeclaration>> = {}
  /** What the widget accepts: a file extension or media type for a file, any other key is an HTML tag. */
  declare static readonly convertFrom?: ConvertFromDeclarations
  /** What the widget produces: a file extension or media type for a file, any other key is an HTML tag. */
  declare static readonly convertTo?: ConvertToDeclarations
  static readonly dataType: string | undefined = undefined

  protected localize?: {getLocale: () => string, setLocale: (locale: string) => Promise<void>}

  constructor() {
    super()
    // The editor reads plain maps. A static declaration with a text that is a function is therefore
    // answered on the instance, with the functions asked. A member a subclass defines itself is left alone,
    // and a later write replaces the accessor, so that an instance field works under both field semantics.
    const declared = this.constructor as unknown as Record<string, Record<string, Declared<object>> | undefined>
    for(const kind of ["options", "actions", "permissions", "optionGroups"] as const) {
      if(kind in this || !hasComputedDeclarations(declared[kind])) continue
      Object.defineProperty(this, kind, {
        configurable: true,
        get: () => resolveDeclarations(this, declared[kind]),
        set: (value: unknown) => Object.defineProperty(this, kind, {value, writable: true, configurable: true, enumerable: true}),
      })
    }
  }

  /** One native registry per concrete widget class, shared by its instances. */
  get registry() {
    const constructor = this.constructor as typeof LitElementWw
    let registry = registries.get(constructor)
    if(!registry) {
      registry = new CustomElementRegistry()
      for(const [name, element] of Object.entries(constructor.scopedElements)) registry.define(name, element as CustomElementConstructor)
      registries.set(constructor, registry)
    }
    return registry
  }

  protected createRenderRoot() {
    const constructor = this.constructor as typeof LitElementWw
    const registry = this.registry
    const root = this.shadowRoot ?? this.attachShadow({...constructor.shadowRootOptions, customElementRegistry: registry})
    adoptStyles(root, constructor.elementStyles)
    this.renderOptions.renderBefore ??= root.firstChild
    const customElementRegistry = (root as ShadowRoot & {customElementRegistry: CustomElementRegistry}).customElementRegistry
    this.renderOptions.creationScope = {
      importNode: (node, deep) => this.ownerDocument.importNode(node, {customElementRegistry, selfOnly: !deep}),
    }
    return root
  }

  get editable() { return this.isContentEditable }

  /** Empty opts into local storage. A URL supplies the initial remote destination. */
  get standalone() { return this.#runtime.standalone }
  set standalone(value: string | null) { this.#runtime.standalone = value }

  /** An explicit lang="" stops inheritance. Inherited values stay off the DOM. */
  get lang(): string { return widgetLanguage(this) }
  set lang(value: string | null) {
    if(value === null || value === undefined) this.removeAttribute("lang")
    else this.setAttribute("lang", value)
  }

  static get observedAttributes() {
    return [...new Set([...super.observedAttributes, ...widgetRuntimeAttributes])]
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    super.attributeChangedCallback(name, oldValue, value)
    if(widgetRuntimeAttributes.includes(name)) this.#runtime.attributeChanged(name, oldValue, value)
  }

  #runtime = new WidgetRuntime(this, {
    language: () => this.lang,
    editable: () => this.editable,
    update: (name, previous) => {
      this.requestUpdate(name, previous)
      if(name === "lang" && this.isConnected && this.localize) {
        const failed = (error: unknown) => {
          this.dispatchEvent(new CustomEvent("localizationerror", {detail: {error}}))
          this.requestUpdate()
        }
        try { void Promise.resolve(this.localize.setLocale(this.lang)).then(() => this.requestUpdate(), failed) }
        catch(error) { failed(error) }
      }
    },
    dataPending: context => this.dataPending(context),
    dataChanged: (value, context) => this.dataChanged(value, context),
    dataError: (error, context) => this.dataError(error, context),
  })

  get widgetRuntime() { return this.#runtime }

  languageChanged() { this.#runtime.contextChanged() }

  get data() { return this.#runtime.data }
  set data(value: string | null) { this.setData(this.dataType ?? "text/plain", value ?? "") }
  get dataType() { return this.#runtime.dataType }
  get dataReady() { return this.#runtime.dataReady }

  /** Update the widget's presentation when the data scope changes. */
  protected dataPending(context: WidgetDataContext): void {}
  protected dataChanged(value: string | null, context: WidgetDataContext): void {}
  protected dataError(error: Error, context: WidgetDataContext): void {}

  /** Updates a data block in place, preserving its identity and attributes. */
  setData(type: string, value: string, attrs: LocalizedText = {}) {
    this.#runtime.setData(type, value, attrs)
  }

  #slotChanged = () => this.requestUpdate()

  connectedCallback() {
    super.connectedCallback()
    warnForDeclarationClashes(this)
    this.renderRoot.addEventListener("slotchange", this.#slotChanged)
    this.#runtime.connect()
  }

  disconnectedCallback() {
    this.#runtime.disconnect()
    this.renderRoot?.removeEventListener("slotchange", this.#slotChanged)
    super.disconnectedCallback()
  }
}
