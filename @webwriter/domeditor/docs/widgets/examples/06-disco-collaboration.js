class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["lighting", "contenteditable", "shared"]
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
  readyBlock = null
  error = ""

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
      </style>
      <div class="stage" data-lighting="moonlight">
        <slot><p>Join the midnight dance party.</p></slot>
        <span class="ghost" aria-hidden="true">👻</span>
        <div class="controls">
          <button type="button" value="float" aria-pressed="false">Float</button>
          <button type="button" value="twirl" aria-pressed="false">Twirl</button>
        </div>
        <p class="author-hint" hidden>Edit the invitation, then use Preview.</p>
        <output aria-live="polite">Pick a dance move.</output>
      </div>`
    for(const button of this.shadowRoot.querySelectorAll("button")) {
      button.addEventListener("click", () => this.choose(button.value))
    }
    this.addEventListener("datapending", event => {
      if(event.target !== this.block) return
      this.readyBlock = null
      this.error = ""
      this.update()
    })
    this.addEventListener("datachange", event => {
      if(event.target !== this.block) return
      this.readyBlock = this.block
      this.error = ""
      this.update()
    })
    this.addEventListener("dataerror", event => {
      if(event.target !== this.block) return
      this.readyBlock = null
      this.error = event.detail.message
      this.update()
    })
  }

  get lighting() { return this.getAttribute("lighting") ?? "moonlight" }
  set lighting(value) { this.setAttribute("lighting", value) }

  connectedCallback() {
    this.update()
    this.block?.dispatchEvent(new Event("datarequest", {bubbles: true, cancelable: true}))
  }

  disconnectedCallback() { this.readyBlock = null }

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    if(name === "shared") this.readyBlock = null
    this.update()
  }

  get block() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }

  get move() {
    try {
      const {move} = JSON.parse(this.block?.textContent || "{}")
      return move === "float" || move === "twirl" ? move : ""
    }
    catch { return "" }
  }

  choose(move) {
    const block = this.block
    if(this.isContentEditable || !block || block !== this.readyBlock) return
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, move})
    }
    catch(error) {
      this.error = error.message
      this.update()
    }
  }

  resetLighting() { this.lighting = "moonlight" }

  update() {
    const root = this.shadowRoot
    const editing = this.isContentEditable
    const move = this.move
    const ready = this.block && this.block === this.readyBlock
    root.querySelector(".stage").dataset.lighting = this.lighting === "neon" ? "neon" : "moonlight"
    root.querySelector(".ghost").dataset.move = move
    root.querySelector(".controls").hidden = editing
    root.querySelector(".author-hint").hidden = !editing
    for(const button of root.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.value === move))
      button.disabled = !ready
    }
    const status = move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
    root.querySelector("output").textContent = this.error || (ready ? status : "Loading dance moves…")
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
