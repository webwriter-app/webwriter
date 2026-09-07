import {mediaCaptureModes, type MediaCaptureMode} from "../media"
import {adoptStylesheet, createStylesheet} from "../utility"

const stylesheet = createStylesheet(`
  :host { font: 14px/1.4 system-ui, sans-serif; color: #343740; }
  dialog {
    box-sizing: border-box; width: min(30rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem); overflow: auto; padding: 1.1rem;
    border: 1px solid #c7c9ce; border-radius: .5rem; color: inherit;
    background: white; box-shadow: 0 8px 32px #0003;
  }
  dialog::backdrop { background: #0003; }
  h2 { font-size: 1rem; margin: 0 0 .75rem; }
  p { margin: .65rem 0; }
  .devices { display: grid; gap: .65rem; }
  label { display: grid; gap: .25rem; }
  .sound { display: flex; align-items: center; }
  select, button { font: inherit; }
  select { width: 100%; min-width: 0; padding: .4rem; }
  video { display: block; width: 100%; max-height: 40vh; background: #111; margin: .75rem 0; }
  [hidden] { display: none !important; }
  .status { color: #526273; }
  .status.error { color: #a32424; }
  .status.recording { color: #a32424; font-weight: 600; }
  .actions { display: flex; justify-content: flex-end; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
  button { padding: .45rem .75rem; border: 1px solid #aeb7c2; border-radius: .3rem; background: #f5f7fa; color: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .primary { background: #2563eb; border-color: #2563eb; color: white; }
  :focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
`)

type CaptureState = "idle" | "pending" | "ready" | "recording" | "saving" | "error"

const errorMessage = (error: unknown) => {
  const name = error && typeof error === "object" && "name" in error ? error.name : ""
  switch(name) {
    case "NotAllowedError":
    case "SecurityError": return "Permission was not granted. Allow access in your browser or system settings, then try again."
    case "NotFoundError": return "No matching device or screen is available. Connect a device or choose another source."
    case "NotReadableError":
    case "AbortError": return "The source could not be opened. It may be in use or disconnected. Choose another source or try again."
    case "OverconstrainedError": return "The selected device is unavailable. Choose another device and try again."
    case "InvalidStateError": return "Return to this window and choose the source again."
    case "NotSupportedError": return "This browser cannot capture or record this media. Try another browser."
    default: return "Capture failed. Check the device and try again."
  }
}

/** A native capture dialog owned by the media feature and mounted exclusively
 * in the shadow appendix. A generation invalidates every pending API callback:
 * permission requests cannot be aborted, so late streams must still be stopped. */
export class MediaCapture {
  readonly element = document.createElement("div")
  readonly root = this.element.attachShadow({mode: "open"})
  private readonly dialog: HTMLDialogElement
  private readonly preview: HTMLVideoElement
  private readonly camera: HTMLSelectElement
  private readonly microphone: HTMLSelectElement
  private readonly sound: HTMLInputElement
  private readonly status: HTMLParagraphElement
  private readonly connect: HTMLButtonElement
  private readonly capture: HTMLButtonElement
  private readonly stop: HTMLButtonElement
  private readonly events = new AbortController()
  private readonly permissions = new Map<string, PermissionStatus>()
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private reader: FileReader | null = null
  private state: CaptureState = "idle"
  private generation = 0
  private devicesGeneration = 0
  private closed = false
  private timer: ReturnType<typeof setInterval> | null = null
  private trackListeners = new Map<MediaStreamTrack, () => void>()

