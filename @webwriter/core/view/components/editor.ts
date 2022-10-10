import {LitElement, html, css, PropertyValueMap, ReactiveController, unsafeCSS} from "lit"
import {customElement, property, query} from "lit/decorators.js"
//@ts-ignore 
import prosemirrorCSS from "prosemirror-view/style/prosemirror.css"
//@ts-ignore 
import gapcursorCSS from "prosemirror-gapcursor/style/gapcursor.css"
import { camelCaseToSpacedCase, prettifyPackageName, unscopePackageName } from "../../utility"

import { Decoration, EditorView, NodeView } from "prosemirror-view"
import { EditorState, Command, NodeSelection, Selection, Transaction } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"
import { chainCommands, toggleMark } from "prosemirror-commands"
import { PackageJson } from "../../state"
import { DocumentFooter, DocumentHeader } from "./meta"
import { getOtherAttrsFromWidget } from "../../state/editorstate"


const insertParagraphWidget = (pos: number) => Decoration.widget(pos, 
	(view: EditorView, getPos) => {
		const div = document.createElement("div")
		div.classList.add("insert-paragraph-widget")
		div.style.height = "1.25em"
		div.style.cursor = "text"
		div.style.background = "rgba(0, 0, 0, 0.1)"
		div.addEventListener("click", () => {
			const paragraph = view.state.schema.nodes.paragraph.create()
			const tr = view.state.tr.insert(getPos(), paragraph)
			view.dispatch(tr)
		})
		return div
	}, 
	{
		stopEvent(event) {
			return !(event instanceof MouseEvent)
		},
		ignoreSelection: true
	}
)

class WidgetView implements NodeView {

	node: Node
	view: EditorViewController
	getPos: () => number
	dom: HTMLElement

	constructor(node: Node, view: EditorViewController, getPos: () => number) {
		this.node = node
		this.view = view
		this.getPos = getPos

		this.dom = DOMSerializer.fromSchema(node.type.schema).serializeNode(node) as HTMLElement
		this.dom.addEventListener("focusin", e => {
			const resolvedPos = view.state.doc.resolve(getPos())
			const tr = view.state.tr.setSelection(new NodeSelection(resolvedPos))
			view.dispatch(tr)
		})
	}

	ignoreMutation(mutation: MutationRecord) {
		const {type, target} = mutation
		if(type === "attributes") {
			const tr = this.view.state.tr.setNodeAttribute(
				this.getPos(),
				"otherAttrs",
				getOtherAttrsFromWidget(target as HTMLElement)
			)
			this.view.dispatch(tr)
		}
		return true
	}

	selectNode() {
		this.dom["focus"]()
	}

	deselectNode() {
		this.dom["blur"]()
	}

	stopEvent(e: Event) {
		const activeElement = this.view.host.shadowRoot.activeElement
		const node = this.view.nodeDOM(this.getPos())
		if(activeElement === node) {
			return true
				&& !(e instanceof KeyboardEvent && e.key === "Delete")
				&& !(e instanceof KeyboardEvent && e.key === "Escape")
				&& !(e instanceof KeyboardEvent && (e.ctrlKey && e.key === "ArrowDown"))
				&& !(e instanceof KeyboardEvent && (e.ctrlKey && e.key === "ArrowUp"))
		}
		else {
			return true 
				&& !(e instanceof KeyboardEvent && e.key === "Delete")
				&& !(e instanceof KeyboardEvent && e.key === "Escape")
		}
	}

}

class EditorViewController extends EditorView implements ReactiveController {
	
	host: ExplorableEditor

	constructor(host: ExplorableEditor, ...args: ConstructorParameters<typeof EditorView>) {
		super(...args)
		this.host = host
		host.addController(this)
	}

	updateState(state: EditorState): void {
		super.updateState(state)
		this.host.dispatchEvent(new CustomEvent("update", {composed: true, bubbles: true, detail: {editorState: this.state}}))
	}

	hostConnected() {}
}

