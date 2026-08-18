import {LitElement, css, html, nothing, type TemplateResult} from "lit"
import { ribbonIcon } from "../ribbon-icons"
import type {PackageKeywordPresentation} from "../package-keywords"
import "./ribbon-menu"
import "./qr-code"
import type {RibbonMenuButton} from "./ribbon-menu"

export type RibbonButtonDetails = {
  heading: string
  subheading?: string
  description?: string
  authors?: string[]
  fields?: Array<{label: string, value: string}>
  keywords?: PackageKeywordPresentation[]
}

/** A compact action used inside a ribbon group. */
export class RibbonButton extends LitElement {
  static properties = {
    label: {type: String},
    action: {type: String},
    active: {type: Boolean, reflect: true},
    compact: {type: Boolean, reflect: true},
    disabled: {type: Boolean, reflect: true},
    icon: {type: String},
    iconUrl: {type: String, attribute: "icon-url"},
    qrValue: {type: String, attribute: "qr-value"},
    shortcut: {type: String},
    submenu: {attribute: false},
    dropdown: {attribute: false},
    submenuOpen: {state: true},
    corner: {type: String},
    cornerLabel: {type: String, attribute: "corner-label"},
    keepDrawerOpen: {type: Boolean, attribute: "keep-drawer-open"},
    openDrawer: {type: Boolean, attribute: "open-drawer"},
    management: {type: Boolean, reflect: true},
    muted: {type: Boolean, reflect: true},
    details: {attribute: false},
    detailsOpen: {type: Boolean, attribute: "details-open", reflect: true},
    selectionCount: {type: Number, attribute: "selection-count"},
    toggle: {type: Boolean, reflect: true},
    variant: {type: String, reflect: true},
    notification: {attribute: false},
    notificationVisible: {state: true},
  }

