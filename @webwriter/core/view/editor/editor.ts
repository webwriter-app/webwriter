import {LitElement, html, css, ReactiveController, PropertyValueMap} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {customElement, property, query} from "lit/decorators.js"
import { Decoration, EditorView, DecorationSet } from "prosemirror-view"
import { EditorState, Command, NodeSelection, TextSelection, AllSelection } from "prosemirror-state"
import { Node, Mark, Slice, Fragment, DOMParser } from "prosemirror-model"
import { localized, msg } from "@lit/localize"

import { PackageWithOptions } from "../../model"
import { WidgetView } from "."
import { DocumentHeader } from "./documentheader"
import { DocumentFooter } from "./documentfooter"

import { roundByDPR, sameMembers } from "../../utility"
import { Toolbox } from "./toolbox"
import { Palette } from "./palette"
import { ProsemirrorEditor } from "./prosemirroreditor"

import redefineCustomElementsString from "redefine-custom-elements/lib/index.js?raw"
// import scopedCustomElementsRegistryString from "@webcomponents/scoped-custom-element-registry/scoped-custom-element-registry.min.js?raw"

import {computePosition, autoUpdate, offset, shift} from '@floating-ui/dom'
import { CommandEntry, CommandEvent } from "../../viewmodel"


export class EditorViewController extends EditorView implements ReactiveController {
	
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

@localized()
@customElement("ww-explorable-editor")
export class ExplorableEditor extends LitElement {

	exec = (command: Command) => {
		command(this.pmEditor.state, this.pmEditor.dispatch)
		this.pmEditor.focus()
	}

	get firstAvailableWidgetID() {
		let num = 0
		while(this.pmEditor.body.querySelector(`#ww_${num.toString(36)}`)) {
			num++
			if(num === Number.MAX_SAFE_INTEGER) {
				throw Error("Exceeded maximum number of widgets: " + String(Number.MAX_SAFE_INTEGER))
			}
		}
		return `ww_${num.toString(36)}`
	}

  createWidget = (name: string, id: string, editable=true) => {
    const nodeType = this.pmEditor.state.schema.nodes[name]
    return nodeType.createAndFill({id, otherAttrs: {editable}}, [
      
    ])
  }

	insertWidget = async (name: string, preview=false, attrs: Record<string, string>={}) => {
		const state = this.pmEditor.state
		const previewEl = this.pmEditor.document.querySelector("#ww_preview")
		const previewExists = previewEl?.tagName.toLowerCase() === name
		const id = preview? "ww_preview": this.firstAvailableWidgetID
		let tr

		if(!preview && previewEl && previewExists) {
      const deepPos = this.pmEditor.posAtDOM(previewEl, 0)
      const resolved = state.doc.resolve(deepPos)
      const previewPos = resolved.pos - resolved.depth
			tr = state.tr
				.setNodeAttribute(previewPos, "id", this.firstAvailableWidgetID)
				.setMeta("addToHistory", false)
			this.stateBeforePreview = null
		}
		else if(!preview) {
			const node = this.createWidget(name, id)
			tr = state.tr
				.replaceSelectionWith(node)
			this.stateBeforePreview = null
		}
		else if(preview && !previewExists) {
			const node = this.createWidget(name, id)
			this.stateBeforePreview = state
			tr = state.tr
				.replaceSelectionWith(node)
		}
		tr? this.pmEditor.dispatch(tr): null
		
		await this.updateComplete;
		setTimeout(() => {
			const el = this.pmEditor.body.querySelector(`#${id}`) as HTMLElement
			el?.focus()
		})
	}

	constructor() {
		super()
		this.classList.add("loading")
	}

  get markCommands() {
    return Object.values(this.commands).filter(cmd => cmd.tags?.includes("mark"))
  }

  get paragraphCommands() {
    return Object.values(this.commands).filter(cmd => cmd.tags?.includes("paragraph"))
  }

  get generalCommands() {
    return Object.values(this.commands).filter(cmd => cmd.tags?.includes("general"))
  }

