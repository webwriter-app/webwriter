import { LitElement, css, html, nothing } from "lit"
import {ribbonIcon} from "../ribbon-icons"
import "./insertion-menu"
import type { InsertionMenu, InsertionMenuItem } from "./insertion-menu"
import {
  distributionPermissions,
  emptyDistributionConfig,
  validateDistributionConfig,
  type DistributionConfig,
  type DistributionItem,
  type DistributionPermission,
  type DistributionScope,
} from "../distribution.js"

export interface DistributionSelectionState {
  target: string
  local: DistributionConfig | null
  effective: DistributionConfig | null
  inheritedFrom: string | null
  error?: string
}

const permissionLabels: Record<DistributionPermission, string> = {
  edit: "Edit",
  move: "Move",
  delete: "Delete",
  duplicate: "Duplicate",
  style: "Style",
}

const permissionIcons: Record<DistributionPermission, string> = {
  edit: "Pencil", move: "Position", delete: "Delete", duplicate: "Copy", style: "Theme",
}

const cloneConfig = (config: DistributionConfig, target: string): DistributionConfig => ({
  version: 1,
  target,
  scope: config.scope,
  permissions: [...config.permissions],
  add: [...config.add],
  items: config.items.map((item) => ({ ...item })),
})

export class DistributionControls extends LitElement {
  static properties = {
    state: { attribute: false },
    items: { attribute: false },
    heading: { type: String },
    general: { type: Boolean },
    hideHeading: { type: Boolean, attribute: "hide-heading" },
    disabled: { type: Boolean },
    pending: { type: Boolean },
    pickerOpen: { state: true },
    query: { state: true },
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      color: #202833;
      font: 0.68rem/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; }

    .panel {
      display: grid;
      gap: 0.45rem;
      min-width: 0;
    }

