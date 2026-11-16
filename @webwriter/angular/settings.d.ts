import type {Signal} from "@angular/core"
import type {SettingsCore, SettingsOptions, SettingValue} from "@webwriter/widget/settings"
import type {LocalizedText} from "@webwriter/widget"
import type {BindingOptions, ModuleRef} from "./base.js"

export {parseSetting, serializeSetting, settingAttribute, settingDefault} from "@webwriter/widget/settings"
export type {EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingText, SettingValue, SettingValues} from "@webwriter/widget/settings"

export type SettingsBinding = {
  readonly core: SettingsCore
  readonly snapshot: ModuleRef<SettingsCore>
  readonly values: Signal<Readonly<Record<string, SettingValue | undefined>>>
  /** The settings that are turned off, with the reason where one was given. */
  readonly disabled: Signal<Readonly<Record<string, LocalizedText | true>>>
  /** The value of a setting. Reactive: read it in the template. */
  value(name: string): SettingValue | undefined
  /** Writes a setting as one undo step. Returns false for a value it refuses. */
  set(name: string, value: unknown): boolean
  disabledOf(name: string): LocalizedText | boolean
  /** The label of a setting, or of one of its choices, in the widget's language. */
  labelOf(name: string, choice?: string): string
}

/**
 * Binds Settings. Declarations: the host class's `static settings` or the
 * `declarations` option. The host gets one property per setting and `options`.
 * A label, description or placeholder may be a function of the widget; the
 * editor reads it again when it changes.
 */
export function injectSettings(options?: BindingOptions<SettingsOptions>): SettingsBinding
