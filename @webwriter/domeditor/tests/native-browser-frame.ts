import {DOMEditor} from "../src/domeditor"

declare global {
  interface Window {
    editor?: DOMEditor
    editorError?: string
    reinitializeEditor?: () => void
  }
}

try {
  window.editor = new DOMEditor({bridgeOrigin: parent.location.origin})
  window.reinitializeEditor = () => {
    window.editor!.destroy()
    window.editor = new DOMEditor({bridgeOrigin: parent.location.origin})
  }
}
catch(error) { window.editorError = String(error) }
