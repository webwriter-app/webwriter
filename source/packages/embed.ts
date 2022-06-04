import { html, css } from "lit"
import { customElement, property } from "lit/decorators.js"

import { LitElementWw } from "../utility"
import { Block, BlockElement } from "../model"

interface EmbedBlock extends Block {
  attributes: {
    label: string
    src: string
    type: "ww-embed"
  }
}

@customElement("ww-embed")
class WwEmbed extends LitElementWw implements BlockElement<EmbedBlock> {
  
  @property({type: String, attribute: true, reflect: true})
  src: EmbedBlock["attributes"]["src"]

  setSrc = (src: string) => this.src = src

  static get styles() {
    return css`
      sl-responsive-media {
        margin-top: 0.1rem;
        background: rgba(0, 0, 0, 0.1);
      }
    `
  }

  render() {
    return html`
      <sl-input
        type="url"
        placeholder="URL to embed"
        value=${this.src}
        @sl-change=${e => this.setSrc(e.target.value)}>
      </sl-input>
      <sl-responsive-media>
        ${this.src? html`<iframe src=${this.src}></iframe>`: null}
      </sl-responsive-media>
    `
  }
}

export default {
  element: WwEmbed,
  actions: [

  ]
}