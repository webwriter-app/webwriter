import {LitElement, html, css} from "lit"
import {customElement, property, query} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import Hotkeys from "hotkeys-js"

import {createManagerController, PackagerController, documentsMachine} from "../state"
import "./components"
import { DocumentEditor } from "./components/editor"
import { SlAlert, registerIconLibrary } from "@shoelace-style/shoelace"
import { Tabs } from "./components"
import { escapeHTML, mousetrapBindGlobalMixin } from "../utility"
import { StateFrom } from "xstate"

interface SlAlertAttributes {
	message: string
	variant?: SlAlert["variant"]
	icon?: string
	duration?: number
}

@customElement("ww-app")
export class App extends LitElement
{

	manager = createManagerController(this)
	packager = new PackagerController(this)

	keymap: Record<string, (e: KeyboardEvent, handler) => any> = {
		"ctrl+s": (e, combo) => this.manager.send("SAVE", {url: this.activeDocumentEditor.docAttributes.url, documentEditor: this.activeDocumentEditor}),
		"ctrl+o": (e, combo) => this.manager.send("LOAD"),
		"ctrl+n": (e, combo) => this.manager.send("CREATE"),
		"ctrl+w": (e, combo) => this.manager.send("DISCARD"),
		"ctrl+alt+p": (e, combo) => this.managingPackages = !this.managingPackages,
		"ctrl+tab": (e, combo) => this.manager.send("SELECT_NEXT"),
		"escape": (e, combo) => this.manager.send("CANCEL")
	}

	notifications: Record<string, SlAlertAttributes> = {
		"saving.success": {
			message: "Your changes have been saved",
			variant: "success",
			icon: "check2-circle",
			duration: 2000
		},
		"saving.failure": {
			message: "An error occured while saving your changes",
			variant: "danger",
			icon: "exclamation-octagon",
			duration: 2000
		},
		"loading.failure": {
			message: "An error occured while loading your file",
			variant: "danger",
			icon: "exclamation-octagon",
			duration: 2000
		}
	}

	errorsToIgnore = [
		"Uncaught TypeError: Cannot set properties of null (setting 'tabIndex')",
		"ResizeObserver loop limit exceeded",
		"UserCancelled"
	]

	async connectedCallback() {
		super.connectedCallback()

		this.addEventListener("ww-select-tab-title", (e: any) => this.focusTabTitle(e.detail.id))
		registerIconLibrary("cc", {resolver: name => `/assets/icons/cc/${name}.svg`})
		
		Object.entries(this.keymap).forEach(([shortcut, callback]) => Hotkeys(shortcut, callback))
		Object.entries(this.notifications).forEach(([stateKey, alertAttributes]) => {
			this.manager.onTransition((state, ev) => state.matches(stateKey) && this.notify(alertAttributes))
		})
		window.addEventListener("error", ({message}) => {
			if(this.errorsToIgnore.includes(message)) {
				console.warn(message)
			}
			else {
				this.notify({message, variant: "danger"})
			}
		})

		await this.packager.fetchInstalledPackages(true, true)
		this.packager.markOutdatedPackages()
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
				min-height: 100vh;
				transition: background-color 0.1s ease-in;
			}

			.save-button::part(base) {
				padding: 0;
				margin-right: 20px;
			}

			:host(.noDocuments) {
				background-color: #f1f1f1;
				transition: none;
			}


