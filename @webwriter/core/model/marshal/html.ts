import { readTextFile, removeFile, writeTextFile } from '@tauri-apps/api/fs'
import {Node, DOMSerializer} from "prosemirror-model"
import {Attributes} from "@webwriter/model"
import { join, appDir } from '@tauri-apps/api/path'
import { EditorState } from 'prosemirror-state'
import {Schema, DOMParser} from "prosemirror-model"

import { createElementWithAttributes, namedNodeMapToObject, unscopePackageName } from "../../utility"
import { createEditorState, headSchema, headSerializer } from '..'
import { Environment } from '../environment'

class NonHTMLDocumentError extends Error {}
class NonWebwriterDocumentError extends Error {}
class UnsupportedPackagesError extends Error {
  constructor(message: string, public readonly unsupportedPackageNames: string[]) {super(message)}
}

function createDataURL(blob: Blob) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  }) as Promise<string>
}

// TODO: Abysmal performance on save, replace with esbuild Base64 process? https://esbuild.github.io/content-types/#base64

function createInitializerScript(id: string, tag: string, content: string) {
  return `
    let self = document.querySelector("#${id}.initializer");
    let dataEl = document.querySelector("#${id}");
    let blob = new Blob([Uint8Array.from(atob(dataEl.textContent.trim()), c => c.charCodeAt(0))], {type: dataEl.type});
    let src = URL.createObjectURL(blob);
    let newEl = document.createElement("${tag}");
    ${tag === "img"? `newEl.src = src`: `newEl.href = src`};
    dataEl.replaceWith(newEl);
    self.remove();
  `
}

export async function docToBundle(doc: Node, head: Node, bundle: Environment["bundle"]) {
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

  const packageNames = widgetTypes.map(name => doc.type.schema.nodes[name].spec["package"].name)
  const scopedEntries = packageNames.map(n => [n, unscopePackageName(n)])

  const statements = [
    `import "@open-wc/scoped-elements"`
  ].concat(scopedEntries.flatMap(([s, u]) => [
    `import ${u.replaceAll("-", "_")} from "${s}"`,
    `customElements.define("${u}", ${u.replaceAll("-", "_")})`
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

  html.head.replaceWith(headSerializer.serializeNode(head))

  for(let [key, value] of Object.entries(head.attrs.htmlAttrs ?? {})) {
    html.documentElement.setAttribute(key, value as string)
  }

  function uInt8ToBase64(bytes: Uint8Array) {
    var binary = '';
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

  const mediaElements = html.body.querySelectorAll(":is(img, source, embed)") as NodeListOf<HTMLSourceElement | HTMLImageElement>
  for(const [i, el] of Array.from(mediaElements).entries()) {
    const tag = el.tagName.toLowerCase()
    const id = `ww_media_source_${i}`
    if(!el.src || !el.src.startsWith("blob:")) {
      continue
    }
    const blob = await (await fetch(el.src)).blob()
    el.src = await createDataURL(blob)
    /*
    const bytes = new Uint8Array(await (await fetch(el.src)).arrayBuffer())
    const contentString = String(bytes)
    const sourceEl = document.createElement("script")
    sourceEl.id = id
    sourceEl.type = el.getAttribute(tag === "source"? "type": "data-type")!
    sourceEl.innerHTML = contentString
    const initializerEl = document.createElement("script")
    initializerEl.id = id
    initializerEl.className = "initializer"
    initializerEl.innerHTML = createInitializerScript(id, tag, contentString)
    el.replaceWith(sourceEl, initializerEl)
    */
  }

  return {html, css, js}
}


export function parse(data: string, schema: Schema) {
  let inputDoc: Document
  try {
    inputDoc = new globalThis.DOMParser().parseFromString(data, "text/html")
  }
  catch(e: any) {
    throw new NonHTMLDocumentError(e?.message)
  }

  if(!inputDoc.querySelector("meta[name=generator][content^='webwriter@']")) {
    throw new NonWebwriterDocumentError("Did not find <meta name='generator'> valid for WebWriter")
  }

  const doc = DOMParser.fromSchema(schema).parse(inputDoc.body)

  let head = DOMParser.fromSchema(headSchema).parse(inputDoc.head)
  const htmlAttrs = {} as Record<string, string>
  for(let key of inputDoc.documentElement.getAttributeNames()) {
    htmlAttrs[key] = inputDoc.documentElement.getAttribute(key)!
  }
  head = head.type.schema.node("head", {...head.attrs, htmlAttrs}, head.content, head.marks)

  const editorState = createEditorState({schema, doc}, head)
  return editorState
}

export async function serialize(explorable: Node, head: Node, bundle: Environment["bundle"]) {
  
  const {html, js, css} = await docToBundle(explorable, head, bundle)

  console.log(js)

  const script = html.createElement("script")
  script.type = "text/javascript"
  script.text = js
  script.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(script)

  const style = html.createElement("style")
  style.textContent = css
  style.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(style)

  return `<!DOCTYPE html>` + html.documentElement.outerHTML
}

export const label = "WebWriter File"
export const extensions = ["ww.html", "html"]
export const isBinary = false