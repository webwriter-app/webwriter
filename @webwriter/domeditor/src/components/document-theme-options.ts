import {LitElement, css, html} from "lit"
import type {ElementStyleState} from "../editor-bridge"
import {documentThemeOptions} from "../document-theme-options"
import {fontFamilyOptions, textColorOptions} from "../marks"
import {colorHex, defaultThemeAccents, themeAccentProperties} from "../css-color"
import "./style-combobox"
import "./ribbon-combobox"
import "./element-style-editor"
import type {StyleCombobox} from "./style-combobox"
import "./document-theme-presets"

/** Controls and browser-local presets for the authored document overrides. */
export class DocumentThemeOptions extends LitElement {
  static properties = {state: {attribute: false}}
  static styles = css`
    :host { display: block; color: #2f3742; font: .68rem/1.2 system-ui, sans-serif; }
    .options { display: grid; gap: .4rem; }
    .option { display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); align-items: center; gap: .35rem; }
    .option > span { white-space: nowrap; }
    .palette-fields { display: flex; min-width: 0; height: 1.7rem; padding-inline: 2px; border: 1px solid #c5ccd5; border-radius: 4px; overflow: hidden; }
    .palette-fields input { flex: 1 1 0; width: 0; min-width: 0; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
    .palette-fields input::-webkit-color-swatch-wrapper { padding: 3px 1px; }
    .palette-fields input::-webkit-color-swatch { border: 0; }
    .palette-fields input::-moz-color-swatch { border: 0; }
    .option-label { display: flex; align-items: center; justify-content: space-between; min-width: 0; }
    .option-clear { flex: none; border: 0; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
    .option-clear:hover { background: #e8eef5; }
    .option-clear:focus-visible { outline: 2px solid #b9d7f5; }
    .palette-fields:hover { border-color: #8eb6df; background: #eef4fb; }
    .palette-fields input:hover { background: #dcecff; }
    style-combobox, ribbon-combobox { min-width: 0; width: 100%; }
    style-combobox { --style-combobox-popup-width: 10rem; --style-combobox-popup-fallbacks: flip-block, flip-inline, flip-block flip-inline; }
  `
  state!: ElementStyleState
  private change(styles: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent("element-style-change", {detail: {styles}, bubbles: true, composed: true}))
  }
  private setOption(option: typeof documentThemeOptions[number], value: string) {
    value = value.trim()
    if(value && !CSS.supports(option.property, value)) return false
    this.change({[option.name]: value ? {value, priority: this.state.inline[option.name]?.priority ?? ""} : null})
    return true
  }
  render() {
    const inline = Object.fromEntries([["color", this.state.inline["--ww-text-color"]],
      ["background-color", this.state.inline["background-color"]]].filter(([, value]) => value))
    const colorState = {...this.state, target: null, inline, authoredProperties: Object.keys(inline)}
    return html`<div class="option"><span class="option-label">Palette ${themeAccentProperties.some(name => this.state.inline[name]) ? html`<button class="option-clear" type="button" aria-label="Clear palette" title="Clear palette" @click=${() => this.change(Object.fromEntries(themeAccentProperties.map(name => [name, null])))}>×</button>` : ""}</span>
        <div class="palette-fields" role="group" aria-label="Palette colors">
          ${themeAccentProperties.map((name, index) => html`<input type="color" aria-label=${`Palette color ${index + 1}`} data-ribbon-input-persistent
            .value=${colorHex(this.state.inline[name]?.value ?? defaultThemeAccents[index], defaultThemeAccents[index])}
            @change=${(event: Event) => this.change({[name]: {value: (event.currentTarget as HTMLInputElement).value, priority: this.state.inline[name]?.priority ?? ""}})}>`)}
        </div>
      </div><element-style-editor mode="compact" orientation="vertical" .propertyNames=${["color", "background-color"]}
      .state=${colorState} @element-style-change=${(event: CustomEvent<{property?: string, mutation?: unknown, styles?: Record<string, unknown>}>) => {
        event.stopPropagation()
        const entries = event.detail.styles ?? (event.detail.property ? {[event.detail.property]: event.detail.mutation} : {})
        this.change(Object.fromEntries(Object.entries(entries).map(([name, mutation]) => [name === "color" ? "--ww-text-color" : name, mutation])))
      }}></element-style-editor><div class="options">
      ${documentThemeOptions.filter(option => option.name !== "--ww-text-color").map(option => {
        const value = this.state.inline[option.name]?.value ?? ""
        const font = option.property === "font-family"
        const unit = option.name === "--ww-font-size" || option.name === "--ww-page-max" ? "px"
          : option.name === "--ww-block-spacing" ? "em" : "rem"
        const dimension = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]+)$/i)
        // Preserve existing non-pixel values and expressions while showing a
        // suffix for simple dimensions, just like the compact Style fields.
        const suffix = dimension?.[2] ?? (value ? "" : unit)
        const displayed = dimension ? dimension[1] : value
        const sizes = option.name === "--ww-font-size" ? ["12px", "14px", "16px", "20px", "24px"]
          : option.name === "--ww-page-max" ? ["720px", "960px", "1440px", "1920px", "2160px"]
          : option.name === "--ww-prose-max" ? ["25rem", "30rem", "40rem", "45rem", "60rem"]
          : option.name === "--ww-block-spacing" ? ["0.25em", "0.5em", "1em", "1.25em", "2em"]
          : ["0.25rem", "0.5rem", "1rem", "2rem", "3rem"]
        const choices = font ? fontFamilyOptions.filter(item => item.value).map(item => ({...item, description: item.value}))
          : sizes.map((value, index) => ({label: ["Tiny", "Small", "Medium", "Large", "Huge"][index], value, description: value}))
        return html`<div class="option"><span class="option-label">${option.label}${value ? html`<button class="option-clear" type="button" aria-label=${`Clear ${option.label}`} title=${`Clear ${option.label}`} @click=${() => this.change({[option.name]: null})}>×</button>` : ""}</span>${option.property === "color"
          ? html`<ribbon-combobox name="color" variant="color" .label=${option.label} .options=${textColorOptions} .value=${value}
              @ribbon-combobox-change=${(event: CustomEvent<{value: string}>) => {
                event.stopPropagation()
                this.setOption(option, event.detail.value)
              }}></ribbon-combobox>`
          : html`<style-combobox .label=${option.label} .showValue=${true} .persistent=${false} .options=${choices}
              .unit=${font ? "" : suffix} .value=${font ? value : displayed} placeholder="Default" @combobox-change=${(event: CustomEvent<{value: string}>) => {
                event.stopPropagation()
                const raw = event.detail.value.trim()
                const next = !font && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? `${raw}${suffix || unit}` : raw
                if(!this.setOption(option, next)) {
                  const combo = event.currentTarget as StyleCombobox
                  combo.value = font ? value : displayed
                  combo.close(true)
                }
              }}></style-combobox>`}</div>`
      })}
    </div>
    `
  }
}
if(!customElements.get("document-theme-options")) customElements.define("document-theme-options", DocumentThemeOptions)
