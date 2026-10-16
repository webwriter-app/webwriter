import {LitElement, css, html, nothing, unsafeCSS} from "lit"
import {unsafeHTML} from "lit/directives/unsafe-html.js"
import {keyed} from "lit/directives/keyed.js"
import {exampleDocuments, loadExampleDocument, type ExampleDocument} from "../example-documents"
import type {ExampleDialog} from "./example-dialog"
import "./example-dialog"
import {cardOverlayStyles} from "./card-overlay"
import showcaseStyles from "./example-showcase.css?raw"
import {t, SiteLanguageController} from "../site-language"

/** A compact, non-interactive excerpt of an actual example, never invented UI. */
export class ExamplePreview extends LitElement {
  private languageController = new SiteLanguageController(this, () => { if(this.exampleId) void this.reload() })
  static properties = {exampleId: {attribute: "example-id"}, source: {state: true}, outgoing: {state: true}, error: {state: true}}
  static styles = css`
    :host {display: block; block-size: 35rem; min-inline-size: 0; color: #373c44; font-family: system-ui, sans-serif; line-height: 1.5}
    * {box-sizing: border-box}
    .preview {display: grid; block-size: 100%; min-block-size: 0; isolation: isolate}
    .page, .placeholder {grid-area: 1 / 1; min-inline-size: 0; min-block-size: 0; block-size: 100%; border: 1px solid #dfe5ed; border-radius: .25rem; background: #fff; overflow: hidden}
    .page {padding: 1.6rem; animation: appear 280ms ease both}
    .outgoing {pointer-events: none; animation: disappear 280ms ease both}
    @keyframes appear {from {opacity: 0} to {opacity: 1}}
    @keyframes disappear {from {opacity: 1} to {opacity: 0}}
    @media (prefers-reduced-motion: reduce) {.page {animation-duration: 1ms}}
    h2 {font-size: 1.65rem; line-height: 1.2; margin: 0 0 .85rem; letter-spacing: -.025em; color: #172033}
    .intro {font-size: .8rem; margin: 0 0 1.2rem; color: #536174; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden}
    .visual {font-size: .75rem; margin-block: 1.25rem}
    figure {margin: 0} svg {display: block; inline-size: 100%; block-size: auto; max-block-size: 8rem}
    .menu svg {max-block-size: 16rem}
    img {display: block; inline-size: 100%; block-size: 9rem; object-fit: cover; border-radius: .2rem}
    figcaption {font-size: .7rem; color: #617084; margin-block-start: .5rem}
    table {inline-size: 100%; border-collapse: collapse; font-size: .75rem}
    caption {text-align: start; padding-block-end: .5rem; color: #617084}
    th, td {padding: .45rem .35rem; text-align: start; border-bottom: 1px solid #dfe5ed}
    th {font-weight: 600; background: #f7f9fc}
    blockquote {margin: 0; padding-inline-start: .8rem; border-inline-start: 2px solid #c3d3e4}
    .code {border: 1px solid #dfe5ed; border-radius: .3rem; overflow: hidden; margin-block-start: 1.2rem}
    pre {margin: 0; padding: .8rem; overflow: hidden; background: #f7f9fc; font: .7rem/1.7 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere}
    .code-label, .audio {display: flex; align-items: center; justify-content: space-between; padding: .55rem .8rem; font-size: .7rem; color: #536174}
    .code-label span:last-child {color: #155e9b; font-weight: 600}
    .steps {display: flex; gap: .35rem; list-style: none; padding: 0 0 .5rem; margin: 0; border-bottom: 1px solid #dfe5ed; font-size: .7rem; color: #617084}
    .steps li {flex: 1; padding: .4rem .25rem; border: 1px solid transparent; border-radius: .3rem; text-align: center}
    .steps li[aria-current="step"] {color: #155e9b; background: #eaf2fb; border-color: #c8dced; font-weight: 600}
    .timeline {display: grid; gap: .65rem; border-inline-start: 2px solid #c8dced; margin: 1rem 0 0 .3rem; padding-inline-start: 1rem; font-size: .75rem}
    .event {position: relative} .event::before {content: ""; position: absolute; inset-inline-start: -1.35rem; inset-block-start: .4rem; inline-size: .5rem; block-size: .5rem; border-radius: 50%; background: #155e9b}
    .event strong {display: block; font-size: .7rem; color: #155e9b}
    .audio {border: 1px solid #dfe5ed; border-radius: 1.5rem; margin-block-start: .8rem; justify-content: start; gap: .65rem; background: #f7f9fc}
    .closing {font-size: .8rem; color: #536174; margin: 1.2rem 0 0}
    :host([compact]) {block-size: 28rem}
    :host([compact]) .page {padding: 1.25rem}
    :host([compact]) h2 {font-size: 1.4rem}
    :host([compact]) .intro {display: none}
    :host([compact]) img {block-size: 8rem}
    :host([compact]) .menu svg {max-block-size: 14rem}
    :host([compact]) pre {font-size: .65rem; line-height: 1.6}
    .placeholder {display: grid; place-items: center; color: #617084; font-size: .875rem}
    @media (max-width: 25rem) {.page {padding: 1.1rem} h2 {font-size: 1.4rem}}
  `
  exampleId = "binary"
  private source: Document | null = null
  private outgoing: Document | null = null
  private error = false
  private revision = 0

