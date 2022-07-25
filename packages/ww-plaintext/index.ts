import "@shoelace-style/shoelace/dist/themes/light.css"
import SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.js"

import { html, css } from "lit"
import { property, query } from "lit/decorators.js"

import { Block, BlockElement } from "webwriter-model"
import { LitElementWw } from "webwriter-lit"

interface PlaintextBlock extends Block {
  attributes: {
    value: string
    type: "ww-plaintext"
  }
}

export default class WwPlaintext extends LitElementWw implements BlockElement<PlaintextBlock> {  

  @property({type: String, attribute: true, reflect: true})
  value: PlaintextBlock["attributes"]["value"]

  @query("sl-textarea")
  textarea: SlTextarea

  setValue = (value: string) => this.value = value

  focus(options: FocusOptions) {
    this.textarea.focus(options)
  }

  static get scopedElements() {
    return {
      "sl-textarea": SlTextarea
    }
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