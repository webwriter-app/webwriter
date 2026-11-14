import {withAuthoring} from "#disco-authoring"

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["contenteditable"]

  connectedCallback() { this.updateMode() }
  attributeChangedCallback() { this.updateMode() }

  updateMode() {
    this.shadowRoot.querySelector(".controls").hidden = this.isContentEditable
    this.shadowRoot.querySelector(".author-hint").hidden = !this.isContentEditable
  }

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>
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
      </style>
      <div class="stage" data-lighting="moonlight">
        <slot><p>Join the midnight dance party.</p></slot>
        <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
        <span class="ghost" part="ghost" aria-hidden="true">👻</span>
        <div class="controls">
          <button type="button" value="float">Float</button>
          <button type="button" value="twirl">Twirl</button>
        </div>
        <p class="author-hint" hidden><button type="button" data-edit-invitation>Edit invitation text</button></p>
        <p class="print-line">Circle a dance move: Float / Twirl</p>
        <output aria-live="polite">Pick a dance move.</output>
      </div>`
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(WwGhostDisco))