  get previewCommand() {
    return this.commands["preview"]
  }

  get fontCommands() {
    return Object.values(this.commands).filter(cmd => cmd.tags?.includes("font"))
  }

  get setFontFamilyCommand() {
    return Object.values(this.commands).find(cmd => cmd.id === "setFontFamily")
  }

  get setFontSizeCommand() {
    return Object.values(this.commands).find(cmd => cmd.id === "setFontSize")
  }

	@property({type: Object, attribute: false})
	editorState: EditorState

	@property({type: String})
	url: string

	@property({type: Boolean})
	loadingPackages: boolean

  @property({type: Object, attribute: false})
  commands: Record<string, CommandEntry>

	@property({type: Array, attribute: false})
	packages: PackageWithOptions[]

	@property({type: String})
	appendBlockType: string

	@property({type: Boolean, attribute: true, reflect: true})
	previewing: boolean

	@property({type: Boolean, attribute: true})
	showWidgetPreview: boolean = true

	@property({type: Boolean, attribute: true, reflect: true})
	hoverWidgetAdd: boolean = false

	@property({type: Boolean, attribute: true})
	showTextPlaceholder: boolean = true

	@property({type: String, attribute: false})
	bundleCode: string

	@property({type: String})
	bundleID: string

	@property({type: String, attribute: false})
	bundleCSS: string

	@property({state: true})
	toolboxX: number

	@property({state: true})
	toolboxY: number

	@property({state: true})
	deletingWidget: Element | null

	@property({state: true})
	stateBeforePreview: EditorState | null = null
	
	@query("ww-document-header")
	documentHeader: DocumentHeader

	@query("ww-document-footer")
	documentFooter: DocumentFooter

	@query("main")
	main: HTMLElement

	@query("ww-toolbox")
	toolbox: Toolbox

	@query("ww-palette")
	palette: Palette

	@query("pm-editor")
	pmEditor: ProsemirrorEditor

	pendingMouseLeave: number

	get selection() {
		return this.editorState.selection
	}

	get isTextSelected() {
		return this.selection instanceof TextSelection
	}

	get isWidgetSelected() {
		return this.selection instanceof NodeSelection && this.selection.node.type.spec["widget"]
	}

	get isAllSelected() {
		return this.selection instanceof AllSelection
	}

	get selectionY() {
		return this.pmEditor.coordsAtPos(this.editorState.selection.anchor).top
	}

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

	emitOpen = (url: string) => this.dispatchEvent(
		new CustomEvent("ww-open", {composed: true, bubbles: true, detail: {url}})
	)

	firstUpdated() {
		this.classList.remove("loading")
	}

	LinkView = (mark: Mark, view: EditorView, inline: boolean) => {
			const dom = this.pmEditor.document.createElement("a")
			const href = mark.attrs.href
			Object.entries(mark.attrs)
				.filter(([k, v]) => v)
				.forEach(([k, v]) => dom.setAttribute(k, v))
			dom.addEventListener("click", e => {
				e.preventDefault()
				this.previewing && this.emitOpen(href)
			})
			return {dom}
	}

	private cachedNodeViews: Record<string, any>

	private get nodeViews() {
		const cached = this.cachedNodeViews
		const cachedWidgetKeys = Object.keys(cached ?? {})
		const widgetKeys = Object.entries(this.editorState.schema.nodes)
			.filter(([k, v]) => v.spec["widget"])
			.map(([k, _]) => k)
		if(sameMembers(widgetKeys, cachedWidgetKeys) && cached) {
			return cached
		}
		else {
			this.cachedNodeViews = Object.fromEntries(widgetKeys
				.map(key => [key, (node: Node, view: EditorViewController, getPos: () => number) => new WidgetView(node, view, getPos)]))
			return this.cachedNodeViews
		}
	}

	private cachedMarkViews: Record<string, any>

	private get markViews() {
		const cached = this.cachedMarkViews
		if(cached) {
			return cached
		}
		else {
			this.cachedMarkViews = {
				link: this.LinkView
			}
			return this.cachedMarkViews
		}
	}

