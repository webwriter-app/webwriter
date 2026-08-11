import {canonicalMarkName, isStyleMarkName, type MarkName, type StyleMarkValues} from "./marks"

export const executeCompleteEvent = "dom-editor-execute-complete"
export const executeFailureEvent = "dom-editor-execute-failure"
export const selectionChangeEvent = "dom-editor-selection-change"
export const markStateChangeEvent = "dom-editor-mark-state-change"
export const presenceChangeEvent = "dom-editor-presence-change"

export type SelectionPathItem = {
  /** The child-node path from BODY to this element. */
  path: number[]
  /** The human-readable name shown in the breadcrumb. */
  name: string
  /** The key used by the shared icon renderer. */
  icon?: string
}

export type SelectionGap = {
  /** The child-node path of the element containing the gap. */
  parentPath: number[]
  /** The child-node offset where the gap sits. */
  offset: number
}

export type SelectionChangeDetail = {
  path: SelectionPathItem[]
  gap?: SelectionGap
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
  })) return false

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
  if(styles === undefined) return true
  if(!styles || typeof styles !== "object" || Array.isArray(styles)) return false
  return Object.entries(styles).every(([property, styleValue]) =>
    isStyleMarkName(property) && typeof styleValue === "string",
  )
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
