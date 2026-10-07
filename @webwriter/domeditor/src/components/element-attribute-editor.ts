import {LitElement, css, html, nothing} from "lit"
import "./document-head-editor"
import {isMediaType, mediaAttributeOptions} from "../media"
import {groupedLanguageOptions} from "../language-suggestions"
import {ribbonOptionIcon} from "../ribbon-icons"
import {
  elementAttributeEditability,
  elementAttributeOptions,
  elementEditingLimitation,
  type ElementAttributeOption,
  type ElementAttributeState,
} from "../element-attributes"

type AttributeChangeDetail = {
  path: number[] | null
  localName: string
  namespaceURI: string | null
  name: string
  previousName?: string
  value: string | null
}

const emptyAttributeState: ElementAttributeState = {
  path: null,
  localName: "",
  namespaceURI: null,
  name: "Element",
  attributes: {},
}

const languageOptions = groupedLanguageOptions()

const numericSuggestions = (name: string) => {
  if(name === "width" || name === "height") return [
    {value: "50", label: "Tiny"}, {value: "100", label: "Small"}, {value: "200", label: "Medium"},
    {value: "400", label: "Large"}, {value: "800", label: "Huge"},
  ]
  const labels = name === "start" || name === "value" ? ["First", "Second", "Third"] : ["Single", "Double", "Triple"]
  return [1, 2, 3].map((number, index) => ({value: String(number), label: labels[index]}))
}

const numericAttributeValue = (name: string, value: string): string | null | undefined => {
  if(!value) return null
  const numeric = Number(value)
  if(!Number.isFinite(numeric)) return undefined
  if(["colspan", "rowspan", "start", "value"].includes(name) && !Number.isInteger(numeric)) return undefined
  return value
}

