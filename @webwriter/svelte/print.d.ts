import type {PrintNoteCore, PrintNoteOptions} from "@webwriter/widget/print"
import type {CoreStore} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"
export type {PrintMessages, PrintNoteOptions, PrintNoteSnapshot} from "@webwriter/widget/print"

export type PrintNoteStore = CoreStore<PrintNoteCore>

export function printNoteStore(host: HTMLElement, options?: PrintNoteOptions): PrintNoteStore
