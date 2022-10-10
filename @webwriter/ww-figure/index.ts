import "@shoelace-style/shoelace/dist/themes/light.css"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import SlQrCode from "@shoelace-style/shoelace/dist/components/qr-code/qr-code.js"

import { html, css, PropertyValueMap, LitElement, PropertyDeclaration } from "lit"
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

  @property({type: Boolean})
  urlResolves: boolean

  @property({type: String, attribute: true, reflect: true})
  mimeType: MultimediaMIMEType

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
      "sl-qr-code": SlQrCode
    }
  }

  protected async willUpdate(changedProperties: PropertyValueMap<any>) {
      if(changedProperties.has("contentSrc")) {
        this.mimeType = await fileTypeFromUrl(this.contentSrc)
        this.urlResolves = (await fetch(this.contentSrc)).ok
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
        margin: 4px;
      }

      figure > video {
        aspect-ratio: 16/9;
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
      }
    `
  }

  get contentTemplate() {
    if(!this.urlResolves && this.contentSrcInput) {
      this.contentSrcInput.setCustomValidity("Error 404: Media resource not found")
      this.contentSrcInput.reportValidity()
    }
    if(!this.contentSrc || !this.urlResolves) {
      return html`<div class="content-placeholder">Some media...</div>`
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
      return html`Unsupported media type`
    }
  }

  get printTemplate() {
    if(this.contentType === "video" || this.contentType === "audio") {
      return html``
    }
    else {
      return this.contentTemplate
    }
  }

  get actionTemplate() {
    return html`<div part="action">
      <sl-input id="contentSrc" type="url" placeholder="Source URL" clearable @sl-change=${e => this.contentSrc = e.target.value} @keydown=${e => e.key === "Enter" && e.target.blur()}>
      </sl-input>
    </div>`
  }

  render() {
    WwFigure.elementProperties
    return html`
    ${this.editable? this.actionTemplate: null}
    <figure>
      ${this.printable? this.printTemplate: this.contentTemplate}
      <figcaption>
        ${this.editable? html`<sl-input id="caption" filled placeholder="Caption" value=${this.caption} @sl-change=${e => this.caption=e.target.value}></sl-input>`: this.caption}
      </figcaption>
    </figure>`
  }
}