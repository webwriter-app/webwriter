import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { CSSAngleValue, CSSColorValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPropertySpecs, CSSResolutionValue, CSSTimeValue, CSSValueDefinition, ICSSValueDefinition, CSSTransformValue } from "#model"
import { capitalizeWord, SpacedListAttributeConverter } from "#utility"
import { Combobox } from "#view"
import { SlInput, SlSelect } from "@shoelace-style/shoelace"


type TransformType = "transform" | "shape" | "clip" | "mask"


@customElement("css-transform-input")
export class CSSTransformInput extends LitElement {

  static get labels(): Partial<Record<keyof typeof CSSPropertySpecs, string>> {
    return {}
  }

  @property({type: String, attribute: true, reflect: true})
  name: string
  
  @property({attribute: true, reflect: true, converter: {
    fromAttribute: attr => attr? CSSTransformValue.parse(attr): undefined,
    toAttribute: (prop: CSSTransformValue) => prop.toString()}
  })
  value: CSSTransformValue

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({attribute: true, reflect: true, converter: {
    fromAttribute(value) {
      return new Set(value?.split(/\s+/) ?? [])
    },
    toAttribute(value: Set<TransformType>) {
      return Array.from(value).join(" ")
    },
  }})
  type: Set<TransformType> = new Set()

  static get styles() {
    return css`
    `
  }

  handleChange = () => {
    try {
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }

  TranslateForm() {

  }

  RotateForm() {
    
  }

  ScaleForm() {
    
  }

  SkewForm() {
    
  }

  PerspectiveForm() {
    
  }

  OffsetForm() {
    
  }

  ShapeForm() {
    
  }

  ClipForm() {
    
  }

  MaskForm() {
    
  }

  render() {
    return html`
    
    `
  }
}