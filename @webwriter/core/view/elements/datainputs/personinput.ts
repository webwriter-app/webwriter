import { html, css, render } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { SlInput } from "@shoelace-style/shoelace";
import { localized, msg } from "@lit/localize";

import { DataInput, schemaConverter } from "./datainput";
import { Person } from "#model";



@localized()
@customElement("ww-personinput")
export class PersonInput extends SlInput implements DataInput {

  _placeholder: string | undefined = undefined
  
  @property({reflect: true})
  autocomplete = "off"
  
  @property({reflect: true})
  autocorrect = "off" as const

  @property({type: Boolean, attribute: true, reflect: true})
  emailActive: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  urlActive: boolean = false

  @property({type: Person, attribute: true, reflect: true, converter: schemaConverter}) //@ts-ignore
  value: Person = new Person("")

  static styles = [SlInput.styles, css`

    :host([data-invalid]:not(:focus-within)) [part=input], [data-invalid]:not(:focus-within)::part(input) {
      color: var(--sl-color-danger-600) !important;
    }

    [part=suffix] {
      margin-right: 1ch;
      --icon-size: 20px;
      gap: 5px;
    }

    [part=form-control] {
      display: flex;
      flex-direction: column;
    }

    sl-input.part {
      margin-left: 2ch;
    }

    ww-button::part(icon) {
      font-size: 16px;
    }

    :host(:not(:focus-within):not(:hover)) .toggle {
      display: none;
    }

    :host(:not(:focus-within)) sl-input.part {
      display: none;
    }

    :host(:not([emailActive])) sl-input.email {
      display: none;
    }

    :host([emailActive]) #toggle-email, :host([urlActive]) #toggle-url {
      background: var(--sl-color-gray-200);
      border-radius: var(--sl-border-radius-small);
    }

    :host(:not([urlActive])) sl-input.url {
      display: none;
    }


  `]

  firstUpdated(): void {
    const container = this.shadowRoot?.querySelector("slot[name=suffix]")
    container && container.children.length === 0 && render(this.Suffix(), container as HTMLElement)
  }

  constructor() {
    super()
    this.addEventListener("sl-change", e => this.value = new Person(this.value))
  }
  
  async togglePart(part: "email" | "url") {
    this.focus()
    this[`${part}Active`] = !this[`${part}Active`]
    if(this[`${part}Active`]) {
      await this.updateComplete
      this[`${part}Input`].focus()
    }
    else {
      this.focus()
    }
  }

  @query(".part.email")
  emailInput: SlInput

  @query(".part.url")
  urlInput: SlInput

  Suffix() {
    return html`
        <ww-button title=${msg("Toggle email")} @mousedown=${(e: any) => {this.togglePart("email"); e.preventDefault()}} variant="icon" class="toggle" id="toggle-email" icon="mail"></ww-button>
        <ww-button  title=${msg("Toggle url")} @mousedown=${(e: any) => {this.togglePart("url"); e.preventDefault()}} variant="icon" class="toggle" id="toggle-url" icon="link"></ww-button>
      `
  }

  render() {
    const template = super.render()
    return html`
      ${template}
      <sl-input value=${this.value.email ?? ""} @sl-input=${(e: any) => this.value = this.value.extend({email: e.target.value})} class="part email" type="email" size="small">
        <sl-icon slot="prefix" name="mail"></sl-icon>
      </sl-input>
      <sl-input value=${this.value.url ?? ""} @sl-input=${(e: any) => this.value = this.value.extend({url: e.target.value})} class="part url"  type="url" size="small">
        <sl-icon slot="prefix" name="link"></sl-icon>
      </sl-input>
    `
  }
}