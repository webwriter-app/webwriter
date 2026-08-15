import { LitElement, css, html } from "lit"
import "./file-label"

/** A selectable top-level tab in the editor ribbon. */
export class RibbonTab extends LitElement {
  static properties = {
    active: {type: Boolean, reflect: true},
    label: {type: String},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 1 auto;
      position: relative;
      min-width: 0;
      transform: translateY(1px);
    }

    :host([label="File"][active])::before,
    :host([label="File"][active])::after,
    :host([label="File"]:hover)::before,
    :host([label="File"]:hover)::after {
      content: "";
      position: absolute;
      left: calc(50% - 0.575rem);
      bottom: -1px;
      width: 0;
      height: 0;
      pointer-events: none;
      transform: translateX(-50%);
    }

    :host([label="File"][active])::before {
      border-right: 8px solid transparent;
      border-bottom: 8px solid var(--ribbon-area-border, #d8dee6);
      border-left: 8px solid transparent;
    }

    :host([label="File"][active])::after {
      z-index: 1;
      border-right: 7px solid transparent;
      border-bottom: 7px solid var(--ribbon-area-background, #f2f2f2);
      border-left: 7px solid transparent;
    }

    :host([label="File"]:hover)::before {
      border-right: 8px solid transparent;
      border-bottom: 8px solid #e8eef5;
      border-left: 8px solid transparent;
    }

    :host([label="File"]:hover)::after {
      z-index: 1;
      border-right: 7px solid transparent;
      border-bottom: 7px solid var(--ribbon-area-background, #f2f2f2);
      border-left: 7px solid transparent;
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

    button:hover {
      color: #243447;
      background: #e8eef5;
    }

    :host([label="File"]) button:hover {
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

    :host([active]:not([label="File"])) button {
      color: #1e4f87;
      background: var(--ribbon-active-tab-background, #f2f2f2);
      border: 1px solid var(--ribbon-active-tab-border, #d8dee6);
      border-bottom: 0;
    }

    :host([active]:not([label="File"])) {
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
  fileName = ""
  fileDirty = false

  private select() {
    this.dispatchEvent(new CustomEvent("ribbon-tab-select", {
      bubbles: true,
      composed: true,
      detail: {label: this.label},
    }))
  }

  private saveFile(event: Event) {
    event.stopPropagation()
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: "Save"},
      bubbles: true,
      composed: true,
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
        role="tab"
        aria-selected=${this.active}
        @pointerdown=${this.handleFilePointer}
        @mousedown=${this.handleFilePointer}
        @click=${this.select}
      >${isFileTab ? html`
        <file-label
          .fileName=${this.fileName}
          .fileDirty=${this.fileDirty}
          @file-save=${this.saveFile}
        ></file-label>
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
