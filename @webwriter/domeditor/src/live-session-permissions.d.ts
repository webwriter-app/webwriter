import type * as Y from "yjs"
import type {Decoder} from "lib0/decoding"
import type {LiveSessionAnswers, LiveSessionFeedback, LiveSessionWidgetEvent} from "./live-session"

export function acceptLearnerUpdate(doc: Y.Doc, update: Uint8Array, learnerId: string, validateDocument?: (before: string | undefined, after: string) => boolean, allowSubmissions?: boolean): boolean
export function applyPreviewUpdate(doc: Y.Doc, encoded: string): string
export const liveSessionFeedbackMessage: 4
export function validLiveSessionFeedback(value: unknown): value is LiveSessionFeedback
export function validLiveSessionWidgetEvent(value: unknown): value is LiveSessionWidgetEvent
export function validLiveSessionAnswers(value: unknown): value is LiveSessionAnswers
export function encodeLiveSessionFeedback(value: LiveSessionFeedback): Uint8Array
export function readLiveSessionFeedback(decoder: Decoder): LiveSessionFeedback
