import {css, html} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"

import IconArrowsMove from "bootstrap-icons/icons/arrows-move.svg"
import IconArrowUp from "bootstrap-icons/icons/arrow-up.svg"
import IconArrowDown from "bootstrap-icons/icons/arrow-down.svg"
import "@shoelace-style/shoelace/dist/themes/light.css"

@customElement("webwriter-order-item")
export class WebwriterOrderItem extends LitElementWw {

  static localization = {}

  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  static dropPreviewElement: WebwriterOrderItem 

  static clearDropPreviewElement() {
    if(this.dropPreviewElement) {
      this.dropPreviewElement.dropPreview = undefined
      this.dropPreviewElement = undefined
    }
  }

  @property({attribute: true, reflect: true, converter: {toAttribute: (v: boolean) => v? "true": "false", fromAttribute: (attr: string) => attr === "true"}})
  draggable = true

  msg = (str: string) => this.lang in WebwriterOrderItem.localization? WebwriterOrderItem.localization[this.lang][str] ?? str: str

  get elementIndex() {
    return Array.from(this.parentElement.children).indexOf(this)
  }

  getSibling(i: number) {
    return this.parentElement.children.item(i)
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener("dragstart", e => {
      console.log("dragstart", this.elementIndex)
      this.dropPreview = undefined
      e.dataTransfer.setData("text/plain", String(this.elementIndex))
    }, {passive: true})
    this.addEventListener("drop", e => {
      const i = parseInt(e.dataTransfer.getData("text/plain"))
      if(i === this.elementIndex) {
        return
      }
      else {
        const toDrop = this.getSibling(i) as WebwriterOrderItem
        const inTopHalf = e.offsetY < this.offsetHeight / 2
        this.insertAdjacentElement(inTopHalf? "beforebegin": "afterend", toDrop)
      }
      WebwriterOrderItem.clearDropPreviewElement()
    }, {passive: true})
    this.addEventListener("dragover", e => {
      WebwriterOrderItem.clearDropPreviewElement()
      const inTopHalf = e.offsetY < this.offsetHeight / 2
      this.dropPreview = inTopHalf? "top": "bottom"
      WebwriterOrderItem.dropPreviewElement = this
    }, {passive: true})
    this.addEventListener("dragleave", () => WebwriterOrderItem.clearDropPreviewElement(), {passive: true})
    document.addEventListener("dragend", () => WebwriterOrderItem.clearDropPreviewElement(), {passive: true})
  }

  @property({type: String, attribute: true, reflect: true})
  dropPreview: "top" | "bottom" | undefined = undefined

  static styles = css`
    :host {
      width: 100%;
      display: flex !important;
      flex-direction: row;
      align-items: center;
      position: relative;
      font-size: var(--sl-input-font-size-medium);
    }

    :host([droppreview=top])::before {
      content: "";
      position: absolute;
      top: -2px;
      height: 2px;
      width: 100%;
      background: var(--sl-color-primary-600);
    }

    :host([droppreview=bottom])::before {
      content: "";
      position: absolute;
      bottom: -2px;
      height: 2px;
      width: 100%;
      background: var(--sl-color-primary-600);
    }

    slot {
      display: block;
    }

    #order-buttons {
      position: absolute;
      right: 0;

      & .order-button::part(base) {
        padding: 0;
      }
    }
  `

  moveUp() {
    const prev = this.previousElementSibling
    prev && this.parentElement.insertBefore(this, prev)
  }

  moveDown() {
    const next = this.nextElementSibling
    next && this.parentElement.insertBefore(next, this)
  }

  handleClick = (e: PointerEvent, up=false) => {
    if((e.target as HTMLElement).id === "up") {
      this.moveUp()
    }
    else {
      this.moveDown()
    }
    e.stopPropagation()
  }

  render() {
    return html`
      <sl-icon-button src=${IconArrowsMove}></sl-icon-button>
      <slot style=${styleMap({"--ww-placeholder": `"${this.msg("Option")}"`})}></slot>
      <div id="order-buttons">
        <sl-icon-button id="up" class="order-button" src=${IconArrowUp} @click=${this.handleClick}></sl-icon-button>
        <sl-icon-button id="down" class="order-button" src=${IconArrowDown} @click=${this.handleClick}></sl-icon-button>
      </div>
    `
  }
}