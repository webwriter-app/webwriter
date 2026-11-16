import {computed, proxyRefs} from "vue"
import {SceneCore, sceneElements} from "@webwriter/widget/scene"
import {useCore} from "./base.js"

/**
 * Vue has no scoped element registries: this defines the scene elements in
 * the document's registry, once. Call it before the widget is defined. Pass
 * `{...sceneElements, "ww-scene": PixiScene}` for the PixiJS renderer.
 */
export function defineSceneElements(elements = sceneElements, registry = customElements) {
  for(const [name, element] of Object.entries(elements)) {
    if(!registry.get(name)) registry.define(name, element)
  }
}

export function useScene({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root, rendered}) => new SceneCore(host, {rendered, ...options, root}), host)
  return proxyRefs({
    core,
    marquee: computed(() => snapshot.value.marquee),
    extent: () => core.extent(),
    measureText: (text, source) => core.measureText(text, source),
    get ready() {
      return core.ready
    },
    toScene: (clientX, clientY) => core.toScene(clientX, clientY),
    toClient: (x, y) => core.toClient(x, y),
    itemAt: (point, options) => core.itemAt(point, options),
    itemsAt: (point, options) => core.itemsAt(point, options),
    endsOf: path => core.endsOf(path),
    wiresAt: reference => core.wiresAt(reference),
    restyle: () => core.restyle(),
    remeasure: () => core.remeasure(),
  })
}
