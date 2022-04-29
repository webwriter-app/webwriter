import { SlButton, SlInput, SlTab, SlTabPanel } from "@shoelace-style/shoelace"
import {LitElement, html, css, CSSResult, CSSResultGroup} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"
import Sortable from "sortablejs"

import {isOverflownX, isOverflownY} from "../utility"


@customElement("ww-tabs")
export class Tabs extends LitElement {

	@query("slot[name=tabs]")
	tabsSlot: HTMLSlotElement

	@queryAssignedElements({slot: "tabs"})
	tabs: HTMLElement[]

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
				z-index: 5000;
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
				background: #E0E0E0;
				position: sticky;
				top: 0;
				left: 0;
				z-index: 10000;
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

	firstUpdated() {
		Sortable.create(this)
	}

	render() {
		return html`
			<div part="base">
				<div part="pre-tabs">
					<slot name="pre-tabs">
						<sl-icon-button name="list"></sl-icon-button>
					</slot>
				</div>
				<div part="tabs" @focusin=${this.handleFocusIn}>
					<ww-scroll-button direction="left" .getTarget=${() => this.tabsWrapper}></ww-scroll-button>
					<div part="tabs-wrapper">
						<slot name="tabs"></slot>
						<sl-icon-button name="plus" @click=${this.emitNewTab}></sl-icon-button>
						<sl-icon-button name="folder2-open" @click=${this.emitOpenTab}></sl-icon-button>
					</div>
					<ww-scroll-button direction="right" .getTarget=${() => this.tabsWrapper}></ww-scroll-button>
				</div>
				<div part="post-tabs">
					<slot name="post-tabs">
						<sl-icon-button name="download"></sl-icon-button>
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
				border: 2px solid transparent;
				border-radius: 6px;
				background: transparent;
			}

			:host(:hover) {
				background: #F5F5F5;
			}

			:host([active]) {
				background: white;
				border: 2px solid lightgray;
				border-bottom: 2px solid white;
				border-bottom-left-radius: 0;
				border-bottom-right-radius: 0;
			}

			[part=base] {
				padding: 0.5rem;
				min-width: 20ch;
				display: flex;
				justify-content: space-between;
				border-radius: 0;
			}

			:host(:not(:hover):not([active])) [part=close-button] {
				visibility: hidden;
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
		return window.requestAnimationFrame(this.scrollTarget)
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
				@mousedown=${this.startScrollingTarget}
				@mouseup=${this.stopScrollingTarget}
			></sl-icon-button>`
			: null
	}
}

@customElement("ww-tab-title")
export class TabTitle extends SlInput {
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
		`] as any
	}
}

@customElement("ww-side-panel")
export class SidePanel extends LitElement {

	static get styles() {
		return css`
			:host, [part=base] {
				height: 100%;
			}

			[part=base] {
				padding: 0.5em;
				display: flex;
				flex-direction: column;
				justify-content: flex-start;
				align-items: flex-end;
			}
		`
	}

	render() {
		return html`<div part="base">
			<slot></slot>
		</div>`
	}
}