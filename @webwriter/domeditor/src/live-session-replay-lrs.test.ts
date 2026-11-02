// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {webcrypto} from "node:crypto"
import {createLiveSessionReplayFile, type LiveSessionReplay} from "./live-session-replay"
import {sendReplayToLrs} from "./live-session-replay-lrs"

const replay: LiveSessionReplay = {format: "webwriter-live-replay", sessionId: "recovery", startedAt: 1, endedAt: 4,
  baseHTML: "<p>Private document</p>", learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 4, connected: false}],
  feedback: [{id: "f", participant: "ada", text: "private feedback", time: 2}], steps: [
    {id: "a", learner: "ada", time: 1, kind: "widget", widgets: [{state: {answer: "private answer"}}]},
    {id: "b", learner: "ada", time: 2, kind: "click", click: {x: 1, y: 2}},
    {id: "c", learner: "ada", time: 3, kind: "widget", analytics: {profile: "https://example.org/profile/1", verb: {id: "https://example.org/used"}, widget: {tag: "demo-widget", path: [0]}}},
  ]}
const config = {endpoint: "https://lrs.example/xapi/", username: "key", password: "secret"}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers()})

describe("replay LRS delivery", () => {
  it("resends an interrupted replay with identical statement IDs and no generic private content", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const file = await createLiveSessionReplayFile(replay)
    const stored = new Map<string, string>(), calls: string[] = []
    const controller = new AbortController()
    let interrupt = true
    const send = vi.fn(async (url: string | URL | Request, request?: RequestInit) => {
      expect(request?.method).toBe("PUT")
      expect(request?.headers).toMatchObject({"X-Experience-API-Version": "1.0.3", Authorization: "Basic a2V5OnNlY3JldA=="})
      const body = request?.body as string, statement = JSON.parse(body)
      expect(new URL(String(url)).searchParams.get("statementId")).toBe(statement.id)
      expect(body).not.toMatch(/private answer|private feedback|Private document|Ada/)
      calls.push(statement.id)
      if(stored.has(statement.id)) expect(stored.get(statement.id)).toBe(body)
      else stored.set(statement.id, body)
      if(interrupt) { interrupt = false; controller.abort() }
      return new Response(null, {status: 204})
    })
    await expect(sendReplayToLrs(file, config, controller.signal, vi.fn(), send as typeof fetch)).rejects.toMatchObject({name: "AbortError"})
    expect(stored.size).toBe(1)
    expect(await sendReplayToLrs(file, config, new AbortController().signal, vi.fn(), send as typeof fetch)).toBe(3)
    expect(stored.size).toBe(3)
    expect(calls[0]).toBe(calls[1])
  })

  it("stops on a conflict instead of assuming the LRS has the same statement", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const file = await createLiveSessionReplayFile(replay)
    const send = vi.fn(async () => new Response("conflict", {status: 409}))
    await expect(sendReplayToLrs(file, config, new AbortController().signal, vi.fn(), send as typeof fetch)).rejects.toThrow("conflict")
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("accepts a conflict only after reading and verifying the existing statement", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const file = await createLiveSessionReplayFile({...replay, steps: [replay.steps[0]]})
    let sent: any
    const send = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
      if(request?.method === "PUT") { sent = JSON.parse(request.body as string); return new Response("conflict", {status: 409}) }
      expect(request?.method).toBe("GET")
      return new Response(JSON.stringify({...sent, stored: "2024-01-01T00:00:00Z", version: "1.0.0", authority: {objectType: "Agent"}}), {status: 200})
    })
    expect(await sendReplayToLrs(file, config, new AbortController().signal, vi.fn(), send as typeof fetch)).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
    const mismatch = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => request?.method === "PUT"
      ? new Response("conflict", {status: 409}) : new Response(JSON.stringify({...sent, actor: {objectType: "Agent", mbox: "mailto:someone@example.org"}}), {status: 200}))
    await expect(sendReplayToLrs(file, config, new AbortController().signal, vi.fn(), mismatch as typeof fetch)).rejects.toThrow("conflict")
  })

  it("reports bounded progress for large replays", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const steps = Array.from({length: 26}, (_, index) => ({id: `event-${index}`, learner: "ada", time: 2, kind: "widget" as const}))
    const file = await createLiveSessionReplayFile({...replay, steps})
    const progress = vi.fn(), send = vi.fn(async () => new Response(null, {status: 204}))
    expect(await sendReplayToLrs(file, config, new AbortController().signal, progress, send as typeof fetch)).toBe(26)
    expect(progress).toHaveBeenCalledWith({state: "sending", confirmed: 25})
    expect(send).toHaveBeenCalledTimes(26)
  })

  it("reports temporary failures and can be stopped while waiting to retry", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const file = await createLiveSessionReplayFile(replay), controller = new AbortController()
    const notify = vi.fn(() => controller.abort())
    const send = vi.fn(async () => new Response("unavailable", {status: 503}))
    await expect(sendReplayToLrs(file, config, controller.signal, notify, send as typeof fetch)).rejects.toMatchObject({name: "AbortError"})
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({state: "retrying", confirmed: 0}))
  })
})
