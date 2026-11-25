import {LitElement, css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {editorInteractionStyles} from "./editing-controls.styles"

/** A package-button-wide filter that fits directly in the ribbon grid. */
export class PackageSearch extends LitElement {
  static properties = {
    query: {type: String},
    loading: {type: Boolean, reflect: true},
    localLoading: {type: Boolean, attribute: false},
    error: {type: String},
  }

  static styles = css`
    ${editorInteractionStyles}
    :host {
      box-sizing: border-box;
      display: block;
      align-self: center;
      width: 100%;
      height: calc(100% - 0.25rem);
      max-width: 100%;
      font: inherit;
    }

    .field {
      box-sizing: border-box;
      display: flex;
      position: relative;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      height: 100%;
      padding-left: 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.3rem;
      background: transparent;
    }

    .field:focus-within {
      border-color: #6fa0d4;
      outline: 2px solid #b9d7f5;
      outline-offset: -1px;
    }

    .icon {
      display: block;
      flex: 0 0 0.85rem;
      width: 0.85rem;
      height: 0.85rem;
      color: #667085;
      pointer-events: none;
    }

    .icon svg { display: block; width: 100%; height: 100%; }

    .refresh, .local-package-actions-trigger {
      display: grid;
      place-items: center;
      flex: 0 0 1.55rem;
      align-self: stretch;
      padding: 0;
      border: 0;
      border-radius: 0.25rem;
      color: #667085;
      background: transparent;
      cursor: pointer;
    }

    .refresh { margin-inline: -0.35rem; }
    .local-package-actions-trigger { flex-basis: 1.3rem; margin-inline-start: -0.35rem; }
    .local-package-actions-trigger svg { width: .75rem; height: .75rem; }
    .local-package-actions-trigger[data-error] { color: #a34521; }

    .refresh-icon { display: none; }
    .refresh:is(:hover, :focus-visible):not(:disabled) .search-icon { display: none; }
    .refresh:is(:hover, :focus-visible):not(:disabled) .refresh-icon { display: block; }
    :is(.refresh, .local-package-actions-trigger, .local-package-actions button):hover:not(:disabled),
    .field:has(:popover-open) .local-package-actions-trigger { color: #1e4f87; background: rgb(215 231 247 / 65%); }
    :is(.refresh, .local-package-actions-trigger, .local-package-actions button):active:not(:disabled) { color: #173d6b; background: #b9d7f5; }
    :is(.refresh, .local-package-actions-trigger, .local-package-actions button):focus-visible { outline: 2px solid #3977c7; outline-offset: -2px; }
    :is(.refresh, .local-package-actions-trigger, .local-package-actions button):disabled { cursor: default; }

    input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 0;
      height: 100%;
      padding: 0 0.35rem 0 0;
      border: 0;
      color: #2f3742;
      outline: 0;
      background: transparent;
      font: inherit;
      font-size: 0.68rem;
    }

    input::-webkit-search-cancel-button { display: none; }
    .clear {
      display: grid;
      place-items: center;
      flex: 0 0 1.3rem;
      width: 1.3rem;
      height: 100%;
      margin-inline-start: -0.35rem;
      padding: 0.4rem 0.225rem;
      border: 0;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .clear:hover { color: #1e4f87; background: rgb(215 231 247 / 65%); }
    .clear:focus-visible { outline: 2px solid #3977c7; outline-offset: -2px; }
    .clear svg { display: block; width: 100%; height: 100%; }

    .local-package-actions {
      box-sizing: border-box;
      inline-size: max-content;
      max-inline-size: calc(100vi - 1rem);
      padding: .2rem;
      border: 1px solid #c8d2df;
      border-radius: .3rem;
      color: #2f3742;
      background: #f7f8fa;
      box-shadow: 0 3px 10px #0002;
    }

    @supports (position-area: block-end span-inline-start) {
      .local-package-actions {
        inset: auto;
        margin: .15rem 0;
        position-area: block-end span-inline-start;
        position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
      }
    }

    .local-package-actions button {
      display: flex;
      align-items: center;
      gap: .45rem;
      width: 100%;
      padding: .4rem .5rem;
      border: 0;
      border-radius: .2rem;
      font: 500 .75rem system-ui, sans-serif;
      text-align: start;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    .local-package-actions button svg { flex: 0 0 1rem; width: 1rem; height: 1rem; }
    .local-package-actions p { max-inline-size: 16rem; margin: .35rem .5rem; color: #a34521; font: .72rem system-ui, sans-serif; overflow-wrap: anywhere; }
    .package-feedback { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; }

    .loading {
      box-sizing: border-box;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: package-search-spin 0.8s linear infinite;
    }

    @keyframes package-search-spin {
      to { transform: rotate(360deg); }
    }
  `

  query = ""
  loading = false
  localLoading = false
  error = ""

  focus(options?: FocusOptions) {
    this.renderRoot.querySelector<HTMLInputElement>("input")?.focus(options)
  }

  private updateQuery(event: Event) {
    this.query = (event.currentTarget as HTMLInputElement).value
    this.dispatchEvent(new CustomEvent<{query: string}>("package-search-change", {
      detail: {query: this.query},
      bubbles: true,
      composed: true,
    }))
  }

  private requestCatalog() {
    this.dispatchEvent(new Event("package-catalog-request", {bubbles: true, composed: true}))
    this.dispatchEvent(new Event("package-search-focus", {bubbles: true, composed: true}))
  }

  private refreshCatalog() {
    this.dispatchEvent(new CustomEvent("package-catalog-request", {
      detail: {refresh: true},
      bubbles: true,
      composed: true,
    }))
  }

  private clearQuery() {
    this.query = ""
    this.dispatchEvent(new CustomEvent<{query: string}>("package-search-change", {
      detail: {query: ""},
      bubbles: true,
      composed: true,
    }))
    void this.updateComplete.then(() => this.focus())
  }

  dismissActions() {
    this.renderRoot.querySelector<HTMLElement>(".local-package-actions:popover-open")?.hidePopover?.()
  }

  private chooseLocalPackage(action: string) {
    this.dismissActions()
    this.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: action, keepDrawerOpen: true},
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    return html`
      <div class="field">
        <button class="refresh" type="button" aria-label="Refresh list" title="Refresh list"
          ?disabled=${this.loading} @click=${this.refreshCatalog}>
          ${this.loading ? html`<span class="icon loading" aria-hidden="true"></span>` : html`
            <span class="icon search-icon" aria-hidden="true">${ribbonIcon("Search")}</span>
            <span class="icon refresh-icon" aria-hidden="true">${ribbonIcon("Refresh")}</span>
          `}
        </button>
        <input
          type="search"
          placeholder="Search widgets"
          aria-label="Search widgets"
          aria-busy=${this.loading}
          title=${this.error || "Search widgets"}
          .value=${this.query}
          @focus=${this.requestCatalog}
          @input=${this.updateQuery}
        />
        ${this.query ? html`
          <button class="clear" type="button" aria-label="Clear package search" title="Clear search" @click=${this.clearQuery}>
            ${ribbonIcon("Reject")}
          </button>
        ` : ""}
        <button class="local-package-actions-trigger" type="button" aria-label="Local package actions"
          title=${this.error || "Local package actions"} popovertarget="local-package-actions" ?data-error=${Boolean(this.error)}>
          ${ribbonIcon("MoreVertical")}
        </button>
        <div id="local-package-actions" class="local-package-actions" popover="auto" role="group" aria-label="Local package actions">
          <button type="button" autofocus ?disabled=${this.localLoading} @click=${() => this.chooseLocalPackage("local-package-add")}>
            ${ribbonIcon("Open")}Add from local folder
          </button>
          <button type="button" ?disabled=${this.localLoading} @click=${() => this.chooseLocalPackage("local-package-add-batch")}>
            ${ribbonIcon("Open")}Add from parent folder
          </button>
          ${this.error ? html`<p>${this.error}</p>` : ""}
        </div>
        <span class="package-feedback" role="status">${this.error}</span>
      </div>
    `
  }
}

if(!customElements.get("package-search")) customElements.define("package-search", PackageSearch)

declare global {
  interface HTMLElementTagNameMap {
    "package-search": PackageSearch
  }
}
