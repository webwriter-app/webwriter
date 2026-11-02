import * as Y from "yjs"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"

const MAX_UPDATE_SIZE = 8 * 1024 * 1024
const learnerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const stepKinds = new Set(["document", "cursor", "pointer", "click", "scroll", "widget"])
const mapNames = {
  meta: "live-session-meta",
  learners: "live-session-learners",
  steps: "live-session-steps",
  states: "live-session-states",
}

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value)

const validIRI = value => {
  if(typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f]/u.test(value)) return false
  try { return ["http:", "https:", "urn:"].includes(new URL(value).protocol) }
  catch { return false }
}
/** Validate package-authored analytics both at the peer boundary and on replay. */
export function validLiveSessionWidgetEvent(value) {
  try {
    if(!isRecord(value) || new TextEncoder().encode(JSON.stringify(value)).length > 16384
      || !validIRI(value.profile) || !isRecord(value.verb) || !validIRI(value.verb.id)
      || !Object.keys(value.verb).every(key => key === "id" || key === "display")
      || !isRecord(value.widget) || typeof value.widget.tag !== "string" || !/^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/.test(value.widget.tag)
      || !Array.isArray(value.widget.path) || value.widget.path.length > 256
      || !value.widget.path.every(n => Number.isSafeInteger(n) && n >= 0)) return false
    if(value.verb.display !== undefined && (!isRecord(value.verb.display)
      || !Object.entries(value.verb.display).every(([key, text]) => /^[a-zA-Z0-9-]{1,35}$/.test(key) && typeof text === "string" && text.length <= 500))) return false
    for(const extensions of [value.contextExtensions, value.resultExtensions]) {
      if(extensions !== undefined && (!isRecord(extensions) || !Object.keys(extensions).every(validIRI))) return false
    }
    const json = JSON.stringify(value)
    return json !== undefined && JSON.stringify(JSON.parse(json)) === json
  }
  catch { return false }
}

/** Apply a single serialized preview update to an isolated playback document. */
export function applyPreviewUpdate(doc, encoded) {
  if(typeof encoded !== "string" || !encoded.length || encoded.length > MAX_UPDATE_SIZE * 2
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new TypeError("Invalid preview update")
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
  Y.applyUpdate(doc, bytes)
  if(doc.store.pendingStructs || doc.store.pendingDs || [...doc.share.keys()].some(key => key !== "preview")) throw new TypeError("Incomplete preview update")
  return doc.getText("preview").toString()
}
// y-websocket reserves message types 0–3. Feedback uses the authenticated
// connection directly so it never enters the session's broadcast Y.Doc.
export const liveSessionFeedbackMessage = 4
export const validLiveSessionFeedback = value => isRecord(value)
  && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256
  && typeof value.participant === "string" && learnerIdPattern.test(value.participant)
  && typeof value.text === "string" && Boolean(value.text.trim()) && value.text.length <= 4000
  && isFiniteNumber(value.time)

export function encodeLiveSessionFeedback(value) {
  if(!validLiveSessionFeedback(value)) throw new TypeError("Invalid live session feedback")
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, liveSessionFeedbackMessage)
  encoding.writeVarString(encoder, JSON.stringify(value))
  return encoding.toUint8Array(encoder)
}

export function readLiveSessionFeedback(decoder) {
  const value = JSON.parse(decoding.readVarString(decoder))
  if(!validLiveSessionFeedback(value) || decoding.hasContent(decoder)) throw new TypeError("Invalid live session feedback")
  return value
}

const validPoint = value => isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
const validColor = value => {
  if(typeof value !== "string" || value.length > 64 || !value.trim() || /[;{}\u0000-\u001f]/.test(value)) return false
  const color = value.trim()
  if(typeof globalThis.CSS?.supports === "function") return CSS.supports("color", color)
  if(typeof globalThis.document === "undefined") {
    // Node-based permission checks do not have the browser's CSS parser.
    // Reject declaration/function injection, but retain named CSS colors.
    return !/url\s*\(/i.test(color)
      && (/^#[\da-f]{3,8}$/i.test(color)
        || /^[a-z][a-z0-9-]*$/i.test(color)
        || /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^;{}]+\)$/i.test(color))
  }
  const style = document.createElement("span").style
  style.color = color
  return style.color !== ""
}

const validLearner = (value, learnerId) => isRecord(value)
  && value.id === learnerId && learnerIdPattern.test(learnerId)
  && typeof value.name === "string" && value.name.length <= 200
  && validColor(value.color)
  && isFiniteNumber(value.firstSeen) && isFiniteNumber(value.lastSeen)
  && typeof value.connected === "boolean"

const validState = (value, learnerId) => isRecord(value)
  && value.learner === learnerId && isFiniteNumber(value.time)
  && (value.html === undefined || typeof value.html === "string")
  && (value.cursor === undefined || validPoint(value.cursor))
  && (value.pointer === undefined || validPoint(value.pointer))
  && (value.click === undefined || validPoint(value.click))
  && (value.scroll === undefined || isRecord(value.scroll) && isFiniteNumber(value.scroll.top))