  protected async updated(changed: Map<string, unknown>) {
    if(!changed.has("exampleId")) return
    await this.reload()
  }

  private async reload() {
    const revision = ++this.revision
    this.error = false
    try {
      const source = await loadExampleDocument(this.exampleId)
      if(revision === this.revision) {
        this.outgoing = this.source
        this.source = source
      }
    }
    catch { if(revision === this.revision) this.error = true }
  }

  render() {
    return html`<div class="preview">
      ${this.source ? keyed(this.source, this.renderPage(this.source)) : html`<div class="placeholder">${this.error ? t("Preview unavailable") : t("Loading example…")}</div>`}
      ${this.outgoing ? keyed(this.outgoing, this.renderPage(this.outgoing, true)) : nothing}
    </div>`
  }

  private renderPage(source: Document, outgoing = false) {
    const intro = [...source.body.querySelectorAll("p")].find(p => !p.querySelector("small") && !p.closest("figure, webwriter-task"))
    const visual = source.body.querySelector("figure") ?? source.body.querySelector("table, blockquote")
    const code = source.querySelector("webwriter-code-javascript")?.getAttribute("code")
    const events = [...source.querySelectorAll("webwriter-timeline-event")].slice(0, 3)
    const photo = source.querySelector("figure:has(img)")?.cloneNode(true) as HTMLElement | undefined
    photo?.querySelector("figcaption")?.remove()
    const audio = source.querySelector("audio, video")
    const slides = [...source.querySelectorAll("webwriter-slide")]
    const menu = visual?.querySelector("#cafe-menu-title")
    const reflection = source.querySelector("webwriter-geogebra") ? source.querySelector("label[for]")?.textContent : null
    return html`<div class=${outgoing ? "page outgoing" : "page"} aria-hidden=${outgoing ? "true" : nothing} ?inert=${outgoing} @animationend=${(event: AnimationEvent) => {
      if(outgoing && event.target === event.currentTarget && this.outgoing === source) this.outgoing = null
    }}>
      <h2>${source.querySelector("h1")?.textContent}</h2>
      <p class="intro">${intro?.textContent}</p>
      ${slides.length ? html`<ol class="steps" aria-label=${t("Document steps")}>${slides.map((slide, index) => html`<li aria-current=${index === 0 ? "step" : nothing}>${index + 1}. ${slide.querySelector("h2, h3")?.textContent}</li>`)}</ol>` : nothing}
      ${photo ? html`<div class="visual">${unsafeHTML(photo.outerHTML)}</div>` : visual ? html`<div class=${menu ? "visual menu" : "visual"}>${unsafeHTML(visual.outerHTML)}</div>` : nothing}
      ${code ? html`<div class="code"><pre>${code}</pre><div class="code-label"><span>JavaScript</span><span>▶ ${t("Run")}</span></div></div>` : nothing}
      ${events.length ? html`<div class="timeline">${events.map(event => html`<div class="event"><strong>${Number(event.getAttribute("date"))}</strong>${event.querySelector("webwriter-timeline-event-title")?.textContent}</div>`)}</div>` : nothing}
      ${audio ? html`<div class="audio"><span aria-hidden="true">▶</span><span>${audio.getAttribute("aria-label") ?? t("Listen to the field recording")}</span></div>` : nothing}
      ${reflection ? html`<p class="closing">${reflection}</p>` : nothing}
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

  private openExample(event: MouseEvent) {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void this.renderRoot.querySelector<ExampleDialog>("example-dialog")!.open(this.selected.id)
  }

  render() {
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
      <div class="subjects" role="group" aria-label=${t("Example subject")}>${exampleDocuments.map(example => html`<button aria-pressed=${String(example.id === this.selected.id)} @click=${() => {this.selected = example; this.startCycling()}}>${t(example.subject)}</button>`)}</div>
    </div>`
  }
}

if(!customElements.get("example-preview")) customElements.define("example-preview", ExamplePreview)
if(!customElements.get("example-showcase")) customElements.define("example-showcase", ExampleShowcase)
