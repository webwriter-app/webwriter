import { html, css, render, PropertyValueMap } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SlInput } from "@shoelace-style/shoelace";
import { localized } from "@lit/localize";

import { DataInput, schemaConverter } from "./datainput";
import { SemVer } from "#model";


@localized()
@customElement("ww-semverinput")
export class SemverInput extends SlInput implements DataInput {

  static mainKeys = ["major", "minor", "patch"] as const

  @property({reflect: true})
  autocomplete = "off"

  @property({reflect: true})
  autocorrect = "off" as const

  // size = "large" as const

  @property({type: SemVer, attribute: true, reflect: true, converter: schemaConverter}) // @ts-ignore
  value: SemVer | string = new SemVer("0.0.1")

  validityError?: string = undefined

  get validity() {
    let valid = super.validity.valid
    let validityError = this.validityError
    try {
      new SemVer(this.value)
      valid = true
      validityError = undefined
    }
    catch(err: any) {
      validityError = err.message
      valid = false
    }
    finally {
      if(this.validityError !== validityError) {
        this.validityError = validityError
        this.setCustomValidity(validityError ?? "")
      }
      return {...super.validity, valid}
    }
  }

  static styles = [SlInput.styles, css`

    :host([data-invalid]:not(:focus-within)) [part=input] {
      color: var(--sl-color-danger-600) !important;
    }

    .patch {
      --icon-size: 12px;
      font-size: 0.5rem;
    }

    .minor {
      --icon-size: 16px;
      font-size: 0.6rem;
    }

    .major {
      --icon-size: 20px;
      font-size: 0.7rem;
    }

    ww-button::part(base) {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: unset;
    }

    [part=input] {
      font-family: monospace;
      text-align: center;
    }

    [part=prefix] {
      padding-left: 1ch;
      align-items: flex-end;
      margin-bottom: -4px;
    }

    [part=suffix] {
      align-items: flex-end;
      padding-right: 1ch;
      margin-bottom: -4px;
    }

    :host(:not(:focus-within):not(:hover)) ww-button {
      display: none;
    }

  `]

  firstUpdated(): void {
    const prefix = this.shadowRoot?.querySelector("slot[name=prefix]")
    prefix && prefix.children.length === 0 && render(this.Prefix(), prefix as HTMLElement)
    const suffix = this.shadowRoot?.querySelector("slot[name=suffix]")
    suffix && suffix.children.length === 0 && render(this.Suffix(), suffix as HTMLElement)
  }

  protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    if(_changedProperties.has("value") && typeof this.value === "string") {
      try {
        this.value = new SemVer(this.value)
      }
      catch(err) {}
    }
  }

  changeVersion(id: "major" | "minor" | "patch", decrement=false) {
    if(this.value instanceof SemVer) {
      this.value = decrement? this.value.dec(id): this.value.inc(id)
      this.dispatchEvent(new CustomEvent("sl-change", {bubbles: true, composed: true}))
    }
  }

  Button(id: "major" | "minor" | "patch", decrement=false) {
    return html`<ww-button tabindex=${-1} class=${id} variant="icon" icon=${decrement? "minus": "plus"} @mousedown=${(e: any) => {this.changeVersion(id, decrement); e.preventDefault()}}>
      <span class=${id}>${id[0].toUpperCase() + id.slice(1)}</span>
    </ww-button>`
  }

  Prefix() {
    return SemverInput.mainKeys.map(id => this.Button(id, true))
  }

  Suffix() {
    //@ts-ignore
    return SemverInput.mainKeys.map(id => this.Button(id))
  }

}