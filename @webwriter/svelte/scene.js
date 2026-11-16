import {SceneCore} from "@webwriter/widget/scene"
import {bindCore} from "./bind.js"

/**
 * Scene for the widget: `const scene = sceneStore($host())`. Write the scene
 * in the template with the elements of `sceneElements`. `$scene.marquee` is
 * true while the reader draws a marquee; the store also has `extent`,
 * `measureText`, `toScene`, `toClient`, `itemAt`, `itemsAt`, `endsOf`,
 * `wiresAt`, `restyle` and `remeasure` of the core, and `ready`, which
 * resolves when the first layout has settled. The undo step of a commit stays
 * open until the component has rendered; `undoHost` of the options names
 * another host for the undo steps.
 */
export function sceneStore(host, options = {}) {
  const store = bindCore(host, options, options => new SceneCore(host, options), {
    rendered: true,
    methods: ["extent", "measureText", "toScene", "toClient", "itemAt", "itemsAt", "endsOf", "wiresAt", "restyle", "remeasure"],
  })
  Object.defineProperty(store, "ready", {get: () => store.core.ready})
  return store
}
