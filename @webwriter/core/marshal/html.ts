import { readTextFile, removeFile, writeTextFile } from '@tauri-apps/api/fs'
import {Node, DOMSerializer} from "prosemirror-model"

import {Attributes} from "@webwriter/model"
import { createElementWithAttributes, namedNodeMapToObject, unscopePackageName } from "../utility"
import { join, appDir } from '@tauri-apps/api/path'
import { EditorState } from 'prosemirror-state'
import {Schema, DOMParser} from "prosemirror-model"
import { createEditorState } from '../state/editorstate'
import { Environment } from '../environment'

class NonHTMLDocumentError extends Error {}
class NonWebwriterDocumentError extends Error {}
class UnsupportedPackagesError extends Error {
  constructor(message: string, public readonly unsupportedPackageNames: string[]) {super(message)}
}

export async function docToBundle(doc: Node, bundle: Environment["bundle"]) {
  const html = document.implementation.createHTMLDocument()
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  serializer.serializeFragment(doc.content, {document: html}, html.body)
  
  const allWidgetTypes = [...new Set(Object.values(doc.type.schema.nodes)
    .filter(node => node.spec["widget"])
    .map(node => node.name)
  )]

  const widgetTypes = Array.from(html.querySelectorAll("*"))
    .map(el => el.tagName.toLowerCase())
    .filter(name => allWidgetTypes.includes(name))

  const packageNames = widgetTypes.map(name => doc.type.schema.nodes[name].spec["package"])

  const statements = [
    `import "@open-wc/scoped-elements"`
  ].concat(packageNames.flatMap(t => [
    `import ${unscopePackageName(t).replaceAll("-", "_")} from "${t}"`,
    `customElements.define("${unscopePackageName(t)}", ${unscopePackageName(t).replaceAll("-", "_")})`
  ]))
  const entrypoint = statements.length > 1? statements.join(";"): ""

  // Workaround without esbuild's transform API
  const entrypointPath = await join(await appDir(), "entrypoint.js")
  const jsPath = await join(await appDir(), "doc.js")
  const cssPath = await join(await appDir(), "doc.css")
  await writeTextFile(entrypointPath, entrypoint)
  let js = ""
  let css = ""
  try {
    await bundle([entrypointPath, "--bundle", "--minify", `--outfile=${jsPath}`])
    js = await readTextFile(jsPath)
    css = await readTextFile(cssPath)
  }
  catch(err) {}
  finally {
    removeFile(entrypointPath)
    js !== "" && removeFile(jsPath)
    css !== "" && removeFile(cssPath)
  }

  const meta: Attributes = doc.attrs.meta

  const title = meta.headline as string
  const keywords = (meta.keywords as string[] ?? []).join(",")
  const lang = meta.inLanguage as string

  const IGNORE_KEYS = ["type", "headline", "keywords", "inLanguage", "encoding", "generator"]
  const attrs = Object.entries(meta).filter(([k, v]) => !IGNORE_KEYS.includes(k))

  const headElements = [
    createElementWithAttributes(html, "meta", undefined, {charset: "utf-8"}),
    createElementWithAttributes(html, "meta", undefined, {name: "generator", content: "webwriter"}),
    createElementWithAttributes(html, "title", undefined, {}, {text: title}),
    createElementWithAttributes(html, "meta", undefined, {name: "keywords", content: keywords}),
    ...attrs.map(([name, content]) => createElementWithAttributes(html, "meta", undefined, {name, content}))
  ]

  for(let headElement of headElements) {
    html.head.appendChild(headElement)
  }

  html.documentElement.lang = lang

  return {html, css, js}
}


export function parse(data: string, schema: Schema) {
  let inputDoc: Document
  try {
    inputDoc = new globalThis.DOMParser().parseFromString(data, "text/html")
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

  const explorable = DOMParser.fromSchema(schema).parse(inputDoc.body)

  const editorState = createEditorState({schema, doc: explorable})
  
  return editorState
}

export async function serialize(explorable: Node, bundle: Environment["bundle"]) {
  
  const {html, js, css} = await docToBundle(explorable, bundle)

  const script = html.createElement("script")
  script.type = "text/javascript"
  script.text = js
  html.head.appendChild(script)

  const style = html.createElement("style")
  style.textContent = css
  html.head.appendChild(style)

  return `<!DOCTYPE html>` + html.documentElement.outerHTML
}

export const label = "WebWriter File"
export const extensions = ["ww.html", "html"]
export const isBinary = false