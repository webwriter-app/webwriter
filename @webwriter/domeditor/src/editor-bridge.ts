import {
  canonicalMarkName,
  isMarkAttributeName,
  isStyleMarkName,
  type MarkAttributeValues,
  type MarkName,
  type StyleMarkValues,
} from "./marks"
import type {EditorStateSnapshot} from "./editor-state"
import {isMediaType, type MediaSelectionState} from "./media"
import type {WebWriterPackage} from "./packages"
import type {TableSelectionState} from "./table"
import {isGraphicShapeType, type GraphicSelectionState} from "./graphic"
import type {DocumentHeadElementState, DocumentHeadState} from "./document-head"
import {isFormElementType, type FormSelectionState} from "./form"

export const executeCompleteEvent = "dom-editor-execute-complete"
export const executeFailureEvent = "dom-editor-execute-failure"
export const selectionChangeEvent = "dom-editor-selection-change"
export const markStateChangeEvent = "dom-editor-mark-state-change"
export const commentStateChangeEvent = "dom-editor-comment-state-change"
export const presenceChangeEvent = "dom-editor-presence-change"
export const documentHeadStateChangeEvent = "dom-editor-document-head-state-change"
export const historyStateChangeEvent = "dom-editor-history-state-change"
export const initializeEditorMessage = "initialize-editor"
export const loadWidgetsMessage = "load-widgets"
export const aiEditReviewEvent = "dom-editor-ai-edit-review"

export type AIEditReviewAction = "accept" | "reject"

export type AIEditReviewMessage = {
  type: typeof aiEditReviewEvent
  detail: {
    editId: string
    action: AIEditReviewAction
  }
}

export function isAIEditReviewMessage(value: unknown): value is AIEditReviewMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<AIEditReviewMessage>
  return message.type === aiEditReviewEvent
    && !!message.detail
    && typeof message.detail === "object"
    && typeof message.detail.editId === "string"
    && (message.detail.action === "accept" || message.detail.action === "reject")
}

export type WidgetReference = {
  name: string
  version: string
}

export type InitializeEditorMessage = {
  type: typeof initializeEditorMessage
  syncUrl: string
  /** Per-iframe capability used to bind postMessage traffic to this frame. */
  bridgeNonce?: string
  initialState?: EditorStateSnapshot
}

export type LoadWidgetsMessage = {
  type: typeof loadWidgetsMessage
  bridgeNonce?: string
  widgets: WidgetReference[]
  /** Already-resolved package metadata. Local development packages use this
   * path because their assets cannot be resolved through the npm registry. */
  packages?: WebWriterPackage[]
}

export function isInitializeEditorMessage(value: unknown): value is InitializeEditorMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<InitializeEditorMessage>
  let validSyncUrl = false
  if(typeof message.syncUrl === "string" && message.syncUrl.length > 0) {
    try {
      const url = new URL(message.syncUrl)
      validSyncUrl = ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
    }
    catch {
      validSyncUrl = false
    }
  }
  return message.type === initializeEditorMessage
    && validSyncUrl
    && (message.bridgeNonce === undefined || typeof message.bridgeNonce === "string" && message.bridgeNonce.length >= 16)
    && (message.initialState === undefined || (
      !!message.initialState
      && typeof message.initialState === "object"
      && Array.isArray(message.initialState.update)
      && message.initialState.update.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ))
}

export function isLoadWidgetsMessage(value: unknown): value is LoadWidgetsMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<LoadWidgetsMessage>
  const packages = message.packages
  return message.type === loadWidgetsMessage
    && (message.bridgeNonce === undefined || typeof message.bridgeNonce === "string" && message.bridgeNonce.length >= 16)
    && Array.isArray(message.widgets)
    && message.widgets.every(widget => !!widget
      && typeof widget === "object"
      && typeof widget.name === "string"
      && typeof widget.version === "string",
    )
    && (packages === undefined || Array.isArray(packages) && packages.every(pkg => !!pkg
      && typeof pkg === "object"
      && typeof pkg.name === "string"
      && typeof pkg.version === "string"
      && Array.isArray(pkg.members)
      && Array.isArray(pkg.scripts)
      && Array.isArray(pkg.styles),
    ))
}

export type SelectionPathItem = {
  /** The child-node path from BODY to this element. */
  path: number[]
  /** The human-readable name shown in the breadcrumb. */
  name: string
  /** The key used by the shared icon renderer. */
  icon?: string
  /** An optional package-provided icon displayed instead of the shared icon. */
  iconUrl?: string
}

