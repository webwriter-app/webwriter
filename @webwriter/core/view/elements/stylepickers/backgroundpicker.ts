import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"

@localized()
@customElement("ww-backgroundpicker")
export class BackgroundPicker extends LitElement {
  
  @property({type: String, attribute: true})
  value: string = "white"

	static get styles() {
		return css`

      :host {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
      }

      .label {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      sl-input {
        width: 6ch;
      }

      sl-color-picker::part(trigger)::before {
        height: 20px;
        margin-bottom: 0;
      } 

      sl-color-picker::part(trigger) {
        font-size: 0px;
        height: 20px;
        width: 20px;
        background: transparent;
      }

      sl-color-picker::part(base) {
        background: var(--sl-color-gray-300);
      }

      sl-color-picker::part(trigger)::before {
        border-radius: 100%;
        border: 1px solid var(--sl-color-gray-600);
        box-shadow: none;
      }
    `
  }

  handleChange(e: {target: HTMLElement & {value: string}}) {
    this.value =  e.target.value
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  
  ColorInput = () => {
    return html`<sl-color-picker
      id="value"
      class="input value"
      value=${this.value}
      @sl-change=${this.handleChange}
    >
    </sl-color-picker>`
  }

	render() {
    return html`
      ${this.ColorInput()}
    `
  }
}