import {LitElement, css, html} from "lit"
import {documentLayoutLabel, documentLayoutModes, documentLayoutPreviewStyles, renderDocumentLayoutPreview} from "./layout-preview"
import {t, language, SiteLanguageController} from "../site-language"
import documentVideo from "../assets/layouts/document.mp4?url"
import canvasVideo from "../assets/layouts/canvas.mp4?url"
import slidesVideo from "../assets/layouts/slides.mp4?url"
import boardVideo from "../assets/layouts/board.mp4?url"

const layouts = {
  document: {video: documentVideo, description: "Bring writing, media, and interactive activities together on a flowing page.", tools: ["Google Docs", "Microsoft Word"]},
  canvas: {video: canvasVideo, description: "Arrange ideas, images, and widgets freely on an open canvas.", tools: ["Miro", "FigJam"]},
  slides: {video: slidesVideo, description: "Guide learners through a presentation with interactive content on every slide.", tools: ["PowerPoint", "Google Slides"]},
  board: {video: boardVideo, description: "Collect and organize contributions as cards in columns for everyone to explore.", tools: ["Padlet", "Trello"]},
} as const

const localizedVideos = import.meta.glob("../assets/layouts/*/*.mp4", {eager: true, query: "?url", import: "default"}) as Record<string, string>

/** Editor miniatures with short recordings on hover, focus, or an explicit tap. */
export class LayoutShowcase extends LitElement {
  private languageController = new SiteLanguageController(this, () => this.stopPreview())
  private activeVideo: HTMLVideoElement | null = null
  private playbackRequest = 0

  private stopPreview = (event?: Event) => {
    if((event as PointerEvent | undefined)?.pointerType === "touch") return
    this.playbackRequest++
    if(!this.activeVideo) return
    this.activeVideo.pause()
    this.activeVideo.currentTime = 0
    this.activeVideo.classList.remove("playing")
    this.activeVideo = null
  }

