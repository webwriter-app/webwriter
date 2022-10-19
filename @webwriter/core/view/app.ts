import {LitElement, html, css} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import Hotkeys from "hotkeys-js"

import {createStoreController, actions, selectors} from "../state"
import "./components"
import { ExplorableEditor } from "./components/editor"
import { SlAlert, registerIconLibrary } from "@shoelace-style/shoelace"
import { Tabs } from "./components"
import { escapeHTML, detectEnvironment } from "../utility"

const {set, create, discard, select, selectNext, togglePreview} = actions.resources
const {install_REQUESTED, uninstall_REQUESTED, update_REQUESTED, fetchAllPackages_REQUESTED} = actions.bundle
const {saveResource_REQUESTED, loadResource_REQUESTED} = actions.persist
const {getActiveResource} = selectors.resources

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

@customElement("ww-app")
export class App extends LitElement
{
	private error = null
	store = createStoreController(this)

	keymap: Record<string, (e: KeyboardEvent, handler) => any> = {
		"ctrl+s": (e, combo) => {
			(document.activeElement as HTMLElement).blur()
			this.store.dispatch(saveResource_REQUESTED({
				resource: getActiveResource(this.store.getState().resources)
			}))
		},
		"ctrl+o": (e, combo) => this.store.dispatch(loadResource_REQUESTED({
			schema: this.store.getState().resources.schema
		})),
		"ctrl+n": (e, combo) => this.store.dispatch(create()),
		"ctrl+w": (e, combo) => this.store.dispatch(discard()),
		"alt+p": (e, combo) => this.managingPackages = !this.managingPackages,
		"ctrl+tab": (e, combo) => this.store.dispatch(selectNext()),
		"ctrl+b": (e, combo) => this.store.dispatch(togglePreview())
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
		"Uncaught TypeError: Cannot set properties of null (setting 'tabIndex')",
		"ResizeObserver loop limit exceeded",
		"UserCancelled",
		"Uncaught TypeError: Failed to execute 'unobserve' on 'ResizeObserver': parameter 1 is not of type 'Element'."
	]

	async connectedCallback() {
		super.connectedCallback()

		globalThis.WEBWRITER_ENVIRONMENT = detectEnvironment()

		this.addEventListener("ww-select-tab-title", (e: any) => this.focusTabTitle(e.detail.id))

		Object.entries(this.keymap).forEach(([shortcut, callback]) => Hotkeys(shortcut, callback))

		Object.entries(this.notifications).forEach(([type, alertAttributes]) => {
			this.store.listenerMiddleware.startListening({
				type,
				effect: () => this.notify(alertAttributes)
			})
		})
		window.addEventListener("error", ({message}) => {
			if(this.errorsToIgnore.includes(message)) {
				console.warn(message)
			}
			else {
				this.notify({message, variant: "danger", duration: 2000})
			}
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
		const {resourcesOrder} = this.store.getState().resources
		const i = resourcesOrder.indexOf(url)
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

	tabsTemplate = (send: typeof this.store.dispatch, resources: ReturnType<typeof this.store.getState>["resources"], packages: ReturnType<typeof this.store.getState>["packages"]) => {
		const {activeResource, resourcesPendingChanges, resourcesOrder, resourcesPreviewing} = resources
		const allResources = resourcesOrder.map(url => resources.resources[url])
		const availableWidgetTypes = selectors.packages.selectAvailableWidgetTypes(packages)
		const allPackages = selectors.packages.selectInstalledPackages(packages)
		this.className = allResources.length === 0? "noResources": ""
		const tabs = repeat(allResources, res => res.url, ({url, editorState}, i) => html`
			<ww-tab 
				slot="tabs"
				titleAsIconicUrl
				id=${url}
				panel=${url}
				?active=${url === activeResource}
				?closable=${url === activeResource}
				?titleDisabled=${url !== activeResource}
				titleId=${url}
				titleValue=${url}
				?hasUrl=${!!url}
				confirmDiscardText="You have unsaved changes. Click again to discard your changes."
				?previewing=${resourcesPreviewing[url]}
				?confirmingDiscard=${this.discarding}
				?pendingChanges=${!!resourcesPendingChanges[url]}
				@focus=${() => send(select({url}))}
				@ww-toggle-preview=${() => send(togglePreview({url}))}
				@ww-close-tab=${() => !this.discarding && resourcesPendingChanges[url]? this.discarding = true: send(discard({url}))}
				@ww-save-tab=${() => send(saveResource_REQUESTED({resource: {url, editorState}}))}
				@ww-save-as-tab=${() => send(saveResource_REQUESTED({resource: {url: null, editorState}}))}
				@ww-title-click=${() => send(select({url}))}
				@ww-cancel-discard=${() => this.discarding = false}>
			</ww-tab>
			<ww-tab-panel name=${url} ?active=${url === activeResource}>
				<ww-explorable-editor
					.revisions=${[]}
					docID=${url}
					.editorState=${editorState}
					@update=${e => send(set({url, editorState: e.detail.editorState}))}
					.availableWidgetTypes=${availableWidgetTypes}
					.packages=${allPackages}
					?loadingPackages=${false}
					?previewing=${resourcesPreviewing[url]}>
				</ww-explorable-editor>
			</ww-tab-panel>
		`)

		return html`<ww-tabs 
			openTab 
			@ww-add-tab=${() => send(create())}
			@ww-open-tab=${() => send(loadResource_REQUESTED({
				schema: this.store.getState().resources.schema
			}))}>
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

	packageManagerTemplate = (send: typeof this.store.dispatch, packages: ReturnType<typeof this.store.getState>["packages"]) => {
		const allPackages = selectors.packages.selectAll(packages)
		return html`<ww-package-manager-drawer
			.packages=${allPackages}
			.installPackages=${packages.installPackages}
			.uninstallPackages=${packages.uninstallPackages}
			.updatePackages=${packages.updatePackages}
			?loading=${packages.isFetching}
			?open=${this.managingPackages}
			@sl-hide=${this.handleManagePackagesClose}
			@ww-install-package=${e => send(install_REQUESTED({args: e.detail.args}))}
			@ww-uninstall-package=${e => send(uninstall_REQUESTED({args: e.detail.args}))}
			@ww-update-package=${e => send(update_REQUESTED({args: e.detail.args}))}
			@ww-refresh=${() => send(fetchAllPackages_REQUESTED({from: 0}))}>
		</ww-package-manager-drawer>`
	}

	render() {
		const state = this.store.getState()
		const send = this.store.dispatch

		const initializingPlaceholder = this.initializingPlaceholderTemplate()
		const tabs = this.tabsTemplate(send, state.resources, state.packages)
		const packageManager = this.packageManagerTemplate(send, state.packages)

		return state.packages.isInitializing
			? initializingPlaceholder
			: [tabs, packageManager]
	}
}

/*
			${false? html`
				<ww-io-dialog 
					open
					protocol=${"file"} 
					wwformat=${"html"}
					filename=${documents[activeResource].attributes.label}
					type=${"saving"}
					?loading=${false}
					@ww-submit=${e => true 
						? send(saveResource_REQUESTED({url: e.target.url, documentEditor: this.activeResourceEditor}))
						: send(loadResource_REQUESTED({url: e.target.url}))
					}
				></ww-io-dialog>
			`: null}
*/