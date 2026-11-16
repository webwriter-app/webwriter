import {useMemo} from "react"
import {SceneCore} from "@webwriter/widget/scene"
import {useCore} from "./base.js"

export {sceneElements} from "@webwriter/widget/scene"

/**
 * React binding of Scene. Write the scene in the JSX with the elements of
 * `sceneElements` (register them with `customElements.define`) and listen for
 * `ww-select`, `ww-move`, `ww-resize` and `ww-connect` with `useEvent()`.
 * `rendered` defaults to a promise that settles after React's next commit.
 * For a scene that is the window of a canvas viewport pass `{viewport: viewport.core}`.
 */
export function useScene(host, options) {
  const {core, snapshot} = useCore(host, (o, rendered) => new SceneCore(host, {rendered, ...o}), options)
  const methods = useMemo(() => ({
    extent: () => core.extent(),
    measureText: (text, source) => core.measureText(text, source),
    toScene: (clientX, clientY) => core.toScene(clientX, clientY),
    toClient: (x, y) => core.toClient(x, y),
    itemAt: (point, options) => core.itemAt(point, options),
    itemsAt: (point, options) => core.itemsAt(point, options),
    endsOf: (path) => core.endsOf(path),
    wiresAt: (reference) => core.wiresAt(reference),
    restyle: () => core.restyle(),
    remeasure: () => core.remeasure(),
  }), [core])
  return {
    marquee: snapshot.marquee,
    // Read when the property is: the promise is the scene's own, and `await scene.ready` waits for the first layout.
    get ready() {
      return core.ready
    },
    ...methods,
  }
}