const toggleHeading = (editorState: EditorState, level=1) => chainCommands()

/* EDITOR REWRITE 
Document toolbox:
	< display left >
	< display wide (with labels) if there's space, else display narrow >
	Commands for inline, block and container widgets
	Commands for headings
Context sensitive toolbox:
	< display right if there is space, else display on content select >
	< display wide (with labels) if there's space, else display narrow >
	If a widget is selected: Display widget's 'action' part
	If text is selected: Display rich text options
*/

// Anchor is ww-explorable-editor
// Content is widget's part="action" child


function getActiveMarks(state: EditorState) {
	const marksInSelection = state.selection.$from.marks()
	const markNamesInSelection = marksInSelection.map(mark => mark.type.name)
	const storedMarkNames = state?.storedMarks?.map(mark => mark.type.name) ?? null
	return storedMarkNames !== null? storedMarkNames: markNamesInSelection
}

type MarkCommand = {command: (state: EditorState) => Command, icon?: string, className?: (state: EditorState) => string}

@customElement("ww-explorable-editor")
export class ExplorableEditor extends LitElement {

	static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

	editorViewController: EditorViewController

	markCommands: Record<string, MarkCommand> = {
		bold: {
			command: (state: EditorState) => toggleMark(state.schema.marks.bold),
			icon: "type-bold"
		},
		italic: {
			command: (state: EditorState) => toggleMark(state.schema.marks.italic),
			icon: "type-italic"
		},
		underline: {
			command: (state: EditorState) => toggleMark(state.schema.marks.underline),
			icon: "type-underline"
		},
		strikethrough: {
			command: (state: EditorState) => toggleMark(state.schema.marks.strikethrough),
			icon: "type-strikethrough"
		},
/*
		makeHeading1: {
			command: (state: EditorState) => setBlockType(state.schema.nodes.heading, {level: 1}),
			icon: "type-h1"
		},
		makeHeading2: {
			command: (state: EditorState) => setBlockType(state.schema.nodes.heading, {level: 2}),
			icon: "type-h2"
		},
		makeHeading3: {
			command: (state: EditorState) => setBlockType(state.schema.nodes.heading, {level: 3}),
			icon: "type-h3"
		},
*/
	}

	baseCommands: Record<string, {command: (state: EditorState) => Command, icon?: string, style?: string}> = {
	}

	exec = (command: Command) => {
		command(this.editorViewController.state, this.editorViewController.dispatch)
		this.editorViewController.focus()
	}

	insertWidget = (name: string) => {
		const state = this.editorViewController.state
		const {$from, $to} = state.selection
		const node = state.schema.nodes[name].create()

		let tr = state.tr.replaceSelectionWith(node)
		// tr = tr.insert(tr.selection.from, state.schema.nodes.paragraph.create())
		// tr = tr.insert(tr.selection.to, state.schema.nodes.paragraph.create())
		tr = tr.scrollIntoView()
		this.editorViewController.dispatch(tr)
	}

	constructor() {
		super()
		this.classList.add("loading")
	}

	@property({type: Object, attribute: false})
	editorState: EditorState

	@property({type: String})
	url: string

	@property({type: Boolean})
	loadingPackages: boolean

	@property({type: Array, attribute: false})
	packages: PackageJson[]

	@property({type: String})
	appendBlockType: string

	@property({type: Array})
	availableWidgetTypes: string[]
	
	@query("ww-document-header")
	documentHeader: DocumentHeader

	@query("ww-document-footer")
	documentFooter: DocumentFooter

	@query("main")
	main: HTMLElement



	getDocAttribute(key: string, asArray=true): string {
		const attr = this.editorState.doc.attrs.meta[key]
		return attr == null || Array.isArray(attr) || !asArray? attr: [attr]
	}

	emitSelectTabTitle = () => this.dispatchEvent(
		new CustomEvent("ww-select-tab-title", {composed: true, bubbles: true, detail: {url: this.url}})
	)

