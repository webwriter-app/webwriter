import "redefine-custom-elements" // Must be first import
import "@shoelace-style/shoelace/dist/themes/light.css"
import "@shoelace-style/shoelace"
import {LitElement, html, css, ReactiveController} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import Hotkeys from "hotkeys-js"

import {RootStore} from "../state"
import "./components"
import { ExplorableEditor } from "./components/editor"
import { SlAlert } from "@shoelace-style/shoelace"
import { Tabs } from "./components"
import { escapeHTML, detectEnvironment } from "../utility"
import { makeAutoObservable, observe } from "mobx"
import { Environment } from "../environment"

interface SlAlertAttributes {
	message: string
	variant?: SlAlert["variant"]
	icon?: string
	duration?: number
}

/* TODO
- LEARNERS & AUTHORS: Explorable-wide features API (fullscreen/fullwindow widgets, sharing/saving, visible metadata)
- LEARNERS & AUTHORS: Themes (Explorable-wide CSS)
- AUTHORS: Drag n' Drop widget interface 
- LEARNERS & AUTHORS: Rewrite "Document" as container widget
*/

const CORE_PACKAGES = ["@webwriter/ww-textarea", "@webwriter/ww-figure", "@open-wc/scoped-elements"]


type StoreController = RootStore & ReactiveController
function StoreController(store: RootStore, host: App) {
	const subStores = RootStore.storeKeys.map(key => store[key])
	subStores.forEach(x => makeAutoObservable(x, {}, {autoBind: true, deep: true}))
	store["host"] = host
	store["hostConnected"] = () => {
		subStores.forEach(x => observe(x, () => host.requestUpdate()))
	}
	store["hostDisconnected"] = () => store["disposer"]()
	host.addController(store as StoreController)
	return store as StoreController
}

@customElement("ww-app")
export class App extends LitElement
{
	store: StoreController
	environment: Environment 

	keymap: Record<string, (e: KeyboardEvent, handler) => any> = {
		"ctrl+s": (e, combo) => {
			(document.activeElement as HTMLElement).blur()
			this.store.resources.save()
		},
		"ctrl+o": (e, combo) => this.store.resources.load(),
		"ctrl+n": (e, combo) => this.store.resources.create(),
		"ctrl+w": (e, combo) => this.store.resources.discard(),
		"alt+p": (e, combo) => this.managingPackages = !this.managingPackages,
		"ctrl+tab": (e, combo) => this.store.resources.activateNext(),
		"ctrl+b": (e, combo) => this.store.resources.togglePreview()
	}

	notifications: Record<string, SlAlertAttributes> = {
		"saveResource_SUCCEEDED": {
			message: "Your changes have been saved",
			variant: "success",
			icon: "check2-circle",
			duration: 2000
		},
		"saveResource_FAILED": {
			message: "An error occured while saving your changes",
			variant: "danger",
			icon: "exclamation-octagon",
			duration: 2000
		},
		"loadResource_FAILED": {
			message: "An error occured while loading your file",
			variant: "danger",
			icon: "exclamation-octagon",
			duration: 2000
		}
	}

	errorsToIgnore = [
		"TypeError: Cannot set properties of null (setting 'tabIndex')",
		"ResizeObserver loop limit exceeded",
		"UserCancelled",
		"TypeError: Failed to execute 'unobserve' on 'ResizeObserver': parameter 1 is not of type 'Element'."
	]

	async connectedCallback() {
		super.connectedCallback()
		globalThis.WEBWRITER_ENVIRONMENT = detectEnvironment()
		this.environment = await import(`../environment/${globalThis.WEBWRITER_ENVIRONMENT}.ts`)
		this.store = StoreController(new RootStore({corePackages: CORE_PACKAGES, ...this.environment}), this)
		this.addEventListener("ww-select-tab-title", (e: any) => this.focusTabTitle(e.detail.id))
		Object.entries(this.keymap).forEach(([shortcut, callback]) => Hotkeys(shortcut, callback))
		window.addEventListener("error", this.handleError)
		window.addEventListener("unhandledrejection", this.handleError)
	}

	handleError = (e: ErrorEvent | PromiseRejectionEvent) => {
		const error = e instanceof ErrorEvent? e.error: new Error(e.reason)
		if(this.errorsToIgnore.includes(String(error))) {
			e.preventDefault()
			return false
		}
		this.notify({
			message: error.message,
			variant: "danger",
			icon: "exclamation-circle-fill",
			duration: 5000
		})
	}

	notify({message, variant="primary", icon="info-circle", duration=Infinity}: SlAlertAttributes) {
		const alert = Object.assign(document.createElement("sl-alert"), {
			variant,
			closable: true,
			duration,
			innerHTML: `
				<sl-icon name="${icon}" slot="icon"></sl-icon>
				${escapeHTML(message)}
			`
		})
		this.appendChild(alert)
		return alert.toast()
	}
	
