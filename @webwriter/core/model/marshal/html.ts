import { readTextFile, removeFile, writeTextFile } from '@tauri-apps/api/fs'
import {Node, DOMSerializer} from "prosemirror-model"
import { join, appDir } from '@tauri-apps/api/path'
import { EditorState } from 'prosemirror-state'
import {Schema, DOMParser} from "prosemirror-model"

import { createElementWithAttributes, namedNodeMapToObject, unscopePackageName } from "../../utility"
import { PackageStore, createEditorState, headSchema, headSerializer } from '..'
import { Environment } from '../environment'
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"

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

function uInt8ToBase64(bytes: Uint8Array) {
  var binary = '';
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
      binary += String.fromCharCode( bytes[ i ] );
  }
  return window.btoa( binary );
}

// Abysmal performance on save, replace with esbuild Base64 process? https://esbuild.github.io/content-types/#base64

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

export async function docToBundle(doc: Node, head: Node, bundle: Environment["bundle"], Path: Environment["Path"], FS: Environment["FS"]) {
  const html = document.implementation.createHTMLDocument()
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  serializer.serializeFragment(doc.content, {document: html}, html.body)

  // Generate bundle
  html.querySelectorAll(".ww-widget").forEach(w => w.removeAttribute("contenteditable"))
  
  const allImports = Object.fromEntries(Object.values(doc.type.schema.nodes)
    .filter(node => node.spec["widget"])
    .map(node => [node.spec.tag, node.spec.fullName])
  )

  const importIDs = [...new Set(Array.from(html.querySelectorAll("*"))
    .map(el => el.tagName.toLowerCase())
    .filter(tag => Object.keys(allImports).includes(tag))
    .map(tag => allImports[tag])
  )]

  const {bundleJS, bundleCSS} = await PackageStore.readBundle(importIDs, bundle, Path, FS, false, true)
  const js = scopedCustomElementRegistry + ";" +  bundleJS
  const css = bundleCSS
  
  // Generate head
  html.head.replaceWith(headSerializer.serializeNode(head))
  for(let [key, value] of Object.entries(head.attrs.htmlAttrs ?? {})) {
    html.documentElement.setAttribute(key, value as string)
  }

  // Embed media elements
  const mediaElements = html.body.querySelectorAll(":is(img, source, embed)") as NodeListOf<HTMLSourceElement | HTMLImageElement>
  for(const [i, el] of Array.from(mediaElements).entries()) {
    if(!el.src || !el.src.startsWith("blob:")) {
      continue
    }
    const blob = await (await fetch(el.src)).blob()
    el.src = await createDataURL(blob)
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

export async function serialize(explorable: Node, head: Node, bundle: Environment["bundle"], Path: Environment["Path"], FS: Environment["FS"]) {
  
  const {html, js, css} = await docToBundle(explorable, head, bundle, Path, FS)

  const script = html.createElement("script")
  script.type = "text/javascript"
  script.text = js
  script.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(script)

  const style = html.createElement("style")
  style.textContent = css ?? ""
  style.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(style)

  return `<!DOCTYPE html>` + html.documentElement.outerHTML
}

export const label = "WebWriter File"
export const extensions = ["html", "ww.html"]
export const isBinary = false