const validStep = (value, learnerId) => isRecord(value)
  && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256
  && isFiniteNumber(value.time) && value.learner === learnerId
  && typeof value.kind === "string" && stepKinds.has(value.kind)
  && (value.html === undefined || typeof value.html === "string")
  && (value.htmlCheckpoint === undefined || typeof value.htmlCheckpoint === "string")
  && (value.htmlUpdate === undefined || typeof value.htmlUpdate === "string")
  && (value.htmlCheckpoint === undefined && value.htmlUpdate === undefined
    || value.kind === "document" && value.html === undefined && (value.htmlCheckpoint === undefined || value.htmlUpdate === undefined))
  && (value.cursor === undefined || validPoint(value.cursor))
  && (value.pointer === undefined || validPoint(value.pointer))
  && (value.click === undefined || validPoint(value.click))
  && (value.scroll === undefined || isRecord(value.scroll) && isFiniteNumber(value.scroll.top))
  && (value.regions === undefined || Array.isArray(value.regions))
  && (value.widgets === undefined || Array.isArray(value.widgets))
  && (value.analytics === undefined || value.kind === "widget" && validLiveSessionWidgetEvent(value.analytics))

/** Validate a learner-authored Yjs update without mutating the live document. */
export function acceptLearnerUpdate(doc, update, learnerId, validateDocument) {
  if(!doc?.store || typeof doc.getMap !== "function" || !(update instanceof Uint8Array)
    || update.byteLength === 0 || update.byteLength > MAX_UPDATE_SIZE
    || typeof learnerId !== "string" || !learnerIdPattern.test(learnerId)) return false

  const validationDoc = new Y.Doc()
  try {
    const meta = validationDoc.getMap(mapNames.meta)
    const learners = validationDoc.getMap(mapNames.learners)
    const steps = validationDoc.getArray(mapNames.steps)
    const states = validationDoc.getMap(mapNames.states)
    Y.applyUpdate(validationDoc, Y.encodeStateAsUpdate(doc))
    const previousSteps = steps.toArray()
    const previousHTML = states.get(learnerId)?.html
    let accepted = true
    let changedLearner = false
    let changedState = false
    validationDoc.on("afterTransaction", transaction => {
      for(const [type, keys] of transaction.changed) {
        if(type === meta) accepted = false
        else if(type === learners || type === states) {
          if(keys.size !== 1 || !keys.has(learnerId)) accepted = false
          else if(type === learners) changedLearner = true
          else changedState = true
        }
        else if(type !== steps) accepted = false
      }
      const stepEvents = transaction.changedParentTypes.get(steps) ?? []
      for(const event of stepEvents) {
        for(const part of event.changes.delta) {
          if(part.delete) accepted = false
          if(part.insert) {
            if(!part.insert.every(step => validStep(step, learnerId))) accepted = false
          }
        }
      }
    })
    Y.applyUpdate(validationDoc, update)
    if(validationDoc.store.pendingStructs || validationDoc.store.pendingDs) accepted = false
    if(accepted && changedLearner && (!learners.has(learnerId) || !validLearner(learners.get(learnerId), learnerId))) accepted = false
    if(accepted && changedState && (!states.has(learnerId) || !validState(states.get(learnerId), learnerId))) accepted = false
    const knownStepIds = new Set(previousSteps.map(step => step?.id))
    const addedSteps = steps.toArray().filter(step => !knownStepIds.has(step.id))
    let insertedIncremental = false
    for(const step of steps.toArray()) {
      if(!knownStepIds.has(step.id) && (step.htmlCheckpoint !== undefined || step.htmlUpdate !== undefined)) insertedIncremental = true
      if(insertedIncremental && knownStepIds.has(step.id) && step.learner === learnerId) accepted = false
    }
    if(accepted && (addedSteps.some(step => step.htmlCheckpoint !== undefined || step.htmlUpdate !== undefined
      || validateDocument && step.html !== undefined) || validateDocument && changedState && states.get(learnerId)?.html !== undefined)) {
      let before = previousHTML
      let preview
      try {
        // Rebuild only this learner's history; a reconnect may start a new checkpoint.
        for(const step of previousSteps.filter(step => step.learner === learnerId)) {
          if(step.html !== undefined) { before = step.html; preview?.destroy(); preview = undefined }
          if(step.htmlCheckpoint !== undefined) { preview?.destroy(); preview = new Y.Doc(); before = applyPreviewUpdate(preview, step.htmlCheckpoint) }
          if(step.htmlUpdate !== undefined) {
            if(!preview) throw new TypeError("Missing preview checkpoint")
            before = applyPreviewUpdate(preview, step.htmlUpdate)
          }
        }
        for(const step of addedSteps) {
          let after = step.html
          if(step.htmlCheckpoint !== undefined) { preview?.destroy(); preview = new Y.Doc(); after = applyPreviewUpdate(preview, step.htmlCheckpoint) }
          if(step.htmlUpdate !== undefined) {
            if(!preview) throw new TypeError("Missing preview checkpoint")
            after = applyPreviewUpdate(preview, step.htmlUpdate)
          }
          if(after !== undefined) {
            if(validateDocument && !validateDocument(before, after)) { accepted = false; break }
            before = after
            if(step.html !== undefined) { preview?.destroy(); preview = undefined }
          }
        }
      }
      catch { accepted = false }
      finally { preview?.destroy() }
      const finalHTML = states.get(learnerId)?.html
      if(accepted && validateDocument && changedState && finalHTML !== undefined && !validateDocument(before, finalHTML)) accepted = false
    }
    const previousIds = previousSteps.map(step => step?.id)
    const finalSteps = steps.toArray()
    const finalIds = finalSteps.map(step => step?.id)
    if(accepted && new Set(previousIds).size !== previousIds.length) accepted = false
    if(accepted && new Set(finalIds).size !== finalIds.length) accepted = false
    if(accepted) {
      let previousIndex = 0
      for(const id of finalIds) {
        if(id === previousIds[previousIndex]) previousIndex++
      }
      if(previousIndex !== previousIds.length) accepted = false
    }
    return accepted
  }
  catch {
    return false
  }
  finally {
    validationDoc.destroy()
  }
}
