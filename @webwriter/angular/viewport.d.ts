import type {Signal} from "@angular/core"
import type {ViewportCore, ViewportFitCall, ViewportMotion, ViewportOptions, ViewportPoint, ViewportPointerSource, ViewportSnapshot} from "@webwriter/widget/viewport"
import type {BindingOptions, ModuleRef} from "./base.js"

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

export type ViewportBinding = {
  readonly core: ViewportCore
  readonly snapshot: ModuleRef<ViewportCore>
  /** Where the world's origin is drawn, in CSS pixels from the window's top-left corner. */
  readonly x: Signal<number>
  readonly y: Signal<number>
  /** The scale: 1 is 100 %. */
  readonly scale: Signal<number>
  /** The zoom limits. */
  readonly min: Signal<number>
  readonly max: Signal<number>
  /** Size of the window in CSS pixels. */
  readonly width: Signal<number>
  readonly height: Signal<number>
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
  /** Canvas form: the extent that `bounds` returns changed without a render. */
  contentChanged(): void
}

/** Binds Viewport. Each member is a signal of its own value: a template that reads `scale()` does not render for a pan. */
export function injectViewport(options?: BindingOptions<ViewportOptions>): ViewportBinding
