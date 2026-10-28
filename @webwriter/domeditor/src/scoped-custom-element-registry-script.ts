import scopedCustomElementRegistrySource from "./scoped-custom-element-registry.js?raw"

/** Creates the standalone scoped-registry adapter required before widget scripts. */
export function scopedCustomElementRegistryScript(root: Document, editorOnly = false) {
  const script = root.createElement("script")
  script.id = "webwriter-scoped-registry"
  if(editorOnly) script.classList.add("◆", "◆editor-only")
  script.textContent = scopedCustomElementRegistrySource.replace(/<\/script/gi, "<\\/script")
  return script
}
