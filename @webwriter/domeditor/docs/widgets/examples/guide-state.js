import {LitElementWw, WidgetDrawer} from "@webwriter/lit"
import {html, css} from "lit"

class WwGuideMetronome extends LitElementWw {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}
  static properties = {
    tempo: {type: Number, reflect: true},
    playing: {state: true},
    beat: {state: true},
  }

  static options = {
    tempo: {
      type: "number",
      label: {_: "Tempo"},
      min: 40,
      max: 240,
      step: 1,
    },
  }

  static actions = {
    resetTempo: {label: {_: "Reset tempo"}},
  }

  static styles = css`
    :host { display: block; font: 1rem/1.5 system-ui, sans-serif; color: #172033; }
    .metronome { padding: 1rem; border: 1px solid #94a3b8; border-radius: .75rem; background: white; }
    .controls { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; }
    button { box-sizing: border-box; min-block-size: 2.75rem; padding: .5rem .75rem; font: inherit; }
    button:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
    output { display: block; margin-block: .75rem; font-variant-numeric: tabular-nums; }
    .beat { inline-size: .9rem; block-size: .9rem; display: inline-block; border-radius: 50%; background: #64748b; margin-inline-end: .4rem; }
    .beat[data-on="true"] { background: #2563eb; }
  `

  constructor() {
    super()
    this.tempo = 120
    this.playing = false
    this.beat = 0
    this.timer = 0
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stop()
  }

  updated(changed) {
    if(changed.has("tempo") && this.playing) this.start()
  }

  start() {
    clearInterval(this.timer)
    const tempo = this.tempo >= 40 && this.tempo <= 240 ? this.tempo : 120
    this.timer = setInterval(() => { this.beat = (this.beat + 1) % 4 }, 60000 / tempo)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = 0
  }

  toggle() {
    this.playing = !this.playing
    if(this.playing) this.start()
    else this.stop()
  }

  resetTempo() { this.tempo = 120 }

  render() {
    return html`<div class="metronome">
      <div class="controls">
        <button type="button" @click=${() => this.toggle()}>${this.playing ? "Pause" : "Start"}</button>
        <span><span class="beat" aria-hidden="true" data-on=${this.playing && this.beat % 2 === 1}></span>
          Beat ${this.beat + 1} of 4</span>
      </div>
      <output aria-live="polite">${this.playing ? "Playing" : "Paused"} · ${this.tempo} BPM</output>
      <ww-widget-drawer .widget=${this}></ww-widget-drawer>
    </div>`
  }
}

if(!customElements.get("ww-guide-metronome")) customElements.define("ww-guide-metronome", WwGuideMetronome)

export function mount(root) {
  const metronome = document.createElement("ww-guide-metronome")
  metronome.setAttribute("tempo", "96")
  metronome.setAttribute("standalone", "")
  root.replaceChildren(metronome)
}
