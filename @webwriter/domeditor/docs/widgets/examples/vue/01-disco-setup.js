import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./01-disco-setup.vue"

const WwGhostDisco = defineCustomElement(GhostDisco)

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
