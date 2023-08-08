import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { range } from "../../../utility"
import { ifDefined } from "lit/directives/if-defined.js"

const GENERIC_FONT_FAMILY = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy"
]

const WEB_SAFE_FONTS = [
  {name: "Arial", type: "sans-serif"},
  {name: "Arial Black", type: "sans-serif"},
  {name: "Arial Narrow", type: "sans-serif"},
  {name: "Tahoma", type: "sans-serif"},
  {name: "Trebuchet MS", type: "sans-serif"},
  {name: "Verdana", type: "sans-serif"},
  {name: "Georgia", type: "serif"},
  {name: "Lucida Bright", type: "serif"},
  {name: "Palatino", type: "serif"},
  {name: "Times New Roman", type: "serif"},
  {name: "Courier New", type: "monospace"}
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

  get allFontSizes() {
    return range(this.minFontSize, this.maxFontSize)
  }

  @property({type: Number, attribute: true})
  minFontSize: number = 0

  @property({type: Number, attribute: true})
  maxFontSize: number = 128

  @property({type: String, attribute: true, reflect: true})
  get fontSize() {
    return this._fontSize
  }

  set fontSize(value: string) {
    
    const oldValue = this.fontSize
    const factor = typeof value === "string" && value.includes("px")? 0.75: 1
    this._fontSize = String(Math.round(parseFloat(value) * factor)) + "pt"
    if(oldValue !== this.fontSize) {
      this.emitChangeFontSize(this.fontSize)
      this.requestUpdate("fontSize", oldValue)
    }
  }

  private _fontSize: string

  @property({type: String, attribute: true, reflect: true})
  get fontFamily() {
    return this._fontFamily
  }

  set fontFamily(value: string) {
    const oldValue = this.fontFamily
    this._fontFamily = value.split(",").at(0)!
    if(oldValue !== this._fontFamily) {
      this.emitChangeFontFamily(this.fontFamily)
      this.requestUpdate("fontFamily", oldValue)
    }
  }

  @property({type: Number, attribute: true, reflect: true})
  defaultFontSize: number = 14

  @property({type: String, attribute: true, reflect: true})
  defaultFontFamily: string = "Arial"

  private _fontFamily: string

  @property({type: Boolean, attribute: true})
  recommendedOnly: boolean = false

	static get styles() {
		return css`
      sl-select:not([open])::part(combobox) {
        background: transparent;
      }

      sl-select::part(combobox) {
        font: inherit;
      }

      sl-select::part(listbox) {
        padding: 0;
      }

      [part=base] {
        display: grid;
        grid-template-columns: 1fr min-content min-content;
        gap: 3px;
      }

      sl-option::part(base) {
        font-family: inherit;
      }

      sl-option[aria-selected=true]::part(base) {
        background: var(--sl-color-primary-600);
      }

      sl-option::part(label) {
        color: inherit !important;
      }

      #font-family {
        flex-grow: 1;
        grid-column: span 3;
        position: relative;
      }

      #font-size {
        max-width: 10ch;
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

      ww-button {
        --icon-size: 24px;
      }

      
      sl-select::part(combobox) {
        border-color: var(--sl-color-gray-400);
      }

      sl-select::part(display-input) {
        z-index: 2;
      }

      sl-select::part(expand-icon) {
        margin: 0;
      }

      #font-family sl-icon {
        color: var(--sl-color-gray-600);
        font-size: 1rem;
      }

      sl-divider {
        --color: var(--sl-color-gray-800);
        margin: 5px 0;
      }

      .label {
        display: none;
        position: absolute;
        top: 6px;
        left: 3px;
        color: var(--sl-color-gray-600);
        z-index: 1;
        --icon-size: 16px;
      }

      sl-option:not([data-recommended]) {
        display: none;
      }

      #font-family::part(display-input) {
        display: none;
      }

      #font-family::part(prefix) {
        flex: unset;
        flex-grow: 1;
      }

      #font-family .prefix {
        white-space: nowrap;
        text-overflow: ellipsis;
        max-width: 100%;
        font-size: 0.8rem;
      }

      #font-family::part(combobox) {
        padding-left: 6px;
        padding-right: 6px;
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
    return WEB_SAFE_FONTS.map(font => font.name)
  }

  get notRecommendedFonts() {
    return (WEBWRITER_ENVIRONMENT.fontFamilies ?? []).filter(font => !WEB_SAFE_FONTS.map(font => font.name).includes(font))
  }

  FontOption = (font: string) => html`
    <sl-option ?data-recommended=${this.recommendedFonts.includes(font)} style=${`font-family: "${font}"`} value=${font.replaceAll(" ", "_")}>${font}</sl-option>
  `

  getNextFontSize(backwards=false) {
    return String(parseInt(this.fontSize) + (backwards? 1: -1))
  }

	render() {
    return html`<div part="base">
      <sl-select id="font-family" size="small" value=${this.fontFamily?.replaceAll(" ", "_") ?? this.defaultFontFamily.replaceAll(" ", "_")} defaultValue=${this.defaultFontFamily} @sl-change=${(e: any) => this.fontFamily = e.target.value.replaceAll("_", " ")}>
        <span class="prefix" slot="prefix" style=${`font-family: "${this.fontFamily}"`}>${this.fontFamily}</span>
        ${this.recommendedFonts.map(this.FontOption)}
        ${this.recommendedOnly? null: html`
          <sl-divider></sl-divider>
          ${this.notRecommendedFonts.map(this.FontOption)}
        `}
        <!--<ww-button slot="label" class="label" variant="icon" icon="typography"></ww-button>-->
      </sl-select>
      <sl-select id="font-size" size="small" value=${this.fontSize ?? this.defaultFontSize}  defaultValue=${this.defaultFontSize} @sl-change=${(e: any) => this.fontSize = e.target.value}>
        ${this.allFontSizes.map(size => html`<sl-option
          ?data-recommended=${FONT_SIZES.includes(size)}
          style=${`font-size: ${size}`}
          value=${`${size}pt`}>
          ${size}
        </sl-option>`)}
      </sl-select>
      <ww-button variant="icon" @click=${(e: any) => this.fontSize = this.getNextFontSize()} icon="text-decrease"></ww-button>
      <ww-button variant="icon"  @click=${(e: any) => this.fontSize = this.getNextFontSize(true)} icon="text-increase"></ww-button>
      <!--
      <ww-button variant="icon" icon="dash-square"></ww-button>
      <ww-button variant="icon" icon="plus-square"></ww-button>
      -->
    </div>`
  }
}