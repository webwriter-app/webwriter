import { LitElement, css, html } from "lit"
import { ribbonIcon } from "./ribbon-icons"
import "./ribbon-menu"
import type { RibbonMenu } from "./ribbon-menu"

/** A compact action used inside a ribbon group. */
export class RibbonButton extends LitElement {
  static properties = {
    label: {type: String},
    action: {type: String},
    submenu: {attribute: false},
    submenuOpen: {state: true},
  }

  static styles = css`
    :host {
      display: block;
      flex: 1 1 3rem;
      min-width: 3rem;
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

    .button-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .button-label {
      line-height: 0.8rem;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

  `

  label = "Placeholder"
  action = ""
  submenu: string[] = []
  private submenuOpen = false

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(!this.submenuOpen || event.composedPath().includes(this)) return
    this.submenuOpen = false
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(this.submenuOpen && event.key === "Escape") {
      this.submenuOpen = false
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
    this.submenuOpen = false
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: this.action || this.label},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleSubmenu() {
    this.submenuOpen = !this.submenuOpen
    if(this.submenuOpen) {
      void this.updateComplete.then(async () => {
        const submenu = this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")
        if(!submenu) return
        await submenu.updateComplete
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
    this.submenuOpen = false
  }

  closeSubmenu() {
    this.submenuOpen = false
  }

  render() {
    return html`
      <div class="button-row">
        <button
          class="main-button"
          type="button"
          aria-label=${this.label}
          title=${this.label}
          @click=${this.handleClick}
        >
          <span class="button-icon" aria-hidden="true">${ribbonIcon(this.action || this.label)}</span>
          <span class="button-label">${this.label}</span>
        </button>
        ${this.submenu.length ? html`
          <button
            class="submenu-toggle"
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
      ${this.submenu.length ? html`
        <ribbon-menu
          variant="button"
          .groups=${[{label: `${this.label} options`, buttons: this.submenu}]}
          ?hidden=${!this.submenuOpen}
          @ribbon-button-click=${this.handleSubmenuClick}
        ></ribbon-menu>
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
