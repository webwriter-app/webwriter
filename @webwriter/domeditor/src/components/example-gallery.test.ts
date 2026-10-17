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
  const heading = document.createElement("h1")
  heading.slot = "heading"
  heading.textContent = "Examples"
  gallery.append(heading)
  document.body.append(gallery)
  await gallery.updateComplete
  const root = gallery.shadowRoot!
  const dialogRoot = root.querySelector("example-dialog")!.shadowRoot!
  expect(root.querySelectorAll("li")).toHaveLength(exampleDocuments.length)
  expect(root.querySelectorAll('[role="tablist"]')).toHaveLength(exampleDocuments.length + 1)
  expect(root.querySelectorAll('[role="tab"]')).toHaveLength((exampleDocuments.length + 1) * 4)
  expect(root.querySelector<HTMLSlotElement>(".gallery-heading slot[name=heading]")?.assignedElements()).toContain(heading)
  expect(root.querySelector(".gallery-heading [role=tablist]")).not.toBeNull()
  expect(root.querySelector('[role="tabpanel"]')?.id).toBe("gallery-layout-panel")
  expect(root.querySelector("#gallery-layout-panel ul.cards")).not.toBeNull()
  for(const example of exampleDocuments) {
    const panel = root.querySelector(`#${example.id}-layout-panel`)
    expect(panel?.getAttribute("role")).toBe("tabpanel")
    expect(panel?.getAttribute("aria-labelledby")).toBe(`${example.id}-layout-document`)
  }
  expect([...root.querySelectorAll("a.thumbnail")].map(card => card.getAttribute("href"))).toEqual(exampleDocuments.map(example => `?example=${example.id}`))
  expect([...root.querySelectorAll("a.thumbnail")].every(card => card.getAttribute("data-card-overlay") === "Show example")).toBe(true)
  expect([...root.querySelectorAll("a.thumbnail")].map(card => [...card.querySelectorAll(".metadata .pill")].map(pill => pill.textContent))).toEqual(exampleDocuments.map(example => [example.subject, example.duration]))
  expect([...root.querySelectorAll("example-preview")].every(preview => preview.getAttribute("layout") === "document")).toBe(true)
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

it("switches every example together for each global layout and links each tablist to its panel", async () => {
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await gallery.updateComplete
  const root = gallery.shadowRoot!
  const panel = root.querySelector<HTMLElement>("#gallery-layout-panel")!
  const modes = ["document", "canvas", "slides", "board"]
  for(const mode of modes) {
    const globalTab = root.querySelector<HTMLButtonElement>(`#gallery-layout-${mode}`)!
    expect(globalTab.getAttribute("role")).toBe("tab")
    expect(globalTab.getAttribute("aria-controls")).toBe(panel.id)
    globalTab.click()
    await gallery.updateComplete
    expect(globalTab.getAttribute("aria-selected")).toBe("true")
    expect(panel.getAttribute("aria-labelledby")).toBe(globalTab.id)
    expect([...root.querySelectorAll("example-preview")].map(preview => preview.getAttribute("layout"))).toEqual(exampleDocuments.map(() => mode))
    expect([...root.querySelectorAll<HTMLAnchorElement>("a.thumbnail")].map(card => card.getAttribute("href"))).toEqual(exampleDocuments.map(example =>
      `?example=${example.id}${mode === "document" ? "" : `&layout=${mode}`}`))
    for(const example of exampleDocuments) {
      const tab = root.querySelector<HTMLButtonElement>(`#${example.id}-layout-${mode}`)!
      const cardPanel = root.querySelector<HTMLElement>(`#${example.id}-layout-panel`)
      expect(tab.getAttribute("role")).toBe("tab")
      expect(tab.getAttribute("aria-controls")).toBe(cardPanel?.id)
      expect(tab.getAttribute("aria-selected")).toBe("true")
      expect(cardPanel?.getAttribute("aria-labelledby")).toBe(tab.id)
    }
  }
})

