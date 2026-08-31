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
      width: fit-content;
      min-width: 0;
      max-width: 500px;
    }

    .file-label {
      box-sizing: border-box;
      display: flex;
      position: relative;
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
      max-width: 500px;
      overflow: hidden;
      font-size: 0.74rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dirty-indicator {
      flex: 0 0 auto;
      align-self: flex-start;
      width: 0.55rem;
      margin-top: -0.16rem;
      color: #526b86;
      font-size: 0.82rem;
      font-weight: 700;
      line-height: 1;
    }
  `

  fileName = ""
  fileDirty = false

  private stopLabelPointer = (event: Event) => {
    event.stopPropagation()
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
        <span
          class="dirty-indicator"
          aria-hidden="true"
          style=${`visibility: ${this.fileDirty ? "visible" : "hidden"}`}
        >*</span>
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
