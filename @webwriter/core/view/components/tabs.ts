import { SlAnimation, SlInput, SlTab, SlTabPanel } from "@shoelace-style/shoelace"
import {LitElement, html, css} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"
import { classMap } from "lit/directives/class-map.js"

import {isOverflownX, isOverflownY, WWURL} from "../../utility"

const PROTOCOL_ICONS = {
	"file": "hdd",
	"http": "cloud",
	"https": "cloud"
}


@customElement("ww-tabs")
export class Tabs extends LitElement {

	@queryAssignedElements({slot: "tabs"})
	tabs: HTMLElement[]

	@queryAssignedElements({slot: "tabs", selector: "[active]"})
	activeTab: HTMLElement

	@query("[part=tabs-wrapper]")
	tabsWrapper: HTMLElement

	@property({type: Boolean})
	openTab: boolean

	static get styles() {
		return css`
			:host {
				display: flex;
				flex-direction: column;
				width: 100%;
				height: 100%;
				overflow-y: visible;
			}

			[part=nav] {
				display: flex;
				flex-direction: row;
				justify-content: space-between;
				background: #f1f1f1;
				position: sticky;
				top: 0;
				left: 0;
				z-index: 10;
			}

			[part=content] {
				overflow-y: scroll;
				height: 100%;
			}

			[part=pre-tabs] {
				display: flex;
				align-items: center;
				justify-content: flex-end;
			}

			[part=tabs] {
				flex-grow: 1;
				min-height: 2.75rem;
				display: flex;
				flex-direction: row;
				align-items: center;
			}

			[part=tabs-wrapper] {
				position: relative;
				display: flex;
				align-items: center;
				flex-direction: row;
				flex-wrap: nowrap;
				scrollbar-width: none;
				margin-left: auto;
				margin-right: auto;
				margin-bottom: -1px;
				width: 800px;
				overflow-x: scroll;
				overflow-y: visible;
			}

			[part=tabs-wrapper]::-webkit-scrollbar {
				display: none;
			}

			[part=post-tabs] {
				display: flex;
				align-items: center;
				justify-content: flex-start;
			}

			[part=tab-panel]

			sl-icon-button {
				background: transparent;
			}

			.placeholder-tab {
				width: 100%;
				height: 100%;
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				gap: 1rem;
				max-width: 800px;
				margin: 0 auto;
			}

			.placeholder-tab > * {
				width: 50%;
			}

			.placeholder-tab sl-button::part(base) {
				background: white;
			}

			.placeholder-tab sl-button::part(base):hover {
				color: black;
			}

			.placeholder-tab sl-button::part(base):active {
				color: black;
			}

			.placeholder-tab sl-icon {
				font-size: 1.25rem;
			}

			.add-buttons {
				display: flex;
				flex-direction: row;
				flex-shrink: 0;
				position: sticky;
				top: 0;
				right: 0;
				background: rgba(241, 241, 241, 0.9);
				box-shadow: 0 0 4px 8px rgba(241, 241, 241, 0.9);
			}
		`
	}

	emitNewTab = () => {
		this.dispatchEvent(
			new CustomEvent("ww-add-tab", {composed: true, bubbles: true})
		)
		setTimeout(() => this.tabs[this.tabs.length - 1]?.scrollIntoView({behavior: "smooth", block: "center", inline: "center"}), 100)
}

	emitOpenTab = () => this.dispatchEvent(
		new CustomEvent("ww-open-tab", {composed: true, bubbles: true})
	)


	async handleFocusIn(e: FocusEvent) {
		(e.composedPath()[0] as HTMLElement).scrollIntoView({behavior: "smooth", block: "center", inline: "center"})
	}

	handleKeyDown(e: KeyboardEvent) {
		if(e.key === "ArrowLeft") {
			this.selectPreviousTab()
		}
		else if (e.key === "ArrowRight") {
			this.selectNextTab()
		}
	}

	handleTabSlotChange = (e: Event) => {

	}

	selectPreviousTab() {
		const previousTab = this.tabs[this.tabs.indexOf(this.activeTab[0]) - 1]
		previousTab?.focus()		
	}

	selectNextTab() {
		const nextTab = this.tabs[this.tabs.indexOf(this.activeTab[0]) + 1]
		nextTab?.focus()
	}

	firstUpdated() {
		this.tabsWrapper.addEventListener("wheel", e => {
			e.preventDefault()
			this.tabsWrapper.scrollLeft += e.deltaY
		})
		this.shadowRoot.querySelector("slot[name=tabs]").addEventListener("slotchange", () => this.requestUpdate())
	}