	static get styles() {
		return css`

			* {
				overscroll-behavior: none;
			}

			:host {
				display: contents;
			}

      :host > main {
        grid-column: 1 / 5;
        grid-row: 2;
				display: grid;
				grid-template-columns: 1fr 40px minmax(auto, 800px) 1fr;
				grid-template-rows: 1fr max-content;
        place-items: stretch;
				width: 100%;
				margin: 0 auto;
				position: relative;
        overscroll-behavior: none;
				height: 100%;
				z-index: 10;
			}

      :host > aside {
        grid-column: 4;
        grid-row: 1;
      }

			pm-editor {
				grid-column: 2 / 5;
				grid-row: 1;
			}

			.loading-packages-spinner-container {
				display: flex;
				width: 100%;
				flex-direction: row;
				justify-content: center;
				padding: 1rem;
				font-size: 2rem;
			}

			ww-document-header, ww-document-footer {
				display: none;
			}

			pm-editor::part(iframe) {
				height: 100%;
				width: 100%;
				grid-area: inherit;
        opacity: 0;
        transition: opacity 0.5s;
			}

      pm-editor[loaded]::part(iframe) {
        opacity: 1;
      }


			:host([previewing]) ww-toolbox {
				display: none !important;
			}

      :host([previewing]) > :not(main):not(aside) {
        display: none !important;
      }

      :host([previewing]) > main {
        grid-column: 1 / 5;
        grid-row: 1 / 5;
        z-index: 100;
      }

      :host([previewing]) aside {
        z-index: 101;
      }

			@media only screen and (max-width: 1300px) {
				ww-palette {
					grid-column: 1 / 5;
					grid-row: 2;
				}

        :host > aside {
          display: none;
        }

        :host([previewing]) ww-palette::part(widget-choices) {
          display: none;
        }

        :host([previewing]) ww-palette {
          position: fixed;
          right: 0;
          bottom: 0;
          border: none;
          background: none;
          box-shadow: none;
        }
			}

			@media only screen and (min-width: 1301px) {
				ww-palette {
					grid-column: 1;
					grid-row: 1;
				}

        ww-palette ww-commandbar {
          display: none;
        }

        :host([previewing]) ww-palette {
          display: none;
        }

			}
		`
	}

	static editingStyles = css`

		html {
			background: #f1f1f1;
			overflow-y: scroll;
			height: 100%;
			--sl-color-danger-300: #fca5a5;
			--sl-color-primary-400: #38bdf8;

		}

		body {
			display: block;
			margin: 0;
			max-width: 840px;
		}

    audio, video, picture, picture > img {
      width: 100%;
    }

    .slot-content {
      cursor: text;
    }


		.ProseMirror {
			outline: none;
			display: block;
			white-space: normal !important;
      font-family: Arial, sans-serif;
			font-size: 14pt;
			background: white;
			border: 1px solid rgba(0, 0, 0, 0.1);
			padding: 19px;
			min-height: 100%;
			box-sizing: border-box;
		}

		.ww-widget {
			--ww-action-opacity: 0;
			position: relative !important;
			display: block !important;
			user-select: none !important;
			-webkit-user-select: none !important;
		}

		.ww-widget[editable][data-ww-selected] {
			outline: 8px double var(--sl-color-primary-400) !important;
		}

		.ww-widget[editable][data-ww-deleting] {
			outline-color: var(--sl-color-danger-300) !important;
		}

		.ww-widget[editable]:hover {
			outline: 8px double var(--sl-color-primary-200);
		}

		.ww-widget#ww_preview {
			position: relative;
			display: block;
			user-select: none;
			-webkit-user-select: none;
			outline: 4px dashed var(--sl-color-primary-400);
		}


		main:not(:focus-within) .ww-widget[data-ww-selected] {
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

		.ProseMirror::before {
			color: darkgray;
			position: absolute;
			content: '⠀';
			pointer-events: none;
			user-select: none;
			-webkit-user-select: none;
		}

		.ProseMirror[data-empty]::before {
			content: attr(data-placeholder);
      line-height: 1.25;
		}
		
		.ProseMirror > p {
			margin: 0;
			position: relative;
			z-index: 1;
      line-height: 2;
		}

		.ProseMirror ::selection {
			background-color: var(--sl-color-primary-400);
		}

		@media only screen and (min-width: 1071px) {

			.ww-widget::part(action) {
				position: absolute;
				height: calc(100% - 40px);
				width: calc(min(100vw - 840px - 40px, 800px));
				left: 100%;
				top: 0px;
				padding-left: 30px; 
				padding-top: 40px;
				user-select: none;
				-webkit-user-select: none;
			}
		}

    @media print {
      html {
        overflow: visible;
        background: none;
        border: none;
      }

      body {
        background: none;
        border: none;
      }

      .ProseMirror {
        background: none;
        border: none;
      }

      .ProseMirror[data-empty]::before {
			  display: none;
		  }
    }

	`

