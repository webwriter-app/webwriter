import "@shoelace-style/shoelace/dist/themes/light.css"
// import "@shoelace-style/shoelace"

export * from "./configurator"
export * from "./editor"
export * from "./elements"
export * from "./layout"

import {LitElement, html, css} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import { localized, msg } from "@lit/localize"

import { escapeHTML, getFileNameInURL } from "../utility"
import {ViewModelMixin} from "../viewmodel"
import { SlAlert } from "@shoelace-style/shoelace"
import { ifDefined } from "lit/directives/if-defined.js"
import { ExplorableEditor } from "./editor"
import { keyed } from "lit/directives/keyed.js"
import { toJS } from "mobx"


export interface SlAlertAttributes {
	message: string
	variant?: SlAlert["variant"]
	icon?: string
	duration?: number
}

/*
@TODO Fix interaction widget insert transition
@TODO Fix clipping on error for local package in palette
@TODO Fix setting hydration of `showWidgetPreview`
@TODO Fix local package loading
@TODO Fix unreliable package install behaviour (queueing issue?)
@TODO Add heading mark
@TODO Add 
*/

@localized()
@customElement("ww-app")
export class App extends ViewModelMixin(LitElement)
{
	
	static get styles() {
		return css`
			:host {
				display: block;
				height: 100vh;
				min-height: 100vh;
				background: #f1f1f1;
				overflow: hidden;
			}

			.save-button::part(base) {
				padding: 0;
				margin-right: 20px;
			}

			:host(.noResources) {
				background-color: #f1f1f1;
				transition: none;
			}

			#initializingPlaceholder {
				display: flex;
				justify-content: center;
				align-items: center;
				height: 100%;
			}

			#initializingPlaceholder > div {
				text-align: center;
			}

			#initializingPlaceholder sl-spinner {
				margin-bottom: 0.5rem;
				font-size: 3rem;
				--track-width: 8px;
			}

			#settings-button {
				margin-top: 1px;
				height: 48px;
				margin-right: auto;
				user-select: none;
				display: flex;
				flex-direction: row;
				align-items: center;
				text-overflow: ellipsis;
				overflow: hidden;
				box-sizing: border-box;
        z-index: 101;
			}

			#settings-button > * {
				flex-shrink: 0;
			}

			:host(.noResources) #settings-button {
				grid-column: 1 / 4;
			}

			#settings-button:hover, #settings-button:hover *::part(base) {
				cursor: pointer;
				color: var(--sl-color-primary-600);
			}

			#settings-button:active, #settings-button:active *::part(base) {
				color: var(--sl-color-primary-800);
			}

			#settings-button .text {
				font-size: 0.8rem;
			}

			#settings-button:not(:hover):not(:active) .text {
				color: var(--sl-color-neutral-600);
			}

			ww-layout::part(drawer-left) {
				--size: clamp(600px, 50vw, 800px);
				--header-spacing: var(--sl-spacing-x-small);
			}

			ww-layout::part(drawer-left-title) {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 1rem;
			}

			ww-layout::part(drawer-left-body) {
				padding: 0;
				height: 100%;
			}

			ww-layout::part(drawer-left-footer) {
				display: none;
			}

			ww-layout::part(drawer-left-header-actions) {
				align-items: center;
				gap: 2ch;
			}

			.title-button::part(base) {
				height: var(--sl-input-height-small);
    		line-height: calc(var(--sl-input-height-small) - var(--sl-input-border-width) * 2);
			}

			@media only screen and (max-width: 1300px) {
				:host(:not(.noResources)) #settings-button .text {
					display: none;
				}
			}
		`
	}

	@property({attribute: false})
	settingsOpen: boolean = false

	@query("ww-explorable-editor[data-active]")
	activeEditor: ExplorableEditor | null

