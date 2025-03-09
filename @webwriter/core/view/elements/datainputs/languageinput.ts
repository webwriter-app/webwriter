import { html, css, render } from "lit";
import { customElement, property } from "lit/decorators.js";

import { DataInput } from "./datainput";
import { Combobox } from "../ui/combobox";
import { Locale } from "#model";
import { SettingsController } from "#viewmodel/index.js";

@customElement("ww-languageinput")
export class LanguageInput extends Combobox implements DataInput {


  @property({reflect: true})
  autocomplete: string = "off"
  
  @property({reflect: true})
  autocorrect = "off" as const

  @property({type: Object, attribute: false}) // @ts-ignore
  value: Locale = new Locale(navigator.language)

  validityError?: string = undefined

  validate() {
    let validity = ""
    try {
      new Locale(this.value)
    }
    catch(err: any) {
      validity = err.message
      return false
    }
    finally {
      this.setCustomValidity(validity)
    }
  }

  static styles = [Combobox.styles, css`
    :host(:not(:focus-within)[data-invalid]) [part=input] {
      color: var(--sl-color-danger-600) !important;
    }
  `]

  ready = false


  updated() {
    this.ready = true
    const container = this.shadowRoot?.querySelector("slot:not([name])") as HTMLElement
    const infos = SettingsController.languageOptions
    container && render(Object.entries(infos).map(([code, {label}]) => html`
      <sl-option value=${code}>${label} (${Locale.getLanguageInfo(code.split("-")[0]).nativeName})</sl-option>
    `), container)
  }
}