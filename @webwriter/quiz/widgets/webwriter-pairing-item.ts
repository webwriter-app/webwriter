import {css, html} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {classMap} from "lit/directives/class-map.js"
import {unsafeStatic} from "lit/static-html.js"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import IconArrowsMove from "bootstrap-icons/icons/arrows-move.svg"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"


declare global {interface HTMLElementTagNameMap {
  "webwriter-pairing-item": WebwriterPairingItem;
}}

@customElement("webwriter-pairing-item")
export class WebwriterPairingItem extends LitElementWw {

  static localization = {}

  msg = (str: string) => this.lang in WebwriterPairingItem.localization? WebwriterPairingItem.localization[this.lang][str] ?? str: str

  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  static styles = css`
    :host {
      height: 100px;
      width: 100px;
      background: lightgray;
      position: absolute !important;
      padding: 5px;
      resize: both;
      overflow: hidden;
      min-width: 50px;
      min-height: 50px;
      max-width: 100%;
      box-sizing: border-box;
      top: 0;
      left: 0;
      overflow: auto;
      scrollbar-width: thin;
      contain: layout;
    }

    #handle {
      position: fixed;
      bottom: 5px;
      right: 5px;
      z-index: 1;
      &::part(base) {
        cursor: move;
        height: 20px;
        width: 20px;
        box-sizing: border-box;
        padding: 0;
      }
    }
  `

  mousedown = false

  connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener("dragstart", e => {
      e.dataTransfer.dropEffect = "move"
    })
    this.addEventListener("dragend", () => this.draggable = false)
    this.addEventListener("mousedown", () => {
      this.mousedown = true
    })
    document.addEventListener("mouseup", e => {
      if(this.isContentEditable && this.mousedown) {
        const maxHeight = this.parentElement.offsetHeight - (this.offsetTop - this.parentElement.offsetTop)
        const maxWidth = this.parentElement.offsetWidth - (this.offsetLeft - this.parentElement.offsetLeft)
        this.style.height = `${Math.min(this.offsetHeight, maxHeight)}px`
        this.style.width = `${Math.min(this.offsetWidth, maxWidth)}px`
      }
      this.mousedown = false
    })

  }

  startDrag = () => {
    this.draggable = true
  }

  render() {
    const editable = this.isContentEditable

    return html`
      <sl-icon-button src=${IconArrowsMove} id="handle" @mousedown=${() => this.draggable = true}></sl-icon-button>
      <slot></slot>
    `
  }
}