/** A schema-free attribute editor for the currently selected authored element. */
export class ElementAttributeEditor extends LitElement {
  static properties = {
    state: {attribute: false},
    disabled: {type: Boolean, reflect: true},
    expanded: {type: Boolean, reflect: true},
    mediaOwned: {type: Boolean, attribute: false},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      color: #2f3742;
      font: 0.64rem/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    :host([expanded]) {font-size: .68rem;}
    :host([expanded]) .field {grid-template-columns: 4.4rem minmax(0, 1fr);}
    :host([expanded]) input, :host([expanded]) select {border-color: #c5ccd5; border-radius: 4px;}
    :host([expanded]) details {margin-top: .4rem; padding-top: 0; border-top: 0;}
    :host([expanded]) summary {display: none;}

    .choice-group {display: grid; grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr)); gap: 0; padding: 0 1px 1px 0; background: transparent; min-width: 0; border: 0; border-radius: 0; overflow: visible;}
    .choice-group button {box-sizing: border-box; margin: 0 -1px -1px 0; display: grid; place-items: center; min-width: 0; min-height: 1.7rem; padding: .15rem; border: 1px solid #c5ccd5; background: #f2f2f2; color: inherit; cursor: pointer;}
    .choice-group svg {display: block; width: 1rem; height: 1rem;}
    .choice-group button:first-child {border-top-left-radius: 4px;}
    .choice-group button:last-child {border-bottom-right-radius: 4px;}
    .choice-group button[data-top-right] {border-top-right-radius: 4px;}
    .choice-group button[data-bottom-left] {border-bottom-left-radius: 4px;}
    .choice-group button[aria-pressed="true"] {background: #e2edf8; color: #375d84;}
    .choice-group button:hover {background: #edf3f9;}
    .choice-group button:focus-visible {outline: 2px solid #8eb6df; outline-offset: -2px;}

    :host([disabled]) {
      opacity: 0.55;
    }

    .fields,
    .attribute-list {
      display: grid;
      gap: 0.35rem;
    }

    .limitation {
      margin-bottom: 0.55rem;
      padding: 0.45rem 0.5rem;
      border: 1px solid #c9d5e3;
      border-left: 0.2rem solid #6684a5;
      border-radius: 0.2rem;
      background: #f3f7fb;
    }

    .limitation strong,
    .limitation span {
      display: block;
    }

    .limitation strong {
      margin-bottom: 0.18rem;
      color: #344f6d;
    }

    .limitation-guidance {
      margin-top: 0.25rem;
      color: #526b86;
    }

    .field {
      display: grid;
      grid-template-columns: minmax(4.6rem, 0.8fr) minmax(0, 1.2fr);
      align-items: center;
      gap: 0.35rem;
    }

    .field > span,
    .attribute-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input,
    select,
    button {
      box-sizing: border-box;
      min-width: 0;
      min-height: 1.65rem;
      border: 1px solid #bcc7d4;
      border-radius: 0.2rem;
      color: inherit;
      background: #fff;
      font: inherit;
    }

    input,
    select {
      width: 100%;
      padding: 0.18rem 0.3rem;
    }

    input[type="checkbox"] {
      justify-self: start;
      width: 1rem;
      min-height: 1rem;
    }

    details {
      margin-top: 0.55rem;
      padding-top: 0.45rem;
      border-top: 1px solid #d7dee7;
    }

    summary {
      color: #526b86;
      cursor: pointer;
      font-weight: 600;
    }

    .attribute-list {
      margin-top: 0.45rem;
    }

    .attribute-row {
      display: grid;
      grid-template-columns: minmax(3.8rem, 0.8fr) minmax(4rem, 1.2fr) 1.65rem;
      gap: 0.2rem;
      align-items: center;
    }

    .attribute-row button {
      padding: 0;
      color: #8b3440;
      cursor: pointer;
    }

    .attribute-row[data-locked] {
      grid-template-columns: minmax(3.8rem, 0.8fr) minmax(4rem, 1.2fr);
    }

    .attribute-row[data-locked] input {
      color: #697586;
      background: #eef1f5;
    }

    .attribute-reason {
      grid-column: 1 / -1;
      color: #697586;
      font-size: 0.56rem;
    }

    .numeric-control {display: flex; min-width: 0; align-items: center; gap: .2rem;}
    .numeric-control document-head-combobox {flex: 1 1 auto;}
    .numeric-control button {flex: 0 0 1.65rem; padding: 0; cursor: pointer;}

    .add-attribute {
      display: grid;
      grid-template-columns: minmax(3.8rem, 0.8fr) minmax(4rem, 1.2fr) auto;
      gap: 0.2rem;
      margin-top: 0.5rem;
    }

    .add-attribute button {
      padding: 0.15rem 0.4rem;
      color: #315f91;
      cursor: pointer;
    }
  `

  state: ElementAttributeState | null = null
  disabled = false
  expanded = false
  mediaOwned = true

  private dispatchAttribute(name: string, value: string | null, previousName?: string) {
    if(this.disabled) return
    const state = this.state
    if(!state) return
    this.dispatchEvent(new CustomEvent<AttributeChangeDetail>("element-attribute-change", {
      detail: {
        path: state.path ? [...state.path] : null,
        localName: state.localName,
        namespaceURI: state.namespaceURI,
        name,
        ...(previousName && previousName !== name ? {previousName} : {}),
        value,
      },
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchPrimary(option: ElementAttributeOption, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchAttribute(option.name, value)
  }

  private renderPrimary(option: ElementAttributeOption, state: ElementAttributeState) {
    const value = state.attributes[option.name] ?? ""
    const editability = elementAttributeEditability(option.name, state.localName, state.namespaceURI)
    if(option.name === "lang") {
      return html`
        <div class="field">
          <span>${option.label}</span>
          <document-head-combobox
            aria-label=${`${state.name}: ${option.label}`}
            .label=${`${state.name}: ${option.label}`}
            .value=${value}
            .placeholder=${option.placeholder ?? ""}
            .options=${languageOptions}
            .disabled=${this.disabled || !editability.editable}
            @combobox-change=${(event: CustomEvent<{value: string}>) => this.dispatchAttribute("lang", event.detail.value || null)}
          ></document-head-combobox>
        </div>
      `
    }
    if(this.expanded && option.kind === "number") {
      return html`
        <div class="field">
          <span>${option.label}</span>
          <div class="numeric-control">
            <document-head-combobox
              aria-label=${`${state.name}: ${option.label}`}
              .label=${`${state.name}: ${option.label}`}
              .value=${value}
              .placeholder=${option.placeholder ?? "Enter a number"}
              .options=${numericSuggestions(option.name)}
              .showValue=${true}
              .disabled=${this.disabled || !editability.editable}
              @combobox-change=${(event: CustomEvent<{value: string}>) => {
                const next = numericAttributeValue(option.name, event.detail.value.trim())
                if(next === undefined) {
                  const combobox = event.currentTarget as HTMLElement & {value: string, close: (reset?: boolean) => void, requestUpdate: () => void}
                  combobox.value = value
                  combobox.close(true)
                  combobox.requestUpdate()
                  const input = combobox.shadowRoot?.querySelector<HTMLInputElement>("input")
                  if(input) input.value = value
                  return
                }
                this.dispatchAttribute(option.name, next)
              }}
            ></document-head-combobox>
            <button type="button" aria-label=${`Clear ${option.label}`}
              ?disabled=${this.disabled || !editability.editable || !value}
              @click=${() => this.dispatchAttribute(option.name, null)}>×</button>
          </div>
        </div>
      `
    }
    if(option.kind === "boolean") {
      return html`
        <label class="field">
          <span>${option.label}</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label=${`${state.name}: ${option.label}`}
            .checked=${Object.hasOwn(state.attributes, option.name)}
            ?disabled=${this.disabled || !editability.editable}
            @change=${(event: Event) => this.dispatchPrimary(option, event)}
          />
        </label>
      `
    }
    if(this.expanded && option.kind === "select" && option.options?.length && option.options.length <= 8
      && option.options.every(item => item.label.length <= 14)) {
      const columns = Math.min(4, Math.ceil(option.options.length / (option.options.length > 4 ? 2 : 1)))
      return html`<div class="field">
        <span id=${`attribute-label-${option.name}`}>${option.label}</span>
        <div class="choice-group" style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`attribute-label-${option.name}`}>
          ${option.options.map((item, index) => html`<button type="button"
            ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((option.options!.length - 1) / columns) * columns}
            aria-label=${item.label} title=${item.label} aria-pressed=${value === item.value}
            ?disabled=${this.disabled || !editability.editable}
            @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
            @click=${() => this.dispatchAttribute(option.name, item.value || null)}>${ribbonOptionIcon(option.name, item.value)}</button>`)}
        </div>
      </div>`
    }
    if(option.kind === "select") {
      return html`
        <label class="field">
          <span>${option.label}</span>
          <select
            data-ribbon-input-persistent
            aria-label=${`${state.name}: ${option.label}`}
            ?disabled=${this.disabled || !editability.editable}
            @change=${(event: Event) => this.dispatchPrimary(option, event)}
          >
            ${option.options?.map(item => html`
              <option value=${item.value} ?selected=${item.value === value}>${item.label}</option>
            `)}
          </select>
        </label>
      `
    }
    return html`
      <label class="field">
        <span>${option.label}</span>
        <input
          data-ribbon-input-persistent
          type=${option.kind === "url" ? "url" : option.kind === "number" ? "number" : "text"}
          aria-label=${`${state.name}: ${option.label}`}
          placeholder=${option.placeholder ?? ""}
          .value=${value}
          ?disabled=${this.disabled || !editability.editable}
          @change=${(event: Event) => this.dispatchPrimary(option, event)}
        />
      </label>
    `
  }

  private renameAttribute(previousName: string, value: string, event: Event) {
    const name = (event.currentTarget as HTMLInputElement).value.trim()
    if(!name || name === previousName) return
    this.dispatchAttribute(name, value, previousName)
  }

  private submitAttribute(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = (form.elements.namedItem("name") as HTMLInputElement | null)?.value.trim() ?? ""
    const value = (form.elements.namedItem("value") as HTMLInputElement | null)?.value ?? ""
    if(!name) return
    this.dispatchAttribute(name, value)
    form.reset()
  }

  render() {
    const state = this.state ?? (this.disabled ? emptyAttributeState : null)
    if(!state) return nothing
    const mediaNames = new Set(this.mediaOwned && isMediaType(state.localName)
      ? [...mediaAttributeOptions[state.localName].map(option => option.name), "controls", "usemap"]
      : [])
    const attributes = Object.entries(state.attributes).filter(([name]) => !mediaNames.has(name))
    const mediaOptions = !this.mediaOwned && isMediaType(state.localName) ? mediaAttributeOptions[state.localName] : []
    const options = [...new Map([...elementAttributeOptions(state.localName), ...mediaOptions].map(option => [option.name, option])).values()]
      .filter(option => !mediaNames.has(option.name))
    const limitation = elementEditingLimitation(state.localName, state.namespaceURI)
    const additionalOptions = options.filter(option => ["id", "class", "title", "dir", "hidden"].includes(option.name))
    return html`
      ${limitation ? html`
        <aside class="limitation" aria-label=${`${state.name} editing limitation`}>
          <strong>${limitation.title}</strong>
          <span>${limitation.description}</span>
          <span class="limitation-guidance">${limitation.guidance}</span>
        </aside>
      ` : nothing}
      <div class="fields" role="group" aria-label=${`${state.name} common attributes`}>
        ${options.filter(option => !additionalOptions.includes(option)).map(option => this.renderPrimary(option, state))}
      </div>
      <details ?open=${this.expanded}>
        <summary>All attributes (${attributes.length})</summary>
        <div class="attribute-list">
          ${additionalOptions.map(option => this.renderPrimary(option, state))}
          ${attributes.map(([name, value]) => {
            const editability = elementAttributeEditability(name, state.localName, state.namespaceURI)
            return html`
              <div class="attribute-row" ?data-locked=${this.disabled || !editability.editable}>
                <input
                  class="attribute-name"
                  data-ribbon-input-persistent
                  aria-label=${`Rename ${name}`}
                  .value=${name}
                  ?disabled=${this.disabled || !editability.editable}
                  @change=${(event: Event) => this.renameAttribute(name, value, event)}
                />
                <input
                  data-ribbon-input-persistent
                  aria-label=${`${state.name}: ${name}`}
                  .value=${value}
                  ?disabled=${this.disabled || !editability.editable}
                  @change=${(event: Event) => this.dispatchAttribute(name, (event.currentTarget as HTMLInputElement).value)}
                />
                ${!this.disabled && editability.editable ? html`
                  <button type="button" aria-label=${`Remove ${name}`} @click=${() => this.dispatchAttribute(name, null)}>×</button>
                ` : nothing}
                ${editability.reason ? html`<span class="attribute-reason">${editability.reason}</span>` : nothing}
              </div>
            `
          })}
        </div>
        ${limitation?.attributes === "read-only" ? nothing : html`
          <form class="add-attribute" aria-label="Add attribute" @submit=${this.submitAttribute}>
            <input data-ribbon-input-persistent name="name" aria-label="Attribute name" placeholder="data-name"
              ?disabled=${this.disabled} />
            <input data-ribbon-input-persistent name="value" aria-label="Attribute value" placeholder="Value"
              ?disabled=${this.disabled} />
            <button type="submit" ?disabled=${this.disabled}>Add</button>
          </form>
        `}
      </details>
    `
  }
}

customElements.define("element-attribute-editor", ElementAttributeEditor)

declare global {
  interface HTMLElementTagNameMap {
    "element-attribute-editor": ElementAttributeEditor
  }
}
