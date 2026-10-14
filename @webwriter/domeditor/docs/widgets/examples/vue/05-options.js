import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueQuiz from "./05-options.vue"

const VueQuizElement = defineCustomElement(VueQuiz)
const options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [
      {value: "true", label: {_: "True"}},
      {value: "false", label: {_: "False"}},
    ],
  },
}
const actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

class WwQuiz extends VueQuizElement {
  static observedAttributes = ["answer", "contenteditable"]
  static options = options
  static actions = actions

  get answer() { return this.getAttribute("answer") ?? "false" }
  set answer(value) { this.setAttribute("answer", value) }

  attributeChangedCallback(name, oldValue) {
    if(oldValue !== this.getAttribute(name)) this.dispatchEvent(new CustomEvent("quizrefresh"))
  }

  resetAnswer() { this.setAttribute("answer", "false") }
}
if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
