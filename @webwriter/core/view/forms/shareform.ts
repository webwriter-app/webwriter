import { LitElement, html, css, PropertyValues } from "lit"
import { customElement, property, query, queryAsync } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { SlChangeEvent, SlInput, SlQrCode, getFormControls } from "@shoelace-style/shoelace"
import { DataInput } from "../elements"
import { NpmAccount, PocketbaseAccount } from "../../model/schemas/accounts"
import { emitCustomEvent, filterObject } from "../../utility"

import marshal from "../../model/marshal"
import clients, { Client, DocumentClient } from "../../model/clients"

/** Sharing advanced:
 * Enable/disable sharing
 * Regenerate link
 * Protect with password
 */

@localized()
@customElement("ww-share-form")
export class ShareForm extends LitElement {

  @property({type: Boolean})
  active = false

  @property({type: Boolean, attribute: true})
  canRefresh = false

  @property({type: Boolean, attribute: true})
  canDisable = false

  @property({type: Boolean, attribute: true})
  isLinkShareable = false

  @property({type: String})
  url: string

  @property({state: true, attribute: false})
  private publicUrl: URL

  @property({attribute: false})
  client: DocumentClient

  static get styles() {
    return css`
      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      sl-icon-button {
        margin-inline-start: 0 !important;
      }

      #qr {
        display: grid;
        grid-template-columns: min-content min-content;
        grid-template-rows: 1fr 1fr;
        margin: 0 auto;

        & .copy {
          align-self: flex-end;
        }

        & sl-qr-code {
          grid-row: span 2;
        }

        & .copy, & .download {
          padding: 0.5rem;
        }
      }

      footer {
        display: flex;
        justify-content: flex-end;
      }
    `
  }

  @query("#qr sl-qr-code")
  qrCode: SlQrCode

  copyQR() {
    (this.qrCode.canvas as HTMLCanvasElement).toBlob(blob => {
      const clipboardItem = new ClipboardItem({"image/png": blob!})
      navigator.clipboard.write([clipboardItem])
    }, "image/png")
  }

  @property({type: String, attribute: true})
  loadingState: "idle" | "loading" | "error" = "idle"

  protected async updated(changed: PropertyValues) {
    if(changed.has("url") && this.url && this.client && "getSharingURLForDocument" in this.client) {
      try {
        this.loadingState = "loading"
        this.publicUrl = await this.client.getSharingURLForDocument!(this.url)
        this.loadingState = "idle"
      }
      catch {
        this.loadingState = "error"
      }
    }
  }

  downloadQR() {
    (this.qrCode.canvas as HTMLCanvasElement).toBlob(blob => {
      let a = this.ownerDocument.createElement("a")
      a.setAttribute("style", "display: none")
      a.href = URL.createObjectURL(blob!)
      a.download = `webwriter_${Date.now()}`
      this.shadowRoot!.appendChild(a)
      a.click()
      URL.revokeObjectURL(a.href)
      a.remove()
    }, "image/png")
  }

  render() {
    return html`<form>
      ${!this.canDisable? null: html`
        <sl-switch @sl-change=${() => this.active = !this.active}>${msg("Share this document")}</sl-switch>  
      `}
      <sl-input label=${msg("Public Link")} ?disabled=${!this.active && this.canDisable} readonly value=${String(this.publicUrl)}>
        ${!this.canRefresh? null: html`
          <sl-icon-button ?disabled=${!this.active && this.canDisable} slot="prefix" name="refresh"></sl-icon-button> 
        `}
        <sl-copy-button ?disabled=${!this.active && this.canDisable} slot="suffix" hoist value=${String(this.publicUrl)}></sl-copy-button>
      </sl-input>
      <section id="qr">
        <sl-qr-code value=${String(this.publicUrl)} size="256"></sl-qr-code>
        <sl-icon-button name="copy" class="copy" title=${msg("Copy QR Code as image")} @click=${this.copyQR}></sl-icon-button>
        <sl-icon-button name="download" class="download" title=${msg("Download QR Code as image")} @click=${this.downloadQR}></sl-icon-button>
      </section>
      <footer>
        <ww-button @click=${() => emitCustomEvent(this, "ww-cancel")}>
          ${msg("Cancel")}
        </ww-button>
      </footer>
    </form>`
  }
}