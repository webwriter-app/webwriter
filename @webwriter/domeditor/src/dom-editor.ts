import { LitElement, css, html } from "lit"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`

/** The iframe-backed editor element. The iframe gets its own document and
 * runs the editor module there, keeping editor styles, selection and DOM
 * mutations isolated from the host document. */
export class DomEditor extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `

  private get editorSrcdoc() {
    return `<script type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
  }

  render() {
    return html`<iframe title="DOM editor" srcdoc=${this.editorSrcdoc}></iframe>`
  }
}

if(!customElements.get("dom-editor")) {
  customElements.define("dom-editor", DomEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "dom-editor": DomEditor
  }
}
