import { ModuleCore, type CoreOptions } from "../base.js";
import type { MessagesOption } from "../messages.js";
import type { PortEnd, SceneAction, SceneBase, SceneView, TextFont, TextSize, UndoHost } from "./base.js";
import type { SceneItem, ScenePath } from "./elements.js";
import type { Point, Rect } from "./geometry.js";
import type { SceneMessages } from "../messages/scene/index.js";
/** A permission per action, by the name it has in the widget's `static permissions`. An action without a name is allowed. */
export type ScenePermissions = Partial<Record<SceneAction, string>>;
/** Options of `SceneCore`. */
export type SceneOptions = CoreOptions & {
    /**
     * Asked before a selection, a move, a resize or a connection, during it and
     * before it commits. A function returns false to refuse. A map names the
     * permission each action needs: `{move: "allowEditing", connect: "allowEditing"}`.
     * A function that is asked about a connection that starts at a port also gets the port element as its third argument,
     * so that it can refuse one port and not the whole node.
     */
    can?: ((action: SceneAction, item: Element, port?: Element) => boolean) | ScenePermissions;
    /** Resolves when the widget has rendered a model change. Lit: `() => host.updateComplete`. */
    rendered?: () => Promise<unknown>;
    /**
     * The viewport whose view the scene follows, for a scene that is the window
     * of a viewport which tracks its view: `<ww-scene data-ww-viewport="canvas">`.
     * Pass `viewport.core` of the Lit binding, or the `ViewportCore`. Leave it
     * out for a scene that is wrapped in a scrolling `data-ww-viewport`.
     */
    viewport?: SceneView;
    /** Entries that replace the module's own texts, in every language. */
    messages?: MessagesOption<SceneMessages>;
    /**
     * The element an undo step is opened on, for a controller that lives in a component inside the widget: the
     * editor knows the widget, and ignores a step that starts on anything else. `"outermost"` is the host at the top of the
     * shadow roots above the scene, which is the widget in the document; or give the element, or a function that returns it.
     * Without it the step is opened on the host of the shadow root the scene is in.
     */
    undoHost?: UndoHost;
};
/** The state of `SceneCore`. The selection is not in it: that is the widget's. */
export type SceneSnapshot = {
    /** True while the reader draws a marquee. A viewport stays still meanwhile: `can: () => !scene.marquee`. */
    readonly marquee: boolean;
};
/**
 * The widget's side of Scene. The scene elements do the work themselves; this
 * core tells every `ww-scene` in the widget's shadow root what only the widget
 * knows: that it rendered (`refresh()`), that the theme changed, what a reader
 * may do, which viewport shows it and when a model change has reached the
 * template.
 */
export declare class SceneCore extends ModuleCore<SceneSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: SceneOptions);
    getSnapshot(): SceneSnapshot;
    /** Every `ww-scene` in the widget's template. */
    get scenes(): SceneBase[];
    /** The box around everything in the widget's first scene, in scene coordinates: the `bounds` of a Viewport. */
    extent(): Rect | null;
    /**
     * The size a text takes in the widget's first scene: the widest line and the
     * height of its lines, in scene pixels. `\n` breaks lines. `source` is an
     * element whose font is used, such as a `ww-text`, or some entries of a font.
     * A text need not be drawn: size a node to its label before rendering it.
     */
    measureText(text: string, source?: Element | Partial<TextFont>): TextSize;
    /** Resolves when the first layout of the widget's first scene has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. Also `ww-ready` on the scene. */
    get ready(): Promise<void>;
    /** Client coordinates to scene coordinates of the widget's first scene, through its view. */
    toScene(clientX: number, clientY: number): Point;
    /** Scene coordinates of the widget's first scene to client coordinates. */
    toClient(x: number, y: number): Point;
    /** The topmost item of the widget's first scene at a point, or null: see `itemsAt` of the scene. `point` is in scene coordinates, or client coordinates with `{client: true}`. */
    itemAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem | null;
    /** The items of the widget's first scene at a point, the topmost first. */
    itemsAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem[];
    /** The ends of an attached path in the widget's first scene as what they name: the node, the port name and the port element. */
    endsOf(path: ScenePath): {
        from: PortEnd | null;
        to: PortEnd | null;
    };
    /** The paths in the widget's first scene that end at exactly this reference: at a port (`node:port`), or at a node as a whole (`node`), which does not count the wires at its ports. */
    wiresAt(reference: string): ScenePath[];
    /** Reads every computed style again, for a change of style that no observer sees, such as a new style rule. */
    restyle(): void;
    /** Measures every port again, for ports that moved without any change of the document. */
    remeasure(): void;
    protected onConnect(): void;
    protected onRefresh(): void;
}
