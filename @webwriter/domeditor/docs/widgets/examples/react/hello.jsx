import {createRoot} from "react-dom/client"

class WwHello extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"})
    this.mount = document.createElement("div")
    this.shadowRoot.append(this.mount)
    this.root = null
  }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.root.render(<p>Hello, <slot>world</slot>!</p>)
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
