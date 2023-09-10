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

  @property({type: String, attribute: true, reflect: true})
  defaultFontSize: string = "14pt"

  @property({type: String, attribute: true, reflect: true})
  defaultFontFamily: string = "Arial"

  private _fontFamily: string

  @property({type: Boolean, attribute: true})
  recommendedOnly: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  get fontFamilyIndefinite() {
    return this._fontFamilyIndefinite
  }

  set fontFamilyIndefinite(value: boolean) {
    this._fontFamilyIndefinite = value
    this.showFontFamilyMultiple = value
  }

  _fontFamilyIndefinite: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  get fontSizeIndefinite() {
    return this._fontSizeIndefinite
  }

  set fontSizeIndefinite(value: boolean) {
    this._fontSizeIndefinite = value
    this.showFontSizeMultiple = value
  }

  _fontSizeIndefinite: boolean = false

	static get styles() {
		return css`

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
      }

      #font-size sl-option::part(base) {
        padding: 4px;
        padding-left: 8px;
      }

      #font-size sl-option::part(checked-icon) {
        display: none;
      }   

      ww-button {
        width: min-content;
      }

      ww-button {
        --icon-size: 24px;
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

      ww-combobox::part(base) {
        padding: 0 0 0 var(--sl-spacing-2x-small);
      }

      #font-family::part(input) {
        display: none;
      }
      
      ww-combobox::part(input) {
        width: 100%;
        padding: 0;
      }

      ww-combobox:not([open])::part(base) {
        background: none;
      }

      .prefix, #font-size::part(input) {
        font-size: 0.7rem;
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

  @property({type: Boolean, state: true})
  showFontFamilyMultiple = false

  
  @property({type: Boolean, state: true})
  showFontSizeMultiple = false

	render() {
    return html`<div part="base">
      <ww-combobox suggestions inputDisabled id="font-family" size="small" .value=${this.fontFamily ?? this.defaultFontFamily} defaultValue=${this.defaultFontFamily} @sl-change=${(e: any) => this.fontFamily = e.target.value.replaceAll("_", " ")}>
        <span class="prefix" slot="prefix" style=${`font-family: "${this.fontFamily}"`}>${this.fontFamily ?? this.defaultFontFamily}</span>
        ${this.recommendedFonts.map(this.FontOption)}
        ${this.recommendedOnly? null: html`
          <sl-divider></sl-divider>
          ${this.notRecommendedFonts.map(this.FontOption)}
        `}
        <!--<ww-button slot="label" class="label" variant="icon" icon="typography"></ww-button>-->
      </ww-combobox>
      <ww-combobox suggestions id="font-size" size="small" .value=${(this.fontSize ?? this.defaultFontSize) + (this.fontSizeIndefinite && this.showFontSizeMultiple? "+": "")} @focus=${() => this.showFontSizeMultiple = false} @blur=${() => this.showFontSizeMultiple = true} defaultValue=${this.defaultFontSize} @sl-change=${(e: any) => this.fontSize = e.target.value}>
        ${this.allFontSizes.map(size => html`<sl-option
          ?data-recommended=${FONT_SIZES.includes(size)}
          style=${`font-size: ${size}`}
          value=${`${size}pt`}>
          ${size}
        </sl-option>`)}
      </ww-combobox>
      <ww-button size="small" variant="icon" @click=${(e: any) => this.fontSize = this.getNextFontSize()} icon="text-decrease"></ww-button>
      <ww-button size="small" variant="icon"  @click=${(e: any) => this.fontSize = this.getNextFontSize(true)} icon="text-increase"></ww-button>
      <!--
      <ww-button variant="icon" icon="dash-square"></ww-button>
      <ww-button variant="icon" icon="plus-square"></ww-button>
      -->
    </div>`
  }
}