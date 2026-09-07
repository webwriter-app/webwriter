// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {MediaCapture} from "../components/media-capture"
import {DOMEditor} from "../domeditor"
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
const inserted = vi.fn(() => true)
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
  vi.unstubAllGlobals()
})

describe("native media capture lifecycle", () => {
  it("does not open a device before the user requests it and waits for approval", async () => {
    let approve!: (value: MediaStream) => void
    devices.getUserMedia.mockReturnValue(new Promise(resolve => { approve = resolve }))
    open("microphone-audio")
    expect(devices.getUserMedia).not.toHaveBeenCalled()
    button(".connect").click()
    await vi.waitFor(() => expect(devices.getUserMedia).toHaveBeenCalledTimes(1))
    expect(status()).toMatch(/Waiting for permission/)
    expect(button(".capture")).toHaveAttribute("hidden")
    expect(button(".connect")).toBeDisabled()
    approve(stream(new Track("audio")))
    await ready()
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

  it("respects denied permission and retries after it changes", async () => {
    microphonePermission.state = "denied"
    open("microphone-audio")
    await vi.waitFor(() => expect(status()).toMatch(/Permission was not granted/))
    button(".connect").click()
    await Promise.resolve()
    expect(devices.getUserMedia).not.toHaveBeenCalled()
    microphonePermission.change("granted")
    button(".connect").click()
    await ready()
    expect(devices.getUserMedia).toHaveBeenCalledOnce()
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
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledWith(`data:audio/mp4;base64,${btoa("final recording")}`))
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
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledWith(`data:image/png;base64,${btoa("image")}`))
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
    await vi.waitFor(() => expect(target.getAttribute("src")).toMatch(/^data:audio\/mp4;base64,/))
    expect(target.querySelector("track")).toHaveAttribute("label", "captions")
    expect(target.querySelector("custom-widget")).toHaveAttribute("data-value", "7")
    expect(editor.toHTML(true)).toContain("<!--keep-->")
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain("data:audio/mp4;base64,")
    expect(editor.toHTML(true)).not.toContain("◆")
    editor.doc.undo()
    expect(document.querySelector("audio")).not.toHaveAttribute("src")
    editor.doc.redo()
    expect(document.querySelector("audio")!.getAttribute("src")).toMatch(/^data:audio\/mp4;base64,/)
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
    const body = remote.getXmlElement("body")
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
