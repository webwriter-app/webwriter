export const originalURLAttribute = (name: string) => `data-webwriter-original-${name.replace(":", "-")}`
export const originalPackageEntriesAttribute = "data-webwriter-original-package-entries"
export const offlinePackageStyleAttribute = "data-webwriter-offline-package-style"

/** The DOM nodes used to assemble a document export, including disconnected copies. */
export type HTMLDocumentParts = Pick<Document, "documentElement" | "head" | "body" | "baseURI">

// Full URL attributes may contain spaces and SVG markup. The other branch
// handles URLs embedded in CSS and comma-separated base64 srcset candidates.
const inlineMedia = /\b(?:src|poster|data|(?:xlink:)?href)\s*=\s*(["'])(data:(?:(?:image|audio|video)\/[\w.+-]+|application\/octet-stream)[^\s"',]*,[\s\S]*?)\1|data:(?:(?:image|audio|video)\/[\w.+-]+|application\/octet-stream)(?:;(?!base64,)[\w=.+-]+)*(?:;base64,[\da-z+/=]*|,[^\s"'<>)]*)/gi

/** Locate embedded assets without parsing the HTML or loading its resources. */
export function* inlineMediaHTML(html: string) {
  for(const match of html.matchAll(inlineMedia)) {
    const url = match[2] ?? match[0]
    yield {url, offset: match.index! + match[0].indexOf(url)}
  }
}

/** Escape a value inserted into a double-quoted HTML attribute. */
export const escapeHTMLAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")

export function serializeDoctype(doctype: DocumentType | null) {
  if(!doctype) return ""
  const publicId = doctype.publicId ? ` PUBLIC \"${doctype.publicId}\"` : ""
  const systemId = doctype.systemId
    ? `${doctype.publicId ? "" : " SYSTEM"} \"${doctype.systemId}\"`
    : ""
  return `<!DOCTYPE ${doctype.name}${publicId}${systemId}>`
}