		`
	}

	@query("ww-tabs")
	tabs: Tabs

	@query("ww-tab-panel[active] ww-document-editor")
	activeDocumentEditor: DocumentEditor

	@property({attribute: false})
	managingPackages: boolean = false

	focusTabTitle(id: number) {
		const {documentsOrder} = this.manager.state.context
		const i = documentsOrder.indexOf(id)
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

	render() {
		const ctx = this.manager.state.context
		const state = this.manager.state
		const documents = ctx.documentsOrder.map(id => ctx.documents[id])
		const send = this.manager.send

		this.className = documents.length === 0? "noDocuments": ""

		const tabs = repeat(documents, doc => doc.id, ({id, attributes, content, url, revisions}, i) => html`
			<ww-tab 
				slot="tabs"
				titleAsIconicUrl
				id=${id}
				panel=${id}
				?active=${id === ctx.activeDocument}
				?closable=${id === ctx.activeDocument}
				?titleDisabled=${id !== ctx.activeDocument}
				titleId=${id}
				titleValue=${url}
				?hasUrl=${!!url}
				confirmDiscardText="You have unsaved changes. Click again to discard your changes."
				?confirmingDiscard=${state.matches("discarding.confirming")}
				?lastLoaded=${id === ctx.lastLoadedDocument}
				?pendingChanges=${!!ctx.documentsPendingChanges[id]}
				@focus=${() => send("SELECT", {id})}
				@keydown=${e => e.key === "Enter" || e.key === "ArrowDown"? this.activeDocumentEditor.focusFirstBlock(): null}
				@ww-close-tab=${() => send("DISCARD", {id})}
				@ww-save-tab=${() => send("SAVE", {url, documentEditor: this.activeDocumentEditor})}
				@ww-save-as-tab=${() => send("SAVE", {documentEditor: this.activeDocumentEditor})}
				@ww-title-click=${() => send("SELECT", {id})}
				@ww-title-change=${e => send("SET_ATTRIBUTE", {key: "name", value: e.detail.title})}
				@ww-cancel-discard=${e => send("CANCEL")}>
			</ww-tab>
			<ww-tab-panel name=${id} ?active=${id == ctx.activeDocument}>
				<ww-document-editor
					.revisions=${revisions}
					docID=${id}
					.docAttributes=${attributes}
					.content=${content}
					.packageModules=${this.packager.packageModules}
					appendBlockType=${ctx.defaultBlockType}
					?loadingPackages=${this.packager.loading}
					@ww-block-change=${e => send("UPDATE_BLOCK", e.detail)}
					@ww-append-block=${e => send("APPEND_BLOCK", {block: e.detail.type})}
					@ww-delete-block=${e => send("DELETE_BLOCK", {i: e.detail.i})}
					@ww-attribute-change=${e => send("SET_ATTRIBUTE", {key: e.detail.key, value: e.detail.value})}>
				</ww-document-editor>
			</ww-tab-panel>
		`)

		return html`
			<ww-tabs openTab @ww-add-tab=${() => send("CREATE")} @ww-open-tab=${() => send("LOAD")}>
				${tabs}
				<sl-icon-button slot="pre-tabs" name="boxes" @click=${this.handleManagePackagesClick}></sl-icon-button>
				<div slot="placeholder-tab">Get started</div>
			</ww-tabs>
			<ww-package-manager-drawer
				.packager=${this.packager}
				.installedPackages=${this.packager.installedPackages}
				.availablePackages=${this.packager.availablePackages}
				?loading=${this.packager.loading}
				totalPackagesAvailable=${this.packager.totalPackagesAvailable}
				?open=${this.managingPackages}
				@sl-hide=${this.handleManagePackagesClose}>
			</ww-package-manager-drawer>
			${["saving.configuring", "saving.active"].some(state.matches) /*|| state.matches("loading")*/? html`
				<ww-io-dialog 
					open
					protocol=${ctx.defaultProtocol} 
					wwformat=${ctx.defaultFormat}
					filename=${ctx.documents[ctx.activeDocument].attributes.label}
					type=${state.matches("saving")? "saving": "loading"}
					?loading=${["saving.active", "loading.active"].some(state.matches)}
					@ww-submit=${e => state.matches("saving") 
						? send("SAVE", {url: e.target.url, documentEditor: this.activeDocumentEditor})
						: send("LOAD", {url: e.target.url})
					}
					@ww-cancel=${() => send("CANCEL")}
				></ww-io-dialog>
			`: null}
		`
	}
}