    h2, p { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    h2 { font-size: inherit; line-height: inherit; font-weight: 650; }
    .inheritance { color: #64748b; }
    .error { color: #b91c1c; }

    button, select, input { max-width: 100%; font: inherit; }
    button {
      justify-self: start;
      min-height: 1.65rem;
      padding: 0.2rem 0.4rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.25rem;
      color: #334155;
      background: #fff;
      cursor: pointer;
    }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    button:disabled, input:disabled, select:disabled { cursor: not-allowed; }

    .permissions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.3rem;
      min-width: 0;
    }
    label { display: flex; align-items: center; gap: 0.35rem; min-width: 0; }
    input[type="checkbox"] { flex: 0 0 auto; margin: 0; }
    .permission {
      display: grid;
      grid-template-columns: 1.1rem minmax(0, 1fr) 1.25rem;
      gap: 0.5rem;
      min-height: 2.3rem;
      padding: 0.4rem 0.5rem;
      border: 1px solid #c5ccd5;
      border-radius: 4px;
      background: #f7f7f7;
      cursor: pointer;
    }
    .permission:hover {background: #edf3f9;}
    .permission:has(input:checked) {border-color: #8eb6df; background: #e2edf8; color: #375d84;}
    .permission:has(input:disabled) {opacity: 0.5; cursor: default;}
    .permission:focus-within {outline: 2px solid #8eb6df; outline-offset: 1px;}
    .permission-icon, .permission-icon svg {display: block; width: 1.1rem; height: 1.1rem;}
    .permission input[type="checkbox"] {width: 1.25rem; height: 1.25rem; accent-color: #3977c7; cursor: inherit;}
    .scope { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
    select, input[type="search"] { min-width: 0; padding: 0.2rem 0.3rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; background: #fff; }
    ul { display: grid; gap: 0.2rem; min-width: 0; margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 0.35rem; min-width: 0; }
    .allowed-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .remove { min-height: 1.45rem; padding: 0.1rem 0.35rem; }
    .picker { display: grid; gap: 0.3rem; min-width: 0; }
    .picker input[type="search"] { width: 100%; }
  `

  state: DistributionSelectionState | null = null
  items: DistributionItem[] = []
  heading = ""
  general = false
  hideHeading = false
  disabled = false
  pending = false

  private get isLocked() {
    return this.disabled || this.pending
  }

  private get currentConfig() {
    if (this.general) {
      return this.state?.local ?? (this.state ? emptyDistributionConfig(this.state.target || "selection") : null)
    }
    return this.state?.local ?? this.state?.effective ?? null
  }

  private get isInherited() {
    return Boolean(this.state && !this.state.local && this.state.inheritedFrom)
  }

  pickerOpen = false
  query = ""

  private get fieldsDisabled() {
    return this.isLocked || !this.state || (!this.general && !this.state.local)
  }

  private emitConfig(config: DistributionConfig | null) {
    if (!this.state || this.isLocked) return
    this.dispatchEvent(new CustomEvent("distribution-config-change", {
      bubbles: true,
      composed: true,
      detail: { target: this.state.target, config, ...(this.general ? { general: true } : {}) },
    }))
  }

  private override() {
    if (!this.state || this.isLocked) return
    const configTarget = this.state.target || "selection"
    const config = this.state.effective
      ? cloneConfig(this.state.effective, configTarget)
      : emptyDistributionConfig(configTarget)
    this.emitConfig(config)
  }

  private updateConfig(update: (config: DistributionConfig) => DistributionConfig) {
    if (!this.state || this.fieldsDisabled) return
    const config = this.general
      ? this.state.local ?? emptyDistributionConfig(this.state.target || "selection")
      : this.state.local
    if (!config) return
    const edited = update(cloneConfig(config, this.state.target || "selection"))
    this.emitConfig(validateDistributionConfig(edited))
  }

  private togglePermission(permission: DistributionPermission, checked: boolean) {
    this.updateConfig((config) => ({
      ...config,
      permissions: checked
        ? [...config.permissions, permission]
        : config.permissions.filter((value) => value !== permission),
    }))
  }

  private toggleItem(item: DistributionItem, checked: boolean) {
    this.updateConfig((config) => {
      let add = [...config.add]
      let selected = [...config.items]
      const isElement = item.id.startsWith("element:")
      const wildcard = add.includes("element:*")

      if (checked) {
        if (isElement && wildcard) return config
        if (!add.includes(item.id)) add.push(item.id)
        if (!selected.some((entry) => entry.id === item.id)) selected.push({ ...item })
      } else if (isElement && wildcard) {
        const remainingElements = this.items.filter((entry) => entry.id.startsWith("element:") && entry.id !== item.id)
        add = add.filter((entry) => entry !== "element:*")
        for (const entry of remainingElements) {
          if (!add.includes(entry.id)) add.push(entry.id)
          if (!selected.some((selectedItem) => selectedItem.id === entry.id)) selected.push({ ...entry })
        }
        selected = selected.filter((entry) => entry.id !== item.id)
      } else {
        add = add.filter((entry) => entry !== item.id)
        selected = selected.filter((entry) => entry.id !== item.id)
      }
      return { ...config, add, items: selected }
    })
  }

  private toggleAllElements(checked: boolean) {
    this.updateConfig((config) => {
      const elementItems = this.items.filter((item) => item.id.startsWith("element:"))
      const nonElementAdd = config.add.filter((entry) => !entry.startsWith("element:"))
      const nonElementItems = config.items.filter((item) => !item.id.startsWith("element:"))
      if (!checked) return { ...config, add: nonElementAdd, items: nonElementItems }
      return {
        ...config,
        add: [...nonElementAdd, "element:*"],
        items: [...nonElementItems, ...elementItems.map((item) => ({ ...item }))],
      }
    })
  }

  private get insertionItems(): InsertionMenuItem[] {
    const config = this.currentConfig
    const wildcard = Boolean(config?.add.includes("element:*"))
    const selected = new Set(config?.add ?? [])
    const entries: InsertionMenuItem[] = []
    if (!wildcard) entries.push({ id: "element:*", name: "All standard elements", section: "Media" })
    for (const item of this.items) {
      if (selected.has(item.id) || (wildcard && item.id.startsWith("element:"))) continue
      const section = item.id.startsWith("element:")
        || item.id.startsWith("insert-graphic-shape:")
        || item.id.startsWith("insert-math:")
        || item.id.startsWith("list-style:")
        ? "Media"
        : "Packages"
      entries.push({ id: item.id, name: item.label, html: item.html, section })
    }
    return entries
  }

  private get selectedAdditions() {
    const config = this.currentConfig
    if (!config) return []
    return config.add.map((id) => {
      if (id === "element:*") return { id, label: "All standard elements" }
      const item = config.items.find((entry) => entry.id === id) ?? this.items.find((entry) => entry.id === id)
      if (item) return { id, label: item.label }
      const prefix = id.slice(0, id.indexOf(":"))
      const labels: Record<string, string> = {
        element: "Element",
        "insert-graphic-shape": "Graphic shape",
        "insert-math": "Math structure",
        "list-style": "List style",
        "package-member": "Widget",
        "user-snippet": "Snippet",
        package: "Package",
      }
      return { id, label: labels[prefix] ?? "Allowed item" }
    })
  }

  private openPicker() {
    this.query = ""
    this.pickerOpen = true
  }

  private closePicker() {
    this.pickerOpen = false
    this.query = ""
  }

  private onPickerKeydown(event: KeyboardEvent) {
    const menu = this.renderRoot.querySelector<InsertionMenu>("domeditor-insertion-menu")
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      menu?.moveActive(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      menu?.selectActive()
    } else if (event.key === "Escape") {
      event.preventDefault()
      this.closePicker()
    }
  }

  private onInsertionSelect(event: Event) {
    event.stopPropagation()
    const item = (event as CustomEvent<InsertionMenuItem>).detail
    if (item.id === "element:*") {
      this.toggleAllElements(true)
    } else if (item.id) {
      const available = this.items.find((entry) => entry.id === item.id)
      if (available) this.toggleItem(available, true)
    }
    this.closePicker()
  }

  private removeAddition(id: string) {
    if (id === "element:*") {
      this.toggleAllElements(false)
      return
    }
    this.updateConfig((config) => ({
      ...config,
      add: config.add.filter((entry) => entry !== id),
      items: config.items.filter((entry) => entry.id !== id),
    }))
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("pickerOpen") && this.pickerOpen) {
      this.renderRoot.querySelector<HTMLInputElement>(".picker-search")?.focus()
    }
  }

  render() {
    const state = this.state
    if (!state) {
      return html`<section class="panel" aria-label="Distribution settings"><p class="inheritance">Select an element to configure distribution.</p></section>`
    }

    const config = this.currentConfig
    const selectedAdditions = this.selectedAdditions

    return html`<section class="panel" aria-label="Distribution settings">
      ${this.hideHeading ? nothing : html`<h2>${this.heading || (this.general ? "Permissions for readers" : "Selection")}</h2>`}
      ${this.isInherited ? html`<p class="inheritance">Inherited from ${state.inheritedFrom}</p>` : nothing}
      ${state.error ? html`<p class="error" role="status">${state.error}</p>` : nothing}
      ${this.general ? nothing : !state.local
        ? html`<button type="button" ?disabled=${this.isLocked} @click=${this.override}>
            ${this.isInherited ? "Override inherited configuration" : "Create configuration"}
          </button>`
        : html`<button type="button" ?disabled=${this.isLocked} @click=${() => this.emitConfig(null)}>Inherit configuration</button>`}

      ${this.general ? nothing : html`<label for="distribution-scope">Scope</label>
        <select
          id="distribution-scope"
          .value=${config?.scope ?? "individual"}
          ?disabled=${this.fieldsDisabled}
          @change=${(event: Event) => this.updateConfig((current) => ({ ...current, scope: (event.currentTarget as HTMLSelectElement).value as DistributionScope }))}
        >
          <option value="individual">Individual</option>
          <option value="group">Group</option>
          <option value="all">All</option>
        </select>`}

      <div class="permissions">
        ${distributionPermissions.map((permission) => html`<label class="permission">
          <span class="permission-icon" aria-hidden="true">${ribbonIcon(permissionIcons[permission])}</span>
          <span>${permissionLabels[permission]}</span>
          <input
            type="checkbox"
            .checked=${Boolean(config?.permissions.includes(permission))}
            ?disabled=${this.fieldsDisabled}
            @change=${(event: Event) => this.togglePermission(permission, (event.currentTarget as HTMLInputElement).checked)}
          />
        </label>`)}
      </div>

      <ul aria-label="Allowed additions">
        ${selectedAdditions.map(({ id, label }) => html`<li>
          <span class="allowed-name">${label}</span>
          <button class="remove" type="button" aria-label=${`Remove ${label}`} ?disabled=${this.fieldsDisabled} @click=${() => this.removeAddition(id)}>Remove</button>
        </li>`)}
      </ul>
      <button type="button" ?disabled=${this.fieldsDisabled} @click=${this.openPicker}>Add</button>
      ${this.pickerOpen ? html`<div class="picker">
        <input
          class="picker-search"
          type="search"
          placeholder="++ Search elements"
          aria-label="Search elements to allow"
          .value=${this.query}
          @input=${(event: Event) => { this.query = (event.currentTarget as HTMLInputElement).value }}
          @keydown=${this.onPickerKeydown}
        />
        <domeditor-insertion-menu
          inline
          .open=${true}
          .query=${this.query}
          .items=${this.insertionItems}
          @insertion-menu-select=${this.onInsertionSelect}
          @insertion-menu-close=${this.closePicker}
        ></domeditor-insertion-menu>
      </div>` : nothing}
    </section>`
  }
}

if (!customElements.get("distribution-controls")) {
  customElements.define("distribution-controls", DistributionControls)
}
