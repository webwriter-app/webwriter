import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type ViewportMessages } from "./messages/viewport/index.js";
export { viewportMessages, type ViewportMessages } from "./messages/viewport/index.js";
export type { ViewportAction } from "./viewport/controls.js";
/** A rectangle in world coordinates. */
export type WorldBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** A point, in client or in world coordinates. */
export type ViewportPoint = {
    x: number;
    y: number;
};
/**
 * What a library that owns its viewport (vis-network, Cytoscape, Leaflet, …)
 * provides so that the standard buttons and keys can drive it. Create it once
 * per library instance: the module subscribes when it first sees the object.
 */
export type ViewportAdapter = {
    /** The library's current scale. 1 is 100 %. */
    readonly scale: number;
    /** The library's zoom limits. */
    readonly min: number;
    readonly max: number;
    /** Multiplies the scale, about the centre of the library's view. The library applies its own limits. */
    zoomBy(factor: number): void;
    /** Shows all of the content. */
    fit(): void;
    /** Calls `changed` after every change of the scale or of the limits. Returns the function that stops it. */
    subscribe(changed: () => void): () => void;
};
/** What the plain wheel does over the window. Ctrl or Cmd with the wheel (and a pinch on a trackpad) always zooms. */
export type ViewportWheel = "pan" | "zoom" | "page";
/** What a fitted view does when the window or the content changes size. */
export type ViewportFollow = "all" | "window" | "none";
/** Parts of the window that content must keep clear of, in CSS pixels. */
export type ViewportInsets = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
};
/** How a fit places the content (canvas form: all of it; scroll form: only `maxScale`, `follow`). */
export type ViewportFitOptions = {
    /** Room kept free around the content on every side, in CSS pixels. Default: 0. */
    padding?: number;
    /** A part of the window that something else covers, such as a drawer: the content is fitted into the rest. A number is all four sides. */
    inset?: number | ViewportInsets;
    /** The largest scale a fit may choose, for content that is small. Default: the zoom limit. */
    maxScale?: number;
    /** The box that is fitted instead of `bounds`, in world coordinates. Null or undefined: `bounds`. The fit button of the controls uses it too. */
    target?: () => WorldBox | null | undefined;
    /** When a fitted view fits again by itself. See `ViewportCore`. Default: `"all"`. */
    follow?: ViewportFollow;
};
/** The view a window opens with: asked once, when the window first has a size. */
export type ViewportStart = 
/** The fitted view, as if no start view was given. */
"fit"
/** This world point in the centre of the window. `scale` defaults to 1. */
 | {
    centre: ViewportPoint;
    scale?: number;
}
/** This view: where the world's origin is drawn, in CSS pixels from the window's top-left corner. `scale` defaults to 1. */
 | {
    x: number;
    y: number;
    scale?: number;
}
/** This box of the world, fitted like `fit()` does it. The view stays there until something changes it. */
 | {
    box: WorldBox;
};
/** Motion of a call that sets the view. Without it the view jumps. */
export type ViewportMotion = {
    /** `true`: 350 ms. A number: that many milliseconds. Never animated under `prefers-reduced-motion: reduce`. `centerOn()` and `setView()` animate in the canvas and scroll forms, `fit()` only in the canvas form. */
    animate?: boolean | number;
};
/** Options of `fit()`. */
export type ViewportFitCall = ViewportMotion & {
    /** For this fit only: what the fitted view does afterwards. `"none"` is "fit once, then leave the view alone". */
    follow?: ViewportFollow;
    /** Fit this box instead of the content. The view then stays where it is until something changes it. */
    box?: WorldBox;
};
/** `detail` of `ww-viewportfit`, dispatched on the host after a fit has been applied. */
export type ViewportFitDetail = ViewportSnapshot & {
    /** `open`: the first view. `request`: `fit()`, the button or the key. `follow`: the content or the window changed size. */
    reason: "open" | "request" | "follow";
};
/** What `autoPan()` and `autoPanWhile()` read: a pointer position that changes, until `ended` aborts. A `PointerGesture` is one. */
export type ViewportPointerSource = {
    readonly last: {
        readonly clientX: number;
        readonly clientY: number;
    };
    readonly ended: AbortSignal;
};
/** Options of `ViewportCore`. */
export type ViewportOptions = CoreOptions & {
    /**
     * Asked before input changes the view: wheel, drag, pinch, keys and buttons,
     * and again while a drag runs and before a view is saved. Return false to
     * lock the view. The methods of the core are the widget's own and not gated.
     */
    can?: () => boolean;
    /** Asked, after `can`, before the view is written to the `data-ww-viewport-save` attribute. Default: always. */
    canSave?: () => boolean;
    /**
     * Canvas form: the extent of the content in world coordinates. Fit shows it,
     * and panning is limited to it. Without it fit is 100 % at the origin and
     * panning is unlimited. Call `contentChanged()` when the answer changes
     * without a render.
     */
    bounds?: () => WorldBox | null | undefined;
    /** Canvas form: how far past each edge of `bounds` the content can be panned, in CSS pixels. Default: 0. */
    margin?: number;
    /**
     * What the plain wheel does, for a window without `data-ww-viewport-wheel`.
     * `"pan"` (default) pans. `"zoom"` zooms about the pointer. `"page"` leaves
     * it to the page (canvas form; a scroll container scrolls natively).
     */
    wheel?: ViewportWheel;
    /** Padding, inset, largest scale, target and follow of a fit. A function is asked at every fit, for a value that changes. Attributes of the window win. */
    fit?: ViewportFitOptions | (() => ViewportFitOptions);
    /** The first view, for a window without `data-ww-viewport-start`. Asked once, and not while a saved view opens. */
    start?: ViewportStart | (() => ViewportStart | null | undefined);
    /** What a resize of the window keeps still when the view is not fitted: the screen offset of the world (default), or the world point in the centre. Attribute `data-ww-viewport-resize`. */
    resize?: "offset" | "centre";
    /** The view of a library, for a window marked `data-ww-viewport="external"`. Asked after every render. */
    adapter?: () => ViewportAdapter | null | undefined;
    /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step of a save open until then. */
    rendered?: () => Promise<unknown>;
    /** Replaces texts of the module. */
    messages?: MessagesOption<ViewportMessages>;
};
/**
 * The view. A world point `w` is drawn at `w * scale + (x, y)`, in CSS pixels
 * from the top-left corner of the window. `width` and `height` are the size of
 * the window. In the external form `x` and `y` stay 0: the library owns them.
 */
