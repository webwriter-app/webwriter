// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
vi.mock("./example-document", () => ({}))
import {ExamplePreview, ExampleShowcase} from "./example-preview"
import {exampleDocuments} from "../example-documents"
import * as exampleDocumentSource from "../example-documents"
import {setLanguage, siteLanguages} from "../site-language"

const initialURL = location.href
afterEach(() => {
  history.replaceState(null, "", initialURL)
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  setLanguage("en", false)
})

const loaded = async (preview: ExamplePreview) => {
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".page:not(.outgoing) h2")?.textContent).toBeTruthy())
  return preview.shadowRoot!.querySelector(".page:not(.outgoing)")!
}
const mount = (id: string, compact = false) => {
  const preview = new ExamplePreview()
  preview.exampleId = id
  if(compact) preview.setAttribute("compact", "")
  document.body.append(preview)
  return preview
}

it.each(exampleDocuments)("shows $id with a hero, its title, and a miniature in its authored layout", async example => {
  const source = await exampleDocumentSource.loadExampleDocument(example.id)
  const page = await loaded(mount(example.id, true))
  expect(page.querySelector("h2")?.textContent).toBe(source.title)
  expect(page.querySelector(".hero")?.children.length).toBeGreaterThan(0)
  expect(page.querySelector(".frame")?.className).toBe(`frame ${example.layout}`)
  expect(page.querySelector(".frame .mini")?.textContent?.trim().length).toBeGreaterThan(100)
  expect([...page.querySelectorAll("img")].every(image => image.getAttribute("alt") === "")).toBe(true)
})

it("zooms the miniature to fill its frame at any card width", async () => {
  let resize!: ResizeObserverCallback
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback } observe() {} disconnect() {} })
  const preview = mount("ozone-hole")
  for(const [width, zoom] of [[349, "1"], [676, "2"]] as const) {
    resize([{contentRect: {width}} as ResizeObserverEntry], {} as ResizeObserver)
    expect(preview.style.getPropertyValue("--miniature-zoom")).toBe(zoom)
  }
  vi.unstubAllGlobals()
})

it("shows German examples in German and other languages in English", async () => {
  setLanguage("de", false)
  expect((await loaded(mount("pendulum"))).querySelector("h2")?.textContent).toBe("Die Erdbeschleunigung im Wohnzimmer bestimmen")
  document.body.replaceChildren()
  setLanguage("fr", false)
  expect((await loaded(mount("pendulum"))).querySelector("h2")?.textContent).toBe("Measure gravity in your living room")
})

it("discards a preview that finishes loading after a newer choice", async () => {
  const [first, second, third] = exampleDocuments
  const preview = mount(first.id)
  await loaded(preview)
  const stale = await exampleDocumentSource.loadExampleDocument(second.id)
  let resolve!: (source: Document) => void
  vi.spyOn(exampleDocumentSource, "loadExampleDocument").mockReturnValueOnce(new Promise(done => {resolve = done}))
  preview.exampleId = second.id
  await preview.updateComplete
  preview.exampleId = third.id
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".page:not(.outgoing) h2")?.textContent).toBe(third.title))
  resolve(stale)
  await Promise.resolve()
  await preview.updateComplete
  expect(preview.shadowRoot?.querySelector(".page:not(.outgoing) h2")?.textContent).toBe(third.title)
})

it("keeps the previous example while loading and fades it out when its replacement is ready", async () => {
  const [first, second] = exampleDocuments
  const preview = mount(first.id)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector("h2")?.textContent).toBe(first.title))
  const original = preview.shadowRoot!.querySelector(".page")!
  const next = await exampleDocumentSource.loadExampleDocument(second.id)
  let resolve!: (source: Document) => void
  vi.spyOn(exampleDocumentSource, "loadExampleDocument").mockReturnValueOnce(new Promise(done => { resolve = done }))

  preview.exampleId = second.id
  await preview.updateComplete
  expect(preview.shadowRoot!.querySelector(".page")).toBe(original)
  expect(preview.shadowRoot!.querySelector(".placeholder")).toBeNull()

  resolve(next)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".page:not(.outgoing) h2")?.textContent).toBe(second.title))
  const outgoing = preview.shadowRoot!.querySelector(".outgoing")!
  expect(outgoing.getAttribute("aria-hidden")).toBe("true")
  expect(outgoing.hasAttribute("inert")).toBe(true)
  expect(outgoing.querySelector("h2")?.textContent).toBe(first.title)
  outgoing.dispatchEvent(new Event("animationend"))
  await preview.updateComplete
  expect(preview.shadowRoot!.querySelector(".outgoing")).toBeNull()
  expect(preview.shadowRoot!.querySelectorAll(".page")).toHaveLength(1)
})

