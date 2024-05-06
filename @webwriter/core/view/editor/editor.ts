import {LitElement, html, css, ReactiveController, PropertyValueMap, CSSResult} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {customElement, property, query} from "lit/decorators.js"
import { Decoration, EditorView, DecorationSet } from "prosemirror-view"
import { EditorState, Command as PmCommand, NodeSelection, TextSelection, AllSelection, Selection } from "prosemirror-state"
import { Node, Mark, DOMParser, DOMSerializer} from "prosemirror-model"
import { localized, msg, str } from "@lit/localize"
// @ts-ignore
import {render as latexToMathML} from "temml/dist/temml.cjs"
import {MathMLToLaTeX} from "mathml-to-latex"

import { CODEMIRROR_EXTENSIONS, ContentExpression, EditorStateWithHead, MediaType, Package, createWidget, globalHTMLAttributes, removeMark, upsertHeadElement } from "../../model"
import { CodemirrorEditor, WidgetView, nodeViews } from "."
import { DocumentHeader } from "./documentheader"
import { DocumentFooter } from "./documentfooter"

import { range, roundByDPR, sameMembers } from "../../utility"
import { Toolbox } from "./toolbox"
import { Palette } from "./palette"
import { ProsemirrorEditor } from "./prosemirroreditor"

import redefineCustomElementsString from "redefine-custom-elements/lib/index.js?raw"
import scopedCustomElementsRegistryString from "@webcomponents/scoped-custom-element-registry/scoped-custom-element-registry.min.js?raw"

import {computePosition, autoUpdate, offset, shift, flip} from '@floating-ui/dom'
import { Command } from "../../viewmodel"
import { fixTables } from "prosemirror-tables"
import { App } from ".."
import { undo, redo, undoDepth, redoDepth } from "prosemirror-history"
import {StateCommand as CmCommand, EditorState as CmEditorState} from "@codemirror/state"
import {undo as cmUndo, redo as cmRedo} from "@codemirror/commands"
import { GapCursor } from "prosemirror-gapcursor"

class EmbedTooLargeError extends Error {}


export class EditorViewController extends EditorView implements ReactiveController {
	
	host: ExplorableEditor

	constructor(host: ExplorableEditor, ...args: ConstructorParameters<typeof EditorView>) {
		super(...args)
		this.host = host
		host.addController(this)
	}

	updateState(state: EditorStateWithHead): void {
		super.updateState(state)
		this.host.dispatchEvent(new CustomEvent("update", {composed: true, bubbles: true, detail: {editorState: this.state}}))
	}

	hostConnected() {}
}

@localized()
@customElement("ww-explorable-editor")
export class ExplorableEditor extends LitElement {

  @property({attribute: false})
  app: App

	exec = (command: PmCommand) => {
		command(this.pmEditor.state, this.pmEditor.dispatch, this.pmEditor as any)
		this.pmEditor.focus()
	}

  execInCodeEditor = (command: CmCommand) => command({state: this.cmEditor.state, dispatch: this.cmEditor.dispatch})

	getAvailableWidgetIDs(n=1) {
    const widgetIDs = Array.from(this.pmEditor.body.querySelectorAll(".ww-widget")).map(el => el.id)
    const widgetNumbers = widgetIDs.map(id => parseInt(id.slice(3), 36))
    const floor = Math.max(...widgetNumbers, 0)
		return range(n).map(k => `ww_${(floor + k).toString(36)}`)
	}

