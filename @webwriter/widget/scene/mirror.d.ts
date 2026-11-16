import { SceneGroup, SceneItem, SceneNode, ScenePath, type SceneLike, type SpriteItem } from "./elements.js";
import { type Marker, type Outline, type Point, type Rect, type Transform } from "./geometry.js";
import { type Port, type Ports } from "./ports.js";
/** The computed style of a scene element, as far as a renderer uses it. */
export type Style = {
    /** Changes whenever any value below changes. */
    key: string;
    stroke: string;
    strokeWidth: number;
    /** As computed: `none` or a list of lengths. */
    dash: string;
    fill: string;
    opacity: number;
    /** Passed through by the SVG renderer, so CSS transitions run on the drawn shape. */
    transition: string;
    /** Text, and the label of a group. */
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    fontStyle: string;
    textAnchor: string;
    /** Text only. The height of a line, in pixels: `line-height`, or 1.2 times the font size where that is `normal`. */
    lineHeight: number;
    /** Text only: true if the style sets `line-height`. */
    lineSet: boolean;
    /** Text only: what y is. `top`, `middle`, `alphabetic` or `bottom`. */
    baseline: string;
    /** Text only: `pre-line` and the like keep line breaks. */
    whiteSpace: string;
    /** Text only: the colour of the box behind it, or `none`. */
    background: string;
    /** Text only: the padding of that box as `top right bottom left`, in pixels. */
    padding: string;
    /** Text only: the corner radius of that box. */
    radius: number;
    /** A group's `color`, for its label. */
    color: string;
    /** A path only: the fill of a hollow marker, or `none`. `--ww-scene-marker-fill`. */
    markerFill: string;
    /** A path only: the length of its markers in pixels, or 0 for the size that follows its width. `--ww-scene-marker-size`. */
    markerSize: number;
};
/** The box a group draws around its content, in the group's own coordinates. */
export type Frame = {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    /** True if the group takes the pointer: then the whole box does. */
    interactive: boolean;
    label: {
        text: string;
        x: number;
        y: number;
    } | null;
};
/** A label of a path: a box centred at `x`, `y` and turned by `rotate` degrees, with text that is centred in it, `shift` aside. */
export type PathLabel = {
    x: number;
    y: number;
    rotate: number;
    width: number;
    height: number;
    shift: Point;
    lines: string[];
    style: Style;
};
/** What to draw for one scene element, in the coordinates of its group. */
export type Drawing = {
    type: "group";
    x: number;
    y: number;
    scale: number;
    frame: Frame | null;
}
/** `rotate` turns the rect about its centre. */
 | {
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    rotate: number;
} | {
    type: "circle";
    x: number;
    y: number;
    r: number;
}
/** `points` are unturned and absolute; `rotate` turns them about `origin`. */
 | {
    type: "polygon";
    points: Point[];
    origin: Point;
    rotate: number;
}
/** `hit` is the width of the band that takes the pointer; 0 leaves it to the drawn stroke. `markers` and `labels` are part of the path. */
 | {
    type: "path";
    d: string;
    points: Point[];
    hit: number;
    markers: Marker[];
    labels: PathLabel[];
}
/** `text` has its lines separated by `\n`. `rotate` turns it about x, y. */
 | {
    type: "text";
    x: number;
    y: number;
    text: string;
    rotate: number;
}
/** A grid of dots or lines over `area`, which holds what is visible and is a multiple of `spacing` in every side. */
 | {
    type: "grid";
    kind: "dots" | "lines";
    spacing: number;
    r: number;
    area: Rect;
}
/** `picture` is null while it loads and after it failed. `href` is its URL, if it was given as one. */
 | {
    type: "image";
    x: number;
    y: number;
    width: number;
    height: number;
    picture: CanvasImageSource | null;
    href: string | null;
}
/** `texture` is null if the batch has none, and while one loads; only then `ready` is false. */
 | {
    type: "sprites";
    items: readonly SpriteItem[];
    texture: CanvasImageSource | null;
    ready: boolean;
};
/**
 * `detail` of `ww-sceneerror`, the event for everything a scene cannot draw:
 * `load` (a picture did not load; on the `ww-image` or `ww-sprites`),
 * `unsupported` (the renderer refuses an element; on that element) and
 * `webgl` (the Pixi renderer got no WebGL context; on the scene).
 * The event bubbles. If no listener calls `preventDefault()`, the message is
 * logged as a warning in development.
 */
