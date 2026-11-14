import {LitElement, adoptStyles, type PropertyDeclaration} from "lit"
import {SignalWatcher} from "@lit-labs/signals"
import type * as WidgetOptions from "@webwriter/widget"
import {WidgetRuntime, widgetLanguage, widgetRuntimeAttributes, type WidgetDataContext,
  type LocalizedText, type ActionDeclaration, type OptionGroupDeclaration, type PermissionDeclaration} from "@webwriter/widget"

export {isDataBlockType, type WidgetDataContext, type WidgetDataMode, type LocalizedText,
  type OptionAvailability, type OptionGroupDeclaration, type PermissionDeclaration, type SelectOptionChoice, type ActionDeclaration} from "@webwriter/widget"

export * from "@lit-labs/signals"

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

/** Optional WebWriter conveniences for Lit widgets. The authored DOM remains
 * authoritative; only registry, readiness, and notification state are retained. */
export class LitElementWw extends SignalWatcher(LitElement) {
  static scopedElements: Record<string, CustomElementConstructor> = {}
  static readonly options: Record<string, OptionDeclaration> = {}
  static readonly actions: Record<string, ActionDeclaration> = {}
  declare static readonly permissions?: Record<string, PermissionDeclaration>
  static readonly optionGroups: Record<string, OptionGroupDeclaration> = {}
  static readonly dataType: string | undefined = undefined

  /** Per-instance editor declarations, including empty maps, override static maps. */
  declare readonly options?: Record<string, OptionDeclaration>
  declare readonly actions?: Record<string, ActionDeclaration>
  declare readonly permissions?: Record<string, PermissionDeclaration>
  declare readonly optionGroups?: Record<string, OptionGroupDeclaration>
  protected localize?: {getLocale: () => string, setLocale: (locale: string) => Promise<void>}

  /** One native registry per concrete widget class, shared by its instances. */
  get registry() {
    const constructor = this.constructor as typeof LitElementWw
    let registry = registries.get(constructor)
    if(!registry) {
      registry = new CustomElementRegistry()
      for(const [name, element] of Object.entries(constructor.scopedElements)) registry.define(name, element)
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
    this.renderRoot.addEventListener("slotchange", this.#slotChanged)
    this.#runtime.connect()
  }

  disconnectedCallback() {
    this.#runtime.disconnect()
    this.renderRoot?.removeEventListener("slotchange", this.#slotChanged)
    super.disconnectedCallback()
  }
}
