import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

const props = ["background", "background-attachment", "background-clip", "background-color", "background-image", "background-origin", "background-position", "background-repeat", "background-size", "background-position-x", "background-position-y"] as const

@localized()
@customElement("ww-backgroundpicker")
export class BackgroundPicker extends LitElement {

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


	render() {
    return html`
      <!-- Color OR Image -->
      <sl-color-picker name="backgroundColor"  label=${msg("Background Color")}
        value=${this._value["background-color"] ?? "transparent"}
        @sl-change=${(e: any) => this.setValueField("background-color", e.target.  value)}
      ></sl-color-picker>
      <ww-urlfileinput name="backgroundImage"  label=${msg("Background Image")}></ww-urlfileinput>
      <sl-select name="backgroundOrigin" label=${msg("Background Origin")}>
        <sl-option value="border-box">${msg("Border Box")}</sl-option>
        <sl-option value="padding-box">${msg("Padding Box")}</sl-option>
        <sl-option value="content-box">${msg("Content Box")}</sl-option>
      </sl-select>
      <ww-combobox name="backgroundAttachment" label=${msg("Background Attachment")} suggestions>
        <sl-option value="fixed">${msg("Fixed")}</sl-option>
        <sl-option value="local">${msg("Local")}</sl-option>
        <sl-option value="scroll">${msg("Scroll")}</sl-option>
      </ww-combobox>
      <sl-select name="backgroundClip" label=${msg("Background Clip")} value="padding-box">
        <sl-option value="border-box">${msg("Border Box")}</sl-option>
        <sl-option value="padding-box">${msg("Padding Box")}</sl-option>
        <sl-option value="content-box">${msg("Content Box")}</sl-option>
        <sl-option value="text">${msg("Text")}</sl-option>
      </sl-select>
    `
  }
}