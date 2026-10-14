import {LitElement, html} from "lit"

class WwQuiz extends LitElement {
  render() {
    return html`<p>Quiz widget</p>`
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