	loadingSpinnerTemplate = () => html`
		<div class="loading-packages-spinner-container">
			<sl-spinner></sl-spinner>
		</div>`


	handleKeyDown = (view: EditorView, e: KeyboardEvent) => {
		if(e.key === "Escape") {
			this.forceToolboxPopup = false
		}
		/*
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
		*/
	}

	focus(options: Parameters<HTMLElement["focus"]>[0]) {
		setTimeout(() => this.pmEditor.focus(), 75)
	}

	redispatch(e: Event) {
		return this.dispatchEvent(e instanceof CustomEvent
			? new CustomEvent(e.type, e)
			: new Event(e.type, e)
		)
	}

	setMetaValue(key: string, value: any) {
		const state = this.pmEditor.state
		let docObj = state.doc.toJSON()
		docObj.attrs.meta = {...state.doc.attrs["meta"], [key]: value}
		const nextState = state.reconfigure({plugins: state.plugins})
		nextState.doc = Node.fromJSON(this.pmEditor.state.schema, docObj)
		this.pmEditor.updateState(nextState)
	}

  deleteWidget(widget: Element) {
    const pos = this.pmEditor.posAtDOM(widget, 0)
    const tr = this.pmEditor.state.tr.delete(pos, pos + 1)
    this.pmEditor.dispatch(tr)
		this.deletingWidget = null
  }

	decorations = (state: EditorState) => {
		if(!this.previewing) {
			const {from, to} = state.selection
			const decorations = [] as Decoration[]
			state.doc.forEach((node, k, i) => {
				if(node.type.spec["widget"]) {
					decorations.push(Decoration.node(k, k + 1, {
						editable: "true",
						...this.deletingWidget?.id === node.attrs.id? {"data-ww-deleting": "true"}: {},
						...from <= k && k <= to? {"data-ww-selected": "true"}: {}
					}))
				}
			})
			return DecorationSet.create(state.doc, decorations)
		}
		else {
			return DecorationSet.create(state.doc, [])
		}
	}
	
	handleUpdate = () => {
		this.editorState = this.pmEditor.state
		this.updatePosition()
	}

	get isInNarrowLayout() {
		return document.documentElement.clientWidth <= 1300
	}

	get activeElement(): Element | null {
			const {selection} = this
      if(!this.pmEditor) {
        return null
      }
			if(selection instanceof TextSelection) {
				const pos = this.selection.from
				let node = this.pmEditor?.domAtPos(pos, 0).node
        let docNode = this.pmEditor.domAtPos(0, 0).node
        while(node.parentElement && node.parentElement !== docNode) {
          node = node.parentElement
        }
        /*
				let offset = this.pmEditor?.domAtPos(pos).offset
				if(node instanceof Text) {
					node = this.pmEditor?.domAtPos(pos - offset).node
				}*/
				return node as HTMLElement
			}
			else if(selection instanceof NodeSelection) {
				const node = this.pmEditor?.nodeDOM(selection.anchor)
				return node as HTMLElement
			}
			else {
				return null
			}
	}

