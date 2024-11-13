import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { styleMap } from "lit/directives/style-map.js"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-task-prompt": WebwriterTaskPrompt;
}}

@customElement("webwriter-task-prompt")
export class WebwriterTaskPrompt extends LitElementWw {

  localize = LOCALIZE

  render() {
    return html`<slot style=${styleMap({"--ww-placeholder": `"${msg("Prompt")}"`})}>
      
    </slot>`
  }
}