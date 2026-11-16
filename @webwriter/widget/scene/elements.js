import { MARKERS } from "./geometry.js";
function sheet(css) {
  const result = new CSSStyleSheet();
  result.replaceSync(css);
  return result;
}
const slottedSheet = sheet(`
::slotted(*) { pointer-events: auto; }
::slotted(ww-path), ::slotted(ww-shape), ::slotted(ww-text), ::slotted(ww-image), ::slotted(ww-sprites) { display: none; }
::slotted(ww-path) { fill: none; stroke: currentColor; stroke-width: 1px; }
::slotted(ww-shape), ::slotted(ww-text) { fill: currentColor; stroke: none; }
`);
const TYPED_ATTR = CSS.supports("translate", "attr(x px, 0px) attr(y px, 0px)") && CSS.supports("scale", "attr(scale type(<number>), 1)");
class Placement {
  constructor(element, shared) {
    this.element = element;
    const root = element.attachShadow({ mode: "open" });
    root.innerHTML = "<slot></slot>";
    root.adoptedStyleSheets = shared;
    if (TYPED_ATTR) return;
    const own = sheet(":host {}");
    root.adoptedStyleSheets = [...shared, own];
    this.#rule = own.cssRules[0].style;
  }
  #rule = null;
  #preview = null;
  /** `values` are what the attributes say. `preview`, if given, overrides them for now. */
  set(values, preview) {
    if (this.#rule) for (const [name, value] of Object.entries(values)) this.#rule.setProperty(name, value);
    if (!preview) {
      this.#preview?.cancel();
      this.#preview = null;
    } else if (this.#preview) this.#preview.effect.setKeyframes([preview]);
    else this.#preview = this.element.animate([preview], { fill: "forwards" });
  }
}
class SceneItem extends HTMLElement {
  /** Attributes of the subclass that change what is drawn. */
  static attributes = [];
  static get observedAttributes() {
    return ["class", "style", "selected", "selectable", "movable", "data-ww-key", "aria-label", "x", "y", ...this.attributes];
  }
  /** The `ww-scene` this item is in, while connected. */
  scene = null;
  /** Where a move or a resize in progress shows the item. Never written to an attribute. */
  preview = null;
  #states = this.attachInternals().states;
  /** Finds the scene and tells it. Subclasses call it first. */
  connectedCallback() {
    const scene = this.closest("ww-scene");
    this.scene = scene && "restructure" in scene ? scene : null;
    this.scene?.restructure();
  }
  disconnectedCallback() {
    this.scene?.restructure();
    this.scene = null;
  }
  attributeChangedCallback(name, _old, _value) {
    if (name === "data-ww-key") this.scene?.restructure();
    this.scene?.invalidate(this, name);
  }
  /** Tells the scene to mirror this item again. */
  changed() {
    this.scene?.invalidate(this);
  }
  /** A numeric attribute, or `fallback` if it is missing or no number. */
  num(name, fallback = 0) {
    const value = parseFloat(this.getAttribute(name) ?? "");
    return Number.isFinite(value) ? value : fallback;
  }
  /**
   * Writes an attribute for a property of the same name, so that a framework
   * that assigns such a prop as a property (React, Vue) sets the attribute.
   * `null`, `undefined` and `false` remove it, `true` writes it empty, a list is joined by spaces.
   */
  reflect(name, value) {
    if (value === null || value === void 0 || value === false) this.removeAttribute(name);
    else this.setAttribute(name, value === true ? "" : Array.isArray(value) ? value.join(" ") : String(value));
  }
  /** `data-ww-key`: what a path refers to and what the events report. */
  get key() {
    return this.getAttribute("data-ww-key") ?? "";
  }
  /** The position that is shown: the preview during a gesture, else the attributes. */
  get at() {
    return this.preview ?? { x: this.num("x"), y: this.num("y") };
  }
  /** `:state(name)` for the widget's CSS, for example `ww-shape:state(hover)`. */
  setState(name, on) {
    if (on) this.#states.add(name);
    else this.#states.delete(name);
  }
}
const nodeSheet = sheet(`
:host { position: absolute; left: 0; top: 0; box-sizing: border-box;
    translate: attr(x px, 0px) attr(y px, 0px); width: attr(width px, auto); height: attr(height px, auto); }
:host([movable]) { touch-action: none; user-select: none; }
:host([outline=circle]), :host([outline=ellipse]) { border-radius: 50%; }
:host([outline=rounded]) { border-radius: attr(radius px, 0px); }
:host([selected]) { outline: 2px solid var(--ww-scene-selection, Highlight); outline-offset: 2px; }
[part=handle] { display: none; position: absolute; width: 8px; height: 8px; margin: -5px; touch-action: none;
    background: Canvas; border: 1px solid var(--ww-scene-selection, Highlight); }
:host([resizable][selected]) [part=handle] { display: block; }
[data-ww-handle*=n] { top: 0; } [data-ww-handle*=s] { top: 100%; } [data-ww-handle=e], [data-ww-handle=w] { top: 50%; }
[data-ww-handle*=w] { left: 0; } [data-ww-handle*=e] { left: 100%; } [data-ww-handle=n], [data-ww-handle=s] { left: 50%; }
[data-ww-handle=n], [data-ww-handle=s] { cursor: ns-resize; } [data-ww-handle=e], [data-ww-handle=w] { cursor: ew-resize; }
[data-ww-handle=ne], [data-ww-handle=sw] { cursor: nesw-resize; } [data-ww-handle=nw], [data-ww-handle=se] { cursor: nwse-resize; }
`);
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
function handlesOf(value) {
  if (value === null) return [];
  const named = value.split(/[\s,]+/);
  const chosen = HANDLES.filter((handle) => named.includes(handle));
  return chosen.length ? chosen : HANDLES;
}
class SceneNode extends SceneItem {
  static attributes = ["width", "height", "resizable", "outline", "radius"];
  #placement = new Placement(this, [nodeSheet]);
  #ownTabindex = false;
  connectedCallback() {
    super.connectedCallback();
    this.place();
  }
  attributeChangedCallback(name, old, value) {
    super.attributeChangedCallback(name, old, value);
    if (name === "resizable") {
      const root = this.shadowRoot;
      const wanted = handlesOf(value);
      for (const handle of root.querySelectorAll("[part=handle]")) if (!wanted.includes(handle.dataset.wwHandle)) handle.remove();
      const present = new Set([...root.querySelectorAll("[part=handle]")].map((handle) => handle.dataset.wwHandle));
      root.append(
        ...wanted.filter((handle) => !present.has(handle)).map((handle) => {
          const element = document.createElement("div");
          element.part.add("handle");
          element.dataset.wwHandle = handle;
          return element;
        })
      );
    }
    if (name === "selectable" || name === "movable") {
      const wanted = this.hasAttribute("selectable") || this.hasAttribute("movable");
      if (wanted && !this.hasAttribute("tabindex")) {
        this.tabIndex = 0;
        this.#ownTabindex = true;
      } else if (!wanted && this.#ownTabindex) {
        this.removeAttribute("tabindex");
        this.#ownTabindex = false;
      }
    }
  }
  /**
   * `outline`: the shape of the node where a path ends at it by the node's name
   * alone: `rect`, `rounded` (with `radius`), `circle` or `ellipse`. Null
   * without the attribute, and then such a path ends at the node's centre.
   * The selection outline follows it.
   */
  get outline() {
    const value = this.getAttribute("outline");
    return value === "rect" || value === "rounded" || value === "circle" || value === "ellipse" ? value : null;
  }
  set outline(value) {
    this.reflect("outline", value);
  }
  /** Shows the node where its attributes, or the gesture in progress, put it. */
  place() {
    const px = (value) => Number.isFinite(value) ? `${value}px` : "auto";
    const preview = this.preview;
    const outline = this.outline;
    this.#placement.set(
      {
        translate: `${this.num("x")}px ${this.num("y")}px`,
        width: px(this.num("width", NaN)),
        height: px(this.num("height", NaN)),
        // Where typed attr() is missing: the corners of the outline.
        "border-radius": outline === "circle" || outline === "ellipse" ? "50%" : outline === "rounded" ? `${this.num("radius")}px` : ""
      },
      preview && { translate: `${preview.x}px ${preview.y}px`, ...preview.width === void 0 ? {} : { width: px(preview.width), height: px(preview.height ?? NaN) } }
    );
  }
}
const groupSheet = sheet(`:host { position: absolute; left: 0; top: 0; transform-origin: 0 0;
    translate: attr(x px, 0px) attr(y px, 0px); scale: attr(scale type(<number>), 1); }
:host([frame]) { fill: none; stroke: currentColor; stroke-width: 1px; }`);
class SceneGroup extends SceneItem {
  static attributes = ["scale", "frame", "padding", "label", "radius"];
  #placement = new Placement(this, [groupSheet, slottedSheet]);
  /** The `scale` attribute. Default 1. */
  get scale() {
    return this.num("scale", 1);
  }
  set scale(value) {
    this.reflect("scale", value);
  }
  connectedCallback() {
    super.connectedCallback();
    this.place();
  }
  /** Shows the group where its attributes, or the move in progress, put it. */
  place() {
    const preview = this.preview;
    this.#placement.set({ translate: `${this.num("x")}px ${this.num("y")}px`, scale: String(this.scale) }, preview && { translate: `${preview.x}px ${preview.y}px` });
  }
}
const pathSheet = sheet(`::slotted(ww-text) { display: none; fill: currentColor; stroke: none; stroke-width: 1px; stroke-dasharray: none; }`);
class ScenePath extends SceneItem {
  static attributes = ["from", "to", "route", "bend", "loop", "waypoints", "marker-start", "marker-end", "hit-width", "rewire"];
  #points = null;
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = "<slot></slot>";
    root.adoptedStyleSheets = [pathSheet];
  }
  /** The line of a path that is not attached to ports. */
  get points() {
    return this.#points;
  }
  set points(value) {
    this.#points = value;
    this.changed();
  }
  /** True if the path runs between two ends and has no position of its own. */
  get attached() {
    return this.hasAttribute("from") && this.hasAttribute("to");
  }
  /** `route`: straight (the default), step, curve, arc or orthogonal. */
  get route() {
    const value = this.getAttribute("route");
    return value === "step" || value === "curve" || value === "arc" || value === "orthogonal" ? value : "straight";
  }
  set route(value) {
    this.reflect("route", value);
  }
  /** `bend`, or null without a number. */
  get bend() {
    const value = parseFloat(this.getAttribute("bend") ?? "");
    return Number.isFinite(value) ? value : null;
  }
  set bend(value) {
    this.reflect("bend", value);
  }
  /** `loop`, or null without the attribute. An empty one is 45. */
  get loop() {
    if (!this.hasAttribute("loop")) return null;
    const value = parseFloat(this.getAttribute("loop"));
    return Number.isFinite(value) ? value : 45;
  }
  set loop(value) {
    this.reflect("loop", value);
  }
  /** `waypoints`. */
  get waypoints() {
    const result = [];
    for (const entry of (this.getAttribute("waypoints") ?? "").trim().split(/\s+(?=e:|[-+.\d])/)) {
      if (!entry) continue;
      const end = entry.startsWith("e:");
      const [x, y] = entry.slice(end ? 2 : 0).split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) result.push({ x, y, from: end ? "end" : "start" });
    }
    return result;
  }
  /** The attribute's text, or a list of points as the getter returns them. */
  set waypoints(value) {
    this.reflect("waypoints", typeof value === "object" && value ? value.map((point) => `${point.from === "end" ? "e:" : ""}${point.x},${point.y}`) : value);
  }
  /** `marker-start`. */
  get markerStart() {
    return marker(this.getAttribute("marker-start"));
  }
  /** `marker-end`. */
  get markerEnd() {
    return marker(this.getAttribute("marker-end"));
  }
  /** `hit-width`, or null without a number. */
  get hitWidth() {
    const value = parseFloat(this.getAttribute("hit-width") ?? "");
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }
  /** The ends a reader may take to another port: none without `rewire`, `to` for an empty value. */
  get rewire() {
    const value = this.getAttribute("rewire");
    if (value === null) return [];
    const named = value.split(/[\s,]+/);
    const ends = ["from", "to"].filter((end) => named.includes(end));
    return ends.length ? ends : ["to"];
  }
  /** The attribute's text, a list of ends, or `true` for the empty attribute. */
  set rewire(value) {
    this.reflect("rewire", value);
  }
}
function marker(value) {
  return MARKERS.includes(value) ? value : "none";
}
class SceneShape extends SceneItem {
  static attributes = ["kind", "width", "height", "r", "points", "radius", "rotate", "resizable"];
  /** The `points` attribute of a polygon. */
  get polygon() {
    const numbers = (this.getAttribute("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    const points = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
    return points;
  }
}
class SceneText extends SceneItem {
  static attributes = ["rotate", "at", "along", "side", "gap", "follow"];
  /** `at` as a fraction of the length of the path. */
  get where() {
    const value = this.getAttribute("at");
    if (value === "start") return 0;
    if (value === "end") return 1;
    const number = parseFloat(value ?? "");
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0.5;
  }
  /** `side`. */
  get side() {
    const value = this.getAttribute("side");
    return value === "left" || value === "right" || value === "above" || value === "below" ? value : "on";
  }
  set side(value) {
    this.reflect("side", value);
  }
  /** The position that is shown, as for every item. Setting it writes the `at` attribute of a label: `start`, `end` or a fraction of the path. */
  get at() {
    return super.at;
  }
  set at(value) {
    this.reflect("at", typeof value === "object" ? null : value);
  }
}
class SceneGrid extends SceneItem {
  static attributes = ["kind", "spacing"];
  /** `spacing`: at least 2. */
  get spacing() {
    return Math.max(2, this.num("spacing", 20));
  }
}
class SceneImage extends SceneItem {
  static attributes = ["width", "height", "href", "resizable"];
  #source = null;
  /** An image source to draw. It wins over `href`. */
  get source() {
    return this.#source;
  }
  set source(value) {
    if (value === this.#source) return;
    this.#source = value ?? null;
    this.changed();
  }
  /** What is drawn: `.source`, or the URL in `href`. */
  get picture() {
    return this.#source ?? this.getAttribute("href");
  }
}
class SceneSprites extends SceneItem {
  static attributes = ["texture"];
  #items = [];
  #texture = null;
  /** The sprites. The array may be changed in place: the batch is drawn again after every render of the widget. */
  get items() {
    return this.#items;
  }
  set items(value) {
    this.#items = value ?? [];
    this.changed();
  }
  /** A URL (also as the attribute) or an image source such as a canvas. */
  get texture() {
    return this.#texture ?? this.getAttribute("texture");
  }
  set texture(value) {
    if (value === this.#texture) return;
    this.#texture = value;
    this.changed();
  }
}
export {
  HANDLES,
  SceneGrid,
  SceneGroup,
  SceneImage,
  SceneItem,
  SceneNode,
  ScenePath,
  SceneShape,
  SceneSprites,
  SceneText,
  handlesOf,
  slottedSheet
};
