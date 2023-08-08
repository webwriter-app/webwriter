import { LitElement, html, css, CSSResultArray, CSSResult, PropertyValueMap } from "lit"
import { customElement, property, query, queryAssignedElements } from "lit/decorators.js"
import { localized } from "@lit/localize"
import { DataInput } from "./datainputs"
import { SlInput, SlOption } from "@shoelace-style/shoelace"

@localized()
@customElement("ww-combobox")
export class Combobox extends SlInput implements DataInput {

  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

  constructor() {
    super()
    this.tabIndex = 0
    this.addEventListener("focus", e => this.active = true)
    this.addEventListener("blur", e => {
      this.active = this.open = false
    })
    this.value = this.defaultValue = this.multiple? []: ""
  }

  @property({attribute: false}) //@ts-ignore
  value: string[] | string

  @property({attribute: false}) //@ts-ignore
  defaultValue: string[] | string

  @query("input")
  input: HTMLInputElement

  @query("#toggle")
  toggleButton: HTMLInputElement

  @query("slot:not([name])")
  slotElement: HTMLSlotElement

  @queryAssignedElements()
  optionElements: HTMLElement[]

  @property({type: String, attribute: true})
  autocomplete: SlInput["autocomplete"] = "off"

  @property({type: Boolean, attribute: true, reflect: true})
  active: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  multiple: boolean = false

  @property({type: String})
  placeholder: string

  @property({type: Boolean, attribute: true, reflect: true})
  open: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  suggestions: boolean = false

  @property({type: String, attribute: "help-text"})
  helpText: string
  
  @property({type: String, attribute: true})
  separator: string = " "
  get validity() {
    return this.input.validity
  }

  get validationMessage() {
    return this.input.validationMessage
  }

  setValidity(isValid: boolean) {
    const host = this
    const required = Boolean(this.required)
    host.toggleAttribute('data-required', required)
    host.toggleAttribute('data-optional', !required)
    host.toggleAttribute('data-invalid', !isValid)
    host.toggleAttribute('data-valid', isValid)
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
      font-size: var(--sl-input-font-size-medium);
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
      min-height: calc(var(--sl-input-height-medium) - var(--sl-input-border-width) * 2);
      cursor: text;
      padding: 0 var(--sl-input-spacing-medium);
    }

    :host([multiple]) [part=base] {
      flex-wrap: wrap;
    }

    :host([filled]) [part=base] {
      background: var(--sl-input-filled-background-color);
    }

    :host([active]) [part=base] {
      border-color: var(--sl-input-border-color-focus);
      box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);
    }

    :host([disabled]) [part=base] {
      background: none;
    }

    :host(:hover) [part=base] {
      border-color: var(--sl-color-gray-400);
    }

    #values {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.25rem;
      padding-top: 0.25rem;
      padding-bottom: 0.25rem;
      flex-wrap: wrap;
    }

    #values > * {
      margin-top: 0.125rem;
      margin-bottom: 0.125rem;
    }

    #open-button {
      margin-left: auto;
      background: transparent;
    }

    :host(:not([open])) #options {
      display: none;
    }

    #options {
      display: block;
      width: 100%;
      position: absolute;
      top: 100%;
      left: 0;
    }

    #options::part(base) {
      width: 100%;
      border-top: none;
    }

    input {
      flex-grow: 1;
      display: inline-flex;
      border: none;
      outline: none;
      background: transparent;
    }

    :host(:not([open])) sl-menu {
      display: none;
    } 

    :host(:not([suggestions])) sl-menu, :host(:not([suggestions])) #toggle {
      display: none;
    }

    sl-menu {
      z-index: 100;
    }

    #toggle {
      transition: transform 0.25s ease;
    }

    :host([open]) #toggle {
      transform: rotate(180deg);
    }

    sl-menu {
      display: block;
      position: relative;
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
      max-width: var(--auto-size-available-width);
      max-height: var(--auto-size-available-height);
    }

    [part=suffix] {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      max-width: 50%;
      flex-grow: 0;
    }

    label {
      align-self: flex-start;
    }

    :host([required]) label::after {
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
  `]

  handleTextInput(e: Event) {
    const input = e.target as HTMLInputElement
    e.preventDefault()
    if(!this.multiple) {
      this.value = input.value
    }
    else if(input.value === this.separator) {
      input.value = ""
    }
    else {
      this.value = [...this.valueList.slice(0, -1), ...input.value.split(this.separator)]
      input.value = this.valueList.at(-1)!
    }
    this.setValidity(this.validity.valid)
  }

  handleInputKeydown(e: KeyboardEvent) {
    const input = e.target as HTMLInputElement
    if(this.multiple && e.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0) {
      e.preventDefault()
      this.value = this.valueList.slice(0, -1)
    }
  }

  handleOptionClick = (e: PointerEvent) => {
    if(e.target instanceof SlOption) {
      this.value = this.input.value = e.target.value
      this.focus()
      this.open = false
    }
  }

  get valueList() {
    return (this.multiple? this.value: [this.value])  as string[]
  }

  protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    this.input.value = this.multiple? this.valueList.at(-1) ?? "": String(this.value)
  }

  render() {
    const input = html`
      <input
        size=${Math.min(Math.max(1, this.valueList.at(-1)!?.length ?? 1 - 1), 40)}
        .value=${this.multiple? this.valueList.at(-1)!: String(this.value)}
        placeholder=${this.placeholder}
        ?disabled=${this.disabled}
        @input=${this.handleTextInput}
        @keydown=${this.handleInputKeydown}
        autocomplete=${this.autocomplete as any}
      >
    `
    return html`
      <label>${this.label}</label> 
      <div part="base">
        ${this.multiple? html`
          <span id="values">
            <slot name="values"></slot>
            ${this.valueList.slice(0, -1).map(v => html`
              <sl-tag size="small" variant="primary">${v}</sl-tag>
            `)}
            ${input}
          </span>
        `: input}
        <div part="suffix">
          <slot name="suffix"></slot>
          <ww-button
            id="toggle"
            variant="icon" 
            icon="chevron-down"
            @click=${() => this.open = !this.open}
            @focus=${(e: Event) => e.stopPropagation()}
            @mousedown=${(e: Event) => {e.stopPropagation(); e.preventDefault()}}
          ></ww-button>
        </div>
        <sl-menu id="options" @click=${this.handleOptionClick}>
          <slot></slot>
        </sl-menu>
      </div>
      <div id="help-text">${this.helpText}</div>
    `
  }
}