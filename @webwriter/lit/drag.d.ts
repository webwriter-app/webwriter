import { DragCore, type DragOptions, type DragSnapshot } from "@webwriter/widget/drag";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export type { DragCommitDetail, DragEffect, DragMessages, DragPickDetail, DragViewport } from "@webwriter/widget/drag";
/**
 * Lit binding of Drag. The markers go on the template; listen for
 * `@ww-dragcommit` where the widget keeps the items in its own model, and for
 * `@ww-dragpick` to filter the targets an item may go to. For a point target
 * that is the window of a canvas viewport (`data-ww-drop-space="world"`), pass
 * `{viewport: viewport.core}`: the commit then reports world coordinates.
 */
export declare class Drag extends CoreController<DragCore> {
    constructor(host: CoreHost, options?: BindingOptions<DragOptions>);
    /** The item being dragged or picked up, if any. */
    get item(): HTMLElement | null;
    /** How the item was picked up: by a pointer drag, with the keyboard or by a click. */
    get via(): DragSnapshot["via"];
}