export type SceneErrorDetail = {
    code: "load" | "unsupported" | "webgl";
    message: string;
    item: SceneItem | null;
};
/**
 * What a scene needs of a viewport to follow its view: a world point `w` is
 * drawn at `w * scale + (x, y)`. `ViewportCore` satisfies it.
 */
export type SceneView = {
    getSnapshot(): {
        readonly x: number;
        readonly y: number;
        readonly scale: number;
    };
    subscribe(listener: () => void): () => void;
};
/** One end of an attached path, as `endsOf` resolves it. */
export type PortEnd = {
    reference: string;
    node: SceneNode;
    port: string;
    element: HTMLElement;
};
/** Events of drawn shapes that are dispatched again on their scene element. */
export declare const FORWARDED: string[];
/** The font of a text, as far as a measurement needs it. */
export type TextFont = {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    fontStyle: string;
    lineHeight: number;
};
/** What a measured text takes. */
export type TextSize = {
    width: number;
    height: number;
    lines: number;
    lineHeight: number;
};
/**
 * The description side of `ww-scene`. See the top of this file.
 *
 * Attributes of the scene besides the ones of the interactions (base.ts):
 *
 * - `background`: `dots` or `lines` draws a grid below everything, over the visible part of the scene.
 *   Its marks are at the multiples of `background-spacing` pixels, or of `grid` (the snap grid), or 20.
 *   The custom properties `--ww-scene-grid-color` (the text colour at a quarter of its strength
 *   without it) and `--ww-scene-grid-size` (the radius of a dot, the width of a line; 1 without it)
 *   style it. A renderer draws it as one tiled pattern, so it costs the same for any spacing. It takes no pointer and is no part of `extent()`.
 */
