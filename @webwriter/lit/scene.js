import { SceneCore } from "@webwriter/widget/scene";
import { CoreController } from "./base.js";
class SceneController extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new SceneCore(host, { rendered: () => host.updateComplete, ...options, root }));
  }
  /** True while the reader draws a marquee. A viewport stays still meanwhile: `can: () => !this.#scene.marquee`. */
  get marquee() {
    return this.snapshot.marquee;
  }
  /** The box around everything in the scene, in scene coordinates: `new Viewport(this, {bounds: () => this.#scene.extent()})`. */
  extent() {
    return this.core.extent();
  }
  /** The size a text takes in the scene, from the font of an element or some font entries; the text need not be drawn. `\n` breaks lines. */
  measureText(text, source) {
    return this.core.measureText(text, source);
  }
  /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. The scene also sends `ww-ready`. */
  get ready() {
    return this.core.ready;
  }
  /** Client coordinates (a pointer event's `clientX`, `clientY`) to scene coordinates, through the view: where a drop in the scene lands. */
  toScene(clientX, clientY) {
    return this.core.toScene(clientX, clientY);
  }
  /** Scene coordinates to client coordinates. */
  toClient(x, y) {
    return this.core.toClient(x, y);
  }
  /** The topmost item at a point, or null for the background. `point` is in scene coordinates, or in client coordinates with `{client: true}`. */
  itemAt(point, options) {
    return this.core.itemAt(point, options);
  }
  /** The items at a point, the topmost first: nodes, then drawn items from the last in the template to the first. */
  itemsAt(point, options) {
    return this.core.itemsAt(point, options);
  }
  /** The ends of an attached path as what they name: the node, the port name and the port element. For a click on a wire that has to know which port it ends in. */
  endsOf(path) {
    return this.core.endsOf(path);
  }
  /** The paths that end at a port (`node:port`) or at a whole node (`node`): how many wires a port has. */
  wiresAt(reference) {
    return this.core.wiresAt(reference);
  }
  /** Reads every computed style again, for a change of style that no observer sees, such as a new style rule. */
  restyle() {
    this.core.restyle();
  }
  /** Measures every port again, for ports that moved without any change of the document. */
  remeasure() {
    this.core.remeasure();
  }
}
export {
  SceneController
};
