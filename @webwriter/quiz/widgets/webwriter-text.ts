import {html, css} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"
import {ifDefined} from "lit/directives/if-defined.js"

import SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.component.js"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

declare global {interface HTMLElementTagNameMap {
  "webwriter-text": WebwriterText;
}}

@customElement("webwriter-text")
export class WebwriterText extends LitElementWw {

  @property({type: String, attribute: true, reflect: true})
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
  accessor type: "date" | "datetime-local" | "number" | "text" | "time" | "long-text" = "long-text"

  @property({type: String, attribute: true, reflect: true})
  @option()
  accessor placeholder: string

  @property({type: String, attribute: true, reflect: true})
  accessor value: string

  /*
  @property({type: Number, attribute: true, reflect: true})
  @option({type: Number})
  min: number

  @property({type: Number, attribute: true, reflect: true})
  @option({type: Number})
  max: number

  @property({type: Number, attribute: true, reflect: true})
  @option({type: Number})
  step: number
  */

  static scopedElements = {
    "sl-textarea": SlTextarea,
    "sl-input": SlInput
  }

  static styles = css`
    :host(:is([contenteditable=true], [contenteditable=""])) sl-textarea::part(textarea) {
      color: var(--sl-color-success-700);
    }

    sl-textarea {
      resize: vertical;
      overflow: hidden;
      min-height: 40px;

      &::part(form-control), &::part(form-control-input), &::part(base), &::part(textarea) {
        height: 100%;
      }
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

  @query("sl-textarea, sl-input")
  accessor input: SlTextarea | SlInput

  focus() {
    this.input.focus()
  }

  reportSolution(solution: string) {
    this.solution = solution
  }

  @property({type: String, attribute: false, reflect: false})
  accessor solution: string

  render() {
    const textarea = html`<sl-textarea value=${this.isContentEditable? this.solution: this.value} placeholder=${this.placeholder} resize="none"></sl-textarea>`
    const input = html`<sl-input value=${this.isContentEditable? this.solution: this.value} placeholder=${this.placeholder} type=${this.type}></sl-input>`
    return html`
      <div id="solution">${this.solution}</div>
      ${this.type === "long-text"? textarea: input}
    `
  }
}