	emitDeleteBlock = (i: number) => this.dispatchEvent(
		new CustomEvent("ww-delete-block", {composed: true, bubbles: true, detail: {i}})
	)

	firstUpdated() {
		this.classList.remove("loading")
	}

	protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		super.updated(_changedProperties)
		if(_changedProperties.has("editorState") && !this.editorViewController) {
			const widgetViewEntries = Object.entries(this.editorState.schema.nodes)
				.filter(([key, nodeType]) => nodeType.spec["widget"])
				.map(([key, nodeType]) => [key, (node, view, getPos) => new WidgetView(node, view, getPos)])
			this.editorViewController = new EditorViewController(
				this,
				{mount: this.main},
				{
					state: this.editorState,
					nodeViews: Object.fromEntries(widgetViewEntries),
					handleKeyDown: this.handleKeyDown,
					/*decorations(state) {
						const decorations = []
						state.doc.forEach((node, k, i) => {
							if(node.type.spec["widget"]) {
								console.log({offset: k, index: i})
								const prevSibling = state.doc.maybeChild(k - 1)
								const nextSibling = state.doc.maybeChild(k + 1)

								if(prevSibling?.type.name !== "paragraph") {
									decorations.push(insertParagraphWidget(k))
								}
								if(nextSibling?.type.name !== "paragraph") {
									decorations.push(insertParagraphWidget(k + 1))
								}
							}
						})
						return DecorationSet.create(state.doc, decorations)
					},*/
				}
			)
			this.editorViewController.focus()
		}
		else if(_changedProperties.has("editorState") && (this.editorState !== this.editorViewController.state)) {
			this.editorViewController.updateState(this.editorState)
		}
	}

	static get styles() {
		return css`

			@keyframes fade-in {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;	
				}
			}

			:host {
				display: flex;
				flex-direction: column;
				margin: 0 auto;
				max-width: 800px;
				padding-top: 25px;
				padding-left: 20px;
				padding-right: 20px;
				position: relative;
				background: white;
				border: 1px solid rgba(0, 0, 0, 0.1);
				margin-bottom: 200px;
			}

			:host > * {
				animation: fade-in 0.3s ease-in;
			}

			ww-append-block-widget {
				height: 100%;
				gap: 1rem;
			}

			main {
				display: block;
				outline: none;
				width: 100%;
				min-height: 600px;
				white-space: normal !important;
			}

			.ProseMirror[data-placeholder]::before {
				color: darkgray;
				position: absolute;
				content: attr(data-placeholder);
				pointer-events: none;
			}

			#main-wrapper {
				display: flex;
				flex-direction: row;
				margin: 1rem 0;
				z-index: 10;
			}

			#main-wrapper:not(:focus-within) ww-editor-toolbox {
				visibility: hidden;
			}

			aside {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				justify-content: flex-start;
				position: absolute;
				right: 100%;
				top: 0;
			}

			main > p {
				margin: 0;
			}
			/*
			main:hover, main:focus-within {
				outline: 2px solid rgba(0, 0, 0, 0.1);
				border-radius: 6px;
			}
			*/

			main:empty {
				box-sizing: border-box;
				padding-top: 1em;
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
			
			.loading-packages-spinner-container {
				display: flex;
				width: 100%;
				flex-direction: row;
				justify-content: center;
				padding: 1rem;
				font-size: 2rem;
			}

			.ww-widget {
				--ww-action-opacity: 0;
			}

			.ww-widget:focus-within, .ww-widget:hover {
				--ww-action-opacity: 1;
			}

			.ww-widget:focus-within {
				background-color: var(--sl-input-background-color-focus);
				border-color: var(--sl-input-border-color-focus);
				box-shadow: 0 0 0 var(--sl-focus-ring-width) var(--sl-input-focus-ring-color);
			}

			.ww-widget:not(:focus-within) {
				cursor: pointer;
			}

			.ww-widget::part(action) {
				opacity: var(--ww-action-opacity);
			}



			@media only screen and (max-width: 1300px) {
			}

			@media only screen and (min-width: 1301px) {

				.ww-widget {
					display: block;
					position: relative;
				}

				.ww-widget::part(action) {
					position: absolute;
					height: 100%;
					left: 100%;
					padding-left: 25px; 
					top: 0;
				}
				
				ww-editor-toolbox {
					padding-top: 40px;
				}
			}


			${unsafeCSS(prosemirrorCSS)}

			
			${unsafeCSS(gapcursorCSS)}
			/*
			.ProseMirror-selectednode {
				outline-offset: 5px;
			}*/
		`
	}

	loadingSpinnerTemplate = () => html`
		<div class="loading-packages-spinner-container">
			<sl-spinner></sl-spinner>
		</div>`

	handleKeyDown = (view: EditorView, e: KeyboardEvent) => {
		const state = view.state
		const start = Selection.atStart(state.doc)
		const end = Selection.atEnd(state.doc)
		if(e.key === "ArrowDown" && state.selection.$to.pos === end.$to.pos) {
			this.documentFooter.focus()
		}
		else if(e.key === "ArrowUp" && state.selection.$from.pos === start.$from.pos) {
			this.documentHeader.focus()
		}
		else if(e.key === "Escape") {
			this.blur()
		}
	}

	setMetaValue(key: string, value: any) {
		const state = this.editorViewController.state
		let docObj = state.doc.toJSON()
		docObj.attrs.meta = {...state.doc.attrs["meta"], [key]: value}
		const nextState = state.reconfigure({plugins: state.plugins})
		nextState.doc = Node.fromJSON(this.editorViewController.state.schema, docObj)
		this.editorViewController.updateState(nextState)
/*
		class SetNodeMetaStep extends Step {
			key: string
			value: any

			constructor(key: string, value: any) {
				super()
				this.key = key
				this.value = value
			}
			apply(doc: Node) {
				const 
				new StepResult()
			}
			invert(doc: Node) {

			}
			map(mapping: Mappable) {

			}
			merge(other: Step) {
				return step
			}
		}
		state.tr.step()
*/
		this.editorViewController.updateState(nextState)
	}

	render() {
		
    return html`
      <ww-document-header
				part="header" 
				.docAttributes=${this.editorState.doc.attrs.meta}
				.revisions=${[]}
				@ww-focus-down=${e => this.editorViewController.focus()}
				@ww-attribute-change=${e => this.setMetaValue(e.detail.key, e.detail.value)}
			></ww-document-header>
			<div id="main-wrapper">
				${!this.loadingPackages
						? html`<main part="main" id="main" spellcheck=${false}></main>`
						: this.loadingSpinnerTemplate()
					}
				<sl-popup active anchor="main" placement="left" shift strategy="fixed" distance=${25}>
					<ww-editor-toolbox
						@ww-change-widget=${e => this.insertWidget(e.detail.name)}
						@ww-click-mark-command=${e => this.exec(this.markCommands[e.detail.name].command(this.editorState))}
						.packages=${this.packages}
						.markCommands=${this.markCommands}
						.activeMarks=${getActiveMarks(this.editorState)}
					></ww-editor-toolbox>
				</sl-popup>
			</div>
      <ww-document-footer
				part="footer"
				.docAttributes=${this.editorState.doc.attrs.meta}
				@ww-focus-up=${e => this.editorViewController.focus()}
			></ww-document-footer>
    ` 
	}
}

