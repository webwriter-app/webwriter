import { html, css, render, PropertyValueMap } from "lit";
import { DataInput } from ".";
import { customElement, property } from "lit/decorators.js";
import { Locale } from "../../../model";
import { Combobox } from "../combobox";




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


  firstUpdated() {
    this.ready = true
    const container = this.shadowRoot?.querySelector("slot:not([name])") as HTMLElement
    const infos = Locale.languageInfos
    console.log(infos)
    container && render(infos.map(({code, name, nativeName}) => html`
      <sl-option value=${code}>${name} (${nativeName})</sl-option>
    `), container)
  }
}