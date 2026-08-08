import { LitElement, css, html } from "lit"

/** A selectable top-level tab in the editor ribbon. */
export class RibbonTab extends LitElement {
  static properties = {
    active: {type: Boolean, reflect: true},
    label: {type: String},
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 0 auto;
      transform: translateY(1px);
    }

    button {
      box-sizing: border-box;
      height: 40px;
      padding: 0.35rem 0.85rem;
      border: 1px solid transparent;
      border-bottom: 0;
      border-radius: 0.45rem 0.45rem 0 0;
      color: #5e6977;
      background: transparent;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }

    button:hover {
      color: #243447;
      background: #e8eef5;
    }

    :host([active]) button {
      color: #1e4f87;
      background: var(--ribbon-active-tab-background, #f2f2f2);
      border: 1px solid var(--ribbon-active-tab-border, #d8dee6);
      border-bottom: 0;
    }

    :host([active]) {
      position: relative;
      z-index: 1;
    }

    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }
  `

  active = false
  label = "Tab"

  private select() {
    this.dispatchEvent(new CustomEvent("ribbon-tab-select", {
      bubbles: true,
      composed: true,
      detail: {label: this.label},
    }))
  }

  render() {
    return html`
      <button
        type="button"
        role="tab"
        aria-selected=${this.active}
        @click=${this.select}
      >${this.label}</button>
    `
  }
}

if(!customElements.get("ribbon-tab")) {
  customElements.define("ribbon-tab", RibbonTab)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-tab": RibbonTab
  }
}