export type SelectionGap = {
  /** The child-node path of the element containing the gap. */
  parentPath: number[]
  /** The child-node offset where the gap sits. */
  offset: number
}

export type ElementStyleDeclaration = {
  value: string
  priority: "" | "important"
}

export type ElementStyleMutation = string | null | ElementStyleDeclaration

/** Text-bearing HTML block types exposed as paragraph-format choices. */
export const blockFormatTags = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "blockquote",
] as const

export type BlockFormatTag = typeof blockFormatTags[number]

export function isBlockFormatTag(value: string): value is BlockFormatTag {
  return blockFormatTags.includes(value as BlockFormatTag)
}

/** A serializable, DOM-derived projection of the element currently targeted
 * by element-style commands. Computed values are limited to the property names
 * requested by the host so ordinary selection changes stay inexpensive. */
export type ElementStyleState = {
  target: {
    localName: string
    namespaceURI: string | null
  } | null
  inline: Record<string, ElementStyleDeclaration>
  computed: Record<string, string>
  context: {
    display: string
    parentDisplay: string
  }
}

export type ListType = "ul" | "ol" | "dl" | "menu"

export type ListSelectionState = {
  /** The nearest active semantic list, or null when the selection is outside a list. */
  type: ListType | null
  /** The list's authored inline list-style-type value. */
  style: string
}

export type SelectionChangeDetail = {
  path: SelectionPathItem[]
  /** True only for the selection update emitted by a local insertion command. */
  inserted?: boolean
  /** True when the current selection is an element/node selection. */
  nodeSelected?: boolean
  /** True when the selected widget has captured interaction in its shadow tree. */
  capture?: boolean
  gap?: SelectionGap
  list?: ListSelectionState
  media?: MediaSelectionState
  form?: FormSelectionState
  table?: TableSelectionState
  graphic?: GraphicSelectionState
}

export type SelectionChangeMessage = {
  type: typeof selectionChangeEvent
  detail: SelectionChangeDetail
}

export type MarkStateChangeDetail = {
  /** True while the live DOM selection is a markable text range or caret. */
  canMark: boolean
  /** Canonical marks found in the range or effective for the caret. */
  marks: MarkName[]
  /** Inline style marks shared by the selection or effective at the caret. */
  styles?: StyleMarkValues
  /** Element-specific attributes shared by the selected mark wrappers. */
  attributes?: MarkAttributeValues
}

export type MarkStateChangeMessage = {
  type: typeof markStateChangeEvent
  detail: MarkStateChangeDetail
}

export type CommentStateChangeMessage = {
  type: typeof commentStateChangeEvent
  detail: CommentState
}

export type CommentState = {
  /** Whether the current DOM selection can be annotated. */
  canComment: boolean
  /** Whether one or more comments apply to the current selection. */
  active: boolean
  /** Plain text shared by the active comments, or an empty string when mixed. */
  text: string
  /** Number of comments applying to the current selection. */
  activeCount: number
  /** Total number of complete comments in the document. */
  count: number
  /** Whether authored comment ranges are visibly highlighted. */
  highlighting: boolean
}

export type PresenceUser = {
  clientId: number
  name: string
  initials: string
  color: string
}

export type PresenceChangeDetail = {
  users: PresenceUser[]
}

export type PresenceChangeMessage = {
  type: typeof presenceChangeEvent
  detail: PresenceChangeDetail
}

export type VersionHistoryUser = {
  clientId: number
  name: string
  initials: string
  color: string
}

export type VersionHistoryChanges = {
  added: number
  removed: number
  modified: number
}

export type VersionHistoryCheckpoint = {
  id: string
  timestamp: number
  label: string
  user: VersionHistoryUser
  changes: VersionHistoryChanges
  commentCount: number
}

export type VersionHistoryComment = {
  id: string
  checkpointId: string
  timestamp: number
  text: string
  user: VersionHistoryUser
}

export type VersionHistoryPreview = VersionHistoryChanges & {
  checkpointId: string
  isCurrent: boolean
}

export type VersionHistoryState = {
  checkpoints: VersionHistoryCheckpoint[]
  comments: VersionHistoryComment[]
  preview: VersionHistoryPreview | null
  currentCheckpointId: string | null
  currentUserId: number | null
}

