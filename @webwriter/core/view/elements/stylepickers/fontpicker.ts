import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { range } from "../../../model/utility"
import { ifDefined } from "lit/directives/if-defined.js"
import { classMap } from "lit/directives/class-map.js"


const GENERIC_FONT_FAMILY = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy"
]

export const WEB_SAFE_FONTS = [
  {name: 'Arial', type: "sans-serif"},
  {name: '"Arial Black"', type: "sans-serif"},
  {name: '"Arial Narrow"', type: "sans-serif"},
  {name: 'Tahoma', type: "sans-serif"},
  {name: '"Trebuchet MS"', type: "sans-serif"},
  {name: 'Verdana', type: "sans-serif"},
  {name: 'Georgia', type: "serif"},
  {name: '"Lucida Bright"', type: "serif"},
  {name: 'Palatino', type: "serif"},
  {name: '"Times New Roman"', type: "serif"},
  {name: '"Courier New"', type: "monospace"}
]

export const FONT_SIZES = [
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

  static Indefinite = Symbol("INDEFINITE")
  static Default = Symbol("DEFAULT")

  static get labels() {
    return {
      "font-size": msg("Size"),
      "font-family": msg("Font Family")
    }
  }

  get allFontSizes() {
    return range(this.minFontSize, this.maxFontSize)
  }

  @property({type: Number, attribute: true})
  minFontSize: number = 0

  @property({type: Number, attribute: true})
  maxFontSize: number = 128

  private _fontSize: string | symbol

  get fontSizes(): (string | symbol)[] {
    return [this._fontSize]
  }

  set fontSizes(value: (string | symbol)[]) {
    if(value.length > 1) {
      this.fontSize = FontPicker.Indefinite
    }
    else if(value.length === 0) {
      this.fontSize = FontPicker.Default
    }
    else {
      this.fontSize = value[0]
    }
  }

  @property({attribute: true, reflect: true})
  get fontSize(): string | undefined {
    return typeof this._fontSize === "string"? this._fontSize: this._fontSize?.description
  }

  set fontSize(value: string | symbol) {
    const oldValue = this.fontSize
    this._fontSize = value
    this.requestUpdate("fontSize", oldValue)
  }

  get fontFamilies(): (string | symbol)[] {
    return [this._fontFamily]
  }

  set fontFamilies(value: (string | symbol)[]) {
    if(value.length > 1) {
      this.fontFamily = FontPicker.Indefinite
    }
    else if(value.length === 0) {
      this.fontFamily = FontPicker.Default
    }
    else {
      this.fontFamily = value[0]
    }
  }

  @property({attribute: true, reflect: true})
  get fontFamily(): string | undefined {
    return typeof this._fontFamily === "string"? this._fontFamily: this._fontFamily?.description
  }

  set fontFamily(value: string | symbol) {
    const oldValue = this.fontFamily
    this._fontFamily = value
    this.requestUpdate("fontFamily", oldValue)
  }

  changeFontFamily(value: string) {
    if(this.fontFamily !== value) {
      this.fontFamily = value
      this.emitChangeFontFamily(value)
    }
  }

  changeFontSize(value: string) {
    if(this.fontSize !== value) {
      this.fontSize = value
      this.emitChangeFontSize(value)
    }
  }

  @property({type: String, attribute: true, reflect: true})
  defaultFontSize: string = "14pt"

  @property({type: String, attribute: true, reflect: true})
  defaultFontFamily: string = "Arial"

  private _fontFamily: string | (typeof FontPicker)["Default"] | (typeof FontPicker)["Indefinite"]

  @property({type: Boolean, attribute: true})
  recommendedOnly: boolean = false

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

      sl-option.default {

        & small {
          font-size: 0.625rem;
          text-transform: capitalize;
        }

        & div {
          font-size: 0.75rem;
        }
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

      sl-option:not([data-recommended]):not(.default):not(.indefinite) {
        display: none;
      }

      ww-combobox::part(base) {
        padding: 0 0 0 var(--sl-spacing-2x-small);
      }

      ww-combobox[data-changed]::part(base) {
        background: var(--sl-color-primary-100) !important;
      }

      #font-family::part(input) {
        display: none;
      }
      
      ww-combobox::part(input) {
        width: 100%;
        padding: 0;
      }

      ww-combobox::part(trigger) {
        padding-right: 0;
      }

      ww-combobox:not([open])::part(base) {
        background: none;
      }

      .prefix, #font-size::part(input) {
        font-size: 0.7rem;
      }

      sl-option::part(base) {
        padding: var(--sl-spacing-2x-small) !important;
      }

      sl-option::part(label) {
        display: flex;
        font-size: 0.75rem;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      sl-option.prefix::part(label) {
        padding: 0 !important;
      }

      sl-option::part(checked-icon) {
        display: none;
      }

      #font-size:focus-within .prefix {
        display: none;
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

  FontOption = (value: string, prefix=false, type:"font-family"|"font-size"="font-family") => {
    const classes = {prefix, indefinite: value === "INDEFINITE", default: value === "DEFAULT"}
    if(value === "INDEFINITE") {
      return html`<sl-option slot=${prefix? "prefix": ""} class=${classMap(classes)} value=${FontPicker.Indefinite.description!}></sl-option>`
    }
    else if(value === "DEFAULT") {
      return html`<sl-option slot=${prefix? "prefix": ""} class=${classMap(classes)} value=${FontPicker.Default.description!} data-recommended>
        <small>${prefix? FontPicker.labels[type]: msg("Default")}</small>
      </sl-option>`
    }
    else return html`
      <sl-option slot=${prefix? "prefix": ""} class=${classMap(classes)} ?data-recommended=${this.recommendedFonts.includes(value)} style=${`font-family: ${value}`} value=${value.replaceAll(" ", "_")}>${value.replaceAll('"', "")}</sl-option>
    `
  } 

  getNextFontSize(backwards=false) {
    let value
    if(this.fontSize === "DEFAULT") {
      value = this.defaultFontSize
    }
    else if(this.fontSize === "INDEFINITE") {
      value = this.fontSizes.at(-1) as string
    }
    else {
      value = (this.fontSize ?? this.defaultFontSize ?? "18pt") as string
    }
    const valueAsInt = parseInt(value)
    const iNextLarger = FONT_SIZES.findIndex(size => valueAsInt < size)
    const exactMatch = FONT_SIZES.includes(valueAsInt)
    const exactMatchLast = FONT_SIZES.at(-1) === valueAsInt
    const next = backwards
      ? valueAsInt > FONT_SIZES.at(-1)!
        ? FONT_SIZES.at(-1)
        : (exactMatchLast? FONT_SIZES.at(-2): FONT_SIZES[exactMatch? iNextLarger - 2: iNextLarger - 1] ?? FONT_SIZES.at(0)!) 
      : FONT_SIZES[iNextLarger] ?? FONT_SIZES.at(-1)!
    return `${next}pt`
  }

  @property({type: Boolean, state: true})
  showFontFamilyMultiple = false

  
  @property({type: Boolean, state: true})
  showFontSizeMultiple = false

	render() {
    return html`<div part="base">
      <ww-combobox ?data-changed=${this.fontFamily !== "DEFAULT"} suggestions inputDisabled id="font-family" size="small" .value=${this.fontFamily ?? this.defaultFontFamily} defaultValue=${this.defaultFontFamily} @sl-change=${(e: any) => this.changeFontFamily(e.target.value.replaceAll("_", " "))}>
        ${this.FontOption(this.fontFamily ?? "DEFAULT", true)}
        ${this.FontOption("DEFAULT")}
        ${this.recommendedFonts.filter(name => name !== this.defaultFontFamily).map(name => this.FontOption(name))}
        ${this.recommendedOnly? null: html`
          <sl-divider></sl-divider>
          ${this.notRecommendedFonts.map(name => this.FontOption(name))}
        `}
        <!--<ww-button slot="label" class="label" variant="icon" icon="typography"></ww-button>-->
      </ww-combobox>
      <ww-combobox emptyValue="DEFAULT" ?data-changed=${this.fontSize !== "DEFAULT"} suggestions id="font-size" size="small" .value=${this.fontSize && (this.fontSize !== "DEFAULT")? this.fontSize: " "} @focus=${() => this.showFontSizeMultiple = false} @blur=${() => this.showFontSizeMultiple = true} defaultValue=${this.defaultFontSize} @sl-change=${(e: any) => {this.changeFontSize(e.target.value); this.requestUpdate("fontSize")}}>
        ${this.FontOption(this.fontSize ?? "DEFAULT", true, "font-size")}
        ${this.FontOption("DEFAULT", false, "font-size")}
        ${this.allFontSizes.map(size => html`<sl-option
          ?data-recommended=${FONT_SIZES.includes(size)}
          value=${`${size}pt`}>
          ${size}pt
        </sl-option>`)}
      </ww-combobox>
      <ww-button size="small" variant="icon" @click=${(e: any) => this.changeFontSize(this.getNextFontSize(true))} icon="text-decrease"></ww-button>
      <ww-button size="small" variant="icon" @click=${(e: any) => this.changeFontSize(this.getNextFontSize())} icon="text-increase"></ww-button>
      <!--
      <ww-button variant="icon" icon="dash-square"></ww-button>
      <ww-button variant="icon" icon="plus-square"></ww-button>
      -->
    </div>`
  }
}