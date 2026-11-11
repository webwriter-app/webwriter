/** A realm-independent snapshot used while replacing the editor iframe. */
export type EditorStateSnapshot = {
  update: Uint8Array | number[]
  /** Last update published to the host when the frame captured this state. */
  replicaSequence?: number
  /** Offline scoped-data identity, retained when the editor iframe is replaced. */
  widgetDataDocumentId?: string
  selection?: {
    anchor: unknown
    focus: unknown
    ranges?: {anchor: unknown, focus: unknown}[]
  }
}

/** New frames use binary updates. Continue accepting older array snapshots. */
export function isEditorStateUpdate(value: unknown): value is EditorStateSnapshot["update"] {
  return value instanceof Uint8Array || Array.isArray(value)
    && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
}