export const emptyVersionHistoryState = (): VersionHistoryState => ({
  checkpoints: [],
  comments: [],
  preview: null,
  currentCheckpointId: null,
  currentUserId: null,
})

export type HistoryStateChangeMessage = {
  type: typeof historyStateChangeEvent
  detail: VersionHistoryState
}

export type DocumentHeadStateChangeMessage = {
  type: typeof documentHeadStateChangeEvent
  detail: DocumentHeadState
}

const isVersionHistoryUser = (value: unknown): value is VersionHistoryUser => {
  if(!value || typeof value !== "object") return false
  const user = value as Partial<VersionHistoryUser>
  return typeof user.clientId === "number"
    && Number.isInteger(user.clientId)
    && typeof user.name === "string"
    && typeof user.initials === "string"
    && typeof user.color === "string"
}

const isVersionHistoryChanges = (value: unknown): value is VersionHistoryChanges => {
  if(!value || typeof value !== "object") return false
  const changes = value as Partial<VersionHistoryChanges>
  return [changes.added, changes.removed, changes.modified]
    .every(count => typeof count === "number" && Number.isInteger(count) && count >= 0)
}

export function isHistoryStateChangeMessage(value: unknown): value is HistoryStateChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<HistoryStateChangeMessage>
  if(message.type !== historyStateChangeEvent || !message.detail || typeof message.detail !== "object") return false
  const {checkpoints, comments, preview, currentCheckpointId, currentUserId} = message.detail as Partial<VersionHistoryState>
  if(!Array.isArray(checkpoints) || !Array.isArray(comments)) return false
  if(currentCheckpointId !== null && typeof currentCheckpointId !== "string") return false
  if(currentUserId !== null && (typeof currentUserId !== "number" || !Number.isInteger(currentUserId))) return false
  if(!checkpoints.every(checkpoint => !!checkpoint
    && typeof checkpoint === "object"
    && typeof checkpoint.id === "string"
    && typeof checkpoint.timestamp === "number"
    && typeof checkpoint.label === "string"
    && isVersionHistoryUser(checkpoint.user)
    && isVersionHistoryChanges(checkpoint.changes)
    && typeof checkpoint.commentCount === "number"
    && Number.isInteger(checkpoint.commentCount)
    && checkpoint.commentCount >= 0)) return false
  if(!comments.every(comment => !!comment
    && typeof comment === "object"
    && typeof comment.id === "string"
    && typeof comment.checkpointId === "string"
    && typeof comment.timestamp === "number"
    && typeof comment.text === "string"
    && isVersionHistoryUser(comment.user))) return false
  return preview === null || !!preview
    && typeof preview === "object"
    && typeof preview.checkpointId === "string"
    && typeof preview.isCurrent === "boolean"
    && isVersionHistoryChanges(preview)
}

export type SerializedError = {
  name: string
  message: string
  stack?: string
}

export type ExecuteCompleteDetail = {
  requestId: string
  result: unknown
}

export type ExecuteFailureDetail = {
  requestId: string
  error: SerializedError
}

export type ExecuteResponse = {
  type: typeof executeCompleteEvent | typeof executeFailureEvent
  detail: ExecuteCompleteDetail | ExecuteFailureDetail
}

export function isExecuteResponse(value: unknown): value is ExecuteResponse {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<ExecuteResponse>
  if(message.type !== executeCompleteEvent && message.type !== executeFailureEvent) return false
  if(!message.detail || typeof message.detail !== "object") return false
  if(typeof (message.detail as ExecuteCompleteDetail).requestId !== "string") return false
  if(message.type === executeFailureEvent) {
    const error = (message.detail as Partial<ExecuteFailureDetail>).error
    if(!error || typeof error !== "object" || typeof error.name !== "string" || typeof error.message !== "string") return false
  }
  return true
}

