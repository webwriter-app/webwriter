class WwGhostDisco extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Ghost Disco widget</p>"
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
