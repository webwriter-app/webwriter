import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { filterObject } from "../../../utility"

type CSSValue<T extends string> = "initial" | "inherit" | "unset" | "revert" | "revert-layer" | T

type CSSBorderStyle = CSSValue<"none" | "hidden" | "dotted" | "dashed" | "solid" |"double" | "groove" | "ridge" | "inset" | "outset">

@localized()
@customElement("ww-borderpicker")
export class BorderPicker extends LitElement {

  static defaultWidth = "1px" as const
  static defaultStyle = "solid" as const
  static defaultColor = "black" as const

  static borderKeys = ["border", "borderLeft", "borderRight", "borderTop", "borderBottom"] as const

  static borderStyles = ["solid", "dotted", "dashed", "double"] as const

  @property({type: String, attribute: true})
  borderWidth: CSSValue<string> = BorderPicker.defaultWidth

  @property({type: String, attribute: true})
  borderStyle: CSSBorderStyle = BorderPicker.defaultStyle

  @property({type: String, attribute: true})
  borderColor: CSSValue<string> = BorderPicker.defaultColor

  @property({type: String, attribute: true})
  borderTopWidth: CSSValue<string> = BorderPicker.defaultWidth

  @property({type: String, attribute: true})
  borderTopStyle: CSSBorderStyle = BorderPicker.defaultStyle

  @property({type: String, attribute: true})
  borderTopColor: CSSValue<string> = BorderPicker.defaultColor

  @property({type: String, attribute: true})
  borderBottomWidth: CSSValue<string> = BorderPicker.defaultWidth

  @property({type: String, attribute: true})
  borderBottomStyle: CSSBorderStyle = BorderPicker.defaultStyle

  @property({type: String, attribute: true})
  borderBottomColor: CSSValue<string> = BorderPicker.defaultColor

  @property({type: String, attribute: true})
  borderLeftWidth: CSSValue<string> = BorderPicker.defaultWidth

  @property({type: String, attribute: true})
  borderLeftStyle: CSSBorderStyle = BorderPicker.defaultStyle

  @property({type: String, attribute: true})
  borderLeftColor: CSSValue<string> = BorderPicker.defaultColor

  @property({type: String, attribute: true})
  borderRightWidth: CSSValue<string> = BorderPicker.defaultWidth

  @property({type: String, attribute: true})
  borderRightStyle: CSSBorderStyle = BorderPicker.defaultStyle

  @property({type: String, attribute: true})
  borderRightColor: CSSValue<string> = BorderPicker.defaultColor

  get borderLeft() {
    return `${this.borderLeftWidth} ${this.borderLeftStyle} ${this.borderLeftColor}`.trim()
  }

  get borderRight() {
    return `${this.borderRightWidth} ${this.borderRightStyle} ${this.borderRightColor}`.trim()
  }

  get borderTop() {
    return `${this.borderTopWidth} ${this.borderTopStyle} ${this.borderTopColor}`.trim()
  }

  get borderBottom() {
    return `${this.borderBottomWidth} ${this.borderBottomStyle} ${this.borderBottomColor}`.trim()
  }

  set border(value: string) {
    const [width, style, color] = value.split(" ")
    BorderPicker.borderKeys.filter(k => k === "border").forEach(key => {
      this[`${key}Width`] = width
      this[`${key}Style`] = style as CSSBorderStyle
      this[`${key}Color`] = color
    })
  }

  set borderLeft(value: string) {
    const [width, style, color] = value.split(" ")
    this.borderLeftWidth = width
    this.borderLeftStyle = style as CSSBorderStyle
    this.borderLeftColor = color
  }

  set borderRight(value: string) {
    const [width, style, color] = value.split(" ")
    this.borderRightWidth = width
    this.borderRightStyle = style as CSSBorderStyle
    this.borderRightColor = color
  }

  set borderTop(value: string) {
    const [width, style, color] = value.split(" ")
    this.borderTopWidth = width
    this.borderTopStyle = style as CSSBorderStyle
    this.borderTopColor = color
  }

  set borderBottom(value: string) {
    const [width, style, color] = value.split(" ")
    this.borderBottomWidth = width
    this.borderBottomStyle = style as CSSBorderStyle
    this.borderBottomColor = color
  }


