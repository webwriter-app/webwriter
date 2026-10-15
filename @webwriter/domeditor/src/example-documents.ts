import {ensureDefaultDocumentTheme} from "./document-themes"
import {language} from "./site-language"
import type {WebWriterPackageRegistry} from "./packages"

export const exampleDocuments = [
  {id: "food-web", subject: "Biology", title: "Who eats what in the garden?", description: "Explore observation tabs, animal photographs, and birdsong to build a garden food chain.", duration: "20 min"},
  {id: "printing", subject: "History", title: "How printing changed the page", description: "Explore a printing timeline and compare digitized pages from China and Europe.", duration: "20 min"},
  {id: "binary", subject: "Computer science", title: "Count like a computer", description: "Edit and run a JavaScript experiment to discover how four bits become a number.", duration: "15 min"},
  {id: "rhythm", subject: "Arts", title: "Build a rhythm from everyday sounds", description: "Listen for a steady pulse, explore layered percussion, and create a repeatable rhythm with everyday sounds.", duration: "20 min"},
  {id: "cafe", subject: "Languages", title: "Order a snack in Spanish", description: "Learn useful Spanish café vocabulary and practice a polite snack order through a menu, puzzle, and dialogue.", duration: "20 min"},
  {id: "shared-space", subject: "Social science", title: "Who gets space on our street?", description: "Explore fictional street redesign choices and weigh how walking, buses, cycling, and deliveries share limited public space.", duration: "20 min"},
  {id: "kitchen-elements", subject: "Chemistry", title: "What is a kitchen made of?", description: "Explore aluminium foil, copper wire, and pencil graphite to distinguish elements, mixtures, and compounds.", duration: "20 min"},
  {id: "river-bends", subject: "Earth science", title: "Why does a river bend?", description: "Explore the Moselle near Bremm and use a model to connect river bends with erosion and deposition.", duration: "20 min"},
  {id: "swings", subject: "Physics", title: "What changes a swing’s rhythm?", description: "Use PhET Pendulum Lab to compare how mass and length affect a pendulum’s period.", duration: "20 min"},
  {id: "garden-design", subject: "Mathematics", title: "Same fence, different garden", description: "Compare garden plans and drag a geometry slider to explore area with a fixed perimeter.", duration: "20 min"},
] as const

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
