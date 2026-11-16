import type {ViewportCore, ViewportFitCall, ViewportMotion, ViewportOptions, ViewportPoint, ViewportPointerSource, ViewportSnapshot} from "@webwriter/widget/viewport"
import type {BindingOptions} from "./base.js"

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
 * React binding of Viewport: `data-ww-viewport` on the window and an empty
 * `data-ww-viewport-controls=""` element for the buttons. The component
 * renders for a new scale and, in the canvas form, for every change of the view.
 * `fit()`, `fitted()`, `centerOn()` and `setView()` return promises that resolve
 * when the view is there; `ww-viewportfit` on the host announces every fit.
 */
export function useViewport(host: HTMLElement, options?: BindingOptions<ViewportOptions>): {
  /** The core, for the `viewport` option of `useDrag()` and `useScene()`. */
  readonly core: ViewportCore
  /** The view as of the last render. */
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly min: number
  readonly max: number
  readonly width: number
  readonly height: number
  /** Converts a client point to world coordinates. */
  toWorld(clientX: number, clientY: number): ViewportPoint
  /** Converts a world point to client coordinates. */
  toClient(worldX: number, worldY: number): ViewportPoint
  /** Multiplies the scale about a client point (default: the centre of the window). */
  zoomBy(factor: number, about?: ViewportPoint): void
  /** Sets the scale about a client point (default: the centre of the window). */
  zoomTo(scale: number, about?: ViewportPoint): void
  /** Moves the content by CSS pixels. */
  panBy(dx: number, dy: number): void
  /** Returns to the fitted view. Resolves when it is applied; `fit({follow: "none"})` fits once and leaves the view alone. */
  fit(call?: ViewportFitCall): Promise<ViewportSnapshot>
  /** Resolves when the view is a fitted one that is up to date: the first fit, or the one after content changed. */
  fitted(): Promise<ViewportSnapshot>
  /** Puts a world point in the centre of the window, and optionally sets the scale. `{animate: true}` glides there. */
  centerOn(point: ViewportPoint, scale?: number, motion?: ViewportMotion): Promise<void>
  /** Sets where the world's origin is drawn and the scale, or only the scale about the centre. */
  setView(view: {x: number; y: number; scale?: number} | {scale: number}, motion?: ViewportMotion): Promise<void>
  /** One step of panning for a pointer at the edge of the window. Call it once per frame; returns whether the view moved. */
  autoPan(clientX: number, clientY: number): boolean
  /** `autoPan()` every frame while the gesture runs, so that a pointer held still at the edge keeps panning. */
  autoPanWhile(source: ViewportPointerSource): void
  /** Canvas form: the extent that `bounds` returns changed without a render. */
  contentChanged(): void
}
