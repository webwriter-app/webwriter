import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type PrintMessages } from "./messages/print/index.js";
export { printMessages, type PrintMessages } from "./messages/print/index.js";
/** Options of `PrintNoteCore`. */
export type PrintNoteOptions = CoreOptions & {
    /**
     * The address of the document that the note shows, where a reader finds the interactive version.
     * A function is asked on every render. `null` shows no address. By default `documentAddress()`.
     */
    address?: string | null | (() => string | null | undefined);
    /** Replaces texts of the module. */
    messages?: MessagesOption<PrintMessages>;
};
/** The state of `PrintNoteCore`. */
export type PrintNoteSnapshot = {
    /** The note in the widget's language. */
    readonly text: string;
    /** The address of the document, or null. */
    readonly address: string | null;
};
/**
 * Where the document can be opened online, if that is known: the address in the page's
 * `<link rel="canonical">`, else the address of the page itself if it is a public `http` or `https`
 * address (no loopback or `.test` host), without its fragment. Null otherwise: a document
 * that is open in the editor or from a file has no address to show.
 */
export declare function documentAddress(doc?: Document): string | null;
/**
 * A short note that appears on paper only, for a widget that has no print view: the
 * interactive content is not shown, and the reader is told to open the document
 * online, with its address where known. The text is in the widget's language.
 *
 * The note is a `<p data-ww-print-note>`. The module fills one that the template has, so
 * the widget decides where it goes; without one it adds its own at the end of the shadow root.
 * It is hidden on screen, and shown for the `print` media and while the editor marks the widget
 * with the class `ww-beforeprint`.
 */
export declare class PrintNoteCore extends ModuleCore<PrintNoteSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: PrintNoteOptions);
    getSnapshot(): PrintNoteSnapshot;
    protected onConnect(): void;
    protected onRefresh(): void;
}
