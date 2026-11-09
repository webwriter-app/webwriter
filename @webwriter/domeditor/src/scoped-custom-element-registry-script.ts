import {markEditorOnlyNode} from "./editor-artifacts"
import readerRuntimeSources from "virtual:reader-runtime-sources"

/** Creates the standalone scoped-registry adapter required before widget scripts. */
export function scopedCustomElementRegistryScript(root: Document, editorOnly = false) {
  const script = root.createElement("script")
  script.id = "webwriter-scoped-registry"
  if(editorOnly) markEditorOnlyNode(script)
  script.textContent = readerRuntimeSources.scopedRegistry.replace(/<\/script/gi, "<\\/script")
  return script
}
