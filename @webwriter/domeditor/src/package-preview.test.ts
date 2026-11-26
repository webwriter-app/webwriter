// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {loadPackagePreview, packagePreviewCandidates} from "./package-preview"
import type {WebWriterPackage, WebWriterPackageManifest} from "./packages"

const candidates = (exports: WebWriterPackageManifest["exports"], locale = "de-CH") => packagePreviewCandidates({
  name: "@webwriter/quiz", version: "1.0.0", manifest: {name: "@webwriter/quiz", version: "1.0.0", exports},
} as WebWriterPackage, locale)

function riffChunk(type: string, payload: Buffer) {
  const size = Buffer.alloc(4)
  size.writeUInt32LE(payload.length)
  return Buffer.concat([Buffer.from(type), size, payload, Buffer.alloc(payload.length % 2)])
}

function webp(...chunks: Buffer[]) {
  return riffChunk("RIFF", Buffer.concat([Buffer.from("WEBP"), ...chunks]))
}

const still = riffChunk("VP8 ", Buffer.alloc(2))

function mp4Box(type: string, ...payload: Buffer[]) {
  const size = Buffer.alloc(4)
  size.writeUInt32BE(8 + payload.reduce((sum, item) => sum + item.length, 0))
  return Buffer.concat([size, Buffer.from(type), ...payload])
}

function mp4(codec = "avc1", width = 800, audio = false) {
  const entry = Buffer.alloc(78)
  entry.writeUInt16BE(width, 24)
  entry.writeUInt16BE(800, 26)
  const track = (type: string, ...boxes: Buffer[]) => mp4Box("trak",
    mp4Box("mdia", mp4Box("hdlr", Buffer.alloc(8), Buffer.from(type)), ...boxes))
  const configuration = mp4Box("avcC", Buffer.alloc(7))
  const samples = mp4Box("stsd", Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), mp4Box(codec, entry, configuration))
  return Buffer.concat([
    mp4Box("ftyp", Buffer.from("isom"), Buffer.alloc(4)),
    mp4Box("moov", track("vide", mp4Box("minf", mp4Box("stbl", samples))), ...(audio ? [track("soun")] : [])),
  ])
}

const response = (bytes: Buffer) => new Response(Uint8Array.from(bytes))

function stubMedia(imageWidth = 800) {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview")
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(imageWidth)
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(800)
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function(this: HTMLImageElement) {
    queueMicrotask(() => this.dispatchEvent(new Event("load")))
  })
  vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function(this: HTMLVideoElement) {
    Object.defineProperties(this, {videoWidth: {value: 800}, videoHeight: {value: 800}})
    queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")))
  })
  const fetcher = vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", fetcher)
  return {fetcher, revoke}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("resolves exact, base and default exports as pinned asset URLs", () => {
  expect(candidates({
    "./preview": "./assets/default.webp",
    "./preview/de": {browser: "./assets/german.mp4", default: "./assets/default.webp"},
    "./preview/de-ch": "./assets/Swiss German.webp",
  })).toEqual([
    {kind: "image", url: "https://cdn.jsdelivr.net/npm/@webwriter/quiz@1.0.0/assets/Swiss%20German.webp"},
    {kind: "video", url: "https://cdn.jsdelivr.net/npm/@webwriter/quiz@1.0.0/assets/german.mp4"},
    {kind: "image", url: "https://cdn.jsdelivr.net/npm/@webwriter/quiz@1.0.0/assets/default.webp"},
  ])
})

it("skips invalid targets and does not retry the same asset", () => {
  expect(candidates({
    "./preview/de-CH": "./../bad.webp", "./preview/de": "./default.webp", "./preview": "./default.webp",
    "./preview/fr": "https://example.com/preview.webp", "./preview/es": "./preview.gif",
  })).toHaveLength(1)
  expect(candidates({"./preview/de": "./de.gif"}, "de")).toEqual([])
})

it("rejects animated WebP and falls back when a locale file is missing", async () => {
  const {fetcher} = stubMedia()
  fetcher.mockResolvedValueOnce(response(webp(riffChunk("ANIM", Buffer.alloc(6)), still)))
    .mockResolvedValueOnce(new Response(null, {status: 404})).mockResolvedValueOnce(response(webp(still)))
  const choices = candidates({"./preview/de-CH": "./ch.webp", "./preview/de": "./de.webp", "./preview": "./default.webp"})
  const preview = await loadPackagePreview(choices, new AbortController().signal)
  expect(preview?.element).toBeInstanceOf(HTMLImageElement)
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(choices.map(({url}) => url))
  expect(URL.createObjectURL).toHaveBeenCalledOnce()
})

it("stops reading an oversized body and accepts a file of exactly 1 MB", async () => {
  const {fetcher} = stubMedia()
  const cancel = vi.fn()
  fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
    pull: controller => controller.enqueue(new Uint8Array(500_001)),
    cancel,
  })))
  const exact = webp(still, riffChunk("JUNK", Buffer.alloc(1_000_000 - 12 - still.length - 8)))
  expect(exact.length).toBe(1_000_000)
  fetcher.mockResolvedValueOnce(response(exact))
  const preview = await loadPackagePreview(candidates({"./preview/de": "./big.webp", "./preview": "./exact.webp"}),
    new AbortController().signal)
  expect(preview?.element).toBeInstanceOf(HTMLImageElement)
  expect(cancel).toHaveBeenCalledOnce()
  expect(URL.createObjectURL).toHaveBeenCalledOnce()
})

it("validates decoded image dimensions and releases rejected object URLs", async () => {
  const {fetcher, revoke} = stubMedia(799)
  fetcher.mockResolvedValueOnce(response(webp(still)))
  expect(await loadPackagePreview(candidates({"./preview": "./narrow.webp"}), new AbortController().signal)).toBeUndefined()
  expect(revoke).toHaveBeenCalledWith("blob:preview")
})

it("rejects other MP4 codecs, wrong frame sizes, and audio tracks", async () => {
  const {fetcher} = stubMedia()
  fetcher.mockResolvedValueOnce(response(mp4("hvc1")))
    .mockResolvedValueOnce(response(mp4("avc1", 799))).mockResolvedValueOnce(response(mp4("avc1", 800, true)))
  const choices = candidates({"./preview/de-CH": "./hevc.mp4", "./preview/de": "./small.mp4", "./preview": "./audio.mp4"})
  expect(await loadPackagePreview(choices, new AbortController().signal)).toBeUndefined()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  fetcher.mockResolvedValueOnce(response(mp4()))
  const preview = await loadPackagePreview(choices, new AbortController().signal)
  expect(preview?.element).toBeInstanceOf(HTMLVideoElement)
  expect((preview?.element as HTMLVideoElement).muted).toBe(true)
})
