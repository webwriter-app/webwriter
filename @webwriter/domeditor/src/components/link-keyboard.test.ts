// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {LinkEdit, LinkSelectionState} from "../links"
import {LinkKeyboard, linkHistoryKey} from "./link-keyboard"

const source = {href: "#ref-source", label: "A source", data: JSON.stringify({type: "book", title: "A source", author: [{family: "Lovelace", given: "Ada", ORCID: "keep"}], issued: {"date-parts": [[1843, 2, 3]]}, custom: {keep: true}})}
const makeState = (overrides: Partial<LinkSelectionState> = {}): LinkSelectionState => ({
  active: true, identity: "link-1", href: "#chapter", text: "Chapter", attributes: {href: "#chapter"},
  targets: [{href: "#chapter", label: "Chapter"}, {href: "#appendix", label: "Appendix"}], references: [source], ...overrides,
})
const root = (keyboard: LinkKeyboard) => keyboard.shadowRoot!
const input = (keyboard: LinkKeyboard) => root(keyboard).querySelector<HTMLInputElement>("#link-search")!
async function mount(state = makeState()) {
  const keyboard = new LinkKeyboard()
  keyboard.state = state; document.body.append(keyboard); await keyboard.updateComplete
  return keyboard
}
async function tab(keyboard: LinkKeyboard, name: string) {
  root(keyboard).querySelector<HTMLButtonElement>(`#tab-${name}`)!.click(); await keyboard.updateComplete
}
async function type(keyboard: LinkKeyboard, value: string, selector = "#link-search") {
  const field = root(keyboard).querySelector<HTMLInputElement>(selector)!
  field.value = value; field.dispatchEvent(new Event("input")); await keyboard.updateComplete
}
function listen(keyboard: LinkKeyboard) {
  const commands: LinkEdit[] = []
  keyboard.addEventListener("link-keyboard-command", event => commands.push((event as CustomEvent<LinkEdit>).detail))
  return commands
}
async function openDialog(keyboard: LinkKeyboard) {
  await tab(keyboard, "reference")
  root(keyboard).querySelector<HTMLButtonElement>('[aria-label="Add reference"]')!.click()
  await keyboard.updateComplete
  return root(keyboard).querySelector<HTMLDialogElement>("dialog")!
}
const submit = (keyboard: LinkKeyboard) => root(keyboard).querySelector<HTMLButtonElement>("dialog .actions button:last-child")!.click()
beforeEach(() => localStorage.clear())
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe("link keyboard", () => {
  it("defaults to Web with compact heading tabs and a shared search/list layout", async () => {
    const keyboard = await mount()
    expect([...root(keyboard).querySelectorAll("[role=tab]")].map(tab => tab.textContent?.trim())).toEqual(["Web", "Document", "Reference"])
    expect(root(keyboard).querySelector("h2")!.textContent).toBe("Link")
    expect(root(keyboard).querySelector(".header [role=tablist]")).not.toBeNull()
    expect(getComputedStyle(keyboard).height).toBe("280px")
    for(const name of ["web", "document", "reference"]) {
      await tab(keyboard, name)
      expect(root(keyboard).querySelectorAll(".panel .search-bar input")).toHaveLength(1)
      expect(root(keyboard).querySelector(".panel .targets[role=list]")).not.toBeNull()
    }
    expect(root(keyboard).querySelector("dialog")!.open).toBe(false)
  })

  it("supports arrow tabs, skips unavailable references, and defaults new selections to Web", async () => {
    const keyboard = await mount(makeState({referenceAllowed: false}))
    const first = root(keyboard).querySelector<HTMLButtonElement>("[role=tab]")!
    first.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
    await keyboard.updateComplete
    expect(root(keyboard).querySelector('[aria-selected="true"]')!.textContent?.trim()).toBe("Document")
    root(keyboard).querySelector<HTMLButtonElement>('[aria-selected="true"]')!.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true}))
    await keyboard.updateComplete
    expect(first.getAttribute("aria-selected")).toBe("true")
    keyboard.state = makeState({identity: "other", attributes: {"data-reference": source.data}})
    await keyboard.updateComplete
    expect(first.getAttribute("aria-selected")).toBe("true")
  })

  it("filters document targets and fills the bar while applying the chosen value", async () => {
    const keyboard = await mount(), commands = listen(keyboard)
    await tab(keyboard, "document"); await type(keyboard, "append")
    expect(root(keyboard).querySelectorAll(".target")).toHaveLength(1)
    root(keyboard).querySelector<HTMLButtonElement>(".target")!.click()
    await keyboard.updateComplete
    expect(input(keyboard).value).toBe("Appendix")
    expect(commands[0]).toMatchObject({identity: "link-1", href: "#appendix", attributes: {"data-reference": null}})
    keyboard.state = makeState({identity: "updated", href: "#appendix", attributes: {href: "#appendix"}})
    await keyboard.updateComplete
    expect(keyboard.activeTab).toBe("document")
    expect(input(keyboard).value).toBe("Appendix")
  })

  it("always shows Web options and applies them through the input arrow", async () => {
    const keyboard = await mount(makeState({href: "https://old.test", attributes: {target: "_blank", rel: "author noopener", download: "file.pdf", "data-reference": source.data}})), commands = listen(keyboard)
    expect(root(keyboard).querySelector(".web-label-row .web-options")).not.toBeNull()
    expect(root(keyboard).querySelector(".panel .actions")).toBeNull()
    await type(keyboard, "https://new.test")
    const checks = root(keyboard).querySelectorAll<HTMLInputElement>(".web-options input")
    checks[0].click(); checks[1].click()
    expect(commands).toHaveLength(0)
    const arrow = root(keyboard).querySelector<HTMLButtonElement>('[aria-label="Apply web link"]')!
    expect(arrow.querySelector("svg")).not.toBeNull()
    const pointer = new MouseEvent("pointerdown", {bubbles: true, cancelable: true})
    arrow.dispatchEvent(pointer); expect(pointer.defaultPrevented).toBe(true)
    arrow.click()
    expect(commands[0]).toMatchObject({href: "https://new.test", attributes: {target: null, rel: "author noopener", download: null, "data-reference": null}})
  })

  it("filters remembered URLs and applies a suggestion to both the bar and the link", async () => {
    localStorage.setItem(linkHistoryKey, JSON.stringify({urls: ["https://one.test", "https://two.test"], references: []}))
    const keyboard = await mount(), commands = listen(keyboard)
    await type(keyboard, "two")
    expect(root(keyboard).querySelectorAll(".target")).toHaveLength(1)
    root(keyboard).querySelector<HTMLButtonElement>(".target")!.click(); await keyboard.updateComplete
    expect(input(keyboard).value).toBe("https://two.test")
    expect(commands[0].href).toBe("https://two.test")
  })

  it("selects document references without changing structured or unknown CSL data", async () => {
    const keyboard = await mount(), commands = listen(keyboard)
    await tab(keyboard, "reference"); await type(keyboard, "Lovelace")
    root(keyboard).querySelector<HTMLButtonElement>(".target")!.click(); await keyboard.updateComplete
    expect(input(keyboard).value).toBe("A source")
    expect(commands[0]).toMatchObject({href: source.href, attributes: {"data-reference": source.data, "data-reference-locator": null}})
    keyboard.state = makeState({identity: "applied", href: source.href, attributes: {"data-reference": source.data}})
    await keyboard.updateComplete
    expect(keyboard.activeTab).toBe("reference")
    expect(input(keyboard).value).toBe("A source")
    const saved = JSON.parse(localStorage.getItem(linkHistoryKey)!).references[0]
    expect(JSON.parse(saved.data)).toEqual(JSON.parse(source.data))
  })

  it("remembers authoritative used URLs and references across keyboard instances", async () => {
    const keyboard = await mount(makeState({href: "https://used.test", attributes: {"data-reference": source.data}}))
    keyboard.remove()
    const next = await mount(makeState({references: []})), commands = listen(next)
    expect(root(next).querySelector(".target")!.textContent).toContain("https://used.test")
    await tab(next, "reference")
    root(next).querySelector<HTMLButtonElement>(".target")!.click()
    expect(commands[0].href).toBe("https://used.test")
    expect(JSON.parse(commands[0].attributes["data-reference"]!)).toEqual(JSON.parse(source.data))
  })

  it("does not remember a submitted URL until it appears in authoritative state", async () => {
    const keyboard = await mount(), commands = listen(keyboard)
    await type(keyboard, "https://pending.test")
    root(keyboard).querySelector<HTMLButtonElement>('[aria-label="Apply web link"]')!.click()
    expect(commands).toHaveLength(1)
    expect(localStorage.getItem(linkHistoryKey)).toBeNull()
    keyboard.error = "The selected link changed."
    await keyboard.updateComplete
    expect(root(keyboard).querySelector('[role="alert"]')!.textContent).toContain("selected link changed")
    keyboard.state = makeState({identity: "accepted", href: "https://pending.test", attributes: {href: "https://pending.test"}})
    await keyboard.updateComplete
    expect(JSON.parse(localStorage.getItem(linkHistoryKey)!).urls).toContain("https://pending.test")
  })

  it("opens a fresh reference dialog with + and keeps cancellation out of the link", async () => {
    const keyboard = await mount(), commands = listen(keyboard)
    await tab(keyboard, "reference"); await type(keyboard, "New source")
    const dialog = await openDialog(keyboard)
    expect(dialog.open).toBe(true)
    expect(root(keyboard).querySelector<HTMLInputElement>('[aria-label="Title"]')!.value).toBe("New source")
    root(keyboard).querySelector<HTMLButtonElement>("dialog .actions button:nth-last-child(2)")!.click()
    await keyboard.updateComplete
    expect(dialog.open).toBe(false)
    expect(commands).toHaveLength(0)
  })

  it("validates reference fields then adds a unique fragment source and closes on success", async () => {
    const keyboard = await mount(), commands = listen(keyboard)
    const dialog = await openDialog(keyboard)
    submit(keyboard); await keyboard.updateComplete
    expect(commands).toHaveLength(0)
    expect(root(keyboard).querySelector('dialog [role="alert"]')!.textContent).toContain("title")
    await type(keyboard, "New book", '[aria-label="Title"]')
    await type(keyboard, "invalid", '[aria-label="Year"]')
    submit(keyboard); await keyboard.updateComplete
    expect(commands).toHaveLength(0)
    expect(root(keyboard).querySelector('dialog [role="alert"]')!.textContent).toContain("year")
    await type(keyboard, "2024", '[aria-label="Year"]')
    await type(keyboard, "Smith, Alex; Organization", '[aria-label="Authors"]')
    await type(keyboard, "8", '[aria-label="Page or location"]')
    submit(keyboard)
    const edit = commands[0]
    expect(edit.href).toMatch(/^#ref-/)
    expect(JSON.parse(edit.attributes["data-reference"]!)).toEqual({type: "book", title: "New book", author: [{family: "Smith", given: "Alex"}, {literal: "Organization"}], issued: {"date-parts": [[2024]]}})
    expect(edit.attributes["data-reference-locator"]).toBe("8")
    keyboard.state = makeState({identity: "accepted", href: edit.href, attributes: {"data-reference": edit.attributes["data-reference"]!}})
    await keyboard.updateComplete
    expect(dialog.open).toBe(false)
    expect(input(keyboard).value).toBe("New book")
  })

  it("keeps the reference dialog open with command errors and closes only the dialog on Escape", async () => {
    const keyboard = await mount(), closed = vi.fn()
    keyboard.addEventListener("link-keyboard-close", closed)
    const dialog = await openDialog(keyboard)
    await type(keyboard, "Book", '[aria-label="Title"]'); submit(keyboard)
    keyboard.error = "The selected link changed."; await keyboard.updateComplete
    expect(dialog.open).toBe(true)
    expect(root(keyboard).querySelector('dialog [role="alert"]')!.textContent).toContain("selected link changed")
    dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    await keyboard.updateComplete
    expect(dialog.open).toBe(false); expect(closed).not.toHaveBeenCalled()
  })

  it("keeps a reference draft through target updates but cancels it for a new selection", async () => {
    const keyboard = await mount(), dialog = await openDialog(keyboard)
    await type(keyboard, "Draft", '[aria-label="Title"]')
    keyboard.state = makeState({targets: [{href: "#new", label: "New"}]}); await keyboard.updateComplete
    expect(dialog.open).toBe(true)
    expect(root(keyboard).querySelector<HTMLInputElement>('[aria-label="Title"]')!.value).toBe("Draft")
    keyboard.state = makeState({identity: "different"}); await keyboard.updateComplete
    expect(dialog.open).toBe(false)
  })

  it("ignores corrupt history, filters unsafe entries, and survives unavailable storage", async () => {
    localStorage.setItem(linkHistoryKey, "bad json")
    const keyboard = await mount()
    expect(keyboard.history.urls).toEqual([])
    keyboard.remove()
    localStorage.setItem(linkHistoryKey, JSON.stringify({urls: ["javascript:alert(1)", "#doc", "https://safe.test"], references: [{...source, href: "javascript:bad"}, source]}))
    const safe = await mount()
    expect(safe.history.urls).toEqual(["https://safe.test"])
    expect(safe.history.references).toEqual([source])
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    safe.state = makeState({identity: "next", href: "https://next.test"}); await safe.updateComplete
    expect(safe.history.urls[0]).toBe("https://next.test")
  })

  it("refreshes cross-tab history and cleans up the storage listener", async () => {
    const keyboard = await mount()
    localStorage.setItem(linkHistoryKey, JSON.stringify({urls: ["https://remote.test"], references: []}))
    window.dispatchEvent(new StorageEvent("storage", {key: linkHistoryKey})); await keyboard.updateComplete
    expect(root(keyboard).querySelector(".target")!.textContent).toContain("https://remote.test")
    keyboard.remove()
    localStorage.setItem(linkHistoryKey, JSON.stringify({urls: [], references: []}))
    window.dispatchEvent(new StorageEvent("storage", {key: linkHistoryKey}))
    expect(keyboard.history.urls).toContain("https://remote.test")
  })

  it("merges recent uses with other mounted keyboards and bounds local history", async () => {
    localStorage.setItem(linkHistoryKey, JSON.stringify({urls: Array.from({length: 110}, (_, i) => `https://old${i}.test`), references: []}))
    const first = await mount(), second = await mount()
    expect(first.history.urls).toHaveLength(100)
    first.state = makeState({identity: "first-use", href: "https://first.test"}); await first.updateComplete
    second.state = makeState({identity: "second-use", href: "https://second.test"}); await second.updateComplete
    const saved = JSON.parse(localStorage.getItem(linkHistoryKey)!)
    expect(saved.urls).toHaveLength(100)
    expect(saved.urls.slice(0, 2)).toEqual(["https://second.test", "https://first.test"])
  })

  it("supports Enter while ignoring composition and Escape closes the keyboard", async () => {
    const keyboard = await mount(), commands = listen(keyboard), closed = vi.fn()
    keyboard.addEventListener("link-keyboard-close", closed)
    await type(keyboard, "https://enter.test")
    input(keyboard).dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", isComposing: true, bubbles: true, cancelable: true}))
    expect(commands).toHaveLength(0)
    input(keyboard).dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(commands[0].href).toBe("https://enter.test")
    input(keyboard).dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    expect(closed).toHaveBeenCalledOnce()
  })
})
