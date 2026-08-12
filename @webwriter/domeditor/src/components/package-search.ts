import {LitElement, css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"

/** A package-button-wide filter that fits directly in the ribbon grid. */
export class PackageSearch extends LitElement {
  static properties = {
    query: {type: String},
    loading: {type: Boolean, reflect: true},
    error: {type: String},
  }

  static styles = css`
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
    :host([loading]) input, .field:has(.clear) input { padding-right: 1.5rem; }

    .clear {
      display: grid;
      position: absolute;
      top: 0;
      right: 0;
      place-items: center;
      width: 1.65rem;
      height: 100%;
      padding: 0.4rem;
      border: 0;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .clear:hover { color: #1e4f87; background: rgb(215 231 247 / 65%); }
    .clear:focus-visible { outline: 2px solid #3977c7; outline-offset: -2px; }
    .clear svg { display: block; width: 100%; height: 100%; }

    .loading {
      position: absolute;
      top: 50%;
      right: 0.45rem;
      color: #667085;
      font-size: 0.55rem;
      transform: translateY(-50%);
    }

    .field:has(.clear) .loading { right: 1.75rem; }
  `

  query = ""
  loading = false
  error = ""

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

  private clearQuery() {
    this.query = ""
    this.dispatchEvent(new CustomEvent<{query: string}>("package-search-change", {
      detail: {query: ""},
      bubbles: true,
      composed: true,
    }))
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>("input")?.focus())
  }

  render() {
    return html`
      <div class="field">
        <span class="icon" aria-hidden="true">${ribbonIcon("Search")}</span>
        <input
          type="search"
          placeholder="Search packages"
          aria-label="Search packages"
          title=${this.error || "Search packages"}
          .value=${this.query}
          @focus=${this.requestCatalog}
          @input=${this.updateQuery}
        />
        ${this.query ? html`
          <button class="clear" type="button" aria-label="Clear package search" title="Clear search" @click=${this.clearQuery}>
            ${ribbonIcon("Reject")}
          </button>
        ` : ""}
        ${this.loading ? html`<span class="loading" aria-hidden="true">…</span>` : ""}
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
