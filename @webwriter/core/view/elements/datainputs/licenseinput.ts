import { html, css, render, PropertyValueMap } from "lit";
import { customElement, property } from "lit/decorators.js";

import { DataInput } from "./datainput";
import { License } from "#model";
import { Combobox } from "#view";

@customElement("ww-licenseinput")
export class LicenseInput extends Combobox implements DataInput {

  constructor() {
    super()
    this.addEventListener("sl-input", this.validate)
  }

  @property({reflect: true})
  autocomplete: string = "off"
  
  @property({reflect: true})
  autocorrect = "off" as const

  @property({type: Object, attribute: false}) // @ts-ignore
  value: License = new License("")

  validityError?: string = undefined

  validate() {
    let validity = ""
    try {
      new License(this.value)
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
    
    a {
      font-size: 0.75rem;
    }
  `]

  ready = false

  protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    const isArray = Array.isArray(this.value)
    const isString =  typeof this.value === "string"
    if(_changedProperties.has("value") && (isString || isArray)) {
      this.value = new License(isString? this.value: (this.value as any)[0])
    }
  }

  firstUpdated() {
    this.ready = true
  }

  async updated() {
    const container = this.shadowRoot?.querySelector("slot[name=suffix]") as HTMLElement
    container && render(html`
    ${ !this.ready || !this.validity.valid? null: html`
      <a target="_blank" href=${this.value.url!}>${this.value.name}</a>
    `}`, container)
  }
}