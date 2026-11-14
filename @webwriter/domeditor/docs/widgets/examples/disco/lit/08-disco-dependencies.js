import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import {withDependencies} from "#disco-dependencies"
import "#disco-scoreboard"

import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"

class WwGhostDisco extends LitElementWw {
  static properties = {lighting: {type: String, reflect: true}, error: {state: true}}
  static options = {
    lighting: {
      type: "select",
      group: "disco",
      label: {_: "Lighting"},
      options: [
        {value: "moonlight", label: {_: "Moonlight"}},
        {value: "neon", label: {_: "Neon"}},
      ],
    },
  }
  static optionGroups = {disco: {label: {_: "Disco settings"}, collapsible: true}}
  static actions = {
    resetLighting: {label: {_: "Reset lighting"}, group: "disco", icon: "Restore"},
  }
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
    :host { container-type: inline-size; overflow-wrap: anywhere; }
    .controls { display: grid; }
    .controls[hidden] { display: none; }
    @container (min-width: 24rem) {
      .controls { display: flex; justify-content: center; }
    }
    :host { font-family: var(--ww-font-family, inherit); }
    .stage[data-lighting="moonlight"] { color: var(--ww-text-color, #172c5a); }
    .ghost { text-shadow: 0 0 .6rem var(--ww-theme-accent-1, #b4c9fb); }
    .print-line { display: none; }
    @media print {
      .stage[data-lighting] { color: #000; background: #fff; }
      .controls, .author-hint, [data-edit-invitation], output { display: none; }
      .print-line { display: block; }
    }
    .locale-label > [lang="de"], :host(:lang(de)) .locale-label > [lang="en"] { display: none; }
    :host(:lang(de)) .locale-label > [lang="de"] { display: inline; }
    :host(:not([allow-tips])) .dance-tip, :host([contenteditable]) .dance-tip { display: none; }
    @media print { .dance-tip { display: none; } }
  `

  constructor() {
    super()
    this.lighting = "moonlight"
    this.error = ""
  }

  dataPending() { this.error = "" }
  dataChanged() { this.error = "" }
  dataError(error) { this.error = error.message }

  get move() {
    try {
      const {move} = JSON.parse(this.data || "{}")
      return move === "float" || move === "twirl" ? move : ""
    }
    catch { return "" }
  }

  choose(move) {
    if(this.editable || !this.dataReady) return
    try {
      const state = JSON.parse(this.data || "{}")
      this.data = JSON.stringify({...state, move})
    }
    catch(error) { this.error = error.message }
  }

  resetLighting() { this.lighting = "moonlight" }

  render() {
    const move = this.move
    const status = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
    const ready = this.dataReady
    return html`
      <div class="stage" data-lighting="${this.lighting === "neon" ? "neon" : "moonlight"}">
        <slot><p>Join the midnight dance party.</p></slot>
        <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
        <span class="ghost" part="ghost" aria-hidden="true" data-move="${move}">👻</span>
        <div class="controls" ?hidden=${this.editable}>
          <button type="button" value="float" aria-pressed=${move === "float"} ?disabled=${!ready} @click=${() => this.choose("float")}>Float</button>
          <button type="button" value="twirl" aria-pressed=${move === "twirl"} ?disabled=${!ready} @click=${() => this.choose("twirl")}>Twirl</button>
        </div>
        <p ?hidden=${!this.editable}><button type="button" data-edit-invitation>Edit invitation text</button></p>
        <p class="dance-tip"><button type="button" data-dance-tip>Show a dance tip</button><output></output></p>
        <p class="print-line">Circle a dance move: Float / Twirl</p>
        <output aria-live="polite">${this.error || (ready ? status : "Loading dance moves…")}</output>
      </div>`
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withDependencies(withParticipation(withAuthoring(WwGhostDisco))))
