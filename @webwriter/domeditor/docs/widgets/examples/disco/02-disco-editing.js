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
        :host { display: block; }
        .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
        .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
        .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
        .controls[hidden] { display: none; }
        button { font: inherit; padding: .375rem .75rem; }
        output { display: block; margin-block-start: .75rem; }
      </style>
      <div class="stage">
        <slot><p>Join the midnight dance party.</p></slot>
        <span class="ghost" aria-hidden="true">👻</span>
        <div class="controls">
          <button type="button" value="float">Float</button>
          <button type="button" value="twirl">Twirl</button>
        </div>
        <p class="author-hint" hidden>Edit the invitation in the document.</p>
        <output aria-live="polite">Pick a dance move.</output>
      </div>`
  }
}

customElements.define("ww-ghost-disco", WwGhostDisco)
