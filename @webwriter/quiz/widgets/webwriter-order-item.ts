import {css, html, PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"

import IconArrowsMove from "bootstrap-icons/icons/arrows-move.svg"
import IconArrowUp from "bootstrap-icons/icons/arrow-up.svg"
import IconArrowDown from "bootstrap-icons/icons/arrow-down.svg"
import IconTrash from "bootstrap-icons/icons/trash.svg"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { keyed } from "lit/directives/keyed.js"
import { ifDefined } from "lit/directives/if-defined.js"

declare global {interface HTMLElementTagNameMap {
  "webwriter-order-item": WebwriterOrderItem;
}}

function exchangeElements<A extends Node, B extends Node>(a: A, b: B) {
    var clonedA = a.cloneNode(true) as A
    var clonedB = b.cloneNode(true) as B
    b.parentNode.replaceChild(clonedA, b)
    a.parentNode.replaceChild(clonedB, a)
    return clonedA
}

@customElement("webwriter-order-item")
export class WebwriterOrderItem extends LitElementWw {

  static localization = {}

  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  @property({attribute: true, reflect: true, converter: {toAttribute: (v: boolean) => v? "true": "false", fromAttribute: (attr: string) => attr === "true"}})
  accessor draggable = true

  msg = (str: string) => this.lang in WebwriterOrderItem.localization? WebwriterOrderItem.localization[this.lang][str] ?? str: str

  get elementIndex() {
    return Array.from(this.parentElement?.children ?? []).indexOf(this)
  }

  getSibling(i: number) {
    return this.parentElement.children.item(i)
  }

  emitClearDropPreview = () => {
    this.dispatchEvent(new CustomEvent("webwriter-clear-drop-preview", {bubbles: true}))
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.dropPreview = undefined
    this.addEventListener("dragstart", e => {
      this.dropPreview = undefined
      e.dataTransfer.setData("text/html", this.outerHTML)
      e.dataTransfer.setData("text/plain", this.id)
      // setTimeout(() => this.baseEl.style.visibility = "hidden", 0)
      e.stopPropagation()
    })
    this.addEventListener("drop", e => {
      e.stopPropagation()
      const id = e.dataTransfer.getData("text/plain")
      const inTopHalf = e.offsetY < this.offsetHeight / 2
      const inLeftHalf = e.offsetX < this.offsetWidth / 2
      const el = document.querySelector(`webwriter-order-item#${id}`)
      if(!el) {
        console.log("element from other document")
        const html = e.dataTransfer.getData("text/html")
        this.parentElement.insertAdjacentHTML("beforeend", html)
      }
      else if(el && !this.parentElement?.contains(el)) {
        console.log("element from this document")
        this.parentElement.insertAdjacentElement("beforeend", el)
      }
      else {
        const offset = (this.layout === "tiles"? inLeftHalf: inTopHalf)? 0: 1
        el.dispatchEvent(new CustomEvent("ww-moveto", {bubbles: true, detail: {i: this.elementIndex + offset}}))
      }
      // this.insertAdjacentHTML(inTopHalf? "beforebegin": "afterend", html)
    }, {passive: true})
    this.addEventListener("dragover", e => {
      const inTopHalf = e.offsetY < this.offsetHeight / 2
      const inLeftHalf = e.offsetX < this.offsetWidth / 2
      if(this.layout === "tiles") {
        this.dropPreview = inLeftHalf? "left": "right"
      }
      else {
        this.dropPreview = inTopHalf? "top": "bottom"
      }
      e.preventDefault()
      e.stopImmediatePropagation()
    })
    this.addEventListener("dragleave", () => this.emitClearDropPreview(), {passive: true})
    document.addEventListener("dragend", (e) => {
      // (e.target as HTMLElement)?.remove()
      this.emitClearDropPreview()
    }, {passive: true})
  }

  @property({type: String, attribute: true, reflect: true})
  accessor dropPreview: "top" | "bottom" | "left" | "right" | undefined = undefined

  @property({type: String, attribute: true, reflect: true})
  accessor layout: "list" | "tiles" = "list"

  static styles = css`

    :host {
      position: relative;
    }

    ol {
      padding-left: 0;
      margin: 0;
      width: 100%;
      position: relative;
    }

    :host([layout=tiles]) {
      border: 2px solid var(--sl-color-gray-500);
      border-radius: 5px;
      aspect-ratio: 1;
      min-width: 125px;
      width: 125px;
      max-width: 350px;
      min-height: 125px;
      height: 125px;
      max-height: 350px;

      & ol[part=base] {
        padding-left: 0;
        margin: 0;
        aspect-ratio: 1;
        min-width: 125px;
        width: 125px;
        max-width: 350px;
        min-height: 125px;
        height: 125px;
        max-height: 350px;
        overflow-y: auto;
        scrollbar-width: thin;
        resize: both;
      }

      & ::slotted(:is(picture, audio, video, img, iframe)) {
        height: 100%;
        width: 100%;
      }

      & ::slotted(:not(:is(picture, audio, video, img, iframe))) {
        margin: 5px !important;
      }
    }

    :host(:not([layout=tiles])) {

      width: 100% !important;
      height: unset !important;

      & ol[part=base] {
        width: 100% !important;
        height: auto !important;
      }
    }

    li {
      list-style-type: inherit;
      list-style-position: inside;
      flex-direction: row;
      align-items: center;
      font-size: var(--sl-input-font-size-medium);
      cursor: move;
    }

    :host([droppreview])::before {
      content: "";
      position: absolute;
      background: var(--sl-color-primary-600);
    }

    :host([droppreview=top])::before {
      height: 2px;
      width: 100%;
      top: -2px;
    }

    :host([droppreview=bottom])::before {
      height: 2px;
      width: 100%;
      bottom: -2px;
    }

    :host([droppreview=left])::before {
      left: -17px;
      height: 100%;
      width: 15px;
    }

    :host([droppreview=right])::before {
      right: -17px;
      height: 100%;
      width: 15px;
    }

    slot {
      display: inline-block;
      width: calc(100% - var(--offset));
      cursor: text;
    }

    #order-buttons {
      position: absolute;
      right: 0;
      top: 0;

      & .order-button::part(base) {
        padding: 0;
      }
    }

    #handle {
      box-sizing: border-box;
      border-radius: 2px;
      position: absolute;
      left: 0px;
      bottom: 0px;
      width: 20px;
      height: 25px;
      display: inline-block;
      overflow: hidden;
      line-height: 5px;
      padding: 1.5px 1px;
      padding-bottom: 0;
      cursor: move;
      vertical-align: middle;
      font-size: 12px;
      font-family: sans-serif;
      letter-spacing: 2px;
      color: #cccccc;
      text-shadow: 1px 0 1px black;
      font-weight: 600;
      opacity: 0.95;
      transform: rotate(135deg);
    }
    #handle::after {
      content: '.. .. ..';
    }

    :host(:not([layout=tiles])) :is(#handle, #count) {
      display: none;
    }

    :host(:not([layout=list])) :is(#up, #down) {
      display: none;
    }

    :host([layout=tiles]) #main-li {
      display: contents;
    }

    :host([layout=tiles]) slot {
      width: 100%;
      box-sizing: border-box;
    }


    #count {
      display: flex;
      justify-content: center;
      align-items: center;
      display: inline-block;
      width: 3ch;
      position: absolute;
      bottom: -14px;
      left: -14px;
      z-index: 10;
      & li {
        display: list-item;
        width: 4ch;
        height: 4ch;
        font-size: 12px;
        font-weight: bold;
        border-radius: 100%;
        border: 2px solid var(--sl-color-gray-600);
        color: var(--sl-color-gray-600);
        box-sizing: border-box;
        background: white;
        padding-left: 7px;
        padding-top: 4px;
        overflow: hidden;

        &[data-two-digit] {
          padding-left: 4px;
        }
      }

    }
  `

  moveUp() {
    const prev = this.previousElementSibling
    const html = this.outerHTML
    if(prev) {
      prev.insertAdjacentHTML("beforebegin", html)
      this.remove()
    }
  }

  moveDown() {
    const next = this.nextElementSibling
    const html = this.outerHTML
    if(next) {
      next.insertAdjacentHTML("afterend", html)
      this.remove()
    }
  }

  handleClick = (e: PointerEvent, up=false) => {
    if((e.target as HTMLElement).id === "up") {
      this.dispatchEvent(new CustomEvent("ww-moveup", {bubbles: true}))
    }
    else {
      this.dispatchEvent(new CustomEvent("ww-movedown", {bubbles: true}))
    }
    e.stopPropagation()
  }

  @query("[part=base]")
  accessor baseEl: HTMLElement

  @query("#content")
  accessor contentSlotEl: HTMLSlotElement

  observer: MutationObserver

  protected async updated(_changedProperties: PropertyValues) {
    if(_changedProperties.has("layout") && this.layout === "list") {
      this.syncSize(true)
      this.observer?.disconnect()
    }
    else if(_changedProperties.has("layout") && this.layout === "tiles") {
      this.syncSize()
      this.observer = new MutationObserver(() => this.syncSize())
      this.observer.observe(this.baseEl, {attributeFilter: ["style"], attributes: true})
    }
  }

  syncSize(clear=false) {
    if(this.baseEl && !clear) {
      this.style.width = this.baseEl.style.width
      this.style.height = this.baseEl.style.height
    }
    else if(this.baseEl && clear) {
      this.style.width = this.baseEl.style.width = null
      this.style.height = this.baseEl.style.height = null
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  render() {
    return html`<ol part="base" start=${this.elementIndex + 1}>
      <li id="main-li"><slot id="content" style=${styleMap({"--ww-placeholder": `"${this.msg("Option")}"`, "--offset": `${this.contentSlotEl?.offsetLeft + 1}px`})}></slot></li>
      <div id="order-buttons" draggable="false">
        <!--<sl-icon-button id="up" class="order-button" src=${IconTrash} @click=${() => this.remove()} ?disabled=${this.matches(":only-child")}></sl-icon-button>-->
        <sl-icon-button ?disabled=${!this.previousElementSibling} id="up" class="order-button" src=${IconArrowUp} @click=${this.handleClick}  @mousedown=${e => this.draggable = false} @mouseup=${() => this.draggable = true}></sl-icon-button>
        <sl-icon-button ?disabled=${!this.nextElementSibling} id="down" class="order-button" src=${IconArrowDown} @click=${this.handleClick}></sl-icon-button>
      </div>
    </ol>
    <ol id="count" start=${this.elementIndex + 1}><li ?data-two-digit=${this.elementIndex + 1 >= 10}></li></ol>
    <div id="handle"></div>`
  }
}