import {LitElement, css, html, nothing} from "lit"
import {
  WEBWRITER_GENERATOR,
  creativeCommonsLicenses,
  emptyDocumentHeadState,
  type DocumentHeadAction,
  type DocumentHeadElementKind,
  type DocumentHeadElementState,
  type DocumentHeadField,
  type DocumentHeadState,
} from "../document-head"
import {documentLanguages} from "../document-languages"
import {documentThemes} from "../document-themes"

type LanguageOption = {label: string, value: string, sortLabel: string}
type ComboboxOption = {
  value: string
  label: string
  description?: string
  dividerBefore?: boolean
}

const commonElementPresets = new Set([
  "title",
  "description",
  "keywords",
  "author",
  "license",
  "generator",
  "theme",
])

const primaryAttributesByPreset: Record<string, ReadonlySet<string>> = {
  description: new Set(["name", "content"]),
  keywords: new Set(["name", "content"]),
  author: new Set(["name", "content"]),
  license: new Set(["rel", "href"]),
  generator: new Set(["name", "content"]),
  theme: new Set(["data-ww-theme"]),
}

const canonicalLanguage = (value: string) => {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? ""
  }
  catch {
    return ""
  }
}

const englishLanguageNames = new Intl.DisplayNames(["en"], {type: "language", fallback: "none"})

const languageName = (code: string, fallback = code) => {
  const english = englishLanguageNames.of(code) ?? fallback
  let native = ""
  try {
    native = new Intl.DisplayNames([code], {type: "language", fallback: "none"}).of(code) ?? ""
  }
  catch {
    // The English name remains useful when this browser has no locale data
    // for the language itself.
  }
  const comparable = (value: string) => value.toLocaleLowerCase("en").replaceAll(/[^\p{L}\p{N}]+/gu, "")
  return native && comparable(native) !== comparable(english) ? `${english} (${native})` : english
}

let cachedOfficialLanguages: LanguageOption[] | undefined
let comboboxInstanceCount = 0
let themePickerInstanceCount = 0

/** Nationally official language suggestions ordered by English display name. */
export function officialLanguageOptions() {
  if(cachedOfficialLanguages) return cachedOfficialLanguages
  cachedOfficialLanguages = documentLanguages.map(({code: value, name}) => {
    const sortLabel = englishLanguageNames.of(value) ?? name
    return {value, label: languageName(value, name), sortLabel}
  }).sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, "en", {sensitivity: "base"}) || a.value.localeCompare(b.value))
  return cachedOfficialLanguages
}

/** Browser-preferred official languages followed by the alphabetical list. */
export function orderedLanguageOptions(
  preferred: readonly string[] = globalThis.navigator?.languages ?? [],
) {
  const alphabetical = officialLanguageOptions()
  const optionsByValue = new Map(alphabetical.map(option => [option.value, option]))
  const promotedValues = preferred
    .map(canonicalLanguage)
    .map(value => value.split("-")[0])
    .filter(value => optionsByValue.has(value))
    .filter((value, index, values) => value && values.indexOf(value) === index)
  const promoted = promotedValues.map(value => optionsByValue.get(value)!)
  const promotedSet = new Set(promotedValues)
  return {
    promoted,
    alphabetical: alphabetical.filter(option => !promotedSet.has(option.value)),
  }
}

/** Editable metadata combobox with optional rich suggestions. */
class DocumentHeadCombobox extends LitElement {
  static properties = {
    value: {type: String},
    label: {type: String},
    placeholder: {type: String},
    options: {attribute: false},
    open: {type: Boolean, reflect: true, state: true},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      height: 1.4rem;
      color: #2f3742;
      font: inherit;
    }

    .control {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      height: 1.4rem;
      min-width: 0;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: inherit;
      background: transparent;
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
      font-size: 0.62rem;
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
      z-index: 1100;
      width: min(25rem, calc(100vw - 1rem));
      max-height: min(26rem, calc(100vh - 1rem));
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
      font-size: 0.72rem;
      font-weight: 750;
      line-height: 1rem;
    }

