import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const harness = vi.hoisted(() => ({
  workers: [] as FakeWorker[],
  harperLoaded: false,
}))

class FakeWorker extends EventTarget {
  messages: unknown[] = []
  terminate = vi.fn()

  constructor(_url: URL, _options: WorkerOptions) {
    super()
    harness.workers.push(this)
  }

  postMessage(message: unknown) {
    this.messages.push(message)
  }

  reply(id: number, result: unknown = []) {
    this.dispatchEvent(new MessageEvent("message", {data: {id, result}}))
  }

  fail(id: number, error: string) {
    this.dispatchEvent(new MessageEvent("message", {data: {id, error}}))
  }
}

vi.mock("harper.js", () => {
  harness.harperLoaded = true
  return {}
})
vi.mock("harper.js/slimBinary", () => {
  harness.harperLoaded = true
  return {}
})

import {createProofreader, type ProofreadingIssue, type ProofreadingWorkerRequest} from "./proofreading.js"

function worker() {
  return harness.workers.at(-1)!
}

async function start(signal?: AbortSignal) {
  const pending = createProofreader(signal)
  await vi.waitFor(() => expect(worker().messages).toHaveLength(1))
  const setup = worker().messages[0] as ProofreadingWorkerRequest
  expect(setup).toMatchObject({type: "setup", id: 1})
  worker().reply(setup.id)
  return pending
}

const issue = (start: number): ProofreadingIssue => ({
  start, end: start + 1, kind: "grammar", message: `Issue ${start}`,
  suggestions: [{kind: "replace", text: "x"}],
})

describe("proofreading worker client", () => {
  beforeEach(() => {
    harness.workers = []
    harness.harperLoaded = false
    vi.stubGlobal("Worker", FakeWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("waits for a setup acknowledgement before resolving", async () => {
    const pending = createProofreader()
    await vi.waitFor(() => expect(worker().messages).toHaveLength(1))
    expect(await Promise.race([pending.then(() => "ready"), Promise.resolve("pending")] )).toBe("pending")
    worker().reply(1)
    const proofreader = await pending
    expect(proofreader).toHaveProperty("checkBatch")
    await proofreader.dispose()
  })

  it("rejects setup errors and terminates the worker", async () => {
    const pending = createProofreader()
    await vi.waitFor(() => expect(worker().messages).toHaveLength(1))
    worker().fail(1, "WASM setup failed")
    await expect(pending).rejects.toThrow("WASM setup failed")
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it.each(["error", "messageerror"] as const)("rejects pending requests on a worker %s event", async type => {
    const proofreader = await start()
    const pending = proofreader.check("text", "en")
    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    const event = new Event(type, {cancelable: true})
    worker().dispatchEvent(event)
    await expect(pending).rejects.toThrow("Could not start or communicate with the Harper worker")
    expect(event.defaultPrevented).toBe(true)
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it("rejects if already aborted and cancels setup when aborted before acknowledgement", async () => {
    const before = new AbortController()
    before.abort()
    await expect(createProofreader(before.signal)).rejects.toThrow()
    expect(harness.workers).toHaveLength(0)

    const during = new AbortController()
    const pending = createProofreader(during.signal)
    await vi.waitFor(() => expect(worker().messages).toHaveLength(1))
    during.abort()
    await expect(pending).rejects.toThrow("Proofreader has been disposed")
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it("rejects outstanding work when aborted after setup", async () => {
    const abort = new AbortController()
    const proofreader = await start(abort.signal)
    const pending = proofreader.check("text", "en")
    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    abort.abort()
    await expect(pending).rejects.toThrow("Proofreader has been disposed")
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it("terminates and rejects outstanding work on timeout", async () => {
    vi.useFakeTimers()
    const proofreader = await start()
    const pending = proofreader.check("text", "en")
    const rejection = expect(pending).rejects.toThrow("Harper request timed out")
    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(30_000)
    await rejection
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it("terminates and rejects an in-flight request when disposed", async () => {
    const proofreader = await start()
    const pending = proofreader.check("text", "en")
    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    await proofreader.dispose()
    await expect(pending).rejects.toThrow("Proofreader has been disposed")
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it("batches more than 256 runs, normalizes the dictionary, and preserves result order", async () => {
    const proofreader = await start()
    const runs = Array.from({length: 300}, (_, index) => ({text: `run ${index}`, language: "en-US"}))
    const dictionary = [" WebWriter ", "webwriter", "", "Two words", 3] as unknown as string[]
    const pending = proofreader.checkBatch!(runs, dictionary)

    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    const first = worker().messages[1] as ProofreadingWorkerRequest
    expect(first).toMatchObject({type: "check", id: 2, runs: runs.slice(0, 256), dictionary: ["WebWriter"]})
    worker().reply(first.id, runs.slice(0, 256).map((_, index) => [issue(index)]))

    await vi.waitFor(() => expect(worker().messages).toHaveLength(3))
    const second = worker().messages[2] as ProofreadingWorkerRequest
    expect(second).toMatchObject({type: "check", id: 3, runs: runs.slice(256), dictionary: ["WebWriter"]})
    worker().reply(second.id, runs.slice(256).map((_, index) => [issue(index + 256)]))

    const result = await pending
    expect(result).toHaveLength(300)
    expect(result.map(items => items[0].start)).toEqual(Array.from({length: 300}, (_, index) => index))
    expect(harness.harperLoaded).toBe(false)
    await proofreader.dispose()
  })

  it("sends only text and language from DOM-backed runs", async () => {
    const proofreader = await start()
    const run = {text: "text", language: "en", parts: [{node: () => "uncloneable document node"}]}
    const pending = proofreader.checkBatch!([run])
    await vi.waitFor(() => expect(worker().messages).toHaveLength(2))
    expect(worker().messages[1]).toEqual({type: "check", id: 2, runs: [{text: "text", language: "en"}], dictionary: []})
    expect(() => structuredClone(worker().messages[1])).not.toThrow()
    worker().reply(2, [[]])
    expect(await pending).toEqual([[]])
    await proofreader.dispose()
  })
})