	static get styles() {
		return css`
			:host {
				display: block;
				height: 100vh;
				min-height: 100vh;
				transition: background-color 0.1s ease-in;
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

			.packages-button {
				user-select: none;
				display: flex;
				flex-direction: row;
				align-items: center;
				text-overflow: ellipsis;
				overflow: hidden;
			}

			.packages-button:hover, .packages-button:hover *::part(base) {
				cursor: pointer;
				color: var(--sl-color-primary-600);
			}

			.packages-button:active, .packages-button:active *::part(base) {
				color: var(--sl-color-primary-800);
			}

			.packages-button .text {
				font-size: 0.8rem;
			}

			.packages-button:not(:hover):not(:active) .text {
				color: var(--sl-color-neutral-600);
			}

			@media only screen and (max-width: 1300px) {
				.packages-button .text {
					display: none;
				}
			}

			@media only print {

				:host() {
					overflow: visible;
					height: min-content;
				}

				ww-tabs {
					height: min-content;
					overflow: visible;
				}

				ww-tabs::part(nav) {
					display: none;
				} 

				ww-tabs::part(content) {
					overflow: visible;
					height: min-content;
				}

				ww-explorable-editor {
					border: none;
					padding: 0;
					overflow: visible;
					height: min-content;
				}

				ww-explorable-editor::part(editor-toolbox) {
					display: none;
				}

				ww-explorable-editor::part(footer) {
					position: fixed;
					bottom: 0;
					width: 100%;
				}

			}
		`
	}

	@query("ww-tabs")
	tabs: Tabs

	@query("ww-tab-panel[active] ww-explorable-editor")
	activeExplorableEditor: ExplorableEditor

	@property({attribute: false})
	managingPackages: boolean = false

	@property({attribute: false})
	discarding: boolean = false

	focusTabTitle(url: string) {
		const {order} = this.store.resources
		const i = order.indexOf(url)
		const tabElement = this.tabs.tabs[i]
		const titleElement = tabElement?.querySelector(":last-child") as HTMLElement
		titleElement?.focus()
	}

	handleManagePackagesClick() {
		this.managingPackages = true
	}

	handleManagePackagesClose() {
		this.managingPackages = false
	}

	tabsTemplate = () => {
		const {resources, active, previewing, changed, activate, togglePreview, discard, save, set} = this.store.resources
		const {packages, imported, availableWidgetTypes} = this.store.packages
		this.className = this.store.resources.empty? "noResources": ""
		const tabs = repeat(resources, res => res.url, (res, i) => html`
			<ww-tab 
				slot="tabs"
				titleAsIconicUrl
				id=${res.url}
				panel=${res.url}
				?active=${res.url === active.url}
				?closable=${res.url === active.url}
				?titleDisabled=${res.url !== active.url}
				titleId=${res.url}
				titleValue=${res.url}
				?hasUrl=${!!res.url}
				confirmDiscardText="You have unsaved changes. Click again to discard your changes."
				?previewing=${previewing[res.url]}
				?pendingChanges=${changed[res.url]}
				?confirmingDiscard=${this.discarding}
				@focus=${() => activate(res.url)}
				@ww-toggle-preview=${() => togglePreview(res.url)}
				@ww-close-tab=${() => {
					if(this.discarding && changed[res.url] || !changed[res.url]) {
						discard(res.url)
						this.discarding = false
					}
					else {
						this.discarding = true
					}
				}}
				@ww-save-tab=${() => save(res.url)}
				@ww-save-as-tab=${() => save(res.url, true)}
				@ww-title-click=${() => activate(res.url)}
				@ww-cancel-discard=${() => this.discarding = false}>
			</ww-tab>
			<ww-tab-panel name=${res.url} ?active=${res.url === active.url}>
				<ww-explorable-editor
					.revisions=${[]}
					docID=${res.url}
					.editorState=${res.editorState}
					@update=${e => set(res.url, e.detail.editorState)}
					.availableWidgetTypes=${availableWidgetTypes}
					.packages=${packages}
					?loadingPackages=${false}
					?previewing=${previewing[res.url]}>
				</ww-explorable-editor>
				<ww-h5p-editor></ww-h5p-editor>
			</ww-tab-panel>
		`)

		return html`<ww-tabs 
			openTab 
			@ww-add-tab=${() => this.store.resources.create()}
			@ww-open-tab=${() => this.store.resources.load()}>
			${tabs}
			<span class="packages-button" slot="pre-tabs" @click=${this.handleManagePackagesClick}>
				<sl-icon-button 
					slot="pre-tabs"
					name="boxes"
				></sl-icon-button>
				<span class="text">Packages</span>
			</span>
		</ww-tabs>`
	}

	initializingPlaceholderTemplate = () => html`<div id="initializingPlaceholder">
		<div>
			<sl-spinner></sl-spinner>
			<div>Loading WebWriter...</div>
		</div>
	</div>`

	packageManagerTemplate = () => {
		const {packages, installing, uninstalling, updating, fetching, resetting, install, uninstall, update, fetchAll, viewAppDir, resetAppDir} = this.store.packages
		return html`<ww-package-manager-drawer
			.packages=${packages}
			.installing=${installing}
			.uninstalling=${uninstalling}
			.updating=${updating}
			?loading=${fetching}
			?resetting=${resetting}
			?open=${this.managingPackages}
			@sl-hide=${this.handleManagePackagesClose}
			@ww-install-package=${e => install(e.detail.args)}
			@ww-uninstall-package=${e => uninstall(e.detail.args)}
			@ww-update-package=${e => update(e.detail.args)}
			@ww-refresh=${() => fetchAll(0)}
			@ww-open-app-dir=${() => viewAppDir()}
			@ww-reset-app-dir=${() => resetAppDir()}>
		</ww-package-manager-drawer>`
	}

	render() {
		return !this.store || this.store.packages.initializing
			? this.initializingPlaceholderTemplate()
			: [this.tabsTemplate(), this.packageManagerTemplate()]
	}
}