import type {DOMEditor} from "./domeditor-core"
import type {DependencyFeature} from "./features/dependencies"
import type {StateFeature} from "./features/state"
import type {HeadFeature} from "./features/head"
import type {TemplateFeature} from "./features/template"
import type {DistributionFeature} from "./features/distribution"
import type {MathFeature} from "./features/math"
import type {InsertionFeature} from "./features/insertion"
import type {HistoryFeature} from "./features/history"
import type {ListFeature} from "./features/list"
import type {TableFeature} from "./features/table"
import type {LayoutFeature} from "./features/layout"
import type {CanvasFeature} from "./features/canvas"
import type {SlidesFeature} from "./features/slides"
import type {BoardFeature} from "./features/board"
import type {ManipulationFeature} from "./features/manipulation"
import type {TransformationFeature} from "./features/transformation"
import type {GraphicFeature} from "./features/graphic"
import type {DialogFeature} from "./features/dialog"
import type {SelectionFeature} from "./features/selection"
import type {PlaceholderFeature} from "./features/placeholder"
import type {MarkFeature} from "./features/mark"
import type {CommentFeature} from "./features/comment"
import type {AttributionFeature} from "./features/attribution"
import type {ProofreadingFeature} from "./features/proofreading"
import type {CollaborationFeature} from "./features/collaboration"
import type {MediaFeature} from "./features/media"
import type {WidgetFeature} from "./features/widget"
import type {MigrationFeature} from "./features/migration"

export type EditorFeatures = {
  dependency: DependencyFeature
  state: StateFeature
  head: HeadFeature
  template: TemplateFeature
  distribution: DistributionFeature
  math: MathFeature
  insertion: InsertionFeature
  history: HistoryFeature
  list: ListFeature
  table: TableFeature
  layout: LayoutFeature
  canvas: CanvasFeature
  slides: SlidesFeature
  board: BoardFeature
  manipulation: ManipulationFeature
  transformation: TransformationFeature
  graphic: GraphicFeature
  dialog: DialogFeature
  selection: SelectionFeature
  placeholder: PlaceholderFeature
  mark: MarkFeature
  comment: CommentFeature
  attribution: AttributionFeature
  proofreading: ProofreadingFeature
  collaboration: CollaborationFeature
  media: MediaFeature
  widget: WidgetFeature
  migration: MigrationFeature
}
export type EditorExtensions = Pick<EditorFeatures, "dependency" | "state" | "template" | "distribution" | "insertion" | "placeholder" | "comment" | "attribution" | "proofreading" | "collaboration">
export type EditorExtensionFactory = (editor: DOMEditor) => EditorExtensions

/** Listener installation order is shared by authoring and reading sessions. */
export const editorFeatureNames = ["dependency", "state", "head", "template", "distribution", "math", "insertion", "history", "list", "table", "layout", "canvas", "slides", "board", "manipulation", "transformation", "graphic", "dialog", "selection", "placeholder", "mark", "comment", "attribution", "proofreading", "collaboration", "media", "widget", "migration"] as const