it("lists each subject once and moves through a subject's examples", async () => {
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const root = showcase.shadowRoot!
  const current = () => root.querySelector("a.document")!.getAttribute("href")
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>(".subjects button")]
  expect(root.querySelector("a.document")?.getAttribute("data-card-overlay")).toBe("Show example")
  expect(buttons().map(button => button.textContent)).toEqual([...new Set(exampleDocuments.map(example => example.subject))])
  const chemistry = exampleDocuments.filter(example => example.subject === "Chemistry")
  expect(chemistry.length).toBeGreaterThan(1)
  const button = buttons().find(candidate => candidate.textContent === "Chemistry")!
  button.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${chemistry[0].id}`)
  expect(button.getAttribute("aria-pressed")).toBe("true")
  button.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${chemistry[1].id}`)
  expect(button.getAttribute("aria-pressed")).toBe("true")
  button.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${chemistry[0].id}`)
  const preview = root.querySelector("example-preview")!
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".page:not(.outgoing) h2")?.textContent).toBe(chemistry[0].title))
})

it("cycles through every example and wraps back to the first", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const current = () => showcase.shadowRoot!.querySelector("a.document")!.getAttribute("href")
  expect(current()).toBe(`?example=${exampleDocuments[0].id}`)
  for(const {id} of [...exampleDocuments.slice(1), exampleDocuments[0]]) {
    await vi.advanceTimersByTimeAsync(6000)
    expect(current()).toBe(`?example=${id}`)
  }
  showcase.remove()
  expect(vi.getTimerCount()).toBe(0)
})

it("steps in either direction, wraps, and restarts cycling without opening a dialog", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const root = showcase.shadowRoot!
  const current = () => root.querySelector("a.document")!.getAttribute("href")
  const previous = root.querySelector<HTMLButtonElement>('[aria-label="Previous example"]')!
  const next = root.querySelector<HTMLButtonElement>('[aria-label="Next example"]')!
  expect(previous.closest("a")).toBeNull()
  expect(next.closest("a")).toBeNull()

  previous.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${exampleDocuments.at(-1)!.id}`)
  next.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${exampleDocuments[0].id}`)
  await vi.advanceTimersByTimeAsync(5000)
  next.click()
  await showcase.updateComplete
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
  await vi.advanceTimersByTimeAsync(5999)
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
  await vi.advanceTimersByTimeAsync(1)
  expect(current()).toBe(`?example=${exampleDocuments[2].id}`)
  expect(root.querySelector("example-dialog")?.shadowRoot?.querySelector("dialog")?.open).toBe(false)
})

it("gives manual selections a full interval before cycling again", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const root = showcase.shadowRoot!
  const current = () => root.querySelector("a.document")!.getAttribute("href")
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
  await vi.advanceTimersByTimeAsync(5000)
  root.querySelector<HTMLButtonElement>(".subjects button")!.click()
  await vi.advanceTimersByTimeAsync(5999)
  expect(current()).toBe(`?example=${exampleDocuments[0].id}`)
  await vi.advanceTimersByTimeAsync(1)
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
})

it("holds the current example while hidden, being read, or reduced motion is preferred", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const current = () => showcase.shadowRoot!.querySelector("a.document")!.getAttribute("href")
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe(`?example=${exampleDocuments[0].id}`)
  hidden.mockReturnValue(false)
  const interaction = vi.spyOn(showcase, "matches").mockReturnValue(true)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe(`?example=${exampleDocuments[0].id}`)
  interaction.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
  vi.spyOn(window, "matchMedia").mockReturnValue({matches: true} as MediaQueryList)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe(`?example=${exampleDocuments[1].id}`)
})

it("opens an example on the landing page without navigating to the gallery", async () => {
  history.replaceState(null, "", "/?keep=yes")
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const link = showcase.shadowRoot!.querySelector("a.document")!
  const click = new MouseEvent("click", {bubbles: true, cancelable: true})
  link.dispatchEvent(click)
  const root = showcase.shadowRoot!.querySelector("example-dialog")!.shadowRoot!
  await vi.waitFor(() => expect(root.querySelector("dialog")?.open).toBe(true))
  expect(click.defaultPrevented).toBe(true)
  expect(location.pathname).toBe("/")
  expect(location.search).toBe(`?keep=yes&example=${exampleDocuments[0].id}`)
  expect(root.querySelector("example-document")?.getAttribute("example-id")).toBe(exampleDocuments[0].id)
  const modified = new MouseEvent("click", {ctrlKey: true, cancelable: true})
  link.dispatchEvent(modified)
  expect(modified.defaultPrevented).toBe(false)
})