	get activeNode(): Node | null {
		return this.getActiveNodeInState(this.editorState)
	}

	getActiveNodeInState(state: EditorState): Node | null {
		if(state && state.selection instanceof TextSelection) {
			return state.selection.$anchor.node()
		}
		else if(state && state.selection instanceof NodeSelection) {
			return state.selection.node
		}
		else {
			return null
		}
	}

	

	get hasNonEmptyTextSelection() {
		const selectionContent = (this.pmEditor?.state.selection.content().content.toJSON() ?? []) as any[]
		const textSelection = this.selection instanceof TextSelection
		const empty = this?.pmEditor?.state?.selection.empty
		const textOnly = selectionContent.every(entry => entry.type === "paragraph")
		return !empty && textOnly
	}

	updatePosition = async () => {
		const mode = this.toolboxMode
		const docEl = this.activeElement?.ownerDocument.querySelector("body")
		const iframeEl = this.pmEditor.iframe
		const docWidth = iframeEl?.clientWidth
    const docHeight = iframeEl?.clientHeight
    const iframeOffsetX = iframeEl.getBoundingClientRect().x
    const iframeOffsetY = iframeEl.getBoundingClientRect().y
		if(mode === "popup" && this.selection && this.activeElement && iframeEl) {
			const {y: yMin} = await computePosition(iframeEl, this.toolbox, {
				placement:  "right-start",
				strategy: "absolute",
			})
			const {y: yMax} = await computePosition(iframeEl, this.toolbox, {
				placement:  "right-end",
				strategy: "absolute",
				middleware: [
					shift({padding: {top: 5, bottom: 80 + 5}, boundary: iframeEl})
				]
			})
			const {bottom: anchorBottom, left: anchorLeft} = this.pmEditor.coordsAtPos(this.selection.anchor)
			const {bottom: headBottom, left: headLeft} = this.pmEditor.coordsAtPos(this.selection.head)
			this.toolboxX = roundByDPR(
				Math.max(Math.min(anchorLeft, headLeft) + iframeOffsetX)
			)
			this.toolboxY = roundByDPR(Math.min(
				Math.max(anchorBottom, headBottom, yMin) + 2,
				yMax
			))
		}
		else if(mode === "inline" && this.activeElement && docEl) {
			const {x, y} = await computePosition(this.activeElement, this.toolbox, {
				placement:  "bottom-end",
				strategy: "fixed",
				middleware:  [offset(5), shift({padding: {top: 5, bottom: 5}, boundary: iframeEl})]
			})
			this.toolboxX =  roundByDPR(x)
			this.toolboxY = roundByDPR(Math.max(y, 50))
		}
		else if(mode === "right" && this.selection && this.activeElement && docEl) {
			const {x, y} = await computePosition(this.activeElement, this.toolbox, {
				placement:  "right-start",
				strategy: "fixed",
				middleware:  [offset(30), shift({padding: {top: 5, bottom: 5}, boundary: iframeEl})]
			})
			this.toolboxX = roundByDPR(x)
			this.toolboxY = roundByDPR(y)
		}
		else if(mode === "right-text" && this.selection && this.activeElement && docEl) {
			const {y} = await computePosition(this.activeElement, this.toolbox, {
				placement:  "right-start",
				strategy: "fixed",
				middleware: []
			})
			this.toolboxX = roundByDPR(docWidth + 10)
			this.toolboxY = roundByDPR(Math.max(Math.min(y + 45, docHeight - this.toolbox.clientHeight + 30), 50))/*roundByDPR(
        Math.min(Math.max(selectionY, 0), yMax)
      )*/
		}
  }

	autoUpdateElement: {element: Element, cleanup: () => void} | null = null

  protected willUpdate(changed: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		const elementNotAuto = this.autoUpdateElement?.element !== this.activeElement
    if(this.activeElement && changed.has("editorState") && elementNotAuto) {
			this.forceToolboxPopup = null
			this.autoUpdateElement?.cleanup()
			this.autoUpdateElement = {
				element: this.activeElement,
				cleanup: autoUpdate(this.pmEditor.body, this.toolbox, () => this.updatePosition(), {animationFrame: true})
			}
    }
  }

