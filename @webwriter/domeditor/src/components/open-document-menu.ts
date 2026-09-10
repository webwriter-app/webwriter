import {LitElement, css, html} from "lit"
import type {BackendDocumentSummary} from "../backend-client"
import {ribbonIcon} from "../ribbon-icons"

/** A native-dialog menu for opening and deleting saved documents. */
export class OpenDocumentMenu extends LitElement {
  static properties = {
    documents: {attribute: false},
    currentDocumentId: {type: String, attribute: "current-document-id"},
    loading: {type: Boolean, reflect: true},
    busy: {type: Boolean, reflect: true},
    error: {type: String},
  }

  static styles = css`
    :host {
      display: contents;
      color: #263241;
      font: 14px/1.4 system-ui, sans-serif;
    }
    dialog {
      box-sizing: border-box;
      width: min(35rem, calc(100vw - 2rem));
      max-height: min(42rem, calc(100vh - 2rem));
      padding: 0;
      border: 1px solid #d8dee6;
      border-radius: 0.65rem;
      color: inherit;
      background: #fff;
      box-shadow: 0 1rem 3rem rgb(24 44 72 / 22%);
      overflow: hidden;
    }
    dialog::backdrop {
      background: rgb(23 39 58 / 35%);
    }
    .shell {
      display: flex;
      flex-direction: column;
      max-height: min(calc(42rem - 2px), calc(100vh - 2rem - 2px));
    }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.15rem 1.25rem 0.9rem;
      border-bottom: 1px solid #e6eaf0;
      flex-shrink: 0;
    }
    h2 {
      margin: 0;
      color: #1e4f87;
      font-size: 1.1rem;
      font-weight: 650;
    }
    .subtitle {
      margin: 0.18rem 0 0;
      color: #667085;
      font-size: 0.8rem;
    }
    .close, .delete {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      padding: 0.4rem;
      border: 0;
      border-radius: 0.35rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }
    .close {
      width: 2rem;
      height: 2rem;
      margin: -0.25rem -0.25rem 0 0;
    }
    .close:hover {
      color: #1e4f87;
      background: #eaf3fc;
    }
    .delete:hover {
      color: #a33a45;
      background: #fcedef;
    }
    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }
    .content {
      min-height: 0;
      overflow: auto;
      padding: 0.55rem;
    }
    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: stretch;
      gap: 0.35rem;
    }
    .open {
      min-width: 0;
      flex: 1;
      padding: 0.7rem 0.75rem;
      border: 1px solid transparent;
      border-radius: 0.45rem;
      color: inherit;
      text-align: start;
      background: transparent;
      cursor: pointer;
    }
    .open:hover {
      border-color: #c8dcef;
      background: #f3f8fd;
    }
    .title {
      display: block;
      overflow: hidden;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      display: block;
      margin-top: 0.18rem;
      color: #667085;
      font-size: 0.75rem;
    }
    .current {
      margin-inline-start: 0.4rem;
      color: #3977c7;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .delete {
      align-self: center;
      width: 2.25rem;
      height: 2.25rem;
    }
    .delete svg, .close svg {
      width: 1rem;
      height: 1rem;
    }
    .state {
      padding: 2rem 1rem;
      color: #667085;
      text-align: center;
    }
    .state p {
      margin: 0;
    }
    .state p + button {
      margin-top: 0.8rem;
    }
    .retry {
      padding: 0.45rem 0.8rem;
      border: 1px solid #b8cce2;
      border-radius: 0.35rem;
      color: #1e4f87;
      background: #f3f8fd;
      cursor: pointer;
    }
    button:disabled {
      cursor: default;
      opacity: 0.55;
    }
    @media (max-width: 35rem) {
      dialog {
        width: calc(100vw - 1rem);
      }
      header {
        padding-inline: 1rem;
      }
    }
  `

  documents: BackendDocumentSummary[] = []
  currentDocumentId: string | null = null
  loading = false
  busy = false
  error = ""

  async show() {
    await this.updateComplete
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog")
    if(!dialog) return
    if(!dialog.open) dialog.showModal()
    this.renderRoot.querySelector<HTMLButtonElement>(".close")?.focus()
  }

  close() {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog")
    if(dialog?.open) dialog.close()
  }

  private openDocument(id: string) {
    if(this.busy) return
    this.dispatchEvent(new CustomEvent<{id: string}>("document-open", {detail: {id}, bubbles: true, composed: true}))
  }

  private deleteDocument(event: Event, id: string) {
    event.stopPropagation()
    if(this.busy) return
    this.dispatchEvent(new CustomEvent<{id: string}>("document-delete", {detail: {id}, bubbles: true, composed: true}))
  }

  private retry() { this.dispatchEvent(new Event("documents-retry", {bubbles: true, composed: true})) }

  private formatDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat(undefined, {dateStyle: "medium"}).format(date)
  }

  render() {
    return html`
      <dialog aria-labelledby="open-document-title">
        <div class="shell">
          <header>
            <div>
              <h2 id="open-document-title">Open</h2>
              <p class="subtitle">Saved documents</p>
            </div>
            <button class="close" type="button" aria-label="Close" @click=${this.close}>${ribbonIcon("Reject")}</button>
          </header>
          <div class="content" aria-busy=${this.loading || this.busy ? "true" : "false"}>
            ${this.loading ? html`
              <div class="state" role="status"><p>Loading saved documents…</p></div>
            ` : html`
              ${this.error ? html`
                <div class="state" role="alert">
                  <p>${this.error}</p>
                  <button class="retry" type="button" ?disabled=${this.busy} @click=${this.retry}>Retry</button>
                </div>
              ` : ""}
              ${this.documents.length === 0 && !this.error ? html`
                <div class="state"><p>Save a document to find it here.</p></div>
              ` : this.documents.length > 0 ? html`
                <ul class="rows">
                  ${this.documents.map(document => html`
                    <li class="row">
                      <button class="open" type="button" aria-label=${`Open ${document.title}`}
                        ?disabled=${this.busy} @click=${() => this.openDocument(document.id)}>
                        <span class="title" title=${document.title}>${document.title}</span>
                        <span class="meta">
                          ${this.formatDate(document.updatedAt)} · ${document.format.toUpperCase()}
                          ${document.id === this.currentDocumentId ? html`<span class="current" aria-label="Current document">Current</span>` : ""}
                        </span>
                      </button>
                      <button class="delete" type="button" aria-label=${`Delete ${document.title}`}
                        title=${`Delete ${document.title}`} ?disabled=${this.busy}
                        @click=${(event: Event) => this.deleteDocument(event, document.id)}>${ribbonIcon("Delete")}</button>
                    </li>
                  `)}
                </ul>
              ` : ""}
            `}
          </div>
        </div>
      </dialog>
    `
  }
}

if(!customElements.get("open-document-menu")) customElements.define("open-document-menu", OpenDocumentMenu)

declare global { interface HTMLElementTagNameMap { "open-document-menu": OpenDocumentMenu } }
