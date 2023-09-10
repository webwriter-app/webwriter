import { LitElement, html, css, CSSResultArray, CSSResult, PropertyValueMap } from "lit"
import { customElement, property, query, queryAssignedElements } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { DataInput } from "."
import { SlInput, SlOption } from "@shoelace-style/shoelace"


@localized()
@customElement("ww-urlfileinput")
export class URLFileInput extends SlInput implements DataInput {

  constructor() {
    super()
    this.addEventListener("paste", this.handlePaste)
    this.addEventListener("drop", this.handleDrop)
    this.addEventListener("dragover", (e: DragEvent) => {
      if(e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy"
        e.preventDefault()
        e.stopPropagation()
      }
    })
    this.addEventListener("blur", () => this.checkValidity())
    window.addEventListener("dragenter", () => this.dragOverWindow = true)
    window.addEventListener("dragleave", () => this.dragOverWindow = false)
    window.addEventListener("drop", () => this.dragOverWindow = false)
  }

  handlePaste = (e: ClipboardEvent) => {
    e.clipboardData && this.setValueWithFileList(e.clipboardData)
  }
  
  handleDrop = (e: DragEvent) => {
    e.dataTransfer && this.setValueWithFileList(e.dataTransfer)
    e.preventDefault()
    this.dragOverWindow = false
  }

  get linkLabel() {
    if(this.value.startsWith("blob:") || this.value.startsWith("data:")) {
      return msg("Local File")
    }
    else {
      return msg("External File")
    }
  }

  @property({type: Boolean, attribute: true, reflect: true})
  linkOnly = false
    
  @property({type: Boolean, attribute: true, reflect: true})
  dragOverWindow: boolean = false
  
  @property({attribute: false})
  value: string

  @property({attribute: false})
  defaultValue: string

  @query("input")
  input: HTMLInputElement

  @query("slot:not([name])")
  slotElement: HTMLSlotElement

  @property({type: String, attribute: true})
  autocomplete: SlInput["autocomplete"] = "off"

  @property({type: String, attribute: true})
  autocorrect: SlInput["autocorrect"] = "off"

  @property({type: String})
  placeholder: string

  @property({type: String, attribute: "help-text"})
  helpText: string

  get isBlob() {
    return this.value.startsWith("blob:")
  }

  get validity() {
    return this.input.validity
  }

  get validationMessage() {
    return this.input.validationMessage
  }

  setCustomValidity(message: string) {
    this.input.setCustomValidity(message)
  }

  checkValidity() {
    const valid = this.input.checkValidity()
    this.toggleAttribute("data-invalid", !valid)
    return valid
  }

  reportValidity() {
    return this.input.reportValidity()
  }

  focus() {
    this.input?.focus()
  }

  getForm() {
    return this.input.form
  }

  static styles: CSSResult | CSSResultArray = [SlInput.styles, css`
    * {
      font-family: var(--sl-font-sans);
    }

    :host {
      display: flex;
      flex-direction: column;
    }

    [part=base] {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      position: relative;
      border: solid var(--sl-input-border-width) var(--sl-input-border-color);
      border-radius: var(--sl-input-border-radius-medium);
      max-width: 100%;
      min-height: var(--sl-input-height-medium);
      cursor: text;
      padding: 0 var(--sl-input-spacing-medium);
      background: white;
    }

    :host([dragOverWindow]) [part=base] {
      background: var(--sl-color-primary-50);
      border: 1px solid var(--sl-color-primary-400);
    }

    :host([filled]) [part=base] {
      background: var(--sl-input-filled-background-color);
    }

    :host([disabled]) [part=base] {
      background: none;
    }

    :host(:hover) [part=base] {
      border-color: var(--sl-color-gray-400);
    }

    input {
      flex-grow: 1;
      display: inline-flex;
      border: none;
      outline: none;
      background: transparent;
    }

    :host([open]) {
      z-index: 100;
    }

    sl-menu {
      display: block;
      font-family: var(--sl-font-sans);
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      box-shadow: var(--sl-shadow-large);
      background: var(--sl-panel-background-color);
      border: solid var(--sl-panel-border-width) var(--sl-panel-border-color);
      border-radius: var(--sl-border-radius-medium);
      padding-block: var(--sl-spacing-x-small);
      padding-inline: 0;
      overflow: auto;
      overscroll-behavior: none;
    }

    [part=suffix] {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      max-width: 50%;
      flex-grow: 0;
    }

    [part=label]::slotted(*), label {
      align-self: flex-start;
      margin-bottom: var(--sl-spacing-3x-small);
    }

    :host([required]) [part=label]::after {
      content: "*";
      margin-left: 0.25ch;
    }

    :host(:not([help-text])) #help-text {
      display: none;
    }

    #help-text {
      font-size: var(--sl-input-help-text-font-size-medium);
      color: var(--sl-input-help-text-color);
      margin-top: var(--sl-spacing-3x-small);
    }

    slot[name=prefix]::slotted(:last-child) {
      margin-right: 1ch;
    }

    a[data-empty] {
      display: none;
    }

    :host([data-invalid]) input {
      color: var(--sl-color-danger-600);
      caret-color: black;
    }

    :host([linkOnly]) #pick-file {
      display: none;
    }
  `]

  handleInputKeydown(e: KeyboardEvent) {
    this.toggleAttribute("data-invalid", false)
    if(e.key === "Enter") {
      this.handleInputChange()
      this.reportValidity()
    }
    else if(e.key === "Backspace" && this.input.value?.length === 0) {
      this.value = ""
      this.handleInputChange()
    }
    if(this.value) {
      e.preventDefault()
    }
  }

  dispatchChange() {
    this.dispatchEvent(new CustomEvent("sl-change", {composed: true, bubbles: true}))
  }

  handleInputChange() {
    const valid = this.checkValidity()
    if(valid) {
      this.value = this.input.value
      this.input.value = ""
    }
    this.dispatchChange()
  }

  openFileDialog() {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", e => this.setValueWithFileList(input))
    input.click()
  }

  setValueWithFileList({files}: {files: FileList | null}) {
    if((files?.length ?? 0) > 0) {
      const file = files!.item(0)!
      URL.revokeObjectURL(this.value)
      this.value = URL.createObjectURL(file)
      this.dispatchChange()
    }
  }


  get inputSize() {
    return this.value? 1: this.placeholder.length
  }

  get defaultPlaceholder() {
    return msg("Enter link") + " " + (this.linkOnly? "": msg("or paste/drop/pick file"))
  }

  render() {
    const input = html`
      <input
        type="url"
        size=${this.inputSize}
        placeholder=${!this.value? this.placeholder || this.defaultPlaceholder: ""}
        ?disabled=${this.disabled}
        @change=${this.handleInputChange}
        @keydown=${this.handleInputKeydown}
        autocomplete=${this.autocomplete as any}
        autocorrect=${this.autocorrect as any}
      >
    `
    return html`
      <slot name="label" part="label" @click=${this.focus}>
        ${this.label? html`<label>${this.label}</label>`: null} 
      </slot>
      <div part="base" id="anchor" @click=${this.focus}>
        <slot name="prefix"></slot>
        <a href=${this.value} ?data-empty=${!this.value} target="_blank">${this.linkLabel}</a>
        ${input}
        <div part="suffix">
          <slot name="suffix"></slot>
          <ww-button id="pick-file" variant="icon" icon="folder-open" @click=${this.openFileDialog}></ww-button>
        </div>
      </div>
      <div id="help-text">${this.helpText}</div>
    `
  }
}