export type ViewportSnapshot = {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly min: number;
    readonly max: number;
    readonly width: number;
    readonly height: number;
};
/** How a window is driven: by its scroll position, by the view the module tracks, or by a library. */
export type ViewportForm = "scroll" | "canvas" | "external";
/**
 * Zoom, fit and the zoom buttons for the one window marked `data-ww-viewport`.
 *
 * Scroll form (the default): the window is a native scroll container. Panning
 * is its scroll position, and zoom is the CSS `zoom` of its first child, set
 * in the module's own style sheet, so nothing is written to the template.
 *
 * Canvas form (`<canvas data-ww-viewport>`, or `data-ww-viewport="canvas"` on
 * any element): there is nothing to scroll, so the module keeps `{x, y, scale}`
 * itself and the widget, or its renderer, applies it. A renderer reads the
 * view with `getSnapshot()`, follows it with `subscribe()`, reports the extent
 * of its content with the `bounds` option and `contentChanged()`, and converts
 * pointer positions with `toWorld()`.
 *
 * External form (`data-ww-viewport="external"` with the `adapter` option): a
 * library owns the view and its input. The module binds the standard buttons
 * and the keys `+`, `−` and `0` to it and reports its scale.
 *
 * `can` gates input. The methods of this class are the widget's own code and
 * always work.
 *
 * Attributes on the window (each also has an option, and the attribute wins):
 * - `data-ww-viewport-wheel="pan|zoom|page"`: the plain wheel pans (default),
 *   zooms about the pointer, or is left to the page (canvas form). Ctrl or
 *   Cmd with the wheel zooms in every case.
 * - `data-ww-viewport-start="fit"` or `"x y scale"`: the first view, a world
 *   point for the centre of the window and the scale, as in
 *   `data-ww-viewport-save`. Applied once, when the window first has a size,
 *   and not over a saved view.
 * - `data-ww-viewport-fit-padding="px"`, `data-ww-viewport-fit-max="scale"`,
 *   `data-ww-viewport-fit-inset="top right bottom left"` (one to four numbers,
 *   as CSS margins): the room around fitted content, the largest scale of a
 *   fit, and the part of the window that something else covers.
 * - `data-ww-viewport-follow="all|window|none"`: see below.
 * - `data-ww-viewport-resize="offset|centre"`: see below.
 *
 * When a fitted view fits again. A view is "fitted" from the first view (when
 * there is no saved or start view) or from `fit()`, the fit button and the
 * `0` key, until something else changes it: a zoom, a pan, a pinch, `zoomTo`,
 * `zoomBy`, `panBy`, `setView`, `centerOn` or a start or saved view. While it
 * is fitted and `follow` is `"all"` (default), it fits again whenever the
 * window or the extent of the content (the fit `target`, else `bounds`)
 * changes size; `"window"` follows only the window; `"none"` never fits
 * again: "fit once, then leave the view alone", also as `fit({follow:
 * "none"})` for a single fit. A view that is not fitted is only kept inside
 * the limits. When the window resizes, a view that is not fitted keeps the
 * world's screen offset, or with `resize: "centre"` the world point in the
 * centre of the window.
 *
 * Fits are announced: `ww-viewportfit` on the host (detail `ViewportFitDetail`)
 * after every fit, and `fitted()` is a promise for a settled fitted view.
 * `centerOn()`, `setView()` and `fit()` can animate; `autoPan()` pans a view
 * while a pointer, also one in a drag that began elsewhere, is held at the
 * edge of the window.
 */
