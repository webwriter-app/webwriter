import {withWidgetRuntime} from "@webwriter/widget"
import {readDance, chooseDance} from "#disco-reading"

class WwGhostDisco extends withWidgetRuntime(HTMLElement) {
  connectedCallback() {
    super.connectedCallback()
    this.unsubscribe = this.widgetRuntime.subscribe(() => this.update())
    this.update()
  }

  disconnectedCallback() {
    this.unsubscribe?.()
    super.disconnectedCallback()
  }

  update() {
    const {editable, data, dataReady, dataError} = this.widgetRuntime.getSnapshot()
    const {move, ready, status} = readDance(data, dataReady, dataError)
    const root = this.shadowRoot
    root.querySelector(".controls").hidden = editable
    root.querySelector(".author-hint").hidden = !editable
    root.querySelector(".ghost").dataset.move = move
    root.querySelector("output").textContent = status
    for(const button of root.querySelectorAll(".controls button")) {
      button.disabled = !ready
      button.setAttribute("aria-pressed", String(button.value === move))
    }
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

        :host { container-type: inline-size; }
        .controls { display: grid; }
        .controls[hidden] { display: none; }
        @container (min-width: 24rem) {
          .controls { display: flex; justify-content: center; }
        }

        .ghost[data-move="float"] { transform: translateY(-.3rem); }
        .ghost[data-move="twirl"] { transform: rotate(24deg); }
        button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
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
    for(const button of this.shadowRoot.querySelectorAll(".controls button")) {
      button.addEventListener("click", () => chooseDance(this.widgetRuntime, button.value))
    }
  }
}

customElements.define("ww-ghost-disco", WwGhostDisco)
