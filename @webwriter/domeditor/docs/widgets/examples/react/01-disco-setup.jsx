import {createRoot} from "react-dom/client"

function GhostDisco() {
  return <p>Ghost Disco widget</p>
}

class WwGhostDisco extends HTMLElement {
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
    this.root.render(<GhostDisco />)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
