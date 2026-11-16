import {computed} from "@angular/core"
import {DragCore} from "@webwriter/widget/drag"
import {injectModule, injectRendered} from "./base.js"

/**
 * Binds Drag. The markers go on the template; listen for `(ww-dragcommit)` on
 * the element that carries the drop marker, and for `(ww-dragpick)` to filter
 * the targets an item may go to. For a point target that is the window of a
 * canvas viewport (`data-ww-drop-space="world"`), pass `{viewport: viewport.core}`:
 * the commit then reports world coordinates.
 */
export function injectDrag(options = {}) {
  const snapshot = injectModule(DragCore, {rendered: injectRendered(), ...options})
  return {
    core: snapshot.core,
    snapshot,
    item: computed(() => snapshot().item),
    via: computed(() => snapshot().via),
  }
}
