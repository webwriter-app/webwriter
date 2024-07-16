import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

declare global {interface HTMLElementTagNameMap {
  "webwriter-memory-item": WebwriterMemoryItem;
}}

@customElement("webwriter-memory-item")
export class WebwriterMemoryItem extends LitElementWw {

  static styles = css`
    slot {
      display: block;
      width: 102px;
      height: 102px;
      background: lightgray;
      border: 1px solid darkgray;
      border-radius: 2px;
      padding: 2px;
      box-sizing: border-box;
      position: relative;
    }

    ::slotted(*) {
      width: 100%;
      height: 100%;
    }



    slot::after {
      position: absolute;
      right: -4px;
      top: -4px;
      content: "";
      display: block;
      width: 102px;
      height: 102px;
      background: lightgray;
      border: 1px solid darkgray;
      border-radius: 2px;
      padding: 2px;
      overflow: hidden;
      box-sizing: border-box;
      z-index: -1;
    }

  `

  render() {
    return html`<slot></slot>`
  }
}