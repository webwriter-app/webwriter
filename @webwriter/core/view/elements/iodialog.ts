import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { SlDialog } from "@shoelace-style/shoelace"
import { localized, msg } from "@lit/localize"

import * as connect from "../../model/connect"
import * as marshal from "../../model/marshal"

type Format = keyof typeof marshal
type Protocol = keyof typeof connect


@localized()
@customElement("ww-io-dialog")
export class IODialog extends LitElement {

	@query("sl-dialog")
	dialog: SlDialog

	@property({attribute: true, reflect: true})
	type: "saving" | "loading"

	@property({attribute: true, reflect: true})
	state: "idle" | "success" | "failure" = "idle"

	@property({attribute: true, reflect: true})
	wwformat: Format

	@property({attribute: true, reflect: true})
	filename: string

	@property({attribute: true, reflect: true})
	protocol: Protocol

	@property({attribute: true, reflect: true})
	location: string = ""

	@property({type: Boolean, attribute: true, reflect: true})
	open: boolean = true

	@property({type: Boolean, attribute: true, reflect: true})
	loading: boolean = false

	get url() {
		const url = new URL(`file://${this.location}`)
		url.protocol = `${this.protocol}:`
		url.pathname =  url.pathname + this.filename
		if(!this.location) {
			url.hash = "nolocation"
		}
		return url.href
	}

	async hide() {
		await this.dialog.hide()
		this.emitCancel()
	}

	emitSubmit = () => this.dispatchEvent(
		new CustomEvent("ww-submit", {composed: true, bubbles: true})
	)

	emitCancel = () => this.dispatchEvent(
		new CustomEvent("ww-cancel", {composed: true, bubbles: true})
	)

	handleFormatChange(e: Event) {
		this.wwformat = (e.target as any)["value"] as Format
	}

	handleProtocolChange(e: Event) {
		this.protocol = (e.target as any)["value"] as Protocol
	}

	handleLocationChange(e: Event) {
		this.location = (e.target as any)["value"]
	}

	handleRequestClose(e: CustomEvent<{source: "close-button" | "keyboard" | "overlay"}>) {
		e.preventDefault()
		e.detail.source !== "overlay"? this.emitCancel(): null
	}

	static get styles() {
		return css`

			sl-dialog::part(title) {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 0.5rem;
			}

			sl-dialog::part(body) {
				padding-top: 0;
				padding-bottom: 0;
			}

			sl-radio-group {
				margin-top: 0.25rem;
				margin-bottom: 1rem;
			}

			label {
				font-family: var(--sl-font-sans);
				display: flex;
				flex-direction: row;
				align-items: center;
				font-size: 1rem;
			}

			sl-radio-button {
				width: 150px;
			}

			.label-icon {
				color: var(--sl-color-neutral-600);
				margin-right: 0.5rem;
			}

		
		`
	}


	render() {
		const {open, type, wwformat, protocol, location, filename, handleProtocolChange, handleFormatChange, handleLocationChange, handleRequestClose, emitSubmit} = this
		return html`
			<sl-dialog ?open=${open} label=${type == "saving"? msg("Save your document"): msg("Load a document")} @sl-request-close=${handleRequestClose}>
			<sl-icon slot="label" name=${`file-earmark-arrow-${type == "saving"? "down": "up"}-fill`}></sl-icon>
				<span slot="label">${type == "saving"? msg("Save your document"): msg("Load a document")}</span>
				<form>
					<label for="format">
						<sl-icon class="label-icon" name="file-earmark"></sl-icon>
						<span>${type === "saving"? msg("Save as..."): msg("Load as...")}</span>
					</label>
					<sl-radio-group name="format" value=${wwformat} @sl-change=${handleFormatChange} label=${msg("Format")}>
						${Object.entries(marshal).map(([formatKey, format]) => html`
							<sl-radio-button variant="neutral" ?checked=${formatKey === this.wwformat} value=${formatKey}>${format.label}</sl-radio-button>
							`)}
					</sl-radio-group>
					<label for="protocol">
						<sl-icon class="label-icon" name="folder"></sl-icon>
						<span>${type === "saving"? msg("On..."): msg("From...")}</span>
					</label>
					<sl-radio-group name="protocol" value=${protocol} @sl-change=${handleProtocolChange} label=${msg("Protocol")}>
						${Object.entries(connect).map(([protocolKey, protocol]) => html`
							<sl-radio-button variant="neutral" ?checked=${protocolKey === this.protocol} value=${protocolKey}>${protocol.label}</sl-radio-button>
						`)}
					</sl-radio-group>
					${!connect[this.protocol].handlesLocationPicking? html`
						<sl-input value=${location} @change=${handleLocationChange} type="url" label=${msg("Location")}></sl-input>
					`: null}
				</form>
				<sl-button slot="footer" variant="default" id="cancel-button" @click=${this.hide}>${msg("Cancel")}</sl-button>
				<sl-button ?loading=${this.loading} slot="footer" variant="primary" id="submit-button" @click=${emitSubmit}>${type === "saving"? msg("Save"): msg("Load")}</sl-button>
			</sl-dialog>
		`
	}
}