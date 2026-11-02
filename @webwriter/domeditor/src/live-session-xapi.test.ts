// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {webcrypto} from "node:crypto"
import {createLiveSessionReplayFile} from "./live-session-replay"
import {createReplayWorkerHandler} from "./live-session-replay-worker"
import type {LiveSessionReplay} from "./live-session-replay"
import {createXapiMapper} from "./live-session-xapi"

const replay: LiveSessionReplay = {format: "webwriter-live-replay", sessionId: "session-one", startedAt: 1, endedAt: 3,
  baseHTML: "<p>secret document</p>", learners: [{id: "alice", name: "Alice Secret", color: "red", firstSeen: 1, lastSeen: 3, connected: false}],
  feedback: [{id: "f", participant: "alice", time: 2, text: "private feedback"}], steps: [
    {id: "a", time: 1, learner: "alice", kind: "widget", widgets: [{state: {answer: "secret answer"}}]},
    {id: "b", time: 2, learner: "alice", kind: "pointer", pointer: {x: 0, y: 0}},
    {id: "c", time: 3, learner: "alice", kind: "widget", analytics: {profile: "https://example.org/profile/v1",
      verb: {id: "https://example.org/verbs/attempted"}, contextExtensions: {"https://example.org/extension/mode": "demo"},
      widget: {tag: "example-widget", path: [0]}}},
  ]}

describe("xAPI dataset export", () => {
  it("uses stable pseudonyms, generic observations and explicit package events without leaking replay content", async () => {
    vi.stubGlobal("crypto", webcrypto)
    try {
      const map = await createXapiMapper(replay), again = await createXapiMapper(replay)
      const generic = await map(replay.steps[0]) as any
      expect(generic).toEqual(await again(replay.steps[0]))
      expect(generic.verb.id).toBe("http://adlnet.gov/expapi/verbs/interacted")
      expect(generic.actor.account.name).not.toBe("alice")
      expect(await map(replay.steps[1])).toBeNull()
      const custom = await map(replay.steps[2]) as any
      expect(custom.verb.id).toBe("https://example.org/verbs/attempted")
      expect(custom.context.contextActivities.category).toContainEqual({id: "https://example.org/profile/v1"})
      expect(custom.context.extensions["https://example.org/extension/mode"]).toBe("demo")
      expect(JSON.stringify([generic, custom])).not.toMatch(/Alice Secret|secret answer|secret document|private feedback/)
    }
    finally { vi.unstubAllGlobals() }
  })

  it("writes JSON Lines incrementally and aborts a failed output", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const handler = createReplayWorkerHandler()
    try {
      const file = await createLiveSessionReplayFile(replay)
      expect((await handler.handle({id: 1, type: "open", file})).error).toBeUndefined()
      const writes: Blob[] = []
      const writable = {write: async (part: Blob) => {writes.push(part)}, close: vi.fn(), abort: vi.fn(async () => {})}
      const handle = {createWritable: async () => writable} as any
      expect((await handler.handle({id: 2, type: "export-xapi", handle})).error).toBeUndefined()
      const lines = (await new Blob(writes).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(lines).toHaveLength(2)
      expect(writable.close).toHaveBeenCalledOnce()
      const failing = {write: async () => {throw Error("disk full")}, close: vi.fn(), abort: vi.fn(async () => {})}
      expect((await handler.handle({id: 3, type: "export-xapi", handle: {createWritable: async () => failing} as any})).error).toBe("disk full")
      expect(failing.abort).toHaveBeenCalledOnce()
      expect(failing.close).not.toHaveBeenCalled()
    }
    finally { handler.close(); vi.unstubAllGlobals() }
  })
})
