import {sanitizePackageSnippet, type PackageMember, type WebWriterPackage} from "./packages"
import {defaultDocumentTheme} from "./document-themes"

export type GalleryWidget = {pkg: WebWriterPackage, member: PackageMember}

/** One searchable card per published WebWriter package. */
export function galleryPackages(packages: WebWriterPackage[], query = ""): WebWriterPackage[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return packages.filter(pkg => {
    if(!pkg.name.startsWith("@webwriter/")) return false
    const text = [pkg.name, pkg.label, pkg.description, ...pkg.keywords,
      ...pkg.members.flatMap(member => [member.label, member.description, member.tagName])].join(" ").toLocaleLowerCase()
    return words.every(word => text.includes(word))
  }).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name))
}

/** Reuse the surrounding activity when the selected export is a nested component. */
export function galleryExample(html: string, {pkg, member}: GalleryWidget): string | null {
  const sanitized = sanitizePackageSnippet(html)
  if(member.kind === "snippet") return sanitized || null
  const source = new DOMParser().parseFromString(sanitized, "text/html")
  let example = source.getElementsByTagName(member.tagName!)[0]
  if(!example) return null
  const tags = new Set(pkg.members.filter(item => item.kind === "widget").map(item => item.tagName))
  for(let parent = example.parentElement; parent && parent !== source.body; parent = parent.parentElement) {
    if(tags.has(parent.localName)) example = parent
  }
  return example.outerHTML
}

/** Detached demo content, with ordinary learner interaction and no editing mode. */
export function galleryDocument(html: string, title: string): Document {
  const source = new DOMParser().parseFromString(sanitizePackageSnippet(html), "text/html")
  source.title = title
  source.documentElement.lang = document.documentElement.lang || "en"
  source.querySelectorAll("[contenteditable]").forEach(element => element.removeAttribute("contenteditable"))
  source.body.contentEditable = "false"
  source.designMode = "off"
  const viewport = source.createElement("meta")
  viewport.name = "viewport"
  viewport.content = "width=device-width, initial-scale=1"
  const style = source.createElement("style")
  style.textContent = `${defaultDocumentTheme.source}\nhtml {background: white} body {box-sizing: border-box; min-width: 0; margin: 0; padding: 1.5rem; color: #263142; font: 1rem/1.6 system-ui, sans-serif; overflow-wrap: anywhere} img, video {max-width: 100%}`
  source.head.append(viewport, style)
  return source
}

/** Include packages used by nested widgets in a publisher's example. */
export function galleryPreviewPackages(source: Document, packages: WebWriterPackage[], preferred?: WebWriterPackage) {
  const claimed = new Set<string>()
  const ordered = preferred ? [preferred, ...packages.filter(pkg => pkg.name !== preferred.name)] : packages
  return ordered.flatMap(pkg => {
    const present = pkg.members.filter(member => member.kind === "widget" && member.tagName
      && source.getElementsByTagName(member.tagName).length > 0)
    const members = present.filter(member => !claimed.has(member.tagName!))
    if(!members.length) return []
    members.forEach(member => claimed.add(member.tagName!))
    const used = (url: string, property: "scriptUrl" | "styleUrl") => members.some(member => member[property] === url)
      || !pkg.members.some(member => member[property] === url)
    return [{...pkg, members: pkg.members.filter(member => member.kind !== "widget" || members.includes(member)),
      scripts: pkg.scripts.filter(url => used(url, "scriptUrl")),
      styles: pkg.styles.filter(url => used(url, "styleUrl")),
    }]
  })
}
