import type {ShortcutsCore, ShortcutsOptions} from "@webwriter/widget/shortcuts"
import type {BindingOptions} from "./base.js"

export type {ShortcutAction, ShortcutKey, ShortcutsMessages, ShortcutsSnapshot} from "@webwriter/widget/shortcuts"

export type UseShortcuts = {
  readonly core: ShortcutsCore
  /** Actions started by a key that have not finished. */
  readonly running: readonly string[]
  keysOf(action: string): string[]
  /** The keys as a person reads them: `⌘D` or `Ctrl+D`. */
  labelsOf(action: string): string[]
}

/**
 * Shortcuts. Declare the keys on the class's `static actions`; the component
 * hands the methods to the host with `defineExpose({action})`.
 */
export function useShortcuts(options?: BindingOptions<ShortcutsOptions>): UseShortcuts
