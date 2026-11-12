import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./05-disco-options.vue"

const VueGhostDisco = defineCustomElement({...GhostDisco, shadowRootOptions: {delegatesFocus: true}})

class WwGhostDisco extends VueGhostDisco {
  static observedAttributes = ["lighting", "contenteditable"]

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    this.refresh()
  }

  static options = {
    lighting: {
      type: "select",
      group: "disco",
      label: {_: "Lighting"},
      options: [
        {value: "moonlight", label: {_: "Moonlight"}},
        {value: "neon", label: {_: "Neon"}},
      ],
    },
  }
  static optionGroups = {disco: {label: {_: "Disco settings"}}}
  static actions = {resetLighting: {label: {_: "Reset lighting"}, group: "disco"}}

  resetLighting() { this.lighting = "moonlight" }

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
