import * as Y from "yjs"

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
const validPoint = value => isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)

const validLearner = (value, learnerId) => isRecord(value)
  && value.id === learnerId && learnerIdPattern.test(learnerId)
  && typeof value.name === "string" && value.name.length <= 200
  && typeof value.color === "string" && value.color.length <= 64
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
  && (value.cursor === undefined || validPoint(value.cursor))
  && (value.pointer === undefined || validPoint(value.pointer))
  && (value.click === undefined || validPoint(value.click))
  && (value.scroll === undefined || isRecord(value.scroll) && isFiniteNumber(value.scroll.top))
  && (value.regions === undefined || Array.isArray(value.regions))
  && (value.widgets === undefined || Array.isArray(value.widgets))

/** Validate a learner-authored Yjs update without mutating the live document. */
export function acceptLearnerUpdate(doc, update, learnerId) {
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
