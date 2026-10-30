import {LitElement, css, html, nothing} from "lit"
import {loadExampleDocument, findExampleDocument, loadExamplePackages} from "../example-documents"
import {resolvePackageDependencies} from "../package-dependencies"
import {previewFrameHTML} from "../frame-document"
import {appendSerializedAssets, serializeDoctype} from "../serialization"
import {editorFrameOrigin} from "../frame-origins"
import {t, language, SiteLanguageController} from "../site-language"
import type {DocumentLayoutMode} from "../document-layout"
import galleryPreviewEntryURL from "virtual:app-entry/gallery-preview-entry"

/** Full documents use the same isolated learner runtime and exporter as the editor. */
export class ExampleDocumentView extends LitElement {
  private languageController = new SiteLanguageController(this, () => { if(this.exampleId) void this.load() })
  static properties = {exampleId: {attribute: "example-id"}, layout: {}, status: {state: true}, error: {state: true}, frameURL: {state: true}, downloadURL: {state: true}}
  static styles = css`
    :host {display: block; color: #263142; font: 1rem/1.5 system-ui, sans-serif}
    .heading {display: flex; align-items: center; gap: 1rem; padding: 1.2rem 1.5rem; border-bottom: 1px solid #dfe5ed}
    .title {display: flex; align-items: baseline; flex-wrap: wrap; gap: .5rem 1.25rem; flex: 1; min-inline-size: 0}
    h2 {margin: 0; font-size: 1.1rem; line-height: 1.3; color: #172033}
    a {color: #155e9b; font-size: .8125rem; text-underline-offset: .2em; white-space: nowrap}
    .download {margin-inline-start: auto}
    button {display: grid; place-items: center; flex: none; inline-size: 2rem; block-size: 2rem; padding: .4rem; border: 0; border-radius: .35rem; color: #536174; background: transparent; cursor: pointer}
    button:hover {background: #f2f5f9}
    button svg {inline-size: 1.2rem; block-size: 1.2rem}
    :is(a, button):focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
    @media (max-width: 42rem) {.heading {padding: 1rem; gap: .65rem} .download {margin-inline-start: 0}}
    .status, .error {margin: 1rem 1.5rem; font-size: .875rem}
    .error {color: #923b2e}
    iframe {display: block; inline-size: 100%; block-size: 65dvh; min-block-size: 20rem; border: 0; background: #fff}
  `
  exampleId = ""
  layout: DocumentLayoutMode = "document"
  private status = ""
  private error = ""
  private frameURL = ""
  private downloadURL = ""
  private frameHTML = ""
  private revision = 0
  private bridgeNonce = ""
  private timeout?: ReturnType<typeof setTimeout>

  connectedCallback() { super.connectedCallback(); window.addEventListener("message", this.onMessage) }
  disconnectedCallback() {
    super.disconnectedCallback()
    this.revision++
    clearTimeout(this.timeout)
    if(this.downloadURL) URL.revokeObjectURL(this.downloadURL)
    window.removeEventListener("message", this.onMessage)
  }
  protected updated(changed: Map<string, unknown>) {
    if((changed.has("exampleId") || changed.has("layout")) && this.exampleId) void this.load()
  }

