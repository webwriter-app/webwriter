import {LitElement, css, html, nothing, type CSSResultGroup} from "lit"
import {live} from "lit/directives/live.js"
import {ref} from "lit/directives/ref.js"
import {dropdownChevronStyles} from "./dropdown-chevron.styles"
import {editorInteractionStyles} from "./editing-controls.styles"
import {ribbonIcon} from "../ribbon-icons"

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  detail?: string
  icons?: readonly {name: string, src: string}[]
  dividerBefore?: boolean
  group?: string
  disabled?: boolean
}

let comboboxInstanceCount = 0
const showAllOption: ComboboxOption = {value: "", label: "Show all..."}

function matchRank(query: string, value: string) {
  const text = value.toLocaleLowerCase("en")
  if(text === query) return 0
  if(text.startsWith(query)) return 1
  if(text.includes(query)) return 2
  return Infinity
}

/** Shared keyboard and popover behavior for editor option fields. */
export class EditorCombobox extends LitElement {
  static properties = {
    value: {type: String},
    label: {type: String},
    placeholder: {type: String},
    options: {attribute: false},
    searchOptions: {attribute: false},
    formatValue: {attribute: false},
    showValue: {type: Boolean, attribute: "show-value", reflect: true},
    editable: {type: Boolean},
    multiple: {type: Boolean, reflect: true},
    values: {attribute: false},
    disabled: {type: Boolean, reflect: true},
    open: {type: Boolean, reflect: true, state: true},
  }

  static styles: CSSResultGroup = css`
    ${editorInteractionStyles}
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
      position: relative;
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

    :host([multiple]) .control {
      padding-inline-end: 1.3rem;
    }
    :host([multiple][disabled]) .control {opacity: .55;}

    .selection-tags {
      position: relative;
      display: flex;
      flex: 1;
      gap: .15rem;
      min-width: 0;
      margin-inline: .2rem;
      overflow: hidden;
    }
    :host([multiple]) input {position: absolute; inset: 0; padding-inline-end: 1.3rem; cursor: pointer;}
    .control:has(.selection-tags) input {opacity: 0;}
    .selection-tag {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      box-sizing: border-box;
      max-width: 100%;
      min-width: 0;
      padding-inline: .25rem .1rem;
      gap: .1rem;
      border: 1px solid #c8d2df;
      border-radius: .25rem;
      color: #2f3742;
      background: #e8eef5;
      font-size: var(--metadata-combobox-font-size, .62rem);
      line-height: 1rem;
    }
    .selection-tag:first-child {flex-shrink: 1;}
    .selection-tag[hidden] {position: absolute; visibility: hidden;}
    .selection-tag-count {padding-inline: .25rem; font-variant-numeric: tabular-nums;}
    .selection-tag-label {overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
    .selection-tags {cursor: pointer;}
    :host([disabled]) .selection-tags, :host([multiple][disabled]) input {cursor: default;}
    .selection-remove {
      position: relative;
      z-index: 1;
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 1rem;
      height: 1rem;
      padding: 0;
      border: 0;
      border-radius: .2rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }
    .selection-remove:enabled:hover {background: #d9e6f4; color: #2f3742;}
    .selection-remove:focus-visible {outline: 1px solid #3977c7; outline-offset: -1px;}
    .selection-remove:disabled {cursor: default;}
    .selection-remove svg, .selection-check svg {display: block; width: .75rem; height: .75rem;}

    input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      height: 100%;
      padding: 0 .2rem;
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

    ${dropdownChevronStyles}

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

    .option:has(.option-icons) {grid-template-columns: minmax(0, 1fr) auto;}
    .option:has(.option-icons) .option-code {grid-column: 1; grid-row: 1;}
    .option:has(.option-icons) .option-name,
    .option:has(.option-icons) .option-description {grid-column: 1 / -1;}
    .option:has(.selection-check) {grid-template-columns: minmax(0, 1fr) auto;}
    .option:has(.option-icons):has(.selection-check) {grid-template-columns: minmax(0, 1fr) auto auto;}
    .selection-check {grid-column: 2; grid-row: 1; margin-inline-start: auto; color: #3977c7;}
    .option:has(.option-icons) .selection-check {grid-column: 3;}
    .option[aria-selected="false"] .selection-check {visibility: hidden;}
    :host([multiple]) .option[data-active] {outline: 1px solid #8eb6df; outline-offset: -1px;}
    .option-icons {grid-column: 2; grid-row: 1; display: flex; gap: 0.2rem; align-items: center;}
    .option-icons img {display: block; width: 1rem; height: 1rem;}

    .option-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.68rem;
      line-height: 0.95rem;
    }

    :host([language-picker]) .listbox {min-width: min(7rem, calc(100vw - 1rem));}
    :host([language-picker]) .option > .option-name {
      flex-shrink: 0;
      overflow: visible;
      text-overflow: clip;
    }

    .option-description {
      font-size: 0.68rem;
      font-style: italic;
      line-height: 0.95rem;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  `

