import {LitElement, css, html} from "lit"
import type {StyleMarkOption} from "../marks"

export type RibbonComboboxChangeDetail = {
  name: string
  value: string
}

/** A compact, keyboard-accessible ribbon picker with a custom listbox. */
export class RibbonCombobox extends LitElement {
  static properties = {
    disabled: {type: Boolean, reflect: true},
    label: {type: String},
    name: {type: String, reflect: true},
    open: {type: Boolean, reflect: true},
    options: {attribute: false},
    value: {type: String},
    variant: {type: String, reflect: true},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      height: 1.75rem;
      color: #2f3742;
      font: inherit;
    }

    .combobox {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.2rem;
      width: 100%;
      height: 1.75rem;
      min-width: 0;
      padding: 0.15rem 0.3rem 0.15rem 0.4rem;
      border: 1px solid #c8d2df;
      border-radius: 0.3rem;
      color: inherit;
      background: #fff;
      font: inherit;
      font-size: 0.68rem;
      cursor: pointer;
    }

    .combobox:hover,
    :host([open]) .combobox {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .combobox:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .combobox:disabled {
      color: #9aa4b1;
      background: #f7f7f7;
      cursor: default;
      opacity: 0.6;
    }

    .value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      flex: 0 0 auto;
      width: 0.3rem;
      height: 0.3rem;
      margin: -0.15rem 0.05rem 0 0;
      border-right: 1.25px solid currentColor;
      border-bottom: 1.25px solid currentColor;
      transform: rotate(45deg);
    }

    :host([open]) .chevron {
      margin-top: 0.15rem;
      transform: rotate(225deg);
    }

    .listbox {
      box-sizing: border-box;
      display: grid;
      position: fixed;
      z-index: 1000;
      max-height: min(18rem, calc(100vh - 1rem));
      padding: 0.25rem;
      overflow: auto;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      background: #fff;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
    }

    .option {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 100%;
      min-height: 1.75rem;
      padding: 0.25rem 0.45rem;
      border: 0;
      border-radius: 0.25rem;
      color: inherit;
      background: transparent;
      font: inherit;
      font-size: 0.72rem;
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
    }

    .option:hover,
    .option:focus-visible {
      outline: 0;
      background: #eef4fb;
    }

    .option[aria-selected="true"] {
      color: #174f87;
      background: #dcecff;
    }

    .option-check {
      width: 0.65rem;
      color: #3977c7;
      visibility: hidden;
    }

    .option[aria-selected="true"] .option-check {
      visibility: visible;
    }

    :host([variant="color"]) .combobox {
      justify-content: center;
      padding: 0.2rem;
      border: 0;
      background: transparent;
    }

    :host([name="font-family"]) .combobox,
    :host([name="font-size"]) .combobox {
      background: transparent;
    }

    :host([variant="color"]) .value {
      overflow: visible;
    }

    :host([variant="color"]) .chevron {
      display: none;
    }

    :host([variant="color"]) .listbox {
      grid-template-columns: repeat(5, 1.75rem);
      gap: 0.15rem;
      min-width: auto !important;
    }

    :host([variant="color"]) .option {
      display: grid;
      place-items: center;
      min-width: 1.75rem;
      width: 1.75rem;
      height: 1.75rem;
      min-height: 1.75rem;
      padding: 0.2rem;
    }

    :host([variant="color"]) .option-check {
      display: none;
    }

