export const executeCompleteEvent = "dom-editor-execute-complete"
export const executeFailureEvent = "dom-editor-execute-failure"
export const selectionChangeEvent = "dom-editor-selection-change"

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
  return gap === undefined || (
    !!gap
    && typeof gap === "object"
    && Array.isArray(gap.parentPath)
    && gap.parentPath.every(index => Number.isInteger(index) && index >= 0)
    && Number.isInteger(gap.offset)
    && gap.offset >= 0
  )
}
