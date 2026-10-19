import {createRoot} from "react-dom/client"

class WwQuiz extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"})
    this.mount = document.createElement("div")
    this.shadowRoot.append(this.mount)
    this.root = null
  }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.root.render(<p>Quiz widget</p>)
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
