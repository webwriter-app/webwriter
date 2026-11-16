import { ModuleCore } from "../base.js";
import { can as allowed } from "../permissions.js";
const RESTING = Object.freeze({ marquee: false });
const DRAWING = Object.freeze({ marquee: true });
const THEME = { attributeFilter: ["class", "style", "data-theme"] };
class SceneCore extends ModuleCore {
  #options;
  #snapshot = RESTING;
  #themes = null;
  /** The elements whose class, style and data-theme are watched. Only compared by identity. */
  #watched = [];
  /** Answers for named permissions, kept until the current task ends: a scene asks once per node. */
  #answers = null;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
  }
  getSnapshot() {
    return this.#snapshot;
  }
  /** Every `ww-scene` in the widget's template. */
  get scenes() {
    return [...this.root.querySelectorAll("ww-scene")].filter((scene) => "refresh" in scene);
  }
  /** The box around everything in the widget's first scene, in scene coordinates: the `bounds` of a Viewport. */
  extent() {
    return this.scenes[0]?.extent() ?? null;
  }
  /**
   * The size a text takes in the widget's first scene: the widest line and the
   * height of its lines, in scene pixels. `\n` breaks lines. `source` is an
   * element whose font is used, such as a `ww-text`, or some entries of a font.
   * A text need not be drawn: size a node to its label before rendering it.
   */
  measureText(text, source) {
    const scene = this.scenes[0];
    return scene ? scene.measureText(text, source) : { width: 0, height: 0, lines: text.split("\n").length, lineHeight: 0 };
  }
  /** Resolves when the first layout of the widget's first scene has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. Also `ww-ready` on the scene. */
  get ready() {
    return this.scenes[0]?.ready ?? Promise.resolve();
  }
  /** Client coordinates to scene coordinates of the widget's first scene, through its view. */
  toScene(clientX, clientY) {
    return this.scenes[0]?.toScene(clientX, clientY) ?? { x: clientX, y: clientY };
  }
  /** Scene coordinates of the widget's first scene to client coordinates. */
  toClient(x, y) {
    return this.scenes[0]?.toClient(x, y) ?? { x, y };
  }
  /** The topmost item of the widget's first scene at a point, or null: see `itemsAt` of the scene. `point` is in scene coordinates, or client coordinates with `{client: true}`. */
  itemAt(point, options) {
    return this.scenes[0]?.itemAt(point, options) ?? null;
  }
  /** The items of the widget's first scene at a point, the topmost first. */
  itemsAt(point, options) {
    return this.scenes[0]?.itemsAt(point, options) ?? [];
  }
  /** The ends of an attached path in the widget's first scene as what they name: the node, the port name and the port element. */
  endsOf(path) {
    return this.scenes[0]?.endsOf(path) ?? { from: null, to: null };
  }
  /** The paths in the widget's first scene that end at exactly this reference: at a port (`node:port`), or at a node as a whole (`node`), which does not count the wires at its ports. */
  wiresAt(reference) {
    return this.scenes[0]?.wiresAt(reference) ?? [];
  }
  /** Reads every computed style again, for a change of style that no observer sees, such as a new style rule. */
  restyle() {
    for (const scene of this.scenes) scene.restyle();
  }
  /** Measures every port again, for ports that moved without any change of the document. */
  remeasure() {
    for (const scene of this.scenes) scene.remeasure();
  }
  onConnect() {
    const themed = () => {
      this.restyle();
      this.remeasure();
    };
    this.listen(matchMedia("(prefers-color-scheme: dark)"), "change", themed);
    this.#themes = new MutationObserver(themed);
    this.cleanup(() => {
      this.#themes?.disconnect();
      this.#themes = null;
      this.#watched = [];
      this.#answers = null;
      this.#snapshot = RESTING;
    });
  }
  onRefresh() {
    const { can, rendered, viewport, messages, undoHost } = this.#options;
    const scenes = this.scenes;
    for (const scene of scenes) {
      scene.can = typeof can === "function" ? can : can ? (action) => this.#granted(can[action]) : null;
      scene.rendered = rendered ?? null;
      scene.whileAllowed = (answer, until) => this.whileAllowed(answer, until);
      scene.messages = messages;
      scene.undoHost = undoHost ?? null;
      scene.viewport = viewport ?? null;
      scene.changed = () => this.#changed();
      scene.refresh();
    }
    this.#watch(scenes);
  }
  /** Watches the host, the page and everything between the host and each scene for a switch of theme. */
  #watch(scenes) {
    const document = this.host.ownerDocument;
    const watched = /* @__PURE__ */ new Set([this.host, document.documentElement, document.body]);
    for (const scene of scenes) for (let parent = scene.parentElement; parent; parent = parent.parentElement) watched.add(parent);
    const list = [...watched];
    if (list.length === this.#watched.length && list.every((element, index) => element === this.#watched[index])) return;
    this.#themes.disconnect();
    for (const element of list) this.#themes.observe(element, THEME);
    this.#watched = list;
  }
  /** The answer for a permission by its name. An action that names none is allowed. */
  #granted(name) {
    if (!name) return true;
    if (!this.#answers) {
      this.#answers = /* @__PURE__ */ new Map();
      queueMicrotask(() => this.#answers = null);
    }
    let answer = this.#answers.get(name);
    if (answer === void 0) this.#answers.set(name, answer = allowed(this.host, name));
    return answer;
  }
  #changed() {
    const next = this.scenes.some((scene) => scene.marquee) ? DRAWING : RESTING;
    if (next === this.#snapshot) return;
    this.#snapshot = next;
    this.notify();
  }
}
export {
  SceneCore
};
