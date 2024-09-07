import {html, css, PropertyValueMap} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import IconMic from "bootstrap-icons/icons/mic.svg"
import IconMicFill from "bootstrap-icons/icons/mic-fill.svg"
import IconStopFill from "bootstrap-icons/icons/stop-fill.svg"
import IconTrash from "bootstrap-icons/icons/trash.svg"
import IconPlay from "bootstrap-icons/icons/play.svg"
import IconPause from "bootstrap-icons/icons/pause.svg"
import IconVolumeDown from "bootstrap-icons/icons/volume-down.svg"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlRange from "@shoelace-style/shoelace/dist/components/range/range.component.js"
import SlButtonGroup from "@shoelace-style/shoelace/dist/components/button-group/button-group.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import SlFormatDate from "@shoelace-style/shoelace/dist/components/format-date/format-date.component.js"
import SlPopup from "@shoelace-style/shoelace/dist/components/popup/popup.component.js"

declare global {interface HTMLElementTagNameMap {
  "webwriter-speech": WebwriterSpeech;
}}

@customElement("webwriter-speech")
export class WebwriterSpeech extends LitElementWw {

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon,
    "sl-button-group": SlButtonGroup,
    "sl-range": SlRange,
    "sl-format-date": SlFormatDate,
    "sl-popup": SlPopup
  }
  
  static styles = css`

    @keyframes blinker {
      50% {
        opacity: 0;
      }
    }

    sl-icon {
      height: 20px;
      width: 20px;
    }

    sl-button-group {
      width: 100%;
    }

    #record {
      position: relative;
      #recording-indicator {
        background: darkred;
        border-radius: 100%;
        height: 10px;
        width: 10px;
        position: absolute;
        top: 5px;
        right: 5px;
        animation: blinker 1.25s linear infinite;
      }
    }

    #record:hover .idle {
      display: none;
    }

    :host([recording]) #record .torecord, :host(:not([recording])) #record:not(:hover) .torecord {
      display: none;
    }

    :host(:not([recording])) #record .tostop, :host([recording]) #record:not(:hover) .tostop {
      display: none;
    }

    :host(:not([recording])) #recording-indicator {
      display: none;
    }

    #playback {
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      border-top: 1px solid var(--sl-color-gray-300);
      border-bottom: 1px solid var(--sl-color-gray-300);
      padding: 0 1ch;
      gap: 1ch;
      color: var(--sl-color-gray-800);
      font-size: var(--sl-font-size-small);
      user-select: none;

      sl-range {
        flex-grow: 1;
        display: flex;
        flex-direction: row;
        align-items: center;   
        
        &::part(form-control) {
          width: 100%;
        }
      }
    }

    :host(:not([src])) #playback {
      opacity: 0.5;
    }

    sl-button {
      &::part(label) {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1ch;
      }
    }

    sl-tooltip {
      z-index: 1;
    }

    #volume {
      --arrow-color: var(--sl-color-gray-600);
      &::part(popup) {
        background: var(--arrow-color);
        height: 30px;
        padding: 1ch;
      }
    }
  `

  mediaRecorder: MediaRecorder
  chunks = [] as Blob[]

  @property({type: Boolean, attribute: true})
  accessor loading = false

  @property({type: String, attribute: true, reflect: true})
  accessor src: string

  firstUpdated() {
    const evs = ["abort", "canplay", "canplaythrough", "durationchange", "emptied", "ended", "error", "loadeddata", "loadedmetadata", "loadstart", "pause", "play", "playing", "progress", "ratechange", "resize", "seeked", "seeking", "stalled", "suspend", "timeupdate", "volumechange", "waiting"] as const
    evs.forEach(k => this.audioEl.addEventListener(k, ()=>this.requestUpdate()))
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.initializeRecorder()
  }

  async initializeRecorder() {
    if(!this.mediaRecorder) {
      this.loading = true
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true})
        this.mediaRecorder = new MediaRecorder(stream)
        this.mediaRecorder.addEventListener("start", e => {
          this.requestUpdate("recording")
        })
        this.mediaRecorder.addEventListener("dataavailable", e => {
          this.chunks.push(e.data)
        })
        this.mediaRecorder.addEventListener("stop", async e => {
          const blob = new Blob(this.chunks, {type: "audio/ogg; codecs=opus"})
          this.chunks = []
          this.src = URL.createObjectURL(blob)
          const reader = new FileReader()
          reader.readAsDataURL(blob)
          reader.addEventListener("load", e => {
            this.src = reader.result as string
            this.requestUpdate("recording")
          })
        })
      }
      finally {
        this.loading = false
      }
    }
  }

  toggleRecording = async () => {
    if(this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop()
    }
    else {
      await this.initializeRecorder()
      this.mediaRecorder.start()
    }
  }

  @query("audio")
  accessor audioEl: HTMLAudioElement

  get duration() {
    const d = this.audioEl?.duration
    return !Number.isNaN(d) && Number.isFinite(d)? d: 0
  }

  get currentTime() {
    return this.audioEl?.currentTime
  }

  get playing() {
    return !this.audioEl?.paused && !this.audioEl?.ended
  }

  
  get recording() {
    return this.mediaRecorder?.state === "recording"
  }

  @property({type: Boolean, attribute: true, reflect: true})
  set recording(value: boolean) {
    return
  }

  get volume() {
    return Math.round(this.audioEl?.volume * 100)
  }

  set volume(value: number) {
    this.audioEl.volume = value / 100
  }

  togglePlay = () => {
    !this.playing? this.audioEl.play(): this.audioEl.pause()
  }

  @property({type: Boolean})
  accessor volumeOpen = false

  render() {
    return html`<sl-button-group>
      <sl-button id="record" @click=${this.toggleRecording} ?loading=${this.loading} ?disabled=${this.loading}>
        <sl-icon class="idle" src=${IconMic}></sl-icon>
        <sl-icon class="torecord" src=${IconMicFill}></sl-icon>
        <sl-icon class="tostop" src=${IconStopFill}></sl-icon>
        <div id="recording-indicator"></div>
      </sl-button>
      <sl-button id="playpause" ?disabled=${this.loading || !this.src} @click=${this.togglePlay}>
        <sl-icon src=${!this.playing? IconPlay: IconPause}></sl-icon>
      </sl-button>
      <div id="playback">
        <audio src=${this.src} preload="metadata"></audio>
        <div>
          <sl-format-date .date=${new Date(this.currentTime * 1000)} minute="numeric" second="numeric"></sl-format-date>
          /
          <sl-format-date .date=${new Date(this.duration * 1000)} minute="numeric" second="numeric"></sl-format-date>
        </div>
        <sl-range ?disabled=${this.loading || !this.src}></sl-range>
      </div>
      <sl-popup id="volume" ?active=${this.volumeOpen} hoist strategy="fixed" arrow distance="6">
        <sl-button ?disabled=${this.loading || !this.src} slot="anchor" @click=${() => this.volumeOpen = !this.volumeOpen}>
          <sl-icon src=${IconVolumeDown}></sl-icon>
        </sl-button>
        <sl-range ?disabled=${this.loading || !this.src} id="volume-range" value=${this.volume} @sl-change=${(e: any) => this.volume = e.target.value}>

        </sl-range>
      </sl-popup>
      <sl-button ?disabled=${this.loading || !this.src} id="delete" @click=${() => this.src = undefined}>
        <sl-icon src=${IconTrash}></sl-icon>
      </sl-button>
    </sl-button-group>`
  }
}