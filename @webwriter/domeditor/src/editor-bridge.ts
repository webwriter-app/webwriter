export const executeCompleteEvent = "dom-editor-execute-complete"
export const executeFailureEvent = "dom-editor-execute-failure"

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
