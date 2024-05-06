import {html, css} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import {ifDefined} from "lit/directives/if-defined.js"

import SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.component.js"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

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

  @property({type: String, attribute: true, reflect: true})
  value: string

  static scopedElements = {
    "sl-textarea": SlTextarea,
    "sl-input": SlInput
  }

  static styles = css`
    :host(:is([contenteditable=true], [contenteditable=""])) sl-textarea::part(textarea) {
      color: var(--sl-color-success-700);
    }
  `

  handleChange = (e: CustomEvent) => {
    const target = e.target as SlTextarea | SlInput
    this.dispatchEvent(new CustomEvent("ww-answer-change", {
      detail: {value: target.value},
      bubbles: true,
      composed: true
    }))
  }

  reportSolution(solution: string) {
    this.solution = solution
  }

  @property({type: String, attribute: false, reflect: false})
  solution: string

  render() {
    const textarea = html`<sl-textarea value=${this.isContentEditable? this.solution: this.value} placeholder=${this.placeholder}></sl-textarea>`
    const input = html`<sl-input value=${this.isContentEditable? this.solution: this.value} placeholder=${this.placeholder} type=${this.type}></sl-input>`
    return html`
      <div id="solution">${this.solution}</div>
      ${this.type === "long-text"? textarea: input}
    `
  }
}