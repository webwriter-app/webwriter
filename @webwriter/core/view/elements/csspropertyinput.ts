import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import {until} from "lit/directives/until.js"
import { msg, str } from "@lit/localize"
import { camelCaseToSpacedCase, capitalizeWord, shortenBytes } from "../../utility"
import { CSSColorValue, CSSCompositeValue, CSSPropertySpecs, parseValueDefinition, ValueDefinition } from "../../model"
import { Combobox } from "./combobox"

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
    const raw = this.valueDefinition || (this.name in CSSPropertySpecs? CSSPropertySpecs[this.name as keyof typeof CSSPropertySpecs].syntax: undefined)
    return raw? parseValueDefinition(raw): undefined
  }

  get isLiteralAlternation() {
    const content = this.#valueDefinition?.content
    return Boolean(content && !(typeof content === "string") && content.every(val => val.type === "Literal"))
  }

  get remainderDefinition() {
    return ""
  }

  static get styles() {
    return css`
      ww-combobox[data-is-literal-alternation]::part(label) {
        color: darkgreen;
        font-weight: bold;
      }
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

  handleChange(e: CustomEvent) {
    this.value = (e.target as Combobox).value as string
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  get options() {
    return this.isLiteralAlternation
      ? (this.#valueDefinition?.content as ValueDefinition[]).map(def => def.content as string)
      : []
  }

  CSSPlaintextInput() {
    return html`<ww-combobox ?suggestions=${this.isLiteralAlternation}  size="small" .value=${this.value} label=${this.#label} @sl-change=${this.handleChange}>
      ${this.options.map(opt => html`<sl-option value=${opt}>${opt}</sl-option>`)}
    </ww-combobox>`
  }

  render() {
    return this.CSSPlaintextInput()
  }
}