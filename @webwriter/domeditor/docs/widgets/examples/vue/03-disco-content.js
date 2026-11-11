import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./03-disco-content.vue"

const WwGhostDisco = defineCustomElement({...GhostDisco, shadowRootOptions: {delegatesFocus: true}})

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
