import metadata from "./assets/font-previews/metadata.json"

// Import URLs, not image bytes: Vite fingerprints each chunk for cache invalidation.
const chunks = import.meta.glob<string>("./assets/font-previews/chunk-*.webp", {eager: true, query: "?url", import: "default"})
const families = new Map(metadata.families.map((family, index) => [family, index]))

/** Coordinates belong to the catalog family, independent of search order. */
export function fontPreview(family: string) {
  const index = families.get(family)
  if(index === undefined) return
  const url = chunks[`./assets/font-previews/chunk-${Math.floor(index / metadata.chunkSize)}.webp`]
  if(!url) return
  return {url, width: metadata.width / 2, height: metadata.rowHeight / 2, offset: index % metadata.chunkSize * metadata.rowHeight / 2}
}
