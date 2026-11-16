import type {ShortcutsOptions} from "@webwriter/widget/shortcuts"
import type {BindingOptions} from "./base.js"

export type {ShortcutAction, ShortcutsMessages, ShortcutsSnapshot} from "@webwriter/widget/shortcuts"

/**
 * React binding of Shortcuts. The keys are declared on the class's
 * `static actions`; `handlers` run them (see `useActions()`), each as one undo
 * step that stays open until React rendered. A handler that returns `false`
 * declines the key: it had nothing to do, and the key goes to the next action
 * that has it.
 */
export function useShortcuts(host: HTMLElement, handlers?: Record<string, (...args: any[]) => unknown>, options?: BindingOptions<ShortcutsOptions>): {
  /** Actions started by a key that have not finished. */
  readonly running: readonly string[]
  /** The keys that run an action, as declared. */
  keysOf(action: string): string[]
  /** The keys of an action as a person reads them here: `⌘D` or `Ctrl+D`. */
  labelsOf(action: string): string[]
}
