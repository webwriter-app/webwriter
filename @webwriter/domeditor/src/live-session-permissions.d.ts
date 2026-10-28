import type * as Y from "yjs"

export function acceptLearnerUpdate(doc: Y.Doc, update: Uint8Array, learnerId: string, validateDocument?: (before: string | undefined, after: string) => boolean): boolean
