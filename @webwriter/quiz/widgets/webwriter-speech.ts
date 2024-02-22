import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"

@customElement("webwriter-speech")
export class WebwriterSpeech extends LitElementWw {
  render() {
    return html`Hello, world!`
  }
}