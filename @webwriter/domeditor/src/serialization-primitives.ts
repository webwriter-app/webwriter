export const originalURLAttribute = (name: string) => `data-webwriter-original-${name.replace(":", "-")}`
export const originalPackageEntriesAttribute = "data-webwriter-original-package-entries"
export const offlinePackageStyleAttribute = "data-webwriter-offline-package-style"

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
