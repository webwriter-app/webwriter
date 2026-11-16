import type {SettingValue, SettingValues, SettingsDeclarations, SettingsOptions} from "@webwriter/widget/settings"
import type {LocalizedText} from "@webwriter/widget"

export {formatDuration, parseDuration} from "@webwriter/widget/settings"
export type {EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingText, SettingValue, SettingValues} from "@webwriter/widget/settings"

/** Options of the hook: those of the core that a widget chooses. */
export type SettingsHookOptions = Pick<SettingsOptions, "entryTimeout" | "negativeBooleans" | "messages" | "rendered">

/**
 * React binding of Settings. `declarations` default to the class's
 * `static settings`; declare them once, outside the component, with `as const`
 * to type `values`. Controls marked `data-ww-setting="name"` are bound by the
 * module: leave them uncontrolled. A label, description or placeholder (also of
 * a choice) may be a function of the widget, for a text from the widget's own
 * catalog: `label: (widget: {msg: MsgFn}) => widget.msg("Speed")`. While
 * mounted, the host has the editor's `options` (the class's `static options`,
 * with function texts answered, and one per setting) and a property per setting.
 */
export function useSettings<const S extends SettingsDeclarations = {}>(
  host: HTMLElement,
  declarations?: S,
  options?: SettingsHookOptions,
): {
  /** The current value of every setting. The same object until one changes. */
  readonly values: Readonly<SettingValues<S>>
  /** The settings that are turned off, with the reason where one was given. */
  readonly disabled: Readonly<Record<string, LocalizedText | true>>
  get(name: string): SettingValue | undefined
  /** Writes the attribute as one undo step. False for a value the setting refuses. */
  set(name: string, value: unknown): boolean
  /** The label of a setting, or of one of its choices, in the widget's language. */
  labelOf(name: string, choice?: string): string
  disabledOf(name: string): LocalizedText | boolean
}
