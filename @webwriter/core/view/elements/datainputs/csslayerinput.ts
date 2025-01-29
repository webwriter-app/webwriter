import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { CSSAngleValue, CSSColorValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPropertySpecs, CSSResolutionValue, CSSTimeValue, CSSValueDefinition, ICSSValueDefinition, CSSTransformValue, CSSImageValue, CSSGradientValue } from "#model"
import { capitalizeWord, SpacedListAttributeConverter } from "#utility"
import { Combobox } from "#view"
import { SlInput, SlSelect } from "@shoelace-style/shoelace"

type RepeatStyle = "repeat" | "space" | "round" | "no-repeat"
type VisualBox = "content-box" | "padding-box" | "border-box"

type BackgroundLayer = {
  value: CSSColorValue | CSSImageValue | CSSGradientValue,
  position?: {x: CSSUnitValue, y: CSSUnitValue},
  repeat?: {x: RepeatStyle, y: RepeatStyle},
  attachment?: "scroll" | "fixed" | "local",
  visualBox?: {x: VisualBox, y: VisualBox}
}


@customElement("css-layer-input")
export class CSSLayerInput extends LitElement {

  static get labels(): Partial<Record<keyof typeof CSSPropertySpecs, string>> {
    return {}
  }

  @property({type: String, attribute: true, reflect: true})
  name: string
  
  @property({attribute: true, reflect: true, converter: {
    fromAttribute: attr => attr? CSSTransformValue.parse(attr): undefined,
    toAttribute: (prop: CSSTransformValue) => prop.toString()}
  })
  value: BackgroundLayer[]

  @property({type: String, attribute: true, reflect: true})
  label: string

  static get styles() {
    return css`
    `
  }

  handleChange = () => {
    try {
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }

  ColorInput() {}
  
  ImageInput() {}

  GradientInput() {}

  render() {
    return html`
    
    `
  }
}