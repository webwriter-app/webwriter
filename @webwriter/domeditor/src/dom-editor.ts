import { LitElement, css, html } from "lit"
import type { AppRibbon } from "./ribbon"
import "./ribbon"

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
  private editorDocument: Document | null = null

  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      border: 0.5px solid #a8a8a8;
    }

    .app-bar {
      flex: 0 0 auto;
      width: 100%;
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

  private handleEditorFrameLoad = (event: Event) => {
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument = (event.currentTarget as HTMLIFrameElement).contentDocument
    this.editorDocument?.addEventListener("pointerdown", this.handleEditorPointerDown)
  }

  private handleEditorPointerDown = () => {
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  disconnectedCallback() {
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument = null
    super.disconnectedCallback()
  }

  render() {
    return html`
      <header class="app-bar">
        <app-ribbon logo-url=${appIconUrl}></app-ribbon>
      </header>
      <iframe title="DOM editor" srcdoc=${this.editorSrcdoc} @load=${this.handleEditorFrameLoad}></iframe>
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
