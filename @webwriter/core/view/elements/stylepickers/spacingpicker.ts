import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { MarginPicker } from "./marginpicker"

type CSSValue<T extends string> = "initial" | "inherit" | "unset" | "revert" | "revert-layer" | T

export abstract class SpacingPicker extends LitElement {

  readonly propertyKeys: Readonly<string[]>

  enabledKeys: string[]
  
  get labels(): Record<string, string> {
    return {}
  }

  get disabledKeys() {
    return this.propertyKeys.filter(k => !this.enabledKeys.includes(k))
  }

  enableGroup(key: typeof this.propertyKeys[number]) {
    const newKeys = [...new Set([...this.enabledKeys, key])]
    this.enabledKeys = newKeys.length < 4? newKeys: [...this.propertyKeys.slice(1)]
  }

  disableGroup(key: typeof this.propertyKeys[number]) {
    const set = new Set(this.enabledKeys)
    set.delete(key)
    const newKeys = [...set]
    this.enabledKeys = newKeys.length <= 3? [this.propertyKeys[0], ...newKeys.filter(nk => nk !== this.propertyKeys[0])]: newKeys
  }
  

	static get styles() {
		return css`

      :host {
        display: flex;
        align-items: center;
      }

      .group:not([data-enabled]) .input {
        display: none;
      }

      .group {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: center;
      }

      #border .lock {
        display: none;
      }

      .style-preview {
        width: 25px;
        border-bottom: 3px hidden black;
      }

      .unlocks {
        display: flex;
        flex-direction: row;
        grid-column: 1 / 3;
      }

      .unlocks ww-button::part(label) {
        padding: 0;
      }

      .group-label {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      ww-button {
        --icon-size: 24px;
      }

      .unlocks ww-button {
        --icon-size: 20px;
      }

      sl-input::part(base) {
        background: none;
        border: none;
        padding: 0;
      }

      sl-input::part(input) {
        width: 6ch;
        padding: 2px;
        text-align: right;
      }

      .unit-marker {
        margin-right: 4px;
      }

      sl-button::part(base)::part(label) {
        padding: 0;
      }
    `
  }

  handleChange(e: {target: HTMLElement & {value: string}}) {
    const key = e.target.id as typeof this.propertyKeys[number]
    // @ts-ignore
    this[key] =  e.target.value + "px"
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  
  WidthInput = (key: typeof this.propertyKeys[number]) => {
    return html`<sl-input
      id=${key}
      class="input width"
      type="number"
      size="small"
      min=${0}
      max=${100/* @ts-ignore */}
      value=${parseInt(this[key])}
      @sl-change=${this.handleChange}
    >
    <span class="unit-marker" slot="suffix">px</span>
    </sl-input>`
  }

  Group = (key: typeof this.propertyKeys[number]) => {
    return html`
      <div ?data-enabled=${this.enabledKeys.includes(key)} id=${key} class="group">
        ${this.WidthInput(key)}
      </div>
    `
  }

	render() {
    return html`
      ${this.enabledKeys.map(this.Group)}
    `
  }
}