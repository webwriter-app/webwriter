import type {DragOptions, DragSnapshot} from "@webwriter/widget/drag"
import type {BindingOptions} from "./base.js"

export type {DragCommitDetail, DragEffect, DragMessages, DragPickDetail, DragViewport} from "@webwriter/widget/drag"

/**
 * React binding of Drag. Mark the JSX with `data-ww-drag`, `data-ww-drop` and
 * so on; listen for `ww-dragcommit` and `ww-dragpick` with `useEvent()`. For a
 * point target that is the window of a canvas viewport
 * (`data-ww-drop-space="world"`), pass `{viewport: viewport.core}`: the commit
 * then reports world coordinates.
 * `rendered` defaults to a promise that settles after React's next commit.
 */
export function useDrag(host: HTMLElement, options?: BindingOptions<DragOptions>): {
  /** The item being dragged or picked up, if any. */
  readonly item: HTMLElement | null
  /** How the item was picked up: by a pointer drag, with the keyboard or by a click. */
  readonly via: DragSnapshot["via"]
}
