import {ShortcutsCore, type ShortcutsOptions} from "@webwriter/widget/shortcuts"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export type {ShortcutAction, ShortcutKey, ShortcutsMessages, ShortcutsSnapshot} from "@webwriter/widget/shortcuts"

/**
 * Lit binding of Shortcuts. The keys are declared on `static actions`; the
 * undo step of an action stays open until the host has rendered. A button
 * marked `data-ww-shortcut="action"` gets its `aria-keyshortcuts`.
 */
export class Shortcuts extends CoreController<ShortcutsCore> {
  constructor(host: CoreHost, options: BindingOptions<ShortcutsOptions> = {}) {
    super(host, root => new ShortcutsCore(host, {rendered: () => host.updateComplete, ...options, root}))
  }

  /** The keys that run an action, as declared. Empty for an action that cannot run from a key. */
  keysOf(action: string): string[] {
    return this.core.keysOf(action)
  }

  /** The keys of an action as a person reads them on this platform and in the widget's language: `⌘D` or `Ctrl+D`. */
  labelsOf(action: string): string[] {
    return this.core.labelsOf(action)
  }

  /** Actions started by a key that have not finished. */
  get running(): readonly string[] {
    return this.snapshot.running
  }
}
