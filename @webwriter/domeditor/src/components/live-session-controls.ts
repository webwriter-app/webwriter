import {LitElement, css, html} from "lit"

/** Compact video-style transport controls for a live session timeline. */
export class LiveSessionControls extends LitElement {
  static properties = {
    playing: {type: Boolean, reflect: true},
    currentTime: {type: Number, attribute: "current-time"},
    duration: {type: Number},
    live: {type: Boolean, reflect: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 30px;
      align-items: center;
      width: 100%;
      height: 30px;
      min-height: 30px;
      max-height: 30px;
      color: #000;
      border-bottom: 0.5px solid #a8a8a8;
      background: #e7f1ff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .controls {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      height: 100%;
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

    button:hover {
      color: #000;
      background: #dbe7f2;
    }

    button:focus-visible,
    input:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    input[type="range"] {
      flex: 1 1 auto;
      min-width: 3rem;
      accent-color: #3977c7;
    }

    .status {
      flex: 0 0 3.75rem;
      color: #000;
      font-weight: 700;
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
      text-align: center;
      white-space: nowrap;
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

    .time {
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `

  playing = false
  currentTime = 0
  duration = 0
  live = false

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

  private dispatch(name: "live-session-play" | "live-session-pause") {
    this.dispatchEvent(new Event(name, {bubbles: true, composed: true}))
  }

  private togglePlayback = () => {
    this.dispatch(this.playing ? "live-session-pause" : "live-session-play")
  }

  private seek = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const duration = this.normalizedDuration()
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
    const status = this.live ? "LIVE" : "PREVIEW"
    // A fixed range avoids native step rounding as the live duration grows.
    const position = duration > 0 ? time / duration : 1
    return html`
      <div class="controls" role="group" aria-label="Playback controls">
        <button
          type="button"
          aria-label=${this.playing ? "Pause" : "Play"}
          title=${this.playing ? "Pause" : "Play"}
          @click=${this.togglePlayback}
        >${this.playing
          ? html`<span class="pause-icon" aria-hidden="true"></span>`
          : html`<span class="play-icon" aria-hidden="true"></span>`}</button>
        <input
          type="range"
          min="0"
          max="1"
          step="any"
          .value=${String(position)}
          aria-label="Playback time"
          aria-valuetext=${`${this.formatTime(time)} of ${this.formatTime(duration)}`}
          @input=${this.seek}
        />
        <span class="time">${this.formatTime(time)}</span>
        <span class="status" role="status" aria-live="polite">${status}</span>
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
