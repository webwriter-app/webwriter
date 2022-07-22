import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, query, queryAssignedElements } from "lit/decorators.js"

@customElement("ww-combobox")
export class WwCombobox extends LitElement {

  constructor() {
    super()
    this.tabIndex = 0
    this.addEventListener("focus", e => this.active = true)
    this.addEventListener("blur", e => this.active = false)
  }


  @query("slot")
  slotElement: HTMLSlotElement

  @queryAssignedElements()
  optionElements: HTMLElement[]

  @property({type: Boolean, attribute: true, reflect: true})
  active: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  multiple: boolean = false

  @property({type: String})
  placeholder: string

  @property({type: Boolean, attribute: true, reflect: true})
  filled: boolean = false

  @property({state: true})
  value: string | string[]

  static get styles() {
    return css`

      * {
        font-family: var(--sl-font-sans);
        font-size: var(--sl-input-font-size-medium);
      }

      :host {
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        position: relative;
        border: solid var(--sl-input-border-width) var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-medium);
        height: 38px;
      }

      :host([filled]) {
        background: var(--sl-input-filled-background-color);
      }

      :host([active]) {
        outline: var(--sl-focus-ring)
      }

      #values {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.25rem;
        margin-left: 16px;
      }

      #open-button {
        margin-left: auto;
        background: transparent;
      }

      :host(:not([active])) #options {
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
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
      }
    `
  }

  handleOpenButtonClick(e: PointerEvent) {
    if(this.active) {
      this.blur()
      this.active = false
    }
    else {
      this.active = true
    }
  }

  handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement
    if(input.value.trim() !== "") {
      this.value = this.multiple? [...this.value?.slice(0, -1) ?? [], input.value, ""]: input.value
    }
    if(this.multiple) {
      input.value = ""
    }
    this.emitChange()
  }

  handleInputKeydown(e: KeyboardEvent) {
    const input = e.target as HTMLInputElement
    if(e.key === "Backspace" && input.selectionStart === 0 && input.selectionEnd === 0) {
      this.value = [...this.value.slice(0, -2), this.value[this.value.length - 1]]
    }
  }

  emitChange() {
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  private get inputValue() {
    if(!this.value) {
      return ""
    }
    else if(this.multiple) {
      return this.value[this.value.length - 1]
    }
    else {
      return this.value as string
    }
  }

  private get inputPlaceholder() {
    return Array.isArray(this.value) && (this.value.length > 0) && this.value[0] !== ""
      ? ""
      : this.placeholder
  }

  render() {
    return html`
      ${this.multiple? html`
        <span id="values">
          ${(this.value as string[] ?? []).slice(0, -1).map(v => html`
            <sl-tag variant="primary">${v}</sl-tag>
          `)}
        </span>
      `: null}
      <input 
        value=${this.inputValue}
        placeholder=${this.inputPlaceholder}
        @change=${this.handleInputChange}
        @keydown=${this.handleInputKeydown}
      >
      ${this.optionElements.length > 0? html`
        <sl-icon-button 
          id="open-button"
          name=${this.active? "chevron-up": "chevron-down"}
          @focus=${e => e.stopPropagation()}
          @click=${this.handleOpenButtonClick}
        ></sl-icon-button>
        <sl-menu id="options">
          <slot></slot>
        </sl-menu>
      `: null}
    `
  }
}


@customElement("ww-option")
export class WwOption extends LitElement {

  @property({type: Boolean, attribute: true})
  active: boolean = false

  static get styles() {
    return css`
      :host(:not([active])) {
        display: none;
      }
    `
  }

  render() {
    return html`<slot></slot>`
  }
}