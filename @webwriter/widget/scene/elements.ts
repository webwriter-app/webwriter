// The scene elements. They are a description: none of them draws anything. Each
// one tells its `ww-scene` when it was added, changed or removed, and the scene
// mirrors it into its renderer.
import {MARKERS, type MarkerKind, type OutlineKind, type Point, type Rect, type Route} from "./geometry.js"

/** What a scene element needs from the `ww-scene` around it. */
export interface SceneLike extends HTMLElement {
  /** An attribute (then with its name), a property or the text of an item changed. */
  invalidate(item: SceneItem, attribute?: string): void
  /** An item was added, removed or moved in the tree, or got another key. */
  restructure(): void
}

/** What a `ww-image` or a `ww-sprites` batch draws: an image URL or an image source such as a canvas. */
export type Picture = string | CanvasImageSource

function sheet(css: string): CSSStyleSheet {
  const result = new CSSStyleSheet()
  result.replaceSync(css)
  return result
}

/**
 * Defaults for the children of a scene or a group. They are `::slotted` rules, so
 * any rule of the widget wins. Drawn elements generate no box; the renderer reads
 * their computed style.
 */
export const slottedSheet = sheet(`
::slotted(*) { pointer-events: auto; }
::slotted(ww-path), ::slotted(ww-shape), ::slotted(ww-text), ::slotted(ww-image), ::slotted(ww-sprites) { display: none; }
::slotted(ww-path) { fill: none; stroke: currentColor; stroke-width: 1px; }
::slotted(ww-shape), ::slotted(ww-text) { fill: currentColor; stroke: none; }
`)

/**
 * `translate: attr(x px) attr(y px)` places an element from its attributes with no
 * script at all. Where the browser lacks typed attr(), `Placement` writes the same
 * values into a style rule of the element's own shadow root.
 */
const TYPED_ATTR = CSS.supports("translate", "attr(x px, 0px) attr(y px, 0px)") && CSS.supports("scale", "attr(scale type(<number>), 1)")

/**
 * Position and size of a node or a group. Nothing is written onto the element,
 * which belongs to the widget's template: the attributes are applied by CSS, and
 * the preview of a gesture is a Web Animation that is cancelled when it ends.
 */
class Placement {
  #rule: CSSStyleDeclaration | null = null
  #preview: Animation | null = null

  constructor(
    readonly element: HTMLElement,
    shared: CSSStyleSheet[],
  ) {
    const root = element.attachShadow({mode: "open"})
    root.innerHTML = "<slot></slot>"
    root.adoptedStyleSheets = shared
    if(TYPED_ATTR) return
    const own = sheet(":host {}")
    root.adoptedStyleSheets = [...shared, own]
    this.#rule = (own.cssRules[0] as CSSStyleRule).style
  }

