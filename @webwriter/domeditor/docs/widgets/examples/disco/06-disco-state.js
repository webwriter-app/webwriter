import {withAuthoring} from "#disco-authoring"

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["lighting", "contenteditable"]
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
  move = ""

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
          <button type="button" value="float" aria-pressed="false">Float</button>
          <button type="button" value="twirl" aria-pressed="false">Twirl</button>
        </div>
        <p class="author-hint" hidden><button type="button" data-edit-invitation>Edit invitation text</button></p>
        <p class="print-line">Circle a dance move: Float / Twirl</p>
        <output aria-live="polite">Pick a dance move.</output>
      </div>`
    for(const button of this.shadowRoot.querySelectorAll(".controls button")) {
      button.addEventListener("click", () => this.choose(button.value))
    }
  }

  get lighting() { return this.getAttribute("lighting") ?? "moonlight" }
  set lighting(value) { this.setAttribute("lighting", value) }

  connectedCallback() { this.update() }

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue !== value) this.update()
  }

  choose(move) {
    if(this.isContentEditable) return
    this.move = move
    this.update()
  }

  resetLighting() { this.lighting = "moonlight" }

  update() {
    const root = this.shadowRoot
    const editing = this.isContentEditable
    const move = this.move
    root.querySelector(".stage").dataset.lighting = this.lighting === "neon" ? "neon" : "moonlight"
    root.querySelector(".ghost").dataset.move = move
    root.querySelector(".controls").hidden = editing
    root.querySelector(".author-hint").hidden = !editing
    for(const button of root.querySelectorAll(".controls button")) {
      button.setAttribute("aria-pressed", String(button.value === move))
    }
    const status = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
    root.querySelector("output").textContent = status
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(WwGhostDisco))
