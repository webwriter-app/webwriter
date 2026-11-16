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

export type UseViewport = {
  readonly core: ViewportCore
  /** Where the world's origin is drawn, in CSS pixels. A template that reads only `scale` does not render on scrolling. */
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly min: number
  readonly max: number
  /** Size of the window in CSS pixels. */
  readonly width: number
  readonly height: number
  toWorld(clientX: number, clientY: number): ViewportPoint
  toClient(worldX: number, worldY: number): ViewportPoint
  zoomBy(factor: number, about?: ViewportPoint): void
  zoomTo(scale: number, about?: ViewportPoint): void
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
  contentChanged(): void
}

/** Viewport. Mark the window with `data-ww-viewport` in the template. */
export function useViewport(options?: BindingOptions<ViewportOptions>): UseViewport
