// @vitest-environment node
import * as Y from "yjs"
import {describe, expect, it} from "vitest"
import {acceptLearnerUpdate} from "./live-session-permissions.js"

const maps = (doc: Y.Doc) => ({
  meta: doc.getMap("live-session-meta"),
  learners: doc.getMap("live-session-learners"),
  steps: doc.getArray("live-session-steps"),
  states: doc.getMap("live-session-states"),
})

const learner = {id: "ada", name: "Ada", color: "#f00", firstSeen: 1, lastSeen: 1, connected: true}
const state = {learner: "ada", time: 1, html: "<p>Hi</p>"}
const step = {id: "step-1", time: 1, learner: "ada", kind: "document", html: "<p>Hi</p>"}

const baseDoc = () => {
  const doc = new Y.Doc()
  const {learners, states, steps} = maps(doc)
  learners.set("ada", learner)
  states.set("ada", state)
  steps.push([step])
  return doc
}

const updateFrom = (edit: (doc: Y.Doc) => void) => {
  const doc = baseDoc()
  const target = new Y.Doc()
  Y.applyUpdate(target, Y.encodeStateAsUpdate(doc))
  const before = Y.encodeStateVector(doc)
  edit(doc)
  return {target, update: Y.encodeStateAsUpdate(doc, before)}
}

describe("acceptLearnerUpdate", () => {
  it.each([
    ["metadata", (doc: Y.Doc) => maps(doc).meta.set("baseHTML", "<p>owned</p>")],
    ["another learner", (doc: Y.Doc) => maps(doc).learners.set("grace", {...learner, id: "grace"})],
    ["another state", (doc: Y.Doc) => maps(doc).states.set("grace", {...state, learner: "grace"})],
    ["old step", (doc: Y.Doc) => maps(doc).steps.delete(0, 1)],
    ["own learner record deletion", (doc: Y.Doc) => maps(doc).learners.delete("ada")],
  ])("rejects edits to %s", (_name, edit) => {
    const {target, update} = updateFrom(edit)
    expect(acceptLearnerUpdate(target, update, "ada")).toBe(false)
  })

  it("accepts an own learner record and append-only step", () => {
    const {target, update} = updateFrom(doc => {
      const {learners, states, steps} = maps(doc)
      learners.set("ada", {...learner, lastSeen: 2})
      states.set("ada", {...state, time: 2})
      steps.push([{...step, id: "step-2", time: 2, learner: "ada", kind: "pointer", pointer: {x: 1, y: 2}}])
    })
    expect(acceptLearnerUpdate(target, update, "ada")).toBe(true)
  })

  it("accepts a concurrent step insertion before an existing step", () => {
    const {target, update} = updateFrom(doc => {
      maps(doc).steps.insert(0, [{...step, id: "step-0", time: 0, learner: "ada", kind: "cursor"}])
    })
    expect(acceptLearnerUpdate(target, update, "ada")).toBe(true)
  })

  it("rejects malformed and oversized updates", () => {
    expect(acceptLearnerUpdate(baseDoc(), Uint8Array.of(1, 2, 3), "ada")).toBe(false)
    expect(acceptLearnerUpdate(baseDoc(), new Uint8Array(8 * 1024 * 1024 + 1), "ada")).toBe(false)
  })
})
