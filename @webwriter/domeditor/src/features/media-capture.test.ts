// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {MediaCapture} from "../components/media-capture"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import type {MediaCaptureMode} from "../media"
import {$} from "../utility"

class Track extends EventTarget {
  readyState = "live"
  stop = vi.fn(() => { this.readyState = "ended" })
  constructor(readonly kind: "video" | "audio", readonly id = "") { super() }
  getSettings() { return {deviceId: this.id} }
  end() { this.readyState = "ended"; this.dispatchEvent(new Event("ended")) }
}

const stream = (...tracks: Track[]) => ({
  getTracks: () => [...tracks],
  getVideoTracks: () => tracks.filter(track => track.kind === "video"),
  getAudioTracks: () => tracks.filter(track => track.kind === "audio"),
  addTrack: (track: Track) => { tracks.push(track) },
  removeTrack: (track: Track) => { tracks = tracks.filter(item => item !== track) },
}) as unknown as MediaStream

class Recorder {
  static instances: Recorder[] = []
  state = "inactive"
  mimeType = "audio/mp4"
  ondataavailable: ((event: {data: Blob}) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn(() => { this.state = "recording" })
  stop = vi.fn(() => {
    this.state = "inactive"
    queueMicrotask(() => {
      this.ondataavailable?.({data: new Blob(["final recording"], {type: this.mimeType})})
      this.onstop?.()
    })
  })
  constructor(readonly stream: MediaStream) { Recorder.instances.push(this) }
}

class Permission extends EventTarget {
  state: PermissionState = "prompt"
  change(state: PermissionState) { this.state = state; this.dispatchEvent(new Event("change")) }
}

let devices: EventTarget & {
  getUserMedia: ReturnType<typeof vi.fn>
  getDisplayMedia: ReturnType<typeof vi.fn>
  enumerateDevices: ReturnType<typeof vi.fn>
}
let cameraPermission: Permission
let microphonePermission: Permission
let permissionQuery: ReturnType<typeof vi.fn>
let panel: MediaCapture | undefined
let editor: DOMEditor | undefined
const inserted = vi.fn((_blob: Blob) => true)
const closed = vi.fn()
const button = (selector: string) => panel!.root.querySelector<HTMLButtonElement>(selector)!
const status = () => panel!.root.querySelector(".status")!.textContent
const open = (mode: MediaCaptureMode) => {
  panel = new MediaCapture(mode, inserted, closed)
  const host = document.createElement("div")
  document.body.append(host)
  host.attachShadow({mode: "open"}).append(panel.element)
  panel.show()
  return panel
}
const ready = async () => vi.waitFor(() => expect(button(".capture")).not.toHaveAttribute("hidden"))
const device = (kind: string, deviceId: string, label: string) => ({kind, deviceId, label})
const captureStreamDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream")

beforeEach(() => {
  document.body.replaceChildren()
  Recorder.instances = []
  inserted.mockClear().mockReturnValue(true)
  closed.mockClear()
  devices = Object.assign(new EventTarget(), {
    getUserMedia: vi.fn().mockResolvedValue(stream(new Track("audio"))),
    getDisplayMedia: vi.fn().mockResolvedValue(stream(new Track("video"))),
    enumerateDevices: vi.fn().mockResolvedValue([]),
  })
  cameraPermission = new Permission()
  microphonePermission = new Permission()
  permissionQuery = vi.fn(async ({name}: {name: string}) => name === "camera" ? cameraPermission : microphonePermission)
  vi.stubGlobal("navigator", new Proxy(navigator, {
    get(target, name) {
      if(name === "mediaDevices") return devices
      if(name === "permissions") return {query: permissionQuery}
      return Reflect.get(target, name, target)
    },
  }))
  vi.stubGlobal("MediaRecorder", Recorder)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  const previews = new WeakMap<HTMLMediaElement, MediaProvider | null>()
  vi.spyOn(HTMLMediaElement.prototype, "srcObject", "get").mockImplementation(function(this: HTMLMediaElement) { return previews.get(this) ?? null })
  vi.spyOn(HTMLMediaElement.prototype, "srcObject", "set").mockImplementation(function(this: HTMLMediaElement, value) { previews.set(this, value) })
})

afterEach(() => {
  panel?.close()
  panel = undefined
  editor?.destroy()
  editor = undefined
  vi.restoreAllMocks()
  if(captureStreamDescriptor) Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", captureStreamDescriptor)
  else Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream")
  vi.unstubAllGlobals()
})

describe("native media capture lifecycle", () => {
  it("does not open a device before the user requests it and waits for approval", async () => {
    let approve!: (value: MediaStream) => void
    devices.getUserMedia.mockReturnValue(new Promise(resolve => { approve = resolve }))
    open("microphone-audio")
    expect(devices.getUserMedia).not.toHaveBeenCalled()
    expect(button(".connect")).toHaveClass("primary")
    button(".connect").click()
    await vi.waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledTimes(1))
    expect(status()).toMatch(/Waiting for permission/)
    expect(button(".capture")).toHaveAttribute("hidden")
    expect(button(".connect")).toBeDisabled()
    approve(stream(new Track("audio")))
    await ready()
    expect(button(".connect")).not.toHaveClass("primary")
    expect(button(".capture")).toHaveClass("primary")
    expect(Recorder.instances).toHaveLength(0)
  })

  it("stops a stream approved after cancellation without inserting anything", async () => {
    let approve!: (value: MediaStream) => void
    devices.getUserMedia.mockReturnValue(new Promise(resolve => { approve = resolve }))
    open("microphone-audio")
    button(".connect").click()
    await vi.waitFor(() => expect(devices.getUserMedia).toHaveBeenCalled())
    button(".cancel").click()
    const track = new Track("audio")
    approve(stream(track))
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce())
    expect(inserted).not.toHaveBeenCalled()
    expect(closed).toHaveBeenCalledOnce()
  })

