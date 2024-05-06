import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
@customElement("webwriter-task-prompt")
export class WebwriterTaskPrompt extends LitElementWw {
  render() {
    return html`<slot>
      
    </slot>`
  }
}