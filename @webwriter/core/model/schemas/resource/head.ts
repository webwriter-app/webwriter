import { EditorState, Plugin, PluginKey } from "prosemirror-state"
import { SchemaPlugin } from "./plugins"
import { HTMLElementSpec } from "./htmlelementspec"
import {SchemaSpec, Schema, DOMParser, DOMSerializer, Node, Fragment, Attrs} from "prosemirror-model"
import {EditorView} from "prosemirror-view"
import webwriterPackage from "../../../package.json"
import { themes } from "."
import { commentMarkSpec } from "./comment";
import { sameMembers, shallowCompare } from "#model/utility/index.js"
import { isEqual } from "lodash"

export const headSchemaSpec = {
  topNode: "head",
  nodes: {
    
    text: {},

    head: HTMLElementSpec({
      tag: "head",
      marks: "_comment",
      attrs: {
        htmlAttrs: {default: undefined as undefined | Attrs, private: true} as any},
        content: "(link | meta | title | base | style | script | noscript)*"
      }),
    
    link: HTMLElementSpec({tag: "link", marks: "_comment", attrs: {
      as: {default: undefined as undefined | "audio" | "document" |"embed" | "fetch" | "font" | "image" | "object" | "script" | "style" | "track" | "video" |"worker"},
      crossorigin: {default: undefined as undefined | "anonymous" | "use-credentials"},
      fetchpriority: {default: undefined as undefined | "high" | "low" | "auto"},
      href: {default: undefined as undefined | string},
      hreflang: {default: undefined as undefined | string},
      imagesizes: {default: undefined as undefined | string},
      imagesrcset: {default: undefined as undefined | string},
      integrity: {default: undefined as undefined | string},
      media: {default: undefined as undefined | string},
      prefetch: {default: undefined as undefined | boolean},
      referrerpolicy: {default: undefined as undefined | "no-referrer" | "no-referrer-when-downgrade" |"origin" | "origin-when-cross-origin" | "unsafe-url"},
      rel: {default: undefined as undefined | string},
      sizes: {default: undefined as undefined | "any" | string},
      title: {default: undefined as undefined | string},
      type: {default: undefined as undefined | string},
      blocking: {default: undefined as undefined | "render"}
    }}),
    
    meta: HTMLElementSpec({tag: "meta", marks: "_comment", attrs: {
      charset: {default: undefined as undefined | string},
      content: {default: undefined as undefined | string},
      "http-equiv": {default: undefined as undefined | "content-security-policy" | "content-type" | "default-style" | "x-ua-compatible" | "refresh"},
      name: {default: undefined as undefined | string}
    }}),

    title: HTMLElementSpec({tag: "title", marks: "_comment", content: "text*"}),
    
    base: HTMLElementSpec({tag: "base", marks: "_comment", attrs: {
      href: {default: undefined},
      target: {default: "_self" as "_self" |"_blank" | "_parent" | "_top"},
    }}),
    
    style: HTMLElementSpec({tag: "style", marks: "_comment", content: "text*", attrs: {
      blocking: {default: undefined as undefined | "render"},
      media: {default: undefined as undefined | string}
    }}),
    
    script: HTMLElementSpec({tag: "script", marks: "_comment", content: "text*", attrs: {
      async: {default: undefined as undefined | boolean},
      crossorigin: {default: undefined as undefined | string},
      defer: {default: undefined as undefined | boolean},
      fetchpriority: {default: undefined as undefined | "high" | "low" | "auto"},
      integrity: {default: undefined as undefined | string},
      nomodule: {default: undefined as undefined | boolean},
      referrerpolicy: {default: undefined as undefined | "no-referrer" | "no-referrer-when-downgrade" |"origin" | "origin-when-cross-origin" | "unsafe-url"},
      src: {default: undefined as undefined | string},
      type: {default: undefined as undefined | string | "module" | "importmap"},
      blocking: {default: undefined as undefined | boolean}
    }}),

    noscript: HTMLElementSpec({tag: "noscript", marks: "_comment", content: "(meta | link | style)*"})
  },
  marks: {
    _comment: commentMarkSpec
  }
} as SchemaSpec

export const headSchema = new Schema(headSchemaSpec)

const initialHeadDoc = (lang?: string, id=`ww-${crypto.randomUUID()}`) => headSchema.node("head", {htmlAttrs: {id, lang}}, [
  headSchema.node("meta", {charset: "utf-8"}),
  headSchema.node("meta", {name: "generator", content: `webwriter@${webwriterPackage.version}`}),
  headSchema.node("style", {data: {"data-ww-theme": "base"}, blocking: "render"}, headSchema.text(themes.base.source)),
])

