import {LitElement, css, html, type PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {editorInteractionStyles} from "./editing-controls.styles"

/** Compact video-style transport controls for a live session timeline. */
export class LiveSessionControls extends LitElement {
  static properties = {
    playing: {type: Boolean, reflect: true},
    currentTime: {type: Number, attribute: "current-time"},
    duration: {type: Number},
    live: {type: Boolean, reflect: true},
  }

  static styles = css`
    ${editorInteractionStyles}
    :host {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      width: 100%;
      min-height: 30px;
      container-type: inline-size;
      color: #000;
      border-bottom: 0.5px solid #a8a8a8;
      background: #ededed;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .controls {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      min-height: 30px;
      padding: 0 0.35rem;
    }

    button {
      box-sizing: border-box;
      display: inline-grid;
      flex: 0 0 24px;
      place-items: center;
      width: 24px;
      height: 24px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0.25rem;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      color: #000;
      background: #dbe7f2;
    }

    button:focus-visible,
    input:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .timeline {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: 0.35rem;
      min-width: 3rem;
    }

    input[type="range"] {
      appearance: none;
      flex: 1 1 auto;
      width: 100%;
      min-width: 2rem;
      height: 24px;
      margin: 0;
      background: transparent;
      cursor: pointer;
      --track: linear-gradient(to right, #3977c7 var(--position), #b6c1ce var(--position));
    }

    input::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
      background: var(--track);
    }

    input::-moz-range-track {
      height: 4px;
      border-radius: 2px;
      background: var(--track);
    }

    input::-webkit-slider-thumb {
      appearance: none;
      width: 12px;
      height: 12px;
      margin-top: -4px;
      border-radius: 50%;
      background: #3977c7;
    }

    input::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: 0;
      border-radius: 50%;
      background: #3977c7;
    }

    .status {
      flex: 0 0 5.5rem;
      font-weight: 700;
      font-size: 0.68rem;
      white-space: nowrap;
    }

    .lag {
      min-width: 5.5rem;
      color: #4d5968;
      text-align: right;
    }

    .return {
      flex: 0 0 auto;
      width: auto;
      padding: 0 0.4rem;
      border: 1px solid #b6c1ce;
      color: #245992;
      background: #fff;
      font: 600 0.68rem system-ui, sans-serif;
      white-space: nowrap;
    }

    .return:disabled {
      color: #667085;
      background: transparent;
      cursor: default;
    }

    .description {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    @container (width < 540px) {
      .controls {display: grid; grid-template-columns: 24px auto minmax(0, 1fr) auto; gap: 0 0.35rem; padding-block: 2px;}
      .status {grid-row: 1; grid-column: 1 / 3; min-width: max-content;}
      .lag {grid-row: 1; grid-column: 3; min-width: 0;}
      .return {grid-row: 1; grid-column: 4;}
      .controls > button:first-of-type {grid-row: 2; grid-column: 1;}
      .time {grid-row: 2; grid-column: 2;}
      .timeline {grid-row: 2; grid-column: 3 / 5;}
    }

    @container (width < 280px) {
      .return {grid-column: 3 / 5; justify-self: end;}
      .lag {grid-row: 2; grid-column: 3 / 5;}
      .timeline {grid-row: 3; grid-column: 1 / -1;}
    }

    .play-icon {
      display: block;
      width: 0.7rem;
      height: 0.7rem;
    }

    .play-icon {
      width: 0;
      height: 0;
      margin-left: 0.1rem;
      border-top: 0.38rem solid transparent;
      border-bottom: 0.38rem solid transparent;
      border-left: 0.55rem solid currentColor;
    }

    .pause-icon {
      display: flex;
      gap: 0.18rem;
      width: 0.55rem;
      height: 0.7rem;
    }

    .pause-icon::before,
    .pause-icon::after {
      content: "";
      display: block;
      width: 0.18rem;
      height: 100%;
      border-radius: 0.05rem;
      background: currentColor;
    }

    .time, .lag, .endpoint {
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `

  playing = false
  currentTime = 0
  duration = 0
  live = false

  // Freeze the displayed interval while paused. Incoming activity still updates
  // the lag, but cannot slide the playhead backwards or change a drag's scale.
  private timelineDuration: number | undefined

  protected willUpdate(changed: PropertyValues<this>) {
    const duration = this.normalizedDuration()
    if(this.timelineDuration === undefined && duration === 0 && !this.playing) return
    if(this.timelineDuration === undefined || this.playing || changed.has("playing") || changed.has("live")
      || duration < this.timelineDuration || this.normalizedTime() > this.timelineDuration) {
      this.timelineDuration = duration
    }
  }

  private normalizedDuration() {
    return Number.isFinite(this.duration) ? Math.max(0, this.duration) : 0
  }

  private normalizedTime() {
    return Math.max(0, Math.min(this.normalizedDuration(), Number.isFinite(this.currentTime) ? this.currentTime : 0))
  }

  private formatTime(time: number) {
    const seconds = Math.floor(time)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  }

  private dispatch(name: "live-session-play" | "live-session-pause" | "live-session-return-to-live") {
    this.dispatchEvent(new Event(name, {bubbles: true, composed: true}))
  }

  private togglePlayback = () => {
    this.dispatch(this.playing ? "live-session-pause" : "live-session-play")
  }

  private seek = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const duration = this.timelineDuration ?? this.normalizedDuration()
    const value = Number(input.value)
    const time = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * duration : 0
    this.dispatchEvent(new CustomEvent<{time: number}>("live-session-seek", {
      detail: {time},
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    const duration = this.normalizedDuration()
    const time = this.normalizedTime()
    const behind = duration - time
    const following = this.playing && time >= duration
    const status = !this.playing ? "Paused" : !following ? "Replaying" : this.live ? "Watching live" : "Preview"
    const returnLabel = this.live ? "Return to live" : "Jump to latest"
    const timelineDuration = this.timelineDuration ?? duration
    const frozen = timelineDuration < duration
    // A fixed range avoids native step rounding as the live duration grows.
    const position = timelineDuration > 0 ? Math.min(1, time / timelineDuration) : 1
    return html`
      <div class="controls" role="group" aria-label="Playback controls">
        <span class="status" role="status" aria-live="polite">${status}</span>
        <button
          type="button"
          aria-label=${this.playing ? "Pause playback" : "Resume playback"}
          title=${this.playing ? "Pause playback" : "Resume from this position"}
          @click=${this.togglePlayback}
        >${this.playing
          ? html`<span class="pause-icon" aria-hidden="true"></span>`
          : html`<span class="play-icon" aria-hidden="true"></span>`}</button>
        <span class="time" title="Viewing position">${this.formatTime(time)}</span>
        <div class="timeline">
          <input
            type="range"
            min="0"
            max="1"
            step="any"
            .value=${String(position)}
            style=${styleMap({"--position": `${position * 100}%`})}
            aria-label="Playback time"
            aria-describedby="timeline-description"
            aria-valuetext=${`${this.formatTime(time)} of ${this.formatTime(timelineDuration)}${frozen ? ` shown; latest ${this.formatTime(duration)}` : ""}`}
            @input=${this.seek}
          />
          <span class="endpoint" title=${frozen ? "Timeline end when paused" : "Latest available activity"}>${frozen ? this.formatTime(timelineDuration) : "Now"}</span>
        </div>
        <span class="lag">${behind > 0 ? `${this.formatTime(Math.ceil(behind))} behind` : ""}</span>
        <button class="return" type="button" ?disabled=${following}
          @click=${() => this.dispatch("live-session-return-to-live")}
        >${returnLabel}</button>
        <span class="description" id="timeline-description">Blue shows viewed time; grey shows later available activity. The timeline scale stays fixed while paused. ${returnLabel} jumps to the newest activity and resumes playback.</span>
      </div>
    `
  }
}

if(!customElements.get("live-session-controls")) {
  customElements.define("live-session-controls", LiveSessionControls)
}

declare global {
  interface HTMLElementTagNameMap {
    "live-session-controls": LiveSessionControls
  }
}
