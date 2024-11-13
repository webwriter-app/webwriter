import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-task-hint": WebwriterTaskHint;
}}

@customElement("webwriter-task-hint")
export class WebwriterTaskHint extends LitElementWw {

  localize = LOCALIZE

  render() {
    return html`<slot>
      
    </slot>`
  }
}