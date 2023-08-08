import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"

@localized()
@customElement("ww-lineheightpicker")
export class LineHeightPicker extends LitElement {
  
  @property({type: Number, attribute: true})
  value: number = 1.0

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

      sl-input::part(base) {
        background: none;
        border: none;
        padding: 0;
      }

      sl-input::part(input) {
        padding: 2px;
        text-align: left;
      }
    `
  }

  handleChange(e: {target: HTMLElement & {value: string}}) {
    this.value =  parseFloat(e.target.value)
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  
  HeightInput = () => {
    return html`<sl-input
      id="value"
      class="input value"
      type="number"
      size="small"
      min=${0.1}
      max=${10}
      step=${0.1}
      value=${this.value !== null? this.value: ""}
      placeholder="*"
      @sl-change=${this.handleChange}
    >
    </sl-input>`
  }

	render() {
    return html`
      ${this.HeightInput()}
    `
  }
}