    .option-name {
      font-size: 0.68rem;
      line-height: 0.95rem;
    }
  `

  value = ""
  label = "Choose"
  placeholder = ""
  options: readonly ComboboxOption[] = []
  private open = false
  private draft = ""
  private editing = false
  private activeIndex = -1
  private position = {left: 8, top: 8}
  private readonly listboxId = `document-head-suggestions-${++comboboxInstanceCount}`

  private readonly documentPointerDown = (event: PointerEvent) => {
    if(this.open && !event.composedPath().includes(this)) this.close()
  }

  private readonly documentKeydown = (event: KeyboardEvent) => {
    if(!this.open || event.key !== "Escape") return
    this.close(true)
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.documentPointerDown)
    document.addEventListener("keydown", this.documentKeydown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.documentPointerDown)
    document.removeEventListener("keydown", this.documentKeydown)
    super.disconnectedCallback()
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("value") && !this.editing) this.draft = this.selectedOption()?.label ?? this.value
  }

  private selectedOption() {
    return this.options.find(option => option.value === this.value)
  }

  private filteredOptions() {
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
      this.draft = this.selectedOption()?.label ?? this.value
    }
  }

  private async setOpen(open: boolean) {
    this.open = open
    if(!this.open) return
    await this.updateComplete
    const trigger = this.renderRoot.querySelector<HTMLElement>(".control")?.getBoundingClientRect()
      ?? this.getBoundingClientRect()
    const listbox = this.renderRoot.querySelector<HTMLElement>(".listbox")
    const bounds = listbox?.getBoundingClientRect()
    const width = bounds?.width ?? 400
    const height = bounds?.height ?? 320
    const margin = 8
    const left = Math.min(Math.max(margin, trigger.left), Math.max(margin, window.innerWidth - width - margin))
    const below = trigger.bottom + 4
    const top = below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, trigger.top - height - 4)
    this.position = {left, top}
    this.requestUpdate()
  }

  private emit(value: string) {
    this.value = value
    this.editing = false
    this.draft = this.selectedOption()?.label ?? value
    this.close()
    this.dispatchEvent(new CustomEvent<{value: string}>("combobox-change", {
      detail: {value},
      bubbles: true,
      composed: true,
    }))
  }

  private select(option: ComboboxOption) {
    this.emit(option.value)
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
  }

  private commitDraft() {
    const draft = this.draft.trim()
    const exact = this.options.find(option => option.value.toLocaleLowerCase("en") === draft.toLocaleLowerCase("en")
      || option.label.toLocaleLowerCase("en") === draft.toLocaleLowerCase("en"))
    const value = exact?.value ?? draft
    if(value !== this.value) this.emit(value)
    else this.close(true)
  }

  private handleFocus() {
    this.editing = true
    this.draft ||= this.selectedOption()?.label ?? this.value
    void this.setOpen(true)
  }

  private handleInput(event: InputEvent) {
    this.editing = true
    this.draft = (event.currentTarget as HTMLInputElement).value
    this.activeIndex = -1
    void this.setOpen(true)
  }

  private handleKeydown(event: KeyboardEvent) {
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
    if(event.key === "Enter") {
      event.preventDefault()
      const option = this.activeIndex >= 0 ? options[this.activeIndex] : undefined
      if(option) this.select(option)
      else this.commitDraft()
      return
    }
    if(event.key === "Escape") {
      event.preventDefault()
      this.close(true)
    }
  }

  render() {
    const options = this.filteredOptions()
    return html`
      <span class="control">
        <input
          role="combobox"
          aria-label=${this.label}
          aria-autocomplete="list"
          aria-expanded=${this.open}
          aria-haspopup="listbox"
          aria-controls=${this.listboxId}
          aria-activedescendant=${this.open && this.activeIndex >= 0 ? `${this.listboxId}-option-${this.activeIndex}` : nothing}
          autocomplete="off"
          data-ribbon-input-persistent
          placeholder=${this.placeholder}
          .value=${this.draft}
          @focus=${this.handleFocus}
          @input=${this.handleInput}
          @change=${this.commitDraft}
          @keydown=${this.handleKeydown}
        />
        <button
          class="toggle"
          type="button"
          tabindex="-1"
          aria-label=${`Show ${this.label.toLocaleLowerCase()} suggestions`}
          aria-expanded=${this.open}
          aria-controls=${this.listboxId}
          @mousedown=${(event: MouseEvent) => event.preventDefault()}
          @click=${() => this.setOpen(!this.open)}
        ><span class="chevron" aria-hidden="true"></span></button>
      </span>
      ${this.open ? html`
        <div
          id=${this.listboxId}
          class="listbox"
          role="listbox"
          aria-label=${`${this.label} suggestions`}
          style=${`left:${this.position.left}px;top:${this.position.top}px`}
        >
          ${options.length ? options.map((option, index) => html`
            ${option.dividerBefore ? html`<hr class="divider" role="separator" />` : nothing}
            <button
              id=${`${this.listboxId}-option-${index}`}
              class="option"
              type="button"
              role="option"
              aria-selected=${this.value === option.value}
              data-active=${this.activeIndex === index ? "" : nothing}
              @mousedown=${(event: MouseEvent) => {
                event.preventDefault()
                this.select(option)
              }}
            >
              <strong class="option-code">${option.label}</strong>
              ${option.description ? html`<span class="option-name">${option.description}</span>` : nothing}
            </button>
          `) : html`<span class="option-name">Press Enter to use “${this.draft.trim()}”.</span>`}
        </div>
      ` : nothing}
    `
  }
}

/** Theme picker with placeholder typography and palette previews. */
class DocumentThemePicker extends LitElement {
  static properties = {
    value: {type: String},
    open: {type: Boolean, reflect: true, state: true},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      height: 100%;
      color: #2f3742;
      font: inherit;
    }

    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .control,
    .option {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.15rem 0.35rem;
      width: 100%;
      min-width: 0;
      border: 1px solid #c8d2df;
      border-radius: 0.3rem;
      color: inherit;
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .control {
      height: 100%;
      min-height: 3.45rem;
      padding: 0.3rem 0.4rem;
    }

    .control:hover,
    :host([open]) .control {
      border-color: #8eb6df;
    }

    .theme-name {
      min-width: 0;
      overflow: hidden;
      font-size: 0.64rem;
      font-weight: 700;
      line-height: 0.8rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      width: 0.3rem;
      height: 0.3rem;
      margin: 0.05rem 0.1rem 0;
      border-right: 1.25px solid currentColor;
      border-bottom: 1.25px solid currentColor;
      transform: rotate(45deg);
    }

    :host([open]) .chevron {
      margin-top: 0.2rem;
      transform: rotate(225deg);
    }

    .preview {
      display: flex;
      grid-column: 1 / -1;
      align-items: center;
      justify-content: space-between;
      gap: 0.35rem;
      min-width: 0;
    }

    .type-preview {
      overflow: hidden;
      color: #475467;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 0.82rem;
      font-weight: 650;
      line-height: 1rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .palette {
      display: flex;
      flex: 0 0 auto;
      overflow: hidden;
      border: 1px solid #d8dee6;
      border-radius: 999px;
    }

    .swatch {
      width: 0.65rem;
      height: 0.65rem;
    }

    .listbox {
      box-sizing: border-box;
      display: grid;
      position: fixed;
      z-index: 1100;
      width: min(17rem, calc(100vw - 1rem));
      max-height: min(26rem, calc(100vh - 1rem));
      gap: 0.25rem;
      padding: 0.35rem;
      overflow: auto;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      background: #fff;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
    }

    .option {
      padding: 0.45rem 0.55rem;
      border-color: transparent;
    }

    .option:hover,
    .option[aria-selected="true"] {
      color: #174f87;
      border-color: #c9def4;
      background: #eef4fb;
    }
  `

