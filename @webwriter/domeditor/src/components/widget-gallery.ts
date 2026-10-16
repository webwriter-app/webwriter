import {LitElement, css, html, nothing} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
import {fetchWithin} from "../npm-files"
import {galleryDocument, galleryExample, galleryPreviewPackages, galleryPackages, type GalleryWidget} from "../widget-gallery"
import {editorFrameOrigin} from "../frame-origins"
import {previewFrameHTML} from "../frame-document"
import {resolvePackageDependencies} from "../package-dependencies"
import {cardOverlayStyles} from "./card-overlay"
import {t, SiteLanguageController} from "../site-language"

export class WidgetGallery extends LitElement {
  private languageController = new SiteLanguageController(this)
  static properties = {
    wall: {type: Boolean, reflect: true},
    packages: {state: true}, loading: {state: true}, error: {state: true}, query: {state: true},
    selected: {state: true}, previewStatus: {state: true}, previewError: {state: true},
    frameURL: {state: true}, frameHeight: {state: true},
  }

  static styles = [cardOverlayStyles, css`
    :host {display: block; color: #263142; --accent: #155e9b; --border: #dfe5ed}
    * {box-sizing: border-box}
    button, input, select {font: inherit}
    button, select {cursor: pointer}
    button, input, select {min-block-size: 2.75rem; border: 1px solid var(--border); border-radius: .35rem; background: #fff; color: inherit; padding: .5rem .8rem}
    button:hover:not(:disabled) {background: #eaf2fb; border-color: #a9bed6}
    button:disabled {cursor: default; opacity: .6}
    :is(button, input, select, a):focus-visible {outline: 2px solid var(--accent); outline-offset: 3px}
    a {color: var(--accent); text-underline-offset: .2em}
    .filters {display: flex; align-items: end; flex-wrap: wrap; gap: 1rem; padding-block: 0 1.25rem; border-bottom: 1px solid var(--border)}
    label {display: grid; gap: .4rem; font-size: .875rem; font-weight: 600}
    .search {flex: 1; min-inline-size: min(100%, 15rem)}
    input {inline-size: 100%}
    .count, .status {color: #617084; font-size: .875rem}
    .count {margin-block: 1.25rem}
    .cards {display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap: 1.25rem; list-style: none; margin: 0; padding: 0}
    .cards li {min-inline-size: 0}
    article {display: flex; flex-direction: column; block-size: 100%; padding: 1.4rem; border: 1px solid var(--border); border-radius: .6rem; background: white; overflow-wrap: anywhere}
    .card-heading {display: flex; align-items: center; gap: .85rem}
    .icon {inline-size: 2.5rem; block-size: 2.5rem; object-fit: contain; flex: none}
    .placeholder {display: grid; place-items: center; background: #eaf2fb; border-radius: .4rem; font-size: 1.2rem; color: var(--accent)}
    h2, h3 {margin: 0; color: #172033; line-height: 1.3}
    h3 {font-size: 1.1rem}
    .package {margin-block: .9rem .5rem; font-size: .75rem; color: #617084}
    .description {margin: 0 0 1.2rem; font-size: .875rem; color: #536174}
    .card-actions {display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-block-start: auto; font-size: .8125rem}
    .try {color: var(--accent); font-weight: 600}
    .component {font-size: .75rem; color: #617084; margin-block: -.3rem 1rem}
    .error {padding: 1rem; border: 1px solid #e6b5ad; border-radius: .4rem; background: #fff8f6; color: #923b2e; overflow-wrap: anywhere}
    dialog {inline-size: min(68rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem); border: 1px solid var(--border); border-radius: .75rem; padding: 0; color: inherit; overflow: auto}
    dialog::backdrop {background: #17203380}
    .preview-heading {display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.5rem; border-bottom: 1px solid var(--border)}
    .preview-heading h2 {font-size: 1.5rem; margin-block-end: .3rem}
    .preview-heading p {font-size: .8125rem; color: #617084; margin: 0}
    .preview-controls {display: flex; align-items: end; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.5rem; background: #f7f9fc}
    .preview-controls label {flex: 1; min-inline-size: min(100%, 12rem)}
    select {inline-size: 100%; max-inline-size: 100%}
    .learner {font-size: .75rem; font-weight: 600; color: #356751; margin-inline-start: auto; align-self: center}
    .preview-status, .preview-error {margin: 1rem 1.5rem}
    iframe {display: block; inline-size: 100%; border: 0; background: white; min-block-size: 22rem; max-block-size: 70dvh}
    .empty {padding-block: 2rem; color: #617084}
    :host([wall]) {min-block-size: 8rem}
    :host([wall]) .cards {grid-template-columns: repeat(auto-fill, minmax(min(100%, 7.5rem), 1fr)); gap: 1rem; padding: .25rem}
    .widget-tile {display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .65rem; inline-size: 100%; aspect-ratio: 1; padding: .75rem; border-radius: .6rem; color: #172033}
    .widget-tile .icon {inline-size: 2.25rem; block-size: 2.25rem}
    .tile-label {display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; min-block-size: 2.5em; font-size: .8rem; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere}
    @media (max-width: 35rem) {
      :host([wall]) .cards {grid-template-columns: repeat(auto-fill, minmax(min(100%, 6rem), 1fr)); gap: .75rem}
      .widget-tile {gap: .5rem; padding: .5rem}
      .widget-tile .icon {inline-size: 1.75rem; block-size: 1.75rem}
      .tile-label {font-size: .75rem}
    }
    @media (max-width: 35rem) {article {padding: 1.1rem} .preview-heading {padding: 1rem} .preview-controls {padding: 1rem} .learner {inline-size: 100%; margin: 0} dialog {inline-size: calc(100vw - 1rem); max-block-size: calc(100dvh - 1rem)} .preview-heading h2 {font-size: 1.2rem}}
  `]

