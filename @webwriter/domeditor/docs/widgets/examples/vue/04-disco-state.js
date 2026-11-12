import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./04-disco-state.vue"

const VueGhostDisco = defineCustomElement({...GhostDisco, shadowRootOptions: {delegatesFocus: true}})

class WwGhostDisco extends VueGhostDisco {
  static observedAttributes = ["lighting", "contenteditable"]

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    this.refresh()
  }

  get lighting() { return this.getAttribute("lighting") === "neon" ? "neon" : "moonlight" }
  set lighting(value) { this.setAttribute("lighting", value === "neon" ? "neon" : "moonlight") }

  move = ""

  choose(move) {
    if(this.isContentEditable) return
    this.move = move
    this.refresh()
  }

  refresh() {
    this.dispatchEvent(new Event("discorefresh"))
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
