import {LitElement, html, css} from "lit"
import {customElement, property, query, queryAll, state} from "lit/decorators.js"
import {repeat} from "lit/directives/repeat.js"
import {interpret, StateValue} from "xstate"

import {documentsMachine} from "../state"
import { Document, Block, BlockElement } from "../model"
import {withMachine} from "../utility"
import "./components"
import * as packages from "../packages"
import { SlSelect } from "@shoelace-style/shoelace"
import { Tab, Tabs } from "./components"

@customElement("ww-app")
// @ts-ignore: Until I fix the withMachine mixin types...
export class App extends withMachine(LitElement, interpret(documentsMachine)) 
{

	constructor() {
		super()
		this.addEventListener("ww-select-tab-title", (e: any) => this.focusTabTitle(e.detail.id))
		window["state"] = () => this.machine.state
	}
	
	static get styles() {
		return css`
			:host {
				display: block;
				min-height: 100vh;
			}
		`
	}

	@query("ww-tabs")
	tabs: Tabs

	@query("ww-tab-panel[active] ww-document-editor")
	activeDocumentEditor: DocumentEditor

	focusTabTitle(id: number) {
		const {documentsOrder} = this.machine.state.context
		const i = documentsOrder.indexOf(id)
		const tabElement = this.tabs.tabs[i]
		const titleElement = tabElement?.querySelector(":last-child") as HTMLElement
		titleElement?.focus()
	}

	render() {
		const ctx = this.machine.state.context
		const state = this.machine.state
		const documents = ctx.documentsOrder.map(id => ctx.documents[id])
		const send = this.machine.send

		const tabs = documents.map(({id, attributes, content}) => html`
			<ww-tab 
				slot="tabs"
				id=${id}
				panel=${id}
				?active=${id === ctx.activeDocument}
				closable=${id === ctx.activeDocument}
				@focus=${() => send("SELECT", {id})}
				@keydown=${e => e.key === "Enter" || e.key === "ArrowDown"? this.activeDocumentEditor.focusFirstBlock(): null}
				@sl-close=${() => send("DISCARD", {id})}>
				<ww-tab-title
					autofocus
					id=${id}
					value=${attributes.label}
					@sl-change=${e => send("RELABEL", {id, label: e.target.value})}
					@keydown=${e => e.key === "Escape"? e.target.blur(): null}
					@click=${e => send("SELECT", {id})}
					?disabled=${id !== ctx.activeDocument}  
					placeholder="Untitled">
				</ww-tab-title>
			</ww-tab>
			<ww-tab-panel name=${id} ?active=${id == ctx.activeDocument}>
				<ww-document-editor
					docID=${id}
					.docAttributes=${attributes}
					.content=${content}
					appendBlockType=${ctx.defaultBlockType}
					@ww-append-block=${e => send("APPEND_BLOCK", {block: e.detail.type})}
					@ww-delete-block=${e => send("DELETE_BLOCK", {i: e.detail.i})}>
				</ww-document-editor>
			</ww-tab-panel>
		`)

		return html`
			<ww-tabs @ww-add-tab=${() => send("CREATE")}>
				${tabs}
				<sl-icon-button slot="post-tabs" @click=${() => send("SAVE", {url: ctx.documents[ctx.activeDocument].url})} name="file-earmark-arrow-down-fill"></sl-icon-button>
				<sl-icon-button slot="post-tabs" name="sliders"></sl-icon-button>
			</ww-tabs>
			${state.matches("saving") || state.matches("loading")? html`
				<ww-io-dialog 
					open
					protocol=${ctx.defaultProtocol} 
					wwformat=${ctx.defaultFormat}
					filename=${ctx.documents[ctx.activeDocument].attributes.label}
					type=${state.matches("saving")? "saving": "loading"}
					@ww-submit=${e => send("SAVE", {url: e.target.url, documentEditor: this.activeDocumentEditor})}
					@ww-cancel=${() => send("CANCEL")}
				></ww-io-dialog>
			`: null}
		`
	}
}

@customElement("ww-document-editor")
export class DocumentEditor extends LitElement {

	constructor() {
		super()
		this.addEventListener("keydown", e => e.key.startsWith("Arrow")
				? this[`focus${e.key.split("Arrow")[1]}`]()
				: null
		)
	}

