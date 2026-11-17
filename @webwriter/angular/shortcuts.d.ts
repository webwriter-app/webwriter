import type {Signal} from "@angular/core"
import type {ShortcutsCore, ShortcutsOptions} from "@webwriter/widget/shortcuts"
import type {BindingOptions, ModuleRef} from "./base.js"

export type {ShortcutAction, ShortcutKey, ShortcutsMessages, ShortcutsSnapshot} from "@webwriter/widget/shortcuts"

export type ShortcutsBinding = {
  readonly core: ShortcutsCore
  readonly snapshot: ModuleRef<ShortcutsCore>
  /** Actions started by a key that have not finished. */
  readonly running: Signal<readonly string[]>
  /** The keys that run an action, as declared. */
  keysOf(action: string): string[]
  /** The keys of an action as a person reads them on this platform and in the widget's language. Reactive. */
  labelsOf(action: string): string[]
}

/** Binds Shortcuts. The keys are on `static actions`; define the methods with `injectActions()`. A method that returns `false` declines the key. */
export function injectShortcuts(options?: BindingOptions<ShortcutsOptions>): ShortcutsBinding
