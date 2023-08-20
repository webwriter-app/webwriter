import { SchemaPlugin } from ".";

import mime from "mime/lite"
import {Node, NodeSpec} from "prosemirror-model"

import { MediaType } from "../../packageschema"

/**
 * Top-level media elements are parsed into figures.
 */

const MIME = Object.values((mime as any)._types) as string[]

const MEDIA_GROUPS = [...new Set(MIME.map(t => "_" + new MediaType(`#${t}`).supertype))]

function maybeChildNodeOutputSpec(node: Node, type: MediaType) {
  const result: any[] = []
  if(type.supertype === "image") {
    result.push(["img", {"src": node.attrs["src"], "data-type": String(type)}])
  }
  else if(type.supertype === "audio" || type.supertype === "video") {
    result.push(["source", {"src": node.attrs["src"], "type": String(type).slice(1)}])
  }
  return result
}

const rootTags = {
  "#application/pdf": "embed",
  "application": "script",
  "audio": "audio",
  "font": "script",
  "image": "picture",
  "model": "script",
  "text": "script",
  "video": "video"
}

function detectMediaTypeFromDOM(dom: HTMLElement, rootTag: string) {
  if(rootTag === "picture") {
    return "#" + dom.querySelector("img")?.getAttribute("data-type")
  }
  else if(rootTag === "script" || rootTag === "embed") {
    return "#" + dom.getAttribute("type")
  }
  else {
    return "#" + dom.querySelector("source")?.getAttribute("type")
  }
}

function mediaNodeEntry(mediaType: string): [string, NodeSpec] {
  const parsed = new MediaType(mediaType)
  const supertype = parsed.supertype as keyof typeof rootTags
  const subtype = parsed.subtype
  const rootTag = rootTags[mediaType as keyof typeof rootTags] ?? rootTags[supertype]
  const rootAttrs = (node: Node) => rootTag === "script" || rootTag === "embed"? {src: node.attrs["src"], type: mediaType.slice(1)}: {controls: true}

  const maybeContent = (node: Node) => node.attrs.content? [node.attrs.content]: []

  return [parsed.serialize("node"), {
    group: "_" + supertype,
    attrs: {
      src: {default: undefined},
      content: {default: undefined}
    },
    media: true,
    toDOM: node => [rootTag, rootAttrs(node), ...maybeChildNodeOutputSpec(node, parsed), ...maybeContent(node)],
    parseDOM: [{tag: rootTag, getAttrs: (dom: HTMLElement | string) => {
      const detectedMediaType = detectMediaTypeFromDOM(dom as HTMLElement, rootTag)
      if(typeof dom === "string" || detectedMediaType !== mediaType) {
        return false
      }
      else if(rootTag === "picture") {
        const src = dom.querySelector("img")?.src
        return !src? false: {src}
      }
      else if(rootTag === "audio" || rootTag === "video") {
        const src = dom.querySelector("source")?.src
        return !src? false: {src}
      }
      else {
        console.log(rootTag)
        const src = (dom as HTMLScriptElement | HTMLEmbedElement)?.src
        return {src, content: dom.innerText}
      }
    }}]
  }]
}

export const mediaPlugin = () => ({
  nodes: {
    ...Object.fromEntries(MIME
      .map(mediaType => `#${mediaType}`)
      .map(mediaNodeEntry)),
    figure: {
      group: "container",
      content: `(${MEDIA_GROUPS.join(" | ")}) figcaption?`,
      toDOM: () => ["figure", 0],
      parseDOM: [{tag: "figure"}]
    },
    figcaption: {
      group: "container",
      content: "inline*",
      toDOM: () => ["figcaption", 0],
      parseDOM: [{tag: "figcaption"}]
    },
    attachment: {
      group: "container",
      content: `${MEDIA_GROUPS.join(" | ")}`,
      toDOM: () => ["ww-attachment", 0]
    }
  }
} as SchemaPlugin)