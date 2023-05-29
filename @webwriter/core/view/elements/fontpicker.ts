import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

const GENERIC_FONT_FAMILY = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy"
]

const WEB_SAFE_FONTS = [
  "Arial",
  "Arial Black",
  "Arial Narrow",
  "Tahoma",
  "Trebuchet MS",
  "Verdana",
  "Georgia",
  "Lucida Bright",
  "Palatino",
  "Times New Roman",
  "Courier New"
]

const FONT_SIZES = [
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  18,
  20,
  22,
  24,
  26,
  28,
  36,
  48,
  72
]

@localized()
@customElement("ww-fontpicker")
export class FontPicker extends LitElement {

  @property({type: String, attribute: true})
  fontSize: string

  @property({type: String, attribute: true})
  fontFamily: string



	static get styles() {
		return css`
      sl-select:not([open])::part(combobox) {
        background: transparent;
      }

      sl-select[open]::part(combobox) {
        background: var(--sl-color-gray-200);
      }

      sl-select::part(combobox) {
        font: inherit;
      }

      sl-select::part(listbox) {
        background: var(--sl-color-gray-200);
        padding: 0;
      }

      [part=base] {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        max-width: 300px;
      }

      sl-option::part(base) {
        font-family: inherit;
        background: var(--sl-color-gray-200);
      }

      sl-option[aria-selected=true]::part(base) {
        background: var(--sl-color-primary-600);
      }

      sl-option::part(label) {
        color: inherit !important;
      }

      #font-family {
        flex-grow: 1;
        padding-right: 0.5ch;
      }

      #font-size {
        flex-basis: 8ch;
        flex-shrink: 0;
        flex-grow: 0;
        margin-right: auto;
        // padding-right: 1ch;
      }

      #font-size sl-option::part(base) {
        padding: 4px;
        padding-left: 8px;
      }

      #font-size sl-option::part(checked-icon) {
        display: none;
      }

      #font-size::part(combobox) {
        padding: 0 1ch;
      }

      sl-select::part(expand-icon) {
        font-size: 0.75rem;
        background: transparent;
      }      

      ww-button {
        width: min-content;
      }

      
      sl-select::part(combobox) {
        border-color: var(--sl-color-gray-800);
      }

      #font-family sl-icon {
        color: var(--sl-color-gray-600);
        font-size: 1rem;
      }

      sl-divider {
        --color: var(--sl-color-gray-800);
        margin: 5px 0;
      }
		`
	}

  emitChangeFontFamily = (value: string) => this.dispatchEvent(new CustomEvent(
    "ww-change-font-family",
    {detail: {value}, bubbles: true, composed: true}
  ))
  
  emitChangeFontSize = (value: string) => this.dispatchEvent(new CustomEvent(
    "ww-change-font-size",
    {detail: {value}, bubbles: true, composed: true}
  ))

  get recommendedFonts() {
    return WEB_SAFE_FONTS
  }

  get notRecommendedFonts() {
    return (WEBWRITER_ENVIRONMENT.fontFamilies ?? []).filter(font => !WEB_SAFE_FONTS.includes(font))
  }

  FontOption = (font: string) => html`
    <sl-option style=${`font-family: "${font}"`} value=${font.replaceAll(" ", "_")}>${font}</sl-option>
  `


	render() {
    return html`<div part="base">
      <sl-select id="font-family" size="small" value=${this.fontFamily.replaceAll(" ", "_")} style=${`font-family: "${this.fontFamily}"`} @sl-change=${(e: any) => this.emitChangeFontFamily(e.target.value.replaceAll("_", " "))}>
        ${this.recommendedFonts.map(this.FontOption)}
        <sl-divider></sl-divider>
        ${this.notRecommendedFonts.map(this.FontOption)}
      </sl-select>
      <sl-select id="font-size" size="small" value=${this.fontSize} @sl-change=${(e: any) => this.emitChangeFontSize(e.target.value)}>
        ${FONT_SIZES.map(size => html`<sl-option style=${`font-size: ${size}`} value=${`${size}pt`}>${size}</sl-option>`)}
      </sl-select>
      <!--
      <ww-button variant="icon" icon="dash-square"></ww-button>
      <ww-button variant="icon" icon="plus-square"></ww-button>
      -->
    </div>`
  }
}