@customElement("ww-editor-toolbox")
class WwEditorToolbox extends LitElement {

	emitChangeWidget = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-change-widget", {composed: true, bubbles: true, detail: {name: unscopePackageName(name)}}))
	}

	emitClickMarkCommand = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-click-mark-command", {composed: true, bubbles: true, detail: {name}}))
	}

	emitClose = () => {
		this.dispatchEvent(new CustomEvent("ww-close", {composed: true, bubbles: true}))
	}

	@property({type: Array, attribute: false})
	packages: PackageJson[] = []

	@property({type: Array, attribute: false})
	markCommands: MarkCommand[] = []

	@property({type: Array, attribute: false})
	activeMarks: string[]

	static styles = css`

		:host {
			z-index: 10;
		}

		.package-card {
			position: relative;
			--padding: 10px;
		}

		.package-card::part(base) {
			width: 200px;
			height: 150px;
		}

		.package-card::part(body) {
			padding: 5px;
			height: 100%;
			overflow-y: hidden;
		}

		.package-card::part(body)::after {
			content: "";
			position: absolute;
			z-index: 1;
			bottom: 0;
			left: 0;
			pointer-events: none;
			background-image: linear-gradient(to bottom, rgba(255,255,255, 0), rgba(255,255,255, 1) 90%);
			width: 100%;
			height: 4em;
		}

		.title {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 1ch;
			cursor: pointer;
			font-size: 0.9rem;
		}

		.title:hover {
			color: var(--sl-color-primary-600);
		}

		.add-icon {
			margin-left: auto;
		}

		.title:not(:hover) .add-icon {
			visibility: hidden;
		}

		.close-button {
			position: absolute;
			top: 0;
			right: 0;
		}

		.info-icon {
			color: darkgray;
		}

		.info-icon:hover {
			color: var(--sl-color-primary-600);
		}

		.mark-command::part(base) {
			margin: 2px;
			padding: calc(var(--sl-spacing-x-small) - 2px);
		}

		.mark-command.applied::part(base) {
				background: lightgray;
				border-radius: 10px;
			}
		
		@media only screen and (max-width: 1300px) {
			:host {
				display: flex;
				flex-direction: row;
				justify-content: space-between;
				align-items: center;
				position: fixed;
				bottom: 0;
				left: 0;
				width: 100%;
				background: #f1f1f1;
				padding: 5px;
				height: 165px;
				box-sizing: border-box;
				border-top: 1px solid darkgray;
				transform: translateX(0);
			}

			[part=widget-choices] {
				box-sizing: border-box;
				display: flex;
				flex-direction: row;
				justify-content: center;
				align-items: center;
				height: 100%;
				gap: 1rem;
				padding-bottom: 5px;
			}

			[part=mark-commands] {
				display: flex;
				flex-direction: column;
				flex-wrap: wrap;
				height: 100%;
			}
		}

		@media only screen and (min-width: 1301px) {
			:host {
				display: flex;
				flex-direction: column;
				height: 100%;
				width: 210px;
			}

			[part=widget-choices] {
				box-sizing: border-box;
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				width: 100%;
				gap: 1rem;
				overflow-x: visible;
			}

		}
	`

	packageTemplate = (pkg: PackageJson) => html`<sl-card class="package-card">
		<span title="Add this widget" @click=${() => this.emitChangeWidget(pkg.name)} class="title" slot="header">
			${prettifyPackageName(pkg.name)}
			<sl-tooltip hoist content=${pkg.description}>
				<sl-icon class="info-icon" name="info-circle"></sl-icon>
			</sl-tooltip>
			<sl-icon class="add-icon" name="plus-square"></sl-icon>
		</span>
		${new (customElements.get(unscopePackageName(pkg.name)))()}
	</sl-card>`

	markCommandsTemplate = () => Object.entries(this.markCommands).map(([k, v]) => 	{
		return html`<sl-icon-button
			class=${`mark-command ${this.activeMarks.includes(k)? "applied": ""}`}
			tabindex=${0}
			title=${camelCaseToSpacedCase(k)} 
			name=${v.icon} 
			@click=${() => this.emitClickMarkCommand(k)}
		></sl-icon-button>`
	})

	render() {
		return html`
			<div part="mark-commands">
				${this.markCommandsTemplate()}
			</div>
			<div part="widget-choices">
				${this.packages.map(this.packageTemplate)}
			</div>

		`
	}
}