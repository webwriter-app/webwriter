/** A realm-independent snapshot used while replacing the editor iframe. */
export type EditorStateSnapshot = {
  update: number[]
  /** Offline scoped-data identity, retained when the editor iframe is replaced. */
  widgetDataDocumentId?: string
  selection?: {
    anchor: unknown
    focus: unknown
    ranges?: {anchor: unknown, focus: unknown}[]
  }
}
