// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
vi.mock("./example-document", () => ({}))
import {ExampleGallery} from "./example-gallery"
import {exampleDocuments} from "../example-documents"

const initialURL = location.href
afterEach(() => {document.body.replaceChildren(); history.replaceState(null, "", initialURL)})

it("lists every subject, keeps a shareable example URL, and closes its learner view", async () => {
  history.replaceState(null, "", "/examples/?keep=yes#section")
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await gallery.updateComplete
  const root = gallery.shadowRoot!
  const dialogRoot = root.querySelector("example-dialog")!.shadowRoot!
  expect(root.querySelectorAll("li")).toHaveLength(exampleDocuments.length)
  expect([...root.querySelectorAll("a.thumbnail")].map(card => card.getAttribute("href"))).toEqual(exampleDocuments.map(example => `?example=${example.id}`))
  expect([...root.querySelectorAll("a.thumbnail")].every(card => card.getAttribute("data-card-overlay") === "Show example")).toBe(true)
  expect([...root.querySelectorAll("a.thumbnail")].map(card => [...card.querySelectorAll(".metadata .pill")].map(pill => pill.textContent))).toEqual(exampleDocuments.map(example => [example.subject, example.duration]))
  expect(root.querySelector("h2, .description, .actions")).toBeNull()
  expect(root.querySelectorAll("a")).toHaveLength(exampleDocuments.length)
  root.querySelector<HTMLAnchorElement>('a[href="?example=printing"]')!.click()
  await vi.waitFor(() => expect(dialogRoot.querySelector("dialog")?.open).toBe(true))
  expect(dialogRoot.querySelector("example-document")?.getAttribute("example-id")).toBe("printing")
  expect(dialogRoot.querySelector("dialog")?.getAttribute("aria-label")).toBe("How printing changed the page")
  expect(new URL(location.href).searchParams.get("example")).toBe("printing")
  dialogRoot.querySelector("example-document")!.dispatchEvent(new CustomEvent("close-example"))
  await gallery.updateComplete
  expect(dialogRoot.querySelector("example-document")).toBeNull()
  expect(location.search).toBe("?keep=yes")
  expect(location.hash).toBe("#section")
})

it("opens a direct example link on arrival", async () => {
  history.replaceState(null, "", "/examples/?example=food-web")
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await vi.waitFor(() => expect(gallery.shadowRoot?.querySelector("example-dialog")?.shadowRoot?.querySelector("dialog")?.open).toBe(true))
  expect(gallery.shadowRoot?.querySelector("example-dialog")?.shadowRoot?.querySelector("example-document")?.getAttribute("example-id")).toBe("food-web")
})
