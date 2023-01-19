import { LitElement, html, css, PropertyValueMap } from "lit"
import { customElement, property, query, queryAsync } from "lit/decorators.js"
import {classMap} from "lit/directives/class-map.js"
import { SlDrawer } from "@shoelace-style/shoelace"
import { Package, PackageWithOptions } from "../../state"
import { pickFile } from "../../environment"
import { Button } from "./uielements"
import { msg } from "@lit/localize"


@customElement("ww-package-manager-drawer")
export class PackageManagerDrawer extends LitElement {

	@property({attribute: false})
	packages: Package[] = []

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
	installing: string[] = []

	@property({attribute: false})
	uninstalling: string[] = []

	@property({attribute: false})
	updating: string[] = []

	@property({type: Boolean, attribute: true})
	loading: boolean = false

	@property({type: Boolean, attribute: true})
	resetting: boolean = false

	@property({type: String})
	unlistedInstallUrl: string = ""

	@property({attribute: false})
	viewingError: string[] = []

	get installingUnlisted() {
		return this.installing.includes(this.unlistedInstallUrl)
	}

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

	emitResetAppDir = () => this.dispatchEvent(
		new CustomEvent("ww-reset-app-dir", {composed: true, bubbles: true})
	)

	handleTabShow(e: CustomEvent<{name: PackageManagerDrawer["activeTab"]}>) {
		this.activeTab = e.detail.name
	}

