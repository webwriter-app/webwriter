import {ensureDefaultDocumentTheme} from "./document-themes"
import {language} from "./site-language"
import type {WebWriterPackageRegistry} from "./packages"
import {loadDocumentPackages} from "./package-dependencies"
import exampleDocuments from "./example-documents.json"
import type {DocumentLayoutMode} from "./document-layout"

export {exampleDocuments}

export type ExampleDocument = typeof exampleDocuments[number]
const sources = import.meta.glob("../examples/subjects/**/*.html", {query: "?raw", import: "default"}) as Record<string, () => Promise<string>>

/** Examples are authored in German and English; other site languages use English. */
const translatedLocales = new Set(["de"])

/** Media shared by both language versions lives in the site's public assets. */
const exampleMediaPath = "/assets/examples/"

export const findExampleDocument = (id: string | null) => exampleDocuments.find(example => example.id === id)

/** Older links may still carry a layout; examples now keep the layout they were authored in. */
export const exampleDocumentLayout = (value: string | null): DocumentLayoutMode =>
  value === "canvas" || value === "slides" || value === "board" ? value : "document"

/** Shared media must keep working in preview frames and downloaded copies. */
function resolveExampleMedia(source: Document) {
  const base = new URL(`${import.meta.env.BASE_URL}assets/examples/`, location.href)
  for(const element of source.querySelectorAll(`[src^="${exampleMediaPath}"], [href^="${exampleMediaPath}"], [poster^="${exampleMediaPath}"]`)) {
    for(const name of ["src", "href", "poster"]) {
      const value = element.getAttribute(name)
      if(value?.startsWith(exampleMediaPath)) element.setAttribute(name, new URL(value.slice(exampleMediaPath.length), base).href)
    }
  }
}

/** Only bundled, curated documents can be opened by an example link. */
export async function loadExampleDocument(id: string, _layout?: DocumentLayoutMode): Promise<Document> {
  const example = findExampleDocument(id)
  const locale = language()
  const load = example && ((translatedLocales.has(locale) ? sources[`../examples/subjects/${locale}/${example.id}.html`] : undefined)
    ?? sources[`../examples/subjects/${example.id}.html`])
  if(!load) throw new Error("This example could not be found.")
  const source = new DOMParser().parseFromString(await load(), "text/html")
  ensureDefaultDocumentTheme(source)
  resolveExampleMedia(source)
  return source
}

/** Resolve example packages while keeping preview assets limited to used widgets. */
export async function loadExamplePackages(source: Document, registry?: WebWriterPackageRegistry) {
  const {galleryPreviewPackages} = await import("./widget-gallery")
  return galleryPreviewPackages(source, await loadDocumentPackages(source, registry))
}
