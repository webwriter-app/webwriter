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

export const executeCompleteEvent = "dom-editor-execute-complete"
export const executeFailureEvent = "dom-editor-execute-failure"
export const selectionChangeEvent = "dom-editor-selection-change"
export const markStateChangeEvent = "dom-editor-mark-state-change"
export const presenceChangeEvent = "dom-editor-presence-change"
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
  initialState?: EditorStateSnapshot
}

export type LoadWidgetsMessage = {
  type: typeof loadWidgetsMessage
  widgets: WidgetReference[]
  /** Already-resolved package metadata. Local development packages use this
   * path because their assets cannot be resolved through the npm registry. */
  packages?: WebWriterPackage[]
}

export function isInitializeEditorMessage(value: unknown): value is InitializeEditorMessage {
  if(!value || typeof value !== "object") return false
  const message = value as Partial<InitializeEditorMessage>
  return message.type === initializeEditorMessage
    && typeof message.syncUrl === "string"
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

export type ListType = "ul" | "ol" | "dl" | "menu"

export type ListSelectionState = {
  /** The nearest active semantic list, or null when the selection is outside a list. */
  type: ListType | null
  /** The list's authored inline list-style-type value. */
  style: string
}

export type SelectionChangeDetail = {
  path: SelectionPathItem[]
  /** True when the current selection is an element/node selection. */
  nodeSelected?: boolean
  /** True when the selected widget has captured interaction in its shadow tree. */
  capture?: boolean
  gap?: SelectionGap
  list?: ListSelectionState
  media?: MediaSelectionState
  table?: TableSelectionState
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
  return (message.type === executeCompleteEvent || message.type === executeFailureEvent)
    && !!message.detail
    && typeof message.detail === "object"
    && typeof (message.detail as ExecuteCompleteDetail).requestId === "string"
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
