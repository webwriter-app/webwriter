/** Options of `whileVisible()`. */
export type VisibleOptions = {
    /** The longest time one frame may report, in seconds. A stall is cut down to this. Default 0.1. */
    maxDelta?: number;
};
/** What `whileVisible()` returns. */
export type VisibleLoop = {
    /** True while frames are being delivered: the host is connected, on screen and in a visible tab. */
    readonly running: boolean;
    /** Ends the loop for good and releases the observer and the listeners. Safe to call twice. */
    stop(): void;
};
/**
 * Calls `step(dt)` once per animation frame, with the seconds since the last
 * frame, while the host is connected, on screen and in a visible tab. The
 * first frame after a pause reports no time, so nothing jumps.
 *
 * The loop waits while the host is off screen, removed from the document or
 * in a hidden tab, and goes on by itself when that ends, until `stop()` is
 * called. Create it when the run starts and stop it when the run pauses.
 *
 * Three signals are combined: an `IntersectionObserver` on the host (which
 * also reports that it was removed or inserted), the host's
 * `contentvisibilityautostatechange` event (fired only if the widget's own CSS
 * sets `content-visibility: auto`) and the page visibility state. A host with
 * `display: contents` has no box to observe and counts as on screen.
 */
export declare function whileVisible(host: HTMLElement, step: (dt: number) => unknown, options?: VisibleOptions): VisibleLoop;
