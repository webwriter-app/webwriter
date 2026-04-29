import { ReactiveController } from "lit"
import { DOMEventMap, EditorProps } from "prosemirror-view"
import { ExplorableEditor } from ".."

type DOMListenerMap = {[event in keyof DOMEventMap]?: (event: DOMEventMap[event]) => boolean | void;} 

export interface EditorController {
  globalListeners?: DOMListenerMap
  windowListeners?: DOMListenerMap
  editorListeners?: EditorProps["handleDOMEvents"]
  handleUpdate?: (event: CustomEvent) => void
  handleInitialize?: (event: CustomEvent) => void
}
export class EditorController implements ReactiveController {
  constructor(readonly host: ExplorableEditor) {
		host.addController(this)
	} hostConnected() {}

  get state() {
    return this.host.state
  }

  get doc() {
    return this.host.state.doc
  }

  get tr() {
    return this.host.state.tr
  }

  get schema() {
    return this.host.state.schema
  }

  get head$() {
    return this.host.state.head$
  }

  get app() {
    return this.host.app
  }

  get selection() {
    return this.host.state.selection
  }

  get pmEditor() {
    return this.host.pmEditor
  }
}