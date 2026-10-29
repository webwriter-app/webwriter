// @vitest-environment node
import * as Y from "yjs"
import {describe, expect, it} from "vitest"
import {acceptLearnerUpdate} from "./live-session-permissions.js"

const maps = (doc: Y.Doc) => ({
  meta: doc.getMap("live-session-meta"),
  learners: doc.getMap("live-session-learners"),
  steps: doc.getArray("live-session-steps"),
  states: doc.getMap<{learner: string, time: number, html?: string}>("live-session-states"),
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

  it("accepts named CSS colors in learner identities without a browser CSS parser", () => {
    const {target, update} = updateFrom(doc => {
      maps(doc).learners.set("ada", {...learner, color: "rebeccapurple", lastSeen: 2})
    })
    expect(acceptLearnerUpdate(target, update, "ada")).toBe(true)
  })

  it("rejects declaration injection in learner colors", () => {
    const {target, update} = updateFrom(doc => {
      maps(doc).learners.set("ada", {...learner, color: "red; background-image:url(https://attacker.test)", lastSeen: 2})
    })
    expect(acceptLearnerUpdate(target, update, "ada")).toBe(false)
  })

  it("rejects an unauthorized intermediate document step even when a later step restores valid HTML", () => {
    const {target, update} = updateFrom(doc => {
      const {steps, states} = maps(doc)
      steps.push([
        {...step, id: "step-injection", time: 2, html: "<script>alert(1)</script>"},
        {...step, id: "step-restored", time: 3, html: "<p>Hi</p>"},
      ])
      states.set("ada", {...state, time: 3, html: "<p>Hi</p>"})
    })
    const calls: [string | undefined, string][] = []
    const validate = (before: string | undefined, after: string) => {
      calls.push([before, after])
      return after !== "<script>alert(1)</script>"
    }

    expect(acceptLearnerUpdate(target, update, "ada", validate)).toBe(false)
    expect(calls).toEqual([["<p>Hi</p>", "<script>alert(1)</script>"]])
    expect(maps(target).steps.length).toBe(1)
    expect(maps(target).states.get("ada")?.html).toBe("<p>Hi</p>")
  })

  it("validates state-only HTML and leaves the target document unchanged on rejection", () => {
    const {target, update} = updateFrom(doc => {
      maps(doc).states.set("ada", {...state, time: 2, html: "<img src=x onerror=alert(1)>"})
    })
    const validate = (_before: string | undefined, after: string) => after === "<p>Hi</p>"

    expect(acceptLearnerUpdate(target, update, "ada", validate)).toBe(false)
    expect(maps(target).states.get("ada")?.html).toBe("<p>Hi</p>")
    expect(maps(target).states.get("ada")?.time).toBe(1)
  })

  it("accepts valid document snapshots while validating against a temporary copy", () => {
    const {target, update} = updateFrom(doc => {
      const {steps, states} = maps(doc)
      steps.push([{...step, id: "step-2", time: 2, html: "<p>Hello</p>"}])
      states.set("ada", {...state, time: 2, html: "<p>Hello</p>"})
    })
    const validate = (before: string | undefined, after: string) =>
      (before === "<p>Hi</p>" && after === "<p>Hello</p>") || (before === after && after === "<p>Hello</p>")

    expect(acceptLearnerUpdate(target, update, "ada", validate)).toBe(true)
    expect(maps(target).steps.length).toBe(1)
    expect(maps(target).states.get("ada")?.html).toBe("<p>Hi</p>")
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
