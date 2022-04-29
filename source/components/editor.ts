import {LitElement, html, css} from "lit"
import {customElement, property, query, state} from "lit/decorators.js"
import { EditorState, Plugin, Selection } from "prosemirror-state"
import { DirectEditorProps, EditorView } from "prosemirror-view"

import "."

import {ReactiveController, ReactiveControllerHost} from 'lit'


export class EditorViewController 
  extends EditorView implements ReactiveController {
  private host: Editor

  constructor(host: Editor, place: Node | (() => Node) | {mount: Node}, props: DirectEditorProps) {
    super(place, props)
    this.host = host
    host.addController(this)
  }

  update(props: DirectEditorProps) {
    super.update(props)
    this.host.requestUpdate()
  }

  updateState(state: EditorState) {
    super.updateState(state)
    this.host.requestUpdate()
  }



  hostConnected() {}
  hostDisconnected() {}

  
}

type BaseDirectEditorProps = Omit<DirectEditorProps, `handle${string}` | "attributes">

@customElement("pm-editor")
export class Editor extends LitElement implements BaseDirectEditorProps {

  @property({attribute: false})
  editorProps: DirectEditorProps
  
  private editorView: EditorViewController

  @property({attribute: false})
  state: EditorState

  @property({attribute: false})
  createSelectionBetween: BaseDirectEditorProps["createSelectionBetween"]

  @property({attribute: false})
  domParser: BaseDirectEditorProps["domParser"]

  @property({attribute: false})
  transformPastedHTML: BaseDirectEditorProps["transformPastedHTML"]

  @property({attribute: false})
  clipboardParser: BaseDirectEditorProps["clipboardParser"]

  @property({attribute: false})
  transformPastedText: BaseDirectEditorProps["transformPastedText"]

  @property({attribute: false})
  clipboardTextParser: BaseDirectEditorProps["clipboardTextParser"]

  @property({attribute: false})
  transformPasted: BaseDirectEditorProps["transformPasted"]

  @property({attribute: false})
  nodeViews: BaseDirectEditorProps["nodeViews"]

  @property({attribute: false})
  clipboardSerializer: BaseDirectEditorProps["clipboardSerializer"]

  @property({attribute: false})
  clipboardTextSerializer: BaseDirectEditorProps["clipboardTextSerializer"]

  @property({attribute: false})
  decorations: BaseDirectEditorProps["decorations"]

  @property({attribute: false})
  editable: BaseDirectEditorProps["editable"]

  @property({attribute: false})
  scrollThreshold: BaseDirectEditorProps["scrollThreshold"]

  @property({attribute: false})
  scrollMargin: BaseDirectEditorProps["scrollMargin"]

  @property({attribute: false})
  dispatchTransaction: BaseDirectEditorProps["dispatchTransaction"]

  firstUpdated() {
    this.editorView = new EditorViewController(this, this, this.editorProps)
  }
	
	static get styles() {
		return css`
			:host {
				display: block;
        width: 100%;
        height: 100%;
			}

      :host p {
        margin: 0;
      }
		`
	}

  protected createRenderRoot() {
		return this
	}

}