  it("requests device access even after a denied permission query and allows retry", async () => {
    microphonePermission.state = "denied"
    devices.getUserMedia.mockRejectedValueOnce(new DOMException("device", "NotAllowedError"))
    open("microphone-audio")
    await vi.waitFor(() => expect(status()).toMatch(/Permission was not granted/))
    button(".connect").click()
    expect(devices.getUserMedia).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(button(".connect")).not.toBeDisabled())
    expect(status()).toMatch(/Permission was not granted/)
    microphonePermission.change("granted")
    button(".connect").click()
    await ready()
    expect(devices.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it.each(["camera-image", "camera-video", "microphone-audio"] as const)(
    "requests %s access within the click even if permission queries never settle", async mode => {
      permissionQuery.mockReturnValue(new Promise(() => {}))
      devices.getUserMedia.mockResolvedValue(stream(new Track(mode === "microphone-audio" ? "audio" : "video")))
      open(mode)
      button(".connect").click()
      expect(devices.getUserMedia).toHaveBeenCalledWith({video: mode.startsWith("camera-"), audio: mode === "microphone-audio"})
      await ready()
    },
  )

  it("does not let a late permission query cancel a pending device request", async () => {
    let queried!: (permission: Permission) => void
    let approve!: (value: MediaStream) => void
    permissionQuery.mockReturnValue(new Promise(resolve => { queried = resolve }))
    devices.getUserMedia.mockReturnValue(new Promise(resolve => { approve = resolve }))
    open("microphone-audio")
    button(".connect").click()
    microphonePermission.state = "denied"
    queried(microphonePermission)
    await Promise.resolve()
    await Promise.resolve()
    expect(status()).toMatch(/Waiting for permission/)
    const audio = new Track("audio")
    approve(stream(audio))
    await ready()
    expect(audio.stop).not.toHaveBeenCalled()
  })

  it.each(["NotAllowedError", "NotReadableError", "NotFoundError", "OverconstrainedError"])(
    "keeps %s errors inline and allows another attempt", async name => {
      devices.getUserMedia.mockRejectedValueOnce(new DOMException("device", name))
      open("microphone-audio")
      button(".connect").click()
      await vi.waitFor(() => expect(panel!.root.querySelector(".status")).toHaveClass("error"))
      expect(panel!.root.querySelector(".status")).toHaveAttribute("aria-live", "polite")
      expect(panel!.element.isConnected).toBe(true)
      button(".connect").click()
      await ready()
    },
  )

  it("uses getUserMedia even when permission queries are unsupported", async () => {
    permissionQuery.mockRejectedValue(new TypeError("Unknown permission"))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    expect(devices.getUserMedia).toHaveBeenCalledOnce()
  })

  it("calls the screen picker within the click without waiting on permissions", async () => {
    open("screen-video")
    expect(button(".connect")).toHaveClass("primary")
    button(".connect").click()
    expect(devices.getDisplayMedia).toHaveBeenCalledWith({video: true, audio: true})
    expect(permissionQuery).not.toHaveBeenCalled()
    await ready()
    expect(status()).toMatch(/no shared audio/)
  })

  it("reports missing shared audio and immediately releases the screen", async () => {
    const video = new Track("video")
    devices.getDisplayMedia.mockResolvedValue(stream(video))
    open("screen-audio")
    button(".connect").click()
    await vi.waitFor(() => expect(status()).toMatch(/No audio was shared/))
    expect(video.stop).toHaveBeenCalledOnce()
  })

  it("releases unused screen video for audio recording and includes the final recording chunk", async () => {
    const video = new Track("video")
    const audio = new Track("audio")
    devices.getDisplayMedia.mockResolvedValue(stream(video, audio))
    open("screen-audio")
    button(".connect").click()
    await ready()
    expect(video.stop).toHaveBeenCalledOnce()
    expect(audio.stop).not.toHaveBeenCalled()
    button(".capture").click()
    expect(Recorder.instances[0].stream.getVideoTracks()).toHaveLength(0)
    button(".stop").click()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(inserted).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledOnce())
    expect(inserted.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(inserted.mock.calls[0][0]).toMatchObject({type: "audio/mp4", size: "final recording".length})
    expect(closed).toHaveBeenCalledOnce()
  })

  it("switches exact devices after releasing the old one and refreshes device labels", async () => {
    const first = new Track("audio", "first")
    const second = new Track("audio", "second")
    devices.enumerateDevices.mockResolvedValue([device("audioinput", "first", "Built-in"), device("audioinput", "second", "USB mic")])
    devices.getUserMedia.mockResolvedValueOnce(stream(first)).mockResolvedValueOnce(stream(second))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    const select = panel!.root.querySelector<HTMLSelectElement>(".microphone select")!
    expect(select.textContent).toContain("USB mic")
    select.value = "second"
    select.dispatchEvent(new Event("change"))
    expect(first.stop).toHaveBeenCalledOnce()
    await ready()
    expect(devices.getUserMedia).toHaveBeenLastCalledWith({video: false, audio: {deviceId: {exact: "second"}}})
    devices.enumerateDevices.mockResolvedValue([device("audioinput", "second", "Renamed mic")])
    devices.dispatchEvent(new Event("devicechange"))
    await vi.waitFor(() => expect(select.textContent).toContain("Renamed mic"))
    expect(select.value).toBe("second")
    button(".cancel").click()
    expect(second.stop).toHaveBeenCalledOnce()
  })

  it("lets camera video use a selected microphone and releases both on permission revocation", async () => {
    const video = new Track("video")
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(video, audio))
    open("camera-video")
    const sound = panel!.root.querySelector<HTMLInputElement>(".sound input")!
    sound.checked = true
    sound.dispatchEvent(new Event("change"))
    button(".connect").click()
    await ready()
    expect(devices.getUserMedia).toHaveBeenCalledWith({video: true, audio: true})
    microphonePermission.change("denied")
    expect(video.stop).toHaveBeenCalledOnce()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(status()).toMatch(/Permission was not granted/)
  })

  it("handles a disconnected preview device and finishes an interrupted recording", async () => {
    const first = new Track("audio")
    const second = new Track("audio")
    devices.getUserMedia.mockResolvedValueOnce(stream(first)).mockResolvedValueOnce(stream(second))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    first.end()
    expect(status()).toMatch(/disconnected/)
    button(".connect").click()
    await ready()
    button(".capture").click()
    second.end()
    expect(second.stop).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledOnce())
  })

