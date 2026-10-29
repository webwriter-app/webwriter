import { LitElement, css, html, nothing } from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {getElementPresentation} from "../element-names"
import {graphicShapeDragType, readGraphicShapeDrag} from "../graphic"
import "./insertion-menu"
import {elementDragType, nodeDragType, ribbonInsertionDragType, type InsertionMenu, type InsertionMenuItem} from "./insertion-menu"
import {
  distributionPermissions,
  emptyDistributionConfig,
  validateDistributionConfig,
  type DistributionConfig,
  type DistributionItem,
  type DistributionPermission,
} from "../distribution.js"

export interface DistributionSelectionState {
  identity?: string
  target: string
  local: DistributionConfig | null
  effective: DistributionConfig | null
  inheritedFrom: string | null
  error?: string
}

export type DistributionInsertDrop = {target: string, general: boolean, action?: string, token?: string}

const permissionLabels: Record<DistributionPermission, string> = {
  edit: "Edit",
  move: "Move",
  delete: "Delete",
  duplicate: "Duplicate",
  style: "Style",
  insert: "Insert",
}

const permissionIcons: Record<DistributionPermission, string> = {
  edit: "Pencil", move: "Position", delete: "Delete", duplicate: "Copy", style: "Theme", insert: "Plus",
}

const cloneConfig = (config: DistributionConfig, target: string): DistributionConfig => ({
  version: 1,
  target,
  scope: config.scope,
  ...(config.groupSize !== undefined ? {groupSize: config.groupSize} : {}),
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
    insertDragActive: {type: Boolean},
    view: {type: String},
    compact: {type: Boolean, reflect: true},
    lastGroupingSize: {state: true},
    pickerOpen: { state: true },
    query: { state: true },
    dropActive: { state: true },
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
      gap: 0.15rem;
      min-width: 0;
    }

    h2, p { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    h2 { color: var(--sl-color-neutral-600, #666); font-size: 0.65rem; line-height: 1.2; font-weight: 400; }
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
    .permission-card {
      min-width: 0;
      border: 1px solid #c5ccd5;
      border-radius: 4px;
      background: #f7f7f7;
    }
    .permission {
      display: grid;
      grid-template-columns: 1.1rem minmax(0, 1fr) 1.25rem;
      gap: 0.5rem;
      min-height: 2.3rem;
      padding: 0.4rem 0.5rem;
      cursor: pointer;
    }
    .permission-card:hover {background: #edf3f9;}
    .permission-card:has(> .permission > input:checked) {border-color: #8eb6df; background: #e2edf8; color: #375d84;}
    .permission-card:has(> .permission > input:disabled) {opacity: 0.5;}
    .permission:has(input:disabled) {cursor: default;}
    .permission-card:focus-within {outline: 2px solid #8eb6df; outline-offset: 1px;}
    .permission-card.drop-active {outline: 2px solid #3977c7; outline-offset: 1px; background: #e2edf8;}
    .permission-icon, .permission-icon svg {display: block; width: 1.1rem; height: 1.1rem;}
    .permission input[type="checkbox"] {width: 1.25rem; height: 1.25rem; accent-color: #3977c7; cursor: inherit;}
    :host([compact]) .permissions {gap: 0.2rem;}
    :host([compact]) .permission {grid-template-columns: 0.8rem minmax(0, 1fr) 0.8rem; gap: 0.4rem; min-height: 1.15rem; padding: 0.1rem 0.35rem;}
    :host([compact]) .permission-icon, :host([compact]) .permission-icon svg {width: 0.8rem; height: 0.8rem;}
    :host([compact]) .permission input[type="checkbox"] {width: 0.8rem; height: 0.8rem;}
    .grouping {display: grid; grid-template-columns: minmax(0, 1fr) auto; min-width: 0; min-height: 1.65rem; border: 1px solid #c5ccd5; border-radius: 4px; background: #fff; color: #153d61; overflow: hidden;}
    .grouping[aria-disabled="true"] {opacity: 0.5; filter: grayscale(1);}
    .grouping-all {align-self: stretch; min-height: 1.65rem; padding: 0.1rem 0.5rem; border: 0; border-left: 1px solid #c5ccd5; border-radius: 0; background: transparent; color: inherit;}
    .grouping-all[aria-pressed="true"], .grouping-counter:has(.grouping-select[aria-pressed="true"]) {background: #dbe7f2;}
    .grouping-counter {display: grid; grid-template-columns: 1.8rem minmax(0, 1fr) 1.8rem; align-items: center; min-width: 0; padding-inline: 0.15rem; cursor: pointer;}
    .grouping-counter button {display: grid; place-items: center; width: 100%; min-height: 1.65rem; padding: 0; border: 0; border-radius: 0; background: transparent; color: #627586;}
    .grouping-counter button svg {display: block; width: 0.75rem; height: 0.75rem;}
    .grouping-counter button:disabled {opacity: 0.35;}
    .grouping-counter .grouping-select {display: flex; align-items: center; justify-content: center; gap: 0.25rem; min-width: 0; white-space: nowrap; color: inherit;}
    .grouping button:focus-visible {outline-offset: -2px;}
    .grouping-glyph {display: inline-flex; align-items: center; gap: 1px; flex: 0 0 auto;}
    .grouping-glyph svg {display: block;}
    .grouping-multiplier {font-weight: 700;}
    select, input[type="search"] { min-width: 0; padding: 0.2rem 0.3rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; background: #fff; }
    ul { display: grid; gap: 0.2rem; min-width: 0; margin: 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: 1rem minmax(0, 1fr) auto; align-items: center; gap: 0.35rem; min-width: 0; }
    .allowed-icon, .allowed-icon svg {display: block; width: 1rem; height: 1rem;}
    .allowed-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .insert-icon-button {display: inline-grid; place-items: center; flex: 0 0 auto; width: 1.65rem; height: 1.65rem; padding: 0; background: transparent;}
    .insert-icon-button svg {display: block; width: 1rem; height: 1rem;}
    .remove {border-color: transparent;}
    .insert-icon-button:hover:not(:disabled) {border-color: #8eb6df;}
    .picker { display: grid; gap: 0.3rem; min-width: 0; }
    .picker input[type="search"] { width: 100%; }
    .insert-options {display: grid; gap: 0.45rem; min-width: 0; padding: 0.5rem; border-top: 1px solid #c5ccd5; color: #202833;}
  `

  state: DistributionSelectionState | null = null
  items: DistributionItem[] = []
  heading = ""
  general = false
  hideHeading = false
  disabled = false
  pending = false
  insertDragActive = false
  view: "all" | "grouping" | "permissions" = "all"
  compact = false
  private lastGroupingSize = 1

  private get isLocked() {
    return this.disabled || this.pending
  }

  private get currentConfig() {
    if (this.general) {
      return this.state?.local ?? (this.state ? emptyDistributionConfig(this.state.target || "selection") : null)
    }
    return this.state?.local ?? this.state?.effective ?? (this.state ? emptyDistributionConfig(this.state.target || "selection") : null)
  }

  private get insertionEnabled() {
    return Boolean(this.currentConfig?.permissions.includes("insert"))
  }

  private get groupingSize() {
    const config = this.currentConfig
    return config?.scope === "all" ? 0 : config?.scope === "group" ? config.groupSize ?? 3 : 1
  }

  private changeGrouping(direction: -1 | 1) {
    const current = this.groupingSize || this.lastGroupingSize
    const size = Math.max(1, Math.min(999, current + direction))
    this.setGroupingSize(size)
  }

  private setGroupingSize(size: number) {
    if(size > 0) this.lastGroupingSize = size
    this.updateConfig(config => {
      const {groupSize: _previous, ...rest} = config
      return {...rest, scope: size === 0 ? "all" : size === 1 ? "individual" : "group", ...(size > 1 ? {groupSize: size} : {})}
    })
  }

  private selectAll() {
    if(this.fieldsDisabled || this.groupingSize === 0) return
    this.lastGroupingSize = this.groupingSize
    this.setGroupingSize(0)
  }

  private selectGroups() {
    if(this.fieldsDisabled || this.groupingSize !== 0) return
    this.setGroupingSize(this.lastGroupingSize)
  }

  private renderGroupingGlyph(size: number) {
    const person = () => html`<svg width="13" height="15" viewBox="0 0 12 14" fill="none">
      <circle cx="6" cy="3.4" r="3.1" fill="currentColor"></circle>
      <path d="M0.5 13.5c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" fill="currentColor"></path>
    </svg>`
    return html`<span class="grouping-glyph" aria-hidden="true">
      ${Array.from({length: size === 2 ? 2 : 1}, person)}
    </span>`
  }

  pickerOpen = false
  query = ""
  private dropActive = false

  private get dropDisabled() {
    return this.disabled || !this.state
  }

  private acceptsInsertionDrop(event: DragEvent) {
    return !this.dropDisabled && Array.from(event.dataTransfer?.types ?? [])
      .some(type => [ribbonInsertionDragType, elementDragType, nodeDragType, graphicShapeDragType].includes(type))
  }

  private onInsertDragOver(event: DragEvent) {
    if(!this.acceptsInsertionDrop(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = "copy"
    this.dropActive = true
  }

  private onInsertDragLeave(event: DragEvent) {
    if(event.relatedTarget instanceof Node && (event.currentTarget as Node).contains(event.relatedTarget)) return
    this.dropActive = false
  }

  private onInsertDrop(event: DragEvent) {
    this.dropActive = false
    if(!this.acceptsInsertionDrop(event) || !this.state) return
    event.preventDefault()
    event.stopPropagation()
    const data = event.dataTransfer!
    const shape = readGraphicShapeDrag(data)
    const action = data.getData(ribbonInsertionDragType) || (data.getData(elementDragType) ? `element:${data.getData(elementDragType)}`
      : shape ? `insert-graphic-shape:${shape.shape}` : "")
    const token = data.getData(nodeDragType)
    if(!action && !token) return
    this.dispatchEvent(new CustomEvent<DistributionInsertDrop>("distribution-insert-drop", {
      bubbles: true, composed: true,
      detail: {target: this.state.target, general: this.general, ...(token ? {token} : {action})},
    }))
  }

  private get fieldsDisabled() {
    return this.isLocked || !this.state
  }

  private emitConfig(config: DistributionConfig | null) {
    if (!this.state || this.isLocked) return
    this.dispatchEvent(new CustomEvent("distribution-config-change", {
      bubbles: true,
      composed: true,
      detail: { target: this.state.target, config, ...(this.general ? { general: true } : {}) },
    }))
  }

  private updateConfig(update: (config: DistributionConfig) => DistributionConfig) {
    if (!this.state || this.fieldsDisabled) return
    const config = this.currentConfig
    if (!config) return
    const edited = update(cloneConfig(config, this.state.target || "selection"))
    this.emitConfig(validateDistributionConfig(edited))
  }

  private togglePermission(permission: DistributionPermission, checked: boolean) {
    if(permission === "insert" && !checked) this.closePicker()
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

  private additionIcon(id: string) {
    if(id === "element:*") return "Section"
    if(id.startsWith("element:")) return getElementPresentation(id.slice("element:".length)).icon
    if(id.startsWith("list-style:")) return getElementPresentation(id.split(":")[1]).icon
    if(id.startsWith("insert-graphic-shape:")) return "Graphic"
    if(id.startsWith("insert-math:")) return "Formula"
    return "FileHorizontal"
  }

  private openPicker() {
    if(!this.insertionEnabled || this.fieldsDisabled) return
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
    if(!this.insertionEnabled || this.fieldsDisabled) return
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
    if(!this.insertionEnabled || this.fieldsDisabled) return
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

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("state")) {
      const previous = changed.get("state") as DistributionSelectionState | null | undefined
      if((previous?.identity ?? previous?.target) !== (this.state?.identity ?? this.state?.target)) this.lastGroupingSize = this.groupingSize || 1
      else if(this.groupingSize > 0) this.lastGroupingSize = this.groupingSize
    }
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("state") || this.dropDisabled || changed.has("insertDragActive") && !this.insertDragActive) this.dropActive = false
    if(changed.has("state") && this.pickerOpen && !this.insertionEnabled) this.closePicker()
    if (changed.has("pickerOpen") && this.pickerOpen) {
      this.renderRoot.querySelector<HTMLInputElement>(".picker-search")?.focus()
    }
  }

  private renderInsertionOptions() {
    const selectedAdditions = this.selectedAdditions
    return html`<div class="insert-options">
      <ul aria-label="Allowed additions">
        ${selectedAdditions.map(({ id, label }) => html`<li>
          <span class="allowed-icon" aria-hidden="true">${ribbonIcon(this.additionIcon(id))}</span>
          <span class="allowed-name">${label}</span>
          <button class="remove insert-icon-button" type="button" aria-label=${`Remove ${label}`} title=${`Remove ${label}`} ?disabled=${this.fieldsDisabled} @click=${() => this.removeAddition(id)}>
            <span aria-hidden="true">${ribbonIcon("Reject")}</span>
          </button>
        </li>`)}
      </ul>
      <button class="insert-add insert-icon-button" type="button" aria-label="Add element" title="Add element" ?disabled=${this.fieldsDisabled} @click=${this.openPicker}>
        <span aria-hidden="true">${ribbonIcon("Plus")}</span>
      </button>
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
    </div>`
  }

  render() {
    const state = this.state
    if (!state && this.view === "all") {
      return html`<section class="panel" aria-label="Distribution settings"><p class="inheritance">Select an element to configure distribution.</p></section>`
    }

    const config = this.currentConfig
    return html`<section class="panel" aria-label="Distribution settings">
      ${this.hideHeading ? nothing : html`<h2>${this.heading || (this.general ? "Permissions for readers" : "Grouping")}</h2>`}
      ${state?.error ? html`<p class="error" role="status">${state.error}</p>` : nothing}
      ${this.general || this.view === "permissions" ? nothing : html`<div class="grouping" role="group" aria-label="Grouping" aria-disabled=${this.fieldsDisabled}>
        <div class="grouping-counter" role="group" aria-label="Group size" @click=${this.selectGroups}>
          <button type="button" aria-label="Smaller group" title="Smaller group" ?disabled=${this.fieldsDisabled || (this.groupingSize || this.lastGroupingSize) === 1}
            @click=${(event: Event) => { event.stopPropagation(); this.changeGrouping(-1) }}>
            <svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>
          </button>
          <button class="grouping-select" type="button" aria-live="polite" aria-pressed=${this.groupingSize !== 0} ?disabled=${this.fieldsDisabled}>
            ${this.renderGroupingGlyph(this.groupingSize || this.lastGroupingSize)}
            ${(this.groupingSize || this.lastGroupingSize) > 2 ? html`<span class="grouping-multiplier">×${this.groupingSize || this.lastGroupingSize}</span>` : nothing}
            <span>${(this.groupingSize || this.lastGroupingSize) === 1 ? "single" : (this.groupingSize || this.lastGroupingSize) === 2 ? "pair" : "groups"}</span>
          </button>
          <button type="button" aria-label="Bigger group" title="Bigger group" ?disabled=${this.fieldsDisabled || this.groupingSize === 999}
            @click=${(event: Event) => { event.stopPropagation(); this.changeGrouping(1) }}>
            <span aria-hidden="true">${ribbonIcon("Plus")}</span>
          </button>
        </div>
        <button class="grouping-all" type="button" aria-pressed=${this.groupingSize === 0} ?disabled=${this.fieldsDisabled} @click=${this.selectAll}>All</button>
      </div>`}

      ${this.view === "grouping" ? nothing : html`<div class="permissions">
        ${distributionPermissions.map((permission) => html`<div class=${`permission-card${permission === "insert" && !this.dropDisabled && (this.dropActive || this.insertDragActive) ? " drop-active" : ""}`} data-permission=${permission}
          @dragover=${permission === "insert" ? this.onInsertDragOver : nothing}
          @dragleave=${permission === "insert" ? this.onInsertDragLeave : nothing}
          @drop=${permission === "insert" ? this.onInsertDrop : nothing}>
          <label class="permission">
            <span class="permission-icon" aria-hidden="true">${ribbonIcon(permissionIcons[permission])}</span>
            <span>${permissionLabels[permission]}</span>
            <input type="checkbox" .checked=${Boolean(config?.permissions.includes(permission))} ?disabled=${this.fieldsDisabled}
              @change=${(event: Event) => this.togglePermission(permission, (event.currentTarget as HTMLInputElement).checked)} />
          </label>
          ${permission === "insert" && this.insertionEnabled ? this.renderInsertionOptions() : nothing}
        </div>`)}
      </div>`}
    </section>`
  }
}

if (!customElements.get("distribution-controls")) {
  customElements.define("distribution-controls", DistributionControls)
}