  value = ""
  private open = false
  private position = {left: 8, top: 8}
  private readonly listboxId = `document-theme-options-${++themePickerInstanceCount}`
  private readonly placeholderPalette = ["#334155", "#3977c7", "#dcecff", "#f8fafc"]

  private readonly documentPointerDown = (event: PointerEvent) => {
    if(this.open && !event.composedPath().includes(this)) this.close()
  }

  private readonly documentKeydown = (event: KeyboardEvent) => {
    if(!this.open || event.key !== "Escape") return
    this.close()
    this.renderRoot.querySelector<HTMLButtonElement>(".control")?.focus()
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.documentPointerDown)
    document.addEventListener("keydown", this.documentKeydown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.documentPointerDown)
    document.removeEventListener("keydown", this.documentKeydown)
    super.disconnectedCallback()
  }

  close() {
    this.open = false
  }

  private async setOpen(open: boolean) {
    this.open = open
    if(!open) return
    await this.updateComplete
    const trigger = this.renderRoot.querySelector<HTMLElement>(".control")?.getBoundingClientRect()
      ?? this.getBoundingClientRect()
    const listbox = this.renderRoot.querySelector<HTMLElement>(".listbox")
    const bounds = listbox?.getBoundingClientRect()
    const width = bounds?.width ?? 272
    const height = bounds?.height ?? 360
    const margin = 8
    const left = Math.min(Math.max(margin, trigger.left), Math.max(margin, window.innerWidth - width - margin))
    const below = trigger.bottom + 4
    const top = below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, trigger.top - height - 4)
    this.position = {left, top}
    this.requestUpdate()
  }

  private select(value: string) {
    this.value = value
    this.close()
    this.dispatchEvent(new CustomEvent<{value: string}>("theme-change", {
      detail: {value},
      bubbles: true,
      composed: true,
    }))
    this.renderRoot.querySelector<HTMLButtonElement>(".control")?.focus()
  }

  private preview() {
    return html`
      <span class="preview" data-placeholder>
        <span class="type-preview" aria-label="Default font placeholder">Aa Default</span>
        <span class="palette" aria-label="Color palette placeholder">
          ${this.placeholderPalette.map(color => html`<span class="swatch" style=${`background:${color}`}></span>`)}
        </span>
      </span>
    `
  }

  render() {
    const selected = documentThemes.find(theme => theme.value === this.value)
    const options = [{value: "", label: "Not specified"}, ...documentThemes]
    return html`
      <button
        class="control"
        type="button"
        role="combobox"
        aria-label="Theme"
        aria-expanded=${this.open}
        aria-haspopup="listbox"
        aria-controls=${this.listboxId}
        @click=${() => this.setOpen(!this.open)}
      >
        <span class="theme-name">${selected?.label ?? "Not specified"}</span>
        <span class="chevron" aria-hidden="true"></span>
        ${this.preview()}
      </button>
      ${this.open ? html`
        <div
          id=${this.listboxId}
          class="listbox"
          role="listbox"
          aria-label="Theme options"
          style=${`left:${this.position.left}px;top:${this.position.top}px`}
        >
          ${options.map(option => html`
            <button
              class="option"
              type="button"
              role="option"
              aria-selected=${this.value === option.value}
              data-value=${option.value}
              @click=${() => this.select(option.value)}
            >
              <span class="theme-name">${option.label}</span>
              ${this.preview()}
            </button>
          `)}
        </div>
      ` : nothing}
    `
  }
}

