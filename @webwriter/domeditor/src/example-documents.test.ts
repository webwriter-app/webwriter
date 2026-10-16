// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {setLanguage, siteLanguages, t} from "./site-language"
import {exampleDocumentLayout, exampleDocuments, findExampleDocument, loadExampleDocument, loadExamplePackages} from "./example-documents"
import {defaultDocumentTheme} from "./document-themes"
import {documentLayoutMode, isBoardCard, isBoardColumn, type DocumentLayoutMode} from "./document-layout"
import type {WebWriterPackageRegistry} from "./packages"

afterEach(() => setLanguage("en", false))

it.each(Object.keys(siteLanguages))("arranges every %s lesson in each native layout without changing its authored content", async locale => {
  const modes: DocumentLayoutMode[] = ["document", "canvas", "slides", "board"]
  const resources = (source: Document) => [...source.querySelectorAll("script[src], link[href], img[src], audio[src], video[src], source[src]")]
    .map(element => element.getAttribute("src") ?? element.getAttribute("href"))
  const lessonText = (source: Document) => {
    const body = source.body.cloneNode(true) as HTMLElement
    body.querySelector(".ww-slides-navigation")?.remove()
    return body.textContent
  }
  const authoredWidgets = (source: Document) => [...source.body.querySelectorAll("*")]
    .filter(element => element.localName.includes("-") && !element.matches(".ww-board-column, .ww-board-card"))
    .map(element => element.outerHTML)
  const authoredIds = (source: Document) => [...source.querySelectorAll<HTMLElement>("[id]")]
    .filter(element => !element.id.startsWith("example-"))
    .map(element => element.id)
  const reflectionLabels = (source: Document) => [...source.querySelectorAll<HTMLLabelElement>("label[for]")]
    .map(label => [label.getAttribute("for"), label.textContent])

  setLanguage(locale, false)
  for(const example of exampleDocuments) {
    const original = await loadExampleDocument(example.id)
    expect(original.title, `${locale}/${example.id} title`).toBe(t(example.title))
    for(const mode of modes) {
      const arranged = await loadExampleDocument(example.id, mode)
      expect(arranged.title, `${locale}/${example.id}/${mode} title`).toBe(original.title)
      expect(documentLayoutMode(arranged.body), `${locale}/${example.id}/${mode} body layout`).toBe(mode)
      expect(lessonText(arranged), `${locale}/${example.id}/${mode} lesson text`).toBe(lessonText(original))
      expect(authoredWidgets(arranged), `${locale}/${example.id}/${mode} widgets`).toEqual(authoredWidgets(original))
      expect(resources(arranged), `${locale}/${example.id}/${mode} resources`).toEqual(resources(original))
      expect(authoredIds(arranged), `${locale}/${example.id}/${mode} ids`).toEqual(authoredIds(original))
      expect(reflectionLabels(arranged), `${locale}/${example.id}/${mode} labels`).toEqual(reflectionLabels(original))
      expect(arranged.querySelector("[contenteditable], [class*='◆']"), `${locale}/${example.id}/${mode} editing artifacts`).toBeNull()
      const ids = [...arranged.querySelectorAll<HTMLElement>("[id]")].map(element => element.id)
      expect(new Set(ids).size, `${locale}/${example.id}/${mode} unique ids`).toBe(ids.length)

      if(mode === "canvas") {
        const sections = [...arranged.body.querySelectorAll<HTMLElement>(":scope > section.ww-example-section")]
        expect(sections.length, `${locale}/${example.id} canvas sections`).toBeGreaterThan(0)
        expect(sections.every(section => section.style.left && section.style.top && section.style.width), `${locale}/${example.id} canvas positions`).toBe(true)
      }
      if(mode === "board") {
        const columns = [...arranged.body.children].filter(isBoardColumn)
        expect(columns.length, `${locale}/${example.id} board columns`).toBeGreaterThan(0)
        expect(columns.every(column => [...column.children].some(isBoardCard)), `${locale}/${example.id} board cards`).toBe(true)
      }
      if(mode === "slides") {
        const slides = [...arranged.querySelectorAll(".ww-slides-viewport > section.ww-slide")]
        const links = [...arranged.querySelectorAll<HTMLAnchorElement>(".ww-slides-navigation a[href^='#']")]
        expect(slides.length, `${locale}/${example.id} slides`).toBeGreaterThan(0)
        expect(links.map(link => link.hash.slice(1))).toEqual(slides.map(slide => slide.id))
        expect(links.every(link => arranged.getElementById(link.hash.slice(1)) === slides[links.indexOf(link)]), `${locale}/${example.id} slide targets`).toBe(true)
      }
    }
  }
})

it("falls back to document layout for an unknown layout value", async () => {
  expect(exampleDocumentLayout("unexpected-layout")).toBe("document")
  const source = await loadExampleDocument(exampleDocuments[0].id, "unexpected-layout" as DocumentLayoutMode)
  expect(documentLayoutMode(source.body)).toBe("document")
  expect(source.body.querySelector(".ww-example-section, .ww-slides-viewport, .ww-board-column")).toBeNull()
})

it.each(["binary", "printing", "shared-space"])("gives the %s activity its own slide while retaining all lesson content", async id => {
  const source = await loadExampleDocument(id, "slides")
  const activity = source.querySelector("webwriter-code-javascript, webwriter-timeline, webwriter-branching-scenario")!
  const section = activity.closest(".ww-example-section")!
  expect([...section.children]).toEqual([activity])
  expect(source.querySelectorAll(".ww-slide").length).toBeGreaterThan(source.querySelectorAll("h2").length + 1)
})

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
