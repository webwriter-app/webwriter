import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { styleMap } from "lit/directives/style-map.js"

declare global {interface HTMLElementTagNameMap {
  "webwriter-task-prompt": WebwriterTaskPrompt;
}}

@customElement("webwriter-task-prompt")
export class WebwriterTaskPrompt extends LitElementWw {
  render() {
    return html`<slot style=${styleMap({"--ww-placeholder": `"Prompt"`})}>
      
    </slot>`
  }
}