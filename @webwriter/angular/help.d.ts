import type {Signal} from "@angular/core"
import type {HelpCore, HelpOptions} from "@webwriter/widget/help"
import type {BindingOptions, ModuleRef} from "./base.js"

export type {HelpMessages, HelpSnapshot} from "@webwriter/widget/help"

export type HelpBinding = {
  readonly core: HelpCore
  readonly snapshot: ModuleRef<HelpCore>
  /** Whether the overlay is shown. */
  readonly open: Signal<boolean>
  /** "labels", or "list" when the widget is too small for labels. Null while closed. */
  readonly form: Signal<"labels" | "list" | null>
  toggle(force?: boolean): void
  close(): void
}

/** Binds Help. Write `data-ww-help="text"` on the controls and `data-ww-help-toggle` on the button. */
export function injectHelp(options?: BindingOptions<HelpOptions>): HelpBinding
