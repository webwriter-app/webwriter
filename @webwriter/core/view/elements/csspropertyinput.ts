import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import {until} from "lit/directives/until.js"
import { msg, str } from "@lit/localize"
import { camelCaseToSpacedCase, capitalizeWord, shortenBytes } from "../../utility"
import { CSSColorValue, CSSCompositeValue, CSSPropertySpecs } from "../../model"

@customElement("ww-css-property-input")
export class CSSPropertyInput extends LitElement {

  static get labels(): Partial<Record<keyof typeof CSSPropertySpecs, string>> {
    return {}
  }

  @property({type: String, attribute: true, reflect: true})
  name: keyof typeof CSSPropertySpecs
  
  @property({type: String, attribute: true, reflect: true})
  valueDefinition: string | undefined
  
  @property({type: String, attribute: true, reflect: true})
  value: string

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: Boolean, attribute: true, reflect: true})
  plaintext=false

  get #valueDefinition() {
    return this.valueDefinition || (this.name in CSSPropertySpecs? CSSPropertySpecs[this.name as keyof typeof CSSPropertySpecs].syntax: undefined)
  }

  get remainderDefinition() {
    return ""
  }

  static get styles() {
    return css`

    `
  }

  get #label() {
    return this.label ?? CSSPropertyInput.labels[this.name] ?? this.name.split("-").map(capitalizeWord).join(" ")
  }

  CSSValueInput(value: CSSStyleValue) {
    if(value instanceof CSSUnitValue || value instanceof CSSNumericValue) {
      return html`<sl-input type="number">
        <sl-select slot="suffix">

        </sl-select>
      </sl-input>`
    }
    else if(value instanceof CSSKeywordValue) {
      return html`<sl-select></sl-select>`
    }
    else if(value instanceof CSSColorValue) {
      return html`<sl-color-picker value=${value.value}></sl-color-picker>`
    }
    else if(value instanceof CSSImageValue) {
      return html`<ww-urlfileinput></ww-urlfileinput>`
    }
  }

  CSSPlaintextInput() {
    return html`<sl-input size="small" value=${this.value} label=${this.#label}></sl-input>`
  }

  render() {
    return this.CSSPlaintextInput()
  }
}