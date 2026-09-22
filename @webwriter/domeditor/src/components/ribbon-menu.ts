import {LitElement, css, html, nothing} from "lit"
import { ribbonIcon } from "../ribbon-icons"

export type RibbonMenuGroup = {
  label: string
  buttons: RibbonMenuButton[]
}

export type RibbonMenuButton = string | {
  label: string
  action?: string
  icon?: string
  iconText?: string
  iconUrl?: string
  /** Optional metadata used by visual galleries such as graphic shapes. */
  galleryColumns?: number
  category?: string
  path?: string
  submenu?: RibbonMenuButton[]
}

/** A dropdown view of the commands in a collapsed ribbon menu. */
export class RibbonMenu extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      top: 39px;
      left: 0;
      z-index: 4;
      display: block;
      width: 200px;
      max-width: calc(100% - 1rem);
    }

    :host([hidden]) {
      display: none;
    }

    :host([variant="button"]) {
      position: fixed;
      top: auto;
      left: auto;
      z-index: 2147483647;
      max-width: min(200px, calc(100vw - 1rem));
      margin: 0;
      padding: 0;
      border: 0;
      color: inherit;
      background: transparent;
      /* Let the menu's shadow extend beyond the native popover bounds. */
      overflow: visible;
    }

    :host([variant="button"][gallery]) {
      width: min(32rem, calc(100vw - 1rem));
      max-width: calc(100vw - 1rem);
    }

    :host([variant="button"][custom-content]) {
      width: min(19rem, calc(100vw - 1rem));
      max-width: calc(100vw - 1rem);
    }

    :host([variant="button"]) .menu {
      border-radius: var(--ribbon-menu-border-radius, 0.35rem);
    }

    :host([custom-content]) .menu {
      box-sizing: border-box;
      padding: 0.45rem;
    }

    :host([no-scroll]) .menu {
      max-height: none;
      overflow: hidden;
      scrollbar-width: none;
    }

    ::slotted(.button-dropdown-content) {
      display: block;
    }

    .menu {
      max-height: min(24rem, calc(100vh - 3rem));
      overflow: auto;
      scrollbar-width: thin;
      padding: 0.35rem;
      border: 1px solid #a8a8a8;
      border-radius: 0 0.35rem 0.35rem 0.35rem;
      background: #ffffff;
      box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 16%);
    }

    section + section {
      margin-top: 0.25rem;
      padding-top: 0.25rem;
      border-top: 1px solid #d8dee6;
    }

    .item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.35rem 0.45rem;
      border: 0;
      border-radius: 0.25rem;
      color: #2f3742;
      text-align: left;
      font: inherit;
      font-size: 0.75rem;
      background: transparent;
      cursor: pointer;
    }

    .item-row {
      display: flex;
      align-items: stretch;
    }

    .item-row > .item {
      flex: 1 1 auto;
    }

    .item-container {
      position: relative;
    }

    .submenu-toggle {
      display: grid;
      flex: 0 0 1.5rem;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .submenu-toggle:hover {
      background: #eef4fb;
    }

    .submenu-toggle:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .submenu-toggle-chevron {
      display: block;
      width: 0.35rem;
      height: 0.35rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg);
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .submenu-toggle[aria-expanded="true"] .submenu-toggle-chevron {
      transform: rotate(225deg);
    }

    .submenu {
      position: absolute;
      top: calc(100% + 0.25rem);
      left: 0;
      z-index: 1;
      box-sizing: border-box;
      width: 200px;
      max-width: calc(100vw - 1rem);
      max-height: min(24rem, calc(100vh - 1rem));
      overflow: auto;
      padding: 0.35rem;
      border: 1px solid #a8a8a8;
      border-radius: 0.35rem;
      background: #ffffff;
      box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 16%);
    }

    .submenu .item {
      padding-left: 0.45rem;
    }

    @supports (top: anchor(top)) and (left: anchor(right)) {
      .submenu {
        position: fixed;
        top: anchor(top);
        left: anchor(right);
        margin-left: 0.25rem;
        position-try-fallbacks: flip-inline, bottom span-left;
      }
    }

    .item:hover {
      background: #eef4fb;
    }

    .item:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .item-icon {
      position: relative;
      display: block;
      flex: 0 0 1rem;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .item-icon.text-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-basis: 1.5rem;
      width: 1.5rem;
      white-space: nowrap;
    }

    .item-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .item-icon.image-icon svg {
      visibility: hidden;
    }

    .item-icon img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    :host([gallery]) .menu {
      max-height: min(40rem, calc(100vh - 10rem));
    }

    .shape-gallery {
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 0.2rem;
      width: 100%;
      box-sizing: border-box;
    }

    .shape-gallery .gallery-divider {
      grid-column: 1 / -1;
      height: 0;
      margin: 0.25rem 0 0.1rem;
      border-top: 1px solid #d8dee6;
    }

    .shape-gallery .item {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.2rem;
      min-width: 0;
      padding: 0.35rem 0.2rem;
      text-align: center;
    }

    .shape-gallery .gallery-wide {
      grid-column: -4 / -1;
      border: 1px solid #d8dee6;
      border-radius: 0.35rem;
      flex-direction: row;
      align-items: center;
      justify-content: center;
    }

    .shape-gallery .item.gallery-wide > span:last-child {
      display: inline;
    }

    .shape-gallery .item.gallery-wide .item-icon {
      flex-basis: 1rem;
      width: 1rem;
      height: 1rem;
      margin-inline: 0;
    }

    .shape-gallery .item-icon {
      flex-basis: 2.1rem;
      width: 2.1rem;
      height: 2.1rem;
      margin-inline: auto;
    }

    .shape-gallery .item > span:last-child {
      display: none;
    }
  `

  groups: RibbonMenuGroup[] = []
  variant = "ribbon"
  customContent = false
  noScroll = false
  gallery = false
  label = ""
  private openSubmenu: string | null = null
  private openSubmenuToggle: HTMLButtonElement | null = null

  static properties = {
    groups: {attribute: false},
    variant: {type: String, reflect: true},
    customContent: {type: Boolean, attribute: "custom-content", reflect: true},
    noScroll: {type: Boolean, attribute: "no-scroll", reflect: true},
    label: {type: String},
    gallery: {type: Boolean, reflect: true},
    openSubmenu: {state: true},
  }

  private buttonLabel(button: RibbonMenuButton) {
    return typeof button === "string" ? button : button.label
  }

  private buttonSubmenu(button: RibbonMenuButton) {
    return typeof button === "string" ? [] : button.submenu ?? []
  }

  private buttonAction(button: RibbonMenuButton) {
    return typeof button === "string" ? button : button.action ?? button.label
  }

  private buttonIcon(button: RibbonMenuButton) {
    return typeof button === "string" ? this.buttonAction(button) : button.icon ?? this.buttonAction(button)
  }

  private buttonIconUrl(button: RibbonMenuButton) {
    return typeof button === "string" ? "" : button.iconUrl ?? ""
  }

  private buttonCategory(button: RibbonMenuButton) {
    return typeof button === "string" ? "" : button.category ?? ""
  }

  private buttonPath(button: RibbonMenuButton) {
    return typeof button === "string" ? "" : button.path ?? ""
  }

  private handleIconError(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    image.parentElement?.classList.remove("image-icon")
    image.remove()
  }

  private renderButtonIcon(button: RibbonMenuButton) {
    const path = this.buttonPath(button)
    if(path) return html`
      <span class="item-icon shape-preview" aria-hidden="true">
        <svg viewBox="-10 -10 120 120" focusable="false" aria-hidden="true">
          <path d=${path} fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
    `
    const iconUrl = this.buttonIconUrl(button)
    const iconText = typeof button === "string" ? undefined : button.iconText
    if(iconText !== undefined) {
      return html`<span class="item-icon text-icon" aria-hidden="true">${iconText}</span>`
    }
    return html`
      <span class=${`item-icon${iconUrl ? " image-icon" : ""}`} aria-hidden="true">
        ${ribbonIcon(this.buttonIcon(button))}
        ${iconUrl ? html`<img src=${iconUrl} alt="" @error=${this.handleIconError} />` : ""}
      </span>
    `
  }

  private handleClick(button: RibbonMenuButton) {
    const label = this.buttonAction(button)
    this.openSubmenu = null
    this.openSubmenuToggle = null
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleSubmenu(label: string, event: Event) {
    event.stopPropagation()
    const toggle = event.currentTarget as HTMLButtonElement
    if(this.openSubmenu === label) {
      this.openSubmenu = null
      this.openSubmenuToggle = null
      return
    }
    this.openSubmenu = label
    this.openSubmenuToggle = toggle
    if(this.openSubmenu === label) {
      void this.updateComplete.then(() => {
        const submenu = Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".submenu"))
          .find(candidate => candidate.getAttribute("aria-label") === `${label} options`)
        if(submenu) this.menuItems(submenu)[0]?.focus()
      })
    }
  }

  private menuItems(menu: HTMLElement) {
    return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .filter(item => item.closest('[role="menu"]') === menu && !item.disabled)
  }

  private handleMenuKeydown(event: KeyboardEvent) {
    // Nested menus handle their own key event first. Do not let the same
    // Arrow key run again when it bubbles into the parent menu.
    if(event.defaultPrevented) return
    if(event.key === "Escape") {
      const menu = event.currentTarget as HTMLElement
      if(!menu.classList.contains("submenu")) return
      event.preventDefault()
      event.stopPropagation()
      this.openSubmenu = null
      const toggle = this.openSubmenuToggle
      this.openSubmenuToggle = null
      void this.updateComplete.then(() => toggle?.focus())
      return
    }
    if(!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    const menu = event.currentTarget as HTMLElement
    const items = this.menuItems(menu)
    if(!items.length) return
    event.preventDefault()
    if(menu.classList.contains("submenu")) event.stopPropagation()
    const current = items.indexOf(event.target as HTMLButtonElement)
    const index = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (current + 1 + items.length) % items.length
          : (current - 1 + items.length) % items.length
    items[index].focus()
  }

  private renderSubmenu(submenu: RibbonMenuButton[]) {
    const gallery = submenu.some(candidate => Boolean(this.buttonPath(candidate) || this.buttonCategory(candidate)))
    const ordered = gallery
      ? [...new Set(submenu.map(candidate => this.buttonCategory(candidate)).filter(Boolean))]
        .flatMap(category => submenu.filter(candidate => this.buttonCategory(candidate) === category))
      : submenu
    let category = ""
    let itemIndex = 0
    return html`
      ${ordered.map((submenuButton, submenuIndex) => {
          const nextCategory = this.buttonCategory(submenuButton)
          const divider = gallery && itemIndex > 0 && nextCategory && nextCategory !== category
            ? html`<div class="gallery-divider" role="separator"></div>`
            : nothing
          category = nextCategory || category
          itemIndex++
          return html`${divider}
            <button
              class=${`item${gallery ? " gallery-item" : ""}${typeof submenuButton !== "string" && submenuButton.galleryColumns === 3 ? " gallery-wide" : ""}`}
              type="button"
              role="menuitem"
              aria-label=${this.buttonLabel(submenuButton)}
              tabindex=${submenuIndex === 0 ? "0" : "-1"}
              title=${this.buttonLabel(submenuButton)}
              @click=${() => this.handleClick(submenuButton)}>
              ${this.renderButtonIcon(submenuButton)}
              <span>${this.buttonLabel(submenuButton)}</span>
            </button>`
        })}
    `
  }

  closeSubmenus() {
    this.openSubmenu = null
    this.openSubmenuToggle = null
  }

  render() {
    this.gallery = this.groups.some(group => group.buttons.some(button =>
      Boolean(this.buttonCategory(button)) || this.buttonSubmenu(button).some(candidate => Boolean(this.buttonPath(candidate) || this.buttonCategory(candidate))),
    ))
    return html`
      <div
        class="menu"
        role=${this.customContent ? "dialog" : "menu"}
        aria-label=${this.label || nothing}
        @keydown=${this.customContent ? nothing : this.handleMenuKeydown}
      >
        ${this.customContent ? html`<slot></slot>` : ""}
        ${this.groups.map((group, groupIndex) => html`
          <section aria-label=${group.label} class=${group.buttons.some(button => this.buttonCategory(button)) ? "shape-gallery" : ""}>
            ${group.buttons.some(button => this.buttonCategory(button)) ? this.renderSubmenu(group.buttons) : group.buttons.map((button, buttonIndex) => {
              const label = this.buttonLabel(button)
              const submenu = this.buttonSubmenu(button)
              const hasSubmenu = submenu.length > 0
              const isOpen = this.openSubmenu === label
              const anchorName = `--ribbon-submenu-${groupIndex}-${buttonIndex}`
              return html`
                <div class="item-container">
                  <div class="item-row" style=${hasSubmenu ? `anchor-name: ${anchorName}` : ""}>
                    <button
                      class="item"
                      type="button"
                      role="menuitem"
                      tabindex=${groupIndex === 0 && buttonIndex === 0 ? "0" : "-1"}
                      title=${label}
                      @click=${() => this.handleClick(button)}
                    >
                      ${this.renderButtonIcon(button)}
                      <span>${label}</span>
                    </button>
                    ${hasSubmenu ? html`
                      <button
                        class="submenu-toggle"
                        type="button"
                        role="menuitem"
                        tabindex="-1"
                        aria-label=${`Show more ${label} options`}
                        title=${`Show more ${label} options`}
                        aria-haspopup="menu"
                        aria-expanded=${isOpen}
                        @click=${(event: Event) => this.toggleSubmenu(label, event)}
                      >
                        <span class="submenu-toggle-chevron" aria-hidden="true"></span>
                      </button>
                    ` : ""}
                  </div>
                  ${hasSubmenu && isOpen ? html`
                    <div
                      class=${`submenu${submenu.some(candidate => Boolean(this.buttonPath(candidate) || this.buttonCategory(candidate))) ? " shape-gallery" : ""}`}
                      role="menu"
                      aria-label=${`${label} options`}
                      style=${`position-anchor: ${anchorName}`}
                      @keydown=${this.handleMenuKeydown}
                    >
                      ${this.renderSubmenu(submenu)}
                    </div>
                  ` : ""}
                </div>
              `
            })}
          </section>
        `)}
      </div>
    `
  }
}

if(!customElements.get("ribbon-menu")) {
  customElements.define("ribbon-menu", RibbonMenu)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-menu": RibbonMenu
  }
}
