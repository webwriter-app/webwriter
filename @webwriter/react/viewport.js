import {useMemo} from "react"
import {ViewportCore} from "@webwriter/widget/viewport"
import {useCore} from "./base.js"

/** The component renders for a new scale, and in the canvas form for every change of the view, because it draws the view itself. */
const showsChange = (next, seen, core) => next.scale !== seen.scale || core.tracksView

/**
 * React binding of Viewport. Mark the window with `data-ww-viewport` and an
 * empty element `data-ww-viewport-controls=""` for the buttons. `x`, `y`,
 * `width` and `height` are the view when the component rendered; in the
 * scroll form the browser moves the content, so scrolling does not render.
 *
 * `fit()`, `fitted()`, `centerOn()` and `setView()` return promises that
 * resolve when the view is there; `ww-viewportfit` on the host announces every
 * fit. `core` is the `ViewportCore`, for the `viewport` option of `useDrag()`
 * and `useScene()`.
 */
export function useViewport(host, options) {
  const {core, snapshot} = useCore(host, (o, rendered) => new ViewportCore(host, {rendered, ...o}), options, showsChange)
  const methods = useMemo(() => ({
    toWorld: (clientX, clientY) => core.toWorld(clientX, clientY),
    toClient: (worldX, worldY) => core.toClient(worldX, worldY),
    zoomBy: (factor, about) => core.zoomBy(factor, about),
    zoomTo: (scale, about) => core.zoomTo(scale, about),
    panBy: (dx, dy) => core.panBy(dx, dy),
    fit: (call) => core.fit(call),
    fitted: () => core.fitted(),
    centerOn: (point, scale, motion) => core.centerOn(point, scale, motion),
    setView: (view, motion) => core.setView(view, motion),
    autoPan: (clientX, clientY) => core.autoPan(clientX, clientY),
    autoPanWhile: (source) => core.autoPanWhile(source),
    contentChanged: () => core.contentChanged(),
  }), [core])
  return {core, x: snapshot.x, y: snapshot.y, scale: snapshot.scale, min: snapshot.min, max: snapshot.max, width: snapshot.width, height: snapshot.height, ...methods}
}
