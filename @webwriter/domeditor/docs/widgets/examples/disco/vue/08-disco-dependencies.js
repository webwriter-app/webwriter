import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import {withDependencies} from "#disco-dependencies"
import "#disco-scoreboard"

import {createVueWidget} from "@webwriter/vue"
import GhostDisco from "./08-disco-dependencies.vue"

class WwGhostDisco extends createVueWidget(GhostDisco, {shadowRootOptions: {delegatesFocus: true}}) {
  static widgetAttributes = ["lighting"]

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
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withDependencies(withParticipation(withAuthoring(WwGhostDisco))))