  static styles = css`
    :host {
      display: block;
      flex: 1 1 3rem;
      min-width: 3rem;
    }

    :host([compact]) {
      flex: 0 0 1.75rem;
      min-width: 1.75rem;
      width: 1.75rem;
    }

    :host([compact]) .button-row {
      box-sizing: border-box;
      height: 1.75rem;
    }

    .button-row {
      box-sizing: border-box;
      position: relative;
      display: flex;
      align-items: stretch;
      width: 100%;
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 0.35rem;
    }

    .button-row:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    .button-row button:active {
      color: #1e4f87;
      background: #c4dcf4;
    }

    .button-notification {
      box-sizing: border-box;
      position: absolute;
      z-index: 2;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 0.3rem 0.4rem;
      border: 1px solid #8eb6df;
      border-radius: 0.3rem;
      color: #1e4f87;
      background: rgb(255 255 255 / 94%);
      font-size: 0.64rem;
      font-weight: 600;
      line-height: 0.85rem;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease;
    }

    .button-notification.visible {
      opacity: 1;
    }

    :host([active]) .button-row {
      border-color: #8eb6df;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    :host([disabled]) .button-row,
    :host([disabled]) .button-row:hover {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    button {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      width: 100%;
      min-height: 1.75rem;
      padding: 0.05rem 0.3rem;
      border: 0;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.6rem;
      cursor: pointer;
    }

    button:disabled {
      color: #9aa4b1;
      cursor: default;
      opacity: 0.55;
    }

    :host([compact]) button {
      width: 100%;
      min-height: 0;
      height: 100%;
      padding: 0.25rem;
    }

    :host([compact]) .button-label {
      display: none;
    }

    .main-button {
      flex: 1 1 auto;
      min-width: 0;
    }

    .submenu-toggle {
      position: absolute;
      top: 0.15rem;
      right: 0.15rem;
      width: 1rem;
      height: 1rem;
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 0.25rem;
    }

    .submenu-toggle:hover {
      color: #1e4f87;
      background: #d7e7f7;
    }

    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .submenu-chevron {
      display: block;
      width: 0.25rem;
      height: 0.25rem;
      border-right: 1.25px solid currentColor;
      border-bottom: 1.25px solid currentColor;
      transform: rotate(45deg);
      transition: transform 120ms ease;
    }

    .submenu-toggle[aria-expanded="true"] .submenu-chevron {
      transform: rotate(225deg);
    }

    .button-icon {
      display: block;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    :host([active]) .button-icon {
      color: #1e5d9d;
    }

    :host([disabled]) .button-icon {
      color: currentColor;
    }

    .button-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .button-icon.image-icon {
      position: relative;
    }

    .button-icon.image-icon svg {
      visibility: hidden;
    }

    .button-icon img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .corner-icon {
      width: 0.65rem;
      height: 0.65rem;
    }

    .button-label {
      display: flex;
      align-items: baseline;
      line-height: 0.8rem;
      min-width: 0;
      max-width: 100%;
      white-space: nowrap;
    }

    .button-label-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .selection-count {
      flex: 0 0 auto;
      margin-left: 0.15rem;
      color: #526b86;
      font-size: 0.56rem;
      font-weight: 600;
    }

    .button-dropdown-content {
      color: #2f3742;
      font-size: 0.7rem;
    }

    .button-dropdown-form {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .button-dropdown-content .mark-attribute {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }

    .button-dropdown-content .mark-attribute > span {
      color: #526b86;
      font-size: 0.62rem;
      white-space: nowrap;
    }

    .button-dropdown-content .mark-attribute input,
    .button-dropdown-content .mark-attribute select,
    .mark-dropdown-attribute {
      box-sizing: border-box;
      width: 9rem;
      min-width: 0;
      height: 1.45rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
    }

    .button-dropdown-content .mark-attribute input:focus,
    .button-dropdown-content .mark-attribute select:focus,
    .mark-dropdown-attribute:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .button-dropdown-content .mark-attribute-link input {
      width: 11rem;
    }

    .button-dropdown-more {
      box-sizing: border-box;
      align-self: flex-start;
      min-height: 1.5rem;
      padding: 0.2rem 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
      cursor: pointer;
    }

    .button-dropdown-more:hover,
    .button-dropdown-more[aria-expanded="true"] {
      border-color: #8eb6df;
      color: #1e5d9d;
      background: #eef4fb;
    }

    .button-dropdown-more:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .button-dropdown-more:disabled {
      color: #9aa4b1;
      background: #f3f4f6;
      cursor: default;
    }

    .sharing-dropdown {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      min-width: 0;
    }

    .sharing-link-field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .sharing-link-label {
      color: #526b86;
      font-size: 0.62rem;
    }

    .sharing-link-input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.66rem;
    }

    .sharing-link-input:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .sharing-dropdown-actions {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .sharing-dropdown-actions .button-dropdown-more {
      width: 100%;
    }

    .media-attribute-boolean input {
      width: auto !important;
      height: auto !important;
      accent-color: #3977c7;
    }

    .media-dropdown-status {
      color: #667085;
      font-size: 0.64rem;
    }

    .table-size-picker {
      display: grid;
      gap: 0.35rem;
      width: 11.5rem;
    }

    .table-size-label {
      color: #526b86;
      font-size: 0.66rem;
      font-weight: 600;
    }

    .table-size-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 0.15rem;
    }

    .table-size-cell {
      box-sizing: border-box;
      min-height: 0;
      width: 1rem;
      height: 1rem;
      padding: 0;
      border: 1px solid #9aa4b1;
      border-radius: 0.05rem;
      background: #fff;
    }

    .table-size-cell[data-selected] {
      border-color: #3977c7;
      background: #dcecff;
    }

    .table-size-cell:focus-visible {
      position: relative;
      z-index: 1;
      outline: 2px solid #3977c7;
      outline-offset: 0;
    }

    .button-dropdown-advanced {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding-top: 0.35rem;
      border-top: 1px solid #d8dee6;
    }

    .mark-dropdown-list {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .mark-dropdown-option {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: auto 1rem minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.35rem;
      min-height: 2rem;
      padding: 0.25rem 0.3rem;
      border-radius: 0.25rem;
    }

    .mark-dropdown-option:hover,
    .mark-dropdown-option[aria-selected="true"] {
      background: #eef4fb;
    }

    .mark-dropdown-option > input[type="checkbox"] {
      margin: 0;
      accent-color: #3977c7;
    }

    .mark-dropdown-option-icon {
      display: block;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .mark-dropdown-option-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .mark-dropdown-option-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mark-dropdown-attributes {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .mark-dropdown-attributes[aria-hidden="true"] {
      visibility: hidden;
    }

    .mark-dropdown-attribute {
      width: 7rem;
    }

    .details {
      box-sizing: border-box;
      display: none;
      position: fixed;
      z-index: 2147483647;
      width: min(17rem, calc(100vw - 1rem));
      max-height: min(18rem, calc(100vh - 1rem));
      padding: 0.55rem;
      overflow: auto;
      border: 1px solid #a8a8a8;
      border-radius: 0.4rem;
      color: #2f3742;
      background: #fff;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
      font-size: 0.7rem;
      line-height: 1.3;
      margin: 0;
    }

    :host([details-open]) .details { display: block; }
    .details h3 { margin: 0; font-size: 0.8rem; }
    .details-subheading { color: #667085; font-size: 0.63rem; }
    .details-authors {
      overflow: hidden;
      margin-top: 0.1rem;
      color: #667085;
      font-size: 0.64rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .details-description { margin: 0.4rem 0; }
    .details dl { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.55rem; margin: 0; }
    .details dt { color: #667085; font-weight: 600; }
    .details dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .details-keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.45rem;
      margin-top: 0.4rem;
      color: #667085;
      font-size: 0.63rem;
    }
    .details-keyword {
      display: inline-flex;
      align-items: center;
      gap: 0.18rem;
    }
    .details-keyword-icon {
      display: inline-flex;
      flex: 0 0 0.72rem;
      width: 0.72rem;
      height: 0.72rem;
      color: #526b86;
    }
    .details-keyword-icon svg { display: block; width: 100%; height: 100%; }

    :host([variant="package"]) {
      grid-column: span 2;
      min-width: 0;
    }

    :host([variant="qr"]) {
      grid-column: span 1;
      grid-row: span 2;
      min-width: 0;
      min-height: 0;
    }

    :host([variant="qr"]) .button-row,
    :host([variant="qr"]) .main-button {
      height: 100%;
    }

    :host([variant="qr"]) .main-button {
      gap: 0.1rem;
      padding: 0 1.15rem 0 0.15rem;
    }

    :host([variant="qr"]) .button-icon {
      width: 3.5rem;
      height: 3.5rem;
    }

    :host([variant="qr"]) .submenu-trigger {
      top: 50%;
      transform: translateY(-50%);
    }

    :host([variant="package"]) .button-row {
      box-sizing: border-box;
      height: 100%;
    }

    :host([variant="package"][active]) .button-row {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    :host([variant="package"][active]) .button-row:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    :host([variant="package"][active]) .button-icon {
      color: #526b86;
    }

    :host([variant="package"]) .main-button {
      flex-direction: row;
      justify-content: flex-start;
      gap: 0.4rem;
      height: 100%;
      padding: 0.15rem 1.35rem 0.15rem 0.4rem;
      text-align: left;
    }

    :host([variant="package"]) .button-icon {
      flex: 0 0 1rem;
    }

    :host([variant="package"]) .submenu-toggle:not(.submenu-trigger) {
      top: 50%;
      transform: translateY(-50%);
    }

    :host([variant="package"]) .button-row.has-submenu .main-button {
      padding-right: 0.4rem;
    }

    :host([variant="package"]) .submenu-trigger {
      position: static;
      flex: 0 0 auto;
      align-self: stretch;
      width: auto;
      height: 100%;
      min-height: 100%;
      aspect-ratio: 1 / 1;
      transform: none;
    }

    :host([variant="package"]) .button-label {
      display: -webkit-box;
      flex: 1 1 auto;
      line-height: 0.68rem;
      font-size: calc(0.6rem + 1px);
      overflow: hidden;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    :host([variant="package"]) .button-label-text {
      overflow-wrap: anywhere;
      text-overflow: clip;
      white-space: normal;
    }

    :host([variant="package"][muted]) .button-row {
      color: #7c8794;
      opacity: 0.55;
    }

    :host([variant="package"][muted]) .button-row:hover {
      opacity: 0.8;
    }

    :host([variant="package"][management][active]) .button-row:hover {
      border-color: #9f1239;
      color: #7f1d1d;
      background: #fee2e2;
      box-shadow: inset 0 0 0 1px rgb(159 18 57 / 12%);
    }

    :host([variant="package"][management][active]) .button-row:hover .button-icon,
    :host([variant="package"][management][active]) .button-row:hover .submenu-toggle {
      color: #991b1b;
    }

  `

