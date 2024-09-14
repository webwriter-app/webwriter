import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

declare global {interface HTMLElementTagNameMap {
  "webwriter-task-hint": WebwriterTaskHint;
}}

@customElement("webwriter-task-hint")
export class WebwriterTaskHint extends LitElementWw {
  render() {
    return html`<slot>
      
    </slot>`
  }
}