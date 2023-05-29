import { localized, msg } from "@lit/localize"
import { SlAnimation, SlTab } from "@shoelace-style/shoelace"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"

const PROTOCOL_ICONS = {
	"file": "hdd",
	"http": "cloud",
	"https": "cloud"
}

@localized()
@customElement("ww-tab")
export class Tab extends LitElement {

	@property({type: String, reflect: true})
	panel: string

	@property({type: Boolean, reflect: true})
	active: boolean

	@property({type: Boolean, reflect: true})
	closable: boolean

	@property({type: Boolean, reflect: true})
	disabled: boolean

	@property({type: String, reflect: true})
	lang: string

	@property({type: String})
	titleId: string

	@property({type: String})
	confirmDiscardText: string

	@property({type: Boolean, attribute: true, reflect: true})
	confirmingDiscard: boolean
	
	@property({type: String, attribute: true, reflect: true})
	titleValue: string
	
	@property({type: Boolean})
	titleDisabled: boolean

	@property({type: Boolean})
	titleAsIconicUrl: boolean = false

	@property({type: String})
	placeholder: string = msg("Unsaved File")

	@property({type: Boolean})
	pendingChanges: boolean

	@property({type: Boolean})
	lastLoaded: boolean = false

	@query("sl-animation")
	animation: SlAnimation

	connectedCallback() {
		super.connectedCallback()
		this.addEventListener("dragstart", e => {
			this.titleAsIconicUrl && e.dataTransfer?.setData("text/uri-list", this.titleValue)
			e.dataTransfer?.setData("text/plain", this.titleValue)
			e.dataTransfer?.setData("text", this.titleValue)
		})
		this.addEventListener("focusout", e => {
			this.emitCancelDiscard()
		})
	}

	protected firstUpdated() {
		this.animation.play = true
	}
	static get styles() {
		return [SlTab.styles, css`



			:host(:hover) [part=base] {
				background: #F9F9F9;
			}

			:host([active]) [part=base] {
				background: white;
				border: 3px solid rgba(0, 0, 0, 0.1);
				border-left: 1px solid rgba(0, 0, 0, 0.1);
				border-bottom: 3px solid white;
				border-bottom-left-radius: 0;
				border-bottom-right-radius: 0;
				cursor: grab;
			}

			[part=base] {
				left: 0;
				--focus-ring: none;
				margin-right: 0.5em;
				border-radius: 6px;
				flex-shrink: 1;
				overflow: hidden;
				width: 300px;
				min-width: min-content;
				position: relative;
				background: transparent;
        transition: background-color 0.25s;
				border: 3px solid transparent;
				border-left: 1px solid transparent;
				padding: 0.7rem;
				display: flex;
				justify-content: space-between;
				height: 100%;
			}

			:host(:not([active])) .buttons {
				visibility: hidden;
			}

			.title {
				display: flex;
				flex-direction: row;
				align-items: center;
			}

			.title *:first-child {
				margin-right: 1ch;
			}

			.title.empty {
				color: darkgray;
			}

			.buttons {
				position: absolute;
				top: 0;
				right: 0;
				background: rgba(255, 255, 255, 0.9);
				box-shadow: 0 0 5px 10px rgba(255, 255, 255, 0.9);
				display: flex;
				flex-direction: row;
				align-items: center;
				height: 100%;
				padding-right: 0.25rem;
			}

			sl-icon-button {
				height: 100%;
			}

			sl-icon-button::part(base) {
				padding: 0;
				height: 100%;
				padding-left: 0.25rem;
				padding-right: 0.25rem;
			}

			.close-button::part(base) {
				margin-left: 0.25rem;
			}

			.close-button::part(base):hover {
				color: red;
			}

			.close-button::part(base):focus {
				color: red;
			}

			.close-button::part(base):active {
				color: darkred;
			}

			.preview-button:hover::part(base) {
				color: var(--sl-color-warning-600);
			}

			sl-tooltip {
				--max-width: 100%;
			}

			:host([confirmingDiscard]) .title {
				text-decoration: underline 2px;
			}
		`] as any
	}

