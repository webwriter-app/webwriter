import {Node, DOMSerializer} from "prosemirror-model"
import {Schema, DOMParser} from "prosemirror-model"

import { EditorStateWithHead, PackageStore, createEditorState, headSchema, headSerializer } from '..'
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"
import { ParserSerializer } from './parserserializer'
import { parseComment, serializeComment, serializeCommentElement } from "#model/schemas/resource/comment.js"
import { html_beautify } from "js-beautify"

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

export function replaceCommentElements(html: Document | HTMLElement) {
  // Replace placeholder comment elements with comment nodes
  const commentElements = html.querySelectorAll("comment-")
  const seenIds = new Set()
  commentElements.forEach(el => {
    const commentsHtml = serializeCommentElement(el as HTMLElement)
    const id = el.getAttribute("data-id")
    const isFirst = !seenIds.has(id)
    seenIds.add(id)
    el.insertAdjacentHTML("beforebegin", isFirst? commentsHtml: `<!--id☛${id}-->`)
    el.insertAdjacentHTML("afterend", `<!--id☛${id}♦♦-->`)
    el.replaceWith(...Array.from(el.childNodes))
  })
  const nodeCommentElements = html.querySelectorAll("[data-ww-comment-0]")
  nodeCommentElements.forEach(el => {
    const commentsHtml = serializeCommentElement(el as HTMLElement)
    el.getAttributeNames().filter(k => k.startsWith("data-ww-comment-")).forEach(k => el.removeAttribute(k))
    el.insertAdjacentHTML("afterbegin", commentsHtml)
  })
}

export function replaceCommentNodes(html: Document) {
  // Transform comments into comment- elements
  const walker = html.createTreeWalker(html.body, NodeFilter.SHOW_COMMENT)
  const comments: Comment[] = []
  const commentElements: HTMLElement[] = []
  while(walker.nextNode()) {
    const node = walker.currentNode as Comment
    let text = node.textContent!
    comments.push(node)
    if((node.previousSibling as HTMLElement).tagName === "COMMENT-") { // if prev is comment- element
      const comment = node.previousSibling as HTMLElement
      const index = Math.max(...comment.getAttributeNames()
        .filter(name => name.startsWith("data-content-"))
        .map(name => parseInt(name.slice("data-content-".length)))) + 1
      comment.setAttribute(`data-content-${index}`, node.textContent!)
    }
    else if(text.startsWith("id☛") && text.endsWith("♦♦") && !text.endsWith("\\♦♦")) { // if is closing
      const id = text.slice("id☛".length, -"♦♦".length)
      const opener = commentElements.find(c => c.getAttribute("data-id") === id)
      if(opener) {
        const range = new Range()
        range.setStartAfter(opener)
        range.setEndBefore(node)
        range.surroundContents(opener)
      }
      else {
        console.log(`Opening comment for ${id} not found`)
      }
    }
    else if(text.startsWith("id☛")) { // is opening
      const comment = html.createElement("comment-")
      const isPartial = text.startsWith("id☛") && !text.includes("♦")
      const id = parseComment(text).id
      !isPartial && comment.setAttribute("data-content-0", text)
      id && comment.setAttribute("data-id", id)
      node.replaceWith(comment, node)
      commentElements.unshift(comment)
    }
    else { // is node-level (normal)
      let el: HTMLElement
      /*const isFirstChild = node.parentElement?.firstChild === node
      const isLastChild = node.parentElement?.lastChild === node
      if(isFirstChild || isLastChild) {
        text = isLastChild? serializeComment({...parseComment(text), position: "beforeend"}): text
        el = node.parentElement!
      }*/
      text = serializeComment({...parseComment(text)})
      el = node.parentElement as HTMLElement
      const i = Math.max(...(el?.getAttributeNames() ?? []).filter(k => k.startsWith("data-ww-comment-")).map(k => parseInt(k.slice("data-ww-comment-".length))), -1) + 1
      el?.setAttribute(`data-ww-comment-${i}`, text)
    }
  }
  comments.forEach(c => c.remove())
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

export async function docToBundle(doc: Node, head: Node, noDeps=false, minify=false) {
  let html = document.implementation.createHTMLDocument()
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  serializer.serializeFragment(doc.content, {document: html}, html.body)

  // Generate head
  html.head.replaceWith(headSerializer.serializeNode(head))
  for(let [key, value] of Object.entries(head.attrs.htmlAttrs ?? {})) {
    html.documentElement.setAttribute(key, value as string)
  }

  // Minify theme CSS
  if(minify) {
    for(let styleEl of Array.from(html.querySelectorAll("head > style"))) {
      styleEl.textContent = styleEl.textContent?.replaceAll("\n", "") ?? null
    }
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

  replaceCommentElements(html)

  if(noDeps) {
    return {html}
  }

  // Generate bundle
  const widgets = html.querySelectorAll(".ww-widget")
  widgets.forEach(w => {
    w.removeAttribute("contenteditable")
    w.removeAttribute("data-ww-editing")
    w.removeAttribute("data-ww-tagname")
  })
  
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
    const jsUrl = new URL("https://node1.webwriter.elearn.rwth-aachen.de/ww/v1/_bundles")
    minify && jsUrl.searchParams.append("minify", "true")
    importIDs.forEach(id => jsUrl.searchParams.append("id", id))
    const bundleJS = await (await fetch(jsUrl)).text()
    js = bundleJS? scopedCustomElementRegistry + ";" +  `(function () {${bundleJS}})();`: ""
    const cssUrl = new URL("https://node1.webwriter.elearn.rwth-aachen.de/ww/v1/_bundles")
    cssUrl.searchParams.append("pkg", "true")
    cssUrl.searchParams.append("type", "css")
    minify && cssUrl.searchParams.append("minify", "true")
    importIDs.forEach(id => cssUrl.searchParams.append("id", id.replace(".js", ".css").replace(".*", ".css")))
    const bundleCSS = await (await fetch(cssUrl)).text()
    css = bundleCSS
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

    replaceCommentNodes(inputDoc)
  
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

  async serializeToDOM(state: EditorStateWithHead, noDeps=false, minify=false) {

    const {html, js, css} = await docToBundle(state.doc, state.head$.doc, noDeps, minify)

    if(js) {
      const script = html.createElement("script")
      script.type = "module"
      // script.defer = true
      script.text = js
      script.setAttribute("data-ww-editing", "bundle")
      html.head.appendChild(script)
    }
  
    if(css) {
      const style = html.createElement("style")
      style.textContent = css ?? ""
      style.setAttribute("data-ww-editing", "bundle")
      html.head.appendChild(style)
    }
    
    return html
  }
  
  async serialize(state: EditorStateWithHead, noDeps=false, minify=false) {
    const html = await this.serializeToDOM(state, noDeps, minify)
    return `<!DOCTYPE html>` + html_beautify(html.documentElement.outerHTML, {content_unformatted: ["pre", "script", "style"]})

  }
}