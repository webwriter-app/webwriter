import { LitElement, html, css, PropertyValues, ReactiveController, TemplateResult } from "lit"
import { styleMap } from "lit/directives/style-map.js"
import { customElement, property, query } from "lit/decorators.js"
import { DOMEventMap, EditorProps, EditorView } from "prosemirror-view"
import { localized } from "@lit/localize"
import { EditorState as CmEditorState } from "@codemirror/state"
import { ifDefined } from "lit/directives/if-defined.js"

import { CODEMIRROR_EXTENSIONS, EditorStateWithHead, removeMark } from "#model"
import { App, Toolbox, Palette, ProsemirrorEditor, CodemirrorEditor, DOMEditorComponent } from "#view"
import { EditingController } from "./controllers/editingcontroller"
import { LayoutController } from "./controllers/layoutcontroller"
import { StatusController } from "./controllers/statuscontroller"
import { PmViewController } from "./controllers/pmviewcontroller"
import { SelectionController } from "./controllers/selectioncontroller"
import { chainListeners, handler } from "#utility"
import { guard } from "lit/directives/guard.js"

@localized()
@customElement("ww-explorable-editor")
export class ExplorableEditor extends LitElement {

  readonly controllers = ["editing", "layout", "status", "pmview", "selection"] as const
  readonly editing = new EditingController(this)
  readonly layout = new LayoutController(this)
  readonly status = new StatusController(this)
  readonly pmview = new PmViewController(this)
  readonly selection = new SelectionController(this)

  get activeElement() {
    return this.selection.activeElement
  }

  get exec() {
    return this.editing.exec
  }

  @property({ attribute: false })
  app: App

  @property({ type: Boolean, state: true })
  forceToolboxPopup: boolean | null = null

  @property({ attribute: false })
  changingID = ""

  @property({ type: String, attribute: false })
  bundleID: string

  @property({ attribute: false })
  testStatus: any

  @property({ type: Object, attribute: false })
  editorState: EditorStateWithHead

  @property({ attribute: false })
  testState: EditorStateWithHead

  @property({ type: Object, attribute: false })
  codeState: CmEditorState

  @property({ type: String })
  url: string

  @property({ type: Boolean })
  loadingPackages: boolean

  @property({ type: Boolean, state: true })
  printing = false

  @property({ type: Boolean, attribute: true, reflect: true })
  controlsVisible: boolean = true

  @property({ type: Boolean, attribute: true })
  showTextPlaceholder: boolean = true

  @property({ type: Number, state: true })
  toolboxX: number

  @property({ type: Number, state: true })
  toolboxY: number

  @property({ type: Object, state: true })
  deletingWidget: Element | null

  @property({ attribute: false, state: true })
  editingStatus: undefined | "copying" | "cutting" | "deleting" | "inserting" | "pasting" | "pinning" | "commenting"

  @property({ type: String, attribute: true, reflect: true })
  get mode() {
    return this.#mode
  }

  set mode(value) {
    const prev = this.#mode
    if (prev === "preview") {
      this.previewSrc = undefined
      this.loadingPreview = false
    }
    else if (prev === "test") {
      this.app.store.packages.testPkg = undefined
    }
    this.#mode = value
  }

  #mode: "edit" | "source" | "test" | "preview" = "edit"

  previewSrc?: string

  loadingPreview: boolean = false

  get state() {
    return this.testState ?? this.editorState
  }

  set state(value: EditorStateWithHead) {
    if (this.mode === "test") {
      this.testState = value
    }
    else {
      this.editorState = value
    }
  }

  @query("main")
  main: HTMLElement

  @query("ww-toolbox")
  toolbox: Toolbox

  @query("ww-palette")
  palette: Palette

  @query("pm-editor")
  pmEditor: ProsemirrorEditor

  @query("ww-dom-editor")
  domEditor: DOMEditorComponent

  @query("cm-editor")
  cmEditor: CodemirrorEditor

  focus(options?: Parameters<HTMLElement["focus"]>[0]) {
    setTimeout(() => this.pmEditor.focus(), 75)
  }

  connectedCallback(): void {
    super.connectedCallback()
    // this.classList.add("loading")
    for (const [name, callback] of Object.entries(this.globalListeners)) {
      window.addEventListener(name as keyof WindowEventMap, callback as any)
    }
  }

  firstUpdated() {
    this.classList.remove("loading")
  }

  handleEditorInitialized = (e: CustomEvent) => {
    if (e.detail?.first) {
      this.selection.handleEditorFocus()
    }
    this.layout.updatePosition()
  }

  handleUpdate = () => {
    if (this.mode === "test") {
      if (!this.state.selection.eq(this.pmEditor.state.selection)) {
        this.selection.handleSelectionChange()
      }
      this.testState = this.pmEditor.state as EditorStateWithHead
    }
    else {
      if (!this.state.selection.eq(this.pmEditor.state.selection)) {
        this.selection.handleSelectionChange()
      }
      this.state = this.pmEditor.state as EditorStateWithHead
    }
    this.dispatchEvent(new Event("change"))
    this.layout.updatePosition()
  }

  editorListeners = chainListeners(this.controllers.map(k => this[k]?.editorListeners))
  globalListeners = chainListeners(this.controllers.map(k => this[k]?.globalListeners))
  windowListeners = chainListeners(this.controllers.map(k => this[k]?.windowListeners))

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

