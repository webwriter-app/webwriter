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
    .thumbnail {display: block; padding: .6rem; background: #f2f5f9; border: 1px solid #dfe5ed; border-radius: .5rem; color: inherit; text-decoration: none}
    example-preview {block-size: 28rem; overflow: hidden; border-radius: .2rem; pointer-events: none}
    .metadata {position: absolute; inset-inline-end: 1rem; inset-block-end: 1rem; z-index: 1; display: flex; flex-wrap: wrap; justify-content: end; gap: .4rem; max-inline-size: calc(100% - 2rem); pointer-events: none}
    .pill {padding: .3rem .65rem; border: 1px solid #dfe5ed; border-radius: 999px; background: #fffffff2; color: #263142; font-size: .75rem; font-weight: 600; line-height: 1.4; box-shadow: 0 1px 3px #17203312}
    a:focus-visible, button:focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
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
      <a class="thumbnail example-card" data-card-overlay=${t("Show example")} href=${`?example=${example.id}`} aria-label=${t("Try {title}", {title: t(example.title)})} @click=${(event: MouseEvent) => this.onClick(event, example.id)}>
        <example-preview compact example-id=${example.id}></example-preview>
        <span class="metadata"><span class="pill">${t(example.subject)}</span><span class="pill">${t(example.duration)}</span></span>
      </a>
    </li>`)}</ul>
    <example-dialog></example-dialog>`
  }
}
if(!customElements.get("example-gallery")) customElements.define("example-gallery", ExampleGallery)
