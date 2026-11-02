import type {LiveSessionReplay} from "./live-session-replay"
import type {LiveSessionStep} from "./live-session"

const root = "https://webwriter.app/xapi"
const namespace = new Uint8Array([0xa1, 0x44, 0x6a, 0xe3, 0x82, 0x08, 0x57, 0x5b, 0x98, 0x20, 0x0c, 0x13, 0xeb, 0xd0, 0xb8, 0x51])
const encoder = new TextEncoder()

async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))].map(n => n.toString(16).padStart(2, "0")).join("")
}

/** Stable UUIDv5 identifiers allow re-export and eventual live delivery to deduplicate. */
async function uuid(value: string) {
  const input = encoder.encode(value), bytes = new Uint8Array(namespace.length + input.length)
  bytes.set(namespace); bytes.set(input, namespace.length)
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes))
  hash[6] = hash[6] & 15 | 0x50; hash[8] = hash[8] & 63 | 0x80
  const hex = [...hash.subarray(0, 16)].map(n => n.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Converts only observed interactions and explicitly supplied package events. */
export async function createXapiMapper(replay: LiveSessionReplay) {
  const documentHash = await digest(replay.baseHTML)
  const session = replay.sessionId ?? await digest(JSON.stringify([replay.startedAt, documentHash, replay.learners.map(learner => learner.id)]))
  const sessionId = await uuid(`session:${session}`)
  const activity = `${root}/activities/document/${documentHash}`
  const actors = new Map<string, Promise<{actor: object, registration: string}>>()
  return async (step: LiveSessionStep): Promise<object | null> => {
    if(!step.learner) return null
    const eventKind = step.kind === "widget" ? "widget" : step.kind === "click" ? "click"
      : step.kind === "document" && (step.htmlUpdate !== undefined || step.html !== undefined) ? "document-change" : null
    if(!eventKind) return null
    let pending = actors.get(step.learner)
    if(!pending) {
      const learner = step.learner
      pending = Promise.all([uuid(`actor:${session}:${learner}`), uuid(`registration:${session}:${learner}`)])
        .then(([name, registration]) => ({actor: {objectType: "Agent", account: {homePage: `${root}/actors`, name}}, registration}))
      actors.set(learner, pending)
    }
    const participant = await pending
    const custom = step.analytics
    const extensions: Record<string, unknown> = {...custom?.contextExtensions, [`${root}/extensions/event-kind`]: eventKind}
    if(custom) extensions[`${root}/extensions/widget`] = custom.widget
    const profiles = [{id: `${root}/profiles/session/v1`}]
    if(custom && custom.profile !== profiles[0].id) profiles.push({id: custom.profile})
    return {
      id: await uuid(`statement:${session}:${step.id}`), actor: participant.actor,
      verb: custom?.verb ?? {id: "http://adlnet.gov/expapi/verbs/interacted", display: {"en-US": "interacted"}},
      object: {objectType: "Activity", id: activity},
      timestamp: new Date(step.time).toISOString(),
      context: {registration: participant.registration, contextActivities: {category: profiles, grouping: [{id: `${root}/sessions/${sessionId}`}]}, extensions},
      ...(custom?.resultExtensions && Object.keys(custom.resultExtensions).length ? {result: {extensions: custom.resultExtensions}} : {}),
    }
  }
}
