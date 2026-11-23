import { type MarkerKind, type OutlineKind, type Point, type Rect, type Route } from "./geometry.js";
/** What a scene element needs from the `ww-scene` around it. */
export interface SceneLike extends HTMLElement {
    /** An attribute (then with its name), a property or the text of an item changed. */
    invalidate(item: SceneItem, attribute?: string): void;
    /** An item was added, removed or moved in the tree, or got another key. */
    restructure(): void;
}
/** What a `ww-image` or a `ww-sprites` batch draws: an image URL or an image source such as a canvas. */
export type Picture = string | CanvasImageSource;
/**
 * Defaults for the children of a scene or a group. They are `::slotted` rules, so
 * any rule of the widget wins. Drawn elements generate no box; the renderer reads
 * their computed style.
 */
export declare const slottedSheet: CSSStyleSheet;
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
export declare abstract class SceneItem extends HTMLElement {
    #private;
    /** Attributes of the subclass that change what is drawn. */
    static attributes: string[];
    static get observedAttributes(): string[];
    /** The `ww-scene` this item is in, while connected. */
    scene: SceneLike | null;
    /** Where a move or a resize in progress shows the item. Never written to an attribute. */
    preview: (Point & Partial<Rect>) | null;
    /** Finds the scene and tells it. Subclasses call it first. */
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _old: string | null, _value: string | null): void;
    /** Tells the scene to mirror this item again. */
    changed(): void;
    /** A numeric attribute, or `fallback` if it is missing or no number. */
    num(name: string, fallback?: number): number;
    /**
     * Writes an attribute for a property of the same name, so that a framework
     * that assigns such a prop as a property (React, Vue) sets the attribute.
     * `null`, `undefined` and `false` remove it, `true` writes it empty, a list is joined by spaces.
     */
    protected reflect(name: string, value: unknown): void;
    /** `data-ww-key`: what a path refers to and what the events report. */
    get key(): string;
    /** The position that is shown: the preview during a gesture, else the attributes. */
    get at(): Point;
    /** `:state(name)` for the widget's CSS, for example `ww-shape:state(hover)`. */
    setState(name: string, on: boolean): void;
}
/** The names of the eight resize handles. */
export declare const HANDLES: string[];
/**
 * The handles a `resizable` attribute asks for: none without the attribute,
 * all eight for an empty value, and otherwise the ones it names, as in
 * `resizable="s"` or `resizable="e w"`.
 */
