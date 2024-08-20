import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { styleMap } from "lit/directives/style-map.js";

declare global {interface HTMLElementTagNameMap {
  "webwriter-task-explainer": WebwriterTaskExplainer;
}}

@customElement("webwriter-task-explainer")
export class WebwriterTaskExplainer extends LitElementWw {

  @property({type: Boolean, attribute: true, reflect: true})
  accessor active = false

  static styles = css`
    :host {
      background: var(--sl-color-gray-100);
      border: 2px solid var(--sl-color-gray-200);
      box-sizing: border-box;
      padding: 10px;
      font-size: 0.8rem;
      height: 100px;
      min-height: 100px;
      overflow-y: auto;
      scrollbar-width: thin;
      resize: vertical;
    }
  `

  render() {
    return html`<slot>
      
    </slot>`
  }
}