  it("stops devices and discards recording chunks on Escape", async () => {
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(audio))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    button(".capture").click()
    panel!.root.querySelector("dialog")!.dispatchEvent(new Event("cancel", {cancelable: true}))
    await Promise.resolve()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(Recorder.instances[0].stop).toHaveBeenCalledOnce()
    expect(inserted).not.toHaveBeenCalled()
  })

  it("releases devices when the recorder fails", async () => {
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(audio))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    button(".capture").click()
    Recorder.instances[0].onerror!()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(status()).toMatch(/Recording failed/)
    await Promise.resolve()
    expect(inserted).not.toHaveBeenCalled()
  })

  it("stops camera capture before image encoding finishes", async () => {
    const video = new Track("video")
    devices.getUserMedia.mockResolvedValue(stream(video))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({drawImage} as unknown as CanvasRenderingContext2D)
    let encode!: BlobCallback
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => { encode = callback })
    open("camera-image")
    button(".connect").click()
    await ready()
    const preview = panel!.root.querySelector("video")!
    Object.defineProperties(preview, {videoWidth: {value: 640}, videoHeight: {value: 480}, readyState: {value: 2}})
    button(".capture").click()
    expect(drawImage).toHaveBeenCalledWith(preview, 0, 0)
    expect(video.stop).toHaveBeenCalledOnce()
    expect(preview.srcObject).toBeNull()
    encode(new Blob(["image"], {type: "image/png"}))
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledOnce())
    expect(inserted.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(inserted.mock.calls[0][0]).toMatchObject({type: "image/png", size: "image".length})
  })

  it("releases devices on page exit and ignores later device events", async () => {
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(audio))
    open("microphone-audio")
    button(".connect").click()
    await ready()
    window.dispatchEvent(new Event("pagehide"))
    expect(audio.stop).toHaveBeenCalledOnce()
    devices.enumerateDevices.mockClear()
    devices.dispatchEvent(new Event("devicechange"))
    expect(devices.enumerateDevices).not.toHaveBeenCalled()
  })
})

