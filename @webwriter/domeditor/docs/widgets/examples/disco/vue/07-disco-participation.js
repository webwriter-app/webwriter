import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import "#disco-scoreboard"

import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./07-disco-participation.vue"

const VueGhostDisco = defineCustomElement({...GhostDisco, shadowRootOptions: {delegatesFocus: true}})

class WwGhostDisco extends VueGhostDisco {
  static observedAttributes = ["lighting", "contenteditable", "shared"]

  attributeChangedCallback(name, oldValue, value) {
    if(oldValue === value) return
    if(name === "shared") {
      this.readyBlock = null
      this.dataError = ""
    }
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

  dataBlock = null
  readyBlock = null
  dataError = ""
  dataObserver = new MutationObserver(() => this.requestData())

  get block() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }

  get ready() { return this.block !== null && this.block === this.readyBlock }

  get move() {
    if(!this.ready) return ""
    try {
      const {move} = JSON.parse(this.readyBlock.textContent || "{}")
      return move === "float" || move === "twirl" ? move : ""
    }
    catch { return "" }
  }

  onData = event => {
    if(event.target !== this.block) return
    this.dataBlock = event.target
    this.readyBlock = event.type === "datachange" ? event.target : null
    this.dataError = event.type === "dataerror" ? event.detail?.message ?? "Could not load the dance." : ""
    this.refresh()
  }

  requestData() {
    const block = this.block
    if(block === this.dataBlock) return
    this.dataBlock = block
    this.readyBlock = null
    this.dataError = ""
    if(block?.dispatchEvent(new CustomEvent("datarequest", {bubbles: true, cancelable: true}))) {
      this.readyBlock = block
    }
    this.refresh()
  }

  choose(move) {
    if(this.isContentEditable || !this.ready) return
    const block = this.readyBlock
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, move})
      this.refresh()
    }
    catch {
      this.dataError = "Could not update the dance."
      this.refresh()
    }
  }

  connectedCallback() {
    for(const type of ["datapending", "datachange", "dataerror"]) {
      this.addEventListener(type, this.onData)
    }
    this.dataObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot", "type", "src"],
    })
    this.requestData()
    super.connectedCallback()
  }

  disconnectedCallback() {
    for(const type of ["datapending", "datachange", "dataerror"]) {
      this.removeEventListener(type, this.onData)
    }
    this.dataObserver.disconnect()
    this.dataBlock = null
    this.readyBlock = null
    this.dataError = ""
    super.disconnectedCallback()
  }

  refresh() {
    this.dispatchEvent(new Event("discorefresh"))
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withParticipation(withAuthoring(WwGhostDisco)))
