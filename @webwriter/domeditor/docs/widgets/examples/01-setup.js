class WwQuiz extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Quiz widget</p>"
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
