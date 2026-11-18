import {LitElement, css, html, nothing} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {isOnApple} from "../utility"

export type TextKeyboardCommand = {command: "insert", text: string} | {command: "enter" | "backspace"}

const rows = {
  letters: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
  numbers: ["1234567890", "-/:;()$&@“", ".,?!'”"],
  symbols: ["[]{}#%^*+=", "_\\|~<>€£¥•", '.,?!"`'],
}

export class TextKeyboard extends LitElement {
  static properties = {
    deviceKeyboardAvailable: {attribute: false},
    layer: {state: true},
    shift: {state: true},
  }

  deviceKeyboardAvailable = true
  private layer: keyof typeof rows = "letters"
  private shift: "off" | "once" | "locked" = "off"
  private lastShift = -Infinity

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: min(100%, 760px);
      container-type: inline-size;
      margin-inline: auto;
      color: #1f2b38;
      background: #ecf0f4;
      border: 1px solid #c9d0d9;
      border-radius: .65rem .65rem 0 0;
      box-shadow: 0 -3px 14px rgb(25 35 48 / 16%);
      font: 400 1rem/1.15 system-ui, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    section {
      --gap: clamp(2px, 0.65cqi, 6px);
      --key-height: clamp(34px, 8.25dvh, 46px);
      padding: .5rem max(.25rem, env(safe-area-inset-right))
        max(.5rem, env(safe-area-inset-bottom)) max(.25rem, env(safe-area-inset-left));
      display: grid;
      gap: var(--gap);
    }
    .row {
      display: flex;
      gap: var(--gap);
      justify-content: center;
      align-items: stretch;
    }
    button {
      flex: 1 1 0;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      min-width: 0;
      min-height: var(--key-height);
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: .4rem;
      background: #fff;
      color: inherit;
      font: inherit;
      font-size: clamp(1rem, 4.4cqi, 1.3rem);
      cursor: pointer;
      touch-action: manipulation;
    }
    .action { background: #d8e0e9; font-size: .9rem; }
    .apple button { box-shadow: 0 1px 0 #a6b0bc; }
    .android button { border-radius: .65rem; }
    .android .action { border-radius: 1.5rem; }
    .android .enter, button[aria-pressed="true"] { background: #c2d9f0; color: #123857; }
    .letters .middle { margin-inline: calc(5% + var(--gap) / 2); }
    .side { flex: 1.5; }
    .bottom .space { flex: 5; font-size: .9rem; }
    .bottom .enter { flex: 1.7; }
    .bottom .layout { flex: 1.6; }
    button:active { background: #b6cae0; }
    button:focus-visible { outline: 2px solid #286bb3; outline-offset: 1px; }
    svg { display: block; width: 1.2rem; height: 1.2rem; }
    @media (pointer: coarse) and (min-height: 450px) {
      section { --key-height: 44px; }
    }
  `

  private command(detail: TextKeyboardCommand) {
    this.dispatchEvent(new CustomEvent("text-keyboard-command", {detail, bubbles: true, composed: true}))
  }

  private insert(text: string) {
    this.command({command: "insert", text})
    if(this.shift === "once") this.shift = "off"
  }

  private switchLayer(layer: keyof typeof rows) {
    this.layer = layer
    this.shift = "off"
    this.lastShift = -Infinity
  }

  private toggleShift() {
    const now = performance.now()
    if(this.shift === "once" && now - this.lastShift < 450) this.shift = "locked"
    else this.shift = this.shift === "off" ? "once" : "off"
    this.lastShift = now
  }

  private characters(row: string) {
    return Array.from(row, char => {
      const value = this.shift === "off" ? char : char.toUpperCase()
      return html`<button type="button" @click=${() => this.insert(value)}>${value}</button>`
    })
  }

  protected render() {
    const letters = this.layer === "letters"
    const apple = isOnApple()
    const [top, middle, bottom] = rows[this.layer]
    return html`<section aria-label="Text keyboard" dir="ltr" class=${`${apple ? "apple" : "android"} ${this.layer}`}
      @pointerdown=${(event: PointerEvent) => event.preventDefault()}>
      <div class="row">${this.characters(top)}</div>
      <div class="row middle">${this.characters(middle)}</div>
      <div class="row">
        ${letters ? html`<button type="button" class="action side" aria-label=${this.shift === "locked" ? "Caps Lock" : "Shift"}
          aria-pressed=${this.shift !== "off"} @click=${this.toggleShift}>${this.shift === "locked" ? "⇪" : "⇧"}</button>`
          : html`<button type="button" class="action side" aria-label=${this.layer === "numbers" ? "More symbols" : "Numbers"}
            @click=${() => this.switchLayer(this.layer === "numbers" ? "symbols" : "numbers")}>${this.layer === "numbers" ? "#+=" : "123"}</button>`}
        ${this.characters(bottom)}
        <button type="button" class="action side" aria-label="Backspace" @click=${() => this.command({command: "backspace"})}>⌫</button>
      </div>
      <div class="row bottom">
        <button type="button" class="action layout" aria-label=${letters ? "Numbers and symbols" : "Letters"}
          @click=${() => this.switchLayer(letters ? "numbers" : "letters")}>${letters ? (apple ? "123" : "?123") : "ABC"}</button>
        ${this.deviceKeyboardAvailable ? html`<button type="button" class="action" title="Use device keyboard" aria-label="Use device keyboard"
          @click=${() => this.dispatchEvent(new CustomEvent("text-keyboard-native", {bubbles: true, composed: true}))}>
          ${ribbonIcon("Language")}
        </button>` : nothing}
        ${apple ? nothing : this.characters(",")}
        <button type="button" class="space" aria-label="Space" @click=${() => this.insert(" ")}>space</button>
        ${apple ? nothing : this.characters(".")}
        <button type="button" class="action enter" aria-label="Return" @click=${() => this.command({command: "enter"})}>${apple ? "return" : "↵"}</button>
        <button type="button" class="action" title="Hide text keyboard" aria-label="Hide text keyboard"
          @click=${() => this.dispatchEvent(new CustomEvent("text-keyboard-close", {bubbles: true, composed: true}))}>
          ${ribbonIcon("KeywordNoKeyboard")}
        </button>
      </div>
    </section>`
  }
}

if(!customElements.get("dom-editor-text-keyboard")) customElements.define("dom-editor-text-keyboard", TextKeyboard)
