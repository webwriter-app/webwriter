import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueQuiz from "./04-state.vue"

const VueQuizElement = defineCustomElement(VueQuiz)
class WwQuiz extends VueQuizElement {
  static observedAttributes = ["answer", "contenteditable"]

  get answer() { return this.getAttribute("answer") ?? "false" }
  set answer(value) { this.setAttribute("answer", value) }

  attributeChangedCallback(name, oldValue) {
    if(oldValue !== this.getAttribute(name)) this.dispatchEvent(new CustomEvent("quizrefresh"))
  }
}
if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
