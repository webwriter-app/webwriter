import {createVueWidget} from "@webwriter/vue"
import GhostDisco from "./04-disco-sharing.vue"

customElements.define("ww-ghost-disco", createVueWidget(GhostDisco))
