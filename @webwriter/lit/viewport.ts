import {
  ViewportCore,
  type ViewportFitCall,
  type ViewportMotion,
  type ViewportOptions,
  type ViewportPoint,
  type ViewportPointerSource,
  type ViewportSnapshot,
} from "@webwriter/widget/viewport"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export type {
  ViewportAdapter,
  ViewportFitCall,
  ViewportFitDetail,
  ViewportFitOptions,
  ViewportFollow,
  ViewportForm,
  ViewportInsets,
  ViewportMessages,
  ViewportMotion,
  ViewportPoint,
  ViewportPointerSource,
  ViewportSnapshot,
  ViewportStart,
  ViewportWheel,
  WorldBox,
} from "@webwriter/widget/viewport"

/**
 * Lit binding of Viewport. Mark the window with `data-ww-viewport` in the
 * template. `x`, `y`, `scale`, `width` and `height` are the current view.
 *
 * The host re-renders when the scale changes. In the canvas form it also
 * re-renders when the position or the size of the window changes, because the
 * widget draws the view itself. In the scroll form the browser moves the
 * content, so scrolling does not cause a render.
 *
 * `fit()`, `fitted()`, `centerOn()` and `setView()` return promises that
 * resolve when the view is there; `ww-viewportfit` on the host announces every
 * fit. See `ViewportCore` for the attributes of the window.
 *
 * `rendered` defaults to the host's `updateComplete`, so the undo step of a
 * saved view stays open until the host has rendered it.
 */
export class Viewport extends CoreController<ViewportCore> {
  #scale = 1

  constructor(host: CoreHost, options: BindingOptions<ViewportOptions> = {}) {
    super(host, root => new ViewportCore(host, {rendered: () => host.updateComplete, ...options, root}))
  }

  /** Where the world's origin is drawn, in CSS pixels from the window's top-left corner. */
  get x(): number {
    return this.snapshot.x
  }
  get y(): number {
    return this.snapshot.y
  }
  /** The scale: 1 is 100 %. */
  get scale(): number {
    return this.snapshot.scale
  }
  /** The zoom limits. */
  get min(): number {
    return this.snapshot.min
  }
  get max(): number {
    return this.snapshot.max
  }
  /** Size of the window in CSS pixels. */
  get width(): number {
    return this.snapshot.width
  }
  get height(): number {
    return this.snapshot.height
  }

  /** Converts a client point to world coordinates. Bound: pass it as the `convert` option of a `PointerGesture`. */
  readonly toWorld = (clientX: number, clientY: number): ViewportPoint => this.core.toWorld(clientX, clientY)
  /** Converts a world point to client coordinates. */
  readonly toClient = (worldX: number, worldY: number): ViewportPoint => this.core.toClient(worldX, worldY)

  /** Multiplies the scale about a client point (default: the centre of the window). */
  zoomBy(factor: number, about?: ViewportPoint) {
    this.core.zoomBy(factor, about)
  }
  /** Sets the scale about a client point (default: the centre of the window). */
  zoomTo(scale: number, about?: ViewportPoint) {
    this.core.zoomTo(scale, about)
  }
  /** Moves the content by CSS pixels. */
  panBy(dx: number, dy: number) {
    this.core.panBy(dx, dy)
  }
  /** Returns to the fitted view. Resolves when it is applied; `fit({follow: "none"})` fits once and leaves the view alone. */
  fit(call?: ViewportFitCall): Promise<ViewportSnapshot> {
    return this.core.fit(call)
  }
  /** Resolves when the view is a fitted one that is up to date: the first fit, or the one after content changed. */
  fitted(): Promise<ViewportSnapshot> {
    return this.core.fitted()
  }
  /** Puts a world point in the centre of the window, and optionally sets the scale. `{animate: true}` glides there. */
  centerOn(point: ViewportPoint, scale?: number, motion?: ViewportMotion): Promise<void> {
    return this.core.centerOn(point, scale, motion)
  }
  /** Sets where the world's origin is drawn and the scale, or only the scale about the centre. */
  setView(view: {x: number; y: number; scale?: number} | {scale: number}, motion?: ViewportMotion): Promise<void> {
    return this.core.setView(view, motion)
  }
  /** One step of panning for a pointer at the edge of the window. Call it once per frame; returns whether the view moved. */
  autoPan(clientX: number, clientY: number): boolean {
    return this.core.autoPan(clientX, clientY)
  }
  /** `autoPan()` every frame while the gesture runs, so that a pointer held still at the edge keeps panning. */
  autoPanWhile(source: ViewportPointerSource): void {
    this.core.autoPanWhile(source)
  }
  /** Canvas form: the extent that `bounds` returns changed without a render. */
  contentChanged() {
    this.core.contentChanged()
  }

  /** Only what a template shows: the scale, and in the canvas form every change of the view. */
  protected override shouldRender(): boolean {
    const scale = this.snapshot.scale
    const changed = scale !== this.#scale
    this.#scale = scale
    return changed || this.core.tracksView
  }
}
