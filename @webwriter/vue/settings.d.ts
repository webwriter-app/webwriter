import type {SettingsCore, SettingsDeclarations, SettingsOptions, SettingsSnapshot, SettingValue, SettingValues} from "@webwriter/widget/settings"
import type {BindingOptions} from "./base.js"

export {formatDuration, parseDuration} from "@webwriter/widget/settings"
export type {EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingText, SettingValue, SettingValues} from "@webwriter/widget/settings"

export type UseSettings<S extends SettingsDeclarations> = {
  readonly core: SettingsCore
  /** The current values, read from the attributes. */
  readonly values: Readonly<SettingValues<S>>
  /** The settings that are turned off, with the reason where one was given. */
  readonly disabled: SettingsSnapshot["disabled"]
  get(name: keyof S & string): SettingValue | undefined
  /** Writes the attribute as one undo step. Returns false for a value the setting refuses. */
  set(name: keyof S & string, value: unknown): boolean
  labelOf(name: keyof S & string, choice?: string): string
}

/**
 * Settings. Besides the composable's return value it puts one accessor per
 * setting and the editor's `options` on the host. `declarations` may be left
 * out for a class with `static settings`. A label, description or placeholder
 * may be a function of the widget; the editor reads it again when it changes.
 */
export function useSettings<const S extends SettingsDeclarations = {}>(
  options?: BindingOptions<SettingsOptions> & {declarations?: S},
): UseSettings<S>
