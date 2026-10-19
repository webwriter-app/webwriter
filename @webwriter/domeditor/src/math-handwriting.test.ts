// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {MathHandwritingRecognizer} from "./math-handwriting"

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage?: (event: MessageEvent) => void
  onerror?: (event: Event) => void
  onmessageerror?: () => void
  messages: {id: number, strokes?: unknown}[] = []
  terminate = vi.fn()
  constructor(public url: URL, public options: WorkerOptions) { FakeWorker.instances.push(this) }
  postMessage(message: {id: number, strokes?: unknown}) { this.messages.push(message) }
  reply(data: unknown) { this.onmessage?.(new MessageEvent("message", {data})) }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); FakeWorker.instances = [] })

describe("handwriting worker client", () => {
  it("initializes a module worker and correlates asynchronous results", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const recognizer = new MathHandwritingRecognizer()
    const worker = FakeWorker.instances[0]
    expect(worker.options).toEqual({type: "module"})
    const load = recognizer.load()
    worker.reply({id: worker.messages[0].id})
    await expect(load).resolves.toBe("")
    const strokes = [[{x: 1, y: 2, t: 3}]]
    const result = recognizer.recognize(strokes)
    expect(worker.messages[1].strokes).toEqual(strokes)
    worker.reply({id: 999, mathml: "stale"})
    worker.reply({id: worker.messages[1].id, mathml: "<math/>"})
    await expect(result).resolves.toBe("<math/>")
    recognizer.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("rejects pending work on disposal or worker failure", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const recognizer = new MathHandwritingRecognizer()
    const result = recognizer.load()
    const rejected = expect(result).rejects.toThrow("Could not load")
    FakeWorker.instances[0].onerror!(new Event("error", {cancelable: true}))
    await rejected
    await expect(recognizer.recognize([])).rejects.toThrow("closed")
  })

  it("reports model errors and times out stalled requests", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    vi.useFakeTimers()
    const recognizer = new MathHandwritingRecognizer()
    const load = recognizer.load()
    const rejected = expect(load).rejects.toThrow("Download failed")
    FakeWorker.instances[0].reply({id: 1, error: "Download failed"})
    await rejected
    const result = recognizer.load()
    const timedOut = expect(result).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(120_000)
    await timedOut
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce()
  })
})