describe("screen capture orientation", () => {
  const sourceFrame = () => {
    const preview = panel!.root.querySelector("video")!
    Object.defineProperties(preview, {
      videoWidth: {value: 1640, configurable: true},
      videoHeight: {value: 2360, configurable: true},
      readyState: {value: 4, configurable: true},
    })
    preview.dispatchEvent(new Event("resize"))
    return preview
  }
  const canvasContext = () => {
    const context = {drawImage: vi.fn(), save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn()}
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
    return {context, getContext}
  }

  const iPadScreen = (type: OrientationType = "landscape-primary") => {
    const orientation = Object.assign(new EventTarget(), {type})
    vi.stubGlobal("screen", {orientation})
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15")
    vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(5)
    const video = new Track("video")
    vi.spyOn(video, "getSettings").mockReturnValue(Object.assign({deviceId: ""}, {displaySurface: "monitor"}))
    devices.getDisplayMedia.mockResolvedValue(stream(video))
    return {orientation, video}
  }

  it.each([
    ["portrait-primary", 0, 1640, 2360],
    ["landscape-primary", 270, 2360, 1640],
    ["portrait-secondary", 180, 1640, 2360],
    ["landscape-secondary", 90, 2360, 1640],
  ] as const)("automatically corrects iPad %s previews and PNGs", async (type, rotation, width, height) => {
    iPadScreen(type)
    const {context, getContext} = canvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["pixels"], {type: "image/png"})))
    open("screen-image")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    expect(preview.style.transform).toContain(`rotate(${rotation}deg)`)
    expect(panel!.root.querySelector(".rotation")).not.toHaveAttribute("hidden")
    button(".capture").click()
    const canvas = getContext.mock.instances[0] as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([width, height])
    if(rotation) expect(context.rotate).toHaveBeenCalledWith(rotation * Math.PI / 180)
    else expect(context.rotate).not.toHaveBeenCalled()
    expect(inserted).toHaveBeenCalledOnce()
  })

  it("follows orientation changes during an automatically corrected recording starting upright", async () => {
    const {orientation, video} = iPadScreen("portrait-primary")
    const audio = new Track("audio"), corrected = new Track("video")
    devices.getDisplayMedia.mockResolvedValue(stream(video, audio))
    const output = stream(corrected)
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: () => output, configurable: true})
    const {context, getContext} = canvasContext()
    open("screen-video")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    let frame!: VideoFrameRequestCallback
    Object.defineProperties(preview, {
      requestVideoFrameCallback: {value: (callback: VideoFrameRequestCallback) => { frame = callback; return 1 }},
      cancelVideoFrameCallback: {value: vi.fn()},
    })
    button(".capture").click()
    expect(Recorder.instances[0].stream).toBe(output)
    expect(output.getAudioTracks()).toEqual([audio])
    orientation.type = "portrait-secondary"
    orientation.dispatchEvent(new Event("change"))
    frame(1, {} as VideoFrameCallbackMetadata)
    expect(context.rotate).toHaveBeenLastCalledWith(Math.PI)
    orientation.type = "landscape-primary"
    orientation.dispatchEvent(new Event("change"))
    frame(2, {} as VideoFrameCallbackMetadata)
    expect(preview.style.transform).toContain("rotate(270deg)")
    expect(context.rotate).toHaveBeenLastCalledWith(270 * Math.PI / 180)
    const canvas = getContext.mock.instances[0] as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([2360, 1640])
    button(".stop").click()
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledOnce())
    expect(corrected.stop).toHaveBeenCalledOnce()
    expect(video.stop).toHaveBeenCalledOnce()
    expect(audio.stop).toHaveBeenCalledOnce()
  })

  it("preserves a manual screenshot correction across orientation and frame changes", async () => {
    const {orientation} = iPadScreen()
    const {context, getContext} = canvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["pixels"], {type: "image/png"})))
    open("screen-image")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    expect(preview.style.transform).toContain("rotate(270deg)")
    button(".rotate-left").click()
    expect(preview.style.transform).toContain("rotate(180deg)")
    orientation.type = "portrait-primary"
    orientation.dispatchEvent(new Event("change"))
    preview.dispatchEvent(new Event("resize"))
    expect(preview.style.transform).toContain("rotate(180deg)")
    button(".capture").click()
    expect(context.rotate).toHaveBeenCalledWith(Math.PI)
    const canvas = getContext.mock.instances[0] as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([1640, 2360])
    expect(inserted).toHaveBeenCalledOnce()
  })

  it("allows overriding automatic video correction back to zero degrees", async () => {
    const {orientation, video} = iPadScreen()
    const audio = new Track("audio"), corrected = new Track("video")
    devices.getDisplayMedia.mockResolvedValue(stream(video, audio))
    const output = stream(corrected)
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: () => output, configurable: true})
    const {context} = canvasContext()
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
    open("screen-video")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    Object.defineProperty(preview, "requestVideoFrameCallback", {value: undefined})
    button(".rotate-right").click()
    orientation.type = "portrait-secondary"
    orientation.dispatchEvent(new Event("change"))
    expect(preview.style.transform).toContain("rotate(0deg)")
    button(".capture").click()
    expect(context.rotate).not.toHaveBeenCalled()
    expect(Recorder.instances[0].stream.getAudioTracks()).toEqual([audio])
    button(".stop").click()
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledOnce())
    expect(corrected.stop).toHaveBeenCalledOnce()
  })

  it.each(["desktop", "camera", "landscape-frames", "window-source", "missing-api"] as const)(
    "does not automatically rotate %s", async scenario => {
      const {video} = iPadScreen()
      if(scenario === "desktop") vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(0)
      if(scenario === "missing-api") vi.stubGlobal("screen", {})
      if(scenario === "window-source") vi.spyOn(video, "getSettings").mockReturnValue(Object.assign({deviceId: ""}, {displaySurface: "window"}))
      if(scenario === "camera") devices.getUserMedia.mockResolvedValue(stream(video))
      open(scenario === "camera" ? "camera-image" : "screen-image")
      button(".connect").click()
      await ready()
      const preview = sourceFrame()
      if(scenario === "landscape-frames") {
        Object.defineProperties(preview, {videoWidth: {value: 2360}, videoHeight: {value: 1640}})
        preview.dispatchEvent(new Event("resize"))
      }
      expect(preview.style.transform).toContain("rotate(0deg)")
    },
  )

  it("removes the orientation listener when the capture dialog closes", async () => {
    const {orientation} = iPadScreen()
    open("screen-image")
    button(".connect").click()
    await ready()
    sourceFrame()
    const updatePreview = vi.spyOn(panel! as unknown as {updatePreview: () => void}, "updatePreview")
    orientation.dispatchEvent(new Event("change"))
    expect(updatePreview).toHaveBeenCalledOnce()
    panel!.close()
    updatePreview.mockClear()
    orientation.dispatchEvent(new Event("change"))
    expect(updatePreview).not.toHaveBeenCalled()
  })

  it.each([
    [0, 0, 1640, 2360],
    [1, 270, 2360, 1640],
    [2, 180, 1640, 2360],
    [3, 90, 2360, 1640],
    [4, 0, 1640, 2360],
  ])("applies %i left turns to the preview and saved PNG", async (turns, rotation, width, height) => {
    const track = new Track("video")
    devices.getDisplayMedia.mockResolvedValue(stream(track))
    const {context, getContext} = canvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["pixels"], {type: "image/png"})))
    open("screen-image")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    for(let turn = 0; turn < turns; turn++) button(".rotate-left").click()
    expect(preview.style.transform).toContain(`rotate(${rotation}deg)`)
    expect(panel!.root.querySelector<HTMLElement>(".preview")!.style.getPropertyValue("--aspect")).toBe(String(width / height))
    button(".capture").click()
    const canvas = getContext.mock.instances[0] as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([width, height])
    if(rotation) {
      expect(context.translate).toHaveBeenCalledWith(width / 2, height / 2)
      expect(context.rotate).toHaveBeenCalledWith(rotation * Math.PI / 180)
      expect(context.drawImage).toHaveBeenCalledWith(preview, -820, -1180)
      expect(context.restore).toHaveBeenCalledOnce()
    }
    else expect(context.drawImage).toHaveBeenCalledWith(preview, 0, 0)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({type: "image/png"}))
  })

  it.each(["stop", "cancel", "source-ended", "recorder-error"] as const)(
    "records corrected pixels with source audio and releases everything on %s", async finish => {
      const video = new Track("video"), audio = new Track("audio"), corrected = new Track("video")
      devices.getDisplayMedia.mockResolvedValue(stream(video, audio))
      const output = stream(corrected)
      const captureStream = vi.fn(() => output)
      Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: captureStream, configurable: true})
      const {context} = canvasContext()
      open("screen-video")
      button(".connect").click()
      await ready()
      const preview = sourceFrame()
      let frame!: VideoFrameRequestCallback
      const requestFrame = vi.fn((callback: VideoFrameRequestCallback) => { frame = callback; return 7 })
      const cancelFrame = vi.fn()
      Object.defineProperties(preview, {requestVideoFrameCallback: {value: requestFrame}, cancelVideoFrameCallback: {value: cancelFrame}})
      button(".rotate-left").click()
      button(".capture").click()
      expect(captureStream).toHaveBeenCalledWith(30)
      expect(Recorder.instances[0].stream.getVideoTracks()).toEqual([corrected])
      expect(Recorder.instances[0].stream.getAudioTracks()).toEqual([audio])
      expect(button(".rotate-left")).toBeDisabled()
      expect(button(".rotate-right")).toBeDisabled()
      expect(context.rotate).toHaveBeenLastCalledWith(270 * Math.PI / 180)
      frame(1, {} as VideoFrameCallbackMetadata)
      expect(requestFrame).toHaveBeenCalledTimes(2)
      if(finish === "source-ended") video.end()
      else if(finish === "recorder-error") Recorder.instances[0].onerror!()
      else button(finish === "stop" ? ".stop" : ".cancel").click()
      expect(cancelFrame).toHaveBeenCalledWith(7)
      expect(corrected.stop).toHaveBeenCalledOnce()
      expect(video.stop).toHaveBeenCalledOnce()
      expect(audio.stop).toHaveBeenCalledOnce()
      const frames = requestFrame.mock.calls.length
      frame(2, {} as VideoFrameCallbackMetadata)
      expect(requestFrame).toHaveBeenCalledTimes(frames)
      await Promise.resolve()
      expect(inserted).toHaveBeenCalledTimes(finish === "stop" || finish === "source-ended" ? 1 : 0)
    },
  )

  it("uses and cancels animation frames when video frame callbacks are unavailable", async () => {
    const corrected = new Track("video")
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: () => stream(corrected), configurable: true})
    canvasContext()
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(19)
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame")
    open("screen-video")
    button(".connect").click()
    await ready()
    Object.defineProperty(sourceFrame(), "requestVideoFrameCallback", {value: undefined})
    button(".rotate-right").click()
    button(".capture").click()
    expect(requestFrame).toHaveBeenCalledOnce()
    panel!.close()
    expect(cancelFrame).toHaveBeenCalledWith(19)
    expect(corrected.stop).toHaveBeenCalledOnce()
  })

  it("keeps unrotated recording on the original stream", async () => {
    const input = stream(new Track("video"), new Track("audio"))
    devices.getDisplayMedia.mockResolvedValue(input)
    open("screen-video")
    button(".connect").click()
    await ready()
    button(".capture").click()
    expect(Recorder.instances[0].stream).toBe(input)
  })

  it("ignores a cancelled frame callback after reconnecting and recording again", async () => {
    devices.getDisplayMedia.mockImplementation(async () => stream(new Track("video")))
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: () => stream(new Track("video")), configurable: true})
    const {context} = canvasContext()
    open("screen-video")
    button(".connect").click()
    await ready()
    const preview = sourceFrame()
    const frames: VideoFrameRequestCallback[] = []
    Object.defineProperties(preview, {
      requestVideoFrameCallback: {value: (callback: VideoFrameRequestCallback) => frames.push(callback)},
      cancelVideoFrameCallback: {value: vi.fn()},
    })
    button(".rotate-left").click()
    button(".capture").click()
    Recorder.instances[0].onerror!()
    button(".connect").click()
    await ready()
    button(".capture").click()
    const draws = context.drawImage.mock.calls.length
    const scheduled = frames.length
    frames[0](1, {} as VideoFrameCallbackMetadata)
    expect(context.drawImage).toHaveBeenCalledTimes(draws)
    expect(frames).toHaveLength(scheduled)
  })

  it("cleans up the corrected stream when recorder construction fails", async () => {
    const video = new Track("video"), corrected = new Track("video")
    devices.getDisplayMedia.mockResolvedValue(stream(video))
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {value: () => stream(corrected), configurable: true})
    canvasContext()
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame")
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(29)
    vi.stubGlobal("MediaRecorder", class { constructor() { throw new Error("Encoder unavailable") } })
    open("screen-video")
    button(".connect").click()
    await ready()
    Object.defineProperty(sourceFrame(), "requestVideoFrameCallback", {value: undefined})
    button(".rotate-left").click()
    button(".capture").click()
    expect(status()).toMatch(/Capture failed/)
    expect(cancelFrame).toHaveBeenCalledWith(29)
    expect(video.stop).toHaveBeenCalledOnce()
    expect(corrected.stop).toHaveBeenCalledOnce()
  })
})

