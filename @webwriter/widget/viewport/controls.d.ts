import type { ViewportMessages } from "../viewport.js";
/** What a standard button does. */
export type ViewportAction = "out" | "in" | "reset" | "fit";
/** What the buttons show. */
export type ControlsState = {
    scale: number;
    min: number;
    max: number;
    /** No button does anything: the reader may not change the view, or there is no view yet. */
    locked: boolean;
    messages: ViewportMessages;
};
/** The look of the buttons. `:where()` keeps the specificity at zero, so a widget's own rules win. */
export declare const controlsCss = "\n:where([data-ww-viewport-controls]) { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 6px; background: Canvas; color: CanvasText; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15); }\n:where([data-ww-viewport-action]) { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border: 0; border-radius: 4px; background: none; color: inherit; font: 13px/1 system-ui, sans-serif; cursor: pointer; }\n:where([data-ww-viewport-action]:hover:not([aria-disabled=\"true\"])) { background: rgb(0 0 0 / 0.08); }\n:where([data-ww-viewport-action][aria-disabled=\"true\"]) { opacity: 0.4; cursor: default; }\n";
/**
 * Fills every `data-ww-viewport-controls` element that has no buttons yet and
 * brings names, the percent text and the disabled state up to date. A button
 * that can do nothing is marked `aria-disabled`, so it keeps keyboard focus.
 */
export declare function renderControls(root: ShadowRoot, state: ControlsState): void;
/** Removes the buttons the module rendered. */
export declare function removeControls(root: ShadowRoot): void;
/** The action of the standard button a click landed on, unless the button is marked disabled. */
export declare function clickedAction(event: Event, root: ShadowRoot): ViewportAction | null;
