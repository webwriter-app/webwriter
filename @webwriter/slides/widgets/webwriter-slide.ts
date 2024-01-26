/** config */
import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"

import "@shoelace-style/shoelace/dist/themes/light.css"

@customElement("webwriter-slide")
export class WebwriterSlide extends LitElementWw {

  @property({type: Boolean, attribute: true, reflect: true})
  active = false

  static styles = css`
    :host {
      height: 100%;
      width: 100%;
      padding: 10px;
      box-sizing: border-box;
      display: block;
      overflow: auto;
    }
  `

  render() {
    return html`<slot></slot>`
  }


}