  private async load() {
    const revision = ++this.revision
    const current = () => revision === this.revision && this.isConnected
    clearTimeout(this.timeout)
    if(this.downloadURL) URL.revokeObjectURL(this.downloadURL)
    this.downloadURL = ""
    this.frameURL = ""
    this.frameHTML = ""
    this.status = "Loading example…"
    this.error = ""
    this.bridgeNonce = crypto.randomUUID()
    this.timeout = setTimeout(() => {
      if(!current()) return
      this.revision++
      this.frameURL = ""
      this.status = ""
      this.error = "The example took too long to load. Close and reopen it to try again."
    }, 45_000)
    try {
      const source = await loadExampleDocument(this.exampleId, this.layout)
      const packages = await loadExamplePackages(source)
      const {map} = await resolvePackageDependencies(packages, location.href)
      if(!current()) return
      const standalone = source.cloneNode(true) as Document
      appendSerializedAssets(standalone, packages, map)
      this.downloadURL = URL.createObjectURL(new Blob([serializeDoctype(standalone.doctype) + standalone.documentElement.outerHTML], {type: "text/html"}))
      const frameOrigin = editorFrameOrigin()
      const base = new URL(import.meta.env.BASE_URL, `${frameOrigin}/`)
      const entry = new URL(galleryPreviewEntryURL, base)
      const firstWidget = packages.flatMap(pkg => pkg.members).find(member => member.kind === "widget" && member.tagName && source.getElementsByTagName(member.tagName).length)
      if(firstWidget?.tagName) entry.searchParams.set("tag", firstWidget.tagName)
      this.frameHTML = previewFrameHTML(source, {bridgeNonce: this.bridgeNonce, packages, importMap: map, hostOrigin: location.origin, frameOrigin, entryURL: entry.href, executeScripts: true})
      const url = new URL("frame-shell.html", base)
      url.searchParams.set("kind", "preview")
      url.searchParams.set("revision", String(revision))
      url.hash = new URLSearchParams({nonce: this.bridgeNonce}).toString()
      this.status = "Loading interactive activities…"
      this.frameURL = url.href
    }
    catch(error) {
      if(!current()) return
      clearTimeout(this.timeout)
      this.status = ""
      this.error = `The example could not be loaded. ${String((error as Error).message ?? error)}`
    }
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.renderRoot.querySelector("iframe")
    if(!frame || !this.frameURL || event.source !== frame.contentWindow || event.origin !== new URL(this.frameURL).origin || event.data?.bridgeNonce !== this.bridgeNonce) return
    if(event.data.type === "webwriter-frame-shell-ready" && event.data.kind === "preview" && event.data.revision === String(this.revision) && this.frameHTML) {
      frame.contentWindow?.postMessage({type: "webwriter-frame-document", html: this.frameHTML}, event.origin)
      this.frameHTML = ""
    }
    else if(event.data.type === "gallery-preview-ready") { clearTimeout(this.timeout); this.status = "" }
    else if(event.data.type === "preview-frame-save") this.renderRoot.querySelector<HTMLAnchorElement>("a[download]")?.click()
    else if(["gallery-preview-error", "webwriter-frame-error"].includes(event.data.type)) {
      clearTimeout(this.timeout)
      this.status = ""
      this.error = `An activity could not start. ${String(event.data.message ?? "Close and reopen the example to try again.").slice(0, 400)}`
    }
  }

  render() {
    const example = findExampleDocument(this.exampleId)
    const translateMessage = (message: string) => {
      for(const prefix of ["The example could not be loaded. ", "An activity could not start. "]) {
        if(message.startsWith(prefix)) {
          const detail = message.slice(prefix.length)
          const fallback = "Close and reopen the example to try again."
          const key = prefix.startsWith("The example") ? "The example could not be loaded. {message}" : "An activity could not start. {message}"
          return t(key, {message: detail === fallback ? t(fallback) : detail})
        }
      }
      return t(message)
    }
    return html`<div class="heading">
      <div class="title"><h2>${example ? t(example.title) : t("Example")}</h2><a href=${`/editor/?example=${this.exampleId}&lang=${language()}${this.layout === "document" ? "" : `&layout=${this.layout}`}`} target="_blank" rel="noopener noreferrer">${t("Edit in WebWriter ↗")}</a>
      ${this.downloadURL ? html`<a class="download" href=${this.downloadURL} download=${`${this.exampleId}${this.layout === "document" ? "" : `-${this.layout}`}.html`}>${t("Download document")}</a>` : nothing}</div>
      <button autofocus aria-label=${t("Close example")} @click=${() => this.dispatchEvent(new CustomEvent("close-example", {bubbles: true, composed: true}))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </div>
      ${this.status ? html`<p class="status" role="status">${t(this.status)}</p>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${translateMessage(this.error)}</p>` : nothing}
      ${this.frameURL ? html`<iframe title=${t("{title}: learner preview", {title: example ? t(example.title) : t("Example")})} src=${this.frameURL} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen"></iframe>` : nothing}`
  }
}
if(!customElements.get("example-document")) customElements.define("example-document", ExampleDocumentView)