export function initialHeadState({doc, lang}: {doc?: Node, lang?: string} = {}) {
  return EditorState.create({schema: headSchema, doc: doc ?? initialHeadDoc(lang)})
}

type Matcher = (node: Node, pos: number, parent: Node | null, index: number) => boolean

/** Set the attributes of the head element.*/
export function setHeadAttributes(headState: EditorState, attrs?: Attrs | null) {
  return headState.apply(headState.tr.setNodeMarkup(0, undefined, attrs))
}

/** Append a meta/link/base/style/script/noscript element with the given name and content. If matcher is defined, overwrite the first matching element instead.*/
export function upsertHeadElement(headState: EditorState, name: "head" |"meta" | "link" | "title" | "base" | "style" | "script" | "noscript", attrs: Record<string, any> = {}, content?: Fragment | Node | readonly Node[] | undefined, matcher: Matcher = () => false) {
  let existingPos: number, existingNode: Node | undefined
  headState.doc.descendants((node, pos, parent, index) => {
    if(matcher(node, pos, parent, index)) {
      existingPos = pos
      existingNode = node
      return false
    }
  })
  if(matcher(headState.doc, 0, null, 0)) {
    existingPos = 0
    existingNode = headState.doc
  }
  if(existingNode === headState.doc) {
    const newAttrs = {...(existingNode as any).attrs, ...attrs}
    const newHead = headState.schema.node("head", newAttrs, headState.doc.content, headState.doc.marks)
    return initialHeadState({doc: newHead})
  }
  if(existingPos! !== undefined && existingNode !== undefined) {
    let node = headState.schema.node(
      name,
      {...(existingNode as any).attrs, ...attrs},
      content
    )
    const resolved = headState.doc.resolve(existingPos)
    const tr = headState.tr.replaceWith(resolved.pos, resolved.pos + existingNode.nodeSize, node)
    return headState.apply(tr)
  }
  else {
    let node = headState.schema.node(name, attrs, content)
    const lastPos = headState.doc.nodeSize - 2
    const tr = headState.tr.insert(lastPos, node)
    return headState.apply(tr)
  }
}

/** Swap a head element specified by a pos up or down. */
export function moveHeadElement(headState: EditorState, node: Node, direction: "up" | "down", parent=headState.doc) {
  let nodes = [] as Node[]
  headState.doc.forEach(n => nodes.push(n))
  const i = nodes.indexOf(node)
  const nextI = direction === "up"
    ? Math.max(nodes.indexOf(node) - 1, 0)
    : Math.min(nodes.indexOf(node) + 1, nodes.length - 1)
  if(i === nextI) {
    return headState
  }
  const nextNode = nodes[nextI]
  const start = Math.min(i, nextI)
  const end = Math.max(i, nextI)

  let newNodes = [] as Node[]
  if(parent.type.name === "noscript") {
    const parentI = nodes.indexOf(parent)
    const parentNodes = [] as Node[]
    parent.forEach(node => parentNodes.push(node))
    const childI = parentNodes.indexOf(node)
    const upperBoundary = direction === "up" && childI === 0
    const lowerBoundary = direction === "down" && childI === parentNodes.length - 1
    if(upperBoundary || lowerBoundary) {
      const newParent = headState.schema.node(parent.type, parent.attrs, [
        ...parentNodes.slice(0, childI),
        ...parentNodes.slice(childI + 1)
      ], parent.marks)
      newNodes = [
        ...nodes.slice(0, parentI),
        ...(direction === "up"? [node, newParent]: [newParent, node]),
        ...nodes.slice(parentI + 1)
      ]
    }
    else {
      const nextChildI = direction === "up"
        ? parentNodes.indexOf(node) - 1
        : parentNodes.indexOf(node) + 1
      const nextChildNode = parentNodes[nextChildI]
      const childStart = Math.min(childI, nextChildI)
      const childEnd = Math.max(childI, nextChildI)
      newNodes = [
        ...nodes.slice(0, parentI),
        headState.schema.node(parent.type, parent.attrs, [
          ...parentNodes.slice(0, childStart),
          ...(direction === "up"? [node, nextChildNode]: [nextChildNode, node]),
          ...parentNodes.slice(childEnd + 1)
        ], parent.marks),
        ...nodes.slice(parentI + 1)
      ]
    }
  }
  else if(nextNode.type.name === "noscript" && ["style", "link", "meta"].includes(node.type.name)) {
    const nextNodeChildren = [] as Node[]
    nextNode.forEach(n => nextNodeChildren.push(n))
    newNodes = [
      ...nodes.slice(0, start),
      headState.schema.node(nextNode.type, nextNode.attrs, [
        ...(direction === "up"? []: [node]),
        ...nextNodeChildren,
        ...(direction === "down"? []: [node])
      ], nextNode.marks),
      ...nodes.slice(end + 1)
    ]
  }
  else {
    newNodes = direction === "up"
    ? [...nodes.slice(0, start), node, nextNode, ...nodes.slice(end + 1)]
    : [...nodes.slice(0, start), nextNode, node, ...nodes.slice(end + 1)]
  }
  const tr = headState.tr.replaceWith(0, headState.doc.nodeSize-2, newNodes)
  return headState.apply(tr)
}

