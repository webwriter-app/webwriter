class WwHello extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Hello, <slot>world</slot>!</p>"
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
