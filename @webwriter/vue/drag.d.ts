import type {DragCore, DragOptions, DragSnapshot} from "@webwriter/widget/drag"
import type {BindingOptions} from "./base.js"

export type {DragCommitDetail, DragEffect, DragMessages, DragPickDetail, DragViewport} from "@webwriter/widget/drag"

export type UseDrag = {
  readonly core: DragCore
  /** The item being dragged or picked up, if any. */
  readonly item: HTMLElement | null
  /** How the item was picked up. */
  readonly via: DragSnapshot["via"]
}

/** Drag. For a point target that is the window of a canvas viewport (`data-ww-drop-space="world"`) pass `{viewport: viewport.core}`: the commit then reports world coordinates. The markers go on the template; listen with `onWwDragcommit` and `onWwDragpick` (`@ww-dragcommit` in a template). */
export function useDrag(options?: BindingOptions<DragOptions>): UseDrag
