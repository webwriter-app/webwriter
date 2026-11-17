import {computed} from "@angular/core"
import {SceneCore} from "@webwriter/widget/scene"
import {injectModule, injectRendered} from "./base.js"

/**
 * Binds Scene. Write the scene in the template with the elements of
 * `sceneElements` (register them first and allow them with `CUSTOM_ELEMENTS_SCHEMA`).
 */
export function injectScene(options = {}) {
  const snapshot = injectModule(SceneCore, {rendered: injectRendered(), ...options})
  const {core} = snapshot
  return {
    core,
    snapshot,
    marquee: computed(() => snapshot().marquee),
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
    toSVG: options => core.toSVG(options),
    toImage: options => core.toImage(options),
    get printing() {
      return core.printing
    },
    restyle: () => core.restyle(),
    remeasure: () => core.remeasure(),
  }
}
