import { html, css, render, PropertyValueMap } from "lit";
import { DataInput } from ".";
import { customElement, property } from "lit/decorators.js";
import { SlInput } from "@shoelace-style/shoelace";
import { localized, msg } from "@lit/localize";
import { CustomElementName, NpmName } from "../../../model";
import { unscopePackageName } from "../../../utility";
import { ZodError } from "zod";


@localized()
@customElement("ww-npmnameinput")
export class NpmNameInput extends SlInput implements DataInput {

  @property({type: String, attribute: true})
  value: string = ""

  @property({type: Boolean, attribute: true})
  validateCustomElementName = false

  @property({type: Boolean, attribute: true})
  validateAvailability = false

  validityError?: string = undefined

  @property({reflect: true})
  autocomplete = "off"
  
  @property({reflect: true})
  autocorrect = "off" as const

  min = 1
  max = 214

  #ready = false

  validate() {
    let validity = ""
    try {
      NpmName.parse(this.value)
      const name = unscopePackageName(this.value)
      this.validateCustomElementName && CustomElementName.parse(name)
    }
    catch(err: any) {
      validity = err.message
      return false
    }
    finally {
      if(this.validateAvailability && this.availability === "unavailable") {
       validity = "Name already taken on NPM"
      }
      this.setCustomValidity(validity)
    }
  }



  @property({type: String, attribute: true, reflect: true})
  availability: "unknown" | "pending" | "available" | "unavailable" = "unknown"

  async checkAvailability() {
    if(!navigator.onLine || !this.validateAvailability || this.getAttribute("data-invalid") !== null) {
      return
    }
    this.availability = "pending"
    try {
      const body = await (await fetch(`https://registry.npmjs.com/-/v1/search?` + new URLSearchParams({text: this.value}))).json()
      const available = body.objects.every((obj: any) => obj.package.name !== this.value)
      this.availability = available? "available": "unavailable"
      this.validate()
    }
    catch(err) {
      this.availability = "unknown"
    }
  }

  static styles = [SlInput.styles, css`
    :host(:not(:focus-within)[data-invalid]) [part=input] {
      color: var(--sl-color-danger-600) !important;
    }

    :host(:not([availability=pending])) sl-spinner {
      display: none;
    }

    :host(:not([availability=available])) #available {
      display: none;
    }

    :host(:not([availability=unavailable])) #unavailable {
      display: none;
    }

    [part=suffix] {
      padding-right: 1ch;
    }
  `]

  protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.willUpdate(_changedProperties)
    if(_changedProperties.has("value") && this.#ready) {
      this.availability = "unknown"
      this.validate()
    }
  }

  firstUpdated() {
    const container = this.shadowRoot?.querySelector("slot[name=suffix]")
    container && render(this.Suffix(), container as HTMLElement)
    this.#ready = true
  }

  Suffix() {
    return html`
      <sl-spinner id="pending"></sl-spinner>
      <sl-icon id="available" name="check"></sl-icon>
      <sl-icon id="unavailable" name="x"></sl-icon>
    `
  }

  constructor() {
    super()
    this.addEventListener("blur", () => this.checkAvailability())
  }

  render() {
    return super.render()
  }
}