  disconnectedCallback(): void {
	this.autoUpdateElement?.cleanup()
	this.autoUpdateElement = null
  }

  shouldBeEditable = (state: EditorState) => !this.previewing

  handleDOMEvents = {
    "keydown": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "keyup": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "ww-widget-focus": (_: any, ev: CustomEvent) => {
      // this.activeElement = ev.detail.widget
      if(this.previewing) {
        ev.detail.widget.focus()
      }
      ev.detail.widget.scrollIntoView({behavior: "smooth", block: "center"})
    },
    "ww-widget-blur": () => {
      // this.activeElement = null
    },
    "ww-widget-interact": (_: any, ev: CustomEvent) => {
      const {widget, relatedEvent} = ev.detail
      if(widget.id === "ww_preview") {
        const name = widget.tagName.toLowerCase()
        this.insertWidget(name)
      }
    },
    "ww-widget-click": (_: any, ev: CustomEvent) => {
      const {widget} = ev.detail
      widget.focus()
    },
    "focus": (_:any, ev: FocusEvent) => {
      this.updatePosition()
    },
    "blur": (_:any, ev: FocusEvent) => {
      const node = ev.target as HTMLElement
      const relatedNode = ev.relatedTarget as HTMLElement | null
      const isInternal = node.contains(relatedNode) || (relatedNode?.contains(node) ?? false)
      /*
      this.pendingBlur !== null && window.clearTimeout(this.pendingBlur)
      this.pendingBlur = window.setTimeout(() => this.activeElement = null, 100)
      */
    },
    "contextmenu": (_:any, ev: Event) => {
      ev.preventDefault()
      this.forceToolboxPopup = !(this.toolboxMode === "popup")
      this.updatePosition()
      this.requestUpdate()
    },
    "scroll": (_: any, ev: Event) => {
      // this.updatePosition()
    },
    "drop": (_:any, ev: DragEvent) => this.handleDropOrPaste(ev),
    "paste": (_:any, ev: ClipboardEvent) => this.handleDropOrPaste(ev)
  }

  private static createMediaElement(blob: Blob) {
    const mediaType = ["audio", "video", "image"].includes(blob.type.split("/")[0])? blob.type.split("/")[0]: null
    if(!mediaType) {
      return null
    }
    else {
      const media = document.createElement(mediaType === "image"? "picture": mediaType)
      const source = document.createElement(mediaType === "image"? "img": "source")
      source["src"] = URL.createObjectURL(blob)
      if(mediaType !== "image") {
        (source as HTMLSourceElement).type = blob.type
      }
      else {
        source.setAttribute("data-type", blob.type)
      }
      media.setAttribute("data-filename", blob.name)
      media.appendChild(source)
      return media
    }
  }

  private static createScriptElement(blob: Blob) {
    const script = document.createElement("script")
    script.src = URL.createObjectURL(blob)
    script.type = blob.type
    script.setAttribute("data-filename", blob.name)
    return script
  }

  private static elementsToHTMLString(elements: Element[]): string {
    return elements.map(el => el.outerHTML).join("\n")
  }