  label = "Placeholder"
  action = ""
  active = false
  compact = false
  disabled = false
  icon = ""
  iconUrl = ""
  qrValue = ""
  shortcut = ""
  submenu: RibbonMenuButton[] = []
  dropdown: TemplateResult | null = null
  corner = ""
  cornerLabel = ""
  keepDrawerOpen = false
  openDrawer = false
  management = false
  muted = false
  details: RibbonButtonDetails | null = null
  toggle = false
  selectionCount = 0
  variant = "default"
  notification = ""
  private submenuOpen = false
  private notificationVisible = false
  private notificationTimer: ReturnType<typeof setTimeout> | undefined
  private detailsOpen = false
  private detailsPosition = {left: 8, top: 8}

  private showPopoverElement(element: HTMLElement | null) {
    if(typeof element?.showPopover !== "function") return
    try {
      element.showPopover()
    }
    catch {
      // The element may already be open while pointer and focus events overlap.
    }
  }

  private hidePopoverElement(element: HTMLElement | null) {
    if(typeof element?.hidePopover !== "function") return
    try {
      element.hidePopover()
    }
    catch {
      // The element may already be closed during teardown or rerendering.
    }
  }

  private closeSubmenuPopover() {
    this.hidePopoverElement(this.renderRoot.querySelector<HTMLElement>("ribbon-menu"))
    this.submenuOpen = false
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(!this.submenuOpen || event.composedPath().includes(this)) return
    this.closeSubmenuPopover()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(this.submenuOpen && event.key === "Escape") {
      this.closeSubmenuPopover()
    }
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    if(this.notificationTimer !== undefined) clearTimeout(this.notificationTimer)
    super.disconnectedCallback()
  }