	async notify({message, variant="primary"}: SlAlertAttributes) {
		const duration = 2500
		const icon = {
			"primary": "info-circle",
			"success": "check2-circle",
			"neutral": "gear",
			"warning": "exclamation-triangle",
			"danger": "exclamation-octagon"
		}[variant]
		const alert = Object.assign(document.createElement("sl-alert"), {
			variant,
			closable: true,
			duration,
			innerHTML: `
				<sl-icon name="${icon}" slot="icon"></sl-icon>
				${typeof message  === "string"? escapeHTML(message): JSON.stringify(message)}
			`
		})
		this.appendChild(alert)
		return alert.toast()
	}

	Tabs = () => {
		const {resources, active, previewing, changed, activate, togglePreview, discard, save, set} = this.store.resources
		const {packages, availableWidgetTypes, bundleCode, bundleCSS, bundleID} = this.store.packages
    const {commandMap} = this.commands
		const {locale, showTextPlaceholder, showWidgetPreview} = this.store.ui
		const {open} = this.environment.api.Shell
		this.className = this.store.resources.empty? "noResources": ""
		return repeat(resources, res => res.url, (res, i) => html`
			<ww-tab 
				slot="nav"
				titleAsIconicUrl
				id=${res.url}
				panel=${res.url}
				?active=${res.url === active?.url}
				?closable=${res.url === active?.url}
				?titleDisabled=${res.url !== active?.url}
				titleId=${res.url}
				titleValue=${res.url}
				?hasUrl=${!!res.url}
				confirmDiscardText=${msg("You have unsaved changes. Click again to discard your changes.")}
				?previewing=${previewing[res.url]}
				?pendingChanges=${changed[res.url]}
				@focus=${() => activate(res.url)}
				@ww-toggle-preview=${() => togglePreview(res.url)}
				@ww-close-tab=${() => discard(res.url)}
				@ww-save-tab=${() => save(res.url)}
				@ww-save-as-tab=${() => save(res.url, true)}
				@ww-title-click=${() => activate(res.url)}>
			</ww-tab>
			<ww-explorable-editor
				id=${`panel_${res.url}`}
				slot="main"
				docID=${res.url}
        .commands=${commandMap}
				.bundleCode=${bundleCode}
				.bundleCSS=${bundleCSS}
				bundleID=${bundleID}
				.revisions=${[]}
				.editorState=${res.editorState}
				@update=${(e: any) => set(res.url, e.detail.editorState)}
				@ww-open=${(e: any) => open(e.detail.url)}
				.availableWidgetTypes=${availableWidgetTypes}
				.packages=${packages}
				?loadingPackages=${false}
				?previewing=${previewing[res.url]}
				?showTextPlaceholder=${showTextPlaceholder}
				?showWidgetPreview=${showWidgetPreview}
				?data-active=${res.url === active?.url}
				lang=${locale}>
			</ww-explorable-editor>
		`)
	}

	Placeholder = () => html`<div id="initializingPlaceholder" slot="main">
		<div>
			<sl-spinner></sl-spinner>
			<div>${msg("Loading WebWriter...")}</div>
		</div>
	</div>`

	PackageManager = () => {
		const {packages, adding, removing, upgrading, fetching, resetting, add, remove, upgrade, fetchAll, viewAppDir, resetAppDir, addLocal, watching} = this.store.packages
		const {setAndPersist} = this.settings

		return html`<ww-package-manager
			slot="pre-tab-panel-a"
			.packages=${packages}
			.adding=${adding}
			.removing=${removing}
			.upgrading=${upgrading}
			?loading=${fetching}
			?resetting=${resetting}
			@ww-add-package=${(e: any) => add(e.detail.args)}
			@ww-remove-package=${(e: any) => remove(e.detail.args)}
			@ww-upgrade-package=${(e: any) => upgrade(e.detail.args)}
			@ww-add-local-package=${(e: any) => addLocal()}
			@ww-toggle-watch=${(e: any) => setAndPersist("packages", "watching", {...watching, [e.detail.name]: !watching[e.detail.name]})}
			@ww-refresh=${() => fetchAll(0)}
			@ww-open-app-dir=${() => viewAppDir()}></ww-package-manager>
		</ww-package-manager>`
	}