  @property({type: Array, attribute: false, state: true})
  enabledKeys: typeof BorderPicker.borderKeys[number][] = ["border"]

  get disabledKeys() {
    return BorderPicker.borderKeys.filter(k => !this.enabledKeys.includes(k))
  }

  enableGroup(key: typeof BorderPicker.borderKeys[number]) {
    const newKeys = [...new Set([...this.enabledKeys, key])]
    this.enabledKeys = newKeys.length < 4? newKeys: ["borderLeft", "borderRight", "borderTop", "borderBottom"]
  }

  disableGroup(key: typeof BorderPicker.borderKeys[number]) {
    const set = new Set(this.enabledKeys)
    set.delete(key)
    const newKeys = [...set]
    this.enabledKeys = newKeys.length <= 3? ["border", ...newKeys.filter(nk => nk !== "border")]: newKeys
  }
  

	static get styles() {
		return css`

      :host {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
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
        height: 20px;
        border-left: 3px hidden black;
        margin-right: 0;
      }

      .style-preview.option {
        display: inline;
      }

      .style-preview:not(.option) {
        position: relative;
        top: 0;
        left: 13px;
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

      sl-option::part(checked-icon) {
        display: none;
      }

      sl-option::part(base) {
        padding: 4px 0;
        text-align: center;
      }

      sl-select::part(listbox) {
        padding: 0;
      }

      sl-select:not([open])::part(combobox) {
        background: none;
        border: 1px solid transparent;
      }

      sl-select {
        width: 35px;
      }

      sl-select::part(combobox) {
        padding-left: 2px;
        padding-right: 2px;
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

      sl-color-picker {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-left: 1ch;
      }

      sl-color-picker::part(trigger)::before {
        height: 20px;
        margin-bottom: 0;
      } 

      sl-color-picker::part(trigger) {
        font-size: 0px;
        height: 20px;
        width: 20px;
        display: flex;
        justify-content: center;
        align-items: center;
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

      .unit-marker {
        margin-right: 4px;
      }

      sl-button::part(base)::part(label) {
        padding: 0;
      }
    `
  }

  get labels() {
    return {
      "border": "border-outer",
      "borderLeft": "border-left",
      "borderRight": "border-right",
      "borderTop": "border-top",
      "borderBottom": "border-bottom"
    }
  }

  handleChange(e: {target: HTMLElement & {value: string}}) {
    const key = e.target.id as typeof BorderPicker.borderKeys[number]
    this[key] = key.endsWith("Width")? e.target.value + "px": e.target.value
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  
  WidthInput = (key: `${typeof BorderPicker.borderKeys[number]}Width`) => {
    return html`<sl-input
      id=${key}
      class="input width"
      type="number"
      size="small"
      min=${0}
      max=${800}
      value=${parseInt(this[key])}
      @sl-change=${this.handleChange}
    >
    <span class="unit-marker" slot="suffix">px</span>
    </sl-input>`
  }

  StyleInput = (key: `${typeof BorderPicker.borderKeys[number]}Style`) => {
    return html`<sl-select
      id=${key}
      class="input style"
      value=${this[key]}
      size="small"
      @sl-change=${this.handleChange}
    >
      ${BorderPicker.borderStyles.map(bs => html`<sl-option value=${bs}>
        <div class="style-preview option" style=${"border-left-style: " + bs}></div>
      </sl-option>`)}
      <div slot="prefix" class="style-preview" style=${"border-left-style: " + this[key]}></div>
    </sl-select>`
  }

  ColorInput = (key: `${typeof BorderPicker.borderKeys[number]}Color`) => {
    return html`<sl-color-picker
      id=${key}
      class="input color"
      value=${this[key]}
      @sl-change=${this.handleChange}
    ></sl-color-picker>`
  }

  Group = (key: typeof BorderPicker.borderKeys[number]) => {
    return html`
      <div ?data-enabled=${this.enabledKeys.includes(key)} id=${key} class="group">
        ${this.WidthInput(`${key}Width`)}
        ${this.StyleInput(`${key}Style`)}
        ${this.ColorInput(`${key}Color`)}
      </div>
      <div class="group-label">
        <ww-button variant="icon" icon=${this.labels[key]}></ww-button>
      </div>
    `
  }

	render() {
    return html`
      ${this.enabledKeys.map(this.Group)}
    `
  }
}