export function isSelectionChangeMessage(value: unknown): value is SelectionChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<SelectionChangeMessage>
  if(message.type !== selectionChangeEvent || !message.detail || typeof message.detail !== "object") return false
  if(!Array.isArray(message.detail.path)) return false
  if(!message.detail.path.every(item => {
    if(!item || typeof item !== "object") return false
    const pathItem = item as Partial<SelectionPathItem>
    return Array.isArray(pathItem.path)
      && pathItem.path.every(index => Number.isInteger(index) && index >= 0)
      && typeof pathItem.name === "string"
      && (pathItem.icon === undefined || typeof pathItem.icon === "string")
      && (pathItem.iconUrl === undefined || typeof pathItem.iconUrl === "string")
  })) return false

  if(message.detail.nodeSelected !== undefined && typeof message.detail.nodeSelected !== "boolean") return false
  if(message.detail.capture !== undefined && typeof message.detail.capture !== "boolean") return false
  if(message.detail.inserted !== undefined && typeof message.detail.inserted !== "boolean") return false

  const gap = message.detail.gap as Partial<SelectionGap> | null | undefined
  const gapIsValid = gap === undefined || (
    !!gap
    && typeof gap === "object"
    && Array.isArray(gap.parentPath)
    && gap.parentPath.every(index => Number.isInteger(index) && index >= 0)
    && typeof gap.offset === "number"
    && Number.isInteger(gap.offset)
    && gap.offset >= 0
  )
  if(!gapIsValid) return false

  const list = message.detail.list as Partial<ListSelectionState> | null | undefined
  const listIsValid = list === undefined || (
    !!list
    && typeof list === "object"
    && (list.type === null || list.type === "ul" || list.type === "ol" || list.type === "dl" || list.type === "menu")
    && typeof list.style === "string"
  )
  if(!listIsValid) return false

  const media = message.detail.media as Partial<MediaSelectionState> | null | undefined
  const mediaIsValid = media === undefined || (
    !!media
    && typeof media === "object"
    && isMediaType(media.type)
    && !!media.attributes
    && typeof media.attributes === "object"
    && !Array.isArray(media.attributes)
    && Object.entries(media.attributes).every(([name, value]) => typeof name === "string" && typeof value === "string")
  )
  if(!mediaIsValid) return false

  const form = message.detail.form as Partial<FormSelectionState> | null | undefined
  const formIsValid = form === undefined || (
    !!form
    && typeof form === "object"
    && isFormElementType(form.type)
    && !!form.attributes
    && typeof form.attributes === "object"
    && !Array.isArray(form.attributes)
    && Object.entries(form.attributes).every(([name, value]) => typeof name === "string" && typeof value === "string")
    && (form.text === undefined || typeof form.text === "string")
    && [form.canAddField, form.canAddLegend, form.canAddOption, form.canAddOptionGroup, form.canCustomizeSelect]
      .every(value => value === undefined || typeof value === "boolean")
  )
  if(!formIsValid) return false

  const table = message.detail.table as Partial<TableSelectionState> | null | undefined
  const tableIsValid = table === undefined || (
    !!table
    && typeof table === "object"
    && typeof table.active === "boolean"
    && typeof table.cellSelection === "boolean"
    && typeof table.rows === "number" && Number.isInteger(table.rows) && table.rows >= 0
    && typeof table.columns === "number" && Number.isInteger(table.columns) && table.columns >= 0
    && typeof table.selectedCells === "number" && Number.isInteger(table.selectedCells) && table.selectedCells >= 0
    && typeof table.canMerge === "boolean"
    && typeof table.canSplit === "boolean"
    && typeof table.hasCaption === "boolean"
  )
  if(!tableIsValid) return false

  const graphic = message.detail.graphic as Partial<GraphicSelectionState> | null | undefined
  const graphicIsValid = graphic === undefined || (
    !!graphic
    && typeof graphic === "object"
    && graphic.active === true
    && typeof graphic.capture === "boolean"
    && (graphic.selectionCount === undefined || (
      typeof graphic.selectionCount === "number"
      && Number.isInteger(graphic.selectionCount)
      && graphic.selectionCount >= 0
    ))
    && (graphic.shape === undefined || isGraphicShapeType(graphic.shape))
    && (graphic.parameters === undefined || (
      !!graphic.parameters
      && typeof graphic.parameters === "object"
      && !Array.isArray(graphic.parameters)
      && Object.entries(graphic.parameters).every(([name, value]) => typeof name === "string" && typeof value === "string")
    ))
    && (graphic.options === undefined || (
      !!graphic.options
      && typeof graphic.options === "object"
      && typeof graphic.options.grid === "boolean"
      && typeof graphic.options.snap === "boolean"
      && typeof graphic.options.guides === "boolean"
    ))
    && (graphic.layers === undefined || (
      Array.isArray(graphic.layers)
      && graphic.layers.every(layer => !!layer
        && typeof layer === "object"
        && typeof layer.index === "number" && Number.isInteger(layer.index) && layer.index >= 0
        && typeof layer.label === "string"
        && isGraphicShapeType(layer.type)
        && typeof layer.selected === "boolean"
        && typeof layer.primary === "boolean"
        && typeof layer.visible === "boolean"
        && typeof layer.locked === "boolean")
    ))
    && (graphic.viewport === undefined || (
      !!graphic.viewport
      && typeof graphic.viewport === "object"
      && typeof graphic.viewport.zoom === "number"
      && Number.isFinite(graphic.viewport.zoom)
      && graphic.viewport.zoom >= 25
      && graphic.viewport.zoom <= 400
    ))
  )
  if(!graphicIsValid) return false

  return true
}

