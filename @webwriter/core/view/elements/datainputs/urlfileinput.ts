import { html, css, CSSResultArray, CSSResult } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { SlInput } from "@shoelace-style/shoelace"

import { DataInput } from "./datainput"

@localized()
@customElement("ww-urlfileinput")
export class URLFileInput extends SlInput implements DataInput {

  static mediaRecordIcons = {
    "image": "camera",
    "audio": "microphone",
    "video": "video"
  }

  static mediaCaptureIcons = {
    "image": "screenshot",
    "audio": "device-laptop",
    "video": "screenshot"
  }

  static stream: MediaStream

  constructor() {
    super()
    this.addEventListener("paste", this.handlePaste)
    this.addEventListener("drop", this.handleDrop)
    this.addEventListener("dragover", (e: DragEvent) => {
      if(e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy"
        e.preventDefault()
        e.stopPropagation()
      }
    })
    this.addEventListener("blur", () => this.checkValidity())
    window.addEventListener("dragenter", () => this.dragOverWindow = true)
    window.addEventListener("dragleave", () => this.dragOverWindow = false)
    window.addEventListener("drop", () => this.dragOverWindow = false)
  }

  handlePaste = (e: ClipboardEvent) => {
    e.clipboardData && this.setValueWithFileList(e.clipboardData)
  }
  
  handleDrop = (e: DragEvent) => {
    e.dataTransfer && this.setValueWithFileList(e.dataTransfer)
    e.preventDefault()
    this.dragOverWindow = false
  }

  get linkLabel() {
    if(this.value.startsWith("blob:") || this.value.startsWith("data:")) {
      return msg("Local File")
    }
    else {
      return msg("External File")
    }
  }

  @property({type: Boolean, attribute: true, reflect: true})
  linkOnly = false
    
  @property({type: Boolean, attribute: true, reflect: true})
  dragOverWindow: boolean = false
  
  @property({attribute: true})
  value: string

  @property({attribute: false})
  defaultValue: string

  @query("input")
  input: HTMLInputElement

  @query("slot:not([name])")
  slotElement: HTMLSlotElement

  @property({type: String, attribute: true})
  autocomplete: SlInput["autocomplete"] = "off"

  @property({type: String, attribute: true})
  autocorrect: SlInput["autocorrect"] = "off"

  @property({type: String})
  placeholder: string

  @property({type: String, attribute: "help-text"})
  helpText: string

  @property({type: String, attribute: true, reflect: true})
  mediaType: "image" | "audio" | "video"

  @property({type: Boolean, attribute: true, reflect: true})
  record = false

  @property({type: Boolean, attribute: true, reflect: true})
  capture = false

  get isBlob() {
    return this.value.startsWith("blob:")
  }

  get validity() {
    return this.input.validity
  }

  get validationMessage() {
    return this.input.validationMessage
  }

  setCustomValidity(message: string) {
    this.input.setCustomValidity(message)
  }

  checkValidity() {
    const valid = this.input.checkValidity()
    this.toggleAttribute("data-invalid", !valid)
    return valid
  }

  reportValidity() {
    return this.input.reportValidity()
  }

  focus() {
    this.input?.focus()
  }

  getForm() {
    return this.input.form
  }

