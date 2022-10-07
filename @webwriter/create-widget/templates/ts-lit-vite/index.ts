import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"
import {customElement} from "lit/decorators.js"

@customElement("{{name}}")
export class {{className}} extends LitElementWw {
  render() {
    return html`Hello, world!`
  }
}