	KeymapManager = () => {
		const {commandMap, groupLabels, reassignShortcut} = this.commands
		const {setAndPersist} = this.settings
		return html`<ww-keymap-manager
			slot="post-tab-panel-a"
			.keymap=${commandMap}
			.groupLabels=${groupLabels}
			@ww-shortcut-change=${(e: CustomEvent) => {
				const {name, shortcut} = e.detail
				const customKeymap = this.store.get("ui", "keymap")
        const oldShortcut = customKeymap[name]?.shortcut ?? commandMap[name].shortcut
				setAndPersist("ui", "keymap", {...customKeymap, [name]: {shortcut}})
        reassignShortcut(name, oldShortcut)
			}}
			@ww-shortcut-reset=${(e: CustomEvent) => {
				const {name} = e.detail
				const customKeymap = {...this.store.get("ui", "keymap")}
        const oldShortcut = customKeymap[name]?.shortcut ?? commandMap[name].shortcut
        delete customKeymap[name]
				setAndPersist("ui", "keymap", customKeymap)
        reassignShortcut(name, oldShortcut)
			}}
		></ww-keymap-manager>`
	}

	Settings = () => {
		const {specs, values, specLabels, setAndPersist} = this.settings
		const {fetchAll, viewAppDir, resetAppDir} = this.store.packages
		return html`
			<span
				id="settings-button"
				slot="header-left"
				@click=${() => {fetchAll(); this.settingsOpen = !this.settingsOpen}}>
				<sl-icon-button
					id="settings-button"
					name="gear-fill"
					slot="pre-tabs"
				></sl-icon-button>
				<span class="text">${msg("Settings")}</span>
			</span>
			<sl-icon name="gear" slot="drawe-left-label"></sl-icon>
			<label slot="drawer-left-label">${msg("Settings")}</label>
			<ww-button size="small" slot="drawer-left-header-actions" variant="danger" outline class="title-button" @click=${() => resetAppDir()} confirm>
				<span>${msg("Reset")}</span>
				<span slot="confirm">${msg("Are you sure? This action can't be reversed, all your settings will be deleted and reset.")}</span>
			</ww-button>
			<ww-button size="small" slot="drawer-left-header-actions" variant="neutral" outline class="title-button" @click=${() => viewAppDir()}>
				<span>${msg("View On Disk")}</span>
			</ww-button>
			<ww-configurator
				slot="drawer-left-body"
				.specs=${specs}
				.specLabels=${specLabels}
				.values=${values}
				@ww-change=${(e: any) => setAndPersist(e.detail.groupKey, e.detail.key, e.detail.value)}
			>
				<span slot="pre-tab-a">
					<span>${msg("Packages")}</span>
				</span>
				${this.PackageManager()}
				<span slot="post-tab-a">
					<span>${msg("Shortcuts")}</span>
				</span>
				${this.KeymapManager()}
			</ww-configurator>
		`
	}

	Notification() {
		const {dequeueNotification} = this.store.ui
		const nextNotification = dequeueNotification()
		nextNotification && this.notify(nextNotification).then(() => this.requestUpdate())
	}

	render() {
		const initializing = !this.store || this.store.packages.initializing
		if(!initializing) {
			this.Notification()
			this.localization.setLocale(this.store.ui.locale)
		}
		return html`<ww-layout 
			openTab
			activeTabName=${ifDefined(this.store?.resources.active?.url)}
			?drawerLeftOpen=${this.settingsOpen}
			?hideAsides=${this.store?.resources.empty}
			@ww-add-tab=${() => this.store.resources.create()}
      @ww-print-tab=${() => this.commands.dispatch("print")}
			@ww-open-tab=${() => this.store.resources.load()}
			@ww-show-drawer=${() => this.settingsOpen = true}
			@ww-hide-drawer=${() => this.settingsOpen = false}>
			${initializing? this.Placeholder(): [
				this.Tabs(),
				this.Settings()
			]}
		</ww-layout>`
	}
}