  blobsToElements = (blobs: Blob[]): Element[] => {
    const elements = []
    // https://www.iana.org/assignments/media-types/media-types.xhtml
    for(const blob of blobs) {
      if(blob.type.startsWith("application/")) {
        const element = ExplorableEditor.createScriptElement(blob)
        elements.push(element)
      }
      else if(blob.type.startsWith("audio/")) {
        const element = ExplorableEditor.createMediaElement(blob)
        element? elements.push(element): null
      }
      else if(blob.type.startsWith("font/")) {
        // In future, load font
        // https://stackoverflow.com/a/75646428
        const element = ExplorableEditor.createScriptElement(blob)
        elements.push(element)
      }
      else if(blob.type.startsWith("example/")) {
        continue
      }
      else if(blob.type.startsWith("image/")) {
        const element = ExplorableEditor.createMediaElement(blob)
        element? elements.push(element): null
      }
      else if(blob.type.startsWith("message/")) {
        const element = ExplorableEditor.createScriptElement(blob)
        elements.push(element)
      }
      else if(blob.type.startsWith("model/")) {
        const element = ExplorableEditor.createMediaElement(blob)
        element? elements.push(element): null 
      }
      else if(blob.type.startsWith("multipart/")) {
        continue 
      }
      else if(blob.type.startsWith("text/") || blob.type === "text") {
        const element = ExplorableEditor.createScriptElement(blob)
        elements.push(element)
      }
      else if(blob.type.startsWith("video/")) {
        const element = ExplorableEditor.createMediaElement(blob)
        element? elements.push(element): null
      }
    }
    return elements
  }

  handleDropOrPaste = (ev: DragEvent | ClipboardEvent) => {
    const DragEvent = this.pmEditor.window.DragEvent
    const EventType = ev instanceof DragEvent? DragEvent: ClipboardEvent
    const data = ev instanceof DragEvent? ev.dataTransfer: ev.clipboardData
    if((data?.files?.length ?? 0) > 0) {
      const files = [...(data?.files as any)].filter(file => file) as File[]
      const elements = this.blobsToElements(files)
      const htmlString = ExplorableEditor.elementsToHTMLString(elements)
      console.log(htmlString)
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/html", htmlString)
      // const eventToRedispatch = new DragEvent("drop", {...ev, dataTransfer})
      const eventToRedispatch = new EventType(ev.type, {...ev, [EventType === DragEvent? "dataTransfer": "clipboardData"]: dataTransfer})
      this.pmEditor.dom.dispatchEvent(eventToRedispatch)
      ev.preventDefault()
      ev.stopImmediatePropagation()
      return false
    }
  }

  

  get contentStyle() {
    return [
			ExplorableEditor.editingStyles.cssText,
			this.bundleCSS
		]
  } 

  get contentScript() {
    return [
			// scopedCustomElementsRegistryString,
			redefineCustomElementsString,
			this.bundleCode
		]
  }

	CoreEditor = () => {
		return html`
			<pm-editor
				id="main"
        .bundleID=${this.bundleID}
				@update=${this.handleUpdate}
				.scrollMargin=${20}
				scrollThreshold=${20}
				placeholder=${this.showTextPlaceholder && !this.previewing? msg("Enter content here..."): ""}
				.state=${this.editorState}
				.nodeViews=${this.nodeViews}
				.markViews=${this.markViews}
				.handleKeyDown=${this.handleKeyDown}
				.decorations=${this.decorations}
				.contentScript=${this.contentScript}
				.contentStyle=${this.contentStyle}
				.shouldBeEditable=${this.shouldBeEditable}
				.handleDOMEvents=${this.handleDOMEvents}>
			</pm-editor>
		`
	}

	pendingBlur: number

	@property({state: true})
	forceToolboxPopup: boolean | null = null

	get toolboxMode(): "popup" | "right" | "right-text" | "inline" | "hidden" {
		const {isInNarrowLayout, hasNonEmptyTextSelection, isWidgetSelected, forceToolboxPopup, isTextSelected} = this
		if(isInNarrowLayout && (forceToolboxPopup ?? hasNonEmptyTextSelection) && !isWidgetSelected && this.activeElement) return "popup"
		else if(!isInNarrowLayout && isWidgetSelected) return "right"
		else if(!isInNarrowLayout && isTextSelected) return "right-text"
		else if(isInNarrowLayout && isWidgetSelected) return "inline"
		else return "hidden"
	}

