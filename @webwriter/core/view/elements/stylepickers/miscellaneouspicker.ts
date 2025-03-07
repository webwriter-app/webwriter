import { LitElement, html, css, TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { LitPickerElement } from "."
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { CSSPropertySpecs } from "#model/index.js"

@customElement("ww-miscellaneous-picker")
export class MiscelleousPicker extends LitPickerElement {

  propertyNames = []
  
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

    #placeholder {
      font-style: italic;
      font-size: 0.75rem;
    }

  `

  render() {
    return html`<section>
      <div id="placeholder">${msg("No specific styles available")}</div>
      <ww-css-property-input style="display: none" size="small" class="advanced">
        <css-global-input slot="label">
            <ww-combobox size="small" placeholder="property-name">
                ${Object.keys(CSSPropertySpecs).filter(k => !k.startsWith("-")).map(key => html`<sl-option value=${key}>${key}</sl-option>`)}
            </ww-combobox>
            <span>:</span>
        </css-global-input>
      </ww-css-property-input>
    </section>`
  }
}