import type {HelpOptions} from "@webwriter/widget/help"
import type {BindingOptions} from "./base.js"

export type {HelpMessages, HelpSnapshot} from "@webwriter/widget/help"

/** React binding of Help: `data-ww-help="text"` on the controls, `data-ww-help-toggle=""` on the button. */
export function useHelp(host: HTMLElement, options?: BindingOptions<HelpOptions>): {
  /** Whether the overlay is shown. */
  readonly open: boolean
  /** "labels", or "list" when the widget is too small for labels. Null while closed. */
  readonly form: "labels" | "list" | null
  /** Opens or closes the overlay, for menus. A `data-ww-help-toggle` button needs no code. */
  toggle(force?: boolean): void
  close(): void
}
