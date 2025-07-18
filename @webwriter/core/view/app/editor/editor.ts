import {LitElement, html, css, ReactiveController, CSSResult, PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {customElement, property, query} from "lit/decorators.js"
import { Decoration, EditorView, DecorationSet } from "prosemirror-view"
import { EditorState, Command as PmCommand, NodeSelection, TextSelection, AllSelection, Selection } from "prosemirror-state"
import { Node, Mark, DOMParser, DOMSerializer, ResolvedPos, Fragment} from "prosemirror-model"
import { localized, msg, str } from "@lit/localize"
import {computePosition, shift} from '@floating-ui/dom'
import { undo, redo } from "prosemirror-history"
import {StateCommand as CmCommand, EditorState as CmEditorState} from "@codemirror/state"
import {undo as cmUndo, redo as cmRedo} from "@codemirror/commands"
import { GapCursor } from "prosemirror-gapcursor"
import { ifDefined } from "lit/directives/if-defined.js"

import { WidgetView, nodeViews } from "."
import { CODEMIRROR_EXTENSIONS, EditorStateWithHead, MediaType, Package, removeMark, upsertHeadElement } from "#model"
import { range, roundByDPR, sameMembers, textNodesUnder } from "#utility"
import { App, Toolbox, Palette, ProsemirrorEditor, CodemirrorEditor } from "#view"
import { CellSelection } from "@massifrg/prosemirror-tables-sections"
import { findParentNode, findPositionOfNodeBefore, hasParentNode, isNodeSelection } from "prosemirror-utils"
import { addComment, CommentData, commentView, deleteComment, updateComment } from "#model/schemas/resource/comment.js"

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

  @property({attribute: false})
  changingID = ""

  @property({attribute: false})
  testStatus: any

  executingCommand = false

	exec = (command: PmCommand) => {
    this.executingCommand = true
    try {
      command(this.pmEditor.state, this.pmEditor.dispatch, this.pmEditor as any)
      this.pmEditor.focus()
    }
    catch(err) {
      throw err
    }
    finally {
      this.executingCommand = false
    }
	}

  execInCodeEditor = (command: CmCommand) => command({state: this.cmEditor.state, dispatch: this.cmEditor.dispatch})

	getAvailableWidgetIDs(n=1) {
    const widgetIDs = Array.from(this.pmEditor.body.querySelectorAll(".ww-widget")).map(el => el.id)
    const widgetNumbers = widgetIDs.map(id => parseInt(id.slice(3), 36))
    const floor = Math.max(...widgetNumbers, 0)
		return range(n).map(k => `ww_${(floor + k).toString(36)}`)
	}

  // Check whether inserting fragment at pos violates content constraints
  private checkConstraints(pos: number, fragment: Fragment): boolean {
    // standard constraints: no descendants of same type, no non-textblock descendants except at <body> level 
    const emptyParagraphActive = this.activeElement?.tagName === "P" && !this.activeElement.textContent && !this.activeElement.querySelector(":not(br)")
    const insertPos = Math.max(this.state.selection.anchor + (emptyParagraphActive? -1: 0), 0)
    let domAtInsertPos = this.pmEditor.domAtPos(insertPos, -1).node as HTMLElement
    domAtInsertPos = domAtInsertPos.nodeType === 3? domAtInsertPos.parentNode! as HTMLElement: domAtInsertPos
    // for each ancestor node, check if any part of the fragment would violate the constraints
    return !hasParentNode(ancestor => {
      let violatingDescendant = false
      fragment.descendants(descendant => {
        if(violatingDescendant) {
          return false
        }
        const isInvalidNested = !descendant.isLeaf && !descendant.isTextblock && !ancestor.type.spec.allowContainerNesting
        const isInvalidReflexive = !ancestor.type.spec.allowReflexiveNesting && descendant.type.name === ancestor.type.name
        violatingDescendant = isInvalidNested || isInvalidReflexive
        if(violatingDescendant) {
          return false
        }
      })
      return violatingDescendant
    })(TextSelection.create(this.state.doc, insertPos))
    // if((!nodeType.spec.allowReflexive && domAtInsertPos.closest(tagName)) || hasParentNode(node => !node.isTextblock && !node.type.spec.allowContainerNesting)(TextSelection.create(state.doc, insertPos))) {
  }

  updateWidgetsLang(value: string) {
    this.pmEditor.body.querySelectorAll(".ww-widget").forEach(el => (el as HTMLElement).lang = value)
  }

	insertMember = async (id: string, insertableName: string) => {
    const state = this.pmEditor.state
    const members = this.app.store.packages.getPackageMembers(id)
    let insertedRootPos: number | undefined = undefined
    if(id.endsWith("-snippet") || insertableName.startsWith("./snippets/")) {
      const source = members[insertableName]?.source
      let htmlStr = source
      if(id.endsWith("-snippet")) {
        const sid = Package.fromID(id).name.split("-")[1]
        const snippet = await this.app.store.packages.getSnippet(sid)
        htmlStr = snippet.html
      }
      else if(!source) {
        const url = this.app.store.packages.importMap.resolve(id + insertableName.slice(1) + ".html")
        htmlStr = await (await fetch(url, {headers: {"Accept": "text/html"}})).text()
      }
      // const tagNames = this.app.store.packages.widgetTagNames
      const parser = DOMParser.fromSchema(state.schema)
      const template = this.pmEditor.document.createElement("template")
      template.innerHTML = htmlStr
      // Apply translations if available
      const translations = (JSON.parse(template.content.querySelector("script.snippet-localization")?.innerHTML ?? "null")) as null | Record<`${string}#${string}`, Record<string, string>>
      if(translations) {
        const lang = this.app.store.ui.locale
        const textNodes = textNodesUnder(template.content as any)
        const counts: Record<string, number> = {}
        for(const textNode of textNodes) {
          const text = textNode.textContent!
          counts[text] = (counts[text] ?? 0) + 1
          const translation = translations[`${text}#${counts[text]}`]?.[lang]
          if(translation) {
            textNode.textContent = translation
          }
        }
      }
      /*
      const widgetsInTemplate = Array.from(template.content.querySelectorAll("*")).filter(el => tagNames.includes(el.tagName.toLowerCase()))
      const ids = this.getAvailableWidgetIDs(widgetsInTemplate.length)
      ids.forEach((id, i) => widgetsInTemplate[i].id = id)
      */
      const emptyParagraphActive = this.activeElement?.tagName === "P" && !this.activeElement.textContent && !this.activeElement.querySelector(":not(br)")
      const slice = parser.parseSlice(template.content)
      let tr = this.pmEditor.state.tr.deleteSelection()
      const insertPos = Math.max(tr.selection.anchor - (emptyParagraphActive? 1: 0), 0)
      if(!this.checkConstraints(insertPos, slice.content)) {
        return
      }
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
      this.pmEditor.focus()
      insertedRootPos = widgetPos
    }
    else if(insertableName.startsWith("./widgets/")) {
      const tagName = insertableName.replace("./widgets/", "")
      const nodeName = tagName.replaceAll("-", "_")
      const nodeType = this.pmEditor.state.schema.nodes[nodeName]
      const id = `ww-${crypto.randomUUID()}`
      const node = nodeType.createAndFill({id})
      const state = this.pmEditor.state
      const emptyParagraphActive = this.activeElement?.tagName === "P" && !this.activeElement.textContent && !this.activeElement.querySelector(":not(br)")
      const emptyDoc = this.state.doc.content.size === 0
      const insertPos = Math.max(state.selection.anchor + (emptyParagraphActive? -1: 0), 0)
      if(!this.checkConstraints(insertPos, Fragment.from(node))) {
        return
      }
      let tr = state.tr.insert(insertPos, node!)
      if(this.isGapSelected) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, this.selection.from))
      }
      else if(this.isAllSelected || emptyDoc) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, 0))
      }
      else {
        tr = tr.setSelection(NodeSelection.near(tr.doc.resolve(emptyParagraphActive? insertPos + 2: insertPos)))
      }
      this.pmEditor.dispatch(tr)
      this.pmEditor.focus()
      insertedRootPos = insertPos
    }
    else if(insertableName.startsWith("./themes/")) {
      const old = this.app.store.document.themeName
      const toInsert = id + insertableName.slice(1)
      const value = old === toInsert? "base": toInsert
      const allThemes = this.app.store.packages.allThemes as any
      this.app.store.document.setHead(upsertHeadElement(
        this.state.head$,
        "style",
        {data: {"data-ww-theme": value}},
        this.state.head$.schema.text(allThemes[value].source),
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
    await Promise.race([
      new Promise(r => setTimeout(r)),
      new Promise(r => setTimeout(r, 5000))
    ])
    if(insertedRootPos !== undefined) {
      const insertedRoot = this.pmEditor.nodeDOM(insertedRootPos) as HTMLElement
      if(insertedRoot) {
        this.initializedElements.add(insertedRoot.id)
        insertedRoot.focus()
      }
    }
	}

  insertText(text: string) {
    const tr = this.pmEditor.state.tr
    tr.replaceSelectionWith(this.pmEditor.state.schema.text(text))
    this.pmEditor.dispatch(tr)
    this.pmEditor.focus()
  }

  initializedElements = new Set<string>()

	constructor() {
		super()
		this.classList.add("loading")
	}

	@property({type: Object, attribute: false})
	editorState: EditorStateWithHead

  @property({attribute: false})
  testState: EditorStateWithHead

  get state() {
    return this.testState ?? this.editorState
  }

  set state(value: EditorStateWithHead) {
    if(this.mode === "test") {
      this.testState = value
    }
    else {
      this.editorState = value
    }
  }

  @property({type: Object, attribute: false})
	codeState: CmEditorState

	@property({type: String})
	url: string

	@property({type: Boolean})
	loadingPackages: boolean

  @property({type: Boolean, state: true})
	printing = false

	@property({type: String})
	appendBlockType: string

  #mode: "edit" | "source" | "test" | "preview" = "edit"

  @property({type: String, attribute: true, reflect: true})
  get mode() {
    return this.#mode
  }

  set mode(value) {
    const prev = this.#mode
    if(prev === "preview") {
      this.previewSrc = undefined
      this.loadingPreview = false
    }
    else if(prev === "test") {
      this.app.store.packages.testPkg = undefined
    }
    this.#mode = value
  }

  previewSrc?: string 

  loadingPreview: boolean = false

	@property({type: Boolean, attribute: true})
	showWidgetPreview: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
	controlsVisible: boolean = true

	@property({type: Boolean, attribute: true})
	showTextPlaceholder: boolean = true

	@property({type: String, attribute: false})
	bundleID: string

	@property({type: Number, state: true})
	toolboxX: number

	@property({type: Number, state: true})
	toolboxY: number

	@property({type: Object, state: true})
	deletingWidget: Element | null

	@property({type: Object, state: true})
	stateBeforePreview: EditorState | null = null

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
		return this.state.selection
	}

	get isTextSelected() {
		return this.selection instanceof TextSelection || this.selection instanceof AllSelection
	}

  get isNodeSelected() {
    return this.selection instanceof NodeSelection
  }

	get isWidgetSelected() {
		return this.selection instanceof NodeSelection && this.selection.node.type.spec["widget"]
	}

	get isAllSelected() {
		return this.selection instanceof AllSelection
	}

  get isGapSelected() {
    return this.selection instanceof GapCursor
  }

	get selectionY() {
		return this.pmEditor.coordsAtPos(this.state.selection.anchor).top
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
    this.mode !== "source"
      ? this.exec(undo)
      : this.execInCodeEditor(cmUndo)
  }

  redo() {
    this.mode !== "source"
      ? this.exec(redo)
      : this.execInCodeEditor(cmRedo)
  }

  async pin() {
    const html = this.selectionAsHTML
    await this.app.store.packages.addSnippet({id: 0, html})
    this.editingStatus = undefined
  }

  get selectionAsHTML() {
    const fragment = this.selection.content().content
    const serializer = DOMSerializer.fromSchema(this.state.schema)
    const dom = serializer.serializeFragment(fragment, {document: this.pmEditor.document}) as DocumentFragment
    return Array.from(dom.children).map(child => child.outerHTML).join("\n")
  }

	LinkView = (mark: Mark, view: EditorView, inline: boolean) => {
    const dom = this.pmEditor.document.createElement("a")
    const href = mark.attrs.href
    Object.entries(mark.attrs)
      .filter(([k, v]) => v)
      .forEach(([k, v]) => dom.setAttribute(k, v))
    dom.addEventListener("click", e => {
      e.preventDefault()
      this.mode === "preview" && this.emitOpen(href)
    })
    return {dom}
	}

	private cachedNodeViews: Record<string, any>


	private get nodeViews() {
    const {nodes} = this.state.schema
		const cached = this.cachedNodeViews
		const cachedKeys = Object.keys(cached ?? {})
		const widgetKeys = Object.entries(nodes)
			.filter(([_, v]) => v.spec["package"])
			.map(([k, _]) => k)
    const nodeKeys = Object.keys(nodeViews)
      .filter(k => k !== "_" && k !== "_widget")
    const elementKeys = Object.entries(nodes)
      .map(([k, _]) => k)
      .filter(k => k !== "text" && !widgetKeys.includes(k) && !nodeKeys.includes(k))
		if(sameMembers([...elementKeys, ...nodeKeys, ...widgetKeys], cachedKeys)) {
			return cached
		}
		else {
      const elementViewEntries = elementKeys.map(k => [k, (node: Node, view: EditorViewController, getPos: () => number) => new nodeViews._(node, view, getPos)])
      const nodeViewEntries = nodeKeys.map(k => [
        k,
        (node: Node, view: EditorViewController, getPos: () => number) => new (nodeViews as any)[k](node, view, getPos),
      ])
      const widgetViewEntries = widgetKeys
      .map(key => [key, (node: Node, view: EditorViewController, getPos: () => number) => new WidgetView(node, view, getPos, this)])
			this.cachedNodeViews = Object.fromEntries([...elementViewEntries, ...nodeViewEntries, ...widgetViewEntries])
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
				link: this.LinkView,
        _comment: commentView
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
        overflow: hidden;
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
        overflow-y: scroll;
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

      @media only screen and (min-width: 1130px) {
        ww-toolbox::part(close-button) {
          display: none;
        }
			}

			@media only screen and (max-width: 1380px) {
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

			@media only screen and (min-width: 1381px) {
				ww-palette {
          padding-left: 5px;
					grid-column: 2;
					grid-row: 1;
          height: fit-content;
				}

        ww-toolbox {
          background: transparent;
        }

        ww-toolbox[testmode] {
            height: 100%;
        }

			}

      @media only print {
        ww-palette, ww-toolbox {
          display: none !important;
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

	focus(options?: Parameters<HTMLElement["focus"]>[0]) {
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
  editingStatus: undefined | "copying" | "cutting" | "deleting" | "inserting" | "pasting" | "pinning" | "commenting"

	decorations = (state: EditorState) => {
    const {from, to, $from} = state.selection
    const decorations = [] as Decoration[]
    state.doc.descendants((node, pos, parent, index) => {
      const name = node.type.name
      const selectionEndsInNode = pos <= to && to < pos + node.nodeSize
      const selectionStartsInNode = pos < from && from <= pos + node.nodeSize
      const selectionWrapsNode = from <= pos && pos + node.nodeSize <= to
      const deletingPos = this.deletingWidget? this.pmEditor.posAtDOM(this.deletingWidget, 0) - 1: -1
      const isSelectedInner = selectionWrapsNode && this.isTextSelected
      const isSelectedNode = state.selection instanceof NodeSelection && state.selection.node === node
      const textLikeSelectionInside = (state.selection instanceof TextSelection || state.selection instanceof GapCursor) && selectionStartsInNode && selectionEndsInNode
      if(isSelectedNode || isSelectedInner && node.type.spec.selectable || textLikeSelectionInside) {
        const classes = [
          textLikeSelectionInside && "ww-selected-text-within",
          isSelectedInner && "ww-selected-inner",
          isSelectedNode && "ww-selected"
        ].filter(cls => cls)
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: classes.join(" ")}))
        this.editingStatus && decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: `ww-${this.editingStatus}`}))
      }
      if(node.isInline || name === "_phrase") {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-inline"}))
      }
      if(this.printing) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, {class: "ww-beforeprint"}))
      }
      if(["picture", "audio", "video", "iframe"].includes(node.type.name)) {
        decorations.push(Decoration.widget(pos, (view, getPos) => {
          let el: HTMLElement | undefined = undefined
          // Fix this crutch
          try {
            el = view.nodeDOM(pos) as HTMLElement
          }
          catch(err) {}
          const extraDiv = view.dom.ownerDocument.createElement("div")
          extraDiv.classList.add("ww-nodeview")
          if(isSelectedNode || isSelectedInner) {
            this.editingStatus && extraDiv.classList.add(`ww-${this.editingStatus}`)
            isSelectedInner && extraDiv.classList.add("ww-selected-inner")
          }
          extraDiv.style.display = "block"
          extraDiv.style.position = "fixed"
          extraDiv.style.zIndex = "2147483647"
          extraDiv.style.pointerEvents = view.state.selection instanceof NodeSelection && view.state.selection.from === pos? "none": "auto"
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
          this.pmEditor.document?.addEventListener("scroll", () => {
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
    if(this.mode === "test") {
      if(!this.state.selection.eq(this.pmEditor.state.selection)) {
        this.handleSelectionChange()
      }
      this.testState = this.pmEditor.state as EditorStateWithHead
    }
    else {
      if(!this.state.selection.eq(this.pmEditor.state.selection)) {
        this.handleSelectionChange()
      }
      this.state = this.pmEditor.state as EditorStateWithHead
    }
    this.dispatchEvent(new Event("change"))
		this.updatePosition()
	}

  protected updated(changed: PropertyValues): void {
    if(changed.has("editingStatus") || changed.has("editorState") || changed.has("testState")) {
      this.updateDocumentElementClasses()
    }
  }

	get isInNarrowLayout() {
		return document.documentElement.offsetWidth <= 1129
	}

  get isInWideLayout() {
    return document.documentElement.offsetWidth > 1380
  }

  get shiftPaddingStyling() {
    return this.isInWideLayout
      ? 27
      : 34 + Math.max(0, document.documentElement.offsetWidth - 1130)
  }

	get activeElement(): HTMLElement | null {
			const {selection} = this
      if(!this.pmEditor || this.pmEditor.isDestroyed) {
        return null
      }
      if(selection instanceof GapCursor) {
        return this.pmEditor?.body?.querySelector(".ProseMirror-gapcursor") ?? null
      }
      else if(selection instanceof AllSelection) {
        return this.pmEditor.body
      }
      else if(selection instanceof CellSelection) {
        return this.pmEditor.domAtPos(selection.$anchorCell.pos, 0)?.node as HTMLElement
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
    const serializer = this.pmEditor.clipboardSerializer ?? DOMSerializer.fromSchema(this.state.schema)
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
    const tr = this.state.tr.deleteSelection()
    this.pmEditor.dispatch(tr)
  }

  cut() {
    this.copy()?.then(() => this.delete())
  }

  paste() {
    this.insertMember("@webwriter/core", "clipboard")
  }


	get activeNode(): Node | null {
		return this.getActiveNodeInState(this.state)
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
    if(!this.selection || !this.activeElement || !docEl || !iframeEl || !this.toolbox || !this.state.doc.content.size) {
      return
    }
		else if(mode === "popup") {
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
		else if(mode === "right") {
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
      if(this.app.store.ui.stickyToolbox) {
        this.positionStyle = css`
          body {
            --ww-toolbox-action-x: ${this.toolboxX - iframeOffsetX + 10}px;
            --ww-toolbox-action-y: ${this.toolboxY + this.toolboxHeight - iframeOffsetY}px;
            --ww-toolbox-action-width: ${docWidth - rightEdge - 40}px;
            --ww-toolbox-action-height: ${docHeight + -this.toolboxY + -this.toolboxHeight}px
          }
        `
      }
      else {
        const toolboxX = this.toolbox.offsetLeft
        const toolboxY = this.toolbox.offsetTop
        const toolboxWidth = this.toolbox.offsetWidth
        this.positionStyle = css`
          body {
            --ww-toolbox-action-x: ${toolboxX + 10}px;
            --ww-toolbox-action-y: ${toolboxY + this.toolboxHeight}px;
            --ww-toolbox-action-width: ${toolboxWidth - 20}px;
            --ww-toolbox-action-height: ${docHeight + -toolboxY + -this.toolboxHeight - 20}px
          }
        `
      }
		}
  }

  set positionStyle(value: CSSResult) {
    const styles = value instanceof CSSResult? value.cssText: value
    this.pmEditor.document.adoptedStyleSheets = this.pmEditor.document.adoptedStyleSheets.filter(sheet => sheet !== this.positionStylesheet)
    this.positionStylesheet = new this.pmEditor.window.CSSStyleSheet()
    this.positionStylesheet.replaceSync(styles)
    this.pmEditor.document.adoptedStyleSheets.push(this.positionStylesheet)
  }

  set rootElementStyle(value: Record<string, string>) {
    this.rootElementStyle = {...this.#rootElementStyle, ...value}
    const props = Object.entries(this.rootElementStyle).map(([p,v])=>`${p}: ${v}`).join(";")
    const styles = `html { ${props} }`
    this.pmEditor.document.adoptedStyleSheets = this.pmEditor.document.adoptedStyleSheets.filter(sheet => sheet !== this.positionStylesheet)
    this.positionStylesheet = new this.pmEditor.window.CSSStyleSheet()
    this.positionStylesheet.replaceSync(styles)
    this.pmEditor.document.adoptedStyleSheets.push(this.positionStylesheet)
  }

  #rootElementStyle: Record<string, string> = {}

  positionStylesheet: CSSStyleSheet

	autoUpdateElement: {element: Element, cleanup: () => void} | null = null

  /*
  protected willUpdate(changed: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.willUpdate(changed)
		const elementNotAuto = this.autoUpdateElement?.element !== this.activeElement
    if(this.activeElement && changed.has("editorState") && elementNotAuto && this.activeElement !== this.pmEditor.body) {
			this.forceToolboxPopup = null
			this.autoUpdateElement?.cleanup()
			this.autoUpdateElement = {
				element: this.activeElement,
				cleanup: autoUpdate(this.pmEditor.body, this.toolbox, () => this.updatePosition(), {animationFrame: false})
			}
    }
  }*/

  connectedCallback(): void {
    super.connectedCallback()
    for(const [name, callback] of Object.entries(this.globalListeners)) {
      window.addEventListener(name, callback)
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
	  this.autoUpdateElement?.cleanup()
	  this.autoUpdateElement = null
  }

  shouldBeEditable = (state: EditorState) => !this.ownerDocument.fullscreenElement

  setHeadingLevel(el: HTMLHeadingElement, level: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
    this.exec((state, dispatch, view) => {
      if(!["h1", "h2", "h3", "h4", "h5", "h6"].includes(state.selection.$anchor.node().type.name)) {
        return false
      }
      const pos = view!.posAtDOM(el, 0) - 1
      const type = state.schema.nodes[level]
      dispatch && dispatch(this.state.tr.setNodeMarkup(pos, type))
      return true
    })
  }

  setNodeAttribute(el: HTMLElement, key: string, value?: string | boolean, tag?: string) {
    this.exec((state, dispatch, view) => {     
      const pos = this.pmEditor.posAtDOM(el, 0, 1) - 1
      const resolved = state.doc.resolve(pos)
      const node = resolved.nodeAfter ?? resolved.nodeBefore
      const builtinAttr = key in (state.schema.nodes[node!.type.name].spec.attrs ?? {})
      const dataAttr = key.startsWith("data-")
      let v = value
      if(value === true) {
        v = ""
      }
      else if(value === false) {
        v = undefined
      }
      let tr = state.tr
      if(builtinAttr) {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, [key]: v}
        )
        // tr.setNodeAttribute(pos, key, v)
      }
      else if(dataAttr) {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, data: {...node!.attrs.data, [key]: v}}
        )
      }
      else {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, _: {...node!.attrs._, [key]: v}}
        )
      }
      this.pmEditor.dispatch(tr)
      this.pmEditor.focus()
      return true
    })
  }

  addComment() {
    this.exec(addComment())
  }

  updateComment(id: string, change: Partial<CommentData>, i=0) {
    this.exec(updateComment(id, change, i))
  }

  deleteComment(id: string, i=0) {
    this.exec(deleteComment(id, i))
  }

  get firstEditorElement() {
    return this.pmEditor.body.firstElementChild
  }

  get lastEditorElement() {
    return Array.from(this.pmEditor.body.children).filter(el => !el.matches(".ProseMirror-widget")).at(-1)
  } 

  coordsToSelection(top: number, left: number): Selection | null {
    // If in margin between nodes, make a GapCursor
    // Else if at edge of inline node, cycle inside/outside of node
    // Else use default behavior

    if(!this.state.doc.content.size) {
      return new AllSelection(this.state.doc)
    }
    const {pos, inside} = this.pmEditor?.posAtCoords({top, left}) ?? {}
    if(pos === undefined) {
      return null
    }
    const $pos = this.state.doc.resolve(pos)
    /*
    const {top: firstTop} = (this.pmEditor.nodeDOM(0) as HTMLElement)?.getBoundingClientRect() ?? {}
    const lastPos = this.editorState.doc.content.size - (this.editorState.doc.lastChild?.nodeSize ?? 0)
    const lastSize = this.editorState.doc.lastChild?.nodeSize ?? 0
    const {bottom: lastBottom} = (this.pmEditor.nodeDOM(lastPos) as HTMLElement)?.getBoundingClientRect() ?? {}
    if(top < firstTop) {
      return new GapCursor(this.editorState.doc.resolve(0))
    }
    else if(top > lastBottom) {
      return new GapCursor(this.editorState.doc.resolve(lastPos + lastSize))
    }*/
    const nodeBefore = $pos.nodeBefore? this.pmEditor.nodeDOM(pos - $pos.nodeBefore.nodeSize): null
    const nodeAfter = this.pmEditor.nodeDOM(pos)
    const parent = $pos.node()
    const beforeNotElement = !(nodeBefore instanceof this.pmEditor.window.Element) && nodeBefore !== null
    const afterNotElement = !(nodeAfter instanceof this.pmEditor.window.Element) && nodeAfter !== null
    const betweenEmpty = (!nodeBefore || nodeBefore?.nodeName === "P" && !nodeBefore.textContent) && (!nodeAfter || nodeAfter?.nodeName === "P" && !nodeAfter.textContent)
    if(parent.isTextblock || beforeNotElement || afterNotElement || betweenEmpty) {
      return parent.isTextblock? TextSelection.near($pos): null
    }
    const beforeBottom = nodeBefore? nodeBefore.getBoundingClientRect().bottom: 0
    const afterTop = nodeAfter? nodeAfter.getBoundingClientRect().top: Infinity
    const {top: lastTop} = this.pmEditor.coordsAtPos(this.state.doc.nodeSize - 2)
    if(top > lastTop) {
      return new GapCursor(this.state.doc.resolve(this.state.doc.nodeSize - 2))
    }
    else if(beforeBottom < top && top < afterTop) {
      return new GapCursor($pos)
    }
    else {
      return TextSelection.near($pos)
    }
  }

  nextSelection(backwards=false): Selection | null {
    const $pos = backwards? this.state.selection.$from: this.state.selection.$to
    if($pos.parentOffset === (backwards? 0: $pos.node().nodeSize - 2) && !(this.state.selection instanceof GapCursor)) {
      const $nextPos = this.state.doc.resolve(backwards? Math.max($pos.pos - 1, 0): Math.min($pos.pos + 1, this.state.doc.nodeSize - 2))
      return new GapCursor($nextPos)
    }
    else {
      return null
    }
  }

  gapDragSelectionAnchor?: number

  handleDOMEvents = {
    "keydown": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
      if(ev.key === "Escape") {
        this.pmEditor.document.exitFullscreen()
      }
      else if(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key) && !ev.shiftKey && !this.activeElement?.closest("table")) {
        const sel = this.nextSelection(["ArrowLeft", "ArrowUp"].includes(ev.key))
        if(sel && !sel.eq(this.state.selection)) {
          const tr = this.state.tr.setSelection(sel).scrollIntoView()
          this.pmEditor.dispatch(tr)
          ev.preventDefault()
          return false
        }
        else {
          return false
        }
      }
      else if(this.selection instanceof NodeSelection && this.selection.node.type.spec.widget && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault()
        return true
      }
    },
    "keyup": (_: any, ev: KeyboardEvent) => {
      this.dispatchEvent(new KeyboardEvent(ev.type, ev))
    },
    "drag": (_: any, ev: Event) => {

    },
    "selectstart": (_: any, ev: Event) => {
      return false
      if(this.selection instanceof GapCursor && ev.target !== this.pmEditor.body && ev.target === this.lastEditorElement) {
        const selection = new TextSelection(this.editorState.doc.resolve(this.editorState.doc.nodeSize - 2))
        const tr = this.editorState.tr.setSelection(selection)
        this.pmEditor.dispatch(tr)
        return false
      }
    },

    "mouseup": (_: any, ev: MouseEvent) => {
      this.gapDragSelectionAnchor = undefined
    },
    /*"mousemove": (_: any, ev: MouseEvent) => {
      const isInGapSelection = this.selection instanceof GapCursor
      console.log("mousemove", ev.buttons, isInGapSelection)
      if(isInGapSelection && ev.buttons === 1) {
        const sel = TextSelection.near(this.selection.$anchor)
        const tr = this.editorState.tr.setSelection(sel)
        this.pmEditor.dispatch(tr)
      }
    },*/
    "mousemove": (_: any, ev: MouseEvent) => {
      if(this.gapDragSelectionAnchor !== undefined) {
        const {pos} = this.pmEditor.posAtCoords({left: ev.x, top: ev.y}) ?? {}
        const isAtEnd = this.gapDragSelectionAnchor >= this.state.doc.nodeSize - 2
        const {top: lastTop} = this.pmEditor.coordsAtPos(this.state.doc.nodeSize - 2)
        if(pos !== undefined && pos !== this.gapDragSelectionAnchor) {
          try {
            const endPos = TextSelection.create(this.state.doc, pos)
            const {node: tableNode} = findParentNode(node => node.type.name === "table")(TextSelection.create(this.state.doc, Math.min(this.gapDragSelectionAnchor, this.state.doc.nodeSize - 2))) ?? {}
            if(tableNode) {
              return false
            }
            else if(ev.y > lastTop && isAtEnd) {
              const sel = new GapCursor(this.state.doc.resolve(this.state.doc.nodeSize - 2))
              const tr = this.state.tr.setSelection(sel)
              this.pmEditor.dispatch(tr)
            }
            else if(!findParentNode(node => ["math", "math_inline"].includes(node.type.name))(endPos) && !(["math", "math_inline"].includes(endPos.$anchor.nodeAfter?.type.name as any))) {
              const sel = TextSelection.create(this.state.doc, Math.min(this.gapDragSelectionAnchor, this.state.doc.nodeSize - 2), pos)
              const tr = this.state.tr.setSelection(sel)
              this.pmEditor.dispatch(tr)
            }
          }
          catch(err) {
            console.error(err)
          }
        }
      }
    },
    "mousedown": (_: any, ev: MouseEvent) => {
      if(ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) {
        return false
      }
      else if(ev.button !== 0) {
        return true
      }
      else if(ev.detail === 1) {
        const sel = this.coordsToSelection(ev.y, ev.x)
        if(!sel) {
          return true
        }
        // const {node: maybeOldTableNode} = findParentNode(node => node.type.name === "table")(this.selection) ?? {}
        const {node: maybeNewTableNode} = sel? findParentNode(node => node.type.name === "table")(sel) ?? {}: {}
        const {node: maybeMathNode} = sel? findParentNode(node => node.type.name === "math_inline" || node.type.name === "math")(sel) ?? {}: {}
        if(maybeMathNode) {
          return false
        }
        if(maybeNewTableNode && !(this.selection instanceof CellSelection) && !(this.selection instanceof GapCursor) && !(this.selection instanceof NodeSelection)) {
          return false
        }
        else if(sel instanceof AllSelection) {
          const tr = this.state.tr.setSelection(sel)
          this.pmEditor.dispatch(tr)
          this.pmEditor.focus()
          ev.preventDefault()
          return true
        }
        else if(sel) {
          if(!(sel instanceof GapCursor) && (findParentNode(node => ["math", "math_inline"].includes(node.type.name))(sel) || (["math", "math_inline"].includes(sel.$anchor.nodeAfter?.type.name as any)))) {
            for(let i = 1; i < sel.$anchor.depth; i++) {
              if(["math", "math_inline"].includes(sel.$anchor.node(i).type.name)) {
                const newSel = NodeSelection.create(this.state.doc, sel.$anchor.before(i))
                const tr = this.state.tr.setSelection(newSel)
                this.pmEditor.dispatch(tr)
              }
            }
            ev.preventDefault()
            return true
          }
          this.gapDragSelectionAnchor = sel.anchor
          const tr = this.state.tr.setSelection(sel)
          this.pmEditor.dispatch(tr)
          this.pmEditor.focus()
          ev.preventDefault()
          return true
        }
      }
      else if(ev.detail === 2 && !this.isGapSelected) {
        return false
      }
      else if(ev.detail === 3 && !this.isGapSelected) {
        return false
      }
      else {
        return true
      }
    },
    "ww-widget-click": (_: any, ev: CustomEvent) => {
      // return this.handleDOMEvents["mousedown"](_, ev.detail.relatedEvent)
    },
    "ww-widget-interact": (_: any, ev: CustomEvent) => {
      this.updateDocumentElementClasses(ev.detail.relatedEvent, true,ev.detail.relatedEvent?.metaKey)
    },
    "ww-test-update": (_: any, ev: CustomEvent) => {

    },
    "focus": (_:any, ev: FocusEvent) => {
      ev.preventDefault()
      return true
    },
    /*
    "ww-widget-focus": (_: any, ev: CustomEvent) => {
      ev.detail.widget?.focus()
      /*
      if(this.previewing) {
        ev.detail.widget.focus()
      }
      ev.detail.widget.scrollIntoView({behavior: "smooth", block: "center"})
    },
    "ww-widget-blur": () => {
      // this.activeElement?.blur()
    },
    "ww-widget-click": (_: any, ev: CustomEvent) => {
      const {widget} = ev.detail
      // widget.focus()
     widget.focus()
    },
    "blur": (_:any, ev: FocusEvent) => {
      const node = ev.target as HTMLElement
      const relatedNode = ev.relatedTarget as HTMLElement | null
      const isInternal = node.contains(relatedNode) || (relatedNode?.contains(node) ?? false)
      /*
      this.pendingBlur !== null && window.clearTimeout(this.pendingBlur)
      this.pendingBlur = window.setTimeout(() => this.activeElement = null, 100)
    },*/
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
      media.setAttribute("data-filename", (blob as any).name)
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
    script.setAttribute("data-filename", (blob as any).name)
    return script
  }

  private static createEmbedElement(blob: Blob) {
    const embed = document.createElement("embed")
    embed.src = URL.createObjectURL(blob)
    embed.type = blob.type
    embed.setAttribute("data-filename", (blob as any).name)
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

  selectElementInEditor(el: HTMLElement) {
    let selection
    if(el.tagName === "BODY" || el.tagName === "HTML") {
      selection = new AllSelection(this.pmEditor.state.doc)
    }
    else {
      const pos = Math.max(this.pmEditor.posAtDOM(el, 0) - (el.tagName.includes("-") && !el.children.length? 0: 1), 0)
      selection = NodeSelection.create(this.pmEditor.state.doc, pos)
    }
    this.pmEditor.dispatch(this.pmEditor.state.tr.setSelection(selection))
    this.pmEditor.focus()
    el.focus()
    // this.updateDocumentElementClasses()
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
        console.warn(str`File ${(blob as any).name} is larger than 10MB. It is not recommended to embed files this large.`)
      }
      
      if(blob.size > 20e+8) {
        throw new EmbedTooLargeError(`File ${(blob as any).name} is larger than 2GB. Files larger than 2GB can not be embedded.`)
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

  windowListeners: Partial<Record<keyof WindowEventMap | "test-update", any>> = {
    "beforeprint": () => this.printing = true,
    "afterprint": () => this.printing = false,
    "mouseup": () => this.gapDragSelectionAnchor = undefined,
    "test-update": (e: any) => this.app.store.packages.processTestUpdate(e.detail)
  }

  globalListeners: Partial<Record<keyof WindowEventMap, any>> = {
    "keydown": (e: any) => this.updateDocumentElementClasses(e, undefined, false),
    "keyup": (e: any) => this.updateDocumentElementClasses(e, true, false),
    "mouseup": (e: any) => this.updateDocumentElementClasses(e),
    "mousedown": (e: any) => this.updateDocumentElementClasses(e),
    "resize": () => {this.requestUpdate(); this.updatePosition()},
    "focus": (e: any) => this.updateDocumentElementClasses(e, true)
  }

  updateDocumentElementClasses = (e?: KeyboardEvent | MouseEvent, removeOnly=false, ignoreKbd=true) => {
    if(this.mode === "preview" || this.mode === "source" || !this.pmEditor?.documentElement) {
      return
    }
    const toRemove = [
      !e?.ctrlKey && !ignoreKbd && "ww-key-ctrl",
      !e?.altKey && !ignoreKbd && "ww-key-alt",
      !e?.shiftKey && !ignoreKbd && "ww-key-shift",
      !e?.metaKey && !ignoreKbd && "ww-key-meta",
      !this.isAllSelected && "ww-all-selected",
      !this.app.store.document.empty && "ww-empty",
      this.editingStatus !== "copying" && `ww-copying`,
      this.editingStatus !== "cutting" && `ww-cutting`,
      this.editingStatus !== "deleting" && `ww-deleting`,
      this.editingStatus !== "inserting" && `ww-inserting`,
      this.editingStatus !== "pinning" && `ww-pinning`,
      this.editingStatus !== "commenting" && `ww-commenting`
    ].filter(k => k) as string[]
    const toAdd = [
      e?.ctrlKey && "ww-key-ctrl",
      e?.altKey && "ww-key-alt",
      e?.shiftKey && "ww-key-shift",
      e?.metaKey && "ww-key-meta",
      this.isAllSelected && "ww-all-selected",
      this.app.store.document.empty && "ww-empty",
      this.editingStatus && `ww-${this.editingStatus}`
    ].filter(k => k) as string[]
    toRemove.length && this.pmEditor?.documentElement.classList.remove(...toRemove)
    !removeOnly && toAdd.length && this.pmEditor?.documentElement.classList.add(...toAdd)
  }

  transformPastedHTML = (html: string) => {
    return html.replaceAll(/style=["']?((?:.(?!["']?\s+(?:\S+)=|\s*\/?[>"']))+.)["']?/g, "")
  }

  handleEditorInitialized = (e: CustomEvent) => {
    if(e.detail?.first) {
      this.handleEditorFocus()
    }
    this.updatePosition()
  }

  handleEditorFocus = () => {
    this.editingStatus = undefined
  }

  handleSelectionChange = () => {
    this.toolbox && this.toolbox.activeLayoutCommand?.id !== "_comment" && (this.toolbox.activeLayoutCommand = undefined)
    this.toolbox && (this.toolbox.childrenDropdownActiveElement = null)
    this.toolbox && (this.toolbox.activeEmojiInput = false)
    this.palette && (this.palette.managing = false)
    this.editingStatus = undefined
  }

  handleDoubleClick = (view: EditorView, pos: number, e: MouseEvent) => {
    if(this.selection instanceof GapCursor) {
      e.preventDefault()
    }
  }

  handleTripleClick = (view: EditorView, pos: number, e: MouseEvent) => {
    e.preventDefault()
    return true
  }

  createSelectionBetween(view: EditorView, anchor: ResolvedPos, head: ResolvedPos) {
  }

	CoreEditor = () => {
		return html`
			<pm-editor
				id="main"
        url=${ifDefined(this.previewSrc)}
        .bundleID=${this.bundleID}
				@update=${this.handleUpdate}
        @focus=${this.handleEditorFocus}
        @fullscreenchange=${() => this.requestUpdate()}
        @ww-initialized=${this.handleEditorInitialized}
				.scrollMargin=${20}
				scrollThreshold=${20}
				.state=${this.state}
        .importMap=${this.mode === "test"? this.app.store.packages.testImportMap: this.app.store.packages.importMap}
				.nodeViews=${this.nodeViews}
				.markViews=${this.markViews}
				.handleKeyDown=${this.handleKeyDown}
        .handleDoubleClick=${this.handleDoubleClick}
        .handleTripleClick=${this.handleTripleClick}
				.decorations=${this.decorations}
				.shouldBeEditable=${this.shouldBeEditable}
				.handleDOMEvents=${this.handleDOMEvents}
        .transformPastedHTML=${this.transformPastedHTML}
        .windowListeners=${this.windowListeners}
        .preventedShortcuts=${this.app.commands.preventedShortcuts}>
			</pm-editor>
		`
	}

  CodeEditor = () => {
    if(!this.codeState) {
      return null
    }
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
		const {isInNarrowLayout, forceToolboxPopup} = this
    const isFullscreen = this.pmEditor?.isFullscreen
		if((isInNarrowLayout || isFullscreen) && forceToolboxPopup) return "popup"
		else if(!isInNarrowLayout) return "right"
		else return "hidden"
	}

	get toolboxStyle(): Parameters<typeof styleMap>[0] {
		const {toolboxMode} = this
    if(!this.app.store.ui.stickyToolbox && toolboxMode === "right") return {
      gridColumn: "6",
      gridRow: "1/3",
      width: "auto",
      justifySelf: "start",
      alignSelf: "start"
    }
		else if(toolboxMode === "popup") return {
			position: "absolute",
			left: `${this.toolboxX ?? 40}px`,
			top: `${this.toolboxY ?? 20}px`,
			border: "1px solid lightgray",
			padding: "12px",
			boxShadow: "var(--sl-shadow-medium)",
      transition: "top 0.1s, left 0.1s"
		}
		else if(toolboxMode === "right") return {
			position: "fixed",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`,
      transition: "top 0.1s"
		}
		else return {
			display: "none",
			left: `${this.toolboxX}px`,
			top: `${this.toolboxY}px`
		}
	}

  get topLevelElementsInSelection() {
    if(this.selection instanceof NodeSelection) {
      return [this.activeElement!]
    }
    const result = [] as HTMLElement[]
    this.selection.content().content.descendants((node, pos) => {
      const el = this.pmEditor.nodeDOM(pos) as HTMLElement
      result.push(el)
      return false
    })
    return result
  }

  prefetchAllMembers(name: string, id: string) {
    if(!this.app.store.packages.installedPackages.includes(id) || this.mode !== "edit") {
      return
    }
    const members = this.app.store.packages.getPackageMembers(id)
    const ids = Object.keys(members).filter(k => k.startsWith("./snippets/")).map(relPath => id + relPath.slice(1) + ".html")
    const urls = ids.map(id => this.app.store.packages.importMap.resolve(id))
    return Promise.allSettled(urls.map(url => fetch(url)))
  }

	Toolbox = () => {
		const {activeElement} = this
    
		if(this.toolboxMode === "popup" && !this.toolboxX && !this.toolboxY) {
			this.updatePosition()
		}
		return html`
			<ww-toolbox
        .app=${this.app}
        .editorState=${this.state}
        class=${this.toolboxMode}
				style=${styleMap(this.toolboxStyle)}
				.activeElement=${activeElement}
        .shiftPaddingStyling=${this.shiftPaddingStyling}
        .testMode=${this.mode === "test"}
        .testStatus=${this.app.store.packages.testStatus}
				@ww-delete-widget=${(e: any) => this.deleteWidget(e.detail.widget)}
        @sl-after-open=${() => this.requestUpdate()}
				@ww-mark-field-input=${(e: any) => {
					const {from, to} = this.state.selection
					const markType = this.state.schema.marks[e.detail.markType]
					const {key, value} = e.detail
					const tr = this.state.tr
						.removeMark(from, to, markType)
						.addMark(from, to, markType.create({[key]: value}))
					this.pmEditor.dispatch(tr)
				}}
        @ww-remove-mark=${(e: any) => {
          this.exec(removeMark(e.detail.markType))
        }}
        @ww-click-breadcrumb=${(e: any) => {
          this.selectElementInEditor(e.detail.element)
        }}
				@ww-click-name=${(e: CustomEvent) => {
					this.activeElement?.scrollIntoView({behavior: "smooth", block: "center"})
					!e.detail.widget? this.pmEditor?.focus(): e.detail.widget.focus()
				}}
        @ww-close=${(e: CustomEvent) => {
          this.forceToolboxPopup = false
        }}
        @ww-set-attribute=${(e: CustomEvent) => this.setNodeAttribute(e.detail.el, e.detail.key, e.detail.value, e.detail.tag)}
        @ww-set-heading-level=${(e: CustomEvent) => this.setHeadingLevel(e.detail.el, e.detail.level)}
        @ww-set-style=${(e: CustomEvent) => {
          this.topLevelElementsInSelection.forEach(el => Object.assign(el.style, e.detail.style))
          // this.pmEditor.focus()
        }}
        @ww-insert-text=${(e: any) => this.insertText(e.detail.text)}
        @ww-add-comment=${(e: any) => this.addComment()}
        @ww-update-comment=${(e: any) => this.updateComment(e.detail.id, e.detail.change, e.detail.i)}
        @ww-delete-comment=${(e: any) => this.deleteComment(e.detail.id, e.detail.i)}
			></ww-toolbox>
		`
	}

	Palette = () => {
		return html`
			<ww-palette
        .forceToolboxPopup=${!!this.forceToolboxPopup}
        ?isInNarrowLayout=${this.isInNarrowLayout}
        .loading=${this.loadingPackages}
        .testMode=${this.mode === "test"}
        .changingID=${this.app.store.packages.changingID}
        .app=${this.app}
        .packageIcons=${this.app.store.packages.packageIcons}
        .editorState=${this.state}
				part="editor-toolbox"
        ?data-no-scrollbar-gutter=${this.palette?.offsetWidth - this.palette?.clientWidth === 0}
				@ww-insert=${(e: any) => this.insertMember(e.detail.pkgID, e.detail.name)}
				@ww-mouseenter-insertable=${(e: CustomEvent) => {
          if(WEBWRITER_ENVIRONMENT.backend !== "tauri") {
            this.prefetchAllMembers(e.detail.name, e.detail.id)
          }
				}}
				@ww-mouseleave-insertable=${() => {

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
          if(WEBWRITER_ENVIRONMENT.backend === "tauri") {
            this.app.settings.setAndPersist("packages", "watching", this.app.store.packages.watching)
          }
        }}
				?showWidgetPreview=${this.showWidgetPreview}
        editingStatus=${ifDefined(this.editingStatus)}
			>
    </ww-palette>
		`
	}

  Main = () => {
    if(this.mode === "edit" || this.mode === "test") {
      return [
        this.CoreEditor(),
        !this.pmEditor?.isFullscreen? this.Toolbox(): null,
        !this.pmEditor?.isFullscreen? this.Palette(): null
      ]
    }
    else if(this.mode === "source") {
      return this.CodeEditor()
    }
    else if(this.mode === "preview") {
      return this.CoreEditor()
    }
  }

	render() {
		return html`
      <main part="base">
        ${this.Main()}
        <!--<ww-debugoverlay .editorState=${this.editorState} .activeElement=${this.activeElement}></ww-debugoverlay>-->
      </main>
    ` 
	}
}