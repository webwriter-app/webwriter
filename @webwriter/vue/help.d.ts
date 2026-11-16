import type {HelpCore, HelpOptions} from "@webwriter/widget/help"
import type {BindingOptions} from "./base.js"

export type {HelpMessages, HelpSnapshot} from "@webwriter/widget/help"

export type UseHelp = {
  readonly core: HelpCore
  /** Whether the overlay is shown. */
  readonly open: boolean
  /** "labels", or "list" when the widget is too small for labels. Null while closed. */
  readonly form: "labels" | "list" | null
  toggle(force?: boolean): void
  close(): void
}

/** Help. Write `data-ww-help="text"` on the controls and `data-ww-help-toggle` on the button. */
export function useHelp(options?: BindingOptions<HelpOptions>): UseHelp
