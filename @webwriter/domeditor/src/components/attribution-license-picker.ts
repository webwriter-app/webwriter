import {css} from "lit"
import {EditorCombobox} from "./editor-combobox"
import {attributionLicenseOptions} from "./license-options"

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

  protected allowCustomValue = false

  constructor() {
    super()
    this.label = "License"
    this.placeholder = "Enter a license"
    this.options = [...attributionLicenseOptions.options, {value: "", label: "No license", detail: "All rights reserved"}]
    this.searchOptions = attributionLicenseOptions.searchOptions
  }

  protected displayedValue() {
    return this.value ? super.displayedValue() : ""
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
