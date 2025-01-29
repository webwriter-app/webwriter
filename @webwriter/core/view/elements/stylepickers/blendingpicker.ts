import { LitElement, html, css, TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { LitPickerElement } from "."
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"
import { ifDefined } from "lit/directives/if-defined.js"

@customElement("ww-blending-picker")
export class BlendingPicker extends LitPickerElement<(typeof PICKER_COMMAND_PROPERTIES)["blendingStyle"][number]> {

  propertyNames = PICKER_COMMAND_PROPERTIES.blendingStyle
  
  static styles = css`
    :host {
      display: contents;
    }

    :host(:not([advanced])) .advanced {
      display: none !important;
    }

    h2 {
      position: relative;
      text-align: right;
      font-size: 1rem;
      font-weight: bold;
      margin-bottom: 0.125rem;
      margin-top: 0;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
      &::after {
        content: "";
        display: block;
        background: black;
        width: 100%;
        height: 2px;
        position: absolute;
        top: 100%;
      }
    }

    section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      & form {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
    }

    [name=text-wrap] {

      &::part(base) {
        width: 100%;
      }

      &::part(label) {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }

      & sl-select {
        width: 90px;
      }

      & sl-option::part(checked-icon) {
        display: none;
      }
    }

    sl-radio-group::part(button-group), sl-radio-group::part(button-group__base), sl-radio-button {
      width: 100%;
    }

    sl-icon {
      font-size: 1.25rem;
    }

    [name=text-decoration-style] sl-icon {
      font-size: 0.7rem;
    }

    .color-input {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5em;
      font-size: var(--sl-input-label-font-size-small);
    }

    sl-range {
      width: 92.5%;
      &::part(form-control-label) {
        font-size: var(--sl-input-label-font-size-small);
      }
    }

    [name]:has(css-global-input[value="none"]) {
      --sl-color-primary-600: var(--sl-color-neutral-600);
      --sl-color-primary-700: var(--sl-color-neutral-700);
      --sl-input-icon-color: var(--sl-color-neutral-600);
    }

    [name]:has(css-global-input:not(:is([value="none"], [value="custom"]))) {
      --sl-color-primary-600: var(--sl-color-amber-600);
      --sl-color-primary-700: var(--sl-color-amber-700);
      --sl-input-icon-color: var(--sl-color-amber-600);
    }

    [name=color-scheme]::part(label) {
      display: flex;
      justify-content: space-between;
    }

    sl-checkbox[slot=label] {
      align-self: center;
      margin-bottom: 0;
      &::part(base) {
        display: flex;
        align-items: center;
      }
    }

  `

  render() {
    return html`<section>
      <div class="color-input">
        <sl-color-picker value=${this.getCurrentValue("color")} size="small" id="color" name="color" hoist no-format-toggle></sl-color-picker>
        <label for="color">
          <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("color")}>${msg("Color")}</css-global-input>
        </label>
      </div>
      <div class="color-input">
        <sl-color-picker value=${this.getCurrentValue("background-color")} size="small" id="background" name="background-color" hoist no-format-toggle></sl-color-picker>
        <label for="background">
          <css-global-input value=${this.getGlobalValue("background-color")} slot="label" ?disabled=${!this.advanced}>${msg("Background")}</css-global-input>
        </label>
      </div>
      <div id="color-scheme" class="advanced">
        <ww-combobox size="small" name="color-scheme" value=${this.getCurrentValue("color-scheme").replace(/\s+only\s+/, "") || "normal"} placeholder="normal">
          <sl-option value="normal">${msg("Normal")}</sl-option>
          <sl-option value="light">${msg("Light")}</sl-option>
          <sl-option value="dark">${msg("Dark")}</sl-option>
          <css-global-input value=${this.getGlobalValue("color-scheme")} slot="label" ?disabled=${!this.advanced}>${msg("Color scheme")}</css-global-input>
          <sl-checkbox slot="label" size="small" name="color-scheme-only" ?checked=${this.getCurrentValue("color-scheme").split(/\s+/).includes("only")}>
          ${msg("Force")}
        </sl-checkbox>
        </ww-combobox>
      </div>
      <sl-checkbox size="small" class="advanced" name="print-color-adjust" data-defaultValue="economy" data-otherValue="exact" ?checked=${this.getCurrentValue("print-color-adjust") === "exact"}>
        <css-global-input value=${this.getGlobalValue("print-color-adjust")} ?disabled=${!this.advanced}>${msg("Exact print colors")}</css-global-input>
      </sl-checkbox>
      <sl-select class="advanced" size="small" name="visibility" value=${this.getCurrentValue("visibility") || "visible"}>
        <sl-option value="visible">${msg("Visible")}</sl-option>
        <sl-option value="hidden">${msg("Hidden")}</sl-option>
        <sl-option value="collapse">${msg("Collapse")}</sl-option>
        <css-global-input value=${this.getGlobalValue("visibility")} slot="label" ?disabled=${!this.advanced}>${msg("Visibility")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="content-visibility" value=${this.getCurrentValue("content-visibility") || "visible"}>
        <sl-option value="visible">${msg("Visible")}</sl-option>
        <sl-option value="hidden">${msg("Hidden")}</sl-option>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <css-global-input value=${this.getGlobalValue("content-visibility")} slot="label" ?disabled=${!this.advanced}>${msg("Content visibility")}</css-global-input>
      </sl-select>
      <sl-range size="small" name="opacity" min="0" step="0.01" max="1" value=${this.getCurrentValue("opacity") || "1"}>
        <css-global-input value=${this.getGlobalValue("opacity")} slot="label" ?disabled=${!this.advanced}>${msg("Opacity")}</css-global-input>
      </sl-range>
      <sl-select class="advanced" size="small" name="mix-blend-mode"  value=${this.getCurrentValue("mix-blend-mode") || "normal"}>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="multiply">${msg("Multiply")}</sl-option>
        <sl-option value="screen">${msg("Screen")}</sl-option>
        <sl-option value="overlay">${msg("Overlay")}</sl-option>
        <sl-option value="darken">${msg("Darken")}</sl-option>
        <sl-option value="lighten">${msg("Lighten")}</sl-option>
        <sl-option value="color-dodge">${msg("Color dodge")}</sl-option>
        <sl-option value="color-burn">${msg("Color burn")}</sl-option>
        <sl-option value="hard-light">${msg("Hard light")}</sl-option>
        <sl-option value="soft-light">${msg("Soft light")}</sl-option>
        <sl-option value="difference">${msg("Difference")}</sl-option>
        <sl-option value="exclusion">${msg("Exclusion")}</sl-option>
        <sl-option value="hue">${msg("Hue")}</sl-option>
        <sl-option value="saturation">${msg("Saturation")}</sl-option>
        <sl-option value="color">${msg("Color")}</sl-option>
        <sl-option value="luminosity">${msg("Luminosity")}</sl-option>
        <sl-option value="plus-darker">${msg("Plus darker")}</sl-option>
        <sl-option value="plus-lighter">${msg("Plus lighter")}</sl-option>
        <css-global-input value=${this.getGlobalValue("mix-blend-mode")} slot="label" ?disabled=${!this.advanced}>${msg("Mix blend mode")}</css-global-input>
      </sl-select>
      <ww-css-property-input class="advanced" size="small" name="background-blend-mode" value=${this.getCurrentValue("background-blend-mode") || "normal"}>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="multiply">${msg("Multiply")}</sl-option>
        <sl-option value="screen">${msg("Screen")}</sl-option>
        <sl-option value="overlay">${msg("Overlay")}</sl-option>
        <sl-option value="darken">${msg("Darken")}</sl-option>
        <sl-option value="lighten">${msg("Lighten")}</sl-option>
        <sl-option value="color-dodge">${msg("Color dodge")}</sl-option>
        <sl-option value="color-burn">${msg("Color burn")}</sl-option>
        <sl-option value="hard-light">${msg("Hard light")}</sl-option>
        <sl-option value="soft-light">${msg("Soft light")}</sl-option>
        <sl-option value="difference">${msg("Difference")}</sl-option>
        <sl-option value="exclusion">${msg("Exclusion")}</sl-option>
        <sl-option value="hue">${msg("Hue")}</sl-option>
        <sl-option value="saturation">${msg("Saturation")}</sl-option>
        <sl-option value="color">${msg("Color")}</sl-option>
        <sl-option value="luminosity">${msg("Luminosity")}</sl-option>
        <sl-option value="plus-darker">${msg("Plus darker")}</sl-option>
        <sl-option value="plus-lighter">${msg("Plus lighter")}</sl-option>
        <css-global-input value=${this.getGlobalValue("background-blend-mode")} slot="label" ?disabled=${!this.advanced}>${msg("Background blend mode")}</css-global-input>
      </ww-css-property-input>
      <ww-css-property-input class="advanced" name="backdrop-filter" value=${this.getCurrentValue("backdrop-filter") || "none"}>
        <css-global-input value=${this.getGlobalValue("backdrop-filter")} slot="label" ?disabled=${!this.advanced}>${msg("Backdrop filter")}</css-global-input>
      </ww-css-property-input>
      <!--<css-filter-input name="backdrop-filter" label=${msg("Backdrop Filter")} value=${this.getCurrentValue("backdrop-filter") || "none"}></css-filter-input>-->
      <ww-css-property-input class="advanced" name="filter" value=${this.getCurrentValue("filter") || "none"}>
        <css-global-input value=${this.getGlobalValue("filter")} slot="label" ?disabled=${!this.advanced}>${msg("Filter")}</css-global-input>
      </ww-css-property-input>
      <!--<css-filter-input name="filter" label=${msg("Filter")}></css-filter-input>-->
      <sl-switch size="small" class="advanced" name="isolation" data-defaultValue="auto" data-otherValue="isolate" ?checked=${this.getCurrentValue("isolation") === "isolate"}>
        <css-global-input value=${this.getGlobalValue("isolation")} ?disabled=${!this.advanced}>${msg("Isolate")}</css-global-input>
      </sl-switch>
    </section>`
  }
}