  private async playPreview(event: Event) {
    if(event.type === "pointerenter" && (event as PointerEvent).pointerType === "touch") return
    this.stopPreview()
    if(event.type !== "click" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const video = (event.currentTarget as HTMLElement).querySelector("video")!
    const request = this.playbackRequest
    this.activeVideo = video
    video.muted = true
    try {
      await video.play()
      if(request === this.playbackRequest) video.classList.add("playing")
      else if(this.activeVideo !== video) video.pause()
    }
    catch {
      // Keep the miniature when playback is unavailable or was interrupted.
      if(request === this.playbackRequest) this.stopPreview()
    }
  }

  disconnectedCallback() {
    this.stopPreview()
    super.disconnectedCallback()
  }

  static styles = [documentLayoutPreviewStyles, css`
    :host {display: block; color: #263142; font-family: system-ui, sans-serif}
    * {box-sizing: border-box}
    .cards {display: grid; grid-template-columns: repeat(2, minmax(0, 31rem)); justify-content: center; gap: 2.5rem 3rem}
    article {min-inline-size: 0; overflow: hidden; border: 1px solid #dfe5ed; border-radius: .6rem; background: white}
    .layout-preset-name {display: none}
    .visual:focus-visible {outline: 2px solid #1b639c; outline-offset: -3px}
    .visual {position: relative; display: grid; place-items: center; width: 100%; height: clamp(12rem, 26vw, 13rem); container-type: inline-size; overflow: hidden; padding: .75rem; border: 0; border-bottom: 1px solid #dfe5ed; background: #f7f9fc; font: inherit; color: inherit; text-align: start; cursor: pointer}
    video {position: absolute; left: 50%; top: 50%; width: 40rem; height: 22.5rem; max-width: none; transform: translate(-50%, -50%); object-fit: cover; background: white; opacity: 0; pointer-events: none}
    /* Keep the double-density video at a fixed size and crop its edges. */
    video.playing {opacity: 1}
    .play-icon {position: absolute; right: .65rem; bottom: .65rem; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 1px solid #d1dce8; border-radius: 50%; background: #ffffffed; color: #1b639c; pointer-events: none}
    .play-icon svg {width: .85rem; height: .85rem; margin-left: .1rem; fill: currentColor}
    .visual:has(video.playing) .play-icon {opacity: 0}
    .document-layout-preview {flex: none; width: 17rem; max-width: 100%; height: auto; min-height: 0; aspect-ratio: 16 / 9; padding: .5rem; border: 0; border-radius: .25rem; background-color: #f7f9fc}
    .layout-preset-item {padding: .5rem; border-radius: .25rem}
    .layout-preset-line {height: .25rem; margin-top: .3rem}
    .document-layout-preview .mock-heading {height: .45rem; margin-bottom: .3rem}
    .document-layout-preview .mock-page {width: 6rem; padding: .7rem}
    .document-layout-preview .mock-image {height: 2.2rem; margin-top: .6rem; border-radius: .2rem}
    .document-layout-preview.canvas {background-size: 14px 14px}
    .document-layout-preview.canvas .layout-preset-item:nth-child(3) {height: 32%}
    .document-layout-preview.slides .mock-slide {width: min(88%, 14rem); max-height: none; box-shadow: 7px 7px 0 #e5eef7, 8px 8px 0 #b8c8d9}
    .document-layout-preview.board {gap: .45rem}
    .document-layout-preview.board .board-column {gap: .4rem; padding: .45rem; border-radius: .35rem}
    .document-layout-preview.board .board-column > .mock-heading {flex-basis: .3rem; margin: .1rem 0 .2rem}
    .document-layout-preview.board .board-card {padding: .4rem}
    .document-layout-preview.board .board-card.short-card {height: 2rem}
    .document-layout-preview.board .board-card.medium-card {height: 3rem}
    .document-layout-preview.board .board-card.tall-card {height: 4rem}
    .document-layout-preview.board .board-card .layout-preset-line {flex-basis: .18rem; margin-top: .22rem}
    .document-layout-preview.board .board-card .layout-preset-line.mock-heading {height: .25rem; margin: 0 0 .15rem}
    .document-layout-preview.board .mock-image {flex-basis: 1.2rem; height: 1.2rem; margin-top: .35rem}
    .details {padding: 1.25rem}
    h3 {margin: 0 0 .65rem; color: #172033; font-size: 1.25rem; line-height: 1.3; letter-spacing: -.025em}
    p {margin: 0; font-size: .9rem; line-height: 1.6; color: #536174}
    .related {display: flex; flex-wrap: wrap; gap: .4rem; align-items: baseline; margin-top: 1rem; font-size: .8rem; color: #617084}
    ul {display: flex; flex-wrap: wrap; gap: .35rem; margin: 0; padding: 0; list-style: none}
    li:not(:last-child)::after {content: ","}
    @media (max-width: 50rem) {.cards {grid-template-columns: minmax(0, 31rem)} .details {padding: 1.25rem}}
  `]
  render() {
    return html`<div class="cards">${documentLayoutModes.map(mode => html`<article aria-labelledby=${`${mode}-title`}
      @pointerenter=${this.playPreview} @pointerleave=${this.stopPreview} @focusin=${this.playPreview} @focusout=${this.stopPreview}>
      <button class="visual" type="button" aria-label=${t("Play {layout} preview", {layout: t(documentLayoutLabel(mode))})} @click=${this.playPreview}>${renderDocumentLayoutPreview(mode)}<video src=${language() === "en" ? layouts[mode].video : localizedVideos[`../assets/layouts/${language()}/${mode}.mp4`]} muted playsinline preload="none" aria-hidden="true"></video>
        <span class="play-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M4 2.5a.5.5 0 0 1 .76-.43l9 5.5a.5.5 0 0 1 0 .86l-9 5.5A.5.5 0 0 1 4 13.5Z"/></svg></span>
      </button>
      <div class="details"><h3 id=${`${mode}-title`}>${t(documentLayoutLabel(mode))}</h3><p>${t(layouts[mode].description)}</p>
      <div class="related"><span>${t("Like")}</span><ul aria-label=${t("Related tools")}>${layouts[mode].tools.map(tool => html`<li>${tool}</li>`)}</ul></div></div>
    </article>`)}</div>`
  }
}
if(!customElements.get("layout-showcase")) customElements.define("layout-showcase", LayoutShowcase)