/** Compact common metadata fields and the expanded, lossless head-element form. */
export class DocumentHeadEditor extends LitElement {
  static properties = {
    mode: {type: String, reflect: true},
    state: {attribute: false},
    expanded: {type: Boolean, reflect: true},
    attributeEditorId: {type: String, attribute: false},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: 100%;
      min-width: 0;
      height: 100%;
      color: #2f3742;
      font: inherit;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    .common-grid {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(6.75rem, 0.95fr);
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 0.2rem 0.3rem;
      width: 100%;
      height: 100%;
      padding: 0.05rem 0.1rem 0.25rem;
    }

    .common-field {
      display: flex;
      flex-direction: column;
      gap: 0.05rem;
      min-width: 0;
    }

    .theme-field {
      grid-column: 3;
      grid-row: 1 / 3;
    }

    .theme-field .field-control {
      flex: 1 1 auto;
      min-height: 0;
    }

    .field-label {
      overflow: hidden;
      color: #526b86;
      font-size: 0.54rem;
      font-weight: 650;
      line-height: 0.65rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .common-control,
    .generator-control {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.4rem;
      padding: 0 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font-size: 0.62rem;
    }

    .field-control {
      display: flex;
      align-items: stretch;
      gap: 0.12rem;
      min-width: 0;
    }

    .field-control > :first-child {
      flex: 1 1 auto;
      min-width: 0;
    }

    .field-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 0.05rem;
    }

    .field-action {
      display: grid;
      place-items: center;
      width: 1.05rem;
      height: 1.4rem;
      padding: 0;
      border: 0;
      border-radius: 0.2rem;
      color: #526b86;
      background: transparent;
      font-size: 0.68rem;
      line-height: 1;
      cursor: pointer;
    }

    .field-action:hover,
    .field-action[data-active] {
      color: #174f87;
      background: #dcecff;
    }

    .common-control:focus,
    .generator-control:focus-visible {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .generator-control {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      cursor: default;
    }

    .generator-control[data-missing] {
      color: #526b86;
      border-style: dashed;
      cursor: pointer;
    }

    .generator-control code {
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.61rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .advanced {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 0.45rem 0.1rem 0.15rem;
      border-top: 1px solid #d8dee6;
    }

    .advanced-metadata {
      display: grid;
      flex: 0 0 auto;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
    }

    .advanced-metadata .generator-entry {
      grid-column: 1 / -1;
    }

    .generator-entry .generator-control {
      justify-content: flex-start;
      cursor: default;
    }

    .add-toolbar {
      display: grid;
      flex: 0 0 auto;
      grid-template-columns: repeat(4, minmax(0, 1fr)) 4.25rem;
      min-height: 1.75rem;
      border: 1px solid #c8d2df;
      border-radius: 0.3rem;
      overflow: hidden;
    }

    .add-toolbar button,
    .add-toolbar select {
      box-sizing: border-box;
      min-width: 0;
      height: 1.75rem;
      padding: 0 0.4rem;
      border: 0;
      border-right: 1px solid #d8dee6;
      color: #3f4651;
      background: transparent;
      font-size: 0.62rem;
      cursor: pointer;
    }

    .add-toolbar select {
      width: 100%;
      padding-right: 1.35rem;
      border-right: 0;
      appearance: none;
    }

    .more-select {
      position: relative;
      min-width: 0;
    }

    .more-chevron {
      position: absolute;
      top: 50%;
      right: 0.7rem;
      width: 0.3rem;
      height: 0.3rem;
      border-right: 1.25px solid #526b86;
      border-bottom: 1.25px solid #526b86;
      pointer-events: none;
      transform: translateY(-70%) rotate(45deg);
    }

    .add-toolbar button:hover,
    .add-toolbar select:hover {
      background: #eef4fb;
    }

    .entries {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 0.4rem;
      min-height: 0;
      padding-right: 0.15rem;
      overflow: auto;
      scrollbar-width: thin;
    }

    .empty {
      display: grid;
      flex: 1 1 auto;
      place-items: center;
      min-height: 5rem;
      color: #667085;
      font-size: 0.68rem;
    }

    .entry {
      flex: 0 0 auto;
      padding: 0.4rem;
      border: 1px solid #d8dee6;
      border-radius: 0.35rem;
      background: #fff;
    }

    .entry-header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      margin-bottom: 0.3rem;
    }

    .entry-title {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      font-size: 0.68rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag {
      margin-left: 0.25rem;
      color: #667085;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.6rem;
      font-weight: 400;
    }

    .entry-action,
    .attribute-remove {
      display: grid;
      flex: 0 0 1.4rem;
      place-items: center;
      width: 1.4rem;
      height: 1.4rem;
      padding: 0;
      border: 0;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .entry-action:hover,
    .attribute-remove:hover {
      color: #174f87;
      background: #eef4fb;
    }

    .entry-action:disabled {
      color: #b8c0ca;
      background: transparent;
      cursor: default;
    }

    .attributes {
      display: grid;
      gap: 0.2rem;
    }

    .attribute-row,
    .attribute-add {
      display: grid;
      grid-template-columns: minmax(5rem, 0.8fr) minmax(7rem, 1.5fr) 1.4rem;
      gap: 0.25rem;
      min-width: 0;
    }

    .attribute-add {
      margin-top: 0.05rem;
    }

    .advanced-input,
    .content {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font-size: 0.62rem;
    }

    .advanced-input {
      height: 1.45rem;
      padding: 0 0.3rem;
    }

    .advanced-input:focus,
    .content:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .attribute-add button {
      display: grid;
      place-items: center;
      width: 1.4rem;
      height: 1.4rem;
      padding: 0;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .entry.common-attributes {
      border-color: #9fbbd8;
      background: #eef4fb;
    }

    .content-field {
      display: grid;
      gap: 0.1rem;
      margin-top: 0.3rem;
    }

    .content {
      min-height: 3.25rem;
      padding: 0.3rem;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      line-height: 0.85rem;
      resize: vertical;
    }
  `

  mode: "common" | "advanced" = "common"
  state: DocumentHeadState = emptyDocumentHeadState()
  expanded = false
  attributeEditorId = ""

  private dispatchAction(action: DocumentHeadAction) {
    this.dispatchEvent(new CustomEvent<DocumentHeadAction>("document-head-action", {
      detail: action,
      bubbles: true,
      composed: true,
    }))
  }

  private setField(field: DocumentHeadField, value: string) {
    this.dispatchAction({type: "setDocumentHeadField", field, value})
  }

  private handleCommonChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    this.setField(input.name as DocumentHeadField, input.value)
  }

  private handleComboboxChange(field: "license" | "language", event: Event) {
    const value = (event as CustomEvent<{value: string}>).detail.value
    this.setField(field, value)
  }

  private handleThemeChange(event: Event) {
    this.setField("theme", (event as CustomEvent<{value: string}>).detail.value)
  }

  private entryForPreset(preset: string) {
    return this.state.elements.find(element => element.preset === preset)
  }

  private requestAttributeEditor(entry: DocumentHeadElementState) {
    const id = this.attributeEditorId === entry.id ? "" : entry.id
    this.dispatchEvent(new CustomEvent<{id: string}>("document-head-element-options-request", {
      detail: {id},
      bubbles: true,
      composed: true,
    }))
  }

  private fieldActions(
    label: string,
    value: string,
    preset?: string,
    field?: DocumentHeadField,
    alwaysVisible = false,
  ) {
    if((!this.expanded && !alwaysVisible) || !value) return nothing
    const entry = preset ? this.entryForPreset(preset) : undefined
    return html`
      <span class="field-actions">
        ${entry ? html`<button
          class="field-action"
          type="button"
          aria-label=${`Edit extra ${label.toLocaleLowerCase()} attributes`}
          title="Extra attributes"
          ?data-active=${this.attributeEditorId === entry.id}
          @click=${() => this.requestAttributeEditor(entry)}
        >…</button>` : nothing}
        <button
          class="field-action"
          type="button"
          aria-label=${`Remove ${label.toLocaleLowerCase()}`}
          title=${`Remove ${label.toLocaleLowerCase()}`}
          @click=${() => entry
            ? this.dispatchAction({type: "removeDocumentHeadElement", id: entry.id})
            : field && this.setField(field, "")}
        >×</button>
      </span>
    `
  }

  private renderCommon() {
    const languages = orderedLanguageOptions()
    const languageOptions: ComboboxOption[] = [
      ...languages.promoted.map(option => ({
        value: option.value,
        label: option.label,
        description: option.value,
      })),
      ...languages.alphabetical.map((option, index) => ({
        value: option.value,
        label: option.label,
        description: option.value,
        dividerBefore: index === 0 && languages.promoted.length > 0,
      })),
    ]
    const licenseOptions: ComboboxOption[] = creativeCommonsLicenses.map(license => ({
      value: license.url,
      label: license.code,
      description: license.name,
    }))
    return html`
      <div class="common-grid" aria-label="Common document metadata">
        ${this.commonTextField("Title", "title", this.state.title, "title")}
        ${this.commonTextField("Author", "author", this.state.author, "author")}
        <label class="common-field">
          <span class="field-label">License</span>
          <span class="field-control">
            <document-head-combobox
              label="License"
              placeholder="Enter a license"
              .value=${this.state.license}
              .options=${licenseOptions}
              @combobox-change=${(event: Event) => this.handleComboboxChange("license", event)}
            ></document-head-combobox>
            ${this.fieldActions("License", this.state.license, "license", "license")}
          </span>
        </label>
        <label class="common-field">
          <span class="field-label">Language</span>
          <span class="field-control">
            <document-head-combobox
              label="Language"
              placeholder="Enter a language"
              .value=${this.state.language}
              .options=${languageOptions}
              @combobox-change=${(event: Event) => this.handleComboboxChange("language", event)}
            ></document-head-combobox>
            ${this.fieldActions("Language", this.state.language, undefined, "language")}
          </span>
        </label>
        <label class="common-field theme-field">
          <span class="field-label">Theme</span>
          <span class="field-control">
            <document-theme-picker
              .value=${this.state.theme}
              @theme-change=${this.handleThemeChange}
            ></document-theme-picker>
            ${this.fieldActions("Theme", this.state.theme, "theme", "theme")}
          </span>
        </label>
      </div>
    `
  }

  private commonTextField(label: string, field: DocumentHeadField, value: string, preset: string) {
    return html`
      <label class="common-field">
        <span class="field-label">${label}</span>
        <span class="field-control">
          <input
            class="common-control"
            name=${field}
            aria-label=${label}
            data-ribbon-input-persistent
            .value=${value}
            @change=${this.handleCommonChange}
          />
          ${this.fieldActions(label, value, preset, field)}
        </span>
      </label>
    `
  }

  private add(kind: DocumentHeadElementKind) {
    this.dispatchAction({type: "addDocumentHeadElement", kind})
  }

  private handleMoreAdd(event: Event) {
    const select = event.currentTarget as HTMLSelectElement
    if(select.value) this.add(select.value as DocumentHeadElementKind)
    select.value = ""
  }

  private updateAttribute(entry: DocumentHeadElementState, previousName: string, row: HTMLElement) {
    const [name, value] = Array.from(row.querySelectorAll<HTMLInputElement>("input"), input => input.value)
    if(!name.trim()) return
    this.dispatchAction({
      type: "setDocumentHeadElementAttribute",
      id: entry.id,
      name,
      value,
      previousName,
    })
  }

  private addAttribute(event: SubmitEvent, entry: DocumentHeadElementState) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    const name = String(data.get("name") ?? "").trim()
    const value = String(data.get("value") ?? "")
    if(!name) return
    this.dispatchAction({type: "setDocumentHeadElementAttribute", id: entry.id, name, value})
    form.reset()
  }

  private renderAttributes(
    entry: DocumentHeadElementState,
    attributes = entry.attributes,
  ) {
    return html`
      <div class="attributes" aria-label=${`${entry.label} attributes`}>
        ${attributes.map(attribute => html`
          <div class="attribute-row">
            <input
              class="advanced-input"
              aria-label="Attribute name"
              data-ribbon-input-persistent
              .value=${attribute.name}
              @change=${(event: Event) => this.updateAttribute(entry, attribute.name, (event.currentTarget as HTMLElement).parentElement!)}
            />
            <input
              class="advanced-input"
              aria-label=${`${attribute.name} value`}
              data-ribbon-input-persistent
              .value=${attribute.value}
              @change=${(event: Event) => this.updateAttribute(entry, attribute.name, (event.currentTarget as HTMLElement).parentElement!)}
            />
            <button
              class="attribute-remove"
              type="button"
              aria-label=${`Remove ${attribute.name} attribute`}
              title="Remove attribute"
              @click=${() => this.dispatchAction({type: "removeDocumentHeadElementAttribute", id: entry.id, name: attribute.name})}
            >×</button>
          </div>
        `)}
        <form class="attribute-add" @submit=${(event: SubmitEvent) => this.addAttribute(event, entry)}>
          <input class="advanced-input" name="name" aria-label="New attribute name" placeholder="Attribute" data-ribbon-input-persistent />
          <input class="advanced-input" name="value" aria-label="New attribute value" placeholder="Value" data-ribbon-input-persistent />
          <button type="submit" aria-label=${`Add attribute to ${entry.label}`} title="Add attribute">＋</button>
        </form>
      </div>
    `
  }

  private renderEntry(entry: DocumentHeadElementState) {
    return html`
      <article class="entry" data-head-id=${entry.id}>
        <header class="entry-header">
          <strong class="entry-title">${entry.label}<code class="tag">&lt;${entry.tagName}&gt;</code></strong>
          <button
            class="entry-action"
            type="button"
            aria-label=${`Move ${entry.label} up`}
            title="Move up"
            ?disabled=${!entry.canMoveUp}
            @click=${() => this.dispatchAction({type: "moveDocumentHeadElement", id: entry.id, direction: "up"})}
          >↑</button>
          <button
            class="entry-action"
            type="button"
            aria-label=${`Move ${entry.label} down`}
            title="Move down"
            ?disabled=${!entry.canMoveDown}
            @click=${() => this.dispatchAction({type: "moveDocumentHeadElement", id: entry.id, direction: "down"})}
          >↓</button>
          <button
            class="entry-action"
            type="button"
            aria-label=${`Remove ${entry.label}`}
            title="Remove"
            @click=${() => this.dispatchAction({type: "removeDocumentHeadElement", id: entry.id})}
          >×</button>
        </header>
        ${this.renderAttributes(entry)}
        ${entry.content === undefined ? nothing : html`
          <label class="content-field">
            <span class="field-label">${entry.contentLabel ?? "Content"}</span>
            <textarea
              class="content"
              aria-label=${`${entry.label} content`}
              data-ribbon-input-persistent
              spellcheck="false"
              .value=${entry.content}
              @change=${(event: Event) => this.dispatchAction({
                type: "setDocumentHeadElementContent",
                id: entry.id,
                value: (event.currentTarget as HTMLTextAreaElement).value,
              })}
            ></textarea>
          </label>
        `}
      </article>
    `
  }

  private renderCommonAttributeEditor(entry: DocumentHeadElementState) {
    const primary = primaryAttributesByPreset[entry.preset ?? ""] ?? new Set<string>()
    const extraAttributes = entry.attributes.filter(attribute => !primary.has(attribute.name.toLowerCase()))
    return html`
      <article class="entry common-attributes" data-head-id=${entry.id}>
        <header class="entry-header">
          <strong class="entry-title">${entry.label} attributes<code class="tag">&lt;${entry.tagName}&gt;</code></strong>
          <button
            class="entry-action"
            type="button"
            aria-label=${`Close ${entry.label} attributes`}
            title="Close attributes"
            @click=${() => this.dispatchEvent(new CustomEvent<{id: string}>("document-head-element-options-request", {
              detail: {id: ""},
              bubbles: true,
              composed: true,
            }))}
          >×</button>
        </header>
        ${this.renderAttributes(entry, extraAttributes)}
      </article>
    `
  }

  private renderAdvanced() {
    const presets = new Set(this.state.elements.map(element => element.preset))
    const representedIds = new Set(Array.from(commonElementPresets).flatMap(preset => {
      const element = this.entryForPreset(preset)
      return element ? [element.id] : []
    }))
    const entries = this.state.elements.filter(element => !representedIds.has(element.id))
    const attributeEntry = this.state.elements.find(element =>
      element.id === this.attributeEditorId && representedIds.has(element.id),
    )
    return html`
      <section class="advanced" aria-label="Advanced document head editor">
        <div class="advanced-metadata" aria-label="Advanced metadata options">
          ${this.advancedTextField("Description", "description", this.state.description, "description")}
          ${this.advancedTextField("Keywords", "keywords", this.state.keywords, "keywords")}
          <span class="common-field generator-entry">
            <span class="field-label">Generator</span>
            <span class="generator-control" role="textbox" aria-label="Generator" aria-readonly="true">
              <code>${this.state.generator || WEBWRITER_GENERATOR}</code>
            </span>
          </span>
        </div>
        <div class="add-toolbar" aria-label="Add head element">
          <button type="button" @click=${() => this.add("script")}>＋ Script</button>
          <button type="button" @click=${() => this.add("stylesheet")}>＋ Stylesheet</button>
          <button type="button" @click=${() => this.add("style")}>＋ Style</button>
          <button type="button" @click=${() => this.add("meta")}>＋ Meta</button>
          <span class="more-select">
            <select aria-label="Add another head element" data-ribbon-input-persistent @change=${this.handleMoreAdd}>
              <option value="">More…</option>
              <option value="link">Link (&lt;link&gt;)</option>
              <option value="base" ?disabled=${presets.has("base")}>Base URL (&lt;base&gt;)</option>
              <option value="pragma">Pragma (&lt;meta http-equiv&gt;)</option>
              <option value="charset" ?disabled=${presets.has("charset")}>Encoding (&lt;meta charset&gt;)</option>
              <option value="noscript">NoScript (&lt;noscript&gt;)</option>
              <option value="title" ?disabled=${presets.has("title")}>Title (&lt;title&gt;)</option>
              <option value="template">Template (&lt;template&gt;)</option>
            </select>
            <span class="more-chevron" aria-hidden="true"></span>
          </span>
        </div>
        <div class="entries">
          ${attributeEntry ? this.renderCommonAttributeEditor(attributeEntry) : nothing}
          ${entries.length
            ? entries.map(entry => this.renderEntry(entry))
            : attributeEntry ? nothing : html`<div class="empty">No additional head elements.</div>`}
        </div>
      </section>
    `
  }

  private advancedTextField(label: string, field: "description" | "keywords", value: string, preset: string) {
    return html`
      <label class="common-field">
        <span class="field-label">${label}</span>
        <span class="field-control">
          <input
            class="common-control"
            name=${field}
            aria-label=${label}
            data-ribbon-input-persistent
            .value=${value}
            @change=${this.handleCommonChange}
          />
          ${this.fieldActions(label, value, preset, field, true)}
        </span>
      </label>
    `
  }

  render() {
    return this.mode === "advanced" ? this.renderAdvanced() : this.renderCommon()
  }
}

if(!customElements.get("document-head-combobox")) {
  customElements.define("document-head-combobox", DocumentHeadCombobox)
}

if(!customElements.get("document-head-editor")) {
  customElements.define("document-head-editor", DocumentHeadEditor)
}

if(!customElements.get("document-theme-picker")) {
  customElements.define("document-theme-picker", DocumentThemePicker)
}

declare global {
  interface HTMLElementTagNameMap {
    "document-head-combobox": DocumentHeadCombobox
    "document-head-editor": DocumentHeadEditor
    "document-theme-picker": DocumentThemePicker
  }
}
