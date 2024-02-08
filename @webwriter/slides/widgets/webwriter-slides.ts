/** config */
import {html, css, PropertyValueMap} from "lit"
import {EditingConfig, LitElementWw} from "@webwriter/lit"
import {customElement, property, queryAll, queryAssignedElements} from "lit/decorators.js"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"

import "@shoelace-style/shoelace/dist/themes/light.css"

import fullscreenIcon from "bootstrap-icons/icons/fullscreen.svg"
import fullscreenExitIcon from "bootstrap-icons/icons/fullscreen-exit.svg"
import plusSquareIcon from "bootstrap-icons/icons/plus-square.svg"
import chevronLeftIcon from "bootstrap-icons/icons/chevron-left.svg"
import chevronRightIcon from "bootstrap-icons/icons/chevron-right.svg"
import { WebwriterSlide } from "./webwriter-slide"

@customElement("webwriter-slides")
export class WebwriterSlides extends LitElementWw {
  
  constructor() {
    super()
    this.addEventListener("fullscreenchange", () => this.requestUpdate())
  }

  protected firstUpdated(): void {
    this.requestUpdate()
  }

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon-button": SlIconButton
  }

  @property({attribute: false, state: true})
  activeSlideIndex = 0

  get activeSlide() {
    return this.slides[this.activeSlideIndex]
  }

  static styles = css`
    :host {
      position: relative;
      background: white;
      display: block;
    }

    :host(:not(:fullscreen)) {
      border: 1px solid darkgray;
      aspect-ratio: 16/9;
      width: 100%;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }

    [part=actions] {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: flex;
      flex-direction: row;
      gap: 4px;
    }

    .slides-index {
      user-select: none;
      font-size: 1rem;
      color: var(--sl-color-gray-800);
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5ch;
    }

    :host(:fullscreen) [part=actions] sl-icon-button {
      color: black;
    }
    
    ::slotted(webwriter-slide:not([active])) {
      display: none !important;
    }

    slot:not([name]) {
      display: block;
      width: 100%;
      height: 100%;
      
      &::slotted {
        width: 100%;
        height: 100%;
      }
    }
  `

  get isFullscreen() {
    return this.ownerDocument.fullscreenElement === this
  }

  get iconSrc() {
    return this.isFullscreen? fullscreenExitIcon: fullscreenIcon
  }

  @queryAssignedElements()
  slides?: WebwriterSlide[]

  addSlide() {
    const slide = this.ownerDocument.createElement("webwriter-slide") as WebwriterSlide
    const p = this.ownerDocument.createElement("p")
    slide.appendChild(p)
    this.appendChild(slide)
    this.activeSlideIndex = this.slides.indexOf(slide)
    this.slides[this.activeSlideIndex].focus()
  }

  nextSlide(backwards=false, step=1) {
    const i = this.activeSlideIndex
    const n = this.slides?.length - 1
    this.activeSlideIndex = backwards
      ? Math.max(0, i - step)
      : Math.min(n, i + step)
  }

  updated(changed: any) {
    super.updated(changed)
    this.slides?.forEach((slide, i) => slide.active = i === this.activeSlideIndex)
  }

  get hasNextSlide() {
    return this.activeSlideIndex < this.slides?.length - 1
  }

  get hasPreviousSlide() {
    return this.activeSlideIndex > 0
  }

  handleNextSlideClick(e: MouseEvent, backwards=false) {
    if(e.shiftKey) {
      this.nextSlide(backwards, this.slides.length)
    }
    else if(e.ctrlKey) {
      this.nextSlide(backwards, 10)
    }
    else {
      this.nextSlide(backwards)
    }

  }

  render() {
    return html`
      <slot></slot>
      <aside part="options">
      </aside>
      <aside part="actions">
        <sl-icon-button class="author-only" @click=${() => this.addSlide()} src=${plusSquareIcon}></sl-icon-button>
        <sl-icon-button @click=${(e: MouseEvent) => this.handleNextSlideClick(e, true)} src=${chevronLeftIcon} ?disabled=${!this.hasPreviousSlide}></sl-icon-button>
        <div class="slides-index">
          <span>${this.activeSlideIndex + 1}</span> / <span>${this.slides?.length}</span>
        </div>
        <sl-icon-button @click=${(e: MouseEvent) => this.handleNextSlideClick(e)} src=${chevronRightIcon}  ?disabled=${!this.hasNextSlide}></sl-icon-button>
        <sl-icon-button id="fullscreen" src=${this.iconSrc} @click=${() => !this.isFullscreen? this.requestFullscreen(): this.ownerDocument.exitFullscreen()}></sl-icon-button>
      </aside>
    `
  }


}