import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import IconPlusCircle from "bootstrap-icons/icons/plus-circle.svg"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import { WebwriterPairingItem } from "./webwriter-pairing-item"

declare global {interface HTMLElementTagNameMap {
  "webwriter-pairing": WebwriterPairing;
}}

@customElement("webwriter-pairing")
export class WebwriterPairing extends LitElementWw {
  
  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  static styles = css`
    :host {
      aspect-ratio: 16/9;
    }

    #add {
      position: absolute;
      right: 0;
      bottom: 0;
    }
  `

  addItem = () => {
    const item = document.createElement("webwriter-pairing-item")
    const p = document.createElement("p")
    item.appendChild(p)
    this.appendChild(item)
    document.getSelection().setBaseAndExtent(p, 0, p, 0)
  }

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener("dragend", e => {
      const target = e.target as WebwriterPairingItem
      const width = this.parentElement?.offsetWidth
      const height = this.parentElement?.offsetHeight
      if(target?.tagName.toLowerCase() === "webwriter-pairing-item") {
        target.draggable = false
        const top = -this.offsetTop + e.pageY - target.offsetHeight
        const topMin = 0
        const topMax = this.offsetHeight - target.offsetHeight
        const left = -this.offsetLeft + e.pageX - target.offsetWidth
        const leftMin = 0
        const leftMax = this.offsetWidth - target.offsetWidth
        target.style.top = `${Math.max(Math.min(top, topMax), topMin)}px`
        target.style.left = `${Math.max(Math.min(left, leftMax), leftMin)}px`
      }
    })
  }
  
  render() {
    return html`
      <slot></slot>
      <sl-icon-button id="add" src=${IconPlusCircle} @click=${this.addItem}></sl-icon-button>
    `
  }
}