	@property({type: Number})
	docID: Document["id"]

	@property({type: Object})
	docAttributes: Document["attributes"]

	@property({type: Array})
	content: Document["content"]

	@property()
	appendBlockType: string

	@query("*")
	firstChild: HTMLElement

	@queryAll("ww-block-section")
	blockSections: NodeListOf<BlockSection>

	emitSelectTabTitle = () => this.dispatchEvent(
		new CustomEvent("ww-select-tab-title", {composed: true, bubbles: true, detail: {id: this.docID}})
	)

	focusFirstBlock() {
		this.firstChild.focus()
	}

	focusUp() {
		let currentElement = this.shadowRoot.activeElement as HTMLElement
		let nextElement = currentElement.previousElementSibling as HTMLElement
		currentElement.blur()
		nextElement? nextElement.focus(): this.emitSelectTabTitle()
	}

	focusDown() {
		let currentElement = this.shadowRoot.activeElement as HTMLElement
		let nextElement = currentElement.nextElementSibling as HTMLElement
		currentElement.blur()
		nextElement? nextElement.focus(): null
	}

	focusLeft() {
		console.log("focusLeft")
	}

	focusRight() {
		console.log("focusRight")
	}

	emitAppendBlock = () => this.dispatchEvent(
		new CustomEvent("ww-append-block", {composed: true, bubbles: true, detail: {type: this.appendBlockType}})
	)

	emitDeleteBlock = (i: number) => this.dispatchEvent(
		new CustomEvent("ww-delete-block", {composed: true, bubbles: true, detail: {i}})
	)

	static get styles() {
		return css`

			:host {
				display: contents;
			}

			sl-select {
				grid-column: 2;
				height: 100%;
				gap: 1rem;
			}

			.delete-block-button::part(base):hover {
				color: red;
			}

			.delete-block-button::part(base):focus {
				color: red;
			}

			.delete-block-button::part(base):active {
				color: darkred;
			}

			.append-block {
				padding-bottom: 6rem;
			}
		`
	}

	appendBlockTemplate = () => {
		return html`
			<sl-select
				class="append-block"
				value=${this.appendBlockType}
				@sl-change=${e => (this.appendBlockType = e.target.value)}
				@keydown=${(e: KeyboardEvent) => {
					switch(e.key) {
						case "ArrowUp": this.focusUp(); break;
						case "Enter": this.emitAppendBlock(); break;
					}
				}}
			>
			${Object.keys(packages).map(name => html`
					<sl-menu-item value=${name}>${name}</sl-menu-item>
				`)}
				<sl-icon-button slot="prefix" @click=${this.emitAppendBlock} name="plus-square"></sl-icon-button>
			</sl-select>
		`
	}

	render() {
		return html`
			${repeat(this.content, b => (b as any).id, (block, i) => html`
				<ww-block-section .block=${block}>
					<sl-icon-button
						slot="left-panel"
						name="arrows-move">
					</sl-icon-button>
					<sl-icon-button
						slot="left-panel"
						class="delete-block-button"
						@click=${() => this.emitDeleteBlock(i)}
						name="trash">
					</sl-icon-button>
				</ww-block-section>
			`)}
				${this.appendBlockTemplate()}
		`
	}
}

@customElement("ww-block-section")
export class BlockSection extends LitElement {

	constructor() {
		super()
		this.addEventListener("focus", () => this.element.focus())
	}

	@property({type: Object})
	block: Block
	
	@property({type: Object})
	element: BlockElement

	static get styles() {
		return css`
			:host {
				display: contents;
			}

			:host(:not(:focus-within)) .left-panel {
				visibility: hidden;
			}
		`
	}

	connectedCallback() {
		super.connectedCallback()
		this.element = new packages[this.block.attributes.type].element()
		this.element.block = this.block
		this.element.classList.add("block-element")
	}

	focus() {
		this.element.focus()
	}

	render() {

		return html`
			<ww-side-panel class="left-panel">
				<slot name="left-panel"></slot>
			</ww-side-panel>
			${this.element}
			<ww-side-panel></ww-side-panel>
		`
	}
}