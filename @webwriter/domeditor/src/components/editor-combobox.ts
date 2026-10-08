import {LitElement, css, html, nothing, type CSSResultGroup} from "lit"
import {live} from "lit/directives/live.js"

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  dividerBefore?: boolean
  group?: string
}

let comboboxInstanceCount = 0

/** Shared keyboard and popover behavior for editor option fields. */
export class EditorCombobox extends LitElement {
  static properties = {
    value: {type: String},
    label: {type: String},
    placeholder: {type: String},
    options: {attribute: false},
    showValue: {type: Boolean, attribute: "show-value", reflect: true},
    editable: {type: Boolean},
    multiple: {type: Boolean, reflect: true},
    values: {attribute: false},
    disabled: {type: Boolean, reflect: true},
    open: {type: Boolean, reflect: true, state: true},
  }

  static styles: CSSResultGroup = css`
    :host([show-value]) {--metadata-combobox-height: 1.7rem;}
    :host([show-value]) .control {border-color: #c5ccd5;}
    :host([show-value]) .option {font-size: .68rem;}
    :host([show-value]) .option-code {font-weight: normal;}
    :host([show-value]) .option-value {margin-left: auto; font-variant-numeric: tabular-nums;}
    :host {
      display: block;
      min-width: 0;
      height: var(--metadata-combobox-height, 1.4rem);
      color: #2f3742;
      font: inherit;
    }

    .control {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      height: var(--metadata-combobox-height, 1.4rem);
      min-width: 0;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: inherit;
      background: var(--metadata-combobox-background, transparent);
      font: inherit;
    }

    .control:hover,
    :host([open]) .control {
      border-color: #8eb6df;
    }

    input:focus,
    .toggle:focus-visible,
    .option:focus-visible {
      outline: 0;
    }

    .control:focus-within {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      height: 100%;
      padding: 0 0.15rem 0 0.35rem;
      border: 0;
      color: inherit;
      background: transparent;
      font: inherit;
      font-size: var(--metadata-combobox-font-size, 0.62rem);
    }

    .toggle {
      display: grid;
      flex: 0 0 1.25rem;
      place-items: center;
      width: 1.25rem;
      height: 100%;
      padding: 0;
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    .chevron {
      flex: 0 0 auto;
      width: 0.3rem;
      height: 0.3rem;
      margin-top: -0.15rem;
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
      inset: auto;
      position-area: bottom span-right;
      align-self: start;
      justify-self: start;
      position-try-fallbacks: flip-block;
      width: anchor-size(width);
      max-width: calc(100vw - 1rem);
      max-height: min(26rem, calc(100dvh - 0.8rem));
      margin: 0.2rem 0;
      color: #2f3742;
      padding: 0.35rem;
      overflow: auto;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      background: #fff;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
    }

    .option {
      display: grid;
      gap: 0.08rem;
      min-width: 0;
      padding: 0.45rem 0.6rem;
      border: 0;
      border-radius: 0.25rem;
      color: #3f4651;
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .option-group {
      display: grid;
      min-width: 0;
    }

    .group-label {
      padding: 0.5rem 0.6rem 0.2rem;
      overflow: hidden;
      color: #526b86;
      font-size: 0.62rem;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .divider {
      height: 1px;
      margin: 0.2rem 0.35rem;
      border: 0;
      background: #d8dee6;
    }

    .option:hover,
    .option[data-active],
    .option[aria-selected="true"] {
      color: #174f87;
      background: #eef4fb;
    }

    .option-code {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.72rem;
      font-weight: 750;
      line-height: 1rem;
    }

    .option-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.68rem;
      line-height: 0.95rem;
    }
  `

  value = ""
  label = "Choose"
  placeholder = ""
  options: readonly ComboboxOption[] = []
  showValue = false
  editable = true
  multiple = false
  values: readonly string[] = []
  disabled = false
  protected open = false
  private draft = ""
  private editing = false
  protected activeIndex = -1
  private readonly listboxId = `document-head-suggestions-${++comboboxInstanceCount}`

  private readonly documentPointerDown = (event: PointerEvent) => {
    if(!event.composedPath().includes(this)) this.outsidePointerDown(event)
  }

