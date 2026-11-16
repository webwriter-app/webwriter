import type {Point, PortEnd, Rect, SceneItem, ScenePath, SceneOptions, TextFont, TextSize} from "@webwriter/widget/scene"
import type {BindingOptions} from "./base.js"

export {sceneElements} from "@webwriter/widget/scene"
export type {
  ActivateDetail,
  BackgroundDetail,
  ConnectDetail,
  ConnectingDetail,
  ContextDetail,
  DisconnectDetail,
  HitDetail,
  HitKind,
  MoveDetail,
  MovingDetail,
  PointerPoint,
  PortEnd,
  ReconnectDetail,
  ResizeDetail,
  ResizingDetail,
  SceneErrorDetail,
  ScenePermissions,
  SelectDetail,
  TextFont,
  TextSize,
  UndoHost,
} from "@webwriter/widget/scene"

/**
 * React binding of Scene. The scene is written in the JSX with the `sceneElements`; `ww-select`, `ww-move`, `ww-resize` and `ww-connect` are heard with `useEvent()`.
 * `rendered` defaults to a promise that settles after React's next commit. For a scene that is the window of a canvas viewport pass `{viewport: viewport.core}`.
 */
export function useScene(host: HTMLElement, options?: BindingOptions<SceneOptions>): {
  /** True while the reader draws a marquee. */
  readonly marquee: boolean
  /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. The scene also sends `ww-ready`. Read when the property is. */
  readonly ready: Promise<void>
  /** The box around everything in the scene, in scene coordinates. */
  extent(): Rect | null
  /** The size a text takes in the scene, from the font of an element or some font entries; the text need not be drawn. `\n` breaks lines. */
  measureText(text: string, source?: Element | Partial<TextFont>): TextSize
  /** Client coordinates (a pointer event's `clientX`, `clientY`) to scene coordinates, through the view: where a drop in the scene lands. */
  toScene(clientX: number, clientY: number): Point
  /** Scene coordinates to client coordinates. */
  toClient(x: number, y: number): Point
  /** The topmost item at a point, or null for the background. `point` is in scene coordinates, or in client coordinates with `{client: true}`. */
  itemAt(point: Point, options?: {client?: boolean}): SceneItem | null
  /** The items at a point, the topmost first: nodes, then drawn items from the last in the template to the first. */
  itemsAt(point: Point, options?: {client?: boolean}): SceneItem[]
  /** The ends of an attached path as what they name: the node, the port name and the port element. For a click on a wire that has to know which port it ends in. */
  endsOf(path: ScenePath): {from: PortEnd | null; to: PortEnd | null}
  /** The paths that end at a port (`node:port`) or at a whole node (`node`): how many wires a port has. */
  wiresAt(reference: string): ScenePath[]
  /** Reads every computed style again. */
  restyle(): void
  /** Measures every port again. */
  remeasure(): void
}
