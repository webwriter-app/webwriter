import {LitElement, css, html} from "lit"

/** A compact, interactive document label used by the File ribbon tab. */
export class FileLabel extends LitElement {
  static properties = {
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }

    .file-label {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0;
      min-width: 0;
      max-width: 100%;
      color: var(--file-label-color, #2f3742);
      line-height: 1;
      white-space: nowrap;
    }

    .file-name {
      min-width: 0;
      max-width: 13rem;
      overflow: hidden;
      font-size: 0.74rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dirty-button {
      box-sizing: border-box;
      display: inline-grid;
      flex: 0 0 1.15rem;
      place-items: center;
      width: 1.15rem;
      height: 1.4rem;
      margin: 0;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
    }

    .dirty-button:hover {
      border-color: #c8d2df;
      color: #243447;
      background: #eef4fb;
    }

    .dirty-button:active {
      color: #1e4f87;
      background: #c4dcf4;
    }

    .dirty-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }
  `

  fileName = ""
  fileDirty = false

  private stopLabelPointer = (event: Event) => {
    event.stopPropagation()
  }

  private save = (event: Event) => {
    event.stopPropagation()
    this.dispatchEvent(new Event("file-save", {bubbles: true, composed: true}))
  }

  render() {
    const name = this.fileName || "Unnamed File"
    return html`
      <span
        class="file-label"
        aria-label=${`${name}${this.fileDirty ? " (unsaved changes)" : ""}`}
        @pointerdown=${this.stopLabelPointer}
        @mousedown=${this.stopLabelPointer}
      >
        <strong class="file-name" title=${name}>${name}</strong>
        <button
          class="dirty-button"
          type="button"
          aria-label="Save file"
          title="Save file"
          style=${`visibility: ${this.fileDirty ? "visible" : "hidden"}`}
          @click=${this.save}
        >*</button>
      </span>
    `
  }
}

if(!customElements.get("file-label")) {
  customElements.define("file-label", FileLabel)
}

declare global {
  interface HTMLElementTagNameMap {
    "file-label": FileLabel
  }
}
