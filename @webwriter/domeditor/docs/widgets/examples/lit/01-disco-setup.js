import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwGhostDisco extends LitElementWw {
  render() { return html`<p>Ghost Disco widget</p>` }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
