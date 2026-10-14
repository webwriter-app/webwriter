import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueQuiz from "./01-setup.vue"

const WwQuiz = defineCustomElement(VueQuiz)
if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
