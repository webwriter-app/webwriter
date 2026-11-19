import {sandboxDocument} from "../../widget/sandbox.js"
import {clearWebsiteDocument, ownsWebsiteDocument, setWebsiteDocument, websiteDocumentMarker} from "./editor-artifacts"

/** Only local HTML resources use the runner. Remote sites keep navigation. */
export function isLocalWebsiteSource(source: string) {
  return /^blob:/i.test(source) || /^data:text\/html(?:;|,)/i.test(source)
}

/** Decode without normalizing the original URL/bytes retained in src. */
export function localWebsiteHTML(source: string): string | null {
  if(!/^data:text\/html(?:;|,)/i.test(source)) return null
  return dataURLText(source)
}

/** Decode local data without fetching it (also used to check offline scripts). */
export function dataURLText(source: string): string | null {
  if(!/^data:/i.test(source)) return null
  const comma = source.indexOf(",")
  if(comma < 0) return null
  try {
    const header = source.slice(0, comma)
    const fragment = source.indexOf("#", comma + 1)
    const data = source.slice(comma + 1, fragment < 0 ? undefined : fragment)
    let bytes: Uint8Array
    if(/;base64$/i.test(header)) bytes = Uint8Array.from(atob(decodeURIComponent(data)), character => character.charCodeAt(0))
    else {
      const decoded: number[] = [], encoder = new TextEncoder()
      for(let offset = 0; offset < data.length;) {
        if(data[offset] === "%" && /^[\da-f]{2}$/i.test(data.slice(offset + 1, offset + 3))) {
          decoded.push(parseInt(data.slice(offset + 1, offset + 3), 16))
          offset += 3
        }
        else {
          const character = String.fromCodePoint(data.codePointAt(offset)!)
          decoded.push(...encoder.encode(character))
          offset += character.length
        }
      }
      bytes = new Uint8Array(decoded)
    }
    return new TextDecoder(header.match(/;charset=([^;]+)/i)?.[1] ?? "utf-8").decode(bytes)
  }
  catch { return null }
}

/** Restore the source-only representation when reopening an export. */
export function restoreWebsiteFrames(root: ParentNode) {
  for(const frame of root.querySelectorAll(`iframe[${websiteDocumentMarker}=""]`)) {
    frame.removeAttributeNS(null, "srcdoc")
    frame.removeAttribute(websiteDocumentMarker)
  }
  root.querySelectorAll<HTMLTemplateElement>("template").forEach(template => restoreWebsiteFrames(template.content))
}

/** Add portable execution resources to a detached preview/export. Original
 * src remains intact and makes reopening independent of the runner version. */
export function prepareWebsiteFrames(root: ParentNode) {
  for(const frame of root.querySelectorAll<HTMLIFrameElement>("iframe[src]")) {
    if(frame.hasAttributeNS(null, "srcdoc") || insideWidget(frame) || !permitsScripts(frame)) continue
    const html = localWebsiteHTML(frame.getAttribute("src") ?? "")
    if(html === null) continue
    frame.setAttribute(websiteDocumentMarker, "")
    frame.srcdoc = sandboxDocument(html)
  }
  root.querySelectorAll<HTMLTemplateElement>("template").forEach(template => {
    if(!insideWidget(template)) prepareWebsiteFrames(template.content)
  })
}

function insideWidget(element: Element) {
  for(let node: Element | null = element; node; node = node.parentElement) {
    if(node.localName.includes("-") || node.hasAttribute("is")) return true
  }
  return false
}

function permitsScripts(frame: Element) {
  const sandbox = frame.getAttribute("sandbox")
  return sandbox === null || sandbox.toLowerCase().split(/\s+/).includes("allow-scripts")
}

/** Owns only derived iframe resources, never widget internals or authored
 * srcdoc. All asynchronous reads recheck the current element and source. */
export class WebsiteSandbox {
  private readonly frames = new Map<HTMLIFrameElement, {source: string}>()
  private active = true
  private observer?: MutationObserver

  constructor(private readonly root: HTMLElement, private readonly read: (source: string) => Promise<Blob>,
    private readonly eligible: (frame: HTMLIFrameElement) => boolean = frame => !insideWidget(frame)) {}

  /** Previews have no MediaFeature observer, but still receive live DOM edits. */
  observe() {
    if(!this.active) return
    const Observer = this.root.ownerDocument.defaultView?.MutationObserver
    if(Observer && !this.observer) {
      this.observer = new Observer(() => this.refresh())
      this.observer.observe(this.root, {childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcdoc", "sandbox"]})
    }
    this.refresh()
  }

  refresh() {
    if(!this.active) return
    for(const [frame, state] of this.frames) {
      if(!this.root.contains(frame) || frame.getAttribute("src") !== state.source || !this.eligible(frame) || !permitsScripts(frame)
        || frame.hasAttributeNS(null, "srcdoc") && !ownsWebsiteDocument(frame)) {
        clearWebsiteDocument(frame)
        this.frames.delete(frame)
      }
    }
    for(const frame of this.root.querySelectorAll<HTMLIFrameElement>("iframe[src]")) {
      if(this.frames.has(frame) || !this.eligible(frame) || !permitsScripts(frame)) continue
      if(frame.hasAttributeNS(null, "srcdoc") && !ownsWebsiteDocument(frame)) continue
      const source = frame.getAttribute("src")!
      if(!isLocalWebsiteSource(source)) continue
      const state = {source}
      this.frames.set(frame, state)
      const valid = () => this.active && this.frames.get(frame) === state && this.root.contains(frame)
        && frame.getAttribute("src") === source && this.eligible(frame) && permitsScripts(frame)
        && (!frame.hasAttributeNS(null, "srcdoc") || ownsWebsiteDocument(frame))
      const apply = (html: string) => { if(valid()) setWebsiteDocument(frame, sandboxDocument(html)) }
      const html = localWebsiteHTML(source)
      if(html !== null) apply(html)
      else if(/^blob:/i.test(source)) {
        // Cancel the raw HTML navigation before its scripts hit the editor
        // policy. The original asset stays in src while its text is read.
        setWebsiteDocument(frame, sandboxDocument(""))
        void this.read(source).then(async blob => {
          if(blob.type && !/^text\/html(?:;|$)/i.test(blob.type)) {
            if(valid()) clearWebsiteDocument(frame)
            return
          }
          apply(await blob.text())
        }).catch(() => {
          if(valid()) clearWebsiteDocument(frame)
        })
      }
    }
  }

  dispose() {
    this.active = false
    this.observer?.disconnect()
    this.observer = undefined
    for(const frame of this.frames.keys()) clearWebsiteDocument(frame)
    this.frames.clear()
  }
}
