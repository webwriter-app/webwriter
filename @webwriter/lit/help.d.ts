import { HelpCore, type HelpOptions } from "@webwriter/widget/help";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export type { HelpMessages, HelpSnapshot } from "@webwriter/widget/help";
/**
 * Lit binding of Help. Write `data-ww-help="text"` on the controls and
 * `data-ww-help-toggle` on the button in the template. `open` is reactive.
 */
export declare class Help extends CoreController<HelpCore> {
    constructor(host: CoreHost, options?: BindingOptions<HelpOptions>);
    /** Whether the overlay is shown. */
    get open(): boolean;
    /** "labels", or "list" when the widget is too small for labels. Null while closed. */
    get form(): "labels" | "list" | null;
    /** Opens or closes the overlay, for menus. A `data-ww-help-toggle` button needs no code. */
    toggle(force?: boolean): void;
    /** Closes the overlay. */
    close(): void;
}
