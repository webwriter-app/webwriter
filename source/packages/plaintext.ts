import { html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"

import { Block, BlockElement } from "../model"
import { SlTextarea } from "@shoelace-style/shoelace"
import { LitElementWw } from "../utility"

interface PlaintextBlock extends Block {
  attributes: {
    label: string
    value: string
    type: "ww-plaintext"
  }
}

@customElement("ww-plaintext")
class WwPlaintext extends LitElementWw implements BlockElement<PlaintextBlock> {  

  @property({type: String, attribute: true, reflect: true})
  value: PlaintextBlock["attributes"]["value"]

  @query("sl-textarea")
  textarea: SlTextarea

  setValue = (value: string) => this.value = value

  focus() {
    this.textarea.focus()
  }

  static get styles() {
    return css`
      sl-textarea::part(textarea) {
        min-height: 2.5rem;
      }
      sl-input, sl-input::part(base) {
        display: inline-block;
        margin-bottom: 0.1rem;
      }
    `
  }

  render() {

    return html`
      <sl-textarea
        @sl-change=${e => this.setValue(e.target.value)}
        value=${this.value}
        resize="auto">
      </sl-textarea>
    `
  }
}

export default {
  element: WwPlaintext,
  actions: [

  ]
}