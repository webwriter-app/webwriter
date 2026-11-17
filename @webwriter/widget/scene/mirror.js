import { warnOnce } from "../base.js";
import {
  SceneGrid,
  SceneGroup,
  SceneImage,
  SceneItem,
  SceneNode,
  ScenePath,
  SceneShape,
  SceneSprites,
  SceneText,
  slottedSheet
} from "./elements.js";
import {
  apply,
  arcControl,
  bounds,
  clipCurve,
  compose,
  corners,
  curveD,
  curveDirection,
  curveEnd,
  curveSamples,
  curveStart,
  distanceToPolyline,
  dominantSide,
  IDENTITY,
  invert,
  lineCurve,
  loopCurve,
  marker,
  markerInset,
  markerPolygon,
  markerSize,
  orthogonalRoute,
  outlineContains,
  outlineEdge,
  placeLabel,
  polygonContains,
  polyline,
  routeCurve,
  trimCurveEnd,
  trimCurveStart,
  turnedBox,
  turned
} from "./geometry.js";
import { adoptControls, THEME_CHANGE } from "./controls.js";
import { measurePorts } from "./ports.js";
import { sceneToImage, sceneToSVG } from "./snapshot.js";
const FORWARDED = ["pointerdown", "pointerup", "pointermove", "pointerover", "pointerout", "click", "dblclick", "contextmenu"];
const HIT_WIDTH = 12;
const SVG = "http://www.w3.org/2000/svg";
const WATCHED = { subtree: true, childList: true, characterData: true, attributes: true };
const NODE_PLACEMENT = /* @__PURE__ */ new Set(["x", "y", "width", "height", "outline", "radius"]);
const ORTHOGONAL_GAP = 12;
const NORMAL_LINE = 1.2;
const NODE_ATTRIBUTES = /* @__PURE__ */ new Set([
  "x",
  "y",
  "selected",
  "selectable",
  "movable",
  "tabindex",
  "data-ww-key",
  "aria-label",
  "axis",
  "bounds",
  "grid",
  "min-x",
  "max-x",
  "min-y",
  "max-y",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "keep-ratio",
  "data-ww-accept",
  "data-ww-capacity",
  "data-ww-port-candidate",
  "data-ww-port-over"
]);
const MODULE_ATTRIBUTES = /* @__PURE__ */ new Set(["tabindex", "role", "aria-label", "data-ww-port-candidate", "data-ww-port-over"]);
const sceneSheet = new CSSStyleSheet();
sceneSheet.replaceSync(`
:host { display: block; position: relative; overflow: hidden; }
[part=surface] { position: absolute; inset: 0; outline: none; }
[part=surface] > svg, [part=surface] > canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
[part=surface] > svg { overflow: visible; }
[part=hit] { fill: none; stroke: transparent; pointer-events: stroke; stroke-linecap: round; stroke-linejoin: round; }
[part=layer] { position: absolute; inset: 0; transform-origin: 0 0; pointer-events: none; }
[part=layer] > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
[part=grid] { pointer-events: none; }
[part=frame] { pointer-events: none; }
[part=frame].interactive { pointer-events: all; }
[part=proxy] { fill: none; stroke: transparent; stroke-width: ${HIT_WIDTH}px; outline: none; pointer-events: none; }
[part=proxy].line { stroke-linecap: round; stroke-linejoin: round; }
[part=proxy].line.selected { stroke: color-mix(in srgb, var(--ww-scene-selection, Highlight) 35%, transparent); }
[part=proxy]:not(.line).selected { stroke: var(--ww-scene-selection, Highlight); stroke-width: 1.5px; }
[part=proxy]:focus-visible { outline: 2px solid var(--ww-scene-selection, Highlight); outline-offset: 2px; }
[part=marquee] { display: none; fill: color-mix(in srgb, var(--ww-scene-selection, Highlight) 15%, transparent); stroke: var(--ww-scene-selection, Highlight); }
[part=link] { display: none; fill: none; stroke: currentColor; stroke-width: 2px; stroke-dasharray: 4 4; }
[part=marquee].shown, [part=link].shown { display: block; }
[part=resize] { fill: Canvas; stroke: var(--ww-scene-selection, Highlight); pointer-events: all; touch-action: none; }
[part=resize][data-ww-handle=n], [part=resize][data-ww-handle=s] { cursor: ns-resize; }
[part=resize][data-ww-handle=e], [part=resize][data-ww-handle=w] { cursor: ew-resize; }
[part=resize][data-ww-handle=ne], [part=resize][data-ww-handle=sw] { cursor: nesw-resize; }
[part=resize][data-ww-handle=nw], [part=resize][data-ww-handle=se] { cursor: nwse-resize; }
text { dominant-baseline: text-before-edge; user-select: none; }
`);
let background = null;
function backgroundTag() {
  if (!background) {
    do
      background = `ww-scene-background-${Math.random().toString(36).slice(2, 8)}`;
    while (customElements.get(background));
    customElements.define(background, SceneGrid);
  }
  return background;
}
let measuring = null;
const fontOf = (computed) => {
  const fontSize = parseFloat(computed.fontSize) || 16;
  return { fontFamily: computed.fontFamily, fontSize, fontWeight: computed.fontWeight, fontStyle: computed.fontStyle, lineHeight: parseFloat(computed.lineHeight) || fontSize * NORMAL_LINE };
};
function sizeOf(text, font) {
  measuring ??= document.createElement("canvas").getContext("2d");
  measuring.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;
  const lines = text.split("\n");
  const width = Math.max(0, ...lines.map((line) => measuring.measureText(line).width));
  return { width, height: lines.length * font.lineHeight, lines: lines.length, lineHeight: font.lineHeight };
}
const paddingOf = (style) => {
  const [top, right, bottom, left] = style.padding.split(" ").map(Number);
  return [top || 0, right || 0, bottom || 0, left || 0];
};
const identities = /* @__PURE__ */ new WeakMap();
let lastIdentity = 0;
function identity(object) {
  if (!object) return 0;
  return identities.get(object) ?? (identities.set(object, ++lastIdentity), lastIdentity);
}
function naturalSize(picture) {
  if (picture instanceof HTMLImageElement) return { width: picture.naturalWidth, height: picture.naturalHeight };
  if (picture instanceof HTMLVideoElement) return { width: picture.videoWidth, height: picture.videoHeight };
  const { width, height } = picture;
  return { width: typeof width === "number" ? width : 0, height: typeof height === "number" ? height : 0 };
}
class SceneMirror extends HTMLElement {
  static observedAttributes = ["class", "style", "data-ww-viewport", "background", "background-spacing", "grid"];
  /** Counters, for checks and measurements: flushes, computed styles read, shapes drawn, nodes whose ports were measured. */
  stats = { flushes: 0, styled: 0, drawn: 0, measured: 0 };
  /** The scene's own box. The renderer puts its drawing in here, below the layer that holds the nodes, the stand-ins and the overlay. */
  surface;
  /** The marquee and the wire in progress, in scene coordinates. */
  overlay;
  /** True while a forwarded event is being dispatched on its scene element. */
  forwarding = false;
  #states = this.attachInternals().states;
  #standIns;
  #viewRule;
  #records = /* @__PURE__ */ new Map();
  /** The items in template order. */
  #order = [];
  #keys = /* @__PURE__ */ new Map();
  #attached = /* @__PURE__ */ new Map();
  #sprites = /* @__PURE__ */ new Set();
  /** What draws the `background`: an element of its own, in no template. */
  #background = null;
  #probe;
  /** The paths that go around nodes: they are laid out again when a node moves. */
  #orthogonal = /* @__PURE__ */ new Set();
  /** The boxes of the nodes in scene coordinates, until the flush ends. */
  #boxes = null;
  #standInItems = /* @__PURE__ */ new WeakMap();
  #pictures = /* @__PURE__ */ new Map();
  #dirty = /* @__PURE__ */ new Set();
  /** The nodes whose ports were measured since the last flush ended. */
  #measured = [];
  #structure = false;
  #restyle = false;
  #printing = false;
  #reorder = false;
  #queued = false;
  #scope = null;
  #sizes = null;
  #mutations = null;
  #view = IDENTITY;
  #viewport = null;
  #unfollow = null;
  /** Settles when the first layout has settled; made new at every connect. */
  #settled = this.#waiting();
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const view = new CSSStyleSheet();
    view.replaceSync("[part=layer] { translate: 0px 0px; scale: 1; --ww-scene-zoom: 1; --ww-scene-counter: 1; }");
    this.#viewRule = view.cssRules[0].style;
    root.adoptedStyleSheets = [sceneSheet, slottedSheet, view];
    root.innerHTML = `<div part="surface" tabindex="-1"><div part="layer"><svg part="proxies"></svg><slot></slot><svg part="overlay"><path part="link"/><rect part="marquee"/><g part="handles"/></svg></div></div><span part="probe" hidden></span>`;
    this.surface = root.firstElementChild;
    this.#probe = root.lastElementChild;
    this.#standIns = root.querySelector("[part=proxies]");
    this.overlay = { marquee: root.querySelector("[part=marquee]"), link: root.querySelector("[part=link]"), handles: root.querySelector("[part=handles]") };
  }
  connectedCallback() {
    const { signal } = this.#scope = new AbortController();
    const settled = this.#settled = this.#waiting();
    void document.fonts.ready.then(() => {
      if (this.#settled !== settled) return;
      settled.fonts = true;
      this.#schedule();
    });
    this.mount(this.surface);
    const sizes = this.#sizes = new ResizeObserver((entries) => this.#resized(entries));
    sizes.observe(this);
    const mutations = this.#mutations = new MutationObserver((records) => this.#observed(records) && this.#schedule());
    mutations.observe(this, WATCHED);
    for (const type of FORWARDED) {
      this.#standIns.addEventListener(
        type,
        (event) => {
          const item = this.#standInItems.get(event.target);
          if (item) this.forward(event, item);
        },
        { signal }
      );
    }
    const moved = (event) => {
      const owner = this.ownerOf(event.composedPath()[0]);
      if (owner instanceof SceneNode) this.remeasure(owner);
    };
    this.addEventListener("scroll", moved, { signal, capture: true });
    this.addEventListener("toggle", moved, { signal, capture: true });
    this.addEventListener("transitionend", moved, { signal });
    this.addEventListener("animationend", moved, { signal });
    signal.addEventListener("abort", () => {
      sizes.disconnect();
      mutations.disconnect();
      this.#unfollow?.();
      this.#unfollow = null;
      for (const item of [...this.#records.keys()]) this.#drop(item);
      this.#dirty.clear();
      this.#keys.clear();
      this.#pictures.clear();
      this.#measured = [];
      this.#order = [];
      this.unmount();
    });
    this.connected(signal);
    this.#watchPrinting(signal);
    this.#watchTheme(signal);
    this.#follow();
    this.#backdrop();
    this.restructure();
  }
  disconnectedCallback() {
    this.#scope?.abort();
    this.#scope = null;
    this.#sizes = this.#mutations = null;
  }
  attributeChangedCallback(name) {
    if (name === "data-ww-viewport") this.#follow();
    else if (name === "background" || name === "background-spacing" || name === "grid") this.#backdrop();
    else this.restyle();
  }
  /** What draws the scene's background: its element, while the attributes ask for one. */
  get background() {
    return this.#background;
  }
  /** Makes, changes or removes the item that draws the `background`. */
  #backdrop() {
    if (!this.#scope) return;
    const kind = this.getAttribute("background");
    if (kind !== "dots" && kind !== "lines") {
      if (!this.#background) return;
      this.#background = null;
      return this.restructure();
    }
    if (!this.#background) this.#background = document.createElement(backgroundTag());
    this.#background.setAttribute("kind", kind);
    this.#background.setAttribute("spacing", String(parseFloat(this.getAttribute("background-spacing") ?? "") || parseFloat(this.getAttribute("grid") ?? "") || 20));
    this.#dirty.add(this.#background);
    this.restructure();
  }
  /** The style of the background: the colour and the size of its marks, from custom properties of the scene. */
  #gridStyle() {
    const computed = getComputedStyle(this);
    const probe = this.#probe.style;
    probe.color = "";
    probe.color = computed.getPropertyValue("--ww-scene-grid-color").trim() || "color-mix(in srgb, currentColor 25%, transparent)";
    const colour = getComputedStyle(this.#probe).color;
    const style = {
      key: "",
      stroke: colour,
      strokeWidth: parseFloat(computed.getPropertyValue("--ww-scene-grid-size")) || 1,
      dash: "none",
      fill: colour,
      opacity: 1,
      transition: "",
      fontFamily: "",
      fontSize: 0,
      fontWeight: "",
      fontStyle: "",
      textAnchor: "",
      lineHeight: 0,
      lineSet: false,
      baseline: "",
      whiteSpace: "",
      background: "none",
      padding: "",
      radius: 0,
      color: "",
      markerFill: "",
      markerSize: 0
    };
    style.key = Object.values(style).join("|");
    return style;
  }
  // ── Mirroring ─────────────────────────────────────────────────────────
  /** An attribute, a property or the hover state of an item changed. Called by the scene elements. */
  invalidate(item, attribute) {
    if (!this.#scope || attribute && item instanceof SceneNode && !NODE_PLACEMENT.has(attribute)) return;
    const owner = item.parentElement instanceof ScenePath ? item.parentElement : item;
    this.#dirty.add(owner);
    this.#schedule();
  }
  /** An item was added, removed or moved in the tree. Called by the scene elements. */
  restructure() {
    this.#structure = true;
    this.#schedule();
  }
  /**
   * Call after the widget rendered. Sprite batches are drawn again, because
   * their arrays are usually changed in place. Everything else has reported
   * its own change: an attribute of a scene element, or content of a node.
   * What no observer sees is told with `restyle()` and `remeasure()`.
   */
  refresh() {
    if (!this.#scope) return;
    for (const batch of this.#sprites) this.#dirty.add(batch);
    this.refreshed();
    this.flush();
  }
  /** Reads every computed style again: after a change of theme, or of a style rule that no attribute shows. */
  restyle() {
    this.#restyle = true;
    this.#schedule();
  }
  /** Measures the ports of a node, or of every node, again: for ports that moved without any change of the document. */
  remeasure(node) {
    for (const item of node ? [node] : this.#records.keys()) if (item instanceof SceneNode) this.#stale(item);
    this.#schedule();
  }
  #schedule() {
    if (this.#queued || !this.#scope) return;
    this.#queued = true;
    queueMicrotask(() => this.#queued && this.flush());
  }
  /** Brings the renderer up to date now. Runs by itself in a microtask after a change. */
  flush() {
    this.#queued = false;
    if (!this.#scope) return;
    this.stats.flushes++;
    this.#observed(this.#mutations.takeRecords());
    if (this.#structure) this.#reconcile();
    const all = this.#restyle;
    this.#structure = this.#restyle = false;
    this.#boxes = null;
    const dirty = this.#dirty;
    this.#dirty = /* @__PURE__ */ new Set();
    let moved = false;
    for (const item of dirty) {
      if (item instanceof SceneGroup) {
        for (const child of item.children) if (this.#records.has(child)) dirty.add(child);
      }
      if (item instanceof SceneNode) {
        moved = true;
        for (const path of this.#attached.get(item) ?? []) dirty.add(path);
      }
    }
    if (moved) {
      for (const path of this.#orthogonal) if (this.#records.has(path)) dirty.add(path);
    }
    for (const item of dirty) if (item instanceof SceneNode || item instanceof SceneGroup) item.place();
    const draw = [];
    const outlined = /* @__PURE__ */ new Set();
    for (const item of all ? this.#records.keys() : dirty) {
      const record = this.#records.get(item);
      if (!record) continue;
      for (let group = record.parent; group && !outlined.has(group); group = this.#records.get(group)?.parent ?? null) outlined.add(group);
      if (record.standIn && record.parent && dirty.has(record.parent)) outlined.add(item);
      if (item instanceof SceneNode) {
        this.portsOf(item);
        continue;
      }
      if (record.refused) continue;
      const style = item === this.#background ? this.#gridStyle() : this.#style(item);
      const again = dirty.has(item) || all && item instanceof ScenePath && item.childElementCount > 0;
      const drawing = again || !record.drawing ? this.#drawing(item, record, style) : record.drawing;
      const signature = this.#signature(item, drawing, style);
      record.style = style;
      record.drawing = drawing;
      if (signature !== null && signature === record.signature) continue;
      record.signature = signature;
      draw.push([item, record]);
    }
    for (const [item, record] of draw) {
      this.stats.drawn++;
      this.draw(item, record.drawing, record.style);
      outlined.add(item);
    }
    const framed = [.../* @__PURE__ */ new Set([...outlined, ...dirty])].filter((item) => item instanceof SceneGroup && item.hasAttribute("frame") && this.#records.has(item));
    const depth = (item) => {
      let count = 0;
      for (let group = this.groupOf(item); group; group = this.groupOf(group)) count++;
      return count;
    };
    for (const group of framed.sort((a, b) => depth(b) - depth(a))) {
      const record = this.#records.get(group);
      if (record.refused || !record.drawing || record.drawing.type !== "group") continue;
      const frame = this.#frame(group, record.style ?? this.#style(group));
      if (JSON.stringify(frame) === JSON.stringify(record.drawing.frame)) continue;
      const drawing = { ...record.drawing, frame };
      record.drawing = drawing;
      record.signature = this.#signature(group, drawing, record.style);
      this.stats.drawn++;
      this.draw(group, drawing, record.style);
      outlined.add(group);
    }
    const outlines = [];
    for (const item of outlined) {
      const record = this.#records.get(item);
      if (record && this.#wantsStandIn(item, record)) outlines.push([record, item, this.outline(item)]);
    }
    for (const [record, item, outline] of outlines) {
      const line = record.standIn.classList.contains("line");
      const extra = line ? this.extras(item).map((shape) => polyline(shape, true)).join("") : "";
      record.standIn.setAttribute("d", polyline(outline, !line) + extra);
    }
    if (this.#reorder) this.#orderStandIns();
    const measured = this.#measured.filter((node) => this.#records.has(node));
    this.#measured = [];
    if (measured.length) this.measured(measured);
    this.painted();
    this.#settle();
    this.synced();
  }
  #waiting() {
    let done = () => {
    };
    const promise = new Promise((resolve) => done = resolve);
    return { promise, done, over: false, fonts: false };
  }
  /**
   * The first layout has settled once the fonts are loaded and the scene has been
   * drawn with its nodes measured (or has no nodes): the sizes of the nodes, the
   * ports, the paths between them and `extent()` are what they will stay. It is
   * announced once per connect, with `ww-ready` and the promise `ready`.
   */
  #settle() {
    const state = this.#settled;
    if (state.over || !state.fonts) return;
    const nodes = [...this.#records.keys()].filter((item) => item instanceof SceneNode);
    if (nodes.length && !nodes.some((node) => this.#records.get(node)?.ports?.rendered)) return;
    state.over = true;
    state.done();
    this.tell(this, "ww-ready", {});
  }
  /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured, the paths are drawn. After it `extent()` is what it will stay. Also sent as `ww-ready`. */
  get ready() {
    return this.#settled.promise;
  }
  #reconcile() {
    const found = /* @__PURE__ */ new Map();
    const order = /* @__PURE__ */ new Map([[null, []]]);
    const walk = (element, group) => {
      for (const child of element.children) {
        if (!(child instanceof SceneItem)) continue;
        found.set(child, group);
        if (!(child instanceof SceneNode)) order.get(group).push(child);
        if (child instanceof SceneGroup) {
          order.set(child, []);
          walk(child, child);
        }
      }
    };
    if (this.#background) {
      found.set(this.#background, null);
      order.get(null).push(this.#background);
    }
    walk(this, null);
    for (const [item, record] of [...this.#records]) if (!found.has(item) || found.get(item) !== record.parent) this.#drop(item);
    for (const [item, parent] of found) {
      if (this.#records.has(item)) continue;
      const record = { parent, style: null, drawing: null, signature: null, standIn: null, ports: null, ends: [], refused: false };
      this.#records.set(item, record);
      this.#dirty.add(item);
      if (item instanceof SceneSprites) this.#sprites.add(item);
      if (item instanceof SceneNode) this.#sizes.observe(item);
      else {
        try {
          this.create(item);
        } catch (error) {
          record.refused = true;
          this.report("unsupported", error.message, item);
        }
      }
    }
    for (const [group, children] of order)
      this.arrange(
        group,
        children.filter((child) => !this.#records.get(child).refused)
      );
    this.#order = [...found.keys()].filter((item) => item !== this.#background);
    this.#reorder = true;
    this.#keys.clear();
    for (const item of this.#order) {
      if (item.key) this.#keys.set(item.key, item);
      if (item instanceof ScenePath) this.#dirty.add(item);
    }
  }
  #drop(item) {
    const record = this.#records.get(item);
    this.#records.delete(item);
    this.#dirty.delete(item);
    record.standIn?.remove();
    if (record.parent && this.#records.has(record.parent)) this.#dirty.add(record.parent);
    this.dropped(item);
    for (const loading of this.#pictures.values()) loading.users.delete(item);
    if (item instanceof SceneSprites) this.#sprites.delete(item);
    if (item instanceof ScenePath) {
      this.#attach(item, record, []);
      this.#orthogonal.delete(item);
    }
    if (item instanceof SceneNode) {
      this.#sizes.unobserve(item);
      this.#attached.delete(item);
    } else if (!record.refused) this.destroy(item);
  }
  #resized(entries) {
    for (const { target } of entries) {
      if (target === this) {
        this.#regrid();
        this.resized(this.clientWidth, this.clientHeight);
      } else if (target instanceof SceneNode) {
        const ports = this.#records.get(target)?.ports;
        if (!ports || ports.width !== target.offsetWidth || ports.height !== target.offsetHeight) this.#stale(target);
      }
    }
    this.flush();
  }
  /** A grid shows what is visible, so it is drawn again when the view or the scene's size changed. */
  #regrid() {
    if (!this.#background) return;
    this.#dirty.add(this.#background);
    this.#schedule();
  }
  /** Takes in what the mutation observer saw. True if something has to be drawn again. */
  #observed(records) {
    let changed = false;
    for (const { target, type, attributeName } of records) {
      const owner = this.ownerOf(target);
      if (owner instanceof SceneText) {
        if (type === "attributes") continue;
        this.#dirty.add(owner);
      } else if (owner instanceof ScenePath) {
        if (type === "attributes" && target === owner) continue;
        this.#dirty.add(owner);
      } else if (owner instanceof SceneNode) {
        if (type === "attributes" && (target === owner ? NODE_ATTRIBUTES : MODULE_ATTRIBUTES).has(attributeName)) continue;
        this.#stale(owner);
      } else continue;
      changed = true;
    }
    return changed;
  }
  /** The scene element a node of the document belongs to, through the shadow roots of nested components. */
  ownerOf(node) {
    for (let current = node; current && current !== this; current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null)) {
      if (current instanceof SceneItem) {
        if (!this.#records.has(current) && current.parentElement instanceof ScenePath) return this.#records.has(current.parentElement) ? current.parentElement : null;
        return this.#records.has(current) ? current : null;
      }
    }
    return null;
  }
  #stale(node) {
    const record = this.#records.get(node);
    if (!record) return;
    record.ports = null;
    this.#dirty.add(node);
  }
  #style(item) {
    this.stats.styled++;
    const computed = getComputedStyle(item);
    const text = item instanceof SceneText;
    const fonts = text || item instanceof SceneGroup && item.hasAttribute("label");
    const font = fonts ? fontOf(computed) : null;
    const baselines = { middle: "middle", central: "middle", mathematical: "middle", alphabetic: "alphabetic", ideographic: "alphabetic", "text-after-edge": "bottom", "text-bottom": "bottom" };
    const transparent = computed.backgroundColor === "rgba(0, 0, 0, 0)" || computed.backgroundColor === "transparent";
    const style = {
      key: "",
      stroke: computed.stroke,
      strokeWidth: parseFloat(computed.strokeWidth) || 0,
      dash: computed.strokeDasharray,
      fill: computed.fill,
      opacity: parseFloat(computed.opacity),
      transition: computed.transition,
      fontFamily: font ? font.fontFamily : "",
      fontSize: font ? font.fontSize : 0,
      fontWeight: font ? font.fontWeight : "",
      fontStyle: font ? font.fontStyle : "",
      textAnchor: text ? computed.textAnchor : "",
      lineHeight: font ? font.lineHeight : 0,
      lineSet: !!font && computed.lineHeight !== "normal",
      baseline: text ? baselines[computed.dominantBaseline] ?? "top" : "",
      whiteSpace: text ? computed.whiteSpace : "",
      background: text && !transparent ? computed.backgroundColor : "none",
      padding: text ? [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft].map((value) => parseFloat(value) || 0).join(" ") : "",
      radius: text ? parseFloat(computed.borderTopLeftRadius) || 0 : 0,
      color: item instanceof SceneGroup ? computed.color : "",
      markerFill: item instanceof ScenePath ? computed.getPropertyValue("--ww-scene-marker-fill").trim() || "none" : "",
      markerSize: item instanceof ScenePath ? parseFloat(computed.getPropertyValue("--ww-scene-marker-size")) || 0 : 0
    };
    style.key = Object.values(style).join("|");
    return style;
  }
  /** The lines of a text: its content with the white space of its style applied. */
  #lines(item, style) {
    const content = (item.textContent ?? "").trim();
    if (/^pre/.test(style.whiteSpace) || style.whiteSpace === "break-spaces") {
      return style.whiteSpace === "pre-line" ? content.split(/\s*\n\s*/).map((line) => line.replace(/[ \t]+/g, " ")) : content.split(/\r?\n/);
    }
    return [content.replace(/\s+/g, " ")];
  }
  #drawing(item, record, style) {
    const { x, y } = item.at;
    if (item instanceof SceneGroup) return { type: "group", x, y, scale: item.scale, frame: record.drawing?.type === "group" ? record.drawing.frame : null };
    if (item instanceof SceneGrid) return this.#grid(item, record, style);
    if (item instanceof ScenePath) return this.#path(item, record, style);
    if (item instanceof SceneShape) {
      const kind = item.getAttribute("kind");
      const rotate = item.num("rotate");
      if (kind === "circle") return { type: "circle", x, y, r: item.num("r") };
      if (kind === "polygon") return { type: "polygon", points: item.polygon.map((p) => ({ x: p.x + x, y: p.y + y })), origin: { x, y }, rotate };
      return { type: "rect", x, y, width: item.preview?.width ?? item.num("width"), height: item.preview?.height ?? item.num("height"), radius: Math.max(0, item.num("radius")), rotate };
    }
    if (item instanceof SceneImage) {
      const picture = this.#picture(item.picture, item);
      const own = picture ? naturalSize(picture) : { width: 0, height: 0 };
      let width = item.preview?.width ?? item.num("width", NaN);
      let height = item.preview?.height ?? item.num("height", NaN);
      if (Number.isNaN(width)) width = Number.isNaN(height) || !own.height ? own.width : height * own.width / own.height;
      if (Number.isNaN(height)) height = own.width ? width * own.height / own.width : own.height;
      return { type: "image", x, y, width, height, picture, href: item.source ? null : item.getAttribute("href") };
    }
    if (item instanceof SceneSprites) {
      const texture = this.#picture(item.texture, item);
      return { type: "sprites", items: item.items, texture, ready: !!texture || !item.texture };
    }
    return { type: "text", x, y, text: this.#lines(item, style).join("\n"), rotate: item.num("rotate") };
  }
  /** The visible part of the scene, in the coordinates of a grid's group, grown to whole cells. */
  #grid(item, record, style) {
    const local = this.#transform(record.parent);
    const a = invert(local, invert(this.#view, { x: 0, y: 0 }));
    const b = invert(local, invert(this.#view, { x: this.clientWidth, y: this.clientHeight }));
    const spacing = item.spacing;
    const [left, top] = [Math.floor(Math.min(a.x, b.x) / spacing) * spacing - spacing, Math.floor(Math.min(a.y, b.y) / spacing) * spacing - spacing];
    const [right, bottom] = [Math.ceil(Math.max(a.x, b.x) / spacing) * spacing + spacing, Math.ceil(Math.max(a.y, b.y) / spacing) * spacing + spacing];
    return { type: "grid", kind: item.getAttribute("kind") === "lines" ? "lines" : "dots", spacing, r: style.strokeWidth, area: { x: left, y: top, width: right - left, height: bottom - top } };
  }
  /** The box of a group around what it holds, or null. Reads the outlines of the members as they are drawn now. */
  #frame(group, style) {
    if (!group.hasAttribute("frame")) return null;
    const points = [];
    for (const child of group.children) {
      const inside = this.#records.get(child);
      if (inside) points.push(...this.#members(child, inside));
    }
    const box = bounds(points);
    if (!box) return null;
    const padding = Math.max(0, group.num("padding", 8));
    const text = (group.getAttribute("label") ?? "").trim();
    const label = text ? sizeOf(text, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight }) : null;
    const above = label ? label.height : 0;
    const width = Math.max(box.width + 2 * padding, label ? label.width + 2 * padding : 0);
    const frame = { x: box.x - padding, y: box.y - padding - above, width, height: box.height + 2 * padding + above };
    return {
      ...frame,
      radius: Math.max(0, group.num("radius")),
      interactive: group.hasAttribute("selectable") || group.hasAttribute("movable"),
      label: label ? { text, x: frame.x + padding, y: frame.y + padding / 2 } : null
    };
  }
  /** What a member contributes to the box of its group, in the group's coordinates: its outline, and what belongs to it. */
  #members(item, record) {
    return [...this.#outline(item, record), ...this.#extras(record).flat()];
  }
  /** The outline of a node, in scene coordinates. */
  #outlineOf(node) {
    const t = this.transformOf(node);
    const corner = apply(t, node.at);
    return { kind: node.outline ?? "rect", x: corner.x, y: corner.y, width: node.offsetWidth * t.k, height: node.offsetHeight * t.k, radius: node.num("radius") * t.k };
  }
  /** The boxes of all nodes that are rendered, in scene coordinates. Kept until the flush ends. */
  #nodeBoxes() {
    if (!this.#boxes) {
      this.#boxes = [];
      for (const [item] of this.#records) {
        if (!(item instanceof SceneNode) || !(item.offsetWidth || item.offsetHeight)) continue;
        const { x, y, width, height } = this.#outlineOf(item);
        this.#boxes.push({ node: item, box: { x, y, width, height } });
      }
    }
    return this.#boxes;
  }
  /**
   * The line of a path between two ends, in the coordinates of the path's group.
   * An end that is a whole node with an outline is met on that outline.
   */
  #line(item, local, from, to) {
    const toLocal = (o) => {
      if (!o) return null;
      const corner = invert(local, o);
      return { ...o, x: corner.x, y: corner.y, width: o.width / local.k, height: o.height / local.k, radius: o.radius / local.k };
    };
    const [a, b] = [invert(local, from.at), invert(local, to.at)];
    const [oa, ob] = [toLocal(from.outline), toLocal(to.outline)];
    let clip = [oa, ob];
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
    const kind = item.route;
    const loop = item.loop;
    const bend = item.bend;
    const waypoints = item.waypoints;
    let curve;
    if (loop !== null && from.node === to.node) {
      const box = toLocal(this.#outlineOf(from.node));
      const centred = from.centre && to.centre;
      const radians = (loop - 90) * Math.PI / 180;
      const edge = outlineEdge(box, { x: Math.cos(radians), y: Math.sin(radians) });
      const loopRadius = Math.max(14, 0.4 * Math.min(box.width, box.height));
      curve = loopCurve(a, b, loop, centred ? Math.hypot(edge.x - (box.x + box.width / 2), edge.y - (box.y + box.height / 2)) + 2 * loopRadius : 2 * loopRadius);
      if (centred) clip = [box, box];
    } else if (waypoints.length) {
      const points = [a, ...waypoints.map((w) => ({ x: (w.from === "end" ? b.x : a.x) + w.x, y: (w.from === "end" ? b.y : a.y) + w.y })), b];
      curve = { type: "poly", points };
    } else if ((kind === "arc" || kind === "straight") && (bend ?? (kind === "arc" ? 0.25 : 0)) !== 0) {
      curve = { type: "quad", a, c: arcControl(a, b, bend ?? 0.25), b };
    } else if (kind === "step" || kind === "curve" || kind === "orthogonal") {
      let [pa, pb, da, db] = [a, b, from.side, to.side];
      if (oa) {
        da = dominantSide(sub(b, a));
        pa = outlineEdge(oa, da);
        clip = [null, clip[1]];
      }
      if (ob) {
        db = dominantSide(sub(a, b));
        pb = outlineEdge(ob, db);
        clip = [clip[0], null];
      }
      if (kind === "orthogonal") {
        const boxes = this.#nodeBoxes().filter(({ node }) => node !== from.node && node !== to.node).map(({ box }) => {
          const corner = invert(local, box);
          return { x: corner.x, y: corner.y, width: box.width / local.k, height: box.height / local.k };
        });
        curve = { type: "poly", points: orthogonalRoute(pa, da, pb, db, boxes, ORTHOGONAL_GAP) };
      } else curve = routeCurve(pa, pb, kind, da, db);
    } else curve = lineCurve(a, b);
    return clip[0] || clip[1] ? clipCurve(curve, clip[0] && ((p) => outlineContains(clip[0], p)), clip[1] && ((p) => outlineContains(clip[1], p))) : curve;
  }
  /** A path: its line, trimmed to the markers at its ends, the markers and the labels. */
  #path(item, record, style) {
    const { x, y } = item.at;
    const width = item.hitWidth;
    const hit = width !== null ? Math.max(width, style.strokeWidth) : item.hasAttribute("selectable") || item.hasAttribute("movable") || item.hasAttribute("rewire") ? Math.max(HIT_WIDTH, style.strokeWidth) : 0;
    const from = this.#end(item.getAttribute("from"));
    const to = this.#end(item.getAttribute("to"));
    this.#attach(item, record, [...new Set([from?.node, to?.node].filter((node) => !!node))]);
    if (item.route === "orthogonal") this.#orthogonal.add(item);
    else this.#orthogonal.delete(item);
    const empty = { type: "path", d: "", points: [], hit, markers: [], labels: [] };
    let curve;
    if (item.attached) {
      if (!from?.at || !to?.at) return empty;
      curve = this.#line(item, this.#transform(record.parent), from, to);
    } else {
      const points = (item.points ?? []).map((point) => ({ x: point.x + x, y: point.y + y }));
      curve = points.length ? { type: "poly", points } : null;
    }
    if (!curve) return empty;
    const [startKind, endKind] = [item.markerStart, item.markerEnd];
    const markers = [];
    let line = curve;
    if (startKind !== "none" || endKind !== "none") {
      let size = style.markerSize || markerSize(style.strokeWidth);
      const insets = markerInset(startKind, size) + markerInset(endKind, size);
      const chord = Math.hypot(curveEnd(curve).x - curveStart(curve).x, curveEnd(curve).y - curveStart(curve).y);
      if (insets > 0.8 * chord && chord > 0) size *= 0.8 * chord / insets;
      for (const atStart of [true, false]) {
        const kind = atStart ? startKind : endKind;
        if (kind === "none") continue;
        const [tip, trimmed] = [atStart ? curveStart(curve) : curveEnd(curve), markerInset(kind, size)];
        line = atStart ? trimCurveStart(line, trimmed) : trimCurveEnd(line, trimmed);
        const base = atStart ? curveStart(line) : curveEnd(line);
        const away = { x: tip.x - base.x, y: tip.y - base.y };
        const length = Math.hypot(away.x, away.y);
        const out = trimmed > 0 && length > 1e-6 ? { x: away.x / length, y: away.y / length } : curveDirection(curve, atStart);
        const shape = marker(kind, tip, out, size);
        if (shape) markers.push(shape);
      }
    }
    const labels = this.#labels(item, curveSamples(curve, 32));
    return { type: "path", d: curveD(line), points: curveSamples(line), hit, markers, labels };
  }
  /** The labels of a path, placed on its line. */
  #labels(path, line) {
    const labels = [];
    for (const child of path.children) {
      if (!(child instanceof SceneText)) continue;
      const style = this.#style(child);
      const lines = this.#lines(child, style);
      const size = sizeOf(lines.join("\n"), { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight });
      const [top, right, bottom, left] = paddingOf(style);
      const [width, height] = [size.width + left + right, size.height + top + bottom];
      const place = placeLabel(line, { where: child.where, along: child.num("along"), side: child.side, gap: child.num("gap", 4), follow: child.hasAttribute("follow"), rotate: child.num("rotate"), width, height });
      const shift = turned({ x: (left - right) / 2, y: (top - bottom) / 2 }, { x: 0, y: 0 }, place.rotate);
      labels.push({ ...place, width, height, shift, lines, style });
    }
    return labels;
  }
  /** What decides whether an item has to be drawn again. Null: always. */
  #signature(item, drawing, style) {
    if (drawing.type === "sprites") return null;
    let shape;
    if (drawing.type === "path") shape = `${drawing.d}|${drawing.hit}|${JSON.stringify(drawing.markers)}|${JSON.stringify(drawing.labels)}`;
    else if (drawing.type === "polygon") shape = `${polyline(drawing.points)}|${drawing.origin.x}|${drawing.origin.y}|${drawing.rotate}`;
    else if (drawing.type === "image") shape = [drawing.x, drawing.y, drawing.width, drawing.height, drawing.href, identity(drawing.picture)].join("|");
    else shape = JSON.stringify(drawing);
    const flags = [item.hasAttribute("selected"), item.hasAttribute("selectable"), item.hasAttribute("movable"), item.getAttribute("aria-label")].join("|");
    return `${drawing.type}|${shape}|${style.key}|${flags}`;
  }
  /** Keeps the list of the paths that end at each node. */
  #attach(path, record, ends) {
    for (const node of record.ends) if (!ends.includes(node)) this.#attached.get(node)?.delete(path);
    for (const node of ends) {
      const paths = this.#attached.get(node) ?? /* @__PURE__ */ new Set();
      this.#attached.set(node, paths.add(path));
    }
    record.ends = ends;
  }
  // ── Pictures ──────────────────────────────────────────────────────────
  /**
   * The image source to draw for a picture: the source itself, or the loaded
   * image of a URL. Null while it loads and after it failed, so that a
   * renderer never shows a broken or half-loaded image. `item` is drawn again
   * when the picture has loaded, and gets the error event if it does not.
   */
  #picture(picture, item) {
    if (!picture) return null;
    if (typeof picture !== "string" && !(picture instanceof HTMLImageElement)) return picture;
    if (typeof picture !== "string" && picture.complete && picture.naturalWidth > 0) return picture;
    let loading = this.#pictures.get(picture);
    if (!loading) {
      const image = typeof picture === "string" ? Object.assign(new Image(), { crossOrigin: "anonymous", src: picture }) : picture;
      const started = loading = { image, status: "loading", users: /* @__PURE__ */ new Set() };
      this.#pictures.set(picture, started);
      image.decode().then(
        () => "ready",
        () => "failed"
      ).then((status) => {
        if (this.#pictures.get(picture) !== started) return;
        started.status = status;
        for (const user of started.users) status === "ready" ? user.changed() : this.#failed(picture, user);
      });
    } else if (loading.status === "failed" && !loading.users.has(item)) this.#failed(picture, item);
    loading.users.add(item);
    return loading.status === "ready" ? loading.image : null;
  }
  #failed(picture, item) {
    const name = typeof picture === "string" ? `"${picture.length > 80 ? `${picture.slice(0, 80)}…` : picture}"` : "source";
    this.report("load", `The picture ${name} of <${item.localName}> could not be loaded.`, item);
  }
  // ── Ports ─────────────────────────────────────────────────────────────
  /** The transform from a group's coordinates to scene coordinates. */
  #transform(group) {
    if (!group) return IDENTITY;
    return compose(this.#transform(this.#records.get(group)?.parent ?? null), { ...group.at, k: group.scale });
  }
  /** The transform from the coordinates an item's position is written in to scene coordinates. */
  transformOf(item) {
    return this.#transform(this.#records.get(item)?.parent ?? null);
  }
  /** The measured ports of a node. Kept until the node resizes or its content changes. */
  portsOf(node) {
    const record = this.#records.get(node);
    if (!record) return null;
    if (!record.ports) {
      this.stats.measured++;
      this.#measured.push(node);
      record.ports = measurePorts(node, (root) => this.#mutations?.observe(root, WATCHED));
    }
    return record.ports;
  }
  /** Where a measured port of a node is in scene coordinates. */
  portAt(node, port) {
    const origin = node.at;
    return apply(this.transformOf(node), { x: origin.x + port.at.x, y: origin.y + port.at.y });
  }
  /**
   * Resolves `node:port`, or a whole node: then the path meets the node's
   * outline, if the node has one (`outline` attribute), and its centre if not.
   * `at` is null while the node is not rendered.
   */
  #end(reference) {
    if (!reference) return null;
    const colon = reference.lastIndexOf(":");
    const node = this.#keys.get(colon < 0 ? reference : reference.slice(0, colon));
    if (!(node instanceof SceneNode)) return null;
    const ports = this.portsOf(node);
    const port = ports?.byName.get(colon < 0 ? "" : reference.slice(colon + 1)) ?? ports?.byName.get("");
    if (!port) return { node, at: null, side: { x: 0, y: 0 }, outline: null, centre: false };
    const centre = port.element === null;
    if (centre && colon < 0 && node.outline) {
      const outline = this.#outlineOf(node);
      return { node, at: { x: outline.x + outline.width / 2, y: outline.y + outline.height / 2 }, side: { x: 0, y: 0 }, outline, centre };
    }
    return { node, at: this.portAt(node, port), side: port.side, outline: null, centre };
  }
  /** The scene position of a port, written `node:port`, or null if there is no such node or it is not rendered. */
  portPosition(reference) {
    return this.#end(reference)?.at ?? null;
  }
  /**
   * The node and the element a reference names: `node:port` is the element of the
   * port, and a bare `node` is the node itself. Null if there is no such node or port.
   */
  resolve(reference) {
    if (!reference) return null;
    const colon = reference.lastIndexOf(":");
    const node = this.#keys.get(colon < 0 ? reference : reference.slice(0, colon));
    if (!(node instanceof SceneNode)) return null;
    const name = colon < 0 ? "" : reference.slice(colon + 1);
    if (!name) return { node, element: node, name };
    const element = this.portsOf(node)?.byName.get(name)?.element;
    return element ? { node, element, name } : null;
  }
  /**
   * The ends of an attached path as what they name: the reference as written, the node, the name of the port
   * (empty for a whole node) and the element of the port (the node itself for a whole node). An end is null if
   * the path has none, or names a node or a port that is not there. For a widget that is told which wire was
   * clicked and has to know which port it ends in.
   */
  endsOf(path) {
    this.#current();
    const end = (reference) => {
      const found = this.resolve(reference);
      return found && reference ? { reference, node: found.node, port: found.name, element: found.element } : null;
    };
    return { from: end(path.getAttribute("from")), to: end(path.getAttribute("to")) };
  }
  /** The outline of a node in scene coordinates, as it is now: a preview counts. */
  nodeOutline(node) {
    return this.#outlineOf(node);
  }
  /**
   * The paths that end at a port, written `node:port`, or at a whole node, written
   * `node`. A path counts for the port it names in `from` or in `to`.
   */
  wiresAt(reference) {
    this.#current();
    const bare = (value) => value?.endsWith(":") ? value.slice(0, -1) : value ?? "";
    const wanted = bare(reference);
    const colon = wanted.lastIndexOf(":");
    const node = this.#keys.get(colon < 0 ? wanted : wanted.slice(0, colon));
    if (!(node instanceof SceneNode)) return [];
    return [...this.#attached.get(node) ?? []].filter((path) => this.#records.has(path) && (bare(path.getAttribute("from")) === wanted || bare(path.getAttribute("to")) === wanted));
  }
  // ── Coordinates and the view ──────────────────────────────────────────
  /**
   * The viewport whose view the scene follows. It is followed while the scene
   * is the window of a viewport that tracks its view:
   * `<ww-scene data-ww-viewport="canvas">`. A scene that is wrapped in a
   * scrolling `data-ww-viewport` needs nothing: it is zoomed from outside.
   */
  get viewport() {
    return this.#viewport;
  }
  set viewport(value) {
    if (value === this.#viewport) return;
    this.#viewport = value;
    this.#follow();
  }
  /** The view that is applied: scene coordinates to CSS pixels from the scene's corner. */
  get view() {
    return this.#view;
  }
  /** True for a scene in a viewport: it is the window of one, or the world that a scrolling window shows. */
  get windowed() {
    return this.hasAttribute("data-ww-viewport") || !!this.parentElement?.hasAttribute("data-ww-viewport");
  }
  #follow() {
    this.#unfollow?.();
    this.#unfollow = null;
    const source = this.#scope && this.getAttribute("data-ww-viewport") === "canvas" ? this.#viewport : null;
    if (!source) return this.#look(IDENTITY);
    const read = () => {
      const { x, y, scale } = source.getSnapshot();
      this.#look({ x, y, k: scale });
    };
    this.#unfollow = source.subscribe(read);
    read();
  }
  #look(view) {
    const before = this.#view;
    if (view.x === before.x && view.y === before.y && view.k === before.k) return;
    this.#view = view;
    this.#regrid();
    this.#viewRule.setProperty("translate", `${view.x}px ${view.y}px`);
    this.#viewRule.setProperty("scale", String(view.k));
    this.#viewRule.setProperty("--ww-scene-zoom", String(view.k));
    this.#viewRule.setProperty("--ww-scene-counter", String(view.k > 0 ? 1 / view.k : 1));
    this.viewed(view);
    this.zoomed();
  }
  /** Client coordinates to CSS pixels from the scene's own corner, whatever scales the scene from outside. The view is not applied. */
  toSurface(clientX, clientY) {
    const rect = this.getBoundingClientRect();
    const k = rect.width / this.offsetWidth || 1;
    return { x: (clientX - rect.left) / k - this.clientLeft, y: (clientY - rect.top) / k - this.clientTop };
  }
  /** Client coordinates to scene coordinates, through the view and whatever scales the scene from outside. */
  toScene(clientX, clientY) {
    return invert(this.#view, this.toSurface(clientX, clientY));
  }
  /** Scene coordinates to client coordinates: the other way of `toScene`. */
  toClient(x, y) {
    const at = apply(this.#view, { x, y });
    const rect = this.getBoundingClientRect();
    const k = rect.width / this.offsetWidth || 1;
    return { x: rect.left + (at.x + this.clientLeft) * k, y: rect.top + (at.y + this.clientTop) * k };
  }
  /**
   * The items at a point, the topmost first: nodes (above everything drawn, the
   * later one first), then drawn items from the last in the template to the first.
   * A node is hit inside its outline; a path in its hit band (at least its width) and
   * on its markers and labels; a shape, a text or an image anywhere inside it, filled
   * or not; a group only in its frame. An item whose `pointer-events` is `none` is
   * left out. It is geometry: it answers for any point, also where no pointer is.
   * `point` is in scene coordinates, or in client coordinates with `{client: true}`.
   */
  itemsAt(point, options = {}) {
    this.#current();
    const at = options.client ? this.toScene(point.x, point.y) : point;
    const found = [];
    const order = [...this.#order].reverse();
    for (const nodes of [true, false]) {
      for (const item of order) {
        if (item instanceof SceneNode !== nodes) continue;
        const record = this.#records.get(item);
        if (!record || record.refused || !this.#covers(item, record, at)) continue;
        if (getComputedStyle(item).pointerEvents === "none") continue;
        found.push(item);
      }
    }
    return found;
  }
  /** The topmost item at a point (see `itemsAt`), or null for the background. */
  itemAt(point, options = {}) {
    return this.itemsAt(point, options)[0] ?? null;
  }
  #covers(item, record, p) {
    if (item instanceof SceneNode) return (item.offsetWidth > 0 || item.offsetHeight > 0) && outlineContains(this.#outlineOf(item), p);
    const k = this.transformOf(item).k;
    const drawing = record.drawing;
    if (item instanceof SceneGroup) {
      if (drawing?.type !== "group" || !drawing.frame) return false;
      const box = bounds(this.#toScene(record.parent, corners(drawing.frame).map((corner) => apply({ x: drawing.x, y: drawing.y, k: drawing.scale }, corner))));
      return !!box && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
    }
    if (drawing?.type === "path") {
      const band = Math.max(drawing.hit, record.style?.strokeWidth ?? 0) / 2 * k;
      return distanceToPolyline(this.outline(item), p.x, p.y) <= band || this.extras(item).some((shape) => polygonContains(shape, p));
    }
    if (drawing?.type === "circle") {
      const centre = apply(this.transformOf(item), drawing);
      return Math.hypot(p.x - centre.x, p.y - centre.y) <= drawing.r * k;
    }
    if (drawing?.type === "grid" || drawing?.type === "sprites") return false;
    return polygonContains(this.outline(item), p);
  }
  #toScene(group, points) {
    const local = this.#transform(group);
    return points.map((point) => apply(local, point));
  }
  /** Brings the renderer up to date if something is waiting, so that a question is answered for what the widget rendered. */
  #current() {
    if (this.#scope && (this.#queued || this.#dirty.size || this.#structure)) this.flush();
  }
  /**
   * The box around everything in the scene, in scene coordinates: what a
   * viewport fits (`new Viewport(this, {bounds: () => scene.extent()})`).
   * It holds nodes, shapes, images, sprites, texts with their padding, a path's
   * markers and labels, and the frames of groups. A grid is not part of it.
   * Null for an empty scene.
   */
  extent() {
    this.#current();
    const points = [];
    for (const [item, record] of this.#records) {
      if (item instanceof SceneGroup && !item.hasAttribute("frame")) continue;
      if (item instanceof SceneGrid) continue;
      if (item instanceof SceneSprites) {
        const local = this.#transform(record.parent);
        for (const sprite of item.items) points.push(apply(local, sprite));
      } else points.push(...this.outline(item), ...this.extras(item).flat());
    }
    return bounds(points);
  }
  /**
   * What the scene last worked out to draw for an item, in the coordinates of
   * the item's group: the line of a path with its markers and labels, the
   * frame of a group, the text of a text. Null for an item that is not drawn
   * (a node), or not there. For checks, and for a widget that has to know where
   * something ended up.
   */
  drawingOf(item) {
    this.#current();
    return this.#records.get(item)?.drawing ?? null;
  }
  /** The computed style the scene last read for an item, as the renderer uses it. Null for an item that is not drawn, or not there. */
  styleOf(item) {
    this.#current();
    return this.#records.get(item)?.style ?? null;
  }
  /**
   * The editor sends `ww-themechange` on the document when the document theme changes, which no observer of the
   * page sees. The scene reads its styles again then, and measures its ports: the font may have changed.
   * The controls of the nodes keep their size on the screen (`data-ww-control`).
   */
  #watchTheme(signal) {
    this.ownerDocument.addEventListener(
      THEME_CHANGE,
      () => {
        this.restyle();
        this.remeasure();
      },
      { signal }
    );
    signal.addEventListener("abort", adoptControls(this.getRootNode()), { once: true });
  }
  // ── Picture and print ─────────────────────────────────────────────────
  get #snapshot() {
    return { root: this, extent: () => this.extent(), drawingOf: (item) => this.drawingOf(item), styleOf: (item) => this.styleOf(item), measureText: (text, source) => this.measureText(text, source) };
  }
  /**
   * The scene as a standalone SVG document (a string), from what the scene
   * draws now: the same for every renderer. The picture is the box around everything
   * in the scene (`extent()`) with some padding, in scene pixels, with no view applied.
   * Texts keep their font, so nothing is estimated. The HTML of a `ww-node` is written
   * as a `<foreignObject>` with its computed styles inline (`{nodes: false}` leaves it out). A grid
   * (`background`) is not part of it; the tint of a sprite is not applied. Null for an empty scene.
   */
  toSVG(options) {
    return sceneToSVG(this.#snapshot, options)?.svg ?? null;
  }
  /**
   * The scene as a picture: PNG by default, `scale` pixels per scene pixel (2 by default),
   * `type` a MIME type such as `image/jpeg` (with `quality`). The page's web fonts are
   * embedded, because a rasterised SVG cannot load them itself. Rejects for an empty scene.
   */
  toImage(options) {
    return sceneToImage(this.#snapshot, options);
  }
  /**
   * True while the document is printed: between `beforeprint` and `afterprint`, while
   * the `print` media query matches (a headless print fires no `beforeprint`), and while
   * the widget around the scene has the editor's class `ww-beforeprint`.
   */
  get printing() {
    return this.#printing;
  }
  #watchPrinting(signal) {
    const media = matchMedia("print");
    const ancestors = [];
    for (let node = this; node; ) {
      const parent = node.parentElement ?? (node.getRootNode().host ?? null);
      if (parent) ancestors.push(parent);
      node = parent;
    }
    let flagged = false;
    const update = () => {
      const now = flagged || media.matches || ancestors.some((element) => element.classList.contains("ww-beforeprint"));
      if (now === this.#printing) return;
      this.#printing = now;
      this.printed(now);
    };
    const before = () => (flagged = true, update());
    const after = () => (flagged = false, update());
    window.addEventListener("beforeprint", before, { signal });
    window.addEventListener("afterprint", after, { signal });
    media.addEventListener(
      "change",
      () => {
        this.restyle();
        this.remeasure();
        update();
      },
      { signal }
    );
    const classes = new MutationObserver(update);
    for (const element of ancestors) classes.observe(element, { attributes: true, attributeFilter: ["class"] });
    signal.addEventListener("abort", () => {
      classes.disconnect();
      if (this.#printing) {
        this.#printing = false;
        this.printed(false);
      }
    });
    update();
  }
  /** The outline of an item in scene coordinates: a path's line, or the corners of a box. Empty for what is not rendered. */
  outline(item) {
    const record = this.#records.get(item);
    if (!record) return [];
    const local = this.#transform(record.parent);
    return this.#outline(item, record).map((point) => apply(local, point));
  }
  /** The shapes that belong to an item besides its outline, in scene coordinates: the markers and the labels of a path. */
  extras(item) {
    const record = this.#records.get(item);
    if (!record) return [];
    const local = this.#transform(record.parent);
    return this.#extras(record).map((shape) => shape.map((point) => apply(local, point)));
  }
  /** The markers and labels of a path, as polygons in the coordinates of the path's group. */
  #extras(record) {
    const drawing = record.drawing;
    if (drawing?.type !== "path") return [];
    return [...drawing.markers.map(markerPolygon), ...drawing.labels.map((label) => turnedBox(label.x, label.y, label.width, label.height, label.rotate))];
  }
  /** The outline in the coordinates of the item's group. */
  #outline(item, record) {
    if (item instanceof SceneNode) {
      const [width, height] = [item.offsetWidth, item.offsetHeight];
      return width || height ? corners({ ...item.at, width, height }) : [];
    }
    if (item instanceof SceneGroup) {
      const inner = { ...item.at, k: item.scale };
      const points = [];
      for (const child of item.children) {
        const inside = this.#records.get(child);
        if (inside) for (const point of this.#members(child, inside)) points.push(apply(inner, point));
      }
      const frame = record.drawing?.type === "group" ? record.drawing.frame : null;
      if (frame) points.push(...corners(frame).map((point) => apply(inner, point)));
      const box = bounds(points);
      return box ? corners(box) : [];
    }
    const drawing = record.drawing;
    if (drawing?.type === "path") return drawing.points;
    if (drawing?.type === "polygon") return drawing.points.map((point) => turned(point, drawing.origin, drawing.rotate));
    if (drawing?.type === "rect") return corners(drawing).map((point) => turned(point, { x: drawing.x + drawing.width / 2, y: drawing.y + drawing.height / 2 }, drawing.rotate));
    if (drawing?.type === "image") return corners(drawing);
    if (drawing?.type === "circle") return corners({ x: drawing.x - drawing.r, y: drawing.y - drawing.r, width: 2 * drawing.r, height: 2 * drawing.r });
    if (drawing?.type === "text") {
      const box = this.measure(item);
      if (!box) return [];
      const [top, right, bottom, left] = paddingOf(record.style);
      return corners({ x: box.x - left, y: box.y - top, width: box.width + left + right, height: box.height + top + bottom }).map((point) => turned(point, { x: drawing.x, y: drawing.y }, drawing.rotate));
    }
    return [];
  }
  /**
   * The size a text takes, from its font: the widest line and the height of
   * its lines, in scene pixels. `\n` breaks lines. `source` is an element
   * whose font is used (a `ww-text`, or any element), or some entries of a font
   * that replace the scene's own. It needs no drawn text, so a widget can size
   * a node to a label before it renders it.
   */
  measureText(text, source) {
    const base = fontOf(getComputedStyle(source instanceof Element ? source : this));
    return sizeOf(text, source && !(source instanceof Element) ? { ...base, ...source } : base);
  }
  // ── Stand-ins ─────────────────────────────────────────────────────────
  /**
   * A selectable or movable drawn item gets an element in the scene's own tree
   * that takes focus and shows the selection. Returns whether the item has one now.
   */
  #wantsStandIn(item, record) {
    const wanted = !(item instanceof SceneNode || item instanceof SceneSprites) && (item.hasAttribute("selectable") || item.hasAttribute("movable"));
    if (!wanted) {
      if (record.standIn) this.#reorder = true;
      record.standIn?.remove();
      record.standIn = null;
      return false;
    }
    if (!record.standIn) {
      record.standIn = document.createElementNS(SVG, "path");
      record.standIn.setAttribute("part", "proxy");
      record.standIn.setAttribute("tabindex", "0");
      record.standIn.setAttribute("role", "img");
      this.#standInItems.set(record.standIn, item);
      this.#standIns.append(record.standIn);
      this.#reorder = true;
    }
    const label = item.getAttribute("aria-label") ?? item.key;
    if (record.standIn.getAttribute("aria-label") !== label) record.standIn.setAttribute("aria-label", label);
    record.standIn.classList.toggle("line", item instanceof ScenePath);
    record.standIn.classList.toggle("selected", item.hasAttribute("selected"));
    return true;
  }
  /** Stand-ins follow the template, so that the Tab key visits them in its order. Only those out of place are moved. */
  #orderStandIns() {
    this.#reorder = false;
    let next = this.#standIns.firstElementChild;
    for (const item of this.#order) {
      const standIn = this.#records.get(item)?.standIn;
      if (!standIn) continue;
      if (standIn === next) next = next.nextElementSibling;
      else this.#standIns.insertBefore(standIn, next);
    }
  }
  /** The stand-in of a drawn item, if it has one. */
  standInOf(item) {
    return this.#records.get(item)?.standIn ?? null;
  }
  /** The item an event target stands in for. */
  standInItem(target) {
    return (target && this.#standInItems.get(target)) ?? null;
  }
  // ── Events ────────────────────────────────────────────────────────────
  /**
   * Dispatches an event that hit a drawn shape again on its scene element, so a
   * handler in the widget's template receives it whichever renderer is active.
   * `type` is given where the renderer has to derive an event, as Pixi does for
   * pointerover and pointerout. Returns true if the event is claimed: a
   * listener called `preventDefault()`, here or before it reached the drawing.
   *
   * The original stays inside the scene, with one exception. In a viewport, a
   * press that nothing claims falls through: it goes on as a press on the
   * scene itself, which is the background that the viewport pans.
   */
  forward(event, item, type = event.type) {
    if (type === "pointerover" || type === "pointerout") {
      item.setState("hover", type === "pointerover");
      this.invalidate(item);
    }
    const copy = new event.constructor(type, event);
    if (event.defaultPrevented) copy.preventDefault();
    this.forwarding = true;
    let claimed = false;
    try {
      claimed = !item.dispatchEvent(copy);
    } finally {
      this.forwarding = false;
    }
    if (claimed) event.preventDefault();
    if (type === event.type && (claimed || type !== "pointerdown" || !this.windowed)) event.stopPropagation();
    return claimed;
  }
  /** Dispatches a cancelable, bubbling `ww-*` event. False if a listener cancelled it. */
  fire(target, type, detail) {
    return target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true }));
  }
  /** Dispatches a bubbling `ww-*` event that nothing can cancel: a report, not a question. */
  tell(target, type, detail) {
    target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
  /** Reports what cannot be drawn as `ww-sceneerror`, on the item or on the scene. */
  report(code, message, item) {
    const detail = { code, message, item };
    if (this.fire(item ?? this, "ww-sceneerror", detail)) warnOnce(this, `${code}:${message}`, `<ww-scene>: ${message}`);
  }
  /** `ww-scene:state(name)` for the widget's CSS. */
  setState(name, on) {
    if (on) this.#states.add(name);
    else this.#states.delete(name);
  }
  // ── For the interactions ──────────────────────────────────────────────
  /** The items of the scene in template order. */
  get items() {
    return this.#order;
  }
  /** True for an item the scene mirrors at the moment. */
  has(item) {
    return this.#records.has(item);
  }
  /** What the scene last worked out to draw for an item, without drawing first. */
  recorded(item) {
    return this.#records.get(item)?.drawing ?? null;
  }
  /** The group an item is in, or null at the top of the scene. */
  groupOf(item) {
    return this.#records.get(item)?.parent ?? null;
  }
  /** Runs once per connect, with the signal that aborts on disconnect. */
  connected(_signal) {
  }
  /** Printing started (`true`) or ended (`false`), see `printing`. A renderer whose drawing does not print by itself prepares it here. */
  printed(_on) {
  }
  /** Runs when the widget rendered, before the flush. */
  refreshed() {
  }
  /** The ports of these nodes may have changed. Runs after the drawing was written. */
  measured(_nodes) {
  }
  /** An item left the scene. */
  dropped(_item) {
  }
  /** Runs after every flush, once the renderer has drawn. */
  painted() {
  }
  /** Runs after every flush, after `painted()`: for what the module keeps in the scene's own tree. */
  synced() {
  }
  /** The view changed. */
  zoomed() {
  }
  resized(_width, _height) {
  }
}
export {
  FORWARDED,
  SceneMirror
};
