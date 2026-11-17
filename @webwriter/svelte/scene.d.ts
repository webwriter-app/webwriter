import type {SceneCore, SceneOptions} from "@webwriter/widget/scene"
import type {CoreStore} from "./base.js"

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
  SceneOptions,
  ScenePermissions,
  SceneSnapshot,
  SelectDetail,
  ImageOptions,
  SnapshotOptions,
  TextFont,
  TextSize,
  UndoHost,
} from "@webwriter/widget/scene"

export type SceneStore = CoreStore<SceneCore> &
  Pick<SceneCore, "extent" | "measureText" | "toScene" | "toClient" | "itemAt" | "itemsAt" | "endsOf" | "wiresAt" | "toSVG" | "toImage" | "restyle" | "remeasure"> & {
    /** True while the document is printed. */
    readonly printing: boolean
    /** Resolves when the first layout has settled: the fonts are loaded, the nodes are measured and the paths drawn, so that `extent()` is what it will stay. The scene also sends `ww-ready`. */
    readonly ready: Promise<void>
  }

export function sceneStore(host: HTMLElement, options?: SceneOptions): SceneStore
