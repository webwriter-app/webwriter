/** One position of a gesture. */
export type GestureSample = {
    /** Position relative to the surface's top-left corner in CSS pixels, or in the coordinates of `convert`. */
    x: number;
    y: number;
    /** Movement since the press, in the same coordinates as `x` and `y`. */
    dx: number;
    dy: number;
    clientX: number;
    clientY: number;
};
/** Options of a `PointerGesture`. */
export type GestureOptions = {
    /** Movement in CSS pixels on the screen before the gesture starts. Below it the press stays a click. */
    threshold?: number;
    /**
     * Converts a client position into the coordinates the samples are delivered
     * in, for example `(x, y) => viewport.toWorld(x, y)`. It is asked for every
     * sample, so a view that moves during the gesture is followed; `dx` and `dy`
     * are measured from the converted position of the press.
     * Default: relative to the surface's top-left corner.
     */
    convert?: (clientX: number, clientY: number) => {
        x: number;
        y: number;
    };
};
/**
 * One pointer sequence, from press to release. Iterate it to receive at most one
 * sample per animation frame. The loop ends on release or cancel. The gesture owns
 * all listeners and removes them when it ends.
 */
export declare class PointerGesture implements AsyncIterable<GestureSample> {
    #private;
    readonly surface: HTMLElement;
    readonly down: PointerEvent;
    /** True once the pointer moved past the threshold. */
    moved: boolean;
    /** True if the gesture ended by Escape, pointercancel, lost capture, blur or cancel(). */
    cancelled: boolean;
    /** The most recent sample. */
    last: GestureSample;
    constructor(surface: HTMLElement, down: PointerEvent, options?: GestureOptions);
    /** Aborts when the gesture is over, by release or by cancel. */
    get ended(): AbortSignal;
    /** Ends the gesture as cancelled. */
    cancel(): void;
    [Symbol.asyncIterator](): AsyncGenerator<GestureSample>;
}
