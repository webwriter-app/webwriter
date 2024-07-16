import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import IconPlus from "bootstrap-icons/icons/plus.svg"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"

declare global {interface HTMLElementTagNameMap {
  "webwriter-memory": WebwriterMemory;
}}

@customElement("webwriter-memory")
export class WebwriterMemory extends LitElementWw {

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon
  }

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 10px;
      padding: 10px;
    }

    sl-button {

      &::part(base) {
        width: 102px;
        height: 102px;
        border: 1px solid darkgray;
        border-radius: 2px;
        padding: 10px;
        overflow: hidden;
      }

      &::part(label) {
        padding: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }
    }
  `
  
  addItem = () => {
    const item = document.createElement("webwriter-memory-item")
    const picture = document.createElement("picture")
    item.appendChild(picture)
    this.appendChild(item)
    document.getSelection().setBaseAndExtent(picture, 0, picture, 0)
  }

  render() {
    return html`
      <slot></slot>
      <sl-button @click=${this.addItem}>
        <sl-icon src=${IconPlus}></sl-icon>
      </sl-button>
    `
  }
}