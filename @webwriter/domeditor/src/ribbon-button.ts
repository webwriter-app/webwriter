import { LitElement, css, html } from "lit"
import { ribbonIcon } from "./ribbon-icons"

/** A compact action used inside a ribbon group. */
export class RibbonButton extends LitElement {
  static properties = {
    label: {type: String},
  }

  static styles = css`
    :host {
      display: block;
      flex: 1 1 3rem;
      min-width: 3rem;
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
      border: 1px solid transparent;
      border-radius: 0.35rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.6rem;
      cursor: pointer;
    }

    button:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
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

  private handleClick() {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: this.label},
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    return html`
      <button
        type="button"
        aria-label=${this.label}
        title=${this.label}
        @click=${this.handleClick}
      >
        <span class="button-icon" aria-hidden="true">${ribbonIcon(this.label)}</span>
        <span class="button-label">${this.label}</span>
      </button>
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
