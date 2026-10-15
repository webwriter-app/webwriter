// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {setLanguage, t} from "../site-language"

const {search, fetchSnippet, resolveDependencies, registryLocales} = vi.hoisted(() => ({
  search: vi.fn(), fetchSnippet: vi.fn(), resolveDependencies: vi.fn(), registryLocales: [] as (string | undefined)[],
}))
vi.mock("../packages", async importOriginal => ({
  ...await importOriginal<typeof import("../packages")>(),
  WebWriterPackageRegistry: class {
    constructor(_fetcher?: unknown, locale?: string) { registryLocales.push(locale) }
    search = search; fetchSnippet = fetchSnippet
  },
}))
vi.mock("../package-dependencies", async importOriginal => ({
  ...await importOriginal<typeof import("../package-dependencies")>(),
  resolvePackageDependencies: resolveDependencies,
}))
import {WidgetGallery} from "./widget-gallery"

const fixture = (): WebWriterPackage => ({
  name: "@webwriter/learning", version: "1.0.0", label: "Learning", description: "Practice science", authors: [], keywords: ["webwriter-widget"], links: {}, styles: [],
  scripts: ["https://cdn.jsdelivr.net/npm/@webwriter/learning@1.0.0/widget.js"],
  members: [{id: "widget", kind: "widget", packageName: "@webwriter/learning", packageVersion: "1.0.0", exportName: "./widgets/gallery-test-widget.js", label: "Experiment", tagName: "gallery-test-widget", insertable: true, scriptUrl: "https://cdn.jsdelivr.net/npm/@webwriter/learning@1.0.0/widget.js"}],
  manifest: {name: "@webwriter/learning", version: "1.0.0"},
})
let gallery: WidgetGallery

beforeEach(() => {
  vi.clearAllMocks()
  registryLocales.length = 0
  fetchSnippet.mockReset()
  search.mockResolvedValue([fixture()])
  resolveDependencies.mockResolvedValue({entries: [], map: null})
})
afterEach(() => {
  gallery?.remove()
  setLanguage("en", false)
  document.documentElement.lang = "en"
  vi.restoreAllMocks()
})

it("translates gallery controls while keeping package data and registry language English", async () => {
  const pkg = {...fixture(), label: "History", description: "Make it interactive."}
  search.mockResolvedValue([pkg])
  document.documentElement.lang = "de"
  setLanguage("de", false)
  gallery = new WidgetGallery()
  document.body.append(gallery)
  await vi.waitFor(() => expect(gallery.shadowRoot?.querySelector("h3")?.textContent).toBe("History"))
  const root = gallery.shadowRoot!
  expect(root.querySelector(".description")?.textContent).toBe("Make it interactive.")
  expect(root.textContent).toContain(t("Search widgets"))
  expect(root.querySelector(".try")?.textContent).toBe(t("Try {name}", {name: "History"}))
  expect(registryLocales).toEqual(["en", "en"])
})
async function mount() {
  gallery = new WidgetGallery()
  document.body.append(gallery)
  await vi.waitFor(() => expect(gallery.shadowRoot?.textContent).toContain("1 package"))
  return gallery.shadowRoot!
}
function button(root: ShadowRoot, text: string) {
  return [...root.querySelectorAll("button")].find(element => element.textContent?.trim() === text)!
}
async function open(root: ShadowRoot) {
  button(root, "Try Learning").click()
  await vi.waitFor(() => expect(root.querySelector("iframe")).not.toBeNull())
  return root.querySelector("iframe")!
}
function message(frame: HTMLIFrameElement, data: object, origin = new URL(frame.src).origin, nonce?: string) {
  const url = new URL(frame.src)
  window.dispatchEvent(new MessageEvent("message", {
    origin, source: frame.contentWindow,
    data: {bridgeNonce: nonce ?? new URLSearchParams(url.hash.slice(1)).get("nonce"), ...data},
  }))
}

it("loads WebWriter packages, searches widgets, and shows an empty search result", async () => {
  const root = await mount()
  expect(search).toHaveBeenCalledWith()
  expect(root.querySelector("h3")?.textContent).toBe("Learning")
  const input = root.querySelector("input")!
  input.value = "missing topic"
  input.dispatchEvent(new Event("input"))
  await gallery.updateComplete
  expect(root.querySelectorAll("article")).toHaveLength(0)
  expect(root.textContent).toContain("No widgets match your search.")
})

