import { LitElement, css, html } from "lit"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const appIconUrl = `${import.meta.env.BASE_URL}assets/app-icon-transparent.svg`

/** The iframe-backed editor element. The iframe gets its own document and
 * runs the editor module there, keeping editor styles, selection and DOM
 * mutations isolated from the host document. */
export class DomEditor extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .app-bar {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      width: 100%;
      height: 2rem;
      padding: 0.25rem 0.5rem;
      border-bottom: 0.5px solid #a8a8a8;
      background: #f2f2f2;
    }

    .app-logo {
      display: block;
      height: 1.5rem;
      width: auto;
    }

    iframe {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      border: 0;
    }
  `

  private get editorSrcdoc() {
    return `<script type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
  }

  render() {
    return html`
      <header class="app-bar">
        <img class="app-logo" src=${appIconUrl} alt="WebWriter" />
      </header>
      <iframe title="DOM editor" srcdoc=${this.editorSrcdoc}></iframe>
    `
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
