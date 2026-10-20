import {ensureDefaultDocumentTheme} from "./document-themes"
import {language, t} from "./site-language"
import type {WebWriterPackageRegistry} from "./packages"
import {loadDocumentPackages} from "./package-dependencies"
import exampleDocuments from "./example-documents.json"
import {boardStyles, canvasStyles, slidesStyles, type DocumentLayoutMode} from "./document-layout"

export {exampleDocuments}

export type ExampleDocument = typeof exampleDocuments[number]
const sources = import.meta.glob("../examples/subjects/**/*.html", {query: "?raw", import: "default"}) as Record<string, () => Promise<string>>

export const findExampleDocument = (id: string | null) => exampleDocuments.find(example => example.id === id)

export const exampleDocumentLayout = (value: string | null): DocumentLayoutMode =>
  value === "canvas" || value === "slides" || value === "board" ? value : "document"

/** Compose the curated lessons from their authored topic boundaries. This is
 * deliberately not a general-purpose conversion of user documents. */
function arrangeExample(source: Document, mode: DocumentLayoutMode) {
  if(mode === "document") return
  const sections: HTMLElement[] = []
  for(const node of [...source.body.childNodes]) {
    if(!sections.length || node.nodeType === Node.ELEMENT_NODE && (node as Element).matches("h2")) {
      const section = source.createElement("section")
      section.className = "ww-example-section"
      sections.push(section)
    }
    sections.at(-1)!.append(node)
  }
  source.body.classList.add(`ww-${mode}`)
  const style = source.createElement("style")
  style.textContent = {canvas: canvasStyles, slides: slidesStyles, board: boardStyles}[mode] + `
    .ww-example-section { box-sizing: border-box; overflow-wrap: anywhere; }
    .ww-example-section > :first-child { margin-top: 0; }
    .ww-example-section > :last-child { margin-bottom: 0; }
    .ww-example-section > :not(style, script) { min-inline-size: 0; max-inline-size: 100%; }
    .ww-example-section :is(img, svg, video, iframe, table) { max-width: 100%; }
    .ww-example-section :is(img, svg, video) { height: auto; }
    .ww-example-section table { min-width: 0; width: 100%; table-layout: fixed; overflow-wrap: anywhere; }
    body.ww-canvas > .ww-example-section { padding: 2rem; border: 1px solid #d4deea; border-radius: .75rem; background: white; box-shadow: 0 4px 16px #26374a0a; }
    body.ww-board .ww-example-section { overflow: auto; }
    body.ww-slides .ww-example-section { left: 64px; top: 48px; width: 1152px; height: 600px; padding: 1rem; overflow: auto; }
    body.ww-slides .ww-example-section > :is(p, ul, ol) { max-inline-size: 65ch; }
    body.ww-slides .ww-example-section :is(img, svg, video) { max-height: 340px; object-fit: contain; }
  `
  source.head.append(style)
  if(mode === "canvas") {
    sections.forEach((section, index) => {
      Object.assign(section.style, {left: `${40 + index * 680}px`, top: `${index % 2 ? 100 : 40}px`, width: "640px"})
      source.body.append(section)
    })
  }
  else if(mode === "board") {
    for(const section of sections) {
      const column = source.createElement("section")
      column.className = "ww-board-column"
      if(section.firstElementChild?.matches("h2")) column.append(section.firstElementChild)
      const card = source.createElement("article")
      card.className = "ww-board-card ww-example-section"
      card.append(...section.childNodes)
      column.append(card)
      source.body.append(column)
    }
  }
  else {
    // Give media and activities their own slides instead of squeezing an entire
    // topic into a single fixed-size slide. Keep every authored node in order.
    const pages = sections.flatMap(section => {
      const pages: HTMLElement[] = [section.cloneNode(false) as HTMLElement]
      let height = 0
      for(const node of [...section.childNodes]) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null
        const activity = element && (element.localName.includes("-") || element.matches("iframe") || element.querySelector("iframe"))
        const cost = !element ? 0 : activity ? 480 : element.matches("figure") ? 380
          : element.matches("table") ? 80 + element.querySelectorAll("tr").length * 45
          : element.matches("h1, h2") ? 80 : 35 + Math.ceil((element.textContent?.length ?? 0) / 100) * 28
        if(height && height + cost > 500) {
          pages.push(section.cloneNode(false) as HTMLElement)
          height = 0
        }
        pages.at(-1)!.append(node)
        height += cost
      }
      return pages
    })
    const viewport = source.createElement("div")
    viewport.className = "ww-slides-viewport"
    const navigation = source.createElement("nav")
    navigation.className = "ww-slides-navigation"
    navigation.setAttribute("aria-label", t("Slides"))
    pages.forEach((section, index) => {
      const slide = source.createElement("section")
      slide.className = "ww-slide"
      slide.id = `example-${crypto.randomUUID()}`
      slide.tabIndex = -1
      slide.append(section)
      viewport.append(slide)
      const link = source.createElement("a")
      link.href = `#${slide.id}`
      link.textContent = String(index + 1)
      link.setAttribute("aria-label", section.querySelector("h1, h2")?.textContent ?? String(index + 1))
      navigation.append(link)
    })
    source.body.append(viewport, navigation)
  }
}

/** Only bundled, curated documents can be opened by an example link. */
export async function loadExampleDocument(id: string, layout: DocumentLayoutMode = "document"): Promise<Document> {
  const example = findExampleDocument(id)
  const locale = language()
  const load = example && sources[`../examples/subjects/${locale === "en" ? "" : `${locale}/`}${example.id}.html`]
  if(!load) throw new Error("This example could not be found.")
  const source = new DOMParser().parseFromString(await load(), "text/html")
  ensureDefaultDocumentTheme(source)
  arrangeExample(source, exampleDocumentLayout(layout))
  return source
}

/** Resolve example packages while keeping preview assets limited to used widgets. */
export async function loadExamplePackages(source: Document, registry?: WebWriterPackageRegistry) {
  const {galleryPreviewPackages} = await import("./widget-gallery")
  return galleryPreviewPackages(source, await loadDocumentPackages(source, registry))
}
