import {withAuthoring} from "#disco-authoring"

import {createRoot} from "react-dom/client"

const styles = `
  :host {
    display: block;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    margin-inline: auto;
  }
  .stage {
    box-sizing: border-box;
    padding: 1rem;
    border: 1px solid currentColor;
    border-radius: .75rem;
    background: #e5edff;
    color: #172c5a;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
  h2 { margin: 0; font: inherit; font-weight: bold; }
  .ghost { display: block; margin-block: .75rem; font-size: 3rem; line-height: 1.25; }
  .ghost[data-move="float"] { transform: translateY(-.3rem) rotate(-12deg); }
  .ghost[data-move="twirl"] { transform: rotate(24deg); }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button {
    font: inherit;
    padding: .4rem .75rem;
    border: 1px solid currentColor;
    border-radius: .4rem;
    color: inherit;
    background: transparent;
  }
  button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px currentColor; font-weight: bold; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
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
  :host(:lang(de)) .locale-label > [lang="de"] { display: inline; }`

function GhostDisco({lighting, move, editing, choose}) {
  const result = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
  return <section className="stage" data-lighting={lighting}>
    <style>{styles}</style>
    <h2><span className="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
    <span className="ghost" part="ghost" aria-hidden="true" data-move={move}>👻</span>
    <slot><p>Join the midnight dance party.</p></slot>
    <div className="controls" hidden={editing}>
      <button type="button" value="float" aria-pressed={move === "float"} onClick={() => choose("float")}>Float</button>
      <button type="button" value="twirl" aria-pressed={move === "twirl"} onClick={() => choose("twirl")}>Twirl</button>
    </div>
    <p hidden={!editing}><button type="button" data-edit-invitation>Edit invitation text</button></p>
    <p className="print-line">Circle a dance move: Float / Twirl</p>
    <output aria-live="polite">{result}</output>
  </section>
}

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["lighting", "contenteditable"]

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    this.refresh()
  }

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
  static optionGroups = {disco: {label: {_: "Disco settings"}}}
  static actions = {resetLighting: {label: {_: "Reset lighting"}, group: "disco"}}

  resetLighting() { this.lighting = "moonlight" }

  get lighting() { return this.getAttribute("lighting") === "neon" ? "neon" : "moonlight" }
  set lighting(value) { this.setAttribute("lighting", value === "neon" ? "neon" : "moonlight") }

  move = ""

  choose(move) {
    if(this.isContentEditable) return
    this.move = move
    this.refresh()
  }

  constructor() {
    super()
    this.attachShadow({mode: "open", delegatesFocus: true})
  }

  connectedCallback() {
    this.root = createRoot(this.shadowRoot)
    this.refresh()
  }

  disconnectedCallback() {
    this.root.unmount()
    this.root = null
  }

  refresh() {
    this.root?.render(<GhostDisco
      lighting={this.lighting}
      move={this.move}
      editing={this.isContentEditable}
      choose={move => this.choose(move)}
    />)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(WwGhostDisco))
