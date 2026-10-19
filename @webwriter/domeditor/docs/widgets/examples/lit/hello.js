import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwHello extends LitElementWw {
  render() {
    return html`<p>Hello, <slot>world</slot>!</p>`
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