	render() {

		return html`
			<nav part="nav">
				<div part="pre-tabs">
					<slot name="pre-tabs">
						
					</slot>
				</div>
				<div part="tabs" @focusin=${this.handleFocusIn} @keydown=${this.handleKeyDown}>
					<div part="tabs-wrapper">
						<slot name="tabs" @slotchange=${this.handleTabSlotChange}></slot>
						<div class="add-buttons">
							${this.tabs.length !== 0? html`
								<sl-icon-button title="New document [CTRL+N]" name="file-earmark-plus-fill" @click=${this.emitNewTab}></sl-icon-button>
							`: null}
							${this.tabs.length !== 0 && this.openTab? html`
								<sl-icon-button title="Open document [CTRL+O]" name="file-earmark-arrow-up-fill" @click=${this.emitOpenTab}></sl-icon-button>
							`: null}
						</div>
					</div>
				</div>
				<div part="post-tabs">
					<slot name="post-tabs">
					</slot>
				</div>
			</nav>
			<div part="content">
				<slot part="tab-panel-slot"></slot>
				${this.tabs.length === 0? html`
					<slot name="placeholder-tab">
						<div class="placeholder-tab">
							<sl-button outline variant="neutral" @click=${this.emitNewTab}>
								<sl-icon slot="prefix" name="file-earmark-plus-fill"></sl-icon>
								<span>New document</span>
							</sl-button>
							<sl-button outline variant="neutral" @click=${this.emitOpenTab}>
								<sl-icon slot="prefix" name="file-earmark-arrow-up-fill"></sl-icon>
								<span>Open document</span>
							</sl-button>
						</div>
					</slot>
				`: null}
			</div>
		`
	}
}

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

	@property({type: Boolean, reflect: true})
	previewing: boolean

	@property({type: String, reflect: true})
	lang: string

	@property({type: String})
	titleId: string

	@property({type: String})
	confirmDiscardText: string

	@property({type: Boolean})
	confirmingDiscard: boolean
	
	@property({type: String, attribute: true, reflect: true})
	titleValue: string
	
	@property({type: Boolean})
	titleDisabled: boolean

	@property({type: Boolean})
	titleAsIconicUrl: boolean = false

	@property({type: String})
	placeholder: string = "Unsaved File"

	@property({type: Boolean, attribute: true, reflect: true})
	pendingChanges: boolean

	@property({type: Boolean})
	lastLoaded: boolean = false

	@query("sl-animation")
	animation: SlAnimation

	connectedCallback() {
		super.connectedCallback()
		this.addEventListener("dragstart", e => {
			console.log("dragstart")
			this.titleAsIconicUrl && e.dataTransfer.setData("text/uri-list", this.titleValue)
			e.dataTransfer.setData("text/plain", this.titleValue)
			e.dataTransfer.setData("text", this.titleValue)
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
				border: 2px solid rgba(0, 0, 0, 0.1);
				border-bottom: 2px solid white;
				border-bottom-left-radius: 0;
				border-bottom-right-radius: 0;
				cursor: grab;
			}

			:host([previewing][active]) [part=base] {
				border-top: 2px solid var(--sl-color-warning-600);
			}

			[part=base] {
				--focus-ring: none;
				margin-right: 0.5em;
				border-radius: 6px;
				flex-shrink: 1;
				overflow: hidden;
				width: 40ch;
				min-width: min-content;
				position: relative;
				background: transparent;
				border: 2px solid transparent;
				padding: 0.7rem;
				display: flex;
				justify-content: space-between;
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

			:host([previewing][active]) .title {
				color: var(--sl-color-warning-600);
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

			:host([previewing]) .preview-button::part(base) {
				color: var(--sl-color-warning-600);
			}

			sl-tooltip {
				--max-width: 100%;
			}
		`] as any
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

	emitTogglePreview = () => this.dispatchEvent(
		new CustomEvent("ww-toggle-preview", {composed: true, bubbles: true})
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
		const url = new WWURL(this.titleValue)
		const iconName = PROTOCOL_ICONS[url.protocol.slice(0, -1)]
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
				<sl-icon-button title=${this.previewing? "Disable Preview [CTRL+B]": "Enable Preview [CTRL+B]"} class="preview-button" @click=${() => this.emitTogglePreview()} name=${this.previewing? "eye": "eye-slash"}></sl-icon-button>
				<sl-icon-button title="Save document as... [CTRL+S]" class="save-button" @click=${() => this.emitSaveAsTab()} name="file-earmark-arrow-down"></sl-icon-button>
				${!this.titleValue.startsWith("memory:")? html`<sl-icon-button title="Save document [CTRL+S]" class="save-button" @click=${() => this.emitSaveTab()} name="file-earmark-check"></sl-icon-button>`: null}
				<sl-tooltip ?open=${this.confirmingDiscard} trigger="manual" placement="bottom" hoist>
					<sl-icon-button title="Close document [CTRL+W]" class="close-button" @click=${() => this.emitCloseTab()} @blur=${() => this.emitCancelDiscard()} name="x-lg"></sl-icon-button>
					<span slot="content" class="confirm-discard-text">${this.confirmDiscardText}</span>
				</sl-tooltip>
			</div>
		</div>
		</sl-animation>`
	}
}

@customElement("ww-tab-panel")
export class TabPanel extends SlTabPanel {
	static get styles() {
		return [SlTabPanel.styles, css`

			:host([active]), :root, [part=base] {
				display: contents !important;
			}

			:host(:not([active])) {
				display: none !important;
			}

			[part=base] {
				padding: 0;
			}

		`] as any
	}
}


@customElement("ww-scroll-button")
export class ScrollButton extends LitElement {

	static get styles() {
		return css`
			sl-icon-button[disabled] {
				visibility: hidden !important;
			}
		`
	}

	constructor() {
		super()
		new ResizeObserver(() => this.requestUpdate()).observe(this.getTarget())
		this.getTarget().addEventListener("slotchange", () => this.requestUpdate())
	}

	@property({type: Object})
	getTarget: () => HTMLElement = () => this.parentElement

	@property({type: Number})
	amount: number = 200

	@property({type: String})
	direction: "left" | "right" | "top" | "bottom"

	@property({type: String})
	behavior: ScrollToOptions["behavior"] = "smooth"

	@property({type: Number})
	slowness: number = 100

	@property({type: String})
	visible: "auto" | "always" = "auto" 

	ref: number

	scrollTarget = () => {
		const backwards = ["left", "top"].includes(this.direction)
		const horizontal = ["left", "right"].includes(this.direction)
		this.getTarget().scrollBy({
			behavior: this.behavior,
			[horizontal? "left": "top"]: (backwards? -1: 1) * this.amount 
		})
		// return window.requestAnimationFrame(this.scrollTarget)
	}

	startScrollingTarget = () => {
		this.ref = window.requestAnimationFrame(this.scrollTarget)
	}

	stopScrollingTarget = () => {
		window.cancelAnimationFrame(this.ref)
	}

	render() {
		const horizontal = ["left", "right"].includes(this.direction)
		const isOverflown = horizontal? isOverflownX: isOverflownY
		return this.visible === "always" || isOverflown(this.getTarget())
			? html`<sl-icon-button
				name="chevron-${this.direction}"
				?disabled=${!isOverflown(this.getTarget())}
				@mousedown=${this.startScrollingTarget}
				@mouseup=${this.stopScrollingTarget}
			></sl-icon-button>`
			: null
	}
}

@customElement("ww-tab-title")
export class TabTitle extends SlInput {

	@query("[part=input]")
	input: HTMLInputElement

	static get styles() {
		return [SlInput.styles, css`
			[part=base] {
				border: none;
				background: transparent !important;

			}

			[part=form-control], [part=base], [part=input] {
				height: 20px !important;
				font-size: 0.9rem;
			}

			*:disabled {
				cursor: pointer !important;
			}

			*:focus {
				background: white;
				z-index: 100000;
			}
		`] as any
	}

	updated() {
		this.input.setAttribute("style", `
			font-family: var(--sl-font-mono);
			font-weight: bold;
			padding: 0;
			padding-left: 1ch;
			min-width: ${this.placeholder.length + 2}ch;
			width: ${this.value.length + 2}ch;
		`)
	}

	firstUpdated() {
		this.autofocus? this.focus(): null
	}
}

@customElement("ww-side-panel")
export class SidePanel extends LitElement {

	@property({reflect: true})
	position: "left" | "right" = "left"

	static get styles() {
		return css`
			:host {
				height: 100%;
				display: flex;
				flex-direction: column;
				justify-content: flex-start;
			}

			:host([position=left]) {
				margin-right: 0.25rem;
				align-items: flex-end;
			}

			:host([position=right]) {
				margin-left: 0.25rem;
				align-items: flex-start;
			}
		`
	}

	render() {
		return html`<slot></slot>`
	}
}