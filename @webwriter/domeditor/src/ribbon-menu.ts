import { LitElement, css, html } from "lit"
import { ribbonIcon } from "./ribbon-icons"

export type RibbonMenuGroup = {
  label: string
  buttons: string[]
}

/** A dropdown view of the commands in a collapsed ribbon menu. */
export class RibbonMenu extends LitElement {
  static properties = {
    groups: {attribute: false},
  }

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

    .item:hover {
      background: #eef4fb;
    }

    .item:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .item-icon {
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
  `

  groups: RibbonMenuGroup[] = []

  private handleClick(label: string) {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label},
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    return html`
      <div class="menu" role="menu">
        ${this.groups.map(group => html`
          <section aria-label=${group.label}>
            ${group.buttons.map(button => html`
              <button
                class="item"
                type="button"
                role="menuitem"
                title=${button}
                @click=${() => this.handleClick(button)}
              >
                <span class="item-icon" aria-hidden="true">${ribbonIcon(button)}</span>
                <span>${button}</span>
              </button>
            `)}
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
