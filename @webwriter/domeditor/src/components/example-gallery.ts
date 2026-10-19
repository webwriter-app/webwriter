import {LitElement, css, html} from "lit"
import {exampleDocuments} from "../example-documents"
import {cardOverlayStyles} from "./card-overlay"
import type {ExampleDialog} from "./example-dialog"
import type {DocumentLayoutMode} from "../document-layout"
import {documentLayoutModes, documentLayoutLabel} from "./layout-preview"
import "./example-dialog"
import "./example-preview"
import {t, SiteLanguageController} from "../site-language"

export class ExampleGallery extends LitElement {
  private languageController = new SiteLanguageController(this)
  static properties = {selectedMode: {state: true}, selectedModes: {state: true}}
  private selectedMode: DocumentLayoutMode = "document"
  private selectedModes: Record<string, DocumentLayoutMode> = {}
  static styles = [cardOverlayStyles, css`
    :host {display: block; padding-block-end: 4rem; color: #263142}
    * {box-sizing: border-box}
    .cards {display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; list-style: none; margin: 0; padding: 0}
    li {min-inline-size: 0}
    .gallery-heading {display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; padding-block: 2.5rem 2rem}
    .gallery-heading .layout-tabs {justify-content: end; margin: 0; margin-inline-start: auto}
    .layout-card {display: flex; flex-direction: column}
    .card-panel {display: flex; flex: 1; min-inline-size: 0}
    .layout-tabs {display: flex; flex-wrap: wrap; gap: .2rem; margin: 0 0 .5rem; padding: 0; list-style: none}
    .layout-tab {padding: .45rem .65rem; border: 1px solid transparent; border-radius: .35rem; color: #40556b; background: transparent; font: inherit; font-size: .8rem; line-height: 1.3; cursor: pointer}
    .layout-tab:hover {background: #f2f5f9}
    .layout-tab[aria-selected="true"] {border-color: #dfe5ed; color: #183b5b; background: #f2f5f9; font-weight: 650}
    .thumbnail {display: flex; flex-direction: column; inline-size: 100%; min-inline-size: 0; padding: .6rem; background: #f2f5f9; border: 1px solid #dfe5ed; border-radius: .5rem; color: inherit; text-decoration: none}
    example-preview {flex: 1; block-size: auto; min-block-size: 28rem; border-radius: .2rem; pointer-events: none}
    .metadata {position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: end; gap: .4rem; margin: .65rem .15rem .1rem; pointer-events: none}
    .pill {padding: .3rem .65rem; border: 1px solid #dfe5ed; border-radius: 999px; background: #fffffff2; color: #263142; font-size: .75rem; font-weight: 600; line-height: 1.4; box-shadow: 0 1px 3px #17203312}
    a:focus-visible, button:focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
    @media (max-width: 65rem) {.cards {grid-template-columns: repeat(2, minmax(0, 1fr))}}
    @media (max-width: 42rem) {.cards {grid-template-columns: 1fr; gap: 2.5rem}}
  `]
  private onClick(event: MouseEvent, id: string, mode: DocumentLayoutMode) {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void this.renderRoot.querySelector<ExampleDialog>("example-dialog")!.open(id, true, mode)
  }
  private selectMode(id: string, mode: DocumentLayoutMode) {
    if(id === "gallery") {
      this.selectedMode = mode
      this.selectedModes = {}
    }
    else this.selectedModes = {...this.selectedModes, [id]: mode}
  }
  private onTabKeydown(event: KeyboardEvent, id: string, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % documentLayoutModes.length
      : event.key === "ArrowLeft" ? (index + documentLayoutModes.length - 1) % documentLayoutModes.length
      : event.key === "Home" ? 0 : event.key === "End" ? documentLayoutModes.length - 1 : -1
    if(nextIndex < 0) return
    event.preventDefault()
    const mode = documentLayoutModes[nextIndex]
    this.selectMode(id, mode)
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(`#${id}-layout-${mode}`)?.focus())
  }
  private renderLayoutTabs(id: string, selected: DocumentLayoutMode, label = t("Layout")) {
    return html`<div class="layout-tabs" role="tablist" aria-label=${label}>
      ${documentLayoutModes.map((mode, index) => html`<button
        id=${`${id}-layout-${mode}`}
        class="layout-tab"
        type="button"
        role="tab"
        aria-selected=${String(selected === mode)}
        aria-controls=${`${id}-layout-panel`}
        tabindex=${selected === mode ? 0 : -1}
        @click=${() => this.selectMode(id, mode)}
        @keydown=${(event: KeyboardEvent) => this.onTabKeydown(event, id, index)}
      >${t(documentLayoutLabel(mode))}</button>`)}
    </div>`
  }
  render() {
    return html`<header class="gallery-heading"><slot name="heading"></slot>${this.renderLayoutTabs("gallery", this.selectedMode)}</header>
    <div id="gallery-layout-panel" role="tabpanel" aria-labelledby=${`gallery-layout-${this.selectedMode}`}>
      <ul class="cards" aria-label=${t("Example documents")}>${exampleDocuments.map(example => html`<li class="layout-card">
        ${this.renderCard(example)}
      </li>`)}</ul>
    </div>
    <example-dialog></example-dialog>`
  }
  private renderCard(example: typeof exampleDocuments[number]) {
    const mode = this.selectedModes[example.id] ?? this.selectedMode
    return html`${this.renderLayoutTabs(example.id, mode, `${t(example.title)}: ${t("Layout")}`)}
    <div class="card-panel" id=${`${example.id}-layout-panel`} role="tabpanel" aria-labelledby=${`${example.id}-layout-${mode}`}>
      <a class="thumbnail example-card" data-card-overlay=${t("Show example")} href=${`?example=${example.id}${mode === "document" ? "" : `&layout=${mode}`}`} aria-label=${t("Try {title}", {title: t(example.title)})} @click=${(event: MouseEvent) => this.onClick(event, example.id, mode)}>
        <example-preview compact example-id=${example.id} layout=${mode}></example-preview>
        <span class="metadata"><span class="pill">${t(example.subject)}</span><span class="pill">${t(example.duration)}</span></span>
      </a>
    </div>`
  }
}
if(!customElements.get("example-gallery")) customElements.define("example-gallery", ExampleGallery)