	insertMember = async (pkgID: string, insertableName: string) => {
    const state = this.pmEditor.state
    const members = this.app.store.packages.members as any
    if(insertableName.startsWith("./snippets/")) {
      const htmlStr = members[pkgID][insertableName].source
      const tagNames = this.app.store.packages.widgetTagNames
      const parser = DOMParser.fromSchema(state.schema)
      const template = this.pmEditor.document.createElement("template")
      template.innerHTML = htmlStr
      /*
      const widgetsInTemplate = Array.from(template.content.querySelectorAll("*")).filter(el => tagNames.includes(el.tagName.toLowerCase()))
      const ids = this.getAvailableWidgetIDs(widgetsInTemplate.length)
      ids.forEach((id, i) => widgetsInTemplate[i].id = id)
      */
      const slice = parser.parseSlice(template.content)
      let tr = this.pmEditor.state.tr.deleteSelection()
      const insertPos = Math.max(tr.selection.anchor - 1, 0)
      tr = tr.insert(insertPos, slice.content)
      // Find new selection: It should be as deep as possible into the first branch of the inserted slice. If the deepest node found is a textblock, make a TextSelection at the start of it. Otherwise, make a NodeSelection of it.
      let selection: Selection | null = null
      let widgetPos = -1
      slice.content.descendants((node, pos, parent, index) => {
        if(node.content.size === 0) {
          const r = tr.doc.resolve(insertPos + pos)
          if(node.type.spec.widget) {
            widgetPos = insertPos + pos
          }
          else {
            selection = node.isTextblock? TextSelection.findFrom(r, 1): NodeSelection.findFrom(r, 1)
          }
          return true
        }
      })
      if(selection) {
        tr = tr.setSelection(selection).scrollIntoView()
      }
      this.pmEditor.dispatch(tr)
      if(widgetPos !== -1) {
        setTimeout(() => {
          const widget = this.pmEditor.nodeDOM(widgetPos) as HTMLElement
          widget.focus()
        }, 0)
      }
      else {
        this.pmEditor.focus()
      }
      
    }
    else if(insertableName.startsWith("./widgets/")) {
      const tagName = insertableName.replace("./widgets/", "")
      const nodeName = tagName.replaceAll("-", "_")
      const nodeType = this.pmEditor.state.schema.nodes[nodeName]
      const node = nodeType.createAndFill()
      const state = this.pmEditor.state
      const insertPos = Math.max(state.selection.anchor - 1, 0)
      let tr = state.tr.insert(insertPos, node!)
      this.pmEditor.dispatch(tr)
      setTimeout(() => {
        const widget = this.pmEditor.nodeDOM(insertPos) as HTMLElement
        widget?.focus()
      }, 0)
    }
    else if(insertableName.startsWith("./themes/")) {
      const old = this.app.store.document.themeName
      const toInsert = pkgID + insertableName.slice(1)
      const value = old === toInsert? "base": toInsert
      const allThemes = this.app.store.packages.allThemes as any
      this.app.store.document.setHead(upsertHeadElement(
        this.editorState.head$,
        "style",
        {data: {"data-ww-theme": value}},
        this.editorState.head$.schema.text(allThemes[value].source),
        node => node.attrs?.data && node.attrs.data["data-ww-theme"] !== undefined
      )) 
    }
    else if(insertableName === "clipboard") {
      const items = await navigator.clipboard.read()
      const htmlStrs = await Promise.all(items
        .filter(x => x.types.includes("text/html"))
        .map(x => x.getType("text/html").then(blob => blob.text()))
      )
      this.pmEditor.pasteHTML(htmlStrs.join("\n"))
    }
	}

	constructor() {
		super()
		this.classList.add("loading")
	}

	@property({type: Object, attribute: false})
	editorState: EditorStateWithHead

  @property({type: Object, attribute: false})
	codeState: CmEditorState

	@property({type: String})
	url: string

	@property({type: Boolean})
	loadingPackages: boolean

  @property({type: Boolean, state: true})
	printing = false

	@property({type: Array, attribute: false})
	packages: Package[]

	@property({type: String})
	appendBlockType: string

	@property({type: Boolean, attribute: true, reflect: true})
	previewing: boolean

	@property({type: Boolean, attribute: true})
	showWidgetPreview: boolean = false

	@property({type: Boolean, attribute: true, reflect: true})
	hoverWidgetAdd: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
	controlsVisible: boolean = true

	@property({type: Boolean, attribute: true})
	showTextPlaceholder: boolean = true

	@property({type: String, attribute: false})
	bundleJS: string

	@property({type: String})
	bundleID: string

	@property({type: String, attribute: false})
	bundleCSS: string

	@property({type: Number, state: true})
	toolboxX: number

	@property({type: Number, state: true})
	toolboxY: number

	@property({type: Object, state: true})
	deletingWidget: Element | null

	@property({type: Object, state: true})
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

  @query("cm-editor")
	cmEditor: CodemirrorEditor

	pendingMouseLeave: number

  get toolboxHeight() {
    return this.toolbox.clientHeight
  }

  get toolboxWidth() {
    return this.toolbox.clientWidth
  }

	get selection() {
		return this.editorState.selection
	}

