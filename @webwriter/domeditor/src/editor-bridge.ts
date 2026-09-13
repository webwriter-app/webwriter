import {
  canonicalMarkName,
  isMarkAttributeName,
  isRubyState,
  isStyleMarkName,
  type MarkAttributeValues,
  type MarkName,
  type RubyState,
  type StyleMarkValues,
} from "./marks"
import type {EditorStateSnapshot} from "./editor-state"
import {isMediaType, type MediaSelectionState} from "./media"
import type {WebWriterPackage} from "./packages"
import {isTableCellRole, isTableRowGroupType, type TableSelectionState} from "./table"
import {isGraphicShapeType, type GraphicSelectionState} from "./graphic"
import type {DocumentHeadElementState, DocumentHeadState} from "./document-head"
import {isDialogClosedBy, type DialogSelectionState} from "./dialog"
import {isSectionName, type SectionName} from "./sections"
import type {ElementAttributeState} from "./element-attributes"
import type {LayoutSelectionState} from "./layouts"
import type {DocumentLayoutState} from "./document-layout"

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

const isOptionalString = (value: unknown) => value === undefined || typeof value === "string"

const isPackageMember = (value: unknown) => {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const member = value as Record<string, unknown>
  return typeof member.id === "string"
    && typeof member.packageName === "string"
    && typeof member.packageVersion === "string"
    && typeof member.exportName === "string"
    && (member.kind === "widget" || member.kind === "snippet")
    && typeof member.label === "string"
    && typeof member.insertable === "boolean"
    && isOptionalString(member.description)
    && isOptionalString(member.iconUrl)
    && isOptionalString(member.tagName)
    && isOptionalString(member.htmlUrl)
    && isOptionalString(member.scriptUrl)
    && isOptionalString(member.styleUrl)
}

