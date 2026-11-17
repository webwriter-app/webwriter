import { PrintNoteCore, type PrintNoteOptions } from "@webwriter/widget/print";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export { documentAddress, type PrintMessages, type PrintNoteOptions, type PrintNoteSnapshot } from "@webwriter/widget/print";
/**
 * Lit binding of the print note: a short, localized note that is shown on paper only, for a widget
 * that has no print view. It tells the reader to open the document online, with the document's
 * address where it is known. Create it once; the note is added at the end of the shadow root, or fills a
 * `<p data-ww-print-note></p>` of the template.
 */
export declare class PrintNote extends CoreController<PrintNoteCore> {
    constructor(host: CoreHost, options?: BindingOptions<PrintNoteOptions>);
    /** The note in the widget's language. */
    get text(): string;
    /** The address of the document that the note shows, or null. */
    get address(): string | null;
}
