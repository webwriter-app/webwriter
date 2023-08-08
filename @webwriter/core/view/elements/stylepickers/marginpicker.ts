import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { SpacingPicker } from "./spacingpicker"

type CSSValue<T extends string> = "initial" | "inherit" | "unset" | "revert" | "revert-layer" | T

@localized()
@customElement("ww-marginpicker")
export class MarginPicker extends SpacingPicker {

  static defaultMargin = "0"

  propertyKeys = ["margin", "marginLeft", "marginRight", "marginTop", "marginBottom"] as const

  @property({type: String, attribute: true})
  margin: CSSValue<string> = MarginPicker.defaultMargin

  @property({type: String, attribute: true})
  marginLeft: CSSValue<string> = MarginPicker.defaultMargin

  @property({type: String, attribute: true})
  marginRight: CSSValue<string> = MarginPicker.defaultMargin

  @property({type: String, attribute: true})
  marginTop: CSSValue<string> = MarginPicker.defaultMargin

  @property({type: String, attribute: true})
  marginBottom: CSSValue<string> = MarginPicker.defaultMargin

  @property({type: Array, attribute: false, state: true})
  enabledKeys: typeof this.propertyKeys[number][] = ["margin"]
  
  get labels() {
    return {
      "margin": "box-margin",
      "marginLeft": "arrow-bar-left",
      "marginRight": "arrow-bar-right",
      "marginTop": "arrow-bar-up",
      "marginBottom": "arrow-bar-down"
    }
  }
}