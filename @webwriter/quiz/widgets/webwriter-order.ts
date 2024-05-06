import {css, html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, query} from "lit/decorators.js"
import Sortable from "sortablejs/modular/sortable.complete.esm.js"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import IconPlus from "bootstrap-icons/icons/plus.svg"

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
      gap: 2px;
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

  addItem() {
    const orderItem = this.ownerDocument.createElement("webwriter-order-item")
    const p = this.ownerDocument.createElement("p")
    orderItem.appendChild(p)
    this.appendChild(orderItem)
    document.getSelection().setBaseAndExtent(p, 0, p, 0)
  }
  
  @query("#items-slot")
  itemsSlot: HTMLSlotElement

  render() {
    return html`
      <slot id="items-slot"></slot>
      <sl-button size="small" id="add-option" class="author-only" @click=${() => this.addItem()}>
        <sl-icon src=${IconPlus}></sl-icon><span>Add Option</span>
      </sl-button>
    `
  }
}