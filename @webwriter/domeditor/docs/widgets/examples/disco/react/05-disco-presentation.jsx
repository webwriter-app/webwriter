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
  h2 { margin: 0; font: inherit; font-weight: bold; }
  .ghost { display: block; margin-block: .75rem; font-size: 3rem; line-height: 1.25; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  button {
    font: inherit;
    padding: .4rem .75rem;
    border: 1px solid currentColor;
    border-radius: .4rem;
    color: inherit;
    background: transparent;
  }
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

function GhostDisco({editing}) {
  return <section className="stage" data-lighting="moonlight">
    <style>{styles}</style>
    <h2><span className="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
    <span className="ghost" part="ghost" aria-hidden="true">👻</span>
    <slot><p>Join the midnight dance party.</p></slot>
    <div className="controls" hidden={editing}>
      <button type="button" value="float">Float</button>
      <button type="button" value="twirl">Twirl</button>
    </div>
    <p className="author-hint" hidden={!editing}><button type="button" data-edit-invitation>Edit invitation text</button></p>
    <p className="print-line">Circle a dance move: Float / Twirl</p>
    <output aria-live="polite">Pick a dance move.</output>
  </section>
}

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["contenteditable"]

  attributeChangedCallback() { if(this.root) this.refresh() }

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
    this.root.render(<GhostDisco editing={this.isContentEditable} />)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(WwGhostDisco))