it("recovers from a catalog failure through refresh", async () => {
  search.mockRejectedValueOnce(new Error("Offline"))
  gallery = new WidgetGallery()
  document.body.append(gallery)
  await vi.waitFor(() => expect(gallery.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("Offline"))
  button(gallery.shadowRoot!, "Refresh").click()
  await vi.waitFor(() => expect(gallery.shadowRoot?.querySelectorAll("article")).toHaveLength(1))
  expect(gallery.shadowRoot?.querySelector('[role="alert"]')).toBeNull()
})

it("uses an isolated frame, authenticates its bridge, and sends a learner document", async () => {
  const root = await mount()
  const frame = await open(root)
  const url = new URL(frame.src)
  expect(url.origin).not.toBe(location.origin)
  expect(url.pathname).toBe("/frame-shell.html")
  expect(url.searchParams.get("kind")).toBe("preview")
  expect(frame.sandbox.contains("allow-scripts")).toBe(true)
  expect(frame.sandbox.contains("allow-same-origin")).toBe(true)
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  const ready = {type: "webwriter-frame-shell-ready", kind: "preview", revision: url.searchParams.get("revision")}
  message(frame, ready, location.origin)
  message(frame, ready, url.origin, "wrong-nonce")
  expect(post).not.toHaveBeenCalled()
  message(frame, ready)
  expect(post).toHaveBeenCalledOnce()
  const payload = post.mock.calls[0][0] as {html: string}
  expect(payload.html).toContain('contenteditable="false"')
  expect(payload.html).toContain("<gallery-test-widget>")
  expect(payload.html).toContain("gallery-preview-entry")
  expect(payload.html).not.toContain("src/editor-entry")
  expect(payload.html).not.toContain("<dom-editor")
  message(frame, ready)
  expect(post).toHaveBeenCalledOnce()
  message(frame, {type: "gallery-preview-height", height: 100000})
  await gallery.updateComplete
  expect(frame.style.height).toBe("900px")
  message(frame, {type: "gallery-preview-error", message: "Published module failed"})
  await gallery.updateComplete
  expect(root.querySelector('[role="alert"]')?.textContent).toContain("Published module failed")
  button(root, "Close").click()
  await gallery.updateComplete
  expect(root.querySelector("iframe")).toBeNull()
})

it("resets with a fresh frame and ignores async completion after closing", async () => {
  const root = await mount()
  const first = await open(root)
  const firstURL = first.src
  button(root, "Reset example").click()
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")).not.toBeNull()
    expect(root.querySelector("iframe")!.src).not.toBe(firstURL)
  })
  expect(resolveDependencies).toHaveBeenCalledOnce()
  const second = root.querySelector("iframe")!
  expect(second).not.toBe(first)
  expect(new URL(second.src).hash).not.toBe(new URL(firstURL).hash)
  let resolve!: (value: {entries: string[], map: null}) => void
  resolveDependencies.mockReturnValueOnce(new Promise(done => {resolve = done}))
  ;(gallery as any).dependencyPlans.clear()
  button(root, "Reset example").click()
  await vi.waitFor(() => expect(resolveDependencies).toHaveBeenCalledTimes(2))
  button(root, "Close").click()
  resolve({entries: [], map: null})
  await gallery.updateComplete
  await Promise.resolve()
  expect(root.querySelector("iframe")).toBeNull()
  expect(root.querySelector("dialog")?.open).toBe(false)
})

it("excludes packages outside the WebWriter scope even if returned by the catalog", async () => {
  search.mockResolvedValue([fixture(), {...fixture(), name: "@other/learning", members: [{...fixture().members[0], id: "other", label: "Other publisher"}]}])
  const root = await mount()
  expect(root.querySelectorAll("article")).toHaveLength(1)
  expect(root.textContent).not.toContain("Other publisher")
})

it("opens snippet-only collections without requiring a custom element", async () => {
  const pkg = fixture()
  pkg.members = [{...pkg.members[0], kind: "snippet", tagName: undefined, scriptUrl: undefined, htmlUrl: "https://cdn.example/simulation.html"}]
  pkg.scripts = []
  search.mockResolvedValue([pkg])
  fetchSnippet.mockResolvedValue('<iframe src="https://phet.colorado.edu/simulation" title="Simulation"></iframe>')
  const root = await mount()
  button(root, "Try Learning").click()
  await vi.waitFor(() => expect(root.querySelector("iframe")).not.toBeNull())
  const frame = root.querySelector("iframe")!
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, {type: "webwriter-frame-shell-ready", kind: "preview", revision: new URL(frame.src).searchParams.get("revision")})
  const payload = post.mock.calls[0][0] as {html: string}
  expect(payload.html).toContain("https://phet.colorado.edu/simulation")
  const source = new DOMParser().parseFromString(payload.html, "text/html")
  const entry = source.querySelector<HTMLScriptElement>('script[src*="gallery-preview-entry"]')!
  expect(new URL(entry.src).searchParams.has("tag")).toBe(false)
})

