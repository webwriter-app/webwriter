import {Node, DOMSerializer} from "prosemirror-model"
import {Schema, DOMParser} from "prosemirror-model"

import { EditorStateWithHead, PackageStore, createEditorState, headSchema, headSerializer } from '..'
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"
import { ParserSerializer } from './parserserializer'

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

export async function docToBundle(doc: Node, head: Node) {
  let html = document.implementation.createHTMLDocument()
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  serializer.serializeFragment(doc.content, {document: html}, html.body)

  // Generate bundle
  const widgets = html.querySelectorAll(".ww-widget")
  widgets.forEach(w => w.removeAttribute("contenteditable"))
  
  const allImports = Object.fromEntries(Object.values(doc.type.schema.nodes)
    .filter(node => node.spec["widget"])
    .map(node => [node.spec.tag, node.spec.fullName + (!node.spec.legacy? ".js": "")])
  )

  const importIDs = [...new Set(Array.from(html.querySelectorAll("*"))
    .map(el => el.tagName.toLowerCase())
    .filter(tag => Object.keys(allImports).includes(tag))
    .map(tag => allImports[tag])
  )]

  let js; let css
  if(!importIDs.length) {
    js = ""
    css = ""
  }
  else {
    const jsUrl = new URL("https://api.webwriter.app/ww/v1/_bundles")
    importIDs.forEach(id => jsUrl.searchParams.append("id", id))
    const bundleJS = await (await fetch(jsUrl)).text()
    js = bundleJS? scopedCustomElementRegistry + ";" +  `(function () {${bundleJS}})();`: ""
    const cssUrl = new URL("https://api.webwriter.app/ww/v1/_bundles")
    cssUrl.searchParams.append("pkg", "true")
    cssUrl.searchParams.append("type", "css")
    importIDs.forEach(id => cssUrl.searchParams.append("id", id.replace(".js", ".css").replace(".*", ".css")))
    const bundleCSS = await (await fetch(cssUrl)).text()
    css = bundleCSS
  }
  
  // Generate head
  html.head.replaceWith(headSerializer.serializeNode(head))
  for(let [key, value] of Object.entries(head.attrs.htmlAttrs ?? {})) {
    html.documentElement.setAttribute(key, value as string)
  }

  // Minify theme CSS
  for(let styleEl of Array.from(html.querySelectorAll("head > style"))) {
    styleEl.textContent = styleEl.textContent?.replaceAll("\n", "") ?? null
  }

  // Embed media elements
  const mediaElements = html.body.querySelectorAll(":is(img, source, embed, audio, video)") as NodeListOf<HTMLSourceElement | HTMLImageElement>
  for(const [i, el] of Array.from(mediaElements).entries()) {
    if(!el.src || !el.src.startsWith("blob:")) {
      continue
    }
    const blob = await (await fetch(el.src)).blob()
    el.src = await createDataURL(blob)
  }

  // Run serializedCallbacks in iframe
  const iframe = document.createElement("iframe")
  try {
    // Temporarily add bundle to document
    const clone = html.cloneNode(true) as Document

    const script = clone.createElement("script")
    script.type = "module"
    script.text = js
    script.setAttribute("data-ww-editing", "bundle")
    clone.head.appendChild(script)

    const style = clone.createElement("style")
    style.textContent = css ?? ""
    style.setAttribute("data-ww-editing", "bundle")
    clone.head.appendChild(style)

    const blob = new Blob([clone.documentElement.outerHTML], {type: "text/html"})
    const url = URL.createObjectURL(blob)
    iframe.style.height = "0"
    iframe.style.visibility = "hidden"
    iframe.style.position = "fixed"
    iframe.style.bottom = "0"
    iframe.style.right = "0"
    iframe.setAttribute("src", url)
    const loaded = new Promise(resolve => iframe.addEventListener("load", resolve))
    document.body.append(iframe)
    await loaded
    // iframe.contentDocument!.replaceChild(html.documentElement.cloneNode(true), iframe.contentDocument!.documentElement)
    for (const widget of Array.from(iframe.contentDocument!.querySelectorAll(".ww-widget"))) {
      if("serializedCallback" in widget) {
        (widget.serializedCallback as any)()
      }
    }
    iframe.contentDocument?.querySelectorAll("[data-ww-editing]").forEach(el => el.remove())
    html = iframe.contentDocument!
  }
  finally {
    iframe.remove()
  }
  return {html, css, js}
}

export class HTMLParserSerializer extends ParserSerializer {
  static readonly format = "html" as const
  static readonly extensions = ["html", "htm"] as const
  static readonly mediaType = "text/html" as const

  async parse(data: string, schema: Schema) {
    let inputDoc: Document
    try {
      inputDoc = new globalThis.DOMParser().parseFromString(data, "text/html")
    }
    catch(e: any) {
      throw new NonHTMLDocumentError(e?.message)
    }
  

    let defaultState = undefined as EditorStateWithHead | undefined
    if(!inputDoc.querySelector("meta[name=generator][content^='webwriter@']")) {
      defaultState = createEditorState({schema})
//      throw new NonWebwriterDocumentError("Did not find <meta name='generator'> valid for WebWriter")
    }
  
    let doc = DOMParser.fromSchema(schema).parse(inputDoc.body)
  
    let head = DOMParser.fromSchema(headSchema).parse(inputDoc.head)
    if(defaultState) {
      head = defaultState.head$.apply(defaultState.head$.tr.insert(1, head.content)).doc
    }
    const htmlAttrs = {} as Record<string, string>
    for(let key of inputDoc.documentElement.getAttributeNames()) {
      htmlAttrs[key] = inputDoc.documentElement.getAttribute(key)!
    }
    head = head.type.schema.node("head", {...head.attrs, htmlAttrs}, head.content, head.marks)
  
    const editorState = createEditorState({schema, doc}, head)
    return editorState
  }

  async serializeToDOM(state: EditorStateWithHead) {

    const {html, js, css} = await docToBundle(state.doc, state.head$.doc)

    const script = html.createElement("script")
    script.type = "module"
    // script.defer = true
    script.text = js
    script.setAttribute("data-ww-editing", "bundle")
    html.head.appendChild(script)
  
    const style = html.createElement("style")
    style.textContent = css ?? ""
    style.setAttribute("data-ww-editing", "bundle")
    html.head.appendChild(style)
    return html
  }
  
  async serialize(state: EditorStateWithHead) {
    const html = await this.serializeToDOM(state)
    return `<!DOCTYPE html>` + html.documentElement.outerHTML
  }
}