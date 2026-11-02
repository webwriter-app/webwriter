// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {IncrementalPreviewRecorder} from "./live-session-incremental"
import {createLiveSessionReplayFile, LiveSessionReplayReader} from "./live-session-replay"
import {LiveSessionReplayClient} from "./live-session-replay-client"
import {ReplayPlayback, type ReplayWorkerRequest, type ReplayWorkerResponse} from "./live-session-replay-worker"

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: {data: ReplayWorkerResponse}) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: (() => void) | null = null
  messages: ReplayWorkerRequest[] = []
  terminate = vi.fn()
  constructor() { FakeWorker.instances.push(this) }
  postMessage(message: ReplayWorkerRequest) { this.messages.push(message) }
  reply(id: number, result: unknown) { this.onmessage?.({data: {id, result} as ReplayWorkerResponse}) }
}

afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = [] })

describe("replay worker playback", () => {
  it("reconstructs only the selected window and returns states only when needed", async () => {
    const recorder = new IncrementalPreviewRecorder("<p>First</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    try {
      const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 90000, baseHTML: "<p>Start</p>",
        learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 90000, connected: false}],
        steps: [
          {id: "a", learner: "ada", time: 1000, kind: "document" as const, htmlCheckpoint: encode(recorder.checkpoint())},
          {id: "b", learner: "ada", time: 32000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Second</p>")!), widgets: [{id: "quiz", state: {answer: 3}}]},
          {id: "c", learner: "ada", time: 64000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Third</p>")!)},
        ], feedback: []}
      const file = await createLiveSessionReplayFile(replay), slice = vi.spyOn(file, "slice")
      const playback = new ReplayPlayback(await LiveSessionReplayReader.open(file))
      const result = await playback.seek(64000, -1)
      expect(slice).toHaveBeenCalledTimes(5)
      expect(result).toMatchObject({index: 2, stepCount: 1, states: [{learner: "ada", html: "<p>Third</p>", widgets: [{id: "quiz", state: {answer: 3}}]}]})
      expect((await playback.seek(65000, result.revision)).states).toBeUndefined()
      expect((await playback.seek(65000, result.revision - 1)).states).toMatchObject([{html: "<p>Third</p>"}])
      expect((await playback.seek(1000, result.revision)).states).toMatchObject([{html: "<p>First</p>"}])
      playback.close()
    }
    finally { recorder.destroy() }
  })

  it("coalesces queued seeks and rejects pending work on close", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const client = new LiveSessionReplayClient(), worker = FakeWorker.instances[0]
    const first = client.seek(1, -1), second = client.seek(2, -1)
    const rejected = expect(second).rejects.toMatchObject({name: "AbortError"})
    const third = client.seek(3, -1)
    await rejected
    expect(worker.messages).toHaveLength(1)
    worker.reply(worker.messages[0].id, {index: 0, stepCount: 0, revision: 1, states: []})
    await expect(first).resolves.toMatchObject({revision: 1})
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(worker.messages[1]).toMatchObject({type: "seek", time: 3})
    client.close()
    await expect(third).rejects.toThrow("closed")
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("rejects pending work if the worker fails", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const client = new LiveSessionReplayClient(), worker = FakeWorker.instances[0]
    const pending = client.open(new Blob())
    worker.onerror?.(new Event("error", {cancelable: true}))
    await expect(pending).rejects.toThrow("replay worker")
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("sends replay activity to the worker in bounded batches", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const client = new LiveSessionReplayClient(), worker = FakeWorker.instances[0]
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 200, baseHTML: "<p>Start</p>", learners: [],
      steps: Array.from({length: 130}, (_, time) => ({id: String(time), time, kind: "pointer" as const, pointer: {x: 0, y: 0}})), feedback: []}
    const exporting = client.save(replay)
    expect(worker.messages[0]).toMatchObject({type: "save-start", replay: {steps: []}})
    worker.reply(worker.messages[0].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(worker.messages[1]).toMatchObject({type: "save-add", steps: expect.any(Array)})
    expect((worker.messages[1] as Extract<ReplayWorkerRequest, {type: "save-add"}>).steps).toHaveLength(128)
    worker.reply(worker.messages[1].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(3))
    expect((worker.messages[2] as Extract<ReplayWorkerRequest, {type: "save-add"}>).steps).toHaveLength(2)
    worker.reply(worker.messages[2].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(4))
    expect(worker.messages[3]).toMatchObject({type: "save-finish"})
    const blob = new Blob(["done"])
    worker.reply(worker.messages[3].id, blob)
    await expect(exporting).resolves.toBe(blob)
    client.close()
  })

  it("keeps large widget snapshots in separate worker batches", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const client = new LiveSessionReplayClient(), worker = FakeWorker.instances[0]
    const state = "x".repeat(2 * 1024 * 1024)
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 2, baseHTML: "<p>Start</p>", learners: [],
      steps: [0, 1].map(time => ({id: String(time), time, kind: "widget" as const, widgets: [{id: "quiz", state}]})), feedback: []}
    const exporting = client.save(replay)
    worker.reply(worker.messages[0].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect((worker.messages[1] as Extract<ReplayWorkerRequest, {type: "save-add"}>).steps).toHaveLength(1)
    worker.reply(worker.messages[1].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(3))
    expect((worker.messages[2] as Extract<ReplayWorkerRequest, {type: "save-add"}>).steps).toHaveLength(1)
    worker.reply(worker.messages[2].id, undefined)
    await vi.waitFor(() => expect(worker.messages).toHaveLength(4))
    worker.reply(worker.messages[3].id, new Blob())
    await exporting
    client.close()
  })
})
