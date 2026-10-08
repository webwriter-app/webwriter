import {documentLayoutMode} from "./document-layout"
import {getDocumentRoot} from "./document-template"

/** Authored metadata records which fragment IDs follow their content on edit.
 * Readers need only the IDs, and never modify this metadata or the body. */
export const generatedIDMetadata = "webwriter-generated-id"

export function documentSlug(text: string, fallback: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || fallback
}

export function updateDocumentPermalinks(root: HTMLElement) {
  const document = root.ownerDocument
  if(root !== document.body || !document.head || getDocumentRoot(root) !== root || documentLayoutMode(root) !== "document") return
  const targets = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, figure, table"))
    .filter(element => {
      for(let node: Element | null = element; node && node !== root; node = node.parentElement) {
        if(node.namespaceURI !== "http://www.w3.org/1999/xhtml" || node.localName.includes("-") || node.hasAttribute("is")) return false
      }
      return !element.closest(".◆editor-only, [data-webwriter-editor-only]")
    })
  const metadata = Array.from(document.head.querySelectorAll<HTMLMetaElement>(`meta[name="${generatedIDMetadata}"]`))
  const owners = new Map(metadata.map(meta => [meta.content, meta]))
  const claimed = new Set<HTMLMetaElement>()
  const used = new Map<string, number>()
  document.querySelectorAll("[id]").forEach(element => used.set(element.id, (used.get(element.id) ?? 0) + 1))
  for(const target of targets) {
    const previous = target.id
    let meta = owners.get(previous)
    if(previous && !meta) continue
    if(meta && claimed.has(meta)) meta = undefined
    const caption = target.matches("figure") ? Array.from(target.children).find(child => child.localName === "figcaption")
      : target.matches("table") ? Array.from(target.children).find(child => child.localName === "caption") : target
    // Widgets are atomic even when they appear inside a native heading/caption.
    const text = (node: Node): string => node.nodeType === 3 ? node.textContent ?? ""
      : node.nodeType === 1 && ((node as Element).localName.includes("-") || (node as Element).hasAttribute("is")) ? ""
      : Array.from(node.childNodes).map(text).join("")
    const slug = documentSlug(caption ? text(caption) : "", target.matches("figure, table") ? target.localName : "heading")
    if(previous) used.set(previous, (used.get(previous) ?? 1) - 1)
    let id = slug, suffix = 2
    // Retain a collision suffix when the content still has the same slug.
    if(previous && (previous === slug || previous.startsWith(`${slug}-`) && /^\d+$/.test(previous.slice(slug.length + 1)))
      && !used.get(previous)) id = previous
    else while(used.get(id)) id = `${slug}-${suffix++}`
    used.set(id, (used.get(id) ?? 0) + 1)
    if(target.id !== id) target.id = id
    if(!meta) {
      meta = document.createElement("meta")
      meta.name = generatedIDMetadata
      document.head.append(meta)
    }
    if(meta.content !== id) meta.content = id
    claimed.add(meta)
    // Duplicate IDs produced concurrently get separate ownership records.
  }
  metadata.forEach(meta => { if(!claimed.has(meta)) meta.remove() })
}
