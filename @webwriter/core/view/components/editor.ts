import {LitElement, html, css, PropertyValueMap, ReactiveController, unsafeCSS} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {customElement, property, query} from "lit/decorators.js"
import prosemirrorCSS from "prosemirror-view/style/prosemirror.css?raw"
import gapcursorCSS from "prosemirror-gapcursor/style/gapcursor.css?raw"
import { camelCaseToSpacedCase, getScrollbarWidth, prettifyPackageName, unscopePackageName } from "../../utility"
import { Decoration, EditorView, NodeView, DecorationSet } from "prosemirror-view"
import { EditorState, Command, NodeSelection, Selection, AllSelection, TextSelection } from "prosemirror-state"
import { DOMSerializer, Node } from "prosemirror-model"
import { chainCommands, toggleMark } from "prosemirror-commands"

import { PackageJson } from "../../state"
import { DocumentFooter, DocumentHeader } from "./meta"
import { getOtherAttrsFromWidget } from "../../state/editorstate"
import {computePosition, autoUpdate, offset, shift, size} from '@floating-ui/dom'
import { WidgetForm } from "./widgetform"
import { CollageImagePicker } from "./uielements"

import * as allSemantics from "../../../../test/data/index"


/* Issues
- editor toolbox visibility
- selecting empty first paragraph issues
- styling of document-header
*/

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
		else if(type === "childList") {
			// TODO
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

class H5PWidgetView extends WidgetView {

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


function getActiveMarks(state: EditorState) {
	const marksInSelection = state.selection.$from.marks()
	const markNamesInSelection = marksInSelection.map(mark => mark.type.name)
	const storedMarkNames = state?.storedMarks?.map(mark => mark.type.name) ?? null
	return storedMarkNames !== null? storedMarkNames: markNamesInSelection
}

type MarkCommand = {command: (state: EditorState) => Command, icon?: string, className?: (state: EditorState) => string}

@customElement("ww-explorable-editor")
export class ExplorableEditor extends LitElement {

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

	get firstAvailableWidgetID() {
		let num = 0
		while(this.main.querySelector(`#ww_${num.toString(36)}`)) {
			num++
			if(num === Number.MAX_SAFE_INTEGER) {
				return null
			}
		}
		return `ww_${num.toString(36)}`
	}

	insertWidget = (name: string) => {
		const state = this.editorViewController.state
		const node = state.schema.nodes[name].create({id: this.firstAvailableWidgetID})
		let tr = state.tr.replaceSelectionWith(node)
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

	@property({type: Boolean, attribute: true})
	previewing: boolean

	@property({type: Boolean, attribute: true, reflect: true})
	hoverWidgetAdd: boolean = false
	
	@query("ww-document-header")
	documentHeader: DocumentHeader

	@query("ww-document-footer")
	documentFooter: DocumentFooter

	@query("main")
	main: HTMLElement

  @query("ww-widget-toolbox")
  widgetToolbox: WwWidgetToolbox

  @query("ww-editor-toolbox")
  editorToolbox: WwEditorToolbox

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
					decorations: (state) => {
						if(!this.previewing) {
              const {from, to} = state.selection
							const decorations = []
							state.doc.forEach((node, k, i) => {
								if(node.type.spec["widget"]) {
									decorations.push(Decoration.node(k, k + 1, {
                    editable: "true",
                    ...from <= k && k <= to? {"data-pm-selected": "true"}: {}
                  }))
								}
							})
							return DecorationSet.create(state.doc, decorations)
						}
						else {
							return DecorationSet.create(state.doc, [])
						}
					},
				}
			)
			this.editorViewController.focus()
			this.editorViewController.state
		}
		else if(_changedProperties.has("editorState") && (this.editorState !== this.editorViewController.state)) {
			this.editorViewController.updateState(this.editorState)
		}
    else if(_changedProperties.has("previewing")) {
      this.editorViewController.updateState(this.editorState)
    }
	}

	static get styles() {
		return css`

      * {
        overscroll-behavior: none;
      }

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
        overscroll-behavior: none;
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

			:host([hoverWidgetAdd]) main {
				caret-color: var(--sl-color-primary-600);
			}

			:host(:not([previewing])) .ProseMirror::before {
        color: darkgray;
				position: absolute;
				content: '⠀';
				pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
			}

			:host(:not([previewing])) .ProseMirror[data-placeholder]::before {
				content: attr(data-placeholder);
			}

			#main-wrapper {
				display: flex;
				flex-direction: row;
				margin: 1rem 0;
				z-index: 10;
			}

			#main-wrapper:not(:focus-within) ww-editor-toolbox {
				visibility: visible;
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
        position: relative;
        display: block;
        user-select: none;
        -webkit-user-select: none;
			}

      .ww-widget[data-pm-selected] {
        outline: 8px double var(--sl-input-focus-ring-color);
      }

      main:not(:focus-within) .ww-widget[data-pm-selected] {
        outline-color: lightgray;
      }

			.ww-widget:focus-within, .ww-widget:hover {
				--ww-action-opacity: 1;
			}

			.ww-widget:not(:focus-within) {
				cursor: pointer;
			}

			.ww-widget::part(action) {
				opacity: var(--ww-action-opacity);
			}

      :host([previewing]) ww-widget-toolbox {
        display: none;
      }

			ww-document-header, ww-document-footer {
				display: none;
			}

			@media only screen and (max-width: 1300px) {

        ww-widget-toolbox::part(base) {
          display: flex;
          flex-direction: row-reverse;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 4px 2px rgba(255, 255, 255, 0.95);
          border-radius: 4px;
        } 
			}

			@media only screen and (min-width: 1301px) {

				.ww-widget::part(action) {
					position: absolute;
					height: calc(100% - 40px);
          width: 200px;
					left: 100%;
          top: 0px;
					padding-left: 30px; 
          padding-top: 40px;
          user-select: none;
          -webkit-user-select: none;
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

  handleFocusIn(e: FocusEvent) {
    
    const target = e.target as HTMLElement
    
    const targetIsWidget = target.classList.contains("ww-widget")

    this.editorToolbox.activeElement = this.shadowRoot.activeElement
    
    if(targetIsWidget) {
      this.widgetToolbox.widget = target
    }
  }

  handleMouseIn(e: PointerEvent) {
    
    const target = e.target as HTMLElement
    
    const targetIsWidget = target.classList.contains("ww-widget")
    const widgetAlreadyFocused = this.shadowRoot?.activeElement?.classList.contains("ww-widget")
    
    if(targetIsWidget && !widgetAlreadyFocused) {
      this.widgetToolbox.widget = target
    }
  }  

  handleFocusOut(e: FocusEvent) {

    const target = e.target as HTMLElement
    const related = e.relatedTarget as HTMLElement
    const active = this.shadowRoot.activeElement
    
    if(target?.id === "main" && !related?.classList.contains("ww-widget")) {
      this.editorToolbox.activeElement = null
    }

    const isWidgetActive = active?.classList.contains("ww-widget")
    const isNextWidgetToolbox = related === this.widgetToolbox
    const isExitingWidget = target.classList.contains("ww-widget")
    
    if(isExitingWidget && !isNextWidgetToolbox && !isWidgetActive) {
      this.widgetToolbox.widget = undefined
    }
  }

  handleMouseOut(e: MouseEvent) {

    const target = e.target as HTMLElement
    const related = e.relatedTarget as HTMLElement
    const active = this.shadowRoot.activeElement

    const isWidgetActive = active?.classList.contains("ww-widget")
    const isNextWidgetToolbox = related === this.widgetToolbox
    const isExitingWidget = target.classList.contains("ww-widget")
    const isExitingWidgetToolbox = target === this.widgetToolbox && !(related === active)
    
    if((isExitingWidget && !isNextWidgetToolbox || isExitingWidgetToolbox) && !isWidgetActive) {
      this.widgetToolbox.widget = undefined
    }
    if(true) {
      e.preventDefault()
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

  deleteWidget(widget: HTMLElement) {
    const pos = this.editorViewController.posAtDOM(widget, 0)
    const tr = this.editorViewController.state.tr.delete(pos, pos + 1)
    this.editorViewController.dispatch(tr)
    this.widgetToolbox.widget = undefined
  }

	render() {		
    return html`
      <ww-document-header
				part="header" 
				.docAttributes=${this.editorState.doc.attrs.meta}
				.revisions=${[]}
				?editable=${!this.previewing}
				@ww-focus-down=${e => this.editorViewController.focus()}
				@ww-attribute-change=${e => this.setMetaValue(e.detail.key, e.detail.value)}
			></ww-document-header>
			<!--
			<ww-file-input multiple style="margin-top: 1rem;"></ww-file-input>
			<ww-image-coordinate-picker @change=${console.log} helpText="Pick a nice spot" label="Pick a hotspot" src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Boufal2022.jpg"></ww-image-coordinate-picker>
			<ww-rich-text-editor @change=${console.log}></ww-rich-text-editor>
			-->
			<!--<ww-collage-image-picker></ww-collage-image-picker>-->
			<!--${null || Object.entries(allSemantics).map(([name, semantics]) => html`
				<h2>${name}</h2>
				<ww-widget-form .widgetProperties=${Object.fromEntries(semantics.map(desc => [desc.name, desc]))}></ww-widget-form>
			`)}-->
			<div id="main-wrapper" @focusin=${this.handleFocusIn} @focusout=${this.handleFocusOut} @mouseover=${this.handleMouseIn} @mouseout=${this.handleMouseOut}>
				${!this.loadingPackages
						? html`<main part="main" id="main" spellcheck=${false} contenteditable=${!this.previewing}></main>`
						: this.loadingSpinnerTemplate()
					}
        <ww-widget-toolbox tabIndex=${-1} @ww-delete-widget=${e => this.deleteWidget(e.detail.widget)}></ww-widget-toolbox>
				<sl-popup active anchor="main" placement="left" shift strategy="fixed" distance=${25}>
					<ww-editor-toolbox
						style=${styleMap({width: `calc(100% - ${getScrollbarWidth()}px)`})}
						part="editor-toolbox"
						@ww-change-widget=${e => this.insertWidget(e.detail.name)}
						@ww-click-mark-command=${e => this.exec(this.markCommands[e.detail.name].command(this.editorState))}
						@ww-mousein-widget-add=${() => this.hoverWidgetAdd = true}
						@ww-mouseout-widget-add=${() => this.hoverWidgetAdd = false}
						.packages=${this.packages}
						.markCommands=${this.markCommands}
						.activeMarks=${getActiveMarks(this.editorState)}
            tabindex="-1"
					></ww-editor-toolbox>
				</sl-popup>
			</div>
      <ww-document-footer
				part="footer"
				.docAttributes=${this.editorState.doc.attrs.meta}
				?editable=${!this.previewing}
				@ww-focus-up=${e => this.editorViewController.focus()}
				@ww-attribute-change=${e => this.setMetaValue(e.detail.key, e.detail.value)}
			></ww-document-footer>
    ` 
	}
}

@customElement("ww-widget-toolbox")
class WwWidgetToolbox extends LitElement {
  
  @property({type: Number, state: true})
  x: number
  
  @property({type: Number, state: true})
  y: number

  @property({type: Object, attribute: false})
  widget: HTMLElement

  @query("div")
  div: HTMLElement

  cleanup: CallableFunction

  emitDeleteWidget = () => this.dispatchEvent(
    new CustomEvent("ww-delete-widget", {composed: true, bubbles: true, detail: {
      widget: this.widget
    }})
  )

  protected willUpdate(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    if(changedProperties.has("widget") && this.widget) {
      const narrowLayout = document.documentElement.clientWidth <= 1300 
      this.cleanup = autoUpdate(this.widget, this, async () => {
				if(this.widget) {
					try {
						const {x, y} = await computePosition(this.widget, this, {
							placement: narrowLayout? "bottom-end": "right-start",
							middleware: narrowLayout? [offset(5)]: [offset(30)]
						})
						this.x = narrowLayout? x - this.div.offsetWidth: x
						this.y = y
					}
					catch(e) {}
				}
      })
    }
    /*else if(changedProperties.has("widget") && !this.widget) {
      this.cleanup()
      this.cleanup = undefined
      this.x = undefined
      this.y = undefined
    }*/
  }

  static get styles() {
    return css`

      :host {
        user-select: none;
        -webkit-user-select: none;
      }

      div {
        position: absolute;
        display: flex;
        flex-direction: row;
        align-items: center;
        user-select: none;
        -webkit-user-select: none;
        font-size: 0.95rem;
        padding-right: 1ch;
      }
      #name {
        text-decoration: underline;
        text-decoration-color: var(--sl-color-primary-400);
        text-decoration-thickness: 2.5px;
        cursor: default;
      }

      #delete-button:hover::part(base) {
        color: var(--sl-color-danger-600);
      }
    `
  }

  render() {
    if(!this.widget) {
      return null
    }
    else {
      const styles = {left: `${this.x}px`, top: `${this.y}px`}
      const name = prettifyPackageName(this.widget.tagName.toLowerCase())
      return html`<div part="base" style=${styleMap(styles)}>
        <span id="name" title=${this.widget.id}>${name}</span>
        <sl-icon-button id="delete-button" title="Delete widget" name="trash" @click=${this.emitDeleteWidget}></sl-icon-button>
      </div>`
    }
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

	emitMouseInWidgetAdd = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-mousein-widget-add", {composed: true, bubbles: true, detail: {name}}))
	}

	emitMouseOutWidgetAdd = (name: string) => {
		this.dispatchEvent(new CustomEvent("ww-mouseout-widget-add", {composed: true, bubbles: true, detail: {name}}))
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

  @property({type: Object, attribute: false})
  activeElement: Element

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
      height: 2ch;
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
      z-index: 10;
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

		.alert-widget-creation::part(base) {
			z-index: 100;
			border: none;
		}

		.alert-widget-creation::part(icon) {
			font-size: 2rem;
			margin-right: 1ch;
		}

		.alert-widget-creation::part(message) {
			padding: 4px;
			height: 110px;
			display: flex;
			flex-direction: column;
			justify-content: center;
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
				background: #f1f1f1;
				padding: 5px;
				height: 165px;
				box-sizing: border-box;
				border-top: 1px solid darkgray;
				border-right: 1px solid darkgray;
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

	private createPackagePreviewWidget(name: string) {
		const widgetName = unscopePackageName(name)
		const WidgetElement = customElements.get(widgetName)
		return WidgetElement? document.createElement(widgetName): null
	}

	packageTemplate = (pkg: PackageJson) => html`<sl-card class="package-card">
		<span title="Add this widget" @click=${() => this.emitChangeWidget(pkg.name)} class="title" slot="header" @mouseenter=${() => this.emitMouseInWidgetAdd(pkg.name)} @mouseleave=${() => this.emitMouseOutWidgetAdd(pkg.name)}>
			<span>${prettifyPackageName(pkg.name)}</span>
			<sl-tooltip hoist content=${pkg.description}>
				<sl-icon title=${pkg.description} class="info-icon" name="info-circle"></sl-icon>
			</sl-tooltip>
			<sl-icon class="add-icon" name="plus-square"></sl-icon>
		</span>
		${this.createPackagePreviewWidget(pkg.name) ?? html`
		<sl-alert class="alert-widget-creation" variant="warning" open>
			<sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
			<span>Could not create widget.</span>
		</sl-alert>
		`}
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
      </div>`
	}
}