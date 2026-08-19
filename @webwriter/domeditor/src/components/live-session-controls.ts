import {LitElement, css, html} from "lit"

/** Compact video-style transport controls for a live session timeline. */
export class LiveSessionControls extends LitElement {
  static properties = {
    playing: {type: Boolean, reflect: true},
    step: {type: Number},
    stepCount: {type: Number, attribute: "step-count"},
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
      color: #465465;
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
      color: #243447;
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
      color: #526b86;
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
      text-align: center;
      white-space: nowrap;
    }

    .play-icon,
    .stop-icon {
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

    .stop-icon {
      border-radius: 0.08rem;
      background: currentColor;
    }
  `

  playing = false
  step = 0
  stepCount = 0
  live = false

  private normalizedStepCount() {
    return Number.isFinite(this.stepCount) ? Math.max(0, Math.round(this.stepCount)) : 0
  }

  private normalizedStep() {
    const count = this.normalizedStepCount()
    const value = Number.isFinite(this.step) ? Math.round(this.step) : 0
    return Math.max(0, Math.min(count, value))
  }

  private dispatch(name: "live-session-play" | "live-session-pause" | "live-session-stop") {
    this.dispatchEvent(new Event(name, {bubbles: true, composed: true}))
  }

  private togglePlayback = () => {
    this.dispatch(this.playing ? "live-session-pause" : "live-session-play")
  }

  private seek = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const count = this.normalizedStepCount()
    const value = Number(input.value)
    const step = Number.isFinite(value) ? Math.max(0, Math.min(count, Math.round(value))) : 0
    this.dispatchEvent(new CustomEvent<{step: number}>("live-session-seek", {
      detail: {step},
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    const count = this.normalizedStepCount()
    const step = this.normalizedStep()
    const atEnd = step >= count
    const status = this.live && atEnd ? "LIVE" : `${step} / ${count}`
    return html`
      <div class="controls" role="group" aria-label="Live session controls">
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
          max=${count}
          step="1"
          .value=${String(step)}
          aria-label="Session step"
          aria-valuetext=${status}
          @input=${this.seek}
        />
        <span class="status" role="status" aria-live="polite">${status}</span>
        <button
          type="button"
          aria-label="Stop"
          title="Stop"
          @click=${() => this.dispatch("live-session-stop")}
        ><span class="stop-icon" aria-hidden="true"></span></button>
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