export declare abstract class SceneMirror extends HTMLElement implements SceneLike {
    #private;
    static observedAttributes: string[];
    /** Counters, for checks and measurements: flushes, computed styles read, shapes drawn, nodes whose ports were measured. */
    readonly stats: {
        flushes: number;
        styled: number;
        drawn: number;
        measured: number;
    };
    /** The scene's own box. The renderer puts its drawing in here, below the layer that holds the nodes, the stand-ins and the overlay. */
    protected readonly surface: HTMLElement;
    /** The marquee and the wire in progress, in scene coordinates. */
    protected readonly overlay: {
        readonly marquee: SVGRectElement;
        readonly link: SVGPathElement;
        readonly handles: SVGGElement;
    };
    /** True while a forwarded event is being dispatched on its scene element. */
    protected forwarding: boolean;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string): void;
    /** What draws the scene's background: its element, while the attributes ask for one. */
    get background(): SceneItem | null;
    /** An attribute, a property or the hover state of an item changed. Called by the scene elements. */
    invalidate(item: SceneItem, attribute?: string): void;
    /** An item was added, removed or moved in the tree. Called by the scene elements. */
    restructure(): void;
    /**
     * Call after the widget rendered. Sprite batches are drawn again, because
     * their arrays are usually changed in place. Everything else has reported
     * its own change: an attribute of a scene element, or content of a node.
     * What no observer sees is told with `restyle()` and `remeasure()`.
     */
    refresh(): void;
    /** Reads every computed style again: after a change of theme, or of a style rule that no attribute shows. */
    restyle(): void;
    /** Measures the ports of a node, or of every node, again: for ports that moved without any change of the document. */
    remeasure(node?: SceneNode): void;
    /** Brings the renderer up to date now. Runs by itself in a microtask after a change. */
    flush(): void;
    /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured, the paths are drawn. After it `extent()` is what it will stay. Also sent as `ww-ready`. */
    get ready(): Promise<void>;
    /** The scene element a node of the document belongs to, through the shadow roots of nested components. */
    protected ownerOf(node: Node | null): SceneItem | null;
    /** The transform from the coordinates an item's position is written in to scene coordinates. */
    protected transformOf(item: SceneItem): Transform;
    /** The measured ports of a node. Kept until the node resizes or its content changes. */
    protected portsOf(node: SceneNode): Ports | null;
    /** Where a measured port of a node is in scene coordinates. */
    protected portAt(node: SceneNode, port: Port): Point;
    /** The scene position of a port, written `node:port`, or null if there is no such node or it is not rendered. */
    portPosition(reference: string): Point | null;
    /**
     * The node and the element a reference names: `node:port` is the element of the
     * port, and a bare `node` is the node itself. Null if there is no such node or port.
     */
    protected resolve(reference: string | null): {
        node: SceneNode;
        element: HTMLElement;
        name: string;
    } | null;
    /**
     * The ends of an attached path as what they name: the reference as written, the node, the name of the port
     * (empty for a whole node) and the element of the port (the node itself for a whole node). An end is null if
     * the path has none, or names a node or a port that is not there. For a widget that is told which wire was
     * clicked and has to know which port it ends in.
     */
    endsOf(path: ScenePath): {
        from: PortEnd | null;
        to: PortEnd | null;
    };
    /** The outline of a node in scene coordinates, as it is now: a preview counts. */
    protected nodeOutline(node: SceneNode): Outline;
    /**
     * The paths that end at a port, written `node:port`, or at a whole node, written
     * `node`. A path counts for the port it names in `from` or in `to`.
     */
    wiresAt(reference: string): ScenePath[];
    /**
     * The viewport whose view the scene follows. It is followed while the scene
     * is the window of a viewport that tracks its view:
     * `<ww-scene data-ww-viewport="canvas">`. A scene that is wrapped in a
     * scrolling `data-ww-viewport` needs nothing: it is zoomed from outside.
     */
    get viewport(): SceneView | null;
    set viewport(value: SceneView | null);
    /** The view that is applied: scene coordinates to CSS pixels from the scene's corner. */
    protected get view(): Transform;
    /** True for a scene in a viewport: it is the window of one, or the world that a scrolling window shows. */
    protected get windowed(): boolean;
    /** Client coordinates to CSS pixels from the scene's own corner, whatever scales the scene from outside. The view is not applied. */
    toSurface(clientX: number, clientY: number): Point;
    /** Client coordinates to scene coordinates, through the view and whatever scales the scene from outside. */
    toScene(clientX: number, clientY: number): Point;
    /** Scene coordinates to client coordinates: the other way of `toScene`. */
    toClient(x: number, y: number): Point;
    /**
     * The items at a point, the topmost first: nodes (above everything drawn, the
     * later one first), then drawn items from the last in the template to the first.
     * A node is hit inside its outline; a path in its hit band (at least its width) and
     * on its markers and labels; a shape, a text or an image anywhere inside it, filled
     * or not; a group only in its frame. An item whose `pointer-events` is `none` is
     * left out. It is geometry: it answers for any point, also where no pointer is.
     * `point` is in scene coordinates, or in client coordinates with `{client: true}`.
     */
    itemsAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem[];
    /** The topmost item at a point (see `itemsAt`), or null for the background. */
    itemAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem | null;
    /**
     * The box around everything in the scene, in scene coordinates: what a
     * viewport fits (`new Viewport(this, {bounds: () => scene.extent()})`).
     * It holds nodes, shapes, images, sprites, texts with their padding, a path's
     * markers and labels, and the frames of groups. A grid is not part of it.
     * Null for an empty scene.
     */
    extent(): Rect | null;
    /**
     * What the scene last worked out to draw for an item, in the coordinates of
     * the item's group: the line of a path with its markers and labels, the
     * frame of a group, the text of a text. Null for an item that is not drawn
     * (a node), or not there. For checks, and for a widget that has to know where
     * something ended up.
     */
    drawingOf(item: SceneItem): Drawing | null;
    /** The outline of an item in scene coordinates: a path's line, or the corners of a box. Empty for what is not rendered. */
    protected outline(item: SceneItem): Point[];
    /** The shapes that belong to an item besides its outline, in scene coordinates: the markers and the labels of a path. */
    protected extras(item: SceneItem): Point[][];
    /**
     * The size a text takes, from its font: the widest line and the height of
     * its lines, in scene pixels. `\n` breaks lines. `source` is an element
     * whose font is used (a `ww-text`, or any element), or some entries of a font
     * that replace the scene's own. It needs no drawn text, so a widget can size
     * a node to a label before it renders it.
     */
    measureText(text: string, source?: Element | Partial<TextFont>): TextSize;
    /** The stand-in of a drawn item, if it has one. */
    protected standInOf(item: SceneItem): SVGPathElement | null;
    /** The item an event target stands in for. */
    protected standInItem(target: EventTarget | null): SceneItem | null;
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
    protected forward(event: Event, item: SceneItem, type?: string): boolean;
    /** Dispatches a cancelable, bubbling `ww-*` event. False if a listener cancelled it. */
    protected fire(target: Element, type: string, detail: unknown): boolean;
    /** Dispatches a bubbling `ww-*` event that nothing can cancel: a report, not a question. */
    protected tell(target: Element, type: string, detail: unknown): void;
    /** Reports what cannot be drawn as `ww-sceneerror`, on the item or on the scene. */
    protected report(code: SceneErrorDetail["code"], message: string, item: SceneItem | null): void;
    /** `ww-scene:state(name)` for the widget's CSS. */
    protected setState(name: string, on: boolean): void;
    /** The items of the scene in template order. */
    protected get items(): readonly SceneItem[];
    /** True for an item the scene mirrors at the moment. */
    protected has(item: SceneItem): boolean;
    /** What the scene last worked out to draw for an item, without drawing first. */
    protected recorded(item: SceneItem): Drawing | null;
    /** The group an item is in, or null at the top of the scene. */
    protected groupOf(item: SceneItem): SceneGroup | null;
    /** Runs once per connect, with the signal that aborts on disconnect. */
    protected connected(_signal: AbortSignal): void;
    /** Runs when the widget rendered, before the flush. */
    protected refreshed(): void;
    /** The ports of these nodes may have changed. Runs after the drawing was written. */
    protected measured(_nodes: readonly SceneNode[]): void;
    /** An item left the scene. */
    protected dropped(_item: SceneItem): void;
    /** Create the drawing surface as the first child of `surface`, and apply `view` to it. */
    protected abstract mount(surface: HTMLElement): void;
    protected abstract unmount(): void;
    /** A drawn item appeared (never a node). Throw to refuse it: the message is reported as `ww-sceneerror`. */
    protected abstract create(item: SceneItem): void;
    protected abstract destroy(item: SceneItem): void;
    /** The drawn children of a group (null: of the scene), in drawing order. */
    protected abstract arrange(group: SceneGroup | null, children: SceneItem[]): void;
    protected abstract draw(item: SceneItem, drawing: Drawing, style: Style): void;
    /** The box of a drawn text, in the coordinates of its group. Null if it is not drawn. */
    protected abstract measure(item: SceneItem): Rect | null;
    /** The object a renderer made for an item, for a widget that has to reach past the module. */
    abstract rendering(item: SceneItem): unknown;
    /** The view changed: apply it to the drawing. Nodes, stand-ins and the overlay are transformed by the module. */
    protected abstract viewed(view: Transform): void;
    /** Runs after every flush, once the renderer has drawn. */
    protected painted(): void;
    /** Runs after every flush, after `painted()`: for what the module keeps in the scene's own tree. */
    protected synced(): void;
    /** The view changed. */
    protected zoomed(): void;
    protected resized(_width: number, _height: number): void;
}
