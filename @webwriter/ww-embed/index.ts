import "@shoelace-style/shoelace/dist/themes/light.css"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import SlQrCode from "@shoelace-style/shoelace/dist/components/qr-code/qr-code.js"

import { html, css } from "lit"
import { property, customElement } from "lit/decorators.js"

import { LitElementWw } from "webwriter-lit"


@customElement("ww-embed")
export default class WwEmbed extends LitElementWw {
  
  @property({type: String, attribute: true, reflect: true})
  src: string

  setSrc = (src: string) => this.src = src

  static get scopedElements() {
    return {
      "sl-input": SlInput,
      "sl-qr-code": SlQrCode
    }
  }

  static get styles() {
    return css`
      :host {
        display: contents;
      }

      main {
        background: rgba(0, 0, 0, 0.1);
        aspect-ratio: 16/9;
      }

      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      .content-placeholder {
        width: 100%;
        height: 100%;
        margin: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--sl-color-neutral-600);
        user-select: none;
      }
    `
  }

  contentPlaceholder = html`<span class="content-placeholder">Another website...</span>`

  inputTemplate = () => html`
    <sl-input
      part="action"
      type="url"
      placeholder="URL of another website"
      value=${this.src}
      @sl-change=${e => this.setSrc(e.target.value)}>
    </sl-input>  
  `

  contentTemplate = () => html`<main>
    ${this.src? html`<iframe src=${this.src}></iframe>`: this.contentPlaceholder}
  </main>`

  qrTemplate = () => html`
    <main>
      ${this.src? html`<sl-qr-code value=${this.src}></sl-qr-code>`: this.contentPlaceholder}
    </main>
  `

  render() {
    return html`
      ${this.editable? this.inputTemplate(): null}
      ${this.printable? this.qrTemplate(): this.contentTemplate()}
    `
  }
}