  constructor(
    readonly mode: MediaCaptureMode,
    private readonly onSource: (source: string) => boolean,
    private readonly onClose: () => void,
  ) {
    this.element.classList.add("◆", "◆editor-only", "◆media-capture")
    this.element.contentEditable = "false"
    adoptStylesheet(this.root, stylesheet)
    this.root.innerHTML = `
      <dialog aria-labelledby="title" aria-describedby="status">
        <h2 id="title"></h2>
        <div class="devices">
          <label class="camera">Camera<select aria-label="Camera"><option value="">Default camera</option></select></label>
          <label class="sound"><input type="checkbox">Include audio</label>
          <label class="microphone">Microphone<select aria-label="Microphone"><option value="">Default microphone</option></select></label>
        </div>
        <video muted autoplay playsinline hidden></video>
        <p id="status" class="status" role="status" aria-live="polite"></p>
        <div class="actions">
          <button class="cancel" type="button">Cancel</button>
          <button class="connect" type="button"></button>
          <button class="capture primary" type="button" hidden></button>
          <button class="stop primary" type="button" hidden>Stop and insert</button>
        </div>
      </dialog>
    `
    this.dialog = this.root.querySelector("dialog")!
    this.preview = this.root.querySelector("video")!
    this.preview.muted = true
    this.camera = this.root.querySelector(".camera select")!
    this.microphone = this.root.querySelector(".microphone select")!
    this.sound = this.root.querySelector(".sound input")!
    this.status = this.root.querySelector(".status")!
    this.connect = this.root.querySelector(".connect")!
    this.capture = this.root.querySelector(".capture")!
    this.stop = this.root.querySelector(".stop")!
    this.root.querySelector("h2")!.textContent = mediaCaptureModes[mode].label
    this.sound.checked = mode === "screen-video"
    this.root.querySelector<HTMLElement>(".camera")!.hidden = !mode.startsWith("camera-")
    this.root.querySelector<HTMLElement>(".sound")!.hidden = this.media !== "video"
    this.capture.textContent = this.media === "picture" ? "Capture and insert" : "Start recording"
    this.root.querySelector(".cancel")!.addEventListener("click", () => this.close())
    this.dialog.addEventListener("cancel", event => { event.preventDefault(); this.close() })
    this.dialog.addEventListener("close", () => this.close())
    this.connect.addEventListener("click", () => void this.start())
    this.capture.addEventListener("click", () => this.media === "picture" ? this.takePhoto() : this.record())
    this.stop.addEventListener("click", () => this.finishRecording())
    this.camera.addEventListener("change", () => void this.start())
    this.microphone.addEventListener("change", () => void this.start())
    this.sound.addEventListener("change", () => {
      this.reset()
      this.setState("idle", "Choose a source to continue.")
      void this.checkPermissions()
    })
    this.preview.addEventListener("error", () => {
      if(this.stream) this.fail("The preview could not be played. Choose another source or try again.")
    })
    navigator.mediaDevices?.addEventListener("devicechange", () => void this.updateDevices(), {signal: this.events.signal})
    window.addEventListener("pagehide", () => this.close(), {signal: this.events.signal})
    this.setState("idle", this.screen
      ? this.media === "audio" ? "Choose a tab or screen and enable sharing audio in the browser picker." : "Choose the screen, window, or tab to share."
      : "Choose a device, then allow access when your browser asks.")
    void this.checkPermissions()
    void this.updateDevices()
  }

  private get screen() { return this.mode.startsWith("screen-") }
  private get media() { return mediaCaptureModes[this.mode].media }
  private get needsMicrophone() { return !this.screen && (this.media === "audio" || this.media === "video" && this.sound.checked) }

  show() {
    if(this.closed) return
    this.dialog.showModal()
    this.connect.focus()
  }

  close() {
    if(this.closed) return
    this.closed = true
    this.reset()
    this.events.abort()
    if(this.dialog.open) this.dialog.close()
    this.element.remove()
    this.onClose()
  }

  private setState(state: CaptureState, message: string) {
    this.state = state
    this.status.textContent = message
    this.status.className = `status ${state}`
    const busy = state === "pending" || state === "recording" || state === "saving"
    this.camera.disabled = this.microphone.disabled = this.sound.disabled = busy
    this.root.querySelector<HTMLElement>(".microphone")!.hidden = !this.needsMicrophone
    this.connect.disabled = busy
    this.connect.hidden = state === "recording" || state === "saving"
    this.connect.textContent = this.screen ? "Choose screen" : state === "ready" ? "Reconnect" : "Enable device"
    this.capture.hidden = state !== "ready"
    this.stop.hidden = state !== "recording"
    this.dialog.setAttribute("aria-busy", String(state === "pending" || state === "saving"))
  }

  private async checkPermissions() {
    if(this.screen || !navigator.permissions?.query) return
    const names = this.mode === "camera-video" ? ["camera", "microphone"] : this.mode === "camera-image" ? ["camera"] : ["microphone"]
    await Promise.all(names.map(async name => {
      try {
        if(this.permissions.has(name)) return
        const permission = await navigator.permissions.query({name: name as PermissionName})
        if(this.closed) return
        this.permissions.set(name, permission)
        permission.addEventListener("change", () => this.permissionChanged(), {signal: this.events.signal})
      }
      catch { /* Permission descriptors are not supported in every browser. */ }
    }))
    this.permissionChanged()
  }

