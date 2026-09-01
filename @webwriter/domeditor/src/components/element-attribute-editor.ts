import {LitElement, css, html, nothing} from "lit"
import {
  elementAttributeEditability,
  elementAttributeOptions,
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

/** A schema-free attribute editor for the currently selected authored element. */
export class ElementAttributeEditor extends LitElement {
  static properties = {
    state: {attribute: false},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      color: #2f3742;
      font: 0.64rem/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .fields,
    .attribute-list {
      display: grid;
      gap: 0.35rem;
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

  private dispatchAttribute(name: string, value: string | null, previousName?: string) {
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

  private renderPrimary(option: ElementAttributeOption) {
    const state = this.state!
    const value = state.attributes[option.name] ?? ""
    if(option.kind === "boolean") {
      return html`
        <label class="field">
          <span>${option.label}</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label=${`${state.name}: ${option.label}`}
            .checked=${Object.hasOwn(state.attributes, option.name)}
            @change=${(event: Event) => this.dispatchPrimary(option, event)}
          />
        </label>
      `
    }
    if(option.kind === "select") {
      return html`
        <label class="field">
          <span>${option.label}</span>
          <select
            data-ribbon-input-persistent
            aria-label=${`${state.name}: ${option.label}`}
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
    const state = this.state
    if(!state) return nothing
    const options = elementAttributeOptions(state.localName)
    return html`
      <div class="fields" role="group" aria-label=${`${state.name} common attributes`}>
        ${options.map(option => this.renderPrimary(option))}
      </div>
      <details>
        <summary>All attributes (${Object.keys(state.attributes).length})</summary>
        <div class="attribute-list">
          ${Object.entries(state.attributes).map(([name, value]) => {
            const editability = elementAttributeEditability(name)
            return html`
              <div class="attribute-row" ?data-locked=${!editability.editable}>
                <input
                  class="attribute-name"
                  data-ribbon-input-persistent
                  aria-label=${`Rename ${name}`}
                  .value=${name}
                  ?disabled=${!editability.editable}
                  @change=${(event: Event) => this.renameAttribute(name, value, event)}
                />
                <input
                  data-ribbon-input-persistent
                  aria-label=${`${state.name}: ${name}`}
                  .value=${value}
                  ?disabled=${!editability.editable}
                  @change=${(event: Event) => this.dispatchAttribute(name, (event.currentTarget as HTMLInputElement).value)}
                />
                ${editability.editable ? html`
                  <button type="button" aria-label=${`Remove ${name}`} @click=${() => this.dispatchAttribute(name, null)}>×</button>
                ` : nothing}
                ${editability.reason ? html`<span class="attribute-reason">${editability.reason}</span>` : nothing}
              </div>
            `
          })}
        </div>
        <form class="add-attribute" aria-label="Add attribute" @submit=${this.submitAttribute}>
          <input data-ribbon-input-persistent name="name" aria-label="Attribute name" placeholder="data-name" />
          <input data-ribbon-input-persistent name="value" aria-label="Attribute value" placeholder="Value" />
          <button type="submit">Add</button>
        </form>
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