export declare class ViewportCore extends ModuleCore<ViewportSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: ViewportOptions);
    getSnapshot(): ViewportSnapshot;
    /** The form of the window, or null while the template has none. */
    get form(): ViewportForm | null;
    /** True in the canvas form, where the module owns the position and every change of it has to be drawn. */
    get tracksView(): boolean;
    /**
     * Converts a client point, such as `event.clientX/Y`, to world coordinates.
     * It is bound, so it can be passed on: `new PointerGesture(surface, event,
     * {convert: viewport.toWorld})` delivers its samples in world coordinates
     * and follows a view that changes during the gesture. In the external form
     * the library converts; the point is returned as it is.
     */
    readonly toWorld: (clientX: number, clientY: number) => ViewportPoint;
    /** Converts a world point to client coordinates: the inverse of `toWorld()`. Bound, like `toWorld`. */
    readonly toClient: (worldX: number, worldY: number) => ViewportPoint;
    /** Sets the scale. The world point under `about` (a client point, default: the centre) stays where it is. */
    zoomTo(scale: number, about?: ViewportPoint): void;
    /** Multiplies the scale. See `zoomTo()`. */
    zoomBy(factor: number, about?: ViewportPoint): void;
    /** Moves the content by CSS pixels. Does nothing in the external form. */
    panBy(dx: number, dy: number): void;
    /**
     * Returns to the fitted view: the content (the fit `target`, else
     * `bounds`) in the window, with the padding, inset and largest scale of
     * `fit`. Resolves with the view once it is applied, after the animation
     * if `animate` is given. In the external form the library fits.
     */
    fit(call?: ViewportFitCall): Promise<ViewportSnapshot>;
    /**
     * Resolves with the view when the window has a size and the view is a
     * fitted one that is up to date: at once if it is, else after the fit that
     * makes it so (the first one, or the next after the view was changed by
     * something else). Rejects with an `AbortError` if the core disconnects
     * first. For code that has to wait for the first fit, or for the fit after
     * content changed; the same moment is announced by `ww-viewportfit`.
     */
    fitted(): Promise<ViewportSnapshot>;
    /**
     * Puts this world point in the centre of the window, and optionally sets
     * the scale (within the limits). The view is then no longer a fitted one.
     * Called before the window has a size, it is applied when it opens.
     * Resolves when the view is there; an animation that something else
     * interrupts resolves at that moment. External form: does nothing.
     */
    centerOn(point: ViewportPoint, scale?: number, motion?: ViewportMotion): Promise<void>;
    /**
     * Sets the view: where the world's origin is drawn (`x`, `y`, in CSS pixels
     * from the window's top-left corner) and the scale. With only `scale` the
     * world point in the centre stays there. The view is then no longer a
     * fitted one. Otherwise like `centerOn()`.
     */
    setView(view: {
        x: number;
        y: number;
        scale?: number;
    } | {
        scale: number;
    }, motion?: ViewportMotion): Promise<void>;
    /**
     * One step of panning for a pointer held at the edge of the window: the
     * view moves towards what lies beyond, faster the closer the pointer is to
     * the edge. Call it once per animation frame with the pointer's client
     * position, for a drag that began outside the window (a gate from a
     * sidebar) or inside it. Does nothing for a pointer outside the window.
     * Returns whether the view moved. Panning stops at the limits.
     */
    autoPan(clientX: number, clientY: number): boolean;
    /** `autoPan()` once per animation frame while `source` (a `PointerGesture`) runs, so that a pointer held still at the edge keeps panning. */
    autoPanWhile(source: ViewportPointerSource): void;
    /**
     * Canvas form: tells the viewport that the extent `bounds()` returns
     * changed. A fitted view fits again, and any other view is brought back
     * inside the limits. A render does the same.
     */
    contentChanged(): void;
    protected onConnect(): void;
    protected onRefresh(): void;
}
