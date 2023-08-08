import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { SpacingPicker } from "./spacingpicker"

type CSSValue<T extends string> = "initial" | "inherit" | "unset" | "revert" | "revert-layer" | T

@localized()
@customElement("ww-paddingpicker")
export class PaddingPicker extends SpacingPicker {

  static defaultPadding = "0"

  propertyKeys = ["padding", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom"] as const

  @property({type: String, attribute: true})
  padding: CSSValue<string> = PaddingPicker.defaultPadding

  @property({type: String, attribute: true})
  paddingLeft: CSSValue<string> = PaddingPicker.defaultPadding

  @property({type: String, attribute: true})
  paddingRight: CSSValue<string> = PaddingPicker.defaultPadding

  @property({type: String, attribute: true})
  paddingTop: CSSValue<string> = PaddingPicker.defaultPadding

  @property({type: String, attribute: true})
  paddingBottom: CSSValue<string> = PaddingPicker.defaultPadding

  @property({type: Array, attribute: false, state: true})
  enabledKeys: typeof this.propertyKeys[number][] = ["padding"]
  
  get labels() {
    return {
      "padding": "box-padding",
      "paddingLeft": "arrow-bar-to-left",
      "paddingRight": "arrow-bar-to-right",
      "paddingTop": "arrow-bar-to-up",
      "paddingBottom": "arrow-bar-to-down"
    }
  }
}