/** Get the first matching meta/link/base/style/script/noscript element.*/
export function getHeadElement(headState: EditorState,  matcher: Matcher = () => false) {
  let result: {node: Node, pos: number} | undefined
  headState.doc.descendants((node, pos, parent, index) => {
    if(matcher(node, pos, parent, index)) {
      result = {node, pos}
      return false
    }
  })
  return result
}

/** Get all matching meta/link/base/style/script/noscript elements.*/
export function getHeadElementAll(headState: EditorState,  matcher: Matcher = () => false) {
  let result: {node: Node, pos: number}[] = []
  headState.doc.descendants((node, pos, parent, index) => {
    if(matcher(node, pos, parent, index)) {
      result.push({node, pos})
    }
  })
  return result
}


/** Delete a matching meta/link/base/style/script/noscript element.*/
export function deleteHeadElement(headState: EditorState,  matcher: Matcher) {
  let existingNode: Node, existingPos = 0
  headState.doc.descendants((node, pos, parent, index) => {
    if(matcher(node, pos, parent, index)) {
      existingPos = pos
      existingNode = node
      return false
    }
  })
  const resolved = headState.doc.resolve(existingPos!)
  const tr = headState.tr.delete(resolved.pos, resolved.pos + (existingNode!?.nodeSize ?? 1))
  return headState.apply(tr)
}


export const headSerializer = DOMSerializer.fromSchema(headSchema)
export const headParser = DOMParser.fromSchema(headSchema)

export type EditorStateWithHead =  EditorState & {"head$": EditorState}

const key = new PluginKey("head")

export function headEqual(a: EditorState | undefined, b: EditorState | undefined) {
  if(!a || !b) {
    return false
  }
  const attrsEqual = isEqual(a.doc.attrs, b.doc.attrs)
  const contentEqual = a.doc.content.eq(b.doc.content)
  return attrsEqual && contentEqual
}

export function head(styles: string[], scripts: string[]) {
  return new Plugin({
    key,
    state: {
      init(config, instance) {
        return initialHeadState()
      },
      apply(tr, value, oldState, newState) {
        return value
      },
    },
    view: ((view: EditorView & {state: EditorStateWithHead}) => {
      const document = view.dom.ownerDocument
      const head = document.head
      const window = document.defaultView

      for(const styleString of styles) {
        const style = document.createElement("style")
        style.innerHTML = styleString
        style.toggleAttribute("data-ww-editing")
        head.appendChild(style)
      }

      for(const scriptString of scripts) {
        const script = document.createElement("script")
        script.innerHTML = scriptString
        script.type = "module"
        script.toggleAttribute("data-ww-editing")
        head.appendChild(script)
        window!.eval(scriptString)
      }

      return {
        update(view: EditorView & {state: EditorStateWithHead}, prevState: EditorStateWithHead) {
          const head$ = view.state.head$
          const prevHead$ = prevState.head$
          if(!headEqual(head$, prevHead$)) {
            const head = view.dom.ownerDocument.head
            const headDOM = headSerializer.serializeNode(head$.doc)
            const oldNodes = head.querySelectorAll("[data-ww-editing]")
            oldNodes.forEach(node => headDOM.appendChild(node))
            head.replaceWith(headDOM)
          }
        },
        destroy() {
          const oldNodes = view.dom.ownerDocument.head.querySelectorAll("[data-ww-editing]")
          oldNodes.forEach(node => node.remove())
        }
      }
    }) as any
  })
}