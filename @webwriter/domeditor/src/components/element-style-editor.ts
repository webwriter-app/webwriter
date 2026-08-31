import {LitElement, css, html, nothing} from "lit"
import type {ElementStyleDeclaration, ElementStyleMutation, ElementStyleState} from "../editor-bridge"
import {
  cssWideKeywords,
  elementStylePropertyNameSet,
  type ElementStylePropertyDefinition,
} from "../element-styles"

export type ElementStyleChangeDetail = {
  property: string
  mutation: ElementStyleMutation
}

const emptyStyleState = (): ElementStyleState => ({
  target: null,
  inline: {},
  computed: {},
  context: {display: "", parentDisplay: ""},
})

const simpleDimension = (value: string, units: readonly string[]) => {
  const match = value.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i)
  if(!match || !units.includes(match[2])) return null
  return {number: match[1], unit: match[2]}
}

const colorHex = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if(/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if(/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map(character => character.repeat(2)).join("")}`
  }
  const rgb = normalized.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
  if(!rgb) return "#000000"
  return `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, "0")).join("")}`
}

const sectionGroups = (definitions: readonly ElementStylePropertyDefinition[]) => {
  const groups = new Map<string, ElementStylePropertyDefinition[]>()
  definitions.forEach(definition => groups.set(
    definition.section,
    [...(groups.get(definition.section) ?? []), definition],
  ))
  return Array.from(groups)
}

/** A serializable inline-style projection rendered as native, CSS-aware inputs. */
export class ElementStyleEditor extends LitElement {
  static properties = {
    definitions: {attribute: false},
    state: {attribute: false},
    mode: {type: String, reflect: true},
    orientation: {type: String, reflect: true},
    allowCustom: {type: Boolean, attribute: "allow-custom"},
    customProperty: {type: String, state: true},
    customValue: {type: String, state: true},
    customImportant: {type: Boolean, state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      min-width: 0;
      color: #2f3742;
      font: 0.68rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    :host([mode="basic"]) {
      height: 100%;
    }

    :host([mode="advanced"]) {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    :host([orientation="vertical"]) {
      font-size: 0.7rem;
    }

    :host([orientation="vertical"][mode="basic"]),
    :host([orientation="vertical"][mode="advanced"]) {
      height: auto;
    }

    :host([orientation="vertical"][mode="advanced"]) {
      display: block;
    }

    button,
    input,
    select {
      box-sizing: border-box;
      color: inherit;
      font: inherit;
    }

    .basic-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      height: 100%;
      gap: 0.25rem 0.3rem;
      padding: 0.1rem 0;
    }

    :host([orientation="vertical"]) .basic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(2.6rem, auto));
      height: auto;
      gap: 0.45rem 0.65rem;
      padding: 0.15rem 0 0.25rem;
    }

    .advanced {
      box-sizing: border-box;
      height: 100%;
      padding: 0 0.65rem 0.45rem 0.15rem;
      overflow-x: hidden;
      overflow-y: scroll;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    :host([orientation="vertical"]) .advanced {
      height: auto;
      padding: 0 0 0.2rem;
      overflow: visible;
    }

    .advanced-divider {
      position: relative;
      flex: 0 0 auto;
      margin: 1rem 0.65rem 0.15rem 0.15rem;
      color: inherit;
      font-size: 0.64rem;
      font-weight: 650;
      text-align: center;
    }

    :host([orientation="vertical"]) .advanced-divider {
      display: none;
    }

    .advanced-divider::before {
      position: absolute;
      top: 50%;
      right: 0;
      left: 0;
      height: 2px;
      background: #9cabbc;
      content: "";
      transform: translateY(-50%);
    }

    .advanced-divider span {
      position: relative;
      padding: 0 0.45rem;
      background: #f2f2f2;
    }

    .editor-fields {
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
    }

    :host([mode="advanced"]) .editor-fields {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .style-section {
      padding: 0.45rem 0;
    }

    .style-section + .style-section {
      border-top: 1px solid #d8dee6;
    }

    .section-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.25rem 0.4rem;
      padding: 0 0.35rem;
    }

    :host([orientation="vertical"]) .section-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.45rem 0.65rem;
      padding: 0;
    }

    .property {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(1.35rem, auto);
      min-width: 0;
      gap: 0.02rem 0.18rem;
    }

    :host([mode="basic"]) .property {
      grid-template-rows: 0.88rem minmax(1.25rem, auto);
    }

    :host([orientation="vertical"]) .property {
      grid-template-rows: 1rem minmax(1.65rem, auto);
      gap: 0.08rem 0.2rem;
    }

    :host([mode="basic"]) .property-action {
      display: none;
    }

    .property-label {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      min-width: 0;
      height: 0.88rem;
      padding: 0 0.12rem;
      border: 0;
      border-radius: 0.2rem;
      background: transparent;
      cursor: pointer;
      text-align: left;
    }

    .property-label:hover,
    .property-label:focus-visible {
      color: #1e4f87;
      background: #e8eef5;
      outline: none;
    }

    .label-text {
      min-width: 0;
      overflow: hidden;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .property-label[data-keyword="inherit"] .label-text {
      text-decoration: 2px overline var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="initial"] .label-text {
      text-decoration: 2px line-through var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="unset"] .label-text {
      text-decoration: 2px overline line-through var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="revert"] .label-text {
      text-decoration: 2px underline double var(--sl-color-amber-600, #d97706);
    }

    input,
    select,
    .compound {
      grid-column: 1;
      width: 100%;
      min-width: 0;
      height: 1.45rem;
    }

    :host([orientation="vertical"]) input,
    :host([orientation="vertical"]) select,
    :host([orientation="vertical"]) .compound,
    :host([orientation="vertical"]) .color-trigger,
    :host([orientation="vertical"]) .toggle-control,
    :host([orientation="vertical"]) .property-action {
      height: 1.65rem;
    }

    input,
    select {
      padding: 0.16rem 0.3rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: transparent;
      outline: none;
    }

    input:hover,
    select:hover,
    .color-trigger:hover {
      border-color: #9cabbc;
    }

    input:focus,
    select:focus,
    .color-trigger:focus-visible {
      border-color: #3977c7;
      box-shadow: 0 0 0 1px #3977c7;
    }

    input::placeholder {
      color: #8794a3;
      opacity: 1;
    }

    input[type="number"] {
      appearance: textfield;
    }

    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    select[data-computed],
    .toggle-control[data-computed] {
      color: #8794a3;
    }

    select option {
      color: #2f3742;
    }

    select option[value=""] {
      color: #8794a3;
    }

    .compound {
      display: flex;
      flex-flow: row nowrap;
      width: 100%;
    }

    .compound select,
    .color-popover input {
      field-sizing: content;
      width: auto;
      white-space: nowrap;
    }

    .compound input {
      flex: 1 1 0;
      width: 100%;
      min-width: 0;
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .compound select {
      appearance: none;
      flex: 0 0 auto;
      min-width: 1.8rem;
      padding-inline: 0.15rem;
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
      text-align: center;
    }

    .color-control {
      grid-column: 1;
      width: 1.55rem;
    }

    .color-trigger {
      display: block;
      width: 1.55rem;
      height: 1.45rem;
      padding: 0.12rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: transparent;
      cursor: pointer;
      outline: none;
    }

    .color-swatch {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 0.12rem;
      background: var(--style-color);
    }

    .color-popover {
      position: fixed;
      position-try-fallbacks: flip-block, flip-inline;
      inset: auto;
      top: anchor(bottom);
      left: anchor(left);
      box-sizing: border-box;
      width: min(14rem, calc(100vw - 1rem));
      margin: 0.2rem 0 0;
      padding: 0.35rem;
      border: 1px solid #a8a8a8;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #fff;
      box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 16%);
    }

    .color-popover-row {
      display: flex;
      flex-flow: row nowrap;
      width: 100%;
      min-width: 0;
    }

    .color-popover input[type="color"] {
      flex: 0 0 1.55rem;
      width: 1.55rem;
      padding: 0.12rem;
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .color-popover input[type="text"] {
      flex: 1 1 auto;
      min-width: 0;
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
    }

    .range-control {
      display: flex;
      grid-column: 1;
      align-items: center;
      width: 100%;
      min-width: 0;
    }

    .range-control input[type="range"] {
      width: 100%;
      min-width: 0;
      height: 1.2rem;
      padding: 0;
      border: 0;
      box-shadow: none;
      background: transparent;
    }

    .range-control input[type="range"][data-computed],
    .toggle-control[data-computed] input {
      accent-color: #8794a3;
    }

    .toggle-control {
      display: flex;
      grid-column: 1;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      height: 1.45rem;
      padding: 0 0.32rem;
      border: 0;
      background: transparent;
    }

    .toggle-control input {
      width: auto;
      height: auto;
      margin: 0;
      padding: 0;
      box-shadow: none;
    }

    .property-action {
      display: grid;
      place-items: center;
      width: 1.45rem;
      height: 1.45rem;
      padding: 0;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      color: #526b86;
      background: #f9fafb;
      cursor: pointer;
    }

    .property-action:hover {
      border-color: #8ca7c5;
      color: #1e4f87;
      background: #e8eef5;
    }

    .property-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .custom-form {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto auto;
      gap: 0.25rem;
      align-items: end;
      padding: 0 0.35rem 0.4rem;
    }

    :host([orientation="vertical"]) .custom-form {
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 0 0 0.5rem;
    }

    :host([orientation="vertical"]) .custom-form label {
      grid-column: 1 / -1;
    }

    :host([orientation="vertical"]) .custom-form .important {
      grid-column: 1;
      justify-self: start;
    }

    .custom-form label {
      display: grid;
      min-width: 0;
      gap: 0.02rem;
      color: #526b86;
      font-size: 0.6rem;
      font-weight: 600;
    }

    .custom-form button {
      height: 1.45rem;
      padding: 0 0.45rem;
      border: 1px solid #8ca7c5;
      border-radius: 0.28rem;
      color: #1e4f87;
      background: #e8eef5;
      cursor: pointer;
    }

    .custom-form .important {
      width: 1.45rem;
      padding: 0;
    }

    .custom-declarations {
      display: grid;
      gap: 0.25rem;
      padding: 0 0.35rem 0.4rem;
    }

    :host([orientation="vertical"]) .custom-declarations {
      padding: 0 0 0.5rem;
    }

    .custom-declaration {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto;
      align-items: center;
      gap: 0.25rem;
    }

    :host([orientation="vertical"]) .custom-declaration {
      grid-template-columns: minmax(3.5rem, 0.75fr) minmax(0, 1.25fr) auto;
    }

    .custom-declaration code {
      min-width: 0;
      overflow: hidden;
      color: #526b86;
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        scroll-behavior: auto !important;
      }
    }
  `

  definitions: readonly ElementStylePropertyDefinition[] = []
  state: ElementStyleState = emptyStyleState()
  mode: "basic" | "advanced" = "basic"
  orientation: "horizontal" | "vertical" = "horizontal"
  allowCustom = false
  private customProperty = ""
  private customValue = ""
  private customImportant = false

  private declaration(name: string) {
    return this.state.inline[name]
  }

  private editableValue(name: string) {
    const value = this.declaration(name)?.value ?? ""
    return cssWideKeywords.includes(value as typeof cssWideKeywords[number]) ? "" : value
  }

  private dispatchChange(property: string, mutation: ElementStyleMutation) {
    this.dispatchEvent(new CustomEvent<ElementStyleChangeDetail>("element-style-change", {
      detail: {property, mutation},
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchTargetHover(hovered: boolean) {
    this.dispatchEvent(new CustomEvent("element-style-target-hover", {
      detail: {hovered},
      bubbles: true,
      composed: true,
    }))
  }

  private commitValue(name: string, value: string, declaration = this.declaration(name)) {
    this.dispatchChange(name, value === "" ? null : {
      value,
      priority: declaration?.priority ?? "",
    })
  }

  private cycleKeyword(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    const index = cssWideKeywords.indexOf(declaration?.value as typeof cssWideKeywords[number])
    const keyword = index < 0 ? cssWideKeywords[0] : cssWideKeywords[index + 1]
    if(keyword) this.commitValue(definition.name, keyword, declaration)
    else this.dispatchChange(definition.name, null)
  }

  private renderLabel(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    const keyword = cssWideKeywords.includes(declaration?.value as typeof cssWideKeywords[number])
      ? declaration!.value
      : null
    return html`
      <button
        id=${`style-label-${definition.name}`}
        class="property-label"
        type="button"
        data-keyword=${keyword ?? nothing}
        title=${`Cycle global value for ${definition.label}`}
        aria-label=${`Cycle global value for ${definition.label}. Current value: ${keyword ?? "no global value"}`}
        @click=${() => this.cycleKeyword(definition)}
      >
        <span class="label-text">${definition.label}</span>
      </button>
    `
  }

  private renderSelect(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const options = definition.values ?? []
    const hasUnlistedValue = Boolean(current && !options.includes(current))
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    return html`
      <select
        aria-labelledby=${`style-label-${definition.name}`}
        data-computed=${!current && computed ? "" : nothing}
        .value=${current}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLSelectElement).value,
          declaration,
        )}
      >
        <option value="">${computed || "Not set"}</option>
        ${hasUnlistedValue ? html`<option value=${current}>${current}</option>` : nothing}
        ${options.map(option => html`<option value=${option}>${option}</option>`)}
      </select>
    `
  }

  private renderLength(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const units = definition.units ?? []
    const authored = this.editableValue(definition.name)
    const parsed = simpleDimension(authored, units)
    const computedValue = this.state.computed[definition.name]?.trim() ?? ""
    const computed = simpleDimension(computedValue, units)
    if(authored && !parsed) {
      return html`<input
        type="text"
        aria-labelledby=${`style-label-${definition.name}`}
        .value=${authored}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLInputElement).value.trim(),
          declaration,
        )}
      />`
    }
    if(!authored && computedValue && !computed) {
      return html`<input
        type="text"
        aria-labelledby=${`style-label-${definition.name}`}
        placeholder=${computedValue}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLInputElement).value.trim(),
          declaration,
        )}
      />`
    }
    const unit = parsed?.unit ?? computed?.unit ?? units[0] ?? ""
    return html`
      <span class="compound">
        <input
          type="number"
          aria-labelledby=${`style-label-${definition.name}`}
          .value=${parsed?.number ?? ""}
          placeholder=${computed?.number ?? ""}
          step="any"
          @change=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement
            const selectedUnit = input.nextElementSibling as HTMLSelectElement | null
            this.commitValue(definition.name, input.value ? `${input.value}${selectedUnit?.value ?? unit}` : "", declaration)
          }}
        />
        <select
          aria-label=${`${definition.label} unit`}
          data-computed=${!parsed && computed ? "" : nothing}
          .value=${unit}
          @change=${(event: Event) => {
            const select = event.currentTarget as HTMLSelectElement
            const input = select.previousElementSibling as HTMLInputElement | null
            const numeric = input?.value || input?.placeholder || ""
            if(numeric) this.commitValue(definition.name, `${numeric}${select.value}`, declaration)
          }}
        >${units.map(option => html`<option value=${option}>${option}</option>`)}</select>
      </span>
    `
  }

  private renderColor(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    const popupId = `style-color-${definition.name}`
    const anchorName = `--${popupId}`
    return html`
      <span class="color-control">
        <button
          class="color-trigger"
          type="button"
          aria-label=${`Edit ${definition.label}`}
          aria-haspopup="dialog"
          popovertarget=${popupId}
          style=${`anchor-name: ${anchorName}; --style-color: ${colorHex(current || computed)}`}
        ><span class="color-swatch" aria-hidden="true"></span></button>
        <div
          id=${popupId}
          class="color-popover"
          popover="auto"
          role="dialog"
          aria-labelledby=${`style-label-${definition.name}`}
          style=${`position-anchor: ${anchorName}`}
        >
          <span class="color-popover-row">
            <input
              type="color"
              aria-label=${`${definition.label} picker`}
              .value=${colorHex(current || computed)}
              @change=${(event: Event) => this.commitValue(
                definition.name,
                (event.currentTarget as HTMLInputElement).value,
                declaration,
              )}
            />
            <input
              type="text"
              aria-label=${`${definition.label} CSS value`}
              .value=${current}
              placeholder=${computed}
              @change=${(event: Event) => this.commitValue(
                definition.name,
                (event.currentTarget as HTMLInputElement).value.trim(),
                declaration,
              )}
            />
          </span>
        </div>
      </span>
    `
  }

  private renderRange(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    const effective = current || computed || String(definition.min ?? 0)
    const commit = (event: Event) => this.commitValue(
      definition.name,
      (event.currentTarget as HTMLInputElement).value,
      declaration,
    )
    return html`
      <span class="range-control">
        <input
          type="range"
          aria-labelledby=${`style-label-${definition.name}`}
          min=${definition.min ?? 0}
          max=${definition.max ?? 100}
          step=${definition.step ?? 1}
          data-computed=${!current && computed ? "" : nothing}
          .value=${effective}
          @change=${commit}
        />
      </span>
    `
  }

  private renderToggle(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const [off = "none", on = "auto"] = definition.values ?? []
    const computed = this.state.computed[definition.name]?.trim()
    const current = this.editableValue(definition.name)
    const checked = (current || computed) === on
    return html`
      <label class="toggle-control" data-computed=${!current && computed ? "" : nothing}>
        <input
          type="checkbox"
          aria-labelledby=${`style-label-${definition.name}`}
          .checked=${checked}
          @change=${(event: Event) => this.commitValue(
            definition.name,
            (event.currentTarget as HTMLInputElement).checked ? on : off,
            declaration,
          )}
        />
        <span>${checked ? on : off}</span>
      </label>
    `
  }

  private renderInput(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    if(definition.control === "select") return this.renderSelect(definition, declaration)
    if(definition.control === "length") return this.renderLength(definition, declaration)
    if(definition.control === "color") return this.renderColor(definition, declaration)
    if(definition.control === "range") return this.renderRange(definition, declaration)
    if(definition.control === "toggle") return this.renderToggle(definition, declaration)
    const current = this.editableValue(definition.name)
    return html`<input
      type=${definition.control === "number" ? "number" : "text"}
      aria-labelledby=${`style-label-${definition.name}`}
      .value=${current}
      placeholder=${this.state.computed[definition.name]?.trim() ?? ""}
      min=${definition.min ?? nothing}
      max=${definition.max ?? nothing}
      step=${definition.step ?? (definition.control === "number" ? "any" : nothing)}
      @change=${(event: Event) => this.commitValue(
        definition.name,
        (event.currentTarget as HTMLInputElement).value.trim(),
        declaration,
      )}
    />`
  }

  private renderProperty(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    return html`
      <div class="property" data-property=${definition.name}>
        ${this.renderLabel(definition)}
        ${this.renderInput(definition, declaration)}
        ${declaration ? html`
          <button
            class="property-action"
            type="button"
            title=${`Clear ${definition.label}`}
            aria-label=${`Clear ${definition.label}`}
            @click=${() => this.dispatchChange(definition.name, null)}
          >×</button>
        ` : nothing}
      </div>
    `
  }

  private submitCustom(event: SubmitEvent) {
    event.preventDefault()
    const property = this.customProperty.trim()
    const value = this.customValue.trim()
    if(!property || property.includes(";") || !value) return
    this.dispatchChange(property, {value, priority: this.customImportant ? "important" : ""})
    this.customProperty = ""
    this.customValue = ""
    this.customImportant = false
  }

  private renderCustomProperties() {
    const declarations = Object.entries(this.state.inline)
      .filter(([name]) => !elementStylePropertyNameSet.has(name))
    return html`
      <div class="style-section custom-properties">
        <form class="custom-form" @submit=${this.submitCustom}>
          <label>Property
            <input
              name="property"
              autocomplete="off"
              placeholder="--name or property"
              .value=${this.customProperty}
              @input=${(event: Event) => this.customProperty = (event.currentTarget as HTMLInputElement).value}
            />
          </label>
          <label>Value
            <input
              name="value"
              autocomplete="off"
              placeholder="CSS value"
              .value=${this.customValue}
              @input=${(event: Event) => this.customValue = (event.currentTarget as HTMLInputElement).value}
            />
          </label>
          <button
            class="important"
            type="button"
            title="Toggle !important"
            aria-label="Toggle !important"
            aria-pressed=${this.customImportant}
            @click=${() => this.customImportant = !this.customImportant}
          >!</button>
          <button type="submit">Add</button>
        </form>
        ${declarations.length ? html`
          <div class="custom-declarations">
            ${declarations.map(([name, declaration]) => html`
              <div class="custom-declaration">
                <code title=${name}>${name}</code>
                <input
                  aria-label=${`${name} value`}
                  .value=${declaration.value}
                  @change=${(event: Event) => this.commitValue(
                    name,
                    (event.currentTarget as HTMLInputElement).value.trim(),
                    declaration,
                  )}
                />
                <button
                  class="property-action"
                  type="button"
                  aria-label=${`Clear ${name}`}
                  @click=${() => this.dispatchChange(name, null)}
                >×</button>
              </div>
            `)}
          </div>
        ` : nothing}
      </div>
    `
  }

  render() {
    if(this.mode === "basic") {
      return html`
        <fieldset
          class="editor-fields"
          @mouseenter=${() => this.dispatchTargetHover(true)}
          @mouseleave=${() => this.dispatchTargetHover(false)}
        >
          <div class="basic-grid">${this.definitions.map(definition => this.renderProperty(definition))}</div>
        </fieldset>
      `
    }
    return html`
      <div class="advanced-divider"><span>Advanced options</span></div>
      <fieldset
        class="editor-fields"
        @mouseenter=${() => this.dispatchTargetHover(true)}
        @mouseleave=${() => this.dispatchTargetHover(false)}
      >
        <div class="advanced">
          ${sectionGroups(this.definitions).map(([, definitions]) => html`
            <div class="style-section">
              <div class="section-controls">${definitions.map(definition => this.renderProperty(definition))}</div>
            </div>
          `)}
          ${this.allowCustom ? this.renderCustomProperties() : nothing}
        </div>
      </fieldset>
    `
  }
}

if(!customElements.get("element-style-editor")) {
  customElements.define("element-style-editor", ElementStyleEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "element-style-editor": ElementStyleEditor
  }
}
