import { LitElement, css, html } from "lit"
import { customElement, property } from "lit/decorators.js"

import { filterObject } from "../../utility"
import { Node, Attrs, Fragment, Mark } from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { HTMLElementSpec } from "../../model"

export type PseudoNode = {type: {name: string}, attrs: Attrs}

@localized()
@customElement("ww-attributesdialog")
export class AttributesDialog extends LitElement {

  _node: Node | PseudoNode

  @property({type: Object, attribute: false})
  get node() {
    return this._node
  }

  set node(value: Node | PseudoNode) {
    if(value) {
      this._node = value
      this.pendingAttrs = value.attrs
      this.pendingContent = "content" in value? value.content: undefined
      this.pendingMarks = "marks" in value? value.marks: undefined
    }
  }

  @property({attribute: false, state: true})
  pendingAttrs: Attrs 

  @property({attribute: false, state: true})
  pendingContent: Node | readonly Node[] | Fragment | undefined

  @property({attribute: false, state: true})
  pendingMarks: readonly Mark[] | undefined

  get flatDefinedValue() {
    return {
      ...filterObject(this.pendingAttrs ?? {}, (k, v) => v !== undefined && k !== "data" && !((this.spec.attrs ?? {})[k] as any)?.private),
      ...filterObject(this.pendingAttrs?.data ?? {},  (k, v) => v !== undefined)
    } as unknown as Record<string, string | boolean>
  }

  get spec() {
    if("spec" in this.node.type) {
      return this.node.type.spec
    }
    else {
      return HTMLElementSpec({tag: "body"})
    }
  }

  get availableAttributeNames() {
    return !this.node? []: Object.keys(this.spec.attrs ?? {})
  }

  get tag() {
    return this.node?.type?.name ?? ""
  }

  @property({type: Boolean, attribute: true, reflect: true})
  open = false

  static get styles() {
    return css`
      sl-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: 1ch;
      }

      sl-dialog::part(title) {
        display: flex;
        flex-direction: row;
        align-items: baseline;
        gap: 1ch;
      }

      .attribute {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 1ch;
      }

      .attribute main {
        display: grid;
        grid-template-columns: 1fr max-content 2fr;
        grid-template-rows: 1fr;
        gap: 1ch;
        align-items: center;
        border: 1px solid var(--sl-color-gray-300);
        border-radius: var(--sl-border-radius-medium);
      }

      .attribute.boolean main :first-child {
        grid-column: span 3;
      }

      #add::part(base) {
        width: 100%;
        margin-top: 2ch;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
      }

      .delete {
        grid-column: 4;
      }

      ww-combobox::part(input) {
        font-family: monospace;
      }

      ww-combobox::part(base) {
        border: none;
      }

      :not(.boolean) > main > ww-combobox:first-of-type::part(base) {
        padding-right: 0;
      }

      :not(.boolean) > main > ww-combobox:last-of-type::part(base) {
        padding-left: 0;
      }

    `
  }

  Attribute(key: string, value: string | boolean) {
    const boolean = typeof value === "boolean"
    const data = key.startsWith("data-")
    return html`<div class=${classMap({attribute: true, boolean})}>
      <main>
        <ww-combobox .value=${key} @sl-change=${(e: any) => this.rename(key, e.target.value)} suggestions ?inputDisabled=${!data} fixLength=${5} @sl-after-hide=${(e: any) => e.stopPropagation()}>
          <sl-option value="data-">${"data-..."}</sl-option>
          <sl-divider></sl-divider>
          ${this.availableAttributeNames.map(v => html`<sl-option value=${v}>${v}</sl-option>`)}
        </ww-combobox>
        ${typeof value === "boolean"? null: html`
          <code>=</code>
          <ww-combobox .value=${value} placeholder="true" @sl-change=${(e: any) => this.set(key, e.target.value)}>
            ${!value? null: html`
              <code slot="prefix">"</code>
              <code slot="suffix">"</code>
            `}
          </ww-combobox>
        `}
      </main>
      <ww-button class="delete" variant="icon" icon="trash" @click=${() => this.delete(key)}></ww-button>
    </div>`
  }

  rename(oldKey: string, newKey: string) {
    const oldValue = oldKey.startsWith("data-") || oldKey === "data"? this.pendingAttrs.data![oldKey]: this.pendingAttrs[oldKey]
    this.pendingAttrs = newKey?.startsWith("data-") || newKey === "data"
      ? {
        ...filterObject(this.pendingAttrs, k => k !== oldKey),
        data: {
          ...filterObject(this.pendingAttrs.data ?? {}, k => k !== oldKey),
          [newKey]: oldValue
        } as any
      }
      : {
        ...filterObject(this.pendingAttrs, k => k !== oldKey),
        data: {
          ...filterObject(this.pendingAttrs.data ?? {}, k => k !== oldKey),
        } as any,
        [newKey]: oldValue
      } 
  }

  set(key: string, value?: string | boolean) {
    this.pendingAttrs = key?.startsWith("data-") || key === "data"
    ? {
      ...this.pendingAttrs,
      data: {
        ...this.pendingAttrs.data,
        [key ?? ""]: value ?? ""
      } as any
    }
    : {
      ...this.pendingAttrs,
      [key ?? ""]: value ?? ""
    }
  }

  add(boolean=false) {
    const attrs = this.flatDefinedValue
    if(attrs[""] === undefined) {
      this.set("", boolean? true: "")
    }
    else {
      this.set("a" + String(Object.values(attrs).length + 1), boolean? true: "")
    }
  }

  delete(key: string) {
    this.pendingAttrs = key?.startsWith("data-") || key === "data"
      ? {...this.pendingAttrs, data: filterObject(this.pendingAttrs.data, k => k !== key)}
      : filterObject(this.pendingAttrs, k => k !== key)
  }

  AddButton() {
    return html`
      <sl-button id="add-attribute" outline @click=${() => this.add()}>
        <sl-icon name="plus"></sl-icon>
        ${msg("Attribute")}
      </sl-button>
    `
  }

  handleConfirm = () => {
    this.node = "schema" in this.node.type
      ? this.node.type.schema.node(this.node.type, this.pendingAttrs, this.pendingContent, this.pendingMarks)
      : {...this.node, attrs: this.pendingAttrs}
    this.dispatchEvent(new CustomEvent("ww-confirm", {composed: true, bubbles: true}))
    this.open = false
  }

  handleDiscard = () => {
    this.node = this.node
    this.dispatchEvent(new CustomEvent("ww-discard", {composed: true, bubbles: true}))
    this.open = false
  }

  render() {
    return html`<sl-dialog label=${msg("Attributes")} ?open=${this.open}>
      <slot name="label" slot="label">
        <span>${msg("Edit ")}</span>
        <code>${"<" + this.tag + ">"}</code>
      </slot>
      <slot name="prefix"></slot>
      ${Object.entries(this.flatDefinedValue).map(([k, v]) => this.Attribute(k, v))}
      ${this.AddButton()}
      <div class="dialog buttons" slot="footer">
        <ww-button variant="danger" @click=${this.handleDiscard}>${msg("Discard changes")}</ww-button>
        <ww-button variant="primary" @click=${this.handleConfirm}>${msg("Confirm changes")}</ww-button>
      </div>
    </sl-dialog>`
  }
}