export function isMarkStateChangeMessage(value: unknown): value is MarkStateChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<MarkStateChangeMessage>
  const validBase = message.type === markStateChangeEvent
    && !!message.detail
    && typeof message.detail === "object"
    && typeof message.detail.canMark === "boolean"
    && Array.isArray(message.detail.marks)
    && message.detail.marks.every(mark => typeof mark === "string" && canonicalMarkName(mark) === mark)
  if(!validBase) return false
  const styles = message.detail!.styles
  if(styles !== undefined && (!styles || typeof styles !== "object" || Array.isArray(styles) || !Object.entries(styles).every(([property, styleValue]) =>
    isStyleMarkName(property) && typeof styleValue === "string",
  ))) return false
  const attributes = message.detail!.attributes
  if(attributes === undefined) return true
  if(!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return false
  return Object.entries(attributes).every(([mark, values]) => {
    const exactMark = canonicalMarkName(mark)
    return exactMark === mark
      && !!values
      && typeof values === "object"
      && !Array.isArray(values)
      && Object.entries(values).every(([attribute, attributeValue]) =>
        isMarkAttributeName(exactMark, attribute) && typeof attributeValue === "string",
      )
  })
}

export function isCommentStateChangeMessage(value: unknown): value is CommentStateChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<CommentStateChangeMessage>
  if(message.type !== commentStateChangeEvent || !message.detail || typeof message.detail !== "object") return false
  const detail = message.detail as Partial<CommentState>
  return typeof detail.canComment === "boolean"
    && typeof detail.active === "boolean"
    && typeof detail.text === "string"
    && typeof detail.activeCount === "number"
    && Number.isInteger(detail.activeCount)
    && detail.activeCount >= 0
    && typeof detail.count === "number"
    && Number.isInteger(detail.count)
    && detail.count >= detail.activeCount
    && typeof detail.highlighting === "boolean"
}

export function isPresenceChangeMessage(value: unknown): value is PresenceChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<PresenceChangeMessage>
  if(message.type !== presenceChangeEvent || !message.detail || typeof message.detail !== "object") return false
  if(!Array.isArray(message.detail.users)) return false
  return message.detail.users.every(user => {
    if(!user || typeof user !== "object") return false
    const presenceUser = user as Partial<PresenceUser>
    return Number.isInteger(presenceUser.clientId)
      && typeof presenceUser.name === "string"
      && typeof presenceUser.initials === "string"
      && typeof presenceUser.color === "string"
  })
}

export function isDocumentHeadStateChangeMessage(value: unknown): value is DocumentHeadStateChangeMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<DocumentHeadStateChangeMessage>
  if(message.type !== documentHeadStateChangeEvent || !message.detail || typeof message.detail !== "object") return false
  const detail = message.detail as Partial<DocumentHeadState>
  if(![detail.title, detail.description, detail.keywords, detail.author, detail.license,
    detail.language, detail.theme, detail.generator].every(field => typeof field === "string")) return false
  if(!Array.isArray(detail.elements)) return false
  return detail.elements.every(value => {
    if(!value || typeof value !== "object") return false
    const element = value as Partial<DocumentHeadElementState>
    return typeof element.id === "string"
      && typeof element.tagName === "string"
      && typeof element.label === "string"
      && typeof element.canMoveUp === "boolean"
      && typeof element.canMoveDown === "boolean"
      && (element.content === undefined || typeof element.content === "string")
      && (element.contentLabel === undefined || typeof element.contentLabel === "string")
      && (element.preset === undefined || typeof element.preset === "string")
      && Array.isArray(element.attributes)
      && element.attributes.every(attribute => !!attribute
        && typeof attribute === "object"
        && typeof attribute.name === "string"
        && typeof attribute.value === "string")
  })
}
