import {computed} from "@angular/core"
import {ViewportCore} from "@webwriter/widget/viewport"
import {injectModule, injectRendered} from "./base.js"

/**
 * Binds Viewport. Mark the window with `data-ww-viewport`. Each member is a
 * signal of its own value, so a template that reads `scale()` does not render
 * for a pan, and one that reads `x()` does.
 *
 * `fit()`, `fitted()`, `centerOn()` and `setView()` return promises that
 * resolve when the view is there; `ww-viewportfit` on the host announces every
 * fit. `rendered` defaults to the next render of the application.
 */
export function injectViewport(options = {}) {
  const snapshot = injectModule(ViewportCore, {rendered: injectRendered(), ...options})
  const {core} = snapshot
  const part = name => computed(() => snapshot()[name])
  return {
    core,
    snapshot,
    x: part("x"),
    y: part("y"),
    scale: part("scale"),
    min: part("min"),
    max: part("max"),
    width: part("width"),
    height: part("height"),
    toWorld: (x, y) => core.toWorld(x, y),
    toClient: (x, y) => core.toClient(x, y),
    zoomBy: (factor, about) => core.zoomBy(factor, about),
    zoomTo: (scale, about) => core.zoomTo(scale, about),
    panBy: (dx, dy) => core.panBy(dx, dy),
    fit: call => core.fit(call),
    fitted: () => core.fitted(),
    centerOn: (point, scale, motion) => core.centerOn(point, scale, motion),
    setView: (view, motion) => core.setView(view, motion),
    autoPan: (clientX, clientY) => core.autoPan(clientX, clientY),
    autoPanWhile: source => core.autoPanWhile(source),
    contentChanged: () => core.contentChanged(),
  }
}
