import {DOMEditor} from "../src/domeditor"
import {registerFrameArtifacts} from "../src/editor-artifacts"

declare global {
  interface Window {
    editor?: DOMEditor
    editorError?: string
    reinitializeEditor?: () => void
  }
}

try {
  if(new URL(import.meta.url).searchParams.has("register-frame-artifacts")) registerFrameArtifacts(document)
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
