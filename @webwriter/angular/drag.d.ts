import type {Signal} from "@angular/core"
import type {DragCore, DragOptions, DragSnapshot} from "@webwriter/widget/drag"
import type {BindingOptions, ModuleRef} from "./base.js"

export type {DragCommitDetail, DragEffect, DragMessages, DragPickDetail, DragViewport} from "@webwriter/widget/drag"

export type DragBinding = {
  readonly core: DragCore
  readonly snapshot: ModuleRef<DragCore>
  /** The item being dragged or picked up, if any. */
  readonly item: Signal<DragSnapshot["item"]>
  /** How the item was picked up: by a pointer drag, with the keyboard or by a click. */
  readonly via: Signal<DragSnapshot["via"]>
}

/**
 * Binds Drag. `rendered` defaults to the next render of the application. For a
 * point target that is the window of a canvas viewport (`data-ww-drop-space="world"`),
 * pass `{viewport: viewport.core}`: the commit then reports world coordinates.
 */
export function injectDrag(options?: BindingOptions<DragOptions>): DragBinding
