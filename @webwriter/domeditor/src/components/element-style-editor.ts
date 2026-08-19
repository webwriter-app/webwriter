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

    button,
    input,
    select {
      box-sizing: border-box;
      color: inherit;
      font: inherit;
    }

    .basic-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      height: 100%;
      gap: 0.12rem 0.3rem;
      padding: 0.1rem 0;
    }

    .advanced {
      box-sizing: border-box;
      height: 100%;
      padding: 0.2rem 0.15rem 0.45rem;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .target {
      position: sticky;
      top: -0.2rem;
      z-index: 2;
      margin: 0 0 0.35rem;
      padding: 0.28rem 0.35rem;
      border-bottom: 1px solid #d8dee6;
      color: #526b86;
      background: #f2f2f2;
      font-size: 0.64rem;
    }

    .target code {
      color: #1e4f87;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .editor-fields {
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .editor-fields[disabled] {
      opacity: 0.5;
    }

    .editor-fields[disabled] .property-label,
    .editor-fields[disabled] summary {
      cursor: default;
    }

    details {
      margin: 0 0 0.3rem;
      border: 1px solid #d8dee6;
      border-radius: 0.35rem;
      background: #fff;
    }

    summary {
      padding: 0.35rem 0.45rem;
      color: #34465a;
      font-weight: 650;
      cursor: pointer;
      user-select: none;
    }

    .section-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
      padding: 0 0.35rem 0.4rem;
    }

    .property {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-rows: auto minmax(1.35rem, auto);
      min-width: 0;
      gap: 0.02rem 0.18rem;
    }

    :host([mode="basic"]) .property {
      grid-template-rows: 0.88rem minmax(1.25rem, auto);
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

    input,
    select {
      padding: 0.16rem 0.3rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: transparent;
      outline: none;
    }

    input:hover,
    select:hover {
      border-color: #9cabbc;
    }

    input:focus,
    select:focus {
      border-color: #3977c7;
      box-shadow: 0 0 0 1px #3977c7;
    }

    input::placeholder {
      color: #8794a3;
      opacity: 1;
    }

    .compound {
      display: grid;
      grid-template-columns: minmax(2.75rem, 1fr) minmax(2.35rem, auto);
    }

    .compound input {
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .compound select {
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
    }

    .color-control {
      display: grid;
      grid-column: 1;
      grid-template-columns: 1.55rem minmax(0, 1fr);
      width: 100%;
      min-width: 0;
    }

    .color-control input[type="color"] {
      width: 1.55rem;
      padding: 0.12rem;
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .color-control input[type="text"] {
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
    }

    .range-control {
      display: grid;
      grid-column: 1;
      grid-template-columns: minmax(0, 1fr) 2.7rem;
      align-items: center;
      gap: 0.18rem;
      min-width: 0;
    }

    .range-control input[type="range"] {
      height: 1.2rem;
      padding: 0;
      border: 0;
      box-shadow: none;
      background: transparent;
    }

    .toggle-control {
      display: flex;
      grid-column: 1;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      height: 1.45rem;
      padding: 0 0.32rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
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

    .property-action:hover:not(:disabled),
    .property-action[aria-pressed="true"] {
      border-color: #8ca7c5;
      color: #1e4f87;
      background: #e8eef5;
    }

    .property-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .property-action:disabled {
      cursor: default;
      opacity: 0.32;
    }

    .custom-form {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto auto;
      gap: 0.25rem;
      align-items: end;
      padding: 0 0.35rem 0.4rem;
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

    .custom-declaration {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto;
      align-items: center;
      gap: 0.25rem;
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

  private togglePriority(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    if(!declaration) return
    this.dispatchChange(definition.name, {
      value: declaration.value,
      priority: declaration.priority === "important" ? "" : "important",
    })
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
        .value=${current}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLSelectElement).value,
          declaration,
        )}
      >
        <option value="">${computed ? `${computed} · computed` : "Not set"}</option>
        ${hasUnlistedValue ? html`<option value=${current}>${current}</option>` : nothing}
        ${options.map(option => html`<option value=${option}>${option}</option>`)}
      </select>
    `
  }

  private renderLength(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const units = definition.units ?? []
    const authored = this.editableValue(definition.name)
    const parsed = simpleDimension(authored, units)
    const computed = simpleDimension(this.state.computed[definition.name] ?? "", units)
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
    return html`
      <span class="color-control">
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
          aria-labelledby=${`style-label-${definition.name}`}
          .value=${current}
          placeholder=${computed}
          @change=${(event: Event) => this.commitValue(
            definition.name,
            (event.currentTarget as HTMLInputElement).value.trim(),
            declaration,
          )}
        />
      </span>
    `
  }

  private renderRange(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const fallback = this.state.computed[definition.name]?.trim() || String(definition.min ?? 0)
    const current = this.editableValue(definition.name) || fallback
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
          .value=${current}
          @change=${commit}
        />
        <input
          type="number"
          aria-label=${`${definition.label} value`}
          min=${definition.min ?? 0}
          max=${definition.max ?? 100}
          step=${definition.step ?? 1}
          .value=${current}
          @change=${commit}
        />
      </span>
    `
  }

  private renderToggle(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const [off = "none", on = "auto"] = definition.values ?? []
    const computed = this.state.computed[definition.name]?.trim()
    const checked = (this.editableValue(definition.name) || computed) === on
    return html`
      <label class="toggle-control">
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
        <button
          class="property-action"
          type="button"
          title=${declaration?.priority === "important" ? "Remove !important" : "Set !important"}
          aria-label=${`${declaration?.priority === "important" ? "Remove" : "Set"} !important for ${definition.label}`}
          aria-pressed=${declaration?.priority === "important"}
          ?disabled=${!declaration}
          @click=${() => this.togglePriority(definition)}
        >!</button>
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
      <details open>
        <summary>Custom & less common properties</summary>
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
      </details>
    `
  }

  render() {
    if(this.mode === "basic") {
      return html`
        <fieldset class="editor-fields" ?disabled=${!this.state.target}>
          <div class="basic-grid">${this.definitions.map(definition => this.renderProperty(definition))}</div>
        </fieldset>
      `
    }
    return html`
      <fieldset class="editor-fields" ?disabled=${!this.state.target}>
        <div class="advanced">
          ${this.state.target ? html`
            <p class="target">Advanced styles for <code>&lt;${this.state.target.localName}&gt;</code></p>
          ` : nothing}
          ${sectionGroups(this.definitions).map(([section, definitions]) => html`
            <details open>
              <summary>${section}</summary>
              <div class="section-controls">${definitions.map(definition => this.renderProperty(definition))}</div>
            </details>
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