    .color-preview {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 1.05rem;
      height: 1.05rem;
      border: 1px solid #9aa4b1;
      border-radius: 0.15rem;
      color: #20252b;
      background:
        linear-gradient(45deg, #e5e7eb 25%, transparent 25%) 0 0 / 0.4rem 0.4rem,
        linear-gradient(45deg, transparent 75%, #e5e7eb 75%) 0 0 / 0.4rem 0.4rem,
        #fff;
      font-size: 0.66rem;
      font-weight: 700;
      line-height: 1;
    }

    .color-preview.text-color {
      border: 0;
      border-bottom: 0.2rem solid var(--preview-color, #2f3742);
      border-radius: 0;
      background: transparent;
    }

    .color-preview.background-color {
      background: var(--preview-color, transparent);
    }
  `

  disabled = false
  label = "Choose"
  name = ""
  options: readonly StyleMarkOption[] = []
  value = ""
  variant: "text" | "color" = "text"
  private open = false
  private listboxPosition = {left: 0, top: 0, width: 0}

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(this.open && !event.composedPath().includes(this)) this.close()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(this.open && event.key === "Escape") {
      event.preventDefault()
      this.close()
      this.renderRoot.querySelector<HTMLButtonElement>(".combobox")?.focus()
    }
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    super.disconnectedCallback()
  }

  close() {
    this.open = false
  }

  private toggle() {
    if(this.disabled) return
    this.open = !this.open
    if(this.open) void this.positionListbox()
  }

  private async positionListbox() {
    await this.updateComplete
    if(!this.open) return
    const trigger = this.getBoundingClientRect()
    const listbox = this.renderRoot.querySelector<HTMLElement>(".listbox")
    const listboxHeight = listbox?.getBoundingClientRect().height ?? 0
    const margin = 8
    const width = this.variant === "color"? 0: Math.max(trigger.width, 144)
    const effectiveWidth = width || listbox?.getBoundingClientRect().width || 154
    const left = Math.min(
      Math.max(margin, trigger.left),
      Math.max(margin, window.innerWidth - effectiveWidth - margin),
    )
    const below = trigger.bottom + 4
    const top = below + listboxHeight <= window.innerHeight - margin
      ? below
      : Math.max(margin, trigger.top - listboxHeight - 4)
    this.listboxPosition = {left, top, width}
    this.requestUpdate()
  }

  private select(option: StyleMarkOption) {
    this.value = option.value
    this.close()
    this.dispatchEvent(new CustomEvent<RibbonComboboxChangeDetail>("ribbon-combobox-change", {
      detail: {name: this.name, value: option.value},
      bubbles: true,
      composed: true,
    }))
  }

  private handleTriggerKeydown(event: KeyboardEvent) {
    if(!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return
    event.preventDefault()
    if(!this.open) {
      this.toggle()
      void this.updateComplete.then(() => {
        const selected = this.renderRoot.querySelector<HTMLButtonElement>('.option[aria-selected="true"]')
        const option = selected ?? this.renderRoot.querySelector<HTMLButtonElement>(".option")
        option?.focus()
      })
    }
  }

  private handleOptionKeydown(event: KeyboardEvent) {
    const options = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>(".option"))
    const current = options.indexOf(event.currentTarget as HTMLButtonElement)
    const offset = event.key === "ArrowDown"? 1: event.key === "ArrowUp"? -1: 0
    if(!offset) return
    event.preventDefault()
    options[(current + offset + options.length) % options.length]?.focus()
  }

  private selectedOption() {
    return this.options.find(option => this.valuesEqual(option.value, this.value)) ?? {
      label: this.value || this.options[0]?.label || this.label,
      value: this.value,
    }
  }

  private valuesEqual(a: string, b: string) {
    if(a === b) return true
    if(!["color", "background-color"].includes(this.name) || !a || !b) return false
    const span = document.createElement("span")
    span.style.setProperty(this.name, a)
    const normalizedA = span.style.getPropertyValue(this.name)
    span.style.setProperty(this.name, b)
    return normalizedA === span.style.getPropertyValue(this.name)
  }

  private colorPreview(value: string, optionLabel: string, option = false) {
    const property = this.name === "color"? "color": "background-color"
    const className = property === "color"? "color-preview text-color": "color-preview background-color"
    const style = value? `--preview-color: ${value};`: ""
    return html`
      <span
        class=${className}
        style=${style}
        title=${option? optionLabel: ""}
        aria-hidden="true"
      >A</span>
    `
  }

  render() {
    const selected = this.selectedOption()
    const listboxId = `${this.name || "ribbon"}-options`
    const style = [
      `left: ${this.listboxPosition.left}px`,
      `top: ${this.listboxPosition.top}px`,
      this.listboxPosition.width? `min-width: ${this.listboxPosition.width}px`: "",
    ].filter(Boolean).join("; ")
    return html`
      <button
        class="combobox"
        type="button"
        role="combobox"
        aria-label=${this.label}
        aria-haspopup="listbox"
        aria-controls=${listboxId}
        aria-expanded=${this.open}
        title=${`${this.label}: ${selected.label}`}
        ?disabled=${this.disabled}
        @click=${this.toggle}
        @keydown=${this.handleTriggerKeydown}
      >
        <span class="value" style=${this.name === "font-family" && selected.value? `font-family: ${selected.value}`: ""}>
          ${this.variant === "color"
            ? this.colorPreview(selected.value, selected.label)
            : selected.label}
        </span>
        <span class="chevron" aria-hidden="true"></span>
      </button>
      ${this.open? html`
        <div
          id=${listboxId}
          class="listbox"
          role="listbox"
          aria-label=${this.label}
          style=${style}
        >
          ${this.options.map(option => html`
            <button
              class="option"
              type="button"
              role="option"
              aria-label=${option.label}
              aria-selected=${this.valuesEqual(option.value, this.value)}
              title=${option.label}
              style=${this.name === "font-family" && option.value? `font-family: ${option.value}`: ""}
              @click=${() => this.select(option)}
              @keydown=${this.handleOptionKeydown}
            >
              <span class="option-check" aria-hidden="true">✓</span>
              ${this.variant === "color"
                ? this.colorPreview(option.value, option.label, true)
                : option.label}
            </button>
          `)}
        </div>
      `: ""}
    `
  }
}

if(!customElements.get("ribbon-combobox")) {
  customElements.define("ribbon-combobox", RibbonCombobox)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-combobox": RibbonCombobox
  }
}