  showNotification(message: string, duration = 1800) {
    if(this.notificationTimer !== undefined) clearTimeout(this.notificationTimer)
    this.notification = message
    this.notificationVisible = true
    this.notificationTimer = setTimeout(() => {
      this.notificationVisible = false
      this.notificationTimer = undefined
    }, duration)
  }

  private handleClick() {
    this.closeSubmenuPopover()
    this.dispatchEvent(new CustomEvent<{label: string, keepDrawerOpen?: boolean, openDrawer?: boolean}>("ribbon-button-click", {
      detail: {
        label: this.action || this.label,
        keepDrawerOpen: this.keepDrawerOpen,
        ...(this.openDrawer ? {openDrawer: true} : {}),
      },
      bubbles: true,
      composed: true,
    }))
  }

  private toggleSubmenu() {
    if(this.submenuOpen) {
      this.closeSubmenuPopover()
    }
    else {
      this.submenuOpen = true
      void this.updateComplete.then(async () => {
        const submenu = this.renderRoot.querySelector<HTMLElement>("ribbon-menu")
        if(!submenu) return
        if(submenu instanceof LitElement) await submenu.updateComplete
        this.showPopoverElement(submenu)
        const button = this.getBoundingClientRect()
        const menu = submenu.getBoundingClientRect()
        const margin = 8
        const left = Math.min(
          Math.max(margin, button.left),
          Math.max(margin, window.innerWidth - menu.width - margin),
        )
        const below = button.bottom + 4
        const top = below + menu.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, button.top - menu.height - 4)
        submenu.style.left = `${left}px`
        submenu.style.top = `${top}px`
      })
    }
  }

  private handleSubmenuClick() {
    this.closeSubmenuPopover()
  }

  closeSubmenu() {
    this.closeSubmenuPopover()
  }

  private renderIcon() {
    if(this.variant === "qr") return html`
      <span class="button-icon" aria-hidden="true">
        <webwriter-qr-code .value=${this.qrValue} .size=${56}></webwriter-qr-code>
      </span>
    `
    const icon = this.icon || this.action || this.label
    return html`<span class=${`button-icon${this.iconUrl ? " image-icon" : ""}`} aria-hidden="true">
      ${ribbonIcon(icon)}
      ${this.iconUrl ? html`<img
        src=${this.iconUrl}
        alt=""
        @error=${(event: Event) => {
          const image = event.currentTarget as HTMLImageElement
          image.parentElement?.classList.remove("image-icon")
          image.remove()
        }}
      />` : ""}
    </span>`
  }

  private showDetails = () => {
    if(!this.details) return
    const rect = this.getBoundingClientRect()
    const viewportWidth = Math.max(1, window.innerWidth)
    const width = Math.min(272, Math.max(1, viewportWidth - 16))
    const margin = 8
    const gap = 6
    const buttonRight = Number.isFinite(rect.right) ? rect.right : rect.left + rect.width
    const leftPosition = rect.left - width - gap
    const rightPosition = buttonRight + gap
    const leftSpace = rect.left - margin - gap
    const rightSpace = viewportWidth - buttonRight - margin - gap
    const fitsLeft = leftPosition >= margin
    const fitsRight = rightPosition + width <= viewportWidth - margin
    let left = leftPosition
    if(!fitsLeft && fitsRight) left = rightPosition
    else if(!fitsLeft && !fitsRight && leftSpace < rightSpace) {
      left = rightPosition
    }
    const top = Math.max(8, rect.top)
    this.detailsPosition = {left, top}
    this.detailsOpen = true
    void this.updateComplete.then(() => {
      this.showPopoverElement(this.renderRoot.querySelector<HTMLElement>(".details"))
    })
  }

  private hideDetails = () => {
    this.hidePopoverElement(this.renderRoot.querySelector<HTMLElement>(".details"))
    this.detailsOpen = false
  }

  render() {
    const hasDropdown = this.submenu.length > 0 || this.dropdown !== null
    const title = `${this.label}${this.selectionCount > 0 ? ` +${this.selectionCount}`: ""}${this.shortcut ? ` (${this.shortcut})`: ""}`
    return html`
      <div class=${`button-row${hasDropdown ? " has-submenu" : ""}`} @mouseenter=${this.showDetails} @mouseleave=${this.hideDetails}>
        <button
          class="main-button"
          type="button"
          aria-label=${this.label}
          aria-pressed=${this.toggle? String(this.active): nothing}
          title=${title}
          ?disabled=${this.disabled}
          @focus=${this.showDetails}
          @blur=${this.hideDetails}
          @click=${this.handleClick}
        >
          ${this.renderIcon()}
          <span class="button-label">
            <span class="button-label-text">${this.label}</span>
            ${this.selectionCount > 0 ? html`<small class="selection-count">+${this.selectionCount}</small>`: ""}
          </span>
        </button>
        ${this.corner === "close" ? html`
          <button
            class="submenu-toggle"
            type="button"
            aria-label=${this.cornerLabel || `Manage ${this.label}`}
            title=${this.cornerLabel || `Manage ${this.label}`}
            ?disabled=${this.disabled}
            @click=${this.handleClick}
          >
            <span class="button-icon corner-icon" aria-hidden="true">${ribbonIcon("Reject")}</span>
          </button>
        ` : hasDropdown ? html`
          <button
            class="submenu-toggle submenu-trigger"
            type="button"
            aria-label=${`Show more ${this.label} options`}
            title=${`Show more ${this.label} options`}
            aria-haspopup=${this.dropdown !== null ? "dialog" : "menu"}
            aria-expanded=${this.submenuOpen}
            @click=${this.toggleSubmenu}
          >
            <span class="submenu-chevron" aria-hidden="true"></span>
          </button>
        ` : ""}
        ${this.notification ? html`
          <span
            class=${`button-notification${this.notificationVisible ? " visible" : ""}`}
            role="status"
            aria-live="polite"
            aria-hidden=${this.notificationVisible ? "false" : "true"}
          >${this.notification}</span>
        ` : nothing}
      </div>
      ${this.corner !== "close" && hasDropdown ? html`
        <ribbon-menu
          variant="button"
          popover="manual"
          .groups=${this.dropdown === null ? [{label: `${this.label} options`, buttons: this.submenu}] : []}
          .customContent=${this.dropdown !== null}
          .label=${`${this.label} options`}
          ?hidden=${!this.submenuOpen}
          @ribbon-button-click=${this.handleSubmenuClick}
        >
          ${this.dropdown !== null ? html`
            <div class="button-dropdown-content">${this.dropdown}</div>
          ` : ""}
        </ribbon-menu>
      ` : ""}
      ${this.details ? html`
        <aside
          class="details"
          role="tooltip"
          popover="manual"
          style=${`left:${this.detailsPosition.left}px;top:${this.detailsPosition.top}px`}
        >
          <h3>${this.details.heading}</h3>
          ${this.details.subheading ? html`<div class="details-subheading">${this.details.subheading}</div>` : ""}
          ${this.details.authors?.length ? html`
            <div class="details-authors" title=${this.details.authors.join(", ")}>By ${this.details.authors.join(", ")}</div>
          ` : ""}
          ${this.details.description ? html`<p class="details-description">${this.details.description}</p>` : ""}
          ${this.details.fields?.length ? html`<dl>${this.details.fields.map(field => html`<dt>${field.label}</dt><dd>${field.value}</dd>`)}</dl>` : ""}
          ${this.details.keywords?.length ? html`
            <div class="details-keywords">
              ${this.details.keywords.map(keyword => html`
                <span class="details-keyword">
                  ${keyword.icon ? html`<span class="details-keyword-icon" aria-hidden="true">${ribbonIcon(keyword.icon)}</span>` : ""}
                  <span>${keyword.label}</span>
                </span>
              `)}
            </div>
          ` : ""}
        </aside>
      ` : ""}
    `
  }
}

if(!customElements.get("ribbon-button")) {
  customElements.define("ribbon-button", RibbonButton)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-button": RibbonButton
  }
}