  private permissionChanged() {
    if(this.closed) return
    const denied = this.mode.startsWith("camera-") && this.permissions.get("camera")?.state === "denied"
      || this.needsMicrophone && this.permissions.get("microphone")?.state === "denied"
    if(denied) this.fail(errorMessage({name: "NotAllowedError"}))
    else if(this.state === "error") this.setState("idle", "Choose a source to try again.")
  }

  private async updateDevices() {
    if(this.screen || !navigator.mediaDevices?.enumerateDevices) return
    const generation = ++this.devicesGeneration
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      if(this.closed || generation !== this.devicesGeneration) return
      for(const [select, kind, noun] of [[this.camera, "videoinput", "camera"], [this.microphone, "audioinput", "microphone"]] as const) {
        const previous = select.value
        const inputs = devices.filter(device => device.kind === kind && device.deviceId)
        const options = [{label: `Default ${noun}`, deviceId: ""}, ...inputs]
        select.replaceChildren(...options.map((device, index) => Object.assign(document.createElement("option"), {
          textContent: device.label || `${noun === "camera" ? "Camera" : "Microphone"} ${index}`,
          value: device.deviceId,
        })))
        select.value = inputs.some(device => device.deviceId === previous) ? previous : ""
      }
      // Enumeration may be redacted before permission is granted. Only check
      // active device IDs against a nonempty list for that kind.
      const disconnected = this.stream?.getTracks().some(track => {
        const id = track.getSettings().deviceId
        const kind = track.kind === "video" ? "videoinput" : "audioinput"
        const inputs = devices.filter(device => device.kind === kind && device.deviceId)
        return id && inputs.length && !inputs.some(device => device.deviceId === id)
      })
      if(disconnected) this.sourceEnded()
    }
    catch { /* Default devices remain usable when enumeration is unavailable. */ }
  }

  private async start() {
    if(this.closed || this.state === "recording" || this.state === "saving" || this.state === "pending") return
    this.reset()
    const generation = this.generation
    this.setState("pending", this.screen ? "Waiting for you to choose a screen and approve sharing…" : "Waiting for permission to use the device…")
    try {
      if(!navigator.mediaDevices || this.screen && !navigator.mediaDevices.getDisplayMedia
        || !this.screen && !navigator.mediaDevices.getUserMedia
        || this.media !== "picture" && typeof MediaRecorder === "undefined") {
        throw new DOMException("Unavailable", "NotSupportedError")
      }
      let stream: MediaStream
      if(this.screen) {
        // Keep getDisplayMedia in this click's activation; never await a
        // permission query before opening the browser's screen picker.
        stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: this.media === "audio" || this.media === "video" && this.sound.checked})
      }
      else {
        await this.checkPermissions()
        if(this.closed || generation !== this.generation) return
        const constraint = (select: HTMLSelectElement) => select.value ? {deviceId: {exact: select.value}} : true
        stream = await navigator.mediaDevices.getUserMedia({
          video: this.mode.startsWith("camera-") ? constraint(this.camera) : false,
          audio: this.needsMicrophone ? constraint(this.microphone) : false,
        })
      }
      if(this.closed || generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      this.stream = stream
      const required = this.media === "audio" ? stream.getAudioTracks() : stream.getVideoTracks()
      if(!required.some(track => track.readyState === "live")) {
        this.fail(this.screen && this.media === "audio"
          ? "No audio was shared. Choose a source with audio and enable sharing audio in the browser picker."
          : "The source is no longer available. Choose another source.")
        return
      }
      if(this.media === "audio") stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track) })
      for(const track of stream.getTracks()) {
        const ended = () => this.sourceEnded()
        this.trackListeners.set(track, ended)
        track.addEventListener("ended", ended)
      }
      void this.updateDevices()
      if(this.media !== "audio") {
        this.preview.hidden = false
        this.preview.srcObject = stream
        await this.preview.play()
        if(this.closed || generation !== this.generation) return
      }
      this.setState("ready", this.screen && this.media === "video" && this.sound.checked && !stream.getAudioTracks().length
        ? "Ready. This source has no shared audio; the recording will be silent."
        : this.media === "picture" ? "Ready. Capture the image when you are happy with the preview." : "Ready. Start recording when you are ready.")
    }
    catch(error) {
      if(!this.closed && generation === this.generation) this.fail(errorMessage(error))
    }
  }

  private takePhoto() {
    if(this.closed || this.state !== "ready" || !this.stream) return
    const generation = this.generation
    try {
      if(!this.preview.videoWidth || !this.preview.videoHeight || this.preview.readyState < 2) {
        this.fail("No image is available from this source yet. Reconnect and try again.")
        return
      }
      const canvas = document.createElement("canvas")
      canvas.width = this.preview.videoWidth
      canvas.height = this.preview.videoHeight
      const context = canvas.getContext("2d")
      if(!context) throw new Error("Canvas unavailable")
      context.drawImage(this.preview, 0, 0)
      this.releaseStream()
      this.setState("saving", "Inserting image…")
      canvas.toBlob(blob => {
        if(this.closed || generation !== this.generation) return
        if(blob) this.save(blob, generation)
        else this.fail("The image could not be captured. Try again.")
      }, "image/png")
    }
    catch(error) { this.fail(errorMessage(error)) }
  }

  private record() {
    if(this.closed || this.state !== "ready" || !this.stream) return
    const generation = this.generation
    try {
      const recorder = new MediaRecorder(this.stream)
      this.recorder = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data) }
      recorder.onerror = () => {
        if(!this.closed && generation === this.generation) this.fail("Recording failed. Check the source and try again.")
      }
      recorder.onstop = () => {
        if(this.closed || generation !== this.generation) return
        this.releaseStream()
        this.clearTimer()
        this.recorder = null
        this.setState("saving", "Inserting recording…")
        // The browser chooses a supported container and codec. Preserve the
        // actual MIME type instead of assuming WebM is available everywhere.
        this.save(new Blob(chunks, {type: recorder.mimeType || chunks[0]?.type}), generation)
      }
      recorder.start(1000)
      const started = Date.now()
      const tick = () => {
        const seconds = Math.floor((Date.now() - started) / 1000)
        this.setState("recording", `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`)
      }
      tick()
      this.timer = setInterval(tick, 1000)
    }
    catch(error) { this.fail(errorMessage(error)) }
  }

  private finishRecording() {
    if(!this.recorder || this.state !== "recording") return
    this.clearTimer()
    this.setState("saving", "Finishing recording…")
    try { if(this.recorder.state !== "inactive") this.recorder.stop() }
    catch(error) { this.fail(errorMessage(error)) }
    finally { this.releaseStream() }
  }

  private sourceEnded() {
    if(this.state === "recording") this.finishRecording()
    else if(this.state !== "saving") this.fail("The source stopped or disconnected. Choose another source to continue.")
  }

  private save(blob: Blob, generation: number) {
    if(!blob.size) { this.fail("Nothing was captured. Try recording again."); return }
    const reader = new FileReader()
    this.reader = reader
    reader.onload = () => {
      if(this.closed || generation !== this.generation) return
      this.reader = null
      if(typeof reader.result !== "string") { this.fail("The capture could not be read. Try again."); return }
      try {
        if(this.onSource(reader.result)) this.close()
        else this.fail("The media was changed or removed while capturing. Close this panel and select it again.")
      }
      catch { this.fail("The capture could not be inserted. Close this panel and try again.") }
    }
    reader.onerror = () => {
      if(!this.closed && generation === this.generation) this.fail("The capture could not be read. Try again.")
    }
    try { reader.readAsDataURL(blob) }
    catch { this.fail("The capture could not be read. Try again.") }
  }

  private clearTimer() {
    if(this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  private releaseStream() {
    this.trackListeners.forEach((listener, track) => track.removeEventListener("ended", listener))
    this.trackListeners.clear()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.preview.pause()
    this.preview.srcObject = null
    this.preview.hidden = true
  }

  private reset() {
    this.generation++
    this.clearTimer()
    if(this.recorder) {
      this.recorder.ondataavailable = this.recorder.onstop = this.recorder.onerror = null
      try { if(this.recorder.state !== "inactive") this.recorder.stop() }
      catch { /* Release tracks even if the recorder has already failed. */ }
      this.recorder = null
    }
    if(this.reader?.readyState === 1) this.reader.abort()
    this.reader = null
    this.releaseStream()
  }

  private fail(message: string) {
    this.reset()
    this.setState("error", message)
  }
}
