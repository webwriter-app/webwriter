import {captionNumberStyles, defaultCaptionEnumeration, isCaptionEnumeration, type CaptionSeries} from "../caption-enumeration"
import {LitElement, css, html, nothing} from "lit"
import {popupAnchorCSS} from "./popup-position"
import {createAnchorPositioner} from "../anchor-positioning.js"
import {
  WEBWRITER_GENERATOR,
  emptyDocumentHeadState,
  type DocumentHeadAction,
  type DocumentHeadField,
  type DocumentHeadState,
} from "../document-head"
import {EditorCombobox} from "./editor-combobox"
import {documentLicenseOptions} from "./license-options"
import {editorInteractionStyles} from "./editing-controls.styles"
import {documentLanguageName, orderedLanguageOptions} from "../language-suggestions"
import {documentThemes} from "../document-themes"

let themePickerInstanceCount = 0

/** Metadata presentation of the shared editor combobox. */
export class DocumentHeadCombobox extends EditorCombobox {
  static styles = [EditorCombobox.styles, css`
    :host([label="Language"]) { --metadata-listbox-width: 13rem; }

    :host([label="License"]) .listbox {
      max-height: min(26rem, calc(100% - .8rem));
      position-try-order: most-height;
    }

    :host([label="License"]) .listbox:has(.option:nth-of-type(5)) {
      min-height: min(9rem, 40dvh);
    }

    :host([label="License"]) .listbox,
    :host([label="Language"]) .listbox {
      width: max(anchor-size(width), var(--metadata-listbox-width, 22rem));
      position-area: bottom span-left;
      justify-self: end;
    }
  `]
}


class DocumentThemePicker extends LitElement {
  static properties = {
    value: {type: String},
    open: {type: Boolean, reflect: true, state: true},
  }

