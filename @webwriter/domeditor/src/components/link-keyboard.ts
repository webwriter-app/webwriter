import {LitElement, css, html, nothing} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {parseReference} from "../document-viewer.js"
import type {LinkEdit, LinkSelectionState} from "../links"

type LinkTarget = {href: string, label: string}
type ReferenceValue = LinkTarget & {data: string}
type LinkHistory = {urls: string[], references: ReferenceValue[]}
type ReferenceDraft = {
  title: string, authors: string, year: string, source: string, type: string,
  publisher: string, doi: string, locator: string, href: string,
}
const emptyReference = (): ReferenceDraft => ({
  title: "", authors: "", year: "", source: "", type: "book", publisher: "", doi: "", locator: "", href: "",
})
export const linkHistoryKey = "webwriter.link-history.v1"
const historyLimit = 100
const validHref = (href: unknown): href is string => {
  if(typeof href !== "string" || !href.trim()) return false
  if(href.startsWith("#")) return href.length > 1
  try { return ["http:", "https:", "mailto:", "tel:", "ftp:", "file:"].includes(new URL(href, document.baseURI).protocol) }
  catch { return false }
}

/** DOM-backed link choices with a disposable, local history of used sources. */
export class LinkKeyboard extends LitElement {
  static properties = {
    state: {attribute: false}, error: {type: String}, activeTab: {state: true},
    search: {state: true}, webHref: {state: true}, referenceSearch: {state: true},
    openNewTab: {state: true}, download: {state: true}, history: {state: true},
    reference: {state: true}, referenceDetails: {state: true},
    validationError: {state: true}, dialogOpen: {state: true},
  }
  static styles = css`
    :host {
      display: block; box-sizing: border-box; width: min(100%, 760px); height: 280px;
      margin-inline: auto; padding: .45rem .6rem max(.45rem, env(safe-area-inset-bottom, 0px));
      color: #26313d; background: #f2f4f7; border: 1px solid #c9d0d9;
      border-radius: .55rem .55rem 0 0; box-shadow: 0 -3px 14px rgb(25 35 48 / 20%);
      font: 400 .8rem/1.25 system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    section { display: flex; flex-direction: column; gap: .35rem; height: 100%; min-height: 0; }
    .header, .tabs, .row, .actions { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
    .header { flex-wrap: nowrap; }
    h2 { margin: 0; font-size: .88rem; font-weight: 650; }
    button, input, select { min-width: 0; color: inherit; border: 1px solid #c5cdd7; border-radius: .32rem; background: #fff; font: inherit; }
    button { min-height: 2rem; padding: .25rem .5rem; cursor: pointer; touch-action: manipulation; }
    button:hover { background: #e8edf3; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #286bb3; outline-offset: 1px; }
    button[aria-pressed="true"] { color: #fff; border-color: #315f91; background: #315f91; }
    .close { display: grid; place-items: center; flex-shrink: 0; width: 2rem; padding: .25rem; border: 0; background: transparent; }
    .close svg, .bar-action svg { width: 1.15rem; height: 1.15rem; }
    .tabs { flex: 1; min-width: 0; flex-wrap: nowrap; }
    .tabs button { flex: 1; }
    .panel { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: .35rem; }
    .field { display: flex; flex-direction: column; gap: .2rem; min-width: 0; flex: 1 1 calc(50% - .2rem); }
    .field.wide { flex-basis: 100%; }
    input, select { width: 100%; min-height: 2rem; padding: .3rem .45rem; }
    label.check { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; }
    label.check input { width: auto; min-height: auto; }
    .web-label-row, .web-options { display: flex; align-items: center; gap: .5rem; }
    .web-label-row { min-height: 1.5rem; }
    .web-options { margin-inline-start: auto; }
    .search-bar { position: relative; }
    .search-bar input { padding-inline-end: 2.5rem; }
    .bar-action { position: absolute; inset-block: 0; inset-inline-end: 0; display: grid; place-items: center; width: 2.15rem; padding: .25rem; border-radius: 0 .32rem .32rem 0; }
    .targets { flex: 1; min-height: 0; overflow: auto; }
    .targets [role="listitem"] + [role="listitem"] { margin-top: .25rem; }
    .target { display: flex; flex-direction: column; width: 100%; text-align: left; }
    .target span, .target small { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .target small { opacity: .75; }
    .empty { color: #667488; padding: .5rem 0; }
    .actions { justify-content: flex-end; margin-top: .35rem; }
    dialog { width: min(560px, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 1rem; border: 1px solid #c9d0d9; border-radius: .55rem; color: inherit; background: #f2f4f7; font: inherit; }
    dialog::backdrop { background: rgb(25 35 48 / 35%); }
    dialog h2 { margin-bottom: .75rem; }
    dialog .row + .row { margin-top: .35rem; }
    @media (max-width: 520px) { .tabs button { padding-inline: .25rem; } }
  `

