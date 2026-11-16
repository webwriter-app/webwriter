import type {DragCore, DragOptions} from "@webwriter/widget/drag"
import type {CoreStore} from "./base.js"

export type {DragCommitDetail, DragEffect, DragMessages, DragOptions, DragPickDetail, DragSnapshot, DragViewport} from "@webwriter/widget/drag"

/** The state is `{item, via}`: the item being dragged or picked up, and how. */
export type DragStore = CoreStore<DragCore>

export function dragStore(host: HTMLElement, options?: DragOptions): DragStore
