/** A realm-independent snapshot used while replacing the editor iframe. */
export type EditorStateSnapshot = {
  update: number[]
  selection?: {
    anchor: unknown
    focus: unknown
  }
}

declare global {
  /** Set by the iframe's srcdoc before the editor module is evaluated. */
  var DOMEDITOR_INITIAL_STATE: EditorStateSnapshot | undefined
}