			ww-dom-editor {
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

			ww-dom-editor::part(iframe) {
				height: 100%;
				width: 100%;
				grid-area: inherit;
        opacity: 0;
        transition: opacity 0.5s;
			}

      ww-dom-editor[loaded]::part(iframe) {
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

  private _requestUpdate = () => {this.requestUpdate()}

  CoreEditor = () => html`<ww-dom-editor></ww-dom-editor>` /*html`<pm-editor
    id="main"
    url=${ifDefined(this.previewSrc)}
    .bundleID=${this.bundleID}
    .scrollMargin=${20}
    .scrollThreshold=${20}
    .state=${this.state}
    .importMap=${this.mode === "test" ? this.app.store.packages.testImportMap : this.app.store.packages.importMap}
    .nodeViews=${this.pmview.nodeViews}
    .markViews=${this.pmview.markViews}
    .handleDoubleClick=${this.selection.handleDoubleClick}
    .handleTripleClick=${this.selection.handleTripleClick}
    .decorations=${this.status.decorations}
    .shouldBeEditable=${this.editing.shouldBeEditable}
    .handleDOMEvents=${this.editorListeners}
    .transformPastedHTML=${this.editing.transformPastedHTML}
    .windowListeners=${this.windowListeners}
    .preventedShortcuts=${this.app.commands.preventedShortcuts}
    @update=${this.handleUpdate}
    @focus=${this.selection.handleEditorFocus}
    @fullscreenchange=${this._requestUpdate}
    @ww-initialized=${this.handleEditorInitialized}
  ></pm-editor>`*/

  CodeEditor = () => !this.codeState? null: html`<cm-editor
    .state=${this.codeState}
    .extensions=${CODEMIRROR_EXTENSIONS}
    @change=${this.editing.handleCodeChange}
  ></cm-editor>`

  Toolbox = () => html`<ww-toolbox
    class=${this.layout.toolboxMode}
    style=${styleMap(this.layout.toolboxStyle)}
    .app=${this.app as any}
    .editorState=${this.state}
    .activeElement=${this.selection.activeElement}
    .shiftPaddingStyling=${this.layout.shiftPaddingStyling}
    .testMode=${this.mode === "test"}
    .testStatus=${this.app.store.packages.testStatus}
    @sl-after-open=${handler(() => this.requestUpdate())}
    @ww-delete-widget=${handler(() => (e: any) => this.editing.deleteWidget(e.detail.widget))}
    @ww-mark-field-input=${(e: any) => {
      const { from, to } = this.state.selection
      const markType = this.state.schema.marks[e.detail.markType]
      const { key, value } = e.detail
      const tr = this.state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, markType.create({ [key]: value }))
      this.pmEditor.dispatch(tr)
    }}
    @ww-remove-mark=${handler((e: any) => this.editing.removeMark(e.detail.markType))}
    @ww-click-breadcrumb=${handler((e: any) => this.selection.selectElementInEditor(e.detail.element))}
    @ww-click-name=${(e: CustomEvent) => {
      this.selection.activeElement?.scrollIntoView({ behavior: "smooth", block: "center" })
      !e.detail.widget ? this.pmEditor?.focus() : e.detail.widget.focus()
    }}
    @ww-close=${(e: CustomEvent) => {
      this.forceToolboxPopup = false
    }}
    @ww-set-attribute=${(e: CustomEvent) => this.editing.setNodeAttribute(e.detail.el, e.detail.key, e.detail.value, e.detail.tag)}
    @ww-set-heading-level=${(e: any) => this.editing.setHeadingLevel(e.detail.el, e.detail.level)}
    @ww-set-style=${(e: any) => this.editing.setStyleOnSelection(e.detail.style)}
    @ww-insert-text=${(e: any) => this.editing.insertText(e.detail.text)}
    @ww-add-comment=${this.editing.addComment}
    @ww-update-comment=${(e: any) => this.editing.updateComment(e.detail.id, e.detail.change, e.detail.i)}
    @ww-delete-comment=${(e: any) => this.editing.deleteComment(e.detail.id, e.detail.i)}
  ></ww-toolbox>`

  Palette = () => html`<ww-palette
    part="editor-toolbox"
    editingStatus=${ifDefined(this.editingStatus)}
    ?data-no-scrollbar-gutter=${this.palette?.offsetWidth - this.palette?.clientWidth === 0}
    ?isInNarrowLayout=${this.layout.isInNarrowLayout}
    .app=${this.app as any}
    .forceToolboxPopup=${!!this.forceToolboxPopup}
    .loading=${this.loadingPackages}
    .testMode=${this.mode === "test"}
    .changingID=${this.app.store.packages.changingID}
    .packageIcons=${this.app.store.packages.packageIcons}
    .editorState=${this.state}
    @ww-insert=${(e: any) => console.log(e)}
  ></ww-palette>`


  render() {
    let Main: TemplateResult | (TemplateResult | null)[] | null = null
    if (this.mode === "edit" || this.mode === "test") {
      Main = [
        this.CoreEditor(),
        // !this.pmEditor?.isFullscreen ? this.Toolbox() : null,
        !this.pmEditor?.isFullscreen ? this.Palette() : null
      ]
    }
    else if (this.mode === "source") {
      Main = this.CodeEditor()
    }
    else if (this.mode === "preview") {
      Main = this.CoreEditor()
    }
    return html`
      <main part="base">
        ${Main}
        <!--<ww-debugoverlay .editorState=${this.editorState} .activeElement=${this.activeElement}></ww-debugoverlay>-->
      </main>
    `
  }
}