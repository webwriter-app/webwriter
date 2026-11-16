import {computed, proxyRefs} from "vue"
import {ViewportCore} from "@webwriter/widget/viewport"
import {useCore} from "./base.js"

export function useViewport({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root, rendered}) => new ViewportCore(host, {rendered, ...options, root}), host)
  // One computed per field: a template that reads only `scale` does not render while the browser scrolls.
  const field = name => computed(() => snapshot.value[name])
  return proxyRefs({
    core,
    x: field("x"),
    y: field("y"),
    scale: field("scale"),
    min: field("min"),
    max: field("max"),
    width: field("width"),
    height: field("height"),
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
  })
}
