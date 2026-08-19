import {LitElement, css, html} from "lit"
import {keyed} from "lit/directives/keyed.js"

export type LiveSessionPoint = {
  x: number
  y: number
}

export type LiveSessionRegion = LiveSessionPoint & {
  width: number
  height: number
}

export type LiveSessionClick = LiveSessionPoint & {
  sequence: number | string
}

export type LiveSessionLearner = {
  id: string
  name: string
  initials?: string
  color: string
  cursor?: LiveSessionPoint
  scroll?: number
  regions?: LiveSessionRegion[]
  click?: LiveSessionClick
}

export type LiveSessionLearnerOption = {
  id: string
  name: string
  color: string
}

export type LiveSessionWidget = LiveSessionPoint & {
  path: string
  learners: LiveSessionLearnerOption[]
  selectedLearnerId?: string | null
}

export type LiveWidgetStateChangeDetail = {
  path: string
  learnerId: string | null
}

const percentage = (value: number) => `${Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100}%`

const pointStyle = (point: LiveSessionPoint) => `left:${percentage(point.x)};top:${percentage(point.y)}`

/** Lightweight, editor-owned visualization for a live session.
 *
 * The host is intended to cover the document viewport. All coordinates are
 * normalized to that host, which means learner state can be rendered without
 * touching the authored DOM or retaining document nodes. */
export class LiveSessionOverlay extends LitElement {
  static properties = {
    learners: {attribute: false},
    widgets: {attribute: false},
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      contain: strict;
      z-index: 2147483640;
    }

    .overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .state-region {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid color-mix(in srgb, var(--learner-color) 58%, transparent);
      border-radius: 2px;
      background: color-mix(in srgb, var(--learner-color) 9%, transparent);
      pointer-events: none;
    }

    .cursor {
      position: absolute;
      width: 0.7rem;
      height: 0.95rem;
      color: var(--learner-color);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 28%));
      pointer-events: none;
      transform: translate(-15%, -8%);
      transition: left 80ms linear, top 80ms linear;
    }

    .cursor::before {
      content: "";
      position: absolute;
      inset: 0;
      clip-path: polygon(0 0, 0 100%, 30% 70%, 48% 100%, 63% 93%, 45% 65%, 100% 65%);
      background: currentColor;
    }

    .cursor-label {
      position: absolute;
      top: 0.4rem;
      left: 0.55rem;
      padding: 0.08rem 0.22rem;
      border-radius: 999px;
      color: white;
      background: var(--learner-color);
      font: 600 0.55rem/1 system-ui, sans-serif;
      white-space: nowrap;
    }

    .click-ring {
      position: absolute;
      width: 1.6rem;
      height: 1.6rem;
      border: 2px solid var(--learner-color);
      border-radius: 50%;
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -50%);
      animation: live-session-click 700ms ease-out both;
    }

    @keyframes live-session-click {
      0% { opacity: 0.85; transform: translate(-50%, -50%) scale(0.35); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
    }

    .scroll-marker {
      position: absolute;
      right: 0.1rem;
      width: 0.35rem;
      height: 0.9rem;
      border-radius: 999px;
      background: var(--learner-color);
      box-shadow: 0 0 0 1px rgb(255 255 255 / 75%);
      transform: translateY(-50%);
      pointer-events: none;
      transition: top 80ms linear;
    }

    .widget-affordance {
      position: absolute;
      min-width: 2.5rem;
      max-width: 8rem;
      min-height: 1.5rem;
      padding: 0 0.15rem;
      border: 1px solid #aebdce;
      border-radius: 0.3rem;
      color: #25364a;
      background: rgb(255 255 255 / 94%);
      box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
      font: 0.62rem system-ui, sans-serif;
      pointer-events: auto;
      transform: translate(-50%, -100%);
    }

    .widget-affordance:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }
  `

  learners: LiveSessionLearner[] = []
  widgets: LiveSessionWidget[] = []

  private initials(learner: LiveSessionLearner) {
    if(learner.initials?.trim()) return learner.initials.trim().slice(0, 3).toUpperCase()
    return learner.name.trim().split(/\s+/).filter(Boolean).map(word => word[0]).join("").slice(0, 2).toUpperCase() || "?"
  }

  private learnerStyle(color: string) {
    return `--learner-color:${color}`
  }

  private dispatchWidgetState(path: string, value: string) {
    const detail: LiveWidgetStateChangeDetail = {
      path,
      learnerId: value || null,
    }
    this.dispatchEvent(new CustomEvent<LiveWidgetStateChangeDetail>("live-widget-state-change", {
      detail,
      bubbles: true,
      composed: true,
    }))
  }

  private renderLearner(learner: LiveSessionLearner) {
    return html`
      ${learner.regions?.map(region => html`
        <div
          class="state-region"
          data-learner-id=${learner.id}
          style=${`${this.learnerStyle(learner.color)};left:${percentage(region.x)};top:${percentage(region.y)};width:${percentage(region.width)};height:${percentage(region.height)}`}
          aria-hidden="true"
        ></div>
      `)}
      ${learner.cursor ? html`
        <div
          class="cursor"
          data-learner-id=${learner.id}
          style=${`${this.learnerStyle(learner.color)};${pointStyle(learner.cursor)}`}
          title=${learner.name}
          role="img"
          aria-label=${`${learner.name} cursor`}
        ><span class="cursor-label">${this.initials(learner)}</span></div>
      ` : ""}
      ${learner.click ? keyed(learner.click.sequence, html`
        <div
          class="click-ring"
          data-learner-id=${learner.id}
          data-sequence=${learner.click.sequence}
          style=${`${this.learnerStyle(learner.color)};${pointStyle(learner.click)}`}
          aria-hidden="true"
        ></div>
      `) : ""}
      ${learner.scroll === undefined ? "" : html`
        <div
          class="scroll-marker"
          data-learner-id=${learner.id}
          style=${`${this.learnerStyle(learner.color)};top:${percentage(learner.scroll)}`}
          title=${`${learner.name} scroll position`}
          aria-hidden="true"
        ></div>
      `}
    `
  }

  private renderWidget(widget: LiveSessionWidget) {
    const selected = widget.selectedLearnerId ?? ""
    return html`
      <select
        class="widget-affordance"
        data-widget-path=${widget.path}
        aria-label=${`Learner state for ${widget.path}`}
        style=${pointStyle(widget)}
        .value=${selected}
        @change=${(event: Event) => this.dispatchWidgetState(widget.path, (event.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">Combined state</option>
        ${widget.learners.map(learner => html`
          <option value=${learner.id}>${learner.name}</option>
        `)}
      </select>
    `
  }

  render() {
    return html`
      <div class="overlay" role="group" aria-label="Live learner visualization">
        ${this.learners.map(learner => this.renderLearner(learner))}
        ${this.widgets.map(widget => this.renderWidget(widget))}
      </div>
    `
  }
}

if(!customElements.get("live-session-overlay")) {
  customElements.define("live-session-overlay", LiveSessionOverlay)
}

declare global {
  interface HTMLElementTagNameMap {
    "live-session-overlay": LiveSessionOverlay
  }
}
