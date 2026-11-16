import {ViewportCore} from "@webwriter/widget/viewport"
import {bindCore} from "./bind.js"

/**
 * Viewport for the widget: `const viewport = viewportStore($host())`. Mark the
 * window with `data-ww-viewport`. `$viewport` holds `x`, `y`, `scale`, `width`
 * and `height`. The store also has `zoomBy`, `zoomTo`, `panBy`, `fit`,
 * `fitted`, `centerOn`, `setView`, `autoPan`, `autoPanWhile`, `toWorld`,
 * `toClient` and `contentChanged` of the core; `fit`, `fitted`, `centerOn` and
 * `setView` return promises that resolve when the view is there. The undo step
 * of a saved view stays open until the component has rendered.
 */
export function viewportStore(host, options = {}) {
  return bindCore(host, options, options => new ViewportCore(host, options), {
    rendered: true,
    methods: ["zoomBy", "zoomTo", "panBy", "fit", "fitted", "centerOn", "setView", "autoPan", "autoPanWhile", "toWorld", "toClient", "contentChanged"],
  })
}
