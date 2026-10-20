import {css} from "lit"
import {creativeCommonsLicenses} from "../document-head"
import {EditorCombobox} from "./editor-combobox"

/** The attribution form uses the same rich options as the document metadata picker. */
export class AttributionLicensePicker extends EditorCombobox {
  static styles = [EditorCombobox.styles, css`
    :host {
      --metadata-combobox-height: 30px;
      --metadata-combobox-font-size: 13px;
    }
    .listbox {
      width: max(anchor-size(width), 22rem);
      position-area: bottom span-left;
      position-try-order: most-height;
      justify-self: end;
      max-height: min(26rem, calc(100% - .8rem));
    }
  `]

  constructor() {
    super()
    this.label = "License"
    this.placeholder = "Choose a CC license"
    this.editable = false
    this.options = [...creativeCommonsLicenses.map(license => ({
      value: license.code,
      label: license.code,
      description: license.name,
      detail: license.description,
    })), {value: "", label: "No license", detail: "All rights reserved"}]
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(event.key === "Escape" && !this.open) return
    super.handleKeydown(event)
  }

  focus(options?: FocusOptions) {
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus(options)
  }
}

if(!customElements.get("attribution-license-picker")) {
  customElements.define("attribution-license-picker", AttributionLicensePicker)
}