	async handleFindLocalPackage(e: MouseEvent) {
		const dirPath = await pickFile({directory: true, multiple: false}) as string
		this.unlistedInstallUrl = `file:${dirPath}`
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

			.package-description:empty::before {
				content: "No description";
				color: darkgray;
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

			.unlisted-install sl-icon-button, .unlisted-install ww-button {
				margin-inline-end: 0;
			}

			.unlisted-install sl-icon-button {
				padding-inline-end: 0;
			}

			#more-tab-content {
				display: flex;
				flex-direction: column;
				gap: 1rem;
			}

			.confirm-install-unlisted::part(base) {
				border: none;
			}

			.error-badge {
				margin-right: auto;
				cursor: pointer;
			}

			sl-card:not(.unimportable) .error-badge {
				display: none;
			}

			.error-badge::part(base) {
				display: flex;
				flex-direction: row;
				gap: 1ch;
			}

			.error-label {
				text-decoration: underline solid var(--sl-color-red-600) 2px;
			}

			.error-text {
				font-family: 'Courier New', Courier, monospace;
				font-size: 0.7rem;
			}

		`
	}

	registryStatusIndicator = () => {
		switch(this.registryStatus) {
			case "pending": return html`<sl-spinner slot="label"></sl-spinner>`
			case "fulfilled": return null
			case "rejected": return html`<sl-alert class="error" open variant="danger">
				<sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
				<span>${msg("Error connecting to registry")}</span>
			</sl-alert>`
		}
	}


	packageListItem = (pkg: PackageWithOptions, i: number) => {
		const {name, author, version, description, keywords, installed, outdated, importError} = pkg
		const installing = this.installing.includes(name)
		const uninstalling = this.uninstalling.includes(name)
		const updating = this.updating.includes(name)
		const official = name.startsWith("@webwriter/")
		const unimportable = !!importError
		const available = !installed
		// @ts-ignore
		return html`<sl-card class=${classMap({installed, outdated, available, official, unimportable})}>
			<sl-icon name="box-seam" slot="header"></sl-icon>
			<span class="package-name" slot="header">${name}</span>
			<span class="package-author" slot="header">${author}</span>
			<code class="package-version" slot="header">${version}</code>
			<br slot="header">
			${keywords?.filter(kw => kw !== "webwriter-widget" && kw !== "official").map(kw => html`
				<sl-tag variant="primary" slot="header">${kw}</sl-tag>
			`)}
			<span class="package-description">${description}</span>
			<sl-badge slot="footer" variant="danger" class="error-badge" @click=${() => this.viewingError = [...this.viewingError, pkg.name]} title=${msg("View error")}>
				<sl-icon name="exclamation-diamond"></sl-icon> <span>${msg("Import failed")}</span>
			</sl-badge>
			<sl-dialog ?open=${this.viewingError.includes(pkg.name)} @sl-show=${(e: any) => {e.stopPropagation()}} @sl-hide=${(e: any) => {e.stopPropagation(); this.viewingError = this.viewingError.filter(name => name !== pkg.name)}}>
				<span class="error-label" slot="label">${msg("Error importing")}<span class="package-name">${pkg.name}</span></span>
				<span class="error-text">${String(importError)}</span>
			</sl-dialog>
			<sl-button @click=${() => this.emitUpdatePackage(name)} outline slot="footer" ?loading=${updating}  ?disabled=${uninstalling || installing || !outdated}>${msg("Update")}</sl-button>
			${installed
				? html`<sl-button @click=${() => this.emitUninstallPackage(name)} outline slot="footer" ?loading=${uninstalling} ?disabled=${installing || updating}>${msg("Uninstall")}</sl-button>`
				: html`<sl-button @click=${() => this.emitInstallPackage(name)} outline slot="footer" ?loading=${installing} ?disabled=${uninstalling || updating}>${msg("Install")}</sl-button>`
			}
		</sl-card>`
	}

	npmPrompt = () => {
		return html`<sl-input value=${this.unlistedInstallUrl} @sl-input=${(e: any) => this.unlistedInstallUrl = e.target.value} class="unlisted-install" name="path" label=${msg("Install unlisted package")} help-text=${msg("Enter either A) a path to a local folder, or B) a path to a .tar.gz archive, or C) a git remote URL, each containing an npm module")}>
				<sl-icon-button title=${msg("Find a local package")} @click=${this.handleFindLocalPackage} name="folder2-open" slot="suffix"></sl-icon-button>
				<ww-button ?loading=${this.installingUnlisted} circle class="confirm-install-unlisted" title=${msg("Install unlisted package")} type="submit" slot="suffix" @click=${() => this.emitInstallPackage(this.unlistedInstallUrl)} @sl-hide=${(e: any) => e.stopPropagation()} ?disabled=${!this.unlistedInstallUrl}>
				<sl-icon name="arrow-return-left"></sl-icon>
				</ww-button>
			</sl-input>`
	}

	viewAppDirButton = () => {
		return html`<sl-button variant="neutral" class="view-local-files" @click=${this.emitOpenAppDir}>
			${msg("View local application directory")}
		</sl-button>`
	}

	resetAppDirButton = () => {
		return html`<sl-button variant="danger" class="reset-local-files" @click=${this.emitResetAppDir} ?loading=${this.resetting}>
			${msg("Reset local application directory")}
		</sl-button>`
	}

	render() {
		const installed = this.packages.filter(pkg => pkg.installed)
		const available = this.packages.filter(pkg => !pkg.installed)
		const outdated = installed.filter(pkg => pkg.outdated)
		const all = [...available, ...installed]
		const packages = {all, installed, available, outdated, more: []}[this.activeTab]
		return html`
			<sl-drawer part="drawer" placement="start" ?open=${this.open} @sl-hide=${this.handleCloseDrawer}>
					<span class="drawer-title" slot="label">
						<sl-icon name="boxes" slot="label"></sl-icon>
						<span>${msg("Packages")}</span>
						<sl-button id="refresh-button" @click=${this.emitRefresh} ?loading=${this.loading} title=${msg("Refresh packages")}>
							<sl-icon name="arrow-clockwise"></sl-icon>
						</sl-button>
						<sl-icon-button id="close-button" name="x" @click=${this.hide}></sl-icon-button>
					</span>
					<sl-tab-group slot="label" @sl-tab-show=${this.handleTabShow}>
						<sl-tab panel="all" slot="nav">
							${msg("All")}
							<sl-badge variant="primary" pill>${!this.loading? all.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="available" slot="nav" ?disabled=${!navigator.onLine}>
							${msg("Available")}
							<sl-badge variant="success" pill>${!this.loading? available.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="installed" slot="nav">
							${msg("Installed")}
							<sl-badge variant="neutral" pill>${!this.loading? installed.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="outdated" slot="nav" ?disabled=${!navigator.onLine}>
							${msg("Outdated")}
							<sl-badge variant="warning" pill>${!this.loading? outdated.length: "?"}</sl-badge>
						</sl-tab>
						<sl-tab panel="more" slot="nav">
							${msg("More")}
						</sl-tab>
					</sl-tab-group>
					<sl-alert variant="warning" ?open=${!navigator.onLine}>
						<sl-icon slot="icon" name="wifi-off"></sl-icon>
						<b>${msg("Warning:")} </b>
						<span>${msg("You seem to be offline. While offline, you can't manage available or outdated packages.")}</span>
					</sl-alert>
					${this.activeTab === "more"? null: html`
						<div class="package-list">
							${packages.length === 0 && !this.loading
								? html`<span>${msg("No packages in this list")}</span>`
								: packages.map(this.packageListItem) 
							}
						</div>
					`}
					${this.activeTab === "more"? html`<div id="more-tab-content">
						${this.npmPrompt()}
						${this.viewAppDirButton()}
						${this.resetAppDirButton()}
					</div>`: null}
					<div class="spinner-container">
						${this.loading? html`
							<sl-spinner></sl-spinner>
							<span>${msg("Loading packages...")}</span>
						`: null}
					</div>
			</sl-drawer>
		`
	}
}