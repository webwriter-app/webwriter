import type {EditorOption, SettingsCore, SettingsDeclarations, SettingsOptions, SettingValues} from "@webwriter/widget/settings"
import type {CoreStore} from "./base.js"

export type {EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingsOptions, SettingsSnapshot, SettingText, SettingValue, SettingValues} from "@webwriter/widget/settings"
export {normalizeSetting, parseSetting, serializeSetting, settingAttribute, settingDefault} from "@webwriter/widget/settings"

type Constructor<T = object> = new (...args: any[]) => T

/** What `withSettings()` adds to the element, besides one property per setting. */
export type SettingsHost = {
  /** The core: `set(name, value)` writes a setting as one undo step. */
  readonly settingsCore: SettingsCore
  /** The editor's option declarations: the class's `static options` and one per setting. */
  readonly options: Record<string, EditorOption>
}

/** The options of the mixin: the core's, except those the mixin sets. */
export type SettingsMixinOptions = Pick<SettingsOptions, "entryTimeout" | "negativeBooleans" | "messages">

/** Adds the settings to a custom element class, for `customElement.extend`. */
export function withSettings<Base extends Constructor<HTMLElement>, const S extends SettingsDeclarations = {}>(
  Base: Base,
  declarations?: S,
  options?: SettingsMixinOptions,
): Base & Constructor<SettingsHost & SettingValues<S>> & {settings?: SettingsDeclarations}

export type SettingsStore = CoreStore<SettingsCore> & Pick<SettingsCore, "set" | "labelOf">

/** Binds the settings that `withSettings()` added to the host. */
export function settingsStore(host: HTMLElement): SettingsStore
