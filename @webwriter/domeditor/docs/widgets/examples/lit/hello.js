import {LitElement, html} from "lit"

class WwHello extends LitElement {
  render() {
    return html`<p>Hello, <slot>world</slot>!</p>`
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