	get isTextSelected() {
		return this.selection instanceof TextSelection || this.selection instanceof AllSelection
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

  get codeEditorValue() {
    return this.cmEditor.value
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

  undo() {
    !this.app.sourceMode
      ? this.exec(undo)
      : this.execInCodeEditor(cmUndo)
  }

  redo() {
    !this.app.sourceMode
      ? this.exec(redo)
      : this.execInCodeEditor(cmRedo)
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
    const {nodes} = this.editorState.schema
		const cached = this.cachedNodeViews
		const cachedKeys = Object.keys(cached ?? {})
		const widgetKeys = Object.entries(nodes)
			.filter(([_, v]) => v.spec["package"])
			.map(([k, _]) => k)
    const nodeKeys = Object.keys(nodeViews)
    //const mediaKeys = Object.entries(this.editorState.schema.nodes)
    //.filter(([k, v]) => v.spec["media"])
    //.map(([k, _]) => k)
		if(sameMembers([...widgetKeys, ...nodeKeys], cachedKeys)) {
			return cached
		}
		else {
      const widgetViewEntries = widgetKeys
        .map(key => [key, (node: Node, view: EditorViewController, getPos: () => number) => new WidgetView(node, view, getPos)])
      const nodeViewEntries = Object.entries(nodeViews).map(([k, V]) => [
        k,
        (node: Node, view: EditorViewController, getPos: () => number) => new V(node, view, getPos)
      ])
      //return {...Object.fromEntries([...widgetViewEntries, ...nodeViewEntries])}
			this.cachedNodeViews = Object.fromEntries([...widgetViewEntries, ...nodeViewEntries])

			return this.cachedNodeViews
		}
	}

	private cachedMarkViews: Record<string, any>

	private get markViews() {
		const cached = this.cachedMarkViews
		if(cached) {
			return cached // TODO: Fix this
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
        grid-column: 1 / 8;
        grid-row: 3;
				display: grid;
				grid-template-columns: subgrid;
				grid-template-rows: 1fr max-content;
        place-items: stretch;
				width: 100%;
				margin: 0 auto;
				position: relative;
        overscroll-behavior: none;
        overflow: auto;
				height: 100%;
			}

      :host > aside {
        grid-column: 5;
        grid-row: 1;
      }

			pm-editor {
				grid-column: 1 / 8;
				grid-row: 1;
        font-size: 0.5rem;
			}

      cm-editor {
        grid-column: 3 / 6;
        grid-row: 1;
        background: white;
        border: 1px solid var(--sl-color-gray-300);
        border-bottom: none;
        cursor: text;
        font-size: 0.9rem;
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

      :host(:not([controlsVisible])) :is(ww-toolbox, ww-palette) {
        display: none !important;
      }

			@media only screen and (max-width: 1300px) {
				ww-palette {
					grid-column: 1 / 8;
					grid-row: 2;
				}

        :host > aside {
          display: none;
        }


        ww-toolbox.right-text {
          display: none;
        }
			}

			@media only screen and (min-width: 1301px) {
				ww-palette {
					grid-column: 2;
					grid-row: 1;
          height: fit-content;
				}

			}
		`
	}

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
    widget.remove()
    this.deletingWidget = null
    /*
    const pos = this.pmEditor.posAtDOM(widget, 0, 1)
    let tr = this.pmEditor.state.tr.delete(pos - 1, pos + 1)
    console.log(pos, this.selection.from, this.selection.to)
    if(this.selection.from <= pos && pos <= this.selection.to) {
      const newSelection = new TextSelection(tr.doc.resolve(pos))
      tr = tr.setSelection(newSelection)
    }
    this.pmEditor.dispatch(tr)
		this.deletingWidget = null*/
  }

  @property({attribute: false, state: true})
  editingStatus: undefined | "copying" | "cutting" | "deleting" | "inserting" | "pasting"

	decorations = (state: EditorState) => {
    const {from, to, $from} = state.selection
    const decorations = [] as Decoration[]
    state.doc.descendants((node, pos, parent, index) => {
      const name = node.type.name
      const selectionEndsInNode = pos <= to && to <= pos + node.nodeSize
      const selectionStartsInNode = pos <= from && from <= pos + node.nodeSize
      const selectionWrapsNode = from <= pos && pos + node.nodeSize <= to
      const deletingPos = this.deletingWidget? this.pmEditor.posAtDOM(this.deletingWidget, 0) - 1: -1
      const isSelectedInner = selectionWrapsNode && this.isTextSelected
      const isSelectedNode = state.selection instanceof NodeSelection && state.selection.node === node
      if(isSelectedNode || isSelectedInner) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: isSelectedInner? "ww-selected-inner": "ww-selected"}))
        this.editingStatus && decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: `ww-${this.editingStatus}`}))
      }
      if(node.isInline || name === "_phrase") {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-inline"}))
      }
      if(this.printing) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-beforeprint"}))
      }
      if(["audio", "video", "iframe"].includes(node.type.name)) {
        decorations.push(Decoration.widget(pos, (view, getPos) => {
          let el: HTMLElement | undefined = undefined
          // TODO: Fix this crutch
          try {
            el = view.nodeDOM(pos) as HTMLElement
          }
          catch(err) {}
          const extraDiv = view.dom.ownerDocument.createElement("div")
          extraDiv.classList.add("ww-nodeview")
          if(isSelectedNode || isSelectedInner) {
            extraDiv.classList.add(`ww-${this.editingStatus}`)
          }
          extraDiv.style.display = "block"
          extraDiv.style.position = "fixed"
          extraDiv.style.zIndex = "2147483647"
          extraDiv.style.pointerEvents = view.state.selection.from === pos? "none": "auto"
          extraDiv.addEventListener("mousedown", (e) => {
            const nodeSelection = view.state.selection instanceof NodeSelection
            if((view.state.selection.from !== pos) || !nodeSelection) {
              const sel = new NodeSelection(view.state.doc.resolve(pos))
              const tr = view.state.tr.setSelection(sel)
              view.dispatch(tr)
              e.preventDefault()
            }
          })
          el && new ResizeObserver(() => {
            const {top, left, width, height} = (el ?? extraDiv).getBoundingClientRect()
            const htmlNode = view.dom.ownerDocument.getRootNode() as HTMLElement
            let scrollbarWidth = htmlNode.offsetWidth - htmlNode.clientWidth;
            extraDiv.style.top = `${top}px`
            extraDiv.style.left = `${scrollbarWidth + left}px`
            extraDiv.style.width = `${width}px`
            extraDiv.style.height = `${height}px`
          }).observe(el)
          this.pmEditor.document.addEventListener("scroll", () => {
            const {top, left, width, height} = (el ?? extraDiv).getBoundingClientRect()
            extraDiv.style.top = `${top}px`
            extraDiv.style.left = `${left}px`
            extraDiv.style.width = `${width}px`
            extraDiv.style.height = `${height}px`
          }, {passive: true})
          return extraDiv
        }))
      }
      if(node.type.spec.group?.split(" ").includes("heading")) {
        const cmd = this.app.commands.containerCommands.find(cmd => cmd.id === name)
        decorations.push(Decoration.node(
          pos,
          pos + node.nodeSize,
          {
            "data-placeholder": cmd?.label,
            ...(node.textContent.trim() === ""? {"data-empty": ""}: {})
          }
        ))
      }
    })
    return DecorationSet.create(state.doc, decorations)
	}
	
	handleUpdate = () => {
		this.editorState = this.pmEditor.state as EditorStateWithHead
    this.dispatchEvent(new Event("change"))
		this.updatePosition()
	}

	get isInNarrowLayout() {
		return document.documentElement.offsetWidth <= 1300
	}

	get activeElement(): HTMLElement | null {
			const {selection} = this
      if(!this.pmEditor) {
        return null
      }
      if(selection instanceof GapCursor) {
        return this.pmEditor.body.querySelector(".ProseMirror-gapcursor")
      }
      else if(selection instanceof AllSelection) {
        return this.pmEditor.body
      }
			else if(selection instanceof TextSelection) {
        const node = this.pmEditor.domAtPos(this.selection.anchor, 0)?.node
        return node?.nodeType === window.Node.TEXT_NODE? node.parentElement: node as HTMLElement

			}
			else if(selection instanceof NodeSelection) {
				const node = this.pmEditor?.nodeDOM(selection.anchor)
				return node as HTMLElement
			}
			else {
				return null
			}
	}

  inspect() {
    alert(msg("This feature is not implemented yet"))
  }
  edit() {
    alert(msg("This feature is not implemented yet"))
  }
  transform() {
    alert(msg("This feature is not implemented yet"))
  }
  copy() {
    const serializer = this.pmEditor.clipboardSerializer ?? DOMSerializer.fromSchema(this.editorState.schema)
    const fragment = this.selection.content().content
    const documentFragment = serializer.serializeFragment(fragment, {document: this.pmEditor.document}) as DocumentFragment
    const dom = this.pmEditor.document.createElement("div")
    dom.appendChild(documentFragment)

    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([dom.innerHTML], {type: "text/html"}),
      "text/plain": new Blob([dom.innerText], {type: "text/plain"}),
    })
    return navigator.clipboard.write([clipboardItem])
  }

  delete() {
    const tr = this.editorState.tr.deleteSelection()
    this.pmEditor.dispatch(tr)
  }

  cut() {
    this.copy()?.then(() => this.delete())
  }

  paste() {
    this.insertMember("@webwriter/core", "clipboard")
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

	

	get hasNonEmptySelection() {
		const selectionContent = (this.pmEditor?.state?.selection.content().content.toJSON() ?? []) as any[]
		const textSelection = this.selection instanceof TextSelection
		const empty = this?.pmEditor?.state?.selection.empty
		const textOnly = selectionContent.every(entry => entry.type === "paragraph")
		return !empty
	}

	updatePosition = async () => {
		const mode = this.toolboxMode
		const docEl = this.activeElement?.ownerDocument.querySelector("body")
		const iframeEl = this.pmEditor?.iframe
    const iframeBody = this.pmEditor?.body
    const bodyWidth = iframeBody?.offsetWidth
		const docWidth = iframeEl?.clientWidth
    const docHeight = iframeEl?.clientHeight
    const rightEdge = docWidth - (docWidth - bodyWidth) / 2
    const iframeOffsetX = iframeEl?.getBoundingClientRect().x
    const iframeOffsetY = iframeEl?.getBoundingClientRect().y
		if(mode === "popup" && this.selection && this.activeElement && iframeEl) {
			const {y: yMin} = await computePosition(iframeEl, this.toolbox, {
				placement:  "right-start",
				strategy: "absolute",
			})
			const {y: yMax} = await computePosition(iframeEl, this.toolbox, {
				placement:  "right-end",
				strategy: "absolute",
				middleware: [
					shift({padding: {top: 5, bottom: 5}, boundary: iframeEl})
				]
			})
			const {bottom: anchorBottom, left: anchorLeft} = this.pmEditor.coordsAtPos(this.selection.anchor)
			const {bottom: headBottom, left: headLeft} = this.pmEditor.coordsAtPos(this.selection.head)
			this.toolboxX = roundByDPR(
          Math.min(
            Math.min(anchorLeft, headLeft) + iframeOffsetX,
            docWidth - this.toolbox.clientWidth - 20
          )
			)
			this.toolboxY = roundByDPR(Math.min(
				Math.max(anchorBottom, headBottom, yMin) + 2,
				yMax
			))
		}
		else if(mode === "right" && this.selection && this.activeElement && docEl) {
			const {y} = await computePosition(this.activeElement, this.toolbox, {
				placement:  "right-start",
				strategy: "fixed",
				middleware: []
			})
			this.toolboxX = roundByDPR(rightEdge + 1)
			this.toolboxY = roundByDPR(Math.max(
        Math.min(
          y,
          docHeight - this.toolbox.clientHeight + iframeOffsetY
        ),
        iframeOffsetY
      ))/*roundByDPR(
        Math.min(Math.max(selectionY, 0), yMax)
      )*/
      this.positionStyle = css`
        body {
          --ww-toolbox-action-x: ${this.toolboxX - iframeOffsetX};
          --ww-toolbox-action-y: ${this.toolboxY + this.toolboxHeight - iframeOffsetY};
          --ww-toolbox-action-width: ${docWidth - rightEdge}
          --ww-toolbox-action-height: ${docHeight + -this.toolboxY + -this.toolboxHeight}
        }
      `
		}
  }

  set positionStyle(value: CSSResult) {
    const styles = value instanceof CSSResult? value.cssText: value
    this.pmEditor.document.adoptedStyleSheets = this.pmEditor.document.adoptedStyleSheets.filter(sheet => sheet !== this.positionStylesheet)
    this.positionStylesheet = new this.pmEditor.window.CSSStyleSheet()
    this.positionStylesheet.replaceSync(styles)
    this.pmEditor.document.adoptedStyleSheets.push(this.positionStylesheet)
  }

  positionStylesheet: CSSStyleSheet

	autoUpdateElement: {element: Element, cleanup: () => void} | null = null

  protected willUpdate(changed: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.willUpdate(changed)
		const elementNotAuto = this.autoUpdateElement?.element !== this.activeElement
    if(this.activeElement && changed.has("editorState") && elementNotAuto) {
			this.forceToolboxPopup = null
			this.autoUpdateElement?.cleanup()
			this.autoUpdateElement = {
				element: this.activeElement,
				cleanup: autoUpdate(this.pmEditor.body, this.toolbox, () => this.updatePosition(), {animationFrame: false})
			}
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
	  this.autoUpdateElement?.cleanup()
	  this.autoUpdateElement = null
  }

  shouldBeEditable = (state: EditorState) => !this.ownerDocument.fullscreenElement

  setNodeAttribute(el: HTMLElement, key: string, value?: string | boolean, tag?: string) {
    
    const pos = this.pmEditor.posAtDOM(el, 0, 1) - 1
    const resolved = this.editorState.doc.resolve(pos)
    const node = resolved.nodeAfter ?? resolved.nodeBefore
    const builtinAttr = key in (this.editorState.schema.nodes[node!.type.name].spec.attrs ?? {})
    const dataAttr = key.startsWith("data-")
    let v = value
    if(value === true) {
      v = ""
    }
    else if(value === false) {
      v = undefined
    }
    let tr = this.editorState.tr
    if(builtinAttr) {
      tr = tr.setNodeMarkup(
        pos,
        tag? this.editorState.schema.nodes[tag]: undefined,
        {...node!.attrs, [key]: v}
      )
      // tr.setNodeAttribute(pos, key, v)
    }
    else if(dataAttr) {
      tr = tr.setNodeMarkup(
        pos,
        tag? this.editorState.schema.nodes[tag]: undefined,
        {...node!.attrs, data: {...node!.attrs.data, [key]: v}}
      )
    }
    else {
      tr = tr.setNodeMarkup(
        pos,
        tag? this.editorState.schema.nodes[tag]: undefined,
        {...node!.attrs, _: {...node!.attrs._, [key]: v}}
      )
    }
    this.pmEditor.dispatch(tr)
    this.pmEditor.focus()
  }

  handleDOMEvents = {
    "keydown": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "keyup": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "ww-widget-focus": (_: any, ev: CustomEvent) => {
      ev.detail.widget?.focus()
      /*
      if(this.previewing) {
        ev.detail.widget.focus()
      }*/
      ev.detail.widget.scrollIntoView({behavior: "smooth", block: "center"})
    },
    "ww-widget-blur": () => {
      // this.activeElement = null
    },
    "ww-widget-click": (_: any, ev: CustomEvent) => {
      const {widget} = ev.detail
      // widget.focus()
    },
    "focus": (_:any, ev: FocusEvent) => {
      this.updatePosition()
      this.dispatchEvent(new Event("focus", ev))
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
    const mediaType = new MediaType("#" + blob.type).supertype
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

  private static async createScriptElement(blob: Blob, plain=false) {
    const script = document.createElement("script")
    if(!plain) {
      script.src = URL.createObjectURL(blob)
    }
    else {
      script.innerHTML = await blob.text()
    }
    script.type = blob.type
    script.setAttribute("data-filename", blob.name)
    return script
  }

  private static createEmbedElement(blob: Blob) {
    const embed = document.createElement("embed")
    embed.src = URL.createObjectURL(blob)
    embed.type = blob.type
    embed.setAttribute("data-filename", blob.name)
    return embed
  }

  private static wrapWithFigureElement(contentElement: Element, caption: string) {
    const figure = document.createElement("figure")
    figure.appendChild(contentElement)
    const figcaption = document.createElement("figcaption")
    figcaption.innerText = caption
    figure.appendChild(figcaption)
    return figure
  }

  private static elementsToHTMLString(elements: Element[]): string {
    return elements.map(el => el.outerHTML).join("\n")
  }

  private static textScriptTypes = [
    "text", "application/AML", "application/ATF", "application/ATFX", "application/ATXML", "application/batch-SMTP", "application/call-completion", "application/ccex", "application/cdmi-", "application/cybercash", "application/dashdelta", "application/dca-rft", "application/DCD", "application/dec-dx", "application/dii", "application/dit", "application/ecmascript", "application/express", "application/ibe-pp-data", "application/iges", "application/IOTP", "application/javascript", "application/jose", "application/json", "application/jwt", "application/link-format", "application/linkset", "application/lxf", "application/mathematica", "application/mbox", "application/moss-keys", "application/mosskey-", "application/n-quads", "application/n-triples", "application/nasdata", "application/news-", "application/node", "application/ODX", "application/passport", "application/pem-certificate-chain", "application/pgp-", "application/postscript", "application/relax-ng-compact-syntax", "application/remote-printing", "application/sdp", "application/SGML", "application/sgml-open-catalog", "application/sieve", "application/smil", "application/sparql-query", "application/sql", "application/srgs", "application/trickle-ice-sdpfrag", "application/trig", "application/vq-rtcpxr", "application/x-www-form-urlencoded", "application/xml", "application/xml-dtd", "application/xml-external-parsed-entity", "application/yaml", "application/yang"
  ]
  private static metaformatTypes = ["+jwt", "+xml", "+json", "+json-seq"]
  private static dataURLScriptTypes = ["application", "message", "model", "multipart", "font"]
  private static mediaTypes = ["image", "audio", "video"]
  private static embedTypes = ["application/pdf"]

  private selectElementInEditor(el: HTMLElement) {
    const pos = Math.max(this.pmEditor.posAtDOM(el, 0) - 1, 0)
    const selection = NodeSelection.create(this.pmEditor.state.doc, pos)
    this.pmEditor.dispatch(this.pmEditor.state.tr.setSelection(selection))
    this.pmEditor.focus()
    el.focus()
  }

  blobsToElements = async (blobs: Blob[]) => {
    const elements = []
    // https://www.iana.org/assignments/media-types/media-types.xhtml
    for(const blob of blobs) {
      const mediaType = new MediaType("#" + blob.type)
      /*
      if(blob.size > 1.5e+6) {
        throw new EmbedTooLargeError(msg("Files larger than 1.5MB can not be embedded."))
      }*/
      if(blob.size > 1e+7 && blob.size <= 5e+8) {
        console.warn(str`File ${blob.name} is larger than 10MB. It is not recommended to embed files this large.`)
      }
      
      if(blob.size > 20e+8) {
        throw new EmbedTooLargeError(`File ${blob.name} is larger than 2GB. Files larger than 2GB can not be embedded.`)
      }
      else if(ExplorableEditor.textScriptTypes.some(v => blob.type.startsWith(v)) || ExplorableEditor.metaformatTypes.some(v => mediaType.subtype.endsWith(v))) {
        const element = ExplorableEditor.createScriptElement(blob, true)
        elements.push(element)
      }
      else if(ExplorableEditor.embedTypes.some(v => blob.type.startsWith(v))) {
        const element = ExplorableEditor.createEmbedElement(blob)
        elements.push(element) 
      }
      else if(ExplorableEditor.mediaTypes.some(v => blob.type.startsWith(v))) {
        const element = ExplorableEditor.createMediaElement(blob)
        element? elements.push(element): null
      }
      else if(ExplorableEditor.dataURLScriptTypes.some(v => blob.type.startsWith(v))) {
        const element = ExplorableEditor.createScriptElement(blob, true)
        elements.push(element)
      }
      else {
        console.warn(msg("WebWriter does not support media of type ") + blob.type)
      }
    }
    const figures = await Promise.all(elements)
    return figures 
  }

  handleDropOrPaste = (ev: DragEvent | ClipboardEvent) => {
    const DragEvent = this.pmEditor.window.DragEvent
    const data = ev instanceof DragEvent? ev.dataTransfer: ev.clipboardData
    if((data?.files?.length ?? 0) > 0) {
      const files = [...(data?.files as any)].filter(file => file) as File[]
      let elements = [] as Element[]
      try {
        this.blobsToElements(files).then(elements => {
          const htmlString = ExplorableEditor.elementsToHTMLString(elements)
          this.pmEditor.pasteHTML(htmlString)
        })
      }
      catch(err) {
        if(err instanceof EmbedTooLargeError) {
          console.warn(err.message)
          return
        }
        else {
          throw err
        }
      }
      return false
    }
  }

  get windowListeners(): Partial<Record<keyof WindowEventMap, any>> {
    return {
      "beforeprint": () => this.printing = true,
      "afterprint": () => this.printing = false
    }
  }  

  transformPastedHTML = (html: string) => {
    return html.replaceAll(/style=["']?((?:.(?!["']?\s+(?:\S+)=|\s*\/?[>"']))+.)["']?/g, "")
  }

	CoreEditor = () => {
		return html`
			<pm-editor
				id="main"
        bundleID=${this.bundleID}
				@update=${this.handleUpdate}
				.scrollMargin=${20}
				scrollThreshold=${20}
				placeholder=${this.showTextPlaceholder && !this.previewing? msg("Enter content here..."): ""}
				.state=${this.editorState}
				.nodeViews=${this.nodeViews}
				.markViews=${this.markViews}
				.handleKeyDown=${this.handleKeyDown}
				.decorations=${this.decorations}
				.contentScript=${this.bundleJS}
				.contentStyle=${this.bundleCSS}
				.shouldBeEditable=${this.shouldBeEditable}
				.handleDOMEvents=${this.handleDOMEvents}
        .transformPastedHTML=${this.transformPastedHTML}
        .windowListeners=${this.windowListeners}>
			</pm-editor>
		`
	}

  CodeEditor = () => {
    return html`<cm-editor
      .state=${this.codeState}
      .extensions=${CODEMIRROR_EXTENSIONS}
      @change=${(e: any) => this.app.store.document.setCodeState(e.target.state)}
    ></cm-editor>`
  }

	pendingBlur: number

	@property({type: Boolean, state: true})
	forceToolboxPopup: boolean | null = null

	get toolboxMode(): "popup" | "right" | "hidden" {
		const {isInNarrowLayout, hasNonEmptySelection, isWidgetSelected, forceToolboxPopup, isTextSelected} = this
		if(isInNarrowLayout && (forceToolboxPopup)) return "popup"
		else if(!isInNarrowLayout) return "right"
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
			padding: "12px",
			boxShadow: "var(--sl-shadow-medium)",
      transition: "top 0.1s, left 0.1s"
		}
		else if(toolboxMode === "right") return {
			position: "fixed",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
      transition: "top 0.1s, left 0.1s",
      willChange: "left, top"
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
        .app=${this.app}
        .editorState=${this.editorState}
        class=${this.toolboxMode}
				style=${styleMap(this.toolboxStyle)}
				tabindex="-1"
				.activeElement=${activeElement}
				@ww-delete-widget=${(e: any) => this.deleteWidget(e.detail.widget)}
				@ww-mark-field-input=${(e: any) => {
					const {from, to} = this.editorState.selection
					const markType = this.editorState.schema.marks[e.detail.markType]
					const {key, value} = e.detail
					const tr = this.editorState.tr
						.removeMark(from, to, markType)
						.addMark(from, to, markType.create({[key]: value}))
					this.pmEditor.dispatch(tr)
				}}
        @ww-remove-mark=${(e: any) => {
          this.exec(removeMark(e.detail.markType))
        }}
        @ww-hover-breadcrumb=${(e: any) => {
          
        }}
        @ww-click-breadcrumb=${(e: any) => {
          console.log("select")
          this.selectElementInEditor(e.detail.element)
        }}
				@ww-mouse-enter-delete-widget=${(e: CustomEvent) => this.deletingWidget = e.detail.widget}
				@ww-mouse-leave-delete-widget=${(e: CustomEvent) => this.deletingWidget = null}
				@ww-click-name=${(e: CustomEvent) => {
					this.activeElement?.scrollIntoView({behavior: "smooth", block: "center"})
					!e.detail.widget? this.pmEditor?.focus(): e.detail.widget.focus()
				}}
        @ww-set-attribute=${(e: CustomEvent) => this.setNodeAttribute(e.detail.el, e.detail.key, e.detail.value, e.detail.tag)}
			></ww-toolbox>
		`
	}

	Palette = () => {
		return html`
			<ww-palette
        .app=${this.app}
        .editorState=${this.editorState}
				part="editor-toolbox"
				@ww-insert=${(e: any) => this.insertMember(e.detail.pkgID, e.detail.name)}
				@ww-mousein-widget-add=${(e: CustomEvent) => {
				}}
				@ww-mouseout-widget-add=${() => {
					const previewEl = this.pmEditor.document.querySelector("#ww_preview")
					if(previewEl && this.stateBeforePreview && this.showWidgetPreview) {
						this.pmEditor.updateState(this.stateBeforePreview)
						this.pmEditor.focus()
					}
				}}
        @ww-add-widget=${(e: CustomEvent) => {
          const name = e.detail.name
          this.app.store.packages.add(name)
        }}
        @ww-remove-widget=${(e: CustomEvent) => {
          const name = e.detail.name
          this.app.store.packages.remove(name)
        }}
        @ww-update-widget=${(e: CustomEvent) => {
          const name = e.detail.name
          this.app.store.packages.update(name)
        }}
        @ww-watch-widget=${async (e: CustomEvent) => {
          const name = e.detail.name
          await this.app.store.packages.toggleWatch(name)
          this.app.settings.setAndPersist("packages", "watching", this.app.store.packages.watching)
        }}
				.packages=${this.packages}
				tabindex="-1"
				?showWidgetPreview=${this.showWidgetPreview}
			>
    </ww-palette>
		`
	}

	render() {
		return html`
      <main part="base">
        ${this.app.sourceMode? this.CodeEditor(): [
          this.CoreEditor(),
          this.Toolbox(),
          this.Palette()
        ]}
        <!--<ww-debugoverlay .editorState=${this.editorState} .activeElement=${this.activeElement}></ww-debugoverlay>-->
      </main>
    ` 
	}
}