  static styles: CSSResult | CSSResultArray = [SlInput.styles, css`
    * {
      font-family: var(--sl-font-sans);
    }

    :host {
      display: flex;
      flex-direction: column;
    }

    [part=base] {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      position: relative;
      border: solid var(--sl-input-border-width) var(--sl-input-border-color);
      border-radius: var(--sl-input-border-radius-medium);
      max-width: 100%;
      min-height: var(--sl-input-height-medium);
      cursor: text;
      padding: 0 var(--sl-input-spacing-medium);
      background: white;
    }

    :host([dragOverWindow]) [part=base] {
      background: var(--sl-color-primary-50);
      border: 1px solid var(--sl-color-primary-400);
    }

    :host([filled]) [part=base] {
      background: var(--sl-input-filled-background-color);
    }

    :host([disabled]) [part=base] {
      background: none;
    }

    :host(:hover) [part=base] {
      border-color: var(--sl-color-gray-400);
    }

    input {
      flex-grow: 1;
      display: inline-flex;
      border: none;
      outline: none;
      background: transparent;
    }

    :host([open]) {
      z-index: 100;
    }

    sl-menu {
      display: block;
      font-family: var(--sl-font-sans);
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      box-shadow: var(--sl-shadow-large);
      background: var(--sl-panel-background-color);
      border: solid var(--sl-panel-border-width) var(--sl-panel-border-color);
      border-radius: var(--sl-border-radius-medium);
      padding-block: var(--sl-spacing-x-small);
      padding-inline: 0;
      overflow: auto;
      overscroll-behavior: none;
    }

    [part=suffix] {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      max-width: 50%;
      flex-grow: 0;
    }

    [part=label]::slotted(*), label {
      align-self: flex-start;
      margin-bottom: var(--sl-spacing-3x-small);
    }

    :host([required]) [part=label]::after {
      content: "*";
      margin-left: 0.25ch;
    }

    :host(:not([help-text])) #help-text {
      display: none;
    }

    #help-text {
      font-size: var(--sl-input-help-text-font-size-medium);
      color: var(--sl-input-help-text-color);
      margin-top: var(--sl-spacing-3x-small);
    }

    slot[name=prefix]::slotted(:last-child) {
      margin-right: 1ch;
    }

    a[data-empty] {
      display: none;
    }

    :host([data-invalid]) input {
      color: var(--sl-color-danger-600);
      caret-color: black;
    }

    :host([linkOnly]) #pick-file {
      display: none;
    }

    :host([size=small]) [part=base] {
      min-height: var(--sl-input-height-small);
      padding: 0 var(--sl-input-spacing-small);
    }

    :host([size=small]) [part=label] {
      font-size: var(--sl-font-size-x-small);
    }

    :host([size=small]) ww-button::part(icon) {
      width: 16px;
      height: 16px;
    }

    :host(:not([record]):not([capture])) aside {
      display: none;
    }

    aside {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      gap: 2px;
      margin-top: 2px;
      & > * {
        flex-grow: 1;
      }

      & .streaming-indicator {
        background: var(--sl-color-red-600);
        border-radius: 100%;
        position: absolute;
        right: 4px;
        top: 4px;
        width: 8px;
        height: 8px;
      }
    }
  `]

  handleInputKeydown(e: KeyboardEvent) {
    this.toggleAttribute("data-invalid", false)
    if(e.key === "Enter") {
      this.handleInputChange()
      this.reportValidity()
    }
    else if(e.key === "Backspace" && this.input.value?.length === 0 && this.value) {
      this.value = ""
      this.handleInputChange()
    }
    if(this.value) {
      e.preventDefault()
    }
  }

  dispatchChange() {
    this.dispatchEvent(new CustomEvent("sl-change", {composed: true, bubbles: true}))
  }

  handleInputChange() {
    const valid = this.checkValidity()
    if(valid) {
      this.value = this.input.value
      this.input.value = ""
    }
    this.dispatchChange()
  }

  openFileDialog() {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", e => this.setValueWithFileList(input))
    input.click()
  }

  setValueWithFileList({files}: {files: FileList | null}) {
    if((files?.length ?? 0) > 0) {
      const file = files!.item(0)!
      URL.revokeObjectURL(this.value)
      this.value = URL.createObjectURL(file)
      this.dispatchChange()
    }
  }


  get inputSize() {
    return this.value? 1: this.placeholder.length
  }

  get defaultPlaceholder() {
    return msg("Enter link") + " " + (this.linkOnly? "": msg("or paste/drop/pick file"))
  }

  recorder?: MediaRecorder
  chunks = [] as Blob[]

  @property({type: String, attribute: false, state: true})
  streamingStatus: "idle" | "loading" | "recording" | "capturing" = "idle"
  
  handleRecordingClick = (e: Event) => {
    if(this.streamingStatus === "idle") {
      this.startStream()
    }
    else if(this.streamingStatus === "loading") {
      return
    }
    else {
      this.stopStream()
    }
  }
  
  handleCapturingClick = (e: Event) => {
    if(this.streamingStatus === "idle") {
      this.startStream(true)
    }
    else if(this.streamingStatus === "loading") {
      return
    }
    else {
      this.stopStream()
    }
  }

  static mediaRecordingTypes = {
    "image": "video/mp4",
    "audio": "video/mp4",
    "video": "video/mp4",
  }