it("keeps card overrides local until the global choice resets them", async () => {
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await gallery.updateComplete
  const root = gallery.shadowRoot!
  const dialog = root.querySelector("example-dialog") as any
  const open = vi.spyOn(dialog, "open").mockResolvedValue(undefined)
  const [first, second] = exampleDocuments
  root.querySelector<HTMLButtonElement>("#gallery-layout-canvas")!.click()
  await gallery.updateComplete
  root.querySelector<HTMLButtonElement>(`#${first.id}-layout-board`)!.click()
  await gallery.updateComplete
  expect(root.querySelector(`#gallery-layout-canvas`)?.getAttribute("aria-selected")).toBe("true")
  expect([...root.querySelectorAll("example-preview")].map(preview => preview.getAttribute("layout"))).toEqual(exampleDocuments.map((example, index) => index === 0 ? "board" : "canvas"))
  expect(root.querySelector<HTMLAnchorElement>(`a[href="?example=${first.id}&layout=board"]`)).not.toBeNull()
  expect(root.querySelector<HTMLAnchorElement>(`a[href="?example=${second.id}&layout=canvas"]`)).not.toBeNull()
  expect(open).not.toHaveBeenCalled()

  root.querySelector<HTMLButtonElement>("#gallery-layout-slides")!.click()
  await gallery.updateComplete
  expect([...root.querySelectorAll("example-preview")].every(preview => preview.getAttribute("layout") === "slides")).toBe(true)
  expect([...root.querySelectorAll<HTMLButtonElement>("[role=tab][aria-selected=true]")].map(tab => tab.id)).toEqual([
    "gallery-layout-slides", ...exampleDocuments.map(example => `${example.id}-layout-slides`),
  ])
  for(const example of exampleDocuments) expect(root.querySelector<HTMLAnchorElement>(`a[href="?example=${example.id}&layout=slides"]`)).not.toBeNull()

  root.querySelector<HTMLButtonElement>(`#${second.id}-layout-document`)!.click()
  await gallery.updateComplete
  expect(root.querySelector("#gallery-layout-slides")?.getAttribute("aria-selected")).toBe("true")
  expect(root.querySelector(`#${second.id}-layout-document`)?.getAttribute("aria-selected")).toBe("true")
  expect(root.querySelector<HTMLAnchorElement>(`a[href="?example=${second.id}"]`)).not.toBeNull()
  expect([...root.querySelectorAll("example-preview")].map(preview => preview.getAttribute("layout"))).toEqual(exampleDocuments.map(example => example === second ? "document" : "slides"))

  root.querySelector<HTMLAnchorElement>(`a[href="?example=${first.id}&layout=slides"]`)!.click()
  root.querySelector<HTMLAnchorElement>(`a[href="?example=${second.id}"]`)!.click()
  expect(open).toHaveBeenNthCalledWith(1, first.id, true, "slides")
  expect(open).toHaveBeenNthCalledWith(2, second.id, true, "document")
})

it("supports roving keyboard focus within both global and individual tablists", async () => {
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await gallery.updateComplete
  const root = gallery.shadowRoot!
  const first = exampleDocuments[0]
  const press = async (tabId: string, key: string, nextId: string) => {
    root.querySelector<HTMLButtonElement>(`#${tabId}`)!.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true}))
    await gallery.updateComplete
    await Promise.resolve()
    const focused = root.querySelector<HTMLButtonElement>(`#${nextId}`)!
    expect(root.activeElement).toBe(focused)
    expect(focused.getAttribute("aria-selected")).toBe("true")
  }
  await press("gallery-layout-document", "ArrowRight", "gallery-layout-canvas")
  await press("gallery-layout-canvas", "ArrowRight", "gallery-layout-slides")
  await press("gallery-layout-slides", "ArrowLeft", "gallery-layout-canvas")
  await press("gallery-layout-canvas", "Home", "gallery-layout-document")
  await press("gallery-layout-document", "End", "gallery-layout-board")

  root.querySelector<HTMLButtonElement>("#gallery-layout-document")!.click()
  await gallery.updateComplete
  await press(`${first.id}-layout-document`, "ArrowRight", `${first.id}-layout-canvas`)
  expect(root.querySelector("#gallery-layout-document")?.getAttribute("aria-selected")).toBe("true")
  expect(root.querySelectorAll("example-preview")[0]?.getAttribute("layout")).toBe("canvas")
  expect(root.querySelectorAll("example-preview")[1]?.getAttribute("layout")).toBe("document")
  await press(`${first.id}-layout-canvas`, "ArrowRight", `${first.id}-layout-slides`)
  await press(`${first.id}-layout-slides`, "ArrowLeft", `${first.id}-layout-canvas`)
  await press(`${first.id}-layout-canvas`, "Home", `${first.id}-layout-document`)
  await press(`${first.id}-layout-document`, "End", `${first.id}-layout-board`)
  expect(root.querySelector("#gallery-layout-document")?.getAttribute("aria-selected")).toBe("true")
  expect(root.querySelectorAll("example-preview")[0]?.getAttribute("layout")).toBe("board")
  expect(root.querySelectorAll("example-preview")[1]?.getAttribute("layout")).toBe("document")
})

it("opens a direct example link on arrival", async () => {
  history.replaceState(null, "", "/examples/?example=food-web")
  const gallery = new ExampleGallery()
  document.body.append(gallery)
  await vi.waitFor(() => expect(gallery.shadowRoot?.querySelector("example-dialog")?.shadowRoot?.querySelector("dialog")?.open).toBe(true))
  expect(gallery.shadowRoot?.querySelector("example-dialog")?.shadowRoot?.querySelector("example-document")?.getAttribute("example-id")).toBe("food-web")
})