  state: LinkSelectionState | null = null
  error = ""
  validationError = ""
  activeTab: "document" | "web" | "reference" = "web"
  search = ""
  webHref = ""
  referenceSearch = ""
  openNewTab = false
  download = false
  history: LinkHistory = {urls: [], references: []}
  referenceDetails = false
  reference = emptyReference()
  dialogOpen = false
  #stateIdentity = ""
  #initialTarget = ""
  #initialDownload: string | null = null
  #pendingEdit: LinkEdit | null = null

  connectedCallback() {
    super.connectedCallback()
    this.#readHistory()
    window.addEventListener("storage", this.#onStorage)
  }
  disconnectedCallback() {
    window.removeEventListener("storage", this.#onStorage)
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close()
    super.disconnectedCallback()
  }
  willUpdate(changed: Map<string, unknown>) {
    if(changed.has("state")) this.#syncState()
  }
  updated() {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog")
    if(this.dialogOpen && dialog && !dialog.open) dialog.showModal()
    else if(!this.dialogOpen && dialog?.open) dialog.close()
  }

  render() {
    if(!this.state?.active) return nothing
    const label = this.activeTab === "web" ? "Web address" : this.activeTab === "document" ? "Document" : "Reference"
    const inputLabel = this.activeTab === "web" ? "Web address" : this.activeTab === "document" ? "Search document links" : "Search references"
    const query = this.activeTab === "web" ? this.webHref : this.activeTab === "document" ? this.search : this.referenceSearch
    const values = this.#values().filter(value => `${value.label} ${value.href} ${"data" in value ? value.data : ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    return html`<section aria-label="Link keyboard" @keydown=${this.#onKeydown}>
      <div class="header"><h2>Link</h2>
        <div class="tabs" role="tablist" aria-label="Link type">
          ${([ ["web", "Web"], ["document", "Document"], ["reference", "Reference"] ] as const).map(([id, name]) => html`
            <button type="button" role="tab" ?disabled=${id === "reference" && this.state?.referenceAllowed === false}
              id=${`tab-${id}`} aria-controls="link-panel" tabindex=${this.activeTab === id ? "0" : "-1"}
              aria-selected=${String(this.activeTab === id)} aria-pressed=${String(this.activeTab === id)}
              @keydown=${this.#onTabKeydown} @pointerdown=${this.#keepSelection} @click=${() => this.activeTab = id}>${name}</button>`)}
        </div>
        <button class="close" type="button" aria-label="Close link keyboard" title="Close link keyboard"
          @pointerdown=${this.#keepSelection} @click=${this.#close}>${ribbonIcon("Reject")}</button>
      </div>
      ${this.error && !this.dialogOpen ? html`<div role="alert">${this.error}</div>` : nothing}
      <div id="link-panel" class="panel" role="tabpanel" aria-labelledby=${`tab-${this.activeTab}`}>
        <div class="web-label-row"><label for="link-search">${label}</label>
          ${this.activeTab === "web" ? html`<div class="web-options" role="group" aria-label="Link options">
            <label class="check"><input type="checkbox" .checked=${this.openNewTab} @change=${(event: Event) => this.openNewTab = (event.target as HTMLInputElement).checked}>Open in new tab</label>
            <label class="check"><input type="checkbox" .checked=${this.download} @change=${(event: Event) => this.download = (event.target as HTMLInputElement).checked}>Download</label>
          </div>` : nothing}
        </div>
        <div class="search-bar"><input id="link-search" type="search" aria-label=${inputLabel}
          placeholder=${this.activeTab === "web" ? "Search or enter a web address" : this.activeTab === "document" ? "Search document targets" : "Search references"}
          .value=${query} @input=${(event: Event) => this.#setQuery((event.target as HTMLInputElement).value)}
          @keydown=${(event: KeyboardEvent) => this.#enterToApply(event, () => this.activeTab === "web" ? this.#applyWeb() : values[0] && this.#select(values[0]))}>
          <button class="bar-action" type="button" aria-label=${this.activeTab === "reference" ? "Add reference" : this.activeTab === "web" ? "Apply web link" : "Apply document link"}
            title=${this.activeTab === "reference" ? "Add reference" : "Apply link"}
            ?disabled=${this.activeTab === "document" && !values.length}
            @pointerdown=${this.#keepSelection} @click=${() => this.activeTab === "reference" ? this.#openReferenceDialog() : this.activeTab === "web" ? this.#applyWeb() : values[0] && this.#select(values[0])}>
            ${ribbonIcon(this.activeTab === "reference" ? "Plus" : "ArrowRight")}
          </button>
        </div>
        <div class="targets" role="list" aria-label=${`${label} suggestions`}>
          ${values.length ? values.map(value => html`<div role="listitem"><button class="target" type="button" title=${value.href}
            aria-pressed=${String(this.state?.href === value.href)} @pointerdown=${this.#keepSelection} @click=${() => this.#select(value)}>
            <span>${value.label}</span>${value.label !== value.href ? html`<small>${value.href}</small>` : nothing}
          </button></div>`) : html`<div class="empty">No matching ${this.activeTab === "reference" ? "references" : this.activeTab === "web" ? "recent addresses" : "targets"}</div>`}
        </div>
      </div>
      <dialog aria-labelledby="reference-heading" @cancel=${(event: Event) => { event.preventDefault(); this.dialogOpen = false }}
        @close=${() => this.dialogOpen = false}>
        <h2 id="reference-heading">Add reference</h2>
        ${this.validationError || this.error ? html`<div role="alert">${this.validationError || this.error}</div>` : nothing}
        <div class="row">${this.#input("Title", "title", true)}${this.#input("Authors", "authors")}${this.#input("Year", "year")}
          ${this.#input("Link (optional)", "href")}${this.#input("Page or location", "locator")}</div>
        ${this.referenceDetails ? html`<div class="row">
          <label class="field">Source type<select aria-label="Source type" .value=${this.reference.type}
            @change=${(event: Event) => this.#setReference("type", (event.target as HTMLSelectElement).value)}>
            <option value="book">Book</option><option value="article-journal">Journal article</option><option value="article">Article</option>
            <option value="chapter">Book chapter</option><option value="webpage">Web page</option><option value="report">Report</option>
            <option value="thesis">Thesis</option><option value="paper-conference">Conference paper</option><option value="other">Other</option>
          </select></label>${this.#input("Publisher", "publisher")}${this.#input("Container source", "source")}${this.#input("DOI", "doi")}
        </div>` : nothing}
        <div class="actions"><button type="button" aria-expanded=${String(this.referenceDetails)} @click=${() => this.referenceDetails = !this.referenceDetails}>More details</button>
          <button type="button" @click=${() => this.dialogOpen = false}>Cancel</button>
          <button type="button" @click=${this.#applyReference}>Add reference</button></div>
      </dialog>
    </section>`
  }

  #input(label: string, key: keyof ReferenceDraft, wide = false) {
    return html`<label class="field ${wide ? "wide" : ""}">${label}<input aria-label=${label} .value=${this.reference[key]}
      placeholder=${key === "authors" ? "Smith, Alex; Organization" : key === "year" ? "2024" : ""}
      @input=${(event: Event) => this.#setReference(key, (event.target as HTMLInputElement).value)}
      @keydown=${(event: KeyboardEvent) => this.#enterToApply(event, () => this.#applyReference())}></label>`
  }
  #setReference(key: keyof ReferenceDraft, value: string) { this.validationError = ""; this.reference = {...this.reference, [key]: value} }
  #setQuery(value: string) {
    if(this.activeTab === "web") this.webHref = value
    else if(this.activeTab === "document") this.search = value
    else this.referenceSearch = value
  }
  #openReferenceDialog() {
    this.reference = {...emptyReference(), title: this.referenceSearch}
    this.referenceDetails = false
    this.validationError = ""
    this.dialogOpen = true
  }

  #syncState() {
    const state = this.state
    if(state?.active) this.#rememberState(state)
    const nextIdentity = state?.identity ?? ""
    if(nextIdentity === this.#stateIdentity) return
    this.#stateIdentity = nextIdentity
    const applied = !!state && !!this.#pendingEdit && state.href === this.#pendingEdit.href
    this.#pendingEdit = null
    this.validationError = ""
    this.dialogOpen = false
    if(!state) return
    if(!applied) { this.activeTab = "web"; this.search = "" }
    this.webHref = state.href && !state.href.startsWith("#") ? state.href : ""
    this.referenceSearch = parseReference(state.attributes["data-reference"] ?? "")?.title ?? (applied ? this.referenceSearch : "")
    this.openNewTab = state.attributes.target === "_blank"
    this.download = "download" in state.attributes
    this.#initialTarget = state.attributes.target ?? ""
    this.#initialDownload = Object.hasOwn(state.attributes, "download") ? state.attributes.download : null
  }
  #values(): Array<LinkTarget | ReferenceValue> {
    if(this.activeTab === "document") return [...new Map((this.state?.targets ?? []).map(target => [target.href, target])).values()]
    if(this.activeTab === "web") return this.history.urls.map(href => ({href, label: href}))
    return [...new Map([...this.history.references, ...(this.state?.references ?? [])].map(reference => [reference.href, reference])).values()]
  }
  #select(value: LinkTarget | ReferenceValue) {
    if(this.activeTab === "web") { this.webHref = value.href; this.#applyWeb(); return }
    const attributes = this.#currentAttributes()
    attributes["data-reference"] = "data" in value ? value.data : null
    attributes["data-reference-locator"] = value.href === this.state?.href ? this.state.attributes["data-reference-locator"] ?? null : null
    this.#setQuery(value.label)
    this.#apply(value.href, attributes)
  }
  #currentAttributes(): Record<string, string | null> {
    return Object.fromEntries(Object.entries(this.state?.attributes ?? {}).filter(([name]) => name !== "href"))
  }
  #applyWeb() {
    const attributes = this.#currentAttributes()
    attributes["data-reference"] = null
    attributes["data-reference-locator"] = null
    if(this.openNewTab !== (this.#initialTarget === "_blank")) {
      attributes.target = this.openNewTab ? "_blank" : null
      if(this.openNewTab) {
        const rel = new Set((attributes.rel ?? "").split(/\s+/).filter(Boolean))
        rel.add("noopener"); rel.add("noreferrer")
        attributes.rel = [...rel].join(" ")
      }
    }
    if(this.download !== (this.#initialDownload !== null)) attributes.download = this.download ? "" : null
    this.#apply(this.webHref.trim(), attributes)
  }
  #applyReference() {
    const fields = this.reference
    if(!fields.title.trim()) { this.validationError = "Enter a title for the reference."; return }
    if(fields.year && !/^\d{1,4}$/.test(fields.year.trim())) { this.validationError = "Enter a valid year."; return }
    const data: Record<string, unknown> = {type: fields.type || "book", title: fields.title.trim()}
    if(fields.source) data["container-title"] = fields.source
    if(fields.publisher) data.publisher = fields.publisher
    if(fields.doi) data.DOI = fields.doi
    if(fields.authors.trim()) data.author = fields.authors.split(";").map(name => name.trim()).filter(Boolean).map(name => {
      const comma = name.indexOf(",")
      return comma >= 0 ? {family: name.slice(0, comma).trim(), given: name.slice(comma + 1).trim()} : {literal: name}
    })
    if(fields.year.trim()) data.issued = {"date-parts": [[Number(fields.year)]]}
    const href = fields.href.trim() || `#ref-${crypto.randomUUID()}`
    if(!validHref(href)) { this.validationError = "Enter a valid reference address."; return }
    const attributes = this.#currentAttributes()
    attributes["data-reference"] = JSON.stringify(data)
    attributes["data-reference-locator"] = fields.locator || null
    this.referenceSearch = data.title as string
    this.#apply(href, attributes)
  }
  #apply(href: string, attributes: Record<string, string | null>) {
    this.#pendingEdit = {identity: this.state?.identity ?? "", href, attributes}
    this.dispatchEvent(new CustomEvent("link-keyboard-command", {detail: this.#pendingEdit, bubbles: true, composed: true}))
  }

  #readHistory() {
    try {
      const data = JSON.parse(localStorage.getItem(linkHistoryKey) ?? "null")
      this.history = {
        urls: Array.isArray(data?.urls) ? [...new Set<string>(data.urls.filter((href: unknown) => validHref(href) && !href.startsWith("#")))].slice(0, historyLimit) : [],
        references: Array.isArray(data?.references) ? data.references.filter((reference: ReferenceValue) => reference && validHref(reference.href)
          && typeof reference.label === "string" && typeof reference.data === "string" && parseReference(reference.data)).slice(0, historyLimit) : [],
      }
    } catch { /* Keep session history usable when persistent storage is unavailable. */ }
  }
  #rememberState(state: LinkSelectionState) {
    if(!validHref(state.href)) return
    this.#readHistory()
    const data = parseReference(state.attributes["data-reference"] ?? "")
    const urls = state.href.startsWith("#") ? this.history.urls : [state.href, ...this.history.urls.filter(href => href !== state.href)].slice(0, historyLimit)
    const references = data ? [{href: state.href, label: data.title, data: JSON.stringify(data)}, ...this.history.references.filter(reference => reference.href !== state.href)].slice(0, historyLimit) : this.history.references
    const history = {urls, references}
    if(JSON.stringify(history) === JSON.stringify(this.history)) return
    this.history = history
    try { localStorage.setItem(linkHistoryKey, JSON.stringify(history)) } catch { /* Editing remains available when storage is blocked or full. */ }
  }
  #onStorage = (event: StorageEvent) => { if(event.key === linkHistoryKey || event.key === null) this.#readHistory() }
  #enterToApply(event: KeyboardEvent, apply: () => void) {
    if(event.key !== "Enter" || event.isComposing) return
    event.preventDefault(); apply()
  }
  #onKeydown(event: KeyboardEvent) {
    if(event.key !== "Escape") return
    event.preventDefault(); event.stopPropagation()
    if(this.dialogOpen) this.dialogOpen = false
    else this.#close()
  }
  #onTabKeydown(event: KeyboardEvent) {
    if(!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const tabs = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter(tab => !tab.disabled)
    const index = tabs.indexOf(event.currentTarget as HTMLButtonElement)
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
    tabs[next]?.click(); tabs[next]?.focus()
  }
  #close() { this.dispatchEvent(new CustomEvent("link-keyboard-close", {bubbles: true, composed: true})) }
  #keepSelection(event: PointerEvent) { event.preventDefault() }
}
if(!customElements.get("dom-editor-link-keyboard")) customElements.define("dom-editor-link-keyboard", LinkKeyboard)
