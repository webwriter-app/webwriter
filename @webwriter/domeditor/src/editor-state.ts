/** A realm-independent snapshot used while replacing the editor iframe. */
export type EditorStateSnapshot = {
  update: number[]
  selection?: {
    anchor: unknown
    focus: unknown
  }
}
