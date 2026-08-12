import { DOMEditor } from "./domeditor"
import {isInitializeEditorMessage} from "./editor-bridge"

const initialize = (event: MessageEvent) => {
  if(window.parent !== window && event.source !== window.parent) return
  if(!isInitializeEditorMessage(event.data)) return
  window.removeEventListener("message", initialize)
  const editor = new DOMEditor({
    syncUrl: event.data.syncUrl,
    initialState: event.data.initialState,
  })
  /* @ts-ignore */
  window.editor = editor
}

window.addEventListener("message", initialize)
