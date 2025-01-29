import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { CSSAngleValue, CSSColorValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPropertySpecs, CSSResolutionValue, CSSTimeValue, CSSValueDefinition, ICSSValueDefinition } from "#model"
import { capitalizeWord, SpacedListAttributeConverter } from "#utility"
import { Combobox } from "#view"
import { SlInput, SlSelect } from "@shoelace-style/shoelace"

type NumericValueClass = typeof CSSIntegerValue | typeof CSSNumberValue | typeof CSSLengthValue | typeof CSSAngleValue | typeof CSSTimeValue | typeof CSSResolutionValue | typeof CSSPercentageValue
type NumericValue = CSSIntegerValue | CSSNumberValue | CSSLengthValue | CSSAngleValue | CSSTimeValue | CSSResolutionValue | CSSPercentageValue

const numericClassEntries: [NumericValueClass, string][] = [
  [CSSIntegerValue, "integer"],
  [CSSNumberValue, "number"],
  [CSSLengthValue, "length"],
  [CSSAngleValue, "angle"],
  [CSSTimeValue, "time"],
  [CSSResolutionValue, "resolution"],
  [CSSPercentageValue, "percentage"],
]

const numericClass = new Map(numericClassEntries.map(([a, b]) => [b, a]))
const numericClassName = new Map(numericClassEntries)

@customElement("css-numeric-input")
export class CSSNumericInput extends LitElement {

  

  static get labels(): Partial<Record<keyof typeof CSSPropertySpecs, string>> {
    return {}
  }

  @property({type: String, attribute: true, reflect: true})
  name: string

  @property({type: String, attribute: true, converter: {
    fromAttribute: attr => attr?.split(/\s+/).map(name => numericClass.get(name)),
    toAttribute: (prop: NumericValueClass[]) => prop.map(cls => numericClassName.get(cls)).join(" ")}
  })
  type: NumericValueClass[] = []
  
  @property({type: String, attribute: true, reflect: true, converter: {
    fromAttribute: attr => {
      if(!attr) {
        return null
      }
      else {
        try {
          return CSSNumericValue.parse(attr)
        }
        catch(err) {
          return null
        }
      }
    },
    toAttribute: (prop: CSSUnitValue) => prop.toString()}
  })
  value: CSSUnitValue

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: String, attribute: true, reflect: true})
  placeholder: string

  @property({type: Number, attribute: true, reflect: true})
  min: number

  @property({type: Number, attribute: true, reflect: true})
  step: number

  @property({type: Number, attribute: true, reflect: true})
  max: number

  @query("#value")
  valueInput: SlInput

  @query("#unit")
  unitInput: SlSelect

  focus(options?: FocusOptions) {
    this.valueInput.focus(options)
  }

  static get styles() {
    return css`

      :host {
        --sl-input-spacing-small: 4px;
        --sl-input-icon-color: currentcolor;
      }

      :host([size=small]) {
        & #value::part(label) {
          font-size: var(--sl-input-label-font-size-small);
        }
      }

      #value {

        &::part(base) {
          overflow: visible;
        }

        &::part(input) {
          padding: 4px;
        }
      }

      #unit {
        width: 40px;
        --sl-input-height-small: 1.2rem;
        margin-inline-end: 4px;

        &[disabled] {
          width: 2ch;
        }


        &::part(combobox) {
          position: relative;
          padding: 0;
          padding-left: 3px;
          font-size: var(--sl-font-size-2x-small);
          opacity: 1 !important;
          justify-content: center;
        }

        &[disabled]::part(combobox) {
          background: transparent;
        }


        &::part(expand-icon) {
          margin-inline-start: 0;
          position: absolute;
          right: 0;
        }

        &[disabled]::part(display-input) {
          text-align: center;
          font-weight: bold;
        }

        &[data-single]::part(expand-icon) {
          display: none;
        }

        &::part(listbox) {
          scrollbar-width: thin;
          width: 150%;
        }

        & sl-option::part(base) {
          font-size: var(--sl-font-size-2x-small);
        }

        & sl-option::part(checked-icon) {
          display: none;
        }
      }
    `
  }

  get units() {
    return (this.type as NumericValueClass[])?.flatMap(t => t?.units ?? []) ?? []
  }

  handleChange = () => {
    try {
      if(this.valueInput.value.trim()) {
        const parsed = CSSNumericValue.parse(this.valueInput.value) as CSSUnitValue
        this.value = new CSSUnitValue(parsed.value, parsed.unit !== "number" || !this.units.length? parsed.unit: this.unitInput.value as string)
      }
      else {
        this.value = new CSSUnitValue(0, this.units.at(0) ?? "number")
      }
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }


  UnitInput() {
    return !this.units.length? null: html`<sl-select id="unit" size="small" @sl-change=${this.handleChange} slot="suffix" filled value=${this.units[0]} hoist ?data-single=${this.units.length === 1} ?disabled=${this.units.length === 1}>
      ${this.units.map(unit => html`<sl-option value=${unit}>${unit}</sl-option>`)}
    </sl-select>`
  }

  Input() {
    const step = this.step ?? ((this.type as NumericValueClass[]).some(t => t === CSSIntegerValue)? 1: 0.1)
    return html`<sl-input part="input" id="value" size="small" type="text" value=${this.value?.value} @sl-change=${this.handleChange} placeholder=${this.placeholder} exportparts="base, form-control, form-control-label, form-control-input, form-control-help-text, combobox, prefix, suffix, display-input, listbox, tags, tag, tag__base, tag__content, tag__remove-button, tag__remove-button__base, clear-button, expand-icon">
      ${this.querySelector("[slot=prefix]")
        ? html`<slot name="prefix" slot="prefix"></slot>`
        : undefined
      }
      ${this.label || this.querySelector("[slot=label]")
        ? html`<slot name="label" slot="label">${this.label}</slot>`
        : undefined
      }
      ${this.UnitInput()}
    </sl-input>`
  }

  render() {
    return this.Input()
  }
}