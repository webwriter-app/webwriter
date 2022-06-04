import { Command } from '@tauri-apps/api/shell'

import {Document} from "../model"
import { DocumentEditor } from "../view"
import { escapeHTML } from "../utility"


export function parse(data: string) {
  // @ts-ignore: To be reimplemented
  return new Document(undefined, data)
}

export async function serialize(editor: DocumentEditor) {
  
  const outputDoc = document.implementation.createHTMLDocument()

  const blockElements = Array.from(editor.blockSections)
    .map(section => section.element)
    .map(oldNode => outputDoc.importNode(oldNode, true))

  const widgetTypes = [...new Set(blockElements.map(b => b.tagName))]
  const importStatements = widgetTypes.map(t => `import ${t}`)
  const entrypoint = importStatements.join(";")
  
  const esbuild = Command.sidecar("esbuild")
  const output = await esbuild.execute()

  // Find packages used in document
  // For each package:
    // bundle dependencies
  

  for(let blockElement of blockElements) {
    outputDoc.body.append(blockElement)
  }

  return outputDoc.documentElement.outerHTML

}

export const label = "Web Page (.html)"