  value = ""
  label = "Choose"
  placeholder = ""
  options: readonly ComboboxOption[] = []
  searchOptions?: readonly ComboboxOption[]
  formatValue?: (value: string) => string
  showValue = false
  editable = true
  multiple = false
  values: readonly string[] = []
  disabled = false
  protected open = false
  protected allowCustomValue = true
  private draft = ""
  private editing = false
  private searching = false
  private showAll = false
  private typeahead = ""
  private lastTypeahead = 0
  private tagStrip?: Element
  private tagResizeObserver?: ResizeObserver
  protected activeIndex = -1
  private readonly listboxId = `document-head-suggestions-${++comboboxInstanceCount}`

  private readonly observeTagStrip = (strip?: Element) => {
    this.tagResizeObserver?.disconnect()
    this.tagStrip = strip
    if(strip) {
      this.tagResizeObserver ??= new ResizeObserver(() => this.fitSelectionTags())
      this.tagResizeObserver.observe(strip)
    }
  }

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
    if((changed.has("value") || changed.has("showValue") || changed.has("options") || changed.has("searchOptions")
      || changed.has("formatValue") || changed.has("multiple")) && !this.editing) this.draft = this.displayedValue()
  }

  protected displayedValue() {
    if(this.multiple) return ""
    return this.showValue ? this.value : this.selectedOption()?.label ?? this.formatValue?.(this.value) ?? this.value
  }

  protected renderToggleIcon(): unknown {
    return html`<span class="chevron" aria-hidden="true"></span>`
  }

  protected renderSuffix(): unknown { return nothing }

  protected cancelInput() { this.close(true) }
  protected outsidePointerDown(_event: PointerEvent) { if(this.open) this.close() }
  protected blurInput(_event: FocusEvent) {}

  protected updated(changed: Map<string, unknown>) {
    this.fitSelectionTags()
    if(changed.has("open")) this.dispatchEvent(new CustomEvent("combobox-toggle", {
      detail: {open: this.open}, bubbles: true, composed: true,
    }))
  }

  private fitSelectionTags() {
    const strip = this.tagStrip
    if(!strip) return
    const tags = Array.from(strip.querySelectorAll<HTMLElement>(".selection-tag:not(.selection-tag-count)"))
    const counter = strip.querySelector<HTMLElement>(".selection-tag-count")!
    const width = strip.getBoundingClientRect().width
    let visible = Math.min(1, tags.length)
    if(width && tags.length > 1) {
      const gap = parseFloat(getComputedStyle(strip).columnGap) || 0
      const widths = tags.map(tag => {
        const label = tag.querySelector<HTMLElement>(".selection-tag-label")!
        // Include the clipped text when a long first tag is already sharing space with the count.
        return tag.getBoundingClientRect().width + Math.max(0, label.scrollWidth - label.clientWidth)
      })
      const total = widths.reduce((sum, tagWidth) => sum + tagWidth, 0) + gap * (tags.length - 1)
      if(total <= width) visible = tags.length
      else {
        let used = widths[0] + gap
        let counterWidth = counter.getBoundingClientRect().width
        while(visible < tags.length - 1) {
          const count = `+${tags.length - visible - 1}`
          // The counter uses tabular digits, so its width only changes at a digit boundary.
          if(count.length !== counter.textContent?.length) {
            counter.textContent = count
            counterWidth = counter.getBoundingClientRect().width
          }
          const next = used + widths[visible] + gap
          if(next + counterWidth > width) break
          used = next
          visible++
        }
      }
    }
    // Apply measured layout directly to the rendered tags without requesting another render.
    tags.forEach((tag, index) => { tag.hidden = index >= visible })
    const hiddenCount = tags.length - visible
    counter.hidden = hiddenCount === 0
    const count = `+${hiddenCount}`
    if(counter.textContent !== count) counter.textContent = count
  }

  protected selectedOption() {
    return this.options.find(option => option.value === this.value)
      ?? this.searchOptions?.find(option => option.value === this.value)
  }

  protected filteredOptions() {
    if(!this.editable || this.multiple) return this.options
    const query = this.draft.trim().toLocaleLowerCase("en")
    if(this.searchOptions) {
      if(this.searching && query) {
        return this.searchOptions.map(option => ({
          option,
          rank: Math.min(matchRank(query, option.label), matchRank(query, option.description ?? "")),
        })).filter(({rank}) => Number.isFinite(rank))
          .sort((a, b) => a.rank - b.rank)
          .map(({option}) => option)
      }
      if(!this.showAll) return [...this.options, showAllOption]
      const featured = new Set(this.options.map(option => option.value))
      const [first, ...rest] = this.searchOptions.filter(option => !featured.has(option.value))
      return first ? [...this.options, {...first, dividerBefore: true}, ...rest] : this.options
    }
    if(!query || query === this.displayedValue().toLocaleLowerCase("en") || query === this.value.toLocaleLowerCase("en")) {
      return this.options
    }
    return this.options.filter(option => [option.label, option.value, option.description ?? "", option.detail ?? ""]
      .some(value => value.toLocaleLowerCase("en").includes(query)))
  }

  close(reset = false) {
    this.open = false
    this.activeIndex = -1
    this.typeahead = ""
    this.searching = false
    this.showAll = false
    if(reset) {
      this.editing = false
      this.draft = this.displayedValue()
      this.requestUpdate()
    }
  }

  protected async setOpen(open: boolean) {
    if(this.disabled) return
    if(!open && this.searchOptions) { this.close(true); return }
    if(this.multiple) {
      if(!open) { this.close(); return }
      if(!this.open) {
        const selected = this.options.findIndex(option => !option.disabled && this.values.includes(option.value))
        this.activeIndex = selected < 0 ? this.options.findIndex(option => !option.disabled) : selected
      }
    }
    this.open = open
    if(!this.open) return
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    this.renderRoot.querySelector<HTMLElement>(".listbox")?.showPopover?.()
    if(this.multiple) void this.scrollToActiveOption()
  }

  private async scrollToActiveOption() {
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(".option[data-active]")?.scrollIntoView?.({block: "nearest"})
  }

  protected emit(value: string) {
    if(this.disabled) return
    this.value = value
    this.editing = false
    this.draft = this.displayedValue()
    this.close()
    this.dispatchEvent(new CustomEvent<{value: string}>("combobox-change", {
      detail: {value},
      bubbles: true,
      composed: true,
    }))
  }

  protected select(option: ComboboxOption, _event?: Event) {
    if(this.disabled || option.disabled) return
    if(option === showAllOption) {
      this.showAll = true
      this.activeIndex = this.options.length
      this.renderRoot.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true})
      this.requestUpdate()
      void this.scrollToActiveOption()
      return
    }
    if(this.multiple) {
      this.changeValues(this.values.includes(option.value)
        ? this.values.filter(value => value !== option.value) : [...this.values, option.value])
      return
    }
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
    this.emit(option.value)
  }

  private changeValues(values: string[]) {
    if(this.disabled) return
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true})
    this.values = values
    this.dispatchEvent(new CustomEvent("combobox-change", {
      detail: {value: values.join(", "), values: [...values]}, bubbles: true, composed: true,
    }))
  }

  protected commitDraft(event?: Event) {
    if(!this.editable || this.multiple) return
    if(event?.currentTarget instanceof HTMLInputElement) this.draft = event.currentTarget.value
    const draft = this.draft.trim()
    const query = draft.toLocaleLowerCase("en")
    const exactValue = (option: ComboboxOption) => option.value.toLocaleLowerCase("en") === query
      || option.label.toLocaleLowerCase("en") === query
    const exact = this.options.find(exactValue) ?? this.searchOptions?.find(exactValue)
      ?? this.searchOptions?.find(option => option.description?.toLocaleLowerCase("en") === query)
    if(exact?.disabled || !exact && !this.allowCustomValue) { this.close(true); return }
    const value = exact?.value ?? (draft === this.displayedValue() ? this.value : draft)
    if(value !== this.value) this.emit(value)
    else this.close(true)
  }

  protected handleFocus() {
    if(this.disabled || this.multiple) return
    this.editing = this.editable
    this.draft ||= this.displayedValue()
    void this.setOpen(true)
  }

  protected handleInputClick() {
    if(this.multiple) this.handleToggleClick()
    else void this.setOpen(true)
  }

  private handleToggleClick() {
    if(this.multiple) this.renderRoot.querySelector<HTMLInputElement>("input")?.focus({preventScroll: true})
    void this.setOpen(!this.open)
  }

  private handleControlFocusOut(event: FocusEvent) {
    if(this.multiple && !(event.relatedTarget instanceof Node && this.renderRoot.contains(event.relatedTarget))) this.close()
  }

  private handleControlKeydown(event: KeyboardEvent) {
    if(this.multiple && this.open && event.key === "Escape") {
      event.stopPropagation()
      this.documentKeydown(event)
    }
  }

  protected handleInput(event: InputEvent) {
    if(this.disabled || !this.editable || this.multiple) return
    this.editing = true
    this.draft = (event.currentTarget as HTMLInputElement).value
    this.searching = true
    this.dispatchEvent(new Event("combobox-input", {bubbles: true, composed: true}))
    this.activeIndex = -1
    void this.setOpen(true)
    this.requestUpdate()
    if(this.searchOptions) {
      const listbox = this.renderRoot.querySelector<HTMLElement>(".listbox")
      if(listbox) listbox.scrollTop = 0
    }
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(this.disabled) return
    const options = this.filteredOptions()
    const boundary = this.multiple && (event.key === "Home" || event.key === "End")
    if(event.key === "ArrowDown" || event.key === "ArrowUp" || boundary) {
      event.preventDefault()
      if(!this.open) {
        void this.setOpen(true)
        if(this.multiple && !boundary) return
      }
      const offset = event.key === "ArrowDown" ? 1 : -1
      const indices = options.flatMap((option, index) => option.disabled ? [] : [index])
      const current = indices.indexOf(this.activeIndex)
      this.activeIndex = boundary ? (event.key === "Home" ? indices[0] : indices.at(-1)) ?? -1
        : indices.length ? indices[current < 0
        ? offset > 0 ? 0 : indices.length - 1
        : (current + offset + indices.length) % indices.length] : -1
      this.requestUpdate()
      if(this.multiple || this.searchOptions) void this.scrollToActiveOption()
      return
    }
    if(this.multiple && (event.key === "Enter" || event.key === " " && !this.typeaheadActive(event))) {
      event.preventDefault()
      if(!this.open) void this.setOpen(true)
      else if(options[this.activeIndex]) this.select(options[this.activeIndex])
      return
    }
    if(event.key === " " && !this.editable && !this.multiple) {
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
      return
    }
    if(this.multiple && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault()
      const key = event.key.toLocaleLowerCase()
      this.typeahead = this.typeaheadActive(event) ? this.typeahead + key : key
      this.lastTypeahead = event.timeStamp
      if(!this.open) void this.setOpen(true)
      const match = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(this.typeahead))
      if(match >= 0) {
        this.activeIndex = match
        this.requestUpdate()
        void this.scrollToActiveOption()
      }
    }
  }

  private typeaheadActive(event: KeyboardEvent) {
    return Boolean(this.typeahead && event.timeStamp - this.lastTypeahead < 750)
  }

  protected optionGroups(options: readonly ComboboxOption[]) {
    const groups = new Map<string, {option: ComboboxOption, index: number}[]>()
    options.forEach((option, index) => {
      const group = option.group ?? ""
      if(!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push({option, index})
    })
    return groups
  }

  protected renderEmptyOptions(_group: string): unknown {
    return html`<span class="option-name">No matches</span>`
  }

  protected renderGroupHeading(group: string): unknown {
    return html`<div class="group-label" title=${group} aria-hidden="true">${group}</div>`
  }

  protected renderBeforeOptions(_group: string): unknown { return nothing }
  protected renderBeforeOption(_option: ComboboxOption, _previous?: ComboboxOption): unknown { return nothing }
  protected optionStyle(_option: ComboboxOption, _index: number) { return "" }
  protected activateOption(_option: ComboboxOption, _index: number) {}

  protected renderGroupOptions(group: string, entries: {option: ComboboxOption, index: number}[]): unknown {
    return html`
      ${this.renderBeforeOptions(group)}
      ${entries.length ? nothing : this.renderEmptyOptions(group)}
      ${this.renderOptionEntries(entries)}`
  }

  protected renderOptionEntries(entries: {option: ComboboxOption, index: number}[], sections = true): unknown {
    const selected = this.selectedOption()
    return html`${entries.map(({option, index}, groupIndex) => html`
      ${sections ? this.renderBeforeOption(option, entries[groupIndex - 1]?.option) : nothing}
      ${option.dividerBefore ? html`<hr class="divider" role="separator" />` : nothing}
      <button
        id=${`${this.listboxId}-option-${index}`}
        class="option"
        type="button"
        role="option"
        tabindex=${this.multiple ? "-1" : nothing}
        ?disabled=${option.disabled}
        title=${option.description ? `${option.label} — ${option.description}` : option.label}
        style=${this.optionStyle(option, index)}
        aria-selected=${this.multiple ? this.values.includes(option.value)
          : option !== showAllOption && selected?.value === option.value}
        data-active=${this.activeIndex === index ? "" : nothing}
        @mousedown=${(event: MouseEvent) => event.preventDefault()}
        @pointerenter=${() => this.activateOption(option, index)}
        @focus=${() => this.activateOption(option, index)}
        @click=${(event: MouseEvent) => this.select(option, event)}
      >
        <strong class="option-code">${option.label}</strong>
        ${this.showValue ? html`<span class="option-name option-value">${option.description ?? option.value}</span>`
          : option.description ? html`<span class="option-name">${option.description}</span>` : nothing}
        ${option.detail ? html`<span class="option-description">${option.detail}</span>` : nothing}
        ${option.icons?.length ? html`<span class="option-icons" aria-hidden="true">${option.icons.map(icon => html`<img src=${icon.src} alt="" data-icon=${icon.name}>`)}</span>` : nothing}
        ${this.multiple ? html`<span class="selection-check" aria-hidden="true">${ribbonIcon("Accept")}</span>` : nothing}
      </button>
    `)}`
  }

  private renderSelectionTags() {
    return html`
      <span class="selection-tags" ${ref(this.observeTagStrip)} @click=${this.handleToggleClick}>
        ${this.values.map(value => {
          const label = this.options.find(option => option.value === value)?.label ?? value
          return html`<span class="selection-tag">
            <span class="selection-tag-label" title=${label}>${label}</span>
            <button class="selection-remove" type="button" aria-label=${`Remove ${label}`} title=${`Remove ${label}`}
              ?disabled=${this.disabled} @click=${(event: MouseEvent) => {
                event.stopPropagation()
                this.changeValues(this.values.filter(selected => selected !== value))
              }}
            >${ribbonIcon("Reject")}</button>
          </span>`
        })}
        <span class="selection-tag selection-tag-count" hidden aria-hidden="true"></span>
      </span>
    `
  }

  render() {
    const options = this.open ? this.filteredOptions() : []
    const groups = this.optionGroups(options)
    return html`
      <span class="control" style=${`anchor-name: --${this.listboxId}`}
        @focusout=${this.handleControlFocusOut} @keydown=${this.handleControlKeydown}>
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
          .value=${live(this.multiple && this.values.length ? `${this.values.length} selected` : this.draft)}
          ?disabled=${this.disabled}
          .readOnly=${!this.editable || this.multiple}
          @click=${this.handleInputClick}
          @focus=${this.handleFocus}
          @blur=${this.blurInput}
          @input=${this.handleInput}
          @change=${(event: Event) => { this.commitDraft(event); event.stopPropagation() }}
          @keydown=${this.handleKeydown}
        />
        ${this.multiple && this.values.length ? this.renderSelectionTags() : nothing}
        <button
          class="toggle dropdown-chevron"
          type="button"
          tabindex="-1"
          ?disabled=${this.disabled}
          aria-label=${`Show ${this.label.toLocaleLowerCase()} suggestions`}
          aria-expanded=${this.open}
          aria-controls=${this.listboxId}
          @mousedown=${(event: MouseEvent) => event.preventDefault()}
          @click=${this.handleToggleClick}
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
          ${groups.size ? Array.from(groups, ([group, entries]) => html`
            <div class="option-group" role=${group ? "group" : nothing} aria-label=${group || nothing}>
              ${group ? this.renderGroupHeading(group) : nothing}
              ${this.renderGroupOptions(group, entries)}
            </div>
          `) : this.multiple || !this.allowCustomValue ? this.renderEmptyOptions("") : html`<span class="option-name">Press Enter to use “${this.draft.trim()}”.</span>`}
        </div>
      ` : nothing}
    `
  }
}

/** Theme picker with placeholder typography and palette previews. */