  async startStream(capture=false) {
    if(this.recorder) {
      return
    }
    this.streamingStatus = "loading"
    const constraints = {
      video: this.mediaType === "video" || this.mediaType === "image" || this.mediaType === "audio" && capture,
      audio: this.mediaType === "video" || this.mediaType === "audio"
    }
    const options = {
      mimeType: "video/webm"
    }
    try {
      const stream = await (capture? navigator.mediaDevices.getDisplayMedia(constraints): navigator.mediaDevices.getUserMedia(constraints))
      if(this.mediaType === "image" && "ImageCapture" in window && !capture) {
        this.streamingStatus = capture? "capturing": "recording"
        const imgcap = new (window as any).ImageCapture(stream.getVideoTracks()[0])
        const blob = await imgcap.takePhoto()
        URL.revokeObjectURL(this.value)
        this.value = URL.createObjectURL(blob)
        this.dispatchChange()
        stream?.getTracks().forEach(track => stream.removeTrack(track))
        this.streamingStatus = "idle"
      }
      else {
        this.recorder = new MediaRecorder(stream, options)
        this.recorder.addEventListener("stop", () => {
          let value: string
          clearInterval(this.recordingInterval)
          this.recordingDuration = 0
          if(this.mediaType === "image") {
            const video = document.createElement("video")
            video.srcObject = this.recorder!.stream
            video.currentTime = 1
            const canvas = document.createElement("canvas")
            canvas.width = 640
            canvas.height = 480
            canvas.getContext("2d")?.drawImage(video, canvas.width, canvas.height)
            value = canvas.toDataURL()
            video.remove()
            canvas.remove()
          }
          else {
            const blob = new Blob(this.chunks, {type: options.mimeType})
            value = URL.createObjectURL(blob)
          }
          this.chunks = []
          const stream = this.recorder?.stream
          stream?.getTracks().forEach(track => stream.removeTrack(track))
          URL.revokeObjectURL(this.value)
          this.value = value
          delete this.recorder
          this.dispatchChange()
          this.streamingStatus = "idle"
        })
        this.recorder.addEventListener("dataavailable", e => {
          this.chunks.push(e.data)
        })
        this.recorder.addEventListener("error", e => {
          console.error("Error recording")
        })
        let maxDuration = 0
        if(this.mediaType === "audio") {
          maxDuration = 1000 * 60 * 10
        }
        else if(this.mediaType === "video") {
          maxDuration = 1000 * 60 * 1
        }
        this.recorder.start()
        setInterval(() => this.recordingDuration += 1000, 1000)
        if(maxDuration) {
          setTimeout(() => this.stopStream(), maxDuration)
        }
        this.streamingStatus = capture? "capturing": "recording"
      }
    }
    catch(err: any) {
      this.streamingStatus = "idle"
      if(err.message !== "Permission denied") {
        console.error(err)
      }
    }
  }
  async stopStream() {
    this.recorder?.stop()
  }

  async getValueAsText() {
    return !this.value? undefined: await (await fetch(this.value)).text()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopStream()
  }

  recordingInterval: number

  @property({type: Number, attribute: false, state: true})
  recordingDuration: number = 0

  render() {
    const input = html`
      <input
        type="url"
        size=${this.inputSize}
        placeholder=${!this.value? this.placeholder || this.defaultPlaceholder: ""}
        ?disabled=${this.disabled}
        @change=${this.handleInputChange}
        @keydown=${this.handleInputKeydown}
        autocomplete=${this.autocomplete as any}
        autocorrect=${this.autocorrect as any}
      >
    `
    return html`
      <slot name="label" part="label" @click=${this.focus}>
        ${this.label? html`<label>${this.label}</label>`: null} 
      </slot>
      <div part="base" id="anchor" @click=${this.focus}>
        <slot name="prefix"></slot>
        <a href=${this.value} ?data-empty=${!this.value} target="_blank">${this.linkLabel}</a>
        ${input}
        <div part="suffix">
          <slot name="suffix"></slot>
          <ww-button id="pick-file" variant="icon" icon="folder-open" @click=${this.openFileDialog}></ww-button>
        </div>
      </div>
      <aside>
        ${this.mediaType === "image" && !("ImageCapture" in window)? null: html`
          <ww-button
            class="record-button"
            ?disabled=${this.streamingStatus === "loading" || this.streamingStatus === "capturing"}
            @click=${this.handleRecordingClick}
            size="small"
            icon=${this.streamingStatus === "recording"? "player-stop-filled": (URLFileInput.mediaRecordIcons as any)[this.mediaType]}>
            ${this.streamingStatus === "recording"? html`
              <sl-format-date .date=${new Date(this.recordingDuration)} minute="2-digit" second="2-digit"></sl-format-date>
              <div class="streaming-indicator"></div>
            `: msg("Record")}
          </ww-button>
        `}
        ${this.mediaType === "image"? null: html`
          <ww-button
            class="capture-button"
            @click=${this.handleCapturingClick}
            ?disabled=${this.streamingStatus === "loading" || this.streamingStatus === "recording"}
            size="small"
            icon=${this.streamingStatus === "capturing"? "player-stop-filled": (URLFileInput.mediaCaptureIcons as any)[this.mediaType]}>
            ${this.streamingStatus === "capturing"? html`
              <sl-format-date .date=${new Date(this.recordingDuration)} minute="2-digit" second="2-digit"></sl-format-date>
              <div class="streaming-indicator"></div>
            `: msg("Capture")}
          </ww-button>
        `}
      </aside>
      <div id="help-text">${this.helpText}</div>
    `
  }
}