it("shows one card per package and switches between widgets and snippets in details", async () => {
  const pkg = fixture()
  const second = {...pkg.members[0], id: "second", label: "Second widget", tagName: "gallery-second-widget"}
  const snippet = {...pkg.members[0], id: "example", label: "Published activity", kind: "snippet" as const, tagName: undefined, htmlUrl: "https://cdn.example/activity.html"}
  pkg.members.push(second, snippet)
  search.mockResolvedValue([pkg])
  fetchSnippet.mockResolvedValue('<gallery-test-widget><p>Published example</p></gallery-test-widget>')
  const root = await mount()
  expect(root.querySelectorAll("article")).toHaveLength(1)
  const first = await open(root)
  const select = root.querySelector("select")!
  expect(select.querySelectorAll("option")).toHaveLength(3)
  expect(select.value).toBe("widget")
  select.value = "example"
  select.dispatchEvent(new Event("change"))
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")).not.toBeNull()
    expect(root.querySelector("iframe")!.src).not.toBe(first.src)
  })
  expect(fetchSnippet).toHaveBeenCalledWith(snippet)
  const previousURL = root.querySelector("iframe")!.src
  select.value = "second"
  select.dispatchEvent(new Event("change"))
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")).not.toBeNull()
    expect(root.querySelector("iframe")!.src).not.toBe(previousURL)
  })
  expect(root.querySelectorAll("article")).toHaveLength(1)
  expect(select.value).toBe("second")
  const frame = root.querySelector("iframe")!
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, {type: "webwriter-frame-shell-ready", kind: "preview", revision: new URL(frame.src).searchParams.get("revision")})
  expect((post.mock.calls[0][0] as {html: string}).html).toContain("<gallery-second-widget>")
})

it("loads wall cards near the viewport and reuses the isolated learner preview", async () => {
  let intersect!: IntersectionObserverCallback
  const disconnect = vi.fn()
  const observe = vi.fn()
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {intersect = callback}
    observe = observe
    disconnect = disconnect
  })
  try {
    search.mockResolvedValue([fixture(), {...fixture(), name: "@other/widget", label: "Unrelated"}])
    gallery = new WidgetGallery()
    gallery.wall = true
    document.body.append(gallery)
    await gallery.updateComplete
    expect(search).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledWith(gallery)
    intersect([{isIntersecting: true}] as IntersectionObserverEntry[], {} as IntersectionObserver)
    await vi.waitFor(() => expect(gallery.shadowRoot!.querySelectorAll(".widget-tile")).toHaveLength(1))
    const root = gallery.shadowRoot!
    expect(root.querySelector("input")).toBeNull()
    expect(root.textContent).not.toContain("Unrelated")
    expect(root.querySelectorAll(".cards")).toHaveLength(1)
    const tile = root.querySelector<HTMLButtonElement>(".widget-tile")!
    expect(tile.getAttribute("data-card-overlay")).toBe("Show widget")
    expect(tile.getAttribute("aria-label")).toBe("Try Learning")
    expect(root.querySelector(".description, .package, .component")).toBeNull()
    tile.click()
    await vi.waitFor(() => expect(root.querySelector("iframe")).not.toBeNull())
    expect(new URL(root.querySelector("iframe")!.src).origin).not.toBe(location.origin)
    gallery.remove()
    expect(disconnect).toHaveBeenCalled()
  }
  finally {vi.unstubAllGlobals()}
})

it("provides a gallery link if the wall catalog cannot load", async () => {
  vi.stubGlobal("IntersectionObserver", undefined)
  try {
    search.mockRejectedValueOnce(new Error("Offline"))
    gallery = new WidgetGallery()
    gallery.wall = true
    document.body.append(gallery)
    await vi.waitFor(() => expect(gallery.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull())
    expect(gallery.shadowRoot!.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/gallery/")
  }
  finally {vi.unstubAllGlobals()}
})
