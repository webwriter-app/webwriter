import "@shoelace-style/shoelace/dist/themes/light.css"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import SlQrCode from "@shoelace-style/shoelace/dist/components/qr-code/qr-code.js"
import SlSpinner from "@shoelace-style/shoelace/dist/components/spinner/spinner.js"

import { html, css, PropertyValueMap  } from "lit"
import { property, customElement, query } from "lit/decorators.js"

import { LitElementWw } from "@webwriter/lit"
import mime from "mime"

type MultimediaMIMEType = 
  | "image/apng"
  | "image/avif"
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/svg"
  | "image/webp"
  | "image/bmp"
  | "image/ico"
  | "audio/wav"
  | "audio/mpeg"
  | "audio/mp4"
  | "audio/aac"
  | "audio/ogg"
  | "audio/webm"
  | "audio/flac"
  | "video/mp4"
  | "video/ogg"
  | "video/webm"
  | "text/html"

async function fileTypeFromUrl(url: string) {
  const urlObj = new URL(url)
  const ext = urlObj.pathname.slice(urlObj.pathname.lastIndexOf(".") + 1)
  return mime.getType(ext)
}

@customElement("ww-figure")
export default class WwFigure extends LitElementWw {

  @property({type: String, attribute: true, reflect: true})
  contentSrc: string

  @property({type: String})
  caption: string

  @property({type: String})
  contentError: string = null

  @property({type: Boolean})
  urlInvalid: boolean = false

  @property({type: Boolean, state: true})
  loading: boolean = false

  @property({type: String, attribute: true, reflect: true})
  mimeType: string

  @query("#contentSrc")
  contentSrcInput: HTMLInputElement

  get contentType() {
    return this.mimeType?.split("/")[0]
  }

  get subType() {
    return this.mimeType?.split("/")[1]
  }

  static get scopedElements() {
    return {
      "sl-input": SlInput,
      "sl-qr-code": SlQrCode,
      "sl-spinner": SlSpinner
    }
  }

  protected async willUpdate(changedProperties: PropertyValueMap<any>) {
      if(changedProperties.has("contentSrc")) {
        this.contentError = null
        this.urlInvalid = false
        this.contentSrcInput.setCustomValidity("")
        try {
          new URL(this.contentSrc)
        }
        catch(err) {
          this.urlInvalid = true
        }
        this.mimeType = await fileTypeFromUrl(this.contentSrc)
        try {
          this.loading = true
        }
        catch(err) {
          this.contentError = err.message
        }
        finally {
          this.loading = false
        }
        
      }
  }

  static get styles() {
    WwFigure.elementProperties
    return css`
      :host {
        max-width: 800px;
        display: block;
      }

      figure {
        text-align: center;
      }

      figure > video, figure > iframe {
        aspect-ratio: 16/9;
        width: 100%;
        height: 100%;
        border: none;
      }

      figure > img {
        width: 100%;
        height: 100%;
      }

      .content-placeholder {
        background: rgba(0, 0, 0, 0.1);
        aspect-ratio: 16/9;
        margin: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--sl-color-neutral-600);
        user-select: none;
      }


      #caption {
        display: inline-block;
        width: 100%;
      }

      sl-spinner {
        font-size: 2.5rem;
        --track-width: 6px;
      }
    `
  }

  get contentTemplate() {

    if(!this.contentSrc || this.contentError || this.urlInvalid || this.loading) {
      if(this.urlInvalid) {
        this.contentSrcInput.setCustomValidity("Invalid URL")
        this.contentSrcInput.reportValidity()
      }
      else if(this.contentError) {
        this.contentSrcInput.setCustomValidity(this.contentError)
        this.contentSrcInput.reportValidity()
      }
      return html`<div class="content-placeholder">
        ${this.loading? html`<sl-spinner></sl-spinner>`: "Some media..."}
      </div>`
    }
    else if(this.contentType === "video") {
      return html`
        <video type=${this.subType} src=${this.contentSrc} controls></video>
      `
    }
    else if(this.contentType === "audio") {
      return html`
        <audio type=${this.subType} src=${this.contentSrc} controls></audio>
      `
    }
    else if(this.contentType === "image") {
      return html`
        <img type=${this.subType} src=${this.contentSrc} />
      `
    }
    else {
      return html`
        <iframe src=${this.contentSrc}></iframe>
      `
    }
  }

  get printTemplate() {
    if(this.contentSrc && !this.urlInvalid) {
      return html`<sl-qr-code value=${this.contentSrc}></sl-qr-code>`
    }
    else {
      return this.contentTemplate
    }
  }

  get actionTemplate() {
    return html`<div part="action">
      <sl-input id="contentSrc" type="url" value=${this.contentSrc} placeholder="Source URL" clearable @sl-change=${e => this.contentSrc = e.target.value} @keydown=${e => e.key === "Enter" && e.target.blur()}>
      </sl-input>
    </div>`
  }

  render() {
    return html`
    ${this.editable && !this.printable? this.actionTemplate: null}
    <figure>
      ${this.printable? this.printTemplate: this.contentTemplate}
      <figcaption>
        ${this.editable && !this.printable? html`<sl-input id="caption" filled placeholder="Caption" value=${this.caption} @sl-change=${e => this.caption=e.target.value}></sl-input>`: html`<span>${this.caption}</span>`}
      </figcaption>
    </figure>`
  }
}