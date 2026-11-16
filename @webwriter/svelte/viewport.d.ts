import type {ViewportCore, ViewportOptions} from "@webwriter/widget/viewport"
import type {CoreStore} from "./base.js"

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
  ViewportOptions,
  ViewportPoint,
  ViewportPointerSource,
  ViewportSnapshot,
  ViewportStart,
  ViewportWheel,
  WorldBox,
} from "@webwriter/widget/viewport"

export type ViewportStore = CoreStore<ViewportCore> &
  Pick<ViewportCore, "zoomBy" | "zoomTo" | "panBy" | "fit" | "fitted" | "centerOn" | "setView" | "autoPan" | "autoPanWhile" | "toWorld" | "toClient" | "contentChanged">

export function viewportStore(host: HTMLElement, options?: ViewportOptions): ViewportStore