	get toolboxStyle(): Parameters<typeof styleMap>[0] {
		const {toolboxMode} = this
		if(!this.toolboxY) return {
			display: "none"
		}
		if(toolboxMode === "popup") return {
			position: "absolute",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
			border: "1px solid lightgray",
			padding: "4px",
			boxShadow: "var(--sl-shadow-medium)",
      transition: "top 0.1s, left 0.1s"
		}
		else if(toolboxMode === "right") return {
			position: "fixed",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
      transition: "top 0.1s, left 0.1s"
		}
		else if(toolboxMode === "right-text") return {
			position: "fixed",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
      transition: "top 0.1s, left 0.1s"
		}
		else if(toolboxMode === "inline") return {
			position: "fixed",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
			border: "1px solid lightgray",
			padding: "4px",
			boxShadow: "var(--sl-shadow-medium)",
      transition: "top 0.1s, left 0.1s"
		}
		else return {
			display: "none",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`
		}
	}

	Toolbox = () => {
		const {activeElement} = this
    
		if(this.toolboxMode === "popup" && !this.toolboxX && !this.toolboxY) {
			this.updatePosition()
		}
		return html`
			<ww-toolbox
				style=${styleMap(this.toolboxStyle)}
				tabindex="-1"
				.activeElement=${activeElement}
				@focus=${() => window.clearTimeout(this.pendingBlur)}
				@ww-delete-widget=${(e: any) => this.deleteWidget(e.detail.widget)}
				@ww-click-mark-command=${(e: any) => this.dispatchEvent(CommandEvent(e.detail.name))}
				@ww-mark-field-input=${(e: any) => {
					const {from, to} = this.editorState.selection
					const markType = this.editorState.schema.marks[e.detail.markType]
					const {key, value} = e.detail
					const tr = this.editorState.tr
						.removeMark(from, to, markType)
						.addMark(from, to, markType.create({[key]: value}))
					this.pmEditor.dispatch(tr)
				}}
				@ww-mouse-enter-delete-widget=${(e: CustomEvent) => this.deletingWidget = e.detail.widget}
				@ww-mouse-leave-delete-widget=${(e: CustomEvent) => this.deletingWidget = null}
				@ww-click-name=${(e: CustomEvent) => {
					this.activeElement?.scrollIntoView({behavior: "smooth", block: "center"})
					!e.detail.widget? this.pmEditor?.focus(): e.detail.widget.focus()
				}}
				.markCommands=${this.markCommands}
        .paragraphCommands=${this.paragraphCommands}
        .setFontFamilyCommand=${this.setFontFamilyCommand}
        .setFontSizeCommand=${this.setFontSizeCommand}
			></ww-toolbox>
		`
	}

	Palette = () => {
		return html`
			<ww-palette
				part="editor-toolbox"
				@ww-change-widget=${(e: any) => this.insertWidget(e.detail.name)}
				@ww-mousein-widget-add=${(e: CustomEvent) => {
					if(this.showWidgetPreview) {
						const name = e.detail.name as string
						this.insertWidget(name, true)
					}
				}}
				@ww-mouseout-widget-add=${() => {
					const previewEl = this.pmEditor.document.querySelector("#ww_preview")
					if(previewEl && this.stateBeforePreview && this.showWidgetPreview) {
						this.pmEditor.updateState(this.stateBeforePreview)
						this.pmEditor.focus()
					}
				}}
				@focus=${() => window.clearTimeout(this.pendingBlur)}
				.packages=${this.packages.filter(pkg => pkg.installed)}
				tabindex="-1"
				?showWidgetPreview=${this.showWidgetPreview}
			>
      ${this.GeneralCommands()}
    </ww-palette>
		`
	}

  GeneralCommands = () => {
    return html`<ww-commandbar
				@ww-click-general-command=${(e: any) => this.dispatchEvent(CommandEvent(e.detail.name))}
        @ww-toggle-preview=${() => this.previewing = !this.previewing}
        ?previewing=${this.previewing}
				.generalCommands=${this.generalCommands}
        .previewCommand=${this.previewCommand}
    ></ww-commandbar>`
  }

	render() {
		return html`
      <main part="base">
        ${this.CoreEditor()}
        ${this.Toolbox()}
        ${this.Palette()}
      </main>
      <aside part="toolbar">
        ${this.GeneralCommands()}
      </aside>
    ` 
	}
}