  static styles = css`
    ${editorInteractionStyles}
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
  private anchorPositioner = createAnchorPositioner(document)
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
    this.anchorPositioner.destroy()
    document.removeEventListener("pointerdown", this.documentPointerDown)
    document.removeEventListener("keydown", this.documentKeydown)
    super.disconnectedCallback()
  }

  close() {
    this.open = false
    const listbox = this.renderRoot?.querySelector<HTMLElement>(".listbox")
    if(listbox) this.anchorPositioner.release(listbox)
  }

  private async setOpen(open: boolean) {
    this.open = open
    if(!open) { this.close(); return }
    await this.updateComplete
    const trigger = this.renderRoot.querySelector<HTMLElement>(".control")
    const listbox = this.renderRoot.querySelector<HTMLElement>(".listbox")
    if(trigger && listbox) {
      this.anchorPositioner.bind(listbox, trigger, popupAnchorCSS())
      this.anchorPositioner.refresh()
    }
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

/** Common metadata fields and detailed document options. */

export class DocumentHeadEditor extends LitElement {
  static properties = {
    mode: {type: String, reflect: true},
    state: {attribute: false},
    expanded: {type: Boolean, reflect: true},
    compact: {type: Boolean, reflect: true},
    captionKind: {state: true},
  }

  static styles = css`
    ${editorInteractionStyles}
    .caption-enumeration { margin-top: 0.35rem; }
    .caption-enumeration h3 { margin: 0 0 0.35rem; font-size: 0.68rem; }
    .caption-tabs { display: flex; border-bottom: 1px solid #c8d2df; }
    .caption-tab { padding: 0.35rem 0.7rem; border: 0; border-bottom: 2px solid transparent; color: #526b86; background: transparent; cursor: pointer; }
    .caption-tab[aria-selected="true"] { border-bottom-color: #3977c7; color: #174f87; font-weight: 650; }
    .caption-tab:focus-visible { outline: 2px solid #3977c7; outline-offset: -2px; }
    .caption-panel { display: grid; gap: 0.4rem; padding: 0.5rem 0; }
    .caption-panel > label:first-child { display: flex; align-items: center; gap: 0.3rem; }
    .caption-panel .common-control { height: 1.7rem; }

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
      grid-template-columns: repeat(2, minmax(0, 1fr));
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

    .field-action:hover {
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

    :host([compact]) {height: auto; font: .68rem/1.2 system-ui, sans-serif;}
    :host([compact]) .common-grid {grid-template-columns: minmax(0, 1fr); grid-template-rows: none; gap: .4rem; height: auto; padding: 0;}
    :host([compact]) .common-field {display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); align-items: center; gap: .35rem;}
    :host([compact]) .field-label {font: inherit; color: inherit; white-space: normal;}
    :host([compact]) .common-control,
    :host([compact]) .generator-control {height: 1.7rem; padding: .2rem; font-size: .68rem; border-color: #c5ccd5;}
    :host([compact]) .common-control:hover {border-color: #8eb6df; background: #eef4fb;}
    :host([compact]) document-head-combobox {height: 1.7rem; --metadata-combobox-height: 1.7rem; --metadata-combobox-font-size: .68rem;}
    :host([compact]) .advanced {height: auto; padding: 0; border: 0;}
    :host([compact]) .advanced-metadata {grid-template-columns: minmax(0, 1fr);}
    .description-field {grid-column: 1 / -1;}
    :host([compact]) .description-field {display: flex; align-items: stretch; gap: .2rem;}
    .description-label {display: flex; align-items: center; justify-content: space-between;}
    .language-label {display: flex; align-items: center; justify-content: space-between;}
    .language-label .field-actions {margin-left: auto;}
    .description-field .common-control,
    :host([compact]) .description-field .common-control {height: auto; min-height: calc(3lh + .4rem + 2px); padding: .2rem; line-height: 1.2; resize: vertical;}
  `

  mode: "common" | "advanced" = "common"
  compact = false
  state: DocumentHeadState = emptyDocumentHeadState()
  expanded = false
  private captionKind: "figure" | "table" = "figure"

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
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    this.setField(input.name as DocumentHeadField, input.value)
  }

  private handleComboboxChange(field: "license" | "language", event: Event) {
    const value = (event as CustomEvent<{value: string}>).detail.value
    this.setField(field, value)
  }

  private removeFieldButton(label: string, field: DocumentHeadField, value: string, alwaysVisible = false) {
    if((!this.expanded && !alwaysVisible) || !value) return nothing
    const entry = field === "language" ? undefined : this.state.elements.find(element => element.preset === field)
    return html`
      <span class="field-actions">
        <button
          class="field-action"
          type="button"
          aria-label=${`Remove ${label.toLocaleLowerCase()}`}
          title=${`Remove ${label.toLocaleLowerCase()}`}
          @click=${() => entry
            ? this.dispatchAction({type: "removeDocumentHeadElement", id: entry.id})
            : this.setField(field, "")}
        >×</button>
      </span>
    `
  }

  private renderCommon() {
    return html`
      <div class="common-grid" aria-label="Common document metadata">
        ${this.commonTextField("Title", "title", this.state.title)}
        ${this.commonTextField("Author", "author", this.state.author)}
        <label class="common-field">
          <span class="field-label">License</span>
          <span class="field-control">
            <document-head-combobox
              label="License"
              placeholder="Enter a license"
              .value=${this.state.license}
              .options=${documentLicenseOptions.options}
              .searchOptions=${documentLicenseOptions.searchOptions}
              @combobox-change=${(event: Event) => this.handleComboboxChange("license", event)}
            ></document-head-combobox>
            ${this.removeFieldButton("License", "license", this.state.license)}
          </span>
        </label>
        <label class="common-field">
          <span class="language-label"><span class="field-label">Language</span>
            ${this.removeFieldButton("Language", "language", this.state.language)}</span>
          <span class="field-control">
            <document-head-combobox
              language-picker
              label="Language"
              placeholder="Enter a language"
              .value=${this.state.language}
              .options=${orderedLanguageOptions()}
              .formatValue=${documentLanguageName}
              @combobox-change=${(event: Event) => this.handleComboboxChange("language", event)}
            ></document-head-combobox>
          </span>
        </label>
      </div>
    `
  }

  protected updated() {
    // Set select values after their option children have been rendered.
    const config = this.captionConfig()
    for(const select of this.renderRoot.querySelectorAll<HTMLSelectElement>("select[data-caption-kind]")) {
      const kind = select.getAttribute("data-caption-kind") as "figure" | "table"
      select.value = config[kind].style
    }
  }

  private captionConfig() {
    const config = this.state.captionEnumeration ?? defaultCaptionEnumeration()
    return this.state.captionEnumeration ? config : {
      figure: {...config.figure, enabled: false}, table: {...config.table, enabled: false},
    }
  }

  private setCaptionSetting(kind: "figure" | "table", setting: Partial<CaptionSeries>, input?: HTMLInputElement | HTMLTextAreaElement) {
    const config = this.captionConfig()
    const value = {...config, [kind]: {...config[kind], ...setting}}
    const valid = isCaptionEnumeration(value)
    input?.setCustomValidity(valid ? "" : "Use a positive starting number and a label of at most 200 characters.")
    if(!valid) { input?.reportValidity(); return }
    this.dispatchAction({type: "setCaptionEnumeration", value})
  }

  private handleCaptionTabKeydown(event: KeyboardEvent) {
    const kind = event.key === "ArrowRight" || event.key === "End" ? "table"
      : event.key === "ArrowLeft" || event.key === "Home" ? "figure" : undefined
    if(!kind) return
    event.preventDefault()
    this.captionKind = kind
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(`#caption-tab-${kind}`)?.focus())
  }

  private renderCaptionEnumeration() {
    const config = this.captionConfig()
    const kind = this.captionKind
    const series = config[kind]
    const label = kind === "figure" ? "Figures" : "Tables"
    return html`<section class="caption-enumeration" aria-label="Caption numbering">
      <h3>Caption numbering</h3>
      <div class="caption-tabs" role="tablist" aria-label="Caption type" @keydown=${this.handleCaptionTabKeydown}>
        ${(["figure", "table"] as const).map(tabKind => html`<button class="caption-tab" type="button"
          id=${`caption-tab-${tabKind}`} role="tab" aria-selected=${String(kind === tabKind)}
          aria-controls="caption-panel" tabindex=${kind === tabKind ? "0" : "-1"}
          @click=${() => this.captionKind = tabKind}>${tabKind === "figure" ? "Figures" : "Tables"}</button>`)}
      </div>
      <div class="caption-panel" id="caption-panel" role="tabpanel" aria-labelledby=${`caption-tab-${kind}`}>
        <label><input type="checkbox" aria-label=${`Number ${label.toLowerCase()}`}
            .checked=${series.enabled}
            @change=${(event: Event) => this.setCaptionSetting(kind, {enabled: (event.target as HTMLInputElement).checked})}
        /> Automatic numbering</label>
        <label class="common-field"><span class="field-label">Number format</span>
            <select class="common-control" data-ribbon-input-persistent data-caption-kind=${kind} aria-label=${`${label} number format`}
              @change=${(event: Event) => this.setCaptionSetting(kind, {style: (event.target as HTMLSelectElement).value as CaptionSeries["style"]})}>
              ${captionNumberStyles.map(style => html`<option value=${style}>${({decimal: "1, 2, 3", "lower-alpha": "a, b, c", "upper-alpha": "A, B, C", "lower-roman": "i, ii, iii", "upper-roman": "I, II, III"})[style]}</option>`)}
            </select>
        </label>
        <label class="common-field"><span class="field-label">Start at</span>
            <input class="common-control" data-ribbon-input-persistent type="number" min="1" max="1000000" step="1" aria-label=${`${label} start at`}
              .value=${String(series.start)} @change=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.setCaptionSetting(kind, {start: input.valueAsNumber}, input)
              }} />
        </label>
        <label class="common-field"><span class="field-label">Separator</span>
            <input class="common-control" data-ribbon-input-persistent aria-label=${`${label} separator`} .value=${series.separator}
              @change=${(event: Event) => this.setCaptionSetting(kind, {separator: (event.target as HTMLInputElement).value}, event.target as HTMLInputElement)} />
        </label>
        <label class="common-field"><span class="field-label">Label</span>
            <input class="common-control" data-ribbon-input-persistent maxlength="200" aria-label=${`${label} label`}
              .value=${series.labels.default}
              @change=${(event: Event) => {
                const input = event.target as HTMLInputElement
                this.setCaptionSetting(kind, {labels: {default: input.value}}, input)
              }} />
        </label>
      </div>
    </section>`
  }

  private commonTextField(label: string, field: DocumentHeadField, value: string) {
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
          ${this.removeFieldButton(label, field, value)}
        </span>
      </label>
    `
  }

  private renderAdvanced() {
    return html`
      <section class="advanced" aria-label="Document options">
        <div class="advanced-metadata" aria-label="Advanced metadata options">
          ${this.advancedTextField("Description", "description", this.state.description)}
          ${this.advancedTextField("Keywords", "keywords", this.state.keywords)}
          ${this.compact ? nothing : html`<span class="common-field generator-entry">
            <span class="field-label">Generator</span>
            <span class="generator-control" role="textbox" aria-label="Generator" aria-readonly="true">
              <code>${this.state.generator || WEBWRITER_GENERATOR}</code>
            </span>
          </span>`}
        </div>
        ${this.renderCaptionEnumeration()}
      </section>
    `
  }

  private advancedTextField(label: string, field: "description" | "keywords", value: string) {
    if(field === "description") return html`<label class="common-field description-field">
      <span class="description-label"><span class="field-label">${label}</span>
        ${this.removeFieldButton(label, field, value, true)}</span>
      <textarea class="common-control" name=${field} aria-label=${label} rows="3" data-ribbon-input-persistent
        .value=${value} @change=${this.handleCommonChange}></textarea>
    </label>`
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
          ${this.removeFieldButton(label, field, value, true)}
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
