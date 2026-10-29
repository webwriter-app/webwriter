import type * as Y from "yjs"
import type {Decoder} from "lib0/decoding"
import type {LiveSessionFeedback} from "./live-session"

export function acceptLearnerUpdate(doc: Y.Doc, update: Uint8Array, learnerId: string, validateDocument?: (before: string | undefined, after: string) => boolean): boolean
export const liveSessionFeedbackMessage: 4
export function validLiveSessionFeedback(value: unknown): value is LiveSessionFeedback
export function encodeLiveSessionFeedback(value: LiveSessionFeedback): Uint8Array
export function readLiveSessionFeedback(decoder: Decoder): LiveSessionFeedback
