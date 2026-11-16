import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type HelpMessages } from "./messages/help/index.js";
export { helpMessages, type HelpMessages } from "./messages/help/index.js";
export { connector, layoutLabels } from "./help/layout.js";
export type { Box, LabelItem, LabelPlacement, Line, Side } from "./help/layout.js";
/** Options of `HelpCore`. */
export type HelpOptions = CoreOptions & {
    /** Tether labels with CSS anchor positioning. Default: whether the browser supports it. */
    anchor?: boolean;
    /** Replaces texts of the module. */
    messages?: MessagesOption<HelpMessages>;
};
/** The state of `HelpCore`. */
export type HelpSnapshot = {
    readonly open: boolean;
    /** How the open overlay shows the texts: labels next to the elements, or a numbered list. */
    readonly form: "labels" | "list" | null;
};
/**
 * An overlay with one label per visible element marked `data-ww-help="text"`.
 * A button marked `data-ww-help-toggle` opens and closes it.
 *
 * The layer is rebuilt from the live template on every layout and nothing of
 * it is kept in between, so a render of the widget can neither stale nor lose
 * it. While the overlay is open, each element is described by its label:
 * `aria-describedby` on the element, which is the only thing written to the
 * template, and for a custom element also on the control inside its open
 * shadow tree, which is what assistive technology reads.
 *
 * While it is open, the module compares the rectangles of the marked elements
 * once per animation frame and lays out again when one of them moved, so the
 * labels follow a resize, fullscreen, scrolling and animations alike. Escape
 * closes it from wherever the focus is. Neither exists while it is closed.
 */
export declare class HelpCore extends ModuleCore<HelpSnapshot> {
    #private;
    /** Tether labels with CSS anchor positioning. Without it every label is placed from measured rectangles. */
    anchor: boolean;
    constructor(host: HTMLElement, options?: HelpOptions);
    getSnapshot(): HelpSnapshot;
    /** Opens or closes the overlay. For menus; a `data-ww-help-toggle` button needs no code. */
    toggle(force?: boolean): void;
    /** Closes the overlay. */
    close(): void;
    protected onConnect(): void;
    protected onRefresh(): void;
}