export declare function handlesOf(value: string | null): string[];
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
export declare class SceneNode extends SceneItem {
    #private;
    static attributes: string[];
    connectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, value: string | null): void;
    /**
     * `outline`: the shape of the node where a path ends at it by the node's name
     * alone: `rect`, `rounded` (with `radius`), `circle` or `ellipse`. Null
     * without the attribute, and then such a path ends at the node's centre.
     * The selection outline follows it.
     */
    get outline(): OutlineKind | null;
    set outline(value: OutlineKind | string | null | undefined);
    /** Shows the node where its attributes, or the gesture in progress, put it. */
    place(): void;
}
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
export declare class SceneGroup extends SceneItem {
    #private;
    static attributes: string[];
    /** The `scale` attribute. Default 1. */
    get scale(): number;
    set scale(value: number | string | null | undefined);
    connectedCallback(): void;
    /** Shows the group where its attributes, or the move in progress, put it. */
    place(): void;
}
/** A waypoint of a path, as an offset from one of its two ends. */
export type Waypoint = {
    x: number;
    y: number;
    from: "start" | "end";
};
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
export declare class ScenePath extends SceneItem {
    #private;
    static attributes: string[];
    constructor();
    /** The line of a path that is not attached to ports. */
    get points(): Point[] | null;
    set points(value: Point[] | null);
    /** True if the path runs between two ends and has no position of its own. */
    get attached(): boolean;
    /** `route`: straight (the default), step, curve, arc, orthogonal or avoid. */
    get route(): Route;
    set route(value: Route | string | null | undefined);
    /** `bend`, or null without a number. */
    get bend(): number | null;
    set bend(value: number | string | null | undefined);
    /** `loop`, or null without the attribute. An empty one is 45. */
    get loop(): number | null;
    set loop(value: number | string | boolean | null | undefined);
    /** `waypoints`. */
    get waypoints(): Waypoint[];
    /** The attribute's text, or a list of points as the getter returns them. */
    set waypoints(value: readonly Waypoint[] | string | null | undefined);
    /** `marker-start`. */
    get markerStart(): MarkerKind;
    /** `marker-end`. */
    get markerEnd(): MarkerKind;
    /** `hit-width`, or null without a number. */
    get hitWidth(): number | null;
    /** The ends a reader may take to another port: none without `rewire`, `to` for an empty value. */
    get rewire(): ("from" | "to")[];
    /** The attribute's text, a list of ends, or `true` for the empty attribute. */
    set rewire(value: readonly ("from" | "to")[] | string | boolean | null | undefined);
}
/**
 * `kind="rect"` (x, y, width, height; `radius` rounds the corners), `"circle"` (x, y is the centre; r) or `"polygon"` (points, relative to x, y).
 * `rotate` turns a rect, in degrees clockwise, about its centre, and a polygon about x, y.
 * A rect with `resizable` has handles while it is selected, as a node has (`resizable="s"` for
 * the bottom edge alone; not for a turned rect), and a resize ends in `ww-resize`.
 * `min-width`, `min-height`, `max-width` and `max-height` limit it.
 */
export declare class SceneShape extends SceneItem {
    static attributes: string[];
    /** The `points` attribute of a polygon. */
    get polygon(): Point[];
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
export declare class SceneText extends SceneItem {
    static attributes: string[];
    /** `at` as a fraction of the length of the path. */
    get where(): number;
    /** `side`. */
    get side(): "on" | "left" | "right" | "above" | "below";
    set side(value: "on" | "left" | "right" | "above" | "below" | string | null | undefined);
    /** The position that is shown, as for every item. Setting it writes the `at` attribute of a label: `start`, `end` or a fraction of the path. */
    get at(): Point;
    set at(value: Point | string | number | null | undefined);
}
/**
 * What draws the `background` of a `ww-scene`: a grid of dots or lines. It is
 * not an element of a template: the scene makes one for itself (under a tag
 * that is defined on first use), sets `kind` and `spacing`, and draws it
 * first, below everything else.
 */
export declare class SceneGrid extends SceneItem {
    static attributes: string[];
    /** `spacing`: at least 2. */
    get spacing(): number;
}
/**
 * A drawn picture at x, y. `href` is its URL; `.source` is an image source
 * instead, such as a canvas. Without `width` and `height` it has its own size.
 * With `resizable` it has handles while it is selected, as a rect has.
 */
export declare class SceneImage extends SceneItem {
    #private;
    static attributes: string[];
    /** An image source to draw. It wins over `href`. */
    get source(): CanvasImageSource | null;
    set source(value: CanvasImageSource | null);
    /** What is drawn: `.source`, or the URL in `href`. */
    get picture(): Picture | null;
}
/** One sprite of a `ww-sprites` batch. `tint` is a colour number or any colour Pixi parses. */
export type SpriteItem = {
    x: number;
    y: number;
    rotation?: number;
    scale?: number;
    tint?: number | string;
    alpha?: number;
};
/** One batch drawn from an array. Pixi renderer only. */
export declare class SceneSprites extends SceneItem {
    #private;
    static attributes: string[];
    /** The sprites. The array may be changed in place: the batch is drawn again after every render of the widget. */
    get items(): readonly SpriteItem[];
    set items(value: readonly SpriteItem[]);
    /** A URL (also as the attribute) or an image source such as a canvas. */
    get texture(): Picture | null;
    set texture(value: Picture | null);
}