export function isInitializeEditorMessage(value: unknown): value is InitializeEditorMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<InitializeEditorMessage>
  let validSyncUrl = false
  if(typeof message.syncUrl === "string" && message.syncUrl.length > 0) {
    try {
      const url = new URL(message.syncUrl)
      validSyncUrl = ["ws:", "wss:"].includes(url.protocol)
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
      && Array.isArray(pkg.styles)
      && pkg.members.every(isPackageMember)
      && pkg.scripts.every(script => typeof script === "string")
      && pkg.styles.every(style => typeof style === "string"),
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
  /** The element's computed non-static positioning mode, omitting relative positioning without an offset. */
  position?: "absolute" | "fixed" | "relative" | "sticky"
  /** Whether this element anchors positioning in the current selection path. */
  positionAnchor?: boolean
  /** Transparent section wrappers applying to this structural element. */
  sections?: SelectionPathSection[]
}

export type SelectionPathSection = Pick<SelectionPathItem, "position" | "positionAnchor"> & {
  /** The child-node path from BODY to the section wrapper. */
  path: number[]
  /** The wrapper's semantic HTML element type. */
  type: SectionName
  /** The human-readable type shown beside the element name. */
  name: string
  /** The key used by the shared icon renderer. */
  icon?: string
}

export type SectionSelectionState = {
  path: number[]
  type: SectionName
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
  /** Native numbering controls for the active ordered list. */
  ordered?: {
    start: string
    reversed: boolean
    numbering: string
    /** Missing outside a direct LI; empty when the active LI has no override. */
    itemValue?: string
  }
}

export type HeadingGroupSelectionState = {
  /** The direct heading child, or null for an irregular group without one. */
  heading: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | null
  beforeCount: number
  afterCount: number
}

export type FigureSelectionState = {
  /** Whether the figure already has a direct FIGCAPTION child. */
  hasCaption: boolean
}

export type SelectionChangeDetail = {
  path: SelectionPathItem[]
  /** True when a structural selection can be wrapped even if its common path is BODY. */
  canSection?: boolean
  /** True only for the selection update emitted by a local insertion command. */
  inserted?: boolean
  /** True when the current selection is an element/node selection. */
  nodeSelected?: boolean
  /** True when the selected widget has captured interaction in its shadow tree. */
  capture?: boolean
  gap?: SelectionGap
  list?: ListSelectionState
  headingGroup?: HeadingGroupSelectionState
  figure?: FigureSelectionState
  media?: MediaSelectionState
  dialog?: DialogSelectionState
  table?: TableSelectionState
  graphic?: GraphicSelectionState
  layout?: LayoutSelectionState
  documentLayout?: DocumentLayoutState
  /** Authored attributes for the exact element-like selection, when any. */
  element?: ElementAttributeState
  /** Present only when a section was explicitly selected from the breadcrumb. */
  section?: SectionSelectionState
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
  /** Structured ruby base, rt annotation, and rp fallback state. */
  ruby?: RubyState
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

type UnknownRecord = Record<string, unknown>
const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === "object" && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"
const isNonnegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0
const isPath = (value: unknown): value is number[] => Array.isArray(value) && value.every(isNonnegativeInteger)
const isStringRecord = (value: unknown): value is Record<string, string> => isRecord(value) && Object.values(value).every(isString)
const isOptional = (value: unknown, predicate: (value: unknown) => boolean) => value === undefined || predicate(value)
const isOptionalBoolean = (value: unknown) => value === undefined || isBoolean(value)
const isSelectionPosition = (value: UnknownRecord) => isOptional(value.position, position => ["absolute", "fixed", "relative", "sticky"].includes(position as string))
  && isOptional(value.positionAnchor, isBoolean)

const isSelectionPathItem = (value: unknown) => {
  if(!isRecord(value)) return false
  const isSection = (section: unknown) => isRecord(section)
    && isPath(section.path)
    && isSectionName(section.type)
    && isString(section.name)
    && isSelectionPosition(section)
    && isOptional(section.icon, isString)
  return isPath(value.path)
    && isString(value.name)
    && isOptional(value.icon, isString)
    && isOptional(value.iconUrl, isString)
    && isSelectionPosition(value)
    && isOptional(value.sections, sections => Array.isArray(sections) && sections.every(isSection))
}

const isOptionalFeature = (value: unknown, predicate: (value: UnknownRecord) => boolean) => value === undefined || isRecord(value) && predicate(value)
const isSelectionGap = (value: UnknownRecord) => isPath(value.parentPath) && isNonnegativeInteger(value.offset)
const isSectionSelection = (value: UnknownRecord) => isPath(value.path) && isSectionName(value.type)

const isListSelection = (list: UnknownRecord) => {
  const isOrdered = (ordered: unknown) => isRecord(ordered)
    && isString(ordered.start)
    && (ordered.start === "" || /^-?\d+$/.test(ordered.start))
    && isBoolean(ordered.reversed)
    && ["", "1", "a", "A", "i", "I"].includes(ordered.numbering as string)
    && isOptional(ordered.itemValue, value => isString(value) && (value === "" || /^-?\d+$/.test(value)))
  return (list.type === null || ["ul", "ol", "dl", "menu"].includes(list.type as string))
    && isString(list.style)
    && isOptional(list.ordered, isOrdered)
}

const isHeadingGroup = (value: UnknownRecord) => (value.heading === null || ["h1", "h2", "h3", "h4", "h5", "h6"].includes(value.heading as string))
  && isNonnegativeInteger(value.beforeCount)
  && isNonnegativeInteger(value.afterCount)

const isFigure = (value: UnknownRecord) => isBoolean(value.hasCaption)

const isElementSelection = (value: UnknownRecord) => (value.path === null || isPath(value.path))
  && isString(value.localName)
  && (value.namespaceURI === null || isString(value.namespaceURI))
  && isString(value.name)
  && isOptional(value.icon, isString)
  && isStringRecord(value.attributes)

const isMediaResource = (value: unknown) => isRecord(value)
  && isNonnegativeInteger(value.index)
  && isStringRecord(value.attributes)

const isMediaSelection = (media: UnknownRecord) => {
  const isImageMap = (value: unknown) => value === null || isRecord(value)
    && isString(value.name)
    && value.name.length > 0
    && isBoolean(value.shared)
    && Array.isArray(value.areas)
    && value.areas.every(area => isRecord(area) && isPath(area.path) && isStringRecord(area.attributes))
  return isMediaType(media.type)
    && isStringRecord(media.attributes)
    && isOptional(media.sources, value => Array.isArray(value) && value.every(isMediaResource))
    && isOptional(media.tracks, value => Array.isArray(value) && value.every(isMediaResource))
    && isOptional(media.fallbackHTML, isString)
    && isOptional(media.imageMap, isImageMap)
    && (media.type === "audio" || media.type === "video" || (media.sources === undefined && media.tracks === undefined && media.fallbackHTML === undefined))
    && (media.type === "picture" || media.type === "img" || media.imageMap === undefined)
}

const isDialogSelection = (dialog: UnknownRecord) => isStringRecord(dialog.attributes)
  && isBoolean(dialog.initiallyOpen)
  && (dialog.closedBy === "" || isDialogClosedBy(dialog.closedBy))
  && isNonnegativeInteger(dialog.openerCount)
  && isNonnegativeInteger(dialog.closeControlCount)
  && isBoolean(dialog.hasDialogForm)

const isTableSelection = (table: UnknownRecord) => isBoolean(table.active)
  && isBoolean(table.cellSelection)
  && isNonnegativeInteger(table.rows)
  && isNonnegativeInteger(table.columns)
  && isNonnegativeInteger(table.selectedCells)
  && isBoolean(table.canMerge)
  && isBoolean(table.canSplit)
  && isBoolean(table.hasCaption)
  && (table.selectedRowGroup === "direct" || table.selectedRowGroup === "mixed" || isTableRowGroupType(table.selectedRowGroup))
  && Array.isArray(table.rowGroups)
  && table.rowGroups.every(group => isRecord(group)
    && isNonnegativeInteger(group.index)
    && isTableRowGroupType(group.type)
    && isNonnegativeInteger(group.rows)
    && isStringRecord(group.attributes))
  && isBoolean(table.canAddHeaderGroup)
  && isBoolean(table.canAddFooterGroup)
  && Array.isArray(table.columnGroups)
  && table.columnGroups.every(group => isRecord(group)
    && isPath(group.path)
    && isStringRecord(group.attributes)
    && Array.isArray(group.columns)
    && group.columns.every(column => isRecord(column) && isPath(column.path) && isStringRecord(column.attributes)))
  && isRecord(table.cellSemantics)
  && (table.cellSemantics.role === "mixed" || isTableCellRole(table.cellSemantics.role))
  && (table.cellSemantics.headers === null || isString(table.cellSemantics.headers))
  && (table.cellSemantics.abbr === null || isString(table.cellSemantics.abbr))

const isGraphicSelection = (graphic: UnknownRecord) => graphic.active === true
  && isBoolean(graphic.capture)
  && isOptional(graphic.selectionCount, isNonnegativeInteger)
  && isOptional(graphic.shape, isGraphicShapeType)
  && isOptional(graphic.parameters, isStringRecord)
  && isOptional(graphic.options, value => isRecord(value)
    && isBoolean(value.grid)
    && isBoolean(value.snap)
    && isBoolean(value.guides))
  && isOptional(graphic.layers, value => Array.isArray(value) && value.every(layer => isRecord(layer)
    && isNonnegativeInteger(layer.index)
    && isString(layer.label)
    && isGraphicShapeType(layer.type)
    && isBoolean(layer.selected)
    && isBoolean(layer.primary)
    && isBoolean(layer.visible)
    && isBoolean(layer.locked)))
  && isOptional(graphic.viewport, value => isRecord(value)
    && typeof value.zoom === "number"
    && Number.isFinite(value.zoom)
    && value.zoom >= 25
    && value.zoom <= 400)

const isLayoutStyle = (value: unknown): boolean => isRecord(value)
  && (value.target === null || isRecord(value.target) && isString(value.target.localName) && (value.target.namespaceURI === null || isString(value.target.namespaceURI)))
  && isStringRecord(value.computed)
  && isRecord(value.context) && isString(value.context.display) && isString(value.context.parentDisplay)
  && isRecord(value.inline) && Object.values(value.inline).every(item => isRecord(item) && isString(item.value) && (item.priority === "" || item.priority === "important"))

const isLayoutSelection = (value: UnknownRecord) => (value.kind === "grid" || value.kind === "flex")
  && isBoolean(value.item) && isLayoutStyle(value.style)
  && isOptional(value.itemStyle, isLayoutStyle)
  && [value.columns, value.rows].every(axis => isRecord(axis)
    && (axis.tracks === null || Array.isArray(axis.tracks) && axis.tracks.length <= 100 && axis.tracks.every(isString))
    && isNonnegativeInteger(axis.automatic) && (axis.reason === null || isString(axis.reason)))

export function isSelectionChangeMessage(value: unknown): value is SelectionChangeMessage {
  if(!isRecord(value) || value.type !== selectionChangeEvent || !isRecord(value.detail)) return false
  const detail = value.detail
  return Array.isArray(detail.path) && detail.path.every(isSelectionPathItem)
    && [detail.nodeSelected, detail.capture, detail.inserted, detail.canSection].every(isOptionalBoolean)
    && isOptionalFeature(detail.section, isSectionSelection)
    && isOptionalFeature(detail.gap, isSelectionGap)
    && isOptionalFeature(detail.list, isListSelection)
    && isOptionalFeature(detail.headingGroup, isHeadingGroup)
    && isOptionalFeature(detail.figure, isFigure)
    && isOptionalFeature(detail.element, isElementSelection)
    && isOptionalFeature(detail.media, isMediaSelection)
    && isOptionalFeature(detail.dialog, isDialogSelection)
    && isOptionalFeature(detail.table, isTableSelection)
    && isOptionalFeature(detail.graphic, isGraphicSelection)
    && isOptionalFeature(detail.layout, isLayoutSelection)
    && isOptionalFeature(detail.documentLayout, state => (state.mode === "document" || state.mode === "canvas" || state.mode === "slides")
      && isBoolean(state.canConvert) && typeof state.zoom === "number" && Number.isFinite(state.zoom) && state.zoom > 0
      && (state.conversions === undefined || isRecord(state.conversions) && Object.entries(state.conversions).every(([mode, reason]) => ["document", "canvas", "slides"].includes(mode) && (reason === null || typeof reason === "string"))))
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
  if(attributes !== undefined && (!attributes || typeof attributes !== "object" || Array.isArray(attributes))) return false
  if(attributes !== undefined && !Object.entries(attributes).every(([mark, values]) => {
    const exactMark = canonicalMarkName(mark)
    return exactMark === mark
      && !!values
      && typeof values === "object"
      && !Array.isArray(values)
      && Object.entries(values).every(([attribute, attributeValue]) =>
        isMarkAttributeName(exactMark, attribute) && typeof attributeValue === "string",
      )
  })) return false
  return message.detail!.ruby === undefined || isRubyState(message.detail!.ruby)
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
