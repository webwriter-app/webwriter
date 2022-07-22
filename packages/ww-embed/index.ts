import "@shoelace-style/shoelace/dist/themes/light.css"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import SlResponsiveMedia from "@shoelace-style/shoelace/dist/components/responsive-media/responsive-media.js"

import { html, css } from "lit"
import { property } from "lit/decorators.js"

import { LitElementWw } from "webwriter-lit"
import { Block, BlockElement } from "webwriter-model"

interface EmbedBlock extends Block {
  attributes: {
    label: string
    src: string
    type: "ww-embed"
  }
}

export default class WwEmbed extends LitElementWw implements BlockElement<EmbedBlock> {
  
  @property({type: String, attribute: true, reflect: true})
  src: EmbedBlock["attributes"]["src"]

  setSrc = (src: string) => this.src = src

  static get scopedElements() {
    return {
      "sl-input": SlInput,
      "sl-responsive-media": SlResponsiveMedia
    }
  }

  connectedCallback() {
    super.connectedCallback()
    this.requestUpdate()
  }

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