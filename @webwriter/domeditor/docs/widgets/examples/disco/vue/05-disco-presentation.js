import {withAuthoring} from "#disco-authoring"

import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./05-disco-presentation.vue"

class WwGhostDisco extends defineCustomElement(GhostDisco) {
  static observedAttributes = ["contenteditable"]

  connectedCallback() {
    this.editing = this.isContentEditable
    super.connectedCallback()
  }

  attributeChangedCallback() { this.editing = this.isContentEditable }
}

customElements.define("ww-ghost-disco", withAuthoring(WwGhostDisco))