describe("media capture in the DOM editor", () => {
  const createEditor = (html = "") => {
    document.body.innerHTML = html
    editor = new DOMEditor()
    if(document.body.firstElementChild) $.move(document.body.firstElementChild)
    return editor
  }
  const captureRoot = () => editor!.appendix.querySelector(".◆media-capture")!.shadowRoot!
  const clickCapture = (selector: string) => captureRoot().querySelector<HTMLButtonElement>(selector)!.click()

  it.each([
    ["picture", "Capture screenshot", "Take photo"],
    ["img", "Capture screenshot", "Take photo"],
    ["audio", "Record screen audio", "Record microphone"],
    ["video", "Record screen", "Record camera"],
    ["iframe", null, null],
  ] as const)("offers matching capture buttons for %s", async (media, screenTitle, recordTitle) => {
    const editor = createEditor()
    editor.features.media.actions.insertMedia({type: "insertMedia", media})
    const root = editor.features.media.placeholder.root
    expect(root.querySelector(".capture-options")).toBeNull()
    for(const [selector, title] of [[".screen", screenTitle], [".record", recordTitle]] as const) {
      const button = root.querySelector<HTMLButtonElement>(selector)!
      expect(button.hidden).toBe(title === null)
      if(title) {
        button.click()
        expect(captureRoot().querySelector("dialog")).toHaveAttribute("open")
        expect(captureRoot().querySelector("h2")?.textContent).toBe(title)
        expect(editor.toHTML(true)).not.toContain("Capture")
        expect(editor.doc.body.toString()).not.toContain("◆media-capture")
        clickCapture(".cancel")
        await vi.waitFor(() => expect(editor.features.media.placeholder.element).toHaveAttribute("data-open"))
      }
    }
  })

  it("preserves irregular authored content and synchronizes captures with undo and redo", async () => {
    const editor = createEditor('<section data-keep="yes"><!--keep--><audio controls><track label="captions"><p>Fallback <custom-widget data-value="7"></custom-widget></p></audio></section>')
    const target = document.querySelector("audio")!
    $.selectElement(target)
    editor.features.selection.processSelection()
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()
    editor.features.media.placeholder.root.querySelector<HTMLButtonElement>(".record")!.click()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    clickCapture(".connect")
    await vi.waitFor(() => expect(captureRoot().querySelector(".capture")).not.toHaveAttribute("hidden"))
    clickCapture(".capture")
    clickCapture(".stop")
    await vi.waitFor(() => expect(target.getAttribute("src")).toMatch(/^blob:/))
    expect(target.querySelector("track")).toHaveAttribute("label", "captions")
    expect(target.querySelector("custom-widget")).toHaveAttribute("data-value", "7")
    expect(editor.toHTML(true)).toContain("<!--keep-->")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain("blob:")
    expect(editor.toHTML(true)).not.toContain("◆")
    editor.doc.undo()
    expect(document.querySelector("audio")).not.toHaveAttribute("src")
    editor.doc.redo()
    expect(document.querySelector("audio")!.getAttribute("src")).toMatch(/^blob:/)
  })

  it("replaces a selected recording and numbers it by its current media position", async () => {
    const editor = createEditor('<audio src="first.mp3"></audio><audio src="old.mp3"><track label="keep"></audio>')
    const target = document.querySelectorAll("audio")[1]
    $.selectElement(target)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.captureSelectedMedia({type: "captureSelectedMedia", mode: "microphone-audio"})).toBe(true)
    clickCapture(".connect")
    await vi.waitFor(() => expect(captureRoot().querySelector(".capture")).not.toHaveAttribute("hidden"))
    clickCapture(".capture")
    clickCapture(".stop")
    await vi.waitFor(() => expect(target.getAttribute("src")).toMatch(/^blob:/))
    expect(document.querySelectorAll("audio")).toHaveLength(2)
    expect(target.querySelector("track")).toHaveAttribute("label", "keep")
    expect(editor.features.media.getState()).toMatchObject({sourceLabel: "Recording 2", sourceKind: "recording"})
  })

  it("closes capture when collaboration fills its placeholder", async () => {
    const editor = createEditor()
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(audio))
    editor.features.media.actions.captureMedia({type: "captureMedia", mode: "microphone-audio"})
    clickCapture(".connect")
    await vi.waitFor(() => expect(captureRoot().querySelector(".capture")).not.toHaveAttribute("hidden"))
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
    const body = sharedDOMBody(remote)
    ;(body.toArray().find(node => node instanceof Y.XmlElement && node.nodeName === "audio") as Y.XmlElement).setAttribute("src", "remote.mp3")
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote")
    expect(document.querySelector("audio")).toHaveAttribute("src", "remote.mp3")
    await vi.waitFor(() => expect(audio.stop).toHaveBeenCalledOnce())
    expect(editor.appendix.querySelector(".◆media-capture")).toBeNull()
    expect(document.querySelector("audio")).toHaveAttribute("src", "remote.mp3")
    remote.destroy()
  })

  it("releases a late permission result after the selected image is concurrently replaced", async () => {
    const editor = createEditor()
    let approve!: (value: MediaStream) => void
    devices.getUserMedia.mockReturnValue(new Promise(resolve => { approve = resolve }))
    editor.features.media.actions.captureMedia({type: "captureMedia", mode: "camera-image"})
    clickCapture(".connect")
    await vi.waitFor(() => expect(devices.getUserMedia).toHaveBeenCalled())
    document.querySelector("picture img")!.replaceWith(document.createElement("img"))
    await vi.waitFor(() => expect(editor.appendix.querySelector(".◆media-capture")).toBeNull())
    const video = new Track("video")
    approve(stream(video))
    await vi.waitFor(() => expect(video.stop).toHaveBeenCalledOnce())
    expect(document.querySelector("img")).not.toHaveAttribute("src")
  })

  it("cleans up active recording when the feature is disabled", async () => {
    const editor = createEditor()
    const audio = new Track("audio")
    devices.getUserMedia.mockResolvedValue(stream(audio))
    editor.features.media.actions.captureMedia({type: "captureMedia", mode: "microphone-audio"})
    clickCapture(".connect")
    await vi.waitFor(() => expect(captureRoot().querySelector(".capture")).not.toHaveAttribute("hidden"))
    clickCapture(".capture")
    editor.features.media.disable()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(editor.appendix.querySelector(".◆media-capture")).toBeNull()
    await Promise.resolve()
    expect(document.querySelector("audio")).not.toHaveAttribute("src")
    expect(document.querySelector("audio")!.className).not.toContain("◆media-empty")
  })

  it("restores the placeholder selection on cancellation without retaining it after destruction", async () => {
    const editor = createEditor()
    editor.features.media.actions.captureMedia({type: "captureMedia", mode: "microphone-audio"})
    const target = document.querySelector("audio")!
    $.selectGap(target)
    clickCapture(".cancel")
    expect($.selectedElement).toBe(target)
    await vi.waitFor(() => expect(editor.features.media.placeholder.element).toHaveAttribute("data-open"))
    editor.features.media.placeholder.root.querySelector<HTMLButtonElement>(".record")!.click()
    editor.destroy()
    expect(target.className).not.toContain("◆")
  })
})
