import { registerIconLibrary } from "@shoelace-style/shoelace"
import {ReactiveController, ReactiveControllerHost} from "lit"

const SYSTEM_ICONS = {
  "caret": "chevron-down",
  "chevron-down": "chevron-down",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
  "eye": "eye",
  "eye-slash": "eye-off",
  "eyedropper": "color-picker",
  "grip-vertical": "grip-vertical",
  "indeterminate": "square-minus",
  "person-fill": "user",
  "play-fill": "player-play-filled",
  "pause-fill": "player-pause-filled",
  "radio": "circle-filled",
  "star-fill": "star-filled",
  "x-lg": "x",
  "x-circle-fill": "circle-x-filled", 
}

export class IconController implements ReactiveController {

  host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this)
  }

  async hostConnected() {
    registerIconLibrary("default", {
      resolver: name => `assets/icons/${name}.svg`,
      mutator: svg => {
        // svg.style.width = "var(--icon-size, 1em)"
        // svg.style.height = "var(--icon-size, 1em)"
      },
    })
    registerIconLibrary("system", {
      resolver: name => `assets/icons/${SYSTEM_ICONS[name as keyof typeof SYSTEM_ICONS] ?? name}.svg`,
      mutator: svg => {
        // svg.style.width = "var(--icon-size, 1em)"
        // svg.style.height = "var(--icon-size, 1em)"
      }
    })
  }
}