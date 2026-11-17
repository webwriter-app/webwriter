import type {PrintNoteOptions} from "@webwriter/widget/print"
import type {BindingOptions} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"
export type {PrintMessages, PrintNoteOptions, PrintNoteSnapshot} from "@webwriter/widget/print"

/** React binding of the print note, shown on paper only: it adds itself at the end of the shadow root, or fills a `<p data-ww-print-note>` of the template. */
export function usePrintNote(host: HTMLElement, options?: BindingOptions<PrintNoteOptions>): {
  /** The note in the widget's language. */
  readonly text: string
  /** The address of the document that the note shows, or null. */
  readonly address: string | null
}
