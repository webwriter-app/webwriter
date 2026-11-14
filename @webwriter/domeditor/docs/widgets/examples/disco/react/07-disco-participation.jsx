import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import "#disco-scoreboard"

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
  :host(:lang(de)) .locale-label > [lang="de"] { display: inline; }
  :host(:not([allow-tips])) .dance-tip, :host([contenteditable]) .dance-tip { display: none; }
  @media print { .dance-tip { display: none; } }`

function GhostDisco({lighting, move, editing, choose, ready, error}) {
  const result = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
  return <section className="stage" data-lighting={lighting}>
    <style>{styles}</style>
    <h2><span className="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
    <span className="ghost" part="ghost" aria-hidden="true" data-move={move}>👻</span>
    <slot><p>Join the midnight dance party.</p></slot>
    <div className="controls" hidden={editing}>
      <button type="button" value="float" disabled={!ready} aria-pressed={move === "float"} onClick={() => choose("float")}>Float</button>
      <button type="button" value="twirl" disabled={!ready} aria-pressed={move === "twirl"} onClick={() => choose("twirl")}>Twirl</button>
    </div>
    <p hidden={!editing}><button type="button" data-edit-invitation>Edit invitation text</button></p>
    <p className="dance-tip">Lift your arms for Float. Turn once for Twirl.</p>
    <p className="print-line">Circle a dance move: Float / Twirl</p>
    <output aria-live="polite">{error || result}</output>
  </section>
}

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["lighting", "contenteditable", "shared"]

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    if(name === "shared") {
      this.readyBlock = null
      this.dataError = ""
    }
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

  dataBlock = null
  readyBlock = null
  dataError = ""
  dataObserver = new MutationObserver(() => this.requestData())

  get block() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }

  get ready() { return this.block !== null && this.block === this.readyBlock }

  get move() {
    if(!this.ready) return ""
    try {
      const {move} = JSON.parse(this.readyBlock.textContent || "{}")
      return move === "float" || move === "twirl" ? move : ""
    }
    catch { return "" }
  }

  onData = event => {
    if(event.target !== this.block) return
    this.dataBlock = event.target
    this.readyBlock = event.type === "datachange" ? event.target : null
    this.dataError = event.type === "dataerror" ? event.detail?.message ?? "Could not load the dance." : ""
    this.refresh()
  }

  requestData() {
    const block = this.block
    if(block === this.dataBlock) return
    this.dataBlock = block
    this.readyBlock = null
    this.dataError = ""
    if(block?.dispatchEvent(new CustomEvent("datarequest", {bubbles: true, cancelable: true}))) {
      this.readyBlock = block
    }
    this.refresh()
  }

  choose(move) {
    if(this.isContentEditable || !this.ready) return
    const block = this.readyBlock
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, move})
      this.refresh()
    }
    catch {
      this.dataError = "Could not update the dance."
      this.refresh()
    }
  }

  constructor() {
    super()
    this.attachShadow({mode: "open", delegatesFocus: true})
  }

  connectedCallback() {
    this.root = createRoot(this.shadowRoot)
    for(const type of ["datapending", "datachange", "dataerror"]) {
      this.addEventListener(type, this.onData)
    }
    this.dataObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot", "type", "src"],
    })
    this.requestData()
    this.refresh()
  }

  disconnectedCallback() {
    for(const type of ["datapending", "datachange", "dataerror"]) {
      this.removeEventListener(type, this.onData)
    }
    this.dataObserver.disconnect()
    this.dataBlock = null
    this.readyBlock = null
    this.dataError = ""
    this.root.unmount()
    this.root = null
  }

  refresh() {
    this.root?.render(<GhostDisco
      lighting={this.lighting}
      move={this.move}
      editing={this.isContentEditable}
      choose={move => this.choose(move)}
      ready={this.ready}
      error={this.dataError}
    />)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withParticipation(withAuthoring(WwGhostDisco)))
