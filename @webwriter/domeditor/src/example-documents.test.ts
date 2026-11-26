// @vitest-environment happy-dom
import {existsSync} from "node:fs"
import {resolve} from "node:path"
import {afterEach, expect, it, vi} from "vitest"
import {setLanguage, siteLanguages, t} from "./site-language"
import {exampleDocumentLayout, exampleDocuments, findExampleDocument, loadExampleDocument, loadExamplePackages} from "./example-documents"
import {defaultDocumentTheme} from "./document-themes"
import {documentLayoutMode} from "./document-layout"
import type {WebWriterPackageRegistry} from "./packages"

afterEach(() => setLanguage("en", false))

const authoredLayouts = {
  "ahr-valley": "canvas", "printing-press": "board", "machine-learning": "board", "ozone-hole": "canvas",
  "intervals-and-rhythms": "board", "food-chains": "canvas", "pendulum": "document", "heartburn": "document",
} as const
const resources = (source: Document) => [...source.querySelectorAll("script[src], link[href], img[src], audio[src], video[src], source[src], a[href^='http']")]
  .map(element => element.getAttribute("src") ?? element.getAttribute("href"))
const mediaBase = `${location.origin}/assets/examples/`

it("lists one example per subject, with chemistry twice", () => {
  expect(exampleDocuments.map(example => example.id)).toEqual(Object.keys(authoredLayouts))
  expect(exampleDocuments.map(example => example.layout)).toEqual(Object.values(authoredLayouts))
  expect(exampleDocuments.map(example => example.subject)).toEqual(["Geography", "History", "Computer Science", "Chemistry", "Music", "Biology", "Physics", "Chemistry"])
})

