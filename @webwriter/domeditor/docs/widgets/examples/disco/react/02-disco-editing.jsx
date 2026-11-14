import {createRoot} from "react-dom/client"

const styles = `
  :host { display: block; }
  .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
  .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button { font: inherit; padding: .375rem .75rem; }
  output { display: block; margin-block-start: .75rem; }
`

function GhostDisco({editing}) {
  return (
    <div className="stage">
      <style>{styles}</style>
      <slot><p>Join the midnight dance party.</p></slot>
      <span className="ghost" aria-hidden="true">👻</span>
      <div className="controls" hidden={editing}>
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <p className="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
      <output aria-live="polite">Pick a dance move.</output>
    </div>
  )
}

class WwGhostDisco extends HTMLElement {
  static observedAttributes = ["contenteditable"]

  attributeChangedCallback() { if(this.root) this.refresh() }

  constructor() {
    super()
    this.attachShadow({mode: "open"})
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

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
