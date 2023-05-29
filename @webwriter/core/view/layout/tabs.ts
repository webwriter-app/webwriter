import { localized, msg } from "@lit/localize"
import {LitElement, html, css} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"

@localized()
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
				margin-top: -1px;
			}

			[part=pre-tabs] {
				display: flex;
				position: absolute;
				top: 5px;
				left: 0;
				align-items: center;
				justify-content: flex-end;
				z-index: 100;
			}

			[part=tabs] {
				flex-grow: 1;
				min-height: 2.75rem;
				display: flex;
				flex-direction: row;
				align-items: center;
				overflow: hidden;
			}

			[part=tabs-wrapper] {
				border-left: 40px solid transparent;
				position: relative;
				display: flex;
				align-items: center;
				flex-direction: row;
				flex-wrap: nowrap;
				scrollbar-width: none;
				margin-left: auto;
				margin-right: auto;
				width: 800px;
				overflow-x: hidden;
			}

			[part=tabs-wrapper]::-webkit-scrollbar {
				display: none;
			}

			[part=post-tabs] {
				display: flex;
				align-items: center;
				justify-content: flex-start;
				position: absolute;
				top: 6px;
				left: 0;
			}

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
				box-shadow: 0 0 4px 4px rgba(241, 241, 241, 0.9);
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
		const previousTab = this.tabs[this.tabs.indexOf(this.activeTab) - 1]
		previousTab?.focus()		
	}

	selectNextTab() {
		const nextTab = this.tabs[this.tabs.indexOf(this.activeTab) + 1]
		nextTab?.focus()
	}

	firstUpdated() {
		this.tabsWrapper.addEventListener("wheel", e => {
			e.preventDefault()
			this.tabsWrapper.scrollLeft += e.deltaY
		})
		this.shadowRoot?.querySelector("slot[name=tabs]")?.addEventListener("slotchange", () => this.requestUpdate())
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
								<sl-icon-button title=${msg("New document [CTRL+N]")} name="file-earmark-plus-fill" @click=${this.emitNewTab}></sl-icon-button>
							`: null}
							${this.tabs.length !== 0 && this.openTab? html`
								<sl-icon-button title=${msg("Open document [CTRL+O]")} name="file-earmark-arrow-up-fill" @click=${this.emitOpenTab}></sl-icon-button>
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
								<span>${msg("New document")}</span>
							</sl-button>
							<sl-button outline variant="neutral" @click=${this.emitOpenTab}>
								<sl-icon slot="prefix" name="file-earmark-arrow-up-fill"></sl-icon>
								<span>${msg("Open document")}</span>
							</sl-button>
						</div>
					</slot>
				`: null}
			</div>
		`
	}
}