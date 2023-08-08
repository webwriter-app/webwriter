import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"


type CSSValue<T extends string> = "initial" | "inherit" | "unset" | "revert" | "revert-layer" | T

type CSSTextAlignValue = CSSValue<"left" | "center" | "right" | "justify">

@localized()
@customElement("ww-alignmentpicker")
export class AlignmentPicker extends LitElement {

  static textAlignValues = ["left", "center", "right", "justify"] as const

  @property({type: String, attribute: true, reflect: true})
  value: CSSTextAlignValue = "center"

	static get styles() {
		return css`

      :host {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
      }

      ww-button[active] {
        background: var(--sl-color-gray-300);
        border-radius: var(--sl-border-radius-small);
      }
    `
  }

  handleClick = (e: {target: HTMLElement & {value: string}}) => {
    this.value =  e.target.id as CSSTextAlignValue
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  AlignmentButton = (dir: CSSTextAlignValue) => {
    return html`<ww-button id=${dir} variant="icon" ?active=${this.value === dir} icon=${`align-${dir !== "justify"? dir: "justified"}`} @click=${this.handleClick}></ww-button>`
  }

	render() {
    return AlignmentPicker.textAlignValues.map(this.AlignmentButton)
  }
}