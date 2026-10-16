// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
vi.mock("./example-document", () => ({}))
import {ExamplePreview, ExampleShowcase} from "./example-preview"
import {exampleDocuments} from "../example-documents"
import * as exampleDocumentSource from "../example-documents"

const initialURL = location.href
afterEach(() => {
  history.replaceState(null, "", initialURL)
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("uses the physics diagram instead of squeezing its six-column table into the miniature", async () => {
  const preview = new ExamplePreview()
  preview.exampleId = "swings"
  preview.setAttribute("compact", "")
  document.body.append(preview)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector("figure svg")).toBeTruthy())
  expect(preview.shadowRoot?.querySelector("svg title")?.textContent).toBe("Pendulum motion")
  expect(preview.shadowRoot?.querySelector("table")).toBeNull()
})

it("gives the authored café menu more room in the languages preview", async () => {
  const preview = new ExamplePreview()
  preview.exampleId = "cafe"
  document.body.append(preview)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".visual.menu svg")).toBeTruthy())
  expect(preview.shadowRoot!.querySelector(".menu title")?.textContent).toBe("A small café menu")
})

it("ends the mathematics preview with the document's complete reflection prompt", async () => {
  const source = await exampleDocumentSource.loadExampleDocument("garden-design")
  const preview = new ExamplePreview()
  preview.exampleId = "garden-design"
  document.body.append(preview)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector(".closing")).toBeTruthy())
  const closing = preview.shadowRoot!.querySelector(".closing")!
  expect(closing.textContent).toBe(source.querySelector("label[for]")?.textContent)
  expect(preview.shadowRoot!.querySelector(".page")!.lastElementChild).toBe(closing)
})

it("keeps the previous example while loading and fades it out when its replacement is ready", async () => {
  const preview = new ExamplePreview()
  preview.exampleId = "food-web"
  document.body.append(preview)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector("h2")?.textContent).toBe("Who eats what in the garden?"))
  const original = preview.shadowRoot!.querySelector(".page")!
  const next = await exampleDocumentSource.loadExampleDocument("binary")
  let resolve!: (source: Document) => void
  vi.spyOn(exampleDocumentSource, "loadExampleDocument").mockReturnValueOnce(new Promise(done => { resolve = done }))

  preview.exampleId = "binary"
  await preview.updateComplete
  expect(preview.shadowRoot!.querySelector(".page")).toBe(original)
  expect(preview.shadowRoot!.querySelector(".placeholder")).toBeNull()

  resolve(next)
  await vi.waitFor(() => expect(preview.shadowRoot?.querySelector("h2")?.textContent).toBe("Count like a computer"))
  const outgoing = preview.shadowRoot!.querySelector(".outgoing")!
  expect(outgoing.getAttribute("aria-hidden")).toBe("true")
  expect(outgoing.hasAttribute("inert")).toBe(true)
  expect(outgoing.querySelector("h2")?.textContent).toBe("Who eats what in the garden?")
  outgoing.dispatchEvent(new Event("animationend"))
  await preview.updateComplete
  expect(preview.shadowRoot!.querySelector(".outgoing")).toBeNull()
  expect(preview.shadowRoot!.querySelectorAll(".page")).toHaveLength(1)
})

it("switches subjects and derives its miniature from the full document", async () => {
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const preview = () => showcase.shadowRoot!.querySelector("example-preview")!
  expect(showcase.shadowRoot!.querySelector("a.document")?.getAttribute("data-card-overlay")).toBe("Show example")
  await vi.waitFor(() => expect(preview().shadowRoot?.querySelector("h2")?.textContent).toBe("Who eats what in the garden?"))
  expect([...preview().shadowRoot!.querySelectorAll(".steps li")].map(step => step.textContent)).toEqual(["1. Observe", "2. Listen", "3. Explain"])
  expect(preview().shadowRoot!.querySelector('.steps [aria-current="step"]')?.textContent).toBe("1. Observe")
  const computerScience = [...showcase.shadowRoot!.querySelectorAll<HTMLButtonElement>(".subjects button")].find(button => button.textContent === "Computer science")!
  computerScience.click()
  await vi.waitFor(() => expect(preview().shadowRoot?.querySelector("h2")?.textContent).toBe("Count like a computer"))
  expect(preview().shadowRoot?.querySelector("pre")?.textContent).toContain("const bits = [1, 0, 1, 0]")
  expect(showcase.shadowRoot!.querySelector("a.document")?.getAttribute("href")).toBe("?example=binary")
  expect(computerScience.getAttribute("aria-pressed")).toBe("true")
  expect(showcase.shadowRoot!.textContent).not.toContain("A look inside a WebWriter document.")
  expect([...showcase.shadowRoot!.querySelectorAll<HTMLButtonElement>(".subjects button")].map(button => button.textContent)).toEqual(exampleDocuments.map(example => example.subject))
  expect(exampleDocuments.slice(0, 3).map(example => example.subject)).toEqual(["Biology", "History", "Computer science"])
})

it("cycles through every example and wraps back to the first", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const current = () => showcase.shadowRoot!.querySelector("a.document")!.getAttribute("href")
  expect(current()).toBe("?example=food-web")
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
  expect(current()).toBe("?example=garden-design")
  next.click()
  await showcase.updateComplete
  expect(current()).toBe("?example=food-web")
  await vi.advanceTimersByTimeAsync(5000)
  next.click()
  await showcase.updateComplete
  expect(current()).toBe("?example=printing")
  await vi.advanceTimersByTimeAsync(5999)
  expect(current()).toBe("?example=printing")
  await vi.advanceTimersByTimeAsync(1)
  expect(current()).toBe("?example=binary")
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
  expect(current()).toBe("?example=printing")
  await vi.advanceTimersByTimeAsync(5000)
  root.querySelector<HTMLButtonElement>(".subjects button")!.click()
  await vi.advanceTimersByTimeAsync(5999)
  expect(current()).toBe("?example=food-web")
  await vi.advanceTimersByTimeAsync(1)
  expect(current()).toBe("?example=printing")
})

it("holds the current example while hidden, being read, or reduced motion is preferred", async () => {
  vi.useFakeTimers()
  const showcase = new ExampleShowcase()
  document.body.append(showcase)
  await showcase.updateComplete
  const current = () => showcase.shadowRoot!.querySelector("a.document")!.getAttribute("href")
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe("?example=food-web")
  hidden.mockReturnValue(false)
  const interaction = vi.spyOn(showcase, "matches").mockReturnValue(true)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe("?example=food-web")
  interaction.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe("?example=printing")
  vi.spyOn(window, "matchMedia").mockReturnValue({matches: true} as MediaQueryList)
  await vi.advanceTimersByTimeAsync(6000)
  expect(current()).toBe("?example=printing")
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
  expect(location.search).toBe("?keep=yes&example=food-web")
  expect(root.querySelector("example-document")?.getAttribute("example-id")).toBe("food-web")
  const modified = new MouseEvent("click", {ctrlKey: true, cancelable: true})
  link.dispatchEvent(modified)
  expect(modified.defaultPrevented).toBe(false)
})