  private readonly documentKeydown = (event: KeyboardEvent) => {
    if(!this.open || event.key !== "Escape") return
    this.cancelInput()
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.documentPointerDown)
    document.addEventListener("keydown", this.documentKeydown)
  }

  disconnectedCallback() {
    this.close(true)
    document.removeEventListener("pointerdown", this.documentPointerDown)
    document.removeEventListener("keydown", this.documentKeydown)
    super.disconnectedCallback()
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("disabled") && this.disabled) this.close(true)
    if((changed.has("value") || changed.has("showValue") || changed.has("options") || changed.has("values")) && !this.editing) this.draft = this.displayedValue()
  }

  private displayedValue() {
    if(this.multiple) return this.values.map(value => this.options.find(option => option.value === value)?.label ?? value).join(", ")
    return this.showValue ? this.value : this.selectedOption()?.label ?? this.value
  }

  protected renderToggleIcon(): unknown {
    return html`<span class="chevron" aria-hidden="true"></span>`
  }

  protected renderSuffix(): unknown { return nothing }

  protected cancelInput() { this.close(true) }
  protected outsidePointerDown(_event: PointerEvent) { if(this.open) this.close() }
  protected blurInput(_event: FocusEvent) {}

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("open")) this.dispatchEvent(new CustomEvent("combobox-toggle", {
      detail: {open: this.open}, bubbles: true, composed: true,
    }))
  }

  private selectedOption() {
    return this.options.find(option => option.value === this.value)
  }

  protected filteredOptions() {
    if(!this.editable || this.multiple) return this.options
    const selected = this.selectedOption()
    const query = this.draft.trim().toLocaleLowerCase("en")
    if(!query || query === selected?.label.toLocaleLowerCase("en") || query === this.value.toLocaleLowerCase("en")) {
      return this.options
    }
    return this.options.filter(option => [option.label, option.value, option.description ?? ""]
      .some(value => value.toLocaleLowerCase("en").includes(query)))
  }

  close(reset = false) {
    this.open = false
    this.activeIndex = -1
    if(reset) {
      this.editing = false
      this.draft = this.displayedValue()
      this.requestUpdate()
    }
  }

  private async setOpen(open: boolean) {
    if(this.disabled) return
    this.open = open
    if(!this.open) return
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    this.renderRoot.querySelector<HTMLElement>(".listbox")?.showPopover?.()
  }

  protected emit(value: string) {
    if(this.disabled) return
    this.value = value
    this.editing = false
    this.draft = this.showValue ? value : this.selectedOption()?.label ?? value
    this.close()
    this.dispatchEvent(new CustomEvent<{value: string}>("combobox-change", {
      detail: {value},
      bubbles: true,
      composed: true,
    }))
  }

  protected select(option: ComboboxOption, _event?: Event) {
    if(this.disabled) return
    if(this.multiple) {
      this.values = this.values.includes(option.value) ? this.values.filter(value => value !== option.value) : [...this.values, option.value]
      this.draft = this.displayedValue()
      this.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: this.values.join(", "), values: [...this.values]}, bubbles: true, composed: true}))
      this.requestUpdate()
      return
    }
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
    this.emit(option.value)
  }

  protected commitDraft(event?: Event) {
    if(!this.editable || this.multiple) return
    if(event?.currentTarget instanceof HTMLInputElement) this.draft = event.currentTarget.value
    const draft = this.draft.trim()
    const exact = this.options.find(option => option.value.toLocaleLowerCase("en") === draft.toLocaleLowerCase("en")
      || option.label.toLocaleLowerCase("en") === draft.toLocaleLowerCase("en"))
    const value = exact?.value ?? draft
    if(value !== this.value) this.emit(value)
    else this.close(true)
  }

  protected handleFocus() {
    if(this.disabled) return
    this.editing = this.editable && !this.multiple
    this.draft ||= this.displayedValue()
    void this.setOpen(true)
  }

  private handleInput(event: InputEvent) {
    if(this.disabled || !this.editable || this.multiple) return
    this.editing = true
    this.draft = (event.currentTarget as HTMLInputElement).value
    this.dispatchEvent(new Event("combobox-input", {bubbles: true, composed: true}))
    this.activeIndex = -1
    void this.setOpen(true)
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(this.disabled) return
    const options = this.filteredOptions()
    if(event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if(!this.open) void this.setOpen(true)
      const offset = event.key === "ArrowDown" ? 1 : -1
      this.activeIndex = this.activeIndex < 0
        ? offset > 0 ? 0 : Math.max(0, options.length - 1)
        : (this.activeIndex + offset + options.length) % Math.max(1, options.length)
      this.requestUpdate()
      return
    }
    if(event.key === " " && !this.editable) {
      event.preventDefault()
      void this.setOpen(!this.open)
      return
    }
    if(event.key === "Enter") {
      event.preventDefault()
      const option = this.activeIndex >= 0 ? options[this.activeIndex] : undefined
      if(option) this.select(option)
      else this.commitDraft()
      return
    }
    if(event.key === "Escape") {
      event.preventDefault()
      this.cancelInput()
      event.stopPropagation()
    }
  }

  render() {
    const options = this.filteredOptions()
    const groups = new Map<string, {option: ComboboxOption, index: number}[]>()
    options.forEach((option, index) => {
      const group = option.group ?? ""
      if(!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push({option, index})
    })
    return html`
      <span class="control" style=${`anchor-name: --${this.listboxId}`}>
        <input
          role="combobox"
          aria-label=${this.label}
          aria-autocomplete=${this.editable && !this.multiple ? "list" : "none"}
          aria-expanded=${this.open}
          aria-haspopup="listbox"
          aria-controls=${this.listboxId}
          aria-activedescendant=${this.open && this.activeIndex >= 0 ? `${this.listboxId}-option-${this.activeIndex}` : nothing}
          autocomplete="off"
          inputmode=${this.showValue ? "decimal" : nothing}
          data-ribbon-input-persistent
          placeholder=${this.placeholder}
          .value=${live(this.draft)}
          ?disabled=${this.disabled}
          .readOnly=${!this.editable || this.multiple}
          @click=${() => { if(!this.editable) void this.setOpen(true) }}
          @focus=${this.handleFocus}
          @blur=${this.blurInput}
          @input=${this.handleInput}
          @change=${(event: Event) => { this.commitDraft(event); event.stopPropagation() }}
          @keydown=${this.handleKeydown}
        />
        <button
          class="toggle"
          type="button"
          tabindex="-1"
          ?disabled=${this.disabled}
          aria-label=${`Show ${this.label.toLocaleLowerCase()} suggestions`}
          aria-expanded=${this.open}
          aria-controls=${this.listboxId}
          @mousedown=${(event: MouseEvent) => event.preventDefault()}
          @click=${() => this.setOpen(!this.open)}
        >${this.renderToggleIcon()}</button>
        ${this.renderSuffix()}
      </span>
      ${this.open ? html`
        <div
          id=${this.listboxId}
          class="listbox"
          popover="manual"
          role="listbox"
          aria-multiselectable=${this.multiple ? "true" : nothing}
          aria-label=${`${this.label} suggestions`}
          style=${`position-anchor: --${this.listboxId}`}
        >
          ${options.length ? Array.from(groups, ([group, entries]) => html`
            <div class="option-group" role=${group ? "group" : nothing} aria-label=${group || nothing}>
              ${group ? html`<div class="group-label" title=${group} aria-hidden="true">${group}</div>` : nothing}
              ${entries.map(({option, index}) => html`
                ${option.dividerBefore ? html`<hr class="divider" role="separator" />` : nothing}
                <button
                  id=${`${this.listboxId}-option-${index}`}
                  class="option"
                  type="button"
                  role="option"
                  title=${option.description ? `${option.label} — ${option.description}` : option.label}
                  aria-selected=${this.multiple ? this.values.includes(option.value) : this.value === option.value}
                  data-active=${this.activeIndex === index ? "" : nothing}
                  @mousedown=${(event: MouseEvent) => event.preventDefault()}
                  @click=${(event: MouseEvent) => this.select(option, event)}
                >
                  <strong class="option-code">${option.label}</strong>
                  ${this.showValue ? html`<span class="option-name option-value">${option.description ?? option.value}</span>`
                    : option.description ? html`<span class="option-name">${option.description}</span>` : nothing}
                </button>
              `)}
            </div>
          `) : html`<span class="option-name">Press Enter to use “${this.draft.trim()}”.</span>`}
        </div>
      ` : nothing}
    `
  }
}

/** Theme picker with placeholder typography and palette previews. */
