// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {webcrypto} from "node:crypto"
import {LiveSessionLrs, type LrsStatus} from "./live-session-lrs"
import {createXapiMapper} from "./live-session-xapi"
import type {LiveSessionReplay} from "./live-session-replay"
import type {LiveSessionStep} from "./live-session"

const replay: LiveSessionReplay = {format: "webwriter-live-replay", sessionId: "session", startedAt: 1, endedAt: 3,
  baseHTML: "<p>Private</p>", learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 3, connected: false}], steps: [], feedback: []}
const config = {endpoint: "https://school.example/xapi/", username: "key", password: "secret"}
const step: LiveSessionStep = {id: "1", time: 2, learner: "ada", kind: "widget", widgets: [{state: {answer: "private"}}]}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers()})

describe("live LRS delivery", () => {
  it("sends only new mapped statements directly to the configured LRS with stable replay identities", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const fetcher = vi.fn(async () => new Response("[]", {status: 200}))
    const status: LrsStatus[] = []
    const delivery = new LiveSessionLrs(config, replay, item => status.push(item), fetcher as typeof fetch)
    delivery.markExisting([{...step, id: "old"}])
    delivery.add([{...step, id: "old"}, step, step, {id: "pointer", time: 2, learner: "ada", kind: "pointer"}])
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(status.at(-1)).toMatchObject({state: "waiting", queued: 0}))
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://school.example/xapi/statements")
    expect(request).toMatchObject({method: "POST", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      headers: {Authorization: "Basic a2V5OnNlY3JldA==", "Content-Type": "application/json", "X-Experience-API-Version": "1.0.3"}})
    const statements = JSON.parse(request.body as string)
    expect(statements).toEqual([await (await createXapiMapper(replay))(step)])
    expect(request.body).not.toContain("private")
    expect(delivery.stop()).toBe(0)
  })

  it("pauses on an authentication error and retries the same statement IDs", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", {status: 401})).mockResolvedValueOnce(new Response("[]", {status: 200}))
    const notify = vi.fn()
    const delivery = new LiveSessionLrs(config, replay, notify, fetcher as typeof fetch)
    delivery.add([step])
    await vi.waitFor(() => expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({state: "error", queued: 1})))
    delivery.retry()
    await vi.waitFor(() => expect(notify).toHaveBeenLastCalledWith({state: "waiting", queued: 0}))
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
    delivery.stop()
  })

  it("stops and aborts in-flight delivery, reporting unconfirmed events", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))))
    const delivery = new LiveSessionLrs(config, replay, vi.fn(), fetcher as typeof fetch)
    delivery.add([step])
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(delivery.stop()).toBe(1)
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it("bounds the pending queue and reports that later activity was not queued", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))))
    const notify = vi.fn()
    const delivery = new LiveSessionLrs(config, replay, notify, fetcher as typeof fetch)
    delivery.add(Array.from({length: 1001}, (_, index) => ({...step, id: `step-${index}`})))
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({state: "error", queued: 1000, message: expect.stringContaining("not queued")}))
    expect(delivery.stop()).toBe(1000)
  })

  it("rejects insecure or ambiguous endpoints before contacting anything", () => {
    for(const endpoint of ["http://school.example/xapi", "https://user:password@school.example/xapi", "https://school.example/xapi?key=secret"]) {
      expect(() => new LiveSessionLrs({...config, endpoint}, replay, vi.fn())).toThrow()
    }
  })
})
