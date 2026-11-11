import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"

class WwGhostDisco extends LitElementWw {
  static properties = {lighting: {type: String, reflect: true}, move: {state: true}}
  static styles = css`
    :host { display: block; max-inline-size: var(--ww-widget-max, 45rem); margin-inline: auto; }
    .stage { box-sizing: border-box; padding: 1rem; border: 1px solid currentColor; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
    .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
    .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; line-height: 1.2; }
    .ghost[data-move="float"] { transform: translateY(-.3rem); }
    .ghost[data-move="twirl"] { transform: rotate(24deg); }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
    .controls[hidden] { display: none; }
    button { font: inherit; padding: .375rem .75rem; }
    button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
    output { display: block; margin-block-start: .75rem; }
  `

  constructor() {
    super()
    this.lighting = "moonlight"
    this.move = ""
  }

  choose(move) {
    if(!this.editable) this.move = move
  }

  render() {
    const move = this.move
    const status = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
    return html`
      <div class="stage" data-lighting="${this.lighting === "neon" ? "neon" : "moonlight"}">
        <slot><p>Join the midnight dance party.</p></slot>
        <span class="ghost" aria-hidden="true" data-move="${move}">👻</span>
        <div class="controls" ?hidden=${this.editable}>
          <button type="button" value="float" aria-pressed=${move === "float"} @click=${() => this.choose("float")}>Float</button>
          <button type="button" value="twirl" aria-pressed=${move === "twirl"} @click=${() => this.choose("twirl")}>Twirl</button>
        </div>
        <p ?hidden=${!this.editable}>Edit the invitation, then use Preview.</p>
        <output aria-live="polite">${status}</output>
      </div>`
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
