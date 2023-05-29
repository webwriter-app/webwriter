import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import {classMap} from "lit/directives/class-map.js"
import { localized, msg, str } from "@lit/localize"
import { SlBadge } from "@shoelace-style/shoelace"

import { Package, PackageWithOptions } from "../../model"
import { shortenBytes } from "../../utility"

@localized()
@customElement("ww-package-manager")
export class PackageManager extends LitElement {

	@property({attribute: false})
	packages: PackageWithOptions[] = []

	@property({type: Number, attribute: true, reflect: true})
	pageSize: number = 20

	@property({attribute: false})
	adding: string[] = []

	@property({attribute: false})
	removing: string[] = []

	@property({attribute: false})
	upgrading: string[] = []

	@property({type: Boolean, attribute: true, reflect: true})
	loading: boolean = false

	@property({type: Boolean, attribute: true})
	resetting: boolean = false

	@property({attribute: false})
	viewingError: string[] = []

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

	emitAddPackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-add-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
	)

	emitRemovePackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-remove-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
	)

	emitUpgradePackage = (pkg: string) => this.dispatchEvent(
		new CustomEvent("ww-upgrade-package", {composed: true, bubbles: true, detail: {args: [pkg]}})
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

	emitAddLocalPackage = () => this.dispatchEvent(
		new CustomEvent("ww-add-local-package", {composed: true, bubbles: true})
	)

	emitToggleWatch = (name: string) => this.dispatchEvent(
		new CustomEvent("ww-toggle-watch", {composed: true, bubbles: true, detail: {name}})
	)


	static get styles() {
		return css`

			sl-tab-group {
				grid-row: 2;
			}

			sl-tab::part(base) {
				padding: 0.5rem;
				width: 100%;
				display: flex;
				gap: 1ch;
			}

			sl-tab-panel[active]::part(base) {
				height: 100%;
				overflow: auto;
				display: flex;
				flex-direction: column;
				gap: 1ch;
				padding-bottom: 1rem;
			}

			sl-alert::part(base) {
				display: block flex;
			}

			.package-list {
				display: flex;
				flex-direction: column;
				gap: 1rem;
			}

			.package-list > span {
				text-align: center;
			}

			sl-card {
				box-shadow: rgba(149, 157, 165, 0.2) 0px 8px 24px;
			}

			sl-card.installed::part(base) {
				border-left: 4px solid var(--sl-color-teal-600);
			}


			sl-card.outdated::part(base) {
				border-left: 4px solid var(--sl-color-amber-600);
			}

			sl-card.available::part(base) {
				border-left: 4px solid var(--sl-color-lime-600);
			}

			sl-card.local::part(base) {
				border-left: 4px solid var(--sl-color-fuchsia-800);
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
				flex-wrap: wrap;
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

			.packages-tab-badge::part(base) {
				min-width: 5.25ch;
				aspect-ratio: 1 / 1;
			}

			
			.packages-tab-badge sl-spinner {
				--indicator-color: white; 
				--track-color: darkgray;
				--track-width: 2.5px;
				font-size: 1rem;
			}

			.badge-action {
				font-size: 1rem;
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
				display: flex;
				flex-direction: row;
				gap: 1ch;
			}

			.error-text {
				font-family: 'Courier New', Courier, monospace;
				font-size: 0.7rem;
			}

			.badge-action {
				display: none;
			}

			:host(:not([loading])) sl-tab[active] .packages-tab-badge:hover .badge-action {
				display: inline;
			}

			:host(:not([loading])) sl-tab[active]:hover .packages-tab-badge:hover .badge-content {
				display: none;
			}

			sl-tab::part(base) {
				justify-content: space-between;
			}

			sl-tab[panel=more]::part(base) {
				justify-content: flex-end;
			}
			
			.view-local-files, .reset-local-files {
				display: block;
			}

			.for-developers::part(base) {
				border-top-color: var(--sl-color-fuchsia-800);
			}

			.for-developers::part(icon) {
				color: var(--sl-color-fuchsia-800);
			}

			.packages-tab-badge.total::part(base) {
				background: var(--sl-color-gray-600);
			}

			.packages-tab-badge.installed::part(base) {
				background: var(--sl-color-cyan-600);
			}

			.packages-tab-badge.available::part(base) {
				background: var(--sl-color-lime-600);
			}

			.packages-tab-badge.outdated::part(base) {
				background: var(--sl-color-amber-600);
			}

			.packages-tab-badge.local::part(base) {
				background: var(--sl-color-fuchsia-800);
			}

			sl-button.total {
				--sl-color-primary-50: var(--sl-color-gray-50);
				--sl-color-primary-100: var(--sl-color-gray-100);
				--sl-color-primary-200: var(--sl-color-gray-200);
				--sl-color-primary-300: var(--sl-color-gray-300);
				--sl-color-primary-400: var(--sl-color-gray-400);
				--sl-color-primary-500: var(--sl-color-gray-500);
				--sl-color-primary-600: var(--sl-color-gray-600);
				--sl-color-primary-700: var(--sl-color-gray-700);
				--sl-color-primary-800: var(--sl-color-gray-800);
				--sl-color-primary-900: var(--sl-color-gray-900);
				--sl-color-primary-950: var(--sl-color-gray-950);				
			}

			sl-button.installed {
				--sl-color-primary-50: var(--sl-color-cyan-50);
				--sl-color-primary-100: var(--sl-color-cyan-100);
				--sl-color-primary-200: var(--sl-color-cyan-200);
				--sl-color-primary-300: var(--sl-color-cyan-300);
				--sl-color-primary-400: var(--sl-color-cyan-400);
				--sl-color-primary-500: var(--sl-color-cyan-500);
				--sl-color-primary-600: var(--sl-color-cyan-600);
				--sl-color-primary-700: var(--sl-color-cyan-700);
				--sl-color-primary-800: var(--sl-color-cyan-800);
				--sl-color-primary-900: var(--sl-color-cyan-900);
				--sl-color-primary-950: var(--sl-color-cyan-950);				
			}

			sl-button.available {
				--sl-color-primary-50: var(--sl-color-lime-50);
				--sl-color-primary-100: var(--sl-color-lime-100);
				--sl-color-primary-200: var(--sl-color-lime-200);
				--sl-color-primary-300: var(--sl-color-lime-300);
				--sl-color-primary-400: var(--sl-color-lime-400);
				--sl-color-primary-500: var(--sl-color-lime-500);
				--sl-color-primary-600: var(--sl-color-lime-600);
				--sl-color-primary-700: var(--sl-color-lime-700);
				--sl-color-primary-800: var(--sl-color-lime-800);
				--sl-color-primary-900: var(--sl-color-lime-900);
				--sl-color-primary-950: var(--sl-color-lime-950);				
			}

			sl-button.outdated {
				--sl-color-primary-50: var(--sl-color-amber-50);
				--sl-color-primary-100: var(--sl-color-amber-100);
				--sl-color-primary-200: var(--sl-color-amber-200);
				--sl-color-primary-300: var(--sl-color-amber-300);
				--sl-color-primary-400: var(--sl-color-amber-400);
				--sl-color-primary-500: var(--sl-color-amber-500);
				--sl-color-primary-600: var(--sl-color-amber-600);
				--sl-color-primary-700: var(--sl-color-amber-700);
				--sl-color-primary-800: var(--sl-color-amber-800);
				--sl-color-primary-900: var(--sl-color-amber-900);
				--sl-color-primary-950: var(--sl-color-amber-950);				
			}

			sl-button.local {
				--sl-color-primary-50: var(--sl-color-fuchsia-50);
				--sl-color-primary-100: var(--sl-color-fuchsia-100);
				--sl-color-primary-200: var(--sl-color-fuchsia-200);
				--sl-color-primary-300: var(--sl-color-fuchsia-300);
				--sl-color-primary-400: var(--sl-color-fuchsia-400);
				--sl-color-primary-500: var(--sl-color-fuchsia-500);
				--sl-color-primary-600: var(--sl-color-fuchsia-600);
				--sl-color-primary-700: var(--sl-color-fuchsia-700);
				--sl-color-primary-800: var(--sl-color-fuchsia-800);
				--sl-color-primary-900: var(--sl-color-fuchsia-900);
				--sl-color-primary-950: var(--sl-color-fuchsia-950);
			}

			sl-button.local sl-icon {
				font-size: 1.1rem;
				color: var(--sl-color-fuchsia-800)
			}

			sl-button.uninstalled {
				--sl-color-primary-50: var(--sl-color-red-50);
				--sl-color-primary-100: var(--sl-color-red-100);
				--sl-color-primary-200: var(--sl-color-red-200);
				--sl-color-primary-300: var(--sl-color-red-300);
				--sl-color-primary-400: var(--sl-color-red-400);
				--sl-color-primary-500: var(--sl-color-red-500);
				--sl-color-primary-600: var(--sl-color-red-600);
				--sl-color-primary-700: var(--sl-color-red-700);
				--sl-color-primary-800: var(--sl-color-red-800);
				--sl-color-primary-900: var(--sl-color-red-900);
				--sl-color-primary-950: var(--sl-color-red-950);
			}

			sl-tooltip {
				--show-delay: 750;
			}
		`
	}

	packageListItem = (pkg: PackageWithOptions, i: number) => {
		const {name, author, version, description, keywords, installed, outdated, importError, localPath, watching, jsSize, cssSize} = pkg
		const {emitAddPackage, emitRemovePackage, emitUpgradePackage, emitToggleWatch} = this
		const adding = this.adding.includes(name)
		const removing = this.removing.includes(name)
		const upgrading = this.upgrading.includes(name)
		const official = name.startsWith("@webwriter/")
		const local = !!localPath
		const unimportable = !!importError
		const available = !installed
		// @ts-ignore
		return html`<sl-card class=${classMap({installed, outdated, available, official, unimportable, local})}>
			<sl-icon name="box-seam" slot="header"></sl-icon>
			<sl-tooltip ?disabled=${!localPath} slot="header" @sl-show=${(e: any) => e.stopPropagation()} style="cursor: help">
				<div slot="content">
					<div><b>${msg("JS Size:")}</b> ${shortenBytes(jsSize ?? 0)}</div>
					<div><b>${msg("CSS Size:")}</b> ${shortenBytes(cssSize ?? 0)}</div>
				</div>
				<span class="package-name">${name}</span>
			</sl-tooltip>
			<span class="package-author" slot="header">${author}</span>
			<code class="package-version" slot="header">${version}</code>
			<br slot="header">
			${keywords?.filter(kw => kw !== "webwriter-widget" && kw !== "official").map(kw => html`
				<sl-tag variant="primary" slot="header">${kw}</sl-tag>
			`)}
			<span class="package-description">${description}</span>
			${!installed? null: html`
				<sl-badge slot="footer" variant="danger" class="error-badge" @click=${() => this.viewingError = [...this.viewingError, pkg.name]} title=${msg("View error")}>
					<sl-icon name="exclamation-diamond"></sl-icon> <span>${msg("Error")}</span>
				</sl-badge>			
			`}
			${local? html`
				<sl-tooltip slot="footer" @sl-show=${(e: any) => e.stopPropagation()}>
					<span slot="content">${watching? msg(html`Stop watching files at <b><code>${localPath}</code></b>.`): msg(html`Start watching files at <b><code>${localPath}</code></b> and reload the package if a file is changed.`)}</span>
					<sl-button circle class="local" @click=${() => emitToggleWatch(name)}>
						<sl-icon name=${`lightning-charge${watching? "-fill": ""}`}></sl-icon>
					</sl-button>
				</sl-tooltip>
			`: html`
				<sl-button class="outdated" @click=${() => emitUpgradePackage(name)} outline slot="footer" ?loading=${upgrading}  ?disabled=${removing || adding || !outdated}>
					${msg("Update")}
				</sl-button>
			`}
			${installed
				? html`<sl-button class="uninstalled" @click=${() => emitRemovePackage(name)} outline slot="footer" ?loading=${removing} ?disabled=${adding || upgrading}>${msg("Uninstall")}</sl-button>`
				: html`<sl-button class="installed" @click=${() => emitAddPackage(name)} outline slot="footer" ?loading=${adding} ?disabled=${removing || upgrading}>${msg("Install")}</sl-button>`
			}
			<sl-dialog ?open=${this.viewingError.includes(pkg.name)} @sl-show=${(e: any) => {e.stopPropagation()}} @sl-hide=${(e: any) => {e.stopPropagation(); this.viewingError = this.viewingError.filter(name => name !== pkg.name)}}>
				<span class="error-label" slot="label"><span>${msg("Error importing")}</span><span class="package-name">${pkg.name}</span></span>
				<span class="error-text">${String(importError)}</span>
			</sl-dialog>
		</sl-card>`
	}

	addLocalPackageButton = () => {
		return html`<sl-button @click=${this.emitAddLocalPackage} class="local" help-text=${msg("Either select an existing package directory to install or an empty directory to create a new package.")}>
			<sl-icon name="folder2-open"></sl-icon>
			<span>${msg("Add unlisted package")}</span>
		</sl-button>`
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

	packagesTabBadge = (length: number, key: string) => html`
		<sl-badge class=${classMap({"packages-tab-badge": true, [key]: true})} pill>
			<span class="badge-content">
				${this.loading? html`<sl-spinner></sl-spinner>`: length ?? 0}
			</span>
			<sl-icon name="arrow-clockwise" class="badge-action"></sl-icon>
		</sl-badge>
	`

	packagesTab = (key: "total" | "installed" | "available" | "outdated" | "local", label: string, packages: Package[], emptyText?: string) => {
		const length = packages.length
		const variant = ({"total": "primary", "installed": "neutral", "available": "success", "outdated": "warning", "local": "danger"} as Record<typeof key, SlBadge["variant"]>)[key]
		return html`
			<sl-tab panel=${key} slot="nav" @focus=${() => !this.loading && this.emitRefresh} @click=${() => !this.loading && this.emitRefresh()} ?active=${key === "total"} ?disabled=${["available", "outdated"].includes(key) && !navigator.onLine}>
				${this.packagesTabBadge(length, key)}
				${label}
			</sl-tab>
			<sl-tab-panel name=${key} ?active=${key === "total"}>
				<sl-alert variant="warning" ?open=${!navigator.onLine}>
					<sl-icon slot="icon" name="wifi-off"></sl-icon>
					<b>${msg("Warning:")} </b>
					<span>${msg("You seem to be offline. While offline, you can't manage available or outdated packages.")}</span>
				</sl-alert>
				${key !== "local"? null: html`
					<sl-alert class="for-developers" open>
						<sl-icon slot="icon" name="code-square"></sl-icon>
						${msg("Local packages are intended for developers.")}
					</sl-alert>
					${this.addLocalPackageButton()}
				`}
				<div class="package-list">
						${length === 0 && !this.loading
							? html`<span>${emptyText}</span>`
							: packages.map(this.packageListItem) 
						}
				</div>
			</sl-tab-panel>

		`
	}

	render() {
		const packageTabs = [
			{
				key: "total" as const,
				label: msg("Total"),
				packages: this.packages,
				emptyText: msg("No packages installed or available")
			},
			{
				key: "installed" as const,
				label: msg("Installed"),
				packages: this.packages.filter(pkg => !pkg.localPath && pkg.installed),
				emptyText: msg("No packages installed")
			},
			{
				key: "available" as const,
				label: msg("Available"),
				packages: this.packages.filter(pkg => !pkg.installed),
				emptyText: msg("No packages available")
			},
			{
				key: "outdated" as const,
				label: msg("Outdated"),
				packages: this.packages.filter(pkg => pkg.outdated),
				emptyText: msg("No packages outdated")
			},
			{
				key: "local" as const,
				label: msg("Local"),
				packages: this.packages.filter(pkg => pkg.localPath),
				emptyText: msg("No local packages")
			}
		]
		return html`
			<div part="base">
					<sl-tab-group slot="label" placement="start">
						${packageTabs.map(x => this.packagesTab(x.key, x.label, x.packages, x.emptyText))}
					</sl-tab-group>
			</div>
		`
	}
}