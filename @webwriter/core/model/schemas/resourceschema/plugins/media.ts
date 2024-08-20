import { SchemaPlugin } from ".";

import mime from "mime/lite"
import {Node, NodeSpec} from "prosemirror-model"

import { MediaType } from "../../datatypes"
import { HTMLElementSpec, HTMLElementSpecPair } from "../htmlelementspec";

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
    /*...Object.fromEntries(MIME
      .map(mediaType => `#${mediaType}`)
      .map(mediaNodeEntry)
      .map(([k, v]) => [k, HTMLElementSpec({tag: v.rootTag, ...v})])
    ),*/
    ...HTMLElementSpecPair({
      img: {
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
      },
      img_inline: {group: "phrasing", inline: true}
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
    ...HTMLElementSpecPair({
      picture: {
        tag: "picture",
        group: "flow embedded containerblock",
        content: "(source | scriptsupporting)* img",
        atom: true
      },
      picture_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      audio: {
        tag: "audio",
        group: "flow embedded interactive palpable containerblock",
        content: "(source | track)* flow*",
        atom: true,
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
      },
      audio_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      video: {
        tag: "video",
        group: "flow embedded interactive palpable containerblock",
        content: "source* flow*", // mixed
        atom: true,
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
      },
      video_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      object: {
        tag: "object",
        group: "flow embedded palpable interactive listed submittable formassociated containerblock",
        content: "flow*", // mixed
        atom: true,
        attrs: {
          data: {default: undefined},
          form: {default: undefined},
          height: {default: undefined},
          name: {default: undefined},
          type: {default: undefined},
          usemap: {default: undefined},
          width: {default: undefined}
        }
      },
      object_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      embed: {
        tag: "embed",
        group: "flow embedded interactive palpable", // phrasing
        atom: true,
        attrs: {
          height: {default: undefined},
          src: {default: undefined},
          type: {default: undefined},
          width: {default: undefined}
        }
      },
      embed_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      iframe: {
        tag: "iframe",
        group: "flow embedded interactive palpable", // phrasing
        atom: true,
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
      },
      iframe_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      fencedframe: {
        tag: "fencedframe",
        group: "flow embedded interactive palpable", // phrasing
        atom: true,
        attrs: {
          csp: {default: undefined},
          height: {default: undefined},
          width: {default: undefined}
        }
      },
      fencedframe_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      portal: {
        tag: "portal",
        group: "flow embedded",
        atom: true,
        attrs: {
          referrerpolicy: {default: undefined},
          src: {default: undefined},
        }
      },
      portal_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      script: {
        tag: "script",
        group: "flow metadata scriptsupporting containerinline",
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
      },
      script_inline: {inline: true, group: "phrasing containerinline"}
    }),
    ...HTMLElementSpecPair({
      style: {
        tag: "style",
        group: "flow metadata containerinline",
        content: "text?",
        attrs: {
          media: {default: undefined},
          nonce: {default: undefined},
          title: {default: undefined},
          blocking: {default: undefined},
        }
      },
      style_inline: {inline: true, group: "phrasing containerinline"}
    }),
    ...HTMLElementSpecPair({
      template: {
        tag: "template",
        group: "flow metadata scriptsupporting containerblock",
        content: "flow*"
      },
      template_inline: {inline: true, group: "phrasing containerinline"}
    }),
    ...HTMLElementSpecPair({
      slot: {
        tag: "slot",
        group: "flow containerblock",
        content: "flow*",
        attrs: {
          name: {default: undefined},
        }
      },
      slot_inline: {inline: true, group: "phrasing containerinline"}
    }),
    ...HTMLElementSpecPair({
      noscript: {
        tag: "noscript",
        group: "flow metadata containerblock",
        content: "flow*"
      },
      noscript_inline: {inline: true, group: "phrasing containerinline"}
    }),
    ...HTMLElementSpecPair({
      map: {
        tag: "map",
        group: "flow containerblock",
        content: "flow*",
        attrs: {
          name: {default: undefined}
        }
      },
      map_inline: {inline: true, group: "phrasing containerblock"}
    }),
    ...HTMLElementSpecPair({
      area: {
        tag: "area",
        group: "flow",
        attrs: {
          alt: {default: undefined},
          coords: {default: undefined},
          download: {default: undefined},
          href: {default: undefined},
          ping: {default: undefined},
          referrerpolicy: {default: undefined},
          rel: {default: undefined},
          shape: {default: undefined},
          target: {default: undefined}
        }
      },
      area_inline: {inline: true, group: "phrasing"}
    }),
  }
} as SchemaPlugin)