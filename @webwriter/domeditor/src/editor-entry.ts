import { DOMEditor } from "./domeditor"
import {isInitializeEditorMessage} from "./editor-bridge"

const initialize = (event: MessageEvent) => {
  if(window.parent !== window && event.source !== window.parent) return
  if(!isInitializeEditorMessage(event.data)) return
  if(typeof event.data.bridgeNonce !== "string") return
  window.removeEventListener("message", initialize)
  const editor = new DOMEditor({
    syncUrl: event.data.syncUrl,
    bridgeNonce: event.data.bridgeNonce,
    bridgeOrigin: event.origin && event.origin !== "null" ? event.origin : window.location.origin,
    initialState: event.data.initialState,
  })
  /* @ts-ignore */
  window.editor = editor
}

window.addEventListener("message", initialize)
