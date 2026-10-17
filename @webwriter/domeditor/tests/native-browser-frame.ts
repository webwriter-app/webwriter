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
  // The accessibility native-browser fixture needs an initial disabled
  // document state before the feature's deferred background check can run.
  if(new URL(import.meta.url).searchParams.has("proofreading-disabled")) {
    window.editor.features.proofreading.setDocumentChecking(false)
  }
  window.reinitializeEditor = () => {
    window.editor!.destroy()
    window.editor = new DOMEditor({bridgeOrigin: parent.location.origin})
  }
}
catch(error) { window.editorError = String(error) }
