import mime from "mime/lite"
import {Node, NodeSpec} from "prosemirror-model"

import { MediaType } from "../packageschema"

const MIME = Object.values((mime as any)._types) as string[]

function maybeChildNodeOutputSpec(node: Node, mediaType: string) {
  const result: any[] = []
  const supertype = mediaType.split("/")[0]
  if(supertype === "image") {
    result.push(["img", {"src": node.attrs["src"], "data-type": mediaType}])
  }
  else if(supertype === "audio" || supertype === "video") {
    result.push(["source", {"src": node.attrs["src"], "type": mediaType}])
  }
  return result
}

const rootTags = {
  "application/pdf": "embed",
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
    return dom.querySelector("img")?.getAttribute("data-type")
  }
  else if(rootTag === "script" || rootTag === "embed") {
    return dom.getAttribute("type")
  }
  else {
    return dom.querySelector("source")?.getAttribute("type")
  }
}

function mediaNodeEntry(mediaType: string): [string, NodeSpec] {
  const parsed = new MediaType(mediaType)
  const supertype = parsed.supertype as keyof typeof rootTags
  const subtype = parsed.subtype
  
  const rootTag = rootTags[mediaType as keyof typeof rootTags] ?? rootTags[supertype]
  const rootAttrs = (node: Node) => rootTag === "script" || rootTag === "embed"? {src: node.attrs["src"], type: mediaType}: {controls: true}

  return [parsed.serialize("node"), {
    group: "_" + supertype,
    attrs: {
      src: {default: undefined}
    },
    toDOM: node => [rootTag, rootAttrs(node), ...maybeChildNodeOutputSpec(node, mediaType)],
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
        const src = (dom as HTMLScriptElement | HTMLEmbedElement)?.src
        return !src? false: {src}
      }
    }}]
  }]
}

export const mediaNodeSpecs = Object.fromEntries(MIME
  .map(mediaType => `#${mediaType}`)
  .map(mediaNodeEntry)
)