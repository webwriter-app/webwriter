import {css, html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, query, queryAssignedElements} from "lit/decorators.js"
import Sortable from "sortablejs/modular/sortable.complete.esm.js"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import IconPlus from "bootstrap-icons/icons/plus.svg"
import { WebwriterOrderItem } from "./webwriter-order-item"

declare global {interface HTMLElementTagNameMap {
  "webwriter-order": WebwriterOrder;
}}

@customElement("webwriter-order")
export class WebwriterOrder extends LitElementWw {

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon
  }

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: column;
      align-items: flex-start;
      counter-reset: orderItem;
      gap: 2px;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) {
      --text-color: var(--sl-color-success-700);
    }

    :host ::slotted(*)::before {
      counter-increment: orderItem;
      content: counter(orderItem) '. ';
      cursor: move;
      text-align: right;
      padding-right: 0.5em;
      min-width: 1.5em;
      color: var(--text-color, auto);
    }

    sl-button::part(label) {
      padding: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
    }

    sl-button::part(base) {
      border: none;
      background: transparent;
    }

    sl-icon {
      width: 19px;
      height: 19px;
      padding: var(--sl-spacing-x-small);
    }

    #add-option:not(:hover)::part(base) {
      color: darkgray;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }
  `

  firstUpdated() {
    this.itemsSlot.addEventListener("slotchange", () => {
      this.items.forEach(el => el.requestUpdate())
      this.clearDropPreviews()
    })
  }

  addItem() {
    const orderItem = this.ownerDocument.createElement("webwriter-order-item")
    const p = this.ownerDocument.createElement("p")
    orderItem.appendChild(p)
    this.appendChild(orderItem)
    this.ownerDocument.getSelection().setBaseAndExtent(p, 0, p, 0)
  }

  clearDropPreviews = () => {
    this.items.forEach(item => item.dropPreview = undefined)
  }
  
  @query("#items-slot")
  itemsSlot: HTMLSlotElement

  @queryAssignedElements()
  items: WebwriterOrderItem[]

  render() {
    return html`
      <slot id="items-slot" @webwriter-clear-drop-preview=${this.clearDropPreviews}></slot>
      <sl-button size="small" id="add-option" class="author-only" @click=${() => this.addItem()}>
        <sl-icon src=${IconPlus}></sl-icon><span>Add Option</span>
      </sl-button>
    `
  }
}