// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {setLanguage, siteLanguages, t} from "./site-language"
import {exampleDocuments, findExampleDocument, loadExampleDocument, loadExamplePackages} from "./example-documents"
import {defaultDocumentTheme} from "./document-themes"
import type {WebWriterPackageRegistry} from "./packages"

afterEach(() => setLanguage("en", false))

it.each(Object.keys(siteLanguages).filter(locale => locale !== "en"))("loads complete %s documents with their original widget and media contracts", async locale => {
  for(const example of exampleDocuments) {
    setLanguage("en", false)
    const original = await loadExampleDocument(example.id)
    setLanguage(locale, false)
    const translated = await loadExampleDocument(example.id)
    expect(translated.documentElement.lang).toBe(locale)
    expect(translated.title).toBe(t(example.title))
    expect(translated.querySelector("h1")?.textContent).toBe(translated.title)
    expect(translated.querySelector("textarea")?.getAttribute("placeholder")).not.toBe(original.querySelector("textarea")?.getAttribute("placeholder"))
    expect([...translated.body.querySelectorAll("*")].map(element => element.tagName)).toEqual([...original.body.querySelectorAll("*")].map(element => element.tagName))
    const resources = (source: Document) => [...source.querySelectorAll("script[src], link[href], img[src], audio[src], video[src], source[src]")].map(element => element.getAttribute("src") ?? element.getAttribute("href"))
    expect(resources(translated)).toEqual(resources(original))
    if(example.id === "binary") expect([...translated.querySelectorAll("code")].map(node => node.textContent)).toEqual([...original.querySelectorAll("code")].map(node => node.textContent))
    expect(translated.querySelector("[contenteditable], .◆editor-only")).toBeNull()
  }
})

it.each(exampleDocuments)("loads the full $subject document with the editor's real theme", async example => {
  const source = await loadExampleDocument(example.id)
  expect(source.title).toBe(example.title)
  expect(source.querySelector("h1")?.textContent).toBe(example.title)
  expect(source.querySelector("style[data-ww-theme=base]")?.textContent).toBe(defaultDocumentTheme.source)
  expect(source.querySelector("label[for]")?.getAttribute("for")).toBe(source.querySelector("textarea")?.id)
  expect(source.querySelectorAll("body h2").length).toBeGreaterThan(2)
  expect(source.querySelector("[contenteditable], .◆editor-only")).toBeNull()
  const second = await loadExampleDocument(example.id)
  expect(second).not.toBe(source)
  expect(source.querySelector("script[src]")?.getAttribute("src")).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@webwriter\//)
})

it("uses rich, subject-specific widgets and media rather than only quiz questions", async () => {
  const binary = await loadExampleDocument("binary")
  expect(binary.querySelector("webwriter-code-javascript")?.getAttribute("code")).toContain("const bits = [1, 0, 1, 0]")
  const biology = await loadExampleDocument("food-web")
  expect(biology.querySelector("webwriter-slides")).not.toBeNull()
  expect(biology.querySelector("img[alt]")).not.toBeNull()
  expect(biology.querySelector("audio[controls], video[controls]")).not.toBeNull()
  const history = await loadExampleDocument("printing")
  expect(history.querySelectorAll("webwriter-timeline-event").length).toBeGreaterThan(2)
  expect(history.querySelectorAll("img[alt]").length).toBeGreaterThanOrEqual(2)
  expect(history.querySelector("webwriter-timeline")?.getAttribute("panels")).toBe("timeline+quiz")
  expect([...history.querySelectorAll("webwriter-timeline-event")].every(event => /^\d{4}$/.test(event.getAttribute("date") ?? "") && event.id)).toBe(true)
  const modules = [...history.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(script => script.src)
  expect(modules.at(-1)).toContain("/webwriter-timeline.js")
})

it("adds seven approachable subjects with initialized, varied widgets and media", async () => {
  expect(exampleDocuments.map(example => example.subject)).toEqual(["Biology", "History", "Computer Science", "Arts", "Languages", "Social Science", "Chemistry", "Geography", "Physics", "Mathematics"])
  const load = async (id: string) => loadExampleDocument(id)
  const rhythm = await load("rhythm")
  expect(rhythm.querySelector("audio[controls] source")?.getAttribute("src") ?? rhythm.querySelector("audio[controls]")?.getAttribute("src")).toMatch(/^data:audio\//)
  const cafe = await load("cafe")
  const words = JSON.parse(cafe.querySelector("webwriter-word-puzzle")!.getAttribute("_wordsclues")!)
  expect(words).toHaveLength(6)
  expect(words.every((word: {word: string, clueText: string}) => word.word && word.clueText)).toBe(true)
  const street = await load("shared-space")
  expect(street.querySelector('webwriter-gamebook-page[originpage="1"]')).not.toBeNull()
  expect(street.querySelectorAll("webwriter-gamebook-page").length).toBeGreaterThanOrEqual(4)
  expect((await load("kitchen-elements")).querySelector("webwriter-periodic-table")).not.toBeNull()
  const river = await load("river-bends")
  expect(JSON.parse(river.querySelector("webwriter-map")!.getAttribute("initialpos")!)).toEqual(expect.objectContaining({lat: expect.any(Number), lng: expect.any(Number)}))
  const swings = await load("swings")
  expect(swings.querySelector("iframe")?.getAttribute("src")).toContain("https://phet.colorado.edu/sims/html/pendulum-lab/")
  const garden = await load("garden-design")
  expect(garden.querySelector("webwriter-geogebra")?.getAttribute("src")).toMatch(/^data:application\/vnd\.geogebra\.file;base64,UEs/)
  for(const example of exampleDocuments) {
    const source = await load(example.id)
    const ids = [...source.querySelectorAll("[id]")].map(element => element.id)
    expect(new Set(ids).size, example.id).toBe(ids.length)
    expect(source.querySelector("figure svg, figure img, figure audio, figure video, table"), example.id).not.toBeNull()
  }
})

it("only accepts known examples and pins their authored widget package versions", async () => {
  expect(findExampleDocument("../anything")).toBeUndefined()
  await expect(loadExampleDocument("https://other.example/document.html")).rejects.toThrow("could not be found")
  const source = await loadExampleDocument("binary")
  const getPackage = vi.fn(async ({name, version}: {name: string, version: string}) => ({name, version, members: [], scripts: [], styles: []}))
  await loadExamplePackages(source, {getPackage} as unknown as WebWriterPackageRegistry)
  expect(getPackage.mock.calls.map(([reference]) => reference)).toEqual([
    {name: "@webwriter/code", version: "3.0.5"},
  ])
})
