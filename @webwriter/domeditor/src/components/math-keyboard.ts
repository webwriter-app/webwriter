import {LitElement, css, html, nothing} from "lit"
import {mathKeyboardLayouts, type MathKeyboardKey} from "../math-input"
import {ribbonIcon} from "../ribbon-icons"

const movementDirection = (command: string): string | undefined => {
  const match = /^move:(left|right|up|down)$/.exec(command)
  return match?.[1]
}

/** A compact on-screen formula keyboard for touch and pointer input. */
export class MathKeyboard extends LitElement {
  static properties = {
    display: {type: String},
    activeLayout: {type: String, state: true},
    shifted: {type: Boolean, state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: min(100%, 760px);
      height: 280px;
      max-height: min(280px, calc(100dvh - 80px));
      margin-inline: auto;
      opacity: 0.9;
      overflow-x: hidden;
      padding: 0.45rem 0.6rem max(0.45rem, env(safe-area-inset-bottom, 0px));
      color: #26313d;
      background: #f2f4f7;
      border: 1px solid #c9d0d9;
      border-radius: 0.55rem 0.55rem 0 0;
      box-shadow: 0 -3px 14px rgb(25 35 48 / 20%);
      font: 400 0.82rem/1.2 system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    section { display: flex; flex-direction: column; height: 100%; min-height: 0; }

    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.35rem 0.6rem;
      margin-bottom: 0.4rem;
    }

    h2 {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 650;
    }

    .controls, .tabs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    .tabs { margin-bottom: 0.35rem; }

    button {
      min-width: 0;
      min-height: 2rem;
      padding: 0.25rem 0.45rem;
      border: 1px solid #c5cdd7;
      border-radius: 0.32rem;
      color: inherit;
      background: #fff;
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
    }

    button:hover { background: #e8edf3; }
    button.close, button.close:hover { border: 0; background: transparent; }
    button.close { display: grid; place-items: center; width: 2rem; padding: 0.25rem; }
    button.close svg { width: 1.15rem; height: 1.15rem; }
    button:focus-visible { outline: 2px solid #286bb3; outline-offset: 1px; }

    button[aria-pressed="true"] {
      color: #fff;
      border-color: #315f91;
      background: #315f91;
    }

    .grid {
      flex: 1;
      min-height: 0;
      display: grid;
      /* Half-width spacer keys are common in the main layout. */
      grid-template-columns: repeat(20, minmax(0, 1fr));
      gap: 0.25rem;
    }

    .key {
      position: relative;
      min-height: 0;
      padding: 0.25rem 0.1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: clamp(0.68rem, 2.8vw, 0.95rem);
    }

    .key.action { background: #e5e9ef; }
    .key.action:hover { background: #dce2ea; }

    .hint {
      position: absolute;
      top: 0.04rem;
      right: 0.14rem;
      color: #667488;
      font-size: 0.52rem;
      line-height: 1;
    }

    .gap { min-width: 0; }
  `

  activeLayout = mathKeyboardLayouts[0]?.id ?? ""
  display: "inline" | "block" = "inline"
  shifted = false

  render() {
    const layout = mathKeyboardLayouts.find(item => item.id === this.activeLayout)
      ?? mathKeyboardLayouts[0]

    return html`
      <section aria-label="Formula keyboard">
        <div class="header">
          <h2>Formula keyboard</h2>
          <div class="controls" aria-label="Keyboard controls">
            ${(["inline", "block"] as const).map(display => html`<button type="button"
              aria-label=${`${display === "inline" ? "Inline" : "Block"} formula`} aria-pressed=${String(this.display === display)}
              @pointerdown=${this.#keepSelection} @click=${() => this.#dispatch(`display:${display}`)}
            >${display === "inline" ? "Inline" : "Block"}</button>`)}
            <button type="button" class="close" aria-label="Hide formula keyboard" title="Hide formula keyboard"
              @pointerdown=${this.#keepSelection} @click=${this.#hide}>${ribbonIcon("Reject")}</button>
          </div>
        </div>
        <div class="tabs" role="group" aria-label="Keyboard layout">
          ${mathKeyboardLayouts.map(item => html`
            <button type="button" aria-label=${item.label} title=${item.label}
              aria-pressed=${String(item.id === layout?.id)}
              @pointerdown=${this.#keepSelection}
              @click=${() => this.#selectLayout(item.id)}>${item.label}</button>
          `)}
        </div>
        ${layout ? html`<div class="grid" role="group" aria-label=${layout.label}
          style=${`grid-template-rows: repeat(${layout.rows.length}, minmax(0, 1fr))`}>
          ${layout.rows.flatMap(row => row.map(key => this.#key(key)))}
        </div>` : nothing}
      </section>
    `
  }

  #key(key: MathKeyboardKey) {
    if (!key.command) {
      const span = Math.max(1, Math.round((key.span ?? 1) * 2))
      return html`<span class="gap" aria-hidden="true" style=${`grid-column: span ${span}`}></span>`
    }

    const displayed = this.shifted && key.shift ? key.shift : key
    const isShift = displayed.command === "shift"
    const direction = movementDirection(displayed.command)
    const title = displayed.title || displayed.label
    const span = Math.max(1, Math.round((key.span ?? 1) * 2))
    const hint = key.shift && !this.shifted
      ? html`<span class="hint" aria-hidden="true">${key.shift.label}</span>`
      : nothing

    return html`<button type="button" class="key ${isShift ? "action" : ""}"
      style=${`grid-column: span ${span}`}
      aria-label=${title} title=${title}
      aria-pressed=${isShift ? String(this.shifted) : nothing}
      @pointerdown=${this.#keepSelection}
      @click=${() => this.#press(displayed, direction)}>${displayed.label}${hint}</button>`
  }

  #keepSelection(event: PointerEvent) {
    event.preventDefault()
  }

  #selectLayout(id: string) {
    this.activeLayout = id
    this.shifted = false
  }

  #press(key: MathKeyboardKey, direction?: string) {
    if (key.command === "shift") {
      this.shifted = !this.shifted
      return
    }
    if (direction && this.shifted) {
      this.#dispatch(`move-extend:${direction}`)
      return
    }
    this.#dispatch(key.command)
    this.shifted = false
  }

  #hide() {
    this.dispatchEvent(new CustomEvent("math-keyboard-close", {bubbles: true, composed: true}))
  }

  #dispatch(command: string) {
    this.dispatchEvent(new CustomEvent("math-keyboard-command", {
      detail: {command},
      bubbles: true,
      composed: true,
    }))
  }
}

if (!customElements.get("dom-editor-math-keyboard")) {
  customElements.define("dom-editor-math-keyboard", MathKeyboard)
}
