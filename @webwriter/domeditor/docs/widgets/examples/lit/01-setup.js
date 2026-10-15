import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwQuiz extends LitElementWw {
  render() {
    return html`<p>Quiz widget</p>`
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