it.each(exampleDocuments)("loads the English $id document in its authored layout with the editor's real theme", async example => {
  const source = await loadExampleDocument(example.id)
  expect(source.documentElement.lang).toBe("en")
  expect(source.title).toBe(example.title)
  expect(documentLayoutMode(source.body)).toBe(authoredLayouts[example.id as keyof typeof authoredLayouts])
  expect(source.querySelector("style[data-ww-theme=base]")?.textContent).toBe(defaultDocumentTheme.source)
  expect(source.querySelector('[lang^="de"]')).toBeNull()
  expect(source.querySelector("[contenteditable], [class*='◆']")).toBeNull()
  expect(source.querySelector('script[type="importmap"], script#webwriter-scoped-registry, script#webwriter-canvas-viewer, script#webwriter-document-viewer')).toBeNull()
  const ids = [...source.querySelectorAll("[id]")].map(element => element.id)
  expect(new Set(ids).size).toBe(ids.length)
  const packages = [...source.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(script => script.getAttribute("src")!)
  expect(packages.length).toBeGreaterThan(0)
  expect(packages.every(src => /^https:\/\/cdn\.jsdelivr\.net\/npm\/@webwriter\/[a-z-]+@\d+\.\d+\.\d+\//.test(src))).toBe(true)
  expect(source.documentElement.outerHTML).not.toContain("local-packages")
  const second = await loadExampleDocument(example.id)
  expect(second).not.toBe(source)
})

it.each(exampleDocuments)("keeps $id media in shared files that resolve to absolute site URLs", async example => {
  const source = await loadExampleDocument(example.id)
  const local = resources(source).filter(url => url!.startsWith(mediaBase))
  for(const url of local) {
    expect(url!.startsWith(`${mediaBase}${example.id}/`), url!).toBe(true)
    expect(existsSync(resolve("static-assets/assets/examples", url!.slice(mediaBase.length))), url!).toBe(true)
  }
  const embedded = [...source.querySelectorAll("[src^='data:'], [href^='data:']")].map(element => element.getAttribute("src") ?? element.getAttribute("href"))
  expect(embedded.every(url => url!.length < 12_000)).toBe(true)
})

it("loads German originals in German and the English documents in every other language", async () => {
  for(const example of exampleDocuments) {
    setLanguage("en", false)
    const english = await loadExampleDocument(example.id)
    setLanguage("de", false)
    const german = await loadExampleDocument(example.id)
    expect(german.documentElement.lang).toMatch(/^de/)
    expect(german.title).toBe(t(example.title))
    expect(german.title).not.toBe(english.title)
    expect(documentLayoutMode(german.body)).toBe(documentLayoutMode(english.body))
    expect([...german.body.querySelectorAll("[id]")].map(element => element.id)).toEqual([...english.body.querySelectorAll("[id]")].map(element => element.id))
    expect([...german.querySelectorAll("img[src], audio[src], script[src]")].map(element => element.getAttribute("src"))).toEqual([...english.querySelectorAll("img[src], audio[src], script[src]")].map(element => element.getAttribute("src")))
    for(const locale of Object.keys(siteLanguages).filter(locale => locale !== "en" && locale !== "de")) {
      setLanguage(locale, false)
      expect((await loadExampleDocument(example.id)).documentElement.outerHTML, `${locale}/${example.id}`).toBe(english.documentElement.outerHTML)
    }
  }
})

it("ignores the layout of older links", async () => {
  expect(exampleDocumentLayout("unexpected-layout")).toBe("document")
  for(const layout of ["canvas", "slides", "board"] as const) {
    const source = await loadExampleDocument("pendulum", layout)
    expect(documentLayoutMode(source.body)).toBe("document")
  }
  expect(documentLayoutMode((await loadExampleDocument("food-chains", "slides")).body)).toBe("canvas")
})

it("keeps each lesson's interactive activities and media", async () => {
  const load = loadExampleDocument
  const food = await load("food-chains")
  expect(food.querySelectorAll("webwriter-advance-organizer-page")).toHaveLength(3)
  expect(food.querySelectorAll("webwriter-order-item")).toHaveLength(4)
  expect(food.querySelector("webwriter-advance-organizer-page")?.textContent).toContain("apple tree")
  const printing = await load("printing-press")
  expect(printing.querySelectorAll("webwriter-timeline")).toHaveLength(2)
  expect(printing.querySelectorAll("webwriter-timeline-event")).toHaveLength(12)
  const learning = await load("machine-learning")
  expect([...learning.querySelectorAll("iframe")].map(frame => new URL(frame.src).host)).toEqual(["learningml.org", "clustering-visualizer.web.app", "yushuosun.github.io"])
  expect([...learning.querySelectorAll("a[download]")].map(link => link.getAttribute("download"))).toEqual(["water-bottles.zip", "rucksacks.zip", "test.zip"])
  const music = await load("intervals-and-rhythms")
  expect(music.querySelectorAll("webwriter-music-score")).toHaveLength(4)
  expect(music.querySelector('script[src*="@webwriter/music-score@1.0.0/dist/widgets/webwriter-music-score.js"]')).not.toBeNull()
  expect([...music.querySelectorAll("audio[src]")].every(audio => audio.getAttribute("src")!.endsWith(".mp3"))).toBe(true)
  expect(JSON.parse(music.querySelector("webwriter-music-score script")!.textContent!).score.title).toBe("Level 1")
  const ozone = await load("ozone-hole")
  expect(ozone.querySelectorAll("webwriter-chemlab-periodic-table")).toHaveLength(2)
  expect(ozone.querySelector("webwriter-chemlab-molecule-builder")).not.toBeNull()
  expect(JSON.parse(ozone.querySelector("webwriter-chart script")!.textContent!).scatterDatasets.title).toBe("Polarity")
  const river = await load("ahr-valley")
  expect(river.querySelectorAll("webwriter-true-false")).toHaveLength(6)
  expect(river.querySelector("webwriter-map")).not.toBeNull()
  const pendulum = await load("pendulum")
  expect(pendulum.querySelector("webwriter-phet-simulation")).not.toBeNull()
  expect(JSON.parse(pendulum.querySelector("webwriter-chart script")!.textContent!).scatterDatasets.sets[0].labels[0]).toBe("Length l [m]")
  expect(pendulum.querySelector("webwriter-companion-calculator, [src*='companion-calculator'], [href*='companion-calculator']")).toBeNull()
  const heartburn = await load("heartburn")
  expect(heartburn.querySelectorAll("webwriter-chemlab")).toHaveLength(2)
})

it("only accepts known examples and pins their authored widget package versions", async () => {
  expect(findExampleDocument("../anything")).toBeUndefined()
  await expect(loadExampleDocument("https://other.example/document.html")).rejects.toThrow("could not be found")
  const getPackage = vi.fn(async ({name, version}: {name: string, version: string}) => ({name, version, members: [], scripts: [], styles: []}))
  await loadExamplePackages(await loadExampleDocument("heartburn"), {getPackage} as unknown as WebWriterPackageRegistry)
  expect(getPackage.mock.calls.map(([reference]) => reference)).toEqual([{name: "@webwriter/chemlab", version: "2.0.0"}])
  getPackage.mockClear()
  await loadExamplePackages(await loadExampleDocument("pendulum"), {getPackage} as unknown as WebWriterPackageRegistry)
  expect(getPackage.mock.calls.map(([reference]) => reference.name).sort()).toEqual(["@webwriter/chart", "@webwriter/phet-simulation"])
})
