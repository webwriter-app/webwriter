import {DragCore} from "@webwriter/widget/drag"
import {useCore} from "./base.js"

/**
 * React binding of Drag. Mark items and targets in the JSX with `data-ww-*`
 * attributes (a boolean one is written `data-ww-drag-handle=""`) and listen
 * for `ww-dragcommit` and `ww-dragpick` with `useEvent()`. For a point target
 * that is the window of a canvas viewport (`data-ww-drop-space="world"`), pass
 * `{viewport: viewport.core}`: the commit then reports world coordinates.
 */
export function useDrag(host, options) {
  const {snapshot} = useCore(host, (o, rendered) => new DragCore(host, {rendered, ...o}), options)
  return {item: snapshot.item, via: snapshot.via}
}
