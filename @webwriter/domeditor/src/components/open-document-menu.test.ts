// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import type {BackendDocumentSummary} from "../backend-client"
import {OpenDocumentMenu} from "./open-document-menu"

const documentOne: BackendDocumentSummary = {
  id: "one", title: "A saved page", format: "html",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-02-03T00:00:00Z",
}

afterEach(() => document.body.replaceChildren())

async function mount(documents = [documentOne]) {
  const menu = new OpenDocumentMenu()
  menu.documents = documents
  document.body.append(menu)
  await menu.updateComplete
  return menu
}

describe("open document menu", () => {
  it("renders saved document details and emits an open event", async () => {
    const menu = await mount()
    const events: string[] = []
    menu.addEventListener("document-open", event => events.push((event as CustomEvent<{id: string}>).detail.id))
    const row = menu.shadowRoot!.querySelector<HTMLButtonElement>(".open")!

    expect(row.textContent).toContain("A saved page")
    expect(row.textContent).toContain("HTML")
    row.click()
    expect(events).toEqual(["one"])
  })

  it("leaves closing to the host after requesting an open", async () => {
    const menu = await mount()
    await menu.show()
    const dialog = menu.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!
    expect(dialog.open).toBe(true)
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".open")!.click()
    expect(dialog.open).toBe(true)
    menu.close()
  })

  it("deletes from the independent trash button without opening", async () => {
    const menu = await mount()
    const events: string[] = []
    menu.addEventListener("document-open", () => events.push("open"))
    menu.addEventListener("document-delete", event => events.push(`delete:${(event as CustomEvent<{id: string}>).detail.id}`))

    const button = menu.shadowRoot!.querySelector<HTMLButtonElement>(".delete")!
    expect(button.getAttribute("aria-label")).toBe("Delete A saved page")
    button.click()
    expect(events).toEqual(["delete:one"])
  })

  it("shows loading, error retry, and empty states", async () => {
    const menu = await mount([])
    expect(menu.shadowRoot!.textContent).toContain("Save a document to find it here")
    menu.loading = true
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[role="status"]')?.textContent).toContain("Loading")
    menu.loading = false
    menu.error = "Could not load documents"
    await menu.updateComplete
    const retries: Event[] = []
    menu.addEventListener("documents-retry", event => retries.push(event))
    expect(menu.shadowRoot!.querySelector(".rows")).toBeNull()
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>(".retry")!.disabled).toBe(false)
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".retry")!.click()
    expect(menu.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain("Could not load")
    expect(retries).toHaveLength(1)
  })

  it("escapes long titles through Lit rendering and disables actions while busy", async () => {
    const title = '<img src=x onerror="bad"> '.repeat(20)
    const menu = await mount([{...documentOne, title}])
    menu.busy = true
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector(".title")!.querySelector("img")).toBeNull()
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>(".open")!.disabled).toBe(true)
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>(".delete")!.disabled).toBe(true)
  })

  it("saves a new filename and includes a matching existing document id", async () => {
    const menu = await mount()
    menu.mode = "save"
    await menu.updateComplete
    const events: CustomEvent[] = []
    menu.addEventListener("document-save", event => events.push(event as CustomEvent))
    const input = menu.shadowRoot!.querySelector<HTMLInputElement>(".file-name")!
    input.value = "A saved page.html"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    menu.shadowRoot!.querySelector<HTMLFormElement>(".save-form")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
    expect(events[0].detail).toEqual({name: "A saved page.html", id: "one"})
  })

  it("selects an existing row into the filename without opening it", async () => {
    const menu = await mount()
    menu.mode = "save"
    await menu.updateComplete
    const opens: Event[] = []
    menu.addEventListener("document-open", event => opens.push(event))
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".open")!.click()
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector<HTMLInputElement>(".file-name")!.value).toBe("A saved page")
    expect(opens).toHaveLength(0)
  })

  it("allows entering a filename while the document list loads and waits to save", async () => {
    const menu = await mount([])
    menu.mode = "save"
    menu.loading = true
    await menu.show()
    const input = menu.shadowRoot!.querySelector<HTMLInputElement>(".file-name")!
    expect(menu.shadowRoot!.activeElement).toBe(input)
    expect(input.disabled).toBe(false)
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>('.save-form button')!.disabled).toBe(true)
    menu.close()
  })

  it("requires a filename, focuses it on show, and disables save while busy", async () => {
    const menu = await mount([])
    menu.mode = "save"
    await menu.updateComplete
    await menu.show()
    const input = menu.shadowRoot!.querySelector<HTMLInputElement>(".file-name")!
    expect(menu.shadowRoot!.querySelector("h2")!.textContent).toBe("Save as")
    expect(input.required).toBe(true)
    expect(menu.shadowRoot!.activeElement).toBe(input)
    menu.busy = true
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>('.save-form button')!.disabled).toBe(true)
    expect(input.disabled).toBe(true)
    menu.close()
  })
})