  /** `values` are what the attributes say. `preview`, if given, overrides them for now. */
  set(values: Record<string, string>, preview: Record<string, string> | null) {
    if(this.#rule) for(const [name, value] of Object.entries(values)) this.#rule.setProperty(name, value)
    if(!preview) {
      this.#preview?.cancel()
      this.#preview = null
    } else if(this.#preview) (this.#preview.effect as KeyframeEffect).setKeyframes([preview])
    else this.#preview = this.element.animate([preview], {fill: "forwards"})
  }
}

/**
 * Base class of the scene elements: everything a `ww-scene` mirrors.
 *
 * A movable item can be constrained, in the coordinates of its own group, by
 * attributes that are read while it is moved (by pointer and by keyboard):
 * `axis="x"` moves it horizontally only, `axis="y"` vertically only;
 * `min-x`, `max-x`, `min-y`, `max-y` keep its `x` and `y` inside those limits;
 * `bounds="x y width height"` keeps the whole box of the item inside that box, when it is moved and when it is
 * resized (the edge that is dragged stops at it). `grid` is a snap grid of the item itself, instead of the scene's.
 * Several items that move together keep every one of their limits.
 */
export abstract class SceneItem extends HTMLElement {
  /** Attributes of the subclass that change what is drawn. */
  static attributes: string[] = []
  static get observedAttributes() {
    return ["class", "style", "selected", "selectable", "movable", "data-ww-key", "aria-label", "x", "y", ...this.attributes]
  }

  /** The `ww-scene` this item is in, while connected. */
  scene: SceneLike | null = null
  /** Where a move or a resize in progress shows the item. Never written to an attribute. */
  preview: (Point & Partial<Rect>) | null = null
  #states = this.attachInternals().states

  /** Finds the scene and tells it. Subclasses call it first. */
  connectedCallback() {
    const scene = this.closest("ww-scene") as SceneLike | null
    // An element that is not upgraded yet finds its items itself when it connects.
    this.scene = scene && "restructure" in scene ? scene : null
    this.scene?.restructure()
  }

  disconnectedCallback() {
    this.scene?.restructure()
    this.scene = null
  }

  attributeChangedCallback(name: string, _old: string | null, _value: string | null) {
    // Paths find a node by its key, so a new key is a change of the structure.
    if(name === "data-ww-key") this.scene?.restructure()
    this.scene?.invalidate(this, name)
  }

  /** Tells the scene to mirror this item again. */
  changed() {
    this.scene?.invalidate(this)
  }

  /** A numeric attribute, or `fallback` if it is missing or no number. */
  num(name: string, fallback = 0): number {
    const value = parseFloat(this.getAttribute(name) ?? "")
    return Number.isFinite(value) ? value : fallback
  }

  /**
   * Writes an attribute for a property of the same name, so that a framework
   * that assigns such a prop as a property (React, Vue) sets the attribute.
   * `null`, `undefined` and `false` remove it, `true` writes it empty, a list is joined by spaces.
   */
  protected reflect(name: string, value: unknown) {
    if(value === null || value === undefined || value === false) this.removeAttribute(name)
    else this.setAttribute(name, value === true ? "" : Array.isArray(value) ? value.join(" ") : String(value))
  }

  /** `data-ww-key`: what a path refers to and what the events report. */
  get key(): string {
    return this.getAttribute("data-ww-key") ?? ""
  }

  /** The position that is shown: the preview during a gesture, else the attributes. */
  get at(): Point {
    return this.preview ?? {x: this.num("x"), y: this.num("y")}
  }

  /** `:state(name)` for the widget's CSS, for example `ww-shape:state(hover)`. */
  setState(name: string, on: boolean) {
    if(on) this.#states.add(name)
    else this.#states.delete(name)
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
`)
/** The names of the eight resize handles. */
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

/**
 * The handles a `resizable` attribute asks for: none without the attribute,
 * all eight for an empty value, and otherwise the ones it names, as in
 * `resizable="s"` or `resizable="e w"`.
 */
export function handlesOf(value: string | null): string[] {
  if(value === null) return []
  const named = value.split(/[\s,]+/)
  const chosen = HANDLES.filter(handle => named.includes(handle))
  return chosen.length ? chosen : HANDLES
}

/**
 * HTML at a scene position. A real, laid-out element in both renderers.
 *
 * `resizable` shows handles of the selected node: all eight without a value, or
 * the ones it names (`resizable="s"`, `resizable="e w"`; `n e s w` are the edges,
 * `ne se sw nw` the corners). `min-width`, `min-height` (16 without them),
 * `max-width` and `max-height` limit the size, `keep-ratio` keeps its proportions.
 *
 * `data-ww-link="kind"` on the node itself, and not on a port in it, makes the whole node
 * the place a wire starts from: a press anywhere on it (but on a control or a handle) draws a
 * wire instead of moving the node, so a widget sets it only in the mode that draws wires.
 * `data-ww-accept="kind"` makes the whole node a target of wires of that kind. Such a wire is
 * written as the bare key of the node (`from="a"`), and the node's outline says where it ends.
 * `data-ww-capacity` limits the wires at it, as it does at a port.
 */
export class SceneNode extends SceneItem {
  static attributes = ["width", "height", "resizable", "outline", "radius"]
  #placement = new Placement(this, [nodeSheet])
  #ownTabindex = false

  connectedCallback() {
    super.connectedCallback()
    this.place()
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    super.attributeChangedCallback(name, old, value)
    if(name === "resizable") {
      // The handles follow the value: all eight, or the edges and corners it names.
      const root = this.shadowRoot!
      const wanted = handlesOf(value)
      for(const handle of root.querySelectorAll<HTMLElement>("[part=handle]")) if(!wanted.includes(handle.dataset.wwHandle!)) handle.remove()
      const present = new Set([...root.querySelectorAll<HTMLElement>("[part=handle]")].map(handle => handle.dataset.wwHandle))
      root.append(
        ...wanted
          .filter(handle => !present.has(handle))
          .map(handle => {
            const element = document.createElement("div")
            element.part.add("handle")
            element.dataset.wwHandle = handle
            return element
          }),
      )
    }
    if(name === "selectable" || name === "movable") {
      // A node that can be selected or moved takes focus, for the keys. The template's own tabindex wins.
      const wanted = this.hasAttribute("selectable") || this.hasAttribute("movable")
      if(wanted && !this.hasAttribute("tabindex")) {
        this.tabIndex = 0
        this.#ownTabindex = true
      } else if(!wanted && this.#ownTabindex) {
        this.removeAttribute("tabindex")
        this.#ownTabindex = false
      }
    }
  }

  /**
   * `outline`: the shape of the node where a path ends at it by the node's name
   * alone: `rect`, `rounded` (with `radius`), `circle` or `ellipse`. Null
   * without the attribute, and then such a path ends at the node's centre.
   * The selection outline follows it.
   */
  get outline(): OutlineKind | null {
    const value = this.getAttribute("outline")
    return value === "rect" || value === "rounded" || value === "circle" || value === "ellipse" ? value : null
  }
  set outline(value: OutlineKind | string | null | undefined) {
    this.reflect("outline", value)
  }

  /** Shows the node where its attributes, or the gesture in progress, put it. */
  place() {
    const px = (value: number) => (Number.isFinite(value) ? `${value}px` : "auto")
    const preview = this.preview
    const outline = this.outline
    this.#placement.set(
      {
        translate: `${this.num("x")}px ${this.num("y")}px`,
        width: px(this.num("width", NaN)),
        height: px(this.num("height", NaN)),
        // Where typed attr() is missing: the corners of the outline.
        "border-radius": outline === "circle" || outline === "ellipse" ? "50%" : outline === "rounded" ? `${this.num("radius")}px` : "",
      },
      preview && {translate: `${preview.x}px ${preview.y}px`, ...(preview.width === undefined ? {} : {width: px(preview.width), height: px(preview.height ?? NaN)})},
    )
  }
}

const groupSheet = sheet(`:host { position: absolute; left: 0; top: 0; transform-origin: 0 0;
    translate: attr(x px, 0px) attr(y px, 0px); scale: attr(scale type(<number>), 1); }
:host([frame]) { fill: none; stroke: currentColor; stroke-width: 1px; }`)

/**
 * A translated and scaled group. Nodes inside it are transformed by CSS, drawn
 * items by the renderer.
 *
 * With the attribute `frame` the group is also drawn as a box around what it
 * holds: `padding` (pixels, 8 without it) around its nodes and drawn items,
 * with the corner `radius` and, above the content, the text of `label`. The
 * box has the group's own `fill`, `stroke`, `stroke-width` and `stroke-dasharray`, and takes
 * the pointer where the group is selectable or movable, so that it can be
 * grabbed anywhere inside. It follows its members while they move. An empty
 * group has no box.
 */
export class SceneGroup extends SceneItem {
  static attributes = ["scale", "frame", "padding", "label", "radius"]
  #placement = new Placement(this, [groupSheet, slottedSheet])

  /** The `scale` attribute. Default 1. */
  get scale(): number {
    return this.num("scale", 1)
  }
  set scale(value: number | string | null | undefined) {
    this.reflect("scale", value)
  }

  connectedCallback() {
    super.connectedCallback()
    this.place()
  }

  /** Shows the group where its attributes, or the move in progress, put it. */
  place() {
    const preview = this.preview
    this.#placement.set({translate: `${this.num("x")}px ${this.num("y")}px`, scale: String(this.scale)}, preview && {translate: `${preview.x}px ${preview.y}px`})
  }
}

/** A waypoint of a path, as an offset from one of its two ends. */
export type Waypoint = {x: number; y: number; from: "start" | "end"}

const pathSheet = sheet(`::slotted(ww-text) { display: none; fill: currentColor; stroke: none; stroke-width: 1px; stroke-dasharray: none; }`)

/**
 * A line between two ends, written `node:port` or only `node` (`from` / `to`),
 * or along `.points`, which are relative to x, y.
 *
 * - `route`: `straight` (the default), `step`, `curve`, `arc`, `orthogonal` or `avoid`.
 *   `step` and `curve` leave a whole node on the side that faces the other end.
 *   `orthogonal` has horizontal and vertical segments. Each end leaves at its side. The
 *   middle segment is halfway between the ends if no other node is there; otherwise it is
 *   at the nearest free place beside the nodes in the way, with 12 pixels between; if there
 *   is none, the path goes out, across above or below, and in. It does not avoid other
 *   paths, and is laid out again when any node moves: it is meant for tens of nodes.
 *   `avoid` searches an orthogonal visibility grid around all node boxes, including
 *   the end nodes, with 12 pixels of clearance. Earlier connectors in template
 *   order reserve lanes; shared segments and crossings carry a routing penalty.
 *   Shared port stubs and unavoidable crossings may remain. A trapped port draws
 *   no line. Routes update together when a node or connector changes. Intended
 *   for tens of nodes; explicit `waypoints` and `loop` still take precedence.
 *   `bend` (a number, positive to the left of the way from start to end) makes a straight path an arc:
 *   two paths between the same nodes, one each way and with the same `bend`, stay apart.
 *   `loop` (an angle in degrees, 0 up, clockwise) turns a path from a node to itself into a loop.
 *   `waypoints` is the route of the widget itself: `x,y` pairs, each from the start
 *   end, or with `e:` in front from the end (`"20,0 20,-60 e:-20,-60 e:-20,0"`).
 * - `marker-start`, `marker-end`: what sits at an end: `none`, `arrow`, `open-arrow`,
 *   `triangle`, `triangle-filled`, `diamond`, `diamond-filled`, `circle`, `circle-open`.
 * - `hit-width`: the width of the band, in pixels, in which the path takes the pointer.
 * - `rewire`: a reader may grab an end of an attached path and take it to another port, or off
 *   (`ww-reconnect`, `ww-disconnect`): `to` (the default), `from` or `from to`. The path takes the
 *   pointer in a band, as a selectable one does, and its end is grabbed within 16 pixels of it, or at
 *   the port it ends at when that port starts no wire (it has no `data-ww-link`, or it is full).
 *   While it is held the path has the state `:state(rewiring)`.
 *
 * A `ww-text` inside a path is a label of the path (see `SceneText`).
 */
export class ScenePath extends SceneItem {
  static attributes = ["from", "to", "route", "bend", "loop", "waypoints", "marker-start", "marker-end", "hit-width", "rewire"]
  #points: Point[] | null = null

  constructor() {
    super()
    // The labels of a path are its children. This is where they get their styles.
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = "<slot></slot>"
    root.adoptedStyleSheets = [pathSheet]
  }

  /** The line of a path that is not attached to ports. */
  get points(): Point[] | null {
    return this.#points
  }
  set points(value: Point[] | null) {
    this.#points = value
    this.changed()
  }

  /** True if the path runs between two ends and has no position of its own. */
  get attached(): boolean {
    return this.hasAttribute("from") && this.hasAttribute("to")
  }

  /** `route`: straight (the default), step, curve, arc, orthogonal or avoid. */
  get route(): Route {
    const value = this.getAttribute("route")
    return value === "step" || value === "curve" || value === "arc" || value === "orthogonal" || value === "avoid" ? value : "straight"
  }
  set route(value: Route | string | null | undefined) {
    this.reflect("route", value)
  }

  /** `bend`, or null without a number. */
  get bend(): number | null {
    const value = parseFloat(this.getAttribute("bend") ?? "")
    return Number.isFinite(value) ? value : null
  }
  set bend(value: number | string | null | undefined) {
    this.reflect("bend", value)
  }

  /** `loop`, or null without the attribute. An empty one is 45. */
  get loop(): number | null {
    if(!this.hasAttribute("loop")) return null
    const value = parseFloat(this.getAttribute("loop")!)
    return Number.isFinite(value) ? value : 45
  }
  set loop(value: number | string | boolean | null | undefined) {
    this.reflect("loop", value)
  }

  /** `waypoints`. */
  get waypoints(): Waypoint[] {
    const result: Waypoint[] = []
    for(const entry of (this.getAttribute("waypoints") ?? "").trim().split(/\s+(?=e:|[-+.\d])/)) {
      if(!entry) continue
      const end = entry.startsWith("e:")
      const [x, y] = entry
        .slice(end ? 2 : 0)
        .split(",")
        .map(Number)
      if(Number.isFinite(x) && Number.isFinite(y)) result.push({x, y, from: end ? "end" : "start"})
    }
    return result
  }
  /** The attribute's text, or a list of points as the getter returns them. */
  set waypoints(value: readonly Waypoint[] | string | null | undefined) {
    this.reflect("waypoints", typeof value === "object" && value ? value.map(point => `${point.from === "end" ? "e:" : ""}${point.x},${point.y}`) : value)
  }

  /** `marker-start`. */
  get markerStart(): MarkerKind {
    return marker(this.getAttribute("marker-start"))
  }

  /** `marker-end`. */
  get markerEnd(): MarkerKind {
    return marker(this.getAttribute("marker-end"))
  }

  /** `hit-width`, or null without a number. */
  get hitWidth(): number | null {
    const value = parseFloat(this.getAttribute("hit-width") ?? "")
    return Number.isFinite(value) ? Math.max(0, value) : null
  }

  /** The ends a reader may take to another port: none without `rewire`, `to` for an empty value. */
  get rewire(): ("from" | "to")[] {
    const value = this.getAttribute("rewire")
    if(value === null) return []
    const named = value.split(/[\s,]+/)
    const ends = (["from", "to"] as const).filter(end => named.includes(end))
    return ends.length ? ends : ["to"]
  }
  /** The attribute's text, a list of ends, or `true` for the empty attribute. */
  set rewire(value: readonly ("from" | "to")[] | string | boolean | null | undefined) {
    this.reflect("rewire", value)
  }
}

function marker(value: string | null): MarkerKind {
  return MARKERS.includes(value as MarkerKind) ? (value as MarkerKind) : "none"
}

/**
 * `kind="rect"` (x, y, width, height; `radius` rounds the corners), `"circle"` (x, y is the centre; r) or `"polygon"` (points, relative to x, y).
 * `rotate` turns a rect, in degrees clockwise, about its centre, and a polygon about x, y.
 * A rect with `resizable` has handles while it is selected, as a node has (`resizable="s"` for
 * the bottom edge alone; not for a turned rect), and a resize ends in `ww-resize`.
 * `min-width`, `min-height`, `max-width` and `max-height` limit it.
 */
export class SceneShape extends SceneItem {
  static attributes = ["kind", "width", "height", "r", "points", "radius", "rotate", "resizable"]

  /** The `points` attribute of a polygon. */
  get polygon(): Point[] {
    const numbers = (this.getAttribute("points") ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    const points: Point[] = []
    for(let i = 0; i + 1 < numbers.length; i += 2) points.push({x: numbers[i], y: numbers[i + 1]})
    return points
  }
}

/**
 * A drawn text. Its text is its text content; x, y is where it is placed: by
 * default the top of the first line, at its left end. Its style reads these
 * properties:
 *
 * - `white-space: pre-line` (or `pre`, `pre-wrap`) makes the line breaks of the text real; otherwise they are spaces.
 * - `text-anchor` (`start`, `middle`, `end`) says which end of the lines is at x.
 * - `dominant-baseline` says what y is: the top (the default; also `text-before-edge`), the
 *   middle (`middle`, `central`), the alphabetic baseline of the first line (`alphabetic`) or the bottom (`text-after-edge`).
 * - `line-height`, `font`; `fill`; `stroke` and `stroke-width` make a halo around the letters.
 * - `background-color` with `padding` and `border-radius` makes a box behind it.
 * - `rotate` (the attribute, degrees clockwise) turns it about x, y.
 *
 * A text inside a `ww-path` is a label of the path. `at` is where on the path
 * it sits: `start`, `middle` (the default), `end` or a fraction between 0 and 1 of its length;
 * `along` moves it that many pixels along the line; `side` puts it `on` the line (the default) or beside
 * it: `left` or `right` of the way the path goes, or `above` or `below` it; `gap` is the space
 * to the line then (4 pixels without it). `follow` turns it to the line, upright.
 * A label has its own `rotate` too. It is part of its path: it takes the
 * pointer, and is selected, with it, and no tab stop of its own.
 */
export class SceneText extends SceneItem {
  static attributes = ["rotate", "at", "along", "side", "gap", "follow"]

  /** `at` as a fraction of the length of the path. */
  get where(): number {
    const value = this.getAttribute("at")
    if(value === "start") return 0
    if(value === "end") return 1
    const number = parseFloat(value ?? "")
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0.5
  }

  /** `side`. */
  get side(): "on" | "left" | "right" | "above" | "below" {
    const value = this.getAttribute("side")
    return value === "left" || value === "right" || value === "above" || value === "below" ? value : "on"
  }
  set side(value: "on" | "left" | "right" | "above" | "below" | string | null | undefined) {
    this.reflect("side", value)
  }

  /** The position that is shown, as for every item. Setting it writes the `at` attribute of a label: `start`, `end` or a fraction of the path. */
  override get at(): Point {
    return super.at
  }
  override set at(value: Point | string | number | null | undefined) {
    this.reflect("at", typeof value === "object" ? null : value)
  }
}

/**
 * What draws the `background` of a `ww-scene`: a grid of dots or lines. It is
 * not an element of a template: the scene makes one for itself (under a tag
 * that is defined on first use), sets `kind` and `spacing`, and draws it
 * first, below everything else.
 */
export class SceneGrid extends SceneItem {
  static attributes = ["kind", "spacing"]

  /** `spacing`: at least 2. */
  get spacing(): number {
    return Math.max(2, this.num("spacing", 20))
  }
}

/**
 * A drawn picture at x, y. `href` is its URL; `.source` is an image source
 * instead, such as a canvas. Without `width` and `height` it has its own size.
 * With `resizable` it has handles while it is selected, as a rect has.
 */
export class SceneImage extends SceneItem {
  static attributes = ["width", "height", "href", "resizable"]
  #source: CanvasImageSource | null = null

  /** An image source to draw. It wins over `href`. */
  get source(): CanvasImageSource | null {
    return this.#source
  }
  set source(value: CanvasImageSource | null) {
    if(value === this.#source) return
    this.#source = value ?? null
    this.changed()
  }

  /** What is drawn: `.source`, or the URL in `href`. */
  get picture(): Picture | null {
    return this.#source ?? this.getAttribute("href")
  }
}

/** One sprite of a `ww-sprites` batch. `tint` is a colour number or any colour Pixi parses. */
export type SpriteItem = {x: number; y: number; rotation?: number; scale?: number; tint?: number | string; alpha?: number}

/** One batch drawn from an array. Pixi renderer only. */
export class SceneSprites extends SceneItem {
  static attributes = ["texture"]
  #items: readonly SpriteItem[] = []
  #texture: Picture | null = null

  /** The sprites. The array may be changed in place: the batch is drawn again after every render of the widget. */
  get items(): readonly SpriteItem[] {
    return this.#items
  }
  set items(value: readonly SpriteItem[]) {
    this.#items = value ?? []
    this.changed()
  }

  /** A URL (also as the attribute) or an image source such as a canvas. */
  get texture(): Picture | null {
    return this.#texture ?? this.getAttribute("texture")
  }
  set texture(value: Picture | null) {
    if(value === this.#texture) return
    this.#texture = value
    this.changed()
  }
}
