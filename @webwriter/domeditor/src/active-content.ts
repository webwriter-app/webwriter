import {isUnsafeElementAttributeName, isUnsafeElementAttributeValue} from "./element-attributes"

/** MIME type essences browsers execute as classic scripts. */
const javaScriptMimeTypes = new Set([
  "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript",
  "text/ecmascript", "text/javascript", "text/javascript1.0", "text/javascript1.1", "text/javascript1.2",
  "text/javascript1.3", "text/javascript1.4", "text/javascript1.5", "text/jscript", "text/livescript",
  "text/x-ecmascript", "text/x-javascript",
])

/** Whether a script `type` is an inert data block type: a MIME type that
 * browsers never execute, such as `application/json`. */
export function isDataBlockType(type: string) {
  const essence = type.split(";")[0].trim().toLowerCase()
  return /^[^\s/]+\/[^\s/]+$/.test(essence) && !javaScriptMimeTypes.has(essence)
}

/** A widget's data container: an inert `<script>` data block that is a
 * direct child of a custom element. It is widget state, not executable
 * content, so the editor keeps it. */
export function isWidgetDataContainer(node: Node | null): node is HTMLScriptElement {
  if(!(node instanceof Element) || node.localName !== "script" || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return false
  const parent = node.parentElement
  return !!parent && (parent.localName.includes("-") || parent.hasAttribute("is"))
    && node.hasAttribute("type") && isDataBlockType(node.getAttribute("type")!) && !node.hasAttribute("src")
}

const unsafeElementSelector = "script, style, iframe, object, embed, base, meta[http-equiv='refresh'], link[rel='import'], link[rel~='stylesheet']"
const youtubeEmbedHosts = new Set(["www.youtube.com", "www.youtube-nocookie.com"])

/** YouTube's documented `/embed/VIDEO_ID` endpoint needs a non-opaque origin
 * for its player cache access. Keep this exception limited to the two exact
 * HTTPS hosts and the video embed path; all other frames stay opaque-origin. */
function isYoutubeEmbedURL(url: URL) {
  return url.protocol === "https:"
    && youtubeEmbedHosts.has(url.hostname)
    && !url.username
    && !url.password
    && !url.port
    && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)
}

export type ActiveContentStripOptions = {
  /** Retain document CSS in a preview constrained by its own CSP. */
  allowStyles?: boolean
  /** Retain remote HTTPS embeds in a script sandbox. */
  allowIframes?: boolean
  /** Retain local blob and HTML data URL embeds in a script sandbox. */
  allowLocalIframes?: boolean
  /** Strip dialog and heading-group wrappers from incoming content, retaining their children. */
  unwrapUnsupportedElements?: boolean
  removeAttribute?: (attribute: Attr) => boolean
  removeClass?: (className: string) => boolean
}

/** Removes executable elements and active attributes from detached content.
 * Returns the number of elements and attributes removed. Template contents
 * are traversed explicitly because they are not descendants in the DOM tree. */
export function stripActiveContent(root: ParentNode, options: ActiveContentStripOptions = {}) {
  let removed = 0
  const localIframes = new Set<Element>()
  if(options.unwrapUnsupportedElements) {
    root.querySelectorAll("dialog, hgroup").forEach(element => {
      if(element.namespaceURI !== "http://www.w3.org/1999/xhtml") return
      element.replaceWith(...Array.from(element.childNodes))
      removed++
    })
  }
  root.querySelectorAll(unsafeElementSelector).forEach(element => {
    if(isWidgetDataContainer(element)) return
    if(options.allowStyles && (element.localName === "style" || element.matches("link[rel~=stylesheet]"))) return
    if((options.allowIframes || options.allowLocalIframes) && element.localName === "iframe") {
      try {
        const source = element.getAttribute("src") ?? ""
        const url = new URL(source)
        const isLocalHTMLDataURL = url.protocol === "data:"
          && /^text\/html(?:;[^,]*)?,/i.test(url.pathname)
        const isLocal = options.allowLocalIframes
          && (url.protocol === "blob:" || isLocalHTMLDataURL)
        const isRemote = options.allowIframes && url.protocol === "https:" && !url.username && !url.password
        if(isLocal || isRemote) {
          element.setAttribute("sandbox", isYoutubeEmbedURL(url)
            && isRemote ? "allow-scripts allow-same-origin" : "allow-scripts")
          if(isLocal) localIframes.add(element)
          return
        }
      }
      catch { /* Missing, relative and active URLs are not embeddable. */ }
    }
    element.remove()
    removed++
  })
  const elements = root.nodeType === Node.ELEMENT_NODE
    ? [root as Element, ...Array.from(root.querySelectorAll<Element>("*"))]
    : Array.from(root.querySelectorAll<Element>("*"))
  elements.forEach(element => {
    for(const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const isValidatedLocalIframeSource = localIframes.has(element) && name === "src"
      if(isUnsafeElementAttributeName(name)
        || isUnsafeElementAttributeValue(name, attribute.value) && !isValidatedLocalIframeSource
        || options.removeAttribute?.(attribute)) {
        element.removeAttribute(attribute.name)
        removed++
      }
      else if(name === "class" && options.removeClass) {
        const classes = attribute.value.split(/\s+/).filter(Boolean)
        const retained = classes.filter(className => !options.removeClass!(className))
        if(retained.length !== classes.length) {
          if(retained.length) element.setAttribute("class", retained.join(" "))
          else element.removeAttribute("class")
        }
      }
    }
    if(element.localName === "template") {
      const content = (element as HTMLTemplateElement).content
      if(content?.nodeType === 11) removed += stripActiveContent(content, options)
    }
  })
  return removed
}
