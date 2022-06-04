import { SlButton, SlInput, SlTab, SlTabPanel } from "@shoelace-style/shoelace"
import {LitElement, html, css, CSSResult, CSSResultGroup} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"
import Sortable from "sortablejs"

import {isOverflownX, isOverflownY} from "../../utility"


@customElement("ww-tabs")
export class Tabs extends LitElement {

	@queryAssignedElements({slot: "tabs"})
	tabs: HTMLElement[]

	@queryAssignedElements({slot: "tabs", selector: "[active]"})
	activeTab: HTMLElement

	@query("[part=tabs-wrapper]")
	tabsWrapper: HTMLElement

	static get styles() {
		return css`
			:host {
				display: block;
				width: 100%;
				height: 100%;
			}

			[part=base] {
				display: grid;
				grid: min-content / 1fr minmax(auto, 960px) 1fr;
				grid-auto-rows: min-content;
				row-gap: 1rem;
				align-items: center;
				height: 100%;
			}

			[part=pre-tabs] {
				grid-area: 1 / 1;
				display: flex;
				align-items: center;
				justify-content: flex-end;
			}

			[part=tabs] {
				min-height: 2.75rem;
				display: flex;
				flex-direction: row;
				overflow-x: hidden;
				align-items: center;
			}

			[part=tabs-wrapper] {
				flex-grow: 1;
				display: flex;
				align-items: center;
				flex-direction: row;
				flex-wrap: nowrap;
				overflow-x: scroll;
				scrollbar-width: none;
			}

			[part=tabs-wrapper]::-webkit-scrollbar {
				display: none;
			}

			[part=post-tabs] {
				grid-area: 1 / 3;
				display: flex;
				align-items: center;
				justify-content: flex-start;
			}

			[part=body] {
				grid-area: 2 / 1 / 2 / 4;
				height: 100%;
			}

			[part=pre-tabs], [part=tabs], [part=post-tabs] {
				height: 100%;
				position: sticky;
				top: 0;
				left: 0;
				background: #F0F0F0;
			}

			sl-icon-button {
				background: transparent;
			}
		`
	}

	emitNewTab = () => this.dispatchEvent(
		new CustomEvent("ww-add-tab", {composed: true, bubbles: true})
	)

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

	selectPreviousTab() {
		const previousTab = this.tabs[this.tabs.indexOf(this.activeTab[0]) - 1]
		previousTab?.focus()		
	}

	selectNextTab() {
		const nextTab = this.tabs[this.tabs.indexOf(this.activeTab[0]) + 1]
		nextTab?.focus()
	}

	firstUpdated() {
		Sortable.create(this)
	}

	render() {
		return html`
			<div autofocus part="base">
				<div part="pre-tabs">
					<slot name="pre-tabs">
						<sl-icon-button name="list"></sl-icon-button>
						<sl-icon-button name="plus" @click=${this.emitNewTab}></sl-icon-button>
					</slot>
				</div>
				<div part="tabs" @focusin=${this.handleFocusIn} @keydown=${this.handleKeyDown}>
					<ww-scroll-button visible="always" direction="left" .getTarget=${() => this.tabsWrapper}></ww-scroll-button>
					<div part="tabs-wrapper">
						<slot name="tabs"></slot>
					</div>
					<ww-scroll-button visible="always" direction="right" .getTarget=${() => this.tabsWrapper}></ww-scroll-button>
				</div>
				<div part="post-tabs">
					<slot name="post-tabs">
					</slot>
				</div>
				<slot></slot>
			</div>
		`
	}
}

@customElement("ww-tab")
export class Tab extends SlTab {
	static get styles() {
		return [SlTab.styles, css`

			:host {
				--focus-ring: none;
				margin-right: 0.5em;
				border-radius: 6px;
				background: transparent;
				border: 2px solid transparent;
				flex-shrink: 1;
				overflow: hidden;
				width: 20ch;
				min-width: min-content;
				transition: max-width 1s ease-in;
				position: relative;
			}

			:host(:hover) {
				background: #F5F5F5;
			}

			:host([active]) {
				background: white;
				border: 2px solid rgba(0, 0, 0, 0.1);
				border-bottom: 2px solid white;
				border-bottom-left-radius: 0;
				border-bottom-right-radius: 0;
			}

			[part=base] {
				padding: 0.5rem;
				display: flex;
				justify-content: space-between;
				border-radius: 0;
				padding-bottom: 0.9em;
			}

			:host(:not([active])) [part=close-button] {
				visibility: hidden;
			}

			[part=close-button] {
				position: absolute;
				top: 20%;
				right: 5%;
				background: rgba(255, 255, 255, 0.85);
				box-shadow: 0 0 5px 10px rgba(255, 255, 255, 0.85);
			}

			[part=close-button]::part(base):hover {
				color: red;
			}

			[part=close-button]::part(base):focus {
				color: red;
			}

			[part=close-button]::part(base):active {
				color: darkred;
			}
		`] as any
	}
}

@customElement("ww-tab-panel")
export class TabPanel extends SlTabPanel {
	static get styles() {
		return [SlTabPanel.styles, css`

			:host([active]), :root, [part=base] {
				display: contents !important;
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
			font-family: Courier New, monospace;
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