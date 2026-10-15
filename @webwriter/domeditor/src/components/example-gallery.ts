import {LitElement, css, html} from "lit"
import {exampleDocuments} from "../example-documents"
import {cardOverlayStyles} from "./card-overlay"
import type {ExampleDialog} from "./example-dialog"
import "./example-dialog"
import "./example-preview"
import {t, SiteLanguageController} from "../site-language"

export class ExampleGallery extends LitElement {
  private languageController = new SiteLanguageController(this)
  static styles = [cardOverlayStyles, css`
    :host {display: block; padding-block-end: 4rem; color: #263142}
    * {box-sizing: border-box}
    .cards {display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; list-style: none; margin: 0; padding: 0}
    li {min-inline-size: 0}
    .subject {font-size: .75rem; font-weight: 650; color: #155e9b; margin: 0 0 .85rem}
    .thumbnail {display: block; padding: .6rem; background: #f2f5f9; border: 1px solid #dfe5ed; border-radius: .5rem; color: inherit; text-decoration: none}
    example-preview {block-size: 28rem; overflow: hidden; border-radius: .2rem; pointer-events: none}
    h2 {font-size: 1.1rem; line-height: 1.3; margin: 1.2rem 0 .6rem; color: #172033}
    .description {font-size: .875rem; color: #536174; margin: 0 0 1rem}
    a {color: #155e9b; text-underline-offset: .2em}
    a:focus-visible, button:focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
    .actions {display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; font-size: .8125rem}
    .actions span {color: #617084}
    @media (max-width: 65rem) {.cards {grid-template-columns: repeat(2, minmax(0, 1fr))}}
    @media (max-width: 42rem) {.cards {grid-template-columns: 1fr; gap: 2.5rem}}
  `]
  private onClick(event: MouseEvent, id: string) {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void this.renderRoot.querySelector<ExampleDialog>("example-dialog")!.open(id)
  }
  render() {
    return html`<ul class="cards" aria-label=${t("Example documents")}>${exampleDocuments.map(example => html`<li>
      <p class="subject">${t(example.subject)}</p>
      <a class="thumbnail example-card" data-card-overlay=${t("Show example")} href=${`?example=${example.id}`} aria-label=${t("Try {title}", {title: t(example.title)})} @click=${(event: MouseEvent) => this.onClick(event, example.id)}><example-preview compact example-id=${example.id}></example-preview></a>
      <h2>${t(example.title)}</h2><p class="description">${t(example.description)}</p>
      <div class="actions"><a href=${`?example=${example.id}`} @click=${(event: MouseEvent) => this.onClick(event, example.id)}>${t("Try example →")}</a><span>${example.duration}</span></div>
    </li>`)}</ul>
    <example-dialog></example-dialog>`
  }
}
if(!customElements.get("example-gallery")) customElements.define("example-gallery", ExampleGallery)
