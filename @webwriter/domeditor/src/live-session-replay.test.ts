// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {gunzipSync, gzipSync} from "node:zlib"
import {LiveSession} from "./live-session"
import {IncrementalPreviewRecorder} from "./live-session-incremental"
import {applyPreviewUpdate} from "./live-session-permissions.js"
import {captureLiveSessionReplay, createLiveSessionReplayFile, writeLiveSessionReplayFile, LiveSessionReplayReader, parseLiveSessionReplay, readLiveSessionReplayFile, restoreReplayCheckpoint, serializeLiveSessionReplay} from "./live-session-replay"

const sessions: LiveSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.destroy()))

describe("live replay capture", () => {
  it("captures accepted incremental activity, feedback, and the initial document without connection credentials", () => {
    const host = new LiveSession({id: "recorded", role: "host", token: "a".repeat(32), baseHTML: '<!doctype html><html><head><script class="◆editor-only">bootstrap()</script></head><body><p class="authored ◆temporary">Original</p><!--keep--><x-widget></x-widget></body></html>', previewDependencies: {packages: [], importMap: null}})
    const learner = new LiveSession({id: "recorded", role: "learner", token: "a".repeat(32), learner: {id: "ada", name: "Ada", color: "red"}})
    sessions.push(host, learner)
    const recorder = new IncrementalPreviewRecorder("<p>Original</p>")
    const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value))
    try {
      learner.publish({kind: "document", htmlCheckpoint: encode(recorder.checkpoint())})
      learner.publish({kind: "document", htmlUpdate: encode(recorder.capture("<p>Changed 😀</p>")!),
        widgets: [{id: "quiz", html: '<x-widget id="quiz" class="authored"><!--keep--></x-widget>'}]})
      host.sendFeedback("ada", "Good work")
      expect(() => captureLiveSessionReplay(host, 1, 2)).toThrow("concluded")
      host.stop()
      const replay = captureLiveSessionReplay(host, 1, 2)
      const saved = JSON.parse(JSON.stringify(replay))
      expect(parseLiveSessionReplay(serializeLiveSessionReplay(replay))).toEqual(replay)
      expect(saved).toMatchObject({format: "webwriter-live-replay", startedAt: 1, endedAt: 2})
      expect(saved.baseHTML).toContain('<p class="authored">Original</p><!--keep--><x-widget></x-widget>')
      expect(saved.baseHTML).not.toContain("◆")
      expect(saved.baseHTML).not.toContain("bootstrap()")
      expect(saved.steps[1].widgets[0].html).toBe('<x-widget id="quiz" class="authored"><!--keep--></x-widget>')
      expect(saved.learners).toEqual([expect.objectContaining({id: "ada", connected: false})])
      expect(saved.feedback).toEqual([expect.objectContaining({participant: "ada", text: "Good work"})])
      expect(JSON.stringify(saved)).not.toContain("a".repeat(32))
      const doc = new Y.Doc()
      expect(applyPreviewUpdate(doc, saved.steps[0].htmlCheckpoint)).toBe("<p>Original</p>")
      expect(applyPreviewUpdate(doc, saved.steps[1].htmlUpdate)).toBe("<p>Changed 😀</p>")
      doc.destroy()
    }
    finally { recorder.destroy() }
  })

  it("rejects learner sessions and missing initial documents", () => {
    const learner = new LiveSession({id: "learner-replay", role: "learner"})
    const host = new LiveSession({id: "missing-replay", role: "host"})
    sessions.push(learner, host)
    learner.stop(); host.stop()
    expect(() => captureLiveSessionReplay(learner, 1, 2)).toThrow("host")
    expect(() => captureLiveSessionReplay(host, 1, 2)).toThrow("initial")
  })

  it("rejects old replay formats, malformed events, and incremental updates without a checkpoint", () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 2, connected: false}], steps: [], feedback: []}
    expect(() => parseLiveSessionReplay(JSON.stringify({...JSON.parse(serializeLiveSessionReplay(replay)), version: 1}))).toThrow()
    const invalidPointer = JSON.parse(serializeLiveSessionReplay({...replay, steps: [{id: "a", learner: "ada", time: 1, kind: "pointer", pointer: {x: 0, y: 0}}]}))
    invalidPointer.steps[0].p.x = "bad"
    expect(() => parseLiveSessionReplay(JSON.stringify(invalidPointer))).toThrow()
    expect(() => parseLiveSessionReplay(serializeLiveSessionReplay({...replay, steps: [{id: "a", learner: "ada", time: 1, kind: "document", htmlUpdate: "AQID"}]}))).toThrow()
    expect(() => parseLiveSessionReplay(serializeLiveSessionReplay({...replay, feedback: [{id: "f", participant: "other", text: "x", time: 1}]}))).toThrow()
  })

  it("shares individual widget snapshots and compactly encodes participants without changing replay state", () => {
    const widget = {id: "quiz", html: `<x-quiz>${"answer".repeat(200)}</x-quiz>`, state: {answer: 1}}
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 4, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 4, connected: false}],
      steps: [
        {id: "a", time: 1, learner: "ada", kind: "widget" as const, widgets: [widget]},
        {id: "b", time: 2, learner: "ada", kind: "click" as const, click: {x: 1, y: 2}, widgets: [widget, {...widget, state: {answer: 2}}]},
        {id: "c", time: 3, learner: "ada", kind: "widget" as const, widgets: []},
      ], feedback: [{id: "f", participant: "ada", text: "Good", time: 3}]}
    const serialized = serializeLiveSessionReplay(replay)
    expect(JSON.parse(serialized).widgets).toHaveLength(2)
    expect(serialized.length).toBeLessThan(JSON.stringify(replay).length)
    expect(parseLiveSessionReplay(serialized)).toEqual(replay)
    const invalid = JSON.parse(serialized)
    invalid.steps[0].w = [99]
    expect(() => parseLiveSessionReplay(JSON.stringify(invalid))).toThrow("widget reference")
    invalid.steps[0].w = [0]; invalid.steps[0].l = 99
    expect(() => parseLiveSessionReplay(JSON.stringify(invalid))).toThrow("participant reference")
  })

  it("samples pointer motion per learner while retaining endpoints and interactions", () => {
    const host = new LiveSession({id: "sample", role: "host", baseHTML: "<p>Start</p>"})
    sessions.push(host)
    host.stop()
    const pointer = (id: string, learner: string, time: number) => ({id, learner, time, kind: "pointer" as const, pointer: {x: time, y: 0}})
    vi.spyOn(host, "steps", "get").mockReturnValue([
      pointer("a", "ada", 0), pointer("b", "ada", 80), pointer("c", "bob", 100),
      pointer("d", "ada", 160), {id: "click", learner: "ada", time: 170, kind: "click", click: {x: 1, y: 1}, pointer: {x: 1, y: 1}},
      pointer("e", "ada", 180), pointer("f", "ada", 200), pointer("g", "ada", 210), pointer("h", "ada", 500),
    ])
    expect(captureLiveSessionReplay(host, 0, 1000).steps.map(step => step.id)).toEqual(["a", "c", "d", "click", "e", "g", "h"])
  })

  it("compresses and opens replay files", async () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2,
      baseHTML: `<p>${"repeated 😀 ".repeat(1000)}</p>`, learners: [], steps: [], feedback: []}
    const file = await createLiveSessionReplayFile(replay)
    expect(await file.slice(0, 8).text()).toBe("WWREPLAY")
    expect(file.size).toBeLessThan(serializeLiveSessionReplay(replay).length / 4)
    expect(await readLiveSessionReplayFile(file)).toEqual(replay)
    await expect(readLiveSessionReplayFile(new Blob([JSON.stringify(replay)]))).rejects.toThrow("Invalid replay")
  })

  it("writes chunks incrementally and stops immediately when the destination fails", async () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 90000, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 90000, connected: false}],
      steps: [0, 31000, 62000].map((time, i) => ({id: String(i), learner: "ada", time, kind: "pointer" as const, pointer: {x: i, y: 0}})), feedback: []}
    const parts: Blob[] = []
    await writeLiveSessionReplayFile(replay, async part => { parts.push(part) })
    expect(parts).toHaveLength(7)
    expect(await readLiveSessionReplayFile(new Blob(parts))).toEqual(replay)
    await expect(readLiveSessionReplayFile(new Blob(parts.slice(0, -1)))).rejects.toThrow("index")
    let writes = 0
    await expect(writeLiveSessionReplayFile(replay, async () => { if(++writes === 3) throw new Error("Disk full") })).rejects.toThrow("Disk full")
    expect(writes).toBe(3)
  })

  it("splits large activity batches before they accumulate into a huge chunk", async () => {
    const state = "x".repeat(4 * 1024 * 1024 + 1)
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 1, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 1, connected: false}],
      steps: [0, 1].map(time => ({id: String(time), learner: "ada", time, kind: "widget" as const, widgets: [{id: "quiz", state}]})), feedback: []}
    const parts: Blob[] = []
    await writeLiveSessionReplayFile(replay, async part => { parts.push(part) })
    expect(parts).toHaveLength(6)
    expect((await readLiveSessionReplayFile(new Blob(parts))).steps).toHaveLength(2)
  }, 30000)

  it("reports missing compression support and corrupt gzip", async () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2,
      baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}
    const file = await createLiveSessionReplayFile(replay)
    try {
      vi.stubGlobal("CompressionStream", undefined)
      await expect(createLiveSessionReplayFile(replay)).rejects.toThrow("does not support")
      vi.stubGlobal("DecompressionStream", undefined)
      await expect(readLiveSessionReplayFile(file)).rejects.toThrow("cannot open compressed")
    }
    finally { vi.unstubAllGlobals() }
    await expect(readLiveSessionReplayFile(new Blob([new Uint8Array([0x1f, 0x8b, 0, 0, 0])]))).rejects.toThrow()
  })

  it("rejects a compressed replay that exceeds the decompressed size limit", async () => {
    const gzip = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1, 32))
    const index = new TextEncoder().encode(JSON.stringify({metadata: {offset: 0, length: gzip.length}, chunks: []}))
    const header = new Uint8Array(12); header.set(new TextEncoder().encode("WWREPLAY")); new DataView(header.buffer).setUint32(8, index.length)
    await expect(readLiveSessionReplayFile(new Blob([header, index, gzip]))).rejects.toThrow("too large")
  }, 30000)

  it("loads indexed chunks only when their time is needed", async () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 100000, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 100000, connected: false}],
      steps: [1, 31001, 61001].map((time, i) => ({id: String(i), time, learner: "ada", kind: "pointer" as const, pointer: {x: i, y: 0}})), feedback: []}
    const file = await createLiveSessionReplayFile(replay)
    const slice = vi.spyOn(file, "slice")
    const reader = await LiveSessionReplayReader.open(file)
    expect(reader.metadata.steps).toEqual([])
    expect(slice).toHaveBeenCalledTimes(4)
    expect((await reader.readThrough(1)).map(step => step.id)).toEqual(["0"])
    expect(slice).toHaveBeenCalledTimes(5)
    expect((await reader.readThrough(31001)).map(step => step.id)).toEqual(["1"])
    expect((await reader.readThrough(Infinity)).map(step => step.id)).toEqual(["2"])
    reader.close()
  })

  it("validates incremental documents across chunks and rejects corrupted later chunks when read", async () => {
    const recorder = new IncrementalPreviewRecorder("<p>First</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    try {
      const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 100000, baseHTML: "<p>First</p>",
        learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 100000, connected: false}],
        steps: [
          {id: "a", learner: "ada", time: 0, kind: "document" as const, htmlCheckpoint: encode(recorder.checkpoint())},
          {id: "b", learner: "ada", time: 31000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Second</p>")!)},
        ], feedback: []}
      const file = await createLiveSessionReplayFile(replay)
      expect(await readLiveSessionReplayFile(file)).toEqual(replay)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const length = new DataView(bytes.buffer).getUint32(bytes.length - 12)
      const index = JSON.parse(new TextDecoder().decode(bytes.slice(bytes.length - 12 - length, bytes.length - 12)))
      const last = index.chunks.at(-1)
      bytes[12 + last.offset + last.length - 1] ^= 0xff
      const reader = await LiveSessionReplayReader.open(new Blob([bytes]))
      expect((await reader.readThrough(0)).map(step => step.id)).toEqual(["a"])
      await expect(reader.readThrough(31000)).rejects.toThrow()
      reader.close()
      const invalidIndex = new Uint8Array(await file.arrayBuffer())
      new DataView(invalidIndex.buffer).setUint32(8, invalidIndex.length)
      await expect(LiveSessionReplayReader.open(new Blob([invalidIndex]))).rejects.toThrow("index")
    }
    finally { recorder.destroy() }
  })

  it("seeks directly to a checkpoint with the learner state and Yjs history needed for later updates", async () => {
    const recorder = new IncrementalPreviewRecorder("<p>First</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    try {
      const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 100000, baseHTML: "<p>Start</p>",
        learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 100000, connected: false}],
        steps: [
          {id: "a", learner: "ada", time: 0, kind: "document" as const, htmlCheckpoint: encode(recorder.checkpoint())},
          {id: "b", learner: "ada", time: 31000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Second</p>")!), pointer: {x: .5, y: .6}, click: {x: .5, y: .6}, widgets: [{id: "quiz", state: {answer: 3}}]},
          {id: "c", learner: "ada", time: 61000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Third</p>")!)},
        ], feedback: []}
      const file = await createLiveSessionReplayFile(replay)
      const slices = vi.spyOn(file, "slice")
      const reader = await LiveSessionReplayReader.open(file)
      const window = await reader.readAt(61000)
      expect(slices).toHaveBeenCalledTimes(5)
      expect(window.index).toBe(2)
      expect(window.steps.map(step => step.id)).toEqual(["c"])
      const restored = restoreReplayCheckpoint(window.checkpoint)
      expect(restored.states.get("ada")).toMatchObject({html: "<p>Second</p>", pointer: {x: .5, y: .6}, clickStep: "b", widgets: [{id: "quiz", state: {answer: 3}}]})
      expect(applyPreviewUpdate(restored.documents.get("ada")!, window.steps[0].htmlUpdate!)).toBe("<p>Third</p>")
      restored.documents.forEach(doc => doc.destroy())
      reader.close()

      const bytes = new Uint8Array(await file.arrayBuffer())
      const indexLength = new DataView(bytes.buffer).getUint32(bytes.length - 12)
      const index = JSON.parse(new TextDecoder().decode(bytes.slice(bytes.length - 12 - indexLength, bytes.length - 12)))
      const dataStart = 12, chunk = index.chunks[2]
      const content = JSON.parse(gunzipSync(bytes.slice(dataStart + chunk.offset, dataStart + chunk.offset + chunk.length)).toString())
      content.checkpoint.documents.ada = "AQID"
      const broken = gzipSync(JSON.stringify(content))
      chunk.length = broken.length
      const newIndex = new TextEncoder().encode(JSON.stringify(index)), footer = new Uint8Array(12)
      new DataView(footer.buffer).setUint32(0, newIndex.length); footer.set(new TextEncoder().encode("WWREPLAY"), 4)
      const brokenFile = new Blob([bytes.slice(0, dataStart + chunk.offset), broken, newIndex, footer])
      const brokenReader = await LiveSessionReplayReader.open(brokenFile)
      await expect(brokenReader.readAt(61000)).rejects.toThrow()
      brokenReader.close()
    }
    finally { recorder.destroy() }
  })

  it("does not use a checkpoint whose preceding steps have later timestamps", async () => {
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 50000, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 50000, connected: false}],
      steps: [100, 40000, 10].map((time, index) => ({id: String(index), time, learner: "ada", kind: "pointer" as const, pointer: {x: index, y: 0}})), feedback: []}
    const reader = await LiveSessionReplayReader.open(await createLiveSessionReplayFile(replay))
    try {
      const earlier = await reader.readAt(50)
      expect(earlier.index).toBe(0)
      expect(earlier.checkpoint.states).toEqual([])
      const later = await reader.readAt(100)
      expect(later.index).toBe(1)
      expect(later.checkpoint.states[0].pointer).toEqual({x: 0, y: 0})
    }
    finally { reader.close() }
  })
})