  wall = false
  private packages: WebWriterPackage[] = []
  private loading = false
  private error = ""
  private query = ""
  private selected: GalleryWidget | null = null
  private previewStatus = ""
  private previewError = ""
  private frameURL = ""
  private frameHeight = 440
  private registry = new WebWriterPackageRegistry(undefined, "en")
  private catalogAbort = new AbortController()
  private previewRevision = 0
  private bridgeNonce = ""
  private previewHTML = ""
  private defaultHTML: string | null = null
  private currentHTML = ""
  private previewTimeout?: ReturnType<typeof setTimeout>
  private dependencyPlans = new Map<string, ReturnType<typeof resolvePackageDependencies>>()

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("message", this.onMessage)
    void this.refresh()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.catalogAbort.abort()
    this.closePreview()
    window.removeEventListener("message", this.onMessage)
  }

  private async refresh() {
    this.closePreview()
    this.catalogAbort.abort()
    const controller = this.catalogAbort = new AbortController()
    this.registry = new WebWriterPackageRegistry((input, init) => fetchWithin(fetch, String(input), {
      ...init, signal: controller.signal, credentials: "omit",
    }, 15_000), "en")
    this.dependencyPlans.clear()
    this.loading = true
    this.error = ""
    try {
      const packages = await this.registry.search()
      if(!controller.signal.aborted) this.packages = packages.filter(pkg => pkg.name.startsWith("@webwriter/"))
    }
    catch(error) {
      if(!controller.signal.aborted) this.error = `The published widget catalog could not be loaded. ${String((error as Error).message ?? error)}`
    }
    finally { if(!controller.signal.aborted) this.loading = false }
  }

  private async openPreview(pkg: WebWriterPackage) {
    const member = pkg.members.find(member => member.kind === "widget" && member.insertable)
      ?? pkg.members.find(member => member.kind === "widget" || member.kind === "snippet")
    if(!member) return
    this.selected = {pkg, member}
    this.defaultHTML = null
    this.currentHTML = ""
    await this.updateComplete
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.showModal()
    void this.loadPreview()
  }

  private closePreview = () => {
    this.previewRevision++
    clearTimeout(this.previewTimeout)
    this.previewHTML = ""
    this.frameURL = ""
    this.renderRoot.querySelector<HTMLDialogElement>("dialog[open]")?.close()
    this.selected = null
  }

  private async loadPreview(reset = false) {
    const widget = this.selected
    if(!widget) return
    const revision = ++this.previewRevision
    const current = () => revision === this.previewRevision && this.isConnected
    clearTimeout(this.previewTimeout)
    this.frameURL = ""
    this.previewHTML = ""
    this.previewError = ""
    this.previewStatus = "Loading example…"
    this.bridgeNonce = crypto.randomUUID()
    this.frameHeight = 440
    this.previewTimeout = setTimeout(() => {
      if(!current()) return
      this.previewRevision++
      this.frameURL = ""
      this.previewStatus = ""
      this.previewError = "This widget took too long to load. Try resetting the example."
    }, 45_000)
    try {
      let content = reset && this.currentHTML ? this.currentHTML : ""
      if(!content && widget.member.kind === "snippet") content = await this.registry.fetchSnippet(widget.member)
      if(!content) {
        if(this.defaultHTML === null) {
          const first = widget.pkg.members.find(member => member.kind === "snippet")
          let published: string | null = null
          if(first) {
            try {
              const snippet = await this.registry.fetchSnippet(first)
              if(galleryExample(snippet, widget)) published = snippet
            }
            catch { /* An existing lesson or the widget's defaults remain available. */ }
          }
          const {galleryLessonExample} = await import("../gallery-examples")
          if(!current()) return
          this.defaultHTML = published ?? galleryLessonExample(widget)
          if(this.defaultHTML === null) {
            if(!widget.member.tagName) throw new Error("The published example could not be downloaded. Reset to retry.")
            const element = document.createElement(widget.member.tagName!)
            this.defaultHTML = element.outerHTML
          }
        }
        content = this.defaultHTML
      }
      if(!current()) return
      this.currentHTML = content
      const source = galleryDocument(content, widget.member.label)
      const packages = galleryPreviewPackages(source, this.packages, widget.pkg)
      const key = packages.map(pkg => [pkg.name, pkg.version, ...pkg.scripts].join("\n")).sort().join("\n")
      let plan = this.dependencyPlans.get(key)
      if(!plan) {
        plan = resolvePackageDependencies(packages, location.href)
        this.dependencyPlans.set(key, plan)
        plan.catch(() => this.dependencyPlans.delete(key))
      }
      const {map} = await plan
      if(!current()) return
      const frameOrigin = editorFrameOrigin()
      const base = new URL(import.meta.env.BASE_URL, `${frameOrigin}/`)
      const entry = new URL(import.meta.env.DEV ? "src/gallery-preview-entry.ts" : "assets/gallery-preview-entry.js", base)
      if(widget.member.tagName) entry.searchParams.set("tag", widget.member.tagName)
      this.previewHTML = previewFrameHTML(source, {
        bridgeNonce: this.bridgeNonce, packages, importMap: map,
        hostOrigin: location.origin, frameOrigin, entryURL: entry.href, executeScripts: true,
      })
      const url = new URL("frame-shell.html", base)
      url.searchParams.set("kind", "preview")
      url.searchParams.set("revision", String(revision))
      url.hash = new URLSearchParams({nonce: this.bridgeNonce}).toString()
      this.previewStatus = "Loading widget…"
      this.frameURL = url.href
    }
    catch(error) {
      if(!current()) return
      clearTimeout(this.previewTimeout)
      this.previewStatus = ""
      this.previewError = `The learner preview could not be loaded. ${String((error as Error).message ?? error)}`
    }
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.renderRoot.querySelector("iframe")
    if(!frame || !this.frameURL || event.source !== frame.contentWindow
      || event.origin !== new URL(this.frameURL).origin || event.data?.bridgeNonce !== this.bridgeNonce) return
    if(event.data.type === "webwriter-frame-shell-ready" && event.data.kind === "preview"
      && event.data.revision === String(this.previewRevision) && this.previewHTML) {
      frame.contentWindow?.postMessage({type: "webwriter-frame-document", html: this.previewHTML}, event.origin)
      this.previewHTML = ""
    }
    else if(event.data.type === "gallery-preview-ready") {
      clearTimeout(this.previewTimeout)
      this.previewStatus = ""
    }
    else if(event.data.type === "gallery-preview-error" || event.data.type === "webwriter-frame-error") {
      clearTimeout(this.previewTimeout)
      this.previewStatus = ""
      this.previewError = `This published widget could not start. ${String(event.data.message ?? "Try another example or reset the preview.").slice(0, 400)}`
    }
    else if(event.data.type === "gallery-preview-height" && Number.isFinite(event.data.height)) {
      this.frameHeight = Math.max(352, Math.min(900, event.data.height))
    }
  }

  render() {
    const packages = galleryPackages(this.packages, this.query)
    const selection = this.selected
    const members = selection?.pkg.members ?? []
    const npmURL = (pkg: WebWriterPackage) => `https://www.npmjs.com/package/${encodeURI(pkg.name)}`
    const count = (pkg: WebWriterPackage, kind: "widget" | "snippet") => pkg.members.filter(member => member.kind === kind).length
    const icon = (pkg: WebWriterPackage) => pkg.iconUrl ? html`<img class="icon" src=${pkg.iconUrl} alt="" loading="lazy" @error=${(event: Event) => (event.target as HTMLImageElement).hidden = true}>` : html`<span class="icon placeholder" aria-hidden="true">${pkg.label.charAt(0)}</span>`
    const cards = html`<ul class="cards" aria-label=${t("Published widgets")}>${repeat(packages, pkg => pkg.name, pkg => this.wall ? html`
        <li><button class="widget-tile" data-card-overlay=${t("Show widget")} aria-label=${t("Try {name}", {name: pkg.label})} title=${pkg.label} ?disabled=${!pkg.members.length} @click=${() => this.openPreview(pkg)}>${icon(pkg)}<span class="tile-label">${pkg.label}</span></button></li>` : html`
        <li><article>
          <div class="card-heading">${icon(pkg)}<h3>${pkg.label}</h3></div>
          <p class="package">${pkg.name} · ${pkg.version}</p>
          <p class="description">${pkg.description || t("Explore {name} in a learning activity.", {name: pkg.label})}</p>
          <p class="component">${pkg.manifest ? `${count(pkg, "widget")} ${t(count(pkg, "widget") === 1 ? "widget" : "widgets")} · ${count(pkg, "snippet")} ${t(count(pkg, "snippet") === 1 ? "snippet" : "snippets")}` : t("Package details unavailable. Refresh to retry.")}</p>
          <div class="card-actions"><button class="try" ?disabled=${!pkg.members.length} @click=${() => this.openPreview(pkg)}>${t("Try {name}", {name: pkg.label})}</button><a href=${npmURL(pkg)} target="_blank" rel="noopener noreferrer">${t("Package ↗")}</a></div>
        </article></li>`)}
      </ul>`
    return html`
      ${!this.wall ? html`<div class="filters">
        <label class="search">${t("Search widgets")}<input type="search" placeholder=${t("Name, topic, or package")} .value=${this.query} @input=${(event: Event) => this.query = (event.target as HTMLInputElement).value}></label>
        <button ?disabled=${this.loading} @click=${() => this.refresh()}>${this.loading ? t("Loading…") : t("Refresh")}</button>
      </div>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${this.error.startsWith("The published widget catalog could not be loaded. ") ? html`${t("The published widget catalog could not be loaded.")} ${this.error.slice("The published widget catalog could not be loaded. ".length)}` : t(this.error)}${this.wall ? html` <a href="/gallery/">${t("Explore the widgets →")}</a>` : nothing}</p>` : nothing}
      ${!this.wall || this.loading ? html`<p class="count" role="status">${this.loading ? t("Loading published widgets…") : html`${packages.length}${this.query ? html` ${t("of {total}", {total: this.packages.length})}` : nothing} ${!this.query && packages.length === 1 ? t("package") : t("packages")}`}</p>` : nothing}
      ${cards}
      ${!this.loading && !packages.length && !this.error ? html`<p class="empty">${this.query ? t("No widgets match your search.") : t("No published widgets were found.")}</p>` : nothing}
      <dialog aria-labelledby="preview-title" @close=${this.closePreview}>
        ${selection ? html`
          <div class="preview-heading"><div><h2 id="preview-title">${selection.pkg.label}</h2><p>${selection.pkg.name} · ${selection.pkg.version}</p></div><button autofocus @click=${this.closePreview}>${t("Close")}</button></div>
          <div class="preview-controls">
            <label>${t("Widget or snippet")}<select .value=${selection.member.id} @change=${(event: Event) => {
              const member = members.find(member => member.id === (event.target as HTMLSelectElement).value)
              if(!member) return
              this.selected = {pkg: selection.pkg, member}
              this.defaultHTML = null
              this.currentHTML = ""
              void this.loadPreview()
            }}>
              ${["widget", "snippet"].map(kind => members.some(member => member.kind === kind) ? html`<optgroup label=${t(kind === "widget" ? "Widgets" : "Snippets")}>${members.filter(member => member.kind === kind).map(member => html`<option value=${member.id} ?selected=${member.id === selection.member.id}>${member.label}</option>`)}</optgroup>` : nothing)}
            </select></label>
            <button @click=${() => this.loadPreview(true)}>${t("Reset example")}</button><span class="learner">${t("Learner view")}</span>
          </div>
          ${this.previewStatus ? html`<p class="status preview-status" role="status">${t(this.previewStatus)}</p>` : nothing}
          ${this.previewError ? html`<p class="error preview-error" role="alert">${this.previewError.startsWith("The learner preview could not be loaded. ") ? t("The learner preview could not be loaded. {message}", {message: this.translateKnownPreviewError(this.previewError.slice("The learner preview could not be loaded. ".length))}) : this.previewError.startsWith("This published widget could not start. ") ? t("This published widget could not start. {message}", {message: this.translateKnownPreviewError(this.previewError.slice("This published widget could not start. ".length))}) : t(this.previewError)}</p>` : nothing}
          ${this.frameURL ? html`<iframe title=${t("{name}: learner preview", {name: selection.member.label})} src=${this.frameURL} style=${`height: ${this.frameHeight}px`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen"></iframe>` : nothing}
        ` : nothing}
      </dialog>
    `
  }

  private translateKnownPreviewError(message: string) {
    return ["Try another example or reset the preview.", "The published example could not be downloaded. Reset to retry."]
      .includes(message) ? t(message) : message
  }
}

if(!customElements.get("widget-gallery")) customElements.define("widget-gallery", WidgetGallery)
