import { SchemaPlugin } from ".";

import mime from "mime/lite"
import {Node, NodeSpec} from "prosemirror-model"

import { MediaType } from "../../datatypes"
import { HTMLElementSpec } from "../htmlelementspec";

/**
 * Top-level media elements are parsed into figures.
 */

const MIME = Object.values((mime as any)._types) as string[]

const MEDIA_GROUPS = [...new Set(MIME.map(t => "_" + new MediaType(`#${t}`).supertype))]

function maybeChildNodeOutputSpec(node: Node, type: MediaType) {
  const result: any[] = []
  if(type.supertype === "image") {
    result.push(["img", {"src": node.attrs["src"], "data-type": String(type).slice(1)}])
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

  return [parsed.toString("node"), {
    group: ["flow", "embedded", `_${supertype}`, `_${parsed.toString("node")}`].join(" "),
    attrs: {
      src: {default: undefined},
      content: {default: undefined}
    },
    media: true,
    rootTag,
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
      .map(mediaNodeEntry)
      .map(([k, v]) => [k, HTMLElementSpec({tag: v.rootTag, ...v})])
    ),
    figure: HTMLElementSpec({
      tag: "figure",
      group: "flow palpable",
      content: `(figcaption? flow*) | (flow* figcaption?)`
    }),
    figcaption: HTMLElementSpec({
      tag: "figcaption",
      content: "phrasing*"
    }),
    img: HTMLElementSpec({
      tag: "img",
      group: "flow embedded palpable interactive", // phrasing
      attrs: {
        alt: {default: undefined},
        crossorigin: {default: undefined},
        anonymous: {default: undefined},
        "use-credentials": {default: undefined},
        decoding: {default: undefined},
        sync: {default: undefined},
        async: {default: undefined},
        auto: {default: undefined},
        elementtiming: {default: undefined},
        fetchpriority: {default: undefined},
        height: {default: undefined},
        ismap: {default: undefined},
        loading: {default: undefined},
        referrerpolicy: {default: undefined},
        sizes: {default: undefined},
        src: {default: undefined},
        srcset: {default: undefined},
        usemap: {default: undefined},
      }
    }),
    source: HTMLElementSpec({
      tag: "source",
      attrs: {
        type: {default: undefined},
        src: {default: undefined},
        srcset: {default: undefined},
        sizes: {default: undefined},
        media: {default: undefined},
        height: {default: undefined},
        width: {default: undefined}
      }
    }),
    track: HTMLElementSpec({
      tag: "track",
      attrs: {
        default: {default: undefined},
        kind: {default: undefined},
        label: {default: undefined},
        src: {default: undefined},
        srclang: {default: undefined}
      }
    }),
    picture: HTMLElementSpec({
      tag: "picture",
      group: "flow embedded",
      content: "(source | scriptsupporting)* img"
    }),
    audio: HTMLElementSpec({
      tag: "audio",
      group: "flow embedded interactive palpable",
      content: "(source | track)* flow*",
      attrs: {
        autoplay: {default: undefined},
        controls: {default: undefined},
        crossorigin: {default: undefined},
        disableremoteplayback: {default: undefined},
        loop: {default: undefined},
        muted: {default: undefined},
        preload: {default: undefined},
        src: {default: undefined},
      }
    }),
    video: HTMLElementSpec({
      tag: "video",
      group: "flow embedded interactive palpable",
      content: "source* flow*",
      attrs: {
        autoplay: {default: undefined},
        controls: {default: undefined},
        crossorigin: {default: undefined},
        anonymous: {default: undefined},
        disabledpictureinpicture: {default: undefined},
        disableremoteplayback: {default: undefined},
        height: {default: undefined},
        loop: {default: undefined},
        muted: {default: undefined},
        playsinline: {default: undefined},
        poster: {default: undefined},
        preload: {default: undefined},
        src: {default: undefined},
        width: {default: undefined},
      }
    }),
    object: HTMLElementSpec({
      tag: "object",
      group: "flow embedded palpable interactive listed submittable formassociated",
      content: "flow*",
      attrs: {
        data: {default: undefined},
        form: {default: undefined},
        height: {default: undefined},
        name: {default: undefined},
        type: {default: undefined},
        usemap: {default: undefined},
        width: {default: undefined}
      }
    }),
    embed: HTMLElementSpec({
      tag: "embed",
      group: "flow embedded interactive palpable", // phrasing
      attrs: {
        height: {default: undefined},
        src: {default: undefined},
        type: {default: undefined},
        width: {default: undefined}
      }
    }),
    iframe: HTMLElementSpec({
      tag: "iframe",
      group: "flow embedded interactive palpable", // phrasing
      attrs: {
        allow: {default: undefined},
        allowfullscreen: {default: undefined},
        allowpaymentrequest: {default: undefined},
        credentialless: {default: undefined},
        csp: {default: undefined},
        height: {default: undefined},
        loading: {default: undefined},
        name: {default: undefined},
        referrerpolicy: {default: undefined},
        sandbox: {default: undefined},
        src: {default: undefined},
        srcdoc: {default: undefined},
        width: {default: undefined}
      }
    }),
    portal: HTMLElementSpec({
      tag: "portal",
      group: "flow embedded",
      attrs: {
        referrerpolicy: {default: undefined},
        src: {default: undefined},
      }
    }),
    script: HTMLElementSpec({
      tag: "script",
      group: "flow metadata scriptsupporting",
      content: "text?",
      attrs: {
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
      }
    }),
    style: HTMLElementSpec({
      tag: "style",
      group: "flow metadata",
      content: "text?",
      attrs: {
        media: {default: undefined},
        nonce: {default: undefined},
        title: {default: undefined},
        blocking: {default: undefined},
      }
    }),
    template: HTMLElementSpec({
      tag: "template",
      group: "flow metadata scriptsupporting",
      content: "flow*"
    }),
    slot: HTMLElementSpec({
      tag: "slot",
      group: "flow", // phrasing
      content: "flow*",
      attrs: {
        name: {default: undefined},
      }
    }),
    noscript: HTMLElementSpec({
      tag: "noscript",
      group: "flow metadata", // phrasing
      content: "flow*"
    }),
  }
} as SchemaPlugin)