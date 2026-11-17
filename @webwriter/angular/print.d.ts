import type {Signal} from "@angular/core"
import type {PrintNoteCore, PrintNoteOptions} from "@webwriter/widget/print"
import type {BindingOptions, ModuleRef} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"
export type {PrintMessages, PrintNoteOptions, PrintNoteSnapshot} from "@webwriter/widget/print"

export type PrintNoteBinding = {
  readonly core: PrintNoteCore
  readonly snapshot: ModuleRef<PrintNoteCore>
  /** The note in the widget's language. */
  readonly text: Signal<string>
  /** The address of the document that the note shows, or null. */
  readonly address: Signal<string | null>
}

/** Binds the print note, shown on paper only. */
export function injectPrintNote(options?: BindingOptions<PrintNoteOptions>): PrintNoteBinding
