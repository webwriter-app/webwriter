import { LitElement, css, html, nothing } from "lit"
import "./file-label"

/** A selectable top-level tab in the editor ribbon. */
export class RibbonTab extends LitElement {
  static properties = {
    active: {type: Boolean, reflect: true},
    label: {type: String},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    ribbonCollapsed: {type: Boolean, attribute: "ribbon-collapsed", reflect: true},
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 1 auto;
      position: relative;
      min-width: 0;
      transform: translateY(1px);
    }

    :host([label="File"]) {
      width: fit-content;
      min-width: calc(100px + 1.7rem);
      max-width: 500px;
      --ribbon-active-tab-background: #ffffff;
      --ribbon-active-tab-border: #a8a8a8;
    }

    .file-chevron {
      flex: 0 0 auto;
      width: 0.3rem;
      height: 0.3rem;
      margin: 0 0.5rem 0.15rem 0.25rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg);
      transition: transform 120ms ease;
    }

    :host([active]) .file-chevron {
      transform: rotate(225deg);
    }

    button {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      height: 40px;
      padding: 0.35rem 0;
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

    button::before,
    button::after {
      content: "";
      flex: 1 1 0.85rem;
      width: 0.85rem;
      max-width: 0.85rem;
    }

    :host([label="File"]) button::before,
    :host([label="File"]) button::after {
      flex-basis: 0;
      width: 0;
      max-width: 0;
    }

    :host([label="File"]) button {
      padding-left: 0.5rem;
    }

    button:hover {
      color: #243447;
      background: #e8eef5;
    }

    :host([label="File"]:not([active])) button:hover {
      background: transparent;
    }

    :host([label="File"][active]) button,
    :host([label="File"]:hover) button {
      color: #1e4f87;
    }

    :host([label="File"][active]) file-label,
    :host([label="File"]:hover) file-label {
      --file-label-color: #1e4f87;
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

    :host([label="File"]) button:focus {
      outline: none;
    }

    :host(:not([label="File"])) button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }
  `

  active = false
  label = "Tab"
  fileName = ""
  fileDirty = false
  ribbonCollapsed = false

  private select() {
    this.dispatchEvent(new CustomEvent("ribbon-tab-select", {
      bubbles: true,
      composed: true,
      detail: {label: this.label},
    }))
  }

  private handleFilePointer = (event: Event) => {
    if(this.label === "File") event.stopPropagation()
  }

  render() {
    const isFileTab = this.label === "File"
    return html`
      <button
        type="button"
        role=${isFileTab ? "button" : "tab"}
        aria-selected=${isFileTab ? nothing : this.active}
        aria-haspopup=${isFileTab ? "menu" : nothing}
        aria-expanded=${isFileTab ? this.active : nothing}
        @pointerdown=${this.handleFilePointer}
        @mousedown=${this.handleFilePointer}
        @click=${this.select}
      >${isFileTab ? html`
        <file-label
          .fileName=${this.fileName}
          .fileDirty=${this.fileDirty}
        ></file-label>
        <span class="file-chevron" aria-hidden="true"></span>
      ` : this.label}</button>
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
