import { LitElement, css, html } from "lit"
import { ribbonIcon } from "../ribbon-icons"

export type RibbonMenuGroup = {
  label: string
  buttons: RibbonMenuButton[]
}

export type RibbonMenuButton = string | {
  label: string
  action?: string
  icon?: string
  iconUrl?: string
  submenu?: RibbonMenuButton[]
}

/** A dropdown view of the commands in a collapsed ribbon menu. */
export class RibbonMenu extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      top: 39px;
      left: 0;
      z-index: 0;
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
    }

    :host([variant="button"]) .menu {
      border-radius: 0.35rem;
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
      transition: transform 120ms ease;
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
  `

  groups: RibbonMenuGroup[] = []
  variant = "ribbon"
  private openSubmenu: string | null = null

  static properties = {
    groups: {attribute: false},
    variant: {type: String, reflect: true},
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

  private handleIconError(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    image.parentElement?.classList.remove("image-icon")
    image.remove()
  }

  private renderButtonIcon(button: RibbonMenuButton) {
    const iconUrl = this.buttonIconUrl(button)
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
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleSubmenu(label: string, event: Event) {
    event.stopPropagation()
    this.openSubmenu = this.openSubmenu === label ? null : label
  }

  closeSubmenus() {
    this.openSubmenu = null
  }

  render() {
    return html`
      <div class="menu" role="menu">
        ${this.groups.map((group, groupIndex) => html`
          <section aria-label=${group.label}>
            ${group.buttons.map((button, buttonIndex) => {
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
                      class="submenu"
                      role="menu"
                      aria-label=${`${label} options`}
                      style=${`position-anchor: ${anchorName}`}
                    >
                      ${submenu.map(submenuButton => html`
                        <button
                          class="item"
                          type="button"
                          role="menuitem"
                          title=${this.buttonLabel(submenuButton)}
                          @click=${() => this.handleClick(submenuButton)}
                        >
                          ${this.renderButtonIcon(submenuButton)}
                          <span>${this.buttonLabel(submenuButton)}</span>
                        </button>
                      `)}
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
