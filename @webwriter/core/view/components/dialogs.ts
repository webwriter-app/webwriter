import { LitElement, html, css, PropertyValueMap } from "lit";
import { customElement, property, query, queryAsync } from "lit/decorators.js";
import {classMap} from "lit/directives/class-map.js"
import { Format, Protocol } from "../../state";
import { WWURL } from "../../utility";
import * as connect from "../../connect"
import * as marshal from "../../marshal"
import { SlDialog, SlDrawer } from "@shoelace-style/shoelace";
import { PackageJson } from "../../state";
import { pickFile } from "../../environment";


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
			<sl-icon slot="label" name=${`file-earmark-arrow-${type == "saving"? "down": "up"}-fill`}></sl-icon>
				<span slot="label">${type == "saving"? "Save your document": "Load a document"}</span>
				<form>
					<label for="format">
						<sl-icon class="label-icon" name="file-earmark"></sl-icon>
						<span>${type === "saving"? "Save as...": "Load as..."}</span>
					</label>
					<sl-radio-group name="format" value=${wwformat} @sl-change=${handleFormatChange} label="Format">
						${Object.entries(marshal).map(([formatKey, format]) => html`
							<sl-radio-button variant="neutral" ?checked=${formatKey === this.wwformat} value=${formatKey}>${format.label}</sl-radio-button>
							`)}
					</sl-radio-group>
					<label for="protocol">
						<sl-icon class="label-icon" name="folder"></sl-icon>
						<span>${type === "saving"? "On...": "From..."}</span>
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
				<sl-button ?loading=${this.loading} slot="footer" variant="primary" id="submit-button" @click=${emitSubmit}>${type === "saving"? "Save": "Load"}</sl-button>
			</sl-dialog>
		`
	}
}


@customElement("ww-package-manager-drawer")
export class PackageManagerDrawer extends LitElement {

	@property({attribute: false})
	packages: PackageJson[] = []

	@property({type: String, attribute: true})
	activeTab: "all" | "available" | "installed" | "outdated" | "more" = "all"

	@query("sl-drawer")
	drawer: SlDrawer

	@queryAsync("sl-drawer")
	drawerAsync: Promise<SlDrawer>

	@property({type: Boolean, attribute: true, reflect: true})
	open: boolean = false

	@property({type: Number, attribute: true, reflect: true})
	pageSize: number = 20

	@property({type: String, attribute: true, reflect: true})
	registryStatus: "pending" | "fulfilled" | "rejected" = "fulfilled"

	@property({attribute: false})
	installPackages: string[] = []

	@property({attribute: false})
	uninstallPackages: string[] = []

	@property({attribute: false})
	updatePackages: string[] = []

	@property({type: Boolean, attribute: true})
	loading: boolean = false

	@property({type: String})
	unlistedInstallUrl: string = ""

	private requestUpdateFull = () => this.requestUpdate()

	async connectedCallback() {
		super.connectedCallback()
		window.addEventListener("online", this.requestUpdateFull)
		window.addEventListener("offline", this.requestUpdateFull);
	}

	disconnectedCallback() {
		super.disconnectedCallback()
		window.removeEventListener("online", this.requestUpdateFull)
		window.removeEventListener("offline", this.requestUpdateFull)
	}

	protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
		_changedProperties.has("open") && this.open && this.emitRefresh()
	}



	async hide() {
		await this.drawer.hide()
		this.emitHide()
	}

	emitHide = () => this.dispatchEvent(
		new CustomEvent("sl-hide", {composed: true, bubbles: true})
	)

	handleCloseDrawer() {
		this.emitHide()
	}

	emitInstallPackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-install-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
	)

	emitUninstallPackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-uninstall-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
	)

	emitUpdatePackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-update-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
	)

	emitRefresh = () => this.dispatchEvent(
		new CustomEvent("ww-refresh", {composed: true, bubbles: true})
	)

	emitOpenAppDir = () => this.dispatchEvent(
		new CustomEvent("ww-open-app-dir", {composed: true, bubbles: true})
	)

	emitClearAppDir = () => this.dispatchEvent(
		new CustomEvent("ww-clear-app-dir", {composed: true, bubbles: true})
	)

	handleTabShow(e: CustomEvent<{name: PackageManagerDrawer["activeTab"]}>) {
		this.activeTab = e.detail.name
	}

	async handleFindLocalPackage(e: MouseEvent) {
		const dirPath = await pickFile({directory: true, multiple: false}) as string
		this.unlistedInstallUrl = dirPath
	}


	static get styles() {
		return css`

			sl-drawer {
				--header-spacing: 0;
			}

			sl-drawer::part(body) {
				background: #f1f1f1;
				overflow-y: scroll;
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

			sl-drawer::part(header) {
				background: #f1f1f1;
			}

			sl-drawer::part(header) > sl-icon-button {
				background: #f1f1f1;
			}

			sl-drawer::part(close-button__base), sl-drawer::part(close-button) {
				display: none !important;
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

			sl-card.installed::part(base) {
				border-left: 4px solid var(--sl-color-gray-600);
			}


			sl-card.outdated::part(base) {
				border-left: 4px solid var(--sl-color-yellow-600);
			}

			sl-card.available::part(base) {
				border-left: 4px solid var(--sl-color-green-600);
			}

			sl-card:not(.official) .official-icon {
				display: none;
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

			sl-tab::part(base) {
				position: relative;
				padding-right: 1.15rem;
			}

			sl-tab sl-badge::part(base) {
				position: absolute;
				right: 0;
				top: 0;
				font-size: 0.65rem;
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
				display: none;
				align-items: center;
				gap: 1rem;
				color: var(--sl-color-neutral-700);
				margin-top: 2rem;
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
				width: 100%;
			}

			sl-alert {
				margin-bottom: 1rem;
			}

			#refresh-button::part(base) {
				background: none;
				border: none;
				padding: none;
				font-size: 1.25rem;
			}

			#close-button, #close-button::part(base) {
				font-size: 2rem;
				margin-left: auto;
				justify-self: end;
			}

			.unlisted-install::part(form-control-label) {
				font-weight: bold;
			}

			.unlisted-install sl-icon-button {
				padding-inline-end: 0;
			}

			#more-tab-content {
				display: flex;
				flex-direction: column;
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
		const {name, author, version, description, keywords, installed, outdated} = pkg
		const installing = this.installPackages.includes(name)
		const uninstalling = this.uninstallPackages.includes(name)
		const updating = this.updatePackages.includes(name)
		const official = name.startsWith("@webwriter/")
		return html`<sl-card class=${classMap({installed, outdated, available: !installed, official})}>
			<sl-icon name="box-seam" slot="header"></sl-icon>
			<span class="package-name" slot="header">${name}</span>
			<span class="package-author" slot="header">${author}</span>
			<code class="package-version" slot="header">${version}</code>
			<br slot="header">
			${["official"].concat(keywords?.filter(kw => kw !== "webwriter" && kw !== "official")).map(kw => html`
				<sl-tag variant="primary" slot="header">${kw}</sl-tag>
			`)}
			<span class="package-description">${description}</span>
			<sl-button @click=${() => this.emitUpdatePackage(name)} outline slot="footer" ?loading=${updating}  ?disabled=${uninstalling || installing || !outdated}>Update</sl-button>
			${installed
				? html`<sl-button @click=${() => this.emitUninstallPackage(name)} outline slot="footer" ?loading=${uninstalling} ?disabled=${installing || updating}>Uninstall</sl-button>`
				: html`<sl-button @click=${() => this.emitInstallPackage(name)} outline slot="footer" ?loading=${installing} ?disabled=${uninstalling || updating}>Install</sl-button>`
			}
		</sl-card>`
	}

	npmPrompt = () => {
		return html`<sl-input value=${this.unlistedInstallUrl} @sl-input=${e => this.unlistedInstallUrl = e.target.value} class="unlisted-install" name="path" label="Install unlisted package" help-text="Enter either A) a path to a local folder, or B) a path to a .tar.gz archive, or C) a git remote URL, each containing an npm module">
				<sl-icon-button title="Find a local package" @click=${this.handleFindLocalPackage} name="folder2-open" slot="suffix"></sl-icon-button>
				<sl-icon-button title="Install unlisted package" name="arrow-return-left" type="submit" slot="suffix" @click=${e => this.emitInstallPackage(this.unlistedInstallUrl)} ?disabled=${!this.unlistedInstallUrl}></sl-icon-button>
			</sl-input>`
	}

	viewAppDirButton = () => {
		return html`<sl-button variant="neutral" class="view-local-files" @click=${this.emitOpenAppDir}>
			View local application directory
		</sl-button>`
	}

	clearAppDirButton = () => {
		return html`<sl-button variant="danger" class="clear-local-files" @click=${this.emitClearAppDir}>
			Clear local application directory
		</sl-button>`
	}

	render() {
		const installed = this.packages.filter(pkg => pkg.installed)
		const available = this.packages.filter(pkg => !pkg.installed)
		const outdated = installed.filter(pkg => pkg.outdated)
		const all = [...available, ...installed]
		const packages = {all, installed, available, outdated}[this.activeTab]
		return html`
			<sl-drawer part="drawer" placement="start" ?open=${this.open} @sl-hide=${this.handleCloseDrawer}>
					<span class="drawer-title" slot="label">
						<sl-icon name="boxes" slot="label"></sl-icon>
						<span>Packages</span>
						<sl-button id="refresh-button" @click=${this.emitRefresh} ?loading=${this.loading} title="Refresh packages">
							<sl-icon name="arrow-clockwise"></sl-icon>
						</sl-button>
						<sl-icon-button id="close-button" name="x" @click=${this.hide}></sl-icon-button>
					</span>
					<sl-tab-group slot="label" @sl-tab-show=${this.handleTabShow}>
						<sl-tab panel="all" slot="nav">
							All
							<sl-badge variant="primary" pill>${!this.loading? all.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="available" slot="nav" ?disabled=${!navigator.onLine}>
							Available
							<sl-badge variant="success" pill>${!this.loading? available.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="installed" slot="nav">
							Installed
							<sl-badge variant="neutral" pill>${!this.loading? installed.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="outdated" slot="nav" ?disabled=${!navigator.onLine}>
							Outdated
							<sl-badge variant="warning" pill>${!this.loading? outdated.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="more" slot="nav">
							More
						</sl-tab>
					</sl-tab-group>
					<sl-alert variant="warning" ?open=${!navigator.onLine}>
						<sl-icon slot="icon" name="wifi-off"></sl-icon>
						<b>Warning: </b>
						<span>You seem to be offline. While offline, you can't manage available or outdated packages.</span>
					</sl-alert>
					${this.activeTab === "more"? null: html`
						<div class="package-list">
							${packages.length === 0 && !this.loading
								? html`<span>No packages in this list</span>`
								: packages.map(this.packageListItem) 
							}
						</div>
					`}
					${this.activeTab === "more"? html`<div id="more-tab-content">
						${this.npmPrompt()}
						${this.viewAppDirButton()}
						${this.clearAppDirButton()}
					</div>`: null}
					<div class="spinner-container">
						${this.loading? html`
							<sl-spinner></sl-spinner>
							<span>Loading packages...</span>
						`: null}
					</div>
			</sl-drawer>
		`
	}
}