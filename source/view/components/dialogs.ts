import { LitElement, html, css, PropertyValueMap } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { Format, Protocol } from "../../state";
import { WWURL } from "../../utility";
import * as connect from "../../connect"
import * as marshal from "../../marshal"
import { SlDialog, SlDrawer } from "@shoelace-style/shoelace";
import { PackageController, PackageJson } from "../controllers";


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
			<sl-dialog ?open=${open} label=${type == "saving"? "Save your document": "Load a document"} @sl-request-close=${handleRequestClose}>
			<sl-icon slot="label" name="file-earmark-arrow-down-fill"></sl-icon>
				<span slot="label">${type == "saving"? "Save your document": "Load a document"}</span>
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


@customElement("ww-package-manager-drawer")
export class PackageManagerDrawer extends LitElement {

	packageManager = new PackageController(this)

	fetchInstalledPackages = async () => {
		this.loading = true
		this.installedPackages = await this.packageManager.getInstalledPackages()
		this.loading = false
	}

	protected updated(changed: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
		changed.has("open") && this.open? this.fetchInstalledPackages(): null
	}

	@property({attribute: false})
	installedPackages: PackageJson[] = []

	@property({attribute: false})
	availablePackages: PackageJson[] = []

	@query("sl-drawer")
	drawer: SlDrawer

	@property({type: Boolean, attribute: true, reflect: true})
	open: boolean = false

	@property({type: Number, attribute: true, reflect: true})
	pageSize: number = 20

	@property({type: String, attribute: true, reflect: true})
	registryStatus: "pending" | "fulfilled" | "rejected" = "fulfilled"

	@property({type: Boolean, attribute: true, reflect: true})
	loading: Boolean = true

	@property({attribute: false})
	installingPackages: string[] = []

	@property({attribute: false})
	uninstallingPackages: string[] = []

	@property({attribute: false})
	updatingPackages: string[] = []


	async hide() {
		await this.drawer.hide()
		this.emitHide()
	}

	emitSubmit = () => this.dispatchEvent(
		new CustomEvent("ww-submit", {composed: true, bubbles: true})
	)

	emitHide = () => this.dispatchEvent(
		new CustomEvent("sl-hide", {composed: true, bubbles: true})
	)

	handleCloseDrawer() {
		this.installedPackages = []
		this.availablePackages = []
		this.emitHide()
	}

	async handleInstallPackage(pkg: string) {
		this.installingPackages = [...this.installingPackages, pkg]
		await this.packageManager.install([pkg])
		this.installingPackages = this.installingPackages.filter(p => p !== pkg)
	}

	async handleUninstallPackage(pkg: string) {
		this.uninstallingPackages = [...this.uninstallingPackages, pkg]
		await this.packageManager.uninstall([pkg])
		this.uninstallingPackages = this.uninstallingPackages.filter(p => p !== pkg)
	}

	async handleUpdatePackage(pkg: string) {
		this.updatingPackages = [...this.updatingPackages, pkg]
		await this.packageManager.update([pkg])
		this.updatingPackages = this.updatingPackages.filter(p => p !== pkg)
	}


	static get styles() {
		return css`

			sl-drawer::part(body) {
				background: #f1f1f1;
			}

			sl-drawer::part(title) {
				display: grid;
				grid-template-rows: auto auto;
				grid-template-columns: auto;
				gap: 0.5rem;
				background: #f1f1f1;
				padding: 1rem;
				padding-bottom: 0;
			}

			sl-tab-group {
				grid-row: 2;
			}

			sl-tab::part(base) {
				padding: 0.5rem;
			}

			sl-drawer::part(close-button) {
				background: #f1f1f1;
				display: flex;
				flex-direction: column;
				justify-content: flex-start;
				padding: 1rem;
			}

			sl-alert::part(base) {
				display: block flex;
			}

			.package-list {
				display: flex;
				flex-direction: column;
				gap: 1rem;
			}

			sl-card {
				box-shadow: rgba(149, 157, 165, 0.2) 0px 8px 24px;
			}

			sl-card::part(header) {
				display: flex;
				flex-direction: row;
				align-items: center;
				flex-wrap: wrap;
				gap: 0.4rem;
			}

			sl-card::part(footer) {
				display: flex;
				flex-direction: row;
				justify-content: flex-end;
				gap: 0.25rem;
				padding: 0.25rem;
			}

			sl-tag::part(base) {
				padding: 0.2rem;
				height: 20px;
			}

			.package-name {
				color: var(--sl-color-primary-950);
				font-weight: bold;
			}

			.package-author {
				display: none;
			}

			.package-description {
				font-size: 1rem;
			}

			.spinner-container {
				display: flex;
				flex-direction: row;
				justify-content: center;
			}

			.spinner-container > sl-spinner {
				font-size: 2rem;
				--track-width: 4px;
			}

			.drawer-title {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 1rem;
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


	packageListItem = (pkg: PackageJson, i: number) => {
		const installing = this.installingPackages.includes(pkg.name)
		const uninstalling = this.uninstallingPackages.includes(pkg.name)
		const updating = this.updatingPackages.includes(pkg.name)
		return html`<sl-card>
			<sl-icon name="box-seam" slot="header"></sl-icon>
			<span class="package-name" slot="header">${pkg.name}</span>
			<span class="package-author" slot="header">${pkg.author}</span>
			<code class="package-version" slot="header">${pkg.version}</code>
			${pkg?.keywords?.map(kw => html`<sl-tag variant="primary" slot="header">${kw}</sl-tag>`)}
			<span class="package-description">${pkg.description}</span>
			<sl-button @click=${() => this.handleUpdatePackage(pkg.name)} outline slot="footer" ?loading=${updating}  ?disabled=${uninstalling || installing || !pkg.outdated}>Update</sl-button>
			${pkg.installed
				? html`<sl-button @click=${() => this.handleUninstallPackage(pkg.name)} outline slot="footer" ?loading=${uninstalling} ?disabled=${installing || updating}>Uninstall</sl-button>`
				: html`<sl-button @click=${() => this.handleInstallPackage(pkg.name)} outline slot="footer" ?loading=${installing} ?disabled=${uninstalling || updating}>Install</sl-button>`
			}
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
			<sl-drawer placement="start" ?open=${this.open} @sl-hide=${this.handleCloseDrawer}>
					<span class="drawer-title" slot="label">
						<sl-icon name="boxes" slot="label"></sl-icon>
						Manage packages
					</span>
					${this.registryStatusIndicator()}
					<sl-tab-group slot="label">
						<sl-tab name="all" slot="nav">All</sl-tab>
						<sl-tab name="installed" slot="nav">Installed</sl-tab>
						<sl-tab name="available" slot="nav">Available</sl-tab>
					</sl-tab-group>
					<div class="package-list">
						${allPackages.map(this.packageListItem)}
					</div>
					<div class="spinner-container">${this.loading? html`<sl-spinner></sl-spinner>`: null}</div>
			</sl-drawer>
		`
	}
}