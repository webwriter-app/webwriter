import { SceneCore, type Point, type PortEnd, type Rect, type SceneItem, type ScenePath, type SceneOptions, type TextFont, type TextSize } from "@webwriter/widget/scene";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export type { ActivateDetail, BackgroundDetail, ConnectDetail, ConnectingDetail, ContextDetail, DisconnectDetail, HitDetail, HitKind, MoveDetail, MovingDetail, PointerPoint, PortEnd, ReconnectDetail, ResizeDetail, ResizingDetail, SceneErrorDetail, ScenePermissions, SelectDetail, TextFont, TextSize, UndoHost, } from "@webwriter/widget/scene";
/**
 * Lit binding of Scene. The scene is written in the template with the elements
 * from `sceneElements`; this controller refreshes it after every render and
 * keeps an undo step open until the render that follows a commit event.
 */
export declare class SceneController extends CoreController<SceneCore> {
    constructor(host: CoreHost, options?: BindingOptions<SceneOptions>);
    /** True while the reader draws a marquee. A viewport stays still meanwhile: `can: () => !this.#scene.marquee`. */
    get marquee(): boolean;
    /** The box around everything in the scene, in scene coordinates: `new Viewport(this, {bounds: () => this.#scene.extent()})`. */
    extent(): Rect | null;
    /** The size a text takes in the scene, from the font of an element or some font entries; the text need not be drawn. `\n` breaks lines. */
    measureText(text: string, source?: Element | Partial<TextFont>): TextSize;
    /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. The scene also sends `ww-ready`. */
    get ready(): Promise<void>;
    /** Client coordinates (a pointer event's `clientX`, `clientY`) to scene coordinates, through the view: where a drop in the scene lands. */
    toScene(clientX: number, clientY: number): Point;
    /** Scene coordinates to client coordinates. */
    toClient(x: number, y: number): Point;
    /** The topmost item at a point, or null for the background. `point` is in scene coordinates, or in client coordinates with `{client: true}`. */
    itemAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem | null;
    /** The items at a point, the topmost first: nodes, then drawn items from the last in the template to the first. */
    itemsAt(point: Point, options?: {
        client?: boolean;
    }): SceneItem[];
    /** The ends of an attached path as what they name: the node, the port name and the port element. For a click on a wire that has to know which port it ends in. */
    endsOf(path: ScenePath): {
        from: PortEnd | null;
        to: PortEnd | null;
    };
    /** The paths that end at a port (`node:port`) or at a whole node (`node`): how many wires a port has. */
    wiresAt(reference: string): ScenePath[];
    /** Reads every computed style again, for a change of style that no observer sees, such as a new style rule. */
    restyle(): void;
    /** Measures every port again, for ports that moved without any change of the document. */
    remeasure(): void;
}