	handleCloseTab = () => {
		if(this.confirmingDiscard || !this.pendingChanges) {
			this.emitCloseTab()
		}
		else if(this.pendingChanges) {
			this.confirmingDiscard = true
		}
	}

	handleFocusoutTab = () => {
		this.confirmingDiscard? this.emitCancelDiscard(): null
		this.confirmingDiscard = false
	}

	emitCloseTab = () => this.dispatchEvent(
		new CustomEvent("ww-close-tab", {composed: true, bubbles: true})
	)

	emitSaveTab = () => this.dispatchEvent(
		new CustomEvent("ww-save-tab", {composed: true, bubbles: true})
	)

	emitSaveAsTab = () => this.dispatchEvent(
		new CustomEvent("ww-save-as-tab", {composed: true, bubbles: true})
	)

	emitPrintTab = () => this.dispatchEvent(
		new CustomEvent("ww-print-tab", {composed: true, bubbles: true})
	)

	emitTitleClick = () => this.dispatchEvent(
		new CustomEvent("ww-title-click", {composed: true, bubbles: true})
	)

	emitTitleChange = (title: string) => this.dispatchEvent(
		new CustomEvent("ww-title-change", {composed: true, bubbles: true, detail: {title}})
	)

	emitCancelDiscard = () => this.dispatchEvent(
		new CustomEvent("ww-cancel-discard", {composed: true, bubbles: true})
	)

	iconicUrlTemplate = () => {
		const url = new URL(this.titleValue)
		const iconName = (PROTOCOL_ICONS as any)[url.protocol.slice(0, -1)]
		const filename = url.pathname.slice(url.pathname.lastIndexOf("/") + 1).split("#")[0]
		return html`
			<sl-icon name=${iconName}></sl-icon>
			<span>${filename}</span>
		`
	}

	render() {
		const title = this.titleValue.startsWith("memory:")
			? this.placeholder
			: this.titleAsIconicUrl? this.iconicUrlTemplate(): this.titleValue
		return html`<sl-animation name="fadeIn" easing="easeIn" iterations=${1} duration=${100}>
			<div class="tab" part="base" role="tab" aria-disabled=${this.disabled} aria-selected=${this.active} tabindex="-1">
			<span 
				title=${(this.titleAsIconicUrl? decodeURI(this.titleValue): this.titleValue) || this.placeholder}
				class=${classMap({title: true, empty: title === this.placeholder})}
				id=${this.titleId}>
				${title}
				${this.pendingChanges? html`<span name="title-suffix">*</span>`: null}
			</span>
			<div class="buttons">
				<sl-icon-button title=${msg("Save document as... [CTRL+S]")} class="save-button" @click=${() => this.emitSaveAsTab()} name="file-earmark-arrow-down"></sl-icon-button>
				${!this.titleValue.startsWith("memory:")? html`<sl-icon-button title=${msg("Save document [CTRL+S]")} class="save-button" @click=${() => this.emitSaveTab()} name="file-earmark-check"></sl-icon-button>`: null}
        <sl-icon-button title=${msg("Print document... [CTRL+P]")} class="print-button" @click=${() => this.emitPrintTab()} name="printer"></sl-icon-button>
				<sl-tooltip ?open=${this.confirmingDiscard} trigger="manual" placement="right" hoist>
					<sl-icon-button title=${msg("Close document [CTRL+W]")} class="close-button" @click=${this.handleCloseTab} @focusout=${this.handleFocusoutTab} name="x-lg"></sl-icon-button>
					<span slot="content" class="confirm-discard-text">${this.confirmDiscardText}</span>
				</sl-tooltip>
			</div>
		</div>
		</sl-animation>`
	}
}