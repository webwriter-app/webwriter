import {LitElement, css, html, nothing} from "lit"
import {exampleDocuments} from "../example-documents"
import {cardOverlayStyles} from "./card-overlay"
import type {ExampleDialog} from "./example-dialog"
import "./example-dialog"
import "./example-preview"
import {t, SiteLanguageController} from "../site-language"

/** The layout each example was authored in, named like the editor's layout switch. */
const layouts: Record<string, {name: string, icon: ReturnType<typeof html>}> = {
  canvas: {name: "Canvas", icon: html`<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><rect x=".6" y=".6" width="10.8" height="10.8" rx="2"/><rect x="2.4" y="2.6" width="4.2" height="3" rx=".7" fill="currentColor" stroke="none"/><rect x="5.6" y="6.6" width="4" height="3" rx=".7" fill="currentColor" stroke="none"/></svg>`},
  board: {name: "Board", icon: html`<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x=".6" y="1" width="3.2" height="10" rx=".9"/><rect x="4.4" y="1" width="3.2" height="7" rx=".9"/><rect x="8.2" y="1" width="3.2" height="8.6" rx=".9"/></svg>`},
  document: {name: "Document", icon: html`<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><rect x="1.6" y=".6" width="8.8" height="10.8" rx="1.4"/><path d="M3.6 3.6h4.8M3.6 5.8h4.8M3.6 8h3"/></svg>`},
}

export class ExampleGallery extends LitElement {
  private languageController = new SiteLanguageController(this)
  static styles = [cardOverlayStyles, css`
    :host {display: block; padding-block-end: 4rem; color: #263142}
    * {box-sizing: border-box}
    .cards {display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; list-style: none; margin: 0; padding: 0}
    li {display: flex; min-inline-size: 0}
    .gallery-heading {padding-block: 2.5rem 2rem}
    .thumbnail {display: flex; flex-direction: column; inline-size: 100%; min-inline-size: 0; padding: .6rem; background: #f2f5f9; border: 1px solid #dfe5ed; border-radius: .5rem; color: inherit; text-decoration: none}
    example-preview {flex: 1; block-size: auto; min-block-size: 28rem; border-radius: .2rem; pointer-events: none}
    .metadata {position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: end; gap: .4rem; margin: .65rem .15rem .1rem; pointer-events: none}
    .layout {display: inline-flex; align-items: center; gap: .3rem}
    .layout svg {inline-size: .75rem; block-size: .75rem; color: #617084}
    .pill {padding: .3rem .65rem; border: 1px solid #dfe5ed; border-radius: 999px; background: #fffffff2; color: #263142; font-size: .75rem; font-weight: 600; line-height: 1.4; box-shadow: 0 1px 3px #17203312}
    a:focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
    @media (max-width: 65rem) {.cards {grid-template-columns: repeat(2, minmax(0, 1fr))}}
    @media (max-width: 42rem) {.cards {grid-template-columns: 1fr; gap: 2.5rem}}
  `]
  private onClick(event: MouseEvent, id: string) {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void this.renderRoot.querySelector<ExampleDialog>("example-dialog")!.open(id)
  }
  render() {
    return html`<header class="gallery-heading"><slot name="heading"></slot></header>
    <ul class="cards" aria-label=${t("Example documents")}>${exampleDocuments.map(example => html`<li>
      <a class="thumbnail example-card" data-card-overlay=${t("Show example")} href=${`?example=${example.id}`} aria-label=${t("Try {title}", {title: t(example.title)})} @click=${(event: MouseEvent) => this.onClick(event, example.id)}>
        <example-preview compact example-id=${example.id}></example-preview>
        <span class="metadata">${layouts[example.layout] ? html`<span class="pill layout">${layouts[example.layout].icon}${t(layouts[example.layout].name)}</span>` : nothing}<span class="pill">${t(example.subject)}</span><span class="pill">${t(example.duration)}</span></span>
      </a>
    </li>`)}</ul>
    <example-dialog></example-dialog>`
  }
}
if(!customElements.get("example-gallery")) customElements.define("example-gallery", ExampleGallery)
