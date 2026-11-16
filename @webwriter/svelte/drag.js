import {DragCore} from "@webwriter/widget/drag"
import {bindCore} from "./bind.js"

/**
 * Drag for the widget: `const drag = dragStore($host(), {can: () => allowed})`.
 * Mark items and targets in the template with the `data-ww-drag*` and
 * `data-ww-drop*` attributes. `$drag.item` and `$drag.via` say what is being
 * dragged. For a point target that is the window of a canvas viewport
 * (`data-ww-drop-space="world"`), pass `{viewport: viewport.core}`: the commit
 * then reports world coordinates. Listen for the commit with `onww-dragcommit={handler}` on the
 * target, or `use:listen`. The undo step of a drop stays open until the
 * component has rendered the change the handler made.
 */
export function dragStore(host, options = {}) {
  return bindCore(host, options, options => new DragCore(host, options), {rendered: true})
}
