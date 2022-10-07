import {docToBundle} from "./html"
import {Node, Schema} from "prosemirror-model"

export function docToH5PPackageDefinition() {
  
}

export function parse(data: string, schema: Schema) {

}

export async function serialize(explorable: Node) {
  
  const {html, js, css} = await docToBundle(explorable)

  const script = html.createElement("script")
  script.type = "text/javascript"
  script.text = js
  html.head.appendChild(script)

  const style = html.createElement("style")
  style.textContent = css
  html.head.appendChild(style)

  return `<!DOCTYPE html>` + html.documentElement.outerHTML

}

export const label = "H5P Package"
export const extensions = ["h5p"]
export const isBinary = true