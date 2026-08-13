import {LitElement, css, html, nothing} from "lit"
import { ribbonIcon } from "../ribbon-icons"
import type {PackageKeywordPresentation} from "../package-keywords"
import "./ribbon-menu"
import type { RibbonMenu, RibbonMenuButton } from "./ribbon-menu"

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
    shortcut: {type: String},
    submenu: {attribute: false},
    submenuOpen: {state: true},
    corner: {type: String},
    cornerLabel: {type: String, attribute: "corner-label"},
    keepDrawerOpen: {type: Boolean, attribute: "keep-drawer-open"},
    openDrawer: {type: Boolean, attribute: "open-drawer"},
    management: {type: Boolean, reflect: true},
    muted: {type: Boolean, reflect: true},
    details: {attribute: false},
    detailsOpen: {type: Boolean, attribute: "details-open", reflect: true},
    toggle: {type: Boolean, reflect: true},
    variant: {type: String, reflect: true},
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
      line-height: 0.8rem;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
  shortcut = ""
  submenu: RibbonMenuButton[] = []
  corner = ""
  cornerLabel = ""
  keepDrawerOpen = false
  openDrawer = false
  management = false
  muted = false
  details: RibbonButtonDetails | null = null
  toggle = false
  variant = "default"
  private submenuOpen = false
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
    this.hidePopoverElement(this.renderRoot.querySelector<RibbonMenu>("ribbon-menu"))
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
    super.disconnectedCallback()
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
        const submenu = this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")
        if(!submenu) return
        await submenu.updateComplete
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
    const width = Math.min(272, window.innerWidth - 16)
    const left = Math.max(8, rect.left - width - 6)
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
    const title = this.shortcut? `${this.label} (${this.shortcut})`: this.label
    return html`
      <div class=${`button-row${this.submenu.length ? " has-submenu" : ""}`} @mouseenter=${this.showDetails} @mouseleave=${this.hideDetails}>
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
          <span class="button-label">${this.label}</span>
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
        ` : this.submenu.length ? html`
          <button
            class="submenu-toggle submenu-trigger"
            type="button"
            aria-label=${`Show more ${this.label} options`}
            title=${`Show more ${this.label} options`}
            aria-haspopup="menu"
            aria-expanded=${this.submenuOpen}
            @click=${this.toggleSubmenu}
          >
            <span class="submenu-chevron" aria-hidden="true"></span>
          </button>
        ` : ""}
      </div>
      ${this.corner !== "close" && this.submenu.length ? html`
        <ribbon-menu
          variant="button"
          popover="manual"
          .groups=${[{label: `${this.label} options`, buttons: this.submenu}]}
          ?hidden=${!this.submenuOpen}
          @ribbon-button-click=${this.handleSubmenuClick}
        ></ribbon-menu>
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
