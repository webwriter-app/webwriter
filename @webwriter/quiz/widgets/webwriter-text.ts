import {html, css} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import {ifDefined} from "lit/directives/if-defined.js"

import SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.component.js"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js"

@customElement("webwriter-text")
export class WebwriterText extends LitElementWw {

  @property({type: String, attribute: true, reflect: true,})
  @option({
    type: "select",
    label: {"en": "Type", "de": "Typ"},
    options: [
      {value: "long-text", label: {"en": "Long Text", "de": "Langer Text"}},
      {value: "text", label: {"en": "Short Text", "de": "Kurzer Text"}},
      {value: "number", label: {"en": "Number", "de": "Zahl"}},
      {value: "date", label: {"en": "Date", "de": "Datum"}},
      {value: "time", label: {"en": "Time", "de": "Uhrzeit"}},
      {value: "datetime-local", label: {"en": "Date & Time", "de": "Datum & Uhrzeit"}}
    ]
  })
  type: "date" | "datetime-local" | "number" | "text" | "time" | "long-text" = "long-text"

  @property({type: String, attribute: true, reflect: true})
  @option()
  placeholder: string

  static scopedElements = {
    "sl-textarea": SlTextarea,
    "sl-input": SlInput
  }

  static styles = css`
    :host(:is([contenteditable=true], [contenteditable=""])) sl-textarea::part(textarea) {
      color: var(--sl-color-success-700);
    }
  `

  render() {
    const textarea = html`<sl-textarea placeholder=${this.placeholder}></sl-textarea>`
    const input = html`<sl-input placeholder=${this.placeholder} type=${this.type}></sl-input>`
    return this.type === "long-text"? textarea: input
  }
}