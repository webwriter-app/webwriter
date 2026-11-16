import {
  ViewportCore
} from "@webwriter/widget/viewport";
import { CoreController } from "./base.js";
class Viewport extends CoreController {
  #scale = 1;
  constructor(host, options = {}) {
    super(host, (root) => new ViewportCore(host, { rendered: () => host.updateComplete, ...options, root }));
  }
  /** Where the world's origin is drawn, in CSS pixels from the window's top-left corner. */
  get x() {
    return this.snapshot.x;
  }
  get y() {
    return this.snapshot.y;
  }
  /** The scale: 1 is 100 %. */
  get scale() {
    return this.snapshot.scale;
  }
  /** The zoom limits. */
  get min() {
    return this.snapshot.min;
  }
  get max() {
    return this.snapshot.max;
  }
  /** Size of the window in CSS pixels. */
  get width() {
    return this.snapshot.width;
  }
  get height() {
    return this.snapshot.height;
  }
  /** Converts a client point to world coordinates. Bound: pass it as the `convert` option of a `PointerGesture`. */
  toWorld = (clientX, clientY) => this.core.toWorld(clientX, clientY);
  /** Converts a world point to client coordinates. */
  toClient = (worldX, worldY) => this.core.toClient(worldX, worldY);
  /** Multiplies the scale about a client point (default: the centre of the window). */
  zoomBy(factor, about) {
    this.core.zoomBy(factor, about);
  }
  /** Sets the scale about a client point (default: the centre of the window). */
  zoomTo(scale, about) {
    this.core.zoomTo(scale, about);
  }
  /** Moves the content by CSS pixels. */
  panBy(dx, dy) {
    this.core.panBy(dx, dy);
  }
  /** Returns to the fitted view. Resolves when it is applied; `fit({follow: "none"})` fits once and leaves the view alone. */
  fit(call) {
    return this.core.fit(call);
  }
  /** Resolves when the view is a fitted one that is up to date: the first fit, or the one after content changed. */
  fitted() {
    return this.core.fitted();
  }
  /** Puts a world point in the centre of the window, and optionally sets the scale. `{animate: true}` glides there. */
  centerOn(point, scale, motion) {
    return this.core.centerOn(point, scale, motion);
  }
  /** Sets where the world's origin is drawn and the scale, or only the scale about the centre. */
  setView(view, motion) {
    return this.core.setView(view, motion);
  }
  /** One step of panning for a pointer at the edge of the window. Call it once per frame; returns whether the view moved. */
  autoPan(clientX, clientY) {
    return this.core.autoPan(clientX, clientY);
  }
  /** `autoPan()` every frame while the gesture runs, so that a pointer held still at the edge keeps panning. */
  autoPanWhile(source) {
    this.core.autoPanWhile(source);
  }
  /** Canvas form: the extent that `bounds` returns changed without a render. */
  contentChanged() {
    this.core.contentChanged();
  }
  /** Only what a template shows: the scale, and in the canvas form every change of the view. */
  shouldRender() {
    const scale = this.snapshot.scale;
    const changed = scale !== this.#scale;
    this.#scale = scale;
    return changed || this.core.tracksView;
  }
}
export {
  Viewport
};
