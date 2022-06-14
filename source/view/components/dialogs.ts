import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { Format, Protocol } from "../../state";
import { WWURL } from "../../utility";
import * as connect from "../../connect"
import * as marshal from "../../marshal"
import { SlDialog } from "@shoelace-style/shoelace";
import type {IPackageJson} from "package-json-type"
import { PackageController } from "../controllers";


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

	get url() {
		const url = new WWURL(`file://${this.location}`)
		url.protocol = `${this.protocol}:`
		url.pathname =  url.pathname + this.filename
		url.wwformat = this.wwformat
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
		this.wwformat = e.target["value"] as Format
	}

	handleProtocolChange(e: Event) {
		this.protocol = e.target["value"] as Protocol
	}

	handleLocationChange(e: Event) {
		this.location = e.target["value"]
	}

	handleRequestClose(e: CustomEvent<{source: "close-button" | "keyboard" | "overlay"}>) {
		e.preventDefault()
		e.detail.source !== "overlay"? this.emitCancel(): null
	}

	static get styles() {
		return css`

			sl-dialog::part(title) {
				font-family: var(--sl-font-sans);
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
			<sl-dialog ?open=${open} label=${type == "saving"? "Save your document": "Load a document"} @sl-request-close=${handleRequestClose}>
				<form>
					<label for="format">
						<sl-icon class="label-icon" name="file-earmark"></sl-icon>
						<span>Save as...</span>
					</label>
					<sl-radio-group name="format" value=${wwformat} @sl-change=${handleFormatChange} label="Format">
						${Object.entries(marshal).map(([formatKey, format]) => html`
							<sl-radio-button variant="neutral" ?checked=${formatKey === this.wwformat} value=${formatKey}>${format.label}</sl-radio-button>
							`)}
					</sl-radio-group>
					<label for="protocol">
						<sl-icon class="label-icon" name="folder"></sl-icon>
						<span>On...</span>
					</label>
					<sl-radio-group name="protocol" value=${protocol} @sl-change=${handleProtocolChange} label="Protocol">
						${Object.entries(connect).map(([protocolKey, protocol]) => html`
							<sl-radio-button variant="neutral" ?checked=${protocolKey === this.protocol} value=${protocolKey}>${protocol.label}</sl-radio-button>
						`)}
					</sl-radio-group>
					${!connect[this.protocol].handlesLocationPicking? html`
						<sl-input value=${location} @change=${handleLocationChange} type="url" label="Location"></sl-input>
					`: null}
				</form>
				<sl-button slot="footer" variant="default" id="cancel-button" @click=${this.hide}>${"Cancel"}</sl-button>
				<sl-button slot="footer" variant="primary" id="submit-button" @click=${emitSubmit}>${type === "saving"? "Save": "Load"}</sl-button>
			</sl-dialog>
		`
	}
}


@customElement("ww-package-manager-dialog")
export class PackageManagerDialog extends LitElement {

	packageManager = new PackageController(this)

	@property({attribute: false})
	installedPackages: IPackageJson[] = []

	@property({attribute: false})
	availablePackages: IPackageJson[] = []

	@query("sl-dialog")
	dialog: SlDialog

	@property({type: Boolean, attribute: true, reflect: true})
	open: boolean = true

	@property({type: Number, attribute: true, reflect: true})
	pageSize: number = 20

	@property({type: String, attribute: true, reflect: true})
	registryStatus: "pending" | "fulfilled" | "rejected" = "rejected"

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

			sl-alert::part(base) {
				display: block flex;
			}

		`
	}

	registryStatusIndicator = () => {
		switch(this.registryStatus) {
			case "pending": return html`<sl-spinner slot="label"></sl-spinner>`
			case "fulfilled": return null
			case "rejected": return html`<sl-alert class="error" open variant="danger">
				<sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
				<span>Error connecting to registry</span>
			</sl-alert>`
		}
	}

	packageListItem = (pkg: IPackageJson) => {
		return html`<sl-card>
			<span slot="header">${pkg.name}</span>
			<span slot="header">${pkg.author}</span>
			<code slot="header">${pkg.version}</code>
			${pkg?.keywords.map(kw => html`<sl-tag slot="header">${kw}</sl-tag>`)}
			<span>${pkg.description}</span>
			<sl-button slot="footer">Install/Uninstall</sl-button>
			<sl-button slot="footer">Update (if available)</sl-button>
			<sl-button slot="footer">Read more...</sl-button>
		</sl-card>`
	}

	npmPrompt = () => {
		return html`<sl-input></sl-input>`
	}

	// NPM availability --> npm ping --json
	// List all available packages --> npm ls --json --long + npm outdated --json + search
		// Per package:
			// Show name, description, version (outdated?), link to package
			// Update package --> npm update <pkg>
			// Install package --> npm install <pkg>
			// Uninstall package --> npm uninstall <pkg>

	// [ADVANCED] Manual npm commands --> npm <...args>

	render() {
		const allPackages = [...this.installedPackages, ...this.availablePackages]
		return html`
			<sl-dialog ?open=${this.open}>
					<span slot="label">Manage widgets</span>
					${this.registryStatusIndicator()}
			</sl-dialog>
		`
	}
}