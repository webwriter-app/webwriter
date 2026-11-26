import {LitElement, css, html, nothing, unsafeCSS} from "lit"
import {keyed} from "lit/directives/keyed.js"
import {exampleDocuments, loadExampleDocument, type ExampleDocument} from "../example-documents"
import type {ExampleDialog} from "./example-dialog"
import "./example-dialog"
import {cardOverlayStyles} from "./card-overlay"
import showcaseStyles from "./example-showcase.css?raw"
import {t, SiteLanguageController} from "../site-language"
import {documentLayoutMode} from "../document-layout"
import {exampleMiniature, miniatureInset, miniatureStyles, miniatureWidth} from "./example-miniatures"

type LoadedExample = {id: string, source: Document}

const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim()

/** A hero picture and a miniature of the example in its own layout, built from the example's own words and media. */
export class ExamplePreview extends LitElement {
  private languageController = new SiteLanguageController(this, () => { if(this.exampleId) void this.reload() })
  static properties = {exampleId: {attribute: "example-id"}, loaded: {state: true}, outgoing: {state: true}, error: {state: true}}
  static styles = [miniatureStyles, css`
    :host {display: block; block-size: 35rem; min-inline-size: 0; container-type: inline-size; color: #373c44; font-family: system-ui, sans-serif; line-height: 1.5}
    * {box-sizing: border-box}
    .preview {display: grid; block-size: 100%; min-block-size: 0; isolation: isolate}
    .page, .placeholder {grid-area: 1 / 1; min-inline-size: 0; min-block-size: 0; block-size: 100%; border: 1px solid #dfe5ed; border-radius: .25rem; background: #fff; overflow: hidden}
    .page {display: flex; flex-direction: column; animation: appear 280ms ease both}
    .outgoing {pointer-events: none; animation: disappear 280ms ease both}
    @keyframes appear {from {opacity: 0} to {opacity: 1}}
    @keyframes disappear {from {opacity: 1} to {opacity: 0}}
    @media (prefers-reduced-motion: reduce) {.page {animation-duration: 1ms}}
    h2 {flex: none; margin: 0; padding: .6rem .9rem .55rem; color: #172033; font-size: clamp(1.12rem, 4.6cqi, 1.5rem); line-height: 1.15; letter-spacing: -.02em}
    :host([compact]) {block-size: auto; min-block-size: 28rem}
    :host([compact]) :is(.preview, .page) {block-size: auto; min-block-size: 28rem}
    .placeholder {display: grid; place-items: center; color: #617084; font-size: .875rem}
  `]
  exampleId = exampleDocuments[0].id
  private loaded: LoadedExample | null = null
  private outgoing: LoadedExample | null = null
  private error = false
  private revision = 0
  private resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(([entry]) =>
    this.style.setProperty("--miniature-zoom", String(Math.max(.1, (entry.contentRect.width - miniatureInset) / miniatureWidth))))

  connectedCallback() { super.connectedCallback(); this.resizeObserver?.observe(this) }
  disconnectedCallback() { super.disconnectedCallback(); this.resizeObserver?.disconnect() }

  protected async updated(changed: Map<string, unknown>) {
    if(!changed.has("exampleId")) return
    await this.reload()
  }

  private async reload() {
    const revision = ++this.revision
    const id = this.exampleId
    this.error = false
    try {
      const source = await loadExampleDocument(id)
      if(revision === this.revision) {
        this.outgoing = this.loaded
        this.loaded = {id, source}
      }
    }
    catch { if(revision === this.revision) this.error = true }
  }

  render() {
    return html`<div class="preview">
      ${this.loaded ? keyed(this.loaded, this.renderPage(this.loaded)) : html`<div class="placeholder">${this.error ? t("Preview unavailable") : t("Loading example…")}</div>`}
      ${this.outgoing ? keyed(this.outgoing, this.renderPage(this.outgoing, true)) : nothing}
    </div>`
  }

  private renderPage(example: LoadedExample, outgoing = false) {
    const {source} = example
    const miniature = exampleMiniature(example.id, source)
    const title = normalize(source.title) || normalize(source.querySelector("h1, h2")?.textContent)
    return html`<div class=${`page${outgoing ? " outgoing" : ""}`} lang=${source.documentElement.lang} aria-hidden=${outgoing ? "true" : nothing} ?inert=${outgoing} @animationend=${(event: AnimationEvent) => {
      if(outgoing && event.target === event.currentTarget && this.outgoing === example) this.outgoing = null
    }}>
      ${miniature ? html`<div class="hero">${miniature.hero}</div>` : nothing}
      <h2>${title}</h2>
      <div class=${`frame ${documentLayoutMode(source.body)}`}>${miniature ? html`<div class="mini">${miniature.mini}</div>` : nothing}</div>
    </div>`
  }
}

export class ExampleShowcase extends LitElement {
  static properties = {selected: {state: true}}
  static styles = [cardOverlayStyles, unsafeCSS(showcaseStyles), css`
    :host {display: contents; min-inline-size: 0}
  `]
  private selected: ExampleDocument = exampleDocuments[0]
  private languageController = new SiteLanguageController(this)
  private cycleTimer?: ReturnType<typeof setInterval>

  connectedCallback() { super.connectedCallback(); this.startCycling() }
  disconnectedCallback() { super.disconnectedCallback(); clearInterval(this.cycleTimer) }

  private startCycling() {
    clearInterval(this.cycleTimer)
    this.cycleTimer = setInterval(() => {
      if(this.renderRoot.querySelector<ExampleDialog>("example-dialog")?.shadowRoot?.querySelector("dialog[open]") || document.hidden || this.matches(":hover, :focus-within")
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      this.step(1, false)
    }, 6000)
  }

  private step(direction: 1 | -1, restart = true) {
    const index = exampleDocuments.indexOf(this.selected)
    this.selected = exampleDocuments[(index + direction + exampleDocuments.length) % exampleDocuments.length]
    if(restart) this.startCycling()
  }

  /** Each subject appears once; choosing it again moves to its next example. */
  private selectSubject(subject: string) {
    const examples = exampleDocuments.filter(example => example.subject === subject)
    this.selected = examples[(examples.indexOf(this.selected) + 1) % examples.length]
    this.startCycling()
  }

  private openExample(event: MouseEvent) {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void this.renderRoot.querySelector<ExampleDialog>("example-dialog")!.open(this.selected.id)
  }

  render() {
    const subjects = [...new Set(exampleDocuments.map(example => example.subject))]
    return html`<div class="example-showcase">
      <div class="example-stage">
        <div class="example-frame">
          <a class="document example-card" data-card-overlay=${t("Show example")} href=${`?example=${this.selected.id}`} @click=${this.openExample} aria-label=${t("Try {title}", {title: t(this.selected.title)})}><example-preview example-id=${this.selected.id}></example-preview></a>
          <button class="step previous" aria-label=${t("Previous example")} @click=${() => this.step(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="step next" aria-label=${t("Next example")} @click=${() => this.step(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        </div>
        <div class="caption"><a href="/examples/">${t("Explore the examples →")}</a></div>
        <example-dialog></example-dialog>
      </div>
      <div class="subjects" role="group" aria-label=${t("Example subject")}>${subjects.map(subject => html`<button aria-pressed=${String(this.selected.subject === subject)} @click=${() => this.selectSubject(subject)}>${t(subject)}</button>`)}</div>
    </div>`
  }
}

if(!customElements.get("example-preview")) customElements.define("example-preview", ExamplePreview)
if(!customElements.get("example-showcase")) customElements.define("example-showcase", ExampleShowcase)
