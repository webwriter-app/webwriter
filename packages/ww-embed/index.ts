import "@shoelace-style/shoelace/dist/themes/light.css"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import SlResponsiveMedia from "@shoelace-style/shoelace/dist/components/responsive-media/responsive-media.js"
import SlQrCode from "@shoelace-style/shoelace/dist/components/qr-code/qr-code.js"

import { html, css } from "lit"
import { property } from "lit/decorators.js"

import { LitElementWw } from "webwriter-lit"
import { Block, BlockElement } from "webwriter-model"

interface EmbedBlock extends Block {
  attributes: {
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
      "sl-responsive-media": SlResponsiveMedia,
      "sl-qr-code": SlQrCode
    }
  }

  static get styles() {
    return css`
      :host {
        display: contents;
      }

      sl-responsive-media {
        grid-column: 2;
        margin-top: 0.1rem;
        background: rgba(0, 0, 0, 0.1);
      }

      sl-input {
        grid-column: 3;
      }
    `
  }

  inputTemplate = () => html`
    <sl-input
      type="url"
      placeholder="URL to embed"
      value=${this.src}
      @sl-change=${e => this.setSrc(e.target.value)}>
    </sl-input>  
  `

  contentTemplate = () => html`
    <sl-responsive-media>
      ${this.src? html`<iframe src=${this.src}></iframe>`: null}
    </sl-responsive-media>
  `

  qrTemplate = () => html`
    <sl-responsive-media>
      ${this.src? html`<sl-qr-code value=${this.src}></sl-qr-code>`: null}
    </sl-responsive-media>
  `

  render() {
    return html`
      ${this.printable? this.qrTemplate(): this.contentTemplate()}
      ${this.editable? this.inputTemplate(): null}
    `
  }
}