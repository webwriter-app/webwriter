import {LitElementWw} from "@webwriter/lit"
import {css, html} from "lit"
import {readDance} from "#disco-reading"

class WwGhostDisco extends LitElementWw {
  static styles = css`
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
  `

  static properties = {error: {state: true}}

  dataPending() { this.error = undefined }
  dataChanged() { this.error = undefined }
  dataError(error) { this.error = error }

  choose(move) {
    if(this.editable || !readDance(this.data, this.dataReady, this.error).ready) return
    this.data = JSON.stringify({...JSON.parse(this.data), move})
  }

  render() {
    const {move, ready, status} = readDance(this.data, this.dataReady, this.error)
    return html`
      <div class="stage">
        <slot><p>Join the midnight dance party.</p></slot>
        <span class="ghost" aria-hidden="true" data-move="${move}">👻</span>
        <div class="controls" ?hidden=${this.editable}>
          <button type="button" value="float" ?disabled=${!ready} aria-pressed=${move === "float"} @click=${() => this.choose("float")}>Float</button>
          <button type="button" value="twirl" ?disabled=${!ready} aria-pressed=${move === "twirl"} @click=${() => this.choose("twirl")}>Twirl</button>
        </div>
        <p class="author-hint" ?hidden=${!this.editable}>Edit the invitation in the document.</p>
        <output aria-live="polite">${status}</output>
      </div>`
  }
}

customElements.define("ww-ghost-disco", WwGhostDisco)
