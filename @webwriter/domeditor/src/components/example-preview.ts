import {LitElement, css, html, nothing, unsafeCSS} from "lit"
import {unsafeHTML} from "lit/directives/unsafe-html.js"
import {keyed} from "lit/directives/keyed.js"
import {exampleDocuments, loadExampleDocument, type ExampleDocument} from "../example-documents"
import type {ExampleDialog} from "./example-dialog"
import "./example-dialog"
import {cardOverlayStyles} from "./card-overlay"
import showcaseStyles from "./example-showcase.css?raw"
import {t, SiteLanguageController} from "../site-language"
import {documentLayoutMode} from "../document-layout"

type Topic = {heading?: string, text?: Element, visual?: Element}

const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim()
const insideWidget = (element: Element) => {
  for(let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) if(ancestor.localName.includes("-")) return true
  return false
}

/** A compact, non-interactive excerpt of an actual example, never invented UI. */
export class ExamplePreview extends LitElement {
  private languageController = new SiteLanguageController(this, () => { if(this.exampleId) void this.reload() })
  static properties = {exampleId: {attribute: "example-id"}, source: {state: true}, outgoing: {state: true}, error: {state: true}}
  static styles = css`
    :host {display: block; block-size: 35rem; min-inline-size: 0; container-type: inline-size; color: #373c44; font-family: system-ui, sans-serif; line-height: 1.5}
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
    figure {margin: 0}
    img {display: block; inline-size: 100%; block-size: 9rem; object-fit: cover; border-radius: .2rem}
    figcaption {font-size: .7rem; color: #617084; margin-block-start: .5rem}
    table {inline-size: 100%; border-collapse: collapse; font-size: .75rem; table-layout: fixed; overflow-wrap: anywhere}
    caption {text-align: start; padding-block-end: .5rem; color: #617084}
    th, td {padding: .45rem .35rem; text-align: start; vertical-align: top; border-bottom: 1px solid #dfe5ed}
    th {font-weight: 600; background: #f7f9fc}
    td :is(p, ul, ol) {margin: 0}
    .lesson {margin-block-start: 1rem; font-size: .75rem; color: #536174}
    .lesson p {margin: 0}
    :host([compact]) {block-size: auto; min-block-size: 28rem}
    :host([compact]) .preview {block-size: auto; min-block-size: 28rem}
    :host([compact]) .page {padding: 1.25rem; block-size: auto; min-block-size: 28rem; overflow: visible}
    :host([compact]) h2 {font-size: 1.4rem}
    :host([compact]) .intro {display: none}
    :host([compact]) img {block-size: 8rem}
    .placeholder {display: grid; place-items: center; color: #617084; font-size: .875rem}
    .page.canvas {background: radial-gradient(#cad7e5 1px, transparent 1px) 0 0 / 14px 14px #f5f8fc}
    .page.board {background: #edf2f8}
    .layout-topics {display: grid; gap: .65rem; margin-block-start: 1rem; align-items: start}
    .layout-topic {min-inline-size: 0; padding: .8rem; background: white; border: 1px solid #d4deea; border-radius: .35rem; overflow-wrap: anywhere; hyphens: auto}
    .layout-topic h3 {margin: 0 0 .55rem; color: #285b78; font-size: .8rem; line-height: 1.3}
    .layout-topic p {margin: 0; font-size: .7rem; line-height: 1.5}
    .layout-topic .visual {margin: .75rem 0 0}
    .layout-topic img {block-size: 6rem}
    .layout-topic figcaption {display: none}
    .canvas .layout-topics {grid-template-columns: minmax(0, 1fr)}
    .canvas .layout-topic {box-shadow: 0 2px 5px #26374a12}
    .canvas .layout-topic:first-child {margin-inline-end: 1rem}
    .canvas .layout-topic:nth-child(2) {margin-inline-start: 1rem}
    .board .layout-topics {grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem}
    .board .layout-topic {padding: .5rem; background: #f6f8fb}
    .board .layout-topic :is(p, .visual) {padding: .5rem; border: 1px solid #dfe5ed; border-radius: .25rem; background: white}
    .board .layout-topic .visual {margin-block-start: .5rem}
    @container (max-width: 18rem) {.board .layout-topics {grid-template-columns: minmax(0, 1fr)}}
    @media (max-width: 25rem) {.page {padding: 1.1rem} h2 {font-size: 1.4rem}}
  `
  exampleId = exampleDocuments[0].id
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

  private excerptText(element: Element) {
    return [...new Intl.Segmenter(element.ownerDocument.documentElement.lang || "en", {granularity: "sentence"}).segment(normalize(element.textContent))]
      .slice(0, 2).map(({segment}) => segment).join("").trim()
  }

  private briefText(element: Element, words = 24) {
    const segments = this.excerptText(element).split(/\s+/)
    return segments.length > words ? `${segments.slice(0, words).join(" ").replace(/[,;:]$/, "")}…` : segments.join(" ")
  }

