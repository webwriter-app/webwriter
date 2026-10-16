import {ensureDefaultDocumentTheme} from "./document-themes"
import {language} from "./site-language"
import type {WebWriterPackageRegistry} from "./packages"
import exampleDocuments from "./example-documents.json"

export {exampleDocuments}

export type ExampleDocument = typeof exampleDocuments[number]
const sources = import.meta.glob("../examples/subjects/**/*.html", {query: "?raw", import: "default"}) as Record<string, () => Promise<string>>

export const findExampleDocument = (id: string | null) => exampleDocuments.find(example => example.id === id)

/** Only bundled, curated documents can be opened by an example link. */
export async function loadExampleDocument(id: string): Promise<Document> {
  const example = findExampleDocument(id)
  const locale = language()
  const load = example && sources[`../examples/subjects/${locale === "en" ? "" : `${locale}/`}${example.id}.html`]
  if(!load) throw new Error("This example could not be found.")
  const source = new DOMParser().parseFromString(await load(), "text/html")
  ensureDefaultDocumentTheme(source)
  return source
}

/** Resolve exactly the pinned widget packages authored into the document. */
export async function loadExamplePackages(source: Document, registry?: WebWriterPackageRegistry) {
  const {WebWriterPackageRegistry} = await import("./packages")
  const {galleryPreviewPackages} = await import("./widget-gallery")
  const activeRegistry = registry ?? new WebWriterPackageRegistry()
  const references = new Map<string, {name: string, version: string}>()
  source.querySelectorAll<HTMLScriptElement>('script[type="module"][src]').forEach(script => {
    const match = script.getAttribute("src")?.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(@webwriter\/[^@/]+)@([^/]+)\//)
    if(match) references.set(`${match[1]}@${match[2]}`, {name: match[1], version: match[2]})
  })
  const packages = await Promise.all([...references.values()].map(reference => activeRegistry.getPackage(reference)))
  const authoredOrder = [...source.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(script => script.getAttribute("src"))
  return galleryPreviewPackages(source, packages).map(pkg => ({...pkg, scripts: [...pkg.scripts].sort((a, b) => {
    const index = (url: string) => { const position = authoredOrder.indexOf(url); return position === -1 ? Infinity : position }
    return index(a) - index(b)
  })}))
}
