import type {LitElement, PropertyDeclaration} from "lit"
import {resolveDeclarations} from "@webwriter/widget"
import {
  SettingsCore,
  normalizeSetting,
  parseSetting,
  sameSetting,
  serializeSetting,
  settingAttribute,
  settingDefault,
  type EditorOption,
  type SettingDeclaration,
  type SettingsDeclarations,
  type SettingsOptions,
  type SettingValue,
  type SettingValues,
} from "@webwriter/widget/settings"

export type {EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingText, SettingValue, SettingValues} from "@webwriter/widget/settings"

// A mixin's constructor has to take any arguments; TypeScript requires `any[]` for that.
type Constructor<T = object> = new (...args: any[]) => T

/** What the mixin adds to a widget, besides one property per setting. */
export type SettingsHost = {
  /** The core: `set(name, value)` writes a setting as one undo step, `labelOf(name)` gives its label in the widget's language. */
  readonly settingsCore: SettingsCore
  /** The editor's option declarations: the class's `static options` and one per setting. */
  readonly options: Record<string, EditorOption>
}

/**
 * Options of the mixin: those of the core that a widget chooses. A boolean
 * that defaults to true is declared to the editor with its negative attribute
 * and `inverted: true`; `negativeBooleans: "property"` declares it with
 * `attribute: false` instead, for an editor that does not know `inverted`.
 */
export type SettingsMixinOptions = Pick<SettingsOptions, "entryTimeout" | "negativeBooleans" | "messages">

type LitClass = typeof LitElement & {settings?: SettingsDeclarations; options?: Record<string, EditorOption>}

const stored = new WeakMap<object, Record<string, SettingValue | undefined>>()
const defined = new WeakSet<object>()

/** One reflected reactive property, with the setting's converter and validation in its setter. */
function defineSetting(Class: LitClass, name: string, declaration: SettingDeclaration) {
  const options: PropertyDeclaration = {
    attribute: settingAttribute(name, declaration),
    reflect: true,
    noAccessor: true,
    converter: {
      fromAttribute: (text: string | null) => parseSetting(declaration, text),
      toAttribute: (value: unknown) => serializeSetting(declaration, value),
    },
  }
  Class.createProperty(name, options)
  Object.defineProperty(Class.prototype, name, {
    get(this: LitElement) {
      const values = stored.get(this)
      return values && name in values ? values[name] : settingDefault(declaration)
    },
    set(this: LitElement & Record<string, unknown>, value: unknown) {
      const old = this[name] as SettingValue | undefined
      const next = normalizeSetting(declaration, value, old)
      // A list that holds the same choices stays the same object, so that nothing updates.
      if(sameSetting(next, old)) return
      const values = stored.get(this) ?? stored.set(this, {}).get(this)!
      values[name] = next
      this.requestUpdate(name, old)
    },
    configurable: true,
    enumerable: true,
  })
}

/**
 * Settings for a Lit widget. Each declared setting becomes a reflected
 * reactive property, an entry of the editor's `options` and the source of the
 * controls marked `data-ww-setting="name"`. Pass the declarations to the
 * mixin, which also types the properties, choices as unions:
 *
 *     class Sim extends Settings(LitElementWw, {
 *         population: {type: Number, default: 200, min: 10, max: 2000},
 *         showChart: {type: Boolean, default: true},      // stored as no-show-chart, declared with inverted: true
 *     }) {}
 *
 * A label, description or placeholder may be a function of the widget, for a
 * text from the widget's own catalog. The editor reads it again when it changes:
 *
 *     speed: {type: Number, label: (widget: {msg: MsgFn}) => widget.msg("Speed")}
 *
 * `static settings = {…}` on a class that extends `Settings(LitElementWw)`
 * does the same, but TypeScript then needs a `declare` for every property.
 */
export function Settings<Base extends Constructor<LitElement>, const S extends SettingsDeclarations = {}>(base: Base, declarations?: S, options: SettingsMixinOptions = {}) {
  class WithSettings extends base {
    static settings: SettingsDeclarations | undefined = declarations

    // Lit calls this once per class before it reads `static properties`.
    static finalize(this: LitClass) {
      if(!defined.has(this)) {
        defined.add(this)
        const own = Object.hasOwn(this, "settings") ? this.settings : undefined
        for(const [name, declaration] of Object.entries(own ?? {})) defineSetting(this, name, declaration)
      }
      ;(base as unknown as {finalize(): void}).finalize.call(this)
    }

    readonly settingsCore = new SettingsCore(this, {...options, root: () => this.renderRoot as ShadowRoot, rendered: () => this.updateComplete})

    constructor(...args: any[]) {
      super(...args)
      const Class = this.constructor as LitClass
      // As for a property with an initializer, the first `changed` map holds every setting.
      // Nothing is reflected for it: a default is never written to the document.
      for(const name of Object.keys(Class.settings ?? {})) this.requestUpdate(name, undefined, {...Class.getPropertyOptions(name), reflect: false})
      const core = this.settingsCore
      this.addController({
        hostConnected: () => core.connect(),
        hostDisconnected: () => core.disconnect(),
        hostUpdated: () => core.refresh(),
      })
    }

    get options(): Record<string, EditorOption> {
      // The class's own options may have texts that are functions; the editor gets their answers.
      return {...resolveDeclarations(this, (this.constructor as LitClass).options as never), ...this.settingsCore.editorOptions()} as Record<string, EditorOption>
    }
  }
  return WithSettings as unknown as Base & Constructor<SettingsHost & SettingValues<S>> & {settings?: SettingsDeclarations}
}