  /** Innermost text blocks in reading order. Widget text fills in when the page has too little of its own. */
  private textBlocks(root: ParentNode, minimum = 60, count = 2) {
    const blocks = [...root.querySelectorAll("p, li, td, div, article")].filter(element =>
      !element.closest("figure, details, svg, math") && !element.querySelector("p, li, td, div, article, svg")
      && normalize(element.textContent).length >= minimum)
    const authored = blocks.filter(block => !insideWidget(block))
    return authored.length >= count ? authored : [...authored, ...blocks.filter(block => insideWidget(block))]
  }

  /** The first authored figure or photo, stripped of layout styles that only fit the full page. */
  private visual(root: ParentNode, kinds = "figure:has(img), img") {
    const element = [...root.querySelectorAll(kinds)].find(candidate => !candidate.closest("svg"))
    const visual = (element?.closest("figure") ?? element)?.cloneNode(true) as Element | undefined
    for(const node of visual ? [visual, ...visual.querySelectorAll("*")] : []) {
      node.removeAttribute("style")
      if(node.localName !== "img") node.removeAttribute("width")
      node.removeAttribute("height")
    }
    return visual
  }

  /** Short headings or subtitles before a block name the topic it belongs to. */
  private headingBefore(source: Document, block: Element, title: string) {
    return [...source.body.querySelectorAll("h1, h2, h3, p")].filter(element => {
      const text = normalize(element.textContent)
      return !insideWidget(element) && text && text !== title && (element.localName !== "p" || text.length <= 60)
        && element.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING
    }).map(element => normalize(element.textContent)).at(-1)
  }

  private renderPage(source: Document, outgoing = false) {
    const mode = documentLayoutMode(source.body)
    const title = normalize(source.title) || normalize(source.querySelector("h1, h2")?.textContent)
    return html`<div class=${`page${mode === "document" ? "" : ` ${mode}`}${outgoing ? " outgoing" : ""}`} lang=${source.documentElement.lang} aria-hidden=${outgoing ? "true" : nothing} ?inert=${outgoing} @animationend=${(event: AnimationEvent) => {
      if(outgoing && event.target === event.currentTarget && this.outgoing === source) this.outgoing = null
    }}>
      <h2>${title}</h2>
      ${mode === "board" ? this.renderTopics(this.boardTopics(source)) : mode === "canvas" ? this.renderTopics(this.canvasTopics(source, title)) : this.renderDocument(source)}
    </div>`
  }

  private renderDocument(source: Document) {
    const blocks = this.textBlocks(source.body).filter(block => !block.closest("table"))
    const visual = this.visual(source.body, "figure:has(img), img, table")
    return html`${blocks[0] ? html`<p class="intro">${this.excerptText(blocks[0])}</p>` : nothing}
      ${visual ? html`<div class="visual">${unsafeHTML(visual.outerHTML)}</div>` : nothing}
      ${blocks[1] ? html`<section class="lesson"><p>${this.excerptText(blocks[1])}</p></section>` : nothing}`
  }

  /** The first text and the first figure of the canvas, each with the heading before it. */
  private canvasTopics(source: Document, title: string): Topic[] {
    const [first, second] = this.textBlocks(source.body)
    const figure = [...source.body.querySelectorAll("figure:has(img)")].find(candidate => !insideWidget(candidate))
    const topics: Topic[] = first ? [{heading: this.headingBefore(source, first, title), text: first}] : []
    if(figure) topics.push({heading: normalize(figure.querySelector("figcaption")?.textContent) || undefined, visual: this.visual(figure)})
    else if(second) {
      const heading = this.headingBefore(source, second, title)
      topics.push({heading: heading === topics[0]?.heading ? undefined : heading, text: second})
    }
    return topics
  }

  /** The opening column and the first later column with a picture, each with heading, text, and picture. */
  private boardTopics(source: Document): Topic[] {
    const columns = [...source.body.querySelectorAll("section.ww-board-column")]
    const pictured = columns.slice(1).find(column => this.visual(column))
    return [columns[0], pictured ?? columns[1]].filter(Boolean).map(column => ({
      heading: normalize(column.querySelector(":scope > h2")?.textContent) || undefined,
      text: this.textBlocks(column, 40, 1)[0],
      visual: this.visual(column),
    }))
  }

  private renderTopics(topics: Topic[]) {
    return html`<div class="layout-topics">${topics.map(topic => html`<section class="layout-topic">
      ${topic.heading ? html`<h3>${topic.heading}</h3>` : nothing}
      ${topic.text ? html`<p>${this.briefText(topic.text)}</p>` : nothing}
      ${topic.visual ? html`<div class="visual">${unsafeHTML(topic.visual.outerHTML)}</div>` : nothing}
    </section>`)}</div>`
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
