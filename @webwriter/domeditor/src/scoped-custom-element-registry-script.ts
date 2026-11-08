import {markEditorOnlyNode} from "./editor-artifacts"
import scopedCustomElementRegistrySource from "./scoped-custom-element-registry.js?raw"

/** Creates the standalone scoped-registry adapter required before widget scripts. */
export function scopedCustomElementRegistryScript(root: Document, editorOnly = false) {
  const script = root.createElement("script")
  script.id = "webwriter-scoped-registry"
  if(editorOnly) markEditorOnlyNode(script)
  script.textContent = scopedCustomElementRegistrySource.replace(/<\/script/gi, "<\\/script")
  return script
}
