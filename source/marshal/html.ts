import { readTextFile, removeFile, writeTextFile } from '@tauri-apps/api/fs'

import {Attributes, Block, BlockElement, Document as WwDocument} from "webwriter-model"
import { DocumentEditor } from "../view/components"
import { Bundler } from '../state'
import { escapeHTML, createElementWithAttributes, namedNodeMapToObject } from "../utility"
import { join, appDir } from '@tauri-apps/api/path'

class NonHTMLDocumentError extends Error {}
class NonWebwriterDocumentError extends Error {}
class UnsupportedPackagesError extends Error {
  constructor(message: string, public readonly unsupportedPackageNames: string[]) {super(message)}
}


export function parse(data: string, supportedPackages) {
  let inputDoc: Document
  try {
    inputDoc = new DOMParser().parseFromString(data, "text/html")
  }
  catch(e) {
    throw new NonHTMLDocumentError(e.message)
  }

  if(!inputDoc.querySelector("meta[name=generator][content=webwriter]")) {
    throw new NonWebwriterDocumentError("Did not find WebWriter marker: <meta name='generator' content='webwriter'>")
  }

  const headline = inputDoc.querySelector("title").text
  const keywords = inputDoc.querySelector("meta[name=keywords]")?.getAttribute("content")?.split(",")
  const inLanguage = inputDoc.documentElement.lang

  const metaElements = Array.from(inputDoc.querySelectorAll("meta:not([name=keywords]):not([name=encoding]):not([name=generator]:not([name='']):not([name=viewport]))")) as HTMLMetaElement[]
  const restAttributes = Object.fromEntries(metaElements.map(meta => [meta.name, meta.content]))

  const rawAttributes = {...restAttributes, type: "document", headline, keywords, inLanguage}

  const attributes = Object.fromEntries(Object.entries(rawAttributes)
    .filter(([k, v]) => k && v && v !== "undefined" && v[0] !== "undefined")
  ) as Attributes & {type: "document"}

  const contentElements = Array.from(inputDoc.querySelectorAll("body > *")) 
  const contentAttributes = contentElements.map(el => ({
    type: el.tagName.toLowerCase(),
    ...namedNodeMapToObject(el.attributes)
  }) as Attributes)
  const content = contentAttributes.map(attrs => new Block(attrs, undefined))
  

  return new WwDocument(undefined, undefined, attributes, content)
}

export async function serialize(editor: DocumentEditor) {

  console.log(editor)
  
  const outputDoc = document.implementation.createHTMLDocument()

  const blockElements = Array.from(editor.blockSections)
    .map(section => section.element)
    .map(oldNode => outputDoc.importNode(oldNode, true))

  blockElements.forEach(node => {
    node.classList.remove("block-element")
    node.className === ""? node.removeAttribute("class"): null
  })

  const widgetTypes = [...new Set(blockElements.map(b => b.tagName.toLowerCase()))]
  const statements = [
    `import "@webcomponents/scoped-custom-element-registry"`
  ].concat(widgetTypes.flatMap(t => [
    `import ${t.replaceAll("-", "_")} from "${t}"`,
    `customElements.define("${t}", ${t.replaceAll("-", "_")})`
  ]))
  const entrypoint = statements.length > 1? statements.join(";"): ""

  // Workaround without esbuild's transform API
  const entrypointPath = await join(await appDir(), "entrypoint.js")
  const bundleScriptPath = await join(await appDir(), "doc.js")
  const bundleStylesPath = await join(await appDir(), "doc.css")
  await writeTextFile(entrypointPath, entrypoint)
  let bundleScript = ""
  let bundleStyles = ""
  try {
    await Bundler.build([entrypointPath, "--bundle", "--minify", `--outfile=${bundleScriptPath}`])
    bundleScript = await readTextFile(bundleScriptPath)
    bundleStyles = await readTextFile(bundleStylesPath)
  }
  catch(e) {}
  finally {
    removeFile(entrypointPath)
    bundleScript !== "" && removeFile(bundleScriptPath)
    bundleStyles !== "" && removeFile(bundleStylesPath)
  }

  for(let blockElement of blockElements) {
    outputDoc.body.append(blockElement)
  }

  const title = editor.getDocAttribute("headline", false)
  const keywords = editor.getDocAttribute("keywords")?.join(",")
  const lang = editor.getDocAttribute("inLanguage", false)

  const IGNORE_KEYS = ["type", "headline", "keywords", "inLanguage", "encoding", "generator"]
  const attrs = Object.keys(editor.docAttributes)
    .filter(k => !IGNORE_KEYS.includes(k))
    .flatMap(k => editor.getDocAttribute(k)
    .map(v => [k, v]))

  const headElements = [
    createElementWithAttributes(outputDoc, "meta", undefined, {charset: "utf-8"}),
    createElementWithAttributes(outputDoc, "meta", undefined, {name: "generator", content: "webwriter"}),
    createElementWithAttributes(outputDoc, "title", undefined, {}, {text: title}),
    createElementWithAttributes(outputDoc, "meta", undefined, {name: "keywords", content: keywords}),
    ...attrs.map(([name, content]) => createElementWithAttributes(outputDoc, "meta", undefined, {name, content}))
  ]

  for(let headElement of headElements) {
    outputDoc.head.appendChild(headElement)
  }

  outputDoc.documentElement.lang = lang

  const script = outputDoc.createElement("script")
  script.type = "text/javascript"
  script.text = bundleScript
  outputDoc.head.appendChild(script)

  const style = outputDoc.createElement("style")
  style.textContent = bundleStyles
  outputDoc.head.appendChild(style)

  return `<!DOCTYPE html>` + outputDoc.documentElement.outerHTML

}

export const label = "WebWriter File"
export const extensions = ["ww.html"]