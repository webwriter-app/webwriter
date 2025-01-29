import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { CSSAngleValue, CSSColorValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPropertySpecs, CSSResolutionValue, CSSTimeValue, CSSValueDefinition, ICSSValueDefinition } from "#model"
import { SlInput, SlSelect } from "@shoelace-style/shoelace"

@customElement("css-line-type-input")
export class CSSLineTypeInput extends LitElement {

  static icons = {
    "solid": "minus",
    "double": "equal",
    "dotted": "line-dotted",
    "dashed": "line-dashed",
    "wavy": "arrow-wave-right-up"
  }

  @property({type: String, attribute: true, reflect: true})
  name: string
  
  @property({type: String, attribute: true, reflect: true})
  value: "solid" | "double" | "dotted" | "dashed" | "wavy" = "solid"

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: String, attribute: true, reflect: true})
  placeholder: string


  static get styles() {
    return css`

      :host {
        display: flex;
      }

      sl-select::part(combobox) {
        border: 1px solid var(--sl-color-gray-300);
        background: var(--sl-color-gray-100);
        padding: 0;
        min-height: unset;
        width: 0.975rem;
        height: 0.975rem;
      }

      sl-select::part(listbox) {
        width: calc(100% + 4px);
        padding: 0;
        margin-left: -2px;
      }

      sl-select::part(expand-icon) {
        display: none;
      }

      sl-select::part(form-control-input) {
        display: flex;
      }

      sl-option::part(base) {
        padding: 0;
      }

      sl-option::part(label) {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      sl-option::part(checked-icon) {
        display: none;
      }

      sl-select {
        display: inline-block;
      }

    `
  }

  @query("sl-select")
  selectEl: SlSelect

  handleChange = () => {
    try {
      this.value = this.selectEl.value as CSSLineTypeInput["value"]
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }

  render() {
    return html`<sl-select hoist size="small" value=${this.value ?? "solid"} @sl-change=${() => this.handleChange()}>
      <sl-icon slot="prefix" name=${CSSLineTypeInput.icons[this.value]}></sl-icon>
      <sl-option value="solid"><sl-icon name="minus"></sl-icon></sl-option>
      <sl-option value="double"><sl-icon name="equal"></sl-icon></sl-option>
      <sl-option value="dotted"><sl-icon name="line-dotted"></sl-icon></sl-option>
      <sl-option value="dashed"><sl-icon name="line-dashed"></sl-icon></sl-option>
      <sl-option value="wavy"><sl-icon name="arrow-wave-right-up"></sl-icon></sl-option>
    </sl-select>`
  }
}