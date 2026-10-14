import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueHello from "./hello.vue"

